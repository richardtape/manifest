import type { Api } from '../api'
import {
  dayInWords,
  queueHeadline,
  queueKindWords,
  queueLink,
  waitedDays,
} from '../launch-records-state'
import { href } from '../router'
import { Field, Panel, Pill, Refusal, useAsync } from '../ui'

/**
 * §26's QUEUE — THE ADMINISTRATORS' PRIMARY SCREEN (the launch path plan's Task 13, over Task 12's
 * `listQueue`): everything waiting on an administrator, OLDEST FIRST, and the oldest's age as the
 * headline. A sign-off request carries the owner's note, which is shown here and nowhere else; a
 * registration or an assessment with UBC waits for an administrator to record UBC's answer. Each item
 * links to where it is acted on — the release's approval, or the project's launch records.
 *
 * `screens/queue.tsx` is a different thing with an older name: a PROJECT's pending actions — an agent's
 * questions for its person (D24). This is the platform's.
 *
 * **THE LINK IS HIDDEN FROM A NON-ADMINISTRATOR AND THE ROUTE IS NOT** — the Fleet's rule (`app.tsx`):
 * anybody else is answered `403 FORBIDDEN` by the platform and shown it.
 */
export function AdminQueue({ api }: { api: Api }) {
  const queue = useAsync(() => api.listQueue(), [])
  const now = new Date()
  return (
    <Panel title="Queue">
      <Refusal error={queue.error} />
      {queue.value !== undefined && (
        <>
          <p>
            <strong>{queueHeadline(queue.value, now)}</strong>
          </p>
          {queue.value.truncated && (
            <p className="hint">
              Only the oldest 200 are shown — act on those, and the rest come into view.
            </p>
          )}
          <ul className="queue">
            {queue.value.items.map((item) => {
              const days = waitedDays(item.since, now)
              return (
                <li key={`${item.kind}:${item.subjectId}`}>
                  <Field label={queueKindWords(item)}>
                    <a {...href(queueLink(item))}>{item.project.name}</a>{' '}
                    <code>{item.project.slug}</code>{' '}
                    <Pill tone={days >= 14 ? 'bad' : 'plain'}>
                      {days <= 0 ? 'today' : `${days} day${days === 1 ? '' : 's'}`}
                    </Pill>
                  </Field>
                  <p>{item.summary}</p>
                  <p className="hint">
                    Waiting since {dayInWords(item.since)}
                    {item.requestedBy !== null && ` — ${item.requestedBy.displayName}`}.
                  </p>
                  {/* THE NOTE IS FOR ADMINISTRATORS: the owner wrote it for exactly this reader. */}
                  {item.note !== null && (
                    <blockquote className="note">{item.note}</blockquote>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </Panel>
  )
}
