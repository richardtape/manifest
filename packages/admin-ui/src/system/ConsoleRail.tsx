import { cx } from './cx'
import { Icon, MARK, RAIL_ICONS, type RailIcon } from './icons'

export interface RailItem {
  label: string
  icon: RailIcon
  href: string
  /** The screen shown now: its three signals, and `aria-current="page"`. */
  on?: boolean
}

export interface ConsoleRailProps {
  items: readonly RailItem[]
  /** Above the person: Settings. */
  footItems: readonly RailItem[]
  user: string
  /** The person's platform role, because anything done here may be done on someone else's project. */
  role?: string | undefined
  /** The overline that says which product this is. */
  product?: string
  homeHref?: string
  signOutHref?: string
  className?: string
}

function railItem(it: RailItem) {
  return (
    <a
      key={it.label}
      href={it.href}
      className={cx('mf-rail__item', it.on && 'mf-rail__item--on')}
      aria-current={it.on ? 'page' : undefined}
    >
      <Icon paths={RAIL_ICONS[it.icon] || []} size={18} width={1.8} />
      {it.label}
    </a>
  )
}

/**
 * THE RAIL, NOT A TOP BAR (Rich, 2026-09-27): SideNav's sibling for the operations surface — its
 * classes, its UBC blue, its three signals for the active item — carrying the console's screens, an
 * *Operations* overline, Settings above the person, and the person's platform role.
 */
export function ConsoleRail(props: ConsoleRailProps) {
  return (
    <nav
      className={cx('mf-rail', 'mfa-rail', props.className)}
      aria-label="Manifest operations"
    >
      <a className="mf-rail__mark" href={props.homeHref || '#queue'}>
        <span className="mf-rail__sq">
          <svg
            width={14}
            height={14}
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--nav-surface)"
            strokeWidth={2.3}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d={MARK[0]} />
            <path d={MARK[1]} />
          </svg>
        </span>
        <span className="mf-rail__name">Manifest</span>
        <span className="mf-rail__bar" />
        <span className="mf-rail__org">UBC</span>
      </a>
      <span className="mf-rail__over">{props.product || 'Operations'}</span>
      {(props.items || []).map(railItem)}
      <div className="mfa-rail__spacer" />
      {(props.footItems || []).map(railItem)}
      <div className="mf-rail__foot">
        <span className="mf-rail__who">{props.user}</span>
        <span className="mfa-rail__role">{props.role || 'Platform administrator'}</span>
        <a className="mf-rail__out" href={props.signOutHref || '#'}>
          Sign out
        </a>
      </div>
    </nav>
  )
}
