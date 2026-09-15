CREATE TABLE "audit"."build_logs" (
	"build_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"stream" text NOT NULL,
	"text" text NOT NULL,
	CONSTRAINT "build_logs_build_id_seq_pk" PRIMARY KEY("build_id","seq"),
	CONSTRAINT "build_logs_stream_known" CHECK ("audit"."build_logs"."stream" IN ('stdout', 'stderr'))
);
--> statement-breakpoint
ALTER TABLE "audit"."build_logs" ADD CONSTRAINT "build_logs_build_id_builds_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."builds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- §20's append-only rule, applied to the build log (P4b Task 11), exactly as 0004
-- applies it to `events`. The table is in the `audit` schema, where no blanket grant
-- reaches — every one in this repository is scoped `IN SCHEMA public` — so there is
-- nothing to REVOKE and no owner to move. `GRANT USAGE ON SCHEMA audit TO
-- manifest_app` is 0004's and is not repeated. Two verbs, and the application role
-- can neither rewrite a line nor delete one; `ON DELETE restrict` above closes the
-- route through `builds`.
GRANT SELECT, INSERT ON "audit"."build_logs" TO manifest_app;
