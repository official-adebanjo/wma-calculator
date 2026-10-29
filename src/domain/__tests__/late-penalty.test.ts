import { describe, expect, it } from "vitest";
import { calculate } from "../calculate";
import { getProduct } from "../config/products";
import { D, dec } from "../money";
import type { CalculationResult } from "../types";

/** Late-payment penalty interest on loans (RFS rule, 2026-10-29). Expected values are derived independently. */
const NOW = new Date("2026-10-29T12:00:00Z");
const run = (code: string, inputs: Record<string, unknown>) => calculate(code, inputs, {}, { now: NOW, calculationId: "t" });
const penalty = (r: CalculationResult) => {
  const a = r.secondary.find((s) => s.key === "latePenalty");
  return a ? { ...a, values: Object.fromEntries(a.summary.map((s) => [s.key, s.value])) } : undefined;
};
const money = (v: InstanceType<typeof D>) => v.toDecimalPlaces(2, D.ROUND_HALF_UP).toFixed(2);

describe("late-payment penalty: simple, daily, on the overdue amount, 7-day cap", () => {
  it("Nano: defaults to the total repayable at maturity", () => {
    // ₦20,000 × 0.30% × 7 days = ₦420 interest → ₦20,420 due; 1%/day for 3 days = ₦612.60.
    const p = penalty(run("NANO", { principal: "20000", tenorDays: 7, daysOverdue: 3, penaltyRatePercentPerDay: "1" }))!;
    expect(p.status).toBe("CALCULATED");
    expect(p.values).toMatchObject({ overdueAmount: "20420.00", dailyPenalty: "204.20", daysCharged: "3 days", penalty: "612.60", totalDue: "21032.60" });
  });

  it("charges at most 7 days, however long the amount is overdue", () => {
    for (const days of [7, 8, 30, 365]) {
      const p = penalty(run("NANO", { principal: "20000", tenorDays: 7, daysOverdue: days, penaltyRatePercentPerDay: "1" }))!;
      expect(p.values.penalty).toBe("1429.40");
    }
    expect(penalty(run("NANO", { principal: "20000", tenorDays: 7, daysOverdue: 30, penaltyRatePercentPerDay: "1" }))!.values.daysCharged).toContain("7-day cap");
  });

  it("is charged on the overdue amount only (an entered amount), not on earlier penalty", () => {
    const p = penalty(run("PAYDAY", { monthlyIncome: "400000", principal: "200000", tenorDays: 15, daysOverdue: 5, penaltyRatePercentPerDay: "0.5", overdueAmount: "50000" }))!;
    // ₦50,000 × 0.5% × 5 = ₦1,250 (compounding would give more).
    expect(p.values).toMatchObject({ overdueAmount: "50000.00", penalty: "1250.00", totalDue: "51250.00" });
  });

  it.each(["PERSONAL", "PUBLIC_SECTOR"])("%s: defaults to the first installment", (code) => {
    const inputs: Record<string, unknown> = { principal: "1000000", tenorMonths: 12, interestModel: "FLAT", daysOverdue: 5, penaltyRatePercentPerDay: "0.5" };
    if (code === "PUBLIC_SECTOR") Object.assign(inputs, { netMonthlySalary: "300000", minimumNetSalary: "100000", monthlyRatePercent: "2" });
    const r = run(code, inputs);
    const first = dec(r.schedule[0].installment);
    expect(penalty(r)!.values).toMatchObject({ overdueAmount: first.toFixed(2), penalty: money(first.times("0.005").times(5)) });
  });

  it("is not calculated unless days overdue and a rate are entered", () => {
    expect(penalty(run("NANO", { principal: "20000", tenorDays: 7 }))).toBeUndefined();
    expect(run("NANO", { principal: "20000", tenorDays: 7, daysOverdue: 3 }).fieldErrors[0].field).toBe("penaltyRatePercentPerDay");
    expect(run("NANO", { principal: "20000", tenorDays: 7, penaltyRatePercentPerDay: "1" }).fieldErrors[0].field).toBe("daysOverdue");
  });

  it("applies to all loans and records that email communications take priority", () => {
    for (const code of ["NANO", "PAYDAY", "PERSONAL", "PUBLIC_SECTOR"]) {
      const v = getProduct(code)!.versions.find((x) => x.status === "ACTIVE")!;
      expect(v.latePenalty?.maxDays).toBe(7);
      expect(v.ruleNotes.find((n) => n.id === "LATE-R1")?.note).toContain("Email communications take priority");
    }
  });
});
