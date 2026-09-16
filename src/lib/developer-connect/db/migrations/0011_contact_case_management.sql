-- Contact Us Founder case-management upgrade.
--
-- 1) notification_type gains CONTACT_STATUS_UPDATE (simple ADD VALUE, same
--    pattern as migration 0006's FOUNDER_MESSAGE).
-- 2) contact_status is fully replaced: the old 4-value set
--    (NEW/READ/RESPONDED/CLOSED) cannot represent the new Founder workflow
--    (see schema.ts's comment on contactStatusEnum), and Postgres cannot
--    drop/rename enum VALUES in a single ALTER TYPE, so the type itself is
--    recreated and every existing row is cast forward with an explicit,
--    documented mapping — never silently reinterpreted.
-- 3) contact_history_event_type is new.
-- 4) contact_submissions gains deleted_at/deleted_by (soft-delete/Trash).
-- 5) contact_status_history is new, with the same append-only trigger
--    pattern as verification_events (0001) and developer_edit_events (0008).
-- 6) The one real existing row (Avinash, CLOSED) gets exactly one honest,
--    non-fabricated history entry documenting its carry-forward — not an
--    invented multi-entry history.

ALTER TYPE "public"."notification_type" ADD VALUE 'CONTACT_STATUS_UPDATE';--> statement-breakpoint

CREATE TYPE "public"."contact_history_event_type" AS ENUM('STATUS_CHANGE', 'TRASHED', 'RESTORED', 'PERMANENT_DELETE');--> statement-breakpoint

ALTER TYPE "public"."contact_status" RENAME TO "contact_status_old";--> statement-breakpoint

CREATE TYPE "public"."contact_status" AS ENUM('OPEN', 'IN_REVIEW', 'ON_HOLD', 'RESOLVED', 'REJECTED');--> statement-breakpoint

ALTER TABLE "contact_submissions" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint

ALTER TABLE "contact_submissions" ALTER COLUMN "status" TYPE "public"."contact_status" USING (
  CASE "status"::text
    WHEN 'NEW' THEN 'OPEN'
    WHEN 'READ' THEN 'IN_REVIEW'
    WHEN 'RESPONDED' THEN 'RESOLVED'
    WHEN 'CLOSED' THEN 'RESOLVED'
  END
)::"public"."contact_status";--> statement-breakpoint

ALTER TABLE "contact_submissions" ALTER COLUMN "status" SET DEFAULT 'OPEN';--> statement-breakpoint

DROP TYPE "public"."contact_status_old";--> statement-breakpoint

ALTER TABLE "contact_submissions" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contact_submissions" ADD COLUMN "deleted_by" text;--> statement-breakpoint
CREATE INDEX "contact_submissions_deleted_idx" ON "contact_submissions" USING btree ("deleted_at");--> statement-breakpoint

CREATE TABLE "contact_status_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"contact_submission_id" uuid NOT NULL,
	"event_type" "contact_history_event_type" DEFAULT 'STATUS_CHANGE' NOT NULL,
	"previous_status" "contact_status",
	"new_status" "contact_status",
	"note" text,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "contact_status_history_submission_idx" ON "contact_status_history" USING btree ("contact_submission_id");--> statement-breakpoint

CREATE OR REPLACE FUNCTION prevent_contact_status_history_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'contact_status_history is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER contact_status_history_append_only
BEFORE UPDATE OR DELETE ON contact_status_history
FOR EACH ROW EXECUTE FUNCTION prevent_contact_status_history_mutation();
--> statement-breakpoint

-- Honest, single-entry carry-forward note for every pre-existing row that
-- was CLOSED (now RESOLVED) at the time this migration ran — never a
-- fabricated multi-step history. previous_status is left NULL rather than
-- forced into the new vocabulary (the true prior value, legacy CLOSED, no
-- longer exists as a contact_status label); actor is SYSTEM because no
-- Founder action actually produced this specific row transition.
INSERT INTO "contact_status_history" ("id", "contact_submission_id", "event_type", "previous_status", "new_status", "note", "actor_type", "actor_id", "created_at")
SELECT gen_random_uuid(), "id", 'STATUS_CHANGE', NULL, 'RESOLVED', 'Carried over from the legacy CLOSED status during the Contact case-management migration (2026-09-16).', 'SYSTEM', 'system', "updated_at"
FROM "contact_submissions"
WHERE "status" = 'RESOLVED';
