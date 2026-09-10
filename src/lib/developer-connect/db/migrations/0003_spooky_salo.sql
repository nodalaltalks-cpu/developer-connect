ALTER TYPE "public"."analytics_event_name" ADD VALUE 'profile_started';--> statement-breakpoint
ALTER TYPE "public"."analytics_event_name" ADD VALUE 'profile_field_completed';--> statement-breakpoint
ALTER TYPE "public"."analytics_event_name" ADD VALUE 'profile_updated';--> statement-breakpoint
ALTER TYPE "public"."analytics_event_name" ADD VALUE 'profile_completion_reached';--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analytics_events" ADD COLUMN "user_id" text;--> statement-breakpoint
CREATE INDEX "analytics_events_user_idx" ON "analytics_events" USING btree ("user_id");