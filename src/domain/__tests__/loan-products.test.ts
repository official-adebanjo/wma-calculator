import { describe, expect, it } from "vitest";
import { calculate } from "../calculate";
import { getProduct, PRODUCTS } from "../config/products";
import type { CalculationResult } from "../types";

const NOW = new Date("2026-10-28T12:00:00Z");
const run = (code: string, inputs: Record<string, unknown>) => calculate(code, inputs, {}, { now: NOW, calculationId: "t" });
const summary = (r: CalculationResult) => Object.fromEntries(r.summary.map((s) => [s.key, s.value]));

describe("loan product structure", () => {
  it("has exactly four loan products: Nano, Payday, Personal and Public Sector", () => {
    const loans = PRODUCTS.filter((p) => p.category === "LOAN").map((p) => [p.code, p.name]);
    expect(loans).toEqual([
      ["NANO", "Nano Loan"],
      ["PAYDAY", "Payday Loan"],
      ["PERSONAL", "Personal Loan"],
      ["PUBLIC_SECTOR", "Public Sector Loan"],
    ]);
  });

  it("Personal Loan offers equal monthly or declining repayment plans", () => {
    const field = getProduct("PERSONAL")!.fields.find((f) => f.name === "interestModel");
    expect(field?.kind === "select" && field.label).toBe("Repayment plan");
    expect(field?.kind === "select" && field.options.map((o) => o.label)).toEqual(["Equal monthly repayment", "Declining (reducing balance) repayment"]);
  });

  it("equal monthly plan: every installment is the same", () => {
    const r = run("PERSONAL", { principal: "6000000", tenorMonths: 6, interestModel: "FLAT" });
    expect(new Set(r.schedule.map((s) => s.installment))).toEqual(new Set(["1120000.00"]));
    expect(summary(r).interestModel).toBe("Equal monthly");
  });

  it("declining plan: installments fall each month", () => {
    const r = run("PERSONAL", { principal: "6000000", tenorMonths: 6, interestModel: "REDUCING_BALANCE" });
    const inst = r.schedule.map((s) => Number(s.installment));
    expect(inst.every((v, i) => i === 0 || v < inst[i - 1])).toBe(true);
    expect(summary(r).interestModel).toBe("Declining (reducing balance)");
  });

  it("old PERSONAL_PRIVATE code (saved scenarios) resolves to Personal Loan", () => {
    const r = run("PERSONAL_PRIVATE", { principal: "6000000", tenorMonths: 6, interestModel: "FLAT" });
    expect(r.status).toBe("CALCULATED");
    expect(r.productCode).toBe("PERSONAL");
    expect(r.configVersionId).toBe("PERSONAL-1.2");
  });

  it("keeps earlier private-sector config versions for reproducing saved scenarios", () => {
    const ids = getProduct("PERSONAL")!.versions.map((v) => `${v.id}:${v.status}`);
    expect(ids).toEqual(["PERSONAL_PRIVATE-1.0:RETIRED", "PERSONAL_PRIVATE-1.1:RETIRED", "PERSONAL-1.2:ACTIVE"]);
  });

  it("Public Sector Loan is active and offers the same repayment plans as Personal Loan", () => {
    const pub = getProduct("PUBLIC_SECTOR")!;
    expect(pub.status).toBe("ACTIVE");
    const plan = pub.fields.find((f) => f.name === "interestModel");
    expect(plan?.kind === "select" && plan.options.map((o) => o.label)).toEqual(["Equal monthly repayment", "Declining (reducing balance) repayment"]);
    expect(pub.versions.find((v) => v.id === "PUBLIC_SECTOR-0.0")?.status).toBe("RETIRED");
  });
});
