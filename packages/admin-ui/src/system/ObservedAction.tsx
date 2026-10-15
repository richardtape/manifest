import { Fragment, type MouseEventHandler, type ReactNode } from 'react'
import { Button, type ButtonKind } from './Button'
import { SegmentedControl } from './SegmentedControl'

export interface ObservedActionButton {
  label: string
  kind?: ButtonKind
  onClick?: MouseEventHandler<HTMLElement>
  disabled?: boolean
  /** Disabled until a reason is written. */
  needsReason?: boolean
}

export interface ObservedActionPreview {
  label: string
  /** The event's type, as the owner's activity shows it. */
  type: string
  /** The sentence the owner will read. */
  lead: ReactNode
  /** Where the reason goes: quoted in the sentence, or kept on the record. */
  reasonIn?: 'sentence' | 'record'
  after?: ReactNode
  gap?: string
  afterGap?: string
}

export interface ObservedActionProps {
  id: string
  /** Whose activity the decision appears in. */
  owner: string
  reason?: string
  onReason?: (reason: string) => void
  placeholder?: string
  hint?: ReactNode
  note?: ReactNode
  /** `false` where the API stores no reason: an admission replaces the field. */
  canRecord?: boolean
  /** The admission's strong first words. */
  admissionLead?: string
  admission?: ReactNode
  admissionGap?: string
  actions?: readonly ObservedActionButton[]
  previews?: readonly ObservedActionPreview[]
  previewIndex?: number
  onPreviewIndex?: (index: number) => void
  seeLabel?: string
  children?: ReactNode
}

/**
 * AN ADMINISTRATOR'S DECISION, MADE TO FEEL OBSERVED BECAUSE IT IS: a reason, what the owner will read
 * in their own product, and the actions. Where the API stores no reason, the field is replaced by an
 * admission rather than collecting words that go nowhere.
 */
export function ObservedAction(props: ObservedActionProps) {
  const previews = props.previews || []
  const idx = Math.min(props.previewIndex || 0, Math.max(previews.length - 1, 0))
  const p = previews[idx]
  const reason = props.reason || ''
  const quote = reason.trim() ? (
    <blockquote className="mfa-quote">{reason.trim()}</blockquote>
  ) : (
    <blockquote className="mfa-quote mfa-quote--empty">
      Your words appear here.
    </blockquote>
  )
  const labels = previews.map((x) => x.label)

  return (
    <div className="mfa-obs">
      <div className="mfa-obs__write">
        {props.canRecord === false ? (
          <div className="mfa-admit" data-gap={props.admissionGap}>
            <strong>
              {props.admissionLead || 'Manifest can’t record a reason here yet. '}
            </strong>
            {props.admission}
          </div>
        ) : (
          <Fragment>
            <label className="mfa-obs__label" htmlFor={props.id}>
              Your reason
            </label>
            <textarea
              id={props.id}
              className="mfa-obs__input"
              rows={4}
              value={reason}
              placeholder={props.placeholder}
              onChange={(e) => props.onReason?.(e.target.value)}
            />
          </Fragment>
        )}
        {props.hint ? <p className="mfa-obs__hint">{props.hint}</p> : null}
        {props.children}
        <div className="mfa-obs__actions">
          {(props.actions || []).map((a) => (
            <Button
              key={a.label}
              kind={a.kind || 'secondary'}
              size="sm"
              onClick={a.onClick}
              disabled={a.disabled || (a.needsReason && !reason.trim())}
            >
              {a.label}
            </Button>
          ))}
        </div>
        {props.note ? <p className="mfa-obs__hint">{props.note}</p> : null}
      </div>

      {p ? (
        <div className="mfa-obs__see" aria-live="polite">
          <div className="mfa-obs__seehead">
            <span className="mfa-over">
              {props.seeLabel || 'In ' + props.owner + '’s activity'}
            </span>
            {previews.length > 1 ? (
              <SegmentedControl
                options={labels}
                value={p.label}
                role="tablist"
                onChange={(v) => props.onPreviewIndex?.(labels.indexOf(v))}
              />
            ) : null}
          </div>
          <div className="mfa-obs__event">
            <span className="mfa-obs__when">{'just now · ' + p.type}</span>
            <p className="mfa-obs__sentence" data-gap={p.gap}>
              {p.lead}
            </p>
            {p.reasonIn === 'sentence' ? quote : null}
          </div>
          {p.reasonIn === 'record' ? (
            <Fragment>
              <p className="mfa-obs__after">
                {'Your reason is kept on the approval record, which ' +
                  props.owner +
                  ' can open:'}
              </p>
              {quote}
            </Fragment>
          ) : null}
          {p.after ? (
            <p className="mfa-obs__after" data-gap={p.afterGap}>
              {p.after}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
