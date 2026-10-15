/**
 * THE CONSOLE'S LOOK — the drawing's components, ported to TSX and held markup-identical to their
 * references by `parity.test.tsx` (Decision 4): the six of `design/system/components/bundle.js` the
 * operations surface composes, and the fourteen of `design/admin/components.js`. Every screen draws
 * with these; a component's markup changes here and in the drawing, and the parity test says so.
 */
export { Button, type ButtonKind, type ButtonProps } from './Button'
export { Choice, type ChoiceOption, type ChoiceProps } from './Choice'
export { InverseSurface, type InverseSurfaceProps } from './InverseSurface'
export {
  SegmentedControl,
  type Segment,
  type SegmentedControlProps,
} from './SegmentedControl'
export { StateChip, type StateChipProps } from './StateChip'
export { TwoFacts, type Fact, type FactTone, type TwoFactsProps } from './TwoFacts'

export { ConsoleRail, type ConsoleRailProps, type RailItem } from './ConsoleRail'
export { DataTable, type DataColumn, type DataTableProps } from './DataTable'
export { DiffView, type DiffViewProps } from './DiffView'
export { EnvCell, type EnvCellProps } from './EnvCell'
export { EventLine, type EventLineProps } from './EventLine'
export { FactList, type FactListProps, type FactRow } from './FactList'
export { FilterBar, type Facet, type FilterBarProps } from './FilterBar'
export { MachineValue, type MachineValueProps } from './MachineValue'
export {
  ObservedAction,
  type ObservedActionButton,
  type ObservedActionPreview,
  type ObservedActionProps,
} from './ObservedAction'
export {
  QueueRow,
  type QueueRowItem,
  type QueueRowMeta,
  type QueueRowProps,
} from './QueueRow'
export { RawChip, type RawChipProps } from './RawChip'
export { SettingRow, type SettingRowProps } from './SettingRow'
export { Tags, type Tag, type TagsProps } from './Tags'
export { WaitHeadline, type WaitHeadlineProps } from './WaitHeadline'

export { ICONS, type RailIcon } from './icons'
export { shorten, stateOf, type State } from './state-of'
