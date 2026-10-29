import { describe, expect, it } from "vitest";
import { calculate } from "../calculate";
import { getProduct } from "../config/products";
import type { CalculationResult } from "../types";

/** Checks against "Rosabon Investment Deduced Calculation Rules" (RTN, REAP, RWIN). */
const NOW = new Date("2026-10-28T12:00:00Z");
const run = (code: string, inputs: Record<string, unknown>) => calculate(code, inputs, {}, { now: NOW, calculationId: "t" });
const summary = (r: CalculationResult) => Object.fromEntries(r.summary.map((s) => [s.key, s.value]));
const rtn = (principal: string, tenorDays: string, payoutOption: string) => run("RTN", { investorType: "INDIVIDUAL", principal, tenorDays, payoutOption });

describe("RTN — deduced rules document", () => {
  it("2.1: rate guide matches the document's 30 cells", () => {
    const table: Record<string, [string, string, string, string, string, string]> = {
      "60": ["13.89", "16", "15.19", "17.75", "16.62", "19.75"],
      "90": ["14.89", "17", "16.19", "18.75", "17.62", "20.75"],
      "120": ["15.64", "17.75", "17.19", "19.75", "18.37", "21.5"],
      "180": ["16.39", "18.5", "17.94", "20.5", "19.12", "22.25"],
      "365": ["17.14", "19.25", "18.69", "21.25", "19.87", "23"],
    };
    const amounts = ["500000", "5000000", "20000000"]; // Bands A, B, C
    for (const [tenor, cells] of Object.entries(table)) {
      amounts.forEach((amount, band) => {
        expect(summary(rtn(amount, tenor, "UPFRONT")).rate).toContain(`${cells[band * 2]}% p.a.`);
        expect(summary(rtn(amount, tenor, "MATURITY")).rate).toContain(`${cells[band * 2 + 1]}% p.a.`);
      });
    }
  });

  it("2.3: ₦1,000,000 for 90 days at maturity matches the worked example", () => {
    expect(summary(rtn("1000000", "90", "MATURITY"))).toMatchObject({
      grossInterest: "46232.88",
      tax: "4623.29",
      netInterest: "41609.59",
      maturityPayout: "1041609.59",
    });
  });

  it("2.4: upfront matches the recalculated figures exactly", () => {
    expect(summary(rtn("1000000", "90", "UPFRONT"))).toMatchObject({ bookedPrincipal: "965317.59", netInterest: "34682.41" });
  });

  it("2.4: OPEN-9 resolved in favour of ₦34,682.41 / ₦965,317.59; no comparison panel", () => {
    const r = rtn("1000000", "90", "UPFRONT");
    expect(r.secondary.find((s) => s.key === "upfrontRoundingComparison")).toBeUndefined();
    expect(summary(r)).toMatchObject({ netInterest: "34682.41", bookedPrincipal: "965317.59" });
  });

  it("RTN-1.1 is retired; its open points are recorded as decided in RTN-1.2+", () => {
    const versions = getProduct("RTN")!.versions;
    expect(versions.find((x) => x.id === "RTN-1.1")?.status).toBe("RETIRED");
    const v = versions.find((x) => x.status === "ACTIVE")!;
    expect(v.id).toBe("RTN-1.3");
    for (const id of ["RTN-R7", "RTN-R8", "RTN-R9"]) expect(v.ruleNotes.find((n) => n.id === id)?.status).toBe("CONFIRMED");
  });
});

describe("REAP and RWIN — deduced rules document", () => {
  it("REAP is the Rosabon Easy Access Plan with target amount and date, validation only", () => {
    const r = run("REAP", { principal: "10000", planType: "OPEN", targetAmount: "500000", targetDate: "2027-12-31" });
    expect(r.productName).toBe("REAP — Rosabon Easy Access Plan");
    expect(r.status).toBe("VALIDATION_ONLY");
    expect(summary(r)).toMatchObject({ targetAmount: "500000.00", targetDate: "2027-12-31" });
    expect(r.summary.find((s) => s.key === "targetAmount")?.kind).toBe("money");
    expect(r.lineItems).toEqual([]);
  });

  it("REAP minimum ₦10,000 still applies", () => {
    expect(run("REAP", { principal: "9999.99", planType: "OPEN" }).status).toBe("ERROR");
  });

  it("RWIN is the Rosabon Wealth Investment Note; ₦50,000 minimum with the ₦20,000 conflict recorded", () => {
    const r = run("RWIN", { principal: "50000" });
    expect(r.productName).toBe("RWIN — Rosabon Wealth Investment Note");
    expect(r.status).toBe("VALIDATION_ONLY");
    expect(r.warnings.find((w) => w.code === "RWIN-R1")?.message).toContain("₦20,000");
    expect(run("RWIN", { principal: "49999.99" }).status).toBe("ERROR");
  });
});
