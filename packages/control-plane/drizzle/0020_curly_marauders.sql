CREATE TABLE "rehearsals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"release_id" uuid NOT NULL,
	"passed" boolean NOT NULL,
	"entity_id" text NOT NULL,
	"acs_url" text NOT NULL,
	"attributes" jsonb NOT NULL,
	"evidence" jsonb NOT NULL,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ran_by" uuid,
	CONSTRAINT "rehearsals_attributes_present" CHECK (jsonb_array_length("rehearsals"."attributes") > 0)
);
--> statement-breakpoint
ALTER TABLE "rehearsals" ADD CONSTRAINT "rehearsals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rehearsals" ADD CONSTRAINT "rehearsals_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rehearsals" ADD CONSTRAINT "rehearsals_ran_by_users_id_fk" FOREIGN KEY ("ran_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rehearsals_project_idx" ON "rehearsals" USING btree ("project_id");