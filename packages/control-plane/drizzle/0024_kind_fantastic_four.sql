CREATE TABLE "source_repositories" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"full_name" text NOT NULL,
	"web_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_repositories_provider" CHECK ("source_repositories"."provider" in ('local', 'github'))
);
--> statement-breakpoint
ALTER TABLE "source_repositories" ADD CONSTRAINT "source_repositories_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- D5 plan, Task 8 — APPENDED BY HAND: drizzle writes schema, not data. Every project that
-- exists was made by driver 1, the only driver there was (Decision 3). Idempotent.
INSERT INTO "source_repositories" ("project_id", "provider", "full_name")
  SELECT "id", 'local', "slug" FROM "projects" ON CONFLICT DO NOTHING;
