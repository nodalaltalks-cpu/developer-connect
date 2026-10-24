CREATE TABLE "social_automation_settings" (
	"id" text PRIMARY KEY DEFAULT 'global' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"price_max_age_days" integer DEFAULT 14 NOT NULL,
	"availability_max_age_days" integer DEFAULT 7 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "social_automation_settings_singleton_ck" CHECK ("social_automation_settings"."id" = 'global'),
	CONSTRAINT "social_automation_settings_price_age_ck" CHECK ("social_automation_settings"."price_max_age_days" between 1 and 365),
	CONSTRAINT "social_automation_settings_availability_age_ck" CHECK ("social_automation_settings"."availability_max_age_days" between 1 and 365)
);
--> statement-breakpoint
CREATE TABLE "social_comment_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"comment_id" text NOT NULL,
	"post_id" text NOT NULL,
	"automation_id" uuid,
	"project_id" uuid,
	"commenter_id" text,
	"commenter_username" text,
	"comment_text" text,
	"commented_at" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"trigger_keyword" text,
	"detected_intent" text,
	"mode_at_processing" text,
	"outcome" text DEFAULT 'RECEIVED' NOT NULL,
	"dm_status" text DEFAULT 'NOT_ATTEMPTED' NOT NULL,
	"dm_text" text,
	"dm_failure_reason" text,
	"dm_message_id" text,
	"dm_attempted_at" timestamp with time zone,
	"reply_status" text DEFAULT 'NOT_ATTEMPTED' NOT NULL,
	"reply_text" text,
	"reply_failure_reason" text,
	"reply_platform_id" text,
	"reply_attempted_at" timestamp with time zone,
	"duplicate_count" integer DEFAULT 0 NOT NULL,
	"follow_up_required" boolean DEFAULT false NOT NULL,
	"follow_up_reason" text,
	"follow_up_status" text DEFAULT 'NONE' NOT NULL,
	"follow_up_note" text,
	"follow_up_updated_at" timestamp with time zone,
	CONSTRAINT "social_comment_events_platform_ck" CHECK ("social_comment_events"."platform" in ('INSTAGRAM', 'FACEBOOK')),
	CONSTRAINT "social_comment_events_outcome_ck" CHECK ("social_comment_events"."outcome" in ('RECEIVED', 'NO_MATCH', 'NOT_CONFIGURED', 'AUTOMATION_OFF', 'PROCESSED', 'NEEDS_MANUAL')),
	CONSTRAINT "social_comment_events_dm_ck" CHECK ("social_comment_events"."dm_status" in ('NOT_ATTEMPTED', 'DRY_RUN', 'SENT', 'FAILED', 'INELIGIBLE', 'SKIPPED')),
	CONSTRAINT "social_comment_events_reply_ck" CHECK ("social_comment_events"."reply_status" in ('NOT_ATTEMPTED', 'DRY_RUN', 'SENT', 'FAILED', 'SKIPPED')),
	CONSTRAINT "social_comment_events_followup_ck" CHECK ("social_comment_events"."follow_up_status" in ('NONE', 'OPEN', 'DONE', 'DISMISSED'))
);
--> statement-breakpoint
CREATE TABLE "social_post_automations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"post_id" text NOT NULL,
	"post_url" text,
	"video_title" text NOT NULL,
	"content_format" text NOT NULL,
	"mode" text DEFAULT 'DRY_RUN' NOT NULL,
	"live_confirmed_at" timestamp with time zone,
	"live_confirmed_by" text,
	"project_id" uuid,
	"price_approved" boolean DEFAULT false NOT NULL,
	"price_verified_at" timestamp with time zone,
	"price_snapshot" text,
	"availability_text" text,
	"availability_verified_at" timestamp with time zone,
	"approved_details" text,
	"safe_fallback_template" text,
	"public_reply_template" text,
	"public_reply_fallback_template" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "social_post_automations_platform_ck" CHECK ("social_post_automations"."platform" in ('INSTAGRAM', 'FACEBOOK')),
	CONSTRAINT "social_post_automations_format_ck" CHECK ("social_post_automations"."content_format" in ('REEL', 'POST', 'VIDEO')),
	CONSTRAINT "social_post_automations_mode_ck" CHECK ("social_post_automations"."mode" in ('DISABLED', 'DRY_RUN', 'LIVE')),
	CONSTRAINT "social_post_automations_live_ck" CHECK ("social_post_automations"."mode" <> 'LIVE' or ("social_post_automations"."project_id" is not null and "social_post_automations"."live_confirmed_at" is not null and "social_post_automations"."live_confirmed_by" is not null)),
	CONSTRAINT "social_post_automations_price_ck" CHECK ("social_post_automations"."price_approved" = false or ("social_post_automations"."price_verified_at" is not null and "social_post_automations"."price_snapshot" is not null))
);
--> statement-breakpoint
CREATE TABLE "social_post_triggers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"automation_id" uuid NOT NULL,
	"keyword" text NOT NULL,
	"intent" text NOT NULL,
	"dm_template" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "social_post_triggers_intent_ck" CHECK ("social_post_triggers"."intent" in ('PRICE', 'LOCATION', 'DETAILS', 'BROCHURE', 'VISIT', 'AVAILABILITY', 'OTHER')),
	CONSTRAINT "social_post_triggers_keyword_ck" CHECK ("social_post_triggers"."keyword" = upper(btrim("social_post_triggers"."keyword")) and char_length("social_post_triggers"."keyword") between 2 and 30)
);
--> statement-breakpoint
ALTER TABLE "social_comment_events" ADD CONSTRAINT "social_comment_events_automation_id_social_post_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."social_post_automations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_comment_events" ADD CONSTRAINT "social_comment_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_post_automations" ADD CONSTRAINT "social_post_automations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_post_triggers" ADD CONSTRAINT "social_post_triggers_automation_id_social_post_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."social_post_automations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "social_comment_events_comment_key" ON "social_comment_events" USING btree ("platform","comment_id");--> statement-breakpoint
CREATE INDEX "social_comment_events_time_idx" ON "social_comment_events" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "social_comment_events_post_idx" ON "social_comment_events" USING btree ("platform","post_id");--> statement-breakpoint
CREATE INDEX "social_comment_events_followup_idx" ON "social_comment_events" USING btree ("follow_up_status","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "social_post_automations_post_key" ON "social_post_automations" USING btree ("platform","post_id");--> statement-breakpoint
CREATE INDEX "social_post_automations_project_idx" ON "social_post_automations" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "social_post_triggers_keyword_key" ON "social_post_triggers" USING btree ("automation_id","keyword");