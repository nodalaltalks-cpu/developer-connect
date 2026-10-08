-- Employee identity and lifecycle. Additive: no table or column is dropped, no row is deleted. One check constraint
-- (staff_members_deactivation_ck) is replaced by a version that also allows INVITED people, who are not active but were
-- never deactivated. Existing staff rows are backfilled below (production has none; the test database has some).
CREATE TYPE "public"."staff_status" AS ENUM('INVITED', 'ACTIVE', 'INACTIVE', 'EXITED');--> statement-breakpoint
ALTER TABLE "staff_members" ADD COLUMN "employee_id" text;--> statement-breakpoint
ALTER TABLE "staff_members" ADD COLUMN "status" "staff_status" DEFAULT 'ACTIVE' NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_members" ADD COLUMN "joined_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "staff_members" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "staff_members" ADD COLUMN "approved_by" text;--> statement-breakpoint
ALTER TABLE "staff_members" ADD COLUMN "exited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "staff_members" ADD COLUMN "exited_by" text;--> statement-breakpoint
ALTER TABLE "staff_members" ADD COLUMN "exit_reason" text;--> statement-breakpoint
-- Backfill existing members: they were added by the Founder and active or inactive, so they are ACTIVE/INACTIVE and
-- already approved. IDs are handed out in the order they joined, starting at DC2 (DC1 is the Founder).
UPDATE "staff_members" SET "status" = CASE WHEN "active" THEN 'ACTIVE'::"staff_status" ELSE 'INACTIVE'::"staff_status" END,
  "joined_at" = "created_at", "approved_at" = "created_at", "approved_by" = "created_by";--> statement-breakpoint
UPDATE "staff_members" s SET "employee_id" = 'DC' || (1 + o.rn)
  FROM (SELECT "id", row_number() OVER (ORDER BY "created_at", "id") AS rn FROM "staff_members") o WHERE s."id" = o."id";--> statement-breakpoint
ALTER TABLE "staff_members" ALTER COLUMN "employee_id" SET NOT NULL;--> statement-breakpoint
-- The allocator. A sequence never hands out the same number twice, even under concurrency and even if a row is rolled
-- back or later exits, so an ID is never reused. It continues after the highest number already given.
CREATE SEQUENCE "staff_employee_number_seq" START WITH 2 MINVALUE 2;--> statement-breakpoint
SELECT setval('staff_employee_number_seq', GREATEST(2, 2 + (SELECT count(*) FROM "staff_members")), false);--> statement-breakpoint
ALTER TABLE "staff_members" DROP CONSTRAINT "staff_members_deactivation_ck";--> statement-breakpoint
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_deactivation_ck" CHECK ("staff_members"."active" or "staff_members"."status" = 'INVITED' or "staff_members"."deactivated_at" is not null);--> statement-breakpoint
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_employee_id_ck" CHECK ("staff_members"."employee_id" ~ '^DC[1-9][0-9]*$');--> statement-breakpoint
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_active_status_ck" CHECK ("staff_members"."active" = ("staff_members"."status" = 'ACTIVE'));--> statement-breakpoint
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_exit_ck" CHECK (("staff_members"."status" = 'EXITED') = ("staff_members"."exited_at" is not null));--> statement-breakpoint
CREATE UNIQUE INDEX "staff_members_employee_id_key" ON "staff_members" USING btree ("employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_members_email_live_key" ON "staff_members" USING btree (lower("email")) WHERE "staff_members"."email" is not null and "staff_members"."status" <> 'EXITED';--> statement-breakpoint
CREATE INDEX "staff_members_status_idx" ON "staff_members" USING btree ("status");--> statement-breakpoint
CREATE TABLE "staff_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"staff_id" uuid NOT NULL,
	"employee_id" text NOT NULL,
	"event_type" text NOT NULL,
	"actor_id" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "staff_events_type_ck" CHECK ("staff_events"."event_type" in ('EMPLOYEE_INVITED', 'EMPLOYEE_APPROVED', 'EMPLOYEE_ACTIVATED', 'EMPLOYEE_DEACTIVATED', 'EMPLOYEE_REACTIVATED', 'EMPLOYEE_EXITED', 'EMPLOYEE_EMAIL_CHANGED'))
);--> statement-breakpoint
ALTER TABLE "staff_events" ADD CONSTRAINT "staff_events_staff_id_staff_members_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_events_staff_idx" ON "staff_events" USING btree ("staff_id","occurred_at");--> statement-breakpoint
CREATE INDEX "lead_events_actor_created_idx" ON "lead_events" USING btree ("actor_id","created_at");--> statement-breakpoint
-- The lifecycle log is evidence: never changed, never deleted.
CREATE OR REPLACE FUNCTION prevent_staff_event_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'staff_events is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER staff_events_append_only
BEFORE UPDATE OR DELETE ON staff_events
FOR EACH ROW EXECUTE FUNCTION prevent_staff_event_mutation();--> statement-breakpoint
-- A team member is never deleted; their employee ID and identity key never change (an invited person's placeholder
-- sign-in key may be replaced ONCE by their real one); an exited member is frozen for good.
CREATE OR REPLACE FUNCTION guard_staff_member_mutation()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'staff_members: DELETE is not permitted (a team member exits; their record is kept)';
  END IF;
  IF NEW.id <> OLD.id OR NEW.created_by <> OLD.created_by OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'staff_members: identity columns are immutable';
  END IF;
  IF NEW.employee_id <> OLD.employee_id THEN
    RAISE EXCEPTION 'staff_members: employee_id is immutable';
  END IF;
  IF NEW.user_id <> OLD.user_id AND OLD.user_id NOT LIKE 'invited:%' THEN
    RAISE EXCEPTION 'staff_members: the sign-in identity cannot be changed once linked';
  END IF;
  IF OLD.status = 'EXITED' THEN
    RAISE EXCEPTION 'staff_members: an exited team member cannot be changed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER staff_members_guard
BEFORE UPDATE OR DELETE ON staff_members
FOR EACH ROW EXECUTE FUNCTION guard_staff_member_mutation();
