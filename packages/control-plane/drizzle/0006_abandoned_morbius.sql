CREATE TABLE "audit"."incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instance_id" uuid NOT NULL,
	"exit_reason" text NOT NULL,
	"log_tail" text NOT NULL,
	"failed_check" text NOT NULL,
	"diff_since_healthy" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit"."incidents" ADD CONSTRAINT "incidents_instance_id_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."instances"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "incidents_instance_idx" ON "audit"."incidents" USING btree ("instance_id");
--> statement-breakpoint
-- §20's append-only rule, applied to §14's Incident (P4b Task 13), exactly as 0004 and
-- 0005 apply it to `events` and `build_logs`. The table is in the `audit` schema, where no
-- blanket grant reaches, so there is nothing to REVOKE and no owner to move. Two verbs: the
-- application role can neither rewrite an Incident nor delete one, and `ON DELETE restrict`
-- above closes the route through `instances`.
GRANT SELECT, INSERT ON "audit"."incidents" TO manifest_app;
