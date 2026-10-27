import { describe, expect, it } from "vitest";
import { fullName, initials, personLabel, profileNameSchema, splitName } from "../profile";

describe("profileNameSchema", () => {
  it.each([
    ["Adebanjo", "Adeniji"],
    ["Adéọlá", "Ọ̀ṣọ́ọ̀sì"],
    ["Mary-Jane", "O'Brien"],
    ["  Chidi ", " Okafor  "],
    ["Jean", "St. Clair"],
  ])("accepts %s %s", (firstName, lastName) => {
    const r = profileNameSchema.safeParse({ firstName, lastName });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.firstName).toBe(firstName.trim());
  });

  it.each([
    ["", "Okafor", "First name is required."],
    ["Chidi", "   ", "Last name is required."],
    ["Chidi1", "Okafor", "letters"],
    ["<script>", "Okafor", "letters"],
    ["-Chidi", "Okafor", "letters"],
    ["A".repeat(61), "Okafor", "at most 60"],
  ])("rejects %j %j", (firstName, lastName, message) => {
    const r = profileNameSchema.safeParse({ firstName, lastName });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toContain(message);
  });
});

describe("name helpers", () => {
  it("splits provider display names", () => {
    expect(splitName("Ada Lovelace")).toEqual({ firstName: "Ada", lastName: "Lovelace" });
    expect(splitName("  Ada  King Lovelace ")).toEqual({ firstName: "Ada", lastName: "King Lovelace" });
    expect(splitName("Ada")).toBeNull();
    expect(splitName(undefined)).toBeNull();
  });

  it("builds full names and initials", () => {
    expect(fullName("Ada", "Lovelace")).toBe("Ada Lovelace");
    expect(fullName(null, null)).toBeNull();
    expect(initials("Ada King Lovelace")).toBe("AL");
    expect(initials("tester@example.com")).toBe("T");
    expect(initials("jane.doe@example.com")).toBe("JD");
  });

  it("prefers name, then email, then uid for display", () => {
    expect(personLabel({ userName: "Ada Lovelace", userEmail: "a@x.com", userId: "u1" })).toBe("Ada Lovelace");
    expect(personLabel({ userName: null, userEmail: "a@x.com", userId: "u1" })).toBe("a@x.com");
    expect(personLabel({ userId: "u1" })).toBe("u1");
  });
});
