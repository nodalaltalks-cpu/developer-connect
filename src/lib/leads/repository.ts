import type {
  Booking,
  BookingStatus,
  CallClassification,
  CallDisposition,
  CallMethod,
  CallStatus,
  ContactPreference,
  Lead,
  LeadActivitySummary,
  LeadActorType,
  LeadCall,
  LeadConsent,
  LeadCurrency,
  LeadEvent,
  LeadEventType,
  LeadFollowUp,
  LeadImportBatch,
  LeadRequirement,
  LeadSourceType,
  LeadStatus,
  LeadTemperature,
  MarketingTouch,
  AutomationAction,
  Campaign,
  CampaignStatus,
  MarketingSpend,
  Project,
  ShortlistEntry,
  SiteVisit,
  SiteVisitEvent,
  SiteVisitStatus,
  LeadBucketInsight,
} from "./types.ts";
import type { CleanTouch } from "./attribution.ts";
import type { AcquisitionRow } from "./acquisition.ts";
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

/**
 * The original acquisition record of a lead. It can never be changed after the lead exists: not by an employee, not by the
 * Founder, not by a bug. Enforced here (the type refuses these keys and `assertNoImmutableFields` refuses them at run time
 * for untyped callers) AND in the database (trigger guard_lead_source_mutation, migration 0030).
 */
export const IMMUTABLE_LEAD_FIELDS = ["sourceType", "sourceDetail", "creationMethod", "importBatchId", "createdBy"] as const;

/** The columns a service may change on an existing lead. Identity, creation time and the original source never change. */
export type LeadPatch = Partial<Omit<Lead, "id" | "createdAt" | "updatedAt" | (typeof IMMUTABLE_LEAD_FIELDS)[number]>>;

export function assertNoImmutableFields(patch: object): void {
  for (const field of IMMUTABLE_LEAD_FIELDS) {
    if (field in patch) throw new Error(`The lead's original acquisition source cannot be changed (${field}).`);
  }
  if ("createdAt" in patch || "id" in patch) throw new Error("A lead's identity and creation time cannot be changed.");
}

export interface LeadRepository {
  /**
   * Creates the lead, or returns the existing one with this phone number —
   * atomically, so concurrent submissions of the same number can never
   * produce two leads. The returned row stays locked for the rest of the
   * surrounding transaction, so the caller's read-modify-write is safe.
   */
  upsertByPhone(input: NewLeadInput): Promise<{ lead: Lead; created: boolean }>;
  getById(id: string): Promise<Lead | null>;
  /** The lead with exactly this E.164 number, or null. A read only: it never creates, locks or changes anything. */
  findByPhone(phoneE164: string): Promise<Lead | null>;
  /** Applies `patch` and sets `updatedAt` to `at`. Throws if the lead does not exist. */
  update(id: string, patch: LeadPatch, at: Date): Promise<Lead>;
  /** Leads that could belong on the Founder's Today queue (not erased, not in a closed-out state), newest activity first. */
  /**
   * The candidates for the Today queue: every open lead with a PENDING follow-up (up to `limit`, soonest first) UNION the
   * `limit` most recently active open leads, without duplicates. Recent activity alone is the wrong pool: a lead whose
   * follow-up is overdue, or that has gone quiet, has OLD activity by definition and would be dropped once there are more
   * than `limit` open leads.
   */
  listForQueue(limit: number): Promise<Lead[]>;
  /** One page of the founder's Leads list for a view (see lead-views.ts), plus how many leads match in total. Erased leads are never returned. */
  list(query: LeadListQuery): Promise<{ leads: Lead[]; total: number }>;
  /** Dashboard counts, computed in the database in one bounded query — never by loading every lead. */
  counts(now: Date, endOfToday: Date, sourceType?: LeadSourceType): Promise<LeadCounts>;
  /** For a page of leads: the last call and the interested projects of each, in two batched queries (never one per lead). */
  bucketInsights(leadIds: string[]): Promise<LeadBucketInsight[]>;
  /** Names of the given developers, for display only (one batched lookup, never one per lead). Unknown ids are simply absent. */
  developerNames(ids: string[]): Promise<Record<string, string>>;
  /** Per current owner: live leads at QUALIFIED, SITE_VISIT_SCHEDULED and BOOKED. A snapshot of where their leads stand now, not credit for how they got there. */
  ownerSummary(): Promise<Record<string, { qualified: number; siteVisit: number; booked: number }>>;
  /** Leads a team member returned that are still waiting in the Founder queue (not erased), most recently returned first. */
  listReturned(limit: number): Promise<Lead[]>;
  /** How many live (not erased) leads each owner holds, keyed by owner id. Founder-queue leads (no owner) are not counted. */
  countByOwner(): Promise<Record<string, number>>;
  /**
   * Leads CREATED in [from, to), newest first, as the acquisition report reads them: source, both touches' evidence and
   * how far each got - never a name, phone or email. Bounded by `limit`.
   */
  acquisitionRows(query: { from: Date; to: Date; limit: number }): Promise<AcquisitionRow[]>;
  /**
   * For each forward stage from QUALIFIED to NEGOTIATION: how many live leads EVER reached it (from their history and their
   * current status) and how many of those have a booking. History, not today's snapshot, so a later loss does not erase it.
   */
  stageHistory(): Promise<Array<{ stage: LeadStatus; reached: number; booked: number }>>;
  /** OPEN, owned leads with no activity since `staleBefore`, quietest first. */
  listStale(query: { staleBefore: Date; limit: number }): Promise<Lead[]>;
  /**
   * OPEN, owned, live leads whose buyer (the signed-in user the lead was captured for) viewed a page since `since`, at
   * least `minLeadAgeMs` after the lead was created. One row per lead: the buyer's latest view. Reads analytics_events
   * by user id only - nothing the buyer typed - and only events that were recorded with the visitor's consent.
   */
  listReturnVisits(query: { since: Date; minLeadAgeMs: number; limit: number }): Promise<Array<{ lead: Lead; viewedAt: Date }>>;
  /** OPEN leads nobody owns that were never returned by a team member, oldest first. */
  listUnassignedOpen(limit: number): Promise<Lead[]>;
  /** OPEN leads each owner holds right now (the workload), keyed by owner id. */
  countOpenByOwner(): Promise<Record<string, number>>;
  /** Live (not erased) leads per pipeline status right now. Statuses with no leads are absent. */
  statusCounts(): Promise<Partial<Record<LeadStatus, number>>>;
  /**
   * Exceptions the Founder should look at, counted in the database: OPEN leads (not booked, closed, lost, parked or
   * invalid) that nobody owns - and how many of those have waited longer than `unassignedOlderThan` - and OPEN owned leads
   * with no activity since `staleBefore`.
   */
  exceptionCounts(input: { unassignedOlderThan: Date; staleBefore: Date }): Promise<{ unassignedOpen: number; unassignedOld: number; staleOpen: number }>;
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
  /**
   * What one person did, newest first, one bounded page at a time (pass the last event's time as `before` for the next
   * page). Reads the (actor, time) index - it never loads a person's whole history.
   */
  listByActor(actorId: string, query: { limit: number; before?: Date }): Promise<LeadEvent[]>;
  /** In how many distinct leads this person appears as the actor, and how many distinct leads were ever assigned TO them. */
  actorLeadCounts(actorId: string): Promise<{ leadsActedOn: number; leadsAssignedTo: number }>;
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
  projectId?: string | null;
  currency: Booking["currency"];
  bookingValue: number;
  commissionExpected: number;
  bookedAt: Date;
  createdBy: string;
  now: Date;
}

export type BookingPatch = Partial<
  Pick<Booking, "projectName" | "projectId" | "status" | "bookingValue" | "commissionExpected" | "commissionReceived" | "commissionReceivedAt">
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
  /** How the call is made. Omitted = PROVIDER (a telephony vendor's events). */
  method?: CallMethod;
  /** The calling batch (queue) it is made from, if any. Fixed at creation. */
  batchId?: string | null;
  deviceRef?: string | null;
  now: Date;
}

/** What a call record may change after creation. Only the dialer service writes these — never an employee, never the browser. */
export type CallPatch = Partial<
  Pick<
    LeadCall,
    | "status"
    | "providerCallId"
    | "ringingAt"
    | "answeredAt"
    | "endedAt"
    | "durationSeconds"
    | "endReason"
    | "classification"
    | "startedAt"
    | "deviceRef"
    | "simRef"
    | "callLogRef"
    | "reportedAt"
    | "disposition"
    | "dispositionBy"
    | "dispositionAt"
  >
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
  /** true = classified CONNECTED (more than 10 seconds); false = classified DIALED (10 seconds or less). Unfinished and unplaced calls match neither. */
  connected?: boolean;
  batchId?: string;
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
  batchId?: string;
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

/** A list of existing leads given to one employee to call. See the calling_batches schema comment. */
export interface CallingBatch {
  id: string;
  name: string;
  createdBy: string;
  assignedTo: string;
  importBatchId: string | null;
  status: "ACTIVE" | "CLOSED";
  createdAt: Date;
  /** How many leads it holds. */
  itemCount: number;
}

export interface NewCallingBatch {
  name: string;
  createdBy: string;
  assignedTo: string;
  importBatchId: string | null;
  leadIds: string[];
  now: Date;
}

/** One lead in a batch, with what the call records say about it — derived, never typed in. */
export interface BatchLeadProgress {
  lead: Lead;
  position: number;
  /** Calls that reached the other end (classified DIALED or CONNECTED) from THIS batch. */
  calls: number;
  connectedCalls: number;
  /** Attempts that never placed a call. */
  failedCalls: number;
  lastCallAt: Date | null;
  lastClassification: CallClassification | null;
}

export interface CallingBatchRepository {
  /** Creates the batch and its items (in the given order). The leads are referenced, never copied. */
  create(input: NewCallingBatch): Promise<CallingBatch>;
  getById(id: string): Promise<CallingBatch | null>;
  /** One employee's batches, active first, newest first. */
  listForAssignee(staffUserId: string): Promise<CallingBatch[]>;
  /** Every batch, newest first (Founder). */
  listAll(limit: number): Promise<CallingBatch[]>;
  /** Every item in order with its lead and call-derived progress. */
  progress(batchId: string): Promise<BatchLeadProgress[]>;
  close(id: string): Promise<CallingBatch>;
}

// --- Phase 8: automation ---------------------------------------------------------------------------

export interface NewAutomationClaim {
  rule: string;
  subjectType: string;
  subjectId: string;
  dedupeKey: string;
  now: Date;
}

export interface AutomationActionRepository {
  /**
   * Atomically claims the work named by `dedupeKey`. Returns the claimed action when THIS caller should do the work -
   * a brand-new key, a FAILED one with attempts left, or a PENDING one abandoned longer than `staleAfterMs` - and null
   * when it is already done, skipped, exhausted or in flight elsewhere. Safe under concurrency: one caller wins.
   */
  claim(input: NewAutomationClaim, options: { maxAttempts: number; staleAfterMs: number }): Promise<AutomationAction | null>;
  complete(id: string, status: "DONE" | "SKIPPED", detail: Record<string, unknown>, at: Date): Promise<void>;
  fail(id: string, errorCode: string, at: Date): Promise<void>;
  /** Newest first. */
  listRecent(limit: number): Promise<AutomationAction[]>;
}

export interface AutomationSettingsRepository {
  getAll(): Promise<Record<string, boolean>>;
  set(key: string, enabled: boolean, by: string, at: Date): Promise<void>;
}

// --- Phase 6: marketing spend -------------------------------------------------------------------------

export interface NewMarketingSpend {
  channel: string;
  campaignId: string | null;
  spentOn: string;
  currency: LeadCurrency;
  amount: number;
  note: string | null;
  createdBy: string;
  now: Date;
}

export interface SpendRepository {
  create(input: NewMarketingSpend): Promise<MarketingSpend>;
  getById(id: string): Promise<MarketingSpend | null>;
  /** Sets the void columns once. Throws LeadStateError when already voided. */
  void(id: string, by: string, reason: string, at: Date): Promise<MarketingSpend>;
  /** Entries (voided ones included, flagged) with spent_on in [fromDate, toDate], newest first. */
  list(query: { fromDate: string; toDate: string; limit: number }): Promise<MarketingSpend[]>;
}

// --- Phase 5: campaigns and the acquisition read ------------------------------------------------------

export interface NewCampaign {
  name: string;
  utmCampaign: string;
  utmSource: string | null;
  utmMedium: string | null;
  landingPage: string | null;
  startDate: string | null;
  endDate: string | null;
  status: CampaignStatus;
  createdBy: string;
  now: Date;
}

export type CampaignPatch = Partial<Pick<Campaign, "name" | "utmSource" | "utmMedium" | "landingPage" | "startDate" | "endDate" | "status">>;

export interface CampaignRepository {
  /** Throws LeadStateError when another campaign already uses that tag (case-insensitive). */
  create(input: NewCampaign): Promise<Campaign>;
  getById(id: string): Promise<Campaign | null>;
  update(id: string, patch: CampaignPatch, at: Date): Promise<Campaign>;
  /** Newest first. */
  list(limit: number): Promise<Campaign[]>;
}

// --- Phase 4: projects, shortlist, site visits ------------------------------------------------------

export interface NewProject {
  developerId: string;
  name: string;
  city: string;
  locality: string | null;
  propertyType: string | null;
  configurations: string[];
  priceMin: number | null;
  priceMax: number | null;
  currency: LeadCurrency | null;
  createdBy: string;
  now: Date;
}

export type ProjectPatch = Partial<Pick<Project, "name" | "city" | "locality" | "propertyType" | "configurations" | "priceMin" | "priceMax" | "currency" | "status">>;

export interface ProjectRepository {
  /** Throws LeadStateError when the developer already has a project with that name. */
  create(input: NewProject): Promise<Project>;
  getById(id: string): Promise<Project | null>;
  update(id: string, patch: ProjectPatch, at: Date): Promise<Project>;
  /** Newest first. */
  list(query: { activeOnly: boolean; limit: number }): Promise<Project[]>;
}

export interface NewShortlistEntry {
  leadId: string;
  requirementId: string | null;
  projectId: string;
  shortlistedBy: string;
  now: Date;
}

export interface ShortlistRepository {
  /** Throws LeadStateError when the project is already actively shortlisted for this lead. */
  add(input: NewShortlistEntry): Promise<ShortlistEntry>;
  getById(id: string): Promise<ShortlistEntry | null>;
  /** Every entry for the lead - active and removed - oldest first. */
  listByLead(leadId: string): Promise<ShortlistEntry[]>;
  /** Active shortlist entries per project (how many buyers currently have it shortlisted). */
  countActiveByProject(): Promise<Record<string, number>>;
  /** Sets the removal columns once. Throws LeadStateError if it was already removed. */
  remove(id: string, removedBy: string, at: Date): Promise<ShortlistEntry>;
}

export interface NewSiteVisit {
  leadId: string;
  requirementId: string | null;
  projectId: string | null;
  staffUserId: string;
  scheduledAt: Date;
  notes: string | null;
  rescheduledFrom: string | null;
  createdBy: string;
  now: Date;
}

export type SiteVisitPatch = Partial<Pick<SiteVisit, "status" | "confirmedAt" | "completedAt" | "outcome" | "nextAction" | "notes">>;

export interface SiteVisitQuery {
  /** Only this member's visits. */
  staffUserId?: string;
  statuses?: SiteVisitStatus[];
  /** scheduled_at within [from, to). */
  from?: Date;
  to?: Date;
  limit: number;
}

export interface SiteVisitStats {
  /** Visits created in the range that were NOT reschedules of an earlier visit (a reschedule is not a new visit). */
  scheduled: number;
  /** Visits marked COMPLETED in the range. */
  completed: number;
  /** Visits marked NO_SHOW in the range. */
  noShow: number;
}

export interface SiteVisitRepository {
  /** Throws LeadStateError when the lead already has an open visit for the same project. */
  create(input: NewSiteVisit): Promise<SiteVisit>;
  getById(id: string): Promise<SiteVisit | null>;
  /** Throws LeadStateError when the visit is already finished. */
  update(id: string, patch: SiteVisitPatch, at: Date): Promise<SiteVisit>;
  /** Every visit for the lead, oldest scheduled first. */
  listByLead(leadId: string): Promise<SiteVisit[]>;
  list(query: SiteVisitQuery): Promise<SiteVisit[]>;
  appendEvent(input: Omit<SiteVisitEvent, "id">): Promise<SiteVisitEvent>;
  listEvents(visitId: string): Promise<SiteVisitEvent[]>;
  /** Visits scheduled (not reschedules) in [from, to) per project; visits with no project are not counted. */
  countByProject(from: Date, to: Date): Promise<Record<string, number>>;
  /** Per team member, derived from the visits themselves. */
  statsByStaff(from: Date, to: Date): Promise<Record<string, SiteVisitStats>>;
  /** Erasure: clears the free text (notes, next action) on every visit of the lead; the visits themselves stay as history. */
  eraseForLead(leadId: string): Promise<void>;
}

export interface BookingRepository {
  create(booking: NewBooking): Promise<Booking>;
  getById(id: string): Promise<Booking | null>;
  update(id: string, patch: BookingPatch, at: Date): Promise<Booking>;
  listByLead(leadId: string): Promise<Booking[]>;
  /** Booking value per CURRENT lead owner and currency (never summed across currencies). Founder-queue leads are not included. */
  revenueByOwner(): Promise<Array<{ ownerId: string; currency: string; total: number; count: number }>>;
  /** BOOKED bookings whose commission is not fully received yet, oldest first. Carries no buyer data - only the lead id to open. */
  listOutstanding(limit: number): Promise<Booking[]>;
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
  callingBatches: CallingBatchRepository;
  projects: ProjectRepository;
  shortlist: ShortlistRepository;
  siteVisits: SiteVisitRepository;
  campaigns: CampaignRepository;
  spend: SpendRepository;
  automationActions: AutomationActionRepository;
  automationSettings: AutomationSettingsRepository;
  importBatches: ImportBatchRepository;
  /**
   * Runs `work` atomically: either every write inside it happens or none
   * does. A lead, its consent, its attribution and its events are always
   * written together, never half.
   */
  transaction<T>(work: (repos: LeadRepositories) => Promise<T>): Promise<T>;
}

export type { BookingStatus };
