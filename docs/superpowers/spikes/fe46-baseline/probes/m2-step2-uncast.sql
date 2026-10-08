\set ON_ERROR_STOP 0
BEGIN;
CREATE TYPE s AS ENUM ('draft','submitted');
CREATE TABLE t (state s NOT NULL DEFAULT 'draft', f text);
ALTER TYPE s ADD VALUE 'sent' BEFORE 'submitted';
ALTER TABLE t ADD CONSTRAINT c CHECK ((state = 'sent') = (f IS NOT NULL));
COMMIT;
SELECT 'after step 2: type s exists?' AS q, count(*) FROM pg_type WHERE typname = 's';
