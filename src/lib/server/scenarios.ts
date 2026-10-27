import "server-only";
import { getProduct } from "@/domain/config/products";
import { dec } from "@/domain/money";
import type { CalculationResult } from "@/domain/types";
import { adminDb } from "@/lib/firebase/admin";
import type { QaNotes, QaNotesInput, Scenario, ScenarioListItem } from "@/lib/scenario-types";
import type { SessionUser } from "./auth";
import { ApiError } from "./http";

const SCENARIOS = "scenarios";
const AUDIT = "auditEvents";

export async function writeAudit(event: {
  user: SessionUser;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
}) {
  await adminDb()
    .collection(AUDIT)
    .add({
      userId: event.user.uid,
      userEmail: event.user.email,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      beforeSnapshot: event.before ?? null,
      afterSnapshot: event.after ?? null,
      reason: event.reason ?? null,
      createdAt: new Date().toISOString(),
    });
}

function canSeeAll(user: SessionUser) {
  return user.role === "REVIEWER" || user.role === "ADMIN";
}

/** Saves an immutable snapshot of a server-computed result. */
export async function createScenario(user: SessionUser, name: string, result: CalculationResult): Promise<Scenario> {
  const configSnapshot = getProduct(result.productCode)?.versions.find((v) => v.id === result.configVersionId) ?? null;
  const ref = adminDb().collection(SCENARIOS).doc();
  const scenario: Scenario = {
    id: ref.id,
    name,
    userId: user.uid,
    userEmail: user.email,
    productCode: result.productCode,
    productName: result.productName,
    status: result.status,
    configVersionId: result.configVersionId,
    calculationId: result.calculationId,
    createdAt: new Date().toISOString(),
    result,
    configSnapshot,
    qaNotes: null,
  };
  // create() fails if the document exists, so a snapshot can never be overwritten.
  await ref.create(scenario);
  await writeAudit({ user, action: "SCENARIO_CREATED", entityType: "scenario", entityId: ref.id, after: { name, calculationId: result.calculationId, configVersionId: result.configVersionId } });
  return scenario;
}

const LIST_FIELDS = ["id", "name", "userId", "userEmail", "productCode", "productName", "status", "configVersionId", "calculationId", "createdAt", "result", "qaNotes"];

export async function listScenarios(user: SessionUser, limit = 200): Promise<ScenarioListItem[]> {
  const col = adminDb().collection(SCENARIOS);
  if (canSeeAll(user)) {
    const snap = await col.orderBy("createdAt", "desc").limit(limit).select(...LIST_FIELDS).get();
    return snap.docs.map((d) => d.data() as ScenarioListItem);
  }
  // Equality filter only, sorted in memory: avoids requiring a composite
  // (userId, createdAt) index in a Firebase project that may be shared.
  const snap = await col.where("userId", "==", user.uid).select(...LIST_FIELDS).get();
  return snap.docs
    .map((d) => d.data() as ScenarioListItem)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export async function getScenario(user: SessionUser, id: string): Promise<Scenario> {
  const snap = await adminDb().collection(SCENARIOS).doc(id).get();
  if (!snap.exists) throw new ApiError(404, "SCENARIO_NOT_FOUND", "Scenario not found.");
  const scenario = snap.data() as Scenario;
  if (scenario.userId !== user.uid && !canSeeAll(user)) throw new ApiError(404, "SCENARIO_NOT_FOUND", "Scenario not found.");
  return scenario;
}

/** Updates tester notes only; the calculation snapshot is never modified. */
export async function updateQaNotes(user: SessionUser, id: string, input: QaNotesInput): Promise<Scenario> {
  const ref = adminDb().collection(SCENARIOS).doc(id);
  const scenario = await getScenario(user, id);
  if (scenario.userId !== user.uid && user.role !== "ADMIN") {
    throw new ApiError(403, "FORBIDDEN", "Only the scenario owner can edit QA notes.");
  }

  const notes: QaNotes = { ...input, updatedAt: new Date().toISOString(), updatedBy: user.email ?? user.uid };
  const expected = input.comparedField ? scenario.result.summary.find((s) => s.key === input.comparedField) : undefined;
  if (expected?.kind === "money") {
    notes.expectedValue = expected.value;
    if (input.observedValue) notes.difference = dec(input.observedValue).minus(expected.value).toFixed(2);
  }

  await ref.update({ qaNotes: notes });
  await writeAudit({ user, action: "SCENARIO_QA_NOTES_UPDATED", entityType: "scenario", entityId: id, before: scenario.qaNotes, after: notes });
  return { ...scenario, qaNotes: notes };
}

export async function listAudit(limit = 200) {
  const snap = await adminDb().collection(AUDIT).orderBy("createdAt", "desc").limit(limit).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
