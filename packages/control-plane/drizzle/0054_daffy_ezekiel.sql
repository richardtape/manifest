DROP INDEX "routes_hostname_key";--> statement-breakpoint
CREATE UNIQUE INDEX "routes_hostname_instance_key" ON "routes" USING btree ("hostname","instance_id");