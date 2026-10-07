CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"utm_campaign" text NOT NULL,
	"utm_source" text,
	"utm_medium" text,
	"landing_page" text,
	"start_date" text,
	"end_date" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaigns_status_ck" CHECK ("campaigns"."status" in ('ACTIVE', 'PAUSED', 'ENDED')),
	CONSTRAINT "campaigns_dates_ck" CHECK ("campaigns"."start_date" is null or "campaigns"."end_date" is null or "campaigns"."end_date" >= "campaigns"."start_date")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "campaigns_utm_campaign_key" ON "campaigns" USING btree (lower("utm_campaign"));--> statement-breakpoint
-- FIRST TOUCH IS NEVER OVERWRITTEN. The touches themselves are already immutable (migration 0014); this makes the lead's
-- pointer to its first touch write-once as well, so no application bug can re-attribute a lead.
CREATE OR REPLACE FUNCTION guard_lead_first_touch()
RETURNS trigger AS $$
BEGIN
  IF OLD.first_touch_id IS NOT NULL AND NEW.first_touch_id IS DISTINCT FROM OLD.first_touch_id THEN
    RAISE EXCEPTION 'leads: first_touch_id is immutable once set';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER leads_first_touch_guard
BEFORE UPDATE ON leads
FOR EACH ROW EXECUTE FUNCTION guard_lead_first_touch();
