import { test } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryRepositories } from "../../../developer-connect/memory-repository.ts";
import { createDeveloper } from "../../../developer-connect/developer-service.ts";
import { submitWebsiteCandidate } from "../../../developer-connect/candidate-service.ts";
import { approveAndPublishCandidate } from "../../../developer-connect/verification-service.ts";
import type { AnalyticsEvent, AnalyticsEventSink } from "../../../developer-connect/events.ts";
import { createInMemoryLeadRepositories } from "../../memory-repository.ts";
import { GATE_ERROR_MESSAGES } from "../gate-copy.ts";
import { GATE_RATE_LIMIT } from "../gate-config.ts";
import {
  continueAsReturning,
  getGateState,
  recordFormStarted,
  resolveVerifiedDeveloper,
  submitGate,
  type GateContext,
  type GateDeps,
} from "../gate-service.ts";
import type { GateSubmitInput } from "../gate-flow.ts";

const founder = { actorType: "FOUNDER" as const, actorId: "founder-1" };
/** Anything that would let a buyer reach the developer directly. */
const WEBSITE = /acme-realty\.example|https?:\/\/|destination|websiteUrl|websiteDomain/i;
const T0 = new Date("2026-10-05T10:00:00.000Z");
const PHONE = "+91 98765 43210";

interface World {
  deps: GateDeps;
  ctx: GateContext;
  events: AnalyticsEvent[];
  lead: ReturnType<typeof createInMemoryLeadRepositories>;
  verified: { id: string; slug: string; url: string };
  unverified: { id: string };
  inactive: { id: string };
  setNow(date: Date): void;
}

async function world(): Promise<World> {
  const developers = createInMemoryRepositories();
  const lead = createInMemoryLeadRepositories();
  const events: AnalyticsEvent[] = [];
  const analytics: AnalyticsEventSink = { record: (event) => void events.push(event) };
  let now = T0;

  // A developer whose official website is VERIFIED.
  const acme = await createDeveloper(developers.developers, { displayName: "Acme Realty", city: "Mumbai", state: "Maharashtra", country: "India" });
  const candidate = await submitWebsiteCandidate(developers, { developerId: acme.id, url: "https://acme-realty.example/home", discoverySource: "MANUAL_SUBMISSION", actor: founder });
  await approveAndPublishCandidate(developers, candidate.id, founder, "official site confirmed");

  // A developer with a candidate that was never approved.
  const beta = await createDeveloper(developers.developers, { displayName: "Beta Homes", city: "Pune", state: "Maharashtra", country: "India" });
  await submitWebsiteCandidate(developers, { developerId: beta.id, url: "https://beta-homes.example/", discoverySource: "MANUAL_SUBMISSION", actor: founder });

  // A developer that was verified and then deactivated.
  const gamma = await createDeveloper(developers.developers, { displayName: "Gamma Group", city: "Dubai", state: "Dubai", country: "United Arab Emirates" });
  const gammaCandidate = await submitWebsiteCandidate(developers, { developerId: gamma.id, url: "https://gamma-group.example/", discoverySource: "MANUAL_SUBMISSION", actor: founder });
  await approveAndPublishCandidate(developers, gammaCandidate.id, founder, "ok");
  await developers.developers.update(gamma.id, { status: "INACTIVE" });

  return {
    deps: { developers, leads: lead, analytics, now: () => now },
    ctx: { sessionId: "session-1", userId: null, deviceType: "mobile" },
    events,
    lead,
    verified: { id: acme.id, slug: acme.slug, url: "https://acme-realty.example/home" },
    unverified: { id: beta.id },
    inactive: { id: gamma.id },
    setNow: (date) => {
      now = date;
    },
  };
}

function input(world: World, overrides: Partial<GateSubmitInput> = {}): GateSubmitInput {
  return {
    developerId: world.verified.id,
    sourceCta: "developer_page",
    phone: PHONE,
    phoneCountry: "IN",
    contactPreference: "WHATSAPP",
    name: "Asha Verma",
    attribution: { currentTouch: { utmSource: "google", utmMedium: "cpc", landingPath: "/developers/acme-realty" } },
    ...overrides,
  };
}

const names = (events: AnalyticsEvent[]) => events.map((event) => event.eventName);

// =================================================================================================
// SUCCESSFUL SUBMISSION
// =================================================================================================

test("success: saves the lead and confirms — the response carries NO URL, domain or destination", async () => {
  const w = await world();
  const result = await submitGate(w.deps, w.ctx, input(w));

  assert.equal(result.response.ok, true);
  assert.ok(result.response.ok);
  assert.deepEqual(Object.keys(result.response).sort(), ["contactPreference", "maskedPhone", "ok"]);
  assert.equal(result.response.contactPreference, "WHATSAPP");
  assert.doesNotMatch(JSON.stringify(result.response), WEBSITE);
  assert.ok(result.leadId, "the action gets the lead id to set the returning-buyer cookie");
});

test("success: phone is normalised to E.164 and the lead stores the developer, source and attribution", async () => {
  const w = await world();
  const { leadId } = await submitGate(w.deps, w.ctx, input(w, { phone: "098765 43210" }));
  const lead = (await w.lead.leads.getById(leadId!))!;

  assert.equal(lead.phoneE164, "+919876543210");
  assert.equal(lead.developerId, w.verified.id);
  assert.equal(lead.sourceCta, "developer_page");
  assert.equal(lead.status, "NEW");
  const touch = (await w.lead.touches.getById(lead.firstTouchId!))!;
  assert.equal(touch.utmSource, "google");
  assert.equal(touch.sessionId, "session-1", "the SERVER's session id, not the client's");
});

test("success: consent is stored with the exact wording for the chosen channel", async () => {
  const w = await world();
  const { leadId } = await submitGate(w.deps, w.ctx, input(w, { contactPreference: "PHONE_CALL" }));
  const [consent] = await w.lead.consents.listByLead(leadId!);
  assert.equal(consent.channel, "PHONE_CALL");
  assert.match(consent.textShown, /Developer Connects may contact me by phone call/);
  assert.match(consent.textShown, /not with the developer/);
  assert.equal(consent.purpose, "PROPERTY_ASSISTANCE");
});

test("success: the timeline records the connect request — developer, source, time — and no website, URL or domain", async () => {
  const w = await world();
  const { leadId } = await submitGate(w.deps, w.ctx, input(w));
  const timeline = await w.lead.events.listByLead(leadId!);
  assert.deepEqual(
    timeline.map((e) => e.eventType),
    ["LEAD_CREATED", "CONSENT_GIVEN", "CONTACT_PREFERENCE_SELECTED", "DEVELOPER_CONNECT_REQUESTED"],
  );
  const request = timeline.find((e) => e.eventType === "DEVELOPER_CONNECT_REQUESTED")!;
  assert.equal(request.developerId, w.verified.id);
  assert.equal(request.payload.developerName, "Acme Realty");
  assert.equal(request.payload.developerSlug, w.verified.slug);
  assert.equal(request.payload.sourceCta, "developer_page");
  assert.equal(typeof request.payload.requestedAt, "string");
  assert.doesNotMatch(JSON.stringify(timeline), WEBSITE, "the developer's website stays internal");
});

test("success: only the MASKED phone leaves the server — never the full number, a lead id or an email", async () => {
  const w = await world();
  const { response } = await submitGate(w.deps, w.ctx, input(w));
  const text = JSON.stringify(response);
  assert.ok(response.ok && response.maskedPhone === "+91 ••••••210");
  assert.ok(!text.includes("9876543210"));
  assert.ok(!/leadId|lead_id|email|name/.test(text));
});

test("success: a name is optional", async () => {
  const w = await world();
  const { response, leadId } = await submitGate(w.deps, w.ctx, input(w, { name: undefined }));
  assert.equal(response.ok, true);
  assert.equal((await w.lead.leads.getById(leadId!))!.name, null);
});

// =================================================================================================
// INVALID INPUT
// =================================================================================================

test("invalid phone: refused with a phone-field error, no destination, and NOTHING saved", async () => {
  const w = await world();
  for (const phone of ["", "12345", "not a number", "98765 4321"]) {
    const { response, leadId } = await submitGate(w.deps, w.ctx, input(w, { phone }));
    assert.equal(response.ok, false);
    assert.ok(!response.ok && response.code === "INVALID_PHONE" && response.field === "phone", phone);
    assert.equal(leadId, null);
    assert.ok(!("destinationUrl" in response));
  }
  assert.equal(w.lead.snapshot().leads.length, 0);
  assert.ok(!names(w.events).includes("lead_submitted"));
  assert.ok(!names(w.events).includes("official_website_redirected"));
});

test("invalid input: an unknown contact method, source, country or non-string phone is refused without a destination", async () => {
  const w = await world();
  const cases: Array<Partial<GateSubmitInput>> = [
    { contactPreference: "EMAIL" as never },
    { contactPreference: "CARRIER_PIGEON" as never },
    { sourceCta: "evil_page" as never },
    { phoneCountry: "US" as never },
    { phone: 9876543210 as never },
  ];
  for (const overrides of cases) {
    const { response } = await submitGate(w.deps, w.ctx, input(w, overrides));
    assert.equal(response.ok, false, JSON.stringify(overrides));
    assert.equal(!response.ok && response.code, "INVALID_INPUT");
  }
  for (const garbage of [null, undefined, "string", 42] as never[]) {
    assert.equal((await submitGate(w.deps, w.ctx, garbage)).response.ok, false);
  }
  assert.equal(w.lead.snapshot().leads.length, 0);
});

// =================================================================================================
// VERIFIED vs UNVERIFIED
// =================================================================================================

test("verified: an ACTIVE developer with a VERIFIED website resolves — to its identity only, never its website", async () => {
  const w = await world();
  const resolved = await resolveVerifiedDeveloper(w.deps, w.verified.id);
  assert.deepEqual(Object.keys(resolved ?? {}), ["developer"]);
  assert.equal(resolved?.developer.slug, w.verified.slug);
  assert.equal(resolved?.developer.displayName, "Acme Realty");
  assert.doesNotMatch(JSON.stringify(resolved), WEBSITE);
});

test("unverified: a developer whose website was never verified cannot take a request — no lead", async () => {
  const w = await world();
  assert.equal(await resolveVerifiedDeveloper(w.deps, w.unverified.id), null);
  const { response, leadId } = await submitGate(w.deps, w.ctx, input(w, { developerId: w.unverified.id }));
  assert.equal(response.ok, false);
  assert.equal(!response.ok && response.code, "NOT_VERIFIED");
  assert.equal(leadId, null);
  assert.ok(!("destinationUrl" in response), "no URL of any kind is returned");
  assert.equal(w.lead.snapshot().leads.length, 0, "a lead is not created for an unverified developer");
});

test("unverified: an unknown, malformed or non-string developer id is refused", async () => {
  const w = await world();
  for (const id of ["00000000-0000-4000-8000-000000000000", "not-a-uuid", "", "1; DROP TABLE developers", null, undefined, 42, {}] as unknown[]) {
    assert.equal(await resolveVerifiedDeveloper(w.deps, id), null, String(id));
    const { response } = await submitGate(w.deps, w.ctx, input(w, { developerId: id as string }));
    assert.equal(response.ok, false);
  }
});

test("unverified: a developer that is no longer ACTIVE cannot take a request", async () => {
  const w = await world();
  const developer = await w.deps.developers.developers.getById(w.inactive.id);
  assert.equal(developer?.status, "INACTIVE", "the fixture really is inactive");
  assert.ok(await w.deps.developers.candidates.getVerifiedForDeveloper(w.inactive.id), "...and has a VERIFIED website");
  assert.equal(await resolveVerifiedDeveloper(w.deps, w.inactive.id), null);
  const { response, leadId } = await submitGate(w.deps, w.ctx, input(w, { developerId: w.inactive.id }));
  assert.equal(response.ok, false);
  assert.equal(!response.ok && response.code, "NOT_VERIFIED");
  assert.equal(leadId, null);
});

// =================================================================================================
// OPEN-REDIRECT PROTECTION
// =================================================================================================

test("no outbound path: the input type has NO url/redirect field, and extra fields a caller sends are ignored", async () => {
  const w = await world();
  const hostile = {
    ...input(w),
    url: "https://evil.example/phish",
    destinationUrl: "https://evil.example/phish",
    redirect: "https://evil.example/phish",
    redirectUrl: "https://evil.example/phish",
    next: "https://evil.example/phish",
    returnTo: "//evil.example",
    websiteUrl: "https://evil.example/phish",
    developer: { id: w.verified.id, url: "https://evil.example/phish" },
  } as unknown as GateSubmitInput;

  const { response } = await submitGate(w.deps, w.ctx, hostile);
  assert.ok(response.ok);
  assert.ok(!JSON.stringify(response).includes("evil.example"));
  assert.doesNotMatch(JSON.stringify(response), WEBSITE);
  // And nothing hostile was stored on the lead's timeline either.
  const timeline = await w.lead.events.listByLead((await w.lead.leads.listForQueue(10))[0].id);
  assert.ok(!JSON.stringify(timeline).includes("evil.example"));
});

test("no outbound path: whatever the client sends, the response never contains a URL", async () => {
  for (const evil of ["javascript:alert(1)", "data:text/html,<script>1</script>", "//evil.example", "https://evil.example@acme-realty.example", "/\\evil.example", "file:///etc/passwd"]) {
    const w = await world();
    const { response } = await submitGate(w.deps, w.ctx, { ...input(w), url: evil, destinationUrl: evil, redirect: evil } as unknown as GateSubmitInput);
    assert.ok(response.ok, evil);
    assert.doesNotMatch(JSON.stringify(response), WEBSITE, evil);
    assert.ok(!JSON.stringify(response).includes("evil"), evil);
  }
});

test("no outbound path: even a hostile stored website URL can never reach the buyer or the timeline", async () => {
  const w = await world();
  const original = w.deps.developers.candidates.getVerifiedForDeveloper.bind(w.deps.developers.candidates);
  w.deps.developers.candidates.getVerifiedForDeveloper = async (id) => {
    const candidate = await original(id);
    return candidate ? { ...candidate, url: "javascript:alert(1)" } : null;
  };
  const { response, leadId } = await submitGate(w.deps, w.ctx, input(w));
  assert.ok(response.ok);
  assert.ok(!JSON.stringify(response).includes("javascript"));
  assert.ok(!JSON.stringify(await w.lead.events.listByLead(leadId!)).includes("javascript"));
});

// =================================================================================================
// DUPLICATE / RETURNING BUYER
// =================================================================================================

test("duplicate: the same number again is the SAME lead, with a new click, a fresh consent and a moved latest-touch", async () => {
  const w = await world();
  const first = await submitGate(w.deps, w.ctx, input(w));
  w.setNow(new Date(T0.getTime() + 3_600_000));
  const second = await submitGate(w.deps, { ...w.ctx, sessionId: "session-2" }, input(w, { phone: "+919876543210", attribution: { currentTouch: { utmSource: "meta" } } }));

  assert.equal(second.leadId, first.leadId);
  assert.equal(w.lead.snapshot().leads.length, 1);
  const lead = (await w.lead.leads.getById(first.leadId!))!;
  assert.equal((await w.lead.touches.getById(lead.firstTouchId!))!.utmSource, "google", "first touch preserved");
  assert.equal((await w.lead.touches.getById(lead.lastTouchId!))!.utmSource, "meta", "latest touch moved");
  assert.equal((await w.lead.consents.listByLead(lead.id)).length, 2);
});

test("returning: one-tap continue uses the number on file — the browser sends none — and records the request", async () => {
  const w = await world();
  const first = await submitGate(w.deps, w.ctx, input(w));
  w.setNow(new Date(T0.getTime() + 86_400_000));

  const again = await continueAsReturning(w.deps, w.ctx, first.leadId!, { developerId: w.verified.id, sourceCta: "directory_card" });
  assert.ok(again.response.ok);
  assert.doesNotMatch(JSON.stringify(again.response), WEBSITE);
  assert.equal(again.leadId, first.leadId);
  assert.equal(w.lead.snapshot().leads.length, 1);

  const requests = (await w.lead.events.listByLead(first.leadId!)).filter((e) => e.eventType === "DEVELOPER_CONNECT_REQUESTED");
  assert.equal(requests.length, 2);
  assert.equal(requests[1].payload.sourceCta, "directory_card");
});

test("returning: the gate state offers the returning card with only a MASKED number", async () => {
  const w = await world();
  const first = await submitGate(w.deps, w.ctx, input(w));
  const state = await getGateState(w.deps, w.ctx, w.verified.id, "developer_page", first.leadId);
  assert.deepEqual(state, { mode: "required", returning: true, maskedPhone: "+91 ••••••210", contactPreference: "WHATSAPP" });
  assert.ok(!JSON.stringify(state).includes("9876543210"));
});

test("returning: no cookie, an unknown lead or an ERASED lead shows the normal form (never an error, never someone else's number)", async () => {
  const w = await world();
  const first = await submitGate(w.deps, w.ctx, input(w));
  assert.deepEqual(await getGateState(w.deps, w.ctx, w.verified.id, "developer_page", null), { mode: "required", returning: false });
  assert.deepEqual(await getGateState(w.deps, w.ctx, w.verified.id, "developer_page", "00000000-0000-4000-8000-000000000000"), { mode: "required", returning: false });

  const { eraseLead } = await import("../../lead-service.ts");
  await eraseLead(w.lead, first.leadId!, founder);
  assert.deepEqual(await getGateState(w.deps, w.ctx, w.verified.id, "developer_page", first.leadId), { mode: "required", returning: false });
  const blocked = await continueAsReturning(w.deps, w.ctx, first.leadId!, { developerId: w.verified.id, sourceCta: "developer_page" });
  assert.equal(blocked.response.ok, false);
  assert.equal(!blocked.response.ok && blocked.response.code, "RETURNING_UNAVAILABLE");
});

test("returning: continuing for an unverified developer is refused too", async () => {
  const w = await world();
  const first = await submitGate(w.deps, w.ctx, input(w));
  const result = await continueAsReturning(w.deps, w.ctx, first.leadId!, { developerId: w.unverified.id, sourceCta: "developer_page" });
  assert.equal(result.response.ok, false);
  assert.equal(!result.response.ok && result.response.code, "NOT_VERIFIED");
});

// =================================================================================================
// FAILURE / RETRY — never a silent bypass
// =================================================================================================

test("failure: if saving the lead fails the buyer gets a retryable error and nothing is confirmed", async () => {
  const w = await world();
  w.lead.consents.create = async () => {
    throw new Error("simulated database outage");
  };
  const { response, leadId } = await submitGate(w.deps, w.ctx, input(w));

  assert.equal(response.ok, false);
  assert.equal(!response.ok && response.code, "TEMPORARY_FAILURE");
  assert.equal(!response.ok && response.message, GATE_ERROR_MESSAGES.TEMPORARY_FAILURE);
  assert.equal(leadId, null);
  assert.equal(w.lead.snapshot().leads.length, 0, "nothing half-saved");
  assert.ok(!names(w.events).includes("lead_submitted"), "no 'submitted' event for a request that was never saved");
});

test("failure: retrying after the outage clears succeeds and creates the lead", async () => {
  const w = await world();
  const original = w.lead.consents.create.bind(w.lead.consents);
  w.lead.consents.create = async () => {
    throw new Error("down");
  };
  assert.equal((await submitGate(w.deps, w.ctx, input(w))).response.ok, false);
  w.lead.consents.create = original;
  const retry = await submitGate(w.deps, w.ctx, input(w));
  assert.equal(retry.response.ok, true);
  assert.equal(w.lead.snapshot().leads.length, 1);
});

test("failure: a database error while checking the developer is also an error state, not a bypass", async () => {
  const w = await world();
  w.deps.developers.developers.getById = async () => {
    throw new Error("db down");
  };
  const { response } = await submitGate(w.deps, w.ctx, input(w));
  assert.equal(response.ok, false);
  assert.equal(!response.ok && response.code, "TEMPORARY_FAILURE");
  assert.ok(!("destinationUrl" in response));
});

test("failure: a failing rate-limit lookup is an error state too", async () => {
  const w = await world();
  w.lead.touches.countBySessionSince = async () => {
    throw new Error("db down");
  };
  const { response } = await submitGate(w.deps, w.ctx, input(w));
  assert.equal(!response.ok && response.code, "TEMPORARY_FAILURE");
});

test("failure: the gate state degrades to 'unavailable' (an error), not to an open door", async () => {
  const w = await world();
  w.deps.developers.developers.getById = async () => {
    throw new Error("db down");
  };
  const state = await getGateState(w.deps, w.ctx, w.verified.id, "developer_page", null);
  assert.equal(state.mode, "unavailable");
  assert.ok(!("destinationUrl" in state));
});

test("failure: a flaky 'returning' lookup falls back to the normal form rather than failing the gate", async () => {
  const w = await world();
  const first = await submitGate(w.deps, w.ctx, input(w));
  w.lead.leads.getById = async () => {
    throw new Error("blip");
  };
  assert.deepEqual(await getGateState(w.deps, w.ctx, w.verified.id, "developer_page", first.leadId), { mode: "required", returning: false });
});

// =================================================================================================
// ABUSE PROTECTION
// =================================================================================================

test("honeypot: a filled hidden field is refused with a generic error, saves nothing and redirects nowhere", async () => {
  const w = await world();
  const { response, leadId } = await submitGate(w.deps, w.ctx, input(w, { website: "http://spam.example" }));
  assert.equal(response.ok, false);
  assert.equal(!response.ok && response.code, "GATE_REJECTED");
  assert.equal(leadId, null);
  assert.equal(w.lead.snapshot().leads.length, 0);
  // An empty or whitespace honeypot is a human.
  assert.equal((await submitGate(w.deps, w.ctx, input(w, { website: "   " }))).response.ok, true);
});

test("rate limit: a single browser session can submit only a few times in the window, then is asked to wait", async () => {
  const w = await world();
  const phones = ["+919876500001", "+919876500002", "+919876500003", "+919876500004", "+919876500005", "+919876500006"];
  const outcomes: boolean[] = [];
  for (const phone of phones) outcomes.push((await submitGate(w.deps, w.ctx, input(w, { phone }))).response.ok);
  assert.deepEqual(outcomes, [...Array(GATE_RATE_LIMIT.maxSubmissions).fill(true), false]);

  const blocked = await submitGate(w.deps, w.ctx, input(w, { phone: "+919876500007" }));
  assert.equal(!blocked.response.ok && blocked.response.code, "RATE_LIMITED");
  assert.equal(w.lead.snapshot().leads.length, GATE_RATE_LIMIT.maxSubmissions);

  // A different session is unaffected, and the same session recovers after the window passes.
  assert.equal((await submitGate(w.deps, { ...w.ctx, sessionId: "other-session" }, input(w, { phone: "+919876500008" }))).response.ok, true);
  w.setNow(new Date(T0.getTime() + (GATE_RATE_LIMIT.windowMinutes + 1) * 60_000));
  assert.equal((await submitGate(w.deps, w.ctx, input(w, { phone: "+919876500009" }))).response.ok, true);
});

test("attribution input is sanitised: unknown fields dropped, oversize values capped, a future timestamp ignored", async () => {
  const w = await world();
  const { leadId } = await submitGate(
    w.deps,
    w.ctx,
    input(w, {
      attribution: {
        currentTouch: { utmCampaign: "c".repeat(5000), landingPath: "/developers/x?email=a@b.com", referrer: "https://google.com/search?q=secret", occurredAt: "2099-01-01T00:00:00.000Z", sneaky: "x" } as never,
      },
    }),
  );
  const lead = (await w.lead.leads.getById(leadId!))!;
  const touch = (await w.lead.touches.getById(lead.lastTouchId!))!;
  assert.ok((touch.utmCampaign ?? "").length <= 200);
  assert.equal(touch.landingPath, "/developers/x");
  assert.equal(touch.referrer, "https://google.com/search");
  assert.equal(touch.occurredAt.getTime(), T0.getTime(), "a future time from the browser is ignored");
  assert.ok(!("sneaky" in touch));
});

// =================================================================================================
// FUNNEL EVENTS (anonymous) — and no PII anywhere in them
// =================================================================================================

test("funnel: gate shown → form started → lead submitted, in order, each with only anonymous fields", async () => {
  const w = await world();
  await getGateState(w.deps, w.ctx, w.verified.id, "developer_page", null);
  await recordFormStarted(w.deps, w.ctx, w.verified.id, "developer_page");
  await submitGate(w.deps, w.ctx, input(w));

  assert.deepEqual(names(w.events), ["assistance_gate_shown", "assistance_form_started", "lead_submitted"]);

  const [shown, started, submitted] = w.events as unknown as Array<Record<string, unknown>>;
  assert.equal(shown.returningVisitor, false);
  assert.equal(shown.developerId, w.verified.id);
  assert.equal(started.sourceCta, "developer_page");
  assert.equal(submitted.contactPreference, "WHATSAPP");
  assert.equal(submitted.newLead, true);
  assert.doesNotMatch(JSON.stringify(w.events), WEBSITE, "no analytics event carries the developer's website");
  for (const event of w.events) assert.equal((event as { sessionId: string }).sessionId, "session-1");
});

test("funnel: a repeat submission is recorded as newLead=false, and a returning gate as returningVisitor=true", async () => {
  const w = await world();
  const first = await submitGate(w.deps, w.ctx, input(w));
  w.events.length = 0;
  await getGateState(w.deps, w.ctx, w.verified.id, "developer_page", first.leadId);
  await continueAsReturning(w.deps, w.ctx, first.leadId!, { developerId: w.verified.id, sourceCta: "developer_page" });
  const shown = w.events.find((e) => e.eventName === "assistance_gate_shown") as unknown as Record<string, unknown>;
  const submitted = w.events.find((e) => e.eventName === "lead_submitted") as unknown as Record<string, unknown>;
  assert.equal(shown.returningVisitor, true);
  assert.equal(submitted.newLead, false);
});

test("funnel: NO PII — no event, in any scenario, contains the phone, name, email, a lead id or a note", async () => {
  const w = await world();
  const first = await submitGate(w.deps, w.ctx, input(w, { name: "Asha Verma" }));
  await getGateState(w.deps, w.ctx, w.verified.id, "developer_page", first.leadId);
  await recordFormStarted(w.deps, w.ctx, w.verified.id, "directory_card");
  await continueAsReturning(w.deps, w.ctx, first.leadId!, { developerId: w.verified.id, sourceCta: "developer_page" });
  await submitGate(w.deps, w.ctx, input(w, { phone: "12345" })); // a failed attempt must not leak either

  const dump = JSON.stringify(w.events);
  for (const secret of ["9876543210", "98765", "+91", "Asha", "Verma", first.leadId!, "@", "utm", "google"]) {
    assert.ok(!dump.includes(secret), `"${secret}" leaked into analytics`);
  }
  const allowedKeys = new Set(["eventName", "occurredAt", "sessionId", "userId", "deviceType", "developerId", "sourceCta", "returningVisitor", "contactPreference", "newLead"]);
  for (const event of w.events) {
    for (const key of Object.keys(event)) assert.ok(allowedKeys.has(key), `unexpected analytics key: ${key}`);
  }
});

test("funnel: an unknown or unverified developer records no funnel events (no junk in analytics)", async () => {
  const w = await world();
  await recordFormStarted(w.deps, w.ctx, w.unverified.id, "developer_page");
  await recordFormStarted(w.deps, w.ctx, "not-a-uuid", "developer_page");
  await recordFormStarted(w.deps, w.ctx, w.verified.id, "evil");
  assert.deepEqual(w.events, []);
  const state = await getGateState(w.deps, w.ctx, w.unverified.id, "developer_page", null);
  assert.equal(state.mode, "unavailable");
  assert.deepEqual(w.events, []);
});

test("funnel: an analytics outage never breaks the gate", async () => {
  const w = await world();
  w.deps.analytics.record = () => {
    throw new Error("analytics down");
  };
  const { response } = await submitGate(w.deps, w.ctx, input(w));
  assert.equal(response.ok, true);
});

// =================================================================================================
// NO MODES, NO BYPASS
// =================================================================================================

test("no bypass: getGateState has no mode argument and can only return the form, the returning card or 'unavailable'", async () => {
  const w = await world();
  assert.equal(getGateState.length, 5, "(deps, ctx, developerId, sourceCta, leadId) — nothing else can change what it returns");
  const states = [
    await getGateState(w.deps, w.ctx, w.verified.id, "developer_page", null),
    await getGateState(w.deps, w.ctx, w.unverified.id, "developer_page", null),
  ];
  for (const state of states) {
    assert.ok(["required", "unavailable"].includes(state.mode));
    assert.doesNotMatch(JSON.stringify(state), WEBSITE);
  }
  assert.equal(w.lead.snapshot().leads.length, 0, "opening the gate never creates a lead");
});

test("no bypass: a database error while the gate loads stays an error — it never degrades into anything that exposes a website", async () => {
  const w = await world();
  w.deps.developers.developers.getById = async () => {
    throw new Error("db");
  };
  const state = await getGateState(w.deps, w.ctx, w.verified.id, "developer_page", null);
  assert.equal(state.mode, "unavailable");
  assert.doesNotMatch(JSON.stringify(state), WEBSITE);
});
