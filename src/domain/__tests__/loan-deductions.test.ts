import { describe, expect, it } from "vitest";
import { calculate } from "../calculate";
import { dec } from "../money";
import type { CalculationResult } from "../types";

const NOW = new Date("2026-10-28T12:00:00Z");
const run = (code: string, inputs: Record<string, unknown>) => calculate(code, inputs, {}, { now: NOW, calculationId: "t" });
const summary = (r: CalculationResult) => Object.fromEntries(r.summary.map((s) => [s.key, s.value]));

describe("loan deductions (management fee on principal, WHT on interest)", () => {
  it("Payday: ₦200,000 × 15 days, 1% fee, 10% WHT", () => {
    // interest 9,000; fee 2,000; WHT 900; disbursed 197,100; repayable unchanged 209,000
    const r = run("PAYDAY", { monthlyIncome: "400000", principal: "200000", tenorDays: 15, managementFeePercent: "1", withholdingTaxPercent: "10" });
    expect(r.status).toBe("CALCULATED");
    expect(summary(r)).toMatchObject({
      grossInterest: "9000.00",
      managementFee: "2000.00",
      tax: "900.00",
      totalDeductions: "2900.00",
      amountDisbursed: "197100.00",
      totalRepayable: "209000.00",
      costOfBorrowing: "11900.00",
    });
  });

  it("Nano: fee only", () => {
    const s = summary(run("NANO", { principal: "20000", tenorDays: 7, managementFeePercent: "1" }));
    expect(s).toMatchObject({ managementFee: "200.00", tax: "0.00", amountDisbursed: "19800.00", totalRepayable: "20420.00" });
  });

  it("Personal flat: WHT is on total interest over the whole tenor", () => {
    // interest 720,000; fee 60,000; WHT 72,000; disbursed 5,868,000
    const s = summary(run("PERSONAL", { principal: "6000000", tenorMonths: 6, interestModel: "FLAT", managementFeePercent: "1", withholdingTaxPercent: "10" }));
    expect(s).toMatchObject({ grossInterest: "720000.00", managementFee: "60000.00", tax: "72000.00", amountDisbursed: "5868000.00", totalRepayable: "6720000.00" });
  });

  it("Personal reducing balance uses the reducing total interest", () => {
    const s = summary(run("PERSONAL", { principal: "6000000", tenorMonths: 6, interestModel: "REDUCING_BALANCE", withholdingTaxPercent: "10" }));
    expect(s).toMatchObject({ grossInterest: "420000.00", tax: "42000.00", amountDisbursed: "5958000.00" });
  });

  it("blank fields apply nothing: disbursed equals principal", () => {
    const s = summary(run("PAYDAY", { monthlyIncome: "400000", principal: "200000", tenorDays: 15 }));
    expect(s).toMatchObject({ managementFee: "0.00", tax: "0.00", totalDeductions: "0.00", amountDisbursed: "200000.00", totalRepayable: "209000.00" });
  });

  it("accepts a trailing % sign and fractional rates", () => {
    const s = summary(run("NANO", { principal: "33333.33", tenorDays: 7, managementFeePercent: "1.25%" }));
    expect(s.managementFee).toBe("416.67"); // 33,333.33 × 1.25% = 416.666625 → 416.67
    expect(dec(s.amountDisbursed).plus(s.totalDeductions).toFixed(2)).toBe("33333.33");
  });

  it.each([
    ["101", "Maximum is 100%."],
    ["1.12345", "at most 4 decimal places"],
    ["-1", "at most 4 decimal places"],
    ["abc", "at most 4 decimal places"],
  ])("rejects fee %j", (pct, message) => {
    const r = run("NANO", { principal: "20000", tenorDays: 7, managementFeePercent: pct });
    expect(r.status).toBe("ERROR");
    expect(r.fieldErrors.find((e) => e.field === "managementFeePercent")?.message).toContain(message);
  });

  it("rejects deductions that leave nothing to disburse", () => {
    const r = run("NANO", { principal: "20000", tenorDays: 7, managementFeePercent: "100" });
    expect(r.status).toBe("ERROR");
    expect(r.summary).toEqual([]);
  });

  it("adds fee, tax and payout line items with contiguous numbering", () => {
    const r = run("PAYDAY", { monthlyIncome: "400000", principal: "200000", tenorDays: 15, managementFeePercent: "1", withholdingTaxPercent: "10" });
    expect(r.lineItems.map((l) => l.type)).toEqual(["PRINCIPAL", "FEE", "TAX", "PAYOUT", "INTEREST", "INSTALLMENT"]);
    expect(r.lineItems.map((l) => l.sequence)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("does not change the early-settlement amount", () => {
    const r = run("PAYDAY", { monthlyIncome: "400000", principal: "200000", tenorDays: 15, actualDaysUsed: 10, managementFeePercent: "1", withholdingTaxPercent: "10" });
    expect(Object.fromEntries(r.secondary[0].summary.map((s) => [s.key, s.value])).settlementAmount).toBe("206000.00");
  });

  it("income cap still applies to the principal applied for, not the disbursed amount", () => {
    expect(run("PAYDAY", { monthlyIncome: "400000", principal: "200000.01", tenorDays: 15, managementFeePercent: "1" }).status).toBe("ERROR");
  });

  it("investments are unaffected", () => {
    const r = run("RTN", { investorType: "INDIVIDUAL", principal: "1000000", tenorDays: "90", payoutOption: "MATURITY" });
    expect(summary(r).managementFee).toBeUndefined();
  });
});
