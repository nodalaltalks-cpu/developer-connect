import { test } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryRepositories } from "../memory-repository.ts";
import { createDeveloper } from "../developer-service.ts";
import { getVerificationQueuePage } from "../verification-queue.ts";
import type { VerificationStatus } from "../types.ts";

const STATUS_CYCLE: VerificationStatus[] = [
  "DISCOVERED",
  "PENDING_VERIFICATION",
  "NEEDS_REVERIFICATION",
  "VERIFIED",
  "REJECTED",
];

async function seedQueue(count: number) {
  const repos = createInMemoryRepositories();
  const pendingIds: string[] = [];
  const names = new Map<string, string>();
  for (let i = 0; i < count; i++) {
    const developer = await createDeveloper(repos.developers, {
      legalName: null,
      displayName: `Test Queue Co ${i}`,
      city: "Mumbai",
      state: "Maharashtra",
      country: "India",
    });
    const status = STATUS_CYCLE[i % STATUS_CYCLE.length];
    const candidate = await repos.candidates.create({
      developerId: developer.id,
      url: `https://queue-${i}.example`,
      canonicalDomain: `queue-${i}.example`,
      discoverySource: "MANUAL_SUBMISSION",
      verificationStatus: status,
      confidenceScore: 0,
    });
    if (status !== "VERIFIED" && status !== "REJECTED") pendingIds.push(candidate.id);
    names.set(candidate.id, developer.displayName);
  }
  return { repos, pendingIds, names };
}

test("verification queue: returns one page at a time with the whole queue's total, only pending statuses, and each row's developer name", async () => {
  const { repos, pendingIds, names } = await seedQueue(40); // 24 pending, 16 verified/rejected
  const first = await getVerificationQueuePage(repos, 0, 10);
  assert.equal(first.rows.length, 10, "only one page of rows");
  assert.equal(first.total, pendingIds.length);
  for (const row of first.rows) {
    assert.ok(["DISCOVERED", "PENDING_VERIFICATION", "NEEDS_REVERIFICATION"].includes(row.candidate.verificationStatus));
    assert.equal(row.developerName, names.get(row.candidate.id));
  }
});

test("verification queue: walking every page reaches each pending candidate exactly once — no duplicates, none missing", async () => {
  const { repos, pendingIds } = await seedQueue(53);
  const seen: string[] = [];
  let total = Infinity;
  while (seen.length < total) {
    const page = await getVerificationQueuePage(repos, seen.length, 10);
    total = page.total;
    if (page.rows.length === 0) break;
    seen.push(...page.rows.map((row) => row.candidate.id));
  }
  assert.equal(seen.length, pendingIds.length);
  assert.equal(new Set(seen).size, pendingIds.length, "no candidate appears twice");
  assert.deepEqual(new Set(seen), new Set(pendingIds), "every pending candidate is reachable");
});

test("verification queue: an offset past the end returns no rows, and an empty queue reports a zero total", async () => {
  const { repos, pendingIds } = await seedQueue(7);
  const past = await getVerificationQueuePage(repos, pendingIds.length, 10);
  assert.equal(past.rows.length, 0);
  assert.equal(past.total, pendingIds.length);

  const empty = await getVerificationQueuePage(createInMemoryRepositories(), 0, 10);
  assert.deepEqual(empty, { rows: [], total: 0 });
});
