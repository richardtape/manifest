import type { ReactNode } from 'react'
import { cx } from './cx'

export interface EventLineProps {
  when: ReactNode
  text: ReactNode
  /** The event's type, in mono. */
  type: string
  /** The event's actor (`EventActor.name`). */
  who?: string | undefined
  /** `EventActor.asAdministrator`: an administrator using an owner's capability. */
  asAdmin?: boolean | undefined
  /** `EventActor.reason`, quoted as the project's people read it. */
  reason?: string | null | undefined
}

/** One event: when · who acted · the sentence · the administrator's reason · its type. */
export function EventLine(props: EventLineProps) {
  return (
    <li className="mfa-ev">
      <span className="mfa-ev__when">{props.when}</span>
      <span className="mfa-ev__body">
        {props.who ? (
          <span className={cx('mfa-ev__who', props.asAdmin && 'mfa-ev__who--admin')}>
            {props.who + (props.asAdmin ? ' · as a platform administrator' : '')}
          </span>
        ) : null}
        <span className="mfa-ev__text">{props.text}</span>
        {props.reason ? (
          <blockquote className="mfa-quote mfa-ev__reason">{props.reason}</blockquote>
        ) : null}
        <span className="mfa-ev__type">{props.type}</span>
      </span>
    </li>
  )
}
