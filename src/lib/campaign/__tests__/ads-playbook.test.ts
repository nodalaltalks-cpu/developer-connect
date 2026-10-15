import { test } from "node:test";
import assert from "node:assert/strict";
import { AD_DESCRIPTIONS, AD_HEADLINES, DESCRIPTION_MAX, HEADLINE_MAX, NEGATIVE_KEYWORDS } from "../ads-playbook.ts";
import { buildInstantAlertText, instantAlertConfigFromEnv, sendInstantAlert } from "../../leads/instant-alert.ts";

const BANNED = [/\bverified\b/i, /\bguarantee/i, /\bbest\b/i, /\bno\.?\s?1\b/i, /\bzero (?:brokerage|fees?)\b/i, /\b0%/, /\bbrokerage\b/i, /\blast (?:few|chance)\b/i, /\bhurry\b/i];

test("ad copy: every fixed headline and description fits Google's limits", () => {
  for (const h of AD_HEADLINES) assert.ok(h.length <= HEADLINE_MAX, `"${h}" is ${h.length} characters`);
  for (const d of AD_DESCRIPTIONS) assert.ok(d.length <= DESCRIPTION_MAX, `"${d}" is ${d.length} characters`);
  assert.ok(AD_HEADLINES.length >= 3 && AD_DESCRIPTIONS.length >= 2, "a responsive search ad needs at least 3 headlines and 2 descriptions");
  assert.equal(new Set([...AD_HEADLINES, ...AD_DESCRIPTIONS]).size, AD_HEADLINES.length + AD_DESCRIPTIONS.length, "no duplicates");
});

test("ad copy: no claim the brand never makes, and no fee talk in ads", () => {
  for (const text of [...AD_HEADLINES, ...AD_DESCRIPTIONS]) {
    for (const banned of BANNED) assert.ok(!banned.test(text), `"${text}" must not match ${banned}`);
  }
});

test("negative keywords: no blank or duplicate entries", () => {
  assert.ok(NEGATIVE_KEYWORDS.length > 30);
  assert.equal(new Set(NEGATIVE_KEYWORDS).size, NEGATIVE_KEYWORDS.length);
  for (const k of NEGATIVE_KEYWORDS) assert.equal(k, k.trim().toLowerCase());
});

test("instant alert: off unless a well-formed bot token and chat id are both configured", () => {
  const token = "123456789:AAEhBP0-abcdefghijklmnopqrstuvwxyz12";
  assert.deepEqual(instantAlertConfigFromEnv({ TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: "987654321" }), { token, chatId: "987654321" });
  assert.equal(instantAlertConfigFromEnv({ TELEGRAM_BOT_TOKEN: token }), null);
  assert.equal(instantAlertConfigFromEnv({ TELEGRAM_CHAT_ID: "987654321" }), null);
  assert.equal(instantAlertConfigFromEnv({ TELEGRAM_BOT_TOKEN: "not-a-token", TELEGRAM_CHAT_ID: "987654321" }), null);
  assert.equal(instantAlertConfigFromEnv({ TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: "abc" }), null);
});

test("instant alert: carries the source, campaign and a link, and never a name, number or anything typed", () => {
  const text = buildInstantAlertText({ leadId: "8f1c0b2e-1111-4222-8333-444455556666", created: true, channel: "GOOGLE", campaign: "sample-heights_google_search", landingPath: "/project/sample-heights" });
  assert.match(text, /NEW ENQUIRY/);
  assert.match(text, /Source: GOOGLE/);
  assert.match(text, /Campaign: sample-heights_google_search/);
  assert.match(text, /https:\/\/developerconnects\.com\/admin\/leads\/8f1c0b2e-1111-4222-8333-444455556666$/);
  // everything above the link line (the link holds the lead id, which is not a phone number)
  assert.doesNotMatch(text.split(/\r?\n/).slice(0, -1).join(" "), /\+91|\d{10}/);
  // hostile text in a campaign tag cannot smuggle markup or links into the message
  const hostile = buildInstantAlertText({ leadId: "x", created: false, channel: "WEBSITE", campaign: "<b>click</b> https://evil.test?x=1&y=2" });
  assert.doesNotMatch(hostile, /[<>&?=]/);
});

test("instant alert: a failed or unconfigured send reports false and never throws", async () => {
  const info = { leadId: "x", created: true, channel: "GOOGLE" };
  assert.equal(await sendInstantAlert(info, { config: null }), false);
  const config = { token: "123456789:AAEhBP0-abcdefghijklmnopqrstuvwxyz12", chatId: "987654321" };
  assert.equal(await sendInstantAlert(info, { config, fetchImpl: (async () => { throw new Error("network"); }) as typeof fetch }), false);
  let body = "";
  const ok = await sendInstantAlert(info, { config, fetchImpl: (async (_url: string, init?: RequestInit) => { body = String(init?.body); return new Response("{}", { status: 200 }); }) as typeof fetch });
  assert.equal(ok, true);
  assert.equal(JSON.parse(body).chat_id, "987654321");
});
