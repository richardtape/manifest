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
 * is dismissed the platform cannot show it again and neither can this screen — not even to a
 * retry with the same Idempotency-Key, which since the authoring API plan's Task 12 is `409
 * TOKEN_ALREADY_MINTED` (this screen mints with a new key per submit, so it never sends one).
 * It is held in
 * component state and nowhere else: never `localStorage`, never a URL, never a
 * `console.log` (§14 — an operator line with a credential in it is a defect this project
 * names four times).
 *
 * **(b) The privileged four are not offerable, nor the person-only set** — see `PRIVILEGED`
 * and `PERSON_ONLY` below, and the D22 finding recorded with them.
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
 * EVERY ONE THE CONTRACT NAMES, HELD TO THE DOCUMENT BY `tsc` IN BOTH DIRECTIONS — eleven
 * until P6a Task 6 added `launch:record`, which `tsc` caught here and `pnpm test` could not
 * see at all, twelve until the authoring API plan's Task 6 added `source:write`, caught here
 * again, and thirteen until its Task 8 added `secret:write`; no count since, because the one
 * written here drifted (the launch path plan's Task 6b added `launch:rehearse`). A capability
 * renamed or removed from `MintTokenRequest.capabilities` makes the array un-assignable; one
 * ADDED makes `Exclude<Capability, T[number]>` non-`never`, which collapses the parameter's type to
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
  /**
   * Writing the project's code, `manifest.yaml` included, through `createCommit` (the
   * authoring API plan's Task 6). Mintable, and neither privileged nor person-only — the
   * capability an agent that writes an app needs.
   */
  'source:write',
  /**
   * Setting the values of the app's declared secrets (the authoring API plan's Task 8).
   * Mintable — but a token's covers SANDBOX AND STAGING only: a production value is set in
   * an interactive session with step-up, and the platform refuses a token that asks (§20,
   * D24). Nothing reads a value back, so nothing here can either.
   */
  'secret:write',
  /**
   * Reading a running app's recent output, in the sandbox only (§14; the front-end enablement
   * plan's Task 3, and FE-24's code in its sitting 10). Mintable, and not given by `project:read`: a test user's input
   * can be in what an app prints, so a read-only dashboard token does not carry it by default.
   */
  'output:read',
  /**
   * Giving the agent a model key, charged to the person who minted the token (§10; the front-end
   * enablement plan's Task 10). Mintable — the agent's spend is its minter's, capped per session
   * and by their monthly agent budget, and a token ends only the sessions it started.
   */
  'agent:session',
  'members:manage',
  'build:create',
  'release:create',
  'release:deploy',
  'release:promote',
  'release:approve',
  /**
   * §9 and R1 (P6a Task 6): recording what UBC IAM and the Privacy Office said. NOT one of
   * D24's four, and since P6b Task 2 not mintable either: it is PERSON-ONLY, with
   * `release:approve` (`PERSON_ONLY` below). Listed, and disabled with the reason, for the
   * same honest shape this screen has for the four: the API is what says no.
   */
  'launch:record',
  /**
   * Running D21's pre-production rehearsal (the launch path plan's Task 6b): the owner's, a
   * collaborator's and an administrator's — and PERSON-ONLY, so never mintable (`PERSON_ONLY`
   * below). Caught here by `tsc`, as every capability added to the contract is.
   */
  'launch:rehearse',
  'quota:set',
  'secret:read',
] as const)

/**
 * D24's PRIVILEGED FOUR — **RESTATED HERE, AND THAT IS A FINDING ABOUT THE API, NOT A
 * DECISION THIS SCREEN IS HAPPY WITH.**
 *
 * `MintTokenRequest.capabilities` is a flat enum of every capability and marks none of them
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

/**
 * D24's PERSON-ONLY THREE (P6b Task 2; `project:delete` — archiving and deleting a project, §11 —
 * since the front-end enablement plan's Task 11) AND THE REHEARSAL (`launch:rehearse`, the launch
 * path plan's Task 6b) — **RESTATED HERE FOR EXACTLY THE REASON
 * `PRIVILEGED` ABOVE IS, AND THAT IS STILL A FINDING ABOUT THE DOCUMENT, NOT A PREFERENCE.**
 * `MintTokenRequest.capabilities` marks neither class; only its prose names them.
 *
 * Stricter than the four: an agent asking for one of these is refused `403
 * TOKEN_PERSON_ONLY` with NO question for anybody to confirm, because each is a person's to do
 * in their own session. The mint route refuses every one of them `400 TOKEN_CAPABILITY_FORBIDDEN`;
 * `disabled` is an explanation, never the control.
 */
const PERSON_ONLY: ReadonlySet<Capability> = new Set<Capability>([
  'release:approve',
  'launch:record',
  'project:delete',
  'launch:rehearse',
])

const PERSON_ONLY_REASON = 'A person does this — no token and no confirmation can.'

/**
 * WHAT A MINTABLE CAPABILITY DOES NOT COVER, said beside its box — the authoring API plan's
 * Task 10, for its Task 8's `secret:write`: a token's covers sandbox and staging, and a
 * production value is a stepped-up person's alone (§20, D24; Spec action 2). An explanation
 * like the two sets above: the platform refuses a token's production write `403
 * TOKEN_CREDENTIAL_REFUSED` whatever this says.
 */
const SCOPED: Partial<Record<Capability, string>> = {
  'secret:write':
    'Sandbox and staging only: a production value is set by a person who has confirmed it is them, never by a token.',
}

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
      <AgentSessions api={api} projectId={projectId} frames={frames} />
    </>
  )
}

/**
 * AGENT SESSIONS (the front-end enablement plan's Tasks 9–10; Spec action 1): a model key for an
 * agent working OUTSIDE Manifest — Claude Code on a laptop, the faculty front-end's own agent —
 * charged to the person it works for, capped per session and by the person's month, short-lived,
 * and limited to the models D17 allows the project's data. Beside the tokens because it is the
 * same kind of thing: a credential a person hands an agent, shown once.
 *
 * RE-READ ON `agent_session.started` / `.narrowed` / `.ended` (D23.2) — a session a token started,
 * one a raised classification narrowed, or one its token's revocation ended, reaches this list without
 * a reload.
 */
function AgentSessions({
  api,
  projectId,
  frames,
}: {
  api: Api
  projectId: string
  frames: StreamFrame[]
}) {
  const changed = frames.filter(
    (f) =>
      f.kind === 'event' &&
      (f.type === 'agent_session.started' ||
        f.type === 'agent_session.narrowed' ||
        f.type === 'agent_session.ended'),
  ).length
  const sessions = useAsync(() => api.listAgentSessions(projectId), [projectId, changed])
  const budget = useAsync(() => api.getAgentBudget(), [changed])
  const [started, setStarted] = useState<Schemas['AgentSessionStarted'] | undefined>(
    undefined,
  )
  const [error, setError] = useState<unknown>(undefined)

  return (
    <>
      <Panel title="Agent sessions — a model key for an agent">
        <Budget budget={budget.value} error={budget.error} />
        <StartSession
          api={api}
          projectId={projectId}
          onStarted={(s) => {
            setStarted(s)
            sessions.reload()
            budget.reload()
          }}
        />
      </Panel>
      {started !== undefined && (
        <KeyOnce started={started} onDismiss={() => setStarted(undefined)} />
      )}
      <Panel title="This project’s agent sessions">
        <Refusal error={sessions.error} />
        <Refusal error={error} />
        {sessions.value?.sessions.length === 0 && (
          <p>No agent sessions on this project.</p>
        )}
        <ul className="tokens">
          {(sessions.value?.sessions ?? []).map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              onEnd={async () => {
                setError(undefined)
                try {
                  await api.endAgentSession(session.id, api.newKey())
                  sessions.reload()
                } catch (e) {
                  setError(e)
                }
              }}
            />
          ))}
        </ul>
        {sessions.value?.truncated === true && (
          <p className="hint">Only the 50 newest are listed.</p>
        )}
      </Panel>
    </>
  )
}

/** The person's month across EVERY project — `spentUsd` null with its reason, never shown as 0. */
function Budget({
  budget,
  error,
}: {
  budget: Schemas['AgentBudget'] | undefined
  error: unknown
}) {
  if (error !== undefined) return <Refusal error={error} />
  if (budget === undefined) return null
  return (
    <Field label="Your month">
      {budget.spentUsd === null ? (
        <>
          ${budget.monthlyUsd.toFixed(2)} a month; what is spent is not known right now —{' '}
          <span className="hint">{budget.unavailable}</span>
        </>
      ) : (
        <>
          ${budget.spentUsd.toFixed(2)} of ${budget.monthlyUsd.toFixed(2)} spent across
          every project, ${budget.remainingUsd?.toFixed(2)} left
          {budget.resetsAt !== null && (
            <>
              {' '}
              — resets <Instant at={budget.resetsAt} />
            </>
          )}
        </>
      )}
    </Field>
  )
}

function StartSession({
  api,
  projectId,
  onStarted,
}: {
  api: Api
  projectId: string
  onStarted: (started: Schemas['AgentSessionStarted']) => void
}) {
  const [name, setName] = useState('')
  const [cap, setCap] = useState('')
  const [minutes, setMinutes] = useState(60)
  const [error, setError] = useState<unknown>(undefined)
  const [busy, setBusy] = useState(false)
  // ONE KEY PER START (D23.6), reused if Start is pressed again: a retry is `409
  // AGENT_SESSION_ALREADY_STARTED`, never a second key — and never the first key twice.
  const [idempotency, setIdempotency] = useState(() => api.newKey())

  async function start(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      onStarted(
        await api.startAgentSession(
          projectId,
          {
            name,
            durationMinutes: minutes,
            ...(cap.trim() === '' ? {} : { capUsd: Number(cap) }),
          },
          idempotency,
        ),
      )
      setName('')
      setIdempotency(api.newKey())
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={start}>
      <p className="hint">
        The key is shown <strong>once</strong>, on the next panel. Manifest keeps no copy
        — copy it then, or start another. What it spends is charged to you.
      </p>
      <Field label="What the agent is doing">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={64}
          placeholder="Build the bulletin board"
        />
      </Field>
      <Field label="At most">
        $
        <input
          type="number"
          min={0.01}
          max={1000}
          step={0.01}
          value={cap}
          onChange={(e) => setCap(e.target.value)}
          placeholder="optional"
        />{' '}
        — never more than what is left of your month
      </Field>
      <Field label="For">
        <input
          type="number"
          min={1}
          max={480}
          value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value))}
          required
        />{' '}
        minutes — at most 480, and never past your sign-in
      </Field>
      <button disabled={busy}>{busy ? 'starting…' : 'Start a session'}</button>
      <Refusal error={error} />
    </form>
  )
}

/**
 * THE SESSION'S KEY, SHOWN ONCE AND THEN GONE — exactly as a token's secret is (`Secret` above):
 * `onDismiss` clears the caller's state, and nothing else holds it, so a reload of this screen
 * shows no key (Task 13's Step 2 checks that by reloading).
 */
function KeyOnce({
  started,
  onDismiss,
}: {
  started: Schemas['AgentSessionStarted']
  onDismiss: () => void
}) {
  const [copied, setCopied] = useState(false)
  return (
    <Panel title="The agent’s key — copy it now">
      <p className="hint">
        This is the only time it is shown; Manifest keeps no copy. Give the agent the key
        and this address, and it can call {started.session.models.join(', ')}. It stops
        working <Instant at={started.session.expiresAt} />, or once $
        {started.session.capUsd.toFixed(2)} is spent.
      </p>
      <pre className="secret">{started.key}</pre>
      <Field label="Address">
        <code>{started.baseUrl}</code>
      </Field>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(started.key).then(() => setCopied(true))
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

function SessionRow({
  session,
  onEnd,
}: {
  session: Schemas['AgentSession']
  onEnd: () => Promise<void>
}) {
  return (
    <li>
      <Field label={session.name}>
        <Pill tone={session.state === 'active' ? 'good' : 'plain'}>{session.state}</Pill>{' '}
        <code>{session.id.slice(0, 8)}</code>{' '}
        <button
          type="button"
          onClick={() => void onEnd()}
          disabled={session.state !== 'active'}
        >
          End
        </button>
      </Field>
      <div className="hint">
        for {session.person.name}
        {session.via !== null && (
          <> · started by the token “{session.via.tokenName}”</>
        )} · {session.models.join(', ')}
      </div>
      <div className="hint">
        {session.spentUsd === null ? (
          <>spent: not known — {session.spentUnavailable}</>
        ) : (
          <>
            ${session.spentUsd.toFixed(2)} of ${session.capUsd.toFixed(2)} spent
          </>
        )}{' '}
        ·{' '}
        {session.endedAt === null ? (
          <>
            expires <Instant at={session.expiresAt} />
          </>
        ) : (
          <>
            ended <Instant at={session.endedAt} />
            {/* Why, when it was not simply ended: a revoked token, or the project switched off. */}
            {session.endReason !== null &&
              session.endReason !== 'ended' &&
              ` — ${session.endReason.replace('_', ' ')}`}
          </>
        )}
      </div>
    </li>
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
              const personOnly = PERSON_ONLY.has(capability)
              return (
                <li key={capability}>
                  <label>
                    <input
                      type="checkbox"
                      // AN EXPLANATION, NOT A CONTROL. The mint route refuses any of these
                      // `400 TOKEN_CAPABILITY_FORBIDDEN` whatever this checkbox does.
                      disabled={privileged || personOnly}
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
                  {personOnly && <div className="hint">{PERSON_ONLY_REASON}</div>}
                  {SCOPED[capability] !== undefined && (
                    <div className="hint">{SCOPED[capability]}</div>
                  )}
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
