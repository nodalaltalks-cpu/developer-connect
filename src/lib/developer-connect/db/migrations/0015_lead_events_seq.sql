-- lead_events needs a deterministic order. Every event written in one request
-- shares a timestamp, so (created_at, id) ordered a lead's timeline by random
-- UUID within a request. `seq` is an identity column — the exact insertion
-- order — used as the tie-breaker. Additive; the append-only trigger (0014)
-- already ignores columns it does not name, so redaction/immutability are unchanged.

ALTER TABLE "lead_events" ADD COLUMN "seq" bigint NOT NULL GENERATED ALWAYS AS IDENTITY (sequence name "lead_events_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1);