import type { CSSProperties, ReactNode } from 'react'
import { cx } from './cx'
import { Icon, WARN } from './icons'

export interface InverseSurfaceProps {
  title?: string
  /** The warning mark beside the title. */
  warn?: boolean
  body?: string
  /** Machine text, in mono, selectable whole. */
  inset?: string
  style?: CSSProperties
  className?: string
  children?: ReactNode
}

/** Machine text a person is shown on purpose — an instance's last lines — and nothing else. */
export function InverseSurface(props: InverseSurfaceProps) {
  return (
    <div className={cx('mf-inverse', props.className)} style={props.style}>
      {props.title ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {props.warn ? (
            <Icon paths={WARN} size={18} stroke="var(--warning-mark)" />
          ) : null}
          <h3 className="mf-inverse__title">{props.title}</h3>
        </div>
      ) : null}
      {props.body ? <p className="mf-inverse__body">{props.body}</p> : null}
      {props.inset ? <div className="mf-inverse__inset">{props.inset}</div> : null}
      {props.children}
    </div>
  )
}
