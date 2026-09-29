-- The launch path plan's Task 2 (Decision 4), this comment HAND-ADDED to what drizzle generated:
-- WHICH GitHub made a project's repository — the API's host, `api.github.com` or the fake's
-- `127.0.0.1:7110` — written by `recordRepository` from the link the driver answered. A project
-- made against the fake is provider 'github' too, and after a restart onto the real App nothing
-- told the two apart. NULL for driver 1, and for EVERY ROW WRITTEN BEFORE THIS MIGRATION: no
-- backfill, because which GitHub made them was never recorded, and `repositoryOf` compares hosts
-- only when BOTH are known — so an older driver-2 row is answered by any GitHub, exactly as it
-- was before this column existed. Refusing it instead would strand every driver-2 project made
-- before today. Never published: `linkOf` leaves it out of `Project.repository`.
ALTER TABLE "source_repositories" ADD COLUMN "api_host" text;