import type {
  Booking,
  BookingStatus,
  ContactPreference,
  Lead,
  LeadActivitySummary,
  LeadActorType,
  LeadConsent,
  LeadEvent,
  CallDisposition,
  CallStatus,
  LeadCall,
  LeadEventType,
  LeadFollowUp,
  LeadImportBatch,
  LeadSourceType,
  LeadRequirement,
  LeadStatus,
  LeadTemperature,
  MarketingTouch,
} from "./types.ts";
import type { CleanTouch } from "./attribution.ts";
import type { LeadCounts, LeadListQuery } from "./lead-views.ts";

/**
 * Persistence contracts for the lead system. The service layer
 * (lead-service.ts) depends only on these interfaces; db/ holds the
 * PostgreSQL adapter and memory-repository.ts the in-memory one used by unit
 * tests — the same layering the developer-verification and engagement
 * domains already use.
 *
 * IMMUTABILITY IS PART OF THE CONTRACT: there is deliberately no update or
 * delete on events, touches or consents. The only way history changes is
 * `append`/`create`, plus the two narrow, named exceptions
 * (`redactPayloads` for erasure, `withdrawActive` for withdrawing consent).
 */

export interface NewLeadInput {
  phoneE164: string;
  name: string | null;
  email: string | null;
  contactPreference: ContactPreference;
  developerId: string | null;
  sourceCta: string | null;
  sessionId: string | null;
  userId: string | null;
  /** Where it came from. Omitted = a website lead (DIGITAL via the gate), exactly as before. */
  source?: {
    sourceType: LeadSourceType;
    sourceDetail: string | null;
    creationMethod: string;
    importBatchId: string | null;
    createdBy: string | null;
  };
  now: Date;
}

/** The columns a service may change on an existing lead. Identity and creation time never change. */
export type LeadPatch = Partial<Omit<Lead, "id" | "createdAt" | "updatedAt">>;

export interface LeadRepository {
  /**
   * Creates the lead, or returns the existing one with this phone number —
   * atomically, so concurrent submissions of the same number can never
   * produce two leads. The returned row stays locked for the rest of the
   * surrounding transaction, so the caller's read-modify-write is safe.
   */
  upsertByPhone(input: NewLeadInput): Promise<{ lead: Lead; created: boolean }>;
  getById(id: string): Promise<Lead | null>;
  /** Applies `patch` and sets `updatedAt` to `at`. Throws if the lead does not exist. */
  update(id: string, patch: LeadPatch, at: Date): Promise<Lead>;
  /** Leads that could belong on the Founder's Today queue (not erased, not in a closed-out state), newest activity first. */
  listForQueue(limit: number): Promise<Lead[]>;
  /** One page of the founder's Leads list for a view (see lead-views.ts), plus how many leads match in total. Erased leads are never returned. */
  list(query: LeadListQuery): Promise<{ leads: Lead[]; total: number }>;
  /** Dashboard counts, computed in the database in one bounded query — never by loading every lead. */
  counts(now: Date, endOfToday: Date): Promise<LeadCounts>;
  /** Names of the given developers, for display only (one batched lookup, never one per lead). Unknown ids are simply absent. */
  developerNames(ids: string[]): Promise<Record<string, string>>;
  /** Per current owner: live leads at QUALIFIED, SITE_VISIT_SCHEDULED and BOOKED. A snapshot of where their leads stand now, not credit for how they got there. */
  ownerSummary(): Promise<Record<string, { qualified: number; siteVisit: number; booked: number }>>;
  /** Leads a team member returned that are still waiting in the Founder queue (not erased), most recently returned first. */
  listReturned(limit: number): Promise<Lead[]>;
  /** How many live (not erased) leads each owner holds, keyed by owner id. Founder-queue leads (no owner) are not counted. */
  countByOwner(): Promise<Record<string, number>>;
}

export interface NewLeadEvent {
  leadId: string;
  eventType: LeadEventType;
  actorType: LeadActorType;
  actorId: string | null;
  developerId: string | null;
  fromStatus: LeadStatus | null;
  toStatus: LeadStatus | null;
  payload: Record<string, unknown>;
  createdAt: Date;
}

export interface LeadEventRepository {
  append(event: NewLeadEvent): Promise<LeadEvent>;
  /** Oldest first. */
  listByLead(leadId: string): Promise<LeadEvent[]>;
  /** Contact and buyer-activity facts for the Today queue, one summary per requested lead. */
  summarise(leadIds: string[]): Promise<LeadActivitySummary[]>;
  /**
   * The erasure exception: rewrites ONLY the payload of this lead's events,
   * through `redact`, and never touches any other column. Returns how many
   * events changed. Must run inside a transaction (the database refuses the
   * rewrite otherwise).
   */
  redactPayloads(leadId: string, redact: (event: LeadEvent) => Record<string, unknown>): Promise<number>;
  /** How many events of `eventType` each actor (Clerk id) caused in [from, to). */
  countByTypeAndActor(eventType: LeadEventType, from: Date, to: Date): Promise<Record<string, number>>;
}

export type NewTouch = CleanTouch & { id?: string };

export interface TouchRepository {
  create(touch: NewTouch, fallbackOccurredAt: Date): Promise<MarketingTouch>;
  getById(id: string): Promise<MarketingTouch | null>;
  /** How many touches this browser session has recorded since `since` — the basis of the gate's rate limit (one touch is written per submission). */
  countBySessionSince(sessionId: string, since: Date): Promise<number>;
}

export interface NewConsent {
  leadId: string;
  purpose: string;
  channel: ContactPreference;
  textVersion: string;
  textShown: string;
  givenAt: Date;
}

export interface ConsentRepository {
  create(consent: NewConsent): Promise<LeadConsent>;
  listByLead(leadId: string): Promise<LeadConsent[]>;
  /** Records a withdrawal on every not-yet-withdrawn consent of this lead; returns those consents. */
  withdrawActive(leadId: string, at: Date): Promise<LeadConsent[]>;
}

export interface NewBooking {
  leadId: string;
  developerId: string | null;
  projectName: string | null;
  currency: Booking["currency"];
  bookingValue: number;
  commissionExpected: number;
  bookedAt: Date;
  createdBy: string;
  now: Date;
}

export type BookingPatch = Partial<
  Pick<Booking, "projectName" | "status" | "bookingValue" | "commissionExpected" | "commissionReceived" | "commissionReceivedAt">
>;

/** A preferred location as stored: the text as written plus its normalised matching key (see requirement-locations.ts). */
export interface RequirementLocation {
  name: string;
  key: string;
}

export interface NewRequirement {
  leadId: string;
  locations: RequirementLocation[];
  propertyType: string | null;
  configuration: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  budgetCurrency: LeadRequirement["budgetCurrency"];
  purpose: LeadRequirement["purpose"];
  timeline: LeadRequirement["timeline"];
  notes: string | null;
  createdBy: string;
  now: Date;
}

/** The columns a service may change on an existing requirement. Identity (id, leadId, createdBy, createdAt) never changes. */
export type RequirementPatch = Partial<
  Pick<LeadRequirement, "status" | "propertyType" | "configuration" | "budgetMin" | "budgetMax" | "budgetCurrency" | "purpose" | "timeline" | "notes">
> & { updatedBy: string };

/**
 * Requirements are never deleted: a lead keeps its whole requirement history. The one narrow exception is
 * `eraseForLead`, which clears the free text and the locations of a lead whose personal data is being erased.
 */
export interface RequirementRepository {
  /** Creates an ACTIVE requirement with its locations. Throws LeadStateError if the lead already has an active one (the database also enforces it). */
  create(input: NewRequirement): Promise<LeadRequirement>;
  getById(id: string): Promise<LeadRequirement | null>;
  getActiveByLead(leadId: string): Promise<LeadRequirement | null>;
  /** The lead's whole requirement history, newest first. */
  listByLead(leadId: string): Promise<LeadRequirement[]>;
  /** Applies `patch` (and replaces the locations when `locations` is given), sets `updatedAt` to `at`. Throws if there is no such requirement. */
  update(id: string, patch: RequirementPatch, at: Date, locations?: RequirementLocation[]): Promise<LeadRequirement>;
  /** Erasure support: clears notes and removes locations on every requirement of the lead. History rows themselves stay. */
  eraseForLead(leadId: string): Promise<void>;
}

export interface NewFollowUp {
  leadId: string;
  type: LeadFollowUp["type"];
  scheduledAt: Date;
  ownerId: string | null;
  note: string | null;
  createdBy: string;
  now: Date;
}

/** The columns a service may change on an existing follow-up. Identity (id, leadId, createdBy, createdAt, originalScheduledAt) never changes. */
export type FollowUpPatch = Partial<
  Pick<
    LeadFollowUp,
    | "type"
    | "status"
    | "scheduledAt"
    | "ownerId"
    | "note"
    | "completedAt"
    | "completedBy"
    | "cancelledAt"
    | "cancelledBy"
    | "cancelReason"
    | "cancelNote"
    | "missedCount"
    | "lastMissedAt"
    | "rescheduleCount"
    | "dueNotifiedAt"
  >
>;

/** Which follow-ups a sweep or claim looks at. Undefined = no restriction on that field. */
export interface FollowUpScope {
  ownerId?: string;
  leadId?: string;
}

export interface MissedFollowUpQuery extends FollowUpScope {
  temperature?: LeadTemperature;
  status?: LeadStatus;
  scheduledFrom?: Date;
  scheduledTo?: Date;
  /** Only follow-ups overdue by at least this long. */
  overdueForAtLeastMs?: number;
  now: Date;
  limit: number;
}

export interface FollowUpWithLead {
  followUp: LeadFollowUp;
  lead: Lead;
}

/**
 * Follow-ups are never deleted. `markMissed` and `claimDueNotifications` are atomic claims: only the caller whose
 * statement actually changes a row gets it back, so a missed event or a notification is produced exactly once even
 * when several requests race.
 */
export interface FollowUpRepository {
  /** Creates a SCHEDULED follow-up. Throws LeadStateError if the lead already has an open one (the database also enforces it). */
  create(input: NewFollowUp): Promise<LeadFollowUp>;
  getById(id: string): Promise<LeadFollowUp | null>;
  /** The lead's open follow-up (SCHEDULED or MISSED), if any. */
  getOpenByLead(leadId: string): Promise<LeadFollowUp | null>;
  /** The lead's whole follow-up history, newest first. */
  listByLead(leadId: string): Promise<LeadFollowUp[]>;
  update(id: string, patch: FollowUpPatch, at: Date): Promise<LeadFollowUp>;
  /** SCHEDULED follow-ups whose time has passed become MISSED (count + time recorded). Erased leads are skipped. Returns exactly the rows it changed. */
  markMissed(scope: FollowUpScope, now: Date): Promise<LeadFollowUp[]>;
  /** Unresolved misses: status MISSED, or still SCHEDULED with a time in the past (so a missed follow-up is never hidden by a sweep that has not run). Oldest first. */
  listUnresolvedMissed(query: MissedFollowUpQuery): Promise<FollowUpWithLead[]>;
  /** SCHEDULED follow-ups with a time in [from, to), soonest first. */
  listScheduled(query: FollowUpScope & { from: Date; to: Date; limit: number }): Promise<FollowUpWithLead[]>;
  /** Marks "due soon" as notified for SCHEDULED follow-ups due by `upTo` that have an owner; returns exactly the rows it changed. */
  claimDueNotifications(scope: FollowUpScope, upTo: Date, now: Date): Promise<LeadFollowUp[]>;
  /** Erasure support: clears the free text (note, cancel note) on every follow-up of the lead. Rows stay as history. */
  eraseForLead(leadId: string): Promise<void>;
  /** Per team member (Clerk id; the Founder included): follow-ups created and completed in [from, to), and how many of their own are missed right now. */
  statsByStaff(from: Date, to: Date, now: Date): Promise<Record<string, { created: number; completed: number; missedNow: number }>>;
}

export interface NewCall {
  leadId: string;
  staffUserId: string;
  provider: string;
  phoneLast4: string | null;
  now: Date;
}

/** What a call record may change after creation. Only the dialer service writes these — never an employee, never the browser. */
export type CallPatch = Partial<
  Pick<LeadCall, "status" | "providerCallId" | "ringingAt" | "answeredAt" | "endedAt" | "durationSeconds" | "endReason" | "disposition" | "dispositionBy" | "dispositionAt">
>;

export interface NewCallEvent {
  callId: string;
  provider: string;
  providerEventId: string;
  eventType: string;
  status: CallStatus | null;
  occurredAt: Date;
  receivedAt: Date;
  payload: Record<string, unknown>;
}

export interface StoredCallEvent extends NewCallEvent {
  id: string;
}

export interface CallFilter {
  staffUserId?: string;
  leadId?: string;
  from?: Date;
  to?: Date;
  /** Only calls the provider reported answered (CONNECTED or COMPLETED). */
  connected?: boolean;
  statuses?: CallStatus[];
  disposition?: CallDisposition;
  sourceType?: LeadSourceType;
  limit: number;
}

export interface CallWithLead {
  call: LeadCall;
  lead: Pick<Lead, "id" | "name" | "sourceType" | "creationMethod" | "erasedAt">;
}

/** How a set of calls is grouped. Hours, days and the larger periods are ALL the same aggregation with a different bucket. */
export type CallGroupBy = "HOUR_OF_DAY" | "HOUR" | "DAY" | "WEEK" | "MONTH" | "QUARTER" | "YEAR" | "EMPLOYEE";

export interface CallAggregateQuery {
  from: Date;
  to: Date;
  groupBy: CallGroupBy;
  /** The business time zone buckets are cut in. */
  timeZone: string;
  staffUserId?: string;
  sourceType?: LeadSourceType;
  statuses?: CallStatus[];
  connected?: boolean;
  disposition?: CallDisposition;
}

export interface CallAggregateRow {
  /** The bucket: "09" for an hour of day, "2026-10-12" for a day, the employee's Clerk id for EMPLOYEE grouping, etc. */
  key: string;
  dialed: number;
  connected: number;
  noAnswer: number;
  busy: number;
  failed: number;
  rejected: number;
  /** Total seconds of answered calls. */
  talkSeconds: number;
  /** Distinct leads that were called. */
  leadsCalled: number;
}

/**
 * Calls are never deleted and the database refuses to rewrite what the provider reported (migration 0021).
 * `appendEvent` is the idempotency point: the same provider event delivered twice is stored once and reported as a duplicate.
 */
export interface CallRepository {
  create(input: NewCall): Promise<LeadCall>;
  getById(id: string): Promise<LeadCall | null>;
  getByProviderCallId(provider: string, providerCallId: string): Promise<LeadCall | null>;
  update(id: string, patch: CallPatch, at: Date): Promise<LeadCall>;
  appendEvent(event: NewCallEvent): Promise<{ event: StoredCallEvent; duplicate: boolean }>;
  listEvents(callId: string): Promise<StoredCallEvent[]>;
  /** Newest first. */
  listByLead(leadId: string): Promise<LeadCall[]>;
  /** Newest first, with the lead's name and source for display and filtering. */
  listRecent(filter: CallFilter): Promise<CallWithLead[]>;
  aggregate(query: CallAggregateQuery): Promise<CallAggregateRow[]>;
}

export interface NewImportBatch {
  name: string;
  originalFilename: string | null;
  campaign: string | null;
  importedBy: string;
  importedAt: Date;
}

export interface ImportBatchRepository {
  create(input: NewImportBatch): Promise<LeadImportBatch>;
  /** Writes the final counts once the rows have been processed. */
  finish(id: string, counts: { rowCount: number; createdCount: number; duplicateCount: number; rejectedCount: number }): Promise<LeadImportBatch>;
  list(limit: number): Promise<LeadImportBatch[]>;
  getById(id: string): Promise<LeadImportBatch | null>;
}

export interface BookingRepository {
  create(booking: NewBooking): Promise<Booking>;
  getById(id: string): Promise<Booking | null>;
  update(id: string, patch: BookingPatch, at: Date): Promise<Booking>;
  listByLead(leadId: string): Promise<Booking[]>;
  /** Booking value per CURRENT lead owner and currency (never summed across currencies). Founder-queue leads are not included. */
  revenueByOwner(): Promise<Array<{ ownerId: string; currency: string; total: number; count: number }>>;
}

export interface LeadRepositories {
  leads: LeadRepository;
  events: LeadEventRepository;
  touches: TouchRepository;
  consents: ConsentRepository;
  bookings: BookingRepository;
  requirements: RequirementRepository;
  followUps: FollowUpRepository;
  calls: CallRepository;
  importBatches: ImportBatchRepository;
  /**
   * Runs `work` atomically: either every write inside it happens or none
   * does. A lead, its consent, its attribution and its events are always
   * written together, never half.
   */
  transaction<T>(work: (repos: LeadRepositories) => Promise<T>): Promise<T>;
}

export type { BookingStatus };
