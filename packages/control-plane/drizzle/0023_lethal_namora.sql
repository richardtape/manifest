CREATE TABLE "approval_previews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"release_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"image_digest" text NOT NULL,
	"diff_snapshot" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN "preview_id" uuid;--> statement-breakpoint
ALTER TABLE "approval_previews" ADD CONSTRAINT "approval_previews_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_previews" ADD CONSTRAINT "approval_previews_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_previews" ADD CONSTRAINT "approval_previews_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approval_previews_release_idx" ON "approval_previews" USING btree ("release_id");--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_preview_id_approval_previews_id_fk" FOREIGN KEY ("preview_id") REFERENCES "public"."approval_previews"("id") ON DELETE no action ON UPDATE no action;