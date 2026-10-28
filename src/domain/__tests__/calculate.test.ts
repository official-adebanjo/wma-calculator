import { describe, expect, it } from "vitest";
import { calculate, httpStatusFor } from "../calculate";
import { PRODUCTS } from "../config/products";
import { resolveActiveConfig } from "../config/resolve";
import { dec } from "../money";
import type { CalculationResult, ProductDefinition } from "../types";
import { GOLDEN_FIXTURES } from "./golden.fixtures";

const NOW = new Date("2026-10-28T12:00:00Z");
const run = (code: string, inputs: Record<string, unknown>, qa = {}) =>
  calculate(code, inputs, qa, { now: NOW, calculationId: "test" });

const summary = (r: CalculationResult) => Object.fromEntries(r.summary.map((s) => [s.key, s.value]));
const secondary = (r: CalculationResult, i = 0) => Object.fromEntries(r.secondary[i].summary.map((s) => [s.key, s.value]));

describe("golden fixtures", () => {
  for (const fx of GOLDEN_FIXTURES) {
    it(`${fx.id} (${fx.source})`, () => {
      const r = run(fx.productCode, fx.inputs);
      expect(r.status).toBe(fx.expectedStatus);
      if (fx.expectedStatus !== "BLOCKED") expect(r.configVersionId).toBe(fx.configVersionId);
      if (fx.expectedSummary) expect(summary(r)).toMatchObject(fx.expectedSummary);
      if (fx.expectedSecondary) {
        expect(r.secondary[0].status).toBe("CALCULATED");
        expect(secondary(r)).toMatchObject(fx.expectedSecondary);
      }
    });
  }
});

describe("Nano / Payday validation", () => {
  it.each([
    ["4999.99", false],
    ["5000", true],
    ["50000", true],
    ["50000.01", false],
  ])("Nano principal %s accepted=%s (LN-NANO-002)", (principal, ok) => {
    const r = run("NANO", { principal, tenorDays: 7 });
    expect(r.status === "CALCULATED").toBe(ok);
    if (!ok) expect(r.fieldErrors[0].field).toBe("principal");
  });

  it.each([
    [6, false],
    [7, true],
    [30, true],
    [31, false],
  ])("Payday tenor %s accepted=%s (LN-PAY-002)", (tenorDays, ok) => {
    expect(run("PAYDAY", { monthlyIncome: "300000", principal: "100000", tenorDays }).status === "CALCULATED").toBe(ok);
  });

  it("rejects negative, malformed and excess-precision amounts without coercing to zero", () => {
    for (const principal of ["-100", "abc", "20000.001", "", "1e5", "NaN", "Infinity"]) {
      const r = run("NANO", { principal, tenorDays: 7 });
      expect(r.status).toBe("ERROR");
      expect(r.errorCode).toBe("VALIDATION_FAILED");
      expect(r.summary).toEqual([]);
      expect(httpStatusFor(r)).toBe(400);
    }
  });

  it("payday early settlement caps interest at actual days used (LN-PAY-003)", () => {
    const r = run("PAYDAY", { monthlyIncome: "400000", principal: "200000", tenorDays: 15, actualDaysUsed: 10 });
    expect(secondary(r)).toMatchObject({ interest: "6000.00", settlementAmount: "206000.00", interestSaved: "3000.00" });
    expect(r.secondary[0].ruleStatus).toBe("PROVISIONAL");
  });

  it("payday early settlement beyond tenor is rejected", () => {
    const r = run("PAYDAY", { monthlyIncome: "400000", principal: "200000", tenorDays: 15, actualDaysUsed: 16 });
    expect(r.status).toBe("ERROR");
    expect(r.fieldErrors[0].field).toBe("actualDaysUsed");
  });

  describe("payday income cap (≤ 50% of monthly income)", () => {
    const pay = (monthlyIncome: string, principal: string) => run("PAYDAY", { monthlyIncome, principal, tenorDays: 15 });

    it("accepts exactly 50% and rejects one kobo over", () => {
      expect(pay("400000", "200000").status).toBe("CALCULATED");
      const over = pay("400000", "200000.01");
      expect(over.status).toBe("ERROR");
      expect(over.fieldErrors[0].field).toBe("principal");
      expect(over.fieldErrors[0].message).toContain("₦200,000.00");
      expect(over.summary).toEqual([]);
    });

    it("never lets half-kobo rounding exceed the true 50%", () => {
      // 50% of 100,000.01 = 50,000.005 → 50,000.01 would be over the limit.
      expect(pay("100000.01", "50000.01").status).toBe("ERROR");
      expect(pay("100000.01", "50000.00").status).toBe("CALCULATED");
    });

    it("applies the lower of the income cap and the ₦500,000 product cap", () => {
      const r = pay("2000000", "500000");
      expect(r.status).toBe("CALCULATED");
      expect(summary(r)).toMatchObject({ monthlyIncome: "2000000.00", eligibleMax: "500000.00", capUtilisation: "100%" });
      expect(pay("2000000", "500000.01").fieldErrors[0].field).toBe("principal");
    });

    it("reports income, eligible maximum and utilisation", () => {
      const s = summary(pay("400000", "100000"));
      expect(s).toMatchObject({ monthlyIncome: "400000.00", eligibleMax: "200000.00", capUtilisation: "50%", totalRepayable: "104500.00" });
    });

    it("requires monthly income", () => {
      const r = run("PAYDAY", { principal: "100000", tenorDays: 15 });
      expect(r.fieldErrors.map((e) => e.field)).toContain("monthlyIncome");
    });

    it("uses the current configuration; earlier versions are retired", () => {
      expect(pay("400000", "100000").configVersionId).toBe("PAYDAY-1.2");
    });
  });

  it("shows a single due amount, never invented installments", () => {
    const r = run("NANO", { principal: "20000", tenorDays: 7, startDate: "2026-11-02" });
    expect(r.schedule).toEqual([]);
    expect(summary(r).dueDate).toBe("2026-11-09");
  });
});

describe("Personal loan", () => {
  it("reducing balance interest sequence matches LN-PER-002", () => {
    const r = run("PERSONAL_PRIVATE", { principal: "6000000", tenorMonths: 6, interestModel: "REDUCING_BALANCE" });
    expect(r.schedule.map((s) => s.interest)).toEqual(["120000.00", "100000.00", "80000.00", "60000.00", "40000.00", "20000.00"]);
    expect(r.schedule.map((s) => s.installment)).toEqual(["1120000.00", "1100000.00", "1080000.00", "1060000.00", "1040000.00", "1020000.00"]);
  });

  it("uneven division closes the balance at exactly zero and reconciles totals", () => {
    for (const interestModel of ["FLAT", "REDUCING_BALANCE"]) {
      const r = run("PERSONAL_PRIVATE", { principal: "1000000", tenorMonths: 7, interestModel });
      expect(r.schedule.at(-1)!.closingBalance).toBe("0.00");
      const principalSum = r.schedule.reduce((a, s) => a.plus(s.principal), dec(0));
      const installmentSum = r.schedule.reduce((a, s) => a.plus(s.installment), dec(0));
      expect(principalSum.toFixed(2)).toBe("1000000.00");
      expect(installmentSum.toFixed(2)).toBe(summary(r).totalRepayable);
      for (const s of r.schedule) expect(dec(s.closingBalance).gte(0)).toBe(true);
    }
  });

  it("tenor bounds 3–24 months", () => {
    expect(run("PERSONAL_PRIVATE", { principal: "1000000", tenorMonths: 2, interestModel: "FLAT" }).status).toBe("ERROR");
    expect(run("PERSONAL_PRIVATE", { principal: "1000000", tenorMonths: 25, interestModel: "FLAT" }).status).toBe("ERROR");
  });

  it("requires an explicit interest model", () => {
    const r = run("PERSONAL_PRIVATE", { principal: "1000000", tenorMonths: 6 });
    expect(r.fieldErrors.map((e) => e.field)).toContain("interestModel");
  });

  it("due dates clamp to month end", () => {
    const r = run("PERSONAL_PRIVATE", { principal: "600000", tenorMonths: 3, interestModel: "FLAT", startDate: "2027-01-31" });
    expect(r.schedule.map((s) => s.dueDate)).toEqual(["2027-02-28", "2027-03-31", "2027-04-30"]);
  });
});

describe("RTN", () => {
  const rtnRun = (principal: string, tenorDays = "90", payoutOption = "MATURITY", investorType = "INDIVIDUAL", extra = {}) =>
    run("RTN", { investorType, principal, tenorDays, payoutOption, ...extra });

  it.each([
    ["999999.99", "17.00", "A"],
    ["1000000", "18.75", "B"],
    ["9999999.99", "18.75", "B"],
    ["10000000", "20.75", "C"],
  ])("band boundary %s -> %s%% (RTN-RATE-001..004)", (principal, rate, band) => {
    const s = summary(rtnRun(principal));
    expect(s.rate).toContain(`${Number(rate)}% p.a.`);
    expect(s.band).toContain(`Band ${band}`);
  });

  it("all 30 rate guide cells resolve (RTN-RATE-005)", () => {
    const amounts = { A: "500000", B: "5000000", C: "20000000" };
    const cfg = PRODUCTS.find((p) => p.code === "RTN")!.versions[0].rtn!;
    expect(cfg.rates).toHaveLength(30);
    for (const cell of cfg.rates) {
      const r = rtnRun(amounts[cell.band], String(cell.tenorDays), cell.option);
      expect(r.status).toBe("CALCULATED");
      expect(summary(r).rate).toContain(`${Number(cell.annualRatePercent)}% p.a.`);
    }
  });

  it("minimums: individual 50,000 and corporate 250,000 inclusive (RTN-VAL-001..004)", () => {
    expect(rtnRun("49999.99").status).toBe("ERROR");
    expect(rtnRun("50000").status).toBe("CALCULATED");
    expect(rtnRun("249999.99", "90", "MATURITY", "CORPORATE").status).toBe("ERROR");
    expect(rtnRun("250000", "90", "MATURITY", "CORPORATE").status).toBe("CALCULATED");
  });

  it.each(["30", "91", "240"])("unsupported tenor %s is rejected without fallback (RTN-VAL-005)", (t) => {
    const r = rtnRun("1000000", t);
    expect(r.status).toBe("ERROR");
    expect(r.summary).toEqual([]);
  });

  it("uses 365-day basis and WHT on interest only (RTN-CAL-003/004)", () => {
    const s = summary(rtnRun("1000000"));
    expect(s.grossInterest).toBe("46232.88");
    expect(s.principal).toBe("1000000.00");
  });

  it("upfront option matches RTN-CAL-002 within the documented rounding discrepancy", () => {
    const r = rtnRun("1000000", "90", "UPFRONT");
    const s = summary(r);
    expect(dec(s.bookedPrincipal).minus("965317.59").abs().lte(1)).toBe(true);
    expect(dec(s.bookedPrincipal).plus(s.netInterest).toFixed(2)).toBe("1000000.00");
    expect(r.warnings.map((w) => w.code)).toContain("RTN_UPFRONT_PROVISIONAL");
    expect(s.maturityPayout).toBeUndefined();
  });

  it("early withdrawal in a penalty-band gap is BLOCKED (RTN-EXIT-003)", () => {
    // 23/90 = 25.56% falls between the 0–25% and 26–50% bands.
    const r = rtnRun("1000000", "90", "MATURITY", "INDIVIDUAL", { daysElapsed: 23 });
    expect(r.secondary[0].status).toBe("BLOCKED");
    expect(r.secondary[0].summary.find((x) => x.key === "payout")).toBeUndefined();
  });

  it("early withdrawal above 50% elapsed is BLOCKED (no approved band)", () => {
    const r = rtnRun("1000000", "90", "MATURITY", "INDIVIDUAL", { daysElapsed: 60 });
    expect(r.secondary[0].status).toBe("BLOCKED");
  });

  it("early withdrawal on an upfront placement is BLOCKED (OPEN-RTN-04)", () => {
    const r = rtnRun("1000000", "90", "UPFRONT", "INDIVIDUAL", { daysElapsed: 30 });
    expect(r.secondary[0].status).toBe("BLOCKED");
  });

  it("flags weekend maturity dates", () => {
    // 2026-11-01 + 90 days = 2027-01-30 (Saturday)
    const r = rtnRun("1000000", "90", "MATURITY", "INDIVIDUAL", { valueDate: "2026-11-01" });
    expect(summary(r).maturityDate).toBe("2027-01-30");
    expect(r.warnings.map((w) => w.code)).toContain("MATURITY_WEEKEND");
  });
});

describe("status gates and invariants", () => {
  it("REAP/RWIN never return a projection, even with a QA rate override", () => {
    for (const [code, inputs] of [
      ["REAP", { principal: "500000", planType: "OPEN", tenorMonths: 12 }],
      ["RWIN", { principal: "600000", cycleDays: 90 }],
    ] as const) {
      const r = run(code, inputs, { rateOverridePercent: "30" });
      expect(r.status).toBe("VALIDATION_ONLY");
      expect(r.lineItems).toEqual([]);
      expect(r.summary.some((s) => s.kind === "money" && s.key !== "principal")).toBe(false);
      expect(r.warnings.map((w) => w.code)).toContain("QA_OVERRIDE_IGNORED");
    }
  });

  it("REAP/RWIN minimums (RR-001, RW-001)", () => {
    expect(run("REAP", { principal: "9999.99", planType: "LOCKED" }).status).toBe("ERROR");
    expect(run("RWIN", { principal: "49999.99" }).status).toBe("ERROR");
  });

  it("public sector is BLOCKED and never reuses private-sector rules", () => {
    const r = run("PUBLIC_SECTOR", { principal: "6000000", tenorMonths: 12 });
    expect(r.status).toBe("BLOCKED");
    expect(r.summary).toEqual([]);
    expect(httpStatusFor(r)).toBe(422);
  });

  it("QA rate override is labelled", () => {
    const r = run("NANO", { principal: "20000", tenorDays: 7 }, { rateOverridePercent: "0.5" });
    expect(r.rateSource).toBe("QA_OVERRIDE");
    expect(summary(r).grossInterest).toBe("700.00");
    expect(r.warnings[0].code).toBe("QA_RATE_OVERRIDE");
  });

  it("is deterministic for the same inputs and config", () => {
    const a = run("RTN", { investorType: "INDIVIDUAL", principal: "1234567.89", tenorDays: "180", payoutOption: "MATURITY" });
    const b = run("RTN", { investorType: "INDIVIDUAL", principal: "1234567.89", tenorDays: "180", payoutOption: "MATURITY" });
    expect(a).toEqual(b);
  });

  it("RTN payout = principal + net and net = gross − WHT across amounts", () => {
    for (const p of ["50000", "123456.78", "999999.99", "7777777.77", "50000000"]) {
      for (const mode of ["COMPONENT", "FINAL"] as const) {
        const s = summary(run("RTN", { investorType: "INDIVIDUAL", principal: p, tenorDays: "365", payoutOption: "MATURITY" }, { roundingMode: mode }));
        if (mode === "COMPONENT") {
          expect(dec(s.grossInterest).minus(s.tax).toFixed(2)).toBe(s.netInterest);
          expect(dec(s.principal).plus(s.netInterest).toFixed(2)).toBe(s.maturityPayout);
        } else {
          expect(dec(s.principal).plus(s.netInterest).minus(s.maturityPayout).abs().lte("0.01")).toBe(true);
        }
      }
    }
  });

  it("unknown product returns 404-mapped error", () => {
    const r = run("NOPE", {});
    expect(r.errorCode).toBe("UNKNOWN_PRODUCT");
    expect(httpStatusFor(r)).toBe(404);
  });
});

describe("configuration resolution", () => {
  const nano = PRODUCTS.find((p) => p.code === "NANO")!;
  const withVersions = (versions: ProductDefinition["versions"]): ProductDefinition => ({ ...nano, versions });
  const v = nano.versions.find((x) => x.status === "ACTIVE")!;

  it("blocks overlapping active versions", () => {
    const r = resolveActiveConfig(withVersions([v, { ...v, id: "NANO-1.1" }]), NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("CONFIGURATION_INTEGRITY");
  });

  it("never silently uses an expired rate", () => {
    const r = resolveActiveConfig(withVersions([{ ...v, effectiveTo: "2026-10-01" }]), NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("CONFIGURATION_EXPIRED");
  });

  it("ignores drafts", () => {
    const r = resolveActiveConfig(withVersions([{ ...v, status: "DRAFT" }]), NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("CONFIGURATION_UNAVAILABLE");
  });
});
