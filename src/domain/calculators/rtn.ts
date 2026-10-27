import { addDays } from "../dates";
import { componentRounder, dec, type Dec, toPercentString } from "../money";
import type { RtnBand, RtnPayoutOption, SecondaryAnalysis } from "../types";
import { type CalculatorStrategy, type CalcContext, dueDateWarning, emptyOutput, m, rateWarnings, roundingAssumption } from "./shared";

export function selectRtnBand(bands: RtnBand[], principal: Dec): RtnBand | undefined {
  return bands.find((b) => principal.gte(dec(b.min)) && (b.max === null || principal.lte(dec(b.max))));
}

function blocked(message: string, errorCode = "RATE_UNAVAILABLE") {
  return { ...emptyOutput(), status: "BLOCKED" as const, errorCode, message };
}

/**
 * RTN (spec 8.6–8.8).
 * At maturity:  gross = P × rate × days / 365; WHT = 10% × gross; net = gross − WHT; payout = P + net
 * Upfront:      divisor = 1 + (1 − WHT) × rate × days / 365; booked = F / divisor; upfront = F − booked
 */
export const rtn: CalculatorStrategy = (ctx) => {
  const cfg = ctx.config.rtn;
  const whtPercent = ctx.config.tax?.withholdingTaxPercent;
  if (!cfg || !whtPercent) return blocked("RTN rate guide or tax configuration is missing.", "CONFIGURATION_UNAVAILABLE");

  const principal = dec(ctx.inputs.principal as string);
  const tenor = Number(ctx.inputs.tenorDays);
  const option = ctx.inputs.payoutOption as RtnPayoutOption;
  const investorType = ctx.inputs.investorType as "INDIVIDUAL" | "CORPORATE";

  const out = emptyOutput();
  if (investorType === "CORPORATE" && principal.lt(dec(cfg.corporateMinimum))) {
    out.status = "ERROR";
    out.errorCode = "VALIDATION_FAILED";
    out.fieldErrors.push({ field: "principal", message: `Corporate minimum is ₦${Number(cfg.corporateMinimum).toLocaleString("en-NG", { minimumFractionDigits: 2 })}.` });
    return out;
  }
  if (!ctx.config.tenorOptions?.includes(tenor)) {
    out.status = "ERROR";
    out.errorCode = "VALIDATION_FAILED";
    out.fieldErrors.push({ field: "tenorDays", message: `Allowed tenors: ${ctx.config.tenorOptions?.join(", ")} days.` });
    return out;
  }

  const band = selectRtnBand(cfg.bands, principal);
  if (!band) return blocked("Funding amount does not fall within any configured RTN band.");

  const cell = cfg.rates.find((c) => c.tenorDays === tenor && c.band === band.code && c.option === option);
  if (!cell && !ctx.rateOverridePercent) {
    return blocked("No approved rate is available for this combination. Calculation is unavailable.");
  }
  const ratePercent = ctx.rateOverridePercent ?? cell!.annualRatePercent;
  const rateSource = ctx.rateOverridePercent ? "QA_OVERRIDE" : "CONFIGURATION";
  out.rateSource = rateSource;

  const r = componentRounder(ctx.rounding);
  const annualRate = dec(ratePercent).dividedBy(100);
  const whtRate = dec(whtPercent).dividedBy(100);
  const yearFraction = dec(tenor).dividedBy(cfg.dayCountBasis);
  const bandLabel = `Band ${band.code} (₦${Number(band.min).toLocaleString("en-NG")}${band.max ? `–₦${Number(band.max).toLocaleString("en-NG", { minimumFractionDigits: 2 })}` : " and above"})`;

  const header = [
    { key: "principal", label: option === "UPFRONT" ? "Funded amount" : "Principal", value: m(principal), kind: "money" as const },
    { key: "band", label: "Band", value: bandLabel, kind: "text" as const },
    { key: "rate", label: "Annual rate", value: `${toPercentString(dec(ratePercent))}% p.a. (${option === "UPFRONT" ? "upfront" : "at maturity"})`, kind: "text" as const },
    { key: "rateGuide", label: "Rate guide version", value: cfg.rateGuideVersion, kind: "text" as const },
    { key: "tenor", label: "Tenor", value: `${tenor} days`, kind: "text" as const },
  ];

  const valueDate = ctx.inputs.valueDate as string | undefined;
  if (valueDate) {
    const maturity = addDays(valueDate, tenor);
    header.push({ key: "maturityDate", label: "Estimated maturity date", value: maturity, kind: "text" as const });
    const w = dueDateWarning("MATURITY_WEEKEND", "Maturity date", maturity);
    if (w) out.warnings.push(w);
    out.assumptions.push("Maturity date = value date + tenor days (calendar). Weekend/holiday handling is Open (OPEN-RTN-07).");
  }

  if (option === "MATURITY") {
    const gross = r(principal.times(annualRate).times(yearFraction));
    const wht = r(gross.times(whtRate));
    const net = r(gross.minus(wht));
    const payout = r(principal.plus(net));

    out.formula = "gross = principal × annualRate × days / 365; WHT = gross × 10%; net = gross − WHT; payout = principal + net";
    out.steps = [
      { label: "Band selection", expression: `${m(principal)} → ${bandLabel}`, result: `Band ${band.code}` },
      { label: "Rate lookup", expression: `${tenor} days × Band ${band.code} × at maturity`, result: `${toPercentString(dec(ratePercent))}% p.a.` },
      { label: "Gross interest", expression: `${m(principal)} × ${annualRate} × ${tenor} / 365`, result: m(gross) },
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
      { sequence: 2, label: "Gross interest", amount: m(gross), type: "INTEREST", explanation: `${toPercentString(dec(ratePercent))}% p.a. × ${tenor}/365.` },
      { sequence: 3, label: "Withholding tax", amount: m(wht), type: "TAX", explanation: `${whtPercent}% of gross interest; principal is not taxed.` },
      { sequence: 4, label: "Net interest", amount: m(net), type: "INTEREST", explanation: "Gross interest − WHT." },
      { sequence: 5, label: "Maturity payout", amount: m(payout), type: "PAYOUT", explanation: "Principal + net interest." },
    ];
    out.assumptions.push("Simple interest, actual days / 365; no compounding.");
    const ew = earlyWithdrawal(ctx, principal, tenor, annualRate, whtRate, r);
    if (ew) {
      if ("fieldError" in ew) {
        out.status = "ERROR";
        out.errorCode = "VALIDATION_FAILED";
        out.fieldErrors.push(ew.fieldError);
      } else {
        out.secondary.push(ew);
      }
    }
  } else {
    const feature = ctx.config.features.upfront;
    if (!feature?.enabled) return blocked("RTN upfront calculation is not approved for use.", "RULE_NOT_APPROVED");

    const divisor = dec(1).plus(dec(1).minus(whtRate).times(annualRate).times(yearFraction));
    const booked = r(principal.dividedBy(divisor));
    const upfront = r(principal.minus(booked));
    // Tax treatment embedded in the divisor: upfront interest is net of WHT.
    const impliedGross = r(upfront.dividedBy(dec(1).minus(whtRate)));
    const impliedWht = r(impliedGross.minus(upfront));

    out.formula = "divisor = 1 + ((1 − WHT) × annualRate × days / 365); bookedPrincipal = fundedAmount / divisor; upfrontInterest = fundedAmount − bookedPrincipal";
    out.steps = [
      { label: "Band selection", expression: `${m(principal)} → ${bandLabel}`, result: `Band ${band.code}` },
      { label: "Rate lookup", expression: `${tenor} days × Band ${band.code} × upfront`, result: `${toPercentString(dec(ratePercent))}% p.a.` },
      { label: "Divisor", expression: `1 + ((1 − ${whtRate}) × ${annualRate} × ${tenor} / 365)`, result: divisor.toDecimalPlaces(10).toString() },
      { label: "Booked principal", expression: `${m(principal)} / ${divisor.toDecimalPlaces(10)}`, result: m(booked) },
      { label: "Upfront interest (net of WHT)", expression: `${m(principal)} − ${m(booked)}`, result: m(upfront) },
      { label: "Implied gross interest", expression: `${m(upfront)} / (1 − ${whtRate})`, result: m(impliedGross) },
      { label: "Implied WHT", expression: `${m(impliedGross)} − ${m(upfront)}`, result: m(impliedWht) },
    ];
    out.summary = [
      ...header,
      { key: "bookedPrincipal", label: "Booked principal", value: m(booked), kind: "money" },
      { key: "grossInterest", label: "Implied gross interest", value: m(impliedGross), kind: "money" },
      { key: "tax", label: `Implied WHT (${whtPercent}%)`, value: m(impliedWht), kind: "money" },
      { key: "netInterest", label: "Upfront interest (net)", value: m(upfront), kind: "money", emphasis: true },
    ];
    out.lineItems = [
      { sequence: 1, label: "Funded amount", amount: m(principal), type: "PRINCIPAL", explanation: "Amount paid by the investor." },
      { sequence: 2, label: "Booked principal", amount: m(booked), type: "BALANCE", explanation: "Funded amount / divisor." },
      { sequence: 3, label: "Implied gross interest", amount: m(impliedGross), type: "INTEREST", explanation: "Derived: upfront interest / (1 − WHT rate)." },
      { sequence: 4, label: "Implied WHT", amount: m(impliedWht), type: "TAX", explanation: "Derived: implied gross − upfront interest." },
      { sequence: 5, label: "Upfront interest", amount: m(upfront), type: "INTEREST", explanation: "Funded amount − booked principal." },
    ];
    out.warnings.push({
      code: "RTN_UPFRONT_PROVISIONAL",
      severity: "WARNING",
      message: `PROVISIONAL: ${feature.note} Upfront interest is not comparable to the at-maturity option's interest.`,
    });
    out.assumptions.push(
      "Upfront interest is net of WHT because (1 − WHT) is inside the divisor; implied gross/WHT lines are derived for transparency only.",
      "Maturity amount and payout timing for upfront placements are not shown until the booking presentation is signed off.",
    );
    if (ctx.inputs.daysElapsed !== undefined) {
      out.secondary.push({
        key: "earlyWithdrawal",
        title: "Early withdrawal preview",
        status: "BLOCKED",
        ruleStatus: "OPEN",
        message: "Early withdrawal for upfront-interest placements requires an approved claw-back rule (OPEN-RTN-04). Calculation unavailable.",
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

function earlyWithdrawal(
  ctx: CalcContext,
  principal: Dec,
  tenor: number,
  annualRate: Dec,
  whtRate: Dec,
  r: (v: Dec) => Dec,
): SecondaryAnalysis | { fieldError: { field: string; message: string } } | null {
  const days = ctx.inputs.daysElapsed as number | undefined;
  const feature = ctx.config.features.earlyWithdrawal;
  if (days === undefined || !feature?.enabled) return null;
  if (days >= tenor) {
    return { fieldError: { field: "daysElapsed", message: `Days elapsed must be less than the tenor (${tenor} days).` } };
  }

  const share = dec(days).dividedBy(tenor).times(100);
  const shareLabel = `${share.toDecimalPlaces(2).toString()}%`;
  const bands = ctx.config.rtn!.penaltyBands;
  const band = bands.find((b) => share.gte(dec(b.fromPercent)) && share.lte(dec(b.toPercent)));
  const base = { key: "earlyWithdrawal", title: "Early withdrawal preview", ruleStatus: feature.ruleStatus };

  if (!band) {
    return {
      ...base,
      status: "BLOCKED",
      message: `Elapsed share ${shareLabel} (${days}/${tenor} days) does not map to an approved penalty band. Defined bands: ${bands
        .map((b) => `${b.fromPercent}–${b.toPercent}% → ${b.penaltyRatePercent}%`)
        .join("; ")}. Mapping for gaps and higher shares is Open (OPEN-RTN-03).`,
      summary: [{ key: "elapsedShare", label: "Elapsed share of tenor", value: shareLabel, kind: "text" }],
      steps: [],
      lineItems: [],
    };
  }

  const penaltyRate = dec(band.penaltyRatePercent).dividedBy(100);
  const elapsedFraction = dec(days).dividedBy(365);
  const gross = r(principal.times(annualRate).times(elapsedFraction));
  const penalty = r(principal.times(penaltyRate).times(elapsedFraction));
  const taxable = r(gross.minus(penalty));
  if (taxable.lt(0)) {
    return {
      ...base,
      status: "BLOCKED",
      message: "Penalty exceeds earned interest; treatment of a negative remainder is not specified. Calculation unavailable.",
      summary: [],
      steps: [],
      lineItems: [],
    };
  }
  const wht = r(taxable.times(whtRate));
  const net = r(taxable.minus(wht));
  const payout = r(principal.plus(net));

  return {
    ...base,
    status: "CALCULATED",
    message: feature.note,
    summary: [
      { key: "elapsedDays", label: "Days elapsed", value: `${days} of ${tenor}`, kind: "text" },
      { key: "elapsedShare", label: "Elapsed share of tenor", value: shareLabel, kind: "text" },
      { key: "penaltyRate", label: "Penalty rate", value: `${band.penaltyRatePercent}% (band ${band.fromPercent}–${band.toPercent}%)`, kind: "text" },
      { key: "grossInterest", label: "Gross interest earned", value: m(gross), kind: "money" },
      { key: "penalty", label: "Penalty", value: m(penalty), kind: "money" },
      { key: "taxable", label: "Taxable amount", value: m(taxable), kind: "money" },
      { key: "tax", label: "WHT", value: m(wht), kind: "money" },
      { key: "netInterest", label: "Net interest after penalty", value: m(net), kind: "money" },
      { key: "payout", label: "Early withdrawal payout", value: m(payout), kind: "money", emphasis: true },
    ],
    steps: [
      { label: "Elapsed share", expression: `${days} / ${tenor} × 100`, result: shareLabel },
      { label: "Gross interest", expression: `${m(principal)} × ${annualRate} × ${days} / 365`, result: m(gross) },
      { label: "Penalty", expression: `${days} / 365 × ${penaltyRate} × ${m(principal)}`, result: m(penalty) },
      { label: "Taxable amount", expression: `${m(gross)} − ${m(penalty)}`, result: m(taxable) },
      { label: "WHT", expression: `${m(taxable)} × ${whtRate}`, result: m(wht) },
      { label: "Net interest", expression: `${m(taxable)} − ${m(wht)}`, result: m(net) },
      { label: "Payout", expression: `${m(principal)} + ${m(net)}`, result: m(payout) },
    ],
    lineItems: [
      { sequence: 1, label: "Principal", amount: m(principal), type: "PRINCIPAL", explanation: "Returned in full." },
      { sequence: 2, label: "Gross interest earned", amount: m(gross), type: "INTEREST", explanation: `${days} days at the placement rate.` },
      { sequence: 3, label: "Penalty", amount: m(penalty), type: "PENALTY", explanation: `${band.penaltyRatePercent}% p.a. for ${days} days.` },
      { sequence: 4, label: "WHT", amount: m(wht), type: "TAX", explanation: "10% of (gross interest − penalty)." },
      { sequence: 5, label: "Payout", amount: m(payout), type: "PAYOUT", explanation: "Principal + net interest after penalty." },
    ],
  };
}
