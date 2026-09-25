/**
 * ONE SERIAL QUEUE PER PROCESS for work a webhook asks for (the D5 plan's Decision 10): a
 * delivery is verified, recorded and answered on the request, and its sync — a fetch, a
 * scan and a validation — runs here, one job at a time across the process, because GitHub
 * times a delivery out after ten seconds. The retirer's and the build runner's shape: built
 * once at boot, and `idle()` is what a test waits on.
 *
 * A job that throws is an operator line naming it — never swallowed, and never a reason the
 * next job does not run. The line carries the error's message, which a source driver has
 * already redacted of every token it holds (Decision 4).
 */
export interface SerialQueue {
  enqueue(label: string, job: () => Promise<void>): void
  /** Resolves when nothing is queued or running — including a job enqueued while it waits. */
  idle(): Promise<void>
}

export function createSerialQueue(): SerialQueue {
  let tail: Promise<void> = Promise.resolve()
  return {
    enqueue(label, job) {
      tail = tail.then(job).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        console.error(`[source-sync] ${label} failed: ${message}`)
      })
    },
    async idle() {
      let seen: Promise<void>
      do {
        seen = tail
        await seen
      } while (seen !== tail)
    },
  }
}
