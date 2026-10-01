import { describe, expect, it } from 'vitest'
import { EVENT_DETAIL_SCHEMAS, EVENT_TYPES } from '../../observability/index.js'
import { ERROR_CODES, MANIFEST_ERROR_CODE_LIST } from '../error-codes.js'
import { ROUTE_DEFINITIONS } from '../routes/index.js'
import { openApiDocument } from './document.js'
import { STREAM_PATH } from './websocket.js'

/**
 * THE PUBLISHED REFERENCE IS COMPLETE — a gate over the GENERATED document, not a convention
 * (the authoring API plan's Decision 14). Its product is prose, so its definition of done is
 * this file: every operation, parameter, tag, schema and property described; every operation
 * with an example that parses through its own schema; every error code — the API's and the
 * ones inside `details` — with a meaning and a remedy; every event type with a description and
 * an example; and no public text naming something a reader outside the team cannot resolve.
 *
 * `ALLOWED_GAPS` STARTS EMPTY AND STAYS EMPTY. A line in it is a finding with a reason, never a
 * way to go green.
 */

type Json = Record<string, unknown>
const doc = openApiDocument(ROUTE_DEFINITIONS) as Json

/**
 * Text a reader OUTSIDE the team cannot resolve (Decision 14): a plan, a task, a sitting, a
 * decision or finding number — the faculty front-end's `FE-n` included — a spec action, a
 * person. The spec's own `§n`, `Dnn` and `Cn` are public and allowed — they resolve in the
 * approved design.
 */
const INTERNAL =
  /\b(P[1-6][abc]?|sitting|Task \d+|Decision \d+|Rich|Rich's|Spec action \d+)\b|the D5 plan|\bR[1-9]\b|\bF\d{1,3}\b|\bFE-\d+\b/

/** One sentence at least: long enough to say something, and ending like a sentence. */
const SENTENCE = (text: unknown): boolean =>
  typeof text === 'string' && text.length >= 40 && /[.!?)`]\s*$/.test(text)

/** EMPTY, and it stays empty. */
const ALLOWED_GAPS: readonly string[] = []

/** Every property of a schema, recursively, with a readable path. A `$ref`'s description is its component's. */
function* properties(schema: unknown, at: string): Generator<[string, Json]> {
  if (schema === null || typeof schema !== 'object') return
  const s = schema as Json
  for (const [name, prop] of Object.entries(
    (s.properties ?? {}) as Record<string, Json>,
  )) {
    yield [`${at}.${name}`, prop]
    yield* properties(prop, `${at}.${name}`)
  }
  for (const key of ['items', 'additionalProperties'] as const) {
    yield* properties(s[key], `${at}[]`)
  }
  for (const key of ['anyOf', 'oneOf', 'allOf'] as const) {
    for (const [i, sub] of ((s[key] ?? []) as Json[]).entries()) {
      yield* properties(sub, `${at}|${i}`)
    }
  }
}

function gapsOf(document: Json): string[] {
  const gaps: string[] = []
  const paths = document.paths as Record<string, Record<string, Json>>
  for (const [path, item] of Object.entries(paths)) {
    for (const [method, op] of Object.entries(item)) {
      if (typeof op !== 'object' || op === null || !('operationId' in op)) continue
      const id = `${method.toUpperCase()} ${path} (${op.operationId as string})`
      if (!SENTENCE(op.description)) gaps.push(`${id}: description`)
      for (const p of (op.parameters ?? []) as Json[]) {
        if (typeof p.description !== 'string') {
          gaps.push(`${id}: parameter ${p.name as string}`)
        }
      }
      if (path === STREAM_PATH) continue
      const responses = op.responses as Record<string, Json>
      const ok = Object.entries(responses).find(([code]) => code.startsWith('2'))
      const content = (ok?.[1].content as Record<string, Json> | undefined)?.[
        'application/json'
      ]
      if (content !== undefined && content.example === undefined) {
        gaps.push(`${id}: response example`)
      }
      const body = (
        (op.requestBody as Json | undefined)?.content as Record<string, Json> | undefined
      )?.['application/json']
      if (body !== undefined && body.example === undefined) {
        gaps.push(`${id}: request example`)
      }
    }
  }
  for (const tag of document.tags as Json[]) {
    if (!SENTENCE(tag.description)) gaps.push(`tag ${tag.name as string}: description`)
  }
  for (const [name, schema] of Object.entries(
    (document.components as Json).schemas as Record<string, Json>,
  )) {
    if (typeof schema.description !== 'string') gaps.push(`schema ${name}: description`)
    for (const [where, prop] of properties(schema, name)) {
      if (typeof prop.description !== 'string' && prop.$ref === undefined) {
        gaps.push(`${where}: description`)
      }
    }
  }
  const errors = document['x-manifest-errors'] as
    Record<string, { summary?: unknown; remedy?: unknown }> | undefined
  for (const code of Object.keys(ERROR_CODES)) {
    const entry = errors?.[code]
    if (typeof entry?.summary !== 'string') gaps.push(`error ${code}: summary`)
    if (!SENTENCE(entry?.remedy)) gaps.push(`error ${code}: remedy`)
  }
  const specErrors = document['x-manifest-spec-errors'] as
    Record<string, { summary?: unknown; remedy?: unknown }> | undefined
  for (const code of MANIFEST_ERROR_CODE_LIST) {
    const entry = specErrors?.[code]
    if (typeof entry?.summary !== 'string') gaps.push(`manifest error ${code}: summary`)
    if (!SENTENCE(entry?.remedy)) gaps.push(`manifest error ${code}: remedy`)
  }
  const stream = (paths[STREAM_PATH]?.get ?? {}) as Json
  const eventTypes = (stream['x-manifest-event-types'] ?? []) as {
    type: string
    description?: unknown
    example?: unknown
  }[]
  for (const type of EVENT_TYPES) {
    const entry = eventTypes.find((e) => e.type === type)
    if (!SENTENCE(entry?.description)) gaps.push(`event ${type}: description`)
    if (entry?.example === undefined) gaps.push(`event ${type}: example`)
  }
  return gaps
}

describe('the published reference is complete (Decision 14)', () => {
  it('has no gap — every operation, parameter, tag, schema, property, error code and event is described, and every operation has its examples', () => {
    expect(gapsOf(doc).filter((g) => !ALLOWED_GAPS.includes(g))).toEqual([])
  })

  it('names nothing a reader outside the team cannot resolve', () => {
    const hits: string[] = []
    const walk = (value: unknown, at: string): void => {
      if (typeof value === 'string') {
        if (INTERNAL.test(value)) hits.push(`${at}: ${value}`)
      } else if (Array.isArray(value)) {
        value.forEach((v, i) => walk(v, `${at}[${i}]`))
      } else if (value !== null && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) walk(v, `${at}.${k}`)
      }
    }
    walk(doc, '')
    expect(hits).toEqual([])
  })

  /**
   * WHAT EVERY READER MEETS FIRST CITES NO SPEC SECTION (Rich, 2026-09-30: *"This is API docs not a
   * history of the API"*). `INTERNAL` above allows `§n`, `Dnn` and `Cn` because they resolve in the
   * approved design — but only a reader of the design can resolve them. So an operation's
   * description, the document's own, the server, the two credentials, and the two texts every
   * operation shares (the `Idempotency-Key` parameter and the error answer) say what is true now,
   * in their own words. Tags, schemas, fields and error entries still cite the spec: a later pass
   * rewrites them and widens this test.
   */
  it('cites no spec section where every reader starts: operations, the document, its server, its credentials and the shared texts', () => {
    const SPEC_REF = /§\d|\bD\d{1,2}(\.\d+)?\b|\bC\d\b/
    const hits: string[] = []
    const check = (at: string, value: unknown): void => {
      if (typeof value === 'string' && SPEC_REF.test(value)) hits.push(`${at}: ${value}`)
    }
    check('info.description', (doc.info as Json).description)
    for (const [i, server] of ((doc.servers ?? []) as Json[]).entries())
      check(`servers[${i}].description`, server.description)
    const schemes = (doc.components as Json).securitySchemes as Record<string, Json>
    for (const [name, scheme] of Object.entries(schemes))
      check(`securitySchemes.${name}.description`, scheme.description)
    let operations = 0
    for (const [path, item] of Object.entries(doc.paths as Record<string, Json>))
      for (const [method, op] of Object.entries(item)) {
        if (op === null || typeof op !== 'object' || !('operationId' in op)) continue
        operations++
        const operation = op as Json
        check(`${method} ${path}`, operation.description)
        for (const parameter of (operation.parameters ?? []) as Json[])
          if (parameter.name === 'Idempotency-Key')
            check(`${method} ${path} Idempotency-Key`, parameter.description)
        const responses = (operation.responses ?? {}) as Record<string, Json>
        for (const [status, response] of Object.entries(responses))
          if (!/^2/.test(status))
            check(`${method} ${path} ${status}`, response.description)
      }
    // The positive half: the walk reached every operation, so an empty list means none cites one.
    expect(operations).toBeGreaterThan(60)
    expect(hits).toEqual([])
  })

  /**
   * A PROJECT'S `name` IS WHAT PEOPLE READ, AND ITS SLUG IS WHAT EVERY HOSTNAME IS MADE FROM (§6) —
   * so published text calling the slug "the project's name" tells a reader that a rename moves a
   * hostname. And since Manifest signs a person in on two origins (§21), a session's `Origin` is the
   * origin the request arrived on: no text may say it must be the console's.
   */
  it('calls the slug a slug, and never says a session must come from the console’s origin', () => {
    const STALE =
      /\bproject name\b|\bproject names\b|project[’']s name \(§23\)|^Its name \(§23\)|console[’']s origin/i
    const hits: string[] = []
    const walk = (value: unknown, at: string): void => {
      if (typeof value === 'string') {
        if (STALE.test(value)) hits.push(`${at}: ${value}`)
      } else if (Array.isArray(value)) {
        value.forEach((v, i) => walk(v, `${at}[${i}]`))
      } else if (value !== null && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) walk(v, `${at}.${k}`)
      }
    }
    walk(doc, '')
    expect(hits).toEqual([])
  })

  /**
   * …AND THE SLUG'S OWN REFUSALS SAY SLUG. A front-end shows a person `SLUG_TAKEN`'s words
   * beside two fields — the slug and the name people read, which need not be unique — so "the
   * name is taken" sends them to edit the wrong one. The pattern above cannot see a bare "the
   * name", which is right elsewhere; here it is always the slug.
   */
  it('says slug in every slug refusal and in the slug check’s answer — never name', () => {
    const errors = doc['x-manifest-errors'] as Record<
      string,
      { summary: string; remedy: string }
    >
    const said = Object.entries(errors)
      .filter(([code]) => code.startsWith('SLUG_'))
      .flatMap(([code, e]) => [`${code}: ${e.summary}`, `${code}: ${e.remedy}`])
    const schemas = (doc.components as Json).schemas as Record<string, Json>
    const slug = (schemas.SlugCheck!.properties as Record<string, Json>).slug!
    said.push(`SlugCheck.slug: ${slug.description as string}`)
    said.push(
      `checkSlug: ${JSON.stringify((doc.paths as Record<string, Json>)['/v1/slugs/{slug}'])}`,
    )
    expect(said.filter((text) => /\b(a|another|the) name\b/i.test(text))).toEqual([])
  })

  it('has every example PARSE through its own schema', () => {
    for (const route of ROUTE_DEFINITIONS) {
      const response = route.success.schema.safeParse(route.examples.response)
      expect(response.success, `${route.operationId}'s response example`).toBe(true)
      if (route.examples.request !== undefined) {
        const body = route.body.safeParse(route.examples.request)
        expect(body.success, `${route.operationId}'s request example`).toBe(true)
      }
    }
  })

  it('has an example of every event type that parses through its own schema', () => {
    const stream = (doc.paths as Record<string, Record<string, Json>>)[STREAM_PATH]!.get!
    for (const entry of stream['x-manifest-event-types'] as {
      type: keyof typeof EVENT_DETAIL_SCHEMAS
      example: unknown
    }[]) {
      expect(
        EVENT_DETAIL_SCHEMAS[entry.type].safeParse(entry.example).success,
        `${entry.type}'s example`,
      ).toBe(true)
    }
  })

  /**
   * THE GATE'S OWN POSITIVE CONTROL. A gate that is green because the work is done cannot show
   * that it would see a gap; this one is handed a copy of the document with one hole of each
   * kind punched in it, and must name every one.
   */
  it('sees a gap of every kind it claims to check — its own positive control', () => {
    const holed = structuredClone(doc)
    const ops = (holed.paths as Record<string, Record<string, Json>>)['/v1/me']!.get!
    delete ops.description
    const schemas = (holed.components as Json).schemas as Record<string, Json>
    delete schemas.Project!.description
    delete ((schemas.Project!.properties as Record<string, Json>).slug as Json)
      .description
    delete ((holed.tags as Json[])[0] as Json).description
    const errors = holed['x-manifest-errors'] as Record<string, Json>
    delete errors.INTERNAL!.remedy
    const gaps = gapsOf(holed)
    expect(gaps).toEqual(
      expect.arrayContaining([
        'GET /v1/me (getMe): description',
        'schema Project: description',
        'Project.slug: description',
        `tag ${((doc.tags as Json[])[0] as Json).name as string}: description`,
        'error INTERNAL: remedy',
      ]),
    )
  })
})
