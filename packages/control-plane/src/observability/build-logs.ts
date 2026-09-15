import { asc, desc, eq } from 'drizzle-orm'
import { buildLogs, type Db } from '../db/index.js'
import { EventError } from './events.js'
import type { Redactor } from './redact.js'

/**
 * One line a build reported. The driver's `LogLine`, restated structurally so that
 * `observability/` does not depend on `runtime/` — a `LogLine` is assignable to it.
 */
export interface BuildLogLine {
  at: Date
  stream: 'stdout' | 'stderr'
  text: string
}

/** A stored line: its position in the build's log, which the table is keyed on. */
export interface StoredBuildLogLine extends BuildLogLine {
  seq: number
}

/**
 * Postgres allows 65,535 bind parameters in one statement and a line is five. A
 * writer that falls behind a fast build hands over everything it has queued, so
 * the insert is chunked rather than trusting a batch to stay small.
 */
const ROWS_PER_INSERT = 1_000

/**
 * §14's build log, written. **Redacted at capture**: the redactor is a parameter,
 * exactly as it is for `recordEvent`, so no path can store a line unredacted —
 * `builds.logs_ref` names this store, and a faculty member is shown what it holds.
 *
 * Callers number the lines. `createBuildLogWriter` is the one that does, and it is
 * what a build should use; this is its insert.
 */
export async function appendBuildLog(
  db: Db,
  buildId: string,
  lines: readonly StoredBuildLogLine[],
  redact: Redactor,
): Promise<void> {
  for (let start = 0; start < lines.length; start += ROWS_PER_INSERT) {
    await db.insert(buildLogs).values(
      lines.slice(start, start + ROWS_PER_INSERT).map((line) => ({
        buildId,
        seq: line.seq,
        at: line.at,
        stream: line.stream,
        text: String(redact(line.text)),
      })),
    )
  }
}

/**
 * A build's log in reading order — all of it, or the last `tail` lines.
 *
 * The tail is read newest-first so the primary key's btree serves it backwards
 * (measured: `Index Scan Backward using build_logs_build_id_seq_pk`), and then
 * reversed, because a stack trace read bottom-up is not a stack trace.
 */
export async function readBuildLog(
  db: Db,
  buildId: string,
  opts: { tail?: number } = {},
): Promise<StoredBuildLogLine[]> {
  const columns = {
    seq: buildLogs.seq,
    at: buildLogs.at,
    stream: buildLogs.stream,
    text: buildLogs.text,
  }
  if (opts.tail === undefined) {
    return db
      .select(columns)
      .from(buildLogs)
      .where(eq(buildLogs.buildId, buildId))
      .orderBy(asc(buildLogs.seq))
  }
  if (!Number.isInteger(opts.tail) || opts.tail < 1) {
    // Postgres answers a negative LIMIT with an error and LIMIT 0 with nothing,
    // and "no lines" must only ever mean the build wrote none.
    throw new EventError(
      'BUILD_LOG_TAIL_INVALID',
      `a build log tail is a whole number of lines of at least 1, not ${opts.tail}`,
    )
  }
  const newestFirst = await db
    .select(columns)
    .from(buildLogs)
    .where(eq(buildLogs.buildId, buildId))
    .orderBy(desc(buildLogs.seq))
    .limit(opts.tail)
  return newestFirst.reverse()
}

export interface BuildLogWriter {
  /**
   * Numbers the line and queues it. SYNCHRONOUS, so it can be a driver's `onLog`
   * directly, and it never throws: a failed insert is held for `flush`.
   */
  write(line: BuildLogLine): void
  /**
   * Resolves once every line written so far is stored, and rejects with the first
   * insert that failed. Await it before recording a build's status — and always
   * call it, because it is the only place a failed write is reported.
   */
  flush(): Promise<void>
}

/**
 * The one writer a build's log goes through.
 *
 * **It owns the sequence number and a single queue**, because `onLog` is
 * synchronous and BuildKit is fast: one insert per line fired concurrently races on
 * `PRIMARY KEY (build_id, seq)`, and an append-only table cannot repair a collision
 * afterwards (pre-flight 108). Lines queued while an insert is in flight go out
 * together in the next one, so a chatty build costs a few statements, not one per
 * line.
 *
 * **A failed insert stops the writer.** Later lines are dropped rather than stored
 * around a hole, and `flush` rejects — a log that silently has a gap in it reads
 * as a complete log, which is worse than one that says it could not be written.
 */
export function createBuildLogWriter(
  db: Db,
  buildId: string,
  redact: Redactor,
  /**
   * Handed each line AS IT IS WRITTEN — numbered and already REDACTED — before it is
   * stored (P4b Task 15). That is how a build's log reaches D23.2's stream while the
   * build runs. It must not throw; the bus's `publish` never does.
   *
   * A line written after the writer has failed is neither stored nor handed over.
   */
  onLine?: (line: StoredBuildLogLine) => void,
): BuildLogWriter {
  let nextSeq = 0
  let pending: StoredBuildLogLine[] = []
  let draining: Promise<void> | undefined
  let failure: { error: unknown } | undefined

  const drain = async (): Promise<void> => {
    try {
      while (pending.length > 0) {
        const batch = pending
        pending = []
        await appendBuildLog(db, buildId, batch, redact)
      }
    } catch (error) {
      // HELD, not swallowed: `flush` rethrows it, and `flush` is the writer's
      // contract with every caller.
      failure = { error }
      pending = []
    } finally {
      draining = undefined
    }
  }

  return {
    write(line) {
      if (failure !== undefined) return
      // Redacted HERE, so the line handed to `onLine` is the line that will be stored.
      // `appendBuildLog` redacts again at the insert — it is the store's own guarantee,
      // and redaction is idempotent — so a caller of the insert alone is still covered.
      const stored: StoredBuildLogLine = {
        seq: nextSeq,
        at: line.at,
        stream: line.stream,
        text: String(redact(line.text)),
      }
      nextSeq += 1
      pending.push(stored)
      onLine?.(stored)
      draining ??= drain()
    },
    async flush() {
      while (draining !== undefined) await draining
      if (failure !== undefined) throw failure.error
    },
  }
}
