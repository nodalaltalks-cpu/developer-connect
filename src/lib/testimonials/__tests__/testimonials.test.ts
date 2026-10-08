import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ILLUSTRATIVE_SCENARIOS,
  TestimonialAuthorizationError,
  TestimonialNotFoundError,
  TestimonialStateError,
  approve,
  archive,
  createRequest,
  getPublishedTestimonials,
  getTestimonialCounts,
  lookupRequest,
  markSent,
  moveToReview,
  publish,
  reject,
  seedIllustrativeDrafts,
  submitByRequestToken,
} from "../service.ts";
import { TestimonialValidationError, canTransition, cleanSubmission, displayName, hashRequestToken, requestMessage, requestWhatsappHref, toPublic } from "../model.ts";
import { createInMemoryTestimonialRepository } from "../memory-repository.ts";

const FOUNDER = { actorType: "FOUNDER" as const, actorId: "user_founder_1" };
const EMPLOYEE = { actorType: "EMPLOYEE" as const, actorId: "user_emp_1" };
const T = (n: number) => new Date(Date.UTC(2026, 9, 8, 10, n));
const GOOD = { name: "Asha Verma", displayMode: "FIRST_NAME_LAST_INITIAL", city: "Mumbai", country: "India", helpedWith: "Comparing developers", experience: "A calm, clear conversation that helped me ask better questions.", permissionPublish: true };

test("workflow: a real request moves DRAFT to PUBLISHED one allowed step at a time, with an audit event for each", async () => {
  const repo = createInMemoryTestimonialRepository();
  const { testimonial, token } = await createRequest(repo, { recipientName: "Asha Verma" }, FOUNDER, T(0));
  assert.equal(testimonial.status, "DRAFT");
  assert.deepEqual(await lookupRequest(repo, token), { open: true, name: "Asha Verma" });
  await markSent(repo, testimonial.id, "WHATSAPP", FOUNDER, T(1));
  await submitByRequestToken(repo, token, GOOD, T(2));
  assert.equal((await repo.getById(testimonial.id))!.status, "RECEIVED");
  await moveToReview(repo, testimonial.id, FOUNDER, T(3));
  await approve(repo, testimonial.id, FOUNDER, T(4));
  assert.deepEqual(await getPublishedTestimonials(repo), [], "approved is not public yet");
  await publish(repo, testimonial.id, FOUNDER, T(5));
  const pub = await getPublishedTestimonials(repo);
  assert.equal(pub.length, 1);
  assert.equal(pub[0].name, "Asha V.");
  assert.equal(pub[0].place, "Mumbai, India");
  assert.deepEqual(repo.events.map((e) => e.eventType), ["REQUEST_CREATED", "STATUS_SENT", "STATUS_RECEIVED", "STATUS_PENDING_APPROVAL", "STATUS_APPROVED", "STATUS_PUBLISHED"]);
  await archive(repo, testimonial.id, FOUNDER, T(6));
  assert.deepEqual(await getPublishedTestimonials(repo), [], "archiving withdraws it");
});

test("workflow: steps cannot be skipped or reversed", async () => {
  const repo = createInMemoryTestimonialRepository();
  const { testimonial } = await createRequest(repo, {}, FOUNDER, T(0));
  await assert.rejects(approve(repo, testimonial.id, FOUNDER, T(1)), TestimonialStateError);
  await assert.rejects(publish(repo, testimonial.id, FOUNDER, T(1)), TestimonialStateError);
  assert.equal(canTransition("PUBLISHED", "DRAFT"), false);
  assert.equal(canTransition("ARCHIVED", "PUBLISHED"), false);
  assert.equal(canTransition("RECEIVED", "PUBLISHED"), false);
});

test("consent: without permission to publish a testimonial cannot be approved or published, whoever asks", async () => {
  const repo = createInMemoryTestimonialRepository();
  const { testimonial, token } = await createRequest(repo, {}, FOUNDER, T(0));
  await submitByRequestToken(repo, token, { ...GOOD, permissionPublish: false }, T(1));
  await moveToReview(repo, testimonial.id, FOUNDER, T(2));
  await assert.rejects(approve(repo, testimonial.id, FOUNDER, T(3)), /permission/);
  const row = await repo.getById(testimonial.id);
  await assert.rejects(repo.save({ ...row!, status: "PUBLISHED", approvedAt: T(3), publishedAt: T(3) }), /consent/, "the data layer refuses it too");
  // A bot-style truthy value is not consent.
  assert.equal(cleanSubmission({ ...GOOD, permissionPublish: "on" }).permissionPublish, false);
  assert.equal(cleanSubmission({ ...GOOD, permissionPublish: 1 }).permissionPublish, false);
});

test("links: a link works once, an invalid one reveals nothing, and only a hash of the secret is stored", async () => {
  const repo = createInMemoryTestimonialRepository();
  const { testimonial, token } = await createRequest(repo, {}, FOUNDER, T(0));
  assert.equal(testimonial.requestTokenHash, hashRequestToken(token));
  assert.ok(!JSON.stringify([...repo.rows.values()]).includes(token), "the secret itself is never stored");
  await submitByRequestToken(repo, token, GOOD, T(1));
  await assert.rejects(submitByRequestToken(repo, token, GOOD, T(2)), TestimonialStateError);
  assert.deepEqual(await lookupRequest(repo, token), { open: false, name: null });
  await assert.rejects(submitByRequestToken(repo, "x".repeat(43), GOOD, T(2)), TestimonialNotFoundError);
  await assert.rejects(submitByRequestToken(repo, "short", GOOD, T(2)), TestimonialNotFoundError);
  await assert.rejects(submitByRequestToken(repo, undefined, GOOD, T(2)), TestimonialNotFoundError);
  assert.deepEqual(await lookupRequest(repo, "../etc/passwd"), { open: false, name: null });
});

test("a copied link that was never marked sent still records the whole history", async () => {
  const repo = createInMemoryTestimonialRepository();
  const { testimonial, token } = await createRequest(repo, {}, FOUNDER, T(0));
  await submitByRequestToken(repo, token, GOOD, T(1));
  assert.deepEqual(repo.events.filter((e) => e.testimonialId === testimonial.id).map((e) => e.toStatus), ["DRAFT", "SENT", "RECEIVED"]);
});

test("validation: honest feedback only, with sensible limits and no leakage of anything but what was typed", () => {
  assert.throws(() => cleanSubmission({ ...GOOD, name: "" }), TestimonialValidationError);
  assert.throws(() => cleanSubmission({ ...GOOD, experience: "too short" }), TestimonialValidationError);
  assert.throws(() => cleanSubmission({ ...GOOD, rating: 9 }), TestimonialValidationError);
  assert.equal(cleanSubmission({ ...GOOD, rating: "" }).rating, null, "a rating is optional");
  assert.equal(cleanSubmission({ ...GOOD, displayMode: "nonsense" }).displayMode, "ANONYMOUS", "unknown display mode falls back to the most private");
  assert.equal(cleanSubmission({ ...GOOD, experience: "x".repeat(5000) }).experience.length, 2000);
  assert.equal(cleanSubmission({ ...GOOD, name: "A\u0000sha" }).authorName, "Asha");
});

test("display: the author chooses how the name appears; anonymous is never named", () => {
  const base = { authorName: "Asha Kumari Verma" };
  assert.equal(displayName({ ...base, displayMode: "FULL_NAME" }), "Asha Kumari Verma");
  assert.equal(displayName({ ...base, displayMode: "FIRST_NAME_LAST_INITIAL" }), "Asha V.");
  assert.equal(displayName({ ...base, displayMode: "FIRST_NAME_ONLY" }), "Asha");
  assert.equal(displayName({ ...base, displayMode: "ANONYMOUS" }), "A Developer Connects client");
  assert.equal(displayName({ authorName: null, displayMode: "FULL_NAME" }), "A Developer Connects client");
  assert.equal(displayName({ authorName: "Asha", displayMode: "FIRST_NAME_LAST_INITIAL" }), "Asha");
});

test("illustrative templates: twenty, internal, labelled, never sendable, approvable or public, and seeding is idempotent", async () => {
  const repo = createInMemoryTestimonialRepository();
  assert.equal(ILLUSTRATIVE_SCENARIOS.length, 20);
  assert.equal(new Set(ILLUSTRATIVE_SCENARIOS.map((s) => s.key)).size, 20);
  assert.deepEqual(await seedIllustrativeDrafts(repo, FOUNDER, T(0)), { created: 20 });
  assert.deepEqual(await seedIllustrativeDrafts(repo, FOUNDER, T(1)), { created: 0 });
  const counts = await getTestimonialCounts(repo, FOUNDER);
  assert.equal(counts.illustrative, 20);
  assert.equal(Object.values(counts.real).reduce((a, b) => a + b, 0), 0, "none of them counts as a real testimonial");
  const first = [...repo.rows.values()][0];
  assert.equal(first.status, "DRAFT");
  assert.equal(first.permissionPublish, false);
  assert.equal(first.requestTokenHash, null, "no link exists for a template");
  await assert.rejects(markSent(repo, first.id, "EMAIL", FOUNDER, T(2)), TestimonialStateError);
  await assert.rejects(approve(repo, first.id, FOUNDER, T(2)), TestimonialStateError);
  await assert.rejects(repo.save({ ...first, status: "APPROVED", approvedAt: T(2) }), /illustrative/, "the data layer refuses it as well");
  assert.deepEqual(await getPublishedTestimonials(repo), []);
  assert.equal(toPublic({ ...first, status: "PUBLISHED", permissionPublish: true, approvedAt: T(2), publishedAt: T(2) }), null, "even a corrupted row is never shown");
  assert.ok(!ILLUSTRATIVE_SCENARIOS.some((s) => /\d+\s?%|guarantee|saved|returns|profit|best|#1/i.test(s.text)), "no result, saving or performance claim");
  assert.ok(!ILLUSTRATIVE_SCENARIOS.some((s) => /broker|independent/i.test(s.text)));
});

test("authorization: only the Founder manages testimonials", async () => {
  const repo = createInMemoryTestimonialRepository();
  await assert.rejects(createRequest(repo, {}, EMPLOYEE), TestimonialAuthorizationError);
  await assert.rejects(seedIllustrativeDrafts(repo, EMPLOYEE), TestimonialAuthorizationError);
  await assert.rejects(getTestimonialCounts(repo, EMPLOYEE), TestimonialAuthorizationError);
  await assert.rejects(createRequest(repo, {}, { actorType: "FOUNDER", actorId: "" }), TestimonialAuthorizationError);
  const { testimonial } = await createRequest(repo, {}, FOUNDER, T(0));
  for (const action of [() => markSent(repo, testimonial.id, "LINK", EMPLOYEE), () => moveToReview(repo, testimonial.id, EMPLOYEE), () => approve(repo, testimonial.id, EMPLOYEE), () => publish(repo, testimonial.id, EMPLOYEE), () => archive(repo, testimonial.id, EMPLOYEE), () => reject(repo, testimonial.id, "x", EMPLOYEE)]) {
    await assert.rejects(action(), TestimonialAuthorizationError);
  }
});

test("rejection needs a reason and keeps it in the audit trail", async () => {
  const repo = createInMemoryTestimonialRepository();
  const { testimonial, token } = await createRequest(repo, {}, FOUNDER, T(0));
  await submitByRequestToken(repo, token, GOOD, T(1));
  await assert.rejects(reject(repo, testimonial.id, "  ", FOUNDER, T(2)), TestimonialStateError);
  await reject(repo, testimonial.id, "Contains a third party's details", FOUNDER, T(3));
  assert.equal(repo.events.at(-1)!.note, "Contains a third party's details");
  assert.equal((await repo.getById(testimonial.id))!.status, "REJECTED");
});

test("the request message is polite, asks for honest feedback and never asks for a good one", () => {
  const msg = requestMessage({ name: "Asha Verma", link: "https://developerconnects.com/testimonial/abc" });
  assert.match(msg, /^Hi Asha, thank you for trusting me/);
  assert.match(msg, /honest note/);
  assert.ok(!/positive|5[- ]star|great review|good review/i.test(msg));
  assert.match(requestWhatsappHref(msg), /^https:\/\/wa\.me\/\?text=/);
  assert.ok(!requestWhatsappHref(msg).includes("wa.me/91"), "no recipient number is stored or embedded");
});
