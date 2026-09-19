import { useState } from 'react'
import type { EventFrame, Schemas, StreamFrame } from '@manifest/contract'
import type { Api } from '../api'
import { Ago, Field, Panel, Pill, Refusal, useAsync } from '../ui'

/**
 * §22 step 5, and the handoff to step 6 — the person opens the running app and signs in
 * INSIDE it, which is the app's own UI and not the console's.
 *
 * THE THREE THINGS THIS SCREEN HAS TO GET RIGHT, and they are the task:
 *
 * **(a) A deploy answers once the instance serves or has failed** (D23.9's exception,
 * P4c R3), so the button is disabled for the length of the call and the call can take tens
 * of seconds. There is no timeout here on purpose: one would abandon a deploy that is still
 * happening, while the platform carried on with it.
 *
 * **(b) A deploy that never becomes ready is a `200` whose `state` is `failed`** (P4b
 * Task 13), with an Incident, and the previous instance keeps serving. So everything below
 * switches on `Instance.state` and NOTHING switches on the HTTP status. This is the single
 * most repeated defect shape in this project and the console is the newest place to make it.
 *
 * **(c) The states arrive as events, three or four of them**, and are rendered as a list as
 * they arrive rather than as a progress bar with a guessed number of steps.
 */

/** The four §11 states a deploy publishes, in the order `deployRelease` publishes them. */
const DEPLOY_STATES = [
  'instance.provisioning',
  'instance.starting',
  'instance.healthy',
  'instance.failed',
] as const

type DeployState = (typeof DEPLOY_STATES)[number]
type DeployFrame = Extract<EventFrame, { type: DeployState }>

/**
 * THE PREDICATE IS OVER THE FRAME, NOT OVER ITS `type` FIELD, and that is not a style
 * choice. A predicate written `(type: string): type is DeployState` narrows the ARGUMENT —
 * the string — and leaves the record it came from as the whole 21-member union, so
 * `f.machineDetail.environmentId` is then `TS2339: Property 'environmentId' does not exist
 * on type '{ entityId: string; … } | …17 more…'`. Measured here on TypeScript 5.9.3.
 *
 * It is the same family as `liveBuild`'s compound `.filter`, one level out: narrowing
 * follows the value you test, and testing a field tells the compiler nothing about the
 * object. So the predicate takes the frame and `Extract` names what it narrows to.
 */
function isDeployFrame(f: StreamFrame): f is DeployFrame {
  return f.kind === 'event' && (DEPLOY_STATES as readonly string[]).includes(f.type)
}

/**
 * EVERY EVENT THIS PANEL SHOWS IS SCOPED TO ONE ENVIRONMENT, and the three families carry
 * that scope in three different places — read out of the platform's own publishers rather
 * than guessed:
 *
 * - `instance.*` carry `machineDetail.environmentId`, the id;
 * - `incident.opened` carries `machineDetail.environment`, the KIND — there is no id on it;
 * - `sso.registered` carries neither, and is scoped by its `subject`, `sp:<slug>:<kind>`
 *   (`sso/registration.ts`). Without it the CWL app's deploy would render three states
 *   where four happened, which is §22's own ordering.
 */
function deployFrames(
  frames: StreamFrame[],
  env: Schemas['Environment'],
  slug: string | undefined,
): { id: string; at: string; label: string; message: string }[] {
  const out: { id: string; at: string; label: string; message: string }[] = []
  for (const f of frames) {
    if (isDeployFrame(f)) {
      if (f.machineDetail.environmentId !== env.id) continue
      out.push({ id: f.id, at: f.createdAt, label: f.type, message: f.humanMessage })
      continue
    }
    if (f.kind !== 'event') continue
    if (f.type === 'incident.opened') {
      if (f.machineDetail.environment !== env.kind) continue
      out.push({ id: f.id, at: f.createdAt, label: f.type, message: f.humanMessage })
    } else if (f.type === 'sso.registered') {
      if (slug === undefined || f.subject !== `sp:${slug}:${env.kind}`) continue
      out.push({ id: f.id, at: f.createdAt, label: f.type, message: f.humanMessage })
    }
  }
  return out
}

function stateTone(state: Schemas['Instance']['state']): string {
  return state === 'healthy' ? 'good' : state === 'failed' ? 'bad' : 'plain'
}

/**
 * WHAT IS SERVING AND WHAT THE LAST ATTEMPT DID ARE TWO DIFFERENT FACTS, and this screen
 * got it wrong in both directions before it was measured.
 *
 * **A failed deploy does not change what is serving.** A deploy that never becomes ready
 * is a `200` whose `state` is `failed` AND THE PREVIOUS INSTANCE KEEPS SERVING (P4b
 * Task 13). Measured here: with the health check pointed at a path the app 404s, the
 * screen's own event stream ended `instance.failed` → `incident.opened` while
 * `GET /v1/projects/{id}/environments` answered `healthy`, on the PREVIOUS release — two
 * different instance rows, both true. A pill driven from the newest event therefore says
 * the app is down when it is up, and one driven from the deploy call's answer says the
 * same to the one person who pressed the button.
 *
 * So the pill is the ENVIRONMENT's own instance, re-read when a frame says it changed —
 * which is D23.2's rule in its own words, *"a screen re-reads a resource only when a frame
 * says it changed"*, and the thing the first draft of this screen skipped. The attempt's
 * outcome is rendered beside it, from the stream, because a person who has just watched a
 * deploy fail must not be shown a green pill and nothing else.
 *
 * COUNTING THE FRAMES IS WHAT DRIVES THE RE-READ. It is not a poll: with no deploy
 * happening the count never changes and nothing is re-read.
 */
function instanceFrameCount(frames: StreamFrame[]): number {
  return frames.filter(isDeployFrame).length
}

/** The outcome of the most recent deploy ATTEMPT on this environment, or undefined. */
function lastAttempt(
  frames: StreamFrame[],
  env: Schemas['Environment'],
): Schemas['Instance']['state'] | undefined {
  let state: Schemas['Instance']['state'] | undefined
  for (const f of frames) {
    if (!isDeployFrame(f)) continue
    if (f.machineDetail.environmentId !== env.id) continue
    state = f.machineDetail.state
  }
  return state
}

export function Deploy({
  api,
  projectId,
  slug,
  frames,
  releaseTick,
}: {
  api: Api
  projectId: string
  slug: string | undefined
  frames: StreamFrame[]
  /**
   * Bumped by the Builds panel when a release is made. It is NOT a poll and NOT a timer:
   * `createRelease` publishes no event, so the stream cannot carry this one fact and the
   * sibling panel says it instead. See `Builds`' own note.
   */
  releaseTick: number
}) {
  // D23.2: RE-READ WHEN A FRAME SAYS IT CHANGED, and never on a timer. The count moves
  // only while a deploy is happening, so an idle screen makes no request at all.
  const instanceFrames = instanceFrameCount(frames)
  const environments = useAsync(
    () => api.listEnvironments(projectId),
    [projectId, instanceFrames],
  )
  const releases = useAsync(() => api.listReleases(projectId), [projectId, releaseTick])
  const [releaseId, setReleaseId] = useState('')

  // Newest first, so the release just made in the Builds panel is the default.
  const chosen = releaseId === '' ? (releases.value?.[0]?.id ?? '') : releaseId

  return (
    <Panel title="Deploy">
      <Refusal error={environments.error} />
      <Refusal error={releases.error} />
      {(releases.value ?? []).length === 0 ? (
        <p>
          No releases yet. Build the repository above and release the build, and the
          environments appear here with somewhere to deploy it.
        </p>
      ) : (
        <Field label="Release">
          <select value={chosen} onChange={(e) => setReleaseId(e.target.value)}>
            {(releases.value ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.id.slice(0, 8)} — {r.summary ?? r.imageDigest.slice(7, 19)}
              </option>
            ))}
          </select>
        </Field>
      )}
      {(environments.value ?? []).map((env) => (
        <EnvironmentPanel
          key={env.id}
          api={api}
          env={env}
          slug={slug}
          releaseId={chosen}
          frames={frames}
          onDeployed={environments.reload}
        />
      ))}
    </Panel>
  )
}

function EnvironmentPanel({
  api,
  env,
  slug,
  releaseId,
  frames,
  onDeployed,
}: {
  api: Api
  env: Schemas['Environment']
  slug: string | undefined
  releaseId: string
  frames: StreamFrame[]
  onDeployed: () => void
}) {
  const [instance, setInstance] = useState<Schemas['Instance'] | undefined>(undefined)
  const [error, setError] = useState<unknown>(undefined)
  const [deploying, setDeploying] = useState(false)
  const states = deployFrames(frames, env, slug)
  // §14's Incident is read when one is ANNOUNCED, not on a timer (D23.2). The frame is the
  // trigger; the resource carries the repair prompt.
  const incidentFrames = states.filter((s) => s.label === 'incident.opened').length
  const incidents = useAsync(() => api.listIncidents(env.id), [env.id, incidentFrames])

  // WHAT THE PERSON IS SHOWN IS A STATE, NEVER AN HTTP STATUS. `deploy` resolves `200` for
  // a failed deploy just as it does for a healthy one, so a `state` decides — and it is the
  // ENVIRONMENT's, re-read above when a frame says it moved, because a failed deploy leaves
  // the previous instance serving. `instance` is this tab's own answer and is only a
  // fallback for the moment before the re-read lands.
  const serving = env.instance?.state ?? instance?.state ?? null
  const attempt = lastAttempt(frames, env)

  async function go() {
    setDeploying(true)
    setError(undefined)
    try {
      setInstance(await api.deploy(env.id, { releaseId }, api.newKey()))
      onDeployed()
    } catch (e) {
      setError(e)
    } finally {
      setDeploying(false)
    }
  }

  return (
    <div className="env">
      <Field label={env.kind}>
        <code>{env.hostname}</code>{' '}
        {serving === null ? (
          <Pill tone="plain">never deployed</Pill>
        ) : (
          <Pill tone={stateTone(serving)}>{serving}</Pill>
        )}{' '}
        {/*
          THE ATTEMPT, BESIDE WHAT IS SERVING — and only when the two disagree, which is
          exactly the case a green pill alone would misreport: the deploy failed and the
          app is still up on the release before it.
        */}
        {attempt === 'failed' && serving === 'healthy' && (
          <span className="hint">
            the last deploy failed; the release before it is still serving
          </span>
        )}
      </Field>
      <Field label="Open">
        {/*
          THE URL THE API GAVE, never one re-derived from the hostname: a bare hostname in
          an `href` is a RELATIVE path and navigates inside the console. §23 owns the scheme
          and the zone, and the console restates neither.
        */}
        <a href={env.url} target="_blank" rel="noreferrer">
          {env.url}
        </a>
      </Field>
      <p>
        {/*
          PRODUCTION'S BUTTON STAYS. It is refused `409
          RELEASE_PRODUCTION_GATE_UNAVAILABLE`, whose envelope carries `launchReadiness` —
          hiding it would make the console teach something the platform does not do, and
          §13's gate is the control, not this button's absence.
        */}
        <button
          type="button"
          onClick={() => void go()}
          disabled={deploying || releaseId === ''}
        >
          {deploying ? 'deploying…' : `Deploy to ${env.kind}`}
        </button>{' '}
        {deploying && (
          <span className="hint">
            this answers only once the new instance serves, or has failed — it can take
            tens of seconds, and there is no timeout
          </span>
        )}
      </p>
      <Refusal error={error} />
      {states.length > 0 && (
        <ul className="activity">
          {states.map((s) => (
            <li key={s.id}>
              <Ago at={s.at} /> <code>{s.label}</code> {s.message}
            </li>
          ))}
        </ul>
      )}
      <Incidents incidents={incidents.value} error={incidents.error} />
    </div>
  )
}

/**
 * §14's Incident EXISTS TO MAKE A FAILURE DIAGNOSABLE, and a console that showed only
 * *failed* would waste it. So all four parts are rendered: why it exited, which check
 * failed, what changed since the last healthy release, and the log tail.
 */
function Incidents({
  incidents,
  error,
}: {
  incidents: Schemas['IncidentList'] | undefined
  error: unknown
}) {
  const rows = incidents?.incidents ?? []
  if (rows.length === 0) return <Refusal error={error} />
  return (
    <>
      <Refusal error={error} />
      {rows.map((i) => (
        <div key={i.id} className="incident">
          <Field label="Incident">
            <Ago at={i.createdAt} /> <code>{i.exitReason}</code>
          </Field>
          <Field label="Check that failed">{i.failedCheck}</Field>
          <Field label="Since last healthy">{i.diffSinceHealthy}</Field>
          <Field label="What to do">{i.prompt}</Field>
          <pre>{i.logTail}</pre>
        </div>
      ))}
    </>
  )
}
