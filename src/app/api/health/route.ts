import { PRODUCTS } from "@/domain/config/products";
import { resolveActiveConfig } from "@/domain/config/resolve";
import { json } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/health — API and configuration availability (no rates exposed). */
export async function GET() {
  const now = new Date();
  const products = PRODUCTS.map((p) => {
    const r = p.status === "BLOCKED" ? null : resolveActiveConfig(p, now);
    return { code: p.code, status: p.status, config: r === null ? "N/A" : r.ok ? "OK" : r.errorCode };
  });
  const healthy = products.every((p) => p.config === "OK" || p.config === "N/A");
  return json({ status: healthy ? "ok" : "degraded", time: now.toISOString(), products }, healthy ? 200 : 503);
}
