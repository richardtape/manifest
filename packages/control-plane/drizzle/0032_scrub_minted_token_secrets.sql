-- The authoring API plan's Task 12 (its sitting 5's F4, Rich's option (a)) — CUSTOM: drizzle writes
-- schema, not data, and nothing in the schema changes. Every mint before this migration stored its
-- answer, `{ token, secret }`, as the idempotency record's response — the plaintext secret of a
-- delegated token, kept for ever in a table nothing prunes. From this migration on, `mintToken`'s
-- record keeps the token without its secret and a replay answers 409 TOKEN_ALREADY_MINTED; this
-- scrubs what was stored before. The token itself is untouched: its hash is in `delegated_tokens`,
-- and it still authenticates. Idempotent.
UPDATE "idempotency_keys" SET "response_body" = "response_body" - 'secret'
  WHERE "route" = 'POST /v1/projects/:projectId/tokens' AND "response_body" ? 'secret';
