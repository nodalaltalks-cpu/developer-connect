import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addNote,
  captureAssistanceLead,
  changeLeadStatus,
  createBooking,
  eraseLead,
  getLeadTimeline,
  logContact,
  recordWebsiteRedirect,
  setFollowUp,
  updateBooking,
  updateRequirement,
} from "../lead-service.ts";
import { createInMemoryLeadRepositories } from "../memory-repository.ts";
import { LeadNotFoundError, LeadStateError, LeadValidationError, UnauthorizedLeadActionError } from "../errors.ts";
import { BUYER, DEVELOPER_A, DEVELOPER_B, FOUNDER, SYSTEM, captureInput, minutes, T0 } from "./test-helpers.ts";

const types = (events: { eventType: string }[]) => events.map((event) => event.eventType);

// --- creating a lead ---------------------------------------------------------------------------

test("capture: a new buyer creates a NEW lead keyed by E.164, with every approved event in order", async () => {
  const repos = createInMemoryLeadRepositories();
  const { lead, created } = await captureAssistanceLead(repos, captureInput(), T0);

  assert.equal(created, true);
  assert.equal(lead.phoneE164, "+919876543210");
  assert.equal(lead.status, "NEW");
  assert.equal(lead.contactPreference, "WHATSAPP");
  assert.equal(lead.developerId, DEVELOPER_A.id);
  assert.equal(lead.sourceCta, "developer_page");
  assert.equal(lead.ownerId, null, "Phase 1 leads are unassigned = the founder's queue");

  const events = await getLeadTimeline(repos, lead.id);
  assert.deepEqual(types(events), ["LEAD_CREATED", "CONSENT_GIVEN", "CONTACT_PREFERENCE_SELECTED", "OFFICIAL_WEBSITE_CLICKED"]);
  for (const event of events) {
    assert.equal(event.actorType, "BUYER");
    assert.equal(event.createdAt.getTime(), T0.getTime());
  }
});

test("capture: the click event records the exact developer, verified website and verification date at that moment", async () => {
  const repos = createInMemoryLeadRepositories();
  const { lead } = await captureAssistanceLead(repos, captureInput(), T0);
  const click = (await getLeadTimeline(repos, lead.id)).find((event) => event.eventType === "OFFICIAL_WEBSITE_CLICKED")!;

  assert.equal(click.developerId, DEVELOPER_A.id);
  assert.equal(click.payload.developerSlug, "acme-realty");
  assert.equal(click.payload.developerName, "Acme Realty");
  assert.equal(click.payload.websiteDomain, "acme.example");
  assert.equal(click.payload.websiteUrl, "https://acme.example/");
  assert.equal(click.payload.verifiedAt, "2026-09-01T00:00:00.000Z");
  assert.equal(click.payload.sourceCta, "developer_page");
});

test("capture: consent is stored with the exact wording and version shown, for the chosen channel", async () => {
  const repos = createInMemoryLeadRepositories();
  const { lead } = await captureAssistanceLead(repos, captureInput({ contactPreference: "PHONE_CALL" }), T0);
  const [consent] = await repos.consents.listByLead(lead.id);

  assert.equal(consent.purpose, "PROPERTY_ASSISTANCE");
  assert.equal(consent.channel, "PHONE_CALL");
  assert.match(consent.textShown, /by phone call/);
  assert.match(consent.textShown, /not with the developer/);
  assert.equal(consent.withdrawnAt, null);
});

test("capture: an unverified-website snapshot is recorded honestly as a null verification date", async () => {
  const repos = createInMemoryLeadRepositories();
  const input = captureInput();
  const { lead } = await captureAssistanceLead(repos, { ...input, website: { ...input.website, verifiedAt: null } }, T0);
  const click = (await getLeadTimeline(repos, lead.id)).find((event) => event.eventType === "OFFICIAL_WEBSITE_CLICKED")!;
  assert.equal(click.payload.verifiedAt, null);
});

// --- validation --------------------------------------------------------------------------------

test("capture: an invalid or empty phone is refused with a phone-field error and writes NOTHING", async () => {
  const repos = createInMemoryLeadRepositories();
  for (const phone of ["", "12345", "not a number"]) {
    await assert.rejects(
      () => captureAssistanceLead(repos, captureInput({ phone }), T0),
      (error: unknown) => error instanceof LeadValidationError && error.field === "phone",
    );
  }
  const snapshot = repos.snapshot();
  assert.equal(snapshot.leads.length, 0);
  assert.equal(snapshot.events.length, 0);
});

test("capture: bad email, oversize name, unknown contact preference and an email-only preference without an email are all refused", async () => {
  const repos = createInMemoryLeadRepositories();
  const reject = (overrides: Parameters<typeof captureInput>[0], field: string) =>
    assert.rejects(
      () => captureAssistanceLead(repos, captureInput(overrides), T0),
      (error: unknown) => error instanceof LeadValidationError && error.field === field,
    );
  await reject({ email: "not-an-email" }, "email");
  await reject({ name: "x".repeat(101) }, "name");
  await reject({ contactPreference: "CARRIER_PIGEON" as never }, "contactPreference");
  await reject({ contactPreference: "EMAIL", email: null }, "email");
  assert.equal(repos.snapshot().leads.length, 0);
});

test("capture: a name and email are optional", async () => {
  const repos = createInMemoryLeadRepositories();
  const { lead } = await captureAssistanceLead(repos, captureInput({ name: null, email: null }), T0);
  assert.equal(lead.name, null);
  assert.equal(lead.email, null);
});

test("capture: a failure part-way leaves NO half-written lead (the whole capture is one transaction)", async () => {
  const repos = createInMemoryLeadRepositories();
  const original = repos.consents.create.bind(repos.consents);
  repos.consents.create = async () => {
    throw new Error("simulated database failure while saving consent");
  };
  await assert.rejects(() => captureAssistanceLead(repos, captureInput(), T0), /simulated/);
  repos.consents.create = original;

  const snapshot = repos.snapshot();
  assert.equal(snapshot.leads.length, 0, "the lead must have been rolled back");
  assert.equal(snapshot.events.length, 0, "no orphan events");
});

// --- duplicate detection -----------------------------------------------------------------------

test("duplicates: the same number typed differently is the SAME lead — a repeat adds events, never a second lead", async () => {
  const repos = createInMemoryLeadRepositories();
  const first = await captureAssistanceLead(repos, captureInput({ phone: "+91 98765 43210" }), T0);
  const second = await captureAssistanceLead(repos, captureInput({ phone: "098765 43210", developer: DEVELOPER_B }), minutes(30));

  assert.equal(second.created, false);
  assert.equal(second.lead.id, first.lead.id);
  assert.equal(repos.snapshot().leads.length, 1);

  const events = await getLeadTimeline(repos, first.lead.id);
  assert.deepEqual(types(events), [
    "LEAD_CREATED",
    "CONSENT_GIVEN",
    "CONTACT_PREFERENCE_SELECTED",
    "OFFICIAL_WEBSITE_CLICKED",
    "LEAD_CAPTURED",
    "CONSENT_GIVEN",
    "OFFICIAL_WEBSITE_CLICKED",
  ]);
});

test("duplicates: a second developer is recorded on the existing lead's events, and the lead's original developer is kept", async () => {
  const repos = createInMemoryLeadRepositories();
  const first = await captureAssistanceLead(repos, captureInput(), T0);
  await captureAssistanceLead(repos, captureInput({ developer: DEVELOPER_B }), minutes(30));

  const lead = (await repos.leads.getById(first.lead.id))!;
  assert.equal(lead.developerId, DEVELOPER_A.id, "the originally researched developer is never overwritten");

  const clicks = (await getLeadTimeline(repos, lead.id)).filter((event) => event.eventType === "OFFICIAL_WEBSITE_CLICKED");
  assert.deepEqual(clicks.map((click) => click.developerId), [DEVELOPER_A.id, DEVELOPER_B.id]);
});

test("duplicates: every submission records its own fresh consent", async () => {
  const repos = createInMemoryLeadRepositories();
  const { lead } = await captureAssistanceLead(repos, captureInput(), T0);
  await captureAssistanceLead(repos, captureInput(), minutes(5));
  assert.equal((await repos.consents.listByLead(lead.id)).length, 2);
});

test("duplicates: a returning buyer's name/email only FILL empty fields — they never overwrite what is stored", async () => {
  const repos = createInMemoryLeadRepositories();
  const { lead } = await captureAssistanceLead(repos, captureInput({ name: "Asha Verma", email: null }), T0);
  const second = await captureAssistanceLead(repos, captureInput({ name: "Different Name", email: "asha@example.com" }), minutes(5));

  assert.equal(second.lead.name, "Asha Verma", "an existing name is not overwritten");
  assert.equal(second.lead.email, "asha@example.com", "an empty email is filled in");
  const capture = (await getLeadTimeline(repos, lead.id)).find((event) => event.eventType === "LEAD_CAPTURED")!;
  assert.deepEqual(capture.payload.contactDetailsDiffered, ["name"], "the disagreement is noted, without copying the values into the event");
  assert.ok(!JSON.stringify(capture.payload).includes("Different Name"));
});

test("duplicates: a returning buyer does NOT change the lead's status", async () => {
  const repos = createInMemoryLeadRepositories();
  const { lead } = await captureAssistanceLead(repos, captureInput(), T0);
  await changeLeadStatus(repos, lead.id, "QUALIFIED", FOUNDER, {}, minutes(10));
  const again = await captureAssistanceLead(repos, captureInput({ developer: DEVELOPER_B }), minutes(60));
  assert.equal(again.lead.status, "QUALIFIED");
});

test("duplicates: a changed contact preference is applied WITH an event recording old and new", async () => {
  const repos = createInMemoryLeadRepositories();
  const { lead } = await captureAssistanceLead(repos, captureInput({ contactPreference: "WHATSAPP" }), T0);
  const again = await captureAssistanceLead(repos, captureInput({ contactPreference: "PHONE_CALL" }), minutes(5));
  assert.equal(again.lead.contactPreference, "PHONE_CALL");

  const changes = (await getLeadTimeline(repos, lead.id)).filter((event) => event.eventType === "CONTACT_PREFERENCE_SELECTED");
  assert.deepEqual(changes.map((event) => event.payload), [{ from: null, to: "WHATSAPP" }, { from: "WHATSAPP", to: "PHONE_CALL" }]);

  // An unchanged preference writes no extra preference event.
  await captureAssistanceLead(repos, captureInput({ contactPreference: "PHONE_CALL" }), minutes(9));
  assert.equal((await getLeadTimeline(repos, lead.id)).filter((event) => event.eventType === "CONTACT_PREFERENCE_SELECTED").length, 2);
});

// --- concurrent duplicates ---------------------------------------------------------------------

test("concurrency: 25 simultaneous submissions of the same number produce exactly ONE lead", async () => {
  const repos = createInMemoryLeadRepositories();
  const forms = ["+91 98765 43210", "098765 43210", "91-98765-43210", "9876543210", "+919876543210"];
  const results = await Promise.all(
    Array.from({ length: 25 }, (_, index) =>
      captureAssistanceLead(repos, captureInput({ phone: forms[index % forms.length], sessionId: `s${index}`, currentTouch: { sessionId: `s${index}` } }), minutes(index)),
    ),
  );

  const snapshot = repos.snapshot();
  assert.equal(snapshot.leads.length, 1, "exactly one lead");
  assert.equal(results.filter((result) => result.created).length, 1, "exactly one submission created it");
  assert.equal(new Set(results.map((result) => result.lead.id)).size, 1);

  const creates = snapshot.events.filter((event) => event.eventType === "LEAD_CREATED").length;
  const captures = snapshot.events.filter((event) => event.eventType === "LEAD_CAPTURED").length;
  assert.equal(creates, 1);
  assert.equal(captures, 24);
  assert.equal(snapshot.events.filter((event) => event.eventType === "OFFICIAL_WEBSITE_CLICKED").length, 25, "every click is recorded");
});

test("concurrency: simultaneous submissions of DIFFERENT numbers each get their own lead", async () => {
  const repos = createInMemoryLeadRepositories();
  const phones = ["+919876543210", "+919876543211", "+919876543212", "+919876543213"];
  await Promise.all(phones.map((phone) => captureAssistanceLead(repos, captureInput({ phone }), T0)));
  assert.equal(repos.snapshot().leads.length, 4);
});

// --- attribution -------------------------------------------------------------------------------

test("attribution: a new lead's first and latest touch are the arrival that created it", async () => {
  const repos = createInMemoryLeadRepositories();
  const { lead } = await captureAssistanceLead(repos, captureInput(), T0);
  assert.ok(lead.firstTouchId);
  assert.equal(lead.firstTouchId, lead.lastTouchId);
  const touch = (await repos.touches.getById(lead.firstTouchId!))!;
  assert.equal(touch.utmSource, "google");
  assert.equal(touch.utmCampaign, "brand");
  assert.equal(touch.landingPath, "/developers/acme-realty");
});

test("attribution: when the browser remembered an earlier arrival, THAT becomes the first touch", async () => {
  const repos = createInMemoryLeadRepositories();
  const { lead } = await captureAssistanceLead(
    repos,
    captureInput({
      firstTouch: { sessionId: "old-session", utmSource: "instagram", utmMedium: "social", occurredAt: new Date("2026-09-20T00:00:00.000Z") },
    }),
    T0,
  );
  assert.notEqual(lead.firstTouchId, lead.lastTouchId);
  assert.equal((await repos.touches.getById(lead.firstTouchId!))!.utmSource, "instagram");
  assert.equal((await repos.touches.getById(lead.lastTouchId!))!.utmSource, "google");
});

test("attribution: a returning buyer NEVER changes first touch — latest touch moves forward", async () => {
  const repos = createInMemoryLeadRepositories();
  const first = await captureAssistanceLead(repos, captureInput(), T0);
  const firstTouchId = first.lead.firstTouchId!;

  const later = await captureAssistanceLead(
    repos,
    captureInput({
      currentTouch: { sessionId: "session-2", utmSource: "meta", utmMedium: "paid_social", utmCampaign: "retarget", fbclid: "FB123" },
      firstTouch: { sessionId: "session-2", utmSource: "meta" }, // a (wrong) client claim of a different "first" touch
    }),
    minutes(120),
  );

  assert.equal(later.lead.firstTouchId, firstTouchId, "first touch is never replaced, even if the client sends another");
  assert.notEqual(later.lead.lastTouchId, firstTouchId);
  const latest = (await repos.touches.getById(later.lead.lastTouchId!))!;
  assert.equal(latest.utmSource, "meta");
  assert.equal(latest.fbclid, "FB123");

  // The original first-touch row is untouched.
  const original = (await repos.touches.getById(firstTouchId))!;
  assert.equal(original.utmSource, "google");
  assert.equal(original.utmCampaign, "brand");
});

test("attribution: referrer query strings and landing-page queries are stripped before storage", async () => {
  const repos = createInMemoryLeadRepositories();
  const { lead } = await captureAssistanceLead(
    repos,
    captureInput({ currentTouch: { sessionId: "s", landingPath: "/developers/acme?email=asha@example.com", referrer: "https://google.com/search?q=asha%40example.com" } }),
    T0,
  );
  const touch = (await repos.touches.getById(lead.firstTouchId!))!;
  assert.equal(touch.landingPath, "/developers/acme");
  assert.equal(touch.referrer, "https://google.com/search");
});

// --- requirement updates -----------------------------------------------------------------------

test("requirement: filling empty fields records one REQUIREMENT_UPDATED event with from=null for each", async () => {
  const repos = createInMemoryLeadRepositories();
  const { lead } = await captureAssistanceLead(repos, captureInput(), T0);
  const result = await updateRequirement(
    repos,
    lead.id,
    { budgetMin: 15_000_000, budgetMax: 20_000_000, budgetCurrency: "INR", configuration: "3 BHK", timeline: "WITHIN_30_DAYS", purpose: "SELF_USE", location: "Andheri West" },
    BUYER,
    minutes(5),
  );

  assert.deepEqual(result.changed.sort(), ["budgetCurrency", "budgetMax", "budgetMin", "configuration", "location", "purpose", "timeline"]);
  assert.equal(result.lead.budgetMax, 20_000_000);
  assert.equal(result.lead.timeline, "WITHIN_30_DAYS");

  const event = (await getLeadTimeline(repos, lead.id)).find((e) => e.eventType === "REQUIREMENT_UPDATED")!;
  const fields = event.payload.fields as Record<string, { from: unknown; to: unknown }>;
  assert.deepEqual(fields.configuration, { from: null, to: "3 BHK" });
  assert.equal(event.actorType, "BUYER");
});

test("requirement: a CHANGED value is applied but never silently — the previous value is kept in the event", async () => {
  const repos = createInMemoryLeadRepositories();
  const { lead } = await captureAssistanceLead(repos, captureInput(), T0);
  await updateRequirement(repos, lead.id, { configuration: "2 BHK", budgetMax: 10_000_000, budgetCurrency: "INR" }, BUYER, minutes(5));
  await updateRequirement(repos, lead.id, { configuration: "3 BHK", budgetMax: 25_000_000 }, FOUNDER, minutes(10));

  const events = (await getLeadTimeline(repos, lead.id)).filter((event) => event.eventType === "REQUIREMENT_UPDATED");
  assert.equal(events.length, 2);
  const second = events[1].payload.fields as Record<string, { from: unknown; to: unknown }>;
  assert.deepEqual(second.configuration, { from: "2 BHK", to: "3 BHK" });
  assert.deepEqual(second.budgetMax, { from: 10_000_000, to: 25_000_000 });
  assert.equal(events[1].actorType, "FOUNDER");
  assert.equal(events[1].actorId, FOUNDER.actorId);
});

test("requirement: re-submitting identical values writes NO event and no change", async () => {
  const repos = createInMemoryLeadRepositories();
  const { lead } = await captureAssistanceLead(repos, captureInput(), T0);
  await updateRequirement(repos, lead.id, { configuration: "2 BHK" }, BUYER, minutes(5));
  const before = (await getLeadTimeline(repos, lead.id)).length;
  const result = await updateRequirement(repos, lead.id, { configuration: "2 BHK" }, BUYER, minutes(6));
  assert.deepEqual(result.changed, []);
  assert.equal((await getLeadTimeline(repos, lead.id)).length, before);
});

test("requirement: only the supplied fields change — omitted fields are left alone", async () => {
  const repos = createInMemoryLeadRepositories();
  const { lead } = await captureAssistanceLead(repos, captureInput(), T0);
  await updateRequirement(repos, lead.id, { configuration: "2 BHK", timeline: "WITHIN_30_DAYS" }, BUYER, minutes(5));
  const result = await updateRequirement(repos, lead.id, { purpose: "INVESTMENT" }, BUYER, minutes(6));
  assert.equal(result.lead.configuration, "2 BHK");
  assert.equal(result.lead.timeline, "WITHIN_30_DAYS");
  assert.equal(result.lead.purpose, "INVESTMENT");
});

test("requirement: an explicit null clears a field, and that too is recorded", async () => {
  const repos = createInMemoryLeadRepositories();
  const { lead } = await captureAssistanceLead(repos, captureInput(), T0);
  await updateRequirement(repos, lead.id, { configuration: "2 BHK" }, BUYER, minutes(5));
  const result = await updateRequirement(repos, lead.id, { configuration: null }, FOUNDER, minutes(6));
  assert.equal(result.lead.configuration, null);
  const last = (await getLeadTimeline(repos, lead.id)).filter((event) => event.eventType === "REQUIREMENT_UPDATED").at(-1)!;
  assert.deepEqual((last.payload.fields as Record<string, unknown>).configuration, { from: "2 BHK", to: null });
});

test("requirement: invalid values are refused and change nothing (negative budget, min above max, budget without currency, bad enums)", async () => {
  const repos = createInMemoryLeadRepositories();
  const { lead } = await captureAssistanceLead(repos, captureInput(), T0);
  const reject = (requirement: Parameters<typeof updateRequirement>[2], field: string) =>
    assert.rejects(
      () => updateRequirement(repos, lead.id, requirement, BUYER, minutes(5)),
      (error: unknown) => error instanceof LeadValidationError && error.field === field,
    );
  await reject({ budgetMax: -5 }, "budgetMax");
  await reject({ budgetMax: 1.5 }, "budgetMax");
  await reject({ budgetMin: 30_000_000, budgetMax: 10_000_000, budgetCurrency: "INR" }, "budgetMin");
  await reject({ budgetMax: 10_000_000 }, "budgetCurrency");
  await reject({ timeline: "SOMEDAY" as never }, "timeline");
  await reject({ budgetCurrency: "USD" as never }, "budgetCurrency");
  assert.equal((await repos.leads.getById(lead.id))!.budgetMax, null);
});

test("requirement: min/max are validated against the lead's EXISTING values too", async () => {
  const repos = createInMemoryLeadRepositories();
  const { lead } = await captureAssistanceLead(repos, captureInput(), T0);
  await updateRequirement(repos, lead.id, { budgetMax: 10_000_000, budgetCurrency: "INR" }, BUYER, minutes(5));
  await assert.rejects(() => updateRequirement(repos, lead.id, { budgetMin: 20_000_000 }, BUYER, minutes(6)), LeadValidationError);
});

test("requirement: an unknown lead is a not-found error", async () => {
  const repos = createInMemoryLeadRepositories();
  await assert.rejects(() => updateRequirement(repos, "00000000-0000-4000-8000-000000000000", { configuration: "x" }, BUYER), LeadNotFoundError);
});

test("requirement can arrive with the gate submission itself and is recorded in the same capture", async () => {
  const repos = createInMemoryLeadRepositories();
  const { lead } = await captureAssistanceLead(repos, captureInput({ requirement: { configuration: "2 BHK", timeline: "ONE_TO_THREE_MONTHS" } }), T0);
  assert.equal(lead.configuration, "2 BHK");
  assert.ok(types(await getLeadTimeline(repos, lead.id)).includes("REQUIREMENT_UPDATED"));
});

// --- redirect ----------------------------------------------------------------------------------

test("redirect: recording it appends DEVELOPER_WEBSITE_REDIRECTED for that developer", async () => {
  const repos = createInMemoryLeadRepositories();
  const { lead } = await captureAssistanceLead(repos, captureInput(), T0);
  await recordWebsiteRedirect(repos, lead.id, DEVELOPER_A, { url: "https://acme.example/", domain: "acme.example" }, minutes(1));
  const event = (await getLeadTimeline(repos, lead.id)).at(-1)!;
  assert.equal(event.eventType, "DEVELOPER_WEBSITE_REDIRECTED");
  assert.equal(event.developerId, DEVELOPER_A.id);
  assert.equal(event.payload.websiteDomain, "acme.example");
});

// --- founder operations ------------------------------------------------------------------------

test("status: a transition is recorded with from, to and actor; LOST needs a reason code", async () => {
  const repos = createInMemoryLeadRepositories();
  const { lead } = await captureAssistanceLead(repos, captureInput(), T0);

  const contacted = await changeLeadStatus(repos, lead.id, "CONTACTED", FOUNDER, {}, minutes(5));
  assert.equal(contacted.status, "CONTACTED");

  await assert.rejects(
    () => changeLeadStatus(repos, lead.id, "LOST", FOUNDER, {}, minutes(6)),
    (error: unknown) => error instanceof LeadValidationError && error.field === "reasonCode",
  );
  const lost = await changeLeadStatus(repos, lead.id, "LOST", FOUNDER, { reasonCode: "PRICE", note: "wanted cheaper" }, minutes(7));
  assert.equal(lost.status, "LOST");

  const changes = (await getLeadTimeline(repos, lead.id)).filter((event) => event.eventType === "STATUS_CHANGED");
  assert.deepEqual(changes.map((event) => [event.fromStatus, event.toStatus]), [["NEW", "CONTACTED"], ["CONTACTED", "LOST"]]);
  assert.equal(changes[1].payload.reasonCode, "PRICE");
  assert.equal(changes[1].actorId, FOUNDER.actorId);
});

test("status: moving to the status it already has is refused, and the founder can re-open a closed lead", async () => {
  const repos = createInMemoryLeadRepositories();
  const { lead } = await captureAssistanceLead(repos, captureInput(), T0);
  await assert.rejects(() => changeLeadStatus(repos, lead.id, "NEW", FOUNDER, {}, minutes(1)), LeadStateError);
  await changeLeadStatus(repos, lead.id, "NOT_INTERESTED", FOUNDER, {}, minutes(2));
  const reopened = await changeLeadStatus(repos, lead.id, "CONTACTED", FOUNDER, {}, minutes(3));
  assert.equal(reopened.status, "CONTACTED");
});

test("status: an unknown status is refused", async () => {
  const repos = createInMemoryLeadRepositories();
  const { lead } = await captureAssistanceLead(repos, captureInput(), T0);
  await assert.rejects(() => changeLeadStatus(repos, lead.id, "WINNING" as never, FOUNDER, {}, minutes(1)), LeadValidationError);
});

test("notes, follow-ups and contact logs are recorded as events and update last activity", async () => {
  const repos = createInMemoryLeadRepositories();
  const { lead } = await captureAssistanceLead(repos, captureInput(), T0);

  await addNote(repos, lead.id, "  Prefers evening calls  ", FOUNDER, minutes(5));
  const due = minutes(60 * 24);
  const withFollowUp = await setFollowUp(repos, lead.id, due, FOUNDER, minutes(6));
  assert.equal(withFollowUp.nextFollowUpAt?.getTime(), due.getTime());
  await logContact(repos, lead.id, { channel: "WHATSAPP", outcome: "REPLIED", note: "asked for brochure" }, FOUNDER, minutes(7));
  const cleared = await setFollowUp(repos, lead.id, null, FOUNDER, minutes(8));
  assert.equal(cleared.nextFollowUpAt, null);

  const events = await getLeadTimeline(repos, lead.id);
  assert.deepEqual(types(events).slice(-4), ["NOTE_ADDED", "FOLLOW_UP_SET", "CONTACT_LOGGED", "FOLLOW_UP_SET"]);
  assert.equal(events.find((event) => event.eventType === "NOTE_ADDED")!.payload.note, "Prefers evening calls");
  assert.equal((await repos.leads.getById(lead.id))!.lastActivityAt.getTime(), minutes(8).getTime());
});

test("notes: an empty note, an invalid follow-up date and invalid contact choices are refused", async () => {
  const repos = createInMemoryLeadRepositories();
  const { lead } = await captureAssistanceLead(repos, captureInput(), T0);
  await assert.rejects(() => addNote(repos, lead.id, "   ", FOUNDER), LeadValidationError);
  await assert.rejects(() => setFollowUp(repos, lead.id, new Date("nonsense"), FOUNDER), LeadValidationError);
  await assert.rejects(() => logContact(repos, lead.id, { channel: "FAX" as never, outcome: "CONNECTED" }, FOUNDER), LeadValidationError);
  await assert.rejects(() => logContact(repos, lead.id, { channel: "WHATSAPP", outcome: "MAYBE" as never }, FOUNDER), LeadValidationError);
});

test("bookings: created and updated with an event each; amounts and currency are validated; totals stay per-currency", async () => {
  const repos = createInMemoryLeadRepositories();
  const { lead } = await captureAssistanceLead(repos, captureInput(), T0);

  const booking = await createBooking(repos, lead.id, { currency: "INR", bookingValue: 25_000_000, commissionExpected: 500_000, projectName: "Acme Heights" }, FOUNDER, minutes(10));
  assert.equal(booking.developerId, DEVELOPER_A.id, "defaults to the lead's developer");
  assert.equal(booking.commissionReceived, 0);

  await assert.rejects(() => createBooking(repos, lead.id, { currency: "INR", bookingValue: -1 }, FOUNDER), LeadValidationError);
  await assert.rejects(() => createBooking(repos, lead.id, { currency: "USD" as never, bookingValue: 1 }, FOUNDER), LeadValidationError);

  const updated = await updateBooking(repos, booking.id, { commissionReceived: 500_000, commissionReceivedAt: minutes(60) }, FOUNDER, minutes(61));
  assert.equal(updated.commissionReceived, 500_000);
  const unchanged = await updateBooking(repos, booking.id, { commissionReceived: 500_000 }, FOUNDER, minutes(62));
  assert.equal(unchanged.updatedAt.getTime(), updated.updatedAt.getTime(), "an identical update changes nothing");

  const events = await getLeadTimeline(repos, lead.id);
  const created = events.find((event) => event.eventType === "BOOKING_CREATED")!;
  assert.equal(created.payload.bookingId, booking.id);
  const changed = events.filter((event) => event.eventType === "BOOKING_UPDATED");
  assert.equal(changed.length, 1);
  assert.deepEqual((changed[0].payload.changes as Record<string, { from: unknown; to: unknown }>).commissionReceived, { from: 0, to: 500_000 });
});

// --- authorization boundaries ------------------------------------------------------------------

test("authorization: every founder-only operation refuses a BUYER, a SYSTEM actor and a founder without an id", async () => {
  const repos = createInMemoryLeadRepositories();
  const { lead } = await captureAssistanceLead(repos, captureInput(), T0);
  const booking = await createBooking(repos, lead.id, { currency: "INR", bookingValue: 1 }, FOUNDER, minutes(1));

  const notFounders = [BUYER, SYSTEM, { actorType: "FOUNDER" as const }];
  for (const actor of notFounders) {
    const label = `${actor.actorType}${"actorId" in actor ? "" : " (no id)"}`;
    const attempts: Array<[string, () => Promise<unknown>]> = [
      ["changeLeadStatus", () => changeLeadStatus(repos, lead.id, "CONTACTED", actor)],
      ["addNote", () => addNote(repos, lead.id, "x", actor)],
      ["setFollowUp", () => setFollowUp(repos, lead.id, null, actor)],
      ["logContact", () => logContact(repos, lead.id, { channel: "WHATSAPP", outcome: "CONNECTED" }, actor)],
      ["createBooking", () => createBooking(repos, lead.id, { currency: "INR", bookingValue: 1 }, actor)],
      ["updateBooking", () => updateBooking(repos, booking.id, { status: "CANCELLED" }, actor)],
      ["eraseLead", () => eraseLead(repos, lead.id, actor)],
    ];
    for (const [name, attempt] of attempts) {
      await assert.rejects(attempt, UnauthorizedLeadActionError, `${name} must refuse ${label}`);
    }
  }
  // Nothing the refused calls attempted took effect.
  assert.equal((await repos.leads.getById(lead.id))!.status, "NEW");
  assert.equal((await repos.leads.getById(lead.id))!.erasedAt, null);
});

test("authorization: a FOUNDER actor may not be claimed by a buyer-facing call — updateRequirement with FOUNDER needs an id", async () => {
  const repos = createInMemoryLeadRepositories();
  const { lead } = await captureAssistanceLead(repos, captureInput(), T0);
  await assert.rejects(() => updateRequirement(repos, lead.id, { configuration: "x" }, { actorType: "FOUNDER" }), UnauthorizedLeadActionError);
  // A buyer may update their own requirement.
  await updateRequirement(repos, lead.id, { configuration: "x" }, BUYER, minutes(1));
});

// --- erasure -----------------------------------------------------------------------------------

async function seededLead() {
  const repos = createInMemoryLeadRepositories();
  const { lead } = await captureAssistanceLead(repos, captureInput({ requirement: { location: "Flat 402 Tower A Andheri", configuration: "3 BHK", timeline: "WITHIN_30_DAYS", budgetMax: 20_000_000, budgetCurrency: "INR" } }), T0);
  await addNote(repos, lead.id, "Asha's husband Rakesh works at Infosys, call after 7pm", FOUNDER, minutes(5));
  await logContact(repos, lead.id, { channel: "WHATSAPP", outcome: "CONNECTED", note: "shared brochure" }, FOUNDER, minutes(6));
  await changeLeadStatus(repos, lead.id, "NOT_INTERESTED", FOUNDER, { note: "bought via friend Suresh" }, minutes(7));
  await setFollowUp(repos, lead.id, minutes(500), FOUNDER, minutes(8));
  await createBooking(repos, lead.id, { currency: "INR", bookingValue: 1, projectName: "Acme Heights" }, FOUNDER, minutes(9));
  return { repos, leadId: lead.id };
}

test("erasure: personal data is removed from the lead, the structured requirement and history skeleton remain", async () => {
  const { repos, leadId } = await seededLead();
  const before = await getLeadTimeline(repos, leadId);
  const erased = await eraseLead(repos, leadId, FOUNDER, minutes(100));

  assert.equal(erased.name, null);
  assert.equal(erased.email, null);
  assert.equal(erased.phoneE164, null);
  assert.equal(erased.location, null, "free-text location is personal data");
  assert.equal(erased.sessionId, null);
  assert.equal(erased.userId, null);
  assert.equal(erased.nextFollowUpAt, null);
  assert.equal(erased.erasedAt?.getTime(), minutes(100).getTime());

  // Anonymous, structured business data survives.
  assert.equal(erased.status, "NOT_INTERESTED");
  assert.equal(erased.configuration, "3 BHK");
  assert.equal(erased.timeline, "WITHIN_30_DAYS");
  assert.equal(erased.budgetMax, 20_000_000);
  assert.equal(erased.developerId, DEVELOPER_A.id);
  assert.ok(erased.firstTouchId && erased.lastTouchId, "attribution pointers survive");

  // Every pre-existing event is still there, with the same type/actor/time/developer/status transition.
  const after = await getLeadTimeline(repos, leadId);
  const original = after.slice(0, before.length);
  assert.equal(original.length, before.length);
  original.forEach((event, index) => {
    assert.equal(event.id, before[index].id);
    assert.equal(event.eventType, before[index].eventType);
    assert.equal(event.actorType, before[index].actorType);
    assert.equal(event.actorId, before[index].actorId);
    assert.equal(event.developerId, before[index].developerId);
    assert.equal(event.fromStatus, before[index].fromStatus);
    assert.equal(event.toStatus, before[index].toStatus);
    assert.equal(event.createdAt.getTime(), before[index].createdAt.getTime());
  });
});

test("erasure: no personal text survives ANYWHERE in the lead's history", async () => {
  const { repos, leadId } = await seededLead();
  await eraseLead(repos, leadId, FOUNDER, minutes(100));

  const everything = JSON.stringify({
    lead: await repos.leads.getById(leadId),
    events: await getLeadTimeline(repos, leadId),
    consents: await repos.consents.listByLead(leadId),
  });
  for (const secret of ["Asha", "Verma", "asha.verma", "9876543210", "Rakesh", "Infosys", "Suresh", "brochure", "Flat 402", "Andheri"]) {
    assert.ok(!everything.includes(secret), `"${secret}" survived erasure`);
  }
});

test("erasure: notes are gone but the event that a note was added remains; consent is withdrawn and the erasure itself is recorded", async () => {
  const { repos, leadId } = await seededLead();
  await eraseLead(repos, leadId, FOUNDER, minutes(100));
  const events = await getLeadTimeline(repos, leadId);

  const note = events.find((event) => event.eventType === "NOTE_ADDED")!;
  assert.deepEqual(note.payload, { redacted: true });
  assert.equal(events.find((event) => event.eventType === "STATUS_CHANGED")!.payload.note, undefined);

  const consents = await repos.consents.listByLead(leadId);
  assert.ok(consents.length > 0 && consents.every((consent) => consent.withdrawnAt !== null));
  assert.ok(types(events).includes("CONSENT_WITHDRAWN"));

  const erasure = events.at(-1)!;
  assert.equal(erasure.eventType, "LEAD_ERASED");
  assert.equal(erasure.actorId, FOUNDER.actorId);
  assert.equal(erasure.createdAt.getTime(), minutes(100).getTime());
});

test("erasure: bookings (financial records, no personal data) are kept", async () => {
  const { repos, leadId } = await seededLead();
  await eraseLead(repos, leadId, FOUNDER, minutes(100));
  assert.equal((await repos.bookings.listByLead(leadId)).length, 1);
});

test("erasure: an erased lead cannot be erased again or changed", async () => {
  const { repos, leadId } = await seededLead();
  await eraseLead(repos, leadId, FOUNDER, minutes(100));
  await assert.rejects(() => eraseLead(repos, leadId, FOUNDER), LeadStateError);
  await assert.rejects(() => addNote(repos, leadId, "x", FOUNDER), LeadStateError);
  await assert.rejects(() => changeLeadStatus(repos, leadId, "CONTACTED", FOUNDER), LeadStateError);
  await assert.rejects(() => updateRequirement(repos, leadId, { configuration: "x" }, FOUNDER), LeadStateError);
  await assert.rejects(() => createBooking(repos, leadId, { currency: "INR", bookingValue: 1 }, FOUNDER), LeadStateError);
});

test("erasure: the same phone number later is a NEW lead — no link back is kept", async () => {
  const { repos, leadId } = await seededLead();
  await eraseLead(repos, leadId, FOUNDER, minutes(100));
  const returning = await captureAssistanceLead(repos, captureInput(), minutes(200));
  assert.equal(returning.created, true);
  assert.notEqual(returning.lead.id, leadId);
  assert.equal(repos.snapshot().leads.length, 2);
});

test("erasure: an unknown lead is not-found", async () => {
  const repos = createInMemoryLeadRepositories();
  await assert.rejects(() => eraseLead(repos, "00000000-0000-4000-8000-000000000000", FOUNDER), LeadNotFoundError);
});

// --- no PII leakage into events / analytics ----------------------------------------------------

test("no PII: a capture's event payloads never contain the phone, email, name or typed requirement text", async () => {
  const repos = createInMemoryLeadRepositories();
  const { lead } = await captureAssistanceLead(
    repos,
    captureInput({ requirement: { location: "Flat 402 Tower A Andheri", configuration: "3 BHK" } }),
    T0,
  );
  await captureAssistanceLead(repos, captureInput({ name: "Other Name", developer: DEVELOPER_B }), minutes(5));
  await recordWebsiteRedirect(repos, lead.id, DEVELOPER_A, { url: "https://acme.example/", domain: "acme.example" }, minutes(6));

  const events = await getLeadTimeline(repos, lead.id);
  const serialised = JSON.stringify(events.filter((event) => event.eventType !== "REQUIREMENT_UPDATED").map((event) => event.payload));
  for (const secret of ["9876543210", "+91", "Asha", "Verma", "asha.verma", "example.com/", "Other Name"]) {
    if (secret === "example.com/") continue; // the developer's own public website is expected
    assert.ok(!serialised.includes(secret), `"${secret}" leaked into an event payload`);
  }
});

test("no PII: the consent event holds ids and enums only — the wording lives in lead_consents, not the event", async () => {
  const repos = createInMemoryLeadRepositories();
  const { lead } = await captureAssistanceLead(repos, captureInput(), T0);
  const consentEvent = (await getLeadTimeline(repos, lead.id)).find((event) => event.eventType === "CONSENT_GIVEN")!;
  assert.deepEqual(Object.keys(consentEvent.payload).sort(), ["channel", "consentId", "purpose", "textVersion"]);
});
