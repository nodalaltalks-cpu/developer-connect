import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInMemoryLeadRepositories } from "../../leads/memory-repository.ts";
import { describeAnswers, BUDGETS } from "../enquiry-options.ts";
import { enquirySource, submitEnquiry, validateAnswers, type EnquiryStore } from "../enquiry-service.ts";
import { parseSocialBody, toSocialEvent } from "../events.ts";
import { recommend } from "../insights.ts";
import { BUSINESS_EMAIL, SOCIAL_LINKS } from "../links.ts";
import type { SocialSummary } from "../types.ts";
import { validateVideoInput } from "../video-input.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative: string) => readFileSync(path.resolve(here, "../../../..", relative), "utf8");

const VIDEO_ID = "33333333-3333-4333-8333-333333333333";

function store() {
  const rows: Parameters<EnquiryStore["insert"]>[0][] = [];
  return { rows, store: { insert: async (row: Parameters<EnquiryStore["insert"]>[0]) => void rows.push(row) } satisfies EnquiryStore };
}

const GOOD = { intent: "BUY", market: "MUMBAI", locations: ["THANE", "NAVI_MUMBAI"], propertyType: "APARTMENT", configurations: ["2BHK"], budget: "INR_1_2CR", purpose: "SELF_USE", timeline: "ONE_TO_THREE_MONTHS", possession: "READY", loan: "YES", contactMethod: "WHATSAPP", contactTime: "EVENING", howFound: "INSTAGRAM" };

test("enquiry answers: only the fixed choices are accepted, in the right city and currency", () => {
  const ok = validateAnswers(GOOD);
  assert.equal(ok.ok, true);
  assert.deepEqual(validateAnswers({ intent: "BUY" }), { ok: false, code: "MISSING_ANSWER", field: "market" });
  assert.equal(validateAnswers({ ...GOOD, intent: "ROB" }).ok, false, "a value outside the list is refused");
  assert.equal(validateAnswers({ ...GOOD, locations: ["DOWNTOWN"] }).ok, false, "a Dubai area is not a Mumbai choice");
  assert.equal(validateAnswers({ ...GOOD, locations: ["THANE", "NAVI_MUMBAI", "VASAI_VIRAR", "PANVEL_KHARGHAR"] }).ok, false, "at most three areas");
  assert.equal(validateAnswers({ ...GOOD, budget: "AED_1_2M" }).ok, false, "a dirham band is not a Mumbai budget");
  assert.equal(validateAnswers({ ...GOOD, market: "DUBAI", locations: ["DOWNTOWN"], budget: "AED_1_2M" }).ok, true);
  assert.equal(validateAnswers({ ...GOOD, notes: "free text" }).ok && !("notes" in (validateAnswers({ ...GOOD, notes: "free text" }) as { answers: object }).answers), true, "anything not asked is dropped");
  assert.equal(validateAnswers(null).ok, false);
  assert.equal(validateAnswers([]).ok, false);
});

test("enquiry source: the visit's own evidence wins; the visitor's answer fills the gap", () => {
  const none = { gclid: null, fbclid: null, utmSource: null, utmMedium: null, referrer: null, utmCampaign: null };
  assert.equal(enquirySource({ ...none, utmSource: "instagram" }, "GOOGLE"), "INSTAGRAM");
  assert.equal(enquirySource(none, "INSTAGRAM"), "INSTAGRAM");
  assert.equal(enquirySource(none, "FRIEND"), "REFERRAL");
  assert.equal(enquirySource(none, undefined), "WEBSITE");
});

test("enquiry form: creates ONE lead per number with the requirement, consent and attribution, and keeps every answer", async () => {
  const repos = createInMemoryLeadRepositories();
  const s = store();
  const deps = { leads: repos, store: s.store, now: () => new Date("2026-10-10T10:00:00.000Z") };
  const result = await submitEnquiry(deps, { sessionId: "sess-1" }, { answers: GOOD, name: "Asha", phone: "98765 43210", phoneCountry: "IN", touch: { sessionId: "sess-1", landingPath: "/enquire", utmSource: "instagram", utmMedium: "bio" } });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.created, true);
  const lead = (await repos.leads.findByPhone("+919876543210"))!;
  assert.equal(lead.name, "Asha");
  assert.equal(lead.location, "Thane, Navi Mumbai");
  assert.equal(lead.budgetMin, 10_000_000);
  assert.equal(lead.budgetMax, 20_000_000);
  assert.equal(lead.budgetCurrency, "INR");
  assert.equal(lead.configuration, "2 BHK");
  assert.equal(lead.propertyType, "Apartment");
  assert.equal(lead.purpose, "SELF_USE");
  assert.equal(lead.timeline, "ONE_TO_THREE_MONTHS");
  assert.equal(lead.sourceType, "DIGITAL");
  assert.equal(lead.sourceDetail, "INSTAGRAM");
  assert.equal(s.rows.length, 1);
  assert.equal(s.rows[0].utmSource, "instagram");
  assert.deepEqual(s.rows[0].answers, validateAnswers(GOOD).ok ? (validateAnswers(GOOD) as { answers: object }).answers : null);

  // The same number again: the same lead, not a second one.
  const again = await submitEnquiry(deps, { sessionId: "sess-1" }, { answers: { intent: "BUY", market: "MUMBAI" }, phone: "+91 98765 43210", touch: { sessionId: "sess-1" } });
  assert.equal(again.ok && again.created, false);
  assert.equal(again.ok && again.leadId, result.leadId);
  assert.equal(s.rows.length, 2, "both submissions are kept for the Founder");
});

test("enquiry form: dirham budgets for Dubai, a bad number or answer is refused, and a script cannot flood it", async () => {
  const repos = createInMemoryLeadRepositories();
  const s = store();
  const deps = { leads: repos, store: s.store, now: () => new Date("2026-10-10T10:00:00.000Z") };
  const dubai = await submitEnquiry(deps, { sessionId: "d1" }, { answers: { intent: "INVEST", market: "DUBAI", locations: ["MARINA_JBR"], budget: "AED_2_3M" }, phone: "50 890 2817", phoneCountry: "AE", touch: { sessionId: "d1" } });
  assert.equal(dubai.ok, true);
  const lead = (await repos.leads.findByPhone("+971508902817"))!;
  assert.equal(lead.budgetCurrency, "AED");
  assert.equal(lead.purpose, "INVESTMENT", "an investor is recorded as an investment purchase");
  assert.equal((await submitEnquiry(deps, { sessionId: "x" }, { answers: GOOD, phone: "123", touch: { sessionId: "x" } })).ok, false);
  const bad = await submitEnquiry(deps, { sessionId: "x" }, { answers: { ...GOOD, intent: "NOPE" }, phone: "98765 43210", touch: { sessionId: "x" } });
  assert.equal(bad.ok === false && bad.code, "INVALID_ANSWER");
  for (let i = 0; i < 5; i += 1) await submitEnquiry(deps, { sessionId: "spam" }, { answers: GOOD, phone: `98765 4${1000 + i}`, touch: { sessionId: "spam" } });
  const flood = await submitEnquiry(deps, { sessionId: "spam" }, { answers: GOOD, phone: "98765 49999", touch: { sessionId: "spam" } });
  assert.equal(flood.ok === false && flood.code, "RATE_LIMITED");
});

test("enquiry answers read back for the Founder as 'Question: answer', labels not codes", () => {
  const checked = validateAnswers(GOOD);
  const lines = describeAnswers(checked.ok ? (checked.answers as unknown as Record<string, unknown>) : {});
  assert.deepEqual(lines.find((l) => l.question === "Areas"), { question: "Areas", answer: "Thane, Navi Mumbai" });
  assert.deepEqual(lines.find((l) => l.question === "Budget"), { question: "Budget", answer: "₹1 – 2 crore" });
  assert.deepEqual(lines.find((l) => l.question === "Looking to"), { question: "Looking to", answer: "Buy a property" });
  assert.ok(BUDGETS.INR.every((b) => b.min === null || b.max === null || b.min < b.max));
});

test("social events: only allow-listed kinds, real video ids and fixed link keys; no free text", () => {
  assert.equal(toSocialEvent({ kind: "video_click", contentId: VIDEO_ID, platform: "INSTAGRAM" })?.contentId, VIDEO_ID);
  assert.equal(toSocialEvent({ kind: "video_click" }), null, "a video event needs a video id");
  assert.equal(toSocialEvent({ kind: "video_click", contentId: "not-a-uuid" }), null);
  assert.equal(toSocialEvent({ kind: "delete_everything" }), null);
  assert.equal(toSocialEvent({ kind: "link_click", linkKey: "whatsapp" })?.linkKey, "whatsapp");
  assert.equal(toSocialEvent({ kind: "link_click", linkKey: "https://evil.example" }), null);
  assert.equal(toSocialEvent({ kind: "video_play", contentId: VIDEO_ID, watchMs: 9_999_999_999 })?.watchMs, 30 * 60_000, "watch time is clamped");
  assert.equal(toSocialEvent({ kind: "form_started", utmSource: "Instagram Reel!!" })?.utmSource, undefined, "a free-text campaign value is dropped");
  assert.equal(toSocialEvent({ kind: "form_started", utmSource: "instagram" })?.utmSource, "instagram");
  assert.deepEqual(parseSocialBody("not json"), []);
  assert.equal(parseSocialBody(JSON.stringify({ events: Array.from({ length: 50 }, () => ({})) })).length, 10, "a batch is capped");
});

test("videos the Founder adds: the link must really be on the platform, and media must be https or under /social/", () => {
  const base = { title: "Thane market update", platform: "INSTAGRAM", orientation: "VERTICAL", permalinkUrl: "https://www.instagram.com/reel/abc123/" };
  assert.equal(validateVideoInput(base).ok, true);
  assert.equal(validateVideoInput({ ...base, permalinkUrl: "https://evil.example/reel/abc" }).ok, false);
  assert.equal(validateVideoInput({ ...base, permalinkUrl: "javascript:alert(1)" }).ok, false);
  assert.equal(validateVideoInput({ ...base, platform: "YOUTUBE", permalinkUrl: "https://youtu.be/xyz" }).ok, true);
  assert.equal(validateVideoInput({ ...base, mediaUrl: "/social/clip.mp4" }).ok, true);
  assert.equal(validateVideoInput({ ...base, mediaUrl: "/social/../secret.mp4" }).ok, false);
  assert.equal(validateVideoInput({ ...base, mediaUrl: "http://insecure.example/clip.mp4" }).ok, false);
  assert.equal(validateVideoInput({ ...base, posterUrl: "https://cdn.example/p.jpg" }).ok, true);
  assert.equal(validateVideoInput({ ...base, title: " " }).ok, false);
  assert.equal(validateVideoInput({ ...base, orientation: "SQUARE" }).ok, false);
});

const EMPTY: SocialSummary = { videos: [], links: [], sources: [], hours: [], devices: [], funnel: { sawVideo: 0, clicked: 0, startedForm: 0, submittedForm: 0 }, enquiriesByFoundVia: [], topics: [] };
const video = (o: Partial<SocialSummary["videos"][number]>) => ({ id: "v", title: "T", platform: "INSTAGRAM", orientation: "VERTICAL", topic: null, viewers: 0, plays: 0, clicks: 0, avgWatchMs: 0, ...o });

test("recommendations: no claim from too little data; with data they name the numbers behind them", () => {
  const none = recommend(EMPTY);
  assert.equal(none.length, 1);
  assert.equal(none[0].kind, "data");

  const rich: SocialSummary = {
    ...EMPTY,
    videos: [video({ id: "a", title: "Buyer mistakes", orientation: "VERTICAL", topic: "Buyer mistake", viewers: 60, plays: 50, clicks: 15, avgWatchMs: 9000 }), video({ id: "b", title: "Long explainer", orientation: "HORIZONTAL", topic: "Investor tip", viewers: 40, plays: 30, clicks: 0, avgWatchMs: 4000 })],
    topics: [{ topic: "Buyer mistake", plays: 50, clicks: 15 }, { topic: "Investor tip", plays: 30, clicks: 1 }],
    hours: [{ hour: 20, clicks: 12, plays: 40 }, { hour: 9, clicks: 4, plays: 10 }],
    funnel: { sawVideo: 100, clicked: 4, startedForm: 10, submittedForm: 2 },
    sources: [{ source: "instagram", visitors: 80, clicks: 14, enquiries: 3 }],
  };
  const titles = recommend(rich).map((r) => r.title).join(" | ");
  assert.match(titles, /Make more "Buyer mistake" content/);
  assert.match(titles, /Vertical \(Reels\) holds attention longer/);
  assert.match(titles, /played but never clicked/);
  assert.match(titles, /Post just before 20:00/);
  assert.match(titles, /Few viewers click through/);
  assert.match(titles, /start the enquiry form but do not finish/);
  assert.match(titles, /instagram is bringing the most enquiries/);
  const detail = recommend(rich).find((r) => r.title.startsWith("Make more"))!.detail;
  assert.match(detail, /30% of plays/);
});

test("links: the WhatsApp number and business email are the Founder's, and unset accounts are not invented", () => {
  assert.equal(BUSINESS_EMAIL, "developerconnects02@gmail.com");
  const whatsapp = SOCIAL_LINKS.find((l) => l.key === "whatsapp")!;
  assert.match(whatsapp.url!, /^https:\/\/wa\.me\/919833750932/);
  assert.match(SOCIAL_LINKS.find((l) => l.key === "email")!.url!, /^mailto:developerconnects02@gmail\.com/);
  assert.match(SOCIAL_LINKS.find((l) => l.key === "linkedin")!.url!, /linkedin\.com\/in\//);
  for (const key of ["instagram", "facebook", "youtube"]) assert.ok(SOCIAL_LINKS.find((l) => l.key === key), `${key} is listed`);
});

test("wiring: the landing page shows the video section, the public pages exist, the admin pages are gated by the admin layout, and the old personal email is gone from public contact details", () => {
  assert.match(read("src/app/(marketing)/page.tsx"), /<SocialVideoSection \/>/);
  assert.match(read("src/components/social/video-strip.tsx"), /IntersectionObserver/);
  assert.match(read("src/components/social/video-strip.tsx"), /prefers-reduced-motion/);
  assert.match(read("src/app/links/page.tsx"), /TrackedLink/);
  assert.match(read("src/app/enquire/page.tsx"), /EnquiryForm/);
  const nav = read("src/components/admin/admin-nav.tsx");
  assert.match(nav, /\/admin\/social/);
  assert.match(nav, /\/admin\/enquiries/);
  assert.match(read("src/app/admin/_actions/social-actions.ts"), /await requireFounderForAction\(\)/);
  assert.match(read("src/lib/advisor-contact.ts"), /developerconnects02@gmail\.com/);
  assert.ok(!/nodalaltalks@gmail\.com|nodalaltalks02@gmail\.com/.test(read("src/lib/advisor-contact.ts") + read("src/lib/legal-config.ts")), "no old address in public contact details");
  assert.match(read("src/app/api/social-events/route.ts"), /videoExists/, "a video id is only stored when it is one of the Founder's videos");
});
