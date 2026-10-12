CREATE TABLE "enquiry_submissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"lead_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"how_found" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"landing_path" text
);
--> statement-breakpoint
CREATE TABLE "social_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"session_id" text NOT NULL,
	"kind" text NOT NULL,
	"platform" text,
	"content_id" uuid,
	"link_key" text,
	"watch_ms" integer,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"referrer_host" text,
	"device_type" text
);
--> statement-breakpoint
CREATE TABLE "social_videos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"platform" text NOT NULL,
	"orientation" text NOT NULL,
	"permalink_url" text NOT NULL,
	"media_url" text,
	"poster_url" text,
	"topic" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_videos_platform_ck" CHECK ("social_videos"."platform" in ('INSTAGRAM', 'YOUTUBE')),
	CONSTRAINT "social_videos_orientation_ck" CHECK ("social_videos"."orientation" in ('VERTICAL', 'HORIZONTAL'))
);
--> statement-breakpoint
CREATE INDEX "enquiry_submissions_time_idx" ON "enquiry_submissions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "enquiry_submissions_lead_idx" ON "enquiry_submissions" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "social_events_kind_time_idx" ON "social_events" USING btree ("kind","occurred_at");--> statement-breakpoint
CREATE INDEX "social_events_content_idx" ON "social_events" USING btree ("content_id");--> statement-breakpoint
CREATE INDEX "social_events_session_idx" ON "social_events" USING btree ("session_id","occurred_at");--> statement-breakpoint
CREATE INDEX "social_videos_order_idx" ON "social_videos" USING btree ("active","sort_order");