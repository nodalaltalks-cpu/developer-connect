import { test } from "node:test";
import assert from "node:assert/strict";
import { Timestamp } from "firebase-admin/firestore";
import { decodeRows, encodeRows } from "../firestore/static-published.ts";

test("encodeRows turns Timestamps and Dates into plain JSON and decodeRows brings Timestamps back", () => {
  const when = new Date("2026-11-20T10:00:00.000Z");
  const rows = [
    { id: "a", data: { displayName: "Lodha", slug: "lodha", createdAt: Timestamp.fromDate(when), verified: { id: "c1", reviewedAt: when, note: null }, tags: ["x", { d: Timestamp.fromDate(when) }] } },
  ];
  const json = JSON.parse(JSON.stringify(encodeRows(rows)));
  assert.deepEqual(json[0].data.createdAt, { $ts: "2026-11-20T10:00:00.000Z" });
  assert.deepEqual(json[0].data.verified.reviewedAt, { $ts: "2026-11-20T10:00:00.000Z" });
  const back = decodeRows(json) as typeof rows;
  assert.ok(back[0].data.createdAt instanceof Timestamp);
  assert.equal(back[0].data.createdAt.toDate().toISOString(), when.toISOString());
  assert.ok((back[0].data.verified.reviewedAt as unknown) instanceof Timestamp);
  assert.equal(back[0].data.verified.note, null);
  assert.equal(back[0].data.slug, "lodha");
});

test("encodeRows drops undefined fields and leaves plain values alone", () => {
  const out = encodeRows({ a: 1, b: undefined, c: "x", d: [1, 2], e: null }) as Record<string, unknown>;
  assert.deepEqual(out, { a: 1, c: "x", d: [1, 2], e: null });
});

test("the public pages read published developers from the shipped file, with a switch back to Firestore", async () => {
  const { readFileSync } = await import("node:fs");
  const repo = readFileSync(new URL("../firestore/firestore-repository.ts", import.meta.url), "utf8");
  assert.match(repo, /staticPublishedRows/);
  assert.match(repo, /export function createPublicFirestoreRepositories/);
  const cached = readFileSync(new URL("../cached-public.ts", import.meta.url), "utf8");
  assert.doesNotMatch(cached, /createPostgresRepositories/);
  const staticFile = readFileSync(new URL("../firestore/static-published.ts", import.meta.url), "utf8");
  assert.match(staticFile, /PUBLIC_DATA_SOURCE === "firestore"/);
});
