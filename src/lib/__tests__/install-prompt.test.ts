import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AUTO_HIDE_MS,
  FIRST_DELAY_MS,
  INITIAL_INSTALL_STATE,
  INSTALL_EVENTS,
  MAX_SHOWS,
  REPEAT_MS,
  afterIgnored,
  afterInstalled,
  afterLater,
  afterShown,
  installMessage,
  installPathFor,
  installPromptAllowedOnPath,
  isSettled,
  msUntilDue,
  parseInstallState,
  serializeInstallState,
  type InstallEnvironment,
} from "../install-prompt.ts";
import { CTA_IDS, toAnalyticsEvent } from "../behaviour/events.ts";
import { buildInstallSummary, MIN_SAMPLE, type CtaRow } from "../behaviour/report.ts";

/** The "install the app" banner: its rhythm, its permanent opt-outs, who it may be shown to, and what the Founder sees. */

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const T0 = 1_000_000;

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const env = (over: Partial<InstallEnvironment> = {}): InstallEnvironment => ({ userAgent: ANDROID, maxTouchPoints: 5, platform: "Linux armv81", standalone: false, hasNativePrompt: false, ...over });

test("rhythm: first banner after the first delay, then every 2 minutes", () => {
  assert.equal(msUntilDue(INITIAL_INSTALL_STATE, T0), FIRST_DELAY_MS);
  const shown = afterShown({ ...INITIAL_INSTALL_STATE, nextAt: T0 + FIRST_DELAY_MS }, T0 + FIRST_DELAY_MS);
  assert.equal(shown.shown, 1);
  assert.equal(REPEAT_MS, 120_000, "the Founder asked for every 2 minutes");
  assert.equal(msUntilDue(shown, T0 + FIRST_DELAY_MS), REPEAT_MS);
  assert.equal(msUntilDue(shown, T0 + FIRST_DELAY_MS + REPEAT_MS + 5), 0, "due now once the time has passed");
});

test("a refresh or a click to another page does not restart the wait: the due time is stored", () => {
  const scheduled = { ...INITIAL_INSTALL_STATE, nextAt: T0 + 30_000 };
  assert.equal(msUntilDue(scheduled, T0 + 20_000), 10_000);
});

test("'Not now' keeps the rhythm and is never permanent", () => {
  const later = afterLater(afterShown(INITIAL_INSTALL_STATE, T0), T0 + 5_000);
  assert.equal(later.ignored, false);
  assert.equal(isSettled(later), false);
  assert.ok(typeof msUntilDue(later, T0 + 5_000) === "number");
});

test("'Don't show again' is permanent: nothing is ever due again", () => {
  const ignored = afterIgnored(afterShown(INITIAL_INSTALL_STATE, T0));
  assert.equal(msUntilDue(ignored, T0 + 10 * REPEAT_MS), "settled");
  assert.equal(parseInstallState(serializeInstallState(ignored)).ignored, true, "survives being stored and read back");
});

test("installing is permanent too", () => {
  assert.equal(msUntilDue(afterInstalled(INITIAL_INSTALL_STATE), T0), "settled");
});

test("it never nags without limit", () => {
  let state = INITIAL_INSTALL_STATE;
  for (let i = 0; i < MAX_SHOWS; i++) state = afterShown(state, T0 + i * REPEAT_MS);
  assert.equal(state.shown, MAX_SHOWS);
  assert.equal(msUntilDue(state, T0 + 99 * REPEAT_MS), "settled");
});

test("a corrupted or hostile stored value is a first visit, never an accidental 'ignored'", () => {
  for (const raw of [null, undefined, "", "not json", "null", "[]", '"x"', '{"shown":"many","nextAt":-5,"ignored":"yes"}']) {
    const state = parseInstallState(raw);
    assert.equal(state.ignored, false, String(raw));
    assert.equal(state.installed, false, String(raw));
    assert.equal(state.nextAt, 0, String(raw));
  }
  assert.equal(parseInstallState('{"shown":99999}').shown, 1000, "a count is clamped");
});

test("who may see it: only browsers that can really install", () => {
  assert.equal(installPathFor(env({ hasNativePrompt: true })), "native", "Chrome / Edge / Samsung with the browser's install event");
  assert.equal(installPathFor(env({ userAgent: IPHONE, platform: "iPhone", hasNativePrompt: false })), "ios");
  assert.equal(installPathFor(env({ userAgent: "Mozilla/5.0 (Macintosh)", platform: "MacIntel", maxTouchPoints: 5 })), "ios", "an iPad that reports itself as a Mac");
  assert.equal(installPathFor(env({ userAgent: "Mozilla/5.0 (Macintosh)", platform: "MacIntel", maxTouchPoints: 0 })), "none", "a real Mac in Safari or Firefox: nothing to offer");
  assert.equal(installPathFor(env()), "none", "Android Firefox / any browser without the install event");
});

test("never to someone already in the installed app, nor inside the Facebook / Instagram app", () => {
  assert.equal(installPathFor(env({ standalone: true, hasNativePrompt: true })), "none");
  assert.equal(installPathFor(env({ userAgent: `${IPHONE} Instagram 320.0`, platform: "iPhone" })), "none");
  assert.equal(installPathFor(env({ userAgent: `${ANDROID} [FBAN/FB4A;FBAV/450.0]`, hasNativePrompt: true })), "none");
});

test("never on sign-in, the profile, the team workspace or the Founder's admin", () => {
  for (const blocked of ["/admin", "/admin/behaviour", "/team", "/team/leads", "/profile", "/sign-in", "/sign-up", "/post-sign-in", "/testimonial/abc"]) {
    assert.equal(installPromptAllowedOnPath(blocked), false, blocked);
  }
  for (const ok of ["/", "/developers", "/developers/acme", "/enquire", "/guides/x", "/teamwork-guide"]) assert.equal(installPromptAllowedOnPath(ok), true, ok);
  assert.equal(installPromptAllowedOnPath(null), false);
});

test("wording: three framings rotate, and nothing claims what we cannot prove", () => {
  const texts = [0, 1, 2].map(installMessage);
  assert.equal(new Set(texts.map((t) => t.headline)).size, 3, "a repeat is not the same sentence twice in a row");
  assert.deepEqual(installMessage(3), installMessage(0));
  assert.deepEqual(installMessage(-1), installMessage(2), "never throws on a bad index");
  const all = texts.map((t) => `${t.headline} ${t.body}`).join(" ");
  assert.doesNotMatch(all, /\b(faster|fastest|limited|hurry|last chance|expires?|thousands|millions)\b/i, "no unmeasured speed claims, countdowns, scarcity or invented social proof");
  assert.doesNotMatch(all, /\b(fees?|0%|zero)\b/i, "no fee talk outside the disclaimer");
});

test("the banner leaves by itself, and waits for the visitor to finish reading", () => {
  assert.ok(AUTO_HIDE_MS >= 15_000 && AUTO_HIDE_MS < REPEAT_MS);
});

test("every banner outcome is an event the collector accepts, so the Founder's page can count it", () => {
  for (const id of Object.values(INSTALL_EVENTS)) {
    assert.ok((CTA_IDS as readonly string[]).includes(id), id);
    const stored = toAnalyticsEvent({ name: "cta_clicked", path: "/", ctaId: id }, { sessionId: "s", deviceType: "mobile", userAgent: ANDROID, globalPrivacyControl: false, now: new Date() });
    assert.equal(stored?.eventName, "cta_clicked", id);
  }
});

const row = (ctaId: string, visitors: number, device: CtaRow["device"] = "mobile"): CtaRow => ({ ctaId, device, clicks: visitors, visitors });

test("founder summary: counts visitor sessions per outcome and draws rates only from a real sample", () => {
  const small = buildInstallSummary([row("install_prompt_shown", MIN_SAMPLE - 1), row("install_completed", 3)]);
  assert.equal(small.shown, MIN_SAMPLE - 1);
  assert.equal(small.installed, 3);
  assert.equal(small.installedPercent, null, "too few sessions to call it a rate");

  const big = buildInstallSummary([
    row("install_prompt_shown", 100),
    row("install_prompt_shown", 50, "desktop"),
    row("install_prompt_accepted", 30),
    row("install_completed", 15),
    row("install_prompt_never", 45),
    row("install_prompt_later", 60),
    row("install_prompt_steps", 7),
    row("install_native_declined", 4),
    row("install_app_opened", 22),
  ]);
  assert.equal(big.shown, 150);
  assert.equal(big.tappedPercent, 20);
  assert.equal(big.installedPercent, 10);
  assert.equal(big.neverPercent, 30);
  assert.equal(big.appVisits, 22);
  assert.deepEqual(big.byDevice, [{ device: "mobile", shown: 100, installed: 15 }, { device: "desktop", shown: 50, installed: 0 }]);
  assert.deepEqual(buildInstallSummary([]).byDevice, []);
});

test("the dashboard shows the install numbers and the banner is mounted site-wide", () => {
  const page = readFileSync(path.join(root, "src/app/admin/behaviour/page.tsx"), "utf8");
  assert.match(page, /buildInstallSummary/);
  assert.match(page, /Install-the-app banner/);
  assert.match(readFileSync(path.join(root, "src/app/layout.tsx"), "utf8"), /<InstallPrompt \/>/);
});

test("installability: the manifest names the app and its icons exist at the sizes browsers require", () => {
  const manifest = readFileSync(path.join(root, "src/app/manifest.ts"), "utf8");
  assert.match(manifest, /display: "standalone"/);
  for (const icon of ["icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png"]) {
    assert.ok(manifest.includes(`/${icon}`), icon);
    assert.ok(existsSync(path.join(root, "public", icon)), `public/${icon} exists`);
  }
});

test("'Accept only essentials' still counts the install banner (and only that), and the policies say so", () => {
  const client = readFileSync(path.join(root, "src/lib/behaviour/client.ts"), "utf8");
  assert.match(client, /essentialOk/);
  assert.match(client, /doNotTrack/, "a privacy signal still stops it");
  assert.match(readFileSync(path.join(root, "src/components/install-prompt.tsx"), "utf8"), /trackCta\(id, pathRef\.current \|\| "\/", true\)/);
  assert.doesNotMatch(readFileSync(path.join(root, "src/components/behaviour-tracker.tsx"), "utf8"), /trackingAllowed\(true\)/, "page tracking still honours the choice");
  for (const page of ["privacy", "cookies"]) {
    const text = readFileSync(path.join(root, "src/app", page, "page.tsx"), "utf8").replace(/\s+/g, " ");
    assert.match(text, /install the app(&rdquo;| )? banner/i, page);
    assert.match(text, /Global Privacy Control/, page);
  }
});
