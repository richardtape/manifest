// WS /v1/projects/:projectId/events, for a shell script — `curl` cannot speak WebSocket.
//
//   node scripts/lib/event-stream.mjs watch  <api> <projectId> <cookie-jar> <frames.ndjson>
//   node scripts/lib/event-stream.mjs expect <frames.ndjson> <projectId> <buildId> <build-log.json> <type>…
//
// `watch` subscribes as whoever the cookie jar's Manifest session belongs to and appends
// every frame, one JSON document per line, until it is sent SIGTERM. `expect` reads that
// file back and fails, naming what it saw, unless the live half of the stream carries
// the given event types IN THAT ORDER and exactly the build's stored log lines.
//
// NO DEPENDENCY. Node 24's global WebSocket is undici's, and it sends a `cookie` header
// passed in `{ headers }` — measured 2026-09-15 on Node 24.12.0 against a local server
// that printed the upgrade request (P4b sitting 10). `ws` is a devDependency of the
// control plane and does not resolve from here, and C1 forbids a new prerequisite. What
// undici does NOT give is the refused upgrade's HTTP status: a stranger's 404 arrives as
// an `error` event and close code 1006. The unit tier proves the refusals, with `ws`.
import { appendFileSync, readFileSync } from 'node:fs'

const SESSION_COOKIE = 'manifest_session'
const READY = 'manifest.stream.ready'

const [mode, ...args] = process.argv.slice(2)

function die(message) {
  console.error(message)
  process.exit(1)
}

/** The Manifest session out of a curl cookie jar (Netscape format, tab-separated). */
function sessionFrom(jarPath) {
  for (const line of readFileSync(jarPath, 'utf8').split('\n')) {
    const fields = line.split('\t')
    if (fields.length === 7 && fields[5] === SESSION_COOKIE) return fields[6]
  }
  return die(`no ${SESSION_COOKIE} cookie in ${jarPath} — log in to Manifest first`)
}

function watch([api, projectId, jarPath, outPath]) {
  if (!outPath)
    die('usage: event-stream.mjs watch <api> <projectId> <cookie-jar> <frames.ndjson>')
  const url = `${api.replace(/^http/, 'ws')}/v1/projects/${projectId}/events`
  const socket = new WebSocket(url, {
    // Origin as a browser on the console sends it (P5a Task 4): an upgrade carrying a
    // session from any other origin is refused 403 before it opens — which reaches this
    // watcher as an `error` and close 1006, never as a status.
    headers: {
      cookie: `${SESSION_COOKIE}=${sessionFrom(jarPath)}`,
      origin: new URL(api).origin,
    },
  })
  let stopping = false
  // Appended per frame, synchronously, so SIGTERM loses nothing already received.
  socket.onmessage = (message) => appendFileSync(outPath, `${message.data}\n`)
  // Recorded IN the frame file, so `expect` can say "the stream closed with 1013" rather
  // than "an event is missing" — the first is a cause, the second is a symptom.
  socket.onerror = () => {
    if (!stopping)
      appendFileSync(outPath, `${JSON.stringify({ kind: 'watcher', type: 'error' })}\n`)
  }
  socket.onclose = (event) => {
    if (!stopping) {
      appendFileSync(
        outPath,
        `${JSON.stringify({ kind: 'watcher', type: 'closed', code: event.code })}\n`,
      )
    }
    process.exit(stopping ? 0 : 1)
  }
  process.on('SIGTERM', () => {
    stopping = true
    socket.close(1000)
    setTimeout(() => process.exit(0), 500).unref()
  })
}

function expectFrames([framesPath, projectId, buildId, buildLogPath, ...types]) {
  if (types.length === 0) {
    die(
      'usage: event-stream.mjs expect <frames.ndjson> <projectId> <buildId> <build-log.json> <type>…',
    )
  }
  const raw = readFileSync(framesPath, 'utf8')
  const frames = raw
    .split('\n')
    .filter((line) => line !== '')
    .map((line, n) => {
      try {
        return JSON.parse(line)
      } catch {
        return die(`frame ${n + 1} is not JSON: ${line.slice(0, 200)}`)
      }
    })

  const watcher = frames.find((frame) => frame.kind === 'watcher')
  if (watcher) {
    die(
      `the subscriber's socket ${watcher.type === 'closed' ? `closed with ${watcher.code}` : 'failed'} ` +
        'before the demo stopped it. 1006 before any frame is a refused upgrade (no session, ' +
        'or not a member); 1013 is a subscriber that fell a megabyte behind; 1011 is the ' +
        'control plane failing to read the replay.',
    )
  }
  const ready = frames.findIndex(
    (frame) => frame.kind === 'control' && frame.type === READY,
  )
  if (ready === -1)
    die(
      `no ${READY} frame in ${frames.length} frames — the stream never finished its replay`,
    )

  const strangers = frames.filter((frame) => frame.projectId !== projectId)
  if (strangers.length > 0) {
    die(
      `${strangers.length} frames belong to another project, first: ${JSON.stringify(strangers[0])}`,
    )
  }
  // §14: key material never reaches an event. A LiteLLM key starts `sk-`.
  if (/\bsk-[A-Za-z0-9_-]{8,}/.test(raw))
    die('a frame carries something shaped like a LiteLLM key (sk-…)')

  // ONLY THE LIVE HALF. The replay before `ready` is earlier runs' events, and a type
  // found there proves nothing about this deploy.
  const live = frames.slice(ready + 1)
  const events = live.filter((frame) => frame.kind === 'event')
  const seen = events.map((frame) => frame.type)
  let at = 0
  for (const type of seen) if (type === types[at]) at += 1
  if (at < types.length) {
    die(
      `the stream did not carry ${types.join(' → ')} in order.\n` +
        `  missing from '${types[at]}' on; the live events were: ${seen.join(', ') || '(none)'}`,
    )
  }
  const healthy = events.find((frame) => frame.type === 'instance.healthy')
  if (healthy && healthy.machineDetail?.state !== 'healthy') {
    die(
      `instance.healthy carries state '${healthy.machineDetail?.state}': ${JSON.stringify(healthy)}`,
    )
  }

  // THE STREAMED LINES ARE THE STORED LINES — every one, in order, and each between its
  // build's two events. A subscriber that connected late, or a writer that published
  // something other than what it stored, fails here rather than passing on a count.
  const stored = JSON.parse(readFileSync(buildLogPath, 'utf8')).lines.map(
    (line) => line.text,
  )
  const streamed = live.filter(
    (frame) => frame.kind === 'log' && frame.buildId === buildId,
  )
  if (stored.length === 0)
    die(`build ${buildId} has no stored log lines to compare against`)
  if (
    streamed.length !== stored.length ||
    streamed.some((frame, i) => frame.text !== stored[i])
  ) {
    const first = streamed.findIndex((frame, i) => frame.text !== stored[i])
    die(
      `the stream carried ${streamed.length} log lines for build ${buildId} and the build log ` +
        `stores ${stored.length}` +
        (first === -1
          ? ''
          : `; the first difference is line ${first + 1}: ` +
            `${JSON.stringify(streamed[first]?.text)} against ${JSON.stringify(stored[first])}`),
    )
  }
  const started = live.findIndex((f) => f.kind === 'event' && f.type === 'build.started')
  const finished = live.findIndex(
    (f) => f.kind === 'event' && f.type === 'build.succeeded',
  )
  const firstLog = live.indexOf(streamed[0])
  const lastLog = live.indexOf(streamed[streamed.length - 1])
  if (!(started < firstLog && lastLog < finished)) {
    die(
      'a build log line was streamed outside its build.started … build.succeeded window',
    )
  }

  console.log(`  ${events.length} live events — ${seen.join(' → ')}`)
  console.log(
    `  ${streamed.length} log lines streamed, identical to the ${stored.length} the build stored`,
  )
}

if (mode === 'watch') watch(args)
else if (mode === 'expect') expectFrames(args)
else die('usage: event-stream.mjs watch|expect …')
