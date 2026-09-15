-- P4b Task 14. `now()` is the TRANSACTION's start time, so every event one transaction
-- wrote carried the same `created_at`, and the event stream's replay — ordered by that
-- column — returned them in whatever order the index held. `clock_timestamp()` is the
-- moment of the insert. Existing rows keep the value they have. No grant changes:
-- manifest_app still holds exactly SELECT and INSERT on this table (0004).
ALTER TABLE "audit"."events" ALTER COLUMN "created_at" SET DEFAULT clock_timestamp();