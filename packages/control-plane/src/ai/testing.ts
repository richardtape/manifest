/**
 * Probe keys for §16's AI-path tier (P4b Task 3). NOT `ai/keys.ts` — that is Task 7,
 * and this tier exists to establish what Task 7 must produce before it produces it.
 *
 * Minted through `fetch` from the host, against LiteLLM's published port, with the
 * master key `vitest.env.ts` derives from `.env`.
 */

/** LiteLLM's published port: `infra/compose.yaml` maps 127.0.0.1:7106 to 4000. */
export function litellmUrl(): string {
  return process.env.MANIFEST_LITELLM_URL ?? 'http://127.0.0.1:7106'
}

/**
 * Read when it is used, never when this module loads: `secrets/scrub.ts` deletes the
 * name from `process.env` whenever the control plane boots in-process, and an empty
 * bearer reaches LiteLLM as a 401 that blames the key rather than its absence.
 */
export function litellmMasterKey(): string {
  const key = process.env.LITELLM_MASTER_KEY
  if (!key) {
    throw new Error(
      'LITELLM_MASTER_KEY is not set. vitest.env.ts derives it from .env, which `make seed` writes.',
    )
  }
  return key
}

async function admin(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${litellmUrl()}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${litellmMasterKey()}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${text.slice(0, 300)}`)
  return JSON.parse(text) as Record<string, unknown>
}

/**
 * `/user/new` FIRST, and it is load-bearing for the NEGATIVE control rather than for
 * the positive one. S3 measured that a key whose `user_id` was auto-created by
 * `/key/generate` is refused on `/key/generate` with `401 … Your role=unknown`, so an
 * unconfined key under an auto-created user would look confined — the escalation
 * control would "pass" while proving nothing.
 *
 * `auto_create_key: false`, because LiteLLM 1.98.0 defaults it to TRUE. Measured
 * 2026-09-14: `/user/new` answered with a key alongside the user — no
 * `allowed_routes`, every model — so a probe user would leave behind an unconfined
 * key that no teardown knows exists.
 */
export async function ensureProbeUser(userId: string): Promise<void> {
  try {
    await admin('/user/new', {
      user_id: userId,
      max_budget: 5,
      budget_duration: '1mo',
      auto_create_key: false,
    })
  } catch (error) {
    // Already exists (409) is the desired end state. Any other failure must surface:
    // swallowing it would make every probe fail for an unrelated reason.
    if (!String(error).includes('already exists')) throw error
  }
}

/** The three routes an app key may call (§10). Task 7 makes this `ai/keys.ts`'s constant. */
export const PROBE_ALLOWED_ROUTES = [
  '/v1/chat/completions',
  '/v1/embeddings',
  '/v1/models',
]

export async function mintProbeKey(opts: {
  userId: string
  confined: boolean
}): Promise<string> {
  const body: Record<string, unknown> = {
    key_alias: `p4b-probe-${opts.confined ? 'confined' : 'open'}-${Date.now()}`,
    user_id: opts.userId,
    models: ['default-chat', 'default-embed'],
  }
  // The ONE difference between the two keys in the matched pair. S3 minted exactly
  // this pair under the same user and measured the escalation on the open one.
  if (opts.confined) body.allowed_routes = PROBE_ALLOWED_ROUTES
  const created = await admin('/key/generate', body)
  if (typeof created.key !== 'string') {
    throw new Error(
      `/key/generate answered without a key: ${JSON.stringify(created).slice(0, 200)}`,
    )
  }
  return created.key
}

export async function deleteProbeKey(key: string): Promise<void> {
  await admin('/key/delete', { keys: [key] })
}

/** For a key this process never saw: the child probe 14's unconfined key mints. */
export async function deleteProbeKeyByAlias(alias: string): Promise<void> {
  await admin('/key/delete', { key_aliases: [alias] })
}
