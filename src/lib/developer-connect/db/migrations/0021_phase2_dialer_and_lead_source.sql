CREATE TYPE "public"."call_disposition" AS ENUM('INTERESTED', 'NOT_INTERESTED', 'FOLLOW_UP_REQUIRED', 'CALLBACK_REQUESTED', 'SWITCHED_OFF', 'INVALID_NUMBER', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."call_status" AS ENUM('INITIATED', 'RINGING', 'CONNECTED', 'COMPLETED', 'NO_ANSWER', 'BUSY', 'FAILED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."lead_source_type" AS ENUM('DIGITAL', 'SELF_GENERATED');--> statement-breakpoint
ALTER TYPE "public"."lead_event_type" ADD VALUE 'CALL_PLACED';--> statement-breakpoint
ALTER TYPE "public"."lead_event_type" ADD VALUE 'CALL_ENDED';--> statement-breakpoint
ALTER TYPE "public"."lead_event_type" ADD VALUE 'CALL_DISPOSITION_SET';--> statement-breakpoint
CREATE TABLE "lead_call_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"call_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"status" "call_status",
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_calls" (
	"id" uuid PRIMARY KEY NOT NULL,
	"lead_id" uuid NOT NULL,
	"staff_user_id" text NOT NULL,
	"direction" text DEFAULT 'OUTBOUND' NOT NULL,
	"status" "call_status" DEFAULT 'INITIATED' NOT NULL,
	"source" text DEFAULT 'INTERNAL_DIALER' NOT NULL,
	"provider" text NOT NULL,
	"provider_call_id" text,
	"phone_last4" text,
	"initiated_at" timestamp with time zone NOT NULL,
	"ringing_at" timestamp with time zone,
	"answered_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"duration_seconds" integer,
	"end_reason" text,
	"disposition" "call_disposition",
	"disposition_by" text,
	"disposition_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_calls_duration_ck" CHECK ("lead_calls"."duration_seconds" is null or "lead_calls"."duration_seconds" >= 0)
);
--> statement-breakpoint
CREATE TABLE "lead_import_batches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"original_filename" text,
	"campaign" text,
	"imported_by" text NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"created_count" integer DEFAULT 0 NOT NULL,
	"duplicate_count" integer DEFAULT 0 NOT NULL,
	"rejected_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "source_type" "lead_source_type" DEFAULT 'DIGITAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "source_detail" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "creation_method" text DEFAULT 'WEBSITE_GATE' NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "import_batch_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "lead_call_events" ADD CONSTRAINT "lead_call_events_call_id_lead_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."lead_calls"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_calls" ADD CONSTRAINT "lead_calls_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lead_call_events_idempotency_key" ON "lead_call_events" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE INDEX "lead_call_events_call_idx" ON "lead_call_events" USING btree ("call_id","occurred_at");--> statement-breakpoint
CREATE INDEX "lead_calls_lead_idx" ON "lead_calls" USING btree ("lead_id","initiated_at");--> statement-breakpoint
CREATE INDEX "lead_calls_staff_idx" ON "lead_calls" USING btree ("staff_user_id","initiated_at");--> statement-breakpoint
CREATE INDEX "lead_calls_initiated_idx" ON "lead_calls" USING btree ("initiated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_calls_provider_call_key" ON "lead_calls" USING btree ("provider","provider_call_id") WHERE "lead_calls"."provider_call_id" is not null;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_import_batch_id_lead_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."lead_import_batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leads_source_idx" ON "leads" USING btree ("source_type","creation_method");--> statement-breakpoint
CREATE INDEX "leads_import_batch_idx" ON "leads" USING btree ("import_batch_id") WHERE "leads"."import_batch_id" is not null;
--> statement-breakpoint
-- Existing leads all came through the website gate, so the column defaults (DIGITAL / WEBSITE_GATE) are correct for
-- every row already in the table; nothing is rewritten here.

-- lead_call_events: the provider's raw evidence — never edited, never deleted.
CREATE OR REPLACE FUNCTION prevent_call_event_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'lead_call_events is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER lead_call_events_append_only
BEFORE UPDATE OR DELETE ON lead_call_events
FOR EACH ROW EXECUTE FUNCTION prevent_call_event_mutation();
--> statement-breakpoint

-- lead_calls: never deleted; identity never changes; a finished call's outcome (status, answered/ended times,
-- duration) never changes; a disposition, once set, never changes. The application enforces the same rules — this
-- makes a bug unable to rewrite what the provider reported.
CREATE OR REPLACE FUNCTION guard_lead_call_mutation()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'lead_calls is append-only: DELETE is not permitted';
  END IF;
  IF NEW.id <> OLD.id OR NEW.lead_id <> OLD.lead_id OR NEW.staff_user_id <> OLD.staff_user_id
     OR NEW.direction <> OLD.direction OR NEW.source <> OLD.source OR NEW.provider <> OLD.provider
     OR NEW.initiated_at <> OLD.initiated_at OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'lead_calls: identity columns are immutable';
  END IF;
  IF OLD.provider_call_id IS NOT NULL AND NEW.provider_call_id IS DISTINCT FROM OLD.provider_call_id THEN
    RAISE EXCEPTION 'lead_calls: provider_call_id is immutable once set';
  END IF;
  IF OLD.status IN ('COMPLETED', 'NO_ANSWER', 'BUSY', 'FAILED', 'REJECTED')
     AND (NEW.status <> OLD.status OR NEW.answered_at IS DISTINCT FROM OLD.answered_at
          OR NEW.ended_at IS DISTINCT FROM OLD.ended_at OR NEW.duration_seconds IS DISTINCT FROM OLD.duration_seconds) THEN
    RAISE EXCEPTION 'lead_calls: a finished call cannot be changed';
  END IF;
  IF OLD.disposition IS NOT NULL
     AND (NEW.disposition IS DISTINCT FROM OLD.disposition OR NEW.disposition_by IS DISTINCT FROM OLD.disposition_by
          OR NEW.disposition_at IS DISTINCT FROM OLD.disposition_at) THEN
    RAISE EXCEPTION 'lead_calls: a disposition cannot be changed once set';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER lead_calls_guard
BEFORE UPDATE OR DELETE ON lead_calls
FOR EACH ROW EXECUTE FUNCTION guard_lead_call_mutation();
