import type { ReactNode } from 'react'
import { cx } from './cx'

export interface SettingRowProps {
  label: ReactNode
  /** The setting's key: an environment variable, or the operation that reads it. */
  keyName?: string
  value: ReactNode
  changed?: ReactNode
  /** Where it is set. */
  source: ReactNode
  /** What can be done about it here. */
  action?: ReactNode
  /** Rendered beneath the row while it is being changed. */
  editor?: ReactNode
  editing?: boolean
}

/** One setting: what it is, its key, its value, where it is set, and what can be done here. */
export function SettingRow(props: SettingRowProps) {
  return (
    <div className={cx('mfa-set', props.editing && 'mfa-set--editing')}>
      <div className="mfa-set__row">
        <div className="mfa-set__what">
          <span className="mfa-set__label">{props.label}</span>
          {props.keyName ? <code className="mfa-set__key">{props.keyName}</code> : null}
        </div>
        <div className="mfa-set__value">
          {props.value}
          {props.changed ? (
            <span className="mfa-set__changed">{props.changed}</span>
          ) : null}
        </div>
        <div className="mfa-set__src">{props.source}</div>
        <div className="mfa-set__act">{props.action}</div>
      </div>
      {props.editor ? <div className="mfa-set__editor">{props.editor}</div> : null}
    </div>
  )
}
