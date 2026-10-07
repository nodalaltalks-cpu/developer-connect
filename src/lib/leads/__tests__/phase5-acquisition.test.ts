import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildAcquisitionReport, campaignKeyOf, channelOf, landingPageOf, NO_CAMPAIGN, type AcquisitionRow, type TouchEvidence } from "../acquisition.ts";
import { createCampaign, getAcquisitionReport, listCampaigns, updateCampaign } from "../campaign-service.ts";
import { captureAssistanceLead, changeLeadStatus } from "../lead-service.ts";
import { createInMemoryLeadRepositories } from "../memory-repository.ts";
import { LeadNotFoundError, LeadStateError, LeadValidationError, UnauthorizedLeadActionError } from "../errors.ts";
import { FOUNDER, captureInput, minutes, T0 } from "./test-helpers.ts";

/** Phase 5: the acquisition rules (pure), campaigns, and the report against the in-memory repositories. */

const touch = (over: Partial<TouchEvidence> = {}): TouchEvidence => ({ utmSource: null, utmMedium: null, utmCampaign: null, gclid: null, fbclid: null, referrer: null, landingPath: "/developers/acme", ...over });
const row = (over: Partial<AcquisitionRow> = {}): AcquisitionRow => ({ leadId: "l", createdAt: T0, sourceType: "DIGITAL", creationMethod: "WEBSITE_GATE", first: touch(), latest: touch(), reachedQualified: false, hasSiteVisit: false, booked: false, bookings: [], ...over });

test("channel: evidence decides - click ids and tags name a channel; with none the lead is Direct / unknown, never a guessed source", () => {
  const cases: Array<[Partial<TouchEvidence> | null, string]> = [
    [{ gclid: "abc" }, "GOOGLE_ADS"],
    [{ utmSource: "google", utmMedium: "cpc" }, "GOOGLE_ADS"],
    [{ fbclid: "x" }, "META"],
    [{ utmSource: "facebook" }, "META"],
    [{ utmSource: "instagram" }, "INSTAGRAM"],
    [{ utmSource: "ig", utmMedium: "social" }, "INSTAGRAM"],
    [{ referrer: "https://l.instagram.com/x" }, "INSTAGRAM"],
    [{ utmSource: "whatsapp" }, "WHATSAPP"],
    [{ referrer: "https://wa.me/123" }, "WHATSAPP"],
    [{ utmSource: "newsletter", utmMedium: "referral" }, "REFERRAL"],
    [{ referrer: "https://www.google.com/" }, "ORGANIC_SEARCH"],
    [{ referrer: "https://blog.example.com/post" }, "REFERRAL"],
    [{ utmSource: "partner-x" }, "REFERRAL"],
    [{ utmSource: "podcast" }, "OTHER_DIGITAL"],
    [{}, "DIRECT_OR_UNKNOWN"],
    [null, "DIRECT_OR_UNKNOWN"],
  ];
  for (const [first, expected] of cases) assert.equal(channelOf(row({ first: first === null ? null : touch(first), latest: null })), expected, JSON.stringify(first));
});

test("channel: self-generated leads are their own channels and are never 'digital', whatever a touch says", () => {
  assert.equal(channelOf(row({ sourceType: "SELF_GENERATED", creationMethod: "CSV_IMPORT", first: touch({ gclid: "x" }) })), "CSV_IMPORT");
  assert.equal(channelOf(row({ sourceType: "SELF_GENERATED", creationMethod: "EXCEL_IMPORT" })), "CSV_IMPORT");
  assert.equal(channelOf(row({ sourceType: "SELF_GENERATED", creationMethod: "COLD_CALLING" })), "COLD_CALLING");
  assert.equal(channelOf(row({ sourceType: "SELF_GENERATED", creationMethod: "EMPLOYEE_CREATED" })), "SELF_GENERATED_OTHER");
});

test("first touch vs latest touch: the basis picks the touch, and first touch is the default - a later ad click never rewrites where the lead came from", () => {
  const r = row({ first: touch({ referrer: "https://www.google.com/" }), latest: touch({ gclid: "later" , utmCampaign: "late_tag"}) });
  assert.equal(channelOf(r), "ORGANIC_SEARCH");
  assert.equal(channelOf(r, "first"), "ORGANIC_SEARCH");
  assert.equal(channelOf(r, "latest"), "GOOGLE_ADS");
  const byTag = new Map([["late_tag", { id: "c1", name: "Late", utmCampaign: "late_tag" }]]);
  assert.equal(campaignKeyOf(r, byTag, "first"), NO_CAMPAIGN);
  assert.equal(campaignKeyOf(r, byTag, "latest"), "c1");
});

test("campaign key: a lead has at most ONE campaign - tag match is case-insensitive; an undefined tag is shown as untracked, never merged or dropped", () => {
  const byTag = new Map([["spring", { id: "c1", name: "Spring", utmCampaign: "Spring" }]]);
  assert.equal(campaignKeyOf(row({ first: touch({ utmCampaign: " SPRING " }) }), byTag), "c1");
  assert.equal(campaignKeyOf(row({ first: touch({ utmCampaign: "autumn" }) }), byTag), "tag:autumn");
  assert.equal(campaignKeyOf(row({ first: touch({ utmCampaign: "" }) }), byTag), NO_CAMPAIGN);
  assert.equal(campaignKeyOf(row({ first: null, latest: null }), byTag), NO_CAMPAIGN);
});

test("landing page: path only - no host, no query string, no fragment - lower-cased, so the same page groups together and nothing personal rides along", () => {
  assert.equal(landingPageOf(row({ first: touch({ landingPath: "/Developers/Acme?utm_source=x&gclid=secret#top" }) })), "/developers/acme");
  assert.equal(landingPageOf(row({ first: touch({ landingPath: null }) })), null);
  assert.equal(landingPageOf(row({ first: null, latest: null })), null);
});

test("report: every lead is counted exactly once per grouping; rates are blank, not zero, when there is nothing to divide by", () => {
  const rows = [
    row({ leadId: "1", first: touch({ gclid: "a", utmCampaign: "spring" }), reachedQualified: true, hasSiteVisit: true, booked: true }),
    row({ leadId: "2", first: touch({ gclid: "b", utmCampaign: "spring" }), reachedQualified: true }),
    row({ leadId: "3", first: touch({ utmCampaign: "unknown_tag" }) }),
    row({ leadId: "4", sourceType: "SELF_GENERATED", creationMethod: "COLD_CALLING", first: null, latest: null }),
  ];
  const report = buildAcquisitionReport(rows, [{ id: "c1", name: "Spring sale", utmCampaign: "spring" }], "first");
  const sum = (g: { leads: number }[]) => g.reduce((n, x) => n + x.leads, 0);
  assert.equal(report.totals.leads, 4);
  assert.equal(sum(report.byChannel), 4);
  assert.equal(sum(report.byCampaign), 4);
  assert.equal(sum(report.byLandingPage), 4);
  const google = report.byChannel.find((g) => g.key === "GOOGLE_ADS")!;
  assert.deepEqual([google.leads, google.qualified, google.siteVisits, google.booked, google.qualifiedRate, google.bookedRate], [2, 2, 1, 1, 1, 0.5]);
  assert.equal(report.byCampaign.find((g) => g.key === "c1")!.label, "Spring sale");
  assert.ok(report.byCampaign.some((g) => g.label === "Untracked tag: unknown_tag"));
  assert.ok(report.byCampaign.some((g) => g.label === "No campaign tag"));
  assert.equal(buildAcquisitionReport([], [], "first").totals.qualifiedRate, null, "no leads: no made-up 0%");
});

// --- campaigns (Founder only) -----------------------------------------------------------------------

test("campaigns: Founder only; the tag is validated, unique case-insensitively and fixed once created; dates and landing page are checked", async () => {
  const repos = createInMemoryLeadRepositories();
  const employee = { actorType: "EMPLOYEE" as const, actorId: "user_e" };
  await assert.rejects(createCampaign(repos, { name: "X", utmCampaign: "x" }, employee), UnauthorizedLeadActionError);
  await assert.rejects(listCampaigns(repos, employee), UnauthorizedLeadActionError);
  const c = await createCampaign(repos, { name: "Spring", utmCampaign: "Spring_2026", utmSource: "google", utmMedium: "cpc", landingPage: "/developers", startDate: "2026-03-01", endDate: "2026-04-01" }, FOUNDER, minutes(1));
  assert.equal(c.status, "ACTIVE");
  await assert.rejects(createCampaign(repos, { name: "Dupe", utmCampaign: "spring_2026" }, FOUNDER), LeadStateError, "one campaign per tag: no double attribution");
  await assert.rejects(createCampaign(repos, { name: "", utmCampaign: "t" }, FOUNDER), LeadValidationError);
  await assert.rejects(createCampaign(repos, { name: "N", utmCampaign: "has space" }, FOUNDER), LeadValidationError);
  await assert.rejects(createCampaign(repos, { name: "N", utmCampaign: "ok", landingPage: "https://evil.example" }, FOUNDER), LeadValidationError, "a path on this site only");
  await assert.rejects(createCampaign(repos, { name: "N", utmCampaign: "ok2", landingPage: "//evil.example" }, FOUNDER), LeadValidationError);
  await assert.rejects(createCampaign(repos, { name: "N", utmCampaign: "ok3", startDate: "2026-05-01", endDate: "2026-04-01" }, FOUNDER), LeadValidationError);
  await assert.rejects(createCampaign(repos, { name: "N", utmCampaign: "ok4", startDate: "2026-13-45" }, FOUNDER), LeadValidationError);
  await assert.rejects(updateCampaign(repos, c.id, { utmCampaign: "other" }, FOUNDER), LeadValidationError, "the attribution key is fixed");
  await assert.rejects(updateCampaign(repos, c.id, { status: "PAUSED" }, employee), UnauthorizedLeadActionError);
  await assert.rejects(updateCampaign(repos, "00000000-0000-4000-8000-000000000000", { status: "PAUSED" }, FOUNDER), LeadNotFoundError);
  assert.equal((await updateCampaign(repos, c.id, { status: "ENDED", name: "Spring sale" }, FOUNDER, minutes(5))).status, "ENDED");
  assert.equal((await listCampaigns(repos, FOUNDER)).length, 1);
});

test("report from real leads: first touch is preserved when a later touch arrives; qualified counts leads that EVER qualified, even if later lost", async () => {
  const repos = createInMemoryLeadRepositories();
  const first = await captureAssistanceLead(repos, captureInput({ phone: "+91 98765 41111", currentTouch: { sessionId: "s1", landingPath: "/developers/a", gclid: "g1", utmCampaign: "spring" } }), T0);
  // The same buyer returns later through a different channel: the FIRST touch must not change.
  await captureAssistanceLead(repos, captureInput({ phone: "+91 98765 41111", currentTouch: { sessionId: "s2", landingPath: "/developers/b", utmSource: "instagram", utmCampaign: "autumn" } }), minutes(500));
  const stored = (await repos.leads.getById(first.lead.id))!;
  assert.ok(stored.firstTouchId && stored.lastTouchId && stored.firstTouchId !== stored.lastTouchId);
  assert.equal((await repos.touches.getById(stored.firstTouchId))?.gclid, "g1");

  await changeLeadStatus(repos, first.lead.id, "QUALIFIED", FOUNDER, {}, minutes(10));
  await changeLeadStatus(repos, first.lead.id, "LOST", FOUNDER, { reasonCode: "OTHER" }, minutes(20));

  await createCampaign(repos, { name: "Spring", utmCampaign: "spring" }, FOUNDER);
  const range = { from: minutes(-10), to: minutes(2000) };
  const byFirst = await getAcquisitionReport(repos, FOUNDER, range, "first");
  const byLatest = await getAcquisitionReport(repos, FOUNDER, range, "latest");
  assert.equal(byFirst.byChannel[0].key, "GOOGLE_ADS");
  assert.equal(byLatest.byChannel[0].key, "INSTAGRAM");
  assert.equal(byFirst.totals.qualified, 1, "a lead that qualified and was later lost still counts as qualified");
  assert.equal(byFirst.byCampaign[0].label, "Spring");
  assert.equal(byLatest.byCampaign[0].label, "Untracked tag: autumn");
  await assert.rejects(getAcquisitionReport(repos, { actorType: "EMPLOYEE", actorId: "e" }, range), UnauthorizedLeadActionError);
  await assert.rejects(getAcquisitionReport(repos, FOUNDER, range, "weird" as never), LeadValidationError);
  assert.doesNotMatch(JSON.stringify(byFirst), /98765|@/, "the report carries no phone numbers or emails");
});

// --- static guarantees ------------------------------------------------------------------------------

const read = (p: string) => readFileSync(new URL(`../../../../${p}`, import.meta.url), "utf8");

test("static: acquisition pages and actions are Founder-gated, noindex, and migration 0024 is additive and guards the first-touch pointer", () => {
  for (const file of ["src/app/admin/acquisition/page.tsx", "src/app/admin/campaigns/page.tsx"]) {
    const text = read(file);
    assert.match(text, /await requireFounder\(\)/);
    assert.match(text, /robots: \{ index: false, follow: false \}/);
    assert.match(text, /export const dynamic = "force-dynamic"/);
  }
  const actions = read("src/app/admin/_actions/campaign-actions.ts");
  for (const name of ["createCampaignAction", "setCampaignStatusAction"]) {
    const body = actions.slice(actions.indexOf(`export async function ${name}(`));
    assert.match(body.slice(body.indexOf("{") + 1).trimStart(), /^const founderId = await requireFounderForAction\(\);/, `${name} authorizes first`);
  }
  const sql = read("src/lib/developer-connect/db/migrations/0024_phase5_campaigns.sql");
  assert.doesNotMatch(sql, /DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM/i);
  assert.match(sql, /first_touch_id is immutable once set/);
  const report = read("src/lib/leads/acquisition.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(report, /phoneE164|email|phone/, "the report row has no personal data");
});
