import "server-only";
import { createHash } from "node:crypto";
import { getProduct } from "@/domain/config/products";
import { dec } from "@/domain/money";
import type { CalculationResult } from "@/domain/types";
import { adminDb } from "@/lib/firebase/admin";
import { type QaNotes, type QaNotesInput, type Scenario, type ScenarioListItem, scenarioNameKey } from "@/lib/scenario-types";
import type { SessionUser } from "./auth";
import { ApiError } from "./http";

const SCENARIOS = "scenarios";
/** One document per (user, normalised scenario name): enforces unique names. */
const SCENARIO_NAMES = "scenarioNames";
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
      userName: event.user.displayName,
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
function nameReservation(userId: string, key: string) {
  return adminDb().collection(SCENARIO_NAMES).doc(createHash("sha256").update(`${userId}\u0000${key}`).digest("hex"));
}

export function canDeleteScenario(user: SessionUser, scenario: Pick<Scenario, "userId">): boolean {
  return scenario.userId === user.uid || user.role === "ADMIN";
}

function duplicateNameError(name: string) {
  return new ApiError(409, "DUPLICATE_SCENARIO_NAME", `You already have a scenario named "${name}". Choose a different name.`, { field: "name" });
}

/**
 * Saves an immutable snapshot of a server-computed result. Names are unique per
 * tester (ignoring case and spacing), enforced in a transaction:
 * - a reservation document keyed by (user, name) is created with tx.create, so
 *   two simultaneous saves of the same name cannot both succeed;
 * - the tester's existing scenarios are also checked, covering scenarios saved
 *   before reservations existed.
 */
export async function createScenario(user: SessionUser, name: string, result: CalculationResult): Promise<Scenario> {
  const configSnapshot = getProduct(result.productCode)?.versions.find((v) => v.id === result.configVersionId) ?? null;
  const db = adminDb();
  const ref = db.collection(SCENARIOS).doc();
  const key = scenarioNameKey(name);
  const nameRef = nameReservation(user.uid, key);
  const scenario: Scenario = {
    id: ref.id,
    name,
    userId: user.uid,
    userEmail: user.email,
    userName: user.displayName,
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
  await db.runTransaction(async (tx) => {
    const [reserved, mine] = await Promise.all([tx.get(nameRef), tx.get(db.collection(SCENARIOS).where("userId", "==", user.uid).select("name"))]);
    if (reserved.exists || mine.docs.some((d) => scenarioNameKey(String(d.get("name") ?? "")) === key)) throw duplicateNameError(name);
    // create() fails if a document exists, so neither the snapshot nor the name can be overwritten.
    tx.create(nameRef, { userId: user.uid, nameKey: key, scenarioId: ref.id, createdAt: scenario.createdAt });
    tx.create(ref, scenario);
  }).catch((err) => {
    // A concurrent save that reserved the same name first surfaces as ALREADY_EXISTS (gRPC 6).
    if (err instanceof ApiError) throw err;
    if ((err as { code?: number }).code === 6) throw duplicateNameError(name);
    throw err;
  });
  await writeAudit({ user, action: "SCENARIO_CREATED", entityType: "scenario", entityId: ref.id, after: { name, calculationId: result.calculationId, configVersionId: result.configVersionId } });
  return scenario;
}

const LIST_FIELDS = ["id", "name", "userId", "userEmail", "userName", "productCode", "productName", "status", "configVersionId", "calculationId", "createdAt", "result", "qaNotes"];

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

  const notes: QaNotes = { ...input, updatedAt: new Date().toISOString(), updatedBy: user.displayName };
  const expected = input.comparedField ? scenario.result.summary.find((s) => s.key === input.comparedField) : undefined;
  if (expected?.kind === "money") {
    notes.expectedValue = expected.value;
    if (input.observedValue) notes.difference = dec(input.observedValue).minus(expected.value).toFixed(2);
  }

  await ref.update({ qaNotes: notes });
  await writeAudit({ user, action: "SCENARIO_QA_NOTES_UPDATED", entityType: "scenario", entityId: id, before: scenario.qaNotes, after: notes });
  return { ...scenario, qaNotes: notes };
}

/**
 * Permanently deletes a scenario (owner or admin only) and releases its name.
 * The deletion is audited with enough detail to identify what was removed.
 */
export async function deleteScenario(user: SessionUser, id: string): Promise<void> {
  const db = adminDb();
  const ref = db.collection(SCENARIOS).doc(id);
  const removed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ApiError(404, "SCENARIO_NOT_FOUND", "Scenario not found.");
    const scenario = snap.data() as Scenario;
    if (scenario.userId !== user.uid && !canSeeAll(user)) throw new ApiError(404, "SCENARIO_NOT_FOUND", "Scenario not found.");
    if (!canDeleteScenario(user, scenario)) throw new ApiError(403, "FORBIDDEN", "Only the scenario owner or an administrator can delete it.");
    const nameRef = nameReservation(scenario.userId, scenarioNameKey(scenario.name));
    const reservation = await tx.get(nameRef);
    tx.delete(ref);
    // Release the name only if it is reserved for this scenario.
    if (reservation.exists && reservation.get("scenarioId") === id) tx.delete(nameRef);
    return scenario;
  });
  await writeAudit({
    user,
    action: "SCENARIO_DELETED",
    entityType: "scenario",
    entityId: id,
    before: {
      name: removed.name,
      owner: removed.userName ?? removed.userEmail ?? removed.userId,
      productCode: removed.productCode,
      status: removed.status,
      calculationId: removed.calculationId,
      configVersionId: removed.configVersionId,
      createdAt: removed.createdAt,
      qaNotes: removed.qaNotes,
    },
  });
}

export async function listAudit(limit = 200) {
  const snap = await adminDb().collection(AUDIT).orderBy("createdAt", "desc").limit(limit).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
