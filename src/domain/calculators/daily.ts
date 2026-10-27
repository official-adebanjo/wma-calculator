import { addDays } from "../dates";
import { componentRounder, D, dec, type Dec, formatNgn, percentOf } from "../money";
import type { SecondaryAnalysis } from "../types";
import {
  type CalculatorStrategy,
  dueDateWarning,
  emptyOutput,
  m,
  rateWarnings,
  resolveFlatRate,
  roundingAssumption,
} from "./shared";

/**
 * Nano and Payday loans (spec 8.2, 8.3):
 *   Interest = Principal × Daily Rate × Tenor Days
 *   Total Repayable = Principal + Interest
 * Single amount due at maturity; no installments are invented.
 */
export const dailyProratedLoan: CalculatorStrategy = (ctx) => {
  const out = emptyOutput();
  const rate = resolveFlatRate(ctx);
  if (!rate) {
    return { ...out, status: "BLOCKED", errorCode: "CONFIGURATION_UNAVAILABLE", message: "No daily rate is configured." };
  }
  out.rateSource = rate.source;
  const r = componentRounder(ctx.rounding);

  const principal = dec(ctx.inputs.principal as string);
  const days = ctx.inputs.tenorDays as number;

  // Income-based eligibility cap (Payday): principal ≤ cap% × monthly income, inclusive.
  const cap = ctx.config.incomeCap;
  let eligibility: { income: Dec; incomeLimit: Dec; eligibleMax: Dec; productMax: Dec | null } | null = null;
  if (cap) {
    const income = dec(ctx.inputs[cap.incomeField] as string);
    // Round DOWN: a 2dp principal ≤ floor(limit) exactly when it is ≤ the true limit.
    const incomeLimit = percentOf(income, cap.maxPercentOfMonthlyIncome).toDecimalPlaces(2, D.ROUND_DOWN);
    const productMax = ctx.config.maximumPrincipal ? dec(ctx.config.maximumPrincipal) : null;
    const eligibleMax = productMax && productMax.lt(incomeLimit) ? productMax : incomeLimit;
    if (principal.gt(eligibleMax)) {
      out.status = "ERROR";
      out.errorCode = "VALIDATION_FAILED";
      out.message = "Principal exceeds the eligible maximum for the stated monthly income.";
      out.fieldErrors.push({
        field: "principal",
        message: `Exceeds eligible maximum of ${formatNgn(m(eligibleMax))} (${cap.maxPercentOfMonthlyIncome}% of monthly income ${formatNgn(m(income))}${
          productMax && eligibleMax.eq(productMax) ? ", capped at the product maximum" : ""
        }).`,
      });
      return out;
    }
    eligibility = { income, incomeLimit, eligibleMax, productMax };
  }

  const interest = r(percentOf(principal, rate.percent).times(days));
  const total = r(principal.plus(interest));

  out.formula = "interest = principal × dailyRate × tenorDays; totalRepayable = principal + interest";
  out.steps = [
    { label: "Daily rate", expression: `${rate.percent}% per day = ${dec(rate.percent).dividedBy(100).toString()}`, result: `${rate.percent}%` },
    { label: "Interest", expression: `${m(principal)} × ${dec(rate.percent).dividedBy(100)} × ${days}`, result: m(interest) },
    { label: "Total repayable", expression: `${m(principal)} + ${m(interest)}`, result: m(total) },
  ];
  out.summary = [
    { key: "principal", label: "Principal", value: m(principal), kind: "money" },
    { key: "rate", label: "Daily rate", value: `${rate.percent}% per day`, kind: "text" },
    { key: "tenor", label: "Tenor", value: `${days} days`, kind: "text" },
    { key: "grossInterest", label: "Interest", value: m(interest), kind: "money" },
    { key: "tax", label: "Tax / deductions", value: "0.00", kind: "money" },
    { key: "totalRepayable", label: "Total repayable", value: m(total), kind: "money", emphasis: true },
  ];
  out.lineItems = [
    { sequence: 1, label: "Principal", amount: m(principal), type: "PRINCIPAL", explanation: "Amount disbursed." },
    { sequence: 2, label: "Interest", amount: m(interest), type: "INTEREST", explanation: `${rate.percent}% per day for ${days} days.` },
    { sequence: 3, label: "Total repayable at maturity", amount: m(total), type: "INSTALLMENT", explanation: "Single repayment due at maturity." },
  ];

  if (cap && eligibility) {
    const { income, incomeLimit, eligibleMax } = eligibility;
    const utilisation = principal.dividedBy(eligibleMax).times(100).toDecimalPlaces(2);
    out.summary.splice(
      1,
      0,
      { key: "monthlyIncome", label: "Registered monthly income", value: m(income), kind: "money" },
      { key: "eligibleMax", label: "Eligible maximum", value: m(eligibleMax), kind: "money" },
      { key: "capUtilisation", label: "Eligibility used", value: `${utilisation.toString()}%`, kind: "text" },
    );
    out.steps.unshift(
      { label: "Income cap", expression: `${m(income)} × ${cap.maxPercentOfMonthlyIncome}%`, result: m(incomeLimit) },
      {
        label: "Eligible maximum",
        expression: eligibility.productMax ? `min(${m(incomeLimit)}, product max ${m(eligibility.productMax)})` : m(incomeLimit),
        result: m(eligibleMax),
      },
      { label: "Eligibility check", expression: `${m(principal)} ≤ ${m(eligibleMax)}`, result: "PASS" },
    );
    out.assumptions.unshift(
      `Principal may not exceed ${cap.maxPercentOfMonthlyIncome}% of the registered monthly income (inclusive) or the product maximum, whichever is lower. Other salary-evaluation criteria are not modelled.`,
    );
  }

  const startDate = ctx.inputs.startDate as string | undefined;
  if (startDate) {
    const due = addDays(startDate, days);
    out.summary.push({ key: "dueDate", label: "Due date", value: due, kind: "text" });
    const w = dueDateWarning("DUE_DATE_WEEKEND", "Due date", due);
    if (w) out.warnings.push(w);
  }

  out.assumptions.push(
    "Simple interest on the full principal for the selected number of days.",
    "No fees, insurance or penalties are included; none are approved for this calculator.",
    roundingAssumption(ctx.rounding),
  );
  if (startDate) out.assumptions.push("Due date = disbursement date + tenor days (calendar).");
  out.warnings.push(...rateWarnings(ctx, rate.source));

  // Payday early settlement preview (provisional).
  const actualDays = ctx.inputs.actualDaysUsed as number | undefined;
  const feature = ctx.config.features.earlySettlement;
  if (actualDays !== undefined) {
    if (!feature?.enabled) {
      out.warnings.push({ code: "EARLY_SETTLEMENT_UNAVAILABLE", severity: "INFO", message: "Early settlement is not configured for this product." });
    } else if (actualDays > days) {
      out.status = "ERROR";
      out.errorCode = "VALIDATION_FAILED";
      out.fieldErrors.push({ field: "actualDaysUsed", message: `Actual days used cannot exceed the tenor (${days} days).` });
    } else {
      const esInterest = r(percentOf(principal, rate.percent).times(actualDays));
      const esTotal = r(principal.plus(esInterest));
      const saved = r(interest.minus(esInterest));
      const es: SecondaryAnalysis = {
        key: "earlySettlement",
        title: "Early settlement preview",
        status: "CALCULATED",
        ruleStatus: feature.ruleStatus,
        message: feature.note,
        summary: [
          { key: "actualDays", label: "Actual days used", value: `${actualDays} of ${days} days`, kind: "text" },
          { key: "interest", label: "Interest (actual days)", value: m(esInterest), kind: "money" },
          { key: "interestSaved", label: "Interest not charged", value: m(saved), kind: "money" },
          { key: "settlementAmount", label: "Settlement amount", value: m(esTotal), kind: "money", emphasis: true },
        ],
        steps: [
          { label: "Interest", expression: `${m(principal)} × ${dec(rate.percent).dividedBy(100)} × min(${actualDays}, ${days})`, result: m(esInterest) },
          { label: "Settlement amount", expression: `${m(principal)} + ${m(esInterest)}`, result: m(esTotal) },
        ],
        lineItems: [
          { sequence: 1, label: "Principal", amount: m(principal), type: "PRINCIPAL", explanation: "Outstanding principal." },
          { sequence: 2, label: "Interest for days used", amount: m(esInterest), type: "INTEREST", explanation: `${actualDays} days at ${rate.percent}% per day.` },
          { sequence: 3, label: "Early settlement payable", amount: m(esTotal), type: "PAYOUT", explanation: "No early settlement fee applied (none approved)." },
        ],
      };
      out.secondary.push(es);
    }
  }

  return out;
};
