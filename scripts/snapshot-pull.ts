/**
 * Rewrites src/data/published-snapshot.json from Firestore: the published developers that public pages are built from.
 *
 *   npm run snapshot:pull
 *
 * Costs one Firestore read per published developer (about 1,240), once. Needs FIREBASE_SERVICE_ACCOUNT (in .env.local).
 *
 * It also runs before every build (`npm run build`) in --soft mode. On Vercel that refreshes the file from Firestore with the
 * project's own credentials, so every deployment ships current data. In --soft mode any problem (no credentials, quota,
 * suspiciously few developers) is only logged and the build carries on with the file already in the project.
 * It never writes an empty file, and never replaces a good one with one that has lost more than a fifth of the developers.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { getFirestoreDb } from "../src/lib/firestore/client.ts";
import { encodeRows } from "../src/lib/developer-connect/firestore/static-published.ts";

const SOFT = process.argv.includes("--soft");
const OUT = resolve(process.cwd(), "src/data/published-snapshot.json");

async function main(): Promise<void> {
  if (SOFT && !process.env.FIREBASE_SERVICE_ACCOUNT && !process.env.FIRESTORE_EMULATOR_HOST) {
    console.log("snapshot: no Firestore credentials in this environment; keeping the file in the project.");
    return;
  }

  const db = getFirestoreDb();
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Firestore did not answer within 90 seconds.")), 90_000).unref());
  const snap = await Promise.race([db.collection("developers").where("isPublished", "==", true).get(), timeout]);
  const rows = snap.docs.map((d) => ({ id: d.id, data: d.data() })).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (rows.length === 0) throw new Error("Firestore returned no published developers; leaving the file as it is.");

  let previous = 0;
  if (existsSync(OUT)) {
    try {
      previous = (JSON.parse(readFileSync(OUT, "utf8")) as { count?: number }).count ?? 0;
    } catch {
      previous = 0;
    }
  }
  if (previous > 50 && rows.length < previous * 0.8) {
    throw new Error(`Only ${rows.length} published developers now, against ${previous} in the file. Check Firestore before overwriting.`);
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ builtAt: new Date().toISOString(), count: rows.length, rows: encodeRows(rows) }) + "\n");
  console.log(`snapshot: wrote ${rows.length} published developers to src/data/published-snapshot.json (was ${previous}).`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  if (SOFT) {
    console.warn(`snapshot: could not refresh, keeping the file in the project: ${message}`);
    return;
  }
  console.error(message);
  process.exit(1);
});
