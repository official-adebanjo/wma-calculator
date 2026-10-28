import { addDays, nextBusinessDay, weekdayName } from "../dates";
import { componentRounder, dec, type Dec, toPercentString } from "../money";
import type { CalculationWarning, ProductConfigVersion, RtnBand, RtnPayoutOption, SecondaryAnalysis, SummaryEntry } from "../types";
import { type CalculatorStrategy, emptyOutput, m, rateWarnings, roundingAssumption, type StrategyOutput } from "./shared";

export function selectRtnBand(bands: RtnBand[], principal: Dec): RtnBand | undefined {
  return bands.find((b) => principal.gte(dec(b.min)) && (b.max === null || principal.lte(dec(b.max))));
}

function blocked(message: string, errorCode = "RATE_UNAVAILABLE") {
  return { ...emptyOutput(), status: "BLOCKED" as const, errorCode, message };
}

function fieldError(out: StrategyOutput, field: string, message: string): StrategyOutput {
  out.status = "ERROR";
  out.errorCode = "VALIDATION_FAILED";
  out.fieldErrors.push({ field, message });
  // An error must never carry plausible-looking figures.
  for (const list of [out.summary, out.lineItems, out.steps, out.schedule, out.secondary]) list.length = 0;
  return out;
}

const naira = (v: string | Dec) => `₦${Number(String(v)).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (v: Dec | string) => `${toPercentString(dec(v))}%`;

function bandLabel(b: RtnBand): string {
  return `Band ${b.code} (₦${Number(b.min).toLocaleString("en-NG")}${b.max ? `–₦${Number(b.max).toLocaleString("en-NG", { minimumFractionDigits: 2 })}` : " and above"})`;
}

type RtnConfig = NonNullable<ProductConfigVersion["rtn"]>;

/** Rate Guide lookup for a principal. Returns null when no band or published rate applies. */
function lookupRate(cfg: RtnConfig, principal: Dec, tenor: number, option: RtnPayoutOption) {
  const band = selectRtnBand(cfg.bands, principal);
  if (!band) return null;
  const cell = cfg.rates.find((c) => c.tenorDays === tenor && c.band === band.code && c.option === option);
  return cell ? { band, ratePercent: cell.annualRatePercent } : null;
}

/** Penalty share of the placement rate for the elapsed share of tenor (approved schedule). */
function penaltyShare(cfg: RtnConfig, days: number, tenor: number): { sharePercent: string; bandLabel: string } {
  if (days >= tenor) return { sharePercent: "0", bandLabel: "on or after maturity" };
  const elapsed = dec(days).dividedBy(tenor).times(100);
  let lower = "0";
  for (const b of cfg.penaltySchedule ?? []) {
    if (b.upToPercent === null || elapsed.lte(dec(b.upToPercent))) {
      const label = b.upToPercent === null ? `above ${lower}% before maturity` : lower === "0" ? `up to ${b.upToPercent}%` : `above ${lower}% to ${b.upToPercent}%`;
      return { sharePercent: b.shareOfRatePercent, bandLabel: label };
    }
    lower = b.upToPercent;
  }
  throw new Error("RTN penalty schedule does not cover all elapsed shares.");
}

/**
 * RTN — Rosabon Treasury Note (approved rules, RTN-1.2).
 * At maturity:  gross = P × rate × tenor ÷ 365; WHT = 10% × gross; net = gross − WHT; payout = P + net
 * Upfront:      divisor = 1 + (0.90 × rate × tenor ÷ 365); booked = F ÷ divisor; upfront = F − booked
 * Optional lifecycle events (one per calculation): early/partial withdrawal, top-up, rollover.
 */
export const rtn: CalculatorStrategy = (ctx) => {
  const cfg = ctx.config.rtn;
  const whtPercent = ctx.config.tax?.withholdingTaxPercent;
  if (!cfg || !whtPercent) return blocked("RTN rate guide or tax configuration is missing.", "CONFIGURATION_UNAVAILABLE");

  const principal = dec(ctx.inputs.principal as string);
  const tenor = Number(ctx.inputs.tenorDays);
  const option = ctx.inputs.payoutOption as RtnPayoutOption;
  const investorType = ctx.inputs.investorType as "INDIVIDUAL" | "CORPORATE";
  const minimum = dec(investorType === "CORPORATE" ? cfg.corporateMinimum : (ctx.config.minimumPrincipal ?? "0"));

  const out = emptyOutput();
  if (principal.lt(minimum)) return fieldError(out, "principal", `${investorType === "CORPORATE" ? "Corporate" : "Individual"} minimum is ${naira(minimum)}.`);
  if (!ctx.config.tenorOptions?.includes(tenor)) return fieldError(out, "tenorDays", `Allowed tenors: ${ctx.config.tenorOptions?.join(", ")} days.`);

  const events = (["daysElapsed", "topUpAmount", "rolloverTenorDays"] as const).filter((k) => ctx.inputs[k] !== undefined);
  if (events.length > 1) {
    return fieldError(out, events[1], "Run early withdrawal, top-up and rollover as separate calculations (one event at a time).");
  }

  const looked = lookupRate(cfg, principal, tenor, option);
  if (!looked && !ctx.rateOverridePercent) return blocked("No approved rate is available for this combination. Calculation is unavailable.");
  const band = looked?.band ?? selectRtnBand(cfg.bands, principal);
  if (!band) return blocked("Funding amount does not fall within any configured RTN band.");
  const ratePercent = ctx.rateOverridePercent ?? looked!.ratePercent;
  const rateSource = ctx.rateOverridePercent ? "QA_OVERRIDE" : "CONFIGURATION";
  out.rateSource = rateSource;

  const r = componentRounder(ctx.rounding);
  const annualRate = dec(ratePercent).dividedBy(100);
  const whtRate = dec(whtPercent).dividedBy(100);
  const basis = cfg.dayCountBasis;

  const header: SummaryEntry[] = [
    { key: "principal", label: option === "UPFRONT" ? "Funded amount" : "Principal", value: m(principal), kind: "money" },
    { key: "band", label: "Band", value: bandLabel(band), kind: "text" },
    { key: "rate", label: "Annual rate", value: `${pct(ratePercent)} p.a. (${option === "UPFRONT" ? "upfront" : "at maturity"})`, kind: "text" },
    { key: "rateGuide", label: "Rate guide version", value: cfg.rateGuideVersion, kind: "text" },
    { key: "tenor", label: "Tenor", value: `${tenor} days`, kind: "text" },
  ];

  // Dates: interest runs to the calendar maturity date; payment on the next business day; notice at T-n.
  const valueDate = ctx.inputs.valueDate as string | undefined;
  const maturity = valueDate ? addDays(valueDate, tenor) : null;
  if (valueDate && maturity) {
    header.push({ key: "maturityDate", label: "Maturity date", value: maturity, kind: "text" });
    const payDate = nextBusinessDay(maturity);
    header.push({ key: "paymentDate", label: "Payment date", value: payDate, kind: "text" });
    if (cfg.noticeDaysBeforeMaturity) {
      header.push({ key: "noticeDate", label: `Maturity notice (T-${cfg.noticeDaysBeforeMaturity})`, value: addDays(maturity, -cfg.noticeDaysBeforeMaturity), kind: "text" });
    }
    if (payDate !== maturity) {
      out.warnings.push({
        code: "MATURITY_WEEKEND",
        severity: "INFO",
        message: `Maturity falls on a ${weekdayName(maturity)} (${maturity}). Interest runs to the calendar maturity date; payment goes out on the next business day, ${payDate}. Public holidays are not modelled.`,
      });
    }
    out.assumptions.push("Maturity date = funds-confirmed date + tenor days. The rate in force on the funds-confirmed date applies; this calculator uses the current Rate Guide.");
  }

  if (option === "MATURITY") {
    const gross = r(principal.times(annualRate).times(tenor).dividedBy(basis));
    const wht = r(gross.times(whtRate));
    const net = r(gross.minus(wht));
    const payout = r(principal.plus(net));

    out.formula = "gross = principal × annualRate × tenor ÷ 365; WHT = gross × 10%; net = gross − WHT; payout = principal + net";
    out.steps = [
      { label: "Band selection", expression: `${m(principal)} → ${bandLabel(band)}`, result: `Band ${band.code}` },
      { label: "Rate lookup", expression: `${tenor} days × Band ${band.code} × at maturity`, result: `${pct(ratePercent)} p.a.` },
      { label: "Gross interest", expression: `${m(principal)} × ${annualRate} × ${tenor} ÷ ${basis}`, result: m(gross) },
      { label: "Withholding tax", expression: `${m(gross)} × ${whtPercent}%`, result: m(wht) },
      { label: "Net interest", expression: `${m(gross)} − ${m(wht)}`, result: m(net) },
      { label: "Maturity payout", expression: `${m(principal)} + ${m(net)}`, result: m(payout) },
    ];
    out.summary = [
      ...header,
      { key: "grossInterest", label: "Gross interest", value: m(gross), kind: "money" },
      { key: "tax", label: `WHT (${whtPercent}%)`, value: m(wht), kind: "money" },
      { key: "netInterest", label: "Net interest", value: m(net), kind: "money" },
      { key: "maturityPayout", label: "Maturity payout", value: m(payout), kind: "money", emphasis: true },
    ];
    out.lineItems = [
      { sequence: 1, label: "Principal", amount: m(principal), type: "PRINCIPAL", explanation: "Funded principal." },
      { sequence: 2, label: "Gross interest", amount: m(gross), type: "INTEREST", explanation: `${pct(ratePercent)} p.a. × ${tenor}/${basis}.` },
      { sequence: 3, label: "Withholding tax", amount: m(wht), type: "TAX", explanation: `${whtPercent}% of gross interest; principal is not taxed.` },
      { sequence: 4, label: "Net interest", amount: m(net), type: "INTEREST", explanation: "Gross interest − WHT." },
      { sequence: 5, label: "Maturity payout", amount: m(payout), type: "PAYOUT", explanation: "Principal + net interest." },
    ];
    out.assumptions.push(`Simple interest on a fixed ${basis}-day basis (also in leap years); no compounding.`);

    const ctxEvent = { cfg, principal, tenor, annualRate, ratePercent, whtRate, whtPercent, basis, r, minimum, maturity, band };
    if (ctx.inputs.daysElapsed !== undefined) {
      const res = earlyWithdrawal(ctx.config, ctx.inputs, ctxEvent);
      if ("error" in res) return fieldError(out, res.error.field, res.error.message);
      out.secondary.push(...res.analyses);
      out.warnings.push(...res.warnings);
    }
    if (ctx.inputs.topUpAmount !== undefined || ctx.inputs.topUpDay !== undefined) {
      const res = topUp(ctx.config, ctx.inputs, ctxEvent);
      if ("error" in res) return fieldError(out, res.error.field, res.error.message);
      out.secondary.push(res.analysis);
      out.warnings.push(...res.warnings);
    }
    if (ctx.inputs.rolloverTenorDays !== undefined) {
      const res = rollover(ctx.config, ctx.inputs, { ...ctxEvent, payout });
      if ("error" in res) return fieldError(out, res.error.field, res.error.message);
      out.secondary.push(res.analysis);
    }
  } else {
    const feature = ctx.config.features.upfront;
    if (!feature?.enabled) return blocked("RTN upfront calculation is not approved for use.", "RULE_NOT_APPROVED");

    // WHT is taken before payment: the upfront amount is net interest on the booked principal.
    const divisor = dec(1).plus(dec(1).minus(whtRate).times(annualRate).times(tenor).dividedBy(basis));
    const booked = r(principal.dividedBy(divisor));
    const upfront = r(principal.minus(booked));
    const gross = r(booked.times(annualRate).times(tenor).dividedBy(basis));
    const wht = r(gross.times(whtRate));

    out.formula = "divisor = 1 + (0.90 × annualRate × tenor ÷ 365); bookedPrincipal = fundedAmount ÷ divisor; upfrontInterest = fundedAmount − bookedPrincipal";
    out.steps = [
      { label: "Band selection", expression: `${m(principal)} → ${bandLabel(band)}`, result: `Band ${band.code}` },
      { label: "Rate lookup", expression: `${tenor} days × Band ${band.code} × upfront`, result: `${pct(ratePercent)} p.a.` },
      { label: "Divisor", expression: `1 + (${dec(1).minus(whtRate)} × ${annualRate} × ${tenor} ÷ ${basis})`, result: divisor.toDecimalPlaces(10).toString() },
      { label: "Booked principal", expression: `${m(principal)} ÷ ${divisor.toDecimalPlaces(10)}`, result: m(booked) },
      { label: "Gross interest on booked principal", expression: `${m(booked)} × ${annualRate} × ${tenor} ÷ ${basis}`, result: m(gross) },
      { label: "Withholding tax", expression: `${m(gross)} × ${whtPercent}%`, result: m(wht) },
      { label: "Upfront interest paid", expression: `${m(principal)} − ${m(booked)}`, result: m(upfront) },
    ];
    out.summary = [
      ...header,
      { key: "bookedPrincipal", label: "Booked principal", value: m(booked), kind: "money" },
      { key: "grossInterest", label: "Gross interest (on booked principal)", value: m(gross), kind: "money" },
      { key: "tax", label: `WHT (${whtPercent}%)`, value: m(wht), kind: "money" },
      { key: "netInterest", label: "Upfront interest paid (net)", value: m(upfront), kind: "money", emphasis: true },
    ];
    out.lineItems = [
      { sequence: 1, label: "Funded amount", amount: m(principal), type: "PRINCIPAL", explanation: "Amount paid by the investor." },
      { sequence: 2, label: "Booked principal", amount: m(booked), type: "BALANCE", explanation: "Funded amount ÷ divisor." },
      { sequence: 3, label: "Gross interest", amount: m(gross), type: "INTEREST", explanation: "On the booked principal for the full tenor." },
      { sequence: 4, label: "Withholding tax", amount: m(wht), type: "TAX", explanation: `${whtPercent}% of gross interest, taken before payment.` },
      { sequence: 5, label: "Upfront interest paid", amount: m(upfront), type: "PAYOUT", explanation: "Funded amount − booked principal (= gross − WHT)." },
    ];
    out.assumptions.push("Upfront interest is net interest on the booked principal; 10% WHT is taken before payment (built into the divisor).");

    const unsupported = (["daysElapsed", "topUpAmount", "rolloverTenorDays"] as const).find((k) => ctx.inputs[k] !== undefined);
    if (unsupported) {
      out.secondary.push({
        key: unsupported === "daysElapsed" ? "earlyWithdrawal" : unsupported === "topUpAmount" ? "topUp" : "rollover",
        title: unsupported === "daysElapsed" ? "Early withdrawal" : unsupported === "topUpAmount" ? "Top-up" : "Rollover",
        status: "BLOCKED",
        ruleStatus: "OPEN",
        message:
          unsupported === "daysElapsed"
            ? "Early withdrawal of an upfront-interest placement needs an approved claw-back rule for unearned upfront interest (OPEN-RTN-04). Calculation unavailable."
            : "This event has only been specified for at-maturity placements. Calculation unavailable for upfront placements.",
        summary: [],
        steps: [],
        lineItems: [],
      });
    }
  }

  out.assumptions.push(roundingAssumption(ctx.rounding));
  out.warnings.push(...rateWarnings(ctx, rateSource));
  return out;
};

interface EventContext {
  cfg: RtnConfig;
  principal: Dec;
  tenor: number;
  annualRate: Dec;
  ratePercent: string;
  whtRate: Dec;
  whtPercent: string;
  basis: number;
  r: (v: Dec) => Dec;
  minimum: Dec;
  maturity: string | null;
  band: RtnBand;
}

type EventError = { error: { field: string; message: string } };

/** Interest on an amount at the original rate for the elapsed days, then the new rate for the rest. */
function segmentedInterest(e: EventContext, amountBefore: Dec, amountAfter: Dec, day: number, newRate: Dec) {
  const seg1 = e.r(amountBefore.times(e.annualRate).times(day).dividedBy(e.basis));
  const seg2 = e.r(amountAfter.times(newRate).times(e.tenor - day).dividedBy(e.basis));
  const gross = e.r(seg1.plus(seg2));
  const wht = e.r(gross.times(e.whtRate));
  return { seg1, seg2, gross, wht, net: e.r(gross.minus(wht)) };
}

function earlyWithdrawal(
  config: ProductConfigVersion,
  inputs: Record<string, unknown>,
  e: EventContext,
): EventError | { analyses: SecondaryAnalysis[]; warnings: CalculationWarning[] } {
  const days = inputs.daysElapsed as number;
  const feature = config.features.earlyWithdrawal;
  const partialFeature = config.features.partialWithdrawal;
  if (!feature?.enabled) return { error: { field: "daysElapsed", message: "Early withdrawal is not enabled for this configuration." } };
  if (days > e.tenor) return { error: { field: "daysElapsed", message: `Days elapsed cannot exceed the tenor (${e.tenor} days).` } };

  const amount = inputs.withdrawalAmount !== undefined ? dec(inputs.withdrawalAmount as string) : e.principal;
  if (amount.gt(e.principal)) return { error: { field: "withdrawalAmount", message: `Cannot exceed the principal (${naira(e.principal)}).` } };
  const partial = amount.lt(e.principal);
  const remaining = e.principal.minus(amount);
  if (partial) {
    if (!partialFeature?.enabled) return { error: { field: "withdrawalAmount", message: "Partial withdrawal is not enabled for this configuration." } };
    if (remaining.lt(e.minimum)) {
      return {
        error: {
          field: "withdrawalAmount",
          message: `This leaves ${naira(remaining)} invested, below the ${naira(e.minimum)} minimum. Withdraw the full ${naira(e.principal)}, or at most ${naira(e.principal.minus(e.minimum))}.`,
        },
      };
    }
  }

  const { sharePercent, bandLabel: penaltyBand } = penaltyShare(e.cfg, days, e.tenor);
  const penaltyRate = dec(sharePercent).dividedBy(100).times(e.annualRate);
  const elapsedShare = `${dec(days).dividedBy(e.tenor).times(100).toDecimalPlaces(2).toString()}%`;
  const accrued = e.r(amount.times(e.annualRate).times(days).dividedBy(e.basis));
  const penalty = e.r(dec(days).dividedBy(e.basis).times(penaltyRate).times(amount));
  const taxable = e.r(accrued.minus(penalty));
  const wht = e.r(taxable.times(e.whtRate));
  const net = e.r(taxable.minus(wht));
  const payout = e.r(amount.plus(net));

  const analyses: SecondaryAnalysis[] = [
    {
      key: "earlyWithdrawal",
      title: partial ? "Partial withdrawal" : days >= e.tenor ? "Withdrawal on maturity" : "Early withdrawal",
      status: "CALCULATED",
      ruleStatus: feature.ruleStatus,
      message: feature.note,
      summary: [
        { key: "elapsedDays", label: "Days elapsed", value: `${days} of ${e.tenor}`, kind: "text" },
        { key: "elapsedShare", label: "Tenor elapsed", value: elapsedShare, kind: "text" },
        { key: "withdrawn", label: "Amount withdrawn", value: m(amount), kind: "money" },
        { key: "penaltyRate", label: "Penalty rate", value: `${sharePercent}% of ${pct(e.ratePercent)} = ${pct(penaltyRate.times(100))} p.a. (${penaltyBand})`, kind: "text" },
        { key: "grossInterest", label: "Interest accrued", value: m(accrued), kind: "money" },
        { key: "penalty", label: "Penal charge", value: m(penalty), kind: "money" },
        { key: "taxable", label: "Interest after penalty", value: m(taxable), kind: "money" },
        { key: "tax", label: `WHT (${e.whtPercent}%)`, value: m(wht), kind: "money" },
        { key: "netInterest", label: "Net interest paid", value: m(net), kind: "money" },
        { key: "payout", label: partial ? "Partial withdrawal payout" : "Withdrawal payout", value: m(payout), kind: "money", emphasis: true },
      ],
      steps: [
        { label: "Tenor elapsed", expression: `${days} ÷ ${e.tenor} × 100`, result: elapsedShare },
        { label: "Penalty rate", expression: `${sharePercent}% × ${pct(e.ratePercent)}`, result: `${pct(penaltyRate.times(100))} p.a.` },
        { label: "Interest accrued", expression: `${m(amount)} × ${e.annualRate} × ${days} ÷ ${e.basis}`, result: m(accrued) },
        { label: "Penal charge", expression: `${days} ÷ ${e.basis} × ${penaltyRate.toDecimalPlaces(8)} × ${m(amount)}`, result: m(penalty) },
        { label: "Interest after penalty", expression: `${m(accrued)} − ${m(penalty)}`, result: m(taxable) },
        { label: "WHT", expression: `${m(taxable)} × ${e.whtPercent}%`, result: m(wht) },
        { label: "Payout", expression: `${m(amount)} + ${m(net)}`, result: m(payout) },
      ],
      lineItems: [
        { sequence: 1, label: "Principal withdrawn", amount: m(amount), type: "PRINCIPAL", explanation: partial ? "Treated as its own early liquidation." : "Returned in full." },
        { sequence: 2, label: "Interest accrued", amount: m(accrued), type: "INTEREST", explanation: `${days} days at the placement rate.` },
        { sequence: 3, label: "Penal charge", amount: m(penalty), type: "PENALTY", explanation: `${sharePercent}% of the placement rate for ${days} days, taken from accrued interest.` },
        { sequence: 4, label: "WHT", amount: m(wht), type: "TAX", explanation: `${e.whtPercent}% of interest after the penalty.` },
        { sequence: 5, label: "Payout", amount: m(payout), type: "PAYOUT", explanation: "Principal withdrawn + net interest." },
      ],
    },
  ];

  if (partial) {
    const re = lookupRate(e.cfg, remaining, e.tenor, "MATURITY");
    if (!re) {
      analyses.push({ key: "remainingPlacement", title: "Remaining placement", status: "BLOCKED", ruleStatus: "CONFIRMED", message: "No published rate for the remaining principal's band. Calculation unavailable.", summary: [], steps: [], lineItems: [] });
    } else {
      const newRate = dec(re.ratePercent).dividedBy(100);
      const seg = segmentedInterest(e, remaining, remaining, days, newRate);
      const remPayout = e.r(remaining.plus(seg.net));
      analyses.push({
        key: "remainingPlacement",
        title: "Remaining placement (re-rated)",
        status: "CALCULATED",
        ruleStatus: "PROVISIONAL",
        message: `${partialFeature!.note} The projection applies the original rate before the withdrawal day and the new band's rate after it (assumption, RTN-R14).`,
        summary: [
          { key: "remainingPrincipal", label: "Remaining principal", value: m(remaining), kind: "money" },
          { key: "newBand", label: "New band", value: bandLabel(re.band), kind: "text" },
          { key: "newRate", label: "New rate (same tenor, at maturity)", value: `${pct(re.ratePercent)} p.a.`, kind: "text" },
          { key: "grossInterest", label: "Projected gross interest", value: m(seg.gross), kind: "money" },
          { key: "tax", label: `WHT (${e.whtPercent}%)`, value: m(seg.wht), kind: "money" },
          { key: "maturityPayout", label: "Projected maturity payout", value: m(remPayout), kind: "money", emphasis: true },
        ],
        steps: [
          { label: "Before withdrawal", expression: `${m(remaining)} × ${e.annualRate} × ${days} ÷ ${e.basis}`, result: m(seg.seg1) },
          { label: "After withdrawal", expression: `${m(remaining)} × ${newRate} × ${e.tenor - days} ÷ ${e.basis}`, result: m(seg.seg2) },
          { label: "Net interest", expression: `${m(seg.gross)} − ${m(seg.wht)}`, result: m(seg.net) },
        ],
        lineItems: [],
      });
    }
  }
  return { analyses, warnings: [] };
}

function topUp(config: ProductConfigVersion, inputs: Record<string, unknown>, e: EventContext): EventError | { analysis: SecondaryAnalysis; warnings: CalculationWarning[] } {
  const feature = config.features.topUp;
  if (!feature?.enabled) return { error: { field: "topUpAmount", message: "Top-ups are not enabled for this configuration." } };
  if (inputs.topUpAmount === undefined) return { error: { field: "topUpAmount", message: "Enter the top-up amount." } };
  if (inputs.topUpDay === undefined) return { error: { field: "topUpDay", message: "Enter the day the top-up lands." } };
  const amount = dec(inputs.topUpAmount as string);
  const day = inputs.topUpDay as number;
  if (day >= e.tenor) return { error: { field: "topUpDay", message: `Must be before maturity (day ${e.tenor}).` } };

  const total = e.principal.plus(amount);
  const re = lookupRate(e.cfg, total, e.tenor, "MATURITY");
  if (!re) return { error: { field: "topUpAmount", message: "No published rate for the new total's band." } };
  const newRate = dec(re.ratePercent).dividedBy(100);
  const seg = segmentedInterest(e, e.principal, total, day, newRate);
  const payout = e.r(total.plus(seg.net));
  const warnings: CalculationWarning[] = [];
  if (day <= 7) {
    warnings.push({ code: "TOPUP_WITHIN_7_DAYS", severity: "INFO", message: "Top-up within the first 7 days: the journey suggests offering a separate plan instead (RTN-TOP-002)." });
  }
  return {
    warnings,
    analysis: {
      key: "topUp",
      title: "Top-up",
      status: "CALCULATED",
      ruleStatus: feature.ruleStatus,
      message: feature.note,
      summary: [
        { key: "topUpAmount", label: "Top-up amount", value: m(amount), kind: "money" },
        { key: "topUpDay", label: "Top-up day", value: `Day ${day} of ${e.tenor} (${e.tenor - day} days left)`, kind: "text" },
        { key: "newPrincipal", label: "New total principal", value: m(total), kind: "money" },
        { key: "newBand", label: "New band", value: bandLabel(re.band), kind: "text" },
        { key: "newRate", label: "Rate from top-up day", value: `${pct(re.ratePercent)} p.a.`, kind: "text" },
        { key: "grossInterest", label: "Gross interest (whole tenor)", value: m(seg.gross), kind: "money" },
        { key: "tax", label: `WHT (${e.whtPercent}%)`, value: m(seg.wht), kind: "money" },
        { key: "netInterest", label: "Net interest", value: m(seg.net), kind: "money" },
        ...(e.maturity ? [{ key: "maturityDate", label: "Maturity date (unchanged)", value: e.maturity, kind: "text" as const }] : []),
        { key: "maturityPayout", label: "Maturity payout", value: m(payout), kind: "money", emphasis: true },
      ],
      steps: [
        { label: "Before top-up", expression: `${m(e.principal)} × ${e.annualRate} × ${day} ÷ ${e.basis}`, result: m(seg.seg1) },
        { label: "After top-up", expression: `${m(total)} × ${newRate} × ${e.tenor - day} ÷ ${e.basis}`, result: m(seg.seg2) },
        { label: "WHT", expression: `${m(seg.gross)} × ${e.whtPercent}%`, result: m(seg.wht) },
        { label: "Maturity payout", expression: `${m(total)} + ${m(seg.net)}`, result: m(payout) },
      ],
      lineItems: [],
    },
  };
}

function rollover(
  config: ProductConfigVersion,
  inputs: Record<string, unknown>,
  e: EventContext & { payout: Dec },
): EventError | { analysis: SecondaryAnalysis } {
  const feature = config.features.rollover;
  if (!feature?.enabled) return { error: { field: "rolloverTenorDays", message: "Rollover is not enabled for this configuration." } };
  const newTenor = Number(inputs.rolloverTenorDays);
  const rolled = e.payout; // principal + net interest
  const re = lookupRate(e.cfg, rolled, newTenor, "MATURITY");
  if (!re) return { error: { field: "rolloverTenorDays", message: "No published rate for this rollover tenor and band." } };
  const rate = dec(re.ratePercent).dividedBy(100);
  const gross = e.r(rolled.times(rate).times(newTenor).dividedBy(e.basis));
  const wht = e.r(gross.times(e.whtRate));
  const net = e.r(gross.minus(wht));
  const payout = e.r(rolled.plus(net));
  const newMaturity = e.maturity ? addDays(e.maturity, newTenor) : null;
  return {
    analysis: {
      key: "rollover",
      title: "Rollover",
      status: "CALCULATED",
      ruleStatus: feature.ruleStatus,
      message: `${feature.note} Uses the current Rate Guide.`,
      summary: [
        { key: "rolledAmount", label: "Rolled over (principal + net interest)", value: m(rolled), kind: "money" },
        { key: "newBand", label: "Band", value: bandLabel(re.band), kind: "text" },
        { key: "newRate", label: "Rate", value: `${pct(re.ratePercent)} p.a. (${newTenor} days, at maturity)`, kind: "text" },
        ...(e.maturity ? [{ key: "startDate", label: "New placement starts", value: e.maturity, kind: "text" as const }] : []),
        ...(newMaturity ? [{ key: "newMaturity", label: "New maturity date", value: newMaturity, kind: "text" as const }] : []),
        { key: "grossInterest", label: "Gross interest", value: m(gross), kind: "money" },
        { key: "tax", label: `WHT (${e.whtPercent}%)`, value: m(wht), kind: "money" },
        { key: "maturityPayout", label: "Rollover maturity payout", value: m(payout), kind: "money", emphasis: true },
      ],
      steps: [
        { label: "Rolled over", expression: "first placement payout (principal + net interest)", result: m(rolled) },
        { label: "Gross interest", expression: `${m(rolled)} × ${rate} × ${newTenor} ÷ ${e.basis}`, result: m(gross) },
        { label: "Payout", expression: `${m(rolled)} + (${m(gross)} − ${m(wht)})`, result: m(payout) },
      ],
      lineItems: [],
    },
  };
}
