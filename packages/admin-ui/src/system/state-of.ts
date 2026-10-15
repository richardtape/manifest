/** The five states (20-states.md). Every status the console draws is one of these and no other. */
export type State = 'working' | 'waiting' | 'attention' | 'steady' | 'notyet'

/** The platform's enums, collapsed into the five states — the drawing's `stateOf`, case for case. */
export function stateOf(raw: string | null | undefined): State {
  switch (raw) {
    case 'healthy':
    case 'succeeded':
    case 'active':
    case 'approved':
    case 'met':
      return 'steady'
    case 'pending':
    case 'building':
    case 'provisioning':
    case 'starting':
    case 'waking':
    case 'running':
    case 'destroying':
      return 'working'
    case 'failed':
      return 'attention'
    case 'hibernated':
    case 'not_built':
    case 'gone':
      return 'notyet'
    default:
      return 'waiting'
  }
}

/** `sha256:9b2c1d0e…d3e4` — the prefix and the last four; the whole value on hover and focus. */
export function shorten(v: string): string {
  const m = /^([a-z0-9]+:)?(.*)$/.exec(v)
  const pre = m?.[1] ?? ''
  const rest = m?.[2] ?? ''
  if (rest.length <= 18) return v
  return pre + rest.slice(0, 8) + '…' + rest.slice(-4)
}
