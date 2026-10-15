import { cx } from './cx'
import { COPY, Icon } from './icons'
import { shorten } from './state-of'

export interface MachineValueProps {
  value: string
  /** The whole value, never shortened. */
  full?: boolean
  /** `false` drops the copy button. */
  copy?: boolean
  /** What the copy button copies, in its accessible name: *Copy image digest*. */
  label?: string
  className?: string
}

/** The drawing's `copyText`: the clipboard, then a moment's `data-copied` on the button. */
function copyText(value: string, button: HTMLElement | null) {
  function done() {
    if (!button) return
    button.setAttribute('data-copied', 'true')
    setTimeout(() => button.removeAttribute('data-copied'), 1400)
  }
  try {
    navigator.clipboard.writeText(value).then(done, () => done())
  } catch {
    done()
  }
}

/** A digest, an id, a reference — shortened to its prefix and last four, whole on hover and focus. */
export function MachineValue(props: MachineValueProps) {
  const v = props.value
  const short = props.full ? v : shorten(v)
  return (
    <span className={cx('mfa-mv', props.className)}>
      <code
        className="mfa-mv__v"
        tabIndex={short === v ? undefined : 0}
        title={short === v ? undefined : v}
      >
        <span className="mfa-mv__short" aria-hidden={short === v ? undefined : 'true'}>
          {short}
        </span>
        {short === v ? null : <span className="mfa-mv__full">{v}</span>}
        {short === v ? null : <span className="mfa-sr">{v}</span>}
      </code>
      {props.copy === false ? null : (
        <button
          type="button"
          className="mfa-mv__copy"
          aria-label={'Copy ' + (props.label || 'value')}
          onClick={(e) => copyText(v, e.currentTarget)}
        >
          <Icon paths={COPY} size={13} />
        </button>
      )}
    </span>
  )
}
