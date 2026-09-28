import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { Schemas } from '@manifest/contract'
import type { Api } from '../api'
import { href, navigate } from '../router'
import { Field, Instant, Panel, Refusal, useAsync } from '../ui'

/** §22 step 2's first half: what this person already has. */
export function Projects({ api }: { api: Api }) {
  const projects = useAsync(() => api.listProjects(), [])
  return (
    <>
      <Panel title="My projects">
        <Refusal error={projects.error} />
        {projects.value?.length === 0 && <p>No projects yet. Create one below.</p>}
        <ul>
          {(projects.value ?? []).map((p) => (
            <li key={p.id}>
              {/* What people call it, then its permanent address (Task 6). */}
              <a {...href(`/projects/${p.id}`)}>{p.name}</a> <code>{p.slug}</code> —{' '}
              {p.blueprint}
              {p.starter !== null && ` · ${p.starter}`}
              {p.state === 'archived' && ' · switched off'}
            </li>
          ))}
        </ul>
      </Panel>
      <Describe api={api} />
      <CreateProject api={api} onCreated={(id) => navigate(`/projects/${id}`)} />
    </>
  )
}

/**
 * DESCRIBING A NEW APP BEFORE IT EXISTS (FE-1; Spec action 5): an INTAKE key — one model, a small
 * cap, 30 minutes, the PLATFORM's money — for an agent that talks a person through what they want
 * before any project exists. A person's session only (a token is refused: intake belongs to no
 * project). The key is shown once, exactly as a token's secret is, and ended here when done. The
 * faculty front-end is where this conversation really happens; the console proves the API.
 */
function Describe({ api }: { api: Api }) {
  const [started, setStarted] = useState<Schemas['IntakeSessionStarted'] | undefined>(
    undefined,
  )
  const [ended, setEnded] = useState(false)
  const [error, setError] = useState<unknown>(undefined)
  const [busy, setBusy] = useState(false)
  // ONE KEY PER START (D23.6): a retry is `409 INTAKE_SESSION_ALREADY_STARTED`, never the key again.
  const idempotency = useRef(api.newKey())

  async function start() {
    setBusy(true)
    setError(undefined)
    try {
      setStarted(await api.startIntakeSession(idempotency.current))
      setEnded(false)
      idempotency.current = api.newKey()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  async function end() {
    if (started === undefined) return
    setBusy(true)
    setError(undefined)
    try {
      await api.endIntakeSession(started.session.id, api.newKey())
      // THE KEY LEAVES THE PAGE WITH ITS SESSION: nothing holds it once it has ended.
      setStarted(undefined)
      setEnded(true)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="Describe a new app">
      <p className="hint">
        A model key for an agent to talk through what you want before the app exists —
        paid for by the platform, and shown <strong>once</strong>. Describing is paused
        for you after the day’s limit, and for everyone when the platform’s month is
        spent.
      </p>
      {started === undefined ? (
        <button type="button" disabled={busy} onClick={() => void start()}>
          Start describing
        </button>
      ) : (
        <>
          <pre className="secret">{started.key}</pre>
          <Field label="Address">
            <code>{started.baseUrl}</code>
          </Field>
          <Field label="Model">
            <code>{started.session.model}</code>, at most $
            {started.session.capUsd.toFixed(2)}; it stops working{' '}
            <Instant at={started.session.expiresAt} />
          </Field>
          <button type="button" disabled={busy} onClick={() => void end()}>
            I am done — end it
          </button>
        </>
      )}
      {ended && <p className="hint">Ended: the key no longer works.</p>}
      <Refusal error={error} />
    </Panel>
  )
}

/**
 * §22 step 2: a name, a blueprint and a starter, and who it is for (§24).
 *
 * THE NAME IS CHECKED WHILE IT IS TYPED — `GET /v1/slugs/{slug}` exists for exactly this
 * (§23, P5a Task 9), and it answers `available` plus the REASONS a name is refused, so the
 * console never restates the slug rule. It is debounced at 300 ms because that route carries
 * its own per-user rate limit (P5a Task 9) and a check per keystroke would spend it.
 */
function CreateProject({
  api,
  onCreated,
}: {
  api: Api
  onCreated: (id: string) => void
}) {
  const [slug, setSlug] = useState('')
  const [blueprint, setBlueprint] = useState('')
  const [starter, setStarter] = useState('')
  const [scale, setScale] = useState<Schemas['AudienceInput']['scale']>('class')
  const [burst, setBurst] = useState<Schemas['AudienceInput']['burst']>('steady')
  const [justification, setJustification] = useState('')
  const [check, setCheck] = useState<Schemas['SlugCheck'] | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(undefined)

  const blueprints = useAsync(() => api.listBlueprints(), [])
  const chosen = useMemo(
    () => blueprints.value?.find((b) => b.ref === blueprint),
    [blueprints.value, blueprint],
  )

  // ONE key per user action (D23.6): made on the first submit and reused on a retry, so a
  // double-click cannot create two projects. Cleared only once a create SUCCEEDS.
  const attemptKey = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (slug === '') {
      setCheck(undefined)
      return
    }
    const timer = setTimeout(() => {
      api.checkSlug(slug).then(setCheck, () => setCheck(undefined))
    }, 300)
    return () => clearTimeout(timer)
  }, [slug, api])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(undefined)
    attemptKey.current ??= api.newKey()
    try {
      const created = await api.createProject(
        {
          slug,
          blueprint,
          ...(starter === '' ? {} : { starter }),
          audience: {
            scale,
            burst,
            ...(justification === '' ? {} : { justification }),
          },
        },
        attemptKey.current,
      )
      attemptKey.current = undefined
      onCreated(created.id)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="Create a project">
      <form onSubmit={submit}>
        <Field label="Name">
          <input value={slug} onChange={(e) => setSlug(e.target.value)} required />
          {check?.available === true && (
            <span className="ok"> {check.slug} is available</span>
          )}
        </Field>
        {/*
          EVERY REASON, AS THE API GAVE IT — code, message and hint, rendered rather than
          summarised. `reasons` is an array of OBJECTS, not of strings (§23's `SlugReason`),
          so the obvious `.join('; ')` renders `[object Object]` and `tsc` cannot see it:
          `Array.prototype.join` accepts any array. Measured before this screen was written.
        */}
        {check?.available === false && (
          <ul className="reasons">
            {(check.reasons ?? []).map((r) => (
              <li key={r.code}>
                <code>{r.code}</code> {r.message} <span className="hint">{r.hint}</span>
              </li>
            ))}
          </ul>
        )}
        <Field label="Blueprint">
          <select
            value={blueprint}
            onChange={(e) => {
              setBlueprint(e.target.value)
              setStarter('')
            }}
            required
          >
            <option value="">choose…</option>
            {(blueprints.value ?? []).map((b) => (
              <option key={b.ref} value={b.ref}>
                {b.name} ({b.ref})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Starter">
          <select value={starter} onChange={(e) => setStarter(e.target.value)}>
            <option value="">just the skeleton</option>
            {(chosen?.starters ?? []).map((s) => (
              <option key={s.name} value={s.name}>
                {s.name} — {s.summary}
              </option>
            ))}
          </select>
        </Field>
        {/* §24, D29: asked of a HUMAN, and only ever at creation — no agent can state it. */}
        <Field label="Who is it for">
          <select
            value={scale}
            onChange={(e) => setScale(e.target.value as typeof scale)}
          >
            <option value="solo">just me</option>
            <option value="class">a class</option>
            <option value="large_course">a large course</option>
            <option value="public">the public</option>
          </select>{' '}
          <select
            value={burst}
            onChange={(e) => setBurst(e.target.value as typeof burst)}
          >
            <option value="steady">arriving over days</option>
            <option value="synchronised">all at once</option>
          </select>
        </Field>
        <Field label="Why">
          <input
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
          />
        </Field>
        <button disabled={busy || check?.available !== true}>Create</button>
      </form>
      <Refusal error={error} />
      <Refusal error={blueprints.error} />
    </Panel>
  )
}
