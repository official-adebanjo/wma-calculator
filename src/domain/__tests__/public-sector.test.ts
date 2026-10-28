import { describe, expect, it } from "vitest";
import { calculate, httpStatusFor } from "../calculate";
import { dec } from "../money";
import type { CalculationResult } from "../types";

const NOW = new Date("2026-10-28T12:00:00Z");
const base = {
  netMonthlySalary: "250000",
  minimumNetSalary: "100000",
  principal: "6000000",
  tenorMonths: 12,
  interestModel: "FLAT",
  monthlyRatePercent: "4",
};
const run = (inputs: Record<string, unknown> = {}, qa = {}) => calculate("PUBLIC_SECTOR", { ...base, ...inputs }, qa, { now: NOW, calculationId: "t" });
const summary = (r: CalculationResult) => Object.fromEntries(r.summary.map((s) => [s.key, s.value]));

describe("Public Sector Loan — pre-eligibility", () => {
  it("net salary exactly at the corridor minimum is eligible (inclusive)", () => {
    const r = run({ netMonthlySalary: "100000", minimumNetSalary: "100000" });
    expect(r.status).toBe("CALCULATED");
    expect(summary(r)).toMatchObject({ netSalary: "100000.00", minimumNetSalary: "100000.00", eligibility: "Eligible" });
    expect(r.steps[0]).toMatchObject({ label: "Pre-eligibility", result: "ELIGIBLE" });
  });

  it("one kobo below the minimum is not eligible and returns no figures", () => {
    const r = run({ netMonthlySalary: "99999.99", minimumNetSalary: "100000" });
    expect(r.status).toBe("ERROR");
    expect(r.errorCode).toBe("NOT_ELIGIBLE");
    expect(httpStatusFor(r)).toBe(422);
    expect(r.fieldErrors[0]).toMatchObject({ field: "netMonthlySalary" });
    expect(r.fieldErrors[0].message).toContain("₦100,000.00");
    expect(r.summary).toEqual([]);
    expect(r.schedule).toEqual([]);
  });
});

describe("Public Sector Loan — calculation (same as Personal Loan)", () => {
  it("equal monthly repayment: QA matrix LN-PUB-001", () => {
    const r = run();
    expect(summary(r)).toMatchObject({ installment: "740000.00", grossInterest: "2880000.00", totalRepayable: "8880000.00", rate: "4% per month" });
    expect(new Set(r.schedule.map((s) => s.installment))).toEqual(new Set(["740000.00"]));
  });

  it("declining repayment uses the opening balance each month", () => {
    const r = run({ interestModel: "REDUCING_BALANCE" });
    // Interest: 6,000,000 × 4% × (12 + 11 + … + 1) / 12 = 240,000 × 78 / 12 = 1,560,000
    expect(summary(r)).toMatchObject({ grossInterest: "1560000.00", totalRepayable: "7560000.00" });
    expect(r.schedule[0].installment).toBe("740000.00");
    expect(r.schedule[11].installment).toBe("520000.00");
  });

  it("gives the same figures as Personal Loan for the same rate", () => {
    const pub = run({ monthlyRatePercent: "2", tenorMonths: 6, interestModel: "REDUCING_BALANCE" });
    const per = calculate("PERSONAL", { principal: "6000000", tenorMonths: 6, interestModel: "REDUCING_BALANCE" }, {}, { now: NOW, calculationId: "p" });
    expect(pub.schedule).toEqual(per.schedule);
  });

  it("the rate is editable and marked as entered, not configured", () => {
    const r = run({ monthlyRatePercent: "3.5" });
    expect(r.rateSource).toBe("ENTERED");
    expect(r.warnings.map((w) => w.code)).toContain("RATE_ENTERED");
    expect(summary(r).grossInterest).toBe(dec("6000000").times("0.035").times(12).toFixed(2));
  });

  it("disbursement deducts management fee (on principal) and editable WHT (on interest)", () => {
    // Fee 1% × 6,000,000 = 60,000; WHT 10% × 2,880,000 = 288,000; disbursed 5,652,000.
    const s = summary(run({ managementFeePercent: "1", withholdingTaxPercent: "10" }));
    expect(s).toMatchObject({ managementFee: "60000.00", tax: "288000.00", totalDeductions: "348000.00", amountDisbursed: "5652000.00", totalRepayable: "8880000.00" });
  });

  it("tenor follows Personal Loan: 3–24 months", () => {
    expect(run({ tenorMonths: 2 }).fieldErrors[0].field).toBe("tenorMonths");
    expect(run({ tenorMonths: 25 }).fieldErrors[0].field).toBe("tenorMonths");
    expect(run({ tenorMonths: 24 }).status).toBe("CALCULATED");
  });

  it("early settlement preview: same payoff as Personal Loan, no penalty", () => {
    // After 2 of 12 equal installments: remaining 5,000,000 + current month's interest 240,000.
    const r = run({ settleAfterInstallments: 2 });
    const es = Object.fromEntries(r.secondary[0].summary.map((s) => [s.key, s.value]));
    expect(es).toMatchObject({ remainingPrincipal: "5000000.00", currentInterest: "240000.00", payoff: "5240000.00" });
    expect(r.secondary[0].message).toContain("No penalty");
  });
});
