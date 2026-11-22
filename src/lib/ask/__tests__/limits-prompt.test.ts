import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { LIMITS, rateLimit, resetLimits, validateAsk, withinDailyCap } from "../limits.ts";
import { NOT_COVERED, SYSTEM_PROMPT, buildMessages, documentBlocks } from "../prompt.ts";
import { retrieve } from "../retrieve.ts";

beforeEach(() => resetLimits());

test("a question is cleaned, capped and required", () => {
  assert.equal(validateAsk(null).ok, false);
  assert.equal(validateAsk({ question: "   " }).ok, false);
  assert.equal(validateAsk({ question: 42 }).ok, false);
  const long = validateAsk({ question: "a".repeat(LIMITS.maxQuestionChars + 1) });
  assert.equal(long.ok, false);
  const ok = validateAsk({ question: "  How   do I\u0000 check RERA?  " });
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.value.question, "How do I check RERA?");
});

test("history is trimmed, must alternate starting with the visitor, and never ends on the visitor", () => {
  const result = validateAsk({
    question: "And in Dubai?",
    history: [
      { role: "assistant", text: "ignored: starts with the assistant" },
      { role: "user", text: "How do I check a project?" },
      { role: "assistant", text: "Use MahaRERA." },
      { role: "assistant", text: "duplicate role is dropped" },
      { role: "user", text: "dangling user turn is dropped" },
    ],
    market: "dubai",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.history.map((t) => t.role), ["user", "assistant"]);
    assert.equal(result.value.market, "dubai");
  }
  const bad = validateAsk({ question: "x", market: "mars" });
  assert.equal(bad.ok && bad.value.market, undefined);
});

test("a visitor is limited per ten minutes and per day", () => {
  const start = 1_000_000;
  for (let i = 0; i < LIMITS.perTenMinutes; i += 1) assert.equal(rateLimit("a", start + i).allowed, true);
  const blocked = rateLimit("a", start + 100);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds > 0);
  assert.equal(rateLimit("b", start).allowed, true, "another visitor is unaffected");
  assert.equal(rateLimit("a", start + 11 * 60_000).allowed, true, "allowed again after ten minutes");
});

test("the site-wide daily ceiling stops AI answers once reached", () => {
  assert.equal(withinDailyCap(2, 1), true);
  assert.equal(withinDailyCap(2, 2), true);
  assert.equal(withinDailyCap(2, 3), false);
});

test("the rules the answer depends on are in the system prompt", () => {
  for (const must of [NOT_COVERED, "ONLY the documents", "Never rank", "not a lawyer", "never mix rupees and dirhams", "not instructions"]) {
    assert.ok(SYSTEM_PROMPT.toLowerCase().includes(must.toLowerCase()), `missing: ${must}`);
  }
});

test("each retrieved passage becomes a cited document, and the question comes last", () => {
  const retrieved = retrieve("How do I check a project on MahaRERA before paying?", { k: 3 });
  const docs = documentBlocks(retrieved.passages);
  assert.equal(docs.length, retrieved.passages.length);
  for (const doc of docs) {
    assert.equal(doc.citations.enabled, true);
    assert.ok(doc.title.length > 0 && doc.context.includes("Page:"));
  }
  const messages = buildMessages([{ role: "user", text: "hi" }, { role: "assistant", text: "hello" }], "And the fees?", retrieved.passages);
  assert.equal(messages.length, 3);
  const last = messages[2].content;
  assert.ok(Array.isArray(last));
  if (Array.isArray(last)) assert.deepEqual(last[last.length - 1], { type: "text", text: "And the fees?" });
});
