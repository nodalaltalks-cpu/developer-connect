import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyFirestoreError,
  statusForLatency,
  runProbe,
  detectRisingLatency,
  nextQuotaReset,
} from "../firestore-probe.ts";

test("classifyFirestoreError tells quota, index, permission, timeout and unavailable apart", () => {
  assert.equal(classifyFirestoreError(Object.assign(new Error("8 RESOURCE_EXHAUSTED: Quota exceeded."), { code: 8 })).problem, "quota");
  assert.equal(classifyFirestoreError(new Error("The query requires an index. You can create it here")).problem, "index");
  assert.equal(classifyFirestoreError(Object.assign(new Error("x"), { code: 7 })).problem, "permission");
  assert.equal(classifyFirestoreError(Object.assign(new Error("x"), { code: 4 })).problem, "timeout");
  assert.equal(classifyFirestoreError(Object.assign(new Error("x"), { code: 14 })).problem, "unavailable");
  assert.equal(classifyFirestoreError(new Error("boom")).problem, "other");
});

test("statusForLatency warns early, before the page would call the database slow", () => {
  assert.equal(statusForLatency(40), "HEALTHY");
  assert.equal(statusForLatency(150), "HEALTHY");
  assert.equal(statusForLatency(151), "NEEDS_ATTENTION");
  assert.equal(statusForLatency(1000), "NEEDS_ATTENTION");
  assert.equal(statusForLatency(1001), "ACTION_REQUIRED");
});

test("runProbe reports latency on success and a classified problem on failure, and never throws", async () => {
  const ok = await runProbe({ id: "a", label: "A" }, async () => {});
  assert.equal(ok.problem, null);
  assert.equal(typeof ok.latencyMs, "number");

  const quota = await runProbe({ id: "a", label: "A" }, async () => {
    throw Object.assign(new Error("RESOURCE_EXHAUSTED"), { code: 8 });
  });
  assert.equal(quota.problem, "quota");
  assert.equal(quota.status, "ACTION_REQUIRED");
  assert.equal(quota.latencyMs, null);
});

test("runProbe times out a hanging read", async () => {
  const result = await runProbe({ id: "a", label: "A" }, () => new Promise(() => {}), 30);
  assert.equal(result.problem, "timeout");
});

test("detectRisingLatency needs history, ignores tiny absolute changes, and flags a real jump", () => {
  assert.equal(detectRisingLatency([20, 20, 20]).rising, false);
  assert.equal(detectRisingLatency([5, 5, 5, 5, 5, 12, 12, 12]).rising, false);
  const jump = detectRisingLatency([40, 45, 38, 42, 44, 40, 160, 170, 180]);
  assert.equal(jump.rising, true);
  assert.equal(jump.baselineMs, 41);
  assert.equal(detectRisingLatency([100, 110, 105, 100, 108, 104, 120, 118, 125]).rising, false);
});

test("nextQuotaReset is the next midnight Pacific time", () => {
  // 2026-11-20 08:00 UTC is midnight in Los Angeles (PST), so the next reset is 24h later.
  const justAfter = nextQuotaReset(new Date("2026-11-20T08:00:30Z"));
  assert.equal(justAfter.at.toISOString(), "2026-11-21T08:00:00.000Z");
  const before = nextQuotaReset(new Date("2026-11-20T07:00:00Z"));
  assert.equal(before.at.toISOString(), "2026-11-20T08:00:00.000Z");
  assert.equal(before.inMinutes, 60);
  assert.match(before.text, /12:00 Dubai time \/ 13:30 India time \(in 1h 0m\)/);
});
