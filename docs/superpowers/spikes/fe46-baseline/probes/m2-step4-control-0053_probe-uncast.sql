CREATE TYPE "public"."fe46_s" AS ENUM('draft', 'submitted');--> statement-breakpoint
CREATE TABLE "fe46_t" ("state" "fe46_s" DEFAULT 'draft' NOT NULL, "f" text);--> statement-breakpoint
ALTER TYPE "public"."iam_registration_state" ADD VALUE 'sent' BEFORE 'submitted';--> statement-breakpoint
ALTER TYPE "public"."fe46_s" ADD VALUE 'sent' BEFORE 'submitted';--> statement-breakpoint
ALTER TABLE "fe46_t" ADD CONSTRAINT "fe46_c" CHECK (("fe46_t"."state" = 'sent') = ("fe46_t"."f" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "iam_registrations" ADD COLUMN "sent_from" text;--> statement-breakpoint
ALTER TABLE "iam_registrations" ADD CONSTRAINT "fe46_sent_from" CHECK (("iam_registrations"."state"::text = 'sent') = ("iam_registrations"."sent_from" IS NOT NULL));
