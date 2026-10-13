import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMemoryBuyerEnquiryRepository } from "../memory-repository.ts";
import { createFounderRatingNotifier } from "../founder-notifier.ts";
import { advisorContactEntry, cleanText, EnquiryRatingError, rateEnquiry, raterLabel, recordEnquiry, validateRating, type RatingNotifier } from "../service.ts";
import type { BuyerEnquiry } from "../types.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative: string) => readFileSync(path.resolve(here, "../../../..", relative), "utf8");
const T0 = new Date("2026-10-14T08:00:00Z");

function recorder() {
  const sent: Array<{ entry: BuyerEnquiry; change: string }> = [];
  const notifier: RatingNotifier = { async ratingReceived(entry, change) { sent.push({ entry, change }); } };
  return { sent, notifier };
}

test("history: each entry belongs to the signed-in user, newest first, and one user never sees another's", async () => {
  const repo = createMemoryBuyerEnquiryRepository();
  await recordEnquiry(repo, { userId: "u1", kind: "DEVELOPER_CONNECT", title: "Connect with DAMAC Properties", detail: "You asked for WhatsApp", createdAt: T0 });
  await recordEnquiry(repo, { userId: "u1", kind: "QUICK_ENQUIRY", title: "Property enquiry for Mumbai", createdAt: new Date(T0.getTime() + 60_000) });
  await recordEnquiry(repo, { userId: "u2", kind: "DEVELOPER_CONNECT", title: "Connect with Kalpataru", createdAt: T0 });
  const mine = await repo.listForUser("u1");
  assert.deepEqual(mine.map((e) => e.title), ["Property enquiry for Mumbai", "Connect with DAMAC Properties"]);
  assert.equal((await repo.listForUser("u2")).length, 1);
  assert.equal((await repo.listForUser("nobody")).length, 0);
});

test("history: a repeated advisor contact inside ten minutes is one entry; form submissions are always separate", async () => {
  const repo = createMemoryBuyerEnquiryRepository();
  const entry = (at: Date) => advisorContactEntry("whatsapp", "DAMAC Properties", at, "u1");
  await recordEnquiry(repo, entry(T0));
  await recordEnquiry(repo, entry(new Date(T0.getTime() + 3 * 60_000)));
  assert.equal(repo.rows.length, 1);
  await recordEnquiry(repo, entry(new Date(T0.getTime() + 11 * 60_000)));
  assert.equal(repo.rows.length, 2);
  await recordEnquiry(repo, { userId: "u1", kind: "DEVELOPER_CONNECT", title: "Connect with X", createdAt: T0 });
  await recordEnquiry(repo, { userId: "u1", kind: "DEVELOPER_CONNECT", title: "Connect with X", createdAt: T0 });
  assert.equal(repo.rows.filter((r) => r.kind === "DEVELOPER_CONNECT").length, 2);
  assert.equal(entry(T0).title, "Talked to an advisor on WhatsApp");
  assert.equal(entry(T0).detail, "About DAMAC Properties");
});

test("rating: 1 to 5 whole stars only; the comment is optional, cleaned and capped", () => {
  for (const bad of [0, 6, 2.5, "5", null, undefined, NaN]) {
    assert.throws(() => validateRating({ rating: bad, comment: "" }), EnquiryRatingError, String(bad));
  }
  assert.deepEqual(validateRating({ rating: 4, comment: "   " }), { rating: 4, comment: null });
  assert.deepEqual(validateRating({ rating: 5, comment: undefined }), { rating: 5, comment: null });
  assert.equal(validateRating({ rating: 3, comment: "  Slow to reply \u0007 \n" }).comment, "Slow to reply");
  assert.equal(validateRating({ rating: 3, comment: "x".repeat(2000) }).comment?.length, 600);
  assert.throws(() => validateRating({ rating: 3, comment: { a: 1 } }), EnquiryRatingError);
  assert.equal(cleanText(42, 10), null);
});

test("rating: saved on the owner's own entry, can be changed, and the Founder is told of each real change", async () => {
  const repo = createMemoryBuyerEnquiryRepository();
  const { sent, notifier } = recorder();
  const entry = await recordEnquiry(repo, { userId: "u1", kind: "DEVELOPER_CONNECT", title: "Connect with DAMAC Properties", createdAt: T0 });

  const first = await rateEnquiry(repo, notifier, { userId: "u1", userName: "Ravi Kumar", enquiryId: entry.id, rating: 5, comment: "Quick and clear" }, T0);
  assert.equal(first.rating, 5);
  assert.equal(first.comment, "Quick and clear");
  assert.equal(first.raterName, "Ravi Kumar");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].change, "new");

  // The same rating again changes nothing and does not alert the Founder twice.
  await rateEnquiry(repo, notifier, { userId: "u1", userName: "Ravi Kumar", enquiryId: entry.id, rating: 5, comment: "Quick and clear" }, T0);
  assert.equal(sent.length, 1);

  const changed = await rateEnquiry(repo, notifier, { userId: "u1", userName: "Ravi Kumar", enquiryId: entry.id, rating: 2, comment: "Slow follow-up" }, new Date(T0.getTime() + 1000));
  assert.equal(changed.rating, 2);
  assert.equal(sent.length, 2);
  assert.equal(sent[1].change, "updated");
  assert.equal(changed.seenAt, null, "a changed rating shows as new again");
});

test("rating: another user's entry, a malformed id and a missing entry are all refused; the Founder is not told", async () => {
  const repo = createMemoryBuyerEnquiryRepository();
  const { sent, notifier } = recorder();
  const entry = await recordEnquiry(repo, { userId: "u1", kind: "QUICK_ENQUIRY", title: "Property enquiry", createdAt: T0 });
  await assert.rejects(rateEnquiry(repo, notifier, { userId: "u2", userName: null, enquiryId: entry.id, rating: 1, comment: "" }), EnquiryRatingError);
  await assert.rejects(rateEnquiry(repo, notifier, { userId: "u1", userName: null, enquiryId: "not-an-id", rating: 5, comment: "" }), EnquiryRatingError);
  await assert.rejects(rateEnquiry(repo, notifier, { userId: "u1", userName: null, enquiryId: "11111111-1111-1111-1111-111111111111", rating: 5, comment: "" }), EnquiryRatingError);
  assert.equal(sent.length, 0);
  assert.equal(repo.rows[0].rating, null);
});

test("rating: a failing notifier never undoes the saved rating", async () => {
  const repo = createMemoryBuyerEnquiryRepository();
  const entry = await recordEnquiry(repo, { userId: "u1", kind: "QUICK_ENQUIRY", title: "Property enquiry", createdAt: T0 });
  const broken: RatingNotifier = { async ratingReceived() { throw new Error("clerk down"); } };
  const saved = await rateEnquiry(repo, broken, { userId: "u1", userName: "Asha", enquiryId: entry.id, rating: 4, comment: "" }, T0);
  assert.equal(saved.rating, 4);
  assert.equal(repo.rows[0].rating, 4);
});

test("founder view: summary counts, distribution and attention are computed from the real entries", async () => {
  const repo = createMemoryBuyerEnquiryRepository();
  const ids: string[] = [];
  for (let i = 0; i < 5; i++) ids.push((await recordEnquiry(repo, { userId: "u1", kind: "QUICK_ENQUIRY", title: `E${i}`, createdAt: new Date(T0.getTime() + i) })).id);
  const stars = [5, 4, 2];
  for (let i = 0; i < stars.length; i++) await rateEnquiry(repo, null, { userId: "u1", userName: "Asha", enquiryId: ids[i], rating: stars[i], comment: i === 2 ? "Late reply" : "" }, new Date(T0.getTime() + 1000 + i));
  const s = await repo.summary();
  assert.equal(s.totalEnquiries, 5);
  assert.equal(s.rated, 3);
  assert.equal(s.average, 3.7);
  assert.deepEqual(s.distribution, [0, 1, 0, 1, 1]);
  assert.equal(s.needsAttention, 1);
  assert.equal(s.unseen, 3);
  assert.equal((await repo.listRated({ maxStars: 3 })).length, 1);
  assert.equal(await repo.markAllSeen(T0), 3);
  assert.equal((await repo.summary()).unseen, 0);
  assert.equal((await repo.latestRatedAt())?.getTime(), T0.getTime() + 1002);
});

test("erasure: the comment and name are removed with the lead; the stars stay, anonymously", async () => {
  const repo = createMemoryBuyerEnquiryRepository();
  const entry = await recordEnquiry(repo, { userId: "u1", leadId: "lead-1", kind: "DEVELOPER_CONNECT", title: "Connect with X", createdAt: T0 });
  await rateEnquiry(repo, null, { userId: "u1", userName: "Ravi Kumar", enquiryId: entry.id, rating: 1, comment: "Call me on 98765 43210" }, T0);
  assert.equal(await repo.scrubForLead("lead-1"), 1);
  assert.equal(repo.rows[0].comment, null);
  assert.equal(repo.rows[0].raterName, null);
  assert.equal(repo.rows[0].rating, 1);
});

test("founder notification: goes to every founder account in the bell with the first name, stars and a comment preview", async () => {
  const created: Array<{ userId: string; type: string; title: string; body: string; targetRoute?: string | null }> = [];
  const notifications = { async create(input: (typeof created)[number]) { created.push(input); return {} as never; } };
  const notifier = createFounderRatingNotifier(notifications as never, async () => ["f1", "f2"]);
  const entry = { rating: 2, raterName: "Ravi Kumar", title: "Connect with DAMAC Properties", comment: "Slow to reply" } as BuyerEnquiry;
  await notifier.ratingReceived(entry, "new");
  assert.deepEqual(created.map((c) => c.userId), ["f1", "f2"]);
  assert.ok(created.every((c) => c.type === "SERVICE_RATING" && c.targetRoute === "/admin/ratings"));
  assert.match(created[0].title, /★★☆☆☆ Ravi rated the service/);
  assert.match(created[0].body, /DAMAC Properties\. "Slow to reply"/);
  assert.doesNotMatch(created[0].title + created[0].body, /Kumar|@|\+\d/);
  assert.equal(raterLabel("rav@example.com"), "A buyer");
  assert.equal(raterLabel(null), "A buyer");
});

test("wiring: signed-in only, owner from the session, live cursor and alerts are founder-only, and the page and nav exist", () => {
  const actions = read("src/app/_actions/enquiry-history-actions.ts");
  assert.match(actions, /requireUserIdForAction\(\)/);
  assert.doesNotMatch(actions, /userId: string,?\s*\)/, "no action takes the user id from the browser");
  assert.match(actions, /if \(!userId \|\| !isAdvisorChannel\(channel\)\) return/);
  assert.match(read("src/app/api/alerts/ratings/route.ts"), /!isFounder\(user\)\) return new Response\(null, \{ status: 404/);
  assert.match(read("src/app/admin/_actions/rating-actions.ts"), /requireFounderForAction\(\)/);
  assert.match(read("src/app/admin/ratings/page.tsx"), /requireFounder\(\)/);
  assert.match(read("src/components/admin/admin-nav.tsx"), /"\/admin\/ratings"/);
  assert.match(read("src/app/api/live/route.ts"), /latestRatedAt\(\)/);
  assert.match(read("src/app/admin/layout.tsx"), /<RatingAlerts \/>/);
  assert.match(read("src/components/site-header.tsx"), /showDashboard && <RatingAlerts \/>/);
  assert.match(read("src/app/profile/page.tsx"), /<EnquiryHistory initial=\{enquiries\} \/>/);
  assert.match(read("src/lib/leads/gate/gate-service.ts"), /kind: "DEVELOPER_CONNECT"/);
  assert.match(read("src/app/_actions/enquiry-actions.ts"), /kind: "QUICK_ENQUIRY"/);
  assert.match(read("src/app/admin/_actions/lead-actions.ts"), /scrubForLead\(leadId\)/);
  assert.match(read("src/lib/developer-connect/db/migrations/0038_buyer_enquiry_ratings.sql"), /CREATE TABLE "buyer_enquiries"/);
});
