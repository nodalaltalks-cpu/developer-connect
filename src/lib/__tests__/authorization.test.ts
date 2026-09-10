import { test } from "node:test";
import assert from "node:assert/strict";
import { isFounder } from "../authorization.ts";

test("isFounder: true only when privateMetadata.role is exactly 'founder'", () => {
  assert.equal(isFounder({ privateMetadata: { role: "founder" } }), true);
});

test("isFounder: false for a normal authenticated user with no role set", () => {
  assert.equal(isFounder({ privateMetadata: {} }), false);
});

test("isFounder: false for null/undefined (signed-out or unknown user)", () => {
  assert.equal(isFounder(null), false);
  assert.equal(isFounder(undefined), false);
});

test("isFounder: false for any other role value — no generic admin role is granted by accident", () => {
  assert.equal(isFounder({ privateMetadata: { role: "admin" } }), false);
  assert.equal(isFounder({ privateMetadata: { role: "moderator" } }), false);
  assert.equal(isFounder({ privateMetadata: { founder: true } }), false);
});
