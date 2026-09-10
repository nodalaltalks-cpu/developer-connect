import { test } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryNotificationRepository } from "../memory-repository.ts";
import { maybeNotifyProfileCompletion } from "../profile-completion-notifier.ts";
import { calculateProfileCompletion } from "../../profile/completion.ts";
import { PROFILE_FIELD_CONFIG } from "../../profile/field-config.ts";

/** Fills every field in every section except the ones listed in `except`. */
function dataMissingOnly(exceptKeys: string[]): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const field of PROFILE_FIELD_CONFIG) {
    if (!exceptKeys.includes(field.key)) data[field.key] = "x";
  }
  return data;
}

test("profile-completion-notifier: does not notify below 50% complete", async () => {
  const repo = createInMemoryNotificationRepository();
  const completion = calculateProfileCompletion({});
  await maybeNotifyProfileCompletion(repo, "user-1", completion, {});
  assert.equal(await repo.countUnreadForUser("user-1"), 0);
});

test("profile-completion-notifier: does not notify at 100% complete — nothing left to nudge about", async () => {
  const repo = createInMemoryNotificationRepository();
  const data = dataMissingOnly([]);
  const completion = calculateProfileCompletion(data);
  assert.equal(completion.percentage, 100);
  await maybeNotifyProfileCompletion(repo, "user-1", completion, data);
  assert.equal(await repo.countUnreadForUser("user-1"), 0);
});

test("profile-completion-notifier: notifies once meaningfully in progress, naming the next incomplete section", async () => {
  const repo = createInMemoryNotificationRepository();
  // Leave every "preferred-locations" field (there's exactly one) missing;
  // everything else filled — comfortably above 50%.
  const data = dataMissingOnly(["preferredLocations"]);
  const completion = calculateProfileCompletion(data);
  assert.ok((completion.percentage ?? 0) >= 50);

  await maybeNotifyProfileCompletion(repo, "user-1", completion, data);

  const list = await repo.listForUser("user-1");
  assert.equal(list.length, 1);
  assert.ok(list[0].body.includes("Preferred Locations"));
  assert.equal(list[0].targetRoute, "/profile");
});

test("profile-completion-notifier: never creates a second notification while one is still unread (anti-spam)", async () => {
  const repo = createInMemoryNotificationRepository();
  const data = dataMissingOnly(["preferredLocations"]);
  const completion = calculateProfileCompletion(data);

  await maybeNotifyProfileCompletion(repo, "user-1", completion, data);
  await maybeNotifyProfileCompletion(repo, "user-1", completion, data);
  await maybeNotifyProfileCompletion(repo, "user-1", completion, data);

  assert.equal((await repo.listForUser("user-1")).length, 1);
});

test("profile-completion-notifier: a new notification can be generated again after the previous one is read", async () => {
  const repo = createInMemoryNotificationRepository();
  const data = dataMissingOnly(["preferredLocations"]);
  const completion = calculateProfileCompletion(data);

  await maybeNotifyProfileCompletion(repo, "user-1", completion, data);
  const [first] = await repo.listForUser("user-1");
  await repo.markRead(first.id, "user-1");

  await maybeNotifyProfileCompletion(repo, "user-1", completion, data);
  assert.equal((await repo.listForUser("user-1")).length, 2);
});

test("profile-completion-notifier: respects the user's own notifyProfileCompletionTips = false toggle", async () => {
  const repo = createInMemoryNotificationRepository();
  const data = dataMissingOnly(["preferredLocations"]);
  data.notifyProfileCompletionTips = false;
  const completion = calculateProfileCompletion(data);

  await maybeNotifyProfileCompletion(repo, "user-1", completion, data);
  assert.equal(await repo.countUnreadForUser("user-1"), 0);
});
