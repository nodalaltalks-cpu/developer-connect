import { test } from "node:test";
import assert from "node:assert/strict";
import type { AcquisitionRow } from "../acquisition.ts";
import { buildChannelQuality, minutesToFirstContact } from "../response-quality.ts";

const T0 = new Date("2026-10-16T10:00:00.000Z");
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

function lead(id: number, over: Partial<AcquisitionRow> = {}): AcquisitionRow {
  return {
    leadId: `l${id}`,
    createdAt: T0,
    sourceType: "DIGITAL",
    creationMethod: "WEBSITE",
    first: { utmSource: "google", utmMedium: "cpc", utmCampaign: "park-avenue_google_search", gclid: "g", fbclid: null, referrer: null, landingPath: "/project/park-avenue" },
    latest: null,
    reachedQualified: false,
    hasSiteVisit: false,
    booked: false,
    bookings: [],
    ...over,
  };
}

test("time to first contact: minutes, never negative, null when nobody has called", () => {
  assert.equal(minutesToFirstContact(lead(1, { firstContactAt: at(3) })), 3);
  assert.equal(minutesToFirstContact(lead(2, { firstContactAt: at(-4) })), 0);
  assert.equal(minutesToFirstContact(lead(3, { firstContactAt: null })), null);
  assert.equal(minutesToFirstContact(lead(4)), null);
});

test("quality: median, fast share, never-contacted and junk rate for a channel with enough leads", () => {
  const rows: AcquisitionRow[] = [];
  const minutes = [1, 2, 2, 3, 4, 6, 9, 30, 90];
  minutes.forEach((m, i) => rows.push(lead(i, { firstContactAt: at(m), junk: i < 2 })));
  rows.push(lead(100, { firstContactAt: null, junk: true }));
  const [google] = buildChannelQuality(rows);
  assert.equal(google.channel, "GOOGLE_ADS");
  assert.equal(google.leads, 10);
  assert.equal(google.contacted, 9);
  assert.equal(google.neverContacted, 1);
  assert.equal(google.medianMinutes, 4);
  assert.equal(google.fastShare, 55.6, "5 of 9 contacted within 5 minutes");
  assert.equal(google.junk, 3);
  assert.equal(google.junkRate, 30);
});

test("quality: a small sample shows counts but no median or percentage", () => {
  const rows = [lead(1, { firstContactAt: at(2), junk: true }), lead(2, { firstContactAt: at(40) })];
  const [google] = buildChannelQuality(rows);
  assert.equal(google.leads, 2);
  assert.equal(google.junk, 1);
  assert.equal(google.medianMinutes, null);
  assert.equal(google.fastShare, null);
  assert.equal(google.junkRate, null);
});

test("quality: cold-call and imported leads are not measured as responded-to", () => {
  const rows = [lead(1, { sourceType: "COLD_CALL", creationMethod: "COLD_CALLING", first: null })];
  assert.deepEqual(buildChannelQuality(rows), []);
});
