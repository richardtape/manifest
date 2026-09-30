-- FE-38, the launch path plan's Task 4: WHEN THE DEPLOY MADE AN INSTANCE. Drizzle generated the
-- one-line `ADD COLUMN … DEFAULT now() NOT NULL`, which would have stamped every existing row with
-- the moment of this migration; HAND-WRITTEN here in three steps so an older instance is dated by
-- the release it runs instead. The backfill is the EARLIEST the instance could have been made (a
-- release exists before any deploy of it) — it is never later than the truth, and an instance
-- redeployed from the same release reads as old as the release. The snapshot carries the column
-- as generated, so `db:generate` after this reports no change.
ALTER TABLE "instances" ADD COLUMN "created_at" timestamp with time zone;--> statement-breakpoint
UPDATE "instances" i SET "created_at" = r."created_at" FROM "releases" r WHERE r."id" = i."release_id";--> statement-breakpoint
ALTER TABLE "instances" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "instances" ALTER COLUMN "created_at" SET DEFAULT now();
