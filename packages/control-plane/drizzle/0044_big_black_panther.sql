ALTER TABLE "users" ADD COLUMN "affiliations" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "affiliations_seen_at" timestamp with time zone;