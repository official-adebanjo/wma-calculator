import { describe, expect, it } from "vitest";
import { calculate } from "../calculate";
import { getProduct } from "../config/products";
import { D, dec } from "../money";
import type { CalculationResult } from "../types";

/** RFS approved RTN decisions (A–D), 2026-10-28. Expected values are derived independently here. */
const NOW = new Date("2026-10-28T12:00:00Z");
const run = (inputs: Record<string, unknown>) =>
  calculate("RTN", { investorType: "INDIVIDUAL", tenorDays: "90", payoutOption: "MATURITY", ...inputs }, {}, { now: NOW, calculationId: "t" });
const summary = (r: CalculationResult) => Object.fromEntries(r.summary.map((s) => [s.key, s.value]));
const sec = (r: CalculationResult, key: string) => {
  const a = r.secondary.find((s) => s.key === key);
  return a ? { ...a, values: Object.fromEntries(a.summary.map((s) => [s.key, s.value])) } : undefined;
};
const money = (v: InstanceType<typeof D>) => v.toDecimalPlaces(2, D.ROUND_HALF_UP).toFixed(2);

describe("A. Rates, bands and eligibility", () => {
  it("the Rate Guide is the approved production table (no illustrative-rate warning)", () => {
    const v = getProduct("RTN")!.versions.find((x) => x.status === "ACTIVE")!;
    expect(v.ruleNotes.find((n) => n.id === "RTN-R4")?.status).toBe("CONFIRMED");
    expect(run({ principal: "1000000" }).warnings.map((w) => w.code)).not.toContain("ILLUSTRATIVE_RATE");
  });

  it.each([
    ["999999.99", "A"],
    ["1000000.00", "B"],
    ["9999999.99", "B"],
    ["10000000.00", "C"],
  ])("bands are closed ranges at kobo precision: %s → Band %s", (principal, band) => {
    expect(summary(run({ principal })).band).toContain(`Band ${band}`);
  });

  it("records the rate-lock and band-basis decisions", () => {
    const notes = getProduct("RTN")!.versions.find((x) => x.status === "ACTIVE")!.ruleNotes;
    expect(notes.find((n) => n.id === "RTN-R11")?.note).toContain("funds-confirmed date");
    expect(notes.find((n) => n.id === "RTN-R10")?.note).toContain("new total principal after a top-up");
  });
});

describe("B. Interest, tax and rounding", () => {
  it("calculates at full precision and rounds only the output (FINAL)", () => {
    // Pick an amount where rounding each step would differ from rounding once.
    const p = dec("1234567.89");
    const gross = p.times("0.2125").times(365).dividedBy(365);
    const net = gross.times("0.9");
    const r = run({ principal: "1234567.89", tenorDays: "365" });
    expect(r.roundingMode).toBe("FINAL");
    expect(summary(r)).toMatchObject({ grossInterest: money(gross), netInterest: money(net), maturityPayout: money(p.plus(net)) });
  });

  it("uses a fixed 365-day basis in leap years; maturity = start + tenor days", () => {
    // 2027-12-15 + 90 days crosses 29 Feb 2028 → 2028-03-14.
    const r = run({ principal: "1000000", valueDate: "2027-12-15" });
    expect(summary(r)).toMatchObject({ maturityDate: "2028-03-14", grossInterest: "46232.88" });
  });

  it("upfront: gross ₦38,536.01, WHT ₦3,853.60, paid ₦34,682.41, booked ₦965,317.59", () => {
    const s = summary(run({ principal: "1000000", payoutOption: "UPFRONT" }));
    expect(s).toMatchObject({ bookedPrincipal: "965317.59", grossInterest: "38536.01", tax: "3853.60", netInterest: "34682.41" });
  });

  it("weekend maturity: interest to the calendar date, payment next business day, notice at T-7", () => {
    // 2026-11-01 + 90 = Saturday 2027-01-30 → paid Monday 2027-02-01; notice 2027-01-23.
    const r = run({ principal: "1000000", valueDate: "2026-11-01" });
    expect(summary(r)).toMatchObject({ maturityDate: "2027-01-30", paymentDate: "2027-02-01", noticeDate: "2027-01-23" });
    expect(r.warnings.find((w) => w.code === "MATURITY_WEEKEND")?.message).toContain("2027-02-01");
  });

  it("weekday maturity: payment on the maturity date", () => {
    // 2026-11-04 + 90 days = Tuesday 2027-02-02.
    const r = run({ principal: "1000000", valueDate: "2026-11-04" });
    expect(summary(r)).toMatchObject({ maturityDate: "2027-02-02", paymentDate: "2027-02-02" });
    expect(r.warnings.map((w) => w.code)).not.toContain("MATURITY_WEEKEND");
  });
});

describe("C. Early withdrawal and liquidation", () => {
  /** Expected payout for a withdrawal of `amount` after `days` with penalty share `share`. */
  const expected = (amount: string, ratePct: string, days: number, share: string) => {
    const a = dec(amount);
    const rate = dec(ratePct).dividedBy(100);
    const accrued = a.times(rate).times(days).dividedBy(365);
    const penalty = dec(days).dividedBy(365).times(dec(share).dividedBy(100).times(rate)).times(a);
    const net = accrued.minus(penalty).times("0.9");
    return { penalty: money(penalty), netInterest: money(net), payout: money(a.plus(net)) };
  };

  it.each([
    // tenor, days, share of rate, rate (Band B maturity)
    ["60", 15, "100", "17.75"], // exactly 25% → 100%
    ["60", 16, "80", "17.75"], // 26.67% → 80%
    ["120", 60, "80", "19.75"], // exactly 50% → 80%
    ["120", 61, "60", "19.75"], // 50.83% → 60%
    ["120", 90, "60", "19.75"], // exactly 75% → 60%
    ["120", 91, "40", "19.75"], // 75.83% → 40%
    ["120", 119, "40", "19.75"], // day before maturity → 40%
  ])("tenor %s, day %s → %s%% of the rate", (tenorDays, days, share, rate) => {
    const w = sec(run({ principal: "1000000", tenorDays, daysElapsed: days }), "earlyWithdrawal")!;
    expect(w.status).toBe("CALCULATED");
    expect(w.ruleStatus).toBe("CONFIRMED");
    expect(w.values.penaltyRate.startsWith(`${share}% of `)).toBe(true);
    expect(w.values).toMatchObject(expected("1000000", rate, days, share));
  });

  it("≤25% elapsed forfeits all interest: payout is the principal", () => {
    expect(sec(run({ principal: "1000000", tenorDays: "60", daysElapsed: 15 }), "earlyWithdrawal")!.values).toMatchObject({ netInterest: "0.00", payout: "1000000.00" });
  });

  it("on the maturity date the penalty is 0% and the payout equals the maturity payout", () => {
    const r = run({ principal: "1000000", daysElapsed: 90 });
    expect(sec(r, "earlyWithdrawal")!.values).toMatchObject({ penalty: "0.00", payout: summary(r).maturityPayout });
  });

  it("partial withdrawal: the withdrawn amount is its own liquidation; the remainder is re-rated", () => {
    // ₦1,000,000 Band B (18.75%); withdraw ₦400,000 on day 30 (80% band); ₦600,000 left → Band A 17.00%.
    const r = run({ principal: "1000000", daysElapsed: 30, withdrawalAmount: "400000" });
    expect(sec(r, "earlyWithdrawal")!.values).toMatchObject({ withdrawn: "400000.00", ...expected("400000", "18.75", 30, "80") });
    const rem = sec(r, "remainingPlacement")!;
    expect(rem.status).toBe("CALCULATED");
    expect(rem.ruleStatus).toBe("PROVISIONAL"); // re-rating start day is an assumption (RTN-R14)
    const remaining = dec("600000");
    const gross = remaining.times("0.1875").times(30).dividedBy(365).plus(remaining.times("0.17").times(60).dividedBy(365));
    expect(rem.values).toMatchObject({ remainingPrincipal: "600000.00", newRate: "17% p.a.", grossInterest: money(gross), maturityPayout: money(remaining.plus(gross.times("0.9"))) });
    expect(rem.values.newBand).toContain("Band A");
  });

  it.each([
    ["INDIVIDUAL", "100000", "60000", "₦50,000.00", "₦50,000.00"],
    ["CORPORATE", "300000", "100000", "₦250,000.00", "₦50,000.00"],
  ])("%s: a remainder below the minimum is refused with the full/smaller options", (investorType, principal, withdrawalAmount, min, maxSmaller) => {
    const r = run({ investorType, principal, daysElapsed: 30, withdrawalAmount });
    expect(r.status).toBe("ERROR");
    const msg = r.fieldErrors.find((e) => e.field === "withdrawalAmount")!.message;
    expect(msg).toContain(`below the ${min} minimum`);
    expect(msg).toContain(`at most ${maxSmaller}`);
    expect(r.summary).toEqual([]);
  });

  it("refuses a withdrawal larger than the principal", () => {
    expect(run({ principal: "1000000", daysElapsed: 30, withdrawalAmount: "1000000.01" }).fieldErrors[0].field).toBe("withdrawalAmount");
  });

});

describe("Upfront early withdrawal (RTN-R13)", () => {
  // ₦1,000,000 funded, 90 days, upfront 16.19%; exit on day 30 (33.33% elapsed → 80% penalty share).
  const rate = dec("0.1619");
  const booked = dec(1000000).dividedBy(dec(1).plus(dec("0.9").times(rate).times(90).dividedBy(365)));
  const accrued = booked.times(rate).times(30).dividedBy(365);
  const penal = dec(30).dividedBy(365).times(rate.times("0.8")).times(booked);
  const net = dec("0.9").times(accrued.minus(penal));

  it("payout = booked principal + 0.90 × (interest accrued on booked principal − penal charge)", () => {
    const r = run({ principal: "1000000", payoutOption: "UPFRONT", daysElapsed: 30 });
    expect(r.configVersionId).toBe("RTN-1.3");
    const w = sec(r, "earlyWithdrawal")!;
    expect(w.status).toBe("CALCULATED");
    expect(w.ruleStatus).toBe("CONFIRMED");
    expect(w.values).toMatchObject({
      bookedPrincipal: "965317.59",
      grossInterest: money(accrued),
      penalty: money(penal),
      netInterest: money(net),
      payout: money(booked.plus(net)),
      upfrontPaid: "34682.41",
      unearnedUpfront: money(dec(1000000).minus(booked).minus(net)),
    });
    expect(r.warnings.map((x) => x.code)).toContain("UPFRONT_EXIT_UPFRONT_NOT_DEDUCTED");
  });

  it("uses the 100% penalty band early in the tenor", () => {
    const w = sec(run({ principal: "1000000", payoutOption: "UPFRONT", daysElapsed: 10 }), "earlyWithdrawal")!;
    expect(w.values.penaltyRate).toContain("100% of 16.19%");
    expect(w.values.netInterest).toBe("0.00");
    expect(w.values.payout).toBe("965317.59");
  });

  it("is full withdrawal only, before maturity", () => {
    expect(run({ principal: "1000000", payoutOption: "UPFRONT", daysElapsed: 30, withdrawalAmount: "500000" }).fieldErrors[0].field).toBe("withdrawalAmount");
    expect(run({ principal: "1000000", payoutOption: "UPFRONT", daysElapsed: 90 }).fieldErrors[0].field).toBe("daysElapsed");
  });

  it("records RTN-R13 as confirmed and keeps RTN-1.2 retired", () => {
    const versions = getProduct("RTN")!.versions;
    expect(versions.find((x) => x.id === "RTN-1.2")?.status).toBe("RETIRED");
    expect(versions.find((x) => x.status === "ACTIVE")!.ruleNotes.find((n) => n.id === "RTN-R13")?.status).toBe("CONFIRMED");
  });
});

describe("D. Top-ups and rollover", () => {
  it("top-up: band from the new total, extra earns only for the days left (QA matrix RTN-TOP-001)", () => {
    // ₦800,000 for 180 days at Band A 18.50%; +₦300,000 on day 60 → ₦1,100,000 Band B 20.50% for 120 days.
    const t = sec(run({ principal: "800000", tenorDays: "180", topUpAmount: "300000", topUpDay: 60 }), "topUp")!;
    expect(t.status).toBe("CALCULATED");
    expect(t.ruleStatus).toBe("CONFIRMED");
    expect(t.values).toMatchObject({ newPrincipal: "1100000.00", newRate: "20.5% p.a.", grossInterest: "98465.75", netInterest: "88619.18", maturityPayout: "1188619.18" });
  });

  it("top-up keeps the maturity date and flags top-ups within 7 days", () => {
    const r = run({ principal: "800000", tenorDays: "180", topUpAmount: "300000", topUpDay: 5, valueDate: "2026-11-02" });
    expect(sec(r, "topUp")!.values.maturityDate).toBe(summary(r).maturityDate);
    expect(r.warnings.map((w) => w.code)).toContain("TOPUP_WITHIN_7_DAYS");
  });

  it("top-up needs both amount and day", () => {
    expect(run({ principal: "800000", topUpAmount: "300000" }).fieldErrors[0].field).toBe("topUpDay");
  });

  it("rollover: principal + net interest at the current Rate Guide, starting on the calendar maturity date", () => {
    const r = run({ principal: "1000000", rolloverTenorDays: "90", valueDate: "2026-11-01" });
    const rolled = dec(1000000).plus(dec(1000000).times("0.1875").times(90).dividedBy(365).times("0.9"));
    const gross = rolled.times("0.1875").times(90).dividedBy(365);
    const ro = sec(r, "rollover")!;
    expect(ro.ruleStatus).toBe("CONFIRMED");
    expect(ro.values).toMatchObject({
      rolledAmount: summary(r).maturityPayout,
      startDate: "2027-01-30", // calendar maturity date (a Saturday) — no day of interest lost
      newMaturity: "2027-04-30",
      grossInterest: money(gross),
      maturityPayout: money(rolled.plus(gross.times("0.9"))),
    });
  });

  it("only one lifecycle event per calculation", () => {
    const r = run({ principal: "1000000", daysElapsed: 30, topUpAmount: "100000", topUpDay: 30 });
    expect(r.status).toBe("ERROR");
    expect(r.fieldErrors[0].message).toContain("separate calculations");
  });
});
