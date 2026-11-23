import { addMonths } from "../dates";
import { dec, type Dec, toPercentString } from "../money";
import type { CalculationStep, LineItem, ScheduleRow, SecondaryAnalysis, SummaryEntry } from "../types";
import { type CalculatorStrategy, emptyOutput, m, rateWarnings, roundingAssumption, type StrategyOutput } from "./shared";

function fieldError(out: StrategyOutput, field: string, message: string): StrategyOutput {
  out.status = "ERROR";
  out.errorCode = "VALIDATION_FAILED";
  out.fieldErrors.push({ field, message });
  // An error must never carry plausible-looking figures.
  for (const list of [out.summary, out.lineItems, out.steps, out.schedule, out.secondary, out.assumptions]) list.length = 0;
  return out;
}

const naira = (v: Dec | string) => `₦${Number(dec(v).toFixed(2)).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

interface SegmentRun {
  balance: Dec; // closing balance of the last completed month
  deposits: Dec;
  monthsDone: number;
  /** The month in progress at `until`, if any days of it have passed. */
  partial: { days: number; deposit: Dec; base: Dec; interest: Dec; planMonth: number } | null;
}

/**
 * REAP — Rosabon Earning Plan (REAP-1.0), per "REAP Product Operating Logic".
 *   monthly rate = annual rate ÷ 12 (rate fixed by tenor)
 *   closing(n) = (closing(n−1) + deposits in month n) × (1 + monthly rate)
 * Months run from the plan start date. Maturity: payout = deposits + gross interest × 90%.
 * Early termination: gross interest to date (incl. part-month interest ÷ 30 days) less the
 * forfeiture (50% before day 180, 20% from day 180), then 10% WHT; principal is never forfeited.
 * A Top-Up restarts the tenor (and the forfeiture clock) from the top-up date.
 */
export const reap: CalculatorStrategy = (ctx) => {
  const out = emptyOutput();
  const cfg = ctx.config.reap;
  const whtPercent = ctx.config.tax?.withholdingTaxPercent;
  if (!cfg || !whtPercent) return { ...out, status: "BLOCKED", errorCode: "CONFIGURATION_UNAVAILABLE", message: "REAP rate guide or tax configuration is missing." };

  const tenor = Number(ctx.inputs.tenorMonths);
  const cell = cfg.rates.find((c) => c.tenorMonths === tenor);
  if (!cell && !ctx.rateOverridePercent) return fieldError(out, "tenorMonths", `Allowed tenors: ${cfg.rates.map((c) => c.tenorMonths).join(", ")} months.`);
  const ratePercent = ctx.rateOverridePercent ?? cell!.annualRatePercent;
  const rateSource = ctx.rateOverridePercent ? "QA_OVERRIDE" : "CONFIGURATION";
  out.rateSource = rateSource;
  const monthlyRate = dec(ratePercent).dividedBy(100).dividedBy(12);
  const whtRate = dec(whtPercent).dividedBy(100);

  const target = dec(ctx.inputs.monthlyTarget as string);
  const list = (ctx.inputs.depositsByMonth as string | undefined)?.split(";").map((v) => dec(v));
  const depositFor = (planMonth: number) => (list ? (list[planMonth - 1] ?? dec(0)) : target);
  const start = ctx.inputs.planStartDate as string | undefined;
  const topUp = ctx.inputs.topUpAmount !== undefined ? dec(ctx.inputs.topUpAmount as string) : null;
  const topUpDate = ctx.inputs.topUpDate as string | undefined;
  const termDate = ctx.inputs.terminationDate as string | undefined;
  const locked = ctx.inputs.savingsLock === "LOCKED";
  const waived = ctx.inputs.forfeitureWaiver === "WAIVED";

  const minimumOpening = dec(cfg.minimumOpeningDeposit);
  if (depositFor(1).lt(minimumOpening)) {
    return fieldError(out, list ? "depositsByMonth" : "monthlyTarget", `The opening (month 1) deposit must be at least ${naira(minimumOpening)}.`);
  }
  if (topUp && !topUpDate) return fieldError(out, "topUpDate", "Enter the top-up date.");
  if (topUpDate && !topUp) return fieldError(out, "topUpAmount", "Enter the top-up amount.");
  if ((topUpDate || termDate) && !start) return fieldError(out, "planStartDate", "Enter the plan start date to place a top-up or early termination.");
  const firstMaturity = start ? addMonths(start, tenor) : null;
  if (topUpDate && (topUpDate <= start! || topUpDate >= firstMaturity!)) {
    return fieldError(out, "topUpDate", `A top-up must fall after the start date and before maturity (${firstMaturity}).`);
  }
  if (termDate && termDate <= start!) return fieldError(out, "terminationDate", "Must be after the plan start date.");
  if (termDate && topUpDate && termDate <= topUpDate) return fieldError(out, "terminationDate", "Must be after the top-up date.");

  const schedule: ScheduleRow[] = [];
  /** Runs whole months from `segStart`, stopping before any month not complete by `until`. */
  const runSegment = (opening: Dec, segStart: string | null, firstPlanMonth: number, extraFirstDeposit: Dec, until?: string): SegmentRun => {
    let balance = opening;
    let deposits = dec(0);
    let monthsDone = 0;
    for (; monthsDone < tenor; monthsDone++) {
      const monthEnd = segStart ? addMonths(segStart, monthsDone + 1) : null;
      if (until && monthEnd && monthEnd > until) break;
      const planMonth = firstPlanMonth + monthsDone;
      const deposit = depositFor(planMonth).plus(monthsDone === 0 ? extraFirstDeposit : 0);
      const before = balance;
      const base = balance.plus(deposit);
      balance = base.times(monthlyRate.plus(1));
      deposits = deposits.plus(deposit);
      schedule.push({
        period: planMonth,
        dueDate: monthEnd,
        openingBalance: m(before),
        principal: m(deposit),
        interest: m(balance.minus(base)),
        installment: m(base),
        closingBalance: m(balance),
      });
    }
    let partial: SegmentRun["partial"] = null;
    if (until && segStart && monthsDone < tenor) {
      const days = daysBetween(addMonths(segStart, monthsDone), until);
      if (days > 0) {
        const planMonth = firstPlanMonth + monthsDone;
        const deposit = depositFor(planMonth).plus(monthsDone === 0 ? extraFirstDeposit : 0);
        const base = balance.plus(deposit);
        partial = { days, deposit, base, interest: base.times(monthlyRate).times(days).dividedBy(cfg.prorationDays), planMonth };
      }
    }
    return { balance, deposits, monthsDone, partial };
  };

  // Segment 1: from the start date (to the top-up, the termination, or maturity).
  const steps: CalculationStep[] = [];
  let seg = runSegment(dec(0), start ?? null, 1, dec(0), topUpDate ?? termDate);
  let deposits = seg.deposits;
  let clockStart = start ?? null; // the forfeiture clock (restarts at a top-up)
  let maturity = firstMaturity;

  if (topUp && topUpDate) {
    // Accrued interest to the top-up date is preserved in the new starting balance.
    const preserved = seg.partial ? seg.partial.base.plus(seg.partial.interest) : seg.balance;
    if (seg.partial) {
      deposits = deposits.plus(seg.partial.deposit);
      steps.push({ label: `Month ${seg.partial.planMonth}, ${seg.partial.days} days to the top-up`, expression: `${m(seg.partial.base)} × ${toPercentString(monthlyRate.times(100))}% × ${seg.partial.days} ÷ ${cfg.prorationDays}`, result: m(seg.partial.interest) });
    }
    steps.push({ label: "Balance carried into the reset tenor", expression: `${m(preserved)} + top-up ${m(topUp)}`, result: m(preserved.plus(topUp)) });
    const nextPlanMonth = 1 + seg.monthsDone + (seg.partial ? 1 : 0);
    seg = runSegment(preserved, topUpDate, nextPlanMonth, topUp, termDate);
    deposits = deposits.plus(seg.deposits);
    clockStart = topUpDate;
    maturity = addMonths(topUpDate, tenor);
  }

  const ratePct = `${toPercentString(dec(ratePercent))}% p.a.`;
  const summary: SummaryEntry[] = [
    { key: "tenor", label: "Tenor", value: `${tenor} months`, kind: "text" },
    { key: "rate", label: "Annual rate (fixed by tenor)", value: `${ratePct} (${toPercentString(monthlyRate.times(100))}% a month)`, kind: "text" },
    { key: "monthlyTarget", label: "Monthly target", value: m(target), kind: "money" },
    { key: "committedTotal", label: "Committed total (target × tenor)", value: m(target.times(tenor)), kind: "money" },
  ];
  if (start) summary.push({ key: "startDate", label: "Plan start date", value: start, kind: "text" });
  if (maturity) summary.push({ key: "maturityDate", label: topUp ? "Maturity date (reset by the top-up)" : "Maturity date", value: maturity, kind: "text" });
  if (topUp) summary.push({ key: "topUpAmount", label: `Top-up (${topUpDate})`, value: m(topUp), kind: "money" });

  const early = termDate !== undefined && maturity !== null && termDate < maturity;
  if (early) {
    if (locked) {
      return fieldError(out, "terminationDate", "The savings lock blocks early termination. Only a Compliance-approved Admin Unlock can lift it; select \"Savings lock: Admin Unlock applied\" to calculate.");
    }
    const partial = seg.partial;
    const depositsToDate = deposits.plus(partial?.deposit ?? 0);
    const balanceToDate = partial ? partial.base.plus(partial.interest) : seg.balance;
    const gross = balanceToDate.minus(depositsToDate);
    const daysElapsed = daysBetween(clockStart!, termDate);
    const band = [...cfg.forfeitureSchedule].reverse().find((b) => daysElapsed >= b.fromDay)!;
    const forfeitPct = waived ? "0" : band.forfeitPercent;
    const forfeited = gross.times(forfeitPct).dividedBy(100);
    const afterForfeit = gross.minus(forfeited);
    const wht = afterForfeit.times(whtRate);
    const net = afterForfeit.minus(wht);
    const payout = depositsToDate.plus(net);

    if (partial) {
      steps.push({ label: `Month ${partial.planMonth}, ${partial.days} days to termination`, expression: `${m(partial.base)} × ${toPercentString(monthlyRate.times(100))}% × ${partial.days} ÷ ${cfg.prorationDays}`, result: m(partial.interest) });
    }
    steps.push(
      { label: "Days elapsed", expression: `${termDate} − ${clockStart}${topUp ? " (top-up date)" : ""}`, result: `${daysElapsed}` },
      { label: "Gross interest to date", expression: `${m(balanceToDate)} − deposits ${m(depositsToDate)}`, result: m(gross) },
      { label: "Interest forfeited", expression: waived ? "waived (Compliance-approved)" : `${m(gross)} × ${forfeitPct}%`, result: m(forfeited) },
      { label: `WHT (${whtPercent}%)`, expression: `${m(afterForfeit)} × ${whtPercent}%`, result: m(wht) },
      { label: "Payout", expression: `${m(depositsToDate)} + ${m(net)}`, result: m(payout) },
    );
    summary.push(
      { key: "terminationDate", label: "Early termination", value: `${termDate} (day ${daysElapsed}${topUp ? " since the top-up" : ""})`, kind: "text" },
      { key: "deposits", label: "Deposits to date", value: m(depositsToDate), kind: "money" },
      { key: "grossInterest", label: "Gross interest to date", value: m(gross), kind: "money" },
      { key: "forfeitRate", label: "Forfeiture", value: waived ? `Waived (would be ${band.forfeitPercent}%)` : `${forfeitPct}% of interest (${daysElapsed < 180 ? "before day 180" : "day 180 or later"})`, kind: "text" },
      { key: "forfeited", label: "Interest forfeited", value: m(forfeited), kind: "money" },
      { key: "tax", label: `WHT (${whtPercent}%, after forfeiture)`, value: m(wht), kind: "money" },
      { key: "netInterest", label: "Net interest payable", value: m(net), kind: "money" },
      { key: "payout", label: "Early termination payout", value: m(payout), kind: "money", emphasis: true },
    );
    out.lineItems = numbered([
      { label: "Deposits to date", amount: m(depositsToDate), type: "PRINCIPAL", explanation: "Returned in full; principal is never forfeited." },
      { label: "Gross interest to date", amount: m(gross), type: "INTEREST", explanation: `Monthly compounding${partial ? `, plus ${partial.days} days of month ${partial.planMonth} (÷ ${cfg.prorationDays})` : ""}.` },
      { label: "Interest forfeited", amount: m(forfeited), type: "PENALTY", explanation: waived ? "Waived by Compliance." : `${forfeitPct}% of gross interest.` },
      { label: "WHT", amount: m(wht), type: "TAX", explanation: `${whtPercent}% of interest after forfeiture.` },
      { label: "Early termination payout", amount: m(payout), type: "PAYOUT", explanation: "Deposits + net interest." },
    ]);
    if (gross.isZero()) out.warnings.push({ code: "REAP_PRE_ACCRUAL", severity: "INFO", message: "No interest has accrued yet, so nothing is forfeited or taxed: the deposits are refunded in full." });
  } else {
    const gross = seg.balance.minus(deposits);
    const wht = gross.times(whtRate);
    const net = gross.minus(wht);
    const payout = deposits.plus(net);
    steps.push(
      { label: "Gross interest at maturity", expression: `${m(seg.balance)} − deposits ${m(deposits)}`, result: m(gross) },
      { label: `WHT (${whtPercent}%)`, expression: `${m(gross)} × ${whtPercent}%`, result: m(wht) },
      { label: "Maturity payout", expression: `${m(deposits)} + ${m(net)}`, result: m(payout) },
    );
    summary.push(
      { key: "deposits", label: "Total deposits", value: m(deposits), kind: "money" },
      { key: "finalBalance", label: "Final compounded balance", value: m(seg.balance), kind: "money" },
      { key: "grossInterest", label: "Gross interest", value: m(gross), kind: "money" },
      { key: "tax", label: `WHT (${whtPercent}%)`, value: m(wht), kind: "money" },
      { key: "netInterest", label: "Net interest", value: m(net), kind: "money" },
      { key: "payout", label: "Maturity payout", value: m(payout), kind: "money", emphasis: true },
    );
    out.lineItems = numbered([
      { label: "Total deposits", amount: m(deposits), type: "PRINCIPAL", explanation: list ? "From the deposits-by-month list." : `${naira(target)} each month.` },
      { label: "Gross interest", amount: m(gross), type: "INTEREST", explanation: `${ratePct} ÷ 12, compounded monthly.` },
      { label: "WHT", amount: m(wht), type: "TAX", explanation: `${whtPercent}% of gross interest.` },
      { label: "Maturity payout", amount: m(payout), type: "PAYOUT", explanation: "Deposits + net interest." },
    ]);
    if (termDate) out.warnings.push({ code: "REAP_TERMINATION_AT_MATURITY", severity: "INFO", message: `The termination date is on or after maturity (${maturity}): no forfeiture applies and interest stops at maturity.` });

    const rollover = rolloverAnalysis(ctx.inputs, cfg, payout, maturity, whtRate, whtPercent);
    if ("error" in rollover) return fieldError(out, rollover.error.field, rollover.error.message);
    if (rollover.analysis) out.secondary.push(rollover.analysis);
  }

  out.summary = summary;
  out.schedule = schedule;
  out.scheduleLabels = { period: "Month", dueDate: "Month ends", principal: "Deposit", interest: "Interest", installment: "Balance + deposit" };
  out.steps = [
    { label: "Monthly rate", expression: `${ratePct} ÷ 12`, result: `${toPercentString(monthlyRate.times(100))}%` },
    { label: "Each month", expression: "(previous closing balance + deposits that month) × (1 + monthly rate)", result: `${schedule.length} months compounded` },
    ...steps,
  ];
  out.formula = "closing(n) = (closing(n−1) + deposits in month n) × (1 + annualRate ÷ 12); payout = deposits + (gross interest − forfeiture) × 90%";
  out.assumptions.push(
    "Months run from the plan start date (not calendar month ends). Deposits for a month are made on its first day.",
    `Part-month interest (early termination or top-up) = balance × monthly rate × days ÷ ${cfg.prorationDays}.`,
    "A Top-Up restarts the tenor and the forfeiture clock from the top-up date; interest accrued so far is kept in the balance.",
    "Calculated at full precision; only output figures are rounded.",
    roundingAssumption(ctx.rounding),
  );
  if (list) out.assumptions.push("Deposits by month override the monthly target; months not listed get ₦0.");
  out.warnings.push(...rateWarnings(ctx, rateSource));
  return out;
};

function numbered(items: Omit<LineItem, "sequence">[]): LineItem[] {
  return items.map((l, i) => ({ ...l, sequence: i + 1 }));
}

/** Rollover at maturity: the full payout opens a new plan at the current Rate Guide rate for the new tenor. */
function rolloverAnalysis(
  inputs: Record<string, unknown>,
  cfg: NonNullable<import("../types").ProductConfigVersion["reap"]>,
  opening: Dec,
  maturity: string | null,
  whtRate: Dec,
  whtPercent: string,
): { error: { field: string; message: string } } | { analysis: SecondaryAnalysis | null } {
  if (inputs.rolloverTenorMonths === undefined) {
    if (inputs.rolloverMonthlyTarget !== undefined) return { error: { field: "rolloverTenorMonths", message: "Select the new tenor for the rollover." } };
    return { analysis: null };
  }
  const tenor = Number(inputs.rolloverTenorMonths);
  const cell = cfg.rates.find((c) => c.tenorMonths === tenor);
  if (!cell) return { error: { field: "rolloverTenorMonths", message: "Only tenors in the current Rate Guide can be selected." } };
  const target = inputs.rolloverMonthlyTarget !== undefined ? dec(inputs.rolloverMonthlyTarget as string) : dec(0);
  if (target.gt(0) && target.lt(cfg.minimumOpeningDeposit)) return { error: { field: "rolloverMonthlyTarget", message: `Minimum ${naira(cfg.minimumOpeningDeposit)}, or leave blank for ₦0.` } };
  const monthlyRate = dec(cell.annualRatePercent).dividedBy(1200);
  let balance = opening;
  for (let i = 0; i < tenor; i++) balance = balance.plus(target).times(monthlyRate.plus(1));
  const deposits = opening.plus(target.times(tenor));
  const gross = balance.minus(deposits);
  const net = gross.times(dec(1).minus(whtRate));
  const payout = deposits.plus(net);
  return {
    analysis: {
      key: "rollover",
      title: "Rollover at maturity",
      status: "CALCULATED",
      ruleStatus: "CONFIRMED",
      message: "All-or-nothing: the full matured balance (deposits + net interest) opens a new plan at the current Rate Guide rate for the new tenor. Day 0 and the forfeiture windows restart on the rollover date.",
      summary: [
        { key: "openingBalance", label: "Rolled over (opening balance)", value: m(opening), kind: "money" },
        { key: "rate", label: "New rate", value: `${toPercentString(dec(cell.annualRatePercent))}% p.a. (${tenor} months)`, kind: "text" },
        { key: "monthlyTarget", label: "New monthly target", value: m(target), kind: "money" },
        ...(maturity ? [{ key: "startDate", label: "New plan starts", value: maturity, kind: "text" as const }, { key: "maturityDate", label: "New maturity date", value: addMonths(maturity, tenor), kind: "text" as const }] : []),
        { key: "grossInterest", label: "Gross interest", value: m(gross), kind: "money" },
        { key: "tax", label: `WHT (${whtPercent}%)`, value: m(gross.times(whtRate)), kind: "money" },
        { key: "payout", label: "New plan maturity payout", value: m(payout), kind: "money", emphasis: true },
      ],
      steps: [{ label: "New plan", expression: `opening ${m(opening)}, then ${m(target)} a month for ${tenor} months, compounded monthly`, result: m(balance) }],
      lineItems: [],
    },
  };
}
