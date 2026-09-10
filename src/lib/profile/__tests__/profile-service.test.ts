import { test } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryProfileRepository } from "../memory-repository.ts";
import { getOrCreateProfile, updateProfileFields } from "../profile-service.ts";
import { noopAnalyticsSink } from "../../developer-connect/events.ts";
import type { AnalyticsEventSink, AnalyticsEvent } from "../../developer-connect/events.ts";

const analytics = { sink: noopAnalyticsSink, sessionId: "test-session" };

test("getOrCreateProfile: creates an empty profile shell on first access", async () => {
  const repo = createInMemoryProfileRepository();
  const { profile, completion } = await getOrCreateProfile(repo, "user-1", analytics);

  assert.equal(profile.userId, "user-1");
  assert.deepEqual(profile.data, {});
  assert.equal(completion.percentage, 0); // real fields are configured (Phase 3B) — an empty profile is 0%, not null
});

test("getOrCreateProfile: fires profile_started only on first creation, not on subsequent fetches", async () => {
  const repo = createInMemoryProfileRepository();
  const recorded: AnalyticsEvent[] = [];
  const sink: AnalyticsEventSink = { record: (event) => void recorded.push(event) };

  await getOrCreateProfile(repo, "user-1", { sink, sessionId: "s" });
  await getOrCreateProfile(repo, "user-1", { sink, sessionId: "s" });
  await getOrCreateProfile(repo, "user-1", { sink, sessionId: "s" });

  const startedEvents = recorded.filter((e) => e.eventName === "profile_started");
  assert.equal(startedEvents.length, 1);
});

test("updateProfileFields: a profile belongs to exactly one user — updating one user's profile never touches another's", async () => {
  const repo = createInMemoryProfileRepository();
  await updateProfileFields(repo, "user-1", { note: "for user 1" }, analytics);
  await updateProfileFields(repo, "user-2", { note: "for user 2" }, analytics);

  const user1 = await repo.getByUserId("user-1");
  const user2 = await repo.getByUserId("user-2");

  assert.equal(user1?.data.note, "for user 1");
  assert.equal(user2?.data.note, "for user 2");
});

test("updateProfileFields: updating one field never overwrites previously set unrelated fields", async () => {
  const repo = createInMemoryProfileRepository();
  await updateProfileFields(repo, "user-1", { fieldA: "first" }, analytics);
  await updateProfileFields(repo, "user-1", { fieldB: "second" }, analytics);

  const profile = await repo.getByUserId("user-1");
  assert.deepEqual(profile?.data, { fieldA: "first", fieldB: "second" });
});

test("updateProfileFields: updating a field again overwrites only that field's own value", async () => {
  const repo = createInMemoryProfileRepository();
  await updateProfileFields(repo, "user-1", { fieldA: "first", fieldB: "keep me" }, analytics);
  await updateProfileFields(repo, "user-1", { fieldA: "updated" }, analytics);

  const profile = await repo.getByUserId("user-1");
  assert.deepEqual(profile?.data, { fieldA: "updated", fieldB: "keep me" });
});

test("updateProfileFields: partial completion persists and survives repeated reads (simulating logout/login)", async () => {
  const repo = createInMemoryProfileRepository();
  await updateProfileFields(repo, "user-1", { fieldA: "value" }, analytics);

  // Simulate "logging back in" — a fresh read with no prior in-memory reference.
  const rehydrated = await repo.getByUserId("user-1");
  assert.deepEqual(rehydrated?.data, { fieldA: "value" });
});

test("updateProfileFields: always fires profile_updated", async () => {
  const repo = createInMemoryProfileRepository();
  const recorded: AnalyticsEvent[] = [];
  const sink: AnalyticsEventSink = { record: (event) => void recorded.push(event) };

  await updateProfileFields(repo, "user-1", { fieldA: "value" }, { sink, sessionId: "s" });

  assert.ok(recorded.some((e) => e.eventName === "profile_updated"));
});

test("a failing analytics sink never breaks a profile update (safeRecordAnalyticsEvent boundary)", async () => {
  const repo = createInMemoryProfileRepository();
  const throwingSink: AnalyticsEventSink = {
    record: () => {
      throw new Error("simulated analytics outage");
    },
  };

  const { profile } = await updateProfileFields(
    repo,
    "user-1",
    { fieldA: "value" },
    { sink: throwingSink, sessionId: "s" },
  );

  assert.equal(profile.data.fieldA, "value");
});
