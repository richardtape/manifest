CREATE TABLE "agent_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"requested_by_token" uuid,
	"name" text NOT NULL,
	"models" jsonb NOT NULL,
	"cap_usd" numeric(12, 6) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"end_reason" text,
	"spent_usd" numeric(12, 6),
	CONSTRAINT "agent_sessions_end_reason_known" CHECK ("agent_sessions"."end_reason" IS NULL OR "agent_sessions"."end_reason" IN ('ended', 'token_revoked', 'project_archived', 'project_deleted')),
	CONSTRAINT "agent_sessions_ended_with_reason" CHECK (("agent_sessions"."ended_at" IS NULL) = ("agent_sessions"."end_reason" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "audit"."events" DROP CONSTRAINT "events_type_known";--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_requested_by_token_delegated_tokens_id_fk" FOREIGN KEY ("requested_by_token") REFERENCES "public"."delegated_tokens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_sessions_project_idx" ON "agent_sessions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "agent_sessions_token_idx" ON "agent_sessions" USING btree ("requested_by_token");--> statement-breakpoint
ALTER TABLE "audit"."events" ADD CONSTRAINT "events_type_known" CHECK ("audit"."events"."type" IN ('sso.registered', 'sso.acs_changed', 'build.started', 'build.succeeded', 'build.failed', 'instance.provisioning', 'instance.starting', 'instance.healthy', 'instance.failed', 'incident.opened', 'ai.key_rotated', 'instance.retiring', 'instance.retired', 'instance.retire_failed', 'project.created', 'repository.seeded', 'spec.validated', 'token.minted', 'pending_action.created', 'pending_action.confirmed', 'pending_action.rejected', 'iam_registration.recorded', 'privacy_assessment.recorded', 'rehearsal.completed', 'release.approved', 'release.approval_rejected', 'project.launched', 'repository.pushed', 'repository.history_rewritten', 'repository.visibility_enforced', 'repository.secret_detected', 'repository.scan_incomplete', 'repository.protection_unavailable', 'repository.committed', 'repository.secret_refused', 'app_secret.set', 'app_secret.cleared', 'project.renamed', 'member.added', 'member.removed', 'agent_session.started', 'agent_session.ended'));