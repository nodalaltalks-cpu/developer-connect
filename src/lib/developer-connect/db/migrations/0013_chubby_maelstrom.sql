-- Revenue Operating System, Phase 1: property-assistance leads.
--
-- ADDITIVE ONLY. Adds the lead/attribution/consent/booking tables and enums,
-- four anonymous funnel values for analytics_event_name, and LEAD_NEW for
-- notification_type. Nothing existing is altered or dropped, and no
-- verification table is touched (leads/bookings only reference developers.id).
--
-- Note: drizzle-kit's generated diff also tried to re-create the contact case
-- management objects from the hand-written migration 0011 (its snapshot
-- predates it). Those statements were removed so this file is safe on a
-- database where 0011 has already been applied. The append-only triggers for
-- lead_events / marketing_touches / lead_consents are in 0014.

CREATE TYPE "public"."booking_status" AS ENUM('BOOKED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."contact_preference" AS ENUM('WHATSAPP', 'PHONE_CALL', 'EMAIL');--> statement-breakpoint
CREATE TYPE "public"."lead_actor_type" AS ENUM('BUYER', 'FOUNDER', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."lead_currency" AS ENUM('INR', 'AED');--> statement-breakpoint
CREATE TYPE "public"."lead_event_type" AS ENUM('LEAD_CREATED', 'LEAD_CAPTURED', 'CONSENT_GIVEN', 'CONSENT_WITHDRAWN', 'CONTACT_PREFERENCE_SELECTED', 'OFFICIAL_WEBSITE_CLICKED', 'DEVELOPER_WEBSITE_REDIRECTED', 'REQUIREMENT_UPDATED', 'STATUS_CHANGED', 'NOTE_ADDED', 'CONTACT_LOGGED', 'FOLLOW_UP_SET', 'BOOKING_CREATED', 'BOOKING_UPDATED', 'LEAD_ERASED');--> statement-breakpoint
CREATE TYPE "public"."lead_purpose" AS ENUM('SELF_USE', 'INVESTMENT');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('NEW', 'CONTACTED', 'QUALIFIED', 'SHORTLISTED', 'SITE_VISIT_SCHEDULED', 'SITE_VISIT_DONE', 'NEGOTIATION', 'BOOKED', 'CLOSED', 'NOT_INTERESTED', 'UNQUALIFIED', 'WRONG_NUMBER', 'DUPLICATE', 'LOST', 'REVISIT_LATER');--> statement-breakpoint
CREATE TYPE "public"."lead_timeline" AS ENUM('WITHIN_30_DAYS', 'ONE_TO_THREE_MONTHS', 'THREE_TO_SIX_MONTHS', 'SIX_MONTHS_PLUS', 'JUST_EXPLORING');--> statement-breakpoint
ALTER TYPE "public"."analytics_event_name" ADD VALUE 'assistance_gate_shown';--> statement-breakpoint
ALTER TYPE "public"."analytics_event_name" ADD VALUE 'assistance_form_started';--> statement-breakpoint
ALTER TYPE "public"."analytics_event_name" ADD VALUE 'lead_submitted';--> statement-breakpoint
ALTER TYPE "public"."analytics_event_name" ADD VALUE 'official_website_redirected';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'LEAD_NEW';--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"lead_id" uuid NOT NULL,
	"developer_id" uuid,
	"project_name" text,
	"status" "booking_status" DEFAULT 'BOOKED' NOT NULL,
	"booked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"currency" "lead_currency" NOT NULL,
	"booking_value" bigint NOT NULL,
	"commission_expected" bigint DEFAULT 0 NOT NULL,
	"commission_received" bigint DEFAULT 0 NOT NULL,
	"commission_received_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_amounts_nonneg_ck" CHECK ("bookings"."booking_value" >= 0 and "bookings"."commission_expected" >= 0 and "bookings"."commission_received" >= 0)
);
--> statement-breakpoint
CREATE TABLE "lead_consents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"lead_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"channel" "contact_preference" NOT NULL,
	"text_version" text NOT NULL,
	"text_shown" text NOT NULL,
	"given_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "lead_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"lead_id" uuid NOT NULL,
	"event_type" "lead_event_type" NOT NULL,
	"actor_type" "lead_actor_type" NOT NULL,
	"actor_id" text,
	"developer_id" uuid,
	"from_status" "lead_status",
	"to_status" "lead_status",
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text,
	"phone_e164" text,
	"email" text,
	"contact_preference" "contact_preference" DEFAULT 'WHATSAPP' NOT NULL,
	"status" "lead_status" DEFAULT 'NEW' NOT NULL,
	"owner_id" text,
	"developer_id" uuid,
	"source_cta" text,
	"location" text,
	"budget_min" bigint,
	"budget_max" bigint,
	"budget_currency" "lead_currency",
	"configuration" text,
	"property_type" text,
	"purpose" "lead_purpose",
	"timeline" "lead_timeline",
	"session_id" text,
	"user_id" text,
	"first_touch_id" uuid,
	"last_touch_id" uuid,
	"next_follow_up_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"erased_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_phone_present_ck" CHECK ("leads"."phone_e164" is not null or "leads"."erased_at" is not null),
	CONSTRAINT "leads_budget_range_ck" CHECK ("leads"."budget_min" is null or "leads"."budget_max" is null or "leads"."budget_min" <= "leads"."budget_max"),
	CONSTRAINT "leads_budget_nonneg_ck" CHECK (coalesce("leads"."budget_min", 0) >= 0 and coalesce("leads"."budget_max", 0) >= 0)
);
--> statement-breakpoint
CREATE TABLE "marketing_touches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"landing_path" text,
	"referrer" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"utm_content" text,
	"utm_term" text,
	"gclid" text,
	"fbclid" text
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_developer_id_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_consents" ADD CONSTRAINT "lead_consents_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_events" ADD CONSTRAINT "lead_events_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_developer_id_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_first_touch_id_marketing_touches_id_fk" FOREIGN KEY ("first_touch_id") REFERENCES "public"."marketing_touches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_last_touch_id_marketing_touches_id_fk" FOREIGN KEY ("last_touch_id") REFERENCES "public"."marketing_touches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookings_lead_idx" ON "bookings" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "bookings_developer_idx" ON "bookings" USING btree ("developer_id");--> statement-breakpoint
CREATE INDEX "bookings_status_idx" ON "bookings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "lead_consents_lead_idx" ON "lead_consents" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "lead_events_lead_created_idx" ON "lead_events" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE INDEX "lead_events_developer_type_idx" ON "lead_events" USING btree ("developer_id","event_type");--> statement-breakpoint
CREATE INDEX "lead_events_type_created_idx" ON "lead_events" USING btree ("event_type","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "leads_phone_e164_key" ON "leads" USING btree ("phone_e164") WHERE "leads"."phone_e164" is not null;--> statement-breakpoint
CREATE INDEX "leads_status_created_idx" ON "leads" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "leads_next_follow_up_idx" ON "leads" USING btree ("next_follow_up_at");--> statement-breakpoint
CREATE INDEX "leads_last_activity_idx" ON "leads" USING btree ("last_activity_at");--> statement-breakpoint
CREATE INDEX "leads_developer_idx" ON "leads" USING btree ("developer_id");--> statement-breakpoint
CREATE INDEX "leads_session_idx" ON "leads" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "marketing_touches_session_idx" ON "marketing_touches" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "marketing_touches_occurred_idx" ON "marketing_touches" USING btree ("occurred_at");
