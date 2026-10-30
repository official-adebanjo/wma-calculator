import { describe, expect, it } from "vitest";
import { calculate } from "../calculate";
import { getProduct } from "../config/products";
import type { CalculationResult } from "../types";

/** Loan liquidation (RFS rule, 2026-10-30). Expected values are worked by hand. */
const NOW = new Date("2026-10-30T12:00:00Z");
const run = (code: string, inputs: Record<string, unknown>) => calculate(code, inputs, {}, { now: NOW, calculationId: "t" });
const sec = (r: CalculationResult, key: string) => {
  const a = r.secondary.find((s) => s.key === key);
  return a ? { ...a, values: Object.fromEntries(a.summary.map((s) => [s.key, s.value])) } : undefined;
};
// ₦6,000,000 over 6 months at 2%: ₦1,000,000 principal a month; after 2 installments ₦4,000,000 remains.
const base = { principal: "6000000", tenorMonths: 6, settleAfterInstallments: 2 };

describe("partial liquidation (Personal and Public Sector)", () => {
  it("equal monthly, same tenor: lower installments, interest on the reduced principal", () => {
    // ₦1,000,000 liquidated → ₦3,000,000 over 4 months: ₦750,000 + ₦60,000 interest.
    const p = sec(run("PERSONAL", { ...base, interestModel: "FLAT", liquidationAmount: "1000000", liquidationOption: "REDUCE_INSTALLMENT" }), "partialLiquidation")!;
    expect(p.status).toBe("CALCULATED");
    expect(p.values).toMatchObject({ newPrincipal: "3000000.00", monthsLeft: "4", newInstallment: "810000.00", interestBefore: "480000.00", interestAfter: "240000.00", interestSaved: "240000.00" });
    expect(p.lineItems.map((l) => l.amount)).toEqual(Array(4).fill("810000.00"));
  });

  it("equal monthly, shorter tenor: same monthly principal, fewer installments", () => {
    const p = sec(run("PERSONAL", { ...base, interestModel: "FLAT", liquidationAmount: "1000000", liquidationOption: "REDUCE_TENOR" }), "partialLiquidation")!;
    expect(p.values).toMatchObject({ monthsLeft: "3 (was 4)", newInstallment: "1060000.00", interestAfter: "180000.00", interestSaved: "300000.00" });
  });

  it("declining plan: interest on the reducing balance after liquidation", () => {
    // ₦3,000,000 over 4 months: interest 60,000 / 45,000 / 30,000 / 15,000 (was 80,000 / 60,000 / 40,000 / 20,000).
    const p = sec(run("PERSONAL", { ...base, interestModel: "REDUCING_BALANCE", liquidationAmount: "1000000", liquidationOption: "REDUCE_INSTALLMENT" }), "partialLiquidation")!;
    expect(p.values).toMatchObject({ newInstallment: "810000.00 → 765000.00", interestBefore: "200000.00", interestAfter: "150000.00", interestSaved: "50000.00" });
  });

  it("an odd remainder goes into the final installment", () => {
    const p = sec(run("PERSONAL", { ...base, interestModel: "FLAT", liquidationAmount: "1000000.01", liquidationOption: "REDUCE_TENOR" }), "partialLiquidation")!;
    expect(p.values.monthsLeft).toBe("3 (was 4)");
    expect(p.lineItems.at(-1)!.explanation).toContain("Principal 999999.99");
  });

  it("adds the optional fee (% of the amount liquidated) and defaults to lower installments", () => {
    const p = sec(run("PUBLIC_SECTOR", { ...base, interestModel: "FLAT", netMonthlySalary: "300000", minimumNetSalary: "100000", monthlyRatePercent: "2", liquidationAmount: "1000000", liquidationFeePercent: "1" }), "partialLiquidation")!;
    expect(p.values).toMatchObject({ liquidationFee: "10000.00", totalPaid: "1010000.00", option: "Same tenor, lower installments" });
  });

  it("validates the amount and the timing", () => {
    const tooMuch = run("PERSONAL", { ...base, interestModel: "FLAT", liquidationAmount: "4000000" });
    expect(tooMuch.fieldErrors[0].field).toBe("liquidationAmount");
    expect(tooMuch.fieldErrors[0].message).toContain("full liquidation");
    const noTiming = run("PERSONAL", { principal: "6000000", tenorMonths: 6, interestModel: "FLAT", liquidationAmount: "1000" });
    expect(noTiming.fieldErrors[0].field).toBe("settleAfterInstallments");
  });
});

describe("full liquidation", () => {
  it("payoff = remaining principal + current month's interest, plus the optional fee", () => {
    const f = sec(run("PERSONAL", { ...base, interestModel: "FLAT", liquidationFeePercent: "1" }), "earlySettlement")!;
    expect(f.values).toMatchObject({ payoff: "4120000.00", liquidationFee: "41200.00", totalPaid: "4161200.00" });
    expect(f.ruleStatus).toBe("CONFIRMED");
  });
});

describe("Nano and Payday: no liquidation", () => {
  it("offer no liquidation fields and record the rule", () => {
    for (const code of ["NANO", "PAYDAY"]) {
      const names = getProduct(code)!.fields.map((f) => f.name);
      for (const n of ["actualDaysUsed", "settleAfterInstallments", "liquidationAmount"]) expect(names).not.toContain(n);
    }
    expect(getProduct("PAYDAY")!.versions.find((v) => v.status === "ACTIVE")!.ruleNotes.find((n) => n.id === "LIQ-R1")?.note).toContain("No liquidation");
  });
});
