import type { Schemas } from '@manifest/contract'
import * as f from './fixtures.js'
import { notWithTeam, sentDay, vancouverDay, vancouverNoon } from './launch.js'
import { assertAdminReason, MockRefusal, stepUpRefusal } from './refusal.js'
import { READY } from './script.js'
import type { Validate } from './validate.js'

/**
 * THE DEMO FLEET (P11's Tasks 3–4; the plan's Decision 2, Rich's of 2026-10-15): thirteen projects an
 * administrator meets, behind `MANIFEST_MOCK_FLEET=demo` — for the administrator's console, whose whole
 * subject is a fleet, against a mock that otherwise holds one project. **Off, nothing here is reached**:
 * `mock-app` and every default answer are what they were (`fleet.test.ts` holds them), because the
 * faculty front-end runs this mock from our working tree.
 *
 * TWO RULES, BOTH THE REVIEW'S (I3, I6):
 *
 * - **EVERY STATE IS ONE THE PLATFORM CAN REACH** at the contract on `main` (`1.9.0`; the rules P11's
 *   Task 1 read into `spikes/p11-baseline/`, `[M9]`): only a `class` app launches, and runs its set of
 *   two; a release with fixable findings exists only on a stale scan, beside an unmet `scans` item;
 *   UBC's order holds beside every record; a submission is stamped at Vancouver noon of its day; a
 *   member that exits is replaced as a whole set (the set it leaves retired), or, past three in an
 *   hour, left in the set `failed` while the rest serve. `fleet.test.ts` reads each back through the
 *   API, never from the input below.
 * - **EVERY OBJECT IS SPREAD FROM ITS VALIDATED FIXTURE** — `{ ...f.RELEASE, id, … }` — overriding only
 *   ids, names, times, states and the story's own fields, so each inherits the shape the document
 *   checks; and every answer still passes the server's validator on its way out, so a fleet object that
 *   drifts is a `500` naming the schema, not a plausible lie.
 *
 * **AN ADMINISTRATOR'S DECISIONS ARE KEPT** (Task 4): a release signed off on a stored preview, a
 * record submitted, handed back or answered as UBC answered it, an agent's question refused — each body
 * validated against its operation's request schema first (C1), each refused in the platform's order and
 * words, each written as the platform writes it, and each announced on the project's stream. The queue,
 * the checklist and the fleet row are derived from what is kept, so a decision moves them as it does on
 * the platform.
 *
 * Its state lives in the object `createFleet` returns — one per server, never a module global — and a
 * restart is the reset. Every time is `t0 − age`, t0 being the server's creation, except what the
 * platform stamps itself (a submission's Vancouver noon). The sentences are the platform's, copied from
 * the code that writes them (`launch/queue.ts`, `launch/records.ts`, `launch/readiness.ts`,
 * `releases/watch.ts`, `releases/release.ts`, `observability/incidents.ts`).
 */

type Level = 'low' | 'medium' | 'high' | 'very-high'
type Environment = Schemas['Environment']
type EnvironmentKind = Environment['kind']
type Instance = Schemas['Instance']
type Incident = Schemas['IncidentList']['incidents'][number]
type Release = Schemas['Release']
type Registration = Schemas['IamRegistration']
type Assessment = Schemas['PrivacyAssessment']
type Item = Schemas['LaunchReadinessItem']
type EventFrame = Schemas['EventFrame']
type QueueItem = Schemas['QueueItem']

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
/** An age: so many days, hours and minutes before t0. */
const d = (days: number, hours = 0, minutes = 0): number =>
  days * DAY + hours * HOUR + minutes * MINUTE

/** What each fleet id names — the first group of the UUID, after `f1ee7`. */
export const KIND = {
  project: 0x001,
  environment: 0x002,
  instance: 0x003,
  release: 0x004,
  build: 0x005,
  incident: 0x006,
  registration: 0x007,
  assessment: 0x008,
  request: 0x009,
  token: 0x00a,
  pendingAction: 0x00b,
  event: 0x00c,
  person: 0x00d,
  appSpec: 0x00e,
  rehearsal: 0x00f,
  approval: 0x010,
  preview: 0x011,
} as const

/**
 * A VALID UUID THAT COLLIDES WITH NO FIXTURE (the design's T4): every fixture id is a repeated digit or
 * letter, and every one of these begins `f1ee7`. `fleet.test.ts` walks the fixtures to say so.
 */
export const fleetId = (kind: number, project: number, k: number): string =>
  `f1ee7${kind.toString(16).padStart(3, '0')}-${String(project).padStart(4, '0')}-4${String(k).padStart(3, '0')}-8000-000000000000`

/** Hex of a length, unique per project and k — an image digest's or a commit's. */
const hexOf = (project: number, k: number, length: number, fill: string): string =>
  `f1ee7${String(project).padStart(4, '0')}${String(k).padStart(3, '0')}`.padEnd(
    length,
    fill,
  )

const iso = (t: number): string => new Date(t).toISOString()
/** *"October 12, 2026"* — the platform's `vancouverDayInWords`. */
const dayInWords = (at: string): string =>
  new Intl.DateTimeFormat('en-CA', {
    dateStyle: 'long',
    timeZone: 'America/Vancouver',
  }).format(new Date(at))
/** `HH:MM:SS` in UTC — the set watcher's `to_char(…, 'HH24:MI:SS')`. */
const clock = (at: string): string => at.slice(11, 19)

// ─── The people ───

interface Person {
  id: string
  displayName: string
  email: string
  puid: string
  cwlLogin: string
}

/** `reading-responses`' owner is the fixtures' instructor, on purpose: people are not what T4 is about. */
const INSTRUCTOR: Person = {
  id: f.USER_ID,
  displayName: f.ME.displayName,
  email: f.ME.email,
  puid: f.ME.puid,
  cwlLogin: 'instructor',
}
const OPERATOR = { id: f.OPERATOR_ID, displayName: f.OPERATOR_ME.displayName }

const person = (n: number, displayName: string, cwlLogin: string): Person => ({
  id: fleetId(KIND.person, 0, n),
  displayName,
  email: `${cwlLogin}@example.test`,
  puid: `fac${String(n).padStart(6, '0')}`,
  cwlLogin,
})

const PEOPLE = {
  silva: person(1, 'Dr. Mateo Silva', 'msilva'),
  lee: person(2, 'Jordan Lee', 'jlee'),
  raman: person(3, 'Dr. Priya Raman', 'praman'),
  kobayashi: person(4, 'Dr. Hana Kobayashi', 'hkobayashi'),
  park: person(5, 'Leo Park', 'lpark'),
  whitfield: person(6, 'Sam Whitfield', 'swhitfield'),
  karim: person(7, 'Dr. Ayesha Karim', 'akarim'),
  novak: person(8, 'Dr. Gregor Novak', 'gnovak'),
  haddad: person(9, 'Dr. Samir Haddad', 'shaddad'),
  moreno: person(10, 'Dr. Lucia Moreno', 'lmoreno'),
  price: person(11, 'Dr. Owen Price', 'oprice'),
  tanaka: person(12, 'Dr. Aiko Tanaka', 'atanaka'),
  rivera: person(13, 'Tomás Rivera', 'trivera'),
  chen: person(14, 'Mei Chen', 'mchen'),
  aziz: person(15, 'Noor Aziz', 'naziz'),
}

// ─── The table: one compact row per project ───

/** A record's story in ages: sent by its owner, submitted by the team on a day, answered by UBC. */
interface Story {
  /** When its owner sent it to the Manifest team. */
  sent: number
  /** How many Vancouver days ago the team submitted it — its stamp is that day's noon. */
  submitted?: number
  ref?: string
  /** When UBC's answer — approved, or registered `active` — was recorded. */
  answered?: number
}

interface RegistrationStory extends Story {
  /** The certificate's expiry UBC registered, in days from t0, when the story is about it. */
  certExpiresIn?: number
  /** A change to the live registration: with the team (`sent`), or filed with UBC IAM (`filed` days ago). */
  change?: { sent: number; filed?: number; ref?: string }
  /** The package names an attribute the app does not read (a draft's warning, sent anyway). */
  unread?: string
}

interface ReleaseRow {
  ago: number
  summary: string
  level?: Level
  models?: string[]
  egress?: string[]
  /** Built against a vulnerability database past seven days: one fixable finding, recorded, not blocked. */
  stale?: true
}

interface Exit {
  ago: number
  /** Seconds before its replacement set started (the watcher's back-off), or `null`: replacing stopped. */
  replacedAfter: number | null
}

interface Row {
  n: number
  slug: string
  name: string
  owner: Person
  collaborator?: Person
  audience: Pick<Schemas['Audience'], 'scale' | 'burst' | 'justification'>
  level: Level
  models: string[]
  /** What the app's sign-in asks for; the three every fixture registers unless the story adds one. */
  attributes?: string[]
  created: number
  archived?: number
  /** Oldest first, numbered from 1. */
  releases: ReleaseRow[]
  sandbox?: { release: number; ago: number }
  /** `failed`: its first deploy never became healthy, so nothing has ever served staging. */
  staging?: { release: number; ago: number; failed?: true }
  production?: {
    release: number
    launched: number
    /** The first launch's sign-off: asked, then approved by Operator One. */
    asked: number
    approved: number
    exits?: Exit[]
  }
  assessment?: Story
  stagingRegistration?: RegistrationStory
  productionRegistration?: RegistrationStory
  rehearsal?: { release: number; ago: number }
  /** The OPEN sign-off request, the queue's `release-approval`. */
  request?: { release: number; ago: number; viaToken: boolean; note: string | null }
  token?: { name: string; mintedBy: Person; ago: number }
  pendingAction?: { ago: number; lapsesIn: number; cwlLogin: string }
  renamed?: { from: string; ago: number; reason: string }
}

const ATTRIBUTES = ['ubcEduCwlPuid', 'mail', 'givenName']
const CAPABLE = 'default-chat-large'
const ON_PREMISE = 'default-chat-onprem'

const ROWS: readonly Row[] = [
  {
    n: 1,
    slug: 'reading-responses',
    name: 'Reading responses',
    owner: INSTRUCTOR,
    collaborator: PEOPLE.rivera,
    audience: {
      scale: 'class',
      burst: 'synchronised',
      justification: 'one lecture of 180, all answering in the same ten minutes',
    },
    level: 'high',
    models: [ON_PREMISE],
    created: d(60),
    releases: [
      { ago: d(58), summary: 'first release' },
      { ago: d(12), summary: 'the week’s readings, one page each' },
      {
        ago: d(4),
        summary: 'answers are checked against the course’s reading service',
        models: [ON_PREMISE, CAPABLE],
        egress: ['readings.library.example.test'],
      },
    ],
    sandbox: { release: 3, ago: d(3, 6) },
    staging: { release: 3, ago: d(3, 5) },
    production: { release: 2, launched: d(9), asked: d(10), approved: d(9, 3) },
    assessment: { sent: d(30), submitted: 29, ref: 'PIA-2026-0141', answered: d(20) },
    stagingRegistration: {
      sent: d(19),
      submitted: 18,
      ref: 'IAM-2026-0598',
      answered: d(15),
    },
    productionRegistration: {
      sent: d(14),
      submitted: 13,
      ref: 'IAM-2026-0610',
      answered: d(11),
    },
    rehearsal: { release: 2, ago: d(10, 2) },
    request: {
      release: 3,
      ago: d(3, 4),
      viaToken: true,
      note: 'The class starts on Monday — the egress change is the only new thing.',
    },
    token: { name: f.TOKEN.name, mintedBy: INSTRUCTOR, ago: d(20) },
  },
  {
    n: 2,
    slug: 'chem-lab-booking',
    name: 'Chem lab booking',
    owner: PEOPLE.silva,
    audience: {
      scale: 'class',
      burst: 'steady',
      justification: 'two lab sections, booking through the week',
    },
    level: 'medium',
    models: ['default-chat'],
    created: d(45),
    releases: [
      { ago: d(40), summary: 'first release' },
      { ago: d(2), summary: 'the booking form, ready for the first lab' },
    ],
    sandbox: { release: 2, ago: d(1, 23) },
    staging: { release: 2, ago: d(1, 20) },
    assessment: { sent: d(25), submitted: 24, ref: 'PIA-2026-0152', answered: d(15) },
    stagingRegistration: {
      sent: d(14),
      submitted: 13,
      ref: 'IAM-2026-0601',
      answered: d(10),
    },
    productionRegistration: {
      sent: d(9),
      submitted: 8,
      ref: 'IAM-2026-0615',
      answered: d(5),
    },
    rehearsal: { release: 2, ago: d(1) },
    request: { release: 2, ago: d(0, 19), viaToken: false, note: null },
  },
  {
    n: 3,
    slug: 'phys-101-labs',
    name: 'Physics 101 labs',
    owner: PEOPLE.lee,
    audience: { scale: 'class', burst: 'steady', justification: 'one section of 120' },
    level: 'medium',
    models: ['default-chat'],
    attributes: [...ATTRIBUTES, 'sn'],
    created: d(50),
    releases: [
      { ago: d(30), summary: 'first release' },
      { ago: d(6), summary: 'lab reports by group' },
    ],
    sandbox: { release: 2, ago: d(5, 2) },
    staging: { release: 2, ago: d(5) },
    assessment: { sent: d(28), submitted: 27, ref: 'PIA-2026-0147', answered: d(18) },
    stagingRegistration: {
      sent: d(17),
      submitted: 16,
      ref: 'IAM-2026-0603',
      answered: d(12),
    },
    productionRegistration: { sent: d(1, 2), unread: 'sn' },
  },
  {
    n: 4,
    slug: 'math-oh-queue',
    name: 'Math office-hours queue',
    owner: PEOPLE.raman,
    audience: {
      scale: 'class',
      burst: 'synchronised',
      justification: 'the whole class joins the queue when office hours open',
    },
    level: 'medium',
    models: ['default-chat'],
    created: d(70),
    releases: [
      { ago: d(65), summary: 'first release' },
      { ago: d(17), summary: 'the queue shows who is next' },
    ],
    sandbox: { release: 2, ago: d(16, 4) },
    staging: { release: 2, ago: d(16, 2) },
    production: { release: 2, launched: d(15), asked: d(16), approved: d(15, 2) },
    assessment: { sent: d(50), submitted: 49, ref: 'PIA-2026-0129', answered: d(40) },
    stagingRegistration: {
      sent: d(38),
      submitted: 37,
      ref: 'IAM-2026-0571',
      answered: d(33),
    },
    productionRegistration: {
      sent: d(30),
      submitted: 29,
      ref: 'IAM-2026-0580',
      answered: d(22),
      certExpiresIn: 11,
      change: { sent: d(2, 7) },
    },
    rehearsal: { release: 2, ago: d(16, 1) },
    token: { name: 'office-hours helper', mintedBy: PEOPLE.raman, ago: d(30) },
  },
  {
    n: 5,
    slug: 'rubric-helper',
    name: 'Rubric helper',
    owner: PEOPLE.kobayashi,
    audience: { scale: 'class', burst: 'steady', justification: 'one seminar of 40' },
    level: 'medium',
    models: ['default-chat'],
    created: d(20),
    releases: [{ ago: d(3), summary: 'first release' }],
    sandbox: { release: 1, ago: d(2, 23) },
    staging: { release: 1, ago: d(0, 2, 10), failed: true },
    assessment: { sent: d(0, 5) },
  },
  {
    n: 6,
    slug: 'stats-sim',
    name: 'Stats simulator',
    owner: PEOPLE.park,
    audience: { scale: 'class', burst: 'steady', justification: 'one section of 60' },
    level: 'low',
    models: ['default-chat'],
    created: d(40),
    releases: [{ ago: d(8), summary: 'first release', stale: true }],
    sandbox: { release: 1, ago: d(7, 22) },
    staging: { release: 1, ago: d(7, 20) },
    assessment: { sent: d(20), submitted: 19, ref: 'PIA-2026-0160', answered: d(9) },
    stagingRegistration: { sent: d(5), submitted: 4, ref: 'IAM-2026-0511' },
  },
  {
    n: 7,
    slug: 'lang-202-journal',
    name: 'Language 202 journal',
    owner: PEOPLE.whitfield,
    audience: { scale: 'class', burst: 'steady', justification: 'two sections of 30' },
    level: 'medium',
    models: ['default-chat'],
    created: d(90),
    releases: [
      { ago: d(85), summary: 'first release' },
      { ago: d(32), summary: 'entries by week' },
    ],
    sandbox: { release: 2, ago: d(31, 6) },
    staging: { release: 2, ago: d(31, 4) },
    production: { release: 2, launched: d(30), asked: d(31), approved: d(30, 2) },
    assessment: { sent: d(70), submitted: 69, ref: 'PIA-2026-0102', answered: d(60) },
    stagingRegistration: {
      sent: d(58),
      submitted: 57,
      ref: 'IAM-2026-0520',
      answered: d(52),
    },
    productionRegistration: {
      sent: d(50),
      submitted: 49,
      ref: 'IAM-2026-0533',
      answered: d(40),
      change: { sent: d(23), filed: 21, ref: 'IAM-2026-0590' },
    },
    rehearsal: { release: 2, ago: d(31, 2) },
  },
  {
    n: 8,
    slug: 'field-notes',
    name: 'Field notes',
    owner: PEOPLE.karim,
    audience: { scale: 'solo', burst: 'steady', justification: 'my own field notes' },
    level: 'high',
    models: [ON_PREMISE],
    created: d(35),
    releases: [{ ago: d(26), summary: 'first release' }],
    sandbox: { release: 1, ago: d(25, 22) },
    staging: { release: 1, ago: d(25, 20) },
    assessment: { sent: d(24), submitted: 23, ref: 'PIA-2026-0118' },
  },
  {
    n: 9,
    slug: 'cpsc-110-help',
    name: 'CPSC 110 help',
    owner: PEOPLE.novak,
    collaborator: PEOPLE.chen,
    audience: {
      scale: 'class',
      burst: 'synchronised',
      justification: 'the night before each problem set is due',
    },
    level: 'high',
    models: [ON_PREMISE],
    created: d(80),
    releases: [
      { ago: d(75), summary: 'first release' },
      { ago: d(22), summary: 'hints by problem set' },
    ],
    sandbox: { release: 2, ago: d(21, 6) },
    staging: { release: 2, ago: d(21, 4) },
    production: {
      release: 2,
      launched: d(20),
      asked: d(21),
      approved: d(20, 2),
      exits: [{ ago: d(0, 2), replacedAfter: 0 }],
    },
    assessment: { sent: d(60), submitted: 59, ref: 'PIA-2026-0110', answered: d(50) },
    stagingRegistration: {
      sent: d(48),
      submitted: 47,
      ref: 'IAM-2026-0540',
      answered: d(42),
    },
    productionRegistration: {
      sent: d(40),
      submitted: 39,
      ref: 'IAM-2026-0552',
      answered: d(30),
    },
    rehearsal: { release: 2, ago: d(21, 2) },
  },
  {
    n: 10,
    slug: 'econ-101-polls',
    name: 'Econ 101 polls',
    owner: PEOPLE.haddad,
    audience: { scale: 'class', burst: 'steady', justification: 'one lecture of 200' },
    level: 'low',
    models: ['default-chat'],
    created: d(55),
    releases: [
      { ago: d(50), summary: 'first release' },
      { ago: d(13), summary: 'polls close on a timer' },
    ],
    sandbox: { release: 2, ago: d(12, 8) },
    staging: { release: 2, ago: d(12, 6) },
    production: {
      release: 2,
      launched: d(12),
      asked: d(12, 3),
      approved: d(12, 2),
      // AT ONCE, THEN A MINUTE, THEN FOUR (the watcher's back-off) — and the fourth exit in the hour
      // stops replacing (`releases/watch.ts`).
      exits: [
        { ago: d(0, 0, 52), replacedAfter: 0 },
        { ago: d(0, 0, 50), replacedAfter: 60 },
        { ago: d(0, 0, 46), replacedAfter: 240 },
        { ago: d(0, 0, 40), replacedAfter: null },
      ],
    },
    assessment: { sent: d(40), submitted: 39, ref: 'PIA-2026-0124', answered: d(30) },
    stagingRegistration: {
      sent: d(28),
      submitted: 27,
      ref: 'IAM-2026-0562',
      answered: d(22),
    },
    productionRegistration: {
      sent: d(20),
      submitted: 19,
      ref: 'IAM-2026-0575',
      answered: d(14),
    },
    rehearsal: { release: 2, ago: d(12, 4) },
  },
  {
    n: 11,
    slug: 'bio-201-scheduler',
    name: 'Bio 201 scheduler',
    owner: PEOPLE.moreno,
    collaborator: PEOPLE.aziz,
    audience: {
      scale: 'class',
      burst: 'steady',
      justification: 'twelve lab groups of six',
    },
    level: 'high',
    models: [ON_PREMISE],
    created: d(100),
    releases: [
      { ago: d(40), summary: 'lab groups and their slots' },
      // THE NEWEST RAISES THE LEVEL AND SERVES NOWHERE YET (M2): serving and newest differ.
      { ago: d(1), summary: 'keeps each group’s health notes', level: 'very-high' },
    ],
    sandbox: { release: 1, ago: d(39, 6) },
    staging: { release: 1, ago: d(39, 4) },
    production: { release: 1, launched: d(35), asked: d(36), approved: d(35, 2) },
    assessment: { sent: d(80), submitted: 79, ref: 'PIA-2026-0095', answered: d(70) },
    stagingRegistration: {
      sent: d(68),
      submitted: 67,
      ref: 'IAM-2026-0505',
      answered: d(62),
    },
    productionRegistration: {
      sent: d(60),
      submitted: 59,
      ref: 'IAM-2026-0517',
      answered: d(50),
      certExpiresIn: 60,
    },
    rehearsal: { release: 1, ago: d(36, 2) },
    token: { name: 'lab-group agent', mintedBy: PEOPLE.aziz, ago: d(5) },
    pendingAction: { ago: d(0, 3), lapsesIn: 21 * HOUR, cwlLogin: 'dpatel' },
    renamed: {
      from: 'BIOL 200 scheduler',
      ago: d(2),
      reason: 'The course code changed this term — the department asked.',
    },
  },
  {
    n: 12,
    slug: 'hist-105-archive',
    name: 'History 105 archive',
    owner: PEOPLE.price,
    audience: { scale: 'class', burst: 'steady', justification: 'last year’s section' },
    level: 'medium',
    models: ['default-chat'],
    created: d(120),
    archived: d(10),
    releases: [],
  },
  {
    n: 13,
    slug: 'mus-100-listening',
    name: 'Music 100 listening',
    owner: PEOPLE.tanaka,
    audience: {
      scale: 'large_course',
      burst: 'steady',
      justification: 'every section of Music 100, about 900 students',
    },
    level: 'low',
    models: ['default-chat'],
    created: d(25),
    releases: [{ ago: d(6), summary: 'first release' }],
    sandbox: { release: 1, ago: d(5, 22) },
    staging: { release: 1, ago: d(5, 20) },
    assessment: { sent: d(20), submitted: 19, ref: 'PIA-2026-0171', answered: d(12) },
    stagingRegistration: {
      sent: d(11),
      submitted: 10,
      ref: 'IAM-2026-0620',
      answered: d(8),
    },
    productionRegistration: {
      sent: d(7),
      submitted: 6,
      ref: 'IAM-2026-0624',
      answered: d(3),
    },
    rehearsal: { release: 1, ago: d(2) },
  },
]

/** Every project of the demo fleet, by slug and id — for tests. */
export const FLEET_PROJECTS: readonly { slug: string; id: string }[] = ROWS.map(
  (row) => ({
    slug: row.slug,
    id: fleetId(KIND.project, row.n, 0),
  }),
)

// ─── The fleet, built ───

export interface FleetContext {
  now: number
  query: URLSearchParams
  steppedUp: boolean
  stepUpRequired: boolean
  actor: { id: string; displayName: string }
  adminReason: string | null
  /** The server's validator — every request body the fleet acts on is held to its operation's schema. */
  validate: Validate
}

export interface FleetAnswer {
  status: number
  schema: string
  body: unknown
}

export interface Fleet {
  /** The server's creation, to the second: every fleet time is relative to it. */
  readonly t0: number
  readonly ids: Record<
    | 'projectId'
    | 'environmentId'
    | 'instanceId'
    | 'releaseId'
    | 'previewId'
    | 'pendingActionId'
    | 'tokenId',
    string[]
  >
  fleetRows(): Schemas['Fleet']
  queueItems(): QueueItem[]
  /** Whether a request names a fleet id — and is so the fleet's to answer, §26's reason included. */
  holds(params: Record<string, string>): boolean
  /** An answer for a fleet id, or undefined when the request names none (the fixtures answer it). */
  answer(
    operationId: string,
    params: Record<string, string>,
    body: unknown,
    ctx: FleetContext,
  ): FleetAnswer | undefined
  events(projectId: string): EventFrame[]
  onEvent(projectId: string, listener: (frame: EventFrame) => void): () => void
}

interface EnvironmentState {
  environment: Omit<Environment, 'instance' | 'instances'>
  /** Every instance ever made here, in the order made. */
  instances: Instance[]
  /** The members the hostname's route reaches (§11's route rows, A1's set). */
  routes: string[]
  /** Newest first. */
  incidents: Incident[]
}

interface Request {
  id: string
  releaseId: string
  requestedBy: Person
  viaToken: { id: string; name: string } | null
  createdAt: string
  note: string | null
}

interface ProjectState {
  row: Row
  project: Schemas['Project']
  environments: Record<EnvironmentKind, EnvironmentState>
  /** Oldest first. */
  releases: Release[]
  records: Schemas['LaunchRecords']
  /** The newest rehearsal, which passed. */
  rehearsal: { releaseId: string; ranAt: string } | null
  request: Request | null
  members: Schemas['MemberList']
  tokens: Schemas['TokenList']
  pendingActions: Schemas['PendingActionList']
  /** Oldest first. */
  events: EventFrame[]
  /** Every decision on its releases, oldest first — the history's, then an administrator's here. */
  approvals: Schemas['Approval'][]
  /** Every preview taken, the history's included. */
  previews: Schemas['ApprovalPreview'][]
  /** The last `k` of each id a decision mints, so the next is unique. */
  counters: { event: number; approval: number; preview: number }
}

export function createFleet(t0: number): Fleet {
  const at = (ago: number): string => iso(t0 - ago)
  const noonDaysAgo = (days: number): string =>
    vancouverNoon(vancouverDay(new Date(t0 - days * DAY))).toISOString()

  const projects = ROWS.map((row) => build(row))
  const byProject = new Map(projects.map((p) => [p.project.id, p]))
  const owners = {
    environmentId: new Map<string, ProjectState>(),
    instanceId: new Map<string, ProjectState>(),
    releaseId: new Map<string, ProjectState>(),
    pendingActionId: new Map<string, ProjectState>(),
    tokenId: new Map<string, ProjectState>(),
    previewId: new Map<string, ProjectState>(),
  }
  for (const p of projects) {
    for (const e of Object.values(p.environments)) {
      owners.environmentId.set(e.environment.id, p)
      for (const i of e.instances) owners.instanceId.set(i.id, p)
    }
    for (const r of p.releases) owners.releaseId.set(r.id, p)
    for (const a of p.pendingActions) owners.pendingActionId.set(a.id, p)
    for (const t of p.tokens) owners.tokenId.set(t.id, p)
  }
  const listeners = new Map<string, Set<(frame: EventFrame) => void>>()

  // THE HISTORY'S DECISIONS: each launched project's launch release, approved by Operator One on a
  // preview taken five minutes before — a first launch's, with nothing to compare. Their events are in
  // the history already; these are the rows `getApproval` and `getApprovalPreview` read.
  for (const p of projects) {
    const production = p.row.production
    if (production === undefined) continue
    const release = p.releases[production.release - 1]!
    const preview = takePreview(
      p,
      release,
      t0 - production.approved - 5 * MINUTE,
      OPERATOR,
    )
    keepDecision(
      p,
      release,
      preview,
      'approved',
      null,
      t0 - production.approved,
      OPERATOR,
    )
  }

  /** The project a request names, by any id it carries — or undefined: not the fleet's. */
  function named(params: Record<string, string>): ProjectState | undefined {
    for (const [name, value] of Object.entries(params)) {
      if (name === 'projectId') {
        const p = byProject.get(value)
        if (p !== undefined) return p
      }
      const owner = owners[name as keyof typeof owners]?.get(value)
      if (owner !== undefined) return owner
    }
    return undefined
  }

  // ─── One project, from its row ───

  function build(row: Row): ProjectState {
    const { n, slug, owner } = row
    const id = fleetId(KIND.project, n, 0)
    const ids = (kind: number, k: number) => fleetId(kind, n, k)
    const counters = { event: 0, instance: 0, incident: 0 }
    const events: EventFrame[] = []
    const by = (who: { displayName: string }, token: Request['viaToken'] = null) => ({
      name: who.displayName,
      asAdministrator: false,
      reason: null,
      token,
    })
    const event = (
      ago: number,
      type: EventFrame['type'],
      subject: string,
      machineDetail: Record<string, unknown>,
      humanMessage: string,
      actor: EventFrame['actor'],
    ): void => {
      events.push({
        kind: 'event',
        id: ids(KIND.event, ++counters.event),
        projectId: id,
        subject,
        type,
        humanMessage,
        machineDetail,
        createdAt: at(ago),
        actor,
      } as EventFrame)
    }

    const audience: Schemas['Audience'] = {
      ...f.AUDIENCE,
      ...row.audience,
      setBy: owner.id,
      setAt: at(row.created),
    }
    const project: Schemas['Project'] = {
      ...f.PROJECT,
      id,
      slug,
      name: row.name,
      owner: { id: owner.id, displayName: owner.displayName },
      audience,
      createdAt: at(row.created),
      launchedAt: row.production === undefined ? null : at(row.production.launched),
      state: row.archived === undefined ? 'active' : 'archived',
      archivedAt: row.archived === undefined ? null : at(row.archived),
      // A paid organisation's private repository, `main` protected — driver 2 as it should be.
      repository: {
        ...f.PROJECT.repository,
        fullName: `manifest-apps/${slug}`,
        webUrl: `https://github.com/manifest-apps/${slug}`,
        mainProtected: true,
        protectionDetail: null,
      },
    }
    event(
      row.created,
      'project.created',
      `project:${id}`,
      {
        slug,
        blueprint: project.blueprint,
        starter: project.starter,
        audience: { scale: audience.scale, burst: audience.burst },
      },
      `${slug} was created from ${project.blueprint}.`,
      by(owner),
    )
    const seed = hexOf(n, 0, 40, 'c')
    event(
      row.created - 1000,
      'repository.seeded',
      `project:${id}`,
      { commitSha: seed, files: 24, starter: project.starter },
      `The repository was seeded with the ${project.starter ?? 'skeleton'} starter.`,
      by(owner),
    )

    // ─── Releases, each built and scanned ───
    const attributes = row.attributes ?? ATTRIBUTES
    const releases = row.releases.map((r, i): Release => {
      const k = i + 1
      const level = r.level ?? row.level
      const config = {
        ...f.RELEASE.config.staging,
        classification: level,
        ai: { models: r.models ?? row.models },
        egressAllow: r.egress ?? [],
        auth: { provider: 'cwl' as const, attributes },
      }
      const commit = hexOf(n, k, 40, 'c')
      const buildId = ids(KIND.build, k)
      const digest = `sha256:${hexOf(n, k, 64, 'd')}`
      event(
        r.ago + 3 * MINUTE,
        'build.started',
        `build:${buildId}`,
        { buildId, commitSha: commit, blueprintRef: project.blueprint },
        `Building ${slug} at commit ${commit.slice(0, 7)}, started by ${owner.displayName}.`,
        by(owner),
      )
      event(
        r.ago + MINUTE,
        'build.succeeded',
        `build:${buildId}`,
        { buildId, imageDigest: digest, imageRepository: `127.0.0.1:7107/local/${slug}` },
        'The build succeeded and was scanned.',
        by(owner),
      )
      return {
        ...f.RELEASE,
        id: ids(KIND.release, k),
        projectId: id,
        buildId,
        appSpecId: ids(KIND.appSpec, k),
        imageDigest: digest,
        summary: r.summary,
        createdBy: owner.id,
        createdAt: at(r.ago),
        // A STALE DATABASE WARNS AT BUILD TIME AND DOES NOT BLOCK (§12), so a fixable finding is
        // recorded rather than refused — and leaves the checklist's `scans` unmet.
        scan:
          r.stale === true
            ? {
                ...f.SCAN,
                scannedAt: at(r.ago),
                databaseAgeDays: 9,
                stale: true,
                fixable: { critical: 0, high: 1 },
              }
            : { ...f.SCAN, scannedAt: at(r.ago) },
        config: { sandbox: config, staging: config, production: config },
      }
    })
    const releaseOf = (k: number): Release => {
      const release = releases[k - 1]
      if (release === undefined) throw new Error(`${slug} has no release ${k}`)
      return release
    }

    // ─── Environments, their instances and incidents ───
    const environmentState = (kind: EnvironmentKind, k: number): EnvironmentState => {
      const hostname =
        kind === 'production'
          ? `${slug}.manifest.internal`
          : `${slug}.${kind}.manifest.internal`
      return {
        environment: {
          id: ids(KIND.environment, k),
          projectId: id,
          kind,
          hostname,
          url: `https://${hostname}`,
        },
        instances: [],
        routes: [],
        incidents: [],
      }
    }
    const environments: Record<EnvironmentKind, EnvironmentState> = {
      sandbox: environmentState('sandbox', 1),
      staging: environmentState('staging', 2),
      production: environmentState('production', 3),
    }
    const newInstance = (
      e: EnvironmentState,
      release: Release,
      createdAgo: number,
      fields: Partial<Instance>,
    ): Instance => {
      const instance: Instance = {
        ...f.INSTANCE,
        id: ids(KIND.instance, ++counters.instance),
        environmentId: e.environment.id,
        releaseId: release.id,
        createdAt: at(createdAgo),
        ...fields,
      }
      e.instances.push(instance)
      return instance
    }
    /**
     * A DEPLOY THAT BECAME HEALTHY: its set (`members` of them) takes the route, and the set it
     * replaced is retired — `gone`, but a member that had already failed stays `failed` and listed.
     */
    const deploy = (
      kind: EnvironmentKind,
      release: Release,
      ago: number,
      members: number,
      actor: EventFrame['actor'],
    ): void => {
      const e = environments[kind]
      // THE RETIRE PASS CHANGES A MEMBER'S STATE AND NOTHING ELSE: `lastSeenAt` is written by the deploy
      // that starts an instance and by nothing after it (`releases/release.ts` is its one writer —
      // neither the health probes, the retire pass nor the set watcher touch it), so `Fleet.lastDeployAt`
      // (`max(lastSeenAt)`) is the newest deploy's, a replacement's included.
      for (const old of e.instances)
        if (e.routes.includes(old.id) && old.state !== 'failed') old.state = 'gone'
      e.routes = []
      for (let m = 0; m < members; m++) {
        const instance = newInstance(e, release, ago, {
          state: 'healthy',
          // When the deploy recorded it healthy (its `instance.healthy` event, below).
          lastSeenAt: at(ago - 20_000),
        })
        e.routes.push(instance.id)
        event(
          ago - 20_000,
          'instance.healthy',
          `instance:${instance.id}`,
          {
            instanceId: instance.id,
            releaseId: release.id,
            environmentId: e.environment.id,
            environment: kind,
            state: 'healthy',
          },
          `${slug} is running in ${kind}.`,
          actor,
        )
      }
    }

    // WHAT CAME BEFORE: every earlier release served the sandbox an hour after it was made, and staging
    // two — so each environment lists the instances its earlier deploys retired, as the platform's does.
    for (const [kind, after] of [
      ['sandbox', HOUR],
      ['staging', 2 * HOUR],
    ] as const)
      for (let k = 1; k < (row[kind]?.release ?? 1); k++)
        deploy(kind, releaseOf(k), row.releases[k - 1]!.ago - after, 1, by(owner))
    if (row.sandbox !== undefined)
      deploy('sandbox', releaseOf(row.sandbox.release), row.sandbox.ago, 1, by(owner))
    if (row.staging?.failed === true) {
      // ITS FIRST DEPLOY NEVER BECAME HEALTHY: no route was ever written, so the environment answers
      // with its newest instance — `failed` (`servingInstancesOf`'s fallback).
      const e = environments.staging
      const release = releaseOf(row.staging.release)
      const failed = newInstance(e, release, row.staging.ago, {
        state: 'failed',
        lastSeenAt: null,
      })
      const incidentId = ids(KIND.incident, ++counters.incident)
      const failedCheck = 'health: GET /healthz on port 3000 — connection refused'
      const incident: Incident = {
        ...f.INCIDENTS.incidents[0]!,
        id: incidentId,
        instanceId: failed.id,
        releaseId: release.id,
        exitReason: 'the process exited with code 1',
        logTail:
          "Error: Cannot find module './rubrics/default.json'\n    at Module._resolveFilename (node:internal/modules/cjs/loader:1225:15)\n",
        failedCheck,
        diffSinceHealthy:
          'This app has never been healthy in staging, so there is no working release to compare this one with.',
        createdAt: at(row.staging.ago - 90_000),
        cause: 'deploy',
        prompt: '',
      }
      incident.prompt = promptOf(incident, slug, 'staging')
      e.incidents.unshift(incident)
      event(
        row.staging.ago - 85_000,
        'instance.failed',
        `instance:${failed.id}`,
        {
          instanceId: failed.id,
          releaseId: release.id,
          environmentId: e.environment.id,
          environment: 'staging',
          state: 'failed',
          failedCheck,
        },
        `${slug} did not start in staging.`,
        by(owner),
      )
      event(
        row.staging.ago - 90_000,
        'incident.opened',
        `incident:${incidentId}`,
        {
          incidentId,
          instanceId: failed.id,
          releaseId: release.id,
          environment: 'staging',
        },
        `${slug} failed to start in staging. The incident records what it printed and what changed since it last worked.`,
        by(owner),
      )
    } else if (row.staging !== undefined)
      deploy('staging', releaseOf(row.staging.release), row.staging.ago, 1, by(owner))

    // ─── The records, in UBC's order ───
    const pia = row.assessment === undefined ? null : assessment(row.assessment)
    const staging =
      row.stagingRegistration === undefined
        ? null
        : registration('staging', row.stagingRegistration, 1)
    const production =
      row.productionRegistration === undefined
        ? null
        : registration('production', row.productionRegistration, 2)

    function assessment(story: Story): Assessment {
      const sentAt = at(story.sent)
      const submittedAt =
        story.submitted === undefined ? null : noonDaysAgo(story.submitted)
      const approvedAt = story.answered === undefined ? null : at(story.answered)
      const draft = draftOf(sentAt)
      const gapCount = draft.sections.flatMap((s) => s.gaps).length
      const recordId = ids(KIND.assessment, 1)
      event(
        story.sent,
        'privacy_assessment.sent',
        `privacy-assessment:${recordId}`,
        { gapCount },
        `${owner.displayName} sent this app's privacy assessment to the Manifest team, with an answer to each of its ${gapCount} gaps, to submit to the Privacy Office.`,
        by(owner),
      )
      if (submittedAt !== null)
        event(
          t0 - Date.parse(submittedAt),
          'privacy_assessment.submitted',
          `privacy-assessment:${recordId}`,
          { sentAt: vancouverDay(new Date(submittedAt)), externalTicketRef: story.ref },
          `${OPERATOR.displayName} recorded that the Manifest team submitted this app's privacy assessment to the UBC Privacy Office on ${dayInWords(submittedAt)} (ticket ${story.ref}).`,
          by(OPERATOR),
        )
      if (approvedAt !== null)
        event(
          story.answered!,
          'privacy_assessment.recorded',
          `privacy-assessment:${recordId}`,
          { state: 'approved', externalTicketRef: story.ref },
          `${OPERATOR.displayName} recorded this app's privacy assessment as approved (ticket ${story.ref}).`,
          by(OPERATOR),
        )
      const said = new Map(f.ASSESSMENT_ANSWERS_SENT.map((a) => [a.gapId, a.answer]))
      return {
        ...f.PRIVACY_ASSESSMENT,
        id: recordId,
        projectId: id,
        state:
          approvedAt !== null ? 'approved' : submittedAt !== null ? 'submitted' : 'sent',
        reviewer: submittedAt === null ? null : f.PRIVACY_ASSESSMENT.reviewer,
        approvedAt,
        externalTicketRef: story.ref ?? null,
        sentAt,
        sentBy: { id: owner.id, displayName: owner.displayName },
        gapAnswers: draft.sections.flatMap((s) =>
          s.gaps.map((g) => ({
            gapId: g.id,
            answer: said.get(g.id) ?? 'Does not apply.',
          })),
        ),
        submittedAt,
        submittedBy: submittedAt === null ? null : OPERATOR,
        draft,
        createdAt: at(story.sent + DAY),
        updatedAt: approvedAt ?? submittedAt ?? sentAt,
      }
    }

    /** The assessment as drafted for this app — the fixture's rows, its name, its owner. */
    function draftOf(sentAt: string): Schemas['PrivacyAssessmentDraft'] {
      const draft = f.assessmentDraft(iso(Date.parse(sentAt) - 30 * MINUTE))
      return {
        ...draft,
        project: { slug, name: row.name },
        fromCommit: seed,
        text: draft.text
          .replace(`${f.PROJECT.name} (${f.PROJECT.slug})`, `${row.name} (${slug})`)
          .replaceAll(
            `${f.ME.displayName} <${f.ME.email}>`,
            `${owner.displayName} <${owner.email}>`,
          ),
      }
    }

    function registration(
      environment: 'staging' | 'production',
      story: RegistrationStory,
      k: number,
    ): Registration {
      const base = environment === 'staging' ? f.STAGING_REGISTRATION : f.IAM_REGISTRATION
      const host = environments[environment].environment.hostname
      const entity = {
        entityId: `https://manifest.internal/sp/${slug}/${environment}`,
        acsUrl: `https://${host}/auth/ubcshib/callback`,
        sloUrl: `https://${host}/auth/logout`,
      }
      const recordId = ids(KIND.registration, k)
      const sentAt = at(story.sent)
      const submittedAt =
        story.submitted === undefined ? null : noonDaysAgo(story.submitted)
      const registeredAt = story.answered === undefined ? null : at(story.answered)
      const pkg = packageOf(
        environment,
        entity,
        iso(Date.parse(sentAt) - 30 * MINUTE),
        story,
      )
      const registered = registeredAt === null ? [] : [...attributes].sort()
      event(
        story.sent,
        'iam_registration.sent',
        `iam-registration:${recordId}`,
        { environment, sentFrom: 'draft', requestedAttributes: null },
        `${owner.displayName} sent this app's ${environment} registration to the Manifest team, to submit to UBC IAM.`,
        by(owner),
      )
      if (submittedAt !== null)
        event(
          t0 - Date.parse(submittedAt),
          'iam_registration.submitted',
          `iam-registration:${recordId}`,
          {
            environment,
            sentAt: vancouverDay(new Date(submittedAt)),
            externalTicketRef: story.ref,
            changeRequest: false,
            requestedAttributes: null,
          },
          `${OPERATOR.displayName} recorded that the Manifest team submitted this app's ${environment} registration to UBC IAM on ${dayInWords(submittedAt)} (ticket ${story.ref}).`,
          by(OPERATOR),
        )
      if (registeredAt !== null)
        event(
          story.answered!,
          'iam_registration.recorded',
          `iam-registration:${recordId}`,
          {
            state: 'active',
            environment,
            entityId: entity.entityId,
            externalTicketRef: story.ref,
            attributeCount: registered.length,
            changeRequestedFrom: null,
          },
          `${OPERATOR.displayName} recorded this app's ${environment} UBC IAM registration as active (ticket ${story.ref}).`,
          by(OPERATOR),
        )
      const record: Registration = {
        ...base,
        id: recordId,
        projectId: id,
        environment,
        ...entity,
        certFingerprint: registeredAt === null ? null : pkg.certificate.fingerprint,
        certExpiresAt:
          registeredAt === null
            ? null
            : story.certExpiresIn === undefined
              ? pkg.certificate.expiresAt
              : iso(t0 + story.certExpiresIn * DAY),
        registeredAttributes: registered,
        requestedAttributes: null,
        registeredAt,
        state:
          registeredAt !== null ? 'active' : submittedAt !== null ? 'submitted' : 'sent',
        changeRequestedFrom: null,
        externalTicketRef: story.ref ?? null,
        sentFrom: registeredAt === null && submittedAt === null ? 'draft' : null,
        sentAt,
        sentBy: { id: owner.id, displayName: owner.displayName },
        submittedAt,
        submittedBy: submittedAt === null ? null : OPERATOR,
        package: pkg,
        createdAt: at(story.sent + DAY),
        updatedAt: registeredAt ?? submittedAt ?? sentAt,
      }
      const change = story.change
      if (change === undefined) return record

      // A CHANGE TO THE LIVE REGISTRATION (FE-47): drawn from the newest valid manifest, asking for `sn`
      // as well — its builds still checked against what UBC registered, which stays in force.
      const asked = [...attributes, 'sn']
      const changeSentAt = at(change.sent)
      const changePackage: Schemas['RegistrationPackage'] = {
        ...packageOf(
          environment,
          entity,
          iso(Date.parse(changeSentAt) - 30 * MINUTE),
          story,
        ),
        attributes: [...pkg.attributes, SN],
        warnings: [CHANGE_DRAWN],
      }
      event(
        change.sent,
        'iam_registration.sent',
        `iam-registration:${recordId}`,
        { environment, sentFrom: 'active', requestedAttributes: asked },
        `${owner.displayName} asked for a change to this app's ${environment} registration, sent to the Manifest team to file with UBC IAM.`,
        by(owner),
      )
      const filedAt = change.filed === undefined ? null : noonDaysAgo(change.filed)
      if (filedAt !== null)
        event(
          t0 - Date.parse(filedAt),
          'iam_registration.submitted',
          `iam-registration:${recordId}`,
          {
            environment,
            sentAt: vancouverDay(new Date(filedAt)),
            externalTicketRef: change.ref,
            changeRequest: true,
            requestedAttributes: asked,
          },
          `${OPERATOR.displayName} recorded that the Manifest team filed a change request for this app's ${environment} registration with UBC IAM on ${dayInWords(filedAt)} (ticket ${change.ref}).`,
          by(OPERATOR),
        )
      return {
        ...record,
        requestedAttributes: asked,
        package: changePackage,
        sentFrom: filedAt === null ? 'active' : null,
        sentAt: changeSentAt,
        ...(filedAt === null
          ? { state: 'sent' as const, updatedAt: changeSentAt }
          : {
              state: 'change_requested' as const,
              changeRequestedFrom: 'active' as const,
              externalTicketRef: change.ref ?? null,
              submittedAt: filedAt,
              submittedBy: OPERATOR,
              updatedAt: filedAt,
            }),
      }
    }

    /** A package as sent: the fixture's, for this app — its entity, its owner, its PIA number. */
    function packageOf(
      environment: 'staging' | 'production',
      entity: { entityId: string; acsUrl: string; sloUrl: string },
      generatedAt: string,
      story: RegistrationStory,
    ): Schemas['RegistrationPackage'] {
      const pkg = f.registrationPackage(environment, 'sent', generatedAt)
      const unread = story.unread === undefined ? [] : [unreadAttribute(story.unread)]
      return {
        ...pkg,
        fromCommit: seed,
        ...entity,
        attributes: [...pkg.attributes, ...unread],
        contacts: {
          ...pkg.contacts,
          technical: [{ name: owner.displayName, email: owner.email }],
        },
        privacyAssessmentReference: pia?.externalTicketRef ?? null,
        metadataXml: pkg.metadataXml
          .replaceAll(f.PROJECT.slug, slug)
          .replaceAll(f.ME.email, owner.email),
        warnings: story.unread === undefined ? [] : [unreadWarning(story.unread)],
      }
    }

    // ─── The first launch, and what production has been through since ───
    if (row.rehearsal !== undefined) {
      const release = releaseOf(row.rehearsal.release)
      event(
        row.rehearsal.ago,
        'rehearsal.completed',
        `rehearsal:${slug}:production`,
        {
          rehearsalId: ids(KIND.rehearsal, row.rehearsal.release),
          releaseId: release.id,
          passed: true,
          attributeCount: attributes.length,
        },
        `${owner.displayName} ran the pre-production rehearsal and it passed.`,
        by(owner),
      )
    }
    if (row.production !== undefined) {
      const { launched, asked, approved } = row.production
      const release = releaseOf(row.production.release)
      event(
        asked,
        'approval.requested',
        `release:${release.id}`,
        { requestId: ids(KIND.request, 1), releaseId: release.id, viaToken: false },
        `${owner.displayName} asked an administrator to approve this release for production.`,
        by(owner),
      )
      event(
        approved,
        'release.approved',
        `release:${release.id}`,
        {
          releaseId: release.id,
          imageDigest: release.imageDigest.slice(0, 19),
          decision: 'approved',
        },
        `${OPERATOR.displayName} approved this release for production.`,
        by(OPERATOR),
      )
      // A `class` app runs its set of two (A1).
      deploy('production', release, launched, 2, by(owner))
      event(
        launched - 25_000,
        'project.launched',
        `project:${id}`,
        {
          releaseId: release.id,
          instanceId: environments.production.routes[0],
          imageDigest: release.imageDigest.slice(0, 19),
        },
        `${slug} launched: it is in production for the first time (§13).`,
        by(owner),
      )
      exits(release, row.production.exits ?? [])
    }

    /**
     * THE SET WATCHER'S STORY (A1's Task 6, `releases/watch.ts`): a serving member exits; an Incident; the
     * whole set deployed again after the back-off (no person named), retiring the set it replaces — or,
     * the fourth exit in an hour, replacing stops and the stopped member stays in the set.
     */
    function exits(release: Release, list: Exit[]): void {
      const e = environments.production
      const started: string[] = []
      const exited: string[] = []
      list.forEach((exit, i) => {
        const member = e.instances.find(
          (m) => e.routes.includes(m.id) && m.state === 'healthy',
        )
        if (member === undefined) throw new Error(`${slug}: no member serves to exit`)
        // `failed`, and its `lastSeenAt` still its deploy's: the watcher writes the state alone.
        member.state = 'failed'
        const attempt = i + 1
        const replaced = exit.replacedAfter !== null
        const how = 'its process exited (code 137)'
        const stoppedWhy = replaced
          ? ''
          : ` Replacing it has stopped after three tries this hour — replacements started at ${list_(started)}, after exits at ${list_(exited)} — and nothing more is started until the app is deployed again.`
        event(
          exit.ago,
          'instance.exited',
          `instance:${member.id}`,
          {
            instanceId: member.id,
            releaseId: release.id,
            environmentId: e.environment.id,
            environment: 'production',
            reason: 'exited',
            exitCode: 137,
            attempt,
            replacement: replaced ? 'scheduled' : 'stopped',
            nextInSeconds: exit.replacedAfter,
          },
          replaced
            ? `An instance of ${slug}'s production stopped; ${exit.replacedAfter === 0 ? 'it is being replaced' : `it will be replaced in ${exit.replacedAfter === 60 ? 'a minute' : `${Math.round(exit.replacedAfter! / 60)} minutes`}`}. The app kept serving on the rest of its set.`
            : `An instance of ${slug}'s production stopped again; replacing it has stopped after three tries this hour. The app is serving on the rest of its set.`,
          null,
        )
        const incidentId = ids(KIND.incident, ++counters.incident)
        const incident: Incident = {
          ...f.INCIDENTS.incidents[0]!,
          id: incidentId,
          instanceId: member.id,
          releaseId: release.id,
          exitReason: 'the process exited with code 137',
          logTail:
            'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory\n',
          failedCheck: `watch: the instance was serving production, and ${how}.${stoppedWhy}`,
          diffSinceHealthy: `Compared with release ${release.id}, the last release that was healthy in production:\n- this is that same release: its code and manifest.yaml have not changed since it was last healthy`,
          createdAt: at(exit.ago - 1000),
          cause: replaced ? 'exit' : 'exit_stopped',
          prompt: '',
        }
        incident.prompt = promptOf(incident, slug, 'production')
        e.incidents.unshift(incident)
        event(
          exit.ago - 1000,
          'incident.opened',
          `incident:${incidentId}`,
          {
            incidentId,
            instanceId: member.id,
            releaseId: release.id,
            environment: 'production',
          },
          replaced
            ? `${slug} stopped in production while it was serving. The incident records what it printed.`
            : `${slug} keeps stopping in production, and the platform has stopped replacing it. The incident records what it printed and why.`,
          null,
        )
        exited.push(clock(at(exit.ago)))
        if (exit.replacedAfter !== null) {
          const startedAgo = exit.ago - exit.replacedAfter * 1000 - 5000
          started.push(clock(at(startedAgo)))
          deploy('production', release, startedAgo, 2, null)
        }
      })
    }

    // ─── People, tokens, an agent's question, the open sign-off, a rename, an archive ───
    const member = (
      p: Person,
      role: 'owner' | 'collaborator',
    ): Schemas['MemberList'][number] => ({
      userId: p.id,
      puid: p.puid,
      cwlLogin: p.cwlLogin,
      displayName: p.displayName,
      email: p.email,
      role,
    })
    const members = [
      member(owner, 'owner'),
      ...(row.collaborator === undefined
        ? []
        : [member(row.collaborator, 'collaborator')]),
    ]
    if (row.collaborator !== undefined)
      event(
        row.created - HOUR,
        'member.added',
        `project:${id}`,
        {
          memberId: row.collaborator.id,
          role: 'collaborator',
          previousRole: null,
          via: 'session',
          userId: owner.id,
          tokenId: null,
        },
        `${owner.displayName} added ${row.collaborator.displayName} to the project as a collaborator.`,
        by(owner),
      )

    const tokens: Schemas['TokenList'] = []
    if (row.token !== undefined) {
      const token: Schemas['Token'] = {
        ...f.TOKEN,
        id: ids(KIND.token, 1),
        projectId: id,
        name: row.token.name,
        mintedBy: row.token.mintedBy.id,
        expiresAt: iso(t0 + 60 * DAY),
        lastUsedAt: at(HOUR),
        createdAt: at(row.token.ago),
      }
      tokens.push(token)
      event(
        row.token.ago,
        'token.minted',
        `token:${token.id}`,
        {
          tokenId: token.id,
          capabilities: token.capabilities,
          expiresAt: token.expiresAt,
        },
        `${row.token.mintedBy.displayName} created a delegated token, '${token.name}', which can ${token.capabilities.join(', ')} until ${token.expiresAt.slice(0, 10)}.`,
        by(row.token.mintedBy),
      )
    }

    const pendingActions: Schemas['PendingActionList'] = []
    if (row.pendingAction !== undefined) {
      const token = tokens[0]
      if (token === undefined)
        throw new Error(`${slug}: an agent's question needs its token`)
      const asker = row.token!.mintedBy
      const action: Schemas['PendingAction'] = {
        ...f.PENDING_ACTION,
        id: ids(KIND.pendingAction, 1),
        projectId: id,
        tokenId: token.id,
        path: `/v1/projects/${id}/members`,
        object: {
          kind: 'member',
          person: {
            namedBy: 'cwlLogin',
            value: row.pendingAction.cwlLogin,
            member: null,
          },
          role: 'collaborator',
        },
        expiresAt: iso(t0 + row.pendingAction.lapsesIn),
        createdAt: at(row.pendingAction.ago),
        resolvedAt: null,
        waitingSeconds: Math.round(row.pendingAction.ago / 1000),
        reason: null,
        consumedAt: null,
      }
      pendingActions.push(action)
      event(
        row.pendingAction.ago,
        'pending_action.created',
        `pending-action:${action.id}`,
        {
          pendingActionId: action.id,
          tokenId: token.id,
          action: action.action,
          object: action.object,
          expiresAt: action.expiresAt,
          tokenExpiresAt: token.expiresAt,
          tokenMintedBy: asker.id,
        },
        `An agent asked to make the person whose CWL login is ${row.pendingAction.cwlLogin} a collaborator of this project. It waits for a person who may do that to confirm or reject it.`,
        by(asker, { id: token.id, name: token.name }),
      )
    }

    let request: Request | null = null
    if (row.request !== undefined) {
      const release = releaseOf(row.request.release)
      const token = tokens[0]
      const viaToken =
        row.request.viaToken && token !== undefined
          ? { id: token.id, name: token.name }
          : null
      request = {
        id: ids(KIND.request, 2),
        releaseId: release.id,
        requestedBy: owner,
        viaToken,
        createdAt: at(row.request.ago),
        note: row.request.note,
      }
      event(
        row.request.ago,
        'approval.requested',
        `release:${release.id}`,
        { requestId: request.id, releaseId: release.id, viaToken: viaToken !== null },
        viaToken === null
          ? `${owner.displayName} asked an administrator to approve this release for production.`
          : `An agent on ${owner.displayName}’s token asked an administrator to approve this release for production.`,
        by(owner, viaToken),
      )
    }

    if (row.renamed !== undefined)
      event(
        row.renamed.ago,
        'project.renamed',
        `project:${slug}`,
        {
          from: row.renamed.from,
          to: row.name,
          via: 'session',
          userId: OPERATOR.id,
          tokenId: null,
        },
        asAdministrator(
          `${OPERATOR.displayName} renamed the project from “${row.renamed.from}” to “${row.name}”.`,
          row.renamed.reason,
        ),
        // §26: AN ADMINISTRATOR ACTING WITH AN OWNER'S CAPABILITY, as no member — and why.
        {
          name: OPERATOR.displayName,
          asAdministrator: true,
          reason: row.renamed.reason,
          token: null,
        },
      )
    if (row.archived !== undefined)
      event(
        row.archived,
        'project.archived',
        `project:${id}`,
        { via: 'session', userId: owner.id, tokenId: null },
        `${owner.displayName} switched ${slug} off. Each of its names now answers a page saying so; its code, data and secrets are kept, and it can be restored.`,
        by(owner),
      )

    events.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    return {
      row,
      project,
      environments,
      releases,
      records: {
        projectId: id,
        iamRegistration: production,
        stagingRegistration: staging,
        privacyAssessment: pia,
      },
      rehearsal:
        row.rehearsal === undefined
          ? null
          : {
              releaseId: releaseOf(row.rehearsal.release).id,
              ranAt: at(row.rehearsal.ago),
            },
      request,
      members,
      tokens,
      pendingActions,
      events,
      approvals: [],
      previews: [],
      counters: { event: counters.event, approval: 0, preview: 0 },
    }
  }

  // ─── A release's sign-off (`releases/approval.ts`, `releases/preview.ts`) ───

  /** Newest first by `decidedAt`, then id — `latestApprovalFor`'s order. (Hoisted: the history uses it.) */
  function newestFirst(a: Schemas['Approval'], b: Schemas['Approval']): number {
    return Date.parse(b.decidedAt) - Date.parse(a.decidedAt) || b.id.localeCompare(a.id)
  }

  /** The newest decision on a release, or undefined (`latestApprovalFor`). */
  function latestApproval(
    p: ProjectState,
    releaseId: string,
  ): Schemas['Approval'] | undefined {
    return p.approvals.filter((a) => a.releaseId === releaseId).sort(newestFirst)[0]
  }

  /**
   * THE LAST APPROVED RELEASE, THE ONE IN HAND EXCLUDED (`lastApprovedReleaseFor`): each release's latest
   * decision, newest first — so a release an administrator withdrew is no longer anyone's baseline.
   */
  function lastApproved(p: ProjectState, exclude: string | null): Release | undefined {
    const seen = new Set<string>()
    for (const a of [...p.approvals].sort(newestFirst)) {
      if (seen.has(a.releaseId)) continue
      seen.add(a.releaseId)
      if (a.releaseId !== exclude && a.decision === 'approved')
        return p.releases.find((r) => r.id === a.releaseId)
    }
    return undefined
  }

  /** `diffFactsFor`: what a preview shows and a decision recomputes — never the summary or the verdict. */
  function factsOf(p: ProjectState, release: Release): Facts {
    const baseline = lastApproved(p, release.id)
    const now = release.config.production
    const fields =
      baseline === undefined ? [] : sensitiveBetween(baseline.config.production, now)
    return {
      imageDigest: release.imageDigest,
      changes:
        baseline === undefined ? [] : changesBetween(baseline.config.production, now),
      services: now.services.map((x) => `${x.type}@${x.version}`).sort(),
      attributes: [...now.auth.attributes].sort(),
      resources: {
        cpu: now.resources.cpu ?? null,
        memory: now.resources.memory ?? null,
        disk: now.resources.disk ?? null,
        pids: now.resources.pids ?? null,
      },
      baselineReleaseId: baseline?.id ?? null,
      sensitiveFields: fields,
      security: fields.map((field) => ({ field, note: SECURITY_NOTES[field] })),
      coverage: f.APPROVAL.diff.coverage,
    }
  }

  /** `buildDiffSnapshot`: the facts, then the written half — the reviewer's verdict and the model's summary. */
  function diffOf(p: ProjectState, release: Release): Schemas['ApprovalDiff'] {
    const facts = factsOf(p, release)
    const written = {
      summaryWithheldBecause: null,
      summaryExposures: null,
      review: f.APPROVAL.diff.review,
    }
    if (facts.baselineReleaseId === null)
      return { ...facts, ...written, summary: null, summarySource: 'no-previous-release' }
    if (facts.changes.length === 0)
      return { ...facts, ...written, summary: NO_CHANGES, summarySource: 'no-changes' }
    // THE MODEL IS NEVER ASKED ABOUT `auth.attributes` (`summary.ts`'s NOT_MODELLED).
    const modelled = facts.changes.filter((c) => c.path !== 'auth.attributes')
    if (modelled.length === 0)
      return { ...facts, ...written, summary: null, summarySource: 'not-modelled' }
    const exposures = modelled.map((c) => ({ path: c.path, sentence: exposureOf(c) }))
    return {
      ...facts,
      ...written,
      summary: exposures.map((e) => e.sentence).join(' '),
      summarySource: 'llm',
      summaryExposures: exposures,
    }
  }

  /** `recordPreview`: stored at `at`, for thirty minutes, by whoever took it. */
  function takePreview(
    p: ProjectState,
    release: Release,
    at: number,
    by: { id: string; displayName: string },
  ): Schemas['ApprovalPreview'] {
    const preview: Schemas['ApprovalPreview'] = {
      id: fleetId(KIND.preview, p.row.n, ++p.counters.preview),
      releaseId: release.id,
      projectId: p.project.id,
      createdBy: by.id,
      createdByName: by.displayName,
      createdAt: iso(at),
      expiresAt: iso(at + PREVIEW_TTL_MS),
      imageDigest: release.imageDigest,
      diff: diffOf(p, release),
    }
    p.previews.push(preview)
    owners.previewId.set(preview.id, p)
    return preview
  }

  /** `recordApproval`'s row: what was shown — the preview's diff, never a second one. */
  function keepDecision(
    p: ProjectState,
    release: Release,
    preview: Schemas['ApprovalPreview'],
    decision: 'approved' | 'rejected',
    reason: string | null,
    at: number,
    by: { id: string; displayName: string },
  ): Schemas['Approval'] {
    const approval: Schemas['Approval'] = {
      id: fleetId(KIND.approval, p.row.n, ++p.counters.approval),
      releaseId: release.id,
      projectId: p.project.id,
      decision,
      decidedBy: by.id,
      decidedByName: by.displayName,
      decidedAt: iso(at),
      imageDigest: release.imageDigest,
      reason,
      diff: preview.diff,
      previewId: preview.id,
    }
    p.approvals.push(approval)
    return approval
  }

  /**
   * THE OPEN SIGN-OFF REQUEST (`openRequestFor`): for the release serving staging now, with no decision
   * recorded on it since it was asked — an approval or a rejection closes it.
   */
  function openRequest(p: ProjectState): Request | null {
    const request = p.request
    if (request === null || request.releaseId !== candidateOf(p)?.id) return null
    const decided = p.approvals.some(
      (a) =>
        a.releaseId === request.releaseId &&
        Date.parse(a.decidedAt) >= Date.parse(request.createdAt),
    )
    return decided ? null : request
  }

  /** An event the platform publishes now, on the project's stream as it happens. */
  function announce(
    p: ProjectState,
    now: number,
    type: EventFrame['type'],
    subject: string,
    machineDetail: Record<string, unknown>,
    humanMessage: string,
    actor: EventFrame['actor'],
  ): void {
    const frame = {
      kind: 'event',
      id: fleetId(KIND.event, p.row.n, ++p.counters.event),
      projectId: p.project.id,
      subject,
      type,
      humanMessage,
      machineDetail,
      createdAt: iso(now),
      actor,
    } as EventFrame
    p.events.push(frame)
    for (const listener of listeners.get(p.project.id) ?? []) listener(frame)
  }

  // ─── The reads ───

  /** The set the hostname reaches, or — no route ever written — its newest instance (`servingInstancesOf`). */
  function setOf(e: EnvironmentState): Instance[] {
    if (e.routes.length > 0) return e.instances.filter((i) => e.routes.includes(i.id))
    const newest = [...e.instances].sort(byLastSeen)[0]
    return newest === undefined ? [] : [newest]
  }
  /** `servingInstancesOf`'s fallback order: `lastSeenAt` descending, which in Postgres puts NULL first. */
  const byLastSeen = (a: Instance, b: Instance): number =>
    a.lastSeenAt === b.lastSeenAt
      ? 0
      : a.lastSeenAt === null
        ? -1
        : b.lastSeenAt === null
          ? 1
          : Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt)

  function environmentOf(e: EnvironmentState): Environment {
    const set = setOf(e)
    return { ...e.environment, instance: set[0] ?? null, instances: set }
  }

  const SERVING = new Set(['healthy', 'hibernated', 'waking'])
  function instanceList(e: EnvironmentState): Schemas['InstanceList'] {
    return {
      environmentId: e.environment.id,
      // THE ONE SEEN MOST RECENTLY FIRST; each marked whether the hostname reaches it now.
      instances: [...e.instances]
        .sort((a, b) =>
          a.lastSeenAt === null || b.lastSeenAt === null
            ? Number(a.lastSeenAt === null) - Number(b.lastSeenAt === null)
            : Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt),
        )
        .map((i) => ({ ...i, serving: e.routes.includes(i.id) && SERVING.has(i.state) })),
      truncated: false,
    }
  }

  /** The release serving staging, healthy — the launch candidate (`launch/candidate.ts`). */
  function candidateOf(p: ProjectState): Release | undefined {
    const serving = setOf(p.environments.staging).find((i) => i.state === 'healthy')
    return serving === undefined
      ? undefined
      : p.releases.find((r) => r.id === serving.releaseId)
  }

  function fleetRow(p: ProjectState): Schemas['Fleet'][number] {
    const owner = p.row.owner
    return {
      ...f.FLEET[0]!,
      id: p.project.id,
      slug: p.project.slug,
      name: p.project.name,
      state: p.project.state,
      archivedAt: p.project.archivedAt,
      blueprint: p.project.blueprint,
      starter: p.project.starter,
      owner: { id: owner.id, displayName: owner.displayName, email: owner.email },
      audience: p.project.audience,
      createdAt: p.project.createdAt,
      slugReserved: false,
      // BY KIND, AS THE PLATFORM SORTS THEM (`projects/fleet.ts`): production, sandbox, staging.
      environments: (['production', 'sandbox', 'staging'] as const).map((kind) => {
        const e = p.environments[kind]
        const set = setOf(e)
        const answering = set.find((i) => i.state === 'healthy') ?? set[0]
        const release =
          answering === undefined
            ? undefined
            : p.releases.find((r) => r.id === answering.releaseId)
        const seen = e.instances
          .map((i) => i.lastSeenAt)
          .filter((t): t is string => t !== null)
          .sort()
        return {
          kind,
          hostname: e.environment.hostname,
          state: answering?.state ?? null,
          instances: set.length,
          releaseId: answering?.releaseId ?? null,
          imageDigest: release?.imageDigest ?? null,
          lastDeployAt: seen.at(-1) ?? null,
          latestIncidentAt: e.incidents[0]?.createdAt ?? null,
        }
      }),
    }
  }

  function readiness(p: ProjectState): Schemas['LaunchReadiness'] {
    const items = f.LAUNCH_READINESS.items
    const fixture = (id: Item['id']): Item => items.find((i) => i.id === id)!
    const candidate = candidateOf(p)
    const launched = p.project.launchedAt !== null
    const nothingServing = (what: string): string =>
      `Nothing is serving in staging yet, so there is no ${what}. Production runs exactly what staging ran.`
    // THE OPEN REQUEST ONLY (`askedFor`): a decision on the candidate since it was asked closes it.
    const request = openRequest(p)
    const asked =
      request === null
        ? null
        : {
            sentence: ` ${request.viaToken === null ? request.requestedBy.displayName : `An agent on ${request.requestedBy.displayName}’s token`} asked an administrator to approve it on ${dayInWords(request.createdAt)}.`,
            since: request.createdAt,
          }

    // A LAUNCHED APP'S RULE (`approvalRequirementFor`): what the candidate changes since the LAST APPROVED
    // release, itself excluded — none approved is a requirement of its own.
    const baselineRelease =
      launched && candidate !== undefined ? lastApproved(p, candidate.id) : undefined
    const baseline = baselineRelease?.id
    const sensitive =
      candidate !== undefined && baselineRelease !== undefined
        ? sensitiveBetween(baselineRelease.config.production, candidate.config.production)
        : []
    const latest = candidate === undefined ? undefined : latestApproval(p, candidate.id)
    const required = baselineRelease === undefined || sensitive.length > 0
    const rejected = latest?.decision === 'rejected'
    // `approvalCoversDigest`: approved, and this digest.
    const covered =
      latest?.decision === 'approved' && latest.imageDigest === candidate?.imageDigest

    const scans = ((): Item => {
      const base = fixture('scans')
      if (candidate === undefined)
        return {
          ...base,
          state: 'unmet',
          why: 'Nothing is serving in staging yet, so there is no release to launch. Deploy to staging first — production runs exactly what staging ran.',
        }
      const scan = candidate.scan!
      if (scan.stale)
        return {
          ...base,
          state: 'unmet',
          why: `The release serving staging was scanned against a vulnerability database ${scan.databaseAgeDays} days old, more than 7. A clean result from a stale database is not evidence there is nothing to find; rebuild once the database is refreshed.`,
        }
      return base
    })()

    const approval = ((): Item => {
      const base = fixture('admin-approval')
      if (launched) {
        const title =
          'Release approved by a platform administrator — only when a sensitive field changed'
        if (candidate === undefined)
          return {
            ...base,
            title,
            state: 'unmet',
            why: nothingServing('release to promote'),
          }
        if (rejected)
          return {
            ...base,
            title,
            state: 'unmet',
            why: `An administrator did not approve this release: ${latest!.reason}. A rejection is final for this release; build and release again.`,
            since: null,
          }
        if (!required)
          return {
            ...base,
            title,
            state: 'met',
            why: 'No sensitive field changed since the last approved release, so this release goes to production self-serve. Its code is not reviewed: that is an accepted risk, and containment is its control.',
            since: null,
          }
        if (covered) {
          const on = `on ${latest!.decidedAt.slice(0, 10)}, bound to ${latest!.imageDigest.slice(0, 19)}…`
          return {
            ...base,
            title,
            state: 'met',
            why:
              sensitive.length > 0
                ? `This release changes ${sensitive.join(', ')} since the last approved release, and an administrator approved it ${on}`
                : `An administrator approved this release itself ${on} No other approved release exists to compare it with, so its own approval is what covers it.`,
            since: null,
          }
        }
        return {
          ...base,
          title,
          state: 'unmet',
          why:
            (baselineRelease === undefined
              ? 'This app has launched, but no approved release exists to compare this one with — so it needs an administrator’s approval, and so will every release until one is approved.'
              : `This release changes ${sensitive.join(', ')} since the last approved release, so an administrator must approve it before it goes to production.`) +
            (asked?.sentence ?? ''),
          since: asked?.since ?? null,
        }
      }
      if (candidate === undefined)
        return { ...base, state: 'unmet', why: nothingServing('release to approve') }
      if (latest === undefined)
        return {
          ...base,
          state: 'unmet',
          why: `An administrator approves the exact image digest, with step-up re-authentication. This release has not been reviewed yet.${asked?.sentence ?? ' Ask an administrator to sign it off (requestApproval).'}`,
          since: asked?.since ?? null,
        }
      if (rejected)
        return {
          ...base,
          state: 'unmet',
          why: `An administrator did not approve this release: ${latest.reason}`,
          since: null,
        }
      // A fleet release is never rebuilt, so an approval of it always covers its digest.
      return {
        ...base,
        state: 'met',
        why: `Approved by an administrator on ${latest.decidedAt.slice(0, 10)}, bound to image digest ${latest.imageDigest.slice(0, 19)}…`,
        since: null,
      }
    })()

    const rehearsal = ((): Item => {
      const base = fixture('rehearsal')
      if (candidate === undefined)
        return {
          ...base,
          state: 'unmet',
          why: 'Nothing is serving in staging yet, so there is no candidate release to rehearse. Production runs exactly what staging ran.',
        }
      if (p.rehearsal?.releaseId !== candidate.id)
        return {
          ...base,
          state: 'unmet',
          why: 'Before an app is public, Manifest deploys the candidate release to its production hostname, registers its Service Provider with production values, completes one CWL sign-in and takes the deployment down again. Nobody has run it for this project yet.',
        }
      // The fixture's sentence (`launch/rehearsal.ts`'s), on this rehearsal's day and attributes.
      return {
        ...base,
        why: base.why
          .replace('2026-09-20', p.rehearsal.ranAt.slice(0, 10))
          .replace(
            'releasing 3 attribute(s)',
            `releasing ${candidate.config.production.auth.attributes.length} attribute(s)`,
          ),
      }
    })()

    const list: Item[] = [
      fixture('domain'),
      registrationItem(fixture('iam-registration'), p.records.iamRegistration),
      assessmentItem(fixture('privacy-assessment'), p.records.privacyAssessment),
      ...(launched ? [] : [rehearsal]),
      scans,
      approval,
      ...loadRehearsal(p.project.audience),
      fixture('code-review'),
    ]
    return {
      ...f.LAUNCH_READINESS,
      projectId: p.project.id,
      launched,
      ready: list.every((i) => !i.blocking || i.state === 'met'),
      candidateReleaseId: candidate?.id ?? null,
      baselineReleaseId: baseline ?? null,
      sensitiveFields: sensitive,
      reescalated:
        launched && candidate !== undefined && required && !covered && !rejected,
      items: list,
    }
  }

  /**
   * §24's `load-rehearsal` (`launch/readiness.ts`'s `loadRehearsalItems`, both clauses): a large-audience
   * app's, `not_built` at 1.9.0 — no measurement can meet it until the load rehearsal is built (B's Task 6).
   */
  function loadRehearsal(audience: Schemas['Project']['audience']): Item[] {
    if (audience?.scale !== 'large_course' && audience?.scale !== 'public') return []
    return [
      {
        id: 'load-rehearsal',
        title: 'Load rehearsal passed',
        owner: 'Manifest',
        blocking: true,
        state: 'not_built',
        builtBy: 'a later Manifest release (the load rehearsal)',
        why: `An app for ${audience.scale === 'public' ? 'the public' : 'a large course'} is rehearsed against staging with production-shaped capacity before launch.`,
        since: null,
      },
    ]
  }

  /** `iam-registration`, from production's registration — in force once registered and not lapsed. */
  function registrationItem(base: Item, row: Registration | null): Item {
    if (row === null)
      return {
        ...base,
        state: 'unmet',
        why: 'Every production app that signs people in with CWL needs its own registration with UBC IAM, and it takes weeks. Production’s is drafted (draftIamRegistration) and sent to the Manifest team (sendIamRegistration) once the privacy assessment is approved and staging’s registration is active; the team submits it to UBC IAM. An administrator records UBC IAM’s answer, with its ticket reference.',
        since: null,
      }
    if (row.registeredAt !== null && row.state !== 'expired') {
      const met: Item = {
        ...base,
        state: 'met',
        // The registration's own ticket — a change request filed since carries the change's.
        why: `Registered as ${row.entityId}, active${ticket(row.state === 'change_requested' ? null : row.externalTicketRef)}, releasing ${row.registeredAttributes.length} attribute(s).`,
        since: row.registeredAt,
      }
      if (row.requestedAttributes === null) return met
      const asked = [...row.requestedAttributes].sort().join(', ')
      return {
        ...met,
        why:
          row.state === 'sent'
            ? `${met.why} A change is with the Manifest team since ${dayInWords(row.sentAt!)} (asking for ${asked}); until UBC registers it, releases are checked against what it registered.`
            : `${met.why} A change request is on file ('${row.state}'${ticket(row.externalTicketRef)}, asking for ${asked}); until UBC registers it, releases are checked against what it registered.`,
      }
    }
    const withTeam = row.state === 'sent' && row.sentAt !== null
    return {
      ...base,
      state: 'unmet',
      why: `${withTeam ? `It was sent to the Manifest team on ${dayInWords(row.sentAt!)}, to submit to UBC IAM. ` : ''}The registration is '${row.state}'${ticket(row.externalTicketRef)} and must be 'active' before a first production launch.`,
      since: withTeam ? row.sentAt : null,
    }
  }

  function assessmentItem(base: Item, row: Assessment | null): Item {
    if (row === null)
      return {
        ...base,
        state: 'unmet',
        why: 'A Privacy Impact Assessment is required before a production launch, and it takes weeks. Draft it (draftPrivacyAssessment), answer each of its gaps and send it to the Manifest team (sendPrivacyAssessment), who submit it to the UBC Privacy Office; an administrator records the Office’s answer, with its ticket reference.',
        since: null,
      }
    if (row.state === 'approved')
      return {
        ...base,
        state: 'met',
        why: `Approved by ${row.reviewer ?? 'the UBC Privacy Office'}${row.approvedAt === null ? '' : ` on ${row.approvedAt.slice(0, 10)}`}${ticket(row.externalTicketRef)}.`,
        since: row.approvedAt,
      }
    if (row.state === 'submitted' && row.submittedAt !== null)
      return {
        ...base,
        state: 'unmet',
        why: `It was sent to the UBC Privacy Office on ${dayInWords(row.submittedAt)}. The assessment is 'submitted'${ticket(row.externalTicketRef)} and must be 'approved' before anything goes to production.`,
        since: row.submittedAt,
      }
    const withTeam = row.state === 'sent' && row.sentAt !== null
    return {
      ...base,
      state: 'unmet',
      why: `${withTeam ? `It was sent to the Manifest team on ${dayInWords(row.sentAt!)}, with an answer to each of its gaps, to submit to the UBC Privacy Office. ` : ''}The assessment is '${row.state}'${ticket(row.externalTicketRef)} and must be 'approved' before anything goes to production.`,
      since: withTeam ? row.sentAt : null,
    }
  }

  // ─── The queue (`launch/queue.ts`): derived from the records and the open requests ───

  function queueItems(): QueueItem[] {
    const items: QueueItem[] = []
    for (const p of projects) {
      if (p.project.state !== 'active') continue
      const project = { id: p.project.id, slug: p.project.slug, name: p.project.name }
      const person = (u: { id: string; displayName: string } | null) =>
        u === null ? null : { id: u.id, displayName: u.displayName }
      const request = openRequest(p)
      if (request !== null) {
        const name = request.requestedBy.displayName
        const who = request.viaToken === null ? name : `An agent on ${name}’s token`
        items.push({
          kind: 'release-approval',
          project,
          subjectId: request.releaseId,
          environment: null,
          requestedBy: person(request.requestedBy),
          since: request.createdAt,
          summary:
            p.project.launchedAt === null
              ? `${who} asked for the release serving staging to be approved for the app’s first production launch.`
              : `${who} asked for the release serving staging to be approved for production.`,
          note: request.note,
        })
      }
      for (const r of [p.records.stagingRegistration, p.records.iamRegistration]) {
        if (r === null) continue
        const env = r.environment
        if (r.state === 'sent') {
          const since = r.sentAt ?? r.updatedAt
          const sender = r.sentBy?.displayName ?? 'Its owner'
          items.push({
            ...(r.sentFrom === 'active'
              ? {
                  kind: 'iam-change-to-file' as const,
                  summary: `${sender} asked for a change to the ${env} registration on ${dayInWords(since)}${asking(r.requestedAttributes)}: file it with UBC IAM as a change request and record that you have, or hand it back.`,
                }
              : {
                  kind: 'iam-registration-to-submit' as const,
                  summary: `${sender} sent the ${env} registration to the Manifest team on ${dayInWords(since)}: submit it to UBC IAM and record that you have, or hand it back.`,
                }),
            project,
            subjectId: r.id,
            environment: env,
            requestedBy: person(r.sentBy),
            since,
            note: null,
          })
        }
        if (
          r.state === 'submitted' ||
          (r.state === 'change_requested' && r.changeRequestedFrom === 'active')
        ) {
          const since = r.submittedAt ?? r.updatedAt
          items.push({
            ...(r.state === 'submitted'
              ? {
                  kind: 'iam-registration' as const,
                  summary: `The ${env} registration was sent to UBC IAM on ${dayInWords(since)}${ticket(r.externalTicketRef)}: record UBC IAM’s answer when it comes.`,
                }
              : {
                  kind: 'iam-change-request' as const,
                  summary: `A change request for the ${env} registration was filed with UBC IAM on ${dayInWords(since)}${ticket(r.externalTicketRef)}${asking(r.requestedAttributes)}: record UBC IAM’s answer when it comes.`,
                }),
            project,
            subjectId: r.id,
            environment: env,
            requestedBy: person(r.sentBy ?? r.submittedBy),
            since,
            note: null,
          })
        }
      }
      const a = p.records.privacyAssessment
      if (a?.state === 'sent') {
        const since = a.sentAt ?? a.updatedAt
        items.push({
          kind: 'privacy-assessment-to-submit',
          project,
          subjectId: a.id,
          environment: null,
          requestedBy: person(a.sentBy),
          since,
          summary: `${a.sentBy?.displayName ?? 'Its owner'} sent the privacy assessment to the Manifest team on ${dayInWords(since)}: submit it to the UBC Privacy Office and record that you have, or hand it back.`,
          note: null,
        })
      }
      if (a?.state === 'submitted') {
        const since = a.submittedAt ?? a.updatedAt
        items.push({
          kind: 'privacy-assessment',
          project,
          subjectId: a.id,
          environment: null,
          requestedBy: person(a.sentBy ?? a.submittedBy),
          since,
          summary: `The privacy assessment was sent to the UBC Privacy Office on ${dayInWords(since)}${ticket(a.externalTicketRef)}: record its answer, with the PIA number, when it comes.`,
          note: null,
        })
      }
    }
    return items
  }

  // ─── Answers, for a request that names a fleet id ───

  function answer(
    operationId: string,
    params: Record<string, string>,
    body: unknown,
    ctx: FleetContext,
  ): FleetAnswer | undefined {
    const p = named(params)
    if (p === undefined) return undefined
    const ok = (schema: string, body: unknown): FleetAnswer => ({
      status: 200,
      schema,
      body,
    })
    const env = (): EnvironmentState =>
      Object.values(p.environments).find(
        (e) => e.environment.id === params.environmentId,
      )!
    switch (operationId) {
      case 'getProject':
        return ok(
          'Project',
          ctx.query.get('expand') === 'environments'
            ? {
                ...p.project,
                environments: Object.values(p.environments).map(environmentOf),
              }
            : p.project,
        )
      case 'listEnvironments':
        return ok('EnvironmentList', Object.values(p.environments).map(environmentOf))
      case 'getEnvironment':
        return ok('Environment', environmentOf(env()))
      case 'listInstances':
        return ok('InstanceList', instanceList(env()))
      case 'listIncidents':
        return ok('IncidentList', {
          environmentId: params.environmentId,
          incidents: env().incidents,
        })
      case 'getInstanceOutput':
        return instanceOutput(p, params.instanceId ?? '', ctx)
      case 'listReleases':
        return ok('ReleaseList', [...p.releases].reverse())
      case 'getRelease':
        return ok(
          'Release',
          p.releases.find((r) => r.id === params.releaseId),
        )
      case 'getLaunchReadiness':
        return ok('LaunchReadiness', readiness(p))
      case 'getLaunchRecords':
        return ok('LaunchRecords', p.records)
      case 'listMembers':
        return ok('MemberList', p.members)
      case 'listTokens':
        return ok('TokenList', p.tokens)
      case 'listPendingActions':
        return ok(
          'PendingActionList',
          p.pendingActions.map((a) => ({
            ...a,
            waitingSeconds:
              a.resolvedAt === null
                ? Math.round((ctx.now - Date.parse(a.createdAt)) / 1000)
                : a.waitingSeconds,
          })),
        )
      case 'getPendingAction': {
        const a = p.pendingActions.find((x) => x.id === params.pendingActionId)!
        return ok('PendingAction', {
          ...a,
          waitingSeconds:
            a.resolvedAt === null
              ? Math.round((ctx.now - Date.parse(a.createdAt)) / 1000)
              : a.waitingSeconds,
        })
      }
      case 'listAgentSessions':
        return ok('AgentSessionList', { sessions: [], truncated: false })

      // ─── An administrator's decisions (Task 4) ───
      case 'createApprovalPreview':
        return {
          status: 201,
          schema: 'ApprovalPreview',
          body: takePreview(p, releaseOf(p, params), ctx.now, ctx.actor),
        }
      case 'getApprovalPreview':
        return ok('ApprovalPreview', previewNamed(p, params, params.previewId ?? ''))
      case 'approveRelease':
      case 'rejectRelease':
        return {
          status: 201,
          schema: 'Approval',
          body: decide(
            p,
            params,
            operationId === 'approveRelease' ? 'approved' : 'rejected',
            body,
            ctx,
          ),
        }
      case 'getApproval': {
        const approval = latestApproval(p, params.releaseId ?? '')
        if (approval === undefined)
          throw new MockRefusal(
            404,
            'NOT_FOUND',
            `nobody has approved or rejected release '${params.releaseId}'`,
          )
        return ok('Approval', approval)
      }
      case 'submitIamRegistration':
        return ok('IamRegistration', submitRegistration(p, params, body, ctx))
      case 'returnIamRegistration':
        return ok('IamRegistration', returnRegistration(p, params, ctx))
      case 'submitPrivacyAssessment':
        return ok('PrivacyAssessment', submitAssessment(p, body, ctx))
      case 'returnPrivacyAssessment':
        return ok('PrivacyAssessment', returnAssessment(p, ctx))
      case 'recordIamRegistration':
        return ok('IamRegistration', recordRegistration(p, body, ctx))
      case 'recordPrivacyAssessment':
        return ok('PrivacyAssessment', recordAssessment(p, body, ctx))
      case 'rejectPendingAction':
      case 'confirmPendingAction':
        return ok(
          'PendingAction',
          answerQuestion(
            p,
            params.pendingActionId ?? '',
            operationId === 'rejectPendingAction' ? 'rejected' : 'confirmed',
            body,
            ctx,
          ),
        )
      default:
        // NEVER A FIXTURE'S ANSWER TO A FLEET ID: the default would answer `mock-app` for a project that
        // is not it — the plausible lie this mock exists not to tell.
        throw new MockRefusal(
          501,
          'INTERNAL',
          `manifest-mock's demo fleet does not answer ${operationId}`,
          'The demo fleet answers an administrator’s reads of its projects and nothing else; drive the platform for the rest.',
        )
    }
  }

  /** ONLY A RUNNING SANDBOX INSTANCE'S OUTPUT IS READ (`api/routes/instances.ts`), in the platform's order. */
  function instanceOutput(
    p: ProjectState,
    instanceId: string,
    ctx: FleetContext,
  ): FleetAnswer {
    const e = Object.values(p.environments).find((x) =>
      x.instances.some((i) => i.id === instanceId),
    )!
    const instance = e.instances.find((i) => i.id === instanceId)!
    if (e.environment.kind === 'production')
      throw new MockRefusal(
        403,
        'INSTANCE_OUTPUT_PRODUCTION',
        'a production instance’s output is not readable; its Incident’s log tail is the only window onto it',
      )
    if (e.environment.kind === 'staging')
      throw new MockRefusal(
        403,
        'INSTANCE_OUTPUT_STAGING',
        'a staging instance’s output is not readable: staging serves real people; its Incident’s log tail is the only window onto it',
      )
    if (!e.routes.includes(instanceId) || instance.state !== 'healthy')
      throw new MockRefusal(
        409,
        'INSTANCE_OUTPUT_UNAVAILABLE',
        `instance '${instanceId}' is not running — it never started, or it no longer runs — so there is no output to read; if it failed, its Incident has its last lines`,
      )
    const lines = Number(ctx.query.get('lines') ?? '200')
    return {
      status: 200,
      schema: 'InstanceOutput',
      body: {
        ...f.OUTPUT,
        instanceId,
        environmentId: e.environment.id,
        readAt: iso(ctx.now),
        lines: f.OUTPUT.lines.slice(-lines),
        truncated: { lines: f.OUTPUT.lines.length > lines, bytes: false },
      },
    }
  }

  // ─── An administrator's decisions, each in the platform's order and words ───

  /** Who acted, as an administrator's own duty: no member's capability borrowed, so no reason. */
  const byOperator = (actor: FleetContext['actor']): EventFrame['actor'] => ({
    name: actor.displayName,
    asAdministrator: false,
    reason: null,
    token: null,
  })
  const personOf = (actor: FleetContext['actor']) => ({
    id: actor.id,
    displayName: actor.displayName,
  })

  /**
   * C1: THE BODY FIRST, against its operation's request schema — before anything is read or asked, as the
   * platform's own schema refuses it (`api/errors.ts`'s `REQUEST_INVALID`, naming the field).
   */
  function bodyOf<T>(ctx: FleetContext, schema: string, body: unknown): T {
    const { ok: valid, errors } = ctx.validate(schema, body ?? null)
    if (!valid)
      throw new MockRefusal(
        400,
        'REQUEST_INVALID',
        errors
          .split('; ')
          .map((e) =>
            e.replace(/^\/(\S*)/, (_all, path: string) =>
              path === '' ? 'body:' : `body.${path.replaceAll('/', '.')}:`,
            ),
          )
          .join('; '),
        'Correct the listed fields and send the request again.',
      )
    return body as T
  }

  /** An archived project is read and restored, and nothing else (`projects/state.ts`'s `archivedRefusal`). */
  function unlessArchived(p: ProjectState): void {
    if (p.project.state === 'archived')
      throw new MockRefusal(
        409,
        'PROJECT_ARCHIVED',
        `project '${p.project.id}' is archived — switched off by its owner (§11) — so it can be read and restored, and nothing else`,
      )
  }

  const releaseOf = (p: ProjectState, params: Record<string, string>): Release =>
    p.releases.find((r) => r.id === params.releaseId)!

  /** A preview OF THIS RELEASE — another release's is no preview at all (`previewFor`). */
  function previewNamed(
    p: ProjectState,
    params: Record<string, string>,
    previewId: string,
  ): Schemas['ApprovalPreview'] {
    const preview = p.previews.find(
      (x) => x.id === previewId && x.releaseId === params.releaseId,
    )
    if (preview === undefined)
      throw new MockRefusal(
        404,
        'NOT_FOUND',
        `no preview '${previewId}' of release '${params.releaseId}'`,
      )
    return preview
  }

  /**
   * `decide()` (`api/routes/releases.ts`): the body, the step-up (when the mock plays it), the preview
   * named — this release's — then NOT EXPIRED, then NOT STALE, its facts recomputed now. A second decision
   * on a release whose preview is still current is recorded, as the platform records it (a withdrawal).
   */
  function decide(
    p: ProjectState,
    params: Record<string, string>,
    decision: 'approved' | 'rejected',
    body: unknown,
    ctx: FleetContext,
  ): Schemas['Approval'] {
    const asked = bodyOf<{ reason?: string; previewId?: string }>(
      ctx,
      decision === 'approved' ? 'ApproveReleaseRequest' : 'RejectReleaseRequest',
      body,
    )
    if (ctx.stepUpRequired && !ctx.steppedUp) throw stepUpRefusal('release:approve')
    const release = releaseOf(p, params)
    if (asked.previewId === undefined)
      throw new MockRefusal(
        400,
        'APPROVAL_PREVIEW_REQUIRED',
        'an approval names the preview the administrator read',
        'POST /v1/releases/{releaseId}/approval-preview, read it, then decide naming its id.',
      )
    const preview = previewNamed(p, params, asked.previewId)
    if (ctx.now >= Date.parse(preview.expiresAt))
      throw new MockRefusal(
        409,
        'APPROVAL_PREVIEW_EXPIRED',
        `preview '${preview.id}' expired at ${preview.expiresAt} — take a new one and read it before deciding.`,
      )
    const shown = factsIn(preview.diff)
    const current = factsOf(p, release)
    const moved = (Object.keys({ ...shown, ...current }) as (keyof Facts)[]).filter(
      (key) => stable(shown[key]) !== stable(current[key]),
    )
    if (moved.length > 0)
      throw new MockRefusal(
        409,
        'APPROVAL_PREVIEW_STALE',
        (moved.includes('baselineReleaseId')
          ? 'the last approved release of this project changed since this preview was taken — take a new one.'
          : 'what this release would be approved as changed since this preview was taken — take a new one.') +
          ` Moved: ${moved.join(', ')}.`,
      )
    const approval = keepDecision(
      p,
      release,
      preview,
      decision,
      asked.reason ?? null,
      ctx.now,
      ctx.actor,
    )
    announce(
      p,
      ctx.now,
      decision === 'approved' ? 'release.approved' : 'release.approval_rejected',
      `release:${release.id}`,
      { releaseId: release.id, imageDigest: release.imageDigest.slice(0, 19), decision },
      decision === 'approved'
        ? `${ctx.actor.displayName} approved this release for production.`
        : `${ctx.actor.displayName} did not approve this release: ${asked.reason}`,
      byOperator(ctx.actor),
    )
    return approval
  }

  // ─── The Manifest team's step (`launch/records.ts`'s `recordIamSubmission` and its siblings) ───

  function environmentIn(params: Record<string, string>): 'staging' | 'production' {
    const environment = params.environment
    if (environment === 'staging' || environment === 'production') return environment
    throw new MockRefusal(
      400,
      'REQUEST_INVALID',
      `environment must be 'staging' or 'production', not '${String(environment)}'`,
    )
  }
  const registrationAt = (p: ProjectState, environment: 'staging' | 'production') =>
    environment === 'staging' ? p.records.stagingRegistration : p.records.iamRegistration
  function keepRegistration(p: ProjectState, row: Registration): Registration {
    if (row.environment === 'staging') p.records.stagingRegistration = row
    else p.records.iamRegistration = row
    return row
  }

  /** `sent → submitted` on the day the team sent it (Vancouver noon) — or, a change, filed as one. */
  function submitRegistration(
    p: ProjectState,
    params: Record<string, string>,
    body: unknown,
    ctx: FleetContext,
  ): Registration {
    const environment = environmentIn(params)
    const asked = bodyOf<{ sentAt?: string; reference: string }>(
      ctx,
      'RecordSubmissionRequest',
      body,
    )
    unlessArchived(p)
    const held = registrationAt(p, environment)
    if (held?.state !== 'sent' || held.sentAt === null)
      throw notWithTeam(`this app's ${environment} registration`, held?.state)
    const day = sentDay(asked.sentAt, held.sentAt, ctx.now)
    const noon = vancouverNoon(day).toISOString()
    const filesAChange = held.sentFrom === 'active'
    const row = keepRegistration(p, {
      ...held,
      ...(filesAChange
        ? { state: 'change_requested' as const, changeRequestedFrom: 'active' as const }
        : { state: 'submitted' as const }),
      sentFrom: null,
      submittedAt: noon,
      submittedBy: personOf(ctx.actor),
      externalTicketRef: asked.reference,
      updatedAt: iso(ctx.now),
    })
    announce(
      p,
      ctx.now,
      'iam_registration.submitted',
      `iam-registration:${row.id}`,
      {
        environment,
        sentAt: day,
        externalTicketRef: row.externalTicketRef,
        changeRequest: filesAChange,
        requestedAttributes: row.requestedAttributes,
      },
      filesAChange
        ? `${ctx.actor.displayName} recorded that the Manifest team filed a change request for this app's ${environment} registration with UBC IAM on ${dayInWords(noon)} (ticket ${asked.reference}).`
        : `${ctx.actor.displayName} recorded that the Manifest team submitted this app's ${environment} registration to UBC IAM on ${dayInWords(noon)} (ticket ${asked.reference}).`,
      byOperator(ctx.actor),
    )
    return row
  }

  /** Handed back, unsubmitted, to the state it was sent from (`iamReturnTo`). Why travels outside the record. */
  function returnRegistration(
    p: ProjectState,
    params: Record<string, string>,
    ctx: FleetContext,
  ): Registration {
    const environment = environmentIn(params)
    unlessArchived(p)
    const held = registrationAt(p, environment)
    if (held?.state !== 'sent' || held.sentFrom === null)
      throw notWithTeam(`this app's ${environment} registration`, held?.state)
    const to = held.sentFrom
    const row = keepRegistration(p, {
      ...held,
      ...(to === 'change_requested'
        ? {
            state: 'change_requested' as const,
            changeRequestedFrom: 'submitted' as const,
          }
        : { state: to, changeRequestedFrom: null }),
      sentFrom: null,
      // A CHANGE HANDED BACK: live again, as UBC registered it — nothing is asked of UBC any more.
      ...(to === 'active' ? { requestedAttributes: null } : {}),
      updatedAt: iso(ctx.now),
    })
    announce(
      p,
      ctx.now,
      'iam_registration.returned',
      `iam-registration:${row.id}`,
      { environment, to },
      `${ctx.actor.displayName} handed this app's ${environment} registration back to its owner, unsubmitted.`,
      byOperator(ctx.actor),
    )
    return row
  }

  function submitAssessment(
    p: ProjectState,
    body: unknown,
    ctx: FleetContext,
  ): Assessment {
    const asked = bodyOf<{ sentAt?: string; reference: string }>(
      ctx,
      'RecordSubmissionRequest',
      body,
    )
    unlessArchived(p)
    const held = p.records.privacyAssessment
    if (held?.state !== 'sent' || held.sentAt === null)
      throw notWithTeam("this app's privacy assessment", held?.state)
    const day = sentDay(asked.sentAt, held.sentAt, ctx.now)
    const noon = vancouverNoon(day).toISOString()
    const row: Assessment = {
      ...held,
      state: 'submitted',
      submittedAt: noon,
      submittedBy: personOf(ctx.actor),
      externalTicketRef: asked.reference,
      updatedAt: iso(ctx.now),
    }
    p.records.privacyAssessment = row
    announce(
      p,
      ctx.now,
      'privacy_assessment.submitted',
      `privacy-assessment:${row.id}`,
      { sentAt: day, externalTicketRef: row.externalTicketRef },
      `${ctx.actor.displayName} recorded that the Manifest team submitted this app's privacy assessment to the UBC Privacy Office on ${dayInWords(noon)} (ticket ${asked.reference}).`,
      byOperator(ctx.actor),
    )
    return row
  }

  function returnAssessment(p: ProjectState, ctx: FleetContext): Assessment {
    unlessArchived(p)
    const held = p.records.privacyAssessment
    if (held?.state !== 'sent')
      throw notWithTeam("this app's privacy assessment", held?.state)
    const row: Assessment = { ...held, state: 'draft', updatedAt: iso(ctx.now) }
    p.records.privacyAssessment = row
    announce(
      p,
      ctx.now,
      'privacy_assessment.returned',
      `privacy-assessment:${row.id}`,
      { to: 'draft' },
      `${ctx.actor.displayName} handed this app's privacy assessment back to its owner, unsubmitted.`,
      byOperator(ctx.actor),
    )
    return row
  }

  // ─── UBC's answer (`launch/records.ts`'s `recordIamRegistration`, `recordPrivacyAssessment`) ───

  /** THE PLATFORM'S WRITE, not only its arrow: refused in its order, then upserted from the body. */
  function recordRegistration(
    p: ProjectState,
    body: unknown,
    ctx: FleetContext,
  ): Registration {
    const asked = bodyOf<{
      environment?: 'staging' | 'production'
      entityId: string
      acsUrl: string
      sloUrl: string
      registeredAttributes: string[]
      requestedAttributes?: string[]
      state: Registration['state']
      externalTicketRef?: string
      certFingerprint?: string
      certExpiresAt?: string
    }>(ctx, 'RecordIamRegistrationRequest', body)
    // (An empty `registeredAttributes` never gets here: the schema's `minItems: 1` refused it above.)
    unlessArchived(p)
    const environment = asked.environment ?? 'production'
    const existing = registrationAt(p, environment)
    const from = existing?.state ?? 'draft'
    refuseAroundTheTeam('the IAM registration', from, asked.state, {
      send: 'sendIamRegistration',
      submit: 'submitIamRegistration',
      handBack: 'returnIamRegistration',
    })
    const state =
      asked.state === from
        ? from
        : arrow(IAM_ARROWS, 'an IAM registration', from, asked.state)
    const registeredValuesChange =
      existing === null ||
      !sameAttributeSet(asked.registeredAttributes, existing.registeredAttributes) ||
      asked.acsUrl !== existing.acsUrl ||
      asked.sloUrl !== existing.sloUrl
    if (existing?.registeredAt != null) {
      if (asked.entityId !== existing.entityId)
        throw new MockRefusal(
          400,
          'LAUNCH_RECORD_INVALID',
          'the entityID is fixed at registration (§9): a new one is a new registration, not a change',
          'Record the entityID UBC IAM registered.',
        )
      if (state !== 'active' && registeredValuesChange)
        throw new MockRefusal(
          400,
          'LAUNCH_RECORD_INVALID',
          'what UBC IAM registered changes only when it registers it: record the registration ' +
            "'active' with the new values. A change it has not registered yet is requestedAttributes",
          'Keep registeredAttributes, acsUrl and sloUrl as UBC has them; put what you are asking for in requestedAttributes.',
        )
    }
    if (
      from === 'active' &&
      state === 'change_requested' &&
      (asked.requestedAttributes?.length ?? 0) === 0
    )
      throw new MockRefusal(
        400,
        'LAUNCH_RECORD_INVALID',
        'a change request names what it asks for: requestedAttributes',
        'List every attribute the app will ask for once UBC IAM agrees.',
      )
    // A RECORD THAT MOVES INTO `submitted` — or files a change from `active` — STAMPS NOW; nothing else does.
    const sentNow =
      state !== from &&
      (state === 'submitted' || (state === 'change_requested' && from === 'active'))
    const row = keepRegistration(p, {
      ...(existing ?? newRegistration(p, environment, ctx.now)),
      ...(sentNow ? { submittedAt: iso(ctx.now), submittedBy: personOf(ctx.actor) } : {}),
      entityId: asked.entityId,
      acsUrl: asked.acsUrl,
      sloUrl: asked.sloUrl,
      registeredAttributes: asked.registeredAttributes,
      // Cleared on `active`: UBC has answered, and what it registered is now the registration.
      requestedAttributes:
        state === 'active'
          ? null
          : (asked.requestedAttributes ?? existing?.requestedAttributes ?? null),
      // Moved by a record that REACHES `active` (or changes what an active one registered); cleared by a lapse.
      registeredAt:
        state === 'expired'
          ? null
          : state === 'active' && (from !== 'active' || registeredValuesChange)
            ? iso(ctx.now)
            : (existing?.registeredAt ?? null),
      state,
      changeRequestedFrom:
        state !== 'change_requested'
          ? null
          : from === 'submitted' || from === 'active'
            ? from
            : (existing?.changeRequestedFrom ?? null),
      externalTicketRef: asked.externalTicketRef ?? existing?.externalTicketRef ?? null,
      certFingerprint: asked.certFingerprint ?? null,
      certExpiresAt:
        asked.certExpiresAt === undefined
          ? null
          : new Date(asked.certExpiresAt).toISOString(),
      updatedAt: iso(ctx.now),
    })
    announce(
      p,
      ctx.now,
      'iam_registration.recorded',
      `iam-registration:${row.id}`,
      {
        state,
        environment,
        entityId: row.entityId,
        externalTicketRef: row.externalTicketRef,
        attributeCount: asked.registeredAttributes.length,
        changeRequestedFrom: row.changeRequestedFrom,
      },
      `${ctx.actor.displayName} recorded this app's ${environment} UBC IAM registration as ${state}${ticket(row.externalTicketRef)}.`,
      byOperator(ctx.actor),
    )
    return row
  }

  /** A registration nobody has drafted, as the upsert's insert writes it. */
  function newRegistration(
    p: ProjectState,
    environment: 'staging' | 'production',
    now: number,
  ): Registration {
    return {
      ...(environment === 'staging' ? f.STAGING_REGISTRATION : f.IAM_REGISTRATION),
      id: fleetId(KIND.registration, p.row.n, environment === 'staging' ? 1 : 2),
      projectId: p.project.id,
      environment,
      certFingerprint: null,
      certExpiresAt: null,
      requestedAttributes: null,
      registeredAt: null,
      state: 'draft',
      changeRequestedFrom: null,
      externalTicketRef: null,
      sentFrom: null,
      sentAt: null,
      sentBy: null,
      submittedAt: null,
      submittedBy: null,
      package: null,
      createdAt: iso(now),
      updatedAt: iso(now),
    }
  }

  function recordAssessment(
    p: ProjectState,
    body: unknown,
    ctx: FleetContext,
  ): Assessment {
    const asked = bodyOf<{
      state: Assessment['state']
      reviewer?: string
      externalTicketRef?: string
    }>(ctx, 'RecordPrivacyAssessmentRequest', body)
    unlessArchived(p)
    const existing = p.records.privacyAssessment
    const from = existing?.state ?? 'draft'
    refuseAroundTheTeam('the privacy assessment', from, asked.state, {
      send: 'sendPrivacyAssessment',
      submit: 'submitPrivacyAssessment',
      handBack: 'returnPrivacyAssessment',
    })
    const state =
      asked.state === from
        ? from
        : arrow(PIA_ARROWS, 'a privacy assessment', from, asked.state)
    const row: Assessment = {
      ...(existing ?? newAssessment(p, ctx.now)),
      state,
      // Set when it REACHES `approved`, cleared when it leaves.
      approvedAt: state === 'approved' ? (existing?.approvedAt ?? iso(ctx.now)) : null,
      ...(state !== from && state === 'submitted'
        ? { submittedAt: iso(ctx.now), submittedBy: personOf(ctx.actor) }
        : {}),
      // THE UPSERT WRITES THE REVIEWER AS SENT — none sent is none (`reviewer: input.reviewer ?? null`).
      reviewer: asked.reviewer ?? null,
      externalTicketRef: asked.externalTicketRef ?? existing?.externalTicketRef ?? null,
      updatedAt: iso(ctx.now),
    }
    p.records.privacyAssessment = row
    announce(
      p,
      ctx.now,
      'privacy_assessment.recorded',
      `privacy-assessment:${row.id}`,
      { state: row.state, externalTicketRef: row.externalTicketRef },
      `${ctx.actor.displayName} recorded this app's privacy assessment as ${row.state}${ticket(row.externalTicketRef)}.`,
      byOperator(ctx.actor),
    )
    return row
  }

  /** An assessment nobody has drafted, as the upsert's insert writes it. */
  function newAssessment(p: ProjectState, now: number): Assessment {
    return {
      ...f.PRIVACY_ASSESSMENT,
      id: fleetId(KIND.assessment, p.row.n, 1),
      projectId: p.project.id,
      state: 'draft',
      reviewer: null,
      approvedAt: null,
      externalTicketRef: null,
      sentAt: null,
      sentBy: null,
      gapAnswers: null,
      submittedAt: null,
      submittedBy: null,
      draft: null,
      createdAt: iso(now),
      updatedAt: iso(now),
    }
  }

  // ─── An agent's question (`api/routes/pending-actions.ts`, `tokens/pending.ts`) ───

  /**
   * THE OPERATOR IS A MEMBER OF NO FLEET PROJECT, so answering a question borrows an owner's capability:
   * §26's reason is asked — after the body, before anything else — and kept beside their name. A
   * confirmation steps up (when the mock plays it); a rejection never does.
   */
  function answerQuestion(
    p: ProjectState,
    pendingActionId: string,
    decision: 'confirmed' | 'rejected',
    body: unknown,
    ctx: FleetContext,
  ): Schemas['PendingAction'] {
    const asked = bodyOf<{ reason?: string }>(
      ctx,
      decision === 'rejected' ? 'RejectPendingActionRequest' : 'EmptyRequest',
      body,
    )
    const reason = assertAdminReason(ctx.adminReason)
    unlessArchived(p)
    const index = p.pendingActions.findIndex((a) => a.id === pendingActionId)
    const held = p.pendingActions[index]!
    if (decision === 'confirmed' && ctx.stepUpRequired && !ctx.steppedUp)
      throw stepUpRefusal(held.action)
    if (held.state !== 'pending') throw alreadyAnswered(held.state)
    if (Date.parse(held.expiresAt) <= ctx.now) throw alreadyAnswered('expired')
    const answered: Schemas['PendingAction'] = {
      ...held,
      state: decision,
      resolvedAt: iso(ctx.now),
      waitingSeconds: Math.round((ctx.now - Date.parse(held.createdAt)) / 1000),
      reason: decision === 'rejected' ? (asked.reason ?? null) : held.reason,
    }
    p.pendingActions[index] = answered
    const what = whatIsAsked(held)
    announce(
      p,
      ctx.now,
      decision === 'rejected' ? 'pending_action.rejected' : 'pending_action.confirmed',
      `pending-action:${held.id}`,
      {
        pendingActionId: held.id,
        tokenId: held.tokenId,
        action: held.action,
        resolvedBy: ctx.actor.id,
        ...(decision === 'rejected' ? { reason: asked.reason ?? '' } : {}),
      },
      asAdministrator(
        decision === 'confirmed'
          ? `${ctx.actor.displayName} confirmed an agent's request to ${what}. It may do it once.`
          : `${ctx.actor.displayName} refused an agent's request to ${what}: ${asked.reason ?? ''}`,
        reason,
        ctx.actor.displayName,
      ),
      { name: ctx.actor.displayName, asAdministrator: true, reason, token: null },
    )
    return answered
  }

  return {
    t0,
    ids: {
      projectId: projects.map((p) => p.project.id),
      environmentId: [...owners.environmentId.keys()],
      instanceId: [...owners.instanceId.keys()],
      releaseId: [...owners.releaseId.keys()],
      // LIVE: a preview is held from the moment it is taken.
      get previewId() {
        return [...owners.previewId.keys()]
      },
      pendingActionId: [...owners.pendingActionId.keys()],
      tokenId: [...owners.tokenId.keys()],
    },
    fleetRows: () => projects.map(fleetRow),
    queueItems,
    holds: (params) => named(params) !== undefined,
    answer,
    events: (projectId) => [...(byProject.get(projectId)?.events ?? [])],
    onEvent(projectId, listener) {
      const set = listeners.get(projectId) ?? new Set()
      set.add(listener)
      listeners.set(projectId, set)
      return () => set.delete(listener)
    },
  }
}

// ─── The platform's sentences that more than one record writes ───

const ticket = (ref: string | null): string => (ref === null ? '' : ` (ticket ${ref})`)
/** *", asking for ubcEduCwlPuid, mail, sn"* — in the order it was asked (`launch/queue.ts`). */
const asking = (attributes: readonly string[] | null): string =>
  (attributes ?? []).length === 0 ? '' : `, asking for ${(attributes ?? []).join(', ')}`
/** The set watcher's list of times (`releases/watch.ts`). */
const list_ = (times: string[]): string =>
  times.length === 0 ? 'none' : `${times.join(', ')} UTC`

/** A change's package warning — the platform's words, as the mock's change stage has them. */
const CHANGE_DRAWN =
  'A change to a live registration is drawn from the newest valid manifest: that is where the change is being made.'

/** `sn`, read — the attribute a change asks UBC for (`launch/package.ts`'s purpose, verbatim). */
const SN: Schemas['RegistrationPackage']['attributes'][number] = {
  name: 'sn',
  oid: 'urn:oid:2.5.4.4',
  purpose:
    'The person’s last name, shown with their first name so people can tell each other apart.',
  usedAt: [{ path: 'public/app.js', line: 14 }],
  justification:
    'The person’s last name, shown with their first name so people can tell each other apart. The app shows it to the person in the browser, in public/app.js:14.',
  unused: false,
}

/** An attribute the app asks for and does not read — `launch/package.ts`'s words. */
const unreadAttribute = (
  name: string,
): Schemas['RegistrationPackage']['attributes'][number] => ({
  ...SN,
  name,
  usedAt: [],
  justification:
    'The app asks for it and does not read it anywhere Manifest looked — remove it from `auth.attributes` before you send this.',
  unused: true,
})
const unreadWarning = (name: string): string =>
  `The app asks for ${name} and does not read it anywhere Manifest looked. Remove it from auth.attributes, validate the manifest and draft this again before you send it — UBC IAM asks why an app needs each attribute.`

/** §14's repair prompt (`observability/incidents.ts`'s `incidentPrompt`), by the Incident's cause. */
function promptOf(incident: Incident, slug: string, kind: string): string {
  const opening = {
    deploy: `The application "${slug}" failed to start in its ${kind} environment.`,
    exit:
      `The application "${slug}" stopped while it was serving in its ${kind} environment. ` +
      'The platform is starting it again; the rest of its copies, if any, kept serving.',
    exit_stopped:
      `The application "${slug}" keeps stopping in its ${kind} environment, so the platform ` +
      'has stopped replacing it: nothing more is started until the app is deployed again.',
  }[incident.cause]
  const ask = {
    deploy: 'Change the application code or manifest.yaml so that this check passes, and',
    exit: 'Change the application code so that it keeps running, and',
    exit_stopped:
      'Change the application code so that it keeps running, deploy it again, and',
  }[incident.cause]
  return [
    opening,
    '',
    `What the platform checked: ${incident.failedCheck}`,
    `How it ended: ${incident.exitReason}`,
    '',
    'What changed since the last time it started successfully:',
    incident.diffSinceHealthy,
    '',
    'The last lines the application printed:',
    incident.logTail,
    '',
    ask,
    'explain the change in one sentence a non-engineer can read.',
  ].join('\n')
}

/** `listQueue` with the fleet's items: oldest first, then the kind's place, then the subject (`launch/queue.ts`). */
export function withFleetItems(
  queue: Schemas['Queue'],
  items: QueueItem[],
): Schemas['Queue'] {
  const all = [...queue.items, ...items].sort(
    (a, b) =>
      Date.parse(a.since) - Date.parse(b.since) ||
      QUEUE_KINDS.indexOf(a.kind) - QUEUE_KINDS.indexOf(b.kind) ||
      a.subjectId.localeCompare(b.subjectId),
  )
  return { items: all, oldestSince: all[0]?.since ?? null, truncated: queue.truncated }
}

/** `listFleet` with the fleet's rows: newest first (`projects/fleet.ts`). */
export function withFleetRows(
  rows: Schemas['Fleet'],
  fleet: Schemas['Fleet'],
): Schemas['Fleet'] {
  return [...rows, ...fleet].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  )
}

/** The control frame that ends a fleet project's replay — the mock's own, for that project. */
export const readyFor = (projectId: string): typeof READY => ({ ...READY, projectId })

const QUEUE_KINDS: readonly QueueItem['kind'][] = [
  'release-approval',
  'iam-registration-to-submit',
  'iam-change-to-file',
  'privacy-assessment-to-submit',
  'iam-registration',
  'iam-change-request',
  'privacy-assessment',
]

// ─── A sign-off's facts (`releases/approval.ts`, `releases/preview.ts`, `spec/diff.ts`) ───

/** How long a preview may stretch "shown at decision time" (`PREVIEW_TTL_MS`). */
const PREVIEW_TTL_MS = 30 * MINUTE

type Sensitive = Schemas['ApprovalDiff']['sensitiveFields'][number]
type Change = Schemas['ApprovalDiff']['changes'][number]
type Config = Release['config']['production']
/** `DiffFacts`: the snapshot without what is written — the summary, its source and the verdict. */
type Facts = Omit<
  Schemas['ApprovalDiff'],
  'summary' | 'summarySource' | 'summaryWithheldBecause' | 'summaryExposures' | 'review'
>

/** What each sensitive field means when it changes — `spec/diff.ts`'s `SECURITY_NOTES`, verbatim. */
const SECURITY_NOTES: Record<Sensitive, string> = {
  services:
    'A service stores data somewhere new — the PIA’s “where it is stored” may no longer be accurate.',
  'auth.attributes':
    'The app receives different personal information about every person who signs in. In production it must stay within what UBC IAM registered, and it is an input to the PIA.',
  'egress.allow':
    'The app may send data to a host it could not reach before. Default-deny egress is the containment for unreviewed code, and this widens it. An input to the PIA’s “where it flows”.',
  resources:
    'More CPU, memory, processes or disk: cost and blast radius rather than data.',
  'data.classification':
    'The app now claims a different class of data, which bounds the models it may use and is an input to the PIA.',
  'ai.models':
    'A model change can move personal information to a different jurisdiction, which invalidates an approved PIA — the administrator decides whether the PIA must be reviewed again.',
  blueprint:
    'The blueprint is the build definition: a change replaces the Dockerfile, base image and knowledge pack beneath the app.',
}

/** `summary.ts`'s answer to an empty diff, which needs no model. */
const NO_CHANGES = 'Nothing in manifest.yaml changed since the last approved release.'

const sortedOf = (xs: readonly string[]): string[] => [...xs].sort()
const sameAttributeSet = (a: readonly string[], b: readonly string[]): boolean =>
  sortedOf([...new Set(a)]).join('\u0000') === sortedOf([...new Set(b)]).join('\u0000')
const listOrNone = (xs: readonly string[]): string =>
  xs.length === 0 ? 'none' : xs.join(', ')
const servicesOf = (c: Config): string[] =>
  c.services.map((x) => `${x.type}@${x.version}`)

/** A key-order-insensitive serialisation (`spec/diff.ts`'s `stable`). */
const stable = (value: unknown): string =>
  JSON.stringify(value ?? null, (_key, v: unknown) =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : v,
  )

/**
 * A stored snapshot's facts — the WRITTEN keys taken out by name (`factsOf`), so a key the document adds
 * later is a fact by default and compared: the conservative direction.
 */
function factsIn(diff: Schemas['ApprovalDiff']): Facts {
  const facts: Record<string, unknown> = { ...diff }
  for (const key of [
    'summary',
    'summarySource',
    'summaryWithheldBecause',
    'summaryExposures',
    'review',
  ])
    delete facts[key]
  return facts as Facts
}

/** `isSensitiveDiff`'s fields that changed, in `SENSITIVE_FIELDS` order (a fleet project's blueprint never does). */
function sensitiveBetween(was: Config, now: Config): Sensitive[] {
  const fields: Sensitive[] = []
  if (!sameAttributeSet(servicesOf(was), servicesOf(now))) fields.push('services')
  if (!sameAttributeSet(was.auth.attributes, now.auth.attributes))
    fields.push('auth.attributes')
  if (!sameAttributeSet(was.egressAllow, now.egressAllow)) fields.push('egress.allow')
  if (stable(was.resources) !== stable(now.resources)) fields.push('resources')
  if (was.classification !== now.classification) fields.push('data.classification')
  if (!sameAttributeSet(was.ai.models, now.ai.models)) fields.push('ai.models')
  return fields
}

/** `setChange`: what was added, then what was removed, in the file's own vocabulary. */
function setChange(
  path: string,
  before: readonly string[],
  after: readonly string[],
  added: (item: string) => string,
  removed: (item: string) => string,
): Change | undefined {
  if (sameAttributeSet(before, after)) return undefined
  const parts = [
    ...sortedOf(after.filter((x) => !before.includes(x))).map(added),
    ...sortedOf(before.filter((x) => !after.includes(x))).map(removed),
  ]
  return {
    path,
    from: listOrNone(sortedOf(before)),
    to: listOrNone(sortedOf(after)),
    summary: parts.length === 0 ? `changed ${path}` : parts.join('; '),
  }
}

/**
 * `describeDiff`, over what a fleet project's releases differ in — egress, the level, the sign-in's
 * attributes and the models — in its order (every other field is the fixture's, the same in each).
 */
function changesBetween(was: Config, now: Config): Change[] {
  return [
    setChange(
      'egress.allow',
      was.egressAllow,
      now.egressAllow,
      (host) => `now allows ${host}`,
      (host) => `no longer allows ${host}`,
    ),
    was.classification === now.classification
      ? undefined
      : {
          path: 'data.classification',
          from: was.classification,
          to: now.classification,
          summary: `now declares ${now.classification} data instead of ${was.classification}`,
        },
    setChange(
      'auth.attributes',
      was.auth.attributes,
      now.auth.attributes,
      (attribute) => `now requests the ${attribute} attribute`,
      (attribute) => `no longer requests the ${attribute} attribute`,
    ),
    setChange(
      'ai.models',
      was.ai.models,
      now.ai.models,
      (model) => `now uses ${model}`,
      (model) => `no longer uses ${model}`,
    ),
  ].filter((c): c is Change => c !== undefined)
}

/** The model's sentence for a change — what it could expose. The mock's, standing in for a model's. */
function exposureOf(change: Change): string {
  switch (change.path) {
    case 'egress.allow':
      return `What people type into the app can now reach ${change.to}, which it could not reach before.`
    case 'ai.models':
      return `Answers may now be written by ${change.to}, so what people type can reach a model it did not reach before.`
    case 'data.classification':
      return `The app now says it holds ${change.to} data, which narrows the models it may use and what its privacy assessment covers.`
    default:
      return `The app’s ${change.path} changed from ${change.from} to ${change.to}.`
  }
}

// ─── The records' arrows (`launch/transitions.ts`) ───

type IamState = Registration['state']
type PiaState = Assessment['state']

const IAM_ARROWS: Record<IamState, readonly IamState[]> = {
  draft: ['submitted'],
  sent: [],
  submitted: ['active', 'change_requested'],
  active: ['change_requested', 'expired'],
  change_requested: ['submitted', 'expired'],
  expired: ['submitted'],
}
const PIA_ARROWS: Record<PiaState, readonly PiaState[]> = {
  draft: ['submitted'],
  sent: [],
  submitted: ['approved', 'draft'],
  approved: ['draft'],
}

/** `iamTransition` / `piaTransition`: an arrow that exists, or the machines' refusal. */
function arrow<S extends string>(
  arrows: Record<S, readonly S[]>,
  what: string,
  from: S,
  to: S,
): S {
  const allowed = arrows[from]
  if (allowed.includes(to)) return to
  throw new MockRefusal(
    409,
    'LAUNCH_TRANSITION_INVALID',
    `${what} cannot go from '${from}' to '${to}' — from '${from}' it can only become ` +
      `${allowed.length === 0 ? 'nothing' : allowed.map((s) => `'${s}'`).join(' or ')}`,
  )
}

/** WITH THE MANIFEST TEAM, NO RECORD MOVES IT (`refuseRecordAroundTheTeam`) — naming who does. */
function refuseAroundTheTeam(
  what: 'the IAM registration' | 'the privacy assessment',
  from: string,
  to: string,
  ops: { send: string; submit: string; handBack: string },
): void {
  if (from === 'sent')
    throw new MockRefusal(
      409,
      'LAUNCH_TRANSITION_INVALID',
      `${what} is with the Manifest team ('sent'): record that the team submitted it (${ops.submit}), or hand it back to its owner (${ops.handBack}) — it is not recorded here`,
    )
  if (to === 'sent')
    throw new MockRefusal(
      409,
      'LAUNCH_TRANSITION_INVALID',
      `${what} goes to the Manifest team ('sent') only when its owner sends it (${ops.send}) — it is not recorded here`,
    )
}

// ─── An agent's question, answered (`tokens/pending.ts`) ───

/** `PendingActionResolvedError`, as the platform's envelope writes it. */
const alreadyAnswered = (state: string): MockRefusal =>
  new MockRefusal(
    409,
    'PENDING_ACTION_RESOLVED',
    `this pending action was already ${state}`,
    'Reload the queue: somebody has already answered this one.',
  )

/** `whatIsAsked`: what the retry would do, in words — a person by name, or as the request named them. */
function whatIsAsked(action: Schemas['PendingAction']): string {
  const object = action.object
  if (object === null)
    return `${action.summary.charAt(0).toLowerCase()}${action.summary.slice(1)}`
  const person = (p: {
    namedBy: string
    value: string
    member: { displayName: string } | null
  }): string =>
    p.member !== null
      ? p.member.displayName
      : p.namedBy === 'cwlLogin'
        ? `the person whose CWL login is ${p.value}`
        : p.namedBy === 'email'
          ? `the person whose email is ${p.value}`
          : p.namedBy === 'puid'
            ? 'the person the request named by their PUID'
            : `the person with user id ${p.value}`
  switch (object.kind) {
    case 'member':
      return `make ${person(object.person)} ${object.role === 'owner' ? 'an owner' : 'a collaborator'} of this project`
    case 'member-removal':
      return `remove ${person(object.person)} from this project`
    case 'deploy':
      return (
        `deploy release ${object.release.id.slice(0, 8)}` +
        (object.release.commitSha === null
          ? ''
          : ` (commit ${object.release.commitSha.slice(0, 12)})`) +
        ` to ${object.environment.kind}`
      )
  }
}

/**
 * §26: AN ADMINISTRATOR ACTING WITH AN OWNER'S CAPABILITY, AS NO MEMBER — every sentence published while
 * they do says so, with the reason (`observability/events.ts`'s `publishEvent`).
 */
function asAdministrator(
  sentence: string,
  reason: string,
  name: string = OPERATOR.displayName,
): string {
  return `${sentence} ${name} acted as a platform administrator — reason: '${reason}'.`
}
