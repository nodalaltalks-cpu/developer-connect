CREATE TYPE "public"."developer_edit_event_type" AS ENUM('FIELD_CHANGE', 'REPUBLISHED', 'DISCARDED');--> statement-breakpoint
ALTER TABLE "developer_edit_events" ALTER COLUMN "field_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "developer_edit_events" ADD COLUMN "event_type" "developer_edit_event_type" DEFAULT 'FIELD_CHANGE' NOT NULL;--> statement-breakpoint
ALTER TABLE "developers" ADD COLUMN "pending_changes" jsonb;