import { requireUser } from "@/lib/server/auth";
import { handler, json } from "@/lib/server/http";

export const runtime = "nodejs";

/** GET /api/me — current user and server-assigned role. */
export const GET = handler(async (req: Request) => {
  const user = await requireUser(req);
  return json({ user });
});
