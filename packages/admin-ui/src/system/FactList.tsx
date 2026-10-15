import { Fragment, type ReactNode } from 'react'

export interface FactRow {
  label: ReactNode
  value: ReactNode
  mono?: boolean
  gap?: string
}

export interface FactListProps {
  /** A `null` or `false` row is left out, so a fact that does not apply is written inline. */
  rows: readonly (FactRow | null | false)[]
}

/** A dense definition list for a record's machine facts. */
export function FactList(props: FactListProps) {
  return (
    <dl className="mfa-facts">
      {props.rows
        .filter((r): r is FactRow => Boolean(r))
        .map((r, i) => (
          <Fragment key={i}>
            <dt data-gap={r.gap}>{r.label}</dt>
            <dd className={r.mono ? 'mfa-facts__mono' : undefined}>{r.value}</dd>
          </Fragment>
        ))}
    </dl>
  )
}
