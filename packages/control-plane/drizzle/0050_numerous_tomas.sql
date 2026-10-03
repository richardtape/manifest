ALTER TABLE "audit"."events" ADD COLUMN "actor_user_id" uuid;--> statement-breakpoint
ALTER TABLE "audit"."events" ADD COLUMN "acted_as_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "audit"."events" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "audit"."events" ADD CONSTRAINT "events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit"."events" ADD CONSTRAINT "events_admin_reason" CHECK ((NOT "audit"."events"."acted_as_admin" OR ("audit"."events"."actor_user_id" IS NOT NULL AND length(trim("audit"."events"."reason")) > 0)) AND ("audit"."events"."acted_as_admin" OR "audit"."events"."reason" IS NULL));