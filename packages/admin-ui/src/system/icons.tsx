/**
 * THE DRAWING'S ICON PATHS, AS DATA — copied from `design/system/components/bundle.js` (the warning
 * mark) and `design/admin/components.js` (`COPY`, `TICK`, `SEARCH`, `CLOSE`, `RAIL_ICONS`, and the
 * rail's house mark). A 24×24 viewBox, stroked, never filled.
 */
export const TICK: readonly string[] = ['M5 13l4 4L19 7']
export const COPY: readonly string[] = ['M9 9h10v10H9z', 'M15 9V5H5v10h4']
export const SEARCH: readonly string[] = [
  'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z',
  'M20 20l-3.5-3.5',
]
export const CLOSE: readonly string[] = ['M6 6l12 12', 'M18 6L6 18']

/** The reference's `ICONS` export, beside its components. */
export const ICONS = { TICK, CLOSE, COPY, SEARCH } as const

/** InverseSurface's warning mark. */
export const WARN: readonly string[] = ['M12 4l9 16H3z', 'M12 10v4', 'M12 17v.01']

/** The house in the rail's mark. */
export const MARK: readonly string[] = ['M4 19V9.5L12 4l8 5.5V19', 'M9.5 19v-6h5v6']

export type RailIcon = 'queue' | 'fleet' | 'health' | 'settings'

export const RAIL_ICONS: Readonly<Record<RailIcon, readonly string[]>> = {
  queue: ['M4 13h4.5l1.5 2.5h4l1.5-2.5H20', 'M6 5h12l2 8v6H4v-6z'],
  fleet: [
    'M4 4.5h6.5V11H4z',
    'M13.5 4.5H20V11h-6.5z',
    'M4 13.5h6.5V20H4z',
    'M13.5 13.5H20V20h-6.5z',
  ],
  health: ['M3 12.5h4l2.5-6 5 11 2.5-5H21'],
  settings: [
    'M4 7h9',
    'M17 7h3',
    'M4 17h3',
    'M11 17h9',
    'M15 5.2a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6',
    'M9 15.2a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6',
  ],
}

/**
 * BOTH REFERENCES' `icon(d, size, stroke, width)`, attribute for attribute — attribute order IS
 * markup to the parity test: a stroked 24×24 glyph, `aria-hidden`, that never shrinks. The admin
 * drawing's own `icon(d, size)` is this with the stroke and width left at their defaults.
 */
export function Icon({
  paths,
  size,
  stroke = 'currentColor',
  width = 2,
}: {
  paths: readonly string[]
  size: number
  stroke?: string
  width?: number
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  )
}
