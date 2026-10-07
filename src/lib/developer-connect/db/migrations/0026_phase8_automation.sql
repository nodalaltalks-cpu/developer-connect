ALTER TYPE "public"."notification_type" ADD VALUE 'SITE_VISIT_DUE';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'LEAD_STALE';--> statement-breakpoint
CREATE TABLE "automation_actions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"rule" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_actions_status_ck" CHECK ("automation_actions"."status" in ('PENDING', 'DONE', 'FAILED', 'SKIPPED'))
);
--> statement-breakpoint
CREATE TABLE "automation_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"enabled" boolean NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "automation_actions_dedupe_key" ON "automation_actions" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "automation_actions_created_idx" ON "automation_actions" USING btree ("created_at");