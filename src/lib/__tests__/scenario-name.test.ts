import { describe, expect, it } from "vitest";
import { cleanScenarioName, createScenarioSchema, scenarioNameKey } from "../scenario-types";

describe("scenario names", () => {
  it("treats names differing only in case or spacing as the same", () => {
    const key = scenarioNameKey("RTN-CAL-001 Band B");
    for (const variant of ["rtn-cal-001 band b", "  RTN-CAL-001   Band B  ", "RTN-CAL-001\tBand\nB"]) {
      expect(scenarioNameKey(variant)).toBe(key);
    }
  });

  it("keeps genuinely different names distinct", () => {
    expect(scenarioNameKey("RTN-CAL-001")).not.toBe(scenarioNameKey("RTN-CAL-002"));
    expect(scenarioNameKey("Payday 15d")).not.toBe(scenarioNameKey("Payday 15 d"));
  });

  it("saves the tidied name and rejects blank names", () => {
    expect(cleanScenarioName("  LN-PAY-001   regression  ")).toBe("LN-PAY-001 regression");
    const ok = createScenarioSchema.safeParse({ name: "  LN-PAY-001   regression ", productCode: "PAYDAY", inputs: {} });
    expect(ok.success && ok.data.name).toBe("LN-PAY-001 regression");
    const blank = createScenarioSchema.safeParse({ name: "    ", productCode: "PAYDAY", inputs: {} });
    expect(blank.success).toBe(false);
    if (!blank.success) expect(blank.error.issues[0].message).toBe("Name is required.");
  });
});
