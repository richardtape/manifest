/**
 * Manifest design system — component types, as documentation.
 * Mount from the global: `window.Manifest.StateChip`, or `x-import` by name.
 * Load order in a consuming page: tokens.css, bundle.css, React 18, bundle.js.
 */

/** The five states. Every status in the product is one of these and no others. */
export type State = 'working' | 'waiting' | 'attention' | 'steady' | 'notyet';

/** Tints available to a block that carries a state. */
export type Tone = 'steady' | 'attention' | 'working' | 'neutral';

export interface StateChipProps {
  state: State;
  /** Working states name a duration here: "Working, a few minutes". */
  label: string;
  /** Defaults to true for `working` and `attention`, false for the rest. Never pulse a wait measured in weeks. */
  pulse?: boolean;
  className?: string;
}
export declare function StateChip(props: StateChipProps): JSX.Element;

export interface Step {
  text: string;
  note?: string;
  /** `done` ticks, `now` pulses, `next` is dimmed, `halted` is a filled red mark with no tick. */
  state?: 'done' | 'now' | 'next' | 'halted';
}
export interface LiveStepsProps { steps: Step[]; className?: string }
/** A vertical list of work being done: 5–8 steps, minutes. Renders an <ol>. */
export declare function LiveSteps(props: LiveStepsProps): JSX.Element;

export interface Station { label: string; note?: string; state?: 'done' | 'now' | 'next' | 'halted' }
export interface TimelineProps { stations: Station[]; className?: string }
/** A horizontal run with a known end: 3–5 stations, under two minutes. Past five, use LiveSteps. */
export declare function Timeline(props: TimelineProps): JSX.Element;

export interface ProgressBarProps {
  /** `clock` is the hatched, unstarted, never-animated bar for a wait measured in weeks. */
  kind?: 'working' | 'done' | 'clock';
  /** 0–100. Ignored by `clock`, which is never partly full. */
  value?: number;
  label?: string;
  meta?: string;
  className?: string;
}
export declare function ProgressBar(props: ProgressBarProps): JSX.Element;

export interface Fact { overline: string; title: string; note?: string; tone?: Tone }
export interface TwoFactsProps {
  /** What people currently get. Always the left cell. */
  serving: Fact;
  /** What the last attempt did. Takes the tint its outcome earns. */
  attempt: Fact;
  /** Pass null to drop the footnote. Keeping it is strongly preferred. */
  foot?: string | null;
  className?: string;
}
export declare function TwoFacts(props: TwoFactsProps): JSX.Element;

export interface ClockItemProps {
  title: string;
  body: string;
  chip?: string;
  clockLabel?: string;
  clockMeta?: string;
  /** The honest admission, when the platform cannot track the item itself. */
  admissionTitle?: string;
  admissionBody?: string;
  action?: string;
  actionHref?: string;
  className?: string;
}
export declare function ClockItem(props: ClockItemProps): JSX.Element;

export interface ButtonProps {
  kind?: 'primary' | 'secondary' | 'tertiary' | 'danger' | 'ghostDanger';
  size?: 'sm';
  /** Renders an <a> instead of a <button>. */
  href?: string;
  disabled?: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}
export declare function Button(props: ButtonProps): JSX.Element;

export interface CardProps {
  tone?: 'plain' | 'working' | 'waiting' | 'steady' | 'attention';
  title?: string;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}
export declare function Card(props: CardProps): JSX.Element;

export interface FieldMessage {
  tone: Tone;
  /** The platform's own `message`. Never rewrite it. */
  title: string;
  /** The platform's own `hint`. */
  body?: string;
}
export interface FormFieldProps {
  label: string;
  hint?: string;
  value?: string;
  placeholder?: string;
  mono?: boolean;
  id?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  message?: FieldMessage;
  className?: string;
}
export declare function FormField(props: FormFieldProps): JSX.Element;

export interface AppBarProps { name?: string; org?: string; user?: string; children?: React.ReactNode; className?: string }
export declare function AppBar(props: AppBarProps): JSX.Element;

export interface ProjectBarProps {
  title: string;
  meta?: string;
  tabs?: Array<string | { label: string; href?: string }>;
  active?: string;
  className?: string;
}
export declare function ProjectBar(props: ProjectBarProps): JSX.Element;

export interface InverseSurfaceProps {
  title?: string;
  body?: string;
  /** A mono inset: a key, a code block. Selectable in full. */
  inset?: string;
  /** Shows the warning mark. Used once in the product, above a one-time key. */
  warn?: boolean;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}
export declare function InverseSurface(props: InverseSurfaceProps): JSX.Element;

export interface LogPaneProps {
  lines: string[];
  /** How many lines were already stored when the view opened; those render muted. */
  writtenBefore?: number;
  className?: string;
  style?: React.CSSProperties;
}
export declare function LogPane(props: LogPaneProps): JSX.Element;

export interface SpeculativeBannerProps { tag?: string; children?: React.ReactNode; className?: string }
/** Means one thing: no API exists for this screen. Never "unfinished". */
export declare function SpeculativeBanner(props: SpeculativeBannerProps): JSX.Element;

export interface BrowserFrameProps {
  url: string;
  phone?: boolean;
  secure?: boolean;
  caption?: string;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}
export declare function BrowserFrame(props: BrowserFrameProps): JSX.Element;

export interface SegmentedControlProps {
  options: Array<string | { label: string; value: string }>;
  value: string;
  onChange?: (value: string) => void;
  /** `tablist` when it switches panels, `radiogroup` when it sets a value. */
  role?: 'tablist' | 'radiogroup';
  className?: string;
}
export declare function SegmentedControl(props: SegmentedControlProps): JSX.Element;

export interface ChoiceOption { title: string; note?: string; value: string; checked?: boolean }
export interface ChoiceProps {
  type?: 'radio' | 'checkbox';
  name?: string;
  label?: string;
  options: ChoiceOption[];
  /** Radio only. Checkboxes carry `checked` per option. */
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
}
export declare function Choice(props: ChoiceProps): JSX.Element;

export interface LockedRowProps { label?: string; children?: React.ReactNode; className?: string }
/** For a capability that can NEVER be granted. Not an unticked checkbox — that would say "not yet". */
export declare function LockedRow(props: LockedRowProps): JSX.Element;

export interface NavItem {
  label: string;
  href?: string;
  /** One of: apps, overview, preview, talk, live, people, agent, plus. */
  icon?: string;
}
export interface SideNavProps {
  /** The `label` of the item you are on. Matching is by label, so labels are unique. */
  active?: string;
  name?: string;
  org?: string;
  homeLabel?: string;
  homeHref?: string;
  /** Pass null to drop the create action. */
  newLabel?: string | null;
  newHref?: string;
  /** The open project's name, shown as an overline above its section. */
  projectName?: string;
  /** The project's sections. Six at most — past that something belongs inside another screen. */
  items?: NavItem[];
  user?: string;
  signOutHref?: string;
  className?: string;
  style?: React.CSSProperties;
}
/** The product's whole navigation, in UBC blue, on every signed-in screen. Replaced AppBar. */
export declare function SideNav(props: SideNavProps): JSX.Element;
