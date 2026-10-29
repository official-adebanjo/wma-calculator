import { isWeekend, weekdayName } from "../dates";
import { dec, type Dec, percentOf, toMoneyString } from "../money";
import type {
  CalculationResult,
  CalculationWarning,
  ProductConfigVersion,
  ProductDefinition,
  RoundingMode,
} from "../types";

export interface CalcContext {
  product: ProductDefinition;
  config: ProductConfigVersion;
  inputs: Record<string, unknown>;
  /** Rate override from QA options, already validated. */
  rateOverridePercent?: string;
  rounding: RoundingMode;
}

/** The part of a result a strategy is responsible for. */
export type StrategyOutput = Pick<
  CalculationResult,
  "status" | "summary" | "lineItems" | "steps" | "schedule" | "scheduleLabels" | "secondary" | "formula" | "assumptions" | "warnings" | "fieldErrors"
> & {
  errorCode?: string;
  message?: string;
  rateSource: CalculationResult["rateSource"];
};

export type CalculatorStrategy = (ctx: CalcContext) => StrategyOutput;

export function emptyOutput(): StrategyOutput {
  return {
    status: "CALCULATED",
    summary: [],
    lineItems: [],
    steps: [],
    schedule: [],
    secondary: [],
    formula: null,
    assumptions: [],
    warnings: [],
    fieldErrors: [],
    rateSource: "NONE",
  };
}

export function m(v: Dec): string {
  return toMoneyString(v);
}

/** Rate for the product: QA override if supplied, else the configured rate. */
type RateSource = "CONFIGURATION" | "ENTERED" | "QA_OVERRIDE";

/** Rate for the product: QA override, else a rate entered in the calculation, else the configured rate. */
export function resolveFlatRate(ctx: CalcContext): { percent: string; source: RateSource } | null {
  if (ctx.rateOverridePercent) return { percent: ctx.rateOverridePercent, source: "QA_OVERRIDE" };
  const entered = ctx.config.rateInputField ? (ctx.inputs[ctx.config.rateInputField] as string | undefined) : undefined;
  if (entered) return { percent: entered, source: "ENTERED" };
  if (ctx.config.ratePercent) return { percent: ctx.config.ratePercent, source: "CONFIGURATION" };
  return null;
}

export function rateWarnings(ctx: CalcContext, source: RateSource): CalculationWarning[] {
  const out: CalculationWarning[] = [];
  if (source === "ENTERED") {
    out.push({
      code: "RATE_ENTERED",
      severity: "INFO",
      message: "The interest rate was entered for this calculation; confirm it matches the corridor's configured rate on the Admin Portal.",
    });
  } else if (source === "QA_OVERRIDE") {
    out.push({
      code: "QA_RATE_OVERRIDE",
      severity: "CRITICAL",
      message: "QA OVERRIDE: the rate was entered manually and is NOT the approved configuration rate.",
    });
  } else if (ctx.config.rateProvenance === "ILLUSTRATIVE") {
    out.push({
      code: "ILLUSTRATIVE_RATE",
      severity: "WARNING",
      message: "The configured rate comes from the specification's worked example. Confirm the live configured rate before treating this as an expected production value.",
    });
  }
  return out;
}

export function roundingAssumption(mode: RoundingMode): string {
  return mode === "COMPONENT"
    ? "Rounding: each component rounded to 2 dp (half-up); later components derived from rounded values. Approved rounding policy is still open."
    : "Rounding: full precision carried through; values rounded to 2 dp (half-up) only for output. Displayed components may differ from totals by a kobo.";
}

/**
 * Up-front loan deductions (management fee on principal, WHT on interest).
 * Deducted from the amount disbursed; total repayable is unchanged. Blank
 * percentages are not applied. Returns a field error when deductions would
 * consume the whole principal.
 */
export function applyLoanDeductions(
  ctx: CalcContext,
  out: StrategyOutput,
  principal: Dec,
  totalInterest: Dec,
  totalRepayable: Dec,
  r: (v: Dec) => Dec,
): boolean {
  const cfg = ctx.config.loanDeductions;
  if (!cfg) return true;
  const feePct = ctx.inputs[cfg.managementFee.field] as string | undefined;
  const whtPct = ctx.inputs[cfg.withholdingTax.field] as string | undefined;
  const fee = r(feePct ? percentOf(principal, feePct) : dec(0));
  const wht = r(whtPct ? percentOf(totalInterest, whtPct) : dec(0));
  const deductions = r(fee.plus(wht));
  const disbursed = r(principal.minus(deductions));

  if (disbursed.lte(0)) {
    out.status = "ERROR";
    out.errorCode = "VALIDATION_FAILED";
    out.message = "Deductions would leave nothing to disburse.";
    out.fieldErrors.push({ field: cfg.managementFee.field, message: `Fee and WHT (${m(deductions)}) must be less than the principal.` });
    // An error must never carry plausible-looking figures.
    for (const list of [out.summary, out.lineItems, out.steps, out.schedule, out.secondary, out.assumptions]) list.length = 0;
    return false;
  }

  const cost = r(totalRepayable.minus(disbursed));
  const taxIdx = out.summary.findIndex((s) => s.key === "tax");
  const deductionEntries = [
    { key: "managementFee", label: feePct ? `Management fee (${feePct}% of principal)` : "Management fee", value: m(fee), kind: "money" as const },
    { key: "tax", label: whtPct ? `Withholding tax (${whtPct}% of interest)` : "Withholding tax", value: m(wht), kind: "money" as const },
    { key: "totalDeductions", label: "Total deductions", value: m(deductions), kind: "money" as const },
    { key: "amountDisbursed", label: "Amount disbursed to applicant", value: m(disbursed), kind: "money" as const, emphasis: true },
    { key: "costOfBorrowing", label: "Cost of borrowing (repayable − disbursed)", value: m(cost), kind: "money" as const },
  ];
  out.summary.splice(taxIdx >= 0 ? taxIdx : out.summary.length, taxIdx >= 0 ? 1 : 0, ...deductionEntries);

  out.steps.push(
    { label: "Management fee", expression: feePct ? `${m(principal)} × ${feePct}%` : "not applied", result: m(fee) },
    { label: "Withholding tax", expression: whtPct ? `${m(totalInterest)} interest × ${whtPct}%` : "not applied", result: m(wht) },
    { label: "Amount disbursed", expression: `${m(principal)} − (${m(fee)} + ${m(wht)})`, result: m(disbursed) },
  );

  // Line items: insert deductions + disbursement after the principal line, then renumber.
  const deductionItems = [
    { sequence: 0, label: "Management fee", amount: m(fee), type: "FEE" as const, explanation: feePct ? `${feePct}% of principal, deducted at disbursement.` : "Not applied." },
    { sequence: 0, label: "Withholding tax", amount: m(wht), type: "TAX" as const, explanation: whtPct ? `${whtPct}% of total interest, deducted at disbursement.` : "Not applied." },
    { sequence: 0, label: "Amount disbursed to applicant", amount: m(disbursed), type: "PAYOUT" as const, explanation: "Principal less up-front deductions." },
  ];
  const pIdx = out.lineItems.findIndex((l) => l.type === "PRINCIPAL");
  out.lineItems.splice(pIdx + 1, 0, ...deductionItems);
  out.lineItems.forEach((l, i) => (l.sequence = i + 1));

  out.assumptions.push(
    "Management fee (% of principal) and withholding tax (% of interest) are deducted from the amount disbursed; the applicant still repays the full principal plus interest. Blank percentages are not applied.",
  );
  if (feePct || whtPct) {
    out.warnings.push({
      code: "DEDUCTION_RATES_ENTERED",
      severity: "INFO",
      message: "Fee and WHT percentages were entered for this calculation; confirm they match the current RFS Admin Portal configuration.",
    });
  }
  return true;
}

/**
 * Late-payment penalty interest (simple, accrued daily, on the overdue amount only):
 *   penalty = overdue amount × daily rate × min(days overdue, maxDays)
 * Adds a "latePenalty" secondary analysis. Returns false (and clears figures) on invalid input.
 */
export function applyLatePenalty(ctx: CalcContext, out: StrategyOutput, amountDue: Dec, amountDueLabel: string, r: (v: Dec) => Dec): boolean {
  const cfg = ctx.config.latePenalty;
  if (!cfg) return true;
  const days = ctx.inputs[cfg.daysOverdueField] as number | undefined;
  const ratePct = ctx.inputs[cfg.rateField] as string | undefined;
  const entered = ctx.inputs[cfg.overdueAmountField] as string | undefined;
  if (days === undefined && !ratePct && !entered) return true;

  const fail = (field: string, message: string) => {
    out.status = "ERROR";
    out.errorCode = "VALIDATION_FAILED";
    out.fieldErrors.push({ field, message });
    // An error must never carry plausible-looking figures.
    for (const list of [out.summary, out.lineItems, out.steps, out.schedule, out.secondary, out.assumptions]) list.length = 0;
    return false;
  };
  if (days === undefined) return fail(cfg.daysOverdueField, "Enter the days overdue to calculate the late-payment penalty.");
  if (!ratePct) return fail(cfg.rateField, "Enter the daily penalty rate from the Admin Portal.");

  const overdue = entered ? dec(entered) : amountDue;
  const charged = Math.min(days, cfg.maxDays);
  const dailyPenalty = overdue.times(ratePct).dividedBy(100);
  const penalty = r(dailyPenalty.times(charged));
  const totalDue = r(overdue.plus(penalty));
  const capped = days > cfg.maxDays;

  out.secondary.push({
    key: "latePenalty",
    title: "Late payment penalty",
    status: "CALCULATED",
    ruleStatus: "CONFIRMED",
    message: `Penalty interest is simple and accrued daily on the overdue amount only, for at most ${cfg.maxDays} days. Email communications take priority over this rule.`,
    summary: [
      { key: "overdueAmount", label: entered ? "Overdue amount" : `Overdue amount (${amountDueLabel})`, value: m(overdue), kind: "money" },
      { key: "penaltyRate", label: "Penalty rate", value: `${ratePct}% per day`, kind: "text" },
      { key: "daysOverdue", label: "Days overdue", value: `${days} days`, kind: "text" },
      { key: "daysCharged", label: "Days charged", value: capped ? `${charged} days (${cfg.maxDays}-day cap)` : `${charged} days`, kind: "text" },
      { key: "dailyPenalty", label: "Daily penalty interest", value: m(dailyPenalty), kind: "money" },
      { key: "penalty", label: "Penalty interest", value: m(penalty), kind: "money" },
      { key: "totalDue", label: "Total now due (overdue + penalty)", value: m(totalDue), kind: "money", emphasis: true },
    ],
    steps: [
      { label: "Daily penalty interest", expression: `${m(overdue)} × ${ratePct}%`, result: m(dailyPenalty) },
      { label: "Days charged", expression: `min(${days}, ${cfg.maxDays})`, result: `${charged}` },
      { label: "Penalty interest", expression: `${m(overdue)} × ${ratePct}% × ${charged}`, result: m(penalty) },
      { label: "Total now due", expression: `${m(overdue)} + ${m(penalty)}`, result: m(totalDue) },
    ],
    lineItems: [
      { sequence: 1, label: "Overdue amount", amount: m(overdue), type: "INSTALLMENT", explanation: entered ? "Entered for this calculation." : `Defaults to the ${amountDueLabel}.` },
      { sequence: 2, label: "Penalty interest", amount: m(penalty), type: "PENALTY", explanation: `${ratePct}% per day for ${charged} day${charged === 1 ? "" : "s"}; not charged on earlier penalty.` },
      { sequence: 3, label: "Total now due", amount: m(totalDue), type: "PAYOUT", explanation: "Overdue amount + penalty interest." },
    ],
  });
  out.warnings.push({
    code: "PENALTY_RATE_ENTERED",
    severity: "INFO",
    message: "The penalty rate was entered for this calculation; confirm it matches the RFS Admin Portal configuration.",
  });
  return true;
}

export function dueDateWarning(code: string, label: string, iso: string): CalculationWarning | null {
  if (!isWeekend(iso)) return null;
  return {
    code,
    severity: "INFO",
    message: `${label} ${iso} falls on a ${weekdayName(iso)}. Weekend/public-holiday handling is not approved; the calendar date is shown.`,
  };
}
