CREATE TYPE "public"."route_kind" AS ENUM('canonical', 'custom');--> statement-breakpoint
CREATE TYPE "public"."route_listener" AS ENUM('internal', 'public');--> statement-breakpoint
CREATE TABLE "routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instance_id" uuid NOT NULL,
	"hostname" text NOT NULL,
	"listener" "route_listener" NOT NULL,
	"kind" "route_kind" DEFAULT 'canonical' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit"."events" DROP CONSTRAINT "events_type_known";--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_instance_id_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "routes_hostname_key" ON "routes" USING btree ("hostname");--> statement-breakpoint
ALTER TABLE "audit"."events" ADD CONSTRAINT "events_type_known" CHECK ("audit"."events"."type" IN ('sso.registered', 'sso.acs_changed', 'build.started', 'build.succeeded', 'build.failed', 'instance.healthy', 'instance.failed', 'incident.opened', 'ai.key_rotated', 'instance.retiring', 'instance.retired', 'instance.retire_failed'));