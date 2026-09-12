-- developer_edit_events must be append-only: no code path in this codebase
-- updates or deletes a row here (see repository.ts, DeveloperEditEventRepository
-- exposes only `append`), but this trigger makes that a database guarantee
-- rather than a convention a future bug could silently break. Mirrors the
-- existing verification_events_append_only trigger exactly.

CREATE OR REPLACE FUNCTION prevent_developer_edit_event_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'developer_edit_events is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER developer_edit_events_append_only
BEFORE UPDATE OR DELETE ON developer_edit_events
FOR EACH ROW EXECUTE FUNCTION prevent_developer_edit_event_mutation();
