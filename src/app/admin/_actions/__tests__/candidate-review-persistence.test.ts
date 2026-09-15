import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Regression coverage for the "Save inside the expanded Review panel shows
 * a stale value" bug. The panel can't be rendered in `node --test` (see
 * verification-queue-routing.test.ts for why), so — same as that file —
 * this asserts the actual wiring in source: every Save path in
 * CandidateReviewPanel must render from the Server Action's own returned
 * record, and must never call `router.refresh()` (which would re-render
 * from server props instead of the fresh client-held value, and would also
 * collapse the panel / reset scroll position).
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(here, "../../../../"); // src

function readSource(relativePath: string): string {
  return readFileSync(path.join(srcRoot, relativePath), "utf8");
}

test("CandidateReviewPanel and its children never use useRouter()/router.refresh() — updates come from Server Action return values only", () => {
  for (const file of [
    "components/admin/candidate-review-panel.tsx",
    "components/admin/developer-edit-form.tsx",
    "components/admin/candidate-url-editor.tsx",
    "components/admin/verification-queue-list.tsx",
  ]) {
    const source = readSource(file);
    assert.ok(
      !source.includes("useRouter"),
      `${file} must not import/call useRouter() — a router.refresh() re-render would re-render from server props instead of the fresh client-held value, and would collapse the panel / reset scroll position (see developer-edit-form.tsx's onSaved doc comment)`,
    );
  }
});

test("DeveloperEditForm renders its fields from the Server Action's returned developer, not a locally-guessed value", () => {
  const source = readSource("components/admin/developer-edit-form.tsx");
  assert.ok(
    source.includes("setFields(toFields(result.developer))"),
    "after a successful save, the form's displayed field values must be re-derived from result.developer (the fresh persisted row), not left as whatever the founder typed",
  );
  assert.ok(source.includes("onSaved?.(result.developer)"), "must propagate the fresh persisted developer to the parent panel");
});

test("CandidateUrlEditor renders the saved URL from the Server Action's returned candidate", () => {
  const source = readSource("components/admin/candidate-url-editor.tsx");
  assert.ok(
    source.includes("updateCandidateUrlAction"),
    "must save through the canonical updateCandidateUrlAction Server Action",
  );
  assert.ok(
    source.includes("onSaved(result.candidate)") && source.includes("setValue(result.candidate.url)"),
    "after a successful save, both the parent panel and the editor's own field must be updated from result.candidate.url — the actual persisted value — not the locally-typed input",
  );
});

test("CandidateReviewPanel keeps candidate/developer in local state and threads updates through onSaved/onCandidateUpdated — never re-reads initialData after mount", () => {
  const source = readSource("components/admin/candidate-review-panel.tsx");
  assert.ok(source.includes("useState(initialData.candidate)"), "candidate must be held in local state seeded once from initialData");
  assert.ok(source.includes("useState<Developer | null>(initialData.developer)"), "developer must be held in local state seeded once from initialData");
  assert.ok(
    source.includes("<CandidateUrlEditor candidate={candidate} onSaved={handleCandidateUpdate} />"),
    "the URL editor must be wired to the panel's own candidate state and update handler, so a saved URL immediately reflects in this same expanded panel",
  );
});

test("updateCandidateUrlAction returns the freshly-persisted candidate from the update call, not a re-derived/guessed one", () => {
  const source = readSource("app/admin/_actions/candidate-actions.ts");
  assert.ok(
    /const candidate = await updateCandidateUrl\(/.test(source),
    "must call the canonical updateCandidateUrl service function",
  );
  assert.ok(
    /return \{ ok: true, candidate \};/.test(source),
    "must return the service function's own returned candidate directly",
  );
});

/**
 * Regression coverage for the "Headquarters reverts after Save" bug
 * reported against the INLINE /admin/verification accordion (as opposed
 * to the standalone /admin/verification/[candidateId] page, which always
 * re-fetches from the server and never had this bug).
 *
 * Root cause: VerificationQueueList fetches each candidate's full
 * CandidateReviewData exactly once and caches it in `reviewData`, keyed
 * by candidate id — by design, so re-expanding an already-fetched row
 * doesn't pay for another round trip. But the update handlers it passes
 * down (handleDeveloperUpdated / handleCandidateUpdated) only updated the
 * separate `rows` summary array, never that cache. So: edit Headquarters
 * -> Save -> value is correct (CandidateReviewPanel's OWN state was
 * updated) -> collapse -> re-expand -> CandidateReviewPanel remounts,
 * re-seeding itself from the STALE cached `reviewData` entry from before
 * the edit -> the old value reappears, even though the database (and the
 * standalone page) already has the new one.
 *
 * These tests assert the fix directly in source: both handlers must also
 * update the `reviewData` cache, not just `rows`.
 */
test("VerificationQueueList's handleDeveloperUpdated updates the cached reviewData entry, not just the collapsed row summary", () => {
  const source = readSource("components/admin/verification-queue-list.tsx");
  const fnMatch = source.match(/function handleDeveloperUpdated\([\s\S]*?\n  \}/);
  assert.ok(fnMatch, "handleDeveloperUpdated must exist");
  const fnBody = fnMatch[0];
  assert.ok(
    fnBody.includes("setRows("),
    "must still keep the collapsed row's own display name in sync (existing behavior)",
  );
  assert.ok(
    /setReviewData\(/.test(fnBody),
    "must ALSO update the cached reviewData entry for this candidate — otherwise collapsing and " +
      "re-expanding this row remounts CandidateReviewPanel from the stale pre-edit fetch, and a just-saved " +
      "field (e.g. Headquarters) appears to revert even though the database already has the new value",
  );
});

test("VerificationQueueList's handleCandidateUpdated updates the cached reviewData entry, not just the collapsed row summary", () => {
  const source = readSource("components/admin/verification-queue-list.tsx");
  const fnMatch = source.match(/function handleCandidateUpdated\([\s\S]*?\n  \}/);
  assert.ok(fnMatch, "handleCandidateUpdated must exist");
  const fnBody = fnMatch[0];
  assert.ok(
    /setReviewData\(/.test(fnBody),
    "must update the cached reviewData entry for this candidate (e.g. a saved 'Edit URL' change) so a " +
      "collapse/re-expand of this row never shows an older candidate.url than what's actually persisted",
  );
});
