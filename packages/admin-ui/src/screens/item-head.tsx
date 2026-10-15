import { holderWords, kindWords, type QueueItem } from '../queue-state'
import { StateChip } from '../system'
import { ageWords } from '../time'

/**
 * A pane's head: the kind, who holds the wait, the platform's sentence, the project and how long it
 * has waited — the drawing's `.mfa-pane__head`. Its own file because the queue and every pane draw it.
 */
export function ItemHead({ item, now }: { item: QueueItem; now: Date }) {
  return (
    <header className="mfa-pane__head">
      <div className="mfa-pane__top">
        <span className="mfa-over">{kindWords(item.kind)}</span>
        <StateChip state="waiting" pulse={false} label={holderWords(item)} />
      </div>
      <h2 className="mfa-pane__ask">{item.summary}</h2>
      <p className="mfa-pane__meta">
        <span className="mfa-mono">{item.project.slug}</span>
        <span>{item.project.name}</span>
        <span>{`waiting ${ageWords(item.since, now)}`}</span>
      </p>
    </header>
  )
}
