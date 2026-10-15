import type { MouseEventHandler } from 'react'
import { Icon, SEARCH } from './icons'

export interface Facet {
  label: string
  on: boolean
  onToggle?: MouseEventHandler<HTMLButtonElement>
}

export interface FilterBarProps {
  id?: string
  query: string
  placeholder: string
  onQuery?: (query: string) => void
  facets?: readonly Facet[]
  onClear?: MouseEventHandler<HTMLButtonElement>
  /** What the filters leave, said: *13 apps*. */
  count: string
  label?: string
}

/** Facets as toggles, a text filter, the count, and Clear. The state lives with the caller. */
export function FilterBar(props: FilterBarProps) {
  const anyOn = props.query || (props.facets || []).some((f) => f.on)
  return (
    <div className="mfa-filters" role="group" aria-label={props.label || 'Filters'}>
      <div className="mfa-search">
        <Icon paths={SEARCH} size={14} />
        <input
          id={props.id}
          type="search"
          value={props.query}
          placeholder={props.placeholder}
          aria-label={props.placeholder}
          onChange={(e) => props.onQuery?.(e.target.value)}
        />
      </div>
      {(props.facets || []).map((f) => (
        <button
          key={f.label}
          type="button"
          className="mfa-facet"
          aria-pressed={f.on ? 'true' : 'false'}
          onClick={f.onToggle}
        >
          {f.label}
        </button>
      ))}
      {anyOn ? (
        <button type="button" className="mfa-filters__clear" onClick={props.onClear}>
          Clear
        </button>
      ) : null}
      <span className="mfa-filters__count" aria-live="polite">
        {props.count}
      </span>
    </div>
  )
}
