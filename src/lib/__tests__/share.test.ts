import { test } from "node:test";
import assert from "node:assert/strict";
import { buildShareMessage, buildWhatsAppShareUrl, buildMailtoShareUrl } from "../share.ts";

test("buildShareMessage: names the developer and includes the exact URL, with no marketing language", () => {
  const message = buildShareMessage("Test Developer Co", "https://developer-connect-tau.vercel.app/developers/test-developer-co");
  assert.ok(message.includes("Test Developer Co"));
  assert.ok(message.includes("https://developer-connect-tau.vercel.app/developers/test-developer-co"));
  assert.ok(!message.toLowerCase().includes("limited time"));
  assert.ok(!message.toLowerCase().includes("don't miss"));
});

test("buildWhatsAppShareUrl: produces a wa.me link with the message URL-encoded", () => {
  const url = buildWhatsAppShareUrl("Test Co", "https://example.com/developers/test-co");
  assert.ok(url.startsWith("https://wa.me/?text="));
  const decoded = decodeURIComponent(url.replace("https://wa.me/?text=", ""));
  assert.ok(decoded.includes("Test Co"));
  assert.ok(decoded.includes("https://example.com/developers/test-co"));
});

test("buildMailtoShareUrl: sets subject and body, both URL-encoded", () => {
  const url = buildMailtoShareUrl("Test Co", "https://example.com/developers/test-co");
  assert.ok(url.startsWith("mailto:?subject="));
  assert.ok(url.includes(encodeURIComponent("Official website for Test Co")));
  assert.ok(url.includes("body="));
});

test("buildShareMessage: never collects or references a phone number", () => {
  const message = buildShareMessage("Test Co", "https://example.com/developers/test-co");
  assert.ok(!/\+?\d{7,}/.test(message));
});
