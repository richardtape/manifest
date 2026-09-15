-- P4b Task 15. The closed set of event types, enforced by the database as well as by
-- observability/'s EVENT_TYPES: a free-text type is a stream no client can switch on,
-- and the code's guard is one edit from gone. The list is written out in db/schema.ts
-- rather than generated from EVENT_TYPES, so the two are independent reads of one
-- rule; observability/events.test.ts reads this constraint back and compares. Adding a
-- type is a new migration that drops and re-adds it. Existing rows are validated.
ALTER TABLE "audit"."events" ADD CONSTRAINT "events_type_known" CHECK ("audit"."events"."type" IN ('sso.registered', 'sso.acs_changed', 'build.started', 'build.succeeded', 'build.failed', 'instance.healthy', 'instance.failed', 'incident.opened', 'ai.key_rotated'));