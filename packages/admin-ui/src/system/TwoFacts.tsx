export type FactTone = 'steady' | 'attention' | 'working' | 'neutral'

export interface Fact {
  overline?: string
  title?: string
  note?: string
  tone?: FactTone
}

export interface TwoFactsProps {
  /** What people get now. Always the left cell. */
  serving?: Fact
  /** What the last attempt did, tinted by its outcome. */
  attempt?: Fact
  /** `null` drops the footnote. */
  foot?: string | null
  className?: string
}

const TONE: Record<FactTone, { bg: string; bd: string; fg: string; note: string }> = {
  steady: {
    bg: 'var(--steady-tint)',
    bd: 'var(--steady-border)',
    fg: 'var(--steady)',
    note: 'var(--steady-muted)',
  },
  attention: {
    bg: 'var(--attention-tint)',
    bd: 'var(--attention-border)',
    fg: 'var(--attention)',
    note: 'var(--attention-muted)',
  },
  working: {
    bg: 'var(--working-tint)',
    bd: 'var(--working-border)',
    fg: 'var(--working-deep)',
    note: 'var(--working-deep)',
  },
  neutral: {
    bg: 'var(--surface-sunken)',
    bd: 'var(--border-subtle)',
    fg: 'var(--ink-subtle)',
    note: 'var(--ink-muted)',
  },
}

function fact(f: Fact, fallback: FactTone, key: string) {
  const t = TONE[f.tone || fallback] || TONE.neutral
  return (
    <div
      key={key}
      className="mf-fact"
      style={{ background: t.bg, border: '1px solid ' + t.bd }}
    >
      <span className="mf-overline" style={{ color: t.fg }}>
        {f.overline}
      </span>
      <span className="mf-fact__title">{f.title}</span>
      {f.note ? (
        <span className="mf-fact__note" style={{ color: t.note }}>
          {f.note}
        </span>
      ) : null}
    </div>
  )
}

/** What is serving, and what the last attempt did: two facts, never one. */
export function TwoFacts(props: TwoFactsProps) {
  return (
    <div className={props.className}>
      <div className="mf-facts">
        {fact(props.serving || {}, 'steady', 'a')}
        {fact(props.attempt || {}, 'neutral', 'b')}
      </div>
      {props.foot === null ? null : (
        <p className="mf-facts__foot">
          {props.foot ||
            'Two facts, not one. The older version keeps answering until a new one proves it can.'}
        </p>
      )}
    </div>
  )
}
