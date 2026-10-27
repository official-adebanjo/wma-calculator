import { qaNotesSchema } from "@/lib/scenario-types";
import { requireUser } from "@/lib/server/auth";
import { ApiError, handler, json, readJson } from "@/lib/server/http";
import { getScenario, updateQaNotes } from "@/lib/server/scenarios";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/scenarios/{id} — immutable saved snapshot. */
export const GET = handler(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  return json({ scenario: await getScenario(user, id) });
});

/** PATCH /api/scenarios/{id} — updates tester QA notes only (audited). */
export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const body = (await readJson(req)) as { qaNotes?: unknown };
  const parsed = qaNotesSchema.safeParse(body?.qaNotes);
  if (!parsed.success) throw new ApiError(400, "MALFORMED_REQUEST", "Invalid QA notes.", parsed.error.issues);
  return json({ scenario: await updateQaNotes(user, id, parsed.data) });
});
