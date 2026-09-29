import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  gaCookieNamesIn,
  getGaMeasurementId,
  isAnalyticsExcludedPath,
  isGaCookieName,
  parseAnalyticsConsent,
} from "../analytics-config.ts";

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");

test("getGaMeasurementId: analytics is OFF when nothing is configured", () => {
  assert.equal(getGaMeasurementId(undefined), null);
  assert.equal(getGaMeasurementId(null), null);
  assert.equal(getGaMeasurementId(""), null);
  assert.equal(getGaMeasurementId("   "), null);
});

test("getGaMeasurementId: a well-formed GA4 measurement ID is accepted (whitespace trimmed)", () => {
  assert.equal(getGaMeasurementId("G-ABCDEF1234"), "G-ABCDEF1234");
  assert.equal(getGaMeasurementId("  G-ABCDEF1234\n"), "G-ABCDEF1234");
});

test("getGaMeasurementId: malformed or hostile values are rejected, so nothing unsafe reaches the inline snippet", () => {
  for (const bad of [
    "UA-12345-1", // legacy Universal Analytics
    "g-abcdef1234", // wrong case
    "G-", // too short
    "G-ABC", // too short
    "G-ABCDEF1234'); alert(1);//", // injection attempt
    "G-ABCDEF1234</script><script>x", // script break-out attempt
    "G-ABCDEF 1234",
    "AW-123456789",
  ]) {
    assert.equal(getGaMeasurementId(bad), null, `should reject ${JSON.stringify(bad)}`);
  }
});

test("isAnalyticsExcludedPath: private and signed-in areas are excluded, including everything beneath them", () => {
  for (const path of [
    "/admin",
    "/admin/",
    "/admin/developers/abc-123",
    "/admin/contact/trash",
    "/profile",
    "/profile/settings",
    "/post-sign-in",
    "/post-sign-in/anything",
  ]) {
    assert.equal(isAnalyticsExcludedPath(path), true, `${path} should be excluded`);
  }
});

test("isAnalyticsExcludedPath: public pages are tracked, and a prefix only matches at a path-segment boundary", () => {
  for (const path of [
    "/",
    "/developers",
    "/developers/42-estates",
    "/about",
    "/faq",
    "/contact",
    "/privacy",
    "/administrative", // starts with "/admin" but is a different segment
    "/profiles",
    "/developers/admin",
  ]) {
    assert.equal(isAnalyticsExcludedPath(path), false, `${path} should not be excluded`);
  }
  assert.equal(isAnalyticsExcludedPath(null), false);
  assert.equal(isAnalyticsExcludedPath(undefined), false);
  assert.equal(isAnalyticsExcludedPath(""), false);
});

test("layout: the ID comes only from the validated env var, is never hard-coded, and is handed to the consent provider", () => {
  const layout = read("../../app/layout.tsx");
  assert.match(layout, /getGaMeasurementId\(process\.env\.NEXT_PUBLIC_GA_MEASUREMENT_ID\)/);
  assert.match(layout, /<AnalyticsConsentProvider measurementId=\{gaMeasurementId\}>\{children\}<\/AnalyticsConsentProvider>/);
  assert.doesNotMatch(layout, /G-[A-Z0-9]{6,}/);
  // Google Analytics is never mounted directly from the layout — only via the consent provider.
  assert.doesNotMatch(layout, /<GoogleAnalytics/);
});

test("parseAnalyticsConsent: only the two known choices are accepted; anything else means no choice yet", () => {
  assert.equal(parseAnalyticsConsent("all"), "all");
  assert.equal(parseAnalyticsConsent("essential"), "essential");
  for (const other of [null, undefined, "", "ALL", "true", "reject", "none", "all ", '{"a":1}']) {
    assert.equal(parseAnalyticsConsent(other), null, `should not accept ${JSON.stringify(other)}`);
  }
});

test("gaCookieNamesIn: finds only Google Analytics cookies (_ga, _ga_<id>), never other cookies", () => {
  const cookies = "dc_session=abc; _ga=GA1.1.1.1; theme=dark; _ga_ABCDEF1234=GS2.1.x; __clerk_db_jwt=zzz; _gat=1; _gid=2";
  assert.deepEqual(gaCookieNamesIn(cookies).sort(), ["_ga", "_ga_ABCDEF1234"]);
  assert.deepEqual(gaCookieNamesIn(""), []);
  assert.deepEqual(gaCookieNamesIn("dc_session=abc"), []);
  assert.equal(isGaCookieName("_ga"), true);
  assert.equal(isGaCookieName("_gaming"), false);
});

test("consent banner: exactly two equal choices, 'Accept' and 'Accept only essentials' — no Reject", () => {
  const source = read("../../components/analytics-consent.tsx");
  const buttons = [...source.matchAll(/<button\s+type="button"\s+onClick=\{\(\) => choose\("(all|essential)"\)\}\s+className=\{buttonClassName\("(\w+)"\)\}>\s*([^<]+?)\s*<\/button>/g)];
  assert.equal(buttons.length, 2);
  const [accept, essentials] = buttons;
  assert.deepEqual([accept[1], accept[3]], ["all", "Accept"]);
  assert.deepEqual([essentials[1], essentials[3]], ["essential", "Accept only essentials"]);
  // Same style variant, so neither choice is visually favoured.
  assert.equal(accept[2], essentials[2]);
  // No rendered label anywhere offers Reject / Decline / Deny (comments explaining the design are fine).
  assert.doesNotMatch(source, />\s*(Reject|Decline|Deny)/i);
  assert.equal((source.match(/<button\b/g) ?? []).length, 3); // the two choices + the footer "Cookie settings" opener
});

test("consent banner: Google Analytics loads only after 'Accept', is switched off and its cookies removed on essentials", () => {
  const source = read("../../components/analytics-consent.tsx");
  assert.match(source, /measurementId !== null && consent === "all" && <GoogleAnalytics measurementId=\{measurementId\} \/>/);
  assert.match(source, /if \(choice === "essential"\) removeGaCookies\(\);/);
  assert.match(source, /ga-disable-\$\{measurementId\}`\] = choice !== "all"/);
  // No choice yet (consent === null) => the banner shows and analytics stays off; the server render never assumes a choice.
  assert.match(source, /\(consent === null \|\| reopened\)/);
  assert.match(source, /const getServerSnapshot = \(\) => UNKNOWN;/);
  // The banner never appears on private routes, and with no measurement ID there is no banner at all.
  assert.match(source, /!isAnalyticsExcludedPath\(pathname\)/);
  assert.match(source, /const enabled = measurementId !== null;/);
  assert.match(source, /if \(!enabled\) return null;/);
});

test("footer: offers 'Cookie settings' in the Legal column so the choice can be changed", () => {
  const footer = read("../../components/site-footer.tsx");
  assert.match(footer, /column\.heading === "Legal" && <CookieSettingsButton \/>/);
});

test("policies: Cookie and Privacy pages disclose optional Google Analytics and no longer claim there is none", () => {
  const cookies = read("../../app/cookies/page.tsx");
  const privacy = read("../../app/privacy/page.tsx");
  assert.match(cookies, /Google Analytics/);
  assert.match(cookies, /Accept only\s+essentials/);
  assert.doesNotMatch(cookies, /we have not built a\s+cookie-consent banner/);
  assert.doesNotMatch(cookies, /We do not use third-party advertising cookies, cross-site tracking cookies\/pixels, or a third-party/);
  assert.match(privacy, /<strong>Google Analytics<\/strong>/);
  assert.match(privacy, /Other than Google Analytics \(optional/);
  assert.doesNotMatch(privacy, /We do not currently use a third-party analytics platform, advertising network/);
});

test("component: loads gtag via next/script only for public paths, with the documented per-property opt-out for private ones", () => {
  const component = read("../../components/google-analytics.tsx");
  assert.match(component, /import Script from "next\/script"/);
  assert.match(component, /isAnalyticsExcludedPath\(pathname\)/);
  assert.match(component, /if \(excluded\) return null;/);
  assert.match(component, /ga-disable-\$\{measurementId\}/);
  assert.doesNotMatch(component, /G-[A-Z0-9]{6,}/);
  // The inline snippet is the standard gtag bootstrap and nothing else (no custom events, no user data).
  assert.doesNotMatch(component, /gtag\('(event|set|consent)'/);
  assert.doesNotMatch(component, /user_id|userId|email/i);
});
