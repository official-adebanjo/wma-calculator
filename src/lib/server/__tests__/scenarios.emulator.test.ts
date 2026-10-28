/**
 * Firestore integration tests for scenario names and deletion.
 * Opt-in: runs only against the local emulator (never a real project):
 *   npx firebase-tools emulators:exec --only firestore --project demo-rfs-calculator "npx vitest run src/lib/server/__tests__/scenarios.emulator.test.ts"
 */
import { beforeEach, describe, expect, it } from "vitest";
import { calculate } from "@/domain/calculate";
import type { SessionUser } from "../auth";

const emulator = process.env.FIRESTORE_EMULATOR_HOST;
process.env.FIREBASE_PROJECT_ID ??= "demo-rfs-calculator";

const user = (uid: string, role: SessionUser["role"] = "QA_TESTER"): SessionUser => ({
  uid,
  email: `${uid}@example.com`,
  role,
  firstName: uid,
  lastName: "Tester",
  displayName: `${uid} Tester`,
});
const result = () => calculate("NANO", { principal: "20000", tenorDays: 7 }, {}, { now: new Date("2026-10-28T12:00:00Z") });

describe.skipIf(!emulator)("scenarios (Firestore emulator)", async () => {
  if (!emulator) return;
  const { adminDb } = await import("@/lib/firebase/admin");
  const repo = await import("../scenarios");
  const ada = user("ada");
  const bola = user("bola");

  beforeEach(async () => {
    // Clear the emulator database between tests.
    await fetch(`http://${emulator}/emulator/v1/projects/${process.env.FIREBASE_PROJECT_ID}/databases/(default)/documents`, { method: "DELETE" });
  });

  const codeOf = async (p: Promise<unknown>) => p.then(() => "OK").catch((e: { code?: string }) => e.code ?? String(e));

  it("rejects a tester's duplicate name, ignoring case and spacing", async () => {
    await repo.createScenario(ada, "RTN-CAL-001 Band B", result());
    expect(await codeOf(repo.createScenario(ada, "rtn-cal-001  band b", result()))).toBe("DUPLICATE_SCENARIO_NAME");
    expect(await codeOf(repo.createScenario(ada, "RTN-CAL-002 Band B", result()))).toBe("OK");
  });

  it("lets different testers use the same name", async () => {
    await repo.createScenario(ada, "Payday regression", result());
    expect(await codeOf(repo.createScenario(bola, "Payday regression", result()))).toBe("OK");
  });

  it("allows exactly one of two simultaneous saves with the same name", async () => {
    const outcomes = await Promise.all([1, 2, 3].map(() => codeOf(repo.createScenario(ada, "Race", result()))));
    expect(outcomes.filter((o) => o === "OK")).toHaveLength(1);
    expect(outcomes.filter((o) => o === "DUPLICATE_SCENARIO_NAME")).toHaveLength(2);
    expect((await repo.listScenarios(ada)).filter((s) => s.name === "Race")).toHaveLength(1);
  });

  it("detects duplicates of scenarios saved before name reservations existed", async () => {
    await adminDb().collection("scenarios").doc("legacy-1").set({ id: "legacy-1", name: "Legacy Name", userId: "ada", createdAt: "2026-10-01T00:00:00.000Z" });
    expect(await codeOf(repo.createScenario(ada, "legacy name", result()))).toBe("DUPLICATE_SCENARIO_NAME");
  });

  it("owner deletes: scenario gone, name reusable, deletion audited", async () => {
    const s = await repo.createScenario(ada, "To delete", result());
    await repo.deleteScenario(ada, s.id);
    expect(await codeOf(repo.getScenario(ada, s.id))).toBe("SCENARIO_NOT_FOUND");
    expect(await codeOf(repo.createScenario(ada, "To delete", result()))).toBe("OK");
    const audit = await repo.listAudit();
    const ev = audit.find((e) => (e as { action?: string }).action === "SCENARIO_DELETED") as { entityId: string; beforeSnapshot: { name: string } } | undefined;
    expect(ev?.entityId).toBe(s.id);
    expect(ev?.beforeSnapshot.name).toBe("To delete");
  });

  it("only the owner or an admin may delete", async () => {
    const s = await repo.createScenario(ada, "Protected", result());
    expect(await codeOf(repo.deleteScenario(bola, s.id))).toBe("SCENARIO_NOT_FOUND"); // other testers can't see it
    expect(await codeOf(repo.deleteScenario(user("rev", "REVIEWER"), s.id))).toBe("FORBIDDEN");
    expect(await codeOf(repo.deleteScenario(user("boss", "ADMIN"), s.id))).toBe("OK");
  });

  it("deleting a missing scenario is a 404", async () => {
    expect(await codeOf(repo.deleteScenario(ada, "nope"))).toBe("SCENARIO_NOT_FOUND");
  });
});
