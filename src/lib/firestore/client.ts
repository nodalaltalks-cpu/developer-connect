import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore as getAdminFirestore, type Firestore } from "firebase-admin/firestore";

/**
 * Lazily-initialized Firestore (Admin SDK). Lazy for the same reason as the Postgres client: Next.js evaluates module
 * code during `next build`, so nothing here may touch credentials at import time.
 *
 * Credentials: FIREBASE_SERVICE_ACCOUNT is the service-account JSON, either raw or base64-encoded (Vercel env values
 * are easier to paste as base64). Against the local emulator (FIRESTORE_EMULATOR_HOST set) no credentials are needed,
 * only a project id (FIREBASE_PROJECT_ID, default "demo-developer-connect").
 */

/**
 * The Firestore instance is kept on `globalThis`, not in a module variable: Next.js bundles server code into several
 * chunks and can evaluate this module more than once, and Firestore allows `settings()` to be called only once per
 * instance. Sharing one instance across every copy of the module makes that impossible to trip.
 */
const globalState = globalThis as unknown as { __developerConnectFirestore?: Firestore };

function parseServiceAccount(raw: string): Record<string, string> {
  const text = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  return JSON.parse(text) as Record<string, string>;
}

function initializeApplication(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  if (process.env.FIRESTORE_EMULATOR_HOST) return initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID ?? "demo-developer-connect" });
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not set (and FIRESTORE_EMULATOR_HOST is not set). See docs/firestore-cutover-runbook.md.");
  }
  const account = parseServiceAccount(raw);
  return initializeApp({ credential: cert(account as never), projectId: account.project_id });
}

export function getFirestoreDb(): Firestore {
  if (globalState.__developerConnectFirestore) return globalState.__developerConnectFirestore;
  const firestore = getAdminFirestore(initializeApplication());
  try {
    // A missing optional field must never be stored as `undefined` (Firestore rejects it); null is the shared meaning of "absent".
    firestore.settings({ ignoreUndefinedProperties: true });
  } catch {
    // Already configured by another copy of this module that raced us to it: the instance is shared, so the setting holds.
  }
  globalState.__developerConnectFirestore = firestore;
  return firestore;
}
