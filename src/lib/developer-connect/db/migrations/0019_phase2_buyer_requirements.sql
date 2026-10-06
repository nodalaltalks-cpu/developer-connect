CREATE TYPE "public"."requirement_status" AS ENUM('ACTIVE', 'FULFILLED', 'ON_HOLD', 'CLOSED');--> statement-breakpoint
ALTER TYPE "public"."lead_event_type" ADD VALUE 'REQUIREMENT_CREATED';--> statement-breakpoint
ALTER TYPE "public"."lead_event_type" ADD VALUE 'REQUIREMENT_STATUS_CHANGED';--> statement-breakpoint
CREATE TABLE "lead_requirement_locations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"requirement_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "lead_requirement_locations_name_ck" CHECK (length(btrim("lead_requirement_locations"."name")) > 0 and length(btrim("lead_requirement_locations"."name_key")) > 0)
);
--> statement-breakpoint
CREATE TABLE "lead_requirements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"lead_id" uuid NOT NULL,
	"status" "requirement_status" DEFAULT 'ACTIVE' NOT NULL,
	"property_type" text,
	"configuration" text,
	"budget_min" bigint,
	"budget_max" bigint,
	"budget_currency" "lead_currency",
	"purpose" "lead_purpose",
	"timeline" "lead_timeline",
	"notes" text,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_requirements_budget_range_ck" CHECK ("lead_requirements"."budget_min" is null or "lead_requirements"."budget_max" is null or "lead_requirements"."budget_min" <= "lead_requirements"."budget_max"),
	CONSTRAINT "lead_requirements_budget_nonneg_ck" CHECK (coalesce("lead_requirements"."budget_min", 0) >= 0 and coalesce("lead_requirements"."budget_max", 0) >= 0),
	CONSTRAINT "lead_requirements_budget_currency_ck" CHECK (("lead_requirements"."budget_min" is null and "lead_requirements"."budget_max" is null) or "lead_requirements"."budget_currency" is not null)
);
--> statement-breakpoint
ALTER TABLE "lead_requirement_locations" ADD CONSTRAINT "lead_requirement_locations_requirement_id_lead_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."lead_requirements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_requirements" ADD CONSTRAINT "lead_requirements_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lead_requirement_locations_unique_key" ON "lead_requirement_locations" USING btree ("requirement_id","name_key");--> statement-breakpoint
CREATE INDEX "lead_requirement_locations_key_idx" ON "lead_requirement_locations" USING btree ("name_key");--> statement-breakpoint
CREATE INDEX "lead_requirements_lead_idx" ON "lead_requirements" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_requirements_one_active_key" ON "lead_requirements" USING btree ("lead_id") WHERE "lead_requirements"."status" = 'ACTIVE';
--> statement-breakpoint
-- Backfill (additive, no existing row is changed): every live lead that already carries requirement data gets ONE
-- ACTIVE structured requirement built from the columns it already has. Erased leads are skipped (their location is gone).
INSERT INTO "lead_requirements" ("id", "lead_id", "status", "property_type", "configuration", "budget_min", "budget_max", "budget_currency", "purpose", "timeline", "created_by", "updated_by", "created_at", "updated_at")
SELECT gen_random_uuid(), l."id", 'ACTIVE', l."property_type", l."configuration", l."budget_min", l."budget_max", l."budget_currency", l."purpose", l."timeline", 'system:migration-0019', 'system:migration-0019', l."created_at", now()
FROM "leads" l
WHERE l."erased_at" IS NULL
  AND (l."location" IS NOT NULL OR l."property_type" IS NOT NULL OR l."configuration" IS NOT NULL OR l."budget_min" IS NOT NULL OR l."budget_max" IS NOT NULL OR l."purpose" IS NOT NULL OR l."timeline" IS NOT NULL);
--> statement-breakpoint
INSERT INTO "lead_requirement_locations" ("id", "requirement_id", "name", "name_key", "position")
SELECT gen_random_uuid(), r."id", btrim(l."location"),
  CASE WHEN lower(regexp_replace(btrim(l."location"), '\s+', ' ', 'g')) = 'bengaluru' THEN 'bangalore' ELSE lower(regexp_replace(btrim(l."location"), '\s+', ' ', 'g')) END,
  0
FROM "leads" l
JOIN "lead_requirements" r ON r."lead_id" = l."id" AND r."created_by" = 'system:migration-0019'
WHERE l."location" IS NOT NULL AND btrim(l."location") <> '';
