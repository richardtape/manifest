\set ON_ERROR_STOP 0
BEGIN;
CREATE TYPE s AS ENUM ('draft','submitted');
CREATE TABLE t (state s NOT NULL DEFAULT 'draft', f text);
ALTER TYPE s ADD VALUE 'sent' BEFORE 'submitted';
ALTER TABLE t ADD CONSTRAINT c CHECK ((state::text = 'sent') = (f IS NOT NULL));
COMMIT;
SELECT enum_range(NULL::s);
INSERT INTO t (state, f) VALUES ('sent', 'x');
INSERT INTO t (state, f) VALUES ('sent', NULL);
INSERT INTO t (state, f) VALUES ('draft', NULL);
INSERT INTO t (state, f) VALUES ('draft', 'x');
SELECT state, f FROM t ORDER BY state;
SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'c';
