ALTER TYPE "public"."analytics_event_name" ADD VALUE 'page_viewed';--> statement-breakpoint
ALTER TYPE "public"."analytics_event_name" ADD VALUE 'page_engagement';--> statement-breakpoint
ALTER TYPE "public"."analytics_event_name" ADD VALUE 'cta_clicked';--> statement-breakpoint
CREATE INDEX "analytics_events_session_idx" ON "analytics_events" USING btree ("session_id","occurred_at");