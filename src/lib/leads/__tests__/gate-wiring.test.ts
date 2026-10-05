import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Static guards for how the assistance gate is wired into the site. They read
 * source so they keep protecting these promises even when a future edit still
 * compiles and passes behavioural tests: the browser is never given the
 * destination up front, public actions never use the founder guard, the sign-in
 * prompt cannot stack on the gate, and the verification/SEO surface survives.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(here, "../../..");
const read = (relative: string) => readFileSync(path.join(srcRoot, relative), "utf8");

/** Strips comments so a rule is checked against code, not prose. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function listFiles(dir: string, accept: (file: string) => boolean): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (name === "node_modules" || name === ".next") continue;
    if (statSync(full).isDirectory()) out.push(...listFiles(full, accept));
    else if (accept(full)) out.push(full);
  }
  return out;
}

// =================================================================================================
// THE PUBLIC SERVER ACTIONS
// =================================================================================================

const ACTIONS = "app/_actions/lead-gate-actions.ts";

test("actions: the file is a 'use server' module exporting exactly the four public gate actions", () => {
  const source = read(ACTIONS);
  assert.match(source, /^"use server";/);
  const exported = [...source.matchAll(/^export async function (\w+)/gm)].map((match) => match[1]);
  assert.deepEqual(exported, ["getGateState", "recordGateFormStarted", "submitGate", "continueAsReturning"]);
  assert.doesNotMatch(source, /^export (const|let|var|function)\b/m, "a 'use server' file may export only async functions");
});

test("actions: PUBLIC — no founder authorization anywhere (these are the buyer's own actions)", () => {
  const source = code(read(ACTIONS));
  assert.doesNotMatch(source, /requireFounder|isFounder|requireUserIdForAction/);
});

test("actions: the browser can pass no URL — no action takes (or reads) a url, redirect or destination parameter", () => {
  const source = code(read(ACTIONS));
  const signatures = [...source.matchAll(/export async function \w+\(([^)]*)\)/g)].map((match) => match[1]);
  for (const signature of signatures) assert.doesNotMatch(signature, /url|redirect|destination|href|next/i, signature);
  assert.doesNotMatch(source, /input\.(url|destinationUrl|redirect|redirectUrl|href|next)\b/);

  // The input types the actions accept have no URL-shaped field either.
  const flow = code(read("lib/leads/gate/gate-flow.ts"));
  for (const name of ["GateSubmitInput", "GateReturningInput"]) {
    const block = flow.slice(flow.indexOf(`export interface ${name}`), flow.indexOf("}", flow.indexOf(`export interface ${name}`)));
    assert.doesNotMatch(block, /\b(url|destinationUrl|redirect\w*|href|next|returnTo)\??:/i, `${name} accepts a URL`);
  }
});

test("actions: the destination reaches the browser only inside a server-approved response", () => {
  const flow = code(read("lib/leads/gate/gate-flow.ts"));
  const responses = flow.slice(flow.indexOf("export type GateSubmitResponse"), flow.indexOf("export type GateStateResponse"));
  const okBranch = responses.slice(0, responses.indexOf("| { ok: false"));
  assert.match(okBranch, /destinationUrl: string/);
  assert.doesNotMatch(responses.slice(responses.indexOf("| { ok: false")), /destinationUrl/, "an error response can never carry a URL");
});

test("actions: every action catches failure and returns an error response — an exception is never a bypass", () => {
  const source = code(read(ACTIONS));
  for (const name of ["getGateState", "recordGateFormStarted", "submitGate", "continueAsReturning"]) {
    const start = source.indexOf(`export async function ${name}`);
    const body = source.slice(start, source.indexOf("\nexport async function", start + 1) === -1 ? undefined : source.indexOf("\nexport async function", start + 1));
    assert.match(body, /try \{/, `${name} has no try`);
    assert.match(body, /catch/, `${name} has no catch`);
  }
  assert.match(source, /TEMPORARY_FAILURE/);
});

test("actions: the returning-buyer cookie is httpOnly, SameSite=Lax, secure in production, and holds only a signed token", () => {
  const source = code(read(ACTIONS));
  assert.match(source, /httpOnly: true/);
  assert.match(source, /sameSite: "lax"/);
  assert.match(source, /secure: process\.env\.NODE_ENV === "production"/);
  assert.match(source, /signLeadToken\(leadId, process\.env\.LEAD_COOKIE_SECRET/);
  assert.doesNotMatch(source, /cookies\(\)\)\.set\([^)]*phone/i);
});

test("actions: nothing is logged (a phone number must never reach a log line)", () => {
  assert.doesNotMatch(code(read(ACTIONS)), /\bconsole\s*\./);
  assert.doesNotMatch(code(read("lib/leads/gate/gate-service.ts")), /\bconsole\s*\./);
});

test("actions: the session id is the SERVER's own (cookie), never taken from the browser's input", () => {
  const source = code(read(ACTIONS));
  assert.match(source, /getOrCreateSessionId\(\)/);
  const service = code(read("lib/leads/gate/gate-service.ts"));
  assert.match(service, /toTouchInput\([^)]*sessionId/);
  assert.doesNotMatch(service, /input\.sessionId|attribution\??\.currentTouch\??\.sessionId/);
});

// =================================================================================================
// ANALYTICS CARRIES NO PII
// =================================================================================================

/** Extracts the object literal passed as the 2nd argument of each safeRecordAnalyticsEvent(...) call. */
function analyticsPayloads(source: string): string[] {
  const out: string[] = [];
  let index = 0;
  while ((index = source.indexOf("safeRecordAnalyticsEvent(", index)) !== -1) {
    const open = source.indexOf("{", index);
    let depth = 0;
    let end = open;
    for (; end < source.length; end++) {
      if (source[end] === "{") depth++;
      if (source[end] === "}" && --depth === 0) break;
    }
    out.push(source.slice(open, end + 1));
    index = end;
  }
  return out;
}

test("analytics: every funnel event the gate records is built only from anonymous, allowlisted fields", () => {
  const payloads = analyticsPayloads(code(read("lib/leads/gate/gate-service.ts")));
  assert.ok(payloads.length >= 5, "the gate records its funnel events");
  const allowed = new Set(["occurredAt", "sessionId", "userId", "deviceType", "eventName", "developerId", "sourceCta", "returningVisitor", "contactPreference", "newLead", "targetDomain"]);
  for (const payload of payloads) {
    const keys = [...payload.matchAll(/^\s{4,}(\.\.\.)?(\w+)\s*[:,]/gm)].map((match) => match[2]).filter((key) => key !== "base");
    for (const key of keys) assert.ok(allowed.has(key), `analytics payload key "${key}" is not allowlisted`);
    // No personal KEY (eventName is the event's own name, not a person's) and no value read from the lead record.
    assert.doesNotMatch(payload, /\b(phone\w*|email|name|fullName|leadId|note|notes|whatsapp)\s*:/i, `PII key in analytics payload: ${payload.slice(0, 80)}`);
    assert.doesNotMatch(payload, /phoneE164|\.email\b|lead\.id|lead\.name|captured\.lead\b(?!\.)|details\.phone|details\.name/i, `PII value in analytics payload: ${payload.slice(0, 80)}`);
  }
});

test("analytics: the gate never feeds lead data into the analytics sink or the analytics tables", () => {
  const sink = read("lib/developer-connect/db/postgres-analytics-sink.ts");
  assert.doesNotMatch(sink, /lib\/leads|leads|lead_events/);
  const events = code(read("lib/developer-connect/events.ts"));
  assert.doesNotMatch(events, /from ["'][^"']*leads/);
});

test("analytics: the existing click event still fires when the button is pressed (continuity with earlier data)", () => {
  const button = code(read("components/visit-official-website-button.tsx"));
  assert.match(button, /recordOfficialWebsiteClick\(developerId, domain\)/);
});

// =================================================================================================
// THE BUTTON AND THE GATE COMPONENT
// =================================================================================================

test("button: 'Visit official website' is a real <button> with no URL, no href and no target — the browser is never handed the destination", () => {
  const button = code(read("components/visit-official-website-button.tsx"));
  assert.match(button, /<button\b/);
  assert.doesNotMatch(button, /\bhref\s*=/);
  assert.doesNotMatch(button, /target\s*=/);
  assert.doesNotMatch(button, /window\.open|location\./);
  const props = button.slice(button.indexOf("interface VisitOfficialWebsiteButtonProps"), button.indexOf("}", button.indexOf("interface VisitOfficialWebsiteButtonProps")));
  assert.doesNotMatch(props, /\burl\b/);
  assert.match(button, /AssistanceGate/);
});

test("button: every use passes the developer's NAME for the gate copy and none passes a URL", () => {
  const files = listFiles(path.join(srcRoot, "components"), (f) => /\.tsx$/.test(f) && !f.includes("__tests__")).concat(
    listFiles(path.join(srcRoot, "app"), (f) => /\.tsx$/.test(f)),
  );
  let uses = 0;
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/<VisitOfficialWebsiteButton\b([\s\S]*?)\/>/g)) {
      uses += 1;
      assert.match(match[1], /developerName=/, `${path.relative(srcRoot, file)} omits developerName`);
      assert.doesNotMatch(match[1], /\burl=/, `${path.relative(srcRoot, file)} passes a url`);
    }
  }
  assert.ok(uses >= 2, "the developer page and the directory card");
});

test("gate: it opens the new tab synchronously from a blank page, detaches it from the opener, and never opens a URL directly", () => {
  const gate = code(read("components/assistance-gate.tsx"));
  assert.match(gate, /window\.open\("about:blank", "_blank"\)/);
  assert.match(gate, /tab\.opener = null/);
  assert.match(gate, /tab\.location\.replace\(url\)/);
  assert.equal((gate.match(/window\.open\(/g) ?? []).length, 1, "the only window.open is the blank one");
  assert.doesNotMatch(gate, /window\.location\s*(\.href)?\s*=|location\.assign|location\.href\s*=/);
  assert.match(gate, /runGateSubmit\(/);
});

test("gate: it is shown through a portal, holds the shared modal lock, and the page behind cannot scroll", () => {
  const button = code(read("components/visit-official-website-button.tsx"));
  assert.match(button, /createPortal\(/);
  const gate = code(read("components/assistance-gate.tsx"));
  assert.match(gate, /preemptModal\(MODAL_IDS\.assistanceGate\)/, "the gate takes priority over the sign-in prompt");
  assert.match(gate, /releaseModal\(MODAL_IDS\.assistanceGate\)/);
  assert.doesNotMatch(gate, /acquireModal\(/, "the gate never silently gives up because another modal is open");
  assert.match(gate, /document\.body\.style\.overflow = "hidden"/);
});

test("gate: the anonymous 'form started' event fires once, on the first edit", () => {
  const gate = code(read("components/assistance-gate.tsx"));
  assert.match(gate, /startedRef\.current/);
  assert.match(gate, /recordGateFormStarted\(developerId, sourceCta\)/);
});

// =================================================================================================
// NO TWO MODALS
// =================================================================================================

test("modals: the sign-in prompt will not open over the gate, and holds the lock while it is open", () => {
  const prompt = code(read("components/login-conversion-prompt.tsx"));
  assert.match(prompt, /isOtherModalOpen\(MODAL_IDS\.loginPrompt\)/);
  assert.match(prompt, /acquireModal\(MODAL_IDS\.loginPrompt\)/);
  assert.doesNotMatch(prompt, /preemptModal/, "the sign-in prompt can never displace the gate");
  assert.match(prompt, /registerModalCloser\(MODAL_IDS\.loginPrompt, dismiss\)/, "...but it steps aside when the gate asks");
  assert.match(prompt, /releaseModal\(MODAL_IDS\.loginPrompt\)/);
  // The trigger bails out BEFORE marking itself shown, so a skipped trigger can still fire later.
  const trigger = prompt.slice(prompt.indexOf("function trigger()"), prompt.indexOf("const timer"));
  assert.ok(trigger.indexOf("isOtherModalOpen") < trigger.indexOf("shownRef.current = true"));
});

test("modals: the sign-in prompt's click counter is fed AFTER the gate completes, never while it is open", () => {
  const button = code(read("components/visit-official-website-button.tsx"));
  const handleClick = button.slice(button.indexOf("const handleClick"), button.indexOf("const close"));
  assert.doesNotMatch(handleClick, /notifyOfficialWebsiteClicked/);
  assert.match(button, /onCompleted=\{completed\}/);
  assert.match(button, /const completed = useCallback\(\(\) => notifyOfficialWebsiteClicked\(\)/);
});

// =================================================================================================
// THE DEVELOPER PAGE: verification, SEO and the official-domain relationship are preserved
// =================================================================================================

const PAGE = "app/developers/[slug]/page.tsx";

test("page: the verification badge, the verification date and the 'how we verify' link are all still there", () => {
  const page = read(PAGE);
  assert.match(page, /<OfficialWebsiteVerifiedBadge full \/>/);
  assert.match(page, /Last verified \{formatDate\(developer\.officialWebsite\.verifiedAt\)\}/);
  assert.match(page, /How Developer Connects verifies official websites/);
  assert.match(page, /This confirms only that Developer Connects approved this website/);
});

test("page: the official domain is still shown (as text when the gate is required) and the structured data still names it as the developer's url", () => {
  const page = read(PAGE);
  assert.match(page, /developer\.officialWebsite\.canonicalDomain/);
  assert.match(page, /gateRequired \?/);
  assert.match(page, /url: developer\.officialWebsite!\.url/, "the Organization JSON-LD keeps the developer -> official website relationship");
  assert.match(page, /"@type": "BreadcrumbList"/);
  assert.match(page, /"@type": "Organization"/);
});

test("page: the gated domain is not a link (no second, ungated route to the site) — the link version only exists when the gate is off", () => {
  const page = code(read(PAGE));
  const gated = page.slice(page.indexOf("gateRequired ?"), page.indexOf(")}", page.indexOf("gateRequired ?")));
  const [whenRequired, whenOff] = gated.split(") : (");
  assert.doesNotMatch(whenRequired, /ExternalDomainLink|<a\b/);
  assert.match(whenOff, /ExternalDomainLink/);
  assert.match(page, /getGateMode\(\) === "required"/);
});

test("page: metadata, canonical and indexing rules are untouched", () => {
  const page = read(PAGE);
  assert.match(page, /alternates: \{ canonical: `\/developers\/\$\{developer\.slug\}` \}/);
  assert.match(page, /robots: \{ index: false, follow: true \}/);
  assert.match(page, /buildDeveloperMetadataText\(developer\)/);
});

test("card: the directory card opens the gate with source 'directory_card' and keeps its verified badge", () => {
  const card = read("components/developer-card.tsx");
  assert.match(card, /sourceCta="directory_card"/);
  assert.match(card, /OfficialWebsiteVerifiedBadge/);
  assert.match(card, /View developer/);
});

// =================================================================================================
// ATTRIBUTION CAPTURE
// =================================================================================================

test("attribution: the capture component is mounted once in the root layout, renders nothing and skips private areas", () => {
  assert.match(read("app/layout.tsx"), /<AttributionCapture \/>/);
  const component = code(read("components/attribution-capture.tsx"));
  assert.match(component, /return null/);
  const storage = code(read("lib/leads/attribution-storage.ts"));
  assert.match(storage, /isAnalyticsExcludedPath\(pathname\)/);
  assert.match(storage, /parseAnalyticsConsent\(localStorage/);
});

test("attribution: a persistent first touch is stored only with the visitor's analytics consent", () => {
  const storage = code(read("lib/leads/attribution-storage.ts"));
  assert.match(storage, /if \(analyticsAccepted\(\)\) localStorage\.setItem\(FIRST_TOUCH_KEY/);
  assert.equal((storage.match(/localStorage\.setItem/g) ?? []).length, 1, "the only localStorage write is the consent-gated one");
});

// =================================================================================================
// VERIFICATION SYSTEM UNTOUCHED
// =================================================================================================

test("verification: the gate only READS verified data — it never writes to, or imports the writers of, the verification pipeline", () => {
  const service = code(read("lib/leads/gate/gate-service.ts"));
  assert.doesNotMatch(service, /developer-connect\/(verification-service|candidate-service|developer-service|lifecycle|publish-state)/);
  assert.doesNotMatch(service, /\.(create|update|approve|reject|setPendingChanges|publishPendingChanges)\(/ , "no write method is called on the developer repositories");
  assert.match(service, /getVerifiedForDeveloper/);
  assert.match(service, /developers\.developers\.getById/);
});
