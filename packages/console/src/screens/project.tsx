import { useState, type FormEvent } from 'react'
import type { Schemas } from '@manifest/contract'
import type { Api } from '../api'
import { href, type Route } from '../router'
import { useProjectStream } from '../stream'
import { Instant, Field, Panel, Pill, Refusal, useAsync } from '../ui'
import { Builds } from './builds'
import { Deploy } from './deploy'
import { Launch } from './launch'
import { Queue } from './queue'
import { Records } from './records'
import { Tokens } from './tokens'

/**
 * §22 step 3: watch provisioning — the repository created, the `manifest.yaml` validated.
 *
 * THE CONSOLE NEVER POLLS (D23.2). Everything that changes arrives on the ONE socket this
 * screen opens, and every later screen on a project consumes the same hook rather than
 * opening a second one.
 */
export function Project({
  api,
  projectId,
  tab,
  isAdmin,
}: {
  api: Api
  projectId: string
  tab: Extract<Route, { name: 'project' }>['tab']
  /**
   * THE PERSON'S PLATFORM ROLE, FOR AFFORDANCES ONLY — which actions a screen OFFERS. It
   * authorizes nothing: the platform refuses a non-administrator `403` whatever this says,
   * and the console could be replaced by `curl` without weakening anything (`app.tsx`).
   */
  isAdmin: boolean
}) {
  const project = useAsync(() => api.getProject(projectId), [projectId])
  // ONE SOCKET FOR THE WHOLE SCREEN (D23.2), AND IT SPANS THE TABS. The hook lives here
  // rather than in a tab, so moving between Overview and Tokens does not tear the socket
  // down and re-open it — the replay would run again and every panel would flicker.
  const stream = useProjectStream(projectId)
  // THE ONE FACT THE STREAM CANNOT CARRY. `createRelease` publishes no event, so the Deploy
  // panel would not know a release exists until the page was reloaded; the Builds panel
  // bumps this instead. Everything else these panels share, they share through the socket.
  const [releaseTick, setReleaseTick] = useState(0)
  return (
    <>
      <Tabs projectId={projectId} tab={tab} />
      {tab === 'tokens' ? (
        <Tokens api={api} projectId={projectId} frames={stream.frames} />
      ) : tab === 'records' ? (
        <Records api={api} projectId={projectId} isAdmin={isAdmin} />
      ) : tab === 'queue' ? (
        <Queue api={api} projectId={projectId} frames={stream.frames} />
      ) : (
        <>
          <Overview project={project.value} error={project.error} />
          <Activity stream={stream} />
          <Builds
            api={api}
            projectId={projectId}
            frames={stream.frames}
            onReleased={() => setReleaseTick((t) => t + 1)}
          />
          <Deploy
            api={api}
            projectId={projectId}
            slug={project.value?.slug}
            frames={stream.frames}
            releaseTick={releaseTick}
          />
          {/*
        §22 STEP 7, DIRECTLY BELOW THE DEPLOY PANEL whose production button is the asking.
        The refusal that button gets carries this same checklist, through the same renderer.
      */}
          <Launch
            api={api}
            projectId={projectId}
            isAdmin={isAdmin}
            frames={stream.frames}
            launchedAt={project.value?.launchedAt}
          />
          <SpecPanel api={api} projectId={projectId} />
          <Members api={api} projectId={projectId} />
        </>
      )}
    </>
  )
}

/**
 * §26 puts the queue on a project; D24 puts its tokens there too. Real links (Decision 3),
 * so a tab is a bookmarkable path rather than a piece of component state — which is what
 * makes `?returnTo=` land a person back on the tab they were sent to.
 */
function Tabs({
  projectId,
  tab,
}: {
  projectId: string
  tab: Extract<Route, { name: 'project' }>['tab']
}) {
  return (
    <nav className="tabs">
      <a {...href(`/projects/${projectId}`)} aria-current={tab === 'overview'}>
        Overview
      </a>{' '}
      {/*
        §9's two external records, READABLE BY EVERYONE WHO MAY READ THE PROJECT — an owner
        told by the checklist that the registration is 'submitted' will want the ticket.
        Only the forms on it are an administrator's.
      */}
      <a {...href(`/projects/${projectId}/records`)} aria-current={tab === 'records'}>
        Launch records
      </a>{' '}
      <a {...href(`/projects/${projectId}/queue`)} aria-current={tab === 'queue'}>
        Queue
      </a>{' '}
      <a {...href(`/projects/${projectId}/tokens`)} aria-current={tab === 'tokens'}>
        Tokens
      </a>
    </nav>
  )
}

function Overview({
  project,
  error,
}: {
  project: Schemas['Project'] | undefined
  error: unknown
}) {
  return (
    <Panel title="Project">
      <Refusal error={error} />
      {project !== undefined && (
        <>
          <Field label="Name">
            <code>{project.slug}</code>
          </Field>
          <Field label="Blueprint">{project.blueprint}</Field>
          <Field label="Starter">{project.starter ?? 'the skeleton alone'}</Field>
          <Field label="Owner">{project.owner.displayName}</Field>
          <Field label="Created">
            <Instant at={project.createdAt} />
          </Field>
          {/* §24, and it is NULL for a project created before the question existed. */}
          <Field label="Who it is for">
            {project.audience === null
              ? 'not stated'
              : `${project.audience.scale}, ${project.audience.burst}`}
          </Field>
          {/*
            §23's three hostnames, from `?expand=environments` (D23.1). `instance` is null
            before any deploy, which is the truthful reading of a project this new — Task 8
            is what puts a state and a URL worth clicking here.
          */}
          <Field label="Environments">
            <ul>
              {(project.environments ?? []).map((e) => (
                <li key={e.id}>
                  <code>{e.hostname}</code> <Pill tone="plain">{e.kind}</Pill>{' '}
                  {e.instance === null ? (
                    'never deployed'
                  ) : (
                    <Pill tone={e.instance.state === 'healthy' ? 'good' : 'plain'}>
                      {e.instance.state}
                    </Pill>
                  )}
                </li>
              ))}
            </ul>
          </Field>
        </>
      )}
    </Panel>
  )
}

/**
 * §14 WROTE `humanMessage` FOR A PERSON, and this panel renders that and nothing else —
 * never a parsed `machineDetail`. A `zod/v4` union's refusal names no path, so a console
 * that parsed a frame and failed would learn nothing it could show anybody; switching on
 * `kind` is all the parsing this needs.
 *
 * The three events every project has before anything else happens to it — `project.created`,
 * `repository.seeded`, `spec.validated` (P5a Task 11) — arrive in the REPLAY, which is what
 * §22 step 3 asks this screen to show. They are already here when `status` is `live`.
 */
function Activity({ stream }: { stream: ReturnType<typeof useProjectStream> }) {
  const events = stream.frames.filter((f) => f.kind === 'event')
  return (
    <Panel title="Activity">
      <p>
        <Pill tone={stream.status === 'live' ? 'good' : 'plain'}>{stream.status}</Pill>{' '}
        {/*
          A REFUSED UPGRADE IS CLOSE 1006 AND NO STATUS — a WebSocket client is never shown
          one — so the code is the whole of the diagnosis and the screen says so rather than
          spinning for ever on "connecting".
        */}
        {stream.status === 'closed' && (
          <span className="hint">
            closed {stream.closeCode}
            {stream.closeCode === 1006 && ' — refused, or the connection dropped'}
            {stream.closeCode === 1013 && ' — this client fell behind; reconnecting once'}
          </span>
        )}
      </p>
      {events.length === 0 && stream.status === 'live' && (
        <p>Nothing has happened to this project yet.</p>
      )}
      <ul className="activity">
        {[...events].reverse().map((e) => (
          <li key={e.id}>
            <Instant at={e.createdAt} /> <code>{e.type}</code> {e.humanMessage}
          </li>
        ))}
      </ul>
    </Panel>
  )
}

/**
 * §7's manifest as the platform parsed it, and the Re-validate button that re-reads it at
 * the repository's HEAD. A real affordance — it is how a person sees whether a
 * `manifest.yaml` they have just edited is valid — and `validateSpec`'s caller.
 */
function SpecPanel({ api, projectId }: { api: Api; projectId: string }) {
  const spec = useAsync(() => api.getSpec(projectId), [projectId])
  const [validation, setValidation] = useState<Schemas['SpecValidation'] | undefined>(
    undefined,
  )
  const [error, setError] = useState<unknown>(undefined)
  const [busy, setBusy] = useState(false)

  async function revalidate() {
    setBusy(true)
    setError(undefined)
    try {
      setValidation(await api.validateSpec(projectId, api.newKey()))
      spec.reload()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="Manifest">
      <Refusal error={spec.error} />
      {spec.value !== undefined && (
        <>
          <Field label="Commit">
            <code>{spec.value.commitSha.slice(0, 12)}</code>
          </Field>
          <pre>{JSON.stringify(spec.value.spec, null, 2)}</pre>
        </>
      )}
      <button type="button" onClick={revalidate} disabled={busy}>
        Re-validate
      </button>
      {validation !== undefined && (
        <>
          <Field label="Valid">
            <Pill tone={validation.valid ? 'good' : 'bad'}>
              {validation.valid ? 'yes' : 'no'}
            </Pill>
          </Field>
          {validation.errors.length > 0 && (
            <ul className="reasons">
              {validation.errors.map((e, i) => (
                <li key={i}>
                  <code>{e.code}</code> <code>{e.path}</code> {e.message}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <Refusal error={error} />
    </Panel>
  )
}

/**
 * §13's membership. `addMember` answers `400 MEMBER_USER_NOT_FOUND` for anybody who has
 * never signed in — `<Refusal>` shows that code and its hint, which is the honest
 * behaviour and what makes Task 11's queue demonstrable at all.
 *
 * `removeMember` is D24's fourth privileged action, so an AGENT asking for it is refused
 * centrally and a person confirms it (P5b Task 8). A person holding `members:manage` — as
 * an owner does — is not.
 */
function Members({ api, projectId }: { api: Api; projectId: string }) {
  const members = useAsync(() => api.listMembers(projectId), [projectId])
  const [puid, setPuid] = useState('')
  const [role, setRole] = useState<Schemas['AddMemberRequest']['role']>('collaborator')
  const [error, setError] = useState<unknown>(undefined)
  const [busy, setBusy] = useState(false)

  async function add(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      await api.addMember(projectId, { puid, role }, api.newKey())
      setPuid('')
      members.reload()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  async function remove(userId: string) {
    setError(undefined)
    try {
      await api.removeMember(projectId, userId, api.newKey())
      members.reload()
    } catch (e) {
      setError(e)
    }
  }

  return (
    <Panel title="Members">
      <Refusal error={members.error} />
      <ul>
        {(members.value ?? []).map((m) => (
          <li key={m.userId}>
            {m.displayName} <code>{m.puid}</code> <Pill tone="plain">{m.role}</Pill>{' '}
            <button type="button" onClick={() => void remove(m.userId)}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={add}>
        <Field label="Add by CWL PUID">
          <input value={puid} onChange={(e) => setPuid(e.target.value)} required />{' '}
          <select value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
            <option value="collaborator">collaborator</option>
            <option value="owner">owner</option>
          </select>{' '}
          <button disabled={busy}>Add</button>
        </Field>
      </form>
      <Refusal error={error} />
    </Panel>
  )
}
