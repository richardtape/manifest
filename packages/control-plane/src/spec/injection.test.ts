import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { manifestSchema, type ManifestSpec } from './schema.js'
import { resolveConfig, type EnvironmentKind, type ResolvedConfig } from './resolve.js'
import {
  INJECTION_VARIABLES,
  INJECTED_FILE_PATHS,
  InjectionError,
  RESERVED_ENV_NAMES,
  renderInjection,
  type InjectionContext,
} from './injection.js'

const yaml = (over: { auth?: string; ai?: string; env?: string } = {}) => `
manifest: 1
name: chem-labs
blueprint: fixture-node@1
runtime:
  port: 3000
  health: /healthz
services:
  - { type: mongo, version: '7', name: db }
auth:
${
  over.auth ??
  `  provider: cwl
  attributes: [ubcEduCwlPuid, mail]`
}
${over.ai ?? ''}
env:
${over.env ?? '  - { name: COURSE_CODE, value: CHEM_121 }'}
`

const DEFAULTS = { cpu: 0.5, memory: '512Mi', pids: 256, disk: '2Gi' }

const hostnameFor = (kind: EnvironmentKind) =>
  kind === 'production'
    ? 'chem-labs.manifest.internal'
    : `chem-labs.${kind}.manifest.internal`

/**
 * A staging chem-labs with mongo, CWL auth and no AI — the shape §8's table was
 * written for. `resolved` is always resolved FROM the spec under test, never
 * hand-built, so a test cannot pass against a config the resolver would not
 * produce.
 */
function ctx(
  over: {
    kind?: EnvironmentKind
    spec?: ManifestSpec
    resolved?: ResolvedConfig
    services?: InjectionContext['services']
  } = {},
): InjectionContext {
  const kind = over.kind ?? 'staging'
  const spec = over.spec ?? manifestSchema.parse(parse(yaml()))
  const hostname = hostnameFor(kind)
  const resolved = over.resolved ?? resolveConfig(spec, kind, DEFAULTS)
  return {
    resolved,
    environmentKind: kind,
    hostname,
    projectSlug: 'chem-labs',
    idp: {
      entityId: 'https://idp.manifest.internal/idp/shibboleth',
      baseUrl: 'https://idp.manifest.internal',
      spEntityBase: 'https://manifest.internal',
    },
    ...(spec.auth.provider === 'cwl'
      ? {
          spEntity: {
            entityId: `https://manifest.internal/sp/chem-labs/${kind}`,
            acsUrl: `https://${hostname}${spec.auth.callback}`,
            sloUrl: `https://${hostname}${spec.auth.logout}`,
            attributes: [...spec.auth.attributes],
          },
        }
      : {}),
    secrets: { sessionSecret: 'a'.repeat(64) },
    services: over.services ?? [
      {
        type: 'mongo',
        endpoint:
          'mongodb://app_9f2c:0123456789abcdef@mf-svc-chem-labs-staging-db:27017/chem_labs?authSource=admin',
      },
    ],
  }
}

const withAuthProvider = (provider: 'cwl' | 'none') =>
  manifestSchema.parse(
    parse(yaml({ auth: `  provider: ${provider}\n  attributes: [mail]` })),
  )

const withModels = (models: string[]) =>
  manifestSchema.parse(parse(yaml({ ai: `ai:\n  models: [${models.join(', ')}]` })))

const withEnv = (entries: { name: string; value: string }[]) =>
  manifestSchema.parse(
    parse(
      yaml({
        env: entries
          .map((e) => `  - { name: ${e.name}, value: '${e.value}' }`)
          .join('\n'),
      }),
    ),
  )

describe('§8 injection contract', () => {
  it('injects every variable the table marks required-in-all', () => {
    const env = renderInjection(ctx())
    for (const v of INJECTION_VARIABLES.filter((x) => x.requiredIn === 'all')) {
      expect(env, `missing ${v.name}`).toHaveProperty(v.name)
      expect(env[v.name], `${v.name} is empty`).not.toBe('')
    }
  })

  it('emits exactly the table rows that apply, and nothing the table lacks', () => {
    // The table and the renderer are two lists, and a test that reads only one
    // of them asserts nothing about the other — which is the failure §8 already
    // had once, "from being written against memory of the libraries rather than
    // against them". This compares them BOTH WAYS for a staging app with CWL and
    // mongo, so a row deleted from the table and a variable dropped from the
    // renderer are each red, separately.
    const declared = new Set(['COURSE_CODE'])
    const emitted = Object.keys(renderInjection(ctx())).filter((n) => !declared.has(n))
    const applicable = INJECTION_VARIABLES.filter(
      (v) =>
        !(v.when ?? '').startsWith('ai.models') &&
        v.when !== 'services.qdrant' &&
        (v.requiredIn === 'all' ||
          v.requiredIn === 'staging+production' ||
          v.when === 'services.mongo'),
    ).map((v) => v.name)
    expect([...emitted].sort()).toEqual([...applicable].sort())
  })

  it('never leaves SAML_ENVIRONMENT unset', () => {
    // §8 spends a paragraph on this and §16 carries a regression for it: the
    // library defaults it to 'STAGING' at index.js:120 AND :307, so an app
    // deployed without it points at https://authentication.stg.id.ubc.ca —
    // real UBC infrastructure.
    expect(renderInjection(ctx()).SAML_ENVIRONMENT).toBe('LOCAL')
    expect(renderInjection(ctx({ kind: 'sandbox' })).SAML_ENVIRONMENT).toBe('LOCAL')
    expect(renderInjection(ctx({ kind: 'production' })).SAML_ENVIRONMENT).toBe(
      'PRODUCTION',
    )
  })

  it('derives SAML_CALLBACK_URL as MANIFEST_APP_URL + auth.callback (D15)', () => {
    const env = renderInjection(ctx())
    expect(env.SAML_CALLBACK_URL).toBe(`${env.MANIFEST_APP_URL}/auth/ubcshib/callback`)
  })

  it('takes SAML_CALLBACK_URL from the REGISTERED ACS URL, not a second derivation', () => {
    // The one value that must agree with the IdP's row byte for byte: an
    // assertion is POSTed to the registered ACS, and an app listening anywhere
    // else sees a login that silently never completes. So the registration is
    // the single producer and this reads it, rather than rebuilding it from the
    // hostname and the path — which is P3 Session 5's defect shape exactly.
    const base = ctx()
    const moved = {
      ...base,
      spEntity: {
        ...base.spEntity!,
        acsUrl: 'https://chem-labs.staging.manifest.internal/x',
      },
    }
    expect(renderInjection(moved).SAML_CALLBACK_URL).toBe(
      'https://chem-labs.staging.manifest.internal/x',
    )
  })

  it('produces MORE THAN ONE variable for a declared mongo service', () => {
    // §8: "A service declaration produces more than one variable. services[].name
    // is a convenience label, not a variable name." Measured 2026-09-07:
    // deployRelease injected MONGODB_URI alone, and every app fell back to a
    // database called `app` — while two Docker tests set MONGODB_DB_NAME
    // themselves and passed.
    const env = renderInjection(ctx())
    expect(env.MONGODB_URI).toContain('mongodb://')
    expect(env.MONGODB_DB_NAME).toBe('chem_labs')
  })

  it('reads MONGODB_DB_NAME out of the endpoint, so the two cannot disagree', () => {
    // Not re-derived from the slug: the database name is chosen where the
    // credentials are, and a second derivation here is a value that agrees until
    // the day it does not.
    const env = renderInjection(
      ctx({
        services: [
          {
            type: 'mongo',
            endpoint: 'mongodb://u:p@host:27017/somewhere_else?authSource=admin',
          },
        ],
      }),
    )
    expect(env.MONGODB_DB_NAME).toBe('somewhere_else')
    expect(env.MONGODB_URI).toContain('/somewhere_else')
  })

  it('gives qdrant its three variables, with the key out of the URL', () => {
    const env = renderInjection(
      ctx({
        services: [{ type: 'qdrant', endpoint: 'http://u:sekrit@mf-q:6333/vectors' }],
      }),
    )
    expect(env.QDRANT_URL).toBe('http://mf-q:6333')
    expect(env.QDRANT_API_KEY).toBe('sekrit')
    expect(env.QDRANT_COLLECTION).toBe('vectors')
  })

  // §16's identity-path regression tier names these two directly, and getting
  // either backwards points a real cohort at the wrong identity provider.
  it('never resolves a production environment to the Manifest IdP', () => {
    const env = renderInjection(ctx({ kind: 'production' }))
    expect(env.SAML_IDP_METADATA_URL).toBe('https://authentication.ubc.ca/idp/shibboleth')
    expect(env.SAML_IDP_METADATA_URL).not.toContain('manifest.internal')
    expect(env.SAML_ENTRY_POINT).not.toContain('manifest.internal')
    expect(env.SAML_LOGOUT_URL).not.toContain('manifest.internal')
  })

  it('never resolves sandbox or staging to real UBC Shibboleth', () => {
    for (const kind of ['sandbox', 'staging'] as const) {
      const env = renderInjection(ctx({ kind }))
      expect(env.SAML_IDP_METADATA_URL).toContain('idp.manifest.internal')
      expect(env.SAML_ENTRY_POINT).not.toContain('ubc.ca')
      // The stg host specifically: it is what the library defaults to, so a
      // sandbox pointed there is the exact failure §8 spends a paragraph on.
      expect(env.SAML_ENTRY_POINT).not.toContain('authentication.stg.id.ubc.ca')
    }
  })

  it('injects the SimpleSAMLphp 2.x endpoint paths, not the library 1.x defaults', () => {
    // passport-ubcshib's UBC_CONFIG.LOCAL carries SimpleSAMLphp 1.x paths, which
    // 404 against the 2.x IdP this platform runs. That is why §8 makes
    // SAML_ENTRY_POINT mandatory rather than optional.
    const env = renderInjection(ctx())
    expect(env.SAML_ENTRY_POINT).toBe(
      'https://idp.manifest.internal/module.php/saml/idp/singleSignOnService',
    )
    expect(env.SAML_LOGOUT_URL).toBe(
      'https://idp.manifest.internal/module.php/saml/idp/singleLogout',
    )
    expect(env.SAML_ENTRY_POINT).not.toContain('/simplesaml/')
  })

  it('injects the SP paths only when auth.provider is cwl', () => {
    const none = renderInjection(ctx({ spec: withAuthProvider('none') }))
    expect(none).not.toHaveProperty('SAML_ISSUER')
    expect(none).not.toHaveProperty('SAML_IDP_CERT_PATH')
    expect(none).not.toHaveProperty('SAML_ENVIRONMENT')
    // and it is still a deployable app
    expect(none.PORT).toBe('3000')
    expect(none.MONGODB_DB_NAME).toBe('chem_labs')
  })

  it('requires SAML_PRIVATE_KEY_PATH in staging and production, not in sandbox', () => {
    // §8's "Required in" column, which is not decoration: the Manifest IdP
    // requires signed AuthnRequests in staging (§9) and real UBC encrypts
    // assertions.
    expect(renderInjection(ctx()).SAML_PRIVATE_KEY_PATH).toBe(
      INJECTED_FILE_PATHS.spPrivateKey,
    )
    expect(renderInjection(ctx({ kind: 'production' }))).toHaveProperty(
      'SAML_PRIVATE_KEY_PATH',
    )
    expect(renderInjection(ctx({ kind: 'sandbox' }))).not.toHaveProperty(
      'SAML_PRIVATE_KEY_PATH',
    )
  })

  it('takes SAML_ISSUER from the registered entityID', () => {
    expect(renderInjection(ctx()).SAML_ISSUER).toBe(
      'https://manifest.internal/sp/chem-labs/staging',
    )
  })

  it('refuses to render an app that declares models with no key minted for it', () => {
    // P4a's Decision 12 refused every AI row, naming P4b. P4b Task 9 keeps the refusal
    // and changes its meaning — "P4b does not exist" became "the caller minted no key"
    // — because the property is the same: an app deployed with LLM_API_KEY unset
    // starts, looks healthy, and is a support ticket on its first question.
    expect(() => renderInjection(ctx({ spec: withModels(['default-chat']) }))).toThrow(
      /INJECTION_AI_KEY_MISSING/,
    )
  })

  it('never lets the app shadow a platform binding', () => {
    // P3 established the ordering in deployRelease and gave it a test; this
    // asserts it inside the renderer, so the rule survives the ad-hoc block
    // being deleted in Task 11.
    const spec = withEnv([{ name: 'MONGODB_URI', value: 'mongodb://attacker/' }])
    const env = renderInjection(ctx({ spec }))
    expect(env.MONGODB_URI).not.toContain('attacker')
    expect(env.MONGODB_URI).toContain('mf-svc-chem-labs-staging-db')
  })

  it('shadows PORT and MANIFEST_APP_URL too, not only the service bindings', () => {
    const spec = withEnv([
      { name: 'PORT', value: '9000' },
      { name: 'MANIFEST_APP_URL', value: 'https://evil.example' },
    ])
    const env = renderInjection(ctx({ spec }))
    expect(env.PORT).toBe('3000')
    expect(env.MANIFEST_APP_URL).toBe('https://chem-labs.staging.manifest.internal')
  })

  it('keeps the app’s own variables that collide with nothing', () => {
    expect(renderInjection(ctx()).COURSE_CODE).toBe('CHEM_121')
  })

  it('names every platform variable as reserved, so validation can say so', () => {
    // The other read of the same list. Silently overwriting is right for the
    // SECURITY property above and wrong for the faculty member, who wrote a
    // variable that does nothing; `spec/policy.ts` reads this set to tell them.
    expect(RESERVED_ENV_NAMES.has('PORT')).toBe(true)
    expect(RESERVED_ENV_NAMES.has('MONGODB_DB_NAME')).toBe(true)
    expect(RESERVED_ENV_NAMES.has('COURSE_CODE')).toBe(false)
    expect(RESERVED_ENV_NAMES.size).toBe(INJECTION_VARIABLES.length)
  })
})

describe('§8 injection contract — the guards on its inputs', () => {
  it('refuses a resolved config resolved for a different environment', () => {
    // Two independent reads of one setting: the environment ROW's kind, and the
    // kind the config was frozen for. They agree by construction today, and the
    // day they stop is the day an app is deployed with another environment's
    // resources and another environment's URL.
    const wrong = { ...ctx(), environmentKind: 'production' as const }
    expect(() => renderInjection(wrong)).toThrow(/INJECTION_ENVIRONMENT_MISMATCH/)
  })

  it('refuses a hostname whose first label is not the project slug (§23)', () => {
    expect(() => renderInjection({ ...ctx(), projectSlug: 'other-app' })).toThrow(
      /INJECTION_HOSTNAME_SLUG_MISMATCH/,
    )
  })

  it('refuses a cwl app with no registered SP entity', () => {
    const missing = { ...ctx() }
    delete missing.spEntity
    expect(() => renderInjection(missing)).toThrow(/INJECTION_SP_ENTITY_MISSING/)
  })

  it('refuses an SP entity for an app that declares no sign-on', () => {
    const spec = withAuthProvider('none')
    const registered = ctx().spEntity!
    const stray = { ...ctx({ spec }), spEntity: registered }
    expect(() => renderInjection(stray)).toThrow(/INJECTION_SP_ENTITY_UNEXPECTED/)
  })

  it('refuses a service type it has no variables for', () => {
    expect(() =>
      renderInjection(
        ctx({ services: [{ type: 'redis', endpoint: 'redis://h:6379/0' }] }),
      ),
    ).toThrow(/INJECTION_SERVICE_UNKNOWN/)
  })

  it('refuses a service endpoint that is not a URL', () => {
    expect(() =>
      renderInjection(
        ctx({ services: [{ type: 'mongo', endpoint: 'mf-svc-db:27017' }] }),
      ),
    ).toThrow(/INJECTION_SERVICE_ENDPOINT_INVALID/)
  })

  it('refuses a mongo endpoint with no database in it', () => {
    expect(() =>
      renderInjection(
        ctx({ services: [{ type: 'mongo', endpoint: 'mongodb://u:p@h:27017' }] }),
      ),
    ).toThrow(/INJECTION_SERVICE_ENDPOINT_INVALID/)
  })

  it('treats a release frozen before ResolvedConfig.auth existed as no sign-on', () => {
    // Task 9's finding 41, at the second reader. §13 froze these configs; the
    // ones written before 2026-09-09 have no `auth` key at all, and reading
    // through it would throw and take an existing developer's redeploy with it.
    const base = ctx({ spec: withAuthProvider('none') })
    const legacy = { ...base.resolved } as Partial<ResolvedConfig>
    delete legacy.auth
    const rendered = renderInjection({ ...base, resolved: legacy as ResolvedConfig })
    expect(rendered).not.toHaveProperty('SAML_ISSUER')
    expect(rendered.MANIFEST_ENV).toBe('staging')
  })

  it('is an InjectionError, with a code that survives a message edit', () => {
    try {
      renderInjection(ctx({ spec: withModels(['default-chat']) }))
      expect.unreachable('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(InjectionError)
      expect((error as InjectionError).code).toBe('INJECTION_AI_KEY_MISSING')
    }
  })
})

/** What `deployRelease` hands the renderer for an AI app: the key it minted this deploy. */
const MINTED = {
  endpoint: 'http://manifest-litellm:4000/v1',
  apiKey: 'sk-minted-for-this-deploy',
}
const CHAT_AND_EMBED = {
  ...MINTED,
  defaultChatModel: 'default-chat',
  embeddingModel: 'default-embed',
}

/** A staging chem-labs declaring `models`, resolved from the spec, with `ai` supplied. */
const aiCtx = (
  models: string[],
  ai: NonNullable<InjectionContext['ai']>,
): InjectionContext => ({ ...ctx({ spec: withModels(models) }), ai })

describe('§8 AI rows (P4b Task 9)', () => {
  it('renders the six rows for an app that declares a chat and an embedding model', () => {
    const env = renderInjection(aiCtx(['default-chat', 'default-embed'], CHAT_AND_EMBED))
    // §8: there is NO `openai-compat` provider.
    expect(env.LLM_PROVIDER).toBe('openai')
    expect(env.LLM_ENDPOINT).toBe('http://manifest-litellm:4000/v1')
    expect(env.LLM_API_KEY).toBe('sk-minted-for-this-deploy')
    expect(env.LLM_DEFAULT_MODEL).toBe('default-chat')
    expect(env.EMBEDDINGS_PROVIDER).toBe('openai')
    expect(env.EMBEDDINGS_MODEL).toBe('default-embed')
  })

  it('adds exactly the table’s AI rows to an app, and nothing the table lacks', () => {
    // Both directions, as the non-AI comparison above does: a row deleted from the
    // table and a variable dropped from the renderer are each red, separately.
    const plain = new Set(Object.keys(renderInjection(ctx())))
    const added = Object.keys(
      renderInjection(aiCtx(['default-chat', 'default-embed'], CHAT_AND_EMBED)),
    ).filter((name) => !plain.has(name))
    const aiRows = INJECTION_VARIABLES.filter((v) => v.requiredIn === 'if-ai').map(
      (v) => v.name,
    )
    expect(added.sort()).toEqual([...aiRows].sort())
  })

  it('omits LLM_DEFAULT_MODEL for an embeddings-only app, and the EMBEDDINGS rows for a chat-only one', () => {
    // §8's "if declared". An EMPTY LLM_DEFAULT_MODEL is worse than an absent one: the
    // toolkit sends '' and a key with a models list refuses it as not permitted.
    const embedOnly = renderInjection(
      aiCtx(['default-embed'], { ...MINTED, embeddingModel: 'default-embed' }),
    )
    expect(embedOnly).not.toHaveProperty('LLM_DEFAULT_MODEL')
    expect(embedOnly.EMBEDDINGS_MODEL).toBe('default-embed')

    const chatOnly = renderInjection(
      aiCtx(['default-chat'], { ...MINTED, defaultChatModel: 'default-chat' }),
    )
    expect(chatOnly.LLM_DEFAULT_MODEL).toBe('default-chat')
    expect(chatOnly).not.toHaveProperty('EMBEDDINGS_MODEL')
    expect(chatOnly).not.toHaveProperty('EMBEDDINGS_PROVIDER')
  })

  it('renders NO AI row for an app that declares no models', () => {
    const env = renderInjection(ctx())
    for (const row of INJECTION_VARIABLES.filter((v) => v.requiredIn === 'if-ai')) {
      expect(env, `${row.name} leaked into a non-AI app`).not.toHaveProperty(row.name)
    }
  })

  it('refuses an EMPTY key exactly as it refuses a missing one', () => {
    expect(() =>
      renderInjection(
        aiCtx(['default-chat'], {
          ...MINTED,
          apiKey: '',
          defaultChatModel: 'default-chat',
        }),
      ),
    ).toThrow(/INJECTION_AI_KEY_MISSING/)
  })

  it('refuses a key for an app that declares no models', () => {
    // The other half, as with an SP entity for an app with no sign-on: one of the two
    // is wrong, and guessing gives an app AI access it never declared.
    expect(() => renderInjection({ ...ctx(), ai: CHAT_AND_EMBED })).toThrow(
      /INJECTION_AI_UNEXPECTED/,
    )
  })

  it('refuses to name a model the release did not declare', () => {
    // The key is minted for the declared models only, so any other name is a 403 on
    // the app's first question.
    expect(() =>
      renderInjection(
        aiCtx(['default-chat'], { ...MINTED, defaultChatModel: 'default-chat-onprem' }),
      ),
    ).toThrow(/INJECTION_AI_MODEL_UNDECLARED/)
  })

  it('never lets the app shadow its key or its endpoint', () => {
    // §12: application code is untrusted input. An app that declares its own
    // LLM_ENDPOINT must not be able to send its users' questions somewhere else while
    // appearing bound to the platform's gateway.
    const spec = manifestSchema.parse(
      parse(
        yaml({
          ai: 'ai:\n  models: [default-chat]',
          env:
            "  - { name: LLM_API_KEY, value: 'sk-attacker' }\n" +
            "  - { name: LLM_ENDPOINT, value: 'http://evil.example/v1' }",
        }),
      ),
    )
    const env = renderInjection({
      ...ctx({ spec }),
      ai: { ...MINTED, defaultChatModel: 'default-chat' },
    })
    expect(env.LLM_API_KEY).toBe('sk-minted-for-this-deploy')
    expect(env.LLM_ENDPOINT).toBe('http://manifest-litellm:4000/v1')
  })
})
