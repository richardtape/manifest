CREATE TABLE "load_rehearsals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"release_id" uuid NOT NULL,
	"image_digest" text NOT NULL,
	"scale" text NOT NULL,
	"burst" text NOT NULL,
	"state" text DEFAULT 'running' NOT NULL,
	"profile" jsonb NOT NULL,
	"granted" jsonb,
	"generator_address" text,
	"evidence" jsonb,
	"run_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"taken_down_at" timestamp with time zone,
	CONSTRAINT "load_rehearsals_state_known" CHECK ("load_rehearsals"."state" IN ('running', 'passed', 'failed', 'teardown_failed', 'abandoned')),
	CONSTRAINT "load_rehearsals_scale_known" CHECK ("load_rehearsals"."scale" IN ('large_course', 'public')),
	CONSTRAINT "load_rehearsals_burst_known" CHECK ("load_rehearsals"."burst" IN ('steady', 'synchronised')),
	CONSTRAINT "load_rehearsals_finished" CHECK (("load_rehearsals"."state" = 'running') = ("load_rehearsals"."finished_at" IS NULL)),
	CONSTRAINT "load_rehearsals_passed_taken_down" CHECK ("load_rehearsals"."state" <> 'passed' OR "load_rehearsals"."taken_down_at" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "load_rehearsals" ADD CONSTRAINT "load_rehearsals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_rehearsals" ADD CONSTRAINT "load_rehearsals_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_rehearsals" ADD CONSTRAINT "load_rehearsals_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_rehearsals" ADD CONSTRAINT "load_rehearsals_run_by_users_id_fk" FOREIGN KEY ("run_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "load_rehearsals_project_idx" ON "load_rehearsals" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "load_rehearsals_one_running_idx" ON "load_rehearsals" USING btree ("state") WHERE "load_rehearsals"."state" = 'running';