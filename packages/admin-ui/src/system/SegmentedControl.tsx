import { cx } from './cx'

export type Segment = string | { value: string; label: string }

export interface SegmentedControlProps {
  options: readonly Segment[]
  value: string
  role?: 'tablist' | 'radiogroup'
  onChange?: (value: string) => void
  className?: string
}

/** A few mutually exclusive views or values, as tabs or as a radio group. */
export function SegmentedControl(props: SegmentedControlProps) {
  const options = props.options || []
  return (
    <div className={cx('mf-seg', props.className)} role={props.role || 'tablist'}>
      {options.map((o, i) => {
        const value = typeof o === 'string' ? o : o.value
        const label = typeof o === 'string' ? o : o.label
        const on = value === props.value
        return (
          <button
            key={i}
            type="button"
            role={props.role === 'radiogroup' ? 'radio' : 'tab'}
            className={cx('mf-seg__tab', on && 'mf-seg__tab--on')}
            aria-selected={props.role === 'radiogroup' ? undefined : on}
            aria-checked={props.role === 'radiogroup' ? on : undefined}
            onClick={() => {
              if (props.onChange) props.onChange(value)
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
