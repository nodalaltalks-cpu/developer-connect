import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const skip = !process.env.FIRESTORE_EMULATOR_HOST;

test("firestore social: videos, events, summary grouping, enquiry list joined to its lead", { skip }, async () => {
  const s = await import("../../social/firestore/firestore-social.ts");
  const { getFirestoreDb } = await import("../client.ts");
  const now = new Date();
  const tag = randomUUID().slice(0, 8);

  const video = await s.createVideo({ title: `V-${tag}`, platform: "INSTAGRAM", orientation: "VERTICAL", permalinkUrl: "https://example.com/p", mediaUrl: null, posterUrl: null, topic: `topic-${tag}`, sortOrder: -5, active: true } as never, now);
  assert.equal(await s.videoExists(video.id), true);
  assert.equal((await s.listActiveVideos())[0].id, video.id, "lowest sortOrder first");
  await s.updateVideo(video.id, { active: false }, now);
  assert.equal((await s.listActiveVideos()).some((v) => v.id === video.id), false);
  assert.equal((await s.listAllVideos()).some((v) => v.id === video.id), true);
  await s.updateVideo(randomUUID(), { active: false }, now); // a missing id is a no-op, not an error
  await s.updateVideo(video.id, { active: true }, now);

  const ev = (kind: string, session: string, extra: Record<string, unknown> = {}) =>
    s.recordSocialEvent({ kind, contentId: video.id, ...extra } as never, { sessionId: session, deviceType: "mobile", now: new Date() });
  await ev("video_impression", `s1-${tag}`);
  await ev("video_impression", `s2-${tag}`);
  await ev("video_impression", `s1-${tag}`);
  await ev("video_play", `s1-${tag}`, { watchMs: 4000 });
  await ev("video_play", `s2-${tag}`, { watchMs: 2000 });
  await ev("video_click", `s1-${tag}`, { utmSource: `ig-${tag}` });
  await ev("form_submitted", `s1-${tag}`, { utmSource: `ig-${tag}`, contentId: null });

  const lead = randomUUID();
  await getFirestoreDb().collection("leads").doc(lead).set({ name: "Buyer", phoneE164: "+919999999999", status: "NEW" });
  await s.firestoreEnquiryStore.insert({ leadId: lead, createdAt: new Date(), answers: { a: 1 }, howFound: `found-${tag}`, utmSource: null, utmMedium: null, utmCampaign: null, landingPath: "/enquire" } as never);

  const summary = await s.socialSummary(new Date(Date.now() - 60_000), new Date(Date.now() + 60_000));
  const row = summary.videos.find((v) => v.id === video.id)!;
  assert.equal(row.viewers, 2, "distinct sessions, not impressions");
  assert.equal(row.plays, 2);
  assert.equal(row.clicks, 1);
  assert.equal(row.avgWatchMs, 3000);
  const src = summary.sources.find((x) => x.source === `ig-${tag}`)!;
  assert.deepEqual({ visitors: src.visitors, clicks: src.clicks, enquiries: src.enquiries }, { visitors: 1, clicks: 1, enquiries: 1 });
  assert.ok(summary.devices.some((d) => d.device === "mobile"));
  assert.ok(summary.funnel.sawVideo >= 2);
  assert.ok(summary.enquiriesByFoundVia.some((e) => e.howFound === `found-${tag}`));
  assert.ok(summary.topics.some((t) => t.topic === `topic-${tag}` && t.clicks === 1 && t.plays === 2));
  assert.ok(summary.hours.length >= 1);

  const list = await s.listEnquiries(50);
  const mine = list.find((e) => e.leadId === lead)!;
  assert.equal(mine.name, "Buyer");
  assert.equal(mine.status, "NEW");

  await s.deleteVideo(video.id);
  assert.equal(await s.videoExists(video.id), false);
});
