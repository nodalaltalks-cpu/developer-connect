CREATE TYPE "public"."analytics_event_name" AS ENUM('search_performed', 'zero_result_search', 'search_result_clicked', 'developer_page_viewed', 'official_website_clicked');--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_name" "analytics_event_name" NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"session_id" text NOT NULL,
	"anonymous_user_id" text,
	"developer_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "analytics_events_name_time_idx" ON "analytics_events" USING btree ("event_name","occurred_at");--> statement-breakpoint
CREATE INDEX "analytics_events_developer_idx" ON "analytics_events" USING btree ("developer_id");