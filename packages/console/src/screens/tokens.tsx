import { useState, type FormEvent } from 'react'
import type { Schemas, StreamFrame } from '@manifest/contract'
import type { Api } from '../api'
import { Instant, Field, Panel, Pill, Refusal, useAsync } from '../ui'

/**
 * D24's DELEGATED TOKENS, and the screen that makes P5b's second credential class usable by
 * a person instead of by `curl`.
 *
 * FOUR THINGS D24 MAKES TRUE, and this screen exists to show all four:
 *
 * **(a) The secret is shown exactly ONCE.** `MintedToken.secret` is the only place in this
 * API a credential is returned, and no read schema has the field at all — so once the panel
 * is dismissed the platform cannot show it again and neither can this screen. It is held in
 * component state and nowhere else: never `localStorage`, never a URL, never a
 * `console.log` (§14 — an operator line with a credential in it is a defect this project
 * names four times).
 *
 * **(b) The privileged four are not offerable** — see `PRIVILEGED` below, and the D22
 * finding recorded with it.
 *
 * **(c) `expired` is the PLATFORM's computed field and is NOT `revokedAt !== null`** (P5b
 * Task 10). A clock and a person are different answers to why a credential stopped, and both
 * are rendered. P5b sitting 7's F4 is the twin of getting this wrong: `.map(toToken)` passed
 * the array index where a clock belonged and every token in every list read `expired: false`.
 *
 * **(d) A minter's own token list is the PROJECT's.** `listTokens` is project-scoped, so a
 * token a collaborator minted is visible here — and **only its minter may revoke it**,
 * everyone else getting the `404` an unknown id gets. The Revoke button is therefore shown on
 * every row and its refusal is rendered: the console has no minter field to guess from, and
 * guessing would be the console inventing authority it does not have.
 */

type Capability = Schemas['MintTokenRequest']['capabilities'][number]

/**
 * THE TWELVE, HELD TO THE DOCUMENT BY `tsc` IN BOTH DIRECTIONS — eleven until P6a Task 6
 * added `launch:record`, which `tsc` caught here and `pnpm test` could not see at all. A capability renamed or
 * removed from `MintTokenRequest.capabilities` makes the array un-assignable; one ADDED makes
 * `Exclude<Capability, T[number]>` non-`never`, which collapses the parameter's type to
 * `never` and refuses the call. So this list cannot silently drift from the contract, which
 * is the whole reason it is written through a function rather than as a bare `as const`.
 */
function everyCapability<T extends readonly Capability[]>(
  list: T & (Exclude<Capability, T[number]> extends never ? unknown : never),
): readonly Capability[] {
  return list
}

const CAPABILITIES = everyCapability([
  'project:read',
  'project:write',
  'project:delete',
  'members:manage',
  'build:create',
  'release:create',
  'release:deploy',
  'release:promote',
  'release:approve',
  /**
   * §9 and R1 (P6a Task 6): recording what UBC IAM and the Privacy Office said. It is
   * mintable — it is NOT one of D24's four — and a token holding it is still refused
   * `403 TOKEN_CREDENTIAL_REFUSED`, because every route asserting it calls
   * `requireSession` first (P6a Decision 4). **So it is offered here and it will not
   * work**, which is the same honest shape this screen already has for the four below:
   * the API is what says no, and the console does not pretend to know better.
   */
  'launch:record',
  'quota:set',
  'secret:read',
] as const)

/**
 * D24's PRIVILEGED FOUR — **RESTATED HERE, AND THAT IS A FINDING ABOUT THE API, NOT A
 * DECISION THIS SCREEN IS HAPPY WITH.**
 *
 * `MintTokenRequest.capabilities` is a flat enum of all eleven and marks none of them
 * privileged; the four are named only in the schema's prose `description`, which no client
 * can read at runtime. So a console that tells a person which boxes cannot work has to say it
 * itself — and this plan forbids exactly that elsewhere (*"the console never restates the
 * slug rule"*, §23), while the control plane holds the same four with a test that names them
 * as literals so it cannot agree with the constant it checks
 * (`projects/privileged.test.ts`).
 *
 * **Nothing here enforces anything.** The platform refuses a privileged capability at the
 * mint route with `400 TOKEN_CAPABILITY_FORBIDDEN` however the request arrives, and that
 * refusal is the control — watched as this task's third negative control. `disabled` is an
 * explanation, and if this list ever drifts from D24's the worst case is a stale sentence
 * beside a refusal that is still correct.
 *
 * **The fix belongs to the document**, as `x-manifest-privileged` on the enum or as two
 * enums, and it is not this plan's to make: P5c changes no route.
 */
const PRIVILEGED: ReadonlySet<Capability> = new Set<Capability>([
  'members:manage',
  'release:promote',
  'quota:set',
  'secret:read',
])

const PRIVILEGED_REASON =
  'D24: a delegated token never carries this, however it is minted. An agent that asks is answered with a question a person confirms.'

/** What a token was minted with by default here — the four an agent needs to build and ship. */
const SUGGESTED: readonly Capability[] = [
  'project:read',
  'build:create',
  'release:create',
  'release:deploy',
]

export function Tokens({
  api,
  projectId,
  frames,
}: {
  api: Api
  projectId: string
  frames: StreamFrame[]
}) {
  // D23.2: RE-READ WHEN A FRAME SAYS IT CHANGED, never on a timer — and this screen consumes
  // the project screen's ONE socket rather than opening a second (§7e, D23.2).
  //
  // ONLY `mintToken` PUBLISHES. `revokeToken` publishes nothing (`api/routes/tokens.ts` has
  // one `publishEvent`, in the mint handler), so a revocation made in another tab or by
  // another person cannot reach this list — the same shape as `validateSpec` (sitting 4, F5)
  // and `createRelease` (sitting 5, F7). Our OWN revoke reloads locally, below.
  const minted = frames.filter(
    (f) => f.kind === 'event' && f.type === 'token.minted',
  ).length
  const tokens = useAsync(() => api.listTokens(projectId), [projectId, minted])
  const [secret, setSecret] = useState<string | undefined>(undefined)
  const [error, setError] = useState<unknown>(undefined)

  return (
    <>
      <Mint
        api={api}
        projectId={projectId}
        onMinted={(m) => {
          setSecret(m.secret)
          tokens.reload()
        }}
      />
      {secret !== undefined && (
        <Secret secret={secret} onDismiss={() => setSecret(undefined)} />
      )}
      <Panel title="Tokens">
        <Refusal error={tokens.error} />
        <Refusal error={error} />
        {(tokens.value ?? []).length === 0 && tokens.error === undefined && (
          <p>No tokens on this project.</p>
        )}
        <ul className="tokens">
          {(tokens.value ?? []).map((token) => (
            <TokenRow
              key={token.id}
              token={token}
              onRevoke={async () => {
                setError(undefined)
                try {
                  await api.revokeToken(token.id, api.newKey())
                  tokens.reload()
                } catch (e) {
                  setError(e)
                }
              }}
            />
          ))}
        </ul>
      </Panel>
    </>
  )
}

function Mint({
  api,
  projectId,
  onMinted,
}: {
  api: Api
  projectId: string
  onMinted: (minted: Schemas['MintedToken']) => void
}) {
  const [name, setName] = useState('')
  const [days, setDays] = useState(30)
  const [chosen, setChosen] = useState<readonly Capability[]>(SUGGESTED)
  const [error, setError] = useState<unknown>(undefined)
  const [busy, setBusy] = useState(false)

  async function mint(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      onMinted(
        await api.mintToken(
          projectId,
          { name, capabilities: [...chosen], expiresInDays: days },
          api.newKey(),
        ),
      )
      setName('')
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="Mint a delegated token">
      {/*
        SAID BEFORE THE BUTTON IS PRESSED, NOT AFTER. The secret exists in exactly one
        response and on no read schema at all, so a person who dismisses the panel without
        copying it has to mint another — and being told that afterwards is being told too
        late.
      */}
      <p className="hint">
        The token is shown <strong>once</strong>, on the next screen. Manifest keeps only
        a hash of it and cannot show it again — copy it then, or mint another.
      </p>
      <form onSubmit={mint}>
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="what this agent is for"
            required
            maxLength={64}
          />
        </Field>
        <Field label="Expires in">
          <input
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            required
          />{' '}
          days — D24 bounds a token at 365
        </Field>
        <Field label="May do">
          <ul className="capabilities">
            {CAPABILITIES.map((capability) => {
              const privileged = PRIVILEGED.has(capability)
              return (
                <li key={capability}>
                  <label>
                    <input
                      type="checkbox"
                      // AN EXPLANATION, NOT A CONTROL. The mint route refuses any of these
                      // `400 TOKEN_CAPABILITY_FORBIDDEN` whatever this checkbox does.
                      disabled={privileged}
                      checked={chosen.includes(capability)}
                      onChange={(e) =>
                        setChosen((c) =>
                          e.target.checked
                            ? [...c, capability]
                            : c.filter((x) => x !== capability),
                        )
                      }
                    />{' '}
                    <code>{capability}</code>
                  </label>
                  {privileged && <div className="hint">{PRIVILEGED_REASON}</div>}
                </li>
              )
            })}
          </ul>
        </Field>
        <button disabled={busy || chosen.length === 0}>
          {busy ? 'minting…' : 'Mint'}
        </button>
      </form>
      <Refusal error={error} />
    </Panel>
  )
}

/**
 * THE ONE PLACE THIS API RETURNS A CREDENTIAL, rendered once and then gone. `onDismiss`
 * clears the caller's state, which is what makes "gone" true: keeping it in state after the
 * panel closes would leave the secret live in the page for the rest of the session with
 * nothing on screen saying so, and no test in this console can see that — the comment is the
 * guard, which is why it is written as one.
 */
function Secret({ secret, onDismiss }: { secret: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false)
  return (
    <Panel title="Your new token — copy it now">
      <p className="hint">
        This is the only time it is shown. It is{' '}
        <code>mft_&lt;id&gt;_&lt;secret&gt;</code>; send it as{' '}
        <code>Authorization: Bearer …</code>.
      </p>
      <pre className="secret">{secret}</pre>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(secret).then(() => setCopied(true))
        }}
      >
        {copied ? 'copied' : 'Copy'}
      </button>{' '}
      <button type="button" onClick={onDismiss}>
        I have it — hide this
      </button>
    </Panel>
  )
}

function TokenRow({
  token,
  onRevoke,
}: {
  token: Schemas['Token']
  onRevoke: () => Promise<void>
}) {
  /*
    TWO INDEPENDENT FACTS, AND THE PILL SAYS WHICH. `expired` is computed by the platform
    against the clock (P5b Task 10) and a revoked token that has not expired is NOT expired —
    so this reads `token.expired`, never `token.revokedAt !== null`. A token can be both, and
    then both timestamps are shown below.
  */
  const state = token.expired
    ? 'expired'
    : token.revokedAt !== null
      ? 'revoked'
      : 'active'
  return (
    <li>
      <Field label={token.name}>
        <Pill tone={state === 'active' ? 'good' : 'plain'}>{state}</Pill>{' '}
        <code>{token.id.slice(0, 8)}</code>{' '}
        {/*
          SHOWN ON EVERY ROW, including rows this person cannot revoke: only the MINTER may,
          and the read schema carries no minter — so hiding it would mean guessing, and a
          `404` rendered by <Refusal> is the honest answer (D24, not a defect).
        */}
        <button
          type="button"
          onClick={() => void onRevoke()}
          disabled={state === 'revoked'}
        >
          Revoke
        </button>
      </Field>
      <div className="hint">
        {token.capabilities.map((c) => (
          <code key={c}>{c} </code>
        ))}
      </div>
      <div className="hint">
        expires <Instant at={token.expiresAt} /> · {token.rateLimit} requests a minute ·{' '}
        {token.lastUsedAt === null ? (
          'never used'
        ) : (
          <>
            last used <Instant at={token.lastUsedAt} />
          </>
        )}
        {token.revokedAt !== null && (
          <>
            {' '}
            · revoked <Instant at={token.revokedAt} />
          </>
        )}
      </div>
    </li>
  )
}
