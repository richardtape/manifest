import type { ReactNode } from 'react'
import { StateChip } from './StateChip'
import { stateOf, type State } from './state-of'

export interface RawChipProps {
  /** The platform's own enum, shown in mono after the word. */
  raw?: string
  /** The state, when the enum alone does not say it. */
  state?: State
  label?: ReactNode
  pulse?: boolean
}

/** A StateChip with the platform's own enum after the word: the operator is shown the machine. */
export function RawChip(props: RawChipProps) {
  return (
    <span className="mfa-rawchip">
      <StateChip
        state={props.state || stateOf(props.raw)}
        label={props.label}
        pulse={props.pulse}
      />
      {props.raw ? <code>{props.raw}</code> : null}
    </span>
  )
}
