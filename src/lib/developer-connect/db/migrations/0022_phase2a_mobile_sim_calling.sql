CREATE TYPE "public"."call_classification" AS ENUM('DIALED', 'CONNECTED');--> statement-breakpoint
ALTER TYPE "public"."call_disposition" ADD VALUE 'NO_ANSWER';--> statement-breakpoint
ALTER TYPE "public"."call_disposition" ADD VALUE 'BUSY';--> statement-breakpoint
CREATE TABLE "calling_batch_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"batch_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calling_batches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_by" text NOT NULL,
	"assigned_to" text NOT NULL,
	"import_batch_id" uuid,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calling_batches_status_ck" CHECK ("calling_batches"."status" in ('ACTIVE', 'CLOSED'))
);
--> statement-breakpoint
ALTER TABLE "lead_calls" ADD COLUMN "classification" "call_classification";--> statement-breakpoint
ALTER TABLE "lead_calls" ADD COLUMN "method" text DEFAULT 'PROVIDER' NOT NULL;--> statement-breakpoint
ALTER TABLE "lead_calls" ADD COLUMN "batch_id" uuid;--> statement-breakpoint
ALTER TABLE "lead_calls" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lead_calls" ADD COLUMN "device_ref" text;--> statement-breakpoint
ALTER TABLE "lead_calls" ADD COLUMN "sim_ref" text;--> statement-breakpoint
ALTER TABLE "lead_calls" ADD COLUMN "call_log_ref" text;--> statement-breakpoint
ALTER TABLE "lead_calls" ADD COLUMN "reported_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "calling_batch_items" ADD CONSTRAINT "calling_batch_items_batch_id_calling_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."calling_batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calling_batch_items" ADD CONSTRAINT "calling_batch_items_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calling_batches" ADD CONSTRAINT "calling_batches_import_batch_id_lead_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."lead_import_batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "calling_batch_items_batch_lead_key" ON "calling_batch_items" USING btree ("batch_id","lead_id");--> statement-breakpoint
CREATE INDEX "calling_batch_items_order_idx" ON "calling_batch_items" USING btree ("batch_id","position");--> statement-breakpoint
CREATE INDEX "calling_batches_assignee_idx" ON "calling_batches" USING btree ("assigned_to","status");--> statement-breakpoint
ALTER TABLE "lead_calls" ADD CONSTRAINT "lead_calls_batch_id_calling_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."calling_batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_calls_batch_idx" ON "lead_calls" USING btree ("batch_id") WHERE "lead_calls"."batch_id" is not null;--> statement-breakpoint
CREATE INDEX "lead_calls_classification_idx" ON "lead_calls" USING btree ("staff_user_id","classification","initiated_at");
--> statement-breakpoint
-- Classification for calls recorded before this migration, by the SAME business rule the application applies:
-- a completed call of more than 10 seconds is CONNECTED, anything else that reached the other end is DIALED, and a
-- call that failed to place is not classified. (Only writes the new column; no existing value is changed.)
UPDATE "lead_calls" SET "classification" = CASE
  WHEN "status" = 'COMPLETED' AND coalesce("duration_seconds", 0) > 10 THEN 'CONNECTED'::"call_classification"
  WHEN "status" IN ('COMPLETED', 'NO_ANSWER', 'BUSY', 'REJECTED') THEN 'DIALED'::"call_classification"
  ELSE NULL END
WHERE "classification" IS NULL;
--> statement-breakpoint

-- The guard from 0021, extended: the device-reported fields and the classification are written once and never change.
CREATE OR REPLACE FUNCTION guard_lead_call_mutation()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'lead_calls is append-only: DELETE is not permitted';
  END IF;
  IF NEW.id <> OLD.id OR NEW.lead_id <> OLD.lead_id OR NEW.staff_user_id <> OLD.staff_user_id
     OR NEW.direction <> OLD.direction OR NEW.source <> OLD.source OR NEW.provider <> OLD.provider
     OR NEW.method <> OLD.method OR NEW.initiated_at <> OLD.initiated_at OR NEW.created_at <> OLD.created_at
     OR NEW.batch_id IS DISTINCT FROM OLD.batch_id THEN
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
  IF OLD.classification IS NOT NULL AND NEW.classification IS DISTINCT FROM OLD.classification THEN
    RAISE EXCEPTION 'lead_calls: the classification cannot be changed once set';
  END IF;
  IF OLD.reported_at IS NOT NULL
     AND (NEW.started_at IS DISTINCT FROM OLD.started_at OR NEW.device_ref IS DISTINCT FROM OLD.device_ref
          OR NEW.sim_ref IS DISTINCT FROM OLD.sim_ref OR NEW.call_log_ref IS DISTINCT FROM OLD.call_log_ref
          OR NEW.reported_at IS DISTINCT FROM OLD.reported_at) THEN
    RAISE EXCEPTION 'lead_calls: a device report cannot be changed once received';
  END IF;
  IF OLD.disposition IS NOT NULL
     AND (NEW.disposition IS DISTINCT FROM OLD.disposition OR NEW.disposition_by IS DISTINCT FROM OLD.disposition_by
          OR NEW.disposition_at IS DISTINCT FROM OLD.disposition_at) THEN
    RAISE EXCEPTION 'lead_calls: a disposition cannot be changed once set';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
