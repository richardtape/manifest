CREATE TABLE "approval_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"release_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"requested_by_token" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_requests_release_id_unique" UNIQUE("release_id"),
	CONSTRAINT "approval_requests_note_length" CHECK ("approval_requests"."note" IS NULL OR length("approval_requests"."note") <= 500)
);
--> statement-breakpoint
ALTER TABLE "audit"."events" DROP CONSTRAINT "events_type_known";--> statement-breakpoint
ALTER TABLE "iam_registrations" ADD COLUMN "change_requested_from" text;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_requested_by_token_delegated_tokens_id_fk" FOREIGN KEY ("requested_by_token") REFERENCES "public"."delegated_tokens"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approval_requests_project_idx" ON "approval_requests" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "audit"."events" ADD CONSTRAINT "events_type_known" CHECK ("audit"."events"."type" IN ('sso.registered', 'sso.acs_changed', 'build.started', 'build.succeeded', 'build.failed', 'instance.provisioning', 'instance.starting', 'instance.healthy', 'instance.failed', 'incident.opened', 'ai.key_rotated', 'instance.retiring', 'instance.retired', 'instance.retire_failed', 'project.created', 'repository.seeded', 'spec.validated', 'token.minted', 'pending_action.created', 'pending_action.confirmed', 'pending_action.rejected', 'iam_registration.recorded', 'privacy_assessment.recorded', 'iam_registration.submitted', 'privacy_assessment.submitted', 'iam_registration.drafted', 'privacy_assessment.drafted', 'rehearsal.completed', 'release.approved', 'release.approval_rejected', 'approval.requested', 'project.launched', 'repository.pushed', 'repository.history_rewritten', 'repository.visibility_enforced', 'repository.secret_detected', 'repository.scan_incomplete', 'repository.protection_unavailable', 'repository.committed', 'repository.secret_refused', 'app_secret.set', 'app_secret.cleared', 'project.renamed', 'member.added', 'member.removed', 'agent_session.started', 'agent_session.narrowed', 'agent_session.ended', 'sso.deregistered', 'project.archived', 'project.restored', 'project.deleted'));--> statement-breakpoint
-- The launch path plan's Task 12, HAND-PLACED before the CHECK it must satisfy (drizzle generates schema,
-- not data; 0022's and 0028's precedent). A registration already `change_requested` says where it came
-- from: one UBC never registered can only have come from `submitted` (UBC asked the owner for changes);
-- one it registered came from `active` (an administrator filed a change request) — except one UBC
-- questioned again after a filed request went back to `submitted`, which nothing recorded and this reads
-- as filed: it stays in the administrators' queue, the side a person sees and corrects.
UPDATE "iam_registrations" SET "change_requested_from" = CASE WHEN "registered_at" IS NULL THEN 'submitted' ELSE 'active' END WHERE "state" = 'change_requested';--> statement-breakpoint
ALTER TABLE "iam_registrations" ADD CONSTRAINT "iam_registrations_change_requested_from" CHECK (("iam_registrations"."state" = 'change_requested') = ("iam_registrations"."change_requested_from" IS NOT NULL) AND ("iam_registrations"."change_requested_from" IS NULL OR "iam_registrations"."change_requested_from" IN ('submitted', 'active')));