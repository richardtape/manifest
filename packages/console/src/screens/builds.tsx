import { useEffect, useRef, useState } from 'react'
import type { LogFrame, Schemas, StreamFrame } from '@manifest/contract'
import type { Api } from '../api'
import { Instant, Field, Panel, Pill, Refusal, useAsync } from '../ui'

/**
 * §22 step 4, and D23.9: `POST …/builds` answers **202** with the build `running`. So the
 * state this screen shows after the click is `running` and it MUST NOT be believed to be
 * final: the build's end arrives as a `build.succeeded` or `build.failed` EVENT, and its
 * log lines arrive as `log` frames in between (P5a Task 13, P4b Task 15).
 *
 * THE CONSOLE NEVER POLLS (D23.2). The only re-reads here are one `getBuild` and one
 * `getBuildLog` when a terminal event for THIS build arrives — the event carries the
 * outcome, the resource carries the digest and the scan, and the log read closes the gap
 * described below.
 */

/** One line, from either of the two sources, normalised. */
interface Line {
  seq: number
  stream: 'stdout' | 'stderr'
  text: string
  at: string
}

/**
 * LOG FRAMES ARE NEVER REPLAYED, so the stream alone is not the log. The document says it
 * on `LogFrame` — *"Never replayed — GET /v1/builds/{buildId}/logs has them all"* — and
 * `recentFramesFor` is the proof: the replay selects from the `events` table, which holds
 * no log line. A screen opened mid-build therefore sees only what was written after its
 * socket opened, and everything before it exists solely in `getBuildLog`.
 *
 * So the two sources are merged and de-duplicated BY `seq`, which is also why they are
 * sorted by `seq` rather than by arrival: the stored read and the live frames overlap by
 * however long the read took, and concatenating them would print that overlap twice.
 *
 * THE TWO SOURCES SPELL THE TIMESTAMP DIFFERENTLY — `BuildLog.lines[].at` and
 * `LogFrame.createdAt` — both checked in `openapi.json` rather than assumed, which is what
 * this normalisation exists for.
 */
export function mergeLines(
  stored: Schemas['BuildLog'] | undefined,
  live: LogFrame[],
): Line[] {
  const bySeq = new Map<number, Line>()
  for (const l of stored?.lines ?? []) bySeq.set(l.seq, l)
  for (const f of live)
    bySeq.set(f.seq, { seq: f.seq, stream: f.stream, text: f.text, at: f.createdAt })
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq)
}

/**
 * The live half: this build's log frames, and the event that ended it.
 *
 * THE EXPLICIT TYPE PREDICATE IS LOAD-BEARING. TypeScript 5.5+ infers one from
 * `.filter((f) => f.kind === 'log')`, but NOT from the compound condition below — the
 * `&& f.buildId === buildId` clause defeats the inference, and `.sort((a, b) => a.seq -
 * b.seq)` is then `TS2339: Property 'seq' does not exist on type …` (measured on 5.9.3,
 * P5c sitting 4's cold-agent audit). The `ended` `find` needs none: narrowing inside an
 * `&&` chain works, and its result is only tested for truthiness.
 */
export function liveBuild(frames: StreamFrame[], buildId: string) {
  const lines = frames
    .filter((f): f is LogFrame => f.kind === 'log' && f.buildId === buildId)
    .sort((a, b) => a.seq - b.seq)
  const ended = frames.find(
    (f) =>
      f.kind === 'event' &&
      (f.type === 'build.succeeded' || f.type === 'build.failed') &&
      f.subject === `build:${buildId}`,
  )
  return { lines, ended }
}

function tone(status: Schemas['Build']['status']): string {
  return status === 'succeeded' ? 'good' : status === 'failed' ? 'bad' : 'plain'
}

/**
 * `onReleased` EXISTS BECAUSE `createRelease` PUBLISHES NO EVENT. Every other thing this
 * screen does announces itself on the stream, so the panels stay in step without talking to
 * each other; a release does not (`releases/release.ts`'s `createRelease` has no
 * `publishEvent`, the second instance of the shape sitting 4 recorded for
 * `POST …/projects/{id}/spec`). The Deploy panel therefore cannot learn from the platform
 * that there is something new to deploy.
 *
 * What the console CAN do without a route change is tell the panel next door, because the
 * person who pressed the button is in this tab — which is exactly the distinction in that
 * finding: the presser is served, a SECOND person watching the same project is not, and no
 * other client is either. Recorded as a finding about the API, not worked around silently.
 */
export function Builds({
  api,
  projectId,
  frames,
  onReleased,
}: {
  api: Api
  projectId: string
  frames: StreamFrame[]
  onReleased: () => void
}) {
  const builds = useAsync(() => api.listBuilds(projectId), [projectId])
  const [started, setStarted] = useState<Schemas['Build'] | undefined>(undefined)
  const [error, setError] = useState<unknown>(undefined)
  const [busy, setBusy] = useState(false)

  // The build this screen is watching: the one just started, else the newest the project
  // has. `listBuilds` answers newest-first (P5a Task 13).
  const watched = started ?? builds.value?.[0]

  async function build() {
    setBusy(true)
    setError(undefined)
    try {
      // `{}` DOES NOT MEAN THE REPOSITORY'S HEAD, whatever the field's name suggests:
      // `routes/builds.ts` reads `body.commitSha ?? spec.commitSha`, so an empty body
      // builds the commit of the LAST VALIDATED MANIFEST. Measured — a commit pushed to
      // the repository and then built from here produced the OLD commit, and only
      // Re-validate moved it. The hint below says so rather than leaving a person to
      // discover it from a build of code they had already replaced.
      //
      // THE `202`'s `status` IS `running` AND IS NOT THE OUTCOME: <Build> below learns
      // how it ended from the stream, never from this value.
      setStarted(await api.startBuild(projectId, {}, api.newKey()))
      builds.reload()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="Builds">
      <Refusal error={builds.error} />
      <p>
        <button type="button" onClick={() => void build()} disabled={busy}>
          Build
        </button>{' '}
        <span className="hint">
          builds the commit of the manifest last validated — press <em>Re-validate</em>{' '}
          below first to pick up a newer one. A first build of this blueprint takes
          minutes.
        </span>
      </p>
      <Refusal error={error} />
      {watched !== undefined && (
        <Build
          api={api}
          build={watched}
          frames={frames}
          onReleased={() => {
            builds.reload()
            onReleased()
          }}
        />
      )}
      {(builds.value ?? []).length > 1 && (
        <Field label="Earlier">
          <ul>
            {(builds.value ?? []).slice(1).map((b) => (
              <li key={b.id}>
                <code>{b.id.slice(0, 8)}</code>{' '}
                <Pill tone={tone(b.status)}>{b.status}</Pill>{' '}
                <code>{b.commitSha.slice(0, 12)}</code> <Instant at={b.createdAt} />
              </li>
            ))}
          </ul>
        </Field>
      )}
    </Panel>
  )
}

function Build({
  api,
  build,
  frames,
  onReleased,
}: {
  api: Api
  build: Schemas['Build']
  frames: StreamFrame[]
  onReleased: () => void
}) {
  const { lines, ended } = liveBuild(frames, build.id)
  // The stored half. Re-read once when a terminal event arrives, so a log whose last lines
  // were written before this screen's socket opened is complete without polling for it.
  const log = useAsync(() => api.getBuildLog(build.id), [build.id, ended !== undefined])
  // The resource, for the digest and §12's scan — both null until the build succeeds.
  const resource = useAsync(() => api.getBuild(build.id), [build.id, ended !== undefined])

  const shown = resource.value ?? build
  const merged = mergeLines(log.value, lines)

  return (
    <>
      <Field label="Build">
        <code>{shown.id.slice(0, 8)}</code>{' '}
        <Pill tone={tone(shown.status)}>{shown.status}</Pill>{' '}
        <Instant at={shown.createdAt} />
      </Field>
      <Field label="Commit">
        <code>{shown.commitSha.slice(0, 12)}</code>
      </Field>
      {shown.imageDigest !== null && (
        <Field label="Image">
          <code>{shown.imageDigest}</code>
        </Field>
      )}
      {shown.error !== null && <p className="refusal">{shown.error}</p>}
      <Scan scan={shown.scan} />
      <LogView lines={merged} />
      <Release api={api} build={shown} onReleased={onReleased} />
      <Refusal error={log.error} />
      <Refusal error={resource.error} />
    </>
  )
}

/**
 * §12's gate classifies ONLY Critical and High, so those are the only counts here: a
 * `medium` beside them would be a zero nobody counted, which reads as *none found*.
 *
 * `databaseAgeDays` is `null` when the scanner could not say, and `assessScan` treats that
 * as STALE — so the null is rendered as what it means rather than as a blank, because a
 * fixable Critical only blocks a build on a fresh database.
 */
function Scan({ scan }: { scan: Schemas['ScanSummary'] | null }) {
  if (scan === null)
    return <Field label="Scan">not scanned — §12 scans a build once it succeeds</Field>
  return (
    <Field label="Scan">
      <ul>
        <li>
          {scan.scanner} <Instant at={scan.scannedAt} />{' '}
          <Pill tone={scan.stale ? 'bad' : 'good'}>{scan.stale ? 'stale' : 'fresh'}</Pill>{' '}
          {scan.databaseAgeDays === null
            ? 'the scanner could not say how old its database was'
            : // ROUNDED FOR READING, NOT FOR DECIDING. Grype reports a fraction — a real
              // build here read `3.041724398148148` — and fifteen digits of precision on a
              // screen is noise. `stale` beside it is the platform's judgement and is NOT
              // derived from this number by the console (§12: a fixable Critical blocks
              // only on a fresh database, and `assessScan` decides that, not this line).
              `database ${scan.databaseAgeDays.toFixed(1)} days old`}
        </li>
        <li>
          base image{' '}
          {scan.baseImageKnown
            ? 'identified'
            : 'NOT identified — its findings land below'}
        </li>
        <li>
          fixable, and what §12 blocks on: {scan.fixable.critical} critical,{' '}
          {scan.fixable.high} high
        </li>
        <li>
          no published fix: {scan.unfixable.critical} critical, {scan.unfixable.high} high
        </li>
        <li>
          the base image&rsquo;s own: {scan.baseImage.critical} critical,{' '}
          {scan.baseImage.high} high
        </li>
      </ul>
    </Field>
  )
}

/**
 * AUTO-SCROLLS ONLY WHILE IT IS ALREADY AT THE BOTTOM, so a person reading back through a
 * failure is not dragged away by the next line. "At the bottom" is within a few pixels,
 * because a fractional scroll height never compares equal.
 *
 * THE OBVIOUS VERSION OF THIS DISABLES ITSELF UNDER EXACTLY THE CONDITION IT EXISTS FOR,
 * and it did: measured in a browser mid-build, `scrollTop` sat at **109.5** where the
 * bottom was **921.5**, after 71 lines. A `scroll` event is dispatched ASYNCHRONOUSLY, so
 * between `scrollTop = scrollHeight` and the handler running, more lines are committed and
 * `scrollHeight` grows — the handler then reads a gap of **662.5px** and concludes the
 * person scrolled away, when the only thing that moved the box was this effect. Once false
 * it never recovers, because nothing scrolls it back. Measured directly in the page:
 * set to the bottom, append 40 lines, and what the handler would compute is 662.5, not 0.
 *
 * So OUR OWN scroll is recognised by the position we set rather than by the gap, which is
 * stable however much arrives in between — and it is recognised only while ARMED, so a
 * person scrolling back down to that same offset still re-enables the follow.
 */
function LogView({ lines }: { lines: Line[] }) {
  const ref = useRef<HTMLPreElement>(null)
  const atBottom = useRef(true)
  const ours = useRef(false)
  const lastSet = useRef(-1)

  useEffect(() => {
    const el = ref.current
    if (el === null || !atBottom.current) return
    el.scrollTop = el.scrollHeight
    // The CLAMPED value, which is what the event will carry.
    lastSet.current = el.scrollTop
    ours.current = true
  }, [lines.length])

  return (
    <pre
      className="log"
      ref={ref}
      onScroll={(e) => {
        const el = e.currentTarget
        if (ours.current && el.scrollTop === lastSet.current) {
          ours.current = false
          return
        }
        atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 4
      }}
    >
      {lines.length === 0
        ? 'No output yet.'
        : lines.map((l) => (
            <span key={l.seq} className={l.stream === 'stderr' ? 'stderr' : undefined}>
              {l.text}
              {'\n'}
            </span>
          ))}
    </pre>
  )
}

/**
 * §13: a release freezes the build's digest, its scan and the resolved configuration, and
 * it is what a deploy names. Refused unless the build SUCCEEDED, which is the platform's
 * rule and not this screen's — the button is offered and the refusal rendered, so the
 * console never teaches a rule the API does not enforce.
 *
 * **THE BUTTON STAYS ENABLED AND THE SCREEN EXPLAINS INSTEAD, and the difference from the
 * privileged capabilities in `screens/tokens.tsx` is deliberate.** A privileged capability
 * can NEVER be minted, so `disabled` there is an honest permanent statement; a `running`
 * build becomes releasable in seconds, so disabling on it would be a transient claim that
 * sticks if a frame is ever missed — which is exactly the failure sitting 5's F10 records
 * for a pill driven by an event rather than by the resource.
 *
 * **WHY THE WAIT NEEDED EXPLAINING AT ALL, measured 2026-09-19 on a real build Rich drove**:
 * BuildKit's last line (`#12 DONE 0.0s`) was written at 18:37:31.978 and `build.succeeded`
 * arrived at 18:37:43.268 — **11.29 seconds later** — because `scanImage` runs INSIDE
 * `driver.buildImage`, after BuildKit returns, and takes no `onLog`, so §12's Syft and Grype
 * containers emit nothing at all. For eleven seconds the log's last word is **DONE** while
 * the row is still `running` with `imageDigest: null`, and a big log ending in DONE is far
 * louder than a small `running` pill. Pressing Release in that window is the correct thing
 * for a person to do and is answered `409 RELEASE_BUILD_NOT_DEPLOYABLE`. **The API needs no
 * new route for this** — `GET /v1/builds/{buildId}` already answers `status` and
 * `imageDigest` — but the silent scan window is a finding about the platform, recorded in
 * P5c sitting 6's record rather than fixed here, because emitting scanner progress is a
 * change to `runtime/docker/` and this plan changes no route.
 */
function Release({
  api,
  build,
  onReleased,
}: {
  api: Api
  build: Schemas['Build']
  onReleased: () => void
}) {
  const [release, setRelease] = useState<Schemas['Release'] | undefined>(undefined)
  const [error, setError] = useState<unknown>(undefined)
  const [busy, setBusy] = useState(false)

  async function create() {
    setBusy(true)
    setError(undefined)
    try {
      setRelease(
        await api.createRelease(build.projectId, { buildId: build.id }, api.newKey()),
      )
      onReleased()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <p>
        <button type="button" onClick={() => void create()} disabled={busy}>
          Release this build
        </button>{' '}
        {/*
          READ FROM THE RESOURCE, never from the log. `build` here is `shown` — the
          re-read `getBuild` when one exists, the `202`'s body otherwise — so this says
          what the PLATFORM thinks, which is the only thing `createRelease` will agree
          with. A person who presses anyway gets the refusal, which is the control.
        */}
        {build.status !== 'succeeded' && (
          <span className="hint">
            this build is <code>{build.status}</code> and has no image yet, so a release
            will be refused.{' '}
            <strong>The log reaching DONE is not the end of the build</strong>:
            §12&rsquo;s vulnerability scan runs after it, silently, and takes about ten
            seconds more. This line goes when the build succeeds.
          </span>
        )}
      </p>
      {release !== undefined && (
        <>
          <Field label="Release">
            <code>{release.id.slice(0, 8)}</code> <Instant at={release.createdAt} />
          </Field>
          <Field label="Released image">
            <code>{release.imageDigest}</code>
          </Field>
        </>
      )}
      <Refusal error={error} />
    </>
  )
}
