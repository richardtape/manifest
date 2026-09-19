import { useState, type FormEvent } from 'react'
import type { Schemas, StreamFrame } from '@manifest/contract'
import type { Api } from '../api'
import { Instant, Field, Panel, Pill, Refusal, useAsync } from '../ui'

/**
 * §26'S QUEUE — *"The primary screen is the queue ... Not the fleet list."* — and the first
 * time D24's loop is operated by a person rather than by `curl`.
 *
 * An agent holding a delegated token asks for one of D24's privileged four; the platform
 * refuses it centrally and records the question; a person who holds that capability
 * themselves reads it here and confirms or rejects it in their own words.
 *
 * **FIVE THINGS THIS SCREEN HAS TO GET RIGHT, and each one is a property of the platform
 * rather than a rendering choice:**
 *
 * **(a) CONFIRMING DOES NOT REPLAY THE REQUEST.** It grants that exact request — this
 * token, this method, this concrete path, this key-sorted body hash — ONE retry, which the
 * AGENT makes itself (P5b Decision 6). So pressing Confirm changes nothing about the
 * project, and a person watching for the member to appear would conclude it had failed.
 * The screen says so, in words, beside the button.
 *
 * **(b) THE BODY IS NEVER CARRIED — only `bodySha256`** (P5b Task 8). A person reading a
 * question gets the summary the platform wrote and a hash of what was asked; the request
 * body is not stored anywhere, deliberately, because a person reads this row on a screen.
 * A console that dressed the hash up as "the change" would be inventing information.
 *
 * **(c) A PERSON MAY READ THIS QUEUE WITHOUT BEING ABLE TO ANSWER IT.** Reading is
 * `project:read`, so a collaborator watches; answering needs the capability the question is
 * ABOUT, so the same collaborator is `403 FORBIDDEN` at confirm and a stranger `404`. The
 * buttons are shown to everyone and the refusal is rendered — the console has nothing to
 * decide this from and guessing would be it inventing authority (the same reasoning as the
 * Revoke button in `screens/tokens.tsx`).
 *
 * **(d) `waitingSeconds` IS THE PLATFORM'S NUMBER AND IS NOT A SUBTRACTION DONE HERE.**
 * §26's headline health number is the age of the oldest item, *"because a queue that is
 * merely long is working and a queue that is stale is not"*, and the platform computes it
 * from `createdAt` to `resolvedAt ?? now` against one instant.
 *
 * **(e) A LAPSED QUESTION RENDERS AS LAPSED WITHOUT THE SWEEPER HAVING RUN** — see
 * `displayState`, which is Decision 8's whole justification.
 *
 * **WHAT THIS SCREEN DELIBERATELY DOES NOT DO: it does not render `<Refusal>`'s
 * `pendingAction`.** The plan and ORIENTATION §7e both say Task 11 is that renderer's first
 * caller. It is not, and the reason is structural: `TOKEN_ACTION_PENDING` and
 * `TOKEN_ACTION_REJECTED` are the only two envelopes that carry a `pendingAction`
 * (`api/errors.ts`), both are raised from `api/contract/route.ts`'s wrapper, and the
 * wrapper reaches them only through `TokenCapabilityRefusedError`, which `assertCapability`
 * throws **inside `if (actor.credential === 'token')`** and nowhere else. This console is
 * always a session (Decision 6 gives `createApi` no token option at all), so no refusal it
 * can ever receive carries the field. Rendering it would be a module with no call site —
 * the shape ORIENTATION §9 names four times, and the very thing `ui.tsx`'s comment says it
 * is waiting for a caller to avoid. The agent's own half of this loop is the `403` it reads
 * out of the envelope in its own client, which `packages/journey/src/token.ts` already does.
 */

/**
 * THE SWEEPER DOES NOT RUN ON A TIMER, AND THIS SCREEN DOES NOT NEED IT TO (Decision 8).
 *
 * `expirePendingActions` runs at boot and, scoped to one token, immediately before a new
 * question is recorded — so a control plane up for a week can hold a `pending` row whose
 * life ran out days ago. It is a DISPLAY staleness and never a refusal one: `answerable`
 * refuses a lapsed row `409 PENDING_ACTION_RESOLVED` on the TIMESTAMP
 * (`row.expiresAt <= new Date()`), not on the stored state.
 *
 * So the screen reads the timestamp too, and a lapsed question renders as expired with no
 * buttons. A timer would make the stored state honest for a screen that can be honest
 * without one — a third piece of background work in a control plane that has two, to
 * correct a display that corrects itself.
 *
 * `now` is a PARAMETER rather than a `Date.now()` inside, so one render compares every row
 * against one instant: a list whose rows each read their own clock can order two questions
 * by an interval nobody experienced.
 */
export function displayState(row: Schemas['PendingAction'], now: number): string {
  if (row.state === 'pending' && Date.parse(row.expiresAt) <= now) return 'expired'
  return row.state
}

/** The three event types that mean this queue changed. Named, never matched by prefix: a
 *  `startsWith('pending_action.')` would silently adopt a fourth type nobody had looked at,
 *  and this project has paid twice for a check that matches text rather than a value. */
const QUEUE_EVENTS: ReadonlySet<string> = new Set([
  'pending_action.created',
  'pending_action.confirmed',
  'pending_action.rejected',
])

export function Queue({
  api,
  projectId,
  frames,
}: {
  api: Api
  projectId: string
  frames: StreamFrame[]
}) {
  /*
    D23.2: RE-READ WHEN A FRAME SAYS IT CHANGED, NEVER ON A TIMER — and this screen consumes
    the project screen's ONE socket rather than opening a second.

    ALL THREE OF THESE REALLY PUBLISH, which is worth saying because three of this console's
    screens have found the opposite. `recordPendingAction` publishes `pending_action.created`
    and `resolveAction` publishes `.confirmed` or `.rejected` (`tokens/pending.ts`), so a
    question asked in a terminal, and an answer given in another tab or by another person,
    both reach this list live. That is NOT true of `validateSpec` (sitting 4 F5),
    `createRelease` (sitting 5 F7) or `revokeToken` (sitting 6 F3).

    The count is the dependency: a frame arriving bumps it, `useAsync` re-runs, and the list
    is the platform's answer rather than something patched together from event payloads.
  */
  const changes = frames.filter(
    (f) => f.kind === 'event' && QUEUE_EVENTS.has(f.type),
  ).length
  const queue = useAsync(() => api.listPendingActions(projectId), [projectId, changes])
  /*
    NAMES, NOT AUTHORITY. `PendingAction` carries `tokenId` and no name — so the only way to
    say WHO asked in words a person recognises is the project's own token list, which this
    person can already read. It is an ornament: if it is refused the queue is still the
    queue, so its failure is one grey line below the list and NOT a <Refusal> box above
    §26's primary content, where a cosmetic gap would read as the queue itself being broken.
  */
  const tokens = useAsync(() => api.listTokens(projectId), [projectId])
  const names = new Map((tokens.value ?? []).map((t) => [t.id, t.name]))
  const [error, setError] = useState<unknown>(undefined)

  const rows = queue.value ?? []
  const now = Date.now()
  const waiting = rows.filter((row) => displayState(row, now) === 'pending')
  // §26's HEADLINE NUMBER: the age of the OLDEST item still waiting. The list is newest
  // first, so the oldest is the last one — and an expired question is waiting for nobody,
  // which is why this counts `displayState` rather than `row.state`.
  const oldest = waiting[waiting.length - 1]

  return (
    <Panel title="Queue">
      <p className="hint">
        D24: an agent holding a delegated token asked to do one of the four things a token
        may never do on its own. Confirming{' '}
        <strong>
          grants that one request a single retry, which the agent then makes itself
        </strong>{' '}
        — it does not run anything here, and nothing about this project changes when you
        press it.
      </p>
      <Refusal error={queue.error} />
      <Refusal error={error} />
      <Field label="Oldest waiting">
        {oldest === undefined ? (
          <span className="ok">nothing is waiting</span>
        ) : (
          <>
            <strong>{oldest.waitingSeconds}s</strong>{' '}
            <span className="hint">
              — §26&rsquo;s health number, computed by the platform, as of this read
            </span>
          </>
        )}
      </Field>
      {rows.length === 0 && queue.error === undefined && (
        <p>No agent has asked this project for anything.</p>
      )}
      <ul className="queue">
        {rows.map((row) => (
          <Question
            key={row.id}
            api={api}
            row={row}
            now={now}
            tokenName={names.get(row.tokenId)}
            onAnswered={() => {
              // The `pending_action.confirmed` / `.rejected` frame re-reads this list for
              // every watcher, including us. This reload is for the case where the socket
              // is not live — a screen that only learned of its own actions through a
              // stream would show nothing at all if the stream were closed.
              queue.reload()
            }}
            onError={setError}
          />
        ))}
      </ul>
      {tokens.error !== undefined && (
        <p className="hint">
          The project&rsquo;s tokens could not be read, so each question names the agent
          that asked it by id alone.
        </p>
      )}
    </Panel>
  )
}

function Question({
  api,
  row,
  now,
  tokenName,
  onAnswered,
  onError,
}: {
  api: Api
  row: Schemas['PendingAction']
  now: number
  tokenName: string | undefined
  onAnswered: () => void
  onError: (error: unknown) => void
}) {
  const shown = displayState(row, now)
  /*
    ONE KEY PER ROW PER ACTION, MADE AT MOUNT AND REUSED (D23.6). The key identifies the
    ACTION, so a person who presses Confirm again after a failure is retrying that action
    and must send the same key — a key made per CALL would be a new action each time, which
    is the whole defect the header exists to prevent. Confirm and reject get separate keys
    because they are separate actions, and `useState`'s initialiser runs once per mount, so
    a reload of the list (same React key, `row.id`) keeps them.
  */
  const [confirmKey] = useState(() => api.newKey())
  const [rejectKey] = useState(() => api.newKey())
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  async function answer(run: () => Promise<Schemas['PendingAction']>) {
    setBusy(true)
    onError(undefined)
    try {
      await run()
      setRejecting(false)
      onAnswered()
    } catch (e) {
      onError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <li>
      <Field label={row.summary}>
        <Pill tone={shown === 'pending' ? 'bad' : 'plain'}>{shown}</Pill>{' '}
        <code>{row.action}</code>
      </Field>
      <div className="hint">
        <code>
          {row.method} {row.path}
        </code>
      </div>
      <div className="hint">
        asked by <code>{row.tokenId.slice(0, 8)}</code>
        {tokenName !== undefined && <> ({tokenName})</>} · asked{' '}
        <Instant at={row.createdAt} /> ·{' '}
        {/*
          TWO DIFFERENT QUESTIONS, AND ONLY ONE OF THEM IS A CLOCK. `<Instant>` is live and
          says WHEN it was asked; `waitingSeconds` is the platform's own figure and, once a
          row is resolved, is the whole answer to *how long did the person take* — which no
          reading of `createdAt` can recover. While a row is pending the two measure the
          same interval and this one is as stale as the last read, and it is labelled so.
        */}
        {row.resolvedAt === null ? (
          <>waited {row.waitingSeconds}s at this read</>
        ) : (
          <>answered after {row.waitingSeconds}s</>
        )}
        {shown === 'pending' && (
          <>
            {' '}
            · expires <Instant at={row.expiresAt} />
          </>
        )}
      </div>
      {/*
        THE HASH, AND NEVER THE BODY. `bodySha256` is a key-sorted SHA-256 of the request
        the agent made; the body itself is stored nowhere (P5b Task 8), so this is what
        lets an agent's retry be shown to be the same request and it is all there is.
      */}
      <div className="hint">
        request <code>{row.bodySha256.slice(0, 16)}…</code>
      </div>
      {row.state === 'rejected' && row.reason !== null && (
        <div className="hint">
          refused: <q>{row.reason}</q> — the agent was told this verbatim
        </div>
      )}
      {row.state === 'confirmed' && (
        <div className="hint">
          {/*
            THE ONE FACT NO FRAME CAN CARRY. `consumeAction` publishes no event and neither
            does the route the agent retries, so whether the grant has been SPENT arrives
            only by asking — which is what the button does, once, when a person asks it to
            (D23.2 forbids the timer that would otherwise do it).
          */}
          {row.consumedAt === null ? (
            <>granted — waiting for the agent to make its one retry</>
          ) : (
            <>
              granted, and the agent spent its one retry <Instant at={row.consumedAt} />
            </>
          )}{' '}
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void answer(async () => {
                const fresh = await api.getPendingAction(row.id)
                onAnswered()
                return fresh
              })
            }
          >
            Check
          </button>
        </div>
      )}
      {shown === 'pending' && (
        <p>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void answer(() => api.confirmPendingAction(row.id, confirmKey))
            }
          >
            Confirm
          </button>{' '}
          <button type="button" disabled={busy} onClick={() => setRejecting((r) => !r)}>
            Reject
          </button>
        </p>
      )}
      {shown === 'pending' && rejecting && (
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault()
            void answer(() => api.rejectPendingAction(row.id, { reason }, rejectKey))
          }}
        >
          <Field label="Why not">
            {/* REQUIRED, 1–500 (`RejectPendingActionRequest`). The agent is told this
                sentence verbatim, so it is the whole of what it and the next reader get. */}
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="in your own words — the agent is told this"
              required
              minLength={1}
              maxLength={500}
            />{' '}
            <button disabled={busy || reason.trim() === ''}>Reject it</button>
          </Field>
        </form>
      )}
    </li>
  )
}
