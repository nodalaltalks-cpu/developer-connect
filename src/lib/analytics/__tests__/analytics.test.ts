import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { ANALYTICS_EVENTS, CTA_EVENTS, META_EVENT, cleanParams, isAnalyticsEvent, marketOfPath, newEventId, pageTypeOfPath } from "../events.ts";
import { buildCapiPayload, capiConfigFromEnv, hashEmail, hashPhone, sendMetaEvent } from "../meta-capi.ts";
import { getMetaPixelId } from "../../analytics-config.ts";
import { CTA_IDS } from "../../behaviour/events.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative: string) => readFileSync(path.resolve(here, "../../../..", relative), "utf8");
const sha = (v: string) => createHash("sha256").update(v).digest("hex");

test("events: the vocabulary covers the agreed funnel and nothing else is accepted", () => {
  for (const name of ["page_view", "search", "view_item_list", "select_item", "view_item", "generate_lead", "qualify_lead", "working_lead", "close_convert_lead", "login", "sign_up", "share", "contact", "whatsapp_click", "email_click", "advisor_click", "developer_view", "project_view", "save_project", "save_developer", "profile_completion", "site_visit_request", "booking"]) {
    assert.ok(isAnalyticsEvent(name), name);
  }
  assert.equal(ANALYTICS_EVENTS.length, 23);
  assert.equal(isAnalyticsEvent("purchase_lead_phone_9833750932"), false);
  assert.equal(isAnalyticsEvent(undefined), false);
});

test("privacy: parameters are allow-listed, short, and never carry an email, a phone number or a URL", () => {
  const cleaned = cleanParams({
    market: "mumbai",
    developer: "Emaar Properties",
    email: "asha@example.com",
    phone: "+919833750932",
    cta: "advisor_whatsapp",
    location: "call me on +91 98337 50932",
    source: "https://evil.example/?q=1",
    channel: "x@y.co",
    step: 3,
    notes: "private requirement",
    developer_slug: "a".repeat(200),
  });
  assert.deepEqual(Object.keys(cleaned).sort(), ["cta", "developer", "developer_slug", "market", "step"]);
  assert.equal(cleaned.developer_slug!.toString().length, 60);
  assert.ok(!JSON.stringify(cleaned).includes("@"));
  assert.deepEqual(cleanParams(undefined), {});
  assert.deepEqual(cleanParams({ step: Number.NaN }), {});
});

test("events: every first-party button that is also an analytics event maps to a real event and a real tracked id", () => {
  for (const [id, mapped] of Object.entries(CTA_EVENTS)) {
    assert.ok(isAnalyticsEvent(mapped.event), `${id} maps to a known event`);
    assert.ok((CTA_IDS as readonly string[]).includes(id), `${id} is also an allowed first-party click id`);
  }
  assert.equal(CTA_EVENTS.advisor_whatsapp.event, "whatsapp_click");
  assert.equal(CTA_EVENTS.advisor_email.event, "email_click");
  assert.equal(CTA_EVENTS.advisor_open.event, "advisor_click");
});

test("events: path helpers only repeat what the address says", () => {
  assert.equal(marketOfPath("/buy-direct-from-developer/mumbai"), "mumbai");
  assert.equal(marketOfPath("/developers/emaar-properties"), undefined);
  assert.equal(pageTypeOfPath("/developers/emaar-properties"), "developer");
  assert.equal(pageTypeOfPath("/"), "home");
  assert.notEqual(newEventId(), newEventId());
  for (const metaName of Object.values(META_EVENT)) assert.ok(/^[A-Z][A-Za-z]+$/.test(metaName!), "Meta standard event names");
});

test("meta: the pixel id is validated and the server API is off without BOTH the id and a token", () => {
  assert.equal(getMetaPixelId("1234567890123456"), "1234567890123456");
  assert.equal(getMetaPixelId("abc'); alert(1);//"), null, "only digits can reach the inline snippet");
  assert.equal(getMetaPixelId(""), null);
  assert.equal(capiConfigFromEnv({ NEXT_PUBLIC_META_PIXEL_ID: "1234567890123456" }), null);
  assert.equal(capiConfigFromEnv({ META_CAPI_ACCESS_TOKEN: "t" }), null);
  assert.deepEqual(capiConfigFromEnv({ NEXT_PUBLIC_META_PIXEL_ID: "1234567890123456", META_CAPI_ACCESS_TOKEN: "t" }), { pixelId: "1234567890123456", accessToken: "t", testEventCode: undefined });
});

test("meta: personal data is hashed exactly as Meta specifies, and the raw value never appears in the payload", () => {
  assert.equal(hashEmail("  Asha.Verma@Example.COM "), sha("asha.verma@example.com"));
  assert.equal(hashEmail("not an email"), null);
  assert.equal(hashPhone("+91 98337-50932"), sha("919833750932"));
  assert.equal(hashPhone("123"), null);
  const config = { pixelId: "1234567890123456", accessToken: "secret-token" };
  const payload = buildCapiPayload(config, { eventName: "Lead", eventId: "evt-1", eventTime: new Date("2026-10-08T10:00:00Z"), path: "/developers/emaar-properties?utm_source=x#frag", email: "asha@example.com", phoneE164: "+919833750932", value: null });
  const text = JSON.stringify(payload);
  assert.ok(!text.includes("asha@example.com") && !text.includes("9833750932") && !text.includes("secret-token"), "no raw personal data or secret in the body");
  assert.equal(payload.data[0].event_id, "evt-1", "the id the browser pixel used, so Meta counts it once");
  assert.equal(payload.data[0].event_source_url, "https://developerconnects.com/developers/emaar-properties", "path only, no query or fragment");
  assert.equal(payload.data[0].action_source, "website");
  assert.equal(payload.data[0].event_time, 1791453600);
  assert.ok(!("custom_data" in payload.data[0]), "no value is invented");
});

test("meta: sending is silent when unconfigured, safe when Meta fails, and sends the token only as a header", async () => {
  const event = { eventName: "Lead", eventId: "e", eventTime: new Date(), path: "/", email: "a@b.co" };
  let calls = 0;
  const never = (async () => { calls += 1; return new Response("{}"); }) as typeof fetch;
  assert.equal(await sendMetaEvent(event, { config: null, fetchImpl: never }), false);
  assert.equal(calls, 0, "nothing is sent without configuration");
  const config = { pixelId: "1234567890123456", accessToken: "tok" };
  let seen: { url: string; init: RequestInit } | null = null;
  const ok = (async (url: string, init: RequestInit) => { seen = { url, init }; return new Response("{}", { status: 200 }); }) as unknown as typeof fetch;
  assert.equal(await sendMetaEvent(event, { config, fetchImpl: ok }), true);
  assert.ok(!seen!.url.includes("tok"), "the token is never placed in the URL");
  assert.equal((seen!.init.headers as Record<string, string>).authorization, "Bearer tok");
  const boom = (async () => { throw new Error("network"); }) as typeof fetch;
  assert.equal(await sendMetaEvent(event, { config, fetchImpl: boom }), false);
  const bad = (async () => new Response("no", { status: 400 })) as typeof fetch;
  assert.equal(await sendMetaEvent(event, { config, fetchImpl: bad }), false);
});

test("wiring: events only leave the browser through the consent check, and the pixel loads only after Accept", () => {
  const client = read("src/lib/analytics/client.ts");
  assert.match(client, /parseAnalyticsConsent\(window\.localStorage\.getItem\(ANALYTICS_CONSENT_STORAGE_KEY\)\) !== "all"/);
  assert.match(client, /globalPrivacyControl/);
  assert.match(client, /isAnalyticsExcludedPath\(pathname\)/);
  const consent = read("src/components/analytics-consent.tsx");
  assert.match(consent, /metaPixelId !== null && consent === "all" && <MetaPixel pixelId=\{metaPixelId\} \/>/);
  const events = read("src/components/analytics-events.tsx");
  assert.ok(!/\bq\b\s*=\s*new URLSearchParams[\s\S]{0,80}get\("q"\)/.test(events) && !/get\("q"\)/.test(events), "the search text is never read, only whether a search happened");
  const env = read("src/app/layout.tsx");
  assert.match(env, /getMetaPixelId\(process\.env\.NEXT_PUBLIC_META_PIXEL_ID\)/);
});
