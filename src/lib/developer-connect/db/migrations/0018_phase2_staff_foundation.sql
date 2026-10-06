CREATE TYPE "public"."staff_role" AS ENUM('EMPLOYEE', 'SALES_MANAGER', 'MANAGER');--> statement-breakpoint
ALTER TYPE "public"."lead_actor_type" ADD VALUE 'EMPLOYEE';--> statement-breakpoint
CREATE TABLE "staff_members" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"display_name" text NOT NULL,
	"email" text,
	"role" "staff_role" DEFAULT 'EMPLOYEE' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"deactivated_at" timestamp with time zone,
	"deactivated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_members_name_present_ck" CHECK (length(btrim("staff_members"."display_name")) > 0),
	CONSTRAINT "staff_members_deactivation_ck" CHECK ("staff_members"."active" or "staff_members"."deactivated_at" is not null)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "staff_members_user_id_key" ON "staff_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "staff_members_active_idx" ON "staff_members" USING btree ("active");--> statement-breakpoint
CREATE INDEX "leads_owner_idx" ON "leads" USING btree ("owner_id");