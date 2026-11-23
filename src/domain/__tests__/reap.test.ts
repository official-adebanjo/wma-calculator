import { describe, expect, it } from "vitest";
import { calculate } from "../calculate";
import { getProduct } from "../config/products";
import { buildInputSchema } from "../inputs";
import { D, dec } from "../money";
import type { CalculationResult } from "../types";

/** "REAP Product Operating Logic" (source of truth, 2026-11-23). Expected values are derived independently. */
const NOW = new Date("2026-11-23T12:00:00Z");
const run = (inputs: Record<string, unknown>) => calculate("REAP", inputs, {}, { now: NOW, calculationId: "t" });
const summary = (r: CalculationResult) => Object.fromEntries(r.summary.map((s) => [s.key, s.value]));
const money = (v: InstanceType<typeof D>) => v.toDecimalPlaces(2, D.ROUND_HALF_UP).toFixed(2);
/** closing(n) = (closing(n−1) + deposit) × (1 + annual ÷ 12), from an opening balance. */
const compound = (deposits: number[], annual: string, opening = dec(0)) =>
  deposits.reduce((b, d) => b.plus(d).times(dec(annual).dividedBy(1200).plus(1)), opening);

describe("REAP rate guide and maturity", () => {
  it.each([
    ["3", "14.5"],
    ["6", "16.5"],
    ["12", "18"],
    ["24", "20"],
  ])("%s months → %s%% p.a., compounded monthly", (tenor, rate) => {
    const r = run({ tenorMonths: tenor, monthlyTarget: "50000" });
    const n = Number(tenor);
    const final = compound(Array(n).fill(50000), rate);
    const gross = final.minus(50000 * n);
    expect(r.status).toBe("CALCULATED");
    expect(r.schedule).toHaveLength(n);
    expect(summary(r)).toMatchObject({ finalBalance: money(final), grossInterest: money(gross), payout: money(dec(50000 * n).plus(gross.times("0.9"))) });
  });

  it("§4.2: the first three month-ends match the document exactly", () => {
    const r = run({ tenorMonths: "12", monthlyTarget: "50000" });
    expect(r.schedule.slice(0, 3).map((s) => s.closingBalance)).toEqual(["50750.00", "102261.25", "154545.17"]);
    expect(r.schedule[5].closingBalance).toBe("316149.71"); // the document's ≈₦312,810.05 does not follow its formula
  });

  it("§4.3 / Scenario B: missed and extra deposits compound from their month; the rate is unchanged", () => {
    const list = [50000, 100000, 0, 50000, 25000, 75000, 0, 50000, 50000, 50000, 25000, 25000];
    const r = run({ tenorMonths: "12", monthlyTarget: "50000", depositsByMonth: list.join("; ") });
    const final = compound(list, "18");
    expect(summary(r)).toMatchObject({ deposits: "500000.00", finalBalance: money(final), payout: money(dec(500000).plus(final.minus(500000).times("0.9"))) });
  });

  it("months not in the deposit list get ₦0, and the opening deposit must be at least ₦10,000", () => {
    const r = run({ tenorMonths: "6", monthlyTarget: "40000", depositsByMonth: "40000 40000" });
    expect(r.schedule.map((s) => s.principal)).toEqual(["40000.00", "40000.00", "0.00", "0.00", "0.00", "0.00"]);
    expect(run({ tenorMonths: "6", monthlyTarget: "40000", depositsByMonth: "9999.99; 40000" }).fieldErrors[0].field).toBe("depositsByMonth");
  });

  it("deposits-by-month accepts thousands separators but rejects comma-separated amounts", () => {
    const schema = buildInputSchema(getProduct("REAP")!);
    const ok = schema.safeParse({ tenorMonths: "6", monthlyTarget: "10000", depositsByMonth: "40,000; 1,250.50 0" });
    expect(ok.success && ok.data.depositsByMonth).toBe("40000.00;1250.50;0.00");
    expect(schema.safeParse({ tenorMonths: "6", monthlyTarget: "10000", depositsByMonth: "40000,40000" }).success).toBe(false);
  });

  it("months run from the plan start date, not calendar month ends", () => {
    const r = run({ tenorMonths: "3", monthlyTarget: "10000", planStartDate: "2027-01-15" });
    expect(r.schedule.map((s) => s.dueDate)).toEqual(["2027-02-15", "2027-03-15", "2027-04-15"]);
    expect(summary(r).maturityDate).toBe("2027-04-15");
  });
});

describe("REAP early termination", () => {
  it("Scenario C: day 60, 50% forfeiture, part-month interest ÷ 30 days", () => {
    const r = run({ tenorMonths: "6", monthlyTarget: "40000", depositsByMonth: "40000; 40000", planStartDate: "2027-01-01", terminationDate: "2027-03-02" });
    const closing2 = compound([40000, 40000], "16.5"); // ₦81,657.5625
    const part = closing2.times(dec("16.5").dividedBy(1200)).times(1).dividedBy(30); // 1 day into month 3
    const gross = closing2.plus(part).minus(80000);
    const net = gross.times("0.5").times("0.9");
    expect(summary(r)).toMatchObject({ grossInterest: money(gross), forfeited: money(gross.times("0.5")), payout: money(dec(80000).plus(net)) });
    expect(summary(r).grossInterest).toBe("1694.99");
    expect(summary(r).payout).toBe("80762.74"); // document: ₦80,762.75 (rounded intermediate figures)
    expect(summary(r).forfeitRate).toContain("50%");
  });

  it("day 180 is the first day of the 20% band", () => {
    const at = (date: string) => summary(run({ tenorMonths: "12", monthlyTarget: "10000", planStartDate: "2027-01-01", terminationDate: date })).forfeitRate;
    expect(at("2027-06-29")).toContain("50%"); // day 179
    expect(at("2027-06-30")).toContain("20%"); // day 180
  });

  it("before any interest has accrued: full refund, no forfeiture or WHT", () => {
    const r = run({ tenorMonths: "6", monthlyTarget: "10000", planStartDate: "2027-01-01", terminationDate: "2027-01-01" });
    expect(r.fieldErrors[0].field).toBe("terminationDate"); // must be after the start date
    const s = summary(run({ tenorMonths: "6", monthlyTarget: "10000", planStartDate: "2027-01-01", terminationDate: "2027-02-01" }));
    // One full month has compounded by 1 Feb, so interest exists; on day 1 only part-month interest exists.
    expect(s.forfeitRate).toContain("50%");
  });

  it("Scenario E: savings lock blocks early termination unless an Admin Unlock is applied; waiver sets forfeiture to 0%", () => {
    const base = { tenorMonths: "24", monthlyTarget: "100000", planStartDate: "2027-03-01", terminationDate: "2027-11-01" };
    expect(run({ ...base, savingsLock: "LOCKED" }).fieldErrors[0].message).toContain("Admin Unlock");
    const r = run({ ...base, savingsLock: "UNLOCKED", forfeitureWaiver: "WAIVED" });
    const bal = compound(Array(8).fill(100000), "20");
    const gross = bal.minus(800000);
    expect(summary(r)).toMatchObject({ terminationDate: "2027-11-01 (day 245)", deposits: "800000.00", grossInterest: money(gross), forfeited: "0.00", payout: money(dec(800000).plus(gross.times("0.9"))) });
    expect(money(bal)).toBe("862392.65"); // the document's ≈₦853,620 does not follow its formula
    expect(summary(r).forfeitRate).toBe("Waived (would be 20%)");
  });

  it("a termination on or after maturity is a maturity withdrawal (no forfeiture)", () => {
    const r = run({ tenorMonths: "3", monthlyTarget: "10000", planStartDate: "2027-01-01", terminationDate: "2027-05-01" });
    expect(summary(r).payout).toBe(money(dec(30000).plus(compound([10000, 10000, 10000], "14.5").minus(30000).times("0.9"))));
    expect(r.warnings.map((w) => w.code)).toContain("REAP_TERMINATION_AT_MATURITY");
  });
});

describe("REAP top-up and rollover", () => {
  it("Scenario D: a Top-Up restarts the tenor from its date and keeps the accrued interest", () => {
    const r = run({ tenorMonths: "12", monthlyTarget: "30000", planStartDate: "2027-01-01", topUpAmount: "500000", topUpDate: "2027-05-01" });
    const before = compound(Array(4).fill(30000), "18");
    expect(money(before)).toBe("124568.01"); // the document's ≈₦122,738 does not follow its formula
    // Months 5–16: the top-up and the first regular deposit land in plan month 5.
    const final = compound([530000, ...Array(11).fill(30000)], "18", before);
    expect(summary(r)).toMatchObject({ maturityDate: "2028-05-01", deposits: money(dec(120000 + 500000 + 30000 * 12)), finalBalance: money(final) });
    expect(r.schedule).toHaveLength(16);
  });

  it("a mid-month Top-Up keeps part-month interest; the forfeiture clock restarts at the top-up", () => {
    const r = run({ tenorMonths: "12", monthlyTarget: "10000", planStartDate: "2027-01-01", topUpAmount: "100000", topUpDate: "2027-01-16", terminationDate: "2027-02-16" });
    // Day 15 of month 1: (10,000) × 1.5% × 15 ÷ 30 = ₦75 kept; then one month from 16 Jan on 120,000.
    const kept = dec(10000).plus(75);
    const bal = kept.plus(100000).plus(10000).times("1.015");
    expect(summary(r)).toMatchObject({ terminationDate: "2027-02-16 (day 31 since the top-up)", deposits: "120000.00", grossInterest: money(bal.minus(120000)) });
  });

  it("rollover: the full payout opens a new plan at the Rate Guide rate for the new tenor", () => {
    const r = run({ tenorMonths: "3", monthlyTarget: "10000", rolloverTenorMonths: "6" });
    const payout = dec(summary(r).payout);
    const ro = r.secondary.find((s) => s.key === "rollover")!;
    const vals = Object.fromEntries(ro.summary.map((s) => [s.key, s.value]));
    const final = compound(Array(6).fill(0), "16.5", payout);
    expect(vals).toMatchObject({ openingBalance: money(payout), rate: "16.5% p.a. (6 months)", payout: money(payout.plus(final.minus(payout).times("0.9"))) });
  });

  it("records the document as the source and its open points", () => {
    const v = getProduct("REAP")!.versions.find((x) => x.status === "ACTIVE")!;
    expect(v.id).toBe("REAP-1.0");
    expect(v.sources[0].document).toBe("REAP Product Operating Logic");
    expect(v.ruleNotes.filter((n) => n.status === "OPEN").map((n) => n.id)).toEqual(["REAP-R8", "REAP-R9"]);
  });
});
