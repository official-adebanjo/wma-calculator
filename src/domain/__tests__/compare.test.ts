import { describe, expect, it } from "vitest";
import { calculate } from "../calculate";
import { compareResults } from "../compare";

const NOW = new Date("2026-10-28T12:00:00Z");
const rtn = (payoutOption: string, id: string) =>
  calculate("RTN", { investorType: "INDIVIDUAL", principal: "1000000", tenorDays: "90", payoutOption }, {}, { now: NOW, calculationId: id });

describe("compareResults", () => {
  it("shows every label used for a shared figure, so values aren't read under another product's wording", () => {
    const c = compareResults([{ label: "Upfront", result: rtn("UPFRONT", "a") }, { label: "Maturity", result: rtn("MATURITY", "b") }]);
    const row = c.outputRows.find((r) => r.key === "netInterest")!;
    expect(row.label).toBe("Upfront interest paid (net) / Net interest");
    expect(row.values).toEqual(["34682.41", "41609.59"]);
    expect(row.differs).toBe(true);
  });

  it("keeps a single label when all scenarios agree", () => {
    const c = compareResults([{ label: "A", result: rtn("MATURITY", "a") }, { label: "B", result: rtn("MATURITY", "b") }]);
    expect(c.outputRows.find((r) => r.key === "netInterest")!.label).toBe("Net interest");
    expect(c.outputRows.every((r) => !r.differs)).toBe(true);
  });
});
