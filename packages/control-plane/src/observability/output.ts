import type { LineRedactor } from './redact.js'

/**
 * Why an instance's output was not read (the front-end enablement plan's Task 3) — a wire
 * family like `SourceError`, each code with its own status in `api/error-codes.ts`:
 * `INSTANCE_OUTPUT_PRODUCTION` and `INSTANCE_OUTPUT_STAGING` (403) — production's and staging's
 * output is never readable, because both serve real people (§14 as Spec action 6 left it; FE-24's
 * code, sitting 10), decided from the environment row before the driver is asked;
 * `INSTANCE_OUTPUT_UNAVAILABLE` (409) — the instance no longer runs, so its Incident is the place
 * to look; and `INCIDENT_LOG_CONFIDENTIAL` (403) — an Incident's log tail is an app's output too, and a
 * `confidential` project's staging and production ones are refused a delegated token while its building
 * agent may use the capable model (§7 as Spec action 10 amended it; the front-end enablement plan's Task
 * 14a).
 */
export class OutputError extends Error {
  constructor(
    readonly code:
      | 'INSTANCE_OUTPUT_PRODUCTION'
      | 'INSTANCE_OUTPUT_STAGING'
      | 'INSTANCE_OUTPUT_UNAVAILABLE'
      | 'INCIDENT_LOG_CONFIDENTIAL',
    message: string,
  ) {
    super(message)
    this.name = 'OutputError'
  }
}

/**
 * A line as a source answers it. Restated structurally, as `IncidentSource` is, so that
 * `observability/` never imports `runtime/` (`module-boundaries.test.ts`) and a `Driver` is
 * assignable. Only `text` is required: a source that knows nothing else — an Incident's test
 * double — is read as one unstamped stdout record per line, whole.
 */
export interface OutputSourceLine {
  text: string
  at?: Date
  stamped?: boolean
  stream?: 'stdout' | 'stderr'
  /** Bytes the source already dropped from the end of the line. */
  cutBytes?: number
  /** The runtime's log records that began inside the line; 1 when absent. */
  entries?: number
}

export interface OutputSource {
  logs(
    id: string,
    opts: { tail?: number; lineBytes?: number; timestamps?: boolean },
  ): AsyncIterable<OutputSourceLine>
}

export interface OutputBounds {
  /** How many of the last lines to answer. */
  lines: number
  /** The most UTF-8 bytes the answer's lines hold together; the oldest go first. */
  maxBytes: number
  /** The most UTF-8 bytes one line is shown with, after it is redacted. */
  lineBytes: number
}

/** Decision 2: 200 lines, 256 KiB in all, each line cut at 4 KiB. */
export const OUTPUT_DEFAULTS = {
  lines: 200,
  maxBytes: 262_144,
  lineBytes: 4096,
} as const satisfies OutputBounds
/** The most lines a client may ask for (Decision 2). */
export const OUTPUT_MAX_LINES = 1000
/**
 * The LEAST room past `lineBytes` the source is asked to keep, so a secret that STRADDLES the
 * cut is redacted whole before the line is cut — or the set's longest secret, when that is
 * longer (an app secret may be 16 KiB). Room decides only how much of a long line is shown:
 * a secret the RUNTIME's cut splits is dropped by `trimCut` however long it is.
 */
export const OUTPUT_REDACTION_MARGIN = 4096

export interface OutputLine {
  /** The runtime's time for the line — or, when `stamped` is false, when it was read. */
  at: Date
  stamped: boolean
  stream: 'stdout' | 'stderr'
  /** Redacted, and cut to `lineBytes` with `…[cut: N bytes]` when it was longer. */
  text: string
}

export interface RecentOutput {
  lines: OutputLine[]
  /** Which bound was met: more lines than asked for, or more bytes than `maxBytes`. */
  truncated: { lines: boolean; bytes: boolean }
  /** The code or name of the error that stopped the read early, or null. Never its message. */
  failure: string | null
}

/**
 * What stopped a read, in words that can go on the wire: an error's CODE (`ECONNRESET`) or its
 * class name — never its message, which can carry a path, an id or text the app printed. The
 * Incident's rule since P4b, and the one rule for both readers (sitting 2 found the reader
 * answering `Error` where the Incident had said `ECONNRESET`).
 */
export function failureName(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code: unknown }).code
    if (typeof code === 'string') return code
  }
  return error instanceof Error ? error.name : 'unknown error'
}

/** `text` cut to at most `max` UTF-8 bytes, never inside a character. */
function cutUtf8(text: string, max: number): { text: string; cutBytes: number } {
  const bytes = Buffer.from(text, 'utf8')
  if (bytes.length <= max) return { text, cutBytes: 0 }
  let end = max
  // 0b10xxxxxx continues a character that began before `end`.
  while (end > 0 && (bytes[end]! & 0xc0) === 0x80) end -= 1
  return { text: bytes.subarray(0, end).toString('utf8'), cutBytes: bytes.length - end }
}

/**
 * THE reader of a running instance's recent output (§14; the front-end enablement plan's
 * Decisions 1–3) — the route's, and the Incident's `log_tail`'s, so *"redacted at read with the
 * rules that redact `Incident.log_tail`"* is one code path.
 *
 * - **The redactor is a parameter**, as it is for `recordEvent` and the build log, so no caller
 *   can have an unredacted line. **The lines are redacted JOINED** (`LineRedactor.lines`), as an
 *   Incident's tail always was, so a key printed line by line is matched whole; **before** any
 *   line is cut to `lineBytes`, so a secret across the cut is redacted whole; and a line the
 *   RUNTIME cut is first trimmed of any ending that begins a secret (`trimCut`) — the whole-branch
 *   review's C1 and I2.
 * - **The last `lines` lines, oldest first.** It asks for one record more than it answers: a
 *   runtime's `tail` counts its own records and a long line is several (M1), so when as many
 *   records came back as were asked for, the log may be longer and the oldest line may be a
 *   fragment of one — it is dropped, and `truncated.lines` says so. `lines` is therefore at most.
 *   **The ONLY line is never dropped** (the review's I4): it is kept, marked with a leading `…`.
 * - **The newest lines that fit in `maxBytes`**, dropping from the OLDEST end.
 * - **A source that fails part-way** answers the lines before it, and the error's name.
 */
export async function readRecentOutput(
  source: OutputSource,
  handle: string,
  bounds: OutputBounds,
  redact: LineRedactor,
): Promise<RecentOutput> {
  const tail = bounds.lines + 1
  // Room past `lineBytes` for the longest secret to be redacted WHOLE before the line is cut.
  const room = Math.max(OUTPUT_REDACTION_MARGIN, redact.longestSecretBytes)
  // The lines as the source answered them — at most `lines` of them, each at most
  // `lineBytes + room`: a WINDOW, as the Incident's always was, so a source that ignores `tail`
  // cannot make this hold a whole log.
  const window: OutputSourceLine[] = []
  let records = 0
  let sawMore = false
  let failure: string | null = null
  try {
    for await (const line of source.logs(handle, {
      tail,
      lineBytes: bounds.lineBytes + room,
      timestamps: true,
    })) {
      records += line.entries ?? 1
      window.push(line)
      if (window.length > bounds.lines) {
        window.shift()
        sawMore = true
      }
    }
  } catch (error) {
    failure = failureName(error)
  }
  // M1: every record asked for came back, so the log may be longer and the oldest line may be a
  // fragment of one — dropped, UNLESS it is the only line (the review's I4): one long line can
  // fill every record, and answering nothing would say the app printed nothing.
  let fragment = false
  if (!sawMore && records >= tail && window.length > 0) {
    sawMore = true
    if (window.length > 1) window.shift()
    else fragment = true
  }
  // A line the RUNTIME cut may end in the first characters of a secret: trimmed first. Then the
  // lines are redacted JOINED, so a secret spanning lines is matched whole; then each is cut.
  const trimmed = window.map((line) => {
    if ((line.cutBytes ?? 0) === 0) return { text: line.text, dropped: 0 }
    const text = redact.trimCut(line.text)
    return {
      text,
      dropped: Buffer.byteLength(line.text, 'utf8') - Buffer.byteLength(text, 'utf8'),
    }
  })
  const redacted = redact.lines(trimmed.map((line) => line.text))
  const lines: OutputLine[] = window.map((line, index) => {
    const cut = cutUtf8(redacted[index]!, bounds.lineBytes)
    const cutBytes = (line.cutBytes ?? 0) + trimmed[index]!.dropped + cut.cutBytes
    const text = cutBytes > 0 ? `${cut.text}…[cut: ${cutBytes} bytes]` : cut.text
    return {
      at: line.at ?? new Date(),
      stamped: line.stamped ?? false,
      stream: line.stream ?? 'stdout',
      text: fragment && index === 0 ? `…${text}` : text,
    }
  })
  let bytes = lines.reduce((n, l) => n + Buffer.byteLength(l.text, 'utf8'), 0)
  let droppedForBytes = false
  while (bytes > bounds.maxBytes && lines.length > 0) {
    bytes -= Buffer.byteLength(lines.shift()!.text, 'utf8')
    droppedForBytes = true
  }
  return { lines, truncated: { lines: sawMore, bytes: droppedForBytes }, failure }
}
