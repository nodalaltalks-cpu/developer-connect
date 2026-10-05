CREATE TYPE "public"."lead_temperature" AS ENUM('HOT', 'WARM', 'COLD');--> statement-breakpoint
ALTER TYPE "public"."lead_event_type" ADD VALUE 'TEMPERATURE_CHANGED';--> statement-breakpoint
ALTER TYPE "public"."lead_event_type" ADD VALUE 'OWNER_CHANGED';--> statement-breakpoint
ALTER TYPE "public"."lead_event_type" ADD VALUE 'FOLLOW_UP_COMPLETED';--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "temperature" "lead_temperature";--> statement-breakpoint
CREATE INDEX "leads_temperature_idx" ON "leads" USING btree ("temperature");