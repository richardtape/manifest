ALTER TABLE "audit"."events" DROP CONSTRAINT "events_type_known";--> statement-breakpoint
ALTER TABLE "source_repositories" ADD COLUMN "main_protected" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "source_repositories" ADD COLUMN "protection_detail" text;--> statement-breakpoint
ALTER TABLE "audit"."events" ADD CONSTRAINT "events_type_known" CHECK ("audit"."events"."type" IN ('sso.registered', 'sso.acs_changed', 'build.started', 'build.succeeded', 'build.failed', 'instance.provisioning', 'instance.starting', 'instance.healthy', 'instance.failed', 'incident.opened', 'ai.key_rotated', 'instance.retiring', 'instance.retired', 'instance.retire_failed', 'project.created', 'repository.seeded', 'spec.validated', 'token.minted', 'pending_action.created', 'pending_action.confirmed', 'pending_action.rejected', 'iam_registration.recorded', 'privacy_assessment.recorded', 'rehearsal.completed', 'release.approved', 'release.approval_rejected', 'project.launched', 'repository.pushed', 'repository.history_rewritten', 'repository.visibility_enforced', 'repository.secret_detected', 'repository.protection_unavailable'));--> statement-breakpoint
-- The D5 plan's Task 12, HAND-APPENDED to what drizzle generated: every driver-1 repository
-- is protected by git's own configuration (receive.denyNonFastForwards, receive.denyDeletes),
-- set at creation and re-set by prepare() at every boot, BEFORE the control plane listens —
-- so a row older than this migration is backfilled true. Driver-2 rows keep false: whether
-- GitHub protected them was never recorded, and a protection nobody saw is not claimed.
UPDATE "source_repositories" SET "main_protected" = true WHERE "provider" = 'local';
