CREATE TYPE "public"."follow_up_status" AS ENUM('SCHEDULED', 'COMPLETED', 'MISSED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."follow_up_type" AS ENUM('CALL_BACK', 'WHATSAPP_FOLLOW_UP', 'SITE_VISIT_FOLLOW_UP', 'PAYMENT_FOLLOW_UP', 'DOCUMENT_FOLLOW_UP', 'GENERAL_FOLLOW_UP');--> statement-breakpoint
ALTER TYPE "public"."lead_event_type" ADD VALUE 'FOLLOW_UP_MISSED';--> statement-breakpoint
ALTER TYPE "public"."lead_event_type" ADD VALUE 'FOLLOW_UP_RESCHEDULED';--> statement-breakpoint
ALTER TYPE "public"."lead_event_type" ADD VALUE 'FOLLOW_UP_CANCELLED';--> statement-breakpoint
ALTER TYPE "public"."lead_event_type" ADD VALUE 'RETURNED_TO_FOUNDER';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'FOLLOW_UP_MISSED';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'FOLLOW_UP_DUE';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'LEAD_RETURNED';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'LEAD_ASSIGNED';--> statement-breakpoint
CREATE TABLE "lead_follow_ups" (
	"id" uuid PRIMARY KEY NOT NULL,
	"lead_id" uuid NOT NULL,
	"type" "follow_up_type" DEFAULT 'GENERAL_FOLLOW_UP' NOT NULL,
	"status" "follow_up_status" DEFAULT 'SCHEDULED' NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"original_scheduled_at" timestamp with time zone NOT NULL,
	"owner_id" text,
	"note" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_by" text,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" text,
	"cancel_reason" text,
	"cancel_note" text,
	"missed_count" integer DEFAULT 0 NOT NULL,
	"last_missed_at" timestamp with time zone,
	"reschedule_count" integer DEFAULT 0 NOT NULL,
	"due_notified_at" timestamp with time zone,
	CONSTRAINT "lead_follow_ups_counts_ck" CHECK ("lead_follow_ups"."missed_count" >= 0 and "lead_follow_ups"."reschedule_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "returned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "returned_from" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "return_reason" text;--> statement-breakpoint
ALTER TABLE "lead_follow_ups" ADD CONSTRAINT "lead_follow_ups_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_follow_ups_lead_idx" ON "lead_follow_ups" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE INDEX "lead_follow_ups_status_due_idx" ON "lead_follow_ups" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "lead_follow_ups_owner_idx" ON "lead_follow_ups" USING btree ("owner_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_follow_ups_one_open_key" ON "lead_follow_ups" USING btree ("lead_id") WHERE "lead_follow_ups"."status" in ('SCHEDULED', 'MISSED');--> statement-breakpoint
CREATE INDEX "leads_returned_idx" ON "leads" USING btree ("returned_at") WHERE "leads"."returned_at" is not null;
--> statement-breakpoint
-- Backfill (additive, no existing row is changed): every live lead that already has a follow-up time gets ONE
-- SCHEDULED follow-up (type GENERAL_FOLLOW_UP) carrying that exact time. Erased leads have no follow-up and are skipped.
INSERT INTO "lead_follow_ups" ("id", "lead_id", "type", "status", "scheduled_at", "original_scheduled_at", "owner_id", "created_by", "created_at", "updated_at")
SELECT gen_random_uuid(), l."id", 'GENERAL_FOLLOW_UP', 'SCHEDULED', l."next_follow_up_at", l."next_follow_up_at", l."owner_id", 'system:migration-0020', now(), now()
FROM "leads" l
WHERE l."erased_at" IS NULL AND l."next_follow_up_at" IS NOT NULL;
