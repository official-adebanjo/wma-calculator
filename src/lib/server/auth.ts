import "server-only";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import type { Role } from "@/lib/roles";
import { ApiError } from "./http";

export interface SessionUser {
  uid: string;
  email: string | null;
  role: Role;
}

function emailList(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Verifies the Firebase ID token from the Authorization header and loads the
 * user's role. Roles come from ADMIN_EMAILS / REVIEWER_EMAILS env lists,
 * otherwise the stored profile, otherwise QA_TESTER. Clients cannot set roles.
 */
export async function requireUser(req: Request, allowed?: Role[]): Promise<SessionUser> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new ApiError(401, "UNAUTHENTICATED", "Sign in required.");

  let decoded;
  try {
    decoded = await adminAuth().verifyIdToken(token);
  } catch {
    throw new ApiError(401, "UNAUTHENTICATED", "Session is invalid or expired. Sign in again.");
  }

  const email = decoded.email?.toLowerCase() ?? null;
  const ref = adminDb().collection("users").doc(decoded.uid);
  const snap = await ref.get();
  const stored = snap.exists ? (snap.data()?.role as Role | undefined) : undefined;

  let role: Role = stored ?? "QA_TESTER";
  if (email && emailList("ADMIN_EMAILS").includes(email)) role = "ADMIN";
  else if (email && emailList("REVIEWER_EMAILS").includes(email)) role = "REVIEWER";

  if (!snap.exists || stored !== role) {
    await ref.set({ email, role, updatedAt: new Date().toISOString(), ...(snap.exists ? {} : { createdAt: new Date().toISOString() }) }, { merge: true });
  }

  if (allowed && !allowed.includes(role)) {
    throw new ApiError(403, "FORBIDDEN", "You do not have permission to access this resource.");
  }
  return { uid: decoded.uid, email, role };
}
