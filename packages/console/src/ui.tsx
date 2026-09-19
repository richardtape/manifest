import { useCallback, useEffect, useState } from 'react'
import { ManifestApiError } from '@manifest/contract'

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
 * the code is what a person can quote and what every test in this project asserts; and it
 * renders the two typed extras the envelope can carry, so `RELEASE_PRODUCTION_GATE_UNAVAILABLE`
 * shows what a first launch still needs and `TOKEN_ACTION_PENDING` shows the question.
 *
 * `code`, `path` and `message` on a detail are all REQUIRED by `ManifestError` in the
 * document — checked there before this was written, because `tsc` cannot tell you until the
 * build and a wrong key renders `undefined` silently.
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
    </div>
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
 * "4 minutes ago", from an ISO instant. §26's headline number is an AGE, so the console
 * has one renderer for it rather than a `Date` subtraction per screen.
 */
export function Ago({ at }: { at: string }) {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(at)) / 1000))
  const text =
    seconds < 60
      ? `${seconds}s ago`
      : seconds < 3600
        ? `${Math.round(seconds / 60)}m ago`
        : `${Math.round(seconds / 3600)}h ago`
  return <time dateTime={at}>{text}</time>
}
