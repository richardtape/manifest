import { readdir, readFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { AI_CODES, AiError, CATALOGUE_CODES, CatalogueError } from '../ai/index.js'
import { ConfigError } from '../config.js'
import { SamlError } from '../identity/index.js'
import {
  LaunchRecordError,
  LaunchTransitionError,
  ProductionGateError,
} from '../launch/index.js'
import {
  AuthorizationError,
  SLUG_CODES,
  SlugRefusedError,
  type SlugReason,
} from '../projects/index.js'
import { ReleaseError } from '../releases/index.js'
import { SourceError } from '../source/index.js'
import { ERROR_CODES, type ErrorFamily } from './error-codes.js'
import { BadRequestError, toErrorResponse } from './errors.js'
import { buildServer } from './server.js'
import { loginAs, mutationHeaders, testDeps } from './testing.js'
import { resetDatabase } from '../db/testing.js'

const SRC = new URL('..', import.meta.url).pathname

async function sourceFiles(dir: string): Promise<string[]> {
  const out: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await sourceFiles(full)))
    else if (
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.test.ts') &&
      entry.name !== 'testing.ts'
    )
      out.push(full)
  }
  return out
}

/** The classes `toErrorResponse` answers as themselves. Everything else is INTERNAL. */
const WIRE_CLASSES = [
  'AuthorizationError',
  'BadRequestError',
  'ReleaseError',
  'SourceError',
  'ConfigError',
  'SamlError',
  'LaunchTransitionError',
  'LaunchRecordError',
  'ProductionGateError',
] as const

/**
 * Every code a client can receive, as the SOURCE throws it — multi-line, because half
 * the constructors put the code on the next line (P5a Task 5).
 */
async function thrown(): Promise<Map<string, Set<ErrorFamily>>> {
  const found = new Map<string, Set<ErrorFamily>>()
  const add = (code: string, family: ErrorFamily) =>
    found.set(code, (found.get(code) ?? new Set()).add(family))
  const construct = new RegExp(
    `new\\s+(${WIRE_CLASSES.join('|')})\\(\\s*'([A-Z][A-Z0-9_]+)'`,
    'g',
  )
  for (const file of await sourceFiles(SRC)) {
    const text = await readFile(file, 'utf8')
    for (const m of text.matchAll(construct)) add(m[2]!, m[1] as ErrorFamily)
    if (relative(SRC, file).split(sep)[0] === 'api') {
      for (const m of text.matchAll(/readonly code = '([A-Z][A-Z0-9_]+)'/g))
        add(m[1]!, 'api')
      for (const m of text.matchAll(/\bcode: '([A-Z][A-Z0-9_]+)'/g)) add(m[1]!, 'api')
    }
  }
  for (const code of Object.values(AI_CODES)) add(code, 'AiError')
  for (const code of Object.values(CATALOGUE_CODES)) add(code, 'CatalogueError')
  // The constructor takes a REASON, not a literal, so the scan above cannot see these.
  for (const code of Object.values(SLUG_CODES)) add(code, 'SlugRefusedError')
  return found
}

describe('the error-code registry (§20, D23.7)', () => {
  it('registers every code the source throws through a class the API answers as itself', async () => {
    const missing: string[] = []
    for (const [code, families] of await thrown()) {
      const entry = (ERROR_CODES as Record<string, { families: readonly ErrorFamily[] }>)[
        code
      ]
      if (entry === undefined) missing.push(`${code} (${[...families].join(', ')})`)
      else
        for (const family of families)
          if (!entry.families.includes(family))
            missing.push(`${code}: not registered for ${family}`)
    }
    expect(missing).toEqual([])
  })

  it('registers nothing the source never throws', async () => {
    const found = await thrown()
    expect(Object.keys(ERROR_CODES).filter((code) => !found.has(code))).toEqual([])
  })

  it('answers each class-thrown code with the status the registry states', () => {
    const make: Partial<Record<ErrorFamily, (code: string) => unknown>> = {
      AuthorizationError: (c) =>
        new AuthorizationError(c as 'FORBIDDEN' | 'NOT_FOUND', 'm'),
      BadRequestError: (c) => new BadRequestError(c, 'm'),
      ReleaseError: (c) => new ReleaseError(c, 'm'),
      SourceError: (c) => new SourceError(c, 'm'),
      ConfigError: (c) => new ConfigError(c, 'm'),
      SamlError: (c) => new SamlError(c, 'm'),
      AiError: (c) => new AiError(c, 503, {}),
      CatalogueError: (c) => new CatalogueError(c, 'm', 'h'),
      SlugRefusedError: (c) =>
        new SlugRefusedError({ code: c as SlugReason['code'], message: 'm', hint: 'h' }),
      LaunchTransitionError: (c) => new LaunchTransitionError(c, 'm'),
      LaunchRecordError: (c) => new LaunchRecordError(c, 'm', 'h'),
      // The checklist has to PARSE — `mapError` sends the refusal without it and reports
      // on stderr when it does not, so a shape this schema refuses would make the test
      // noisy rather than red. An empty item list is a valid `LaunchReadiness`.
      ProductionGateError: (c) =>
        new ProductionGateError(c, {
          projectId: '00000000-0000-0000-0000-000000000000',
          ready: false,
          candidateReleaseId: null,
          items: [],
        }),
    }
    const wrong: string[] = []
    for (const [code, entry] of Object.entries(ERROR_CODES)) {
      for (const family of entry.families) {
        const build = make[family]
        if (build === undefined) continue
        const { status, body } = toErrorResponse(build(code))
        if (status !== entry.status || body.error.code !== code)
          wrong.push(
            `${code} via ${family}: ${status} ${body.error.code}, registry says ${entry.status}`,
          )
      }
    }
    expect(wrong).toEqual([])
  })

  it('reports an unregistered code on the operator’s stderr — the code, never the message', () => {
    // The test above is the gate; this is the copy for a code that reached the wire anyway.
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const secretish = 'the caller sent hunter2'
      const { body } = toErrorResponse(
        new BadRequestError('NOT_A_REGISTERED_CODE', secretish),
      )
      expect(body.error.code).toBe('NOT_A_REGISTERED_CODE')
      expect(errors).toHaveBeenCalledTimes(1)
      const line = String(errors.mock.calls[0]![0])
      expect(JSON.parse(line)).toMatchObject({ code: 'NOT_A_REGISTERED_CODE' })
      expect(line).not.toContain('hunter2')
      errors.mockClear()
      toErrorResponse(new BadRequestError('SPEC_NOT_FOUND', 'm'))
      expect(errors).not.toHaveBeenCalled()
    } finally {
      errors.mockRestore()
    }
  })
})

/**
 * Fastify refuses some requests before any route runs, and those refusals reach a client
 * too. All four below answered `500 INTERNAL` — the one code whose summary says nothing
 * the client sent explains it — until P5a Task 5 measured them.
 */
describe('the framework’s own refusals answer with registered codes (§20, D23.7)', () => {
  afterAll(resetDatabase)

  it('answers an unreadable request 4xx with a registered code, and never INTERNAL', async () => {
    const deps = await testDeps()
    const app = await buildServer(deps)
    const cookies = await loginAs(deps, 'bio_prof')
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const post = (contentType: string, payload: string) =>
      app.inject({
        method: 'POST',
        url: '/v1/projects',
        cookies,
        headers: { ...mutationHeaders(deps), 'content-type': contentType },
        payload,
      })
    try {
      const answers = {
        malformed: await post('application/json', '{"slug":'),
        empty: await post('application/json', ''),
        media: await post('text/csv', 'a,b'),
        large: await post(
          'application/json',
          JSON.stringify({ slug: 'x'.repeat(1_100_000) }),
        ),
      }
      const seen = Object.fromEntries(
        Object.entries(answers).map(([name, res]) => [
          name,
          [res.statusCode, res.json().error.code as string],
        ]),
      )
      expect(seen).toEqual({
        malformed: [400, 'REQUEST_INVALID'],
        empty: [400, 'REQUEST_INVALID'],
        media: [415, 'REQUEST_MEDIA_TYPE_UNSUPPORTED'],
        large: [413, 'REQUEST_BODY_TOO_LARGE'],
      })
      for (const [status, code] of Object.values(seen) as [
        number,
        keyof typeof ERROR_CODES,
      ][])
        expect(ERROR_CODES[code].status).toBe(status)
      // Nothing reported as the control plane's own failure, and no unregistered code.
      expect(errors).not.toHaveBeenCalled()
    } finally {
      errors.mockRestore()
      await app.close()
    }
  })

  /**
   * Two refusals Fastify's ROUTER sends itself, before a route or `setErrorHandler` —
   * unless the server passes `frameworkErrors`. Measured (P5a sitting 6): a path parameter
   * over 100 characters answered `414 {"error":"Bad Request","code":"FST_ERR_MAX_PARAM_LENGTH",
   * "message":"'/v1/slugs/aaaa…' is exceeding the max param length"}` — no envelope, no
   * registered code, the caller's path quoted back — and a malformed URL the same way.
   */
  it('answers a URL the router cannot read in the envelope, with a registered code', async () => {
    const deps = await testDeps()
    const app = await buildServer(deps)
    const cookies = await loginAs(deps, 'bio_prof')
    try {
      for (const url of [`/v1/slugs/${'a'.repeat(101)}`, '/v1/projects/%E0%A4%A']) {
        const res = await app.inject({ method: 'GET', url, cookies })
        expect({ url, status: res.statusCode, body: res.json() }).toEqual({
          url,
          status: 400,
          body: { error: expect.objectContaining({ code: 'REQUEST_INVALID' }) },
        })
        expect(res.body).not.toContain('aaaaaaaaaa')
      }
    } finally {
      await app.close()
    }
  })
})
