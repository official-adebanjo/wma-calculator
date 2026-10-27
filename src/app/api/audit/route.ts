import { requireUser } from "@/lib/server/auth";
import { handler, json } from "@/lib/server/http";
import { listAudit } from "@/lib/server/scenarios";

export const runtime = "nodejs";

/** GET /api/audit — administrator-only audit trail. */
export const GET = handler(async (req: Request) => {
  await requireUser(req, ["ADMIN"]);
  return json({ events: await listAudit() });
});
