import type { MouseEventHandler, ReactNode } from 'react'
import { cx } from './cx'

export interface QueueRowMeta {
  text: ReactNode
  mono?: boolean
  /** The requester's note. */
  flag?: boolean
  /** Who holds the item: us, or UBC. */
  holder?: boolean
  gap?: string
}

export interface QueueRowItem {
  ageText: ReactNode
  /** *up to*: an age the console can only bound. */
  bound?: boolean
  kindLabel: ReactNode
  kindGap?: string
  project: ReactNode
  ask: ReactNode
  meta?: readonly QueueRowMeta[]
}

export interface QueueRowProps {
  item: QueueRowItem
  selected?: boolean
  onSelect?: MouseEventHandler<HTMLButtonElement>
  id?: string
}

/** One queue item: age, kind, project, the ask, and a meta line that names who holds it. */
export function QueueRow(props: QueueRowProps) {
  const it = props.item
  return (
    <li className="mfa-rows__item">
      <button
        type="button"
        className={cx('mfa-row', props.selected && 'mfa-row--on')}
        aria-current={props.selected ? 'true' : undefined}
        onClick={props.onSelect}
        id={props.id}
      >
        <span className="mfa-row__age">
          {it.bound ? <span className="mfa-row__upto">up to</span> : null}
          <span className="mfa-row__agev">{it.ageText}</span>
        </span>
        <span className="mfa-row__main">
          <span className="mfa-row__top">
            <span className="mfa-row__kind" data-gap={it.kindGap}>
              {it.kindLabel}
            </span>
            <span className="mfa-row__slug">{it.project}</span>
          </span>
          <span className="mfa-row__ask">{it.ask}</span>
          <span className="mfa-row__meta">
            {(it.meta || []).map((m, i) => (
              <span
                key={i}
                data-gap={m.gap}
                className={cx(
                  'mfa-row__m',
                  m.mono && 'mfa-row__m--mono',
                  m.flag && 'mfa-row__m--flag',
                  m.holder && 'mfa-row__m--holder',
                )}
              >
                {m.text}
              </span>
            ))}
          </span>
        </span>
      </button>
    </li>
  )
}
