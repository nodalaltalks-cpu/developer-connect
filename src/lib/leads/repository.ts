import type {
  Booking,
  BookingStatus,
  ContactPreference,
  Lead,
  LeadActivitySummary,
  LeadActorType,
  LeadConsent,
  LeadEvent,
  LeadEventType,
  LeadStatus,
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

export interface BookingRepository {
  create(booking: NewBooking): Promise<Booking>;
  getById(id: string): Promise<Booking | null>;
  update(id: string, patch: BookingPatch, at: Date): Promise<Booking>;
  listByLead(leadId: string): Promise<Booking[]>;
}

export interface LeadRepositories {
  leads: LeadRepository;
  events: LeadEventRepository;
  touches: TouchRepository;
  consents: ConsentRepository;
  bookings: BookingRepository;
  /**
   * Runs `work` atomically: either every write inside it happens or none
   * does. A lead, its consent, its attribution and its events are always
   * written together, never half.
   */
  transaction<T>(work: (repos: LeadRepositories) => Promise<T>): Promise<T>;
}

export type { BookingStatus };
