-- Lead source model cleanup and immutability. Additive and metadata-only: no table or column is dropped, no row is
-- rewritten, no row is deleted.
--
-- 1. The acquisition type "SELF_GENERATED" is renamed "COLD_CALL" (the only other value stays "DIGITAL"). RENAME VALUE
--    keeps every existing row and its meaning: every row that said SELF_GENERATED now says COLD_CALL. "COLD" stays
--    reserved for lead TEMPERATURE.
-- 2. Two new lead event types: WHATSAPP_OPENED (WhatsApp was opened to the lead; never a sent message) and
--    QUALIFICATION_RECORDED (a team member's qualification outcome and reason).
-- 3. Indexes: the live feed reads lead_events by seq; list views filter by source and owner.
-- 4. The original acquisition source can never change again, whoever asks: a Meta lead that is later called by hand
--    stays DIGITAL; a cold lead called twenty times stays COLD_CALL. first_touch_id may be set ONCE (it is attached just
--    after the lead row is created) and never changed afterwards.
ALTER TYPE "public"."lead_source_type" RENAME VALUE 'SELF_GENERATED' TO 'COLD_CALL';--> statement-breakpoint
ALTER TYPE "public"."lead_event_type" ADD VALUE 'WHATSAPP_OPENED';--> statement-breakpoint
ALTER TYPE "public"."lead_event_type" ADD VALUE 'QUALIFICATION_RECORDED';--> statement-breakpoint
CREATE INDEX "lead_events_seq_idx" ON "lead_events" USING btree ("seq");--> statement-breakpoint
CREATE INDEX "leads_source_owner_idx" ON "leads" USING btree ("source_type","owner_id","created_at");--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_lead_source_mutation()
RETURNS trigger AS $$
BEGIN
  IF NEW.source_type IS DISTINCT FROM OLD.source_type
     OR NEW.source_detail IS DISTINCT FROM OLD.source_detail
     OR NEW.creation_method IS DISTINCT FROM OLD.creation_method
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.import_batch_id IS DISTINCT FROM OLD.import_batch_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'leads: the original acquisition source and creation record are immutable';
  END IF;
  IF OLD.first_touch_id IS NOT NULL AND NEW.first_touch_id IS DISTINCT FROM OLD.first_touch_id THEN
    RAISE EXCEPTION 'leads: first-touch attribution is immutable once set';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER leads_source_guard
BEFORE UPDATE ON leads
FOR EACH ROW EXECUTE FUNCTION guard_lead_source_mutation();
