import type { Schemas } from '@manifest/contract'
import type { ReactNode } from 'react'
import { FactList } from './FactList'
import { MachineValue } from './MachineValue'
import { Tags } from './Tags'

export interface DiffViewProps {
  diff: Schemas['ApprovalDiff']
}

/** An `ApprovalDiff`, read and never recomputed: the changes, the platform's notes, the model's sentences. */
export function DiffView(props: DiffViewProps) {
  const d = props.diff
  const sens: readonly string[] = d.sensitiveFields || []
  const noteFor: Record<string, string> = {}
  for (const s of d.security || []) noteFor[s.field] = s.note
  const exposureFor: Record<string, string> = {}
  for (const x of d.summaryExposures || []) exposureFor[x.path] = x.sentence

  function fieldOf(path: string): string | null {
    for (const s of sens) if (path === s || path.indexOf(s + '.') === 0) return s
    return null
  }

  let summary: ReactNode = null
  if (d.summarySource === 'llm') {
    summary = (
      <div className="mfa-diff__summary">
        <span className="mfa-diff__who">Summary · written by a language model</span>
        <p className="mfa-diff__said">{d.summary}</p>
      </div>
    )
  } else if (d.summarySource === 'unavailable') {
    summary = (
      <div className="mfa-diff__summary">
        <span className="mfa-diff__who">Summary · unavailable</span>
        <p className="mfa-diff__said">
          The model didn’t answer. The diff above is the control, and it is complete.
        </p>
      </div>
    )
  } else if (d.summarySource === 'no-previous-release') {
    summary = (
      <div className="mfa-diff__summary">
        <span className="mfa-diff__who">Summary · first launch</span>
        <p className="mfa-diff__said">
          Nothing earlier to compare with. What it runs, asks for and may use is below,
          and that is the whole of it.
        </p>
      </div>
    )
  }

  const r = d.resources
  return (
    <div className="mfa-diff">
      {d.baselineReleaseId || sens.length ? (
        <div className="mfa-diff__meta">
          {sens.length ? <span>Re-escalated by</span> : null}
          {sens.length ? (
            <Tags items={sens.map((s) => ({ text: s, sens: true }))} />
          ) : null}
          {d.baselineReleaseId ? <span>compared with release</span> : null}
          {d.baselineReleaseId ? (
            <MachineValue value={d.baselineReleaseId} label="baseline release id" />
          ) : null}
        </div>
      ) : null}

      {(d.changes || []).map((c) => {
        const f = fieldOf(c.path)
        return (
          <div key={c.path} className="mfa-diff__change">
            <div className="mfa-diff__path">
              {c.path}
              {f ? <Tags items={[{ text: 'sensitive', sens: true }]} /> : null}
            </div>
            {c.from !== undefined ? (
              <div className="mfa-diff__line mfa-diff__line--remove">
                <span className="mfa-diff__sign" aria-label="was">
                  −
                </span>
                <span>{c.from}</span>
              </div>
            ) : null}
            {c.to !== undefined ? (
              <div className="mfa-diff__line mfa-diff__line--add">
                <span className="mfa-diff__sign" aria-label="becomes">
                  +
                </span>
                <span>{c.to}</span>
              </div>
            ) : null}
            {f && noteFor[f] ? (
              <div className="mfa-diff__voice">
                <span className="mfa-diff__who">{'Manifest’s note on ' + f}</span>
                <p className="mfa-diff__said">{noteFor[f]}</p>
              </div>
            ) : null}
            {exposureFor[c.path] ? (
              <div className="mfa-diff__voice">
                <span className="mfa-diff__who">
                  What it could expose · a language model
                </span>
                <p className="mfa-diff__said">{exposureFor[c.path]}</p>
              </div>
            ) : null}
          </div>
        )
      })}

      {summary}

      <FactList
        rows={[
          { label: 'Services', value: <Tags items={d.services} /> },
          { label: 'CWL attributes', value: <Tags items={d.attributes} /> },
          {
            label: 'Production limits',
            // String(), not `+`, so a limit the platform does not set reads `null` as the drawing's does.
            value:
              String(r.cpu) +
              ' CPU · ' +
              String(r.memory) +
              ' · ' +
              String(r.disk) +
              ' disk · ' +
              String(r.pids) +
              ' processes',
            mono: true,
          },
          {
            label: 'Code review',
            value: (
              <span>
                <code className="mfa-mono">{d.review.state}</code>
                {' — '}
                {d.review.detail}
              </span>
            ),
          },
        ]}
      />
      {d.coverage ? <p className="mfa-diff__fine">{d.coverage}</p> : null}
    </div>
  )
}
