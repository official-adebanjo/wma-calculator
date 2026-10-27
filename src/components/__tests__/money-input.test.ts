import { describe, expect, it } from "vitest";
import { buildInputSchema } from "@/domain/inputs";
import { formatGrouped, stripGrouping } from "../money-input";

describe("formatGrouped", () => {
  it.each([
    ["", ""],
    ["5", "5"],
    ["1000", "1,000"],
    ["1234567", "1,234,567"],
    ["1234567.5", "1,234,567.5"],
    ["1234567.891", "1,234,567.89"],
    ["1,2,3,4", "1,234"],
    ["0001000", "1,000"],
    [".5", "0.5"],
    ["12a3b4", "1,234"],
    ["1.2.3", "1.23"],
    ["20000.00", "20,000.00"],
  ])("%s → %s", (raw, expected) => {
    expect(formatGrouped(raw)).toBe(expected);
  });

  it("grouped values strip back to plain decimals the schema accepts", () => {
    const schema = buildInputSchema({ fields: [{ kind: "money", name: "principal", label: "Principal", required: true }] });
    expect(stripGrouping(formatGrouped("6000000"))).toBe("6000000");
    expect(schema.safeParse({ principal: formatGrouped("6000000") }).success).toBe(true);
  });
});
