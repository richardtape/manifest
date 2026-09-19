import {
  createManifestClient,
  idempotencyKey,
  unwrap,
  type Schemas,
} from '@manifest/contract'

/**
 * THE ONE PLACE THE CONSOLE CALLS THE API (D22, Decision 6). Components call these
 * functions and never hold the client, which is what makes three things checkable at once:
 * coverage.test.ts reads this file to answer "is the API complete?"; api.test.ts drives
 * these functions against manifest-mock in Node with no DOM; and `origin` is a parameter,
 * so the browser passes its own and a test passes the mock's.
 *
 * EVERY MUTATION TAKES ITS `Idempotency-Key` FROM THE CALLER (D23.6). The key is made once
 * per user ACTION with `newKey()` and reused if that action is retried — a key made here,
 * per call, would defeat the whole control.
 *
 * The plan's snippet also has a `const key = (k) => ({ header: { 'Idempotency-Key': k } })`
 * here. It is NOT here, because at this task nothing calls it and `pnpm lint` refuses it
 * outright: `'key' is assigned a value but never used`. **Task 5 adds it with the first
 * mutation**, which is where it acquires a caller. `newKey` below is a different case — it
 * is a member of the returned object rather than a dead local, so no gate objects, and
 * Task 5's own snippet calls it.
 *
 * `unwrap` throws a `ManifestApiError` carrying D23.7's envelope; `<Refusal>` is the one
 * thing that renders it.
 */
export interface ApiOptions {
  origin: string
  /** For a NODE caller only. A browser sends its own cookie and its own Origin. */
  session?: string
}

export type Api = ReturnType<typeof createApi>

export function createApi(options: ApiOptions) {
  const client = createManifestClient(options)

  return {
    /** The idempotency key for one user action; hold it and reuse it on a retry. */
    newKey: idempotencyKey,

    async getMe(): Promise<Schemas['Me']> {
      return unwrap(await client.GET('/v1/me'), 'getMe')
    },
  } as const
}
