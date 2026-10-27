import "server-only";
import { type App, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { type Firestore, getFirestore } from "firebase-admin/firestore";

/**
 * Firebase Admin is initialized lazily so builds do not require credentials.
 * Credential resolution order:
 *  1. Emulators (FIREBASE_AUTH_EMULATOR_HOST / FIRESTORE_EMULATOR_HOST set) — project ID only.
 *  2. Service account from FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY.
 *  3. Application Default Credentials (e.g. on Google Cloud / Firebase App Hosting).
 */
function adminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const usingEmulators = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST);
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (usingEmulators) return initializeApp({ projectId });
  if (clientEmail && privateKey) return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId });
  return initializeApp({ projectId });
}

const globalForDb = globalThis as unknown as { __rfsFirestore?: Firestore };

export function adminDb(): Firestore {
  if (!globalForDb.__rfsFirestore) {
    const db = getFirestore(adminApp());
    db.settings({ ignoreUndefinedProperties: true });
    globalForDb.__rfsFirestore = db;
  }
  return globalForDb.__rfsFirestore;
}

export function adminAuth() {
  return getAuth(adminApp());
}
