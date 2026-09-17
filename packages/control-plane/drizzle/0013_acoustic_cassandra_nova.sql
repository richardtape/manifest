CREATE TABLE "audit"."role_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"from_role" "user_role" NOT NULL,
	"to_role" "user_role" NOT NULL,
	"actor" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "role_changes_reason_present" CHECK (length(trim("audit"."role_changes"."reason")) > 0)
);
--> statement-breakpoint
ALTER TABLE "audit"."role_changes" ADD CONSTRAINT "role_changes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- §20's append-only rule for role changes (P5a Task 16), exactly as 0004–0006 apply it: the
-- application role may read and add a row and never rewrite or remove one, and ON DELETE
-- restrict above closes the route through `users`.
GRANT SELECT, INSERT ON "audit"."role_changes" TO manifest_app;
