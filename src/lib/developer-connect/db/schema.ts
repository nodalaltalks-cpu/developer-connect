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
  smallint,
  integer,
  check,
  type AnyPgColumn,
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
  // First-party visitor behaviour (collected by /api/events): a page opened, a
  // per-page engagement summary on leave, and a tracked button click. Anonymous,
  // session-scoped, no personal data - see lib/behaviour/events.ts.
  "page_viewed",
  "page_engagement",
  "cta_clicked",
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
    index("analytics_events_session_idx").on(table.sessionId, table.occurredAt),
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
  "FOLLOW_UP_MISSED",
  "FOLLOW_UP_DUE",
  "LEAD_RETURNED",
  "LEAD_ASSIGNED",
  // Phase 8 (migration 0026): automated, deterministic reminders for team members.
  "SITE_VISIT_DUE",
  "LEAD_STALE",
  // Migration 0029: a buyer with an open lead came back to the site.
  "LEAD_REVISITED",
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

/** Where a lead came from — never mixed up with how it was contacted. */
export const leadSourceTypeEnum = pgEnum("lead_source_type", ["DIGITAL", "COLD_CALL"]);

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
  // Stage 5 (migration 0017): the buyer asked Developer Connects to connect them with a developer.
  "DEVELOPER_CONNECT_REQUESTED",
  "REQUIREMENT_CREATED",
  "REQUIREMENT_STATUS_CHANGED",
  "FOLLOW_UP_MISSED",
  "FOLLOW_UP_RESCHEDULED",
  "FOLLOW_UP_CANCELLED",
  "RETURNED_TO_FOUNDER",
  "CALL_PLACED",
  "CALL_ENDED",
  "CALL_DISPOSITION_SET",
  // Phase 4 (migration 0023): project shortlist and site visits.
  "PROJECT_SHORTLISTED",
  "PROJECT_SHORTLIST_REMOVED",
  "SITE_VISIT_SCHEDULED",
  "SITE_VISIT_UPDATED",
  // Migration 0030: a team member opened WhatsApp to a lead (NOT a sent message), and recorded a qualification.
  "WHATSAPP_OPENED",
  "QUALIFICATION_RECORDED",
  // Migration 0031: a team member filled in a missing name or email.
  "CONTACT_DETAILS_UPDATED",
]);

/** How warm the buyer is. A separate concept from pipeline status; null on the lead = not yet rated. */
export const leadTemperatureEnum = pgEnum("lead_temperature", ["HOT", "WARM", "COLD"]);

/** Who performed a lead action. Separate from actor_type: a BUYER is not a founder/agent, and STAFF arrives in a later phase. */
// EMPLOYEE (Phase 2): a signed-in team member who is an ACTIVE row in staff_members. The founder is never a
// staff row — founder authority is the Clerk privateMetadata flag, unchanged.
export const leadActorTypeEnum = pgEnum("lead_actor_type", ["BUYER", "FOUNDER", "SYSTEM", "EMPLOYEE"]);

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
    // The Clerk user id of the ACTIVE team member who owns the lead (staff_members.user_id), or null = the
    // Founder's own queue. Deliberately not a foreign key: every ownership change is also an immutable
    // OWNER_CHANGED lead event, so history survives even if a team member is later deactivated.
    ownerId: text("owner_id"),
    // The developer the buyer was first researching; any later developers
    // they click live in lead_events.developer_id, never overwriting this.
    developerId: uuid("developer_id").references(() => developers.id, { onDelete: "restrict" }),
    // Which public surface generated the lead (developer page, directory card, ...).
    sourceCta: text("source_cta"),
    // Set when a team member returns the lead to the Founder queue; cleared when the Founder assigns it to someone
    // again. The full story lives in the lead's events; these three make "Returned leads" a plain indexed query.
    // WHERE THE LEAD CAME FROM — a separate concept from the calls made to it. DIGITAL (website, ads, referral...) or
    // COLD_CALL (Excel/CSV import, cold calling, created by hand). creation_method says how it entered the
    // system; import_batch_id keeps the Excel batch so batch -> leads -> calls -> bookings can always be traced.
    sourceType: leadSourceTypeEnum("source_type").notNull().default("DIGITAL"),
    sourceDetail: text("source_detail"),
    creationMethod: text("creation_method").notNull().default("WEBSITE_GATE"),
    importBatchId: uuid("import_batch_id").references((): AnyPgColumn => leadImportBatches.id, { onDelete: "restrict" }),
    createdBy: text("created_by"),
    returnedAt: timestamp("returned_at", { withTimezone: true }),
    returnedFrom: text("returned_from"),
    returnReason: text("return_reason"),
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
    index("leads_owner_idx").on(table.ownerId),
    index("leads_source_idx").on(table.sourceType, table.creationMethod),
    index("leads_source_owner_idx").on(table.sourceType, table.ownerId, table.createdAt),
    index("leads_import_batch_idx").on(table.importBatchId).where(sql`${table.importBatchId} is not null`),
    index("leads_returned_idx").on(table.returnedAt).where(sql`${table.returnedAt} is not null`),
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
    index("lead_events_seq_idx").on(table.seq),
    index("lead_events_lead_created_idx").on(table.leadId, table.createdAt),
    index("lead_events_developer_type_idx").on(table.developerId, table.eventType),
    index("lead_events_type_created_idx").on(table.eventType, table.createdAt),
    // "Everything this person did", newest first - the employee profile's history (migration 0027).
    index("lead_events_actor_created_idx").on(table.actorId, table.createdAt),
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
    // The project this booking was for, when it is one the Founder has recorded (migration 0025). The free-text project
    // name above stays for bookings that predate the inventory.
    projectId: uuid("project_id").references((): AnyPgColumn => projects.id, { onDelete: "restrict" }),
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

// ---------------------------------------------------------------------------------------------------------------
// PHASE 2 — SALES OPERATING SYSTEM: team members
// ---------------------------------------------------------------------------------------------------------------

/**
 * Roles a NON-founder team member can hold. The Founder is not a role here: founder authority stays the Clerk
 * privateMetadata flag (see lib/authorization.ts) so there is exactly one source of truth for it. MANAGER and
 * SALES_MANAGER are reserved for later team-visibility work; only EMPLOYEE is created today.
 */
export const staffRoleEnum = pgEnum("staff_role", ["EMPLOYEE", "SALES_MANAGER", "MANAGER"]);

/**
 * Where a person stands. INVITED: the Founder created the record (an approved sign-in EMAIL is recorded) - no access yet.
 * ACTIVE: approved AND signed in once with that verified email - access allowed. INACTIVE: switched off for now, may be
 * switched back on. EXITED: left the company; terminal, access gone for good, every record kept. `active` below is kept
 * equal to (status = 'ACTIVE') by a check constraint, so the single flag every existing access check uses stays correct.
 */
export const staffStatusEnum = pgEnum("staff_status", ["INVITED", "ACTIVE", "INACTIVE", "EXITED"]);

/**
 * A person on the sales team. `userId` is the Clerk user id (Clerk stays the identity provider; this table holds
 * only what sales operations need — no HR data). A member is never deleted: they are deactivated, so the owner
 * recorded in old lead history always still resolves to a name. An inactive member can receive no new leads and
 * has no access (enforced in the service layer, not by the interface).
 */
export const staffMembers = pgTable(
  "staff_members",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id").notNull(),
    displayName: text("display_name").notNull(),
    email: text("email"),
    role: staffRoleEnum("role").notNull().default("EMPLOYEE"),
    active: boolean("active").notNull().default(true),
    // The permanent Developer Connects employee ID ("DC2", "DC3"...), allocated from a database sequence, immutable
    // (trigger), never reused (a sequence never hands out a number twice, and rows are never deleted). DC1 is the Founder,
    // who is deliberately not a staff row.
    employeeId: text("employee_id").notNull(),
    status: staffStatusEnum("status").notNull().default("ACTIVE"),
    // First time they became ACTIVE (approved and signed in).
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: text("approved_by"),
    exitedAt: timestamp("exited_at", { withTimezone: true }),
    exitedBy: text("exited_by"),
    exitReason: text("exit_reason"),
    // Clerk user id of the founder who added / deactivated the member.
    createdBy: text("created_by").notNull(),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    deactivatedBy: text("deactivated_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("staff_members_user_id_key").on(table.userId),
    uniqueIndex("staff_members_employee_id_key").on(table.employeeId),
    // One live record per sign-in email: an exited person's email may be invited again as a new record.
    uniqueIndex("staff_members_email_live_key").on(sql`lower(${table.email})`).where(sql`${table.email} is not null and ${table.status} <> 'EXITED'`),
    index("staff_members_active_idx").on(table.active),
    index("staff_members_status_idx").on(table.status),
    check("staff_members_name_present_ck", sql`length(btrim(${table.displayName})) > 0`),
    check("staff_members_employee_id_ck", sql`${table.employeeId} ~ '^DC[1-9][0-9]*$'`),
    check("staff_members_active_status_ck", sql`${table.active} = (${table.status} = 'ACTIVE')`),
    check("staff_members_exit_ck", sql`(${table.status} = 'EXITED') = (${table.exitedAt} is not null)`),
  ],
);

/**
 * The employee lifecycle log: who did what to which employee and when. Append-only (trigger in migration 0027).
 * Stores the employee ID and ids/enums only - no email, no free text beyond a structured exit reason.
 */
export const staffEvents = pgTable(
  "staff_events",
  {
    id: uuid("id").primaryKey(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staffMembers.id, { onDelete: "restrict" }),
    employeeId: text("employee_id").notNull(),
    eventType: text("event_type").notNull(),
    // The Clerk user id of whoever did it (the Founder, or the person themselves on first sign-in).
    actorId: text("actor_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    payload: jsonb("payload").notNull().default({}),
  },
  (table) => [
    index("staff_events_staff_idx").on(table.staffId, table.occurredAt),
    check("staff_events_type_ck", sql`${table.eventType} in ('EMPLOYEE_INVITED', 'EMPLOYEE_APPROVED', 'EMPLOYEE_ACTIVATED', 'EMPLOYEE_DEACTIVATED', 'EMPLOYEE_REACTIVATED', 'EMPLOYEE_EXITED', 'EMPLOYEE_EMAIL_CHANGED')`),
  ],
);

/**
 * Buyer requirements (Phase 2, Step 3). A lead has a HISTORY of requirements; at most one is ACTIVE at a time
 * (partial unique index below). A requirement is never deleted or overwritten by a new one: starting a new
 * requirement CLOSES the previous active one. The leads table keeps a mirror of the active requirement's summary
 * so the lead card, Today queue and Founder CRM keep reading the same columns they always have.
 *
 * Vocabulary is the lead system's own (lead_purpose, lead_timeline, lead_currency). `configuration` and
 * `property_type` stay text so new configurations never need a migration. Budget is explicit about its currency.
 * Preferred locations are rows in lead_requirement_locations, not a delimited string, so they can be matched.
 */
export const requirementStatusEnum = pgEnum("requirement_status", ["ACTIVE", "FULFILLED", "ON_HOLD", "CLOSED"]);

export const leadRequirements = pgTable(
  "lead_requirements",
  {
    id: uuid("id").primaryKey(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "restrict" }),
    status: requirementStatusEnum("status").notNull().default("ACTIVE"),
    propertyType: text("property_type"),
    configuration: text("configuration"),
    budgetMin: bigint("budget_min", { mode: "number" }),
    budgetMax: bigint("budget_max", { mode: "number" }),
    budgetCurrency: leadCurrencyEnum("budget_currency"),
    purpose: leadPurposeEnum("purpose"),
    timeline: leadTimelineEnum("timeline"),
    // Free-text context a person typed. Personal data: cleared on erasure.
    notes: text("notes"),
    createdBy: text("created_by").notNull(),
    updatedBy: text("updated_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("lead_requirements_lead_idx").on(table.leadId, table.createdAt),
    // The database itself guarantees one current requirement per lead.
    uniqueIndex("lead_requirements_one_active_key").on(table.leadId).where(sql`${table.status} = 'ACTIVE'`),
    check(
      "lead_requirements_budget_range_ck",
      sql`${table.budgetMin} is null or ${table.budgetMax} is null or ${table.budgetMin} <= ${table.budgetMax}`,
    ),
    check("lead_requirements_budget_nonneg_ck", sql`coalesce(${table.budgetMin}, 0) >= 0 and coalesce(${table.budgetMax}, 0) >= 0`),
    check(
      "lead_requirements_budget_currency_ck",
      sql`(${table.budgetMin} is null and ${table.budgetMax} is null) or ${table.budgetCurrency} is not null`,
    ),
  ],
);

export const leadRequirementLocations = pgTable(
  "lead_requirement_locations",
  {
    id: uuid("id").primaryKey(),
    requirementId: uuid("requirement_id")
      .notNull()
      .references(() => leadRequirements.id, { onDelete: "cascade" }),
    // As the team member wrote it ("Thane West").
    name: text("name").notNull(),
    // Normalised form used for matching and to stop duplicates (lower-case, single spaces, Bengaluru = Bangalore).
    nameKey: text("name_key").notNull(),
    position: smallint("position").notNull().default(0),
  },
  (table) => [
    uniqueIndex("lead_requirement_locations_unique_key").on(table.requirementId, table.nameKey),
    index("lead_requirement_locations_key_idx").on(table.nameKey),
    check("lead_requirement_locations_name_ck", sql`length(btrim(${table.name})) > 0 and length(btrim(${table.nameKey})) > 0`),
  ],
);

/**
 * Follow-ups (Phase 2, follow-up discipline). Every follow-up has a stable id, a TYPE, an EXACT scheduled time
 * (timestamptz — never just a date) and a lifecycle: SCHEDULED, COMPLETED, MISSED, CANCELLED. A lead has at most
 * one OPEN (SCHEDULED or MISSED) follow-up at a time; rescheduling edits it in place (same id, counted) and every
 * change is an immutable lead event. MISSED is derived by the server from `scheduled_at < now` while still
 * SCHEDULED; an idempotent sweep records it (once) as a FOLLOW_UP_MISSED event. leads.next_follow_up_at is kept as a
 * mirror of the open follow-up's time so the existing lists, queue and Founder CRM keep reading what they always did.
 */
export const followUpTypeEnum = pgEnum("follow_up_type", [
  "CALL_BACK",
  "WHATSAPP_FOLLOW_UP",
  "SITE_VISIT_FOLLOW_UP",
  "PAYMENT_FOLLOW_UP",
  "DOCUMENT_FOLLOW_UP",
  "GENERAL_FOLLOW_UP",
]);

export const followUpStatusEnum = pgEnum("follow_up_status", ["SCHEDULED", "COMPLETED", "MISSED", "CANCELLED"]);

export const leadFollowUps = pgTable(
  "lead_follow_ups",
  {
    id: uuid("id").primaryKey(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "restrict" }),
    type: followUpTypeEnum("type").notNull().default("GENERAL_FOLLOW_UP"),
    status: followUpStatusEnum("status").notNull().default("SCHEDULED"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    originalScheduledAt: timestamp("original_scheduled_at", { withTimezone: true }).notNull(),
    // Who was responsible when it was scheduled: the lead's owner then (null = the Founder's own queue).
    ownerId: text("owner_id"),
    // Free text a person typed. Personal data: cleared on erasure.
    note: text("note"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedBy: text("completed_by"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: text("cancelled_by"),
    cancelReason: text("cancel_reason"),
    cancelNote: text("cancel_note"),
    missedCount: integer("missed_count").notNull().default(0),
    lastMissedAt: timestamp("last_missed_at", { withTimezone: true }),
    rescheduleCount: integer("reschedule_count").notNull().default(0),
    // Set once when the "due soon" notification is sent, so it is never sent twice for one scheduled time.
    dueNotifiedAt: timestamp("due_notified_at", { withTimezone: true }),
  },
  (table) => [
    index("lead_follow_ups_lead_idx").on(table.leadId, table.createdAt),
    index("lead_follow_ups_status_due_idx").on(table.status, table.scheduledAt),
    index("lead_follow_ups_owner_idx").on(table.ownerId, table.status),
    // The database itself guarantees one open follow-up per lead.
    uniqueIndex("lead_follow_ups_one_open_key").on(table.leadId).where(sql`${table.status} in ('SCHEDULED', 'MISSED')`),
    check("lead_follow_ups_counts_ck", sql`${table.missedCount} >= 0 and ${table.rescheduleCount} >= 0`),
  ],
);

/**
 * One Excel/CSV import: who, when, from which file and campaign. Every lead it created points back here
 * (leads.import_batch_id), so the Founder can follow batch -> leads -> calls -> connected -> follow-ups -> bookings.
 */
export const leadImportBatches = pgTable("lead_import_batches", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  originalFilename: text("original_filename"),
  campaign: text("campaign"),
  importedBy: text("imported_by").notNull(),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  rowCount: integer("row_count").notNull().default(0),
  createdCount: integer("created_count").notNull().default(0),
  duplicateCount: integer("duplicate_count").notNull().default(0),
  rejectedCount: integer("rejected_count").notNull().default(0),
});

/**
 * A CALLING BATCH: a list of existing leads given to one employee to call (for example 100–500 numbers from a CSV
 * import). It REFERENCES leads — nothing is copied — and everything about progress (completed, connected, dialed,
 * pending, failed, returned) is derived from the call records and the leads themselves, never typed in.
 */
export const callingBatches = pgTable(
  "calling_batches",
  {
    id: uuid("id").primaryKey(),
    name: text("name").notNull(),
    // The Founder (Clerk id) who created it, and the team member it is assigned to.
    createdBy: text("created_by").notNull(),
    assignedTo: text("assigned_to").notNull(),
    // The CSV import it came from, if any (the lead SOURCE stays on the leads and the import batch).
    importBatchId: uuid("import_batch_id").references((): AnyPgColumn => leadImportBatches.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("ACTIVE"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("calling_batches_assignee_idx").on(table.assignedTo, table.status), check("calling_batches_status_ck", sql`${table.status} in ('ACTIVE', 'CLOSED')`)],
);

export const callingBatchItems = pgTable(
  "calling_batch_items",
  {
    id: uuid("id").primaryKey(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => callingBatches.id, { onDelete: "restrict" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "restrict" }),
    // The order the lead is offered in ("next call" follows this order).
    position: integer("position").notNull(),
    // The employee chose to leave this lead for later. Set once (who and when); never cleared - a lead that is then called simply stops being skipped.
    skippedAt: timestamp("skipped_at", { withTimezone: true }),
    skippedBy: text("skipped_by"),
  },
  (table) => [check("calling_batch_items_skip_pair_ck", sql`(${table.skippedAt} is null) = (${table.skippedBy} is null)`), uniqueIndex("calling_batch_items_batch_lead_key").on(table.batchId, table.leadId), index("calling_batch_items_order_idx").on(table.batchId, table.position)],
);

/**
 * Calls placed through the INTERNAL DIALER. A row exists only because the server placed the call through the
 * telephony provider — never because a button was clicked and never from the browser. Its status, answered/ended
 * times and duration come from the provider's own events (lead_call_events); employees can set only a disposition
 * (what the conversation led to), once. Nothing is ever deleted; the database refuses to rewrite identity columns,
 * a finished call's outcome, or a disposition once set.
 *
 * "Connected" means the provider reported the call answered (answered_at is set) — status CONNECTED or COMPLETED.
 * `source` is the CALL source (the internal dialer) and is unrelated to the LEAD source on the leads table.
 */
export const callStatusEnum = pgEnum("call_status", ["INITIATED", "RINGING", "CONNECTED", "COMPLETED", "NO_ANSWER", "BUSY", "FAILED", "REJECTED"]);

export const callDispositionEnum = pgEnum("call_disposition", [
  "INTERESTED",
  "NOT_INTERESTED",
  "FOLLOW_UP_REQUIRED",
  "CALLBACK_REQUESTED",
  "SWITCHED_OFF",
  "INVALID_NUMBER",
  "OTHER",
  "NO_ANSWER",
  "BUSY",
]);

/**
 * The business rule for a call: actual duration of 10 seconds or less is DIALED; strictly more than 10 seconds is
 * CONNECTED. Decided by the SERVER from the duration the authoritative source reported — never by the client.
 * NULL until the call has finished (and for calls that were never placed).
 */
export const callClassificationEnum = pgEnum("call_classification", ["DIALED", "CONNECTED"]);

export const leadCalls = pgTable(
  "lead_calls",
  {
    id: uuid("id").primaryKey(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "restrict" }),
    // The authenticated internal user (Clerk id) who placed it: a team member or the Founder.
    staffUserId: text("staff_user_id").notNull(),
    direction: text("direction").notNull().default("OUTBOUND"),
    status: callStatusEnum("status").notNull().default("INITIATED"),
    source: text("source").notNull().default("INTERNAL_DIALER"),
    provider: text("provider").notNull(),
    providerCallId: text("provider_call_id"),
    // Only the last four digits: enough to tell calls apart; the full number lives on the lead and is erasable.
    phoneLast4: text("phone_last4"),
    initiatedAt: timestamp("initiated_at", { withTimezone: true }).notNull(),
    ringingAt: timestamp("ringing_at", { withTimezone: true }),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    durationSeconds: integer("duration_seconds"),
    endReason: text("end_reason"),
    classification: callClassificationEnum("classification"),
    // HOW the call was made — separate from the lead source. PROVIDER (a telephony vendor's events) or ANDROID_SIM
    // (the employee's own phone and SIM, reported by the Android bridge from the device's call log).
    method: text("method").notNull().default("PROVIDER"),
    // The calling batch (queue) this call was made from, if any.
    batchId: uuid("batch_id").references((): AnyPgColumn => callingBatches.id, { onDelete: "restrict" }),
    // For ANDROID_SIM calls: when the device dialed (its call log's own start time), which SIM, and a reference to the
    // call-log entry — all reported by the device once, then immutable. `reported_at` is the SERVER's receive time.
    startedAt: timestamp("started_at", { withTimezone: true }),
    deviceRef: text("device_ref"),
    simRef: text("sim_ref"),
    callLogRef: text("call_log_ref"),
    reportedAt: timestamp("reported_at", { withTimezone: true }),
    disposition: callDispositionEnum("disposition"),
    dispositionBy: text("disposition_by"),
    dispositionAt: timestamp("disposition_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("lead_calls_lead_idx").on(table.leadId, table.initiatedAt),
    index("lead_calls_staff_idx").on(table.staffUserId, table.initiatedAt),
    index("lead_calls_initiated_idx").on(table.initiatedAt),
    index("lead_calls_batch_idx").on(table.batchId).where(sql`${table.batchId} is not null`),
    index("lead_calls_classification_idx").on(table.staffUserId, table.classification, table.initiatedAt),
    uniqueIndex("lead_calls_provider_call_key").on(table.provider, table.providerCallId).where(sql`${table.providerCallId} is not null`),
    check("lead_calls_duration_ck", sql`${table.durationSeconds} is null or ${table.durationSeconds} >= 0`),
  ],
);

/**
 * The provider's own events, exactly as received — the raw evidence a call record is built from. Append-only (trigger
 * in migration 0021). The unique (provider, provider_event_id) is the idempotency key: a webhook delivered five times
 * is stored, and applied, once.
 */
export const leadCallEvents = pgTable(
  "lead_call_events",
  {
    id: uuid("id").primaryKey(),
    callId: uuid("call_id")
      .notNull()
      .references(() => leadCalls.id, { onDelete: "restrict" }),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type").notNull(),
    status: callStatusEnum("status"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    payload: jsonb("payload").notNull().default({}),
  },
  (table) => [
    uniqueIndex("lead_call_events_idempotency_key").on(table.provider, table.providerEventId),
    index("lead_call_events_call_idx").on(table.callId, table.occurredAt),
  ],
);

// ---------------------------------------------------------------------------------------------------------------
// PHASE 4 - SALES OPERATING SYSTEM: projects, shortlist, site visits
// ---------------------------------------------------------------------------------------------------------------

/**
 * A PROJECT a developer is selling that the sales team can match buyers to. Founder-maintained inventory: nothing here
 * is scraped or guessed, and a field the Founder does not know stays NULL - the matcher then reports UNKNOWN for that
 * criterion instead of pretending. Money is stored with its currency (INR or AED) and never converted.
 */
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey(),
    developerId: uuid("developer_id")
      .notNull()
      .references(() => developers.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    city: text("city").notNull(),
    locality: text("locality"),
    propertyType: text("property_type"),
    configurations: text("configurations").array().notNull().default(sql`'{}'::text[]`),
    priceMin: bigint("price_min", { mode: "number" }),
    priceMax: bigint("price_max", { mode: "number" }),
    currency: leadCurrencyEnum("currency"),
    status: text("status").notNull().default("ACTIVE"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("projects_developer_name_key").on(table.developerId, sql`lower(${table.name})`),
    index("projects_city_idx").on(table.city),
    check("projects_status_ck", sql`${table.status} in ('ACTIVE', 'INACTIVE')`),
    check("projects_price_ck", sql`(${table.priceMin} is null or ${table.priceMin} >= 0) and (${table.priceMax} is null or ${table.priceMax} >= 0) and (${table.priceMin} is null or ${table.priceMax} is null or ${table.priceMin} <= ${table.priceMax})`),
    check("projects_currency_ck", sql`(${table.priceMin} is null and ${table.priceMax} is null) or ${table.currency} is not null`),
  ],
);

/**
 * A project put on a buyer's shortlist. History is kept: removing sets removed_at/removed_by, the row stays, and the
 * buyer can be shortlisted for the same project again later (a new row). At most ONE active row per lead+project.
 */
export const leadProjectShortlist = pgTable(
  "lead_project_shortlist",
  {
    id: uuid("id").primaryKey(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "restrict" }),
    requirementId: uuid("requirement_id").references(() => leadRequirements.id, { onDelete: "restrict" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    shortlistedBy: text("shortlisted_by").notNull(),
    shortlistedAt: timestamp("shortlisted_at", { withTimezone: true }).notNull().defaultNow(),
    removedBy: text("removed_by"),
    removedAt: timestamp("removed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("lead_project_shortlist_active_key").on(table.leadId, table.projectId).where(sql`${table.removedAt} is null`),
    index("lead_project_shortlist_lead_idx").on(table.leadId),
    index("lead_project_shortlist_project_idx").on(table.projectId),
    check("lead_project_shortlist_removed_ck", sql`(${table.removedAt} is null) = (${table.removedBy} is null)`),
  ],
);

export const siteVisitStatusEnum = pgEnum("site_visit_status", ["SCHEDULED", "CONFIRMED", "COMPLETED", "NO_SHOW", "RESCHEDULED", "CANCELLED"]);

/**
 * A SITE VISIT: a buyer going to see a project. A reschedule never edits the old row - it closes it as RESCHEDULED and
 * creates a new row pointing back (rescheduled_from), so the chain of what happened is kept. Every change appends to
 * site_visit_events (immutable, trigger in migration 0023) and to the lead's own timeline. `staff_user_id` is the team
 * member responsible (the lead's owner when it was scheduled, or the Founder).
 */
export const siteVisits = pgTable(
  "site_visits",
  {
    id: uuid("id").primaryKey(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "restrict" }),
    requirementId: uuid("requirement_id").references(() => leadRequirements.id, { onDelete: "restrict" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "restrict" }),
    staffUserId: text("staff_user_id").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    status: siteVisitStatusEnum("status").notNull().default("SCHEDULED"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    outcome: text("outcome"),
    nextAction: text("next_action"),
    notes: text("notes"),
    rescheduledFrom: uuid("rescheduled_from").references((): AnyPgColumn => siteVisits.id, { onDelete: "restrict" }),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("site_visits_lead_idx").on(table.leadId, table.scheduledAt),
    index("site_visits_staff_idx").on(table.staffUserId, table.scheduledAt),
    index("site_visits_status_idx").on(table.status, table.scheduledAt),
    uniqueIndex("site_visits_open_key").on(table.leadId, sql`coalesce(${table.projectId}, '00000000-0000-0000-0000-000000000000'::uuid)`).where(sql`${table.status} in ('SCHEDULED', 'CONFIRMED')`),
    check("site_visits_outcome_ck", sql`${table.outcome} is null or ${table.outcome} in ('INTERESTED', 'NEEDS_ANOTHER_VISIT', 'NEGOTIATING', 'NOT_INTERESTED', 'OTHER')`),
  ],
);

/** The visit's own audit trail: who changed it, from what to what, when. Append-only (trigger in migration 0023). */
export const siteVisitEvents = pgTable(
  "site_visit_events",
  {
    id: uuid("id").primaryKey(),
    visitId: uuid("visit_id")
      .notNull()
      .references(() => siteVisits.id, { onDelete: "restrict" }),
    eventType: text("event_type").notNull(),
    actorType: leadActorTypeEnum("actor_type").notNull(),
    actorId: text("actor_id"),
    fromStatus: siteVisitStatusEnum("from_status"),
    toStatus: siteVisitStatusEnum("to_status"),
    payload: jsonb("payload").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("site_visit_events_visit_idx").on(table.visitId, table.createdAt)],
);

// ---------------------------------------------------------------------------------------------------------------
// PHASE 5 - ACQUISITION ENGINE: campaigns
// ---------------------------------------------------------------------------------------------------------------

/**
 * A marketing campaign tied to ONE utm_campaign tag. The unique index on lower(utm_campaign) is what guarantees a lead
 * is attributed to at most one campaign (no double counting). The tag is the attribution key and is never edited.
 * Spend is deliberately not here yet (finance phase) - nothing is estimated.
 */
export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").primaryKey(),
    name: text("name").notNull(),
    utmCampaign: text("utm_campaign").notNull(),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    landingPage: text("landing_page"),
    startDate: text("start_date"),
    endDate: text("end_date"),
    status: text("status").notNull().default("ACTIVE"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("campaigns_utm_campaign_key").on(sql`lower(${table.utmCampaign})`),
    check("campaigns_status_ck", sql`${table.status} in ('ACTIVE', 'PAUSED', 'ENDED')`),
    check("campaigns_dates_ck", sql`${table.startDate} is null or ${table.endDate} is null or ${table.endDate} >= ${table.startDate}`),
  ],
);

// ---------------------------------------------------------------------------------------------------------------
// PHASE 6 - MARKETING + FINANCE INTELLIGENCE: marketing spend
// ---------------------------------------------------------------------------------------------------------------

/**
 * Money the Founder actually spent on acquisition. Every entry has a CHANNEL (so channel profitability is possible
 * without guessing) and optionally the campaign it was for. The currency is stored with the amount (INR or AED) and is
 * never converted or summed across currencies. Entries are never edited or deleted: a mistake is VOIDED (voided_at /
 * voided_by / reason), and voided entries stay as history but count for nothing.
 */
export const marketingSpend = pgTable(
  "marketing_spend",
  {
    id: uuid("id").primaryKey(),
    channel: text("channel").notNull(),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "restrict" }),
    // The day the money was spent (a plain date, India calendar day - see the business time zone).
    spentOn: text("spent_on").notNull(),
    currency: leadCurrencyEnum("currency").notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    note: text("note"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedBy: text("voided_by"),
    voidReason: text("void_reason"),
  },
  (table) => [
    index("marketing_spend_spent_on_idx").on(table.spentOn),
    index("marketing_spend_campaign_idx").on(table.campaignId),
    check("marketing_spend_amount_ck", sql`${table.amount} > 0`),
    check("marketing_spend_void_ck", sql`(${table.voidedAt} is null) = (${table.voidedBy} is null)`),
    check("marketing_spend_channel_ck", sql`${table.channel} in ('GOOGLE_ADS', 'META', 'INSTAGRAM', 'WHATSAPP', 'REFERRAL', 'ORGANIC_SEARCH', 'OTHER_DIGITAL', 'DIRECT_OR_UNKNOWN', 'CSV_IMPORT', 'COLD_CALLING', 'SELF_GENERATED_OTHER')`),
  ],
);

// ---------------------------------------------------------------------------------------------------------------
// PHASE 8 - AUTOMATION ENGINE: settings and the action log
// ---------------------------------------------------------------------------------------------------------------

/** Founder switches for each automation. A key with no row uses the default in code (reminders on, auto-routing OFF). */
export const automationSettings = pgTable("automation_settings", {
  key: text("key").primaryKey(),
  enabled: boolean("enabled").notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Every automated action, once. `dedupe_key` is unique: it names exactly the thing the action is about (for example
 * "this follow-up at this time"), so running the engine twice - or two runs at once - can never send the same reminder
 * or make the same assignment twice. A row is CLAIMED (PENDING) before the work, then marked DONE or FAILED; a FAILED
 * (or abandoned) claim can be retried a few times. Never deleted. `detail` holds ids and enums only - no buyer data.
 */
export const automationActions = pgTable(
  "automation_actions",
  {
    id: uuid("id").primaryKey(),
    rule: text("rule").notNull(),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    status: text("status").notNull().default("PENDING"),
    attempts: integer("attempts").notNull().default(1),
    detail: jsonb("detail").notNull().default({}),
    claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("automation_actions_dedupe_key").on(table.dedupeKey),
    index("automation_actions_created_idx").on(table.createdAt),
    check("automation_actions_status_ck", sql`${table.status} in ('PENDING', 'DONE', 'FAILED', 'SKIPPED')`),
  ],
);
