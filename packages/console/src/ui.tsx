import { useCallback, useEffect, useState } from 'react'
import { ManifestApiError, type Schemas } from '@manifest/contract'

/** Every screen reads through this, so every refusal reaches one renderer. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ value?: T; error?: unknown; loading: boolean }>({
    loading: true,
  })
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((t) => t + 1), [])
  useEffect(() => {
    let live = true
    setState((s) => ({ ...s, loading: true }))
    fn().then(
      (value) => live && setState({ value, loading: false }),
      (error: unknown) => live && setState({ error, loading: false }),
    )
    return () => {
      live = false
    }
    // The caller owns `deps`. There is no react-hooks ESLint plugin in this workspace —
    // do NOT write an eslint-disable for a rule that is not installed: ESLint 9 says
    // nothing about it, so the comment reads as a suppressed warning that never existed.
  }, [...deps, tick])
  return { ...state, reload }
}

/**
 * D23.7: errors are machine-actionable — a stable code and a remediation hint — and this is
 * the one place the console renders one. It shows the CODE as well as the message, because
 * the code is what a person can quote and what every test in this project asserts.
 *
 * `code`, `path` and `message` on a detail are all REQUIRED by `ManifestError` in the
 * document — checked there before this was written, because `tsc` cannot tell you until the
 * build and a wrong key renders `undefined` silently.
 *
 * **`launchReadiness` IS RENDERED HERE BECAUSE THE DOC COMMENT ALREADY CLAIMED IT WAS.**
 * Task 4 wrote *"it renders the two typed extras the envelope can carry"* and rendered
 * neither; the plan's Task 8 then relied on that sentence (*"which `<Refusal>` already
 * renders"*) rather than on the code. Nothing caught it for two sittings because no
 * envelope carrying one had ever reached a screen — the first that did was Task 8's
 * production refusal, measured carrying **6** items while the screen rendered **0**.
 * §22 step 7 is *see what a first launch still needs*, and a refusal that drops the
 * checklist is the one thing that step asks for. Since Task 9 it renders through
 * `<ReadinessItems>`, which the launch panel also uses: the refusal and the panel carry the
 * same bytes and now go through the same renderer.
 *
 * **THE ENVELOPE'S OTHER TYPED EXTRA, `pendingAction`, IS NOT RENDERED HERE, AND NOW IT IS
 * KNOWN THAT IT NEVER CAN BE.** Both this comment and the plan said Task 11's queue would
 * be its first caller. It is not, and the reason is structural rather than a matter of
 * sequencing: `TOKEN_ACTION_PENDING` and `TOKEN_ACTION_REJECTED` are the only two envelopes
 * that carry the field (`api/errors.ts`), both come from `api/contract/route.ts`'s wrapper,
 * and the wrapper reaches them only through `TokenCapabilityRefusedError` — which
 * `assertCapability` throws **inside `if (actor.credential === 'token')`** and nowhere else.
 * This console holds a session and only a session: `createApi` has no token option at all
 * (Decision 6), so no refusal it can receive will ever carry a `pendingAction`. A renderer
 * for it would be a module with no call site, which is the shape ORIENTATION §9 names four
 * times. The agent's half of D24's loop reads the field in the AGENT's client, which
 * `packages/journey/src/token.ts` does; the person's half is `screens/queue.tsx`.
 */
export function Refusal({ error }: { error: unknown }) {
  if (error === undefined || error === null) return null
  if (!(error instanceof ManifestApiError)) {
    return (
      <p className="refusal">
        <strong>Something went wrong.</strong> {String(error)}
      </p>
    )
  }
  const envelope = error.envelope?.error
  const readiness = envelope?.launchReadiness
  return (
    <div className="refusal">
      <p>
        <code>{error.code}</code> — {envelope?.message ?? `HTTP ${error.status}`}
      </p>
      {envelope?.hint !== undefined && <p className="hint">{envelope.hint}</p>}
      {envelope?.details !== undefined && (
        <ul>
          {envelope.details.map((d, i) => (
            <li key={i}>
              <code>{d.code}</code> <code>{d.path}</code> {d.message}
            </li>
          ))}
        </ul>
      )}
      {readiness !== undefined && <ReadinessItems items={readiness.items} />}
    </div>
  )
}

/**
 * §13's checklist, RENDERED IN EXACTLY ONE PLACE — which is the whole point of it being a
 * component rather than two loops. The same bytes reach a person two ways: `GET
 * /v1/projects/{id}/launch-readiness` (Task 9's panel) and the production deploy's `409
 * RELEASE_PRODUCTION_GATE_UNAVAILABLE`, whose envelope carries the checklist and which
 * `mapError` parses through the same representation so the two agree key for key (P5a
 * sitting 11, finding 1). Two renderers could disagree while both looked right; one cannot,
 * so a difference between the panel and the refusal would be a finding about the PLATFORM.
 *
 * `not_built` IS RENDERED AS `not_built`. Every item but `scans` answers it in Phase 1 and
 * names the plan that builds it in `builtBy` (P5a Task 15) — that is the difference between
 * *"this is broken"* and *"this arrives in Phase 2"*, and it is the sentence a pilot faculty
 * member actually asks about. Rendering it as *unmet* would be the console inventing a
 * judgement the API did not make.
 */
export function ReadinessItems({
  items,
}: {
  items: Schemas['LaunchReadiness']['items']
}) {
  return (
    <ul className="readiness">
      {items.map((item) => (
        <li key={item.id}>
          <Pill tone={item.state === 'met' ? 'good' : 'plain'}>{item.state}</Pill>{' '}
          <strong>{item.title}</strong>
          {item.blocking && ' — blocking'}
          <br />
          <span className="hint">
            {item.why} Owner: {item.owner}.
            {item.builtBy !== undefined && ` Built by ${item.builtBy}.`}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <p className="field">
      <span className="label">{label}</span> {children}
    </p>
  )
}

export function Pill({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={`pill pill-${tone}`}>{children}</span>
}

/**
 * A RELATIVE INSTANT, IN EITHER DIRECTION — *"4m ago"* for a past one, *"in 30d"* for a
 * future one. §26's headline number is an age, so the console has one renderer for it rather
 * than a `Date` subtraction per screen.
 *
 * **IT RENDERS BOTH DIRECTIONS BECAUSE THE PAST-ONLY VERSION LIED, AND NOTHING COULD SEE
 * IT.** This was `Ago`, which clamped the difference at zero — so a token expiring in thirty
 * days rendered **`expires 0s ago`**, which reads as *already expired* and is the exact
 * opposite of the truth. Measured in the browser on the first token this console ever minted
 * (Task 10): the row said `expires 0s ago` beside a pill reading `active`, contradicting
 * itself, with `tsc`, ESLint, Prettier and every test green — both fields are `string`, so
 * nothing in any gate can tell a past instant from a future one.
 *
 * It is ONE component rather than an `Ago` and an `Until` on purpose: two would put the
 * choice back on the caller, and the caller choosing wrongly is the defect this replaced.
 * Task 11's `PendingAction.expiresAt` is the next future instant to reach a screen.
 */
export function Instant({ at }: { at: string }) {
  const seconds = Math.round((Date.parse(at) - Date.now()) / 1000)
  const magnitude = Math.abs(seconds)
  const size =
    magnitude < 60
      ? `${magnitude}s`
      : magnitude < 3600
        ? `${Math.round(magnitude / 60)}m`
        : magnitude < 86400
          ? `${Math.round(magnitude / 3600)}h`
          : `${Math.round(magnitude / 86400)}d`
  return <time dateTime={at}>{seconds > 0 ? `in ${size}` : `${size} ago`}</time>
}
