import { addDays } from "../dates";
import { componentRounder, dec, type Dec, toPercentString } from "../money";
import type { LineItem, ScheduleRow, SummaryEntry } from "../types";
import { type CalculatorStrategy, emptyOutput, m, rateWarnings, resolveFlatRate, roundingAssumption, type StrategyOutput } from "./shared";

function fieldError(out: StrategyOutput, field: string, message: string): StrategyOutput {
  out.status = "ERROR";
  out.errorCode = "VALIDATION_FAILED";
  out.fieldErrors.push({ field, message });
  // An error must never carry plausible-looking figures.
  for (const list of [out.summary, out.lineItems, out.steps, out.schedule, out.secondary, out.assumptions]) list.length = 0;
  return out;
}

const naira = (v: Dec) => `₦${Number(v.toFixed(2)).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * RWIN — Rosabon Wealth Investment Note (RWIN-1.1).
 * Open-ended plan from the funds-confirmed date (day 0), flat annual rate, simple interest:
 *   daily interest = end-of-day balance × rate ÷ 365
 * Every 90 days the accrued interest is paid, less 10% WHT; with reinvestment on, the net
 * amount joins the balance. Top-ups and withdrawals change that day's end-of-day balance.
 * After the 30-day lock: partial withdrawal (must leave the minimum) or full liquidation
 * (balance + accrued interest − WHT), no penalty.
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
  const minimum = dec(ctx.config.minimumPrincipal ?? "0");
  const daysHeld = Number(ctx.inputs.daysHeld);
  const reinvest = ctx.inputs.interestOption === "REINVEST";
  const valueDate = ctx.inputs.valueDate as string | undefined;
  const topUpAmount = ctx.inputs.topUpAmount !== undefined ? dec(ctx.inputs.topUpAmount as string) : null;
  const topUpDay = ctx.inputs.topUpDay as number | undefined;
  const withdrawalDay = ctx.inputs.withdrawalDay as number | undefined;
  const partialAmount = ctx.inputs.withdrawalAmount !== undefined ? dec(ctx.inputs.withdrawalAmount as string) : null;
  const fullLiquidation = withdrawalDay !== undefined && !partialAmount;
  const lock = rwinCfg.lockDays;
  const cycle = rwinCfg.payoutCycleDays;
  const dateOf = (day: number) => (valueDate ? addDays(valueDate, day) : null);

  if (topUpAmount && topUpDay === undefined) return fieldError(out, "topUpDay", "Enter the day the top-up lands.");
  if (topUpDay !== undefined && !topUpAmount) return fieldError(out, "topUpAmount", "Enter the top-up amount.");
  if (partialAmount && withdrawalDay === undefined) return fieldError(out, "withdrawalDay", "Enter the day of the withdrawal.");
  if (withdrawalDay !== undefined && withdrawalDay < lock) {
    const until = dateOf(lock);
    return fieldError(out, "withdrawalDay", `The first ${lock} days are locked; the earliest withdrawal is day ${lock}${until ? ` (${until})` : ""}.`);
  }
  if (withdrawalDay !== undefined && withdrawalDay > daysHeld) return fieldError(out, "withdrawalDay", `Must be within the projection (day ${daysHeld} or earlier).`);
  // Full liquidation closes the plan, so the projection ends that day.
  const end = fullLiquidation ? withdrawalDay : daysHeld;
  if (topUpDay !== undefined && topUpDay > end) {
    return fieldError(out, "topUpDay", fullLiquidation ? `Must be on or before the full liquidation (day ${end}).` : `Must be within the projection (day ${end} or earlier).`);
  }

  out.rateSource = rate.source;
  const r = componentRounder(ctx.rounding);
  const annualRate = dec(rate.percent).dividedBy(100);
  const whtRate = dec(whtPercent).dividedBy(100);
  const basis = rwinCfg.dayCountBasis;
  const daily = (v: Dec) => v.times(annualRate).dividedBy(basis);

  let balance = principal;
  let accrued = dec(0); // gross, since the last payout, at full precision
  let totalGross = dec(0);
  let totalWht = dec(0);
  let paidOut = dec(0);
  let reinvested = dec(0);
  let cycleOpening = principal;
  let cycleChange = dec(0);
  let lastPayout = 0;
  const schedule: ScheduleRow[] = [];
  const cycleSteps: StrategyOutput["steps"] = [];

  for (let day = 0; day <= end; day++) {
    // 1. Payout of the interest accrued over the cycle just ended.
    if (day > 0 && day % cycle === 0) {
      const gross = r(accrued);
      const wht = r(gross.times(whtRate));
      const net = r(gross.minus(wht));
      totalGross = totalGross.plus(gross);
      totalWht = totalWht.plus(wht);
      if (reinvest) {
        balance = balance.plus(net);
        reinvested = reinvested.plus(net);
      } else {
        paidOut = paidOut.plus(net);
      }
      const n = day / cycle;
      schedule.push({ period: n, dueDate: dateOf(day), openingBalance: m(cycleOpening), principal: m(cycleChange), interest: m(gross), installment: m(net), closingBalance: m(balance) });
      cycleSteps.push({ label: `Payout ${n} (day ${day})`, expression: `Σ daily interest, days ${day - cycle}–${day - 1}; WHT ${whtPercent}%`, result: `${m(gross)} gross, ${m(net)} net ${reinvest ? "reinvested" : "paid"}` });
      accrued = dec(0);
      cycleOpening = balance;
      cycleChange = dec(0);
      lastPayout = day;
    }
    // 2. Balance changes on this day (top-up first, then withdrawal).
    if (topUpAmount && day === topUpDay) {
      balance = balance.plus(topUpAmount);
      cycleChange = cycleChange.plus(topUpAmount);
    }
    if (partialAmount && day === withdrawalDay) {
      const remaining = balance.minus(partialAmount);
      if (remaining.lt(minimum)) {
        const max = balance.minus(minimum);
        return fieldError(
          out,
          "withdrawalAmount",
          `The plan balance on day ${day} is ${naira(balance)}; this leaves ${naira(remaining.gt(0) ? remaining : dec(0))}, below the ${naira(minimum)} minimum. ${max.gt(0) ? `Withdraw at most ${naira(max)}, or ` : ""}leave the amount blank for full liquidation.`,
        );
      }
      balance = remaining;
      cycleChange = cycleChange.minus(partialAmount);
    }
    // 3. Accrue on the end-of-day balance (nothing on the day the plan is liquidated or the projection ends).
    if (day < end) accrued = accrued.plus(daily(balance));
  }

  const accruedGross = r(accrued);
  const accruedWht = r(accruedGross.times(whtRate));
  const accruedNet = r(accruedGross.minus(accruedWht));
  const position = r(balance.plus(accruedNet));

  const ratePct = `${toPercentString(dec(rate.percent))}% p.a.`;
  const summary: SummaryEntry[] = [
    { key: "principal", label: "Amount invested", value: m(principal), kind: "money" },
    { key: "rate", label: "Annual rate (flat, all amounts)", value: ratePct, kind: "text" },
    { key: "interestOption", label: "Reinvestment toggle", value: reinvest ? "On: net interest added to the balance" : "Off: interest paid out", kind: "text" },
    { key: "daysHeld", label: fullLiquidation ? "Plan length" : "Projection", value: `${end} days`, kind: "text" },
  ];
  if (valueDate) {
    summary.push({ key: "lockEnds", label: `Lock ends (first ${lock} days)`, value: addDays(valueDate, lock), kind: "text" });
    if (!fullLiquidation) summary.push({ key: "nextPayoutDate", label: "Next payout date after projection", value: addDays(valueDate, lastPayout + cycle), kind: "text" });
  }
  if (topUpAmount) summary.push({ key: "topUpAmount", label: `Top-up (day ${topUpDay})`, value: m(topUpAmount), kind: "money" });
  if (partialAmount) summary.push({ key: "partialWithdrawal", label: `Partial withdrawal (day ${withdrawalDay}, no penalty)`, value: m(partialAmount), kind: "money" });
  summary.push(
    { key: "grossInterest", label: "Gross interest at 90-day payouts", value: m(totalGross), kind: "money" },
    { key: "tax", label: `WHT at payouts (${whtPercent}%)`, value: m(totalWht), kind: "money" },
    reinvest
      ? { key: "netInterest", label: "Net interest reinvested", value: m(reinvested), kind: "money" }
      : { key: "netInterest", label: "Net interest paid out", value: m(paidOut), kind: "money" },
    { key: "balance", label: `Plan balance on day ${end}`, value: m(balance), kind: "money" },
    { key: "accruedInterest", label: `Interest accrued since day ${lastPayout} (gross)`, value: m(accruedGross), kind: "money" },
    { key: "accruedTax", label: `WHT on accrued interest (${whtPercent}%)`, value: m(accruedWht), kind: "money" },
    fullLiquidation
      ? { key: "position", label: `Full liquidation payout (day ${end})`, value: m(position), kind: "money", emphasis: true }
      : { key: "position", label: `Value on day ${end} (full liquidation that day)`, value: m(position), kind: "money", emphasis: true },
  );

  const lineItems: LineItem[] = [
    { sequence: 0, label: "Amount invested", amount: m(principal), type: "PRINCIPAL", explanation: `Minimum ${naira(minimum)}; no maximum. Accrues from the funds-confirmed date.` },
  ];
  if (topUpAmount) lineItems.push({ sequence: 0, label: "Top-up", amount: m(topUpAmount), type: "PRINCIPAL", explanation: `Joins the balance on day ${topUpDay} at the same rate.` });
  if (partialAmount) lineItems.push({ sequence: 0, label: "Partial withdrawal", amount: m(partialAmount), type: "PAYOUT", explanation: `Day ${withdrawalDay}, no penalty. Interest accrued so far stays in the plan until the next payout.` });
  lineItems.push(
    { sequence: 0, label: "Gross interest at payouts", amount: m(totalGross), type: "INTEREST", explanation: `${ratePct}, simple, accruing daily; paid every ${cycle} days.` },
    { sequence: 0, label: "WHT at payouts", amount: m(totalWht), type: "TAX", explanation: `${whtPercent}% of each payout, also when reinvested.` },
    { sequence: 0, label: reinvest ? "Net interest reinvested" : "Net interest paid out", amount: m(reinvest ? reinvested : paidOut), type: reinvest ? "INTEREST" : "PAYOUT", explanation: reinvest ? "Added to the balance at each payout; earns from that day." : "Paid to the customer at each payout." },
    { sequence: 0, label: "Accrued interest (gross)", amount: m(accruedGross), type: "INTEREST", explanation: `Days ${lastPayout}–${end - 1}, since the last payout.` },
    { sequence: 0, label: "WHT on accrued interest", amount: m(accruedWht), type: "TAX", explanation: `${whtPercent}%, deducted when the accrued interest is paid.` },
    { sequence: 0, label: fullLiquidation ? "Full liquidation payout" : `Value on day ${end}`, amount: m(position), type: "PAYOUT", explanation: "Plan balance + accrued interest − WHT; no penalty." },
  );
  lineItems.forEach((l, i) => (l.sequence = i + 1));

  out.summary = summary;
  out.lineItems = lineItems;
  out.schedule = schedule;
  out.scheduleLabels = { period: "Payout", dueDate: "Payout date", principal: "Top-up / withdrawal", interest: "Gross interest", installment: reinvest ? "Net reinvested" : "Net paid out" };
  out.steps = [
    { label: "Daily interest", expression: `end-of-day balance × ${annualRate} ÷ ${basis}`, result: `${m(daily(principal))} per day on ${m(principal)}` },
    ...cycleSteps,
    { label: `Accrued since day ${lastPayout}`, expression: `Σ daily interest, days ${lastPayout}–${end - 1}`, result: m(accruedGross) },
    { label: fullLiquidation ? "Full liquidation payout" : `Value on day ${end}`, expression: `${m(balance)} + ${m(accruedGross)} − ${m(accruedWht)} WHT`, result: m(position) },
  ];
  out.formula = `daily interest = end-of-day balance × annualRate ÷ ${basis}; every ${cycle} days: interest − ${whtPercent}% WHT paid or reinvested; full liquidation = balance + accrued − WHT`;

  if (end < lock && !fullLiquidation) {
    out.warnings.push({ code: "RWIN_LOCKED", severity: "INFO", message: `The first ${lock} days are locked; the customer cannot withdraw before day ${lock}. The value shown is not yet withdrawable.` });
  }
  out.assumptions.push(
    `Day 0 is the funds-confirmed date; interest accrues from that day. No maturity, rollover or premature-exit penalty. Payouts fall every ${cycle} days on a fixed ${basis}-day basis.`,
    "A top-up, withdrawal or reinvested payout changes that day's end-of-day balance, so it earns (or stops earning) from that day.",
    "Daily interest is summed at full precision and rounded once when paid (at a payout or on liquidation).",
    "The reinvestment toggle is assumed to stay the same for the whole projection.",
    roundingAssumption(ctx.rounding),
  );
  out.warnings.push(...rateWarnings(ctx, rate.source));
  return out;
};
