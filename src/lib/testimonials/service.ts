import { randomUUID } from "node:crypto";
import {
  FIELD_LIMITS,
  ILLUSTRATIVE_LABEL,
  TESTIMONIAL_STATUSES,
  canTransition,
  cleanFounderEntry,
  cleanSubmission,
  hashRequestToken,
  isPlausibleToken,
  newRequestToken,
  resolvePublishedWording,
  toPublic,
  type PublicTestimonial,
  type FounderEntryInput,
  type RequestChannel,
  type SubmissionInput,
  type Testimonial,
  type TestimonialStatus,
} from "./model.ts";

/**
 * The testimonial workflow. Founder actions take an explicit FOUNDER actor and write an audit event for every change; the one
 * public entry point (submitByRequestToken) takes only the secret from the buyer's link and what the buyer typed.
 */

export interface TestimonialEvent {
  id: string;
  testimonialId: string;
  eventType: string;
  fromStatus: TestimonialStatus | null;
  toStatus: TestimonialStatus | null;
  actor: string;
  note: string | null;
  createdAt: Date;
}

export interface TestimonialRepository {
  insert(testimonial: Testimonial): Promise<void>;
  getById(id: string): Promise<Testimonial | null>;
  getByTokenHash(hash: string): Promise<Testimonial | null>;
  /** Writes every mutable field of an existing row. */
  save(testimonial: Testimonial): Promise<void>;
  list(filter: { status?: TestimonialStatus; illustrative?: boolean; limit: number }): Promise<Testimonial[]>;
  countByStatus(): Promise<Array<{ status: TestimonialStatus; illustrative: boolean; count: number }>>;
  appendEvent(event: TestimonialEvent): Promise<void>;
  listEvents(testimonialId: string): Promise<TestimonialEvent[]>;
  listPublished(limit: number): Promise<Testimonial[]>;
  scenariosPresent(): Promise<string[]>;
  /** Runs several writes as one unit, so a status change and its audit event are never separated. */
  transaction<T>(work: (repo: TestimonialRepository) => Promise<T>): Promise<T>;
}

export interface FounderActor {
  actorType: "FOUNDER";
  actorId: string;
}

export class TestimonialStateError extends Error {}
export class TestimonialNotFoundError extends Error {}
export class TestimonialAuthorizationError extends Error {}

function requireFounder(actor: { actorType: string; actorId?: string | null }): asserts actor is FounderActor {
  if (actor.actorType !== "FOUNDER" || !actor.actorId) throw new TestimonialAuthorizationError("Only the Founder can manage testimonials.");
}

async function load(repo: TestimonialRepository, id: string): Promise<Testimonial> {
  const row = await repo.getById(id);
  if (!row) throw new TestimonialNotFoundError("Testimonial not found.");
  return row;
}

async function move(
  repo: TestimonialRepository,
  row: Testimonial,
  to: TestimonialStatus,
  actor: string,
  now: Date,
  change: (t: Testimonial) => void = () => {},
  note: string | null = null,
): Promise<Testimonial> {
  if (!canTransition(row.status, to)) throw new TestimonialStateError(`A ${row.status.toLowerCase().replace("_", " ")} testimonial cannot become ${to.toLowerCase().replace("_", " ")}.`);
  const next: Testimonial = { ...row, status: to, updatedAt: now };
  change(next);
  await repo.transaction(async (tx) => {
    await tx.save(next);
    await tx.appendEvent({ id: randomUUID(), testimonialId: row.id, eventType: `STATUS_${to}`, fromStatus: row.status, toStatus: to, actor, note, createdAt: now });
  });
  return next;
}

const blank = (id: string, actor: string, now: Date): Testimonial => ({
  id,
  status: "DRAFT",
  isIllustrative: false,
  scenario: null,
  requestTokenHash: null,
  requestedVia: null,
  authorName: null,
  displayMode: "FIRST_NAME_LAST_INITIAL",
  city: null,
  country: null,
  helpedWith: null,
  experience: null,
  publishedText: null,
  isParaphrased: false,
  attributionDetail: null,
  enteredVia: "FORM",
  project: null,
  rating: null,
  permissionPublish: false,
  leadId: null,
  createdBy: actor,
  createdAt: now,
  updatedAt: now,
  sentAt: null,
  receivedAt: null,
  approvedAt: null,
  approvedBy: null,
  publishedAt: null,
  archivedAt: null,
  rejectReason: null,
});

/** A new request for a real person. Returns the secret link token ONCE; only its hash is kept. */
export async function createRequest(
  repo: TestimonialRepository,
  input: { recipientName?: string | null; leadId?: string | null },
  actor: { actorType: string; actorId?: string | null },
  now: Date = new Date(),
): Promise<{ testimonial: Testimonial; token: string }> {
  requireFounder(actor);
  const token = newRequestToken();
  const row = blank(randomUUID(), actor.actorId, now);
  row.requestTokenHash = hashRequestToken(token);
  row.authorName = input.recipientName?.trim().slice(0, FIELD_LIMITS.name) || null;
  row.leadId = input.leadId ?? null;
  await repo.transaction(async (tx) => {
    await tx.insert(row);
    await tx.appendEvent({ id: randomUUID(), testimonialId: row.id, eventType: "REQUEST_CREATED", fromStatus: null, toStatus: "DRAFT", actor: actor.actorId, note: null, createdAt: now });
  });
  return { testimonial: row, token };
}

/** The request was shared (the Founder pressed WhatsApp or Email, or copied the link). */
export async function markSent(repo: TestimonialRepository, id: string, channel: RequestChannel, actor: { actorType: string; actorId?: string | null }, now: Date = new Date()): Promise<Testimonial> {
  requireFounder(actor);
  const row = await load(repo, id);
  if (row.isIllustrative) throw new TestimonialStateError("An illustrative draft is a template and is never sent to anyone.");
  return move(repo, row, "SENT", actor.actorId, now, (t) => {
    t.requestedVia = channel;
    t.sentAt = now;
  });
}

/** What the buyer's link page may know before they submit: whether the link is usable, and the name the Founder gave. */
export async function lookupRequest(repo: TestimonialRepository, token: unknown): Promise<{ open: boolean; name: string | null }> {
  if (!isPlausibleToken(token)) return { open: false, name: null };
  const row = await repo.getByTokenHash(hashRequestToken(token));
  if (!row || row.isIllustrative || !(row.status === "DRAFT" || row.status === "SENT")) return { open: false, name: null };
  return { open: true, name: row.authorName };
}

/** The ONLY public write. The secret in the link is the whole credential; a link works once. */
export async function submitByRequestToken(repo: TestimonialRepository, token: unknown, input: SubmissionInput, now: Date = new Date()): Promise<void> {
  if (!isPlausibleToken(token)) throw new TestimonialNotFoundError("This link is not valid.");
  const clean = cleanSubmission(input);
  const row = await repo.getByTokenHash(hashRequestToken(token));
  if (!row || row.isIllustrative) throw new TestimonialNotFoundError("This link is not valid.");
  if (row.status !== "DRAFT" && row.status !== "SENT") throw new TestimonialStateError("This link has already been used.");
  let current = row;
  // A link copied without pressing "sent" is still a request that went out: record that step too, so the history is whole.
  if (current.status === "DRAFT") current = await move(repo, current, "SENT", "buyer-link", now, (t) => {
    t.requestedVia = t.requestedVia ?? "LINK";
    t.sentAt = now;
  });
  await move(repo, current, "RECEIVED", "buyer-link", now, (t) => {
    t.authorName = clean.authorName;
    t.displayMode = clean.displayMode;
    t.city = clean.city;
    t.country = clean.country;
    t.helpedWith = clean.helpedWith;
    t.experience = clean.experience;
    t.project = clean.project;
    t.rating = clean.rating;
    t.permissionPublish = clean.permissionPublish;
    t.receivedAt = now;
  });
}

export async function moveToReview(repo: TestimonialRepository, id: string, actor: { actorType: string; actorId?: string | null }, now: Date = new Date()): Promise<Testimonial> {
  requireFounder(actor);
  return move(repo, await load(repo, id), "PENDING_APPROVAL", actor.actorId, now);
}

export async function approve(repo: TestimonialRepository, id: string, actor: { actorType: string; actorId?: string | null }, now: Date = new Date()): Promise<Testimonial> {
  requireFounder(actor);
  const row = await load(repo, id);
  if (row.isIllustrative) throw new TestimonialStateError("An illustrative draft can never be approved. Replace it with a real customer's words first.");
  if (!row.permissionPublish) throw new TestimonialStateError("The author did not give permission to publish. This testimonial cannot be approved.");
  if (!row.experience) throw new TestimonialStateError("There is no testimonial text to approve.");
  if (!row.publishedText) throw new TestimonialStateError("Choose the wording to publish first: the client's own words, or a paraphrase you have confirmed is faithful.");
  return move(repo, row, "APPROVED", actor.actorId, now, (t) => {
    t.approvedAt = now;
    t.approvedBy = actor.actorId;
  });
}

export async function reject(repo: TestimonialRepository, id: string, reason: string, actor: { actorType: string; actorId?: string | null }, now: Date = new Date()): Promise<Testimonial> {
  requireFounder(actor);
  const why = reason.trim().slice(0, 500);
  if (!why) throw new TestimonialStateError("Say why it is being rejected (for your own records).");
  return move(repo, await load(repo, id), "REJECTED", actor.actorId, now, (t) => {
    t.rejectReason = why;
  }, why);
}

export async function publish(repo: TestimonialRepository, id: string, actor: { actorType: string; actorId?: string | null }, now: Date = new Date()): Promise<Testimonial> {
  requireFounder(actor);
  const row = await load(repo, id);
  if (row.isIllustrative || !row.permissionPublish || !row.approvedAt) throw new TestimonialStateError("Only an approved testimonial with the author's permission can be published.");
  return move(repo, row, "PUBLISHED", actor.actorId, now, (t) => {
    t.publishedAt = now;
  });
}

export async function archive(repo: TestimonialRepository, id: string, actor: { actorType: string; actorId?: string | null }, now: Date = new Date()): Promise<Testimonial> {
  requireFounder(actor);
  return move(repo, await load(repo, id), "ARCHIVED", actor.actorId, now, (t) => {
    t.archivedAt = now;
  });
}

// ---- reads ------------------------------------------------------------------------------------------------------------

export async function getPublishedTestimonials(repo: TestimonialRepository, limit = 6): Promise<PublicTestimonial[]> {
  return (await repo.listPublished(limit)).flatMap((t) => {
    const view = toPublic(t);
    return view ? [view] : [];
  });
}

export async function getTestimonialCounts(repo: TestimonialRepository, actor: { actorType: string; actorId?: string | null }): Promise<{ real: Record<TestimonialStatus, number>; illustrative: number }> {
  requireFounder(actor);
  const real = Object.fromEntries(TESTIMONIAL_STATUSES.map((s) => [s, 0])) as Record<TestimonialStatus, number>;
  let illustrative = 0;
  for (const row of await repo.countByStatus()) {
    if (row.illustrative) illustrative += row.count;
    else real[row.status] += row.count;
  }
  return { real, illustrative };
}

export async function listTestimonials(repo: TestimonialRepository, actor: { actorType: string; actorId?: string | null }, filter: { status?: TestimonialStatus; illustrative?: boolean; limit?: number } = {}): Promise<Testimonial[]> {
  requireFounder(actor);
  return repo.list({ ...filter, limit: Math.min(filter.limit ?? 100, 200) });
}

export async function getTestimonialHistory(repo: TestimonialRepository, id: string, actor: { actorType: string; actorId?: string | null }): Promise<TestimonialEvent[]> {
  requireFounder(actor);
  return repo.listEvents(id);
}

// ---- the 20 illustrative templates -------------------------------------------------------------------------------------

/**
 * Twenty INTERNAL templates showing the range of buyers a real testimonial might come from. They are labelled, never sent, never
 * approved, never published, never in structured data, and a database check enforces that. The "author" is the scenario itself
 * ("Illustrative buyer: ..."), not an invented person, and the wording makes no result, saving or performance claim. Replace each
 * with a real customer's words, or archive it.
 */
export const ILLUSTRATIVE_SCENARIOS: ReadonlyArray<{ key: string; city: string; country: string; helpedWith: string; text: string }> = [
  { key: "mumbai-end-user", city: "Mumbai", country: "India", helpedWith: "Choosing a home to live in", text: "I wanted to understand the neighbourhood and the payment plan before speaking to any sales team. The research gave me the right questions to ask." },
  { key: "mumbai-investor", city: "Mumbai", country: "India", helpedWith: "Comparing investment options", text: "I was comparing a few developers and needed someone to talk through the trade-offs without pushing a particular project." },
  { key: "mumbai-first-time-buyer", city: "Mumbai", country: "India", helpedWith: "A first purchase", text: "Buying my first home felt overwhelming. Having one person to ask, at my own pace, made the process calmer." },
  { key: "mumbai-nri", city: "Mumbai", country: "India", helpedWith: "Buying from overseas", text: "I live abroad and needed clear answers over WhatsApp, without having to be in the city for every conversation." },
  { key: "dubai-end-user", city: "Dubai", country: "United Arab Emirates", helpedWith: "Choosing a home to live in", text: "I wanted to understand handover timelines and service charges before committing. The guidance was straightforward." },
  { key: "dubai-investor", city: "Dubai", country: "United Arab Emirates", helpedWith: "Comparing off-plan and ready options", text: "I needed a second opinion on payment plans and what the headline price did not include." },
  { key: "dubai-nri", city: "Dubai", country: "United Arab Emirates", helpedWith: "Buying from outside the UAE", text: "I was buying from another country and wanted a single, reachable person to ask my questions." },
  { key: "dubai-first-time-buyer", city: "Dubai", country: "United Arab Emirates", helpedWith: "A first purchase in a new country", text: "I did not know the process or the terms. A patient explanation of the steps was what I needed." },
  { key: "budget-sensitive", city: "Mumbai", country: "India", helpedWith: "Working within a fixed budget", text: "My budget was fixed and I wanted honest input on what was realistic, not a list of things I could not afford." },
  { key: "luxury-buyer", city: "Dubai", country: "United Arab Emirates", helpedWith: "A premium purchase", text: "For a larger purchase I wanted a discreet conversation and a careful comparison of developers." },
  { key: "comparing-developers", city: "Mumbai", country: "India", helpedWith: "Comparing developers", text: "I had narrowed it to two developers and wanted help weighing their track records and project details." },
  { key: "second-opinion", city: "Dubai", country: "United Arab Emirates", helpedWith: "A second opinion", text: "I had already been shown a property and wanted someone outside that sales conversation to sense-check it with me." },
  { key: "after-site-visit", city: "Mumbai", country: "India", helpedWith: "Deciding after a site visit", text: "After visiting a project I had questions I had forgotten to ask. It helped to talk them through afterwards." },
  { key: "before-booking", city: "Dubai", country: "United Arab Emirates", helpedWith: "Final checks before booking", text: "Before paying anything I wanted to go through the documents and terms once more with someone experienced." },
  { key: "after-booking", city: "Mumbai", country: "India", helpedWith: "Support after booking", text: "Once I had booked, I still had questions about timelines and next steps, and I was able to ask them." },
  { key: "post-sale-help", city: "Dubai", country: "United Arab Emirates", helpedWith: "Help after the sale", text: "There were practical questions after the purchase, and it was useful to have someone I could still message." },
  { key: "family-decision", city: "Mumbai", country: "India", helpedWith: "A decision with family", text: "Several of us were deciding together. A clear summary of the options made the conversation easier." },
  { key: "relocating", city: "Dubai", country: "United Arab Emirates", helpedWith: "Relocating for work", text: "I was relocating and needed to understand neighbourhoods quickly and without pressure." },
  { key: "upgrading", city: "Mumbai", country: "India", helpedWith: "Moving to a larger home", text: "I was upgrading and wanted to compare areas on commute and space, not only price." },
  { key: "researching-only", city: "Dubai", country: "United Arab Emirates", helpedWith: "Research before deciding", text: "I was not ready to buy. I appreciated that I could read, research and ask questions without being chased." },
] as const;

/** Idempotent: creates only the templates that are missing, so running it twice changes nothing. */
export async function seedIllustrativeDrafts(repo: TestimonialRepository, actor: { actorType: string; actorId?: string | null }, now: Date = new Date()): Promise<{ created: number }> {
  requireFounder(actor);
  const present = new Set(await repo.scenariosPresent());
  let created = 0;
  for (const s of ILLUSTRATIVE_SCENARIOS) {
    if (present.has(s.key)) continue;
    const row = blank(randomUUID(), actor.actorId, now);
    row.isIllustrative = true;
    row.scenario = s.key;
    row.authorName = `Illustrative buyer: ${s.key.replace(/-/g, " ")}`;
    row.displayMode = "ANONYMOUS";
    row.city = s.city;
    row.country = s.country;
    row.helpedWith = s.helpedWith;
    row.experience = s.text;
    await repo.transaction(async (tx) => {
      await tx.insert(row);
      await tx.appendEvent({ id: randomUUID(), testimonialId: row.id, eventType: "ILLUSTRATIVE_CREATED", fromStatus: null, toStatus: "DRAFT", actor: actor.actorId, note: ILLUSTRATIVE_LABEL, createdAt: now });
    });
    created += 1;
  }
  return { created };
}

// ---- feedback received another way, and the wording that is published ---------------------------------------------------------

/**
 * The Founder records feedback a real client gave another way (a WhatsApp message, an email). The client's original words are stored
 * exactly as pasted; nothing is invented (a missing name stays missing and forces an anonymous display); the record goes through the
 * same steps as any other (draft, sent, received) so its history is whole, and still needs review, wording and approval to be public.
 */
export async function recordFounderEntered(
  repo: TestimonialRepository,
  input: FounderEntryInput,
  actor: { actorType: string; actorId?: string | null },
  now: Date = new Date(),
): Promise<Testimonial> {
  requireFounder(actor);
  const clean = cleanFounderEntry(input);
  const row = blank(randomUUID(), actor.actorId, now);
  row.enteredVia = "FOUNDER_ENTERED";
  row.authorName = clean.authorName;
  row.displayMode = clean.displayMode;
  row.attributionDetail = clean.attributionDetail;
  row.city = clean.city;
  row.country = clean.country;
  row.helpedWith = clean.helpedWith;
  row.project = clean.project;
  row.experience = clean.originalText;
  row.permissionPublish = clean.permissionPublish;
  await repo.transaction(async (tx) => {
    await tx.insert(row);
    await tx.appendEvent({ id: randomUUID(), testimonialId: row.id, eventType: "FOUNDER_ENTERED", fromStatus: null, toStatus: "DRAFT", actor: actor.actorId, note: "Recorded by the Founder from feedback the client gave directly.", createdAt: now });
  });
  const sent = await move(repo, row, "SENT", actor.actorId, now, (t) => {
    t.sentAt = now;
  });
  return move(repo, sent, "RECEIVED", actor.actorId, now, (t) => {
    t.receivedAt = now;
  });
}

/**
 * Chooses what the site will say: the client's original words, or a paraphrase the Founder wrote and confirmed is faithful. The original
 * is never changed. Allowed only while the testimonial is being reviewed, so approved wording cannot be swapped silently afterwards.
 */
export async function setPublishedWording(
  repo: TestimonialRepository,
  id: string,
  input: { text?: unknown; paraphrased?: unknown; confirmedFaithful?: unknown },
  actor: { actorType: string; actorId?: string | null },
  now: Date = new Date(),
): Promise<Testimonial> {
  requireFounder(actor);
  const row = await load(repo, id);
  if (row.isIllustrative) throw new TestimonialStateError("An illustrative draft has no real wording to publish.");
  if (row.status !== "RECEIVED" && row.status !== "PENDING_APPROVAL") throw new TestimonialStateError("The wording can only be set while the testimonial is being reviewed.");
  if (!row.experience) throw new TestimonialStateError("There is no original text yet.");
  const wording = resolvePublishedWording(row.experience, input);
  const next: Testimonial = { ...row, publishedText: wording.text, isParaphrased: wording.paraphrased, updatedAt: now };
  await repo.transaction(async (tx) => {
    await tx.save(next);
    await tx.appendEvent({
      id: randomUUID(),
      testimonialId: id,
      eventType: "PUBLISHED_WORDING_SET",
      fromStatus: row.status,
      toStatus: row.status,
      actor: actor.actorId,
      note: wording.paraphrased ? "Paraphrase written by the Founder, who confirmed it is faithful to the original." : "Published as the client wrote it.",
      createdAt: now,
    });
  });
  return next;
}
