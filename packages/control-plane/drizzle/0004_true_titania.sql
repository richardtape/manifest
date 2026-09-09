CREATE SCHEMA "audit";
--> statement-breakpoint
CREATE TABLE "audit"."events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"type" text NOT NULL,
	"machine_detail" jsonb NOT NULL,
	"human_message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit"."events" ADD CONSTRAINT "events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- §14: "Every Event carries a faculty-legible human_message alongside
-- machine_detail." The SECOND of two independent reads of that rule — recordEvent
-- carries the first — for the same reason ensure-idp-sql.sh puts §9's attributes
-- rule in a CHECK as well as in sso/. A rule enforced only by the code that
-- writes it is a rule the next writer can skip.
ALTER TABLE "audit"."events" ADD CONSTRAINT "events_human_message_present"
  CHECK (length(btrim("human_message")) > 0);--> statement-breakpoint
-- §20: append-only BY GRANT. These two lines are the whole control, and they are
-- only worth anything because the control plane connects as `manifest_app`, which
-- is not a superuser and owns nothing (infra/lib/ensure-app-role.sh). Against the
-- old `manifest` connection a REVOKE here would have read exactly like a control
-- and done nothing: measured, `REVOKE UPDATE, DELETE` then `UPDATE 1`, `DELETE 1`.
--
-- There is no REVOKE, because there is nothing to revoke: every blanket grant in
-- this repository is scoped `IN SCHEMA public` and this table is not in it.
-- Granting two verbs is stronger than granting four and taking two back, and it
-- cannot drift when a future script grants on public again.
GRANT USAGE ON SCHEMA "audit" TO manifest_app;--> statement-breakpoint
GRANT SELECT, INSERT ON "audit"."events" TO manifest_app;
