-- A team member may fill in a lead's missing name or email (never overwrite one that exists). The fact is recorded on the
-- lead's immutable timeline. Additive: one new event type, nothing else.
ALTER TYPE "public"."lead_event_type" ADD VALUE 'CONTACT_DETAILS_UPDATED';
