import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isAnalyticsExcludedPath } from "../../analytics-config.ts";
import { cleanPath } from "../../behaviour/events.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative: string) => readFileSync(path.resolve(here, "../../../..", relative), "utf8");

const FOUNDER_ACTIONS = ["createTestimonialRequestAction", "markTestimonialSentAction", "moveTestimonialToReviewAction", "approveTestimonialAction", "rejectTestimonialAction", "publishTestimonialAction", "archiveTestimonialAction", "seedIllustrativeTestimonialsAction"];

test("security: every Founder testimonial action resolves the Founder before anything else", () => {
  const source = read("src/app/admin/_actions/testimonial-actions.ts");
  assert.match(source, /^"use server";/);
  const exported = [...source.matchAll(/export async function (\w+)\(/g)].map((m) => m[1]).sort();
  assert.deepEqual(exported, [...FOUNDER_ACTIONS].sort(), "nothing else is exported as a server action");
  for (const name of FOUNDER_ACTIONS) {
    const body = source.slice(source.indexOf(`export async function ${name}(`));
    const head = body.slice(body.indexOf("{") + 1, body.indexOf("{") + 400);
    assert.ok(head.includes("requireFounderForAction()") || head.includes("return run(") || head.includes("await run("), `${name} authorizes first`);
  }
  const run = source.slice(source.indexOf("async function run("), source.indexOf("const founder ="));
  assert.ok(run.indexOf("requireFounderForAction()") < run.indexOf("work(actorId)"));
});

test("security: the Founder page is Founder-only and never cached", () => {
  const page = read("src/app/admin/testimonials/page.tsx");
  assert.match(page, /await requireFounder\(\)/);
  assert.match(page, /robots: \{ index: false, follow: false \}/);
  assert.match(page, /force-dynamic/);
});

test("privacy: the buyer link is never indexed, never cached, never leaked as a referrer, and never reaches analytics", () => {
  const page = read("src/app/testimonial/[token]/page.tsx");
  assert.match(page, /robots: \{ index: false, follow: false \}/);
  assert.match(page, /referrer: "no-referrer"/);
  assert.match(page, /force-dynamic/);
  assert.equal(isAnalyticsExcludedPath("/testimonial/abc123"), true, "GA never sees the secret in the address");
  assert.equal(cleanPath("/testimonial/abc123"), null, "first-party behaviour tracking never records the secret either");
  assert.match(read("src/app/robots.ts"), /"\/testimonial"/);
});

test("public site: testimonials appear only through the gated reader, and are never marked up as reviews", () => {
  const shown = read("src/components/published-testimonials.tsx");
  assert.match(shown, /getPublishedTestimonials/);
  assert.match(shown, /items\.length === 0\) return null/, "nothing at all is rendered when none are published");
  const everything = [shown, read("src/app/(marketing)/page.tsx"), read("src/app/layout.tsx")].join("\n");
  assert.ok(!/"@type":\s*"Review"|AggregateRating|reviewRating/i.test(everything), "no Review or AggregateRating structured data");
  assert.match(read("src/app/(marketing)/page.tsx"), /<PublishedTestimonials \/>/);
});

test("the public submit action takes only the link secret and what was typed, and returns plain text", () => {
  const source = read("src/app/_actions/testimonial-actions.ts");
  assert.ok(!/requireFounder|currentUser|auth\(/.test(source), "the secret in the link is the credential, not a session");
  assert.match(source, /submitByRequestToken\(/);
  assert.ok(!/error\.message\s*\}\)\s*;?\s*$/m.test(source) || /TestimonialValidationError/.test(source));
});
