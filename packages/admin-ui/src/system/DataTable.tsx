import type { ReactNode } from 'react'
import { cx } from './cx'

export interface DataColumn<R> {
  key: string
  label: ReactNode
  sortable?: boolean
  mono?: boolean
  align?: 'left' | 'right'
  /** The cell; without it, the row's own value under `key`. */
  render?: (row: R) => ReactNode
  gap?: string
}

export interface DataTableProps<R> {
  /** For a screen reader; the table's heading is the screen's. */
  caption: string
  columns: readonly DataColumn<R>[]
  rows: readonly R[]
  /** The row's own field that keys it. */
  rowKey: string
  /** For a table that runs past a screen, and never for a short one. */
  striped?: boolean
  compact?: boolean
  sortKey?: string
  sortDir?: 'asc' | 'desc'
  onSort?: (key: string) => void
  onRow?: (row: R) => void
}

const field = (row: unknown, key: string) => (row as Record<string, unknown>)[key]

/** A real `<table>`: sortable headers with `aria-sort`, dense rows, a row that opens. */
export function DataTable<R>(props: DataTableProps<R>) {
  const cols = props.columns
  return (
    <div className="mfa-tablewrap">
      <table
        className={cx(
          'mfa-table',
          props.striped && 'mfa-table--striped',
          props.compact && 'mfa-table--compact',
        )}
      >
        <caption className="mfa-sr">{props.caption}</caption>
        <thead>
          <tr>
            {cols.map((c) => {
              const on = props.sortKey === c.key
              return (
                <th
                  key={c.key}
                  scope="col"
                  className={c.align === 'right' ? 'mfa-num' : undefined}
                  aria-sort={
                    c.sortable
                      ? on
                        ? props.sortDir === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                      : undefined
                  }
                >
                  {c.sortable ? (
                    <button
                      type="button"
                      className="mfa-th"
                      onClick={() => props.onSort?.(c.key)}
                    >
                      <span data-gap={c.gap}>{c.label}</span>
                      {on ? (
                        <span aria-hidden="true">
                          {props.sortDir === 'asc' ? '↑' : '↓'}
                        </span>
                      ) : null}
                    </button>
                  ) : (
                    <span data-gap={c.gap}>{c.label}</span>
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((r) => (
            <tr
              key={String(field(r, props.rowKey))}
              className={props.onRow ? 'mfa-tr' : undefined}
              onClick={props.onRow ? () => props.onRow?.(r) : undefined}
            >
              {cols.map((c) => (
                <td
                  key={c.key}
                  className={cx(c.mono && 'mfa-mono', c.align === 'right' && 'mfa-num')}
                >
                  {c.render ? c.render(r) : (field(r, c.key) as ReactNode)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
