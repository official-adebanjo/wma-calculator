import { requireUser } from "@/lib/server/auth";
import { productSummaries } from "@/lib/server/catalogue";
import { handler, json } from "@/lib/server/http";

export const runtime = "nodejs";

/** GET /api/products — catalogue with calculation status. */
export const GET = handler(async (req: Request) => {
  await requireUser(req);
  return json({ products: productSummaries() });
});
