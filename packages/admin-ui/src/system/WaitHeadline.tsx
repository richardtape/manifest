import type { ReactNode } from 'react'

export interface WaitHeadlineProps {
  /** The oldest wait ON US; `null` when nobody is waiting on us. */
  oldest: { text: ReactNode; bound?: boolean; note?: ReactNode; gap?: string } | null
  people?: number
  items?: number
  itemsLabel?: string
  assembled?: ReactNode
  assembledGap?: string
}

/** The queue's headline: the oldest wait on us, the people waiting, then the count. */
export function WaitHeadline(props: WaitHeadlineProps) {
  if (!props.oldest) {
    return (
      <section className="mfa-head mfa-head--empty" aria-label="Queue health">
        <div className="mfa-head__primary">
          <span className="mfa-over">Waiting on us</span>
          <div className="mfa-head__age">Nobody is waiting on us.</div>
        </div>
      </section>
    )
  }
  return (
    <section className="mfa-head" aria-label="Queue health">
      <div className="mfa-head__primary">
        <span className="mfa-over">Oldest waiting on us</span>
        <div className="mfa-head__age">
          {props.oldest.bound ? <span className="mfa-head__upto">up to</span> : null}
          {props.oldest.text}
        </div>
        {props.oldest.note ? (
          <p className="mfa-head__note" data-gap={props.oldest.gap}>
            {props.oldest.note}
          </p>
        ) : null}
      </div>
      <div className="mfa-head__stat">
        <span className="mfa-head__n">{props.people}</span>
        <span className="mfa-head__l">
          {props.people === 1
            ? 'person waiting on an administrator'
            : 'people waiting on an administrator'}
        </span>
      </div>
      <div className="mfa-head__stat mfa-head__stat--minor">
        <span className="mfa-head__n">{props.items}</span>
        <span className="mfa-head__l">{props.itemsLabel || 'items'}</span>
      </div>
      {props.assembled ? (
        <p className="mfa-head__assembled" data-gap={props.assembledGap}>
          {props.assembled}
        </p>
      ) : null}
    </section>
  )
}
