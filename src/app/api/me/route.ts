import { profileNameSchema } from "@/lib/profile";
import { requireUser, updateProfileName } from "@/lib/server/auth";
import { ApiError, handler, json, readJson } from "@/lib/server/http";
import { writeAudit } from "@/lib/server/scenarios";

export const runtime = "nodejs";

/** GET /api/me — current user profile and server-assigned role. */
export const GET = handler(async (req: Request) => {
  const user = await requireUser(req);
  return json({ user });
});

/** PATCH /api/me — update first and last name (audited). Role cannot be changed here. */
export const PATCH = handler(async (req: Request) => {
  const user = await requireUser(req);
  const parsed = profileNameSchema.safeParse(await readJson(req));
  if (!parsed.success) throw new ApiError(400, "MALFORMED_REQUEST", parsed.error.issues[0]?.message ?? "Invalid name.", parsed.error.issues);
  const updated = await updateProfileName(user, parsed.data);
  await writeAudit({
    user: updated,
    action: "PROFILE_NAME_UPDATED",
    entityType: "user",
    entityId: user.uid,
    before: { firstName: user.firstName, lastName: user.lastName },
    after: parsed.data,
  });
  return json({ user: updated });
});
