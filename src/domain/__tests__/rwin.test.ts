import { describe, expect, it } from "vitest";
import { calculate } from "../calculate";
import { getProduct } from "../config/products";
import { D, dec } from "../money";
import type { CalculationResult } from "../types";

/** RFS approved RWIN answers (A–B), 2026-10-29. Expected values are derived independently here. */
const NOW = new Date("2026-10-29T12:00:00Z");
const run = (inputs: Record<string, unknown>) => calculate("RWIN", { interestOption: "PAY_OUT", ...inputs }, {}, { now: NOW, calculationId: "t" });
const summary = (r: CalculationResult) => Object.fromEntries(r.summary.map((s) => [s.key, s.value]));
const money = (v: InstanceType<typeof D>) => v.toDecimalPlaces(2, D.ROUND_HALF_UP);
const daily = (amount: string, days: number) => dec(amount).times("0.14").times(days).dividedBy(365);
/** One payout: gross rounded at payment, 10% WHT, net. */
const payout = (gross: InstanceType<typeof D>) => {
  const g = money(gross);
  const wht = money(g.times("0.1"));
  return { gross: g, wht, net: g.minus(wht) };
};

describe("RWIN — flat 14% p.a., daily simple interest, 90-day payouts", () => {
  it("is active with the approved rules", () => {
    const p = getProduct("RWIN")!;
    expect(p.status).toBe("ACTIVE");
    const v = p.versions.find((x) => x.status === "ACTIVE")!;
    expect(v).toMatchObject({ id: "RWIN-1.0", ratePercent: "14", minimumPrincipal: "50000.00", maximumPrincipal: null });
    for (const id of ["RWIN-R1", "RWIN-R2", "RWIN-R4", "RWIN-R5", "RWIN-R6", "RWIN-R8"]) expect(v.ruleNotes.find((n) => n.id === id)?.status).toBe("CONFIRMED");
  });

  it("pays interest every 90 days; the rate does not depend on the amount", () => {
    for (const amount of ["50000", "1000000", "250000000"]) {
      const r = run({ principal: amount, daysHeld: 365 });
      const p = payout(daily(amount, 90));
      expect(r.schedule).toHaveLength(4);
      expect(r.schedule.map((s) => s.interest)).toEqual(Array(4).fill(p.gross.toFixed(2)));
      const s = summary(r);
      expect(s.rate).toBe("14% p.a.");
      expect(s.grossInterest).toBe(p.gross.times(4).toFixed(2));
      expect(s.netInterest).toBe(p.net.times(4).toFixed(2));
      expect(s.balance).toBe(dec(amount).toFixed(2));
      // Days 361–365 accrued, not yet paid.
      expect(s.accruedInterest).toBe(money(daily(amount, 5)).toFixed(2));
    }
  });

  it("reinvesting compounds only at each 90-day payout", () => {
    const r = run({ principal: "1000000", daysHeld: 180, interestOption: "REINVEST" });
    const c1 = payout(daily("1000000", 90));
    const bal1 = dec(1000000).plus(c1.net);
    const c2 = payout(bal1.times("0.14").times(90).dividedBy(365));
    expect(r.schedule[0]).toMatchObject({ installment: c1.net.toFixed(2), closingBalance: bal1.toFixed(2) });
    expect(r.schedule[1]).toMatchObject({ openingBalance: bal1.toFixed(2), interest: c2.gross.toFixed(2) });
    expect(summary(r)).toMatchObject({ netInterest: c1.net.plus(c2.net).toFixed(2), balance: bal1.plus(c2.net).toFixed(2) });
    expect(r.scheduleLabels?.installment).toBe("Net reinvested");
  });

  it("a top-up merges into the balance and earns from the next day at the same rate", () => {
    const r = run({ principal: "1000000", daysHeld: 90, topUpAmount: "500000", topUpDay: 30 });
    const p = payout(daily("1000000", 90).plus(daily("500000", 60)));
    expect(r.schedule[0]).toMatchObject({ principal: "500000.00", interest: p.gross.toFixed(2), closingBalance: "1500000.00" });
    expect(summary(r).balance).toBe("1500000.00");
  });

  it("payout dates are start + 90 days, then every 90 days, on a fixed 365-day basis", () => {
    // 2027-12-01 + 90 = 2028-02-29 (leap year); +180 = 2028-05-29.
    const r = run({ principal: "1000000", daysHeld: 200, valueDate: "2027-12-01" });
    expect(r.schedule.map((s) => s.dueDate)).toEqual(["2028-02-29", "2028-05-29"]);
    expect(r.schedule[0].interest).toBe(payout(daily("1000000", 90)).gross.toFixed(2));
    expect(summary(r)).toMatchObject({ lockEnds: "2027-12-31", nextPayoutDate: "2028-08-27" });
  });

  it("flags the 30-day lock and validates inputs", () => {
    expect(run({ principal: "1000000", daysHeld: 20 }).warnings.map((w) => w.code)).toContain("RWIN_LOCKED");
    expect(run({ principal: "1000000", daysHeld: 60 }).warnings.map((w) => w.code)).not.toContain("RWIN_LOCKED");
    expect(run({ principal: "49999.99", daysHeld: 90 }).status).toBe("ERROR");
    expect(run({ principal: "1000000", daysHeld: 90, topUpAmount: "1000" }).fieldErrors[0].field).toBe("topUpDay");
    expect(run({ principal: "1000000", daysHeld: 90, topUpAmount: "1000", topUpDay: 90 }).fieldErrors[0].field).toBe("topUpDay");
  });
});
