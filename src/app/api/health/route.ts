import { PRODUCTS } from "@/domain/config/products";
import { resolveActiveConfig } from "@/domain/config/resolve";
import { json } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function short(err: unknown): string {
  const e = err as { code?: string; name?: string; message?: string };
  return `${e?.code ?? e?.name ?? "Error"}: ${String(e?.message ?? err).slice(0, 240)}`;
}

/**
 * Checks Firebase Admin without exposing secrets: whether the SDK module loads
 * (imported dynamically so this route works even if it does not), whether the
 * credential env vars are present, and whether Google accepts the credential.
 */
async function firebaseStatus() {
  const key = process.env.FIREBASE_PRIVATE_KEY ?? "";
  const env = {
    projectId: Boolean(process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
    clientEmail: Boolean(process.env.FIREBASE_CLIENT_EMAIL),
    privateKey: key.length > 0,
    privateKeyLooksLikePem: key.replace(/\\n/g, "\n").includes("-----BEGIN PRIVATE KEY-----\n"),
  };
  let sdk = "ok";
  let credential = "not checked";
  try {
    const { adminApp } = await import("@/lib/firebase/admin");
    const app = adminApp();
    try {
      const token = await Promise.race([
        app.options.credential?.getAccessToken(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timed out")), 8000)),
      ]);
      credential = token ? "ok" : "no credential configured";
    } catch (err) {
      credential = short(err);
    }
  } catch (err) {
    sdk = short(err);
  }
  return { sdk, credential, env };
}

/** GET /api/health — API, configuration and Firebase Admin availability (no rates or secrets). */
export async function GET() {
  const now = new Date();
  const products = PRODUCTS.map((p) => {
    const r = p.status === "BLOCKED" ? null : resolveActiveConfig(p, now);
    return { code: p.code, status: p.status, config: r === null ? "N/A" : r.ok ? "OK" : r.errorCode };
  });
  const firebase = await firebaseStatus();
  const healthy = products.every((p) => p.config === "OK" || p.config === "N/A") && firebase.sdk === "ok" && firebase.credential === "ok";
  return json({ status: healthy ? "ok" : "degraded", time: now.toISOString(), firebase, products }, healthy ? 200 : 503);
}
