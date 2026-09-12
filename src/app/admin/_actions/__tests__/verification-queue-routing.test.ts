import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Static source checks for the verification-queue "Review" navigation
 * added to speed up Founder review — see the "OPTIMIZE FOUNDER
 * VERIFICATION REVIEW WORKFLOW" task. These can't be proven by rendering
 * the page in `node --test` (the admin layout imports
 * `@clerk/nextjs/server`, unloadable here — same constraint as
 * authorization-boundary.test.ts), so they check the actual route
 * strings and the canonical approval call directly in source.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(here, "../../../../"); // src

function readSource(relativePath: string): string {
  return readFileSync(path.join(srcRoot, relativePath), "utf8");
}

test("verification queue: the Review dropdown links to the existing candidate review page and the existing developer detail page — never a public/homepage/generic route", () => {
  const source = readSource("app/admin/verification/page.tsx");

  assert.ok(
    source.includes("`/admin/verification/${candidate.id}`"),
    "the 'Review developer' link must point at the existing candidate review route, keyed by this row's own candidate id",
  );
  assert.ok(
    source.includes("`/admin/developers/${candidate.developerId}`"),
    "the 'Open developer details' link must point at the existing developer detail route, keyed by this row's own developer id",
  );

  // Never a link into the public surface — a template literal that
  // STARTS with /developers/ (no "admin/" prefix) rather than being
  // nested inside /admin/developers/.
  assert.ok(
    !source.includes("`/developers/${"),
    "must never link into the public /developers/[slug] route",
  );
});

test("verification queue: approving a candidate still routes through the single canonical approval service, never a second implementation", () => {
  const actionsSource = readSource("app/admin/_actions/verification-actions.ts");
  const formSource = readSource("components/admin/approve-publish-form.tsx");

  assert.ok(
    actionsSource.includes("approveAndPublishCandidate("),
    "approveCandidateAction must call the existing approveAndPublishCandidate — no duplicate approval logic",
  );
  assert.ok(
    actionsSource.includes("requireFounderForAction()"),
    "approveCandidateAction must still require Founder authorization",
  );
  assert.ok(
    formSource.includes("approveCandidateAction("),
    "the UI must call the existing Server Action, never mutate verification state directly from the client",
  );
});
