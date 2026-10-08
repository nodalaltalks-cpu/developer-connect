-- Testimonials: a consent-first workflow. Additive only: two new tables, their constraints, indexes and an append-only trigger.
-- (drizzle also tried to re-emit changes already applied by 0030-0032 because those snapshots predate them; those statements were
-- removed here so this migration touches nothing but the new testimonial tables.)
CREATE TABLE "testimonial_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"testimonial_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"actor" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "testimonials" (
	"id" uuid PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"is_illustrative" boolean DEFAULT false NOT NULL,
	"scenario" text,
	"request_token_hash" text,
	"requested_via" text,
	"author_name" text,
	"display_mode" text DEFAULT 'FIRST_NAME_LAST_INITIAL' NOT NULL,
	"city" text,
	"country" text,
	"helped_with" text,
	"experience" text,
	"project" text,
	"rating" smallint,
	"permission_publish" boolean DEFAULT false NOT NULL,
	"lead_id" uuid,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"approved_by" text,
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"reject_reason" text,
	CONSTRAINT "testimonials_status_ck" CHECK ("testimonials"."status" in ('DRAFT', 'SENT', 'RECEIVED', 'PENDING_APPROVAL', 'APPROVED', 'PUBLISHED', 'ARCHIVED', 'REJECTED')),
	CONSTRAINT "testimonials_display_ck" CHECK ("testimonials"."display_mode" in ('FULL_NAME', 'FIRST_NAME_LAST_INITIAL', 'FIRST_NAME_ONLY', 'ANONYMOUS')),
	CONSTRAINT "testimonials_rating_ck" CHECK ("testimonials"."rating" is null or ("testimonials"."rating" between 1 and 5)),
	CONSTRAINT "testimonials_via_ck" CHECK ("testimonials"."requested_via" is null or "testimonials"."requested_via" in ('WHATSAPP', 'EMAIL', 'LINK')),
	CONSTRAINT "testimonials_illustrative_never_public_ck" CHECK (not ("testimonials"."is_illustrative" and "testimonials"."status" in ('APPROVED', 'PUBLISHED'))),
	CONSTRAINT "testimonials_published_consent_ck" CHECK ("testimonials"."status" <> 'PUBLISHED' or ("testimonials"."permission_publish" and "testimonials"."approved_at" is not null and "testimonials"."experience" is not null)),
	CONSTRAINT "testimonials_text_len_ck" CHECK (char_length(coalesce("testimonials"."experience", '')) <= 2000 and char_length(coalesce("testimonials"."helped_with", '')) <= 500 and char_length(coalesce("testimonials"."author_name", '')) <= 120)
);
--> statement-breakpoint
ALTER TABLE "testimonial_events" ADD CONSTRAINT "testimonial_events_testimonial_id_testimonials_id_fk" FOREIGN KEY ("testimonial_id") REFERENCES "public"."testimonials"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "testimonial_events_testimonial_idx" ON "testimonial_events" USING btree ("testimonial_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "testimonials_token_hash_key" ON "testimonials" USING btree ("request_token_hash");
--> statement-breakpoint
CREATE INDEX "testimonials_status_idx" ON "testimonials" USING btree ("status","created_at");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION testimonial_events_append_only()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'testimonial_events is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER testimonial_events_append_only
BEFORE UPDATE OR DELETE ON testimonial_events
FOR EACH ROW EXECUTE FUNCTION testimonial_events_append_only();
