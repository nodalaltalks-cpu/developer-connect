import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Guards the exact distinction Phase 3B's review asked for:
 *
 *   Founder-only mutations (create a developer, submit a candidate, add
 *   evidence, approve/reject a candidate) MUST require Founder
 *   authorization (`requireFounderForAction`).
 *
 *   User-owned mutations (saving your own profile, reading/marking your
 *   own notifications) MUST require only that a user is signed in
 *   (`requireUserIdForAction`) — never Founder authorization, since any
 *   authenticated user must be able to use these for their own account.
 *
 * This can't be proven by actually calling the Server Actions in
 * `node --test` — both `requireFounderForAction` and
 * `requireUserIdForAction` call into `@clerk/nextjs/server`, which this
 * project's own architecture notes (see src/lib/authorization.ts) cannot
 * be imported into Node's native ESM test runner. So this is a static
 * source check instead: for every exported Server Action in each file,
 * confirm it calls the correct guard and never the other one — a cheap,
 * fast regression guard against exactly the class of bug ("someone swaps
 * the guard, or forgets one") that a live test would normally catch.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const actionsRoot = path.resolve(here, "../../"); // src/app

function readSource(relativePath: string): string {
  return readFileSync(path.join(actionsRoot, relativePath), "utf8");
}

/** Splits a Server Action file into one source slice per exported `async function`, so each function's own guard call can be checked in isolation. */
function extractFunctionBlocks(source: string): { name: string; body: string }[] {
  const starts = [...source.matchAll(/export async function (\w+)/g)];
  return starts.map((match, i) => {
    const start = match.index!;
    const end = i + 1 < starts.length ? starts[i + 1].index! : source.length;
    return { name: match[1], body: source.slice(start, end) };
  });
}

function assertAllUse(filePath: string, requiredGuard: string, forbiddenGuard: string) {
  const source = readSource(filePath);
  const blocks = extractFunctionBlocks(source);
  assert.ok(blocks.length > 0, `${filePath}: found no exported Server Actions to check`);

  for (const { name, body } of blocks) {
    assert.ok(
      body.includes(`${requiredGuard}(`),
      `${filePath} :: ${name} does not call ${requiredGuard}() — every exported action here must`,
    );
    assert.ok(
      !body.includes(`${forbiddenGuard}(`),
      `${filePath} :: ${name} calls ${forbiddenGuard}() — this is a user-owned/founder-only boundary violation`,
    );
  }
}

test("authorization boundary: admin/_actions/developer-actions.ts is Founder-only", () => {
  assertAllUse("admin/_actions/developer-actions.ts", "requireFounderForAction", "requireUserIdForAction");
});

test("authorization boundary: admin/_actions/candidate-actions.ts is Founder-only", () => {
  assertAllUse("admin/_actions/candidate-actions.ts", "requireFounderForAction", "requireUserIdForAction");
});

test("authorization boundary: admin/_actions/verification-actions.ts is Founder-only", () => {
  assertAllUse("admin/_actions/verification-actions.ts", "requireFounderForAction", "requireUserIdForAction");
});

test("authorization boundary: _actions/profile-actions.ts requires only an authenticated user, never Founder", () => {
  assertAllUse("_actions/profile-actions.ts", "requireUserIdForAction", "requireFounderForAction");
});

test("authorization boundary: _actions/notification-actions.ts requires only an authenticated user, never Founder", () => {
  assertAllUse("_actions/notification-actions.ts", "requireUserIdForAction", "requireFounderForAction");
});
