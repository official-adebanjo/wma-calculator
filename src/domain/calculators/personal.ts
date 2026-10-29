import { addMonths } from "../dates";
import { componentRounder, dec, type Dec, formatNgn } from "../money";
import type { ScheduleRow, SecondaryAnalysis } from "../types";
import {
  applyLatePenalty,
  applyLoanDeductions,
  type CalculatorStrategy,
  dueDateWarning,
  emptyOutput,
  m,
  rateWarnings,
  resolveFlatRate,
  roundingAssumption,
} from "./shared";

type Model = "FLAT" | "REDUCING_BALANCE";

/**
 * Personal Loan (spec 8.4). Both repayment plans repay principal in
 * equal monthly components; they differ only in the interest base:
 *   FLAT:             interest = original principal × monthly rate
 *   REDUCING_BALANCE: interest = opening balance × monthly rate
 * A standard amortizing (annuity) formula is deliberately NOT used.
 */
export const personalLoan: CalculatorStrategy = (ctx) => {
  const out = emptyOutput();

  // Pre-eligibility (Public Sector): net salary must meet the corridor minimum before anything is calculated.
  const elig = ctx.config.salaryEligibility;
  let eligibility: { salary: Dec; minimum: Dec } | null = null;
  if (elig) {
    const salary = dec(ctx.inputs[elig.salaryField] as string);
    const minimum = dec(ctx.inputs[elig.minimumField] as string);
    if (salary.lt(minimum)) {
      return {
        ...out,
        status: "ERROR",
        errorCode: "NOT_ELIGIBLE",
        message: "Not eligible: net monthly salary is below the corridor's minimum net salary.",
        fieldErrors: [{ field: elig.salaryField, message: `Below the corridor minimum of ${formatNgn(m(minimum))}. The applicant cannot acquire a loan in this corridor.` }],
      };
    }
    eligibility = { salary, minimum };
  }

  const rate = resolveFlatRate(ctx);
  if (!rate) {
    return { ...out, status: "BLOCKED", errorCode: "CONFIGURATION_UNAVAILABLE", message: "No monthly rate is configured or entered." };
  }
  if (ctx.config.rateModel !== "MONTHLY") {
    return { ...out, status: "BLOCKED", errorCode: "RATE_UNIT_MISMATCH", message: "Configured rate unit is not MONTHLY; refusing to reinterpret it." };
  }
  out.rateSource = rate.source;

  const r = componentRounder(ctx.rounding);
  const principal = dec(ctx.inputs.principal as string);
  const n = ctx.inputs.tenorMonths as number;
  const model = ctx.inputs.interestModel as Model;
  const monthlyRate = dec(rate.percent).dividedBy(100);
  const startDate = ctx.inputs.startDate as string | undefined;

  const equalPrincipal = r(principal.dividedBy(n));
  const schedule: ScheduleRow[] = [];
  const interests: Dec[] = [];
  let balance = principal;
  let totalInterest = dec(0);
  let principalPaid = dec(0);

  for (let period = 1; period <= n; period++) {
    const opening = balance;
    // Final period absorbs any rounding remainder so the balance closes at zero.
    const principalPart = period === n ? principal.minus(principalPaid) : equalPrincipal;
    const interest = r(model === "FLAT" ? principal.times(monthlyRate) : opening.times(monthlyRate));
    const installment = r(principalPart.plus(interest));
    balance = opening.minus(principalPart);
    principalPaid = principalPaid.plus(principalPart);
    totalInterest = totalInterest.plus(interest);
    interests.push(interest);
    schedule.push({
      period,
      dueDate: startDate ? addMonths(startDate, period) : null,
      openingBalance: m(opening),
      principal: m(principalPart),
      interest: m(interest),
      installment: m(installment),
      closingBalance: m(balance),
    });
  }
  totalInterest = r(totalInterest);
  const totalRepayable = r(principal.plus(totalInterest));
  const firstInstallment = schedule[0].installment;
  const lastInstallment = schedule[n - 1].installment;

  out.schedule = schedule;
  out.formula =
    model === "FLAT"
      ? "principalComponent = principal / months; interest = principal × monthlyRate; installment = principalComponent + interest"
      : "principalComponent = principal / months; interest_t = openingBalance_t × monthlyRate; installment_t = principalComponent + interest_t";
  out.steps = [
    { label: "Equal principal component", expression: `${m(principal)} / ${n}`, result: m(principal.dividedBy(n)) },
    model === "FLAT"
      ? { label: "Monthly interest", expression: `${m(principal)} × ${monthlyRate}`, result: m(principal.times(monthlyRate)) }
      : { label: "First month interest", expression: `${m(principal)} × ${monthlyRate} (declines with balance)`, result: schedule[0].interest },
    { label: "Total interest", expression: model === "FLAT" ? `${schedule[0].interest} × ${n}` : `Σ interest over ${n} periods`, result: m(totalInterest) },
    { label: "Total repayable", expression: `${m(principal)} + ${m(totalInterest)}`, result: m(totalRepayable) },
  ];
  out.summary = [
    { key: "principal", label: "Principal", value: m(principal), kind: "money" },
    { key: "rate", label: "Monthly rate", value: `${rate.percent}% per month`, kind: "text" },
    { key: "tenor", label: "Tenor", value: `${n} months`, kind: "text" },
    { key: "interestModel", label: "Repayment plan", value: model === "FLAT" ? "Equal monthly" : "Declining (reducing balance)", kind: "text" },
    { key: "grossInterest", label: "Total interest", value: m(totalInterest), kind: "money" },
    { key: "tax", label: "Tax / deductions", value: "0.00", kind: "money" },
    {
      key: "installment",
      label: model === "FLAT" ? "Monthly installment" : "Installment (first → last)",
      value: model === "FLAT" && firstInstallment === lastInstallment ? firstInstallment : `${firstInstallment} → ${lastInstallment}`,
      kind: model === "FLAT" && firstInstallment === lastInstallment ? "money" : "text",
    },
    { key: "totalRepayable", label: "Total repayable", value: m(totalRepayable), kind: "money", emphasis: true },
  ];
  out.lineItems = [
    { sequence: 1, label: "Principal", amount: m(principal), type: "PRINCIPAL", explanation: "Amount disbursed." },
    { sequence: 2, label: "Total interest", amount: m(totalInterest), type: "INTEREST", explanation: `${rate.percent}% per month, ${model === "FLAT" ? "flat on original principal" : "on reducing balance"}.` },
    ...schedule.map((row, i) => ({
      sequence: 3 + i,
      label: `Installment ${row.period}`,
      amount: row.installment,
      type: "INSTALLMENT" as const,
      explanation: `Principal ${row.principal} + interest ${row.interest}.`,
    })),
    { sequence: 3 + n, label: "Total repayable", amount: m(totalRepayable), type: "PAYOUT", explanation: "Principal + total interest." },
  ];

  if (!applyLoanDeductions(ctx, out, principal, totalInterest, totalRepayable, r)) return out;
  if (!applyLatePenalty(ctx, out, dec(schedule[0].installment), "first installment", r)) return out;

  if (eligibility) {
    out.summary.unshift(
      { key: "netSalary", label: "Net monthly salary", value: m(eligibility.salary), kind: "money" },
      { key: "minimumNetSalary", label: "Corridor minimum net salary", value: m(eligibility.minimum), kind: "money" },
      { key: "eligibility", label: "Pre-eligibility", value: "Eligible", kind: "text" },
    );
    out.steps.unshift({ label: "Pre-eligibility", expression: `${m(eligibility.salary)} ≥ ${m(eligibility.minimum)}`, result: "ELIGIBLE" });
    out.assumptions.unshift("Pre-eligibility: net monthly salary must be at least the corridor's minimum net salary (inclusive). MDA and corridor selection are configured elsewhere and not modelled.");
  }

  out.assumptions.push(
    "Principal is repaid in equal monthly components (source worked-example convention).",
    "Where principal does not divide evenly, the final installment absorbs the remainder.",
    "No insurance is included. A late-payment penalty is calculated only when days overdue and a penalty rate are entered.",
    roundingAssumption(ctx.rounding),
  );
  if (startDate) {
    out.assumptions.push("Installment due dates = disbursement date + n calendar months (clamped to month end).");
    for (const row of schedule) {
      const w = row.dueDate && dueDateWarning(`DUE_DATE_WEEKEND_${row.period}`, `Installment ${row.period} due date`, row.dueDate);
      if (w) out.warnings.push(w);
    }
  }
  out.warnings.push(...rateWarnings(ctx, rate.source));

  // Early settlement preview (provisional).
  const k = ctx.inputs.settleAfterInstallments as number | undefined;
  const feature = ctx.config.features.earlySettlement;
  if (k !== undefined && feature?.enabled) {
    if (k >= n) {
      out.status = "ERROR";
      out.errorCode = "VALIDATION_FAILED";
      out.fieldErrors.push({ field: "settleAfterInstallments", message: `Must be less than the tenor (${n} months).` });
    } else {
      const row = schedule[k];
      const remaining = dec(row.openingBalance);
      const currentInterest = interests[k];
      const payoff = r(remaining.plus(currentInterest));
      const interestPaid = interests.slice(0, k).reduce((a, b) => a.plus(b), dec(0));
      const waived = r(totalInterest.minus(interestPaid).minus(currentInterest));
      const es: SecondaryAnalysis = {
        key: "earlySettlement",
        title: "Early settlement preview",
        status: "CALCULATED",
        ruleStatus: feature.ruleStatus,
        message: feature.note,
        summary: [
          { key: "installmentsPaid", label: "Installments paid", value: `${k} of ${n}`, kind: "text" },
          { key: "remainingPrincipal", label: "Remaining principal", value: m(remaining), kind: "money" },
          { key: "currentInterest", label: "Current month interest", value: m(currentInterest), kind: "money" },
          { key: "interestWaived", label: "Future interest waived", value: m(waived), kind: "money" },
          { key: "payoff", label: "Payoff amount", value: m(payoff), kind: "money", emphasis: true },
        ],
        steps: [
          { label: "Remaining principal", expression: `${m(principal)} − principal repaid in ${k} installments`, result: m(remaining) },
          {
            label: "Current month interest",
            expression: model === "FLAT" ? `${m(principal)} × ${monthlyRate}` : `${m(remaining)} × ${monthlyRate}`,
            result: m(currentInterest),
          },
          { label: "Payoff", expression: `${m(remaining)} + ${m(currentInterest)}`, result: m(payoff) },
        ],
        lineItems: [
          { sequence: 1, label: "Remaining principal", amount: m(remaining), type: "BALANCE", explanation: `After ${k} installments.` },
          { sequence: 2, label: "Current month interest", amount: m(currentInterest), type: "INTEREST", explanation: "Interest for the active month." },
          { sequence: 3, label: "Payoff amount", amount: m(payoff), type: "PAYOUT", explanation: "No early repayment penalty (loan specification)." },
        ],
      };
      out.secondary.push(es);
    }
  }

  return out;
};
