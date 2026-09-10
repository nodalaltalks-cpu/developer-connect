CREATE TYPE "public"."actor_type" AS ENUM('FOUNDER', 'SYSTEM', 'AGENT');--> statement-breakpoint
CREATE TYPE "public"."developer_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."discovery_source" AS ENUM('MANUAL_SUBMISSION', 'SEARCH_ENGINE', 'REGULATORY_FILING', 'AGENT_CRAWL', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."evidence_type" AS ENUM('BRANDING_MATCH', 'CORPORATE_IDENTITY_MATCH', 'LEGAL_NAME_MATCH', 'OFFICIAL_SOCIAL_BACKLINK', 'REGULATORY_FILING_REFERENCE', 'DOMAIN_OWNERSHIP_SIGNAL', 'SSL_DOMAIN_CONSISTENCY', 'OFFICIAL_CONTACT_INFO', 'MANUAL_CONFIRMATION', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('DISCOVERED', 'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'NEEDS_REVERIFICATION', 'INACTIVE');--> statement-breakpoint
CREATE TABLE "developers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"legal_name" text NOT NULL,
	"display_name" text NOT NULL,
	"slug" text NOT NULL,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"country" text NOT NULL,
	"headquarters_location" text,
	"status" "developer_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" uuid PRIMARY KEY NOT NULL,
	"website_candidate_id" uuid NOT NULL,
	"evidence_type" "evidence_type" NOT NULL,
	"detail" text NOT NULL,
	"source_url" text,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"website_candidate_id" uuid NOT NULL,
	"previous_status" "verification_status",
	"new_status" "verification_status" NOT NULL,
	"reason" text NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "website_candidates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"developer_id" uuid NOT NULL,
	"url" text NOT NULL,
	"canonical_domain" text NOT NULL,
	"discovery_source" "discovery_source" NOT NULL,
	"verification_status" "verification_status" DEFAULT 'DISCOVERED' NOT NULL,
	"confidence_score" real DEFAULT 0 NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"rejection_reason" text,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_website_candidate_id_website_candidates_id_fk" FOREIGN KEY ("website_candidate_id") REFERENCES "public"."website_candidates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_events" ADD CONSTRAINT "verification_events_website_candidate_id_website_candidates_id_fk" FOREIGN KEY ("website_candidate_id") REFERENCES "public"."website_candidates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_candidates" ADD CONSTRAINT "website_candidates_developer_id_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "developers_slug_key" ON "developers" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "developers_city_idx" ON "developers" USING btree ("city");--> statement-breakpoint
CREATE INDEX "evidence_candidate_idx" ON "evidence" USING btree ("website_candidate_id");--> statement-breakpoint
CREATE INDEX "verification_events_candidate_idx" ON "verification_events" USING btree ("website_candidate_id");--> statement-breakpoint
CREATE INDEX "website_candidates_developer_idx" ON "website_candidates" USING btree ("developer_id");--> statement-breakpoint
CREATE INDEX "website_candidates_domain_idx" ON "website_candidates" USING btree ("developer_id","canonical_domain");--> statement-breakpoint
CREATE UNIQUE INDEX "website_candidates_one_verified_per_developer" ON "website_candidates" USING btree ("developer_id") WHERE "website_candidates"."verification_status" = 'VERIFIED';