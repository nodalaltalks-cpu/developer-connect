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
]);

export const developers = pgTable(
  "developers",
  {
    id: uuid("id").primaryKey(),
    legalName: text("legal_name").notNull(),
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

export const contactStatusEnum = pgEnum("contact_status", ["NEW", "READ", "RESPONDED", "CLOSED"]);

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
    status: contactStatusEnum("status").notNull().default("NEW"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("contact_submissions_status_created_idx").on(table.status, table.createdAt)],
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
