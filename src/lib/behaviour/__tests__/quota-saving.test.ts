import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isWorthRecording } from "../events.ts";

test("short engagement summaries with no clicks and clicks Google Analytics already counts are not stored", () => {
  assert.equal(isWorthRecording({ name: "page_engagement", path: "/", engagedSeconds: 3, maxScrollPercent: 20, clicks: 0 }), false);
  assert.equal(isWorthRecording({ name: "page_engagement", path: "/", engagedSeconds: 4, maxScrollPercent: 20, clicks: 2 }), true);
  assert.equal(isWorthRecording({ name: "page_engagement", path: "/", engagedSeconds: 25, maxScrollPercent: 60, clicks: 0 }), true);
  for (const ctaId of ["whatsapp_share", "email_share", "copy_link", "native_share", "sign_in", "hero_market_dubai", "hero_market_mumbai"]) {
    assert.equal(isWorthRecording({ name: "cta_clicked", path: "/", ctaId }), false, ctaId);
  }
});

test("lead-funnel clicks and page views are always stored", () => {
  for (const ctaId of ["connect_developer", "connect_sticky", "connect_card", "advisor_open", "advisor_whatsapp", "advisor_email", "advisor_call", "newsletter_submit", "contact_submit"]) {
    assert.equal(isWorthRecording({ name: "cta_clicked", path: "/", ctaId }), true, ctaId);
  }
  assert.equal(isWorthRecording({ name: "page_viewed", path: "/developers/lodha" }), true);
});

test("the event reader keeps whole-range answers for a while but never per-person lookups", () => {
  const src = readFileSync(new URL("../../firestore/analytics-events.ts", import.meta.url), "utf8");
  assert.match(src, /EVENTS_TTL_MS/);
  assert.match(src, /if \(filter\.userId \|\| filter\.sessionId \|\| filter\.developerId\) return null;/);
});
