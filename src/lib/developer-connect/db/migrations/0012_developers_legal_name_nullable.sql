-- Make developers.legal_name nullable so a newly discovered developer whose
-- registered legal entity is unknown is stored with NULL instead of an
-- invented name. Constraint-only: no existing row is read or rewritten.
ALTER TABLE "developers" ALTER COLUMN "legal_name" DROP NOT NULL;
