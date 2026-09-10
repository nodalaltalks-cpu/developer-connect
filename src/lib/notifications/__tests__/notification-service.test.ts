import { test } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryNotificationRepository } from "../memory-repository.ts";
import {
  listNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from "../notification-service.ts";
import { NotFoundError } from "../../developer-connect/errors.ts";

test("notification-service: a created notification is unread by default and appears newest-first", async () => {
  const repo = createInMemoryNotificationRepository();
  await repo.create({ userId: "user-1", type: "PROFILE_COMPLETION", title: "First", body: "..." });
  await repo.create({ userId: "user-1", type: "PROFILE_COMPLETION", title: "Second", body: "..." });

  const list = await listNotifications(repo, "user-1");
  assert.equal(list.length, 2);
  assert.equal(list[0].title, "Second");
  assert.equal(list.every((n) => n.read === false), true);
});

test("notification-service: unread count reflects only this user's unread notifications", async () => {
  const repo = createInMemoryNotificationRepository();
  await repo.create({ userId: "user-1", type: "PROFILE_COMPLETION", title: "A", body: "..." });
  await repo.create({ userId: "user-1", type: "PROFILE_COMPLETION", title: "B", body: "..." });
  await repo.create({ userId: "user-2", type: "PROFILE_COMPLETION", title: "C", body: "..." });

  assert.equal(await getUnreadCount(repo, "user-1"), 2);
  assert.equal(await getUnreadCount(repo, "user-2"), 1);
});

test("notification-service: marking read updates unread count and sets readAt", async () => {
  const repo = createInMemoryNotificationRepository();
  const created = await repo.create({
    userId: "user-1",
    type: "PROFILE_COMPLETION",
    title: "A",
    body: "...",
  });

  const updated = await markNotificationRead(repo, created.id, "user-1");
  assert.equal(updated.read, true);
  assert.ok(updated.readAt);
  assert.equal(await getUnreadCount(repo, "user-1"), 0);
});

test("notification-service: a user cannot mark another user's notification as read (ownership enforced)", async () => {
  const repo = createInMemoryNotificationRepository();
  const created = await repo.create({
    userId: "user-1",
    type: "PROFILE_COMPLETION",
    title: "A",
    body: "...",
  });

  await assert.rejects(() => markNotificationRead(repo, created.id, "user-2"), NotFoundError);
  assert.equal(await getUnreadCount(repo, "user-1"), 1); // untouched
});

test("notification-service: markAllNotificationsRead clears only this user's unread notifications", async () => {
  const repo = createInMemoryNotificationRepository();
  await repo.create({ userId: "user-1", type: "PROFILE_COMPLETION", title: "A", body: "..." });
  await repo.create({ userId: "user-1", type: "PROFILE_COMPLETION", title: "B", body: "..." });
  await repo.create({ userId: "user-2", type: "PROFILE_COMPLETION", title: "C", body: "..." });

  const count = await markAllNotificationsRead(repo, "user-1");
  assert.equal(count, 2);
  assert.equal(await getUnreadCount(repo, "user-1"), 0);
  assert.equal(await getUnreadCount(repo, "user-2"), 1);
});

test("notification-service: hasUnreadOfType is the anti-spam gate — true only while an unread one exists", async () => {
  const repo = createInMemoryNotificationRepository();
  assert.equal(await repo.hasUnreadOfType("user-1", "PROFILE_COMPLETION"), false);

  const created = await repo.create({
    userId: "user-1",
    type: "PROFILE_COMPLETION",
    title: "A",
    body: "...",
  });
  assert.equal(await repo.hasUnreadOfType("user-1", "PROFILE_COMPLETION"), true);

  await markNotificationRead(repo, created.id, "user-1");
  assert.equal(await repo.hasUnreadOfType("user-1", "PROFILE_COMPLETION"), false);
});
