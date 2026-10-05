-- Immutability guarantees for the Revenue OS Phase 1 tables, enforced by the
-- database itself (same approach as migrations 0001 and 0008) so a future bug
-- cannot silently rewrite lead history or attribution.

-- lead_events: never deleted, never edited — with ONE narrow exception.
-- During an erasure request the application sets the transaction-local
-- setting `dc.allow_lead_erasure` to 'on' and may then rewrite `payload`
-- ONLY (to blank personal text such as notes). Every other column must be
-- unchanged, so the anonymous event skeleton (who/what/when/which developer/
-- status transition) always survives. DELETE is never allowed.
CREATE OR REPLACE FUNCTION prevent_lead_event_mutation()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'lead_events is append-only: DELETE is not permitted';
  END IF;

  IF TG_OP = 'UPDATE'
     AND current_setting('dc.allow_lead_erasure', true) = 'on'
     AND NEW.id = OLD.id
     AND NEW.lead_id = OLD.lead_id
     AND NEW.event_type = OLD.event_type
     AND NEW.actor_type = OLD.actor_type
     AND NEW.actor_id IS NOT DISTINCT FROM OLD.actor_id
     AND NEW.developer_id IS NOT DISTINCT FROM OLD.developer_id
     AND NEW.from_status IS NOT DISTINCT FROM OLD.from_status
     AND NEW.to_status IS NOT DISTINCT FROM OLD.to_status
     AND NEW.created_at = OLD.created_at
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'lead_events is append-only: % is not permitted (only payload redaction during an erasure)', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER lead_events_append_only
BEFORE UPDATE OR DELETE ON lead_events
FOR EACH ROW EXECUTE FUNCTION prevent_lead_event_mutation();
--> statement-breakpoint

-- marketing_touches: first-touch/latest-touch attribution points at these
-- rows, so they must never change or disappear.
CREATE OR REPLACE FUNCTION prevent_marketing_touch_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'marketing_touches is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER marketing_touches_append_only
BEFORE UPDATE OR DELETE ON marketing_touches
FOR EACH ROW EXECUTE FUNCTION prevent_marketing_touch_mutation();
--> statement-breakpoint

-- lead_consents: proof of consent is never deleted or rewritten. The only
-- permitted change is recording a withdrawal, once (withdrawn_at NULL -> value).
CREATE OR REPLACE FUNCTION prevent_lead_consent_mutation()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'lead_consents is append-only: DELETE is not permitted';
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.withdrawn_at IS NULL
     AND NEW.withdrawn_at IS NOT NULL
     AND NEW.id = OLD.id
     AND NEW.lead_id = OLD.lead_id
     AND NEW.purpose = OLD.purpose
     AND NEW.channel = OLD.channel
     AND NEW.text_version = OLD.text_version
     AND NEW.text_shown = OLD.text_shown
     AND NEW.given_at = OLD.given_at
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'lead_consents is append-only: % is not permitted (only recording a withdrawal, once)', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER lead_consents_append_only
BEFORE UPDATE OR DELETE ON lead_consents
FOR EACH ROW EXECUTE FUNCTION prevent_lead_consent_mutation();
