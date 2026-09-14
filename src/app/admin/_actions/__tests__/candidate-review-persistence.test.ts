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
