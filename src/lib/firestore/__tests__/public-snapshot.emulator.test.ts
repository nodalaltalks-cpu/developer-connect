import { test } from "node:test";
import assert from "node:assert/strict";
import { Timestamp } from "firebase-admin/firestore";

const skip = !process.env.FIRESTORE_EMULATOR_HOST;

async function mod() {
  const snapshot = await import("../../developer-connect/firestore/public-snapshot.ts");
  const { getFirestoreDb } = await import("../client.ts");
  return { ...snapshot, db: getFirestoreDb() };
}

const rows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `dev-${i}`,
    data: { displayName: `Developer ${i}`, city: "Mumbai", isPublished: true, createdAt: Timestamp.fromMillis(1_700_000_000_000 + i), verified: { id: `c-${i}`, canonicalDomain: `d${i}.com`, reviewedAt: Timestamp.fromMillis(1_700_000_100_000) } },
  }));

test("snapshot: round-trips rows across several chunks, keeping dates and nested data", { skip }, async () => {
  const { db, writePublishedSnapshot, readPublishedSnapshot } = await mod();
  const input = rows(200); // 3 chunks of 80
  await writePublishedSnapshot(db, input, Date.now());
  const back = await readPublishedSnapshot(db);
  assert.ok(back);
  assert.equal(back.length, 200);
  assert.deepEqual(back.map((r) => r.id), input.map((r) => r.id));
  assert.equal((back[5].data.createdAt as Timestamp).toMillis(), 1_700_000_000_005);
  assert.equal((back[199].data.verified as { canonicalDomain: string }).canonicalDomain, "d199.com");
});

test("snapshot: a smaller rewrite replaces the older, larger copy", { skip }, async () => {
  const { db, writePublishedSnapshot, readPublishedSnapshot } = await mod();
  await writePublishedSnapshot(db, rows(200));
  await writePublishedSnapshot(db, rows(10));
  assert.equal((await readPublishedSnapshot(db))?.length, 10);
});

test("snapshot: stale and expired copies are not used; an empty directory is a valid copy", { skip }, async () => {
  const { db, writePublishedSnapshot, readPublishedSnapshot, markSnapshotStale, SNAPSHOT_MAX_AGE_MS } = await mod();
  await writePublishedSnapshot(db, rows(5));
  assert.equal((await readPublishedSnapshot(db))?.length, 5);
  assert.equal(await readPublishedSnapshot(db, Date.now() + SNAPSHOT_MAX_AGE_MS + 60_000), null, "expired");
  await markSnapshotStale(db);
  assert.equal(await readPublishedSnapshot(db), null, "marked stale");
  await writePublishedSnapshot(db, []);
  assert.deepEqual(await readPublishedSnapshot(db), []);
});
