/**
 * FE-33 (the launch path plan's Task 5): **A STREAM WHOSE CREDENTIAL IS GONE IS CLOSED, AT THE MOMENT
 * IT GOES.** Every request authenticates afresh, but `WS /v1/projects/:projectId/events` authenticates
 * once, at its upgrade — and Task 1 measured a revoked token's socket still open 30 s later, still
 * hearing `project.renamed`. So every open stream is registered here, with what it was opened with,
 * and whatever ends that credential closes it:
 *
 * - **`4401`** — the credential was revoked (`revokeToken`; the archive, which revokes every token of
 *   the project) or expired (a token's `expires_at`, a session's cookie expiry — armed here, per
 *   stream).
 * - **`4404`** — the project was deleted (`deleteProject`, after its tombstone), or the person is no
 *   longer on it (`closePerson`, the launch path plan's Task 8).
 *
 * ONE PER PROCESS, built at boot beside the bus and handed round the same way: the route that holds
 * the sockets and the paths that end credentials meet on the same instance. In-process for the bus's
 * reason — one control-plane process serves the platform.
 */

/** Revoked or expired: the credential is gone. Reconnecting with it is refused (`401` at the upgrade). */
export const CLOSE_CREDENTIAL_GONE = 4401
/** The project is not there for this stream any more — deleted, or no longer this person's. */
export const CLOSE_NOT_FOUND = 4404

export type StreamCloseCode = typeof CLOSE_CREDENTIAL_GONE | typeof CLOSE_NOT_FOUND

/** What an open stream was opened with — all the registry needs to know which credential ends it. */
export interface StreamEntry {
  projectId: string
  /** The delegated token it was opened with; `null` for a person's session. */
  tokenId: string | null
  /** The person — the session's, or the one who minted the token. */
  userId: string
  /** When the credential stops being one: the token's `expires_at`, or the session's own expiry. */
  expiresAt: Date
}

export interface StreamRegistry {
  /**
   * Registers an open stream and arms its expiry. `close` is how the registry ends it — the route's
   * own stop, which unsubscribes before it closes. Answers its unregister, which the socket's own
   * close calls; calling it twice, or after the registry closed the stream, is harmless.
   */
  register(
    entry: StreamEntry,
    close: (code: StreamCloseCode, reason: string) => void,
  ): () => void
  /** Every stream opened with this token, `4401`. Answers how many closed. */
  closeToken(tokenId: string): number
  /** The same, for several tokens at once — the archive's revoked ids. */
  closeTokens(tokenIds: readonly string[]): number
  /** Every stream on the project, whoever holds it, `4404`. */
  closeProject(projectId: string): number
  /**
   * A person's SESSION streams on one project, `4404` — the launch path plan's Task 8, which removes
   * a member, is its caller; built here so the registry's rules are written once. **Not a token's**:
   * a token stream is its token's to close, `4401`, when the token is revoked (Task 8 revokes the
   * member's tokens and closes them first) — closed here, it would tell a revoked credential's holder
   * the wrong thing.
   */
  closePerson(projectId: string, userId: string): number
}

/**
 * The longest delay one `setTimeout` holds: Node fires a LONGER one after 1 ms, with a warning — so a
 * token minted for a year would close its stream at once. Past this the timer is re-armed.
 */
const MAX_TIMER_MS = 2 ** 31 - 1

const REVOKED = 'the token was revoked'
const EXPIRED = 'the credential expired'
const DELETED = 'the project was deleted'
const NOT_A_MEMBER = 'no longer a member of the project'

/**
 * What was thrown, for an operator line: an error's code, or its class — never its message — and for
 * anything that is not an object, its KIND. Reading `.code` off a thrown `null` would throw again, out
 * of the catch that reports it, and abort every close after it (the review's finding); and a thrown
 * string's content is a message.
 */
function kindOf(error: unknown): string {
  if (error === null) return 'null'
  if (typeof error !== 'object') return typeof error
  return (error as { code?: string }).code ?? (error as Error).name ?? 'object'
}

interface Registration {
  entry: StreamEntry
  close: (code: StreamCloseCode, reason: string) => void
  timer: NodeJS.Timeout | undefined
}

export function createStreamRegistry(): StreamRegistry {
  const open = new Set<Registration>()

  /**
   * OUT OF THE REGISTRY FIRST, then closed — so a stream is closed once, however many paths reach it,
   * and a `close` that calls the unregister finds nothing to do. Answers whether it closed.
   */
  const end = (
    registration: Registration,
    code: StreamCloseCode,
    reason: string,
  ): boolean => {
    if (!open.delete(registration)) return false
    clearTimeout(registration.timer)
    try {
      registration.close(code, reason)
      return true
    } catch (error) {
      // ONE STREAM FAILING must not stop the others, and must not vanish either — `.catch(() =>
      // undefined)` is this codebase's most productive defect. The route's `stop` unsubscribes
      // BEFORE it closes, so a stream whose socket threw here hears nothing more all the same. The
      // project and the code, never the credential; the error's code or class, never its message.
      console.error(
        JSON.stringify({
          level: 'error',
          msg: 'an event stream could not be closed; it is unregistered, and hears nothing more',
          projectId: registration.entry.projectId,
          code,
          error: kindOf(error),
        }),
      )
      return false
    }
  }

  const closeWhere = (
    matches: (entry: StreamEntry) => boolean,
    code: StreamCloseCode,
    reason: string,
  ): number => {
    let closed = 0
    // A copy: `end` removes from the set while this walks it.
    for (const registration of [...open]) {
      if (matches(registration.entry) && end(registration, code, reason)) closed++
    }
    return closed
  }

  /** Arms the expiry — re-armed in steps of `MAX_TIMER_MS` when it is further off than one holds. */
  const arm = (registration: Registration): void => {
    const remaining = registration.entry.expiresAt.getTime() - Date.now()
    registration.timer =
      remaining > MAX_TIMER_MS
        ? setTimeout(() => arm(registration), MAX_TIMER_MS)
        : // Never synchronously, even when it is already past: `register`'s caller has not been
          // handed the unregister yet.
          setTimeout(
            () => end(registration, CLOSE_CREDENTIAL_GONE, EXPIRED),
            Math.max(remaining, 0),
          )
  }

  return {
    register(entry, close) {
      const registration: Registration = { entry, close, timer: undefined }
      open.add(registration)
      arm(registration)
      return () => {
        if (open.delete(registration)) clearTimeout(registration.timer)
      }
    },
    closeToken: (tokenId) =>
      closeWhere((entry) => entry.tokenId === tokenId, CLOSE_CREDENTIAL_GONE, REVOKED),
    closeTokens(tokenIds) {
      const ids = new Set(tokenIds)
      return closeWhere(
        (entry) => entry.tokenId !== null && ids.has(entry.tokenId),
        CLOSE_CREDENTIAL_GONE,
        REVOKED,
      )
    },
    closeProject: (projectId) =>
      closeWhere((entry) => entry.projectId === projectId, CLOSE_NOT_FOUND, DELETED),
    closePerson: (projectId, userId) =>
      closeWhere(
        (entry) =>
          entry.projectId === projectId &&
          entry.userId === userId &&
          entry.tokenId === null,
        CLOSE_NOT_FOUND,
        NOT_A_MEMBER,
      ),
  }
}
