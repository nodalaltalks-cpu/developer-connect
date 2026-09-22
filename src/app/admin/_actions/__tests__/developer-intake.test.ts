import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Regression coverage for the "Create Developer button appears to do
 * nothing" bug: createDeveloperAction called requireFounderForAction()
 * outside its try/catch, so an auth failure threw uncaught instead of
 * resolving to { ok: false, error }, and the intake form's Legal name
 * field was marked required in the DOM even though it is meant to be
 * optional. Same source-assertion style as candidate-review-persistence.test.ts
 * — these files have server-only/DOM dependencies not easily unit-run here.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(here, "../../../../"); // src

function readSource(relativePath: string): string {
  return readFileSync(path.join(srcRoot, relativePath), "utf8");
}

function extractFunction(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}`);
  assert.ok(start !== -1, `${name} not found`);
  // Function body ends at the first top-level closing brace on its own line
  // after the opening brace that follows the signature.
  const openBrace = source.indexOf("{", source.indexOf(")", start));
  let depth = 0;
  for (let i = openBrace; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Could not find end of ${name}`);
}

function extractInputBlock(source: string, id: string): string {
  const allInputs = source.match(/<input\b[\s\S]*?\/>/g) ?? [];
  const found = allInputs.find((block) => block.includes(`id="${id}"`));
  assert.ok(found, `<input id="${id}"> not found`);
  return found;
}

test("createDeveloperAction catches requireFounderForAction() failures and returns { ok: false } instead of throwing uncaught", () => {
  const fn = extractFunction(readSource("app/admin/_actions/developer-actions.ts"), "createDeveloperAction");

  const tryIndex = fn.indexOf("try {");
  const authIndex = fn.indexOf("requireFounderForAction()");
  const catchIndex = fn.indexOf("} catch (err)");

  assert.ok(tryIndex !== -1, "expected a try block");
  assert.ok(authIndex !== -1, "expected a call to requireFounderForAction()");
  assert.ok(catchIndex !== -1, "expected a catch (err) block");
  assert.ok(tryIndex < authIndex, "requireFounderForAction() must be called AFTER the try block opens");
  assert.ok(authIndex < catchIndex, "requireFounderForAction() must be called BEFORE the try block's catch");
  assert.ok(
    /catch \(err\) \{\s*return \{ ok: false, error:/.test(fn),
    "the catch block must resolve to { ok: false, error: ... }, not rethrow",
  );
});

test("DeveloperIntakeForm: Legal name is optional (no native required constraint)", () => {
  const source = readSource("components/admin/developer-intake-form.tsx");
  const block = extractInputBlock(source, "legalName");
  assert.ok(!/\brequired\b/.test(block), "legalName input must not have the required attribute");
});

test("DeveloperIntakeForm: Display name, Official website, City, State, and Country remain required", () => {
  const source = readSource("components/admin/developer-intake-form.tsx");
  for (const id of ["displayName", "officialWebsite", "city", "state", "country"]) {
    const block = extractInputBlock(source, id);
    assert.ok(/\brequired\b/.test(block), `${id} input must keep the required attribute`);
  }
});
