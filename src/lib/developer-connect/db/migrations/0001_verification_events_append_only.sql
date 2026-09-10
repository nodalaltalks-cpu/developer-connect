-- verification_events must be append-only: no code path in this codebase
-- updates or deletes a row here (see repository.ts, VerificationEventRepository
-- exposes only `append`), but this trigger makes that a database guarantee
-- rather than a convention a future bug could silently break.

CREATE OR REPLACE FUNCTION prevent_verification_event_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'verification_events is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER verification_events_append_only
BEFORE UPDATE OR DELETE ON verification_events
FOR EACH ROW EXECUTE FUNCTION prevent_verification_event_mutation();
