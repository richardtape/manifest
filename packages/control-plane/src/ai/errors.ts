export const AI_CODES = {
  PROJECT_BUDGET_EXCEEDED: 'AI_PROJECT_BUDGET_EXCEEDED',
  USER_BUDGET_EXCEEDED: 'AI_USER_BUDGET_EXCEEDED',
  MODEL_NOT_PERMITTED: 'AI_MODEL_NOT_PERMITTED',
  ROUTE_NOT_PERMITTED: 'AI_ROUTE_NOT_PERMITTED',
  KEY_REVOKED: 'AI_KEY_REVOKED',
  KEY_EXPIRED: 'AI_KEY_EXPIRED',
  MODEL_UNKNOWN: 'AI_MODEL_UNKNOWN',
  BACKEND_UNAVAILABLE: 'AI_BACKEND_UNAVAILABLE',
  UNMAPPED: 'AI_UNMAPPED',
} as const

/**
 * The faculty-legible half (§14). Deliberately says nothing about LiteLLM, keys or
 * HTTP: the person reading it did not choose the gateway and cannot act on its
 * name. The machine-actionable half is the CODE, which is what an agent corrects
 * itself against (D23.7).
 */
const MESSAGES: Record<string, string> = {
  [AI_CODES.PROJECT_BUDGET_EXCEEDED]:
    'This app has used all of its AI budget for the month.',
  [AI_CODES.USER_BUDGET_EXCEEDED]:
    'This person has used all of their AI allowance for the month.',
  [AI_CODES.MODEL_NOT_PERMITTED]:
    'This app is not permitted to use the model it asked for.',
  [AI_CODES.ROUTE_NOT_PERMITTED]:
    'This app tried to do something with AI that apps are not allowed to do.',
  [AI_CODES.KEY_REVOKED]:
    'This app’s AI access was withdrawn. Deploying again issues new access.',
  [AI_CODES.KEY_EXPIRED]:
    'This app’s AI access has expired. Deploying again issues new access.',
  [AI_CODES.MODEL_UNKNOWN]: 'This app asked for a model the platform does not offer.',
  [AI_CODES.BACKEND_UNAVAILABLE]: 'The AI service is not answering right now.',
  [AI_CODES.UNMAPPED]:
    'The AI service refused this request for a reason the platform does not recognise.',
}

const HINTS: Record<string, string> = {
  [AI_CODES.PROJECT_BUDGET_EXCEEDED]:
    'Raise ai.budget.project_monthly_usd in manifest.yaml, within the project quota, and deploy again.',
  [AI_CODES.USER_BUDGET_EXCEEDED]:
    'Per-person allowances are not enforced by this version of the platform; if you are seeing this, an administrator set one directly on the gateway.',
  [AI_CODES.MODEL_NOT_PERMITTED]:
    'Declare the model in ai.models. A model above the app’s data.classification is refused at validation (D17).',
  [AI_CODES.ROUTE_NOT_PERMITTED]:
    'Apps may call chat completions, embeddings and the model list, and nothing else — every key carries allowed_routes (§10). This is a bug in the app, not a permission to grant.',
  [AI_CODES.KEY_REVOKED]:
    'Redeploy the environment. Keys are rotated on every deploy (§10).',
  [AI_CODES.KEY_EXPIRED]: 'Redeploy the environment.',
  [AI_CODES.MODEL_UNKNOWN]:
    'Use a logical model name from the platform catalogue, never a vendor model id.',
  [AI_CODES.BACKEND_UNAVAILABLE]:
    'Check `make doctor`. If the platform is up, the model host (Ollama, locally) is not answering.',
  [AI_CODES.UNMAPPED]:
    'Record the status and look the request up in the gateway’s own logs. If this recurs, the gateway version has moved and §16’s mapping needs re-measuring.',
}

export class AiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly detail: Record<string, string | number>,
  ) {
    super(MESSAGES[code] ?? MESSAGES[AI_CODES.UNMAPPED]!)
    this.name = 'AiError'
  }
  get hint(): string {
    return HINTS[this.code] ?? HINTS[AI_CODES.UNMAPPED]!
  }
}

/**
 * LiteLLM's failure → a Manifest code (§20). The body is READ and never CARRIED:
 * every `AiError` this returns is built from a code and the status, so "the body
 * never escapes" holds by construction rather than by filtering afterwards (§14 —
 * the revocation body carries the full key hash, and a 422 echoes its input).
 *
 * Pinned to LiteLLM 1.98.0 (`sha256:20b5044b`). `ai/ai-path.docker.test.ts`
 * re-measures the rows a test can provoke.
 */
export function mapLiteLlmError(status: number, body: unknown): AiError {
  const b = (typeof body === 'object' && body !== null ? body : {}) as {
    error?: { type?: unknown; message?: unknown }
    detail?: unknown
  }
  const type = typeof b.error?.type === 'string' ? b.error.type : undefined
  const message = typeof b.error?.message === 'string' ? b.error.message : ''

  // FIRST, because a route denial has no `error` object at all: it is
  // `{"detail": "…"}`. Reading error.type first and falling through would put
  // §12's key confinement in the unmapped bucket.
  //
  // AND ONLY ON A 403. `{"detail": …}` is FastAPI's own envelope, so the admin API
  // uses it for everything FastAPI raises itself — measured 2026-09-14, an unknown
  // route is `404 {"detail":"Not Found"}` and a refused body `422 {"detail":[…]}`.
  // Matched on the envelope alone, an operator's typo reaches a faculty member as
  // "this app tried to do something apps are not allowed to do".
  if (status === 403 && b.detail !== undefined && b.error === undefined) {
    return new AiError(AI_CODES.ROUTE_NOT_PERMITTED, status, { status })
  }

  if (type === 'budget_exceeded') {
    // The ONLY discriminator LiteLLM 1.98.0 offers. S3 recorded both strings.
    return new AiError(
      /End User=/.test(message)
        ? AI_CODES.USER_BUDGET_EXCEEDED
        : AI_CODES.PROJECT_BUDGET_EXCEEDED,
      status,
      { status },
    )
  }

  const byType: Record<string, string> = {
    key_model_access_denied: AI_CODES.MODEL_NOT_PERMITTED,
    token_not_found_in_db: AI_CODES.KEY_REVOKED,
    expired_key: AI_CODES.KEY_EXPIRED,
  }
  if (type !== undefined && byType[type])
    return new AiError(byType[type]!, status, { status })

  // `"None"` is a STRING here, not null — so a `type` is present, and a truthiness
  // test treats it as a real one. It is also the only thing that separates an
  // unknown model from any other 400 the admin API can return: matched on the status
  // alone, a malformed admin request reads as "asked for a model the platform does
  // not offer".
  if (status === 400 && type === 'None') {
    return new AiError(AI_CODES.MODEL_UNKNOWN, status, { status })
  }
  if (status >= 500) return new AiError(AI_CODES.BACKEND_UNAVAILABLE, status, { status })
  return new AiError(AI_CODES.UNMAPPED, status, { status })
}
