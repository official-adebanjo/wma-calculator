import { calculate } from "@/domain/calculate";
import { qaOptionsSchema } from "@/domain/inputs";
import { createScenarioSchema } from "@/lib/scenario-types";
import { requireUser } from "@/lib/server/auth";
import { ApiError, handler, json, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { createScenario, listScenarios } from "@/lib/server/scenarios";

export const runtime = "nodejs";

/** GET /api/scenarios — scenarios visible to the current user. */
export const GET = handler(async (req: Request) => {
  const user = await requireUser(req);
  return json({ scenarios: await listScenarios(user) });
});

/**
 * POST /api/scenarios — saves a named scenario. The server recalculates from
 * the submitted inputs; a client-supplied result is never trusted.
 */
export const POST = handler(async (req: Request) => {
  const user = await requireUser(req);
  rateLimit(`save:${user.uid}`, 30);

  const parsed = createScenarioSchema.safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError(400, "MALFORMED_REQUEST", "Invalid scenario request.", parsed.error.issues);
  const qa = qaOptionsSchema.safeParse(parsed.data.qaOptions ?? {});
  if (!qa.success) throw new ApiError(400, "MALFORMED_REQUEST", "Invalid QA options.", qa.error.issues);

  const result = calculate(parsed.data.productCode, parsed.data.inputs, qa.data);
  if (result.status === "ERROR") {
    throw new ApiError(400, result.errorCode ?? "VALIDATION_FAILED", "Cannot save a scenario with invalid inputs.", result.fieldErrors);
  }
  const scenario = await createScenario(user, parsed.data.name, result);
  return json({ scenario }, 201);
});
