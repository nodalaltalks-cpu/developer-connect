-- "Skip for now" in the calling queue is recorded (who and when), not a client-side trick, so the skipped count is real.
-- Additive: two nullable columns and a pair check. Nothing is rewritten and no row is deleted.
ALTER TABLE "calling_batch_items" ADD COLUMN "skipped_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "calling_batch_items" ADD COLUMN "skipped_by" text;--> statement-breakpoint
ALTER TABLE "calling_batch_items" ADD CONSTRAINT "calling_batch_items_skip_pair_ck" CHECK (("calling_batch_items"."skipped_at" is null) = ("calling_batch_items"."skipped_by" is null));
