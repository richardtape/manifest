import { describe, expect, it } from 'vitest'
import { AI_CODES, AiError, mapLiteLlmError } from './errors.js'

// Bodies recorded from LiteLLM 1.98.0 (S3 Evidence 13, re-measured 2026-09-07).
// Trimmed only where a field is irrelevant; the SHAPES are verbatim.
const KEY_BUDGET = {
  error: {
    message:
      'Budget has been exceeded! Current cost: 51.2, Max budget: 50.0. Key=sk-...Xm0w',
    type: 'budget_exceeded',
    param: null,
    code: '429',
  },
}
const USER_BUDGET = {
  error: {
    message:
      'ExceededBudget: End User=9f2c… over budget. Current cost: 2.1, Max budget: 2.0',
    type: 'budget_exceeded',
    param: null,
    code: '429',
  },
}
const ROUTE_DENIED = {
  detail:
    "Virtual key is not allowed to call this route. Only allowed routes: ['/v1/chat/completions'] Tried to call route: /key/generate",
}
const REVOKED = {
  error: {
    message:
      'Authentication Error, Invalid proxy server token passed. Received API Key = sk-...Xm0w, Key Hash (Token) =1badf2fea768945550f4327759f5c9ba0c3e',
    type: 'token_not_found_in_db',
    param: 'key',
    code: '401',
  },
}
const EXPIRED = {
  error: {
    message: 'Authentication Error - Expired Key. Key Expiry time 2026-08-30 20:28:19',
    type: 'expired_key',
    param: 'sk-...HEaQ',
    code: '401',
  },
}
const MODEL_UNKNOWN = {
  error: { message: 'model not found', type: 'None', param: null, code: '400' },
}
const BACKEND = {
  error: {
    message: 'litellm.APIConnectionError: All connection attempts failed',
    type: null,
    param: null,
    code: '500',
  },
}
const MODEL_DENIED = {
  error: {
    message: 'key not allowed to access model',
    type: 'key_model_access_denied',
    param: null,
    code: '403',
  },
}

// The ADMIN API's envelopes, which Task 5's client maps through this same function.
// Measured 2026-09-14 against LiteLLM 1.98.0 (sha256:20b5044b) with the master key.
// FastAPI's own errors use `{"detail": …}` too — the SAME envelope as a route
// denial — and a validation error ECHOES THE INPUT it refused.
const ADMIN_NOT_FOUND = { detail: 'Not Found' }
const ADMIN_VALIDATION = {
  detail: [
    {
      type: 'float_parsing',
      loc: ['body', 'max_budget'],
      msg: 'Input should be a valid number, unable to parse string as a number',
      input: 'CANARY-ECHOED-INPUT',
    },
  ],
}
const ADMIN_USER_EXISTS = {
  error: {
    message: "{'error': 'User with id p4b-probe-user already exists'}",
    type: 'internal_server_error',
    param: 'None',
    code: '409',
  },
}

describe('LiteLLM error mapping (§20, S3 Evidence 13, pinned to 1.98.0)', () => {
  it('tells a key budget from an END USER budget, which share a status AND a type', () => {
    // The only difference is the message. This is brittle by construction and the
    // Docker tier re-measures what it can — but a wrong answer here tells a faculty
    // member their app is out of money when one student is, which is a support
    // ticket aimed at the wrong person.
    expect(mapLiteLlmError(429, KEY_BUDGET).code).toBe(AI_CODES.PROJECT_BUDGET_EXCEEDED)
    expect(mapLiteLlmError(429, USER_BUDGET).code).toBe(AI_CODES.USER_BUDGET_EXCEEDED)
  })

  it('maps a route denial, which arrives with NO type and a different envelope', () => {
    // §12's most important AI control. A mapper that reads error.type alone sees an
    // unstructured 403 here and reports "something went wrong".
    const mapped = mapLiteLlmError(403, ROUTE_DENIED)
    expect(mapped.code).toBe(AI_CODES.ROUTE_NOT_PERMITTED)
    expect(mapped.hint).toMatch(/allowed_routes/)
  })

  it('does NOT call every `detail` body a route denial — the admin API uses it too', () => {
    // Measured 2026-09-14: an unknown admin route is `404 {"detail":"Not Found"}` and a
    // refused body is `422 {"detail":[…]}`. Mapped as a route denial, an operator's
    // typo would reach a faculty member as "this app tried to do something apps are
    // not allowed to do" — and the hint would call it a bug in THEIR app.
    expect(mapLiteLlmError(404, ADMIN_NOT_FOUND).code).toBe(AI_CODES.UNMAPPED)
    const validation = mapLiteLlmError(422, ADMIN_VALIDATION)
    expect(validation.code).toBe(AI_CODES.UNMAPPED)
    // A 422 echoes the refused value back, and the refused value may be a key.
    expect(JSON.stringify(validation)).not.toContain('CANARY-ECHOED-INPUT')
  })

  it('never lets the key hash out of the revocation body', () => {
    // §14: "LiteLLM's key-revocation error contains the masked key AND the full key
    // hash, so it must never be surfaced verbatim in an Event." Asserted on the WHOLE
    // mapped error, not on `message` — a hash in `detail` is exactly as leaked as one
    // in `message`, and this is the assertion that makes the build-it-from-named-
    // fields design worth having.
    const mapped = mapLiteLlmError(401, REVOKED)
    expect(mapped.code).toBe(AI_CODES.KEY_REVOKED)
    expect(JSON.stringify(mapped)).not.toContain('1badf2fea768945550f4327759f5c9ba')
    expect(JSON.stringify(mapped)).not.toContain('sk-')
    expect(mapped.message).not.toContain('1badf2fea768945550f4327759f5c9ba')
  })

  it('maps expiry, an unknown model, a denied model and a dead backend', () => {
    expect(mapLiteLlmError(401, EXPIRED).code).toBe(AI_CODES.KEY_EXPIRED)
    // `type` is the STRING "None", not null and not absent. A truthiness check
    // treats it as a real type and falls through to the unmapped branch.
    expect(mapLiteLlmError(400, MODEL_UNKNOWN).code).toBe(AI_CODES.MODEL_UNKNOWN)
    expect(mapLiteLlmError(403, MODEL_DENIED).code).toBe(AI_CODES.MODEL_NOT_PERMITTED)
    expect(mapLiteLlmError(500, BACKEND).code).toBe(AI_CODES.BACKEND_UNAVAILABLE)
  })

  it('keeps the STATUS of an unmapped failure, and only the status', () => {
    // Task 7 recognises an existing LiteLLM user by this: the admin API answers a
    // duplicate `/user/new` with 409 and the words "already exists", and the words
    // cannot survive a mapper that never carries the body. The status can.
    const mapped = mapLiteLlmError(409, ADMIN_USER_EXISTS)
    expect(mapped.code).toBe(AI_CODES.UNMAPPED)
    expect(mapped.status).toBe(409)
    expect(JSON.stringify(mapped)).not.toContain('already exists')
  })

  it('falls back without carrying the body, whatever the body is', () => {
    const mapped = mapLiteLlmError(418, {
      error: { message: 'CANARY-SECRET-VALUE', type: 'teapot' },
    })
    expect(mapped.code).toBe(AI_CODES.UNMAPPED)
    expect(JSON.stringify(mapped)).not.toContain('CANARY-SECRET-VALUE')
    // The status survives, because an operator needs SOMETHING. A code and a status
    // are enough to find the request in LiteLLM's own logs.
    expect(mapped.detail.status).toBe(418)
  })

  it('maps a body that is not an object at all', () => {
    // A proxy in front of LiteLLM answers HTML, and the client hands this function
    // `undefined` when an error body does not parse.
    expect(mapLiteLlmError(502, undefined).code).toBe(AI_CODES.BACKEND_UNAVAILABLE)
    expect(mapLiteLlmError(400, 'plain text').code).toBe(AI_CODES.UNMAPPED)
  })

  it('carries a faculty-legible message and a hint for every code it can produce', () => {
    // §14's first bullet, asserted across the closed set rather than per case — a new
    // code added without a message is the kind of gap that ships. Built through the
    // constructor rather than by reading the module's tables, so MESSAGES and HINTS
    // stay private.
    for (const code of Object.values(AI_CODES)) {
      const error = new AiError(code, 500, { status: 500 })
      expect(error.message, `${code} has no faculty-legible message`).toBeTruthy()
      expect(error.hint, `${code} has no hint`).toBeTruthy()
      // It must not name the gateway, a key or a status: the person reading it did
      // not choose LiteLLM and cannot act on its name (D23.7's hint is the
      // machine-actionable half, and it may).
      expect(error.message).not.toMatch(/litellm|sk-|bearer|http/i)
    }
  })
})
