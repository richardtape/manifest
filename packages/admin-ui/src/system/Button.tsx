import type { CSSProperties, MouseEventHandler, ReactNode } from 'react'
import { cx } from './cx'

export type ButtonKind = 'primary' | 'secondary' | 'tertiary' | 'danger' | 'ghostDanger'

export interface ButtonProps {
  kind?: ButtonKind
  size?: 'sm'
  /** An `<a>` instead of a `<button>`. */
  href?: string
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean | undefined
  onClick?: MouseEventHandler<HTMLElement> | undefined
  style?: CSSProperties
  className?: string
  children?: ReactNode
}

/** The drawing's button, its attributes in the drawing's order (order is markup). */
export function Button(props: ButtonProps) {
  const className = cx(
    'mf-btn',
    'mf-btn--' + (props.kind || 'primary'),
    props.size === 'sm' && 'mf-btn--sm',
    props.className,
  )
  if (props.href)
    return (
      <a
        className={className}
        style={props.style}
        onClick={props.onClick}
        href={props.href}
      >
        {props.children}
      </a>
    )
  return (
    <button
      className={className}
      style={props.style}
      onClick={props.onClick}
      type={props.type || 'button'}
      disabled={props.disabled}
    >
      {props.children}
    </button>
  )
}
