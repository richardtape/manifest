ALTER TABLE "iam_registrations" ADD COLUMN "requested_attributes" jsonb;--> statement-breakpoint
ALTER TABLE "iam_registrations" ADD COLUMN "registered_at" timestamp with time zone;--> statement-breakpoint
-- P6b Task 7: APPENDED BY HAND — drizzle generates schema, not data. A registration already
-- active was registered; nothing else can be known, so a row in any other state stays null
-- and a launched app's live check reads it as never registered (the fail-closed direction).
UPDATE "iam_registrations" SET "registered_at" = "updated_at" WHERE "state" = 'active';
