import { cx } from './cx'

export interface ChoiceOption {
  value: string
  title: string
  note?: string
  /** A checkbox's own state; a radio group reads `value` instead. */
  checked?: boolean
}

export interface ChoiceProps {
  name: string
  type?: 'radio' | 'checkbox'
  value?: string
  options: readonly ChoiceOption[]
  label?: string
  onChange?: (value: string) => void
  className?: string
}

/** Options as whole rows a person reads before choosing: a radio group, or a set of checkboxes. */
export function Choice(props: ChoiceProps) {
  const type = props.type === 'checkbox' ? 'checkbox' : 'radio'
  const options = props.options || []
  return (
    <div
      className={cx('mf-choices', props.className)}
      role={type === 'radio' ? 'radiogroup' : 'group'}
      aria-label={props.label}
    >
      {options.map((o, i) => {
        const on = type === 'radio' ? o.value === props.value : !!o.checked
        return (
          <label key={i} className={cx('mf-choice', on && 'mf-choice--on')}>
            <input
              type={type}
              name={props.name}
              checked={on}
              onChange={() => {
                if (props.onChange) props.onChange(o.value)
              }}
            />
            <span>
              <span className="mf-choice__title" style={{ display: 'block' }}>
                {o.title}
              </span>
              {o.note ? (
                <span className="mf-choice__note" style={{ display: 'block' }}>
                  {o.note}
                </span>
              ) : null}
            </span>
          </label>
        )
      })}
    </div>
  )
}
