import { useEffect, useState, type FormEvent } from 'react'
import { ManifestApiError, type Schemas } from '@manifest/contract'
import type { Api } from '../api'
import { setAdminReason } from '../admin-reason'
import { href, navigate, type Route } from '../router'
import { useProjectStream } from '../stream'
import { deleteRefusalAdvice, RESTORE_SENTENCE } from '../ending-state'
import { Instant, Field, Panel, Pill, Refusal, useAsync, Warnings } from '../ui'
import { Builds } from './builds'
import { Code } from './code'
import { Deploy } from './deploy'
import { Launch } from './launch'
import { Queue } from './queue'
import { Records } from './records'
import { Secrets } from './secrets'
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
  meId,
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
  /** The signed-in person's id: whether they are a member of this project (§26's reason). */
  meId: string
}) {
  // ONE SOCKET FOR THE WHOLE SCREEN (D23.2), AND IT SPANS THE TABS. The hook lives here
  // rather than in a tab, so moving between Overview and Tokens does not tear the socket
  // down and re-open it — the replay would run again and every panel would flicker.
  const stream = useProjectStream(projectId)
  // RE-READ WHEN A FRAME SAYS THE PROJECT CHANGED (D23.2): a rename, a switch-off or a restore
  // made by another person or tab reaches this screen without a reload.
  const changed = stream.frames.filter(
    (f) =>
      f.kind === 'event' &&
      (f.type === 'project.renamed' ||
        f.type === 'project.archived' ||
        f.type === 'project.restored'),
  ).length
  const project = useAsync(() => api.getProject(projectId), [projectId, changed])
  // THE ONE FACT THE STREAM CANNOT CARRY. `createRelease` publishes no event, so the Deploy
  // panel would not know a release exists until the page was reloaded; the Builds panel
  // bumps this instead. Everything else these panels share, they share through the socket.
  const [releaseTick, setReleaseTick] = useState(0)
  return (
    <>
      {isAdmin && <AdminReason api={api} projectId={projectId} meId={meId} />}
      <Tabs projectId={projectId} tab={tab} />
      {tab === 'code' ? (
        <Code api={api} projectId={projectId} frames={stream.frames} />
      ) : tab === 'secrets' ? (
        <Secrets api={api} projectId={projectId} />
      ) : tab === 'tokens' ? (
        <Tokens api={api} projectId={projectId} frames={stream.frames} />
      ) : tab === 'records' ? (
        <Records api={api} projectId={projectId} isAdmin={isAdmin} />
      ) : tab === 'queue' ? (
        <Queue api={api} projectId={projectId} frames={stream.frames} />
      ) : (
        <>
          <Overview
            api={api}
            project={project.value}
            error={project.error}
            onChanged={project.reload}
          />
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
          <Ending api={api} project={project.value} onChanged={project.reload} />
        </>
      )}
    </>
  )
}

/**
 * §26'S REASON (the faculty-ready plan's Task 10): a platform administrator who is not a member of
 * this project gives one with every change they make to it, and the project's people read it beside
 * their name on the stream. Shown only to an administrator who is not a member — for affordance; the
 * platform decides, and refuses `400 ADMIN_REASON_REQUIRED` without one. What is typed here is sent
 * on every change made from this screen (`api.ts`), and forgotten when the screen closes.
 */
function AdminReason({
  api,
  projectId,
  meId,
}: {
  api: Api
  projectId: string
  meId: string
}) {
  const members = useAsync(() => api.listMembers(projectId), [projectId])
  const [reason, setReason] = useState('')
  useEffect(() => {
    setAdminReason(null)
    setReason('')
    return () => setAdminReason(null)
  }, [projectId])
  if (members.value === undefined || members.value.some((m) => m.userId === meId))
    return null
  return (
    <Panel title="You are not a member of this project">
      <p>
        As a platform administrator you can change it. Say why first: your reason is sent
        with every change you make here, and the project’s people read it beside your
        name.
      </p>
      <label>
        Reason{' '}
        <input
          value={reason}
          maxLength={500}
          placeholder="Student reported a broken page"
          onChange={(e) => {
            setReason(e.target.value)
            setAdminReason(e.target.value)
          }}
        />
      </label>
    </Panel>
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
        THE PROJECT'S SOURCE AND ITS APP SECRETS (the authoring API plan's Task 10) — what an
        app is MADE of, beside what it is launched with, so they come first.
      */}
      <a {...href(`/projects/${projectId}/code`)} aria-current={tab === 'code'}>
        Code
      </a>{' '}
      <a {...href(`/projects/${projectId}/secrets`)} aria-current={tab === 'secrets'}>
        Secrets
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
  api,
  project,
  error,
  onChanged,
}: {
  api: Api
  project: Schemas['Project'] | undefined
  error: unknown
  onChanged: () => void
}) {
  return (
    <Panel title="Project">
      <Refusal error={error} />
      {project !== undefined && (
        <>
          {/*
            WHAT PEOPLE CALL IT, AND ITS PERMANENT ADDRESS (the front-end enablement plan's Task
            6): the name changes, the slug never does (§23, D26) — so they are two fields, and
            only the name has a Rename.
          */}
          <Field label="Name">
            {project.name} <Rename api={api} project={project} onRenamed={onChanged} />
          </Field>
          <Field label="Slug">
            <code>{project.slug}</code>
          </Field>
          {project.state === 'archived' && (
            <Field label="State">
              <Pill tone="bad">switched off</Pill>{' '}
              {project.archivedAt !== null && <Instant at={project.archivedAt} />} — it
              can be read and restored, and nothing else (§11)
            </Field>
          )}
          <Field label="Blueprint">{project.blueprint}</Field>
          <Field label="Starter">{project.starter ?? 'the skeleton alone'}</Field>
          <Field label="Owner">{project.owner.displayName}</Field>
          <Field label="Created">
            <Instant at={project.createdAt} />
          </Field>
          {/*
            WHERE THE CODE LIVES (the D5 plan's Task 12): GitHub's address, or "a repository on
            this machine" for driver 1 — never a laptop path, which the API does not carry.
          */}
          <Field label="Code">
            {project.repository.provider === 'github' ? (
              <>
                {project.repository.webUrl === null ? (
                  <code>{project.repository.fullName}</code>
                ) : (
                  <a href={project.repository.webUrl}>
                    <code>{project.repository.fullName}</code>
                  </a>
                )}{' '}
                on GitHub —{' '}
                {/*
                  WHAT MANIFEST LAST READ there (the authoring API plan's Task 12) — never an
                  assumed "private": a repository last read public is not built until it is not.
                */}
                {project.repository.visibility === 'private' ? (
                  'private'
                ) : project.repository.visibility === 'public' ? (
                  <Pill tone="bad">PUBLIC — not built until it is private</Pill>
                ) : (
                  'visibility not yet read'
                )}
                ,{' '}
                {project.repository.mainProtected ? (
                  <>
                    <code>main</code> protected
                  </>
                ) : (
                  <Pill tone="bad">main NOT protected</Pill>
                )}
              </>
            ) : (
              'a repository on this machine'
            )}
          </Field>
          {/*
            A `main` the host would not protect is SAID, in the refusal's style — never hidden
            (Decision 13): a person can rewrite or delete it there, and the host's own words say
            why. Manifest's mirror still keeps every commit a release names.
          */}
          {!project.repository.mainProtected && (
            <div className="refusal">
              <p>
                <code>main</code> is not protected where the code lives: a person can
                force-push or delete it there. Manifest keeps every commit a release names
                either way.
              </p>
              {project.repository.protectionDetail !== null && (
                <p className="hint">{project.repository.protectionDetail}</p>
              )}
            </div>
          )}
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
 * `updateProject` — the API's first PATCH (the front-end enablement plan's Task 6). A name is 1 to
 * 80 characters on one line; the platform's own words refuse anything else (`400
 * REQUEST_INVALID`), so this form holds no rule of its own beyond the length the input allows.
 */
function Rename({
  api,
  project,
  onRenamed,
}: {
  api: Api
  project: Schemas['Project']
  onRenamed: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(project.name)
  const [error, setError] = useState<unknown>(undefined)
  const [busy, setBusy] = useState(false)
  // ONE KEY PER RENAME (D23.6): made when the form opens, reused if Save is pressed again.
  const [idempotency, setIdempotency] = useState(() => api.newKey())

  async function save(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      await api.updateProject(project.id, { name }, idempotency)
      setEditing(false)
      setIdempotency(api.newKey())
      onRenamed()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  if (!editing)
    return (
      <button
        type="button"
        onClick={() => {
          setName(project.name)
          setEditing(true)
        }}
      >
        Rename
      </button>
    )
  return (
    <form onSubmit={save}>
      <input
        value={name}
        maxLength={80}
        onChange={(e) => setName(e.target.value)}
        required
      />{' '}
      <button disabled={busy}>Save</button>{' '}
      <button type="button" onClick={() => setEditing(false)}>
        Cancel
      </button>
      <Refusal error={error} />
    </form>
  )
}

/**
 * §11'S ENDING AN APP (the front-end enablement plan's Tasks 11–12): SWITCH IT OFF, BRING IT BACK,
 * or DELETE it — each consequence stated BEFORE the click, because two of the three cannot be
 * taken back by the person who clicks. All three are a person's alone; archive and delete need a
 * fresh sign-in, which `<Refusal>` offers from `STEP_UP_REQUIRED`'s hint and which returns here.
 *
 * DELETE IS OFFERED ONLY WHILE THE APP HAS NEVER LAUNCHED (Decision 31) — and its refusal is still
 * shown by its code, because a launch can complete while a delete starts: the platform then leaves
 * the project SWITCHED OFF and says so, and restore is the way back. A deleted project answers
 * `404` to every route, so this screen LEAVES rather than reading it back (`DeletedProject`).
 */
function Ending({
  api,
  project,
  onChanged,
}: {
  api: Api
  project: Schemas['Project'] | undefined
  onChanged: () => void
}) {
  const [error, setError] = useState<unknown>(undefined)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState('')
  // ONE KEY PER ACTION (D23.6), kept across a step-up's round trip only within this page — a
  // retry after `PROJECT_TEARDOWN_INCOMPLETE` is the SAME request, which the platform finishes.
  const [keys, setKeys] = useState(() => ({
    archive: api.newKey(),
    restore: api.newKey(),
    delete: api.newKey(),
  }))
  if (project === undefined) return null

  async function act(which: 'archive' | 'restore' | 'delete') {
    if (project === undefined) return
    setBusy(true)
    setError(undefined)
    try {
      if (which === 'delete') {
        await api.deleteProject(project.id, keys.delete)
        navigate('/')
        return
      }
      if (which === 'archive') await api.archiveProject(project.id, keys.archive)
      else await api.restoreProject(project.id, keys.restore)
      setKeys((k) => ({ ...k, [which]: api.newKey() }))
      onChanged()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  const archived = project.state === 'archived'
  return (
    <Panel title="Ending this app">
      {archived ? (
        <>
          <p>{RESTORE_SENTENCE}</p>
          <button type="button" disabled={busy} onClick={() => void act('restore')}>
            Restore
          </button>
        </>
      ) : (
        <>
          <p>
            <strong>Switch it off</strong> (archive) stops it for everyone: every address
            it has answers a page saying so, every running instance stops, and its agents’
            keys end. Its code, data and secrets are kept, and it can be restored. You
            will be asked to sign in again first.
          </p>
          <button type="button" disabled={busy} onClick={() => void act('archive')}>
            Switch it off
          </button>
        </>
      )}
      {project.launchedAt === null ? (
        <>
          <p>
            <strong>Delete</strong> destroys its repository, every data volume, every
            secret and its model budgets, and frees <code>{project.slug}</code> for
            another project. It cannot be undone. Only an app that has never launched can
            be deleted. You will be asked to sign in again first.
          </p>
          <label>
            Type <code>{project.slug}</code> to delete it:{' '}
            <input
              value={confirmDelete}
              onChange={(e) => setConfirmDelete(e.target.value)}
            />
          </label>{' '}
          <button
            type="button"
            disabled={busy || confirmDelete !== project.slug}
            onClick={() => void act('delete')}
          >
            Delete
          </button>
        </>
      ) : (
        <p className="hint">
          It has been to production, so it cannot be deleted: its data is disposed of
          under its retention period and UBC’s sunset procedure. Switch it off instead.
        </p>
      )}
      <Refusal error={error} />
      {/*
        A DELETE THAT STOPPED PART WAY IS FINISHED, NEVER RESTORED (the whole-branch review's I1): the
        project is left archived with something destroyed, so the panel says so beside the refusal.
      */}
      {error instanceof ManifestApiError &&
        deleteRefusalAdvice(error.code) !== undefined && (
          <p className="hint">{deleteRefusalAdvice(error.code)}</p>
        )}
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
          <Warnings warnings={validation.warnings} />
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
  const [who, setWho] = useState('')
  // EXACTLY ONE of the three keys (the front-end enablement plan's Task 7). The platform's rule
  // is a refinement the generated types cannot state (`[S5]` (5)), so the form holds it: one box,
  // and a choice of what it holds — never two keys sent at once.
  const [by, setBy] = useState<'cwlLogin' | 'email' | 'puid'>('cwlLogin')
  const [role, setRole] = useState<Schemas['AddMemberRequest']['role']>('collaborator')
  const [error, setError] = useState<unknown>(undefined)
  const [busy, setBusy] = useState(false)

  async function add(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      await api.addMember(projectId, { [by]: who.trim(), role }, api.newKey())
      setWho('')
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
            {m.displayName} {m.cwlLogin !== null && <code>{m.cwlLogin}</code>}{' '}
            <code>{m.puid}</code> <Pill tone="plain">{m.role}</Pill>{' '}
            <button type="button" onClick={() => void remove(m.userId)}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={add}>
        <Field label="Add a person by">
          <select value={by} onChange={(e) => setBy(e.target.value as typeof by)}>
            <option value="cwlLogin">CWL login name</option>
            <option value="email">email</option>
            <option value="puid">PUID</option>
          </select>{' '}
          <input value={who} onChange={(e) => setWho(e.target.value)} required />{' '}
          <select value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
            <option value="collaborator">collaborator</option>
            <option value="owner">owner</option>
          </select>{' '}
          <button disabled={busy}>Add</button>
        </Field>
      </form>
      <p className="hint">
        They must have signed in to Manifest once. A CWL login name is known only for
        someone who has signed in since Manifest began asking CWL for it — if one is not
        found, use their email or PUID.
      </p>
      <Refusal error={error} />
    </Panel>
  )
}
