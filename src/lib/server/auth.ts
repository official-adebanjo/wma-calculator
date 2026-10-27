import "server-only";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { fullName, type ProfileNameInput, splitName, type UserProfile } from "@/lib/profile";
import type { Role } from "@/lib/roles";
import { ApiError } from "./http";

export type SessionUser = UserProfile;

function emailList(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Verifies the Firebase ID token from the Authorization header and loads the
 * user's profile. Roles come from ADMIN_EMAILS / REVIEWER_EMAILS env lists,
 * otherwise the stored profile, otherwise QA_TESTER. Clients cannot set roles.
 * Names default from the identity provider (e.g. Google) when not yet stored.
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
  const data = snap.exists ? snap.data() : undefined;
  const stored = data?.role as Role | undefined;

  let role: Role = stored ?? "QA_TESTER";
  if (email && emailList("ADMIN_EMAILS").includes(email)) role = "ADMIN";
  else if (email && emailList("REVIEWER_EMAILS").includes(email)) role = "REVIEWER";

  let firstName = (data?.firstName as string | undefined) ?? null;
  let lastName = (data?.lastName as string | undefined) ?? null;
  const fromProvider = !firstName && !lastName ? splitName(decoded.name as string | undefined) : null;
  if (fromProvider) ({ firstName, lastName } = fromProvider);

  if (!snap.exists || stored !== role || fromProvider) {
    const now = new Date().toISOString();
    await ref.set(
      { email, role, ...(fromProvider ?? {}), updatedAt: now, ...(snap.exists ? {} : { createdAt: now }) },
      { merge: true },
    );
  }

  if (allowed && !allowed.includes(role)) {
    throw new ApiError(403, "FORBIDDEN", "You do not have permission to access this resource.");
  }
  return { uid: decoded.uid, email, role, firstName, lastName, displayName: fullName(firstName, lastName) ?? email ?? decoded.uid };
}

/** Stores the user's name and mirrors it to the Firebase Auth display name. */
export async function updateProfileName(user: SessionUser, input: ProfileNameInput): Promise<SessionUser> {
  const displayName = fullName(input.firstName, input.lastName)!;
  await adminDb()
    .collection("users")
    .doc(user.uid)
    .set({ firstName: input.firstName, lastName: input.lastName, updatedAt: new Date().toISOString() }, { merge: true });
  await adminAuth().updateUser(user.uid, { displayName });
  return { ...user, firstName: input.firstName, lastName: input.lastName, displayName };
}
