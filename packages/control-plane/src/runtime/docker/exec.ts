import type { ExecOpts, ExecStream } from '../driver.js'
import { EngineError, type EngineClient } from './engine.js'
import { demux } from './logs.js'

/**
 * Implemented and smoke-tested. **S5 owns the sandbox use of this** — S1 never
 * exercised `exec` and nothing here claims it is proven for running an agent.
 * `capabilities().supportsExec` is true because the operation works, which is a
 * different claim from "the sandbox story is settled".
 */
export function containerExec(
  engine: EngineClient,
  id: string,
  cmd: string[],
  opts: ExecOpts,
): ExecStream {
  const stdoutLines: string[] = []
  const stderrLines: string[] = []
  let resolveExit: (code: number) => void = () => {}
  let rejectExit: (error: unknown) => void = () => {}
  const exitCode = new Promise<number>((resolve, reject) => {
    resolveExit = resolve
    rejectExit = reject
  })

  const started = (async () => {
    const created = await engine.post<{ Id: string }>(`/containers/${id}/exec`, {
      AttachStdout: true,
      AttachStderr: true,
      Cmd: cmd,
      WorkingDir: opts.cwd,
      Env: Object.entries(opts.env ?? {}).map(([k, v]) => `${k}=${v}`),
    })
    // 404 -> undefined (Task 1), so a missing container arrives here as
    // `undefined` rather than as an exception. Left alone it surfaces as
    // "Cannot read properties of undefined", which is not machine-actionable (§20).
    if (!created) {
      throw new EngineError(
        'EXEC_TARGET_NOT_FOUND',
        `cannot exec in '${id}': no such container`,
        'The instance may have been destroyed, or never created. `status()` reports ' +
          '`gone` for an id the daemon does not know.',
      )
    }
    const res = await engine.stream(`/exec/${created.Id}/start`, 'POST', {
      Detach: false,
      Tty: false,
    })
    for await (const line of demux(res as unknown as AsyncIterable<Buffer>)) {
      ;(line.stream === 'stderr' ? stderrLines : stdoutLines).push(line.text)
    }
    const info = await engine.get<{ ExitCode: number | null }>(`/exec/${created.Id}/json`)
    resolveExit(info?.ExitCode ?? -1)
  })()

  /**
   * Without this, a failing exec is TWO bugs at once — both measured against a
   * container that does not exist: `exitCode` **never settles**, so the caller
   * waits for ever, and the rejection escapes as an **unhandled rejection**,
   * which Node treats as fatal by default. In a long-running control plane that
   * is the whole process.
   *
   * The error is routed to `exitCode`, so anyone awaiting it — or draining
   * either stream, since both await `started` — sees it. The `catch` also marks
   * this handle as handled, so the same rejection is not reported twice.
   */
  started.catch((error: unknown) => {
    rejectExit(error)
  })

  const drain = async function* (buffer: string[]): AsyncIterable<string> {
    await started
    for (const line of buffer) yield line
  }

  return { stdout: drain(stdoutLines), stderr: drain(stderrLines), exitCode }
}
