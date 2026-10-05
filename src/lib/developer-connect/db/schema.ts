import { sql } from "drizzle-orm";
import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  real,
  uuid,
  uniqueIndex,
  index,
  jsonb,
  boolean,
  bigint,
  check,
} from "drizzle-orm/pg-core";

/**
 * Drizzle schema for Developer Connect's developer directory and
 * official-website verification pipeline. This mirrors the domain types
 * in `../types.ts`, but is the one place database-specific integrity
 * rules live — constraints here hold even if application code has a bug,
 * per the Phase 2B.1 requirement not to rely on TypeScript alone for
 * critical invariants.
 */

export const developerStatusEnum = pgEnum("developer_status", ["ACTIVE", "INACTIVE"]);

export const verificationStatusEnum = pgEnum("verification_status", [
  "DISCOVERED",
  "PENDING_VERIFICATION",
  "VERIFIED",
  "REJECTED",
  "NEEDS_REVERIFICATION",
  "INACTIVE",
]);

export const discoverySourceEnum = pgEnum("discovery_source", [
  "MANUAL_SUBMISSION",
  "SEARCH_ENGINE",
  "REGULATORY_FILING",
  "AGENT_CRAWL",
  "OTHER",
]);

export const evidenceTypeEnum = pgEnum("evidence_type", [
  "BRANDING_MATCH",
  "CORPORATE_IDENTITY_MATCH",
  "LEGAL_NAME_MATCH",
  "OFFICIAL_SOCIAL_BACKLINK",
  "REGULATORY_FILING_REFERENCE",
  "DOMAIN_OWNERSHIP_SIGNAL",
  "SSL_DOMAIN_CONSISTENCY",
  "OFFICIAL_CONTACT_INFO",
  "MANUAL_CONFIRMATION",
  "OTHER",
]);

export const actorTypeEnum = pgEnum("actor_type", ["FOUNDER", "SYSTEM", "AGENT"]);

export const developerEditEventTypeEnum = pgEnum("developer_edit_event_type", [
  "FIELD_CHANGE",
  "REPUBLISHED",
  "DISCARDED",
]);

export const analyticsEventNameEnum = pgEnum("analytics_event_name", [
  "search_performed",
  "zero_result_search",
  "search_result_clicked",
  "developer_page_viewed",
  "official_website_clicked",
  "profile_started",
  "profile_field_completed",
  "profile_updated",
  "profile_completion_reached",
  "developer_shared",
  // Property-assistance funnel (Revenue OS Phase 1). Anonymous, session-scoped,
  // and never carries a phone, email or any lead data — see leads/lead_events
  // for the private side of the same journey.
  "assistance_gate_shown",
  "assistance_form_started",
  "lead_submitted",
  "official_website_redirected",
]);

export const developers = pgTable(
  "developers",
  {
    id: uuid("id").primaryKey(),
    // Nullable: a newly discovered developer's registered legal entity is
    // often unknown — store NULL rather than inventing one.
    legalName: text("legal_name"),
    displayName: text("display_name").notNull(),
    slug: text("slug").notNull(),
    // Geography is data, not schema: Mumbai is a row value, never a column assumption.
    city: text("city").notNull(),
    state: text("state").notNull(),
    country: text("country").notNull(),
    headquartersLocation: text("headquarters_location"),
    status: developerStatusEnum("status").notNull().default("ACTIVE"),
    /**
     * Founder-saved metadata edits (display/legal name, city, state,
     * country, headquarters) not yet republished — a partial patch of
     * only the fields that differ from the published columns above.
     * Null means "nothing pending", which is exactly what every existing
     * developer already has (no backfill needed). The published columns
     * above are the ONLY thing public pages ever read — Save writes here
     * instead of there for an already-published developer, so there is
     * no window where public data is half old/half new. Only
     * publishPendingChanges() (an atomic single-statement UPDATE, see
     * postgres-repository.ts) ever copies this onto the published
     * columns, and only Republish calls it.
     */
    pendingChanges: jsonb("pending_changes").$type<Record<string, string>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("developers_slug_key").on(table.slug),
    index("developers_city_idx").on(table.city),
  ],
);

export const websiteCandidates = pgTable(
  "website_candidates",
  {
    id: uuid("id").primaryKey(),
    developerId: uuid("developer_id")
      .notNull()
      .references(() => developers.id, { onDelete: "restrict" }),
    // Original submitted/discovered URL, kept intact (path and query preserved).
    url: text("url").notNull(),
    canonicalDomain: text("canonical_domain").notNull(),
    discoverySource: discoverySourceEnum("discovery_source").notNull(),
    verificationStatus: verificationStatusEnum("verification_status").notNull().default("DISCOVERED"),
    // A triage signal only — the schema does not let this field drive VERIFIED; only reviewedBy/reviewedAt do.
    confidenceScore: real("confidence_score").notNull().default(0),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("website_candidates_developer_idx").on(table.developerId),
    index("website_candidates_domain_idx").on(table.developerId, table.canonicalDomain),
    // The critical, database-enforced invariant: at most one VERIFIED candidate per developer.
    // A TypeScript bug in verification-service.ts cannot violate this — the database rejects it.
    uniqueIndex("website_candidates_one_verified_per_developer")
      .on(table.developerId)
      .where(sql`${table.verificationStatus} = 'VERIFIED'`),
  ],
);

export const evidence = pgTable(
  "evidence",
  {
    id: uuid("id").primaryKey(),
    websiteCandidateId: uuid("website_candidate_id")
      .notNull()
      .references(() => websiteCandidates.id, { onDelete: "restrict" }),
    evidenceType: evidenceTypeEnum("evidence_type").notNull(),
    detail: text("detail").notNull(),
    sourceUrl: text("source_url"),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("evidence_candidate_idx").on(table.websiteCandidateId)],
);

/**
 * Append-only by construction: no repository method updates or deletes a
 * row here, and a database trigger (see migrations) additionally rejects
 * any UPDATE/DELETE at the SQL level regardless of caller.
 */
export const verificationEvents = pgTable(
  "verification_events",
  {
    id: uuid("id").primaryKey(),
    websiteCandidateId: uuid("website_candidate_id")
      .notNull()
      .references(() => websiteCandidates.id, { onDelete: "restrict" }),
    previousStatus: verificationStatusEnum("previous_status"),
    newStatus: verificationStatusEnum("new_status").notNull(),
    reason: text("reason").notNull(),
    actorType: actorTypeEnum("actor_type").notNull(),
    actorId: text("actor_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("verification_events_candidate_idx").on(table.websiteCandidateId)],
);

/**
 * Append-only audit trail covering BOTH kinds of change to a Developer's
 * own editable metadata: an individual FIELD_CHANGE (recorded the moment
 * Save is clicked, whether or not the developer is currently published),
 * and the REPUBLISHED/DISCARDED events that act on the whole pending
 * patch at once (see developers.pendingChanges). One unified table
 * rather than two, per the explicit instruction to reuse the existing
 * history model instead of duplicating audit systems — the admin detail
 * page already renders this merged with verification_events in one
 * chronological list. Deliberately still separate from
 * verification_events itself, which is specifically about a
 * WebsiteCandidate's verification-status lifecycle and would be
 * distorted by forcing unrelated metadata edits into it. Same
 * append-only guarantee: no repository method updates or deletes a row
 * here, and a database trigger (see migrations) additionally rejects any
 * UPDATE/DELETE at the SQL level.
 */
export const developerEditEvents = pgTable(
  "developer_edit_events",
  {
    id: uuid("id").primaryKey(),
    developerId: uuid("developer_id")
      .notNull()
      .references(() => developers.id, { onDelete: "restrict" }),
    eventType: developerEditEventTypeEnum("event_type").notNull().default("FIELD_CHANGE"),
    // Null for REPUBLISHED/DISCARDED, which act on the whole pending
    // patch rather than a single field.
    fieldName: text("field_name"),
    previousValue: text("previous_value"),
    newValue: text("new_value"),
    actorType: actorTypeEnum("actor_type").notNull(),
    actorId: text("actor_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("developer_edit_events_developer_idx").on(table.developerId)],
);

/**
 * Real product-analytics events (Phase 2A's event taxonomy), not a
 * dashboard and not fabricated data. Analytics writes are best-effort —
 * see events.ts's `safeRecordAnalyticsEvent` — so a failure here must
 * never be able to break the primary user action.
 */
export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: uuid("id").primaryKey(),
    eventName: analyticsEventNameEnum("event_name").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    sessionId: text("session_id").notNull(),
    anonymousUserId: text("anonymous_user_id"),
    // The authenticated user (Clerk user id) at the moment this event was
    // recorded, when the request happened to be signed in. Never
    // retroactively backfilled onto earlier anonymous events — see
    // profile-service.ts / auth.ts for how this is populated.
    userId: text("user_id"),
    // Deliberately no foreign key: analytics must never be blocked by, or
    // block, changes to developer data.
    developerId: uuid("developer_id"),
    // Event-specific fields (query, resultCount, position, targetDomain,
    // referrerQuery, deviceType) — see AnalyticsEvent in events.ts.
    payload: jsonb("payload").notNull().default({}),
  },
  (table) => [
    index("analytics_events_name_time_idx").on(table.eventName, table.occurredAt),
    index("analytics_events_developer_idx").on(table.developerId),
    index("analytics_events_user_idx").on(table.userId),
  ],
);

/**
 * A user's profile shell. Deliberately field-agnostic: `data` holds
 * whatever profile fields the product has actually defined via
 * `PROFILE_FIELD_CONFIG` (see src/lib/profile/field-config.ts) — currently
 * empty, because no historical profile field list could be verified
 * anywhere in this repository (see Phase 2D report). This table is real
 * infrastructure, not a placeholder: it is ready to hold real fields the
 * moment product defines them, without a schema migration per field.
 *
 * `userId` is a Clerk user id, not a foreign key into a users table this
 * project doesn't own — Clerk is the identity provider and source of
 * truth for the account itself.
 */
export const profiles = pgTable("profiles", {
  userId: text("user_id").primaryKey(),
  data: jsonb("data").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notificationTypeEnum = pgEnum("notification_type", [
  "PROFILE_COMPLETION",
  "FOUNDER_MESSAGE",
  "CONTACT_STATUS_UPDATE",
  "LEAD_NEW",
]);

export const inaccuracyReportCategoryEnum = pgEnum("inaccuracy_report_category", [
  "OFFICIAL_WEBSITE",
  "DEVELOPER_NAME",
  "HEADQUARTERS",
  "OTHER",
]);

export const inaccuracyReportStatusEnum = pgEnum("inaccuracy_report_status", [
  "NEW",
  "IN_REVIEW",
  "RESOLVED",
  "DISMISSED",
]);

export const contactReasonEnum = pgEnum("contact_reason", [
  "GENERAL_QUESTION",
  "REPORT_INACCURATE_INFO",
  "DEVELOPER_LISTING",
  "PARTNERSHIP",
  "OTHER",
]);

/**
 * Replaces the original ["NEW","READ","RESPONDED","CLOSED"] set with a
 * proper Founder case-management lifecycle. This is a genuine vocabulary
 * change, not a duplicate status system: the old set couldn't represent
 * "actively being looked at but not yet acted on" separately from "paused,
 * waiting on something", nor "resolved" separately from "rejected" — both
 * of which the Founder workflow needs. See migration 0011 for how
 * existing rows are carried forward (NEW->OPEN, READ->IN_REVIEW,
 * RESPONDED/CLOSED->RESOLVED) rather than silently reinterpreted.
 */
export const contactStatusEnum = pgEnum("contact_status", [
  "OPEN",
  "IN_REVIEW",
  "ON_HOLD",
  "RESOLVED",
  "REJECTED",
]);

export const contactHistoryEventTypeEnum = pgEnum("contact_history_event_type", [
  "STATUS_CHANGE",
  "TRASHED",
  "RESTORED",
  "PERMANENT_DELETE",
]);

export const newsletterStatusEnum = pgEnum("newsletter_status", ["SUBSCRIBED", "UNSUBSCRIBED"]);

/**
 * In-house notifications (Phase 3B) — deliberately minimal: a title/body
 * the app itself generates (see notifications/profile-completion-notifier.ts),
 * never third-party push/email content. `userId` is a Clerk user id, same
 * convention as `profiles.userId` — not a foreign key into a users table
 * this project doesn't own.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id").notNull(),
    type: notificationTypeEnum("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    targetRoute: text("target_route"),
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (table) => [
    index("notifications_user_created_idx").on(table.userId, table.createdAt),
    index("notifications_user_unread_idx").on(table.userId, table.read),
  ],
);

/**
 * A visitor flagging something wrong on a public developer page (Part 24
 * of the brand/UX task) — deliberately minimal public surface: developer
 * + category + free-text detail + optional email. `reporterEmail` is
 * never required (the public form makes it optional), so it is nullable
 * here too rather than defaulted to an empty string.
 */
export const inaccuracyReports = pgTable(
  "inaccuracy_reports",
  {
    id: uuid("id").primaryKey(),
    developerId: uuid("developer_id")
      .notNull()
      .references(() => developers.id, { onDelete: "restrict" }),
    category: inaccuracyReportCategoryEnum("category").notNull(),
    details: text("details").notNull(),
    reporterEmail: text("reporter_email"),
    status: inaccuracyReportStatusEnum("status").notNull().default("NEW"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("inaccuracy_reports_developer_idx").on(table.developerId),
    index("inaccuracy_reports_status_created_idx").on(table.status, table.createdAt),
  ],
);

/** The Contact Us page's own submissions — separate from inaccuracyReports, which are always tied to one developer; a contact message may not be. */
export const contactSubmissions = pgTable(
  "contact_submissions",
  {
    id: uuid("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    reason: contactReasonEnum("reason").notNull(),
    message: text("message").notNull(),
    // The signed-in Clerk user id at submission time, when the visitor
    // happened to be signed in — same convention as profiles.userId /
    // notifications.userId. Never required: most Contact Us visitors are
    // anonymous.
    userId: text("user_id"),
    status: contactStatusEnum("status").notNull().default("OPEN"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // Soft-delete (Trash): a non-null deletedAt is the ONLY thing that
    // removes a submission from the active /admin/contact list — the row
    // itself is never gone until an explicit, separately-confirmed
    // permanent delete. deletedBy is the Founder's Clerk user id, same
    // convention as actorId elsewhere.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: text("deleted_by"),
  },
  (table) => [
    index("contact_submissions_status_created_idx").on(table.status, table.createdAt),
    index("contact_submissions_deleted_idx").on(table.deletedAt),
  ],
);

/**
 * Append-only Founder case-management history for one contact submission:
 * every status change, plus the trash/restore/permanent-delete lifecycle
 * events (Parts 7/11/18 of the task this implements) — one unified table
 * rather than several, mirroring developer_edit_events' own "one table for
 * every kind of change to this record" precedent instead of duplicating
 * the audit pattern per event kind.
 *
 * `contactSubmissionId` is deliberately NOT a foreign key: a
 * PERMANENT_DELETE event must be recorded and survive AFTER the
 * submission row itself is destroyed, so a `references()` with either
 * `restrict` (blocks the delete) or `cascade` (destroys the very audit
 * trail meant to survive it) would both be wrong here — same reasoning
 * as analyticsEvents.developerId being unconstrained.
 */
export const contactStatusHistory = pgTable(
  "contact_status_history",
  {
    id: uuid("id").primaryKey(),
    contactSubmissionId: uuid("contact_submission_id").notNull(),
    eventType: contactHistoryEventTypeEnum("event_type").notNull().default("STATUS_CHANGE"),
    // Null for TRASHED/RESTORED/PERMANENT_DELETE, which aren't status
    // transitions themselves.
    previousStatus: contactStatusEnum("previous_status"),
    newStatus: contactStatusEnum("new_status"),
    /** Optional Founder-entered internal note (e.g. a rejection/on-hold reason) — never sent to the requester verbatim. */
    note: text("note"),
    actorType: actorTypeEnum("actor_type").notNull(),
    actorId: text("actor_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("contact_status_history_submission_idx").on(table.contactSubmissionId)],
);

/**
 * Newsletter subscribers (Part 28). `email` is the natural key — a
 * second signup with the same address is an update (re-subscribe), never
 * a duplicate row, so the founder's subscriber count is always a real
 * distinct-person count.
 */
export const newsletterSubscribers = pgTable(
  "newsletter_subscribers",
  {
    id: uuid("id").primaryKey(),
    email: text("email").notNull(),
    status: newsletterStatusEnum("status").notNull().default("SUBSCRIBED"),
    /** Where the signup happened, e.g. "footer" or "homepage" — omitted (null) rather than guessed when genuinely unknown. */
    source: text("source"),
    userId: text("user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("newsletter_subscribers_email_key").on(table.email)],
);

// ============================================================================
// Revenue Operating System — Phase 1 (property-assistance leads).
//
// Everything below is PRIVATE data: nothing here is ever read by a public
// page, and no column here is ever copied into analytics_events or logs.
// The developer-verification tables above are not referenced by anything
// below except a plain foreign key from leads/bookings to developers.id.
// ============================================================================

export const leadStatusEnum = pgEnum("lead_status", [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "SHORTLISTED",
  "SITE_VISIT_SCHEDULED",
  "SITE_VISIT_DONE",
  "NEGOTIATION",
  "BOOKED",
  "CLOSED",
  // Secondary outcomes.
  "NOT_INTERESTED",
  "UNQUALIFIED",
  "WRONG_NUMBER",
  "DUPLICATE",
  "LOST",
  "REVISIT_LATER",
]);

export const contactPreferenceEnum = pgEnum("contact_preference", ["WHATSAPP", "PHONE_CALL", "EMAIL"]);

export const leadTimelineEnum = pgEnum("lead_timeline", [
  "WITHIN_30_DAYS",
  "ONE_TO_THREE_MONTHS",
  "THREE_TO_SIX_MONTHS",
  "SIX_MONTHS_PLUS",
  "JUST_EXPLORING",
]);

export const leadPurposeEnum = pgEnum("lead_purpose", ["SELF_USE", "INVESTMENT"]);

/** Budgets and booking values are whole units of one currency; totals are never summed across currencies. */
export const leadCurrencyEnum = pgEnum("lead_currency", ["INR", "AED"]);

export const leadEventTypeEnum = pgEnum("lead_event_type", [
  "LEAD_CREATED",
  "LEAD_CAPTURED",
  "CONSENT_GIVEN",
  "CONSENT_WITHDRAWN",
  "CONTACT_PREFERENCE_SELECTED",
  "OFFICIAL_WEBSITE_CLICKED",
  "DEVELOPER_WEBSITE_REDIRECTED",
  "REQUIREMENT_UPDATED",
  "STATUS_CHANGED",
  "NOTE_ADDED",
  "CONTACT_LOGGED",
  "FOLLOW_UP_SET",
  "BOOKING_CREATED",
  "BOOKING_UPDATED",
  "LEAD_ERASED",
  // Stage 4 (migration 0016).
  "TEMPERATURE_CHANGED",
  "OWNER_CHANGED",
  "FOLLOW_UP_COMPLETED",
]);

/** How warm the buyer is. A separate concept from pipeline status; null on the lead = not yet rated. */
export const leadTemperatureEnum = pgEnum("lead_temperature", ["HOT", "WARM", "COLD"]);

/** Who performed a lead action. Separate from actor_type: a BUYER is not a founder/agent, and STAFF arrives in a later phase. */
export const leadActorTypeEnum = pgEnum("lead_actor_type", ["BUYER", "FOUNDER", "SYSTEM"]);

export const bookingStatusEnum = pgEnum("booking_status", ["BOOKED", "CANCELLED"]);

/**
 * One row per way a visitor arrived. Immutable (trigger in migration 0014):
 * first-touch and latest-touch attribution are POINTERS to rows here, so
 * neither can ever be overwritten. Deliberately holds no user id, no
 * phone/email, and only the origin+path of a referrer (a full referrer URL
 * can itself contain personal data).
 */
export const marketingTouches = pgTable(
  "marketing_touches",
  {
    id: uuid("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    landingPath: text("landing_path"),
    referrer: text("referrer"),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    utmContent: text("utm_content"),
    utmTerm: text("utm_term"),
    gclid: text("gclid"),
    fbclid: text("fbclid"),
  },
  (table) => [
    index("marketing_touches_session_idx").on(table.sessionId),
    index("marketing_touches_occurred_idx").on(table.occurredAt),
  ],
);

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey(),
    name: text("name"),
    // E.164. Nullable ONLY after erasure (see the check below); the partial
    // unique index makes the phone number the duplicate-detection key.
    phoneE164: text("phone_e164"),
    email: text("email"),
    contactPreference: contactPreferenceEnum("contact_preference").notNull().default("WHATSAPP"),
    status: leadStatusEnum("status").notNull().default("NEW"),
    temperature: leadTemperatureEnum("temperature"),
    // Null = unassigned = the Founder's own queue (Phase 1 is founder-only).
    ownerId: text("owner_id"),
    // The developer the buyer was first researching; any later developers
    // they click live in lead_events.developer_id, never overwriting this.
    developerId: uuid("developer_id").references(() => developers.id, { onDelete: "restrict" }),
    // Which public surface generated the lead (developer page, directory card, ...).
    sourceCta: text("source_cta"),
    location: text("location"),
    budgetMin: bigint("budget_min", { mode: "number" }),
    budgetMax: bigint("budget_max", { mode: "number" }),
    budgetCurrency: leadCurrencyEnum("budget_currency"),
    configuration: text("configuration"),
    propertyType: text("property_type"),
    purpose: leadPurposeEnum("purpose"),
    timeline: leadTimelineEnum("timeline"),
    sessionId: text("session_id"),
    // The signed-in Clerk user id when the buyer happened to be signed in.
    userId: text("user_id"),
    firstTouchId: uuid("first_touch_id").references(() => marketingTouches.id, { onDelete: "restrict" }),
    lastTouchId: uuid("last_touch_id").references(() => marketingTouches.id, { onDelete: "restrict" }),
    nextFollowUpAt: timestamp("next_follow_up_at", { withTimezone: true }),
    // Kept in step with every appended lead_event, so lists sort by
    // "last activity" without scanning the timeline.
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
    // Set when the buyer's personal details were erased. The row, its
    // events, consents and attribution pointers survive as an anonymous skeleton.
    erasedAt: timestamp("erased_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("leads_phone_e164_key")
      .on(table.phoneE164)
      .where(sql`${table.phoneE164} is not null`),
    index("leads_status_created_idx").on(table.status, table.createdAt),
    index("leads_temperature_idx").on(table.temperature),
    index("leads_next_follow_up_idx").on(table.nextFollowUpAt),
    index("leads_last_activity_idx").on(table.lastActivityAt),
    index("leads_developer_idx").on(table.developerId),
    index("leads_session_idx").on(table.sessionId),
    check("leads_phone_present_ck", sql`${table.phoneE164} is not null or ${table.erasedAt} is not null`),
    check(
      "leads_budget_range_ck",
      sql`${table.budgetMin} is null or ${table.budgetMax} is null or ${table.budgetMin} <= ${table.budgetMax}`,
    ),
    check(
      "leads_budget_nonneg_ck",
      sql`coalesce(${table.budgetMin}, 0) >= 0 and coalesce(${table.budgetMax}, 0) >= 0`,
    ),
  ],
);

/**
 * The lead's immutable timeline. Append-only (trigger in migration 0014);
 * the single, narrow exception is redacting `payload` during an erasure.
 * `developer_id` is a real column (not buried in payload) so "developer ->
 * leads" can be answered with an index, and has no foreign key so a lead's
 * history can never be blocked by developer data changes.
 */
export const leadEvents = pgTable(
  "lead_events",
  {
    id: uuid("id").primaryKey(),
    // Insertion order. Every event of one request shares a timestamp, so
    // created_at alone cannot order a timeline; this identity column breaks
    // the tie in exactly the order events were written.
    seq: bigint("seq", { mode: "number" }).generatedAlwaysAsIdentity().notNull(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "restrict" }),
    eventType: leadEventTypeEnum("event_type").notNull(),
    actorType: leadActorTypeEnum("actor_type").notNull(),
    // The Clerk user id for FOUNDER actors; null for BUYER/SYSTEM.
    actorId: text("actor_id"),
    developerId: uuid("developer_id"),
    fromStatus: leadStatusEnum("from_status"),
    toStatus: leadStatusEnum("to_status"),
    payload: jsonb("payload").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("lead_events_lead_created_idx").on(table.leadId, table.createdAt),
    index("lead_events_developer_type_idx").on(table.developerId, table.eventType),
    index("lead_events_type_created_idx").on(table.eventType, table.createdAt),
  ],
);

/**
 * Proof of consent: what the buyer agreed to, the exact wording shown, and
 * when. No IP address or device data is stored. `withdrawnAt` is the only
 * column that ever changes after insert.
 */
export const leadConsents = pgTable(
  "lead_consents",
  {
    id: uuid("id").primaryKey(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "restrict" }),
    purpose: text("purpose").notNull(),
    channel: contactPreferenceEnum("channel").notNull(),
    textVersion: text("text_version").notNull(),
    textShown: text("text_shown").notNull(),
    givenAt: timestamp("given_at", { withTimezone: true }).notNull().defaultNow(),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
  },
  (table) => [index("lead_consents_lead_idx").on(table.leadId)],
);

/**
 * The revenue ground truth: a booking made through a lead, with the
 * commission expected and received. Amounts evolve, so rows are updatable,
 * but every create/change also appends a lead_event with the old and new
 * values. `projectName` is free text — there is no property inventory.
 */
export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "restrict" }),
    developerId: uuid("developer_id").references(() => developers.id, { onDelete: "restrict" }),
    projectName: text("project_name"),
    status: bookingStatusEnum("status").notNull().default("BOOKED"),
    bookedAt: timestamp("booked_at", { withTimezone: true }).notNull().defaultNow(),
    currency: leadCurrencyEnum("currency").notNull(),
    bookingValue: bigint("booking_value", { mode: "number" }).notNull(),
    commissionExpected: bigint("commission_expected", { mode: "number" }).notNull().default(0),
    commissionReceived: bigint("commission_received", { mode: "number" }).notNull().default(0),
    commissionReceivedAt: timestamp("commission_received_at", { withTimezone: true }),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("bookings_lead_idx").on(table.leadId),
    index("bookings_developer_idx").on(table.developerId),
    index("bookings_status_idx").on(table.status),
    check(
      "bookings_amounts_nonneg_ck",
      sql`${table.bookingValue} >= 0 and ${table.commissionExpected} >= 0 and ${table.commissionReceived} >= 0`,
    ),
  ],
);
