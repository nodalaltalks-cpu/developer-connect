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

test("verification queue: 'Review' expands the row inline using this row's own candidate id, and 'Open developer details' still points at the real developer detail route — never a public/homepage/generic route", () => {
  const listSource = readSource("components/admin/verification-queue-list.tsx");
  const actionsSource = readSource("app/admin/_actions/verification-actions.ts");

  // Inline review (Part 2 of the "INLINE EXPANDABLE REVIEW" task)
  // replaced navigating to /admin/verification/[candidateId] as the
  // queue's primary interaction — the row now fetches that same
  // candidate's full review data in place, keyed by its own id, via the
  // canonical getCandidateReviewDataAction (no second data-fetching
  // implementation).
  assert.ok(
    listSource.includes("getCandidateReviewDataAction(candidateId)"),
    "the Review toggle must fetch this row's own candidate's review data via the canonical Server Action",
  );
  assert.ok(
    listSource.includes("toggle(candidate.id)"),
    "the Review button must be wired to this row's own candidate id, not a shared/fixed id",
  );
  assert.ok(
    actionsSource.includes("async function getCandidateReviewDataAction"),
    "getCandidateReviewDataAction must exist as the single source of on-demand review data",
  );
  assert.ok(
    listSource.includes("`/admin/developers/${candidate.developerId}`"),
    "the 'Open developer details' link must point at the existing developer detail route, keyed by this row's own developer id",
  );

  // Never a link into the public surface — a template literal that
  // STARTS with /developers/ (no "admin/" prefix) rather than being
  // nested inside /admin/developers/.
  assert.ok(
    !listSource.includes("`/developers/${"),
    "must never link into the public /developers/[slug] route",
  );

  // The detail route itself must still exist and still work for direct
  // links — Part 8 explicitly requires not breaking it.
  const detailPageSource = readSource("app/admin/verification/[candidateId]/page.tsx");
  assert.ok(
    detailPageSource.includes("CandidateReviewPanel"),
    "the standalone detail route must still render a real, working review workspace",
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
