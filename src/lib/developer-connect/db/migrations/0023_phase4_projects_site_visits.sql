CREATE TYPE "public"."site_visit_status" AS ENUM('SCHEDULED', 'CONFIRMED', 'COMPLETED', 'NO_SHOW', 'RESCHEDULED', 'CANCELLED');--> statement-breakpoint
ALTER TYPE "public"."lead_event_type" ADD VALUE 'PROJECT_SHORTLISTED';--> statement-breakpoint
ALTER TYPE "public"."lead_event_type" ADD VALUE 'PROJECT_SHORTLIST_REMOVED';--> statement-breakpoint
ALTER TYPE "public"."lead_event_type" ADD VALUE 'SITE_VISIT_SCHEDULED';--> statement-breakpoint
ALTER TYPE "public"."lead_event_type" ADD VALUE 'SITE_VISIT_UPDATED';--> statement-breakpoint
CREATE TABLE "lead_project_shortlist" (
	"id" uuid PRIMARY KEY NOT NULL,
	"lead_id" uuid NOT NULL,
	"requirement_id" uuid,
	"project_id" uuid NOT NULL,
	"shortlisted_by" text NOT NULL,
	"shortlisted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_by" text,
	"removed_at" timestamp with time zone,
	CONSTRAINT "lead_project_shortlist_removed_ck" CHECK (("lead_project_shortlist"."removed_at" is null) = ("lead_project_shortlist"."removed_by" is null))
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"developer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"locality" text,
	"property_type" text,
	"configurations" text[] DEFAULT '{}'::text[] NOT NULL,
	"price_min" bigint,
	"price_max" bigint,
	"currency" "lead_currency",
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_status_ck" CHECK ("projects"."status" in ('ACTIVE', 'INACTIVE')),
	CONSTRAINT "projects_price_ck" CHECK (("projects"."price_min" is null or "projects"."price_min" >= 0) and ("projects"."price_max" is null or "projects"."price_max" >= 0) and ("projects"."price_min" is null or "projects"."price_max" is null or "projects"."price_min" <= "projects"."price_max")),
	CONSTRAINT "projects_currency_ck" CHECK (("projects"."price_min" is null and "projects"."price_max" is null) or "projects"."currency" is not null)
);
--> statement-breakpoint
CREATE TABLE "site_visit_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"visit_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"actor_type" "lead_actor_type" NOT NULL,
	"actor_id" text,
	"from_status" "site_visit_status",
	"to_status" "site_visit_status",
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_visits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"lead_id" uuid NOT NULL,
	"requirement_id" uuid,
	"project_id" uuid,
	"staff_user_id" text NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"status" "site_visit_status" DEFAULT 'SCHEDULED' NOT NULL,
	"confirmed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"outcome" text,
	"next_action" text,
	"notes" text,
	"rescheduled_from" uuid,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_visits_outcome_ck" CHECK ("site_visits"."outcome" is null or "site_visits"."outcome" in ('INTERESTED', 'NEEDS_ANOTHER_VISIT', 'NEGOTIATING', 'NOT_INTERESTED', 'OTHER'))
);
--> statement-breakpoint
ALTER TABLE "lead_project_shortlist" ADD CONSTRAINT "lead_project_shortlist_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_project_shortlist" ADD CONSTRAINT "lead_project_shortlist_requirement_id_lead_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."lead_requirements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_project_shortlist" ADD CONSTRAINT "lead_project_shortlist_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_developer_id_developers_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."developers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_visit_events" ADD CONSTRAINT "site_visit_events_visit_id_site_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."site_visits"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_visits" ADD CONSTRAINT "site_visits_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_visits" ADD CONSTRAINT "site_visits_requirement_id_lead_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."lead_requirements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_visits" ADD CONSTRAINT "site_visits_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_visits" ADD CONSTRAINT "site_visits_rescheduled_from_site_visits_id_fk" FOREIGN KEY ("rescheduled_from") REFERENCES "public"."site_visits"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lead_project_shortlist_active_key" ON "lead_project_shortlist" USING btree ("lead_id","project_id") WHERE "lead_project_shortlist"."removed_at" is null;--> statement-breakpoint
CREATE INDEX "lead_project_shortlist_lead_idx" ON "lead_project_shortlist" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "lead_project_shortlist_project_idx" ON "lead_project_shortlist" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_developer_name_key" ON "projects" USING btree ("developer_id",lower("name"));--> statement-breakpoint
CREATE INDEX "projects_city_idx" ON "projects" USING btree ("city");--> statement-breakpoint
CREATE INDEX "site_visit_events_visit_idx" ON "site_visit_events" USING btree ("visit_id","created_at");--> statement-breakpoint
CREATE INDEX "site_visits_lead_idx" ON "site_visits" USING btree ("lead_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "site_visits_staff_idx" ON "site_visits" USING btree ("staff_user_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "site_visits_status_idx" ON "site_visits" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "site_visits_open_key" ON "site_visits" USING btree ("lead_id",coalesce("project_id", '00000000-0000-0000-0000-000000000000'::uuid)) WHERE "site_visits"."status" in ('SCHEDULED', 'CONFIRMED');--> statement-breakpoint
-- Immutability (additive; no existing data touched). Site-visit events are evidence: never changed, never deleted.
CREATE OR REPLACE FUNCTION prevent_site_visit_event_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'site_visit_events is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER site_visit_events_append_only
BEFORE UPDATE OR DELETE ON site_visit_events
FOR EACH ROW EXECUTE FUNCTION prevent_site_visit_event_mutation();
--> statement-breakpoint
-- A site visit: never deleted; who/what it is about never changes; a finished visit (completed, no-show, rescheduled,
-- cancelled) is frozen. A reschedule is a NEW row pointing back, not an edit.
CREATE OR REPLACE FUNCTION guard_site_visit_mutation()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'site_visits: DELETE is not permitted';
  END IF;
  IF NEW.id <> OLD.id OR NEW.lead_id <> OLD.lead_id OR NEW.created_by <> OLD.created_by OR NEW.created_at <> OLD.created_at
     OR NEW.staff_user_id <> OLD.staff_user_id
     OR NEW.project_id IS DISTINCT FROM OLD.project_id OR NEW.requirement_id IS DISTINCT FROM OLD.requirement_id
     OR NEW.rescheduled_from IS DISTINCT FROM OLD.rescheduled_from THEN
    RAISE EXCEPTION 'site_visits: identity columns are immutable';
  END IF;
  IF OLD.status IN ('COMPLETED', 'NO_SHOW', 'RESCHEDULED', 'CANCELLED') THEN
    -- The one permitted change to a finished visit: erasing a buyer's data clears the free text (notes, next action).
    IF NEW.notes IS NULL AND NEW.next_action IS NULL AND NEW.status = OLD.status AND NEW.scheduled_at = OLD.scheduled_at
       AND NEW.outcome IS NOT DISTINCT FROM OLD.outcome AND NEW.completed_at IS NOT DISTINCT FROM OLD.completed_at
       AND NEW.confirmed_at IS NOT DISTINCT FROM OLD.confirmed_at THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'site_visits: a finished site visit cannot be changed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER site_visits_guard
BEFORE UPDATE OR DELETE ON site_visits
FOR EACH ROW EXECUTE FUNCTION guard_site_visit_mutation();
--> statement-breakpoint
-- The shortlist keeps its history: rows are never deleted; only the removal columns may be set, once.
CREATE OR REPLACE FUNCTION guard_shortlist_mutation()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'lead_project_shortlist: DELETE is not permitted';
  END IF;
  IF NEW.id <> OLD.id OR NEW.lead_id <> OLD.lead_id OR NEW.project_id <> OLD.project_id
     OR NEW.requirement_id IS DISTINCT FROM OLD.requirement_id OR NEW.shortlisted_by <> OLD.shortlisted_by OR NEW.shortlisted_at <> OLD.shortlisted_at THEN
    RAISE EXCEPTION 'lead_project_shortlist: identity columns are immutable';
  END IF;
  IF OLD.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'lead_project_shortlist: a removed entry cannot be changed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER lead_project_shortlist_guard
BEFORE UPDATE OR DELETE ON lead_project_shortlist
FOR EACH ROW EXECUTE FUNCTION guard_shortlist_mutation();
