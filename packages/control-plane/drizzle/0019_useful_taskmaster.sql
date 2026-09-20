CREATE TYPE "public"."approval_decision" AS ENUM('approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."iam_registration_state" AS ENUM('draft', 'submitted', 'active', 'change_requested', 'expired');--> statement-breakpoint
CREATE TYPE "public"."privacy_assessment_state" AS ENUM('draft', 'submitted', 'approved');--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"release_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"decision" "approval_decision" NOT NULL,
	"decided_by" uuid NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	"image_digest" text NOT NULL,
	"reason" text,
	"diff_snapshot" jsonb NOT NULL,
	CONSTRAINT "approvals_rejection_has_reason" CHECK ("approvals"."decision" <> 'rejected' OR length(trim(coalesce("approvals"."reason", ''))) > 0)
);
--> statement-breakpoint
CREATE TABLE "iam_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"entity_id" text NOT NULL,
	"acs_url" text NOT NULL,
	"slo_url" text NOT NULL,
	"cert_fingerprint" text,
	"cert_expires_at" timestamp with time zone,
	"registered_attributes" jsonb NOT NULL,
	"state" "iam_registration_state" DEFAULT 'draft' NOT NULL,
	"external_ticket_ref" text,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "iam_registrations_project_id_unique" UNIQUE("project_id"),
	CONSTRAINT "iam_registrations_attributes_present" CHECK (jsonb_array_length("iam_registrations"."registered_attributes") > 0)
);
--> statement-breakpoint
CREATE TABLE "privacy_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"generated_draft" jsonb,
	"state" "privacy_assessment_state" DEFAULT 'draft' NOT NULL,
	"reviewer" text,
	"approved_at" timestamp with time zone,
	"external_ticket_ref" text,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "privacy_assessments_project_id_unique" UNIQUE("project_id")
);
--> statement-breakpoint
ALTER TABLE "audit"."events" DROP CONSTRAINT "events_type_known";--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam_registrations" ADD CONSTRAINT "iam_registrations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "iam_registrations" ADD CONSTRAINT "iam_registrations_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_assessments" ADD CONSTRAINT "privacy_assessments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_assessments" ADD CONSTRAINT "privacy_assessments_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approvals_release_idx" ON "approvals" USING btree ("release_id");--> statement-breakpoint
ALTER TABLE "audit"."events" ADD CONSTRAINT "events_type_known" CHECK ("audit"."events"."type" IN ('sso.registered', 'sso.acs_changed', 'build.started', 'build.succeeded', 'build.failed', 'instance.provisioning', 'instance.starting', 'instance.healthy', 'instance.failed', 'incident.opened', 'ai.key_rotated', 'instance.retiring', 'instance.retired', 'instance.retire_failed', 'project.created', 'repository.seeded', 'spec.validated', 'token.minted', 'pending_action.created', 'pending_action.confirmed', 'pending_action.rejected', 'iam_registration.recorded', 'privacy_assessment.recorded', 'rehearsal.completed', 'release.approved', 'release.approval_rejected'));