import { addDays } from "../dates";
import { componentRounder, dec, type Dec, toPercentString } from "../money";
import type { ScheduleRow, SummaryEntry } from "../types";
import { type CalculatorStrategy, emptyOutput, m, rateWarnings, resolveFlatRate, roundingAssumption, type StrategyOutput } from "./shared";

function fieldError(out: StrategyOutput, field: string, message: string): StrategyOutput {
  out.status = "ERROR";
  out.errorCode = "VALIDATION_FAILED";
  out.fieldErrors.push({ field, message });
  return out;
}

const naira = (v: Dec) => `₦${Number(v.toFixed(2)).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * RWIN — Rosabon Wealth Investment Note (RWIN-1.0).
 * Open-ended plan, flat annual rate on every amount, simple interest accruing daily:
 *   daily interest = end-of-day balance × rate ÷ 365
 * Interest is paid every 90 days from the start date (start + 90, + 180, ...), or reinvested
 * into the balance if the customer chooses. Top-ups merge into the single balance.
 * Day d's events (a top-up or a 90-day payout) count from day d + 1.
 */
export const rwin: CalculatorStrategy = (ctx) => {
  const out = emptyOutput();
  const rwinCfg = ctx.config.rwin;
  const whtPercent = ctx.config.tax?.withholdingTaxPercent;
  const rate = resolveFlatRate(ctx);
  if (!rwinCfg || !whtPercent || !rate) {
    return { ...out, status: "BLOCKED", errorCode: "CONFIGURATION_UNAVAILABLE", message: "RWIN rate or tax configuration is missing." };
  }

  const principal = dec(ctx.inputs.principal as string);
  const days = Number(ctx.inputs.daysHeld);
  const reinvest = ctx.inputs.interestOption === "REINVEST";
  const valueDate = ctx.inputs.valueDate as string | undefined;
  const topUpAmount = ctx.inputs.topUpAmount !== undefined ? dec(ctx.inputs.topUpAmount as string) : null;
  const topUpDay = ctx.inputs.topUpDay as number | undefined;

  if (topUpAmount && topUpDay === undefined) return fieldError(out, "topUpDay", "Enter the day the top-up lands.");
  if (topUpDay !== undefined && !topUpAmount) return fieldError(out, "topUpAmount", "Enter the top-up amount.");
  if (topUpDay !== undefined && topUpDay >= days) return fieldError(out, "topUpDay", `Must be before the end of the projection (day ${days}).`);

  out.rateSource = rate.source;
  const r = componentRounder(ctx.rounding);
  const annualRate = dec(rate.percent).dividedBy(100);
  const whtRate = dec(whtPercent).dividedBy(100);
  const basis = rwinCfg.dayCountBasis;
  const cycle = rwinCfg.payoutCycleDays;
  const dateOf = (day: number) => (valueDate ? addDays(valueDate, day) : null);

  // Interest for days (from, to] on a balance held throughout.
  const interestFor = (amount: Dec, from: number, to: number) => amount.times(annualRate).times(to - from).dividedBy(basis);

  let balance = principal;
  let totalGross = dec(0);
  let totalWht = dec(0);
  let paidOut = dec(0);
  let reinvested = dec(0);
  const schedule: ScheduleRow[] = [];
  const steps: StrategyOutput["steps"] = [];

  for (let start = 0, n = 1; start + cycle <= days; start += cycle, n++) {
    const end = start + cycle;
    const opening = balance;
    let gross = interestFor(opening, start, end);
    let added = dec(0);
    let expression = `${m(opening)} × ${annualRate} × ${cycle} ÷ ${basis}`;
    if (topUpAmount && topUpDay !== undefined && topUpDay > start && topUpDay <= end) {
      gross = gross.plus(interestFor(topUpAmount, topUpDay, end));
      added = topUpAmount;
      if (topUpDay < end) expression += ` + ${m(topUpAmount)} × ${annualRate} × ${end - topUpDay} ÷ ${basis}`;
    }
    gross = r(gross);
    const wht = r(gross.times(whtRate));
    const net = r(gross.minus(wht));
    totalGross = totalGross.plus(gross);
    totalWht = totalWht.plus(wht);
    balance = balance.plus(added);
    if (reinvest) {
      balance = balance.plus(net);
      reinvested = reinvested.plus(net);
    } else {
      paidOut = paidOut.plus(net);
    }
    schedule.push({ period: n, dueDate: dateOf(end), openingBalance: m(opening), principal: m(added), interest: m(gross), installment: m(net), closingBalance: m(balance) });
    steps.push({ label: `Cycle ${n} interest (days ${start + 1}–${end})`, expression, result: `${m(gross)} gross, ${m(net)} net ${reinvest ? "reinvested" : "paid"}` });
  }

  // Interest accrued since the last payout date, not yet paid.
  const lastPayout = Math.floor(days / cycle) * cycle;
  let accrued = interestFor(balance, lastPayout, days);
  if (topUpAmount && topUpDay !== undefined && topUpDay > lastPayout) {
    accrued = accrued.plus(interestFor(topUpAmount, topUpDay, days));
    balance = balance.plus(topUpAmount);
  }
  accrued = r(accrued);
  const accruedWht = r(accrued.times(whtRate));
  const accruedNet = r(accrued.minus(accruedWht));
  const position = r(balance.plus(accruedNet));
  if (days > lastPayout) {
    steps.push({
      label: `Accrued since day ${lastPayout} (not yet paid)`,
      expression: `balance × ${annualRate} × ${days - lastPayout} ÷ ${basis}`,
      result: m(accrued),
    });
  }

  const ratePct = `${toPercentString(dec(rate.percent))}% p.a.`;
  const summary: SummaryEntry[] = [
    { key: "principal", label: "Amount invested", value: m(principal), kind: "money" },
    { key: "rate", label: "Annual rate (flat, all amounts)", value: ratePct, kind: "text" },
    { key: "interestOption", label: "90-day interest", value: reinvest ? "Reinvested into the balance" : "Paid out", kind: "text" },
    { key: "daysHeld", label: "Projection", value: `${days} days`, kind: "text" },
  ];
  if (valueDate) {
    summary.push({ key: "lockEnds", label: `Lock ends (first ${rwinCfg.lockDays} days)`, value: addDays(valueDate, rwinCfg.lockDays), kind: "text" });
    summary.push({ key: "nextPayoutDate", label: "Next payout date after projection", value: addDays(valueDate, lastPayout + cycle), kind: "text" });
  }
  if (topUpAmount) summary.push({ key: "topUpAmount", label: `Top-up (day ${topUpDay})`, value: m(topUpAmount), kind: "money" });
  summary.push(
    { key: "grossInterest", label: "Gross interest paid at 90-day payouts", value: m(totalGross), kind: "money" },
    { key: "tax", label: `WHT (${whtPercent}%)`, value: m(totalWht), kind: "money" },
    reinvest
      ? { key: "netInterest", label: "Net interest reinvested", value: m(reinvested), kind: "money" }
      : { key: "netInterest", label: "Net interest paid out", value: m(paidOut), kind: "money" },
    { key: "balance", label: `Plan balance on day ${days}`, value: m(balance), kind: "money" },
    { key: "accruedInterest", label: `Interest accrued since day ${lastPayout} (gross, unpaid)`, value: m(accrued), kind: "money" },
    { key: "accruedNetInterest", label: "Accrued interest after WHT", value: m(accruedNet), kind: "money" },
    { key: "position", label: `Value on day ${days} (balance + net accrued)`, value: m(position), kind: "money", emphasis: true },
  );

  out.summary = summary;
  out.schedule = schedule;
  out.scheduleLabels = { period: "Cycle", dueDate: "Payout date", principal: "Top-up", interest: "Gross interest", installment: reinvest ? "Net reinvested" : "Net paid out" };
  out.steps = [
    { label: "Daily interest", expression: `end-of-day balance × ${annualRate} ÷ ${basis}`, result: `${m(principal.times(annualRate).dividedBy(basis))} per day on ${m(principal)}` },
    ...steps,
  ];
  out.lineItems = [
    { sequence: 1, label: "Amount invested", amount: m(principal), type: "PRINCIPAL", explanation: `Minimum ${naira(dec(ctx.config.minimumPrincipal ?? "0"))}; no maximum.` },
    ...(topUpAmount ? [{ sequence: 2, label: "Top-up", amount: m(topUpAmount), type: "PRINCIPAL" as const, explanation: `Merged into the balance on day ${topUpDay}; earns from the next day at the same rate.` }] : []),
    { sequence: 3, label: "Gross interest (paid cycles)", amount: m(totalGross), type: "INTEREST", explanation: `${ratePct}, simple, accruing daily; paid every ${cycle} days.` },
    { sequence: 4, label: "Withholding tax", amount: m(totalWht), type: "TAX", explanation: `${whtPercent}% of each payout's interest.` },
    { sequence: 5, label: reinvest ? "Net interest reinvested" : "Net interest paid out", amount: m(reinvest ? reinvested : paidOut), type: reinvest ? "INTEREST" : "PAYOUT", explanation: reinvest ? "Added to the balance at each payout date; earns from the next day." : "Paid to the customer at each payout date." },
    { sequence: 6, label: "Interest accrued, not yet paid", amount: m(accrued), type: "INTEREST", explanation: `Days ${lastPayout + 1}–${days}; paid at the next payout date.` },
  ];
  out.formula = `daily interest = end-of-day balance × annualRate ÷ ${basis}; payout every ${cycle} days = Σ daily interest; WHT ${whtPercent}%; reinvested interest joins the balance`;

  if (days < rwinCfg.lockDays) {
    out.warnings.push({ code: "RWIN_LOCKED", severity: "INFO", message: `The first ${rwinCfg.lockDays} days of every RWIN investment are locked; the customer cannot withdraw before day ${rwinCfg.lockDays}.` });
  }
  out.assumptions.push(
    `No maturity date: the plan runs until full withdrawal. Payout dates are the start date + ${cycle} days, then every ${cycle} days, on a fixed ${basis}-day basis.`,
    "Interest for a 90-day cycle is the sum of the daily accruals at full precision, rounded once when paid.",
    "A top-up or reinvested payout made on day d earns from day d + 1.",
    `${whtPercent}% WHT is deducted from each interest payment, and the net amount is what is reinvested (RWIN-R7, to confirm).`,
    "The value on the last day shows balance + accrued net interest; how accrued interest is paid on a full withdrawal is not yet specified.",
    roundingAssumption(ctx.rounding),
  );
  out.warnings.push(...rateWarnings(ctx, rate.source));
  return out;
};
