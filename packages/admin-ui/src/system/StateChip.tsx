import type { ReactNode } from 'react'
import { cx } from './cx'
import type { State } from './state-of'

const STATES: readonly string[] = ['working', 'waiting', 'attention', 'steady', 'notyet']

export interface StateChipProps {
  state: State
  label?: ReactNode
  /** Defaults to true for `working` and `attention`: motion only where a machine is moving. */
  pulse?: boolean | undefined
  className?: string
}

/** A dot and a word, never colour alone. A state this console does not know is `notyet`. */
export function StateChip(props: StateChipProps) {
  const state = STATES.includes(props.state) ? props.state : 'notyet'
  const pulse =
    props.pulse === undefined ? state === 'working' || state === 'attention' : props.pulse
  return (
    <span className={cx('mf-chip', 'mf-is-' + state, props.className)}>
      <span className={cx('mf-chip__dot', pulse && 'mf-pulse')} />
      {props.label}
    </span>
  )
}
