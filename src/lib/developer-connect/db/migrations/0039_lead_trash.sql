ALTER TYPE "public"."lead_event_type" ADD VALUE 'LEAD_TRASHED' BEFORE 'CALL_PLACED';--> statement-breakpoint
ALTER TYPE "public"."lead_event_type" ADD VALUE 'LEAD_RESTORED' BEFORE 'CALL_PLACED';--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "trashed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "leads_trashed_idx" ON "leads" USING btree ("trashed_at") WHERE "leads"."trashed_at" is not null;