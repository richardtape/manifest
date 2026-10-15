import { cx } from './cx'

export type Tag = string | { text: string; add?: boolean; sens?: boolean }

export interface TagsProps {
  items: readonly Tag[]
}

/** Short machine words in a row: a service, an attribute; `+` for one added, a tint for a sensitive field. */
export function Tags(props: TagsProps) {
  return (
    <span className="mfa-tags">
      {props.items.map((t, i) => {
        const o: Exclude<Tag, string> = typeof t === 'string' ? { text: t } : t
        return (
          <span
            key={i}
            className={cx('mfa-tag', o.add && 'mfa-tag--add', o.sens && 'mfa-tag--sens')}
          >
            {(o.add ? '+ ' : '') + o.text}
          </span>
        )
      })}
    </span>
  )
}
