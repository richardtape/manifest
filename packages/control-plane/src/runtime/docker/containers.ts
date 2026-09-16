import type { EngineClient } from './engine.js'
import { LABEL } from './instances.js'
import { INSTANCE_ALIAS_PREFIX, instanceAlias } from './names.js'

/**
 * What the driver knows about one container WITHOUT asking the database.
 *
 * §5 keeps `runtime/` away from `db/`, and the reason is not only layering: a
 * container whose row `pnpm test` truncated is still a container this driver has to
 * be able to find, refuse and retire, and so is a container from before P4c whose
 * row predates the `Route` table entirely. Everything here is read off labels the
 * driver itself wrote, or off the container's own configuration.
 *
 * There is NO `id` field beside `name`, deliberately. Every handle this driver hands
 * out is `{ id: name, name, url }` — the id IS the container name — and
 * `destroyInstanceContainer` derives the files volume from it (`<name>-files`). A
 * second field holding Docker's own 64-hex Id would be one `container.id` away from
 * deleting nothing and reporting success, which is this project's most expensive
 * defect shape.
 */
export interface AppContainer {
  /** The container's name, with Docker's leading `/` stripped. */
  name: string
  labels: Record<string, string>
  running: boolean
  /**
   * The ports the container exposes. The `manifest.port` LABEL answers this for
   * anything created since P4c; this is what gives a container from BEFORE it a dial
   * address, and `ensureInstanceContainer` writes exactly one
   * (`ExposedPorts: { '<port>/tcp': {} }`). Measured 2026-09-15: the daemon reports
   * it in `/containers/json` as `Ports: [{ PrivatePort, Type }]` even for a port
   * that is exposed and not published.
   */
  exposedPorts: number[]
}

interface ListEntry {
  Names?: string[]
  Labels?: Record<string, string> | null
  State?: string
  Ports?: { PrivatePort?: number; Type?: string }[] | null
}

interface InspectEntry {
  Name?: string
  State?: { Running?: boolean }
  Config?: {
    Labels?: Record<string, string> | null
    ExposedPorts?: Record<string, unknown> | null
  }
}

const stripSlash = (name: string): string => (name.startsWith('/') ? name.slice(1) : name)

/**
 * Containers carrying EVERY one of these labels — `key` for existence, `key=value`
 * for equality.
 *
 * Repeated label filters AND (measured 2026-09-15, Task 1's M5:
 * `label=manifest.slug=proof-app` plus `label=manifest.environment=nonexistent`
 * lists nothing, while either alone lists rows). That is the opposite of repeated
 * `name` filters, which OR — and once listed another app's container during a
 * cleanup, and the app's own database and egress proxy with it (P4b finding 192).
 *
 * `all=true`: a stopped container is still one to retire. An instance that crashed
 * as it started is exactly what §14's Incident is written about, and it is invisible
 * to a list of running containers.
 */
export async function listContainers(
  engine: EngineClient,
  labels: readonly string[],
): Promise<AppContainer[]> {
  const filters = encodeURIComponent(JSON.stringify({ label: [...labels] }))
  const listed = await engine.get<ListEntry[]>(
    `/containers/json?all=true&filters=${filters}`,
  )
  return (listed ?? []).map((entry) => ({
    name: stripSlash(entry.Names?.[0] ?? ''),
    labels: entry.Labels ?? {},
    running: entry.State === 'running',
    exposedPorts: (entry.Ports ?? [])
      .map((port) => port.PrivatePort)
      .filter((port): port is number => port !== undefined),
  }))
}

/** One container by name or id, or `undefined` — 404 is an answer here, not an error. */
export async function inspectApp(
  engine: EngineClient,
  id: string,
): Promise<AppContainer | undefined> {
  const inspect = await engine.get<InspectEntry>(`/containers/${id}/json`)
  if (inspect === undefined) return undefined
  return {
    name: stripSlash(inspect.Name ?? id),
    labels: inspect.Config?.Labels ?? {},
    running: inspect.State?.Running === true,
    exposedPorts: Object.keys(inspect.Config?.ExposedPorts ?? {})
      .map((spec) => Number.parseInt(spec.split('/')[0] ?? '', 10))
      .filter((port) => !Number.isNaN(port)),
  }
}

/**
 * The HOST half of the address the edge dials to reach this container: its bounded
 * per-instance alias since P4c (Decision 2), its container NAME before that.
 *
 * A route written before this plan is still live until that app's next deploy —
 * every app on this machine is in that state the first time the retirer runs — so
 * the pre-P4c form is not legacy tidiness, it is the common case on day one.
 */
export function dialHostOf(container: AppContainer): string {
  const instanceId = container.labels[LABEL.instance]
  return instanceId === undefined ? container.name : instanceAlias(instanceId)
}

/**
 * The full dial address, `<host>:<port>`.
 *
 * The port comes from the label this driver wrote, and falls back to the port the
 * container itself exposes — which is where a pre-P4c container's comes from, and
 * which the platform sets to exactly one value. `undefined` means this driver cannot
 * name the address at all, and the only honest thing to do with that is nothing.
 */
export function upstreamFor(container: AppContainer): string | undefined {
  const labelled = container.labels[LABEL.port]
  const port = labelled ?? container.exposedPorts[0] ?? undefined
  return port === undefined ? undefined : `${dialHostOf(container)}:${port}`
}

/** `mf-i-abc:3000` -> `mf-i-abc`. Splits on the LAST colon; a port never holds one. */
export function hostOfAddress(address: string): string {
  const colon = address.lastIndexOf(':')
  return colon === -1 ? address : address.slice(0, colon)
}

/**
 * The container an edge dial address names, by NAME — which is what a handle's id is.
 *
 * Two forms, because both are live on a running machine: `mf-i-<instanceId>:<port>`
 * since P4c, found by the `manifest.instance` label rather than by parsing the name;
 * and `<containerName>:<port>` before it, which is looked up directly.
 *
 * `undefined` for an address whose container is gone — a route left pointing at
 * something that no longer exists. That is an honest answer and a load-bearing one:
 * `servingInstance` passes it straight through, and Decision 12 makes the retirer do
 * NOTHING when nothing is serving, rather than treating every instance as retirable.
 */
export async function containerForUpstream(
  engine: EngineClient,
  upstream: string,
): Promise<string | undefined> {
  const host = hostOfAddress(upstream)
  if (host.startsWith(INSTANCE_ALIAS_PREFIX)) {
    const instanceId = host.slice(INSTANCE_ALIAS_PREFIX.length)
    const found = await listContainers(engine, [`${LABEL.instance}=${instanceId}`])
    return found[0]?.name
  }
  return (await inspectApp(engine, host))?.name
}
