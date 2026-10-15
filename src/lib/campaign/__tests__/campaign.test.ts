import { test } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryLeadRepositories } from "../../leads/memory-repository.ts";
import { submitEnquiry, type EnquiryStore } from "../../social/enquiry-service.ts";
import { getGoogleAdsConversionLabel, getGoogleAdsId } from "../../analytics-config.ts";
import { CAMPAIGN_PROJECTS, campaignTag, getCampaignProject, validateCampaignProject, type CampaignProject } from "../projects.ts";

const GOOD: CampaignProject = {
  slug: "sample-heights",
  name: "Sample Heights",
  developer: "Sample Developers",
  locality: "Kandivali West",
  reraNumber: "P51800012345",
  configurations: "2 and 3 BHK",
  priceNote: "From ₹1.45 Cr (price sheet dated 10 October 2026)",
  possession: "December 2027",
  highlights: ["Five minutes from the station", "Podium amenities", "Registered with MahaRERA"],
  factsCheckedOn: "2026-10-15",
  active: true,
};

test("campaign projects: every project in the real list is complete and safe to publish", () => {
  for (const project of CAMPAIGN_PROJECTS) {
    assert.deepEqual(validateCampaignProject(project), [], `${project.slug} has problems`);
  }
  assert.equal(new Set(CAMPAIGN_PROJECTS.map((p) => p.slug)).size, CAMPAIGN_PROJECTS.length, "slugs must be unique");
});

test("campaign projects: a complete entry passes; each kind of mistake is named", () => {
  assert.deepEqual(validateCampaignProject(GOOD), []);
  assert.ok(validateCampaignProject({ ...GOOD, reraNumber: "" }).some((p) => p.includes("reraNumber")));
  assert.ok(validateCampaignProject({ ...GOOD, reraNumber: "P518000123" }).some((p) => p.includes("reraNumber")));
  assert.ok(validateCampaignProject({ ...GOOD, slug: "Sample Heights" }).some((p) => p.includes("slug")));
  assert.ok(validateCampaignProject({ ...GOOD, highlights: ["only one"] }).some((p) => p.includes("highlights")));
  assert.ok(validateCampaignProject({ ...GOOD, factsCheckedOn: "15/10/2026" }).some((p) => p.includes("factsCheckedOn")));
});

test("campaign projects: claims the brand never makes are refused", () => {
  for (const bad of ["Verified project", "Zero brokerage", "Best homes in Mumbai", "Guaranteed returns", "Hurry, last few homes", "0% fees"]) {
    assert.ok(validateCampaignProject({ ...GOOD, highlights: [bad, "Two", "Three"] }).length > 0, `${bad} should be refused`);
  }
});

test("campaign projects: only an active, valid project is served; everything else is a 404", () => {
  assert.equal(getCampaignProject("sample-heights", [GOOD])?.name, "Sample Heights");
  assert.equal(getCampaignProject("sample-heights", [{ ...GOOD, active: false }]), undefined);
  assert.equal(getCampaignProject("sample-heights", [{ ...GOOD, reraNumber: "" }]), undefined);
  assert.equal(getCampaignProject("unknown", [GOOD]), undefined);
});

test("campaign tags: one predictable utm_campaign per project, channel and kind", () => {
  assert.equal(campaignTag("Park Avenue", "google", "search"), "park-avenue_google_search");
  assert.equal(campaignTag("  Sample  Heights! ", "meta", "Video 1"), "sample-heights_meta_video-1");
});

test("Google Ads ids: only well-formed values are accepted, so they are safe inside the inline snippet", () => {
  assert.equal(getGoogleAdsId("AW-1234567890"), "AW-1234567890");
  assert.equal(getGoogleAdsId(" AW-1234567890 "), "AW-1234567890");
  for (const bad of [undefined, "", "G-ABCDEF1234", "AW-12", "AW-1234567890');alert(1);//", "aw-1234567890"]) assert.equal(getGoogleAdsId(bad), null);
  assert.equal(getGoogleAdsConversionLabel("AbC-dEf_123"), "AbC-dEf_123");
  for (const bad of [undefined, "", "short", "has space here", "x'); evil();//"]) assert.equal(getGoogleAdsConversionLabel(bad), null);
});

function memoryStore() {
  const rows: Array<{ utmSource: string | null; utmCampaign: string | null; landingPath: string | null }> = [];
  const store: EnquiryStore = {
    async insert(row) {
      rows.push({ utmSource: row.utmSource, utmCampaign: row.utmCampaign, landingPath: row.landingPath });
    },
  } as EnquiryStore;
  return { store, rows };
}

test("a Google Ads click that lands on a project page and enquires later keeps its campaign, keyword, click id and landing page", async () => {
  const repos = createInMemoryLeadRepositories();
  const s = memoryStore();
  const deps = { leads: repos, store: s.store, now: () => new Date("2026-10-16T10:00:00.000Z") };
  const result = await submitEnquiry(
    deps,
    { sessionId: "ads-1" },
    {
      answers: { intent: "BUY", market: "MUMBAI" },
      name: "Meera",
      phone: "98765 43210",
      phoneCountry: "IN",
      touch: {
        sessionId: "ads-1",
        landingPath: "/project/sample-heights",
        utmSource: "google",
        utmMedium: "cpc",
        utmCampaign: "sample-heights_google_search",
        utmContent: "ad-a",
        utmTerm: "2 bhk kandivali west",
        gclid: "Cj0KCQ-test-click-id",
      },
    },
  );
  assert.equal(result.ok, true);
  const lead = (await repos.leads.findByPhone("+919876543210"))!;
  assert.equal(lead.sourceDetail, "GOOGLE");
  const touch = (await repos.touches.getById(lead.firstTouchId!))!;
  assert.equal(touch.gclid, "Cj0KCQ-test-click-id");
  assert.equal(touch.utmTerm, "2 bhk kandivali west");
  assert.equal(touch.utmContent, "ad-a");
  assert.equal(touch.utmCampaign, "sample-heights_google_search");
  assert.equal(touch.landingPath, "/project/sample-heights");
  assert.deepEqual(s.rows[0], { utmSource: "google", utmCampaign: "sample-heights_google_search", landingPath: "/project/sample-heights" });
});

test("a Google click id alone (no UTM tags) is still attributed to Google", async () => {
  const repos = createInMemoryLeadRepositories();
  const s = memoryStore();
  const deps = { leads: repos, store: s.store, now: () => new Date("2026-10-16T10:00:00.000Z") };
  const result = await submitEnquiry(deps, { sessionId: "ads-2" }, { answers: { intent: "BUY", market: "MUMBAI" }, phone: "98765 43211", phoneCountry: "IN", touch: { sessionId: "ads-2", landingPath: "/project/sample-heights", gclid: "abc-click" } });
  assert.equal(result.ok, true);
  assert.equal((await repos.leads.findByPhone("+919876543211"))!.sourceDetail, "GOOGLE");
});
