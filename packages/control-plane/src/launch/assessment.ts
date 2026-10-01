import type { ModelEntry } from '../ai/index.js'
import type { Classification, ManifestSpec } from '../spec/index.js'
import type { Contact } from '../sso/index.js'
import { ATTRIBUTE_PURPOSES } from './package.js'
import { vancouverDayInWords } from './records.js'

/**
 * D19'S PRIVACY-ASSESSMENT DRAFT (§9 as Spec action 4 applied it; the launch path plan's Task 11,
 * Decision 16): what the owner reviews, completes and sends UBC's Privacy Office — §9's six rows,
 * each a list of FACTS with where Manifest read them, and the GAPS only the owner can fill, named
 * rather than left out (§9: *"what the app keeps in its own database, where UBC will host it"*).
 *
 * **Derived, never written by a model** (Decision 13's rule for the registration, kept here): a
 * document sent to the Privacy Office is no place for prose that can be wrong. Every sentence is a
 * function of the manifest, the members, the catalogue and the drivers, held by `assessment.test.ts`.
 *
 * **It says what the platform does TODAY, not what the design intends**: production's data is not
 * backed up on this platform yet (the Docker driver's `snapshotService` is not implemented), so the
 * draft does not say it is.
 */

/** §9's six rows, in its order. */
export type SectionId =
  'collected' | 'stored' | 'flows' | 'retention' | 'accountable' | 'hosting'

/** One thing Manifest knows, and where it read it — `manifest.yaml: auth.attributes`, the catalogue. */
export interface Fact {
  label: string
  value: string
  source: string
}

export interface Section {
  id: SectionId
  title: string
  facts: Fact[]
  /** What Manifest cannot know, for the owner to add before sending. */
  gaps: string[]
}

export interface PrivacyAssessmentDraft {
  /** The app it assesses, as it was named when drafted. */
  project: { slug: string; name: string }
  /** When Manifest drafted it — the earliest day a person can have sent it. */
  generatedAt: string
  /** The commit whose `manifest.yaml` it was drawn from. */
  fromCommit: string
  sections: Section[]
  /** What the caller knows the draft must say first — production drawn without a candidate. */
  warnings: string[]
  /** The whole draft as plain text, for the owner to paste into the Privacy Office's form. */
  text: string
}

export interface AssessmentInput {
  generatedAt: Date
  fromCommit: string
  spec: ManifestSpec
  /**
   * Whether `manifest.yaml` WRITES `data.retention_days`. The schema defaults it, so the stored spec
   * always carries a number — and a draft that stated the default as the owner's choice would say
   * something nobody decided.
   */
  retentionDeclared: boolean
  project: { slug: string; name: string }
  members: { name: string; email: string; role: 'owner' | 'collaborator' }[]
  /** The platform's contacts — configured, or else its longest-serving administrator. */
  platformContacts: Contact[]
  /** The model catalogue's entries; null when AI is switched off on this platform. */
  catalogue: readonly ModelEntry[] | null
  /** The runtime driver's name — where Manifest runs the app. */
  runtime: string
  /** Where the project's code is kept. */
  repository: { provider: 'local' } | { provider: 'github'; organisation: string }
  warnings: string[]
}

const TITLES: Readonly<Record<SectionId, string>> = {
  collected: 'What personal information the app collects',
  stored: 'Where it is stored',
  flows: 'Where it flows',
  retention: 'How long it is kept, and how it is disposed of',
  accountable: 'Who is accountable',
  hosting: 'Hosting and jurisdiction',
}

const AUTH_ATTRIBUTES = 'manifest.yaml: auth.attributes'
const MODELS = 'manifest.yaml: ai.models; the model catalogue'
const ENVIRONMENTS = 'Manifest’s environments'
const MEMBERS = 'the project’s members'
const REPOSITORY = 'the project’s repository'

/** A word a person reads — `internal` as *Internal*, for the start of a sentence. */
const capitalised = (word: string) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`

/** Approved for `confidential` data means on-premise only (§7: such an app resolves to nothing else). */
const staysOnPremise = (ceiling: Classification) => ceiling === 'confidential'

function collected(spec: ManifestSpec): Section {
  const facts: Fact[] =
    spec.auth.provider === 'cwl'
      ? spec.auth.attributes.map((name) => ({
          label: name,
          value:
            (ATTRIBUTE_PURPOSES as Readonly<Record<string, string>>)[name] ??
            'An attribute Manifest has no description of: say why the app needs it.',
          source: AUTH_ATTRIBUTES,
        }))
      : [
          {
            label: 'Sign-in',
            value:
              'The app signs nobody in, so UBC releases nothing about the people who use it.',
            source: 'manifest.yaml: auth.provider',
          },
        ]
  return {
    id: 'collected',
    title: TITLES.collected,
    facts,
    gaps: [
      'What the app keeps in its own database — the records it stores about the people who use it, beyond what CWL releases. Manifest cannot see inside the app’s data: describe it here.',
    ],
  }
}

function stored(spec: ManifestSpec): Section {
  const facts: Fact[] =
    spec.services.length === 0
      ? [
          {
            label: 'Services',
            value: 'The app declares no service, so Manifest keeps no database for it.',
            source: 'manifest.yaml: services',
          },
        ]
      : [
          ...spec.services.map((s) => ({
            label: s.name,
            value: `A ${s.type} database, version ${s.version}, which Manifest runs for the app — one in each environment.`,
            source: 'manifest.yaml: services',
          })),
          {
            label: 'Sandbox',
            value:
              'Where the app is built and tried: its data is thrown away when the sandbox is.',
            source: ENVIRONMENTS,
          },
          {
            label: 'Staging',
            value:
              'Where the app is tested before launch: its data is kept, never backed up, and resettable — it can be cleared at any time.',
            source: ENVIRONMENTS,
          },
          {
            label: 'Production',
            value:
              'Where people use the app: its data is kept while the app runs. It is not backed up on this platform yet.',
            source: ENVIRONMENTS,
          },
        ]
  return {
    id: 'stored',
    title: TITLES.stored,
    facts,
    gaps: [
      'Whether this assessment covers the app’s use at staging by real people — colleagues and students signing in to test it — or staging needs cover of its own, is a question for the Privacy Office that is not yet answered: ask it.',
    ],
  }
}

/** One model, in the flows row: what leaves, and where to. */
function modelFlow(name: string, catalogue: readonly ModelEntry[] | null): Fact {
  const entry = catalogue?.find((m) => m.name === name)
  const value =
    catalogue === null
      ? 'AI is switched off on this platform, so Manifest cannot say where this model sends data.'
      : entry === undefined
        ? 'This model is not in the platform’s model catalogue now, so Manifest cannot say where it sends data.'
        : staysOnPremise(entry.maxClassification)
          ? 'Approved for confidential data: it runs on on-premise hardware, so what the app sends it stays there.'
          : `Approved for ${entry.maxClassification} data at most: it may be answered by a provider off-premise, so what the app sends it may leave UBC.`
  return { label: name, value, source: MODELS }
}

function flows(input: AssessmentInput): Section {
  const { spec, catalogue } = input
  const ceiling = spec.data.classification
  const facts: Fact[] = [
    {
      label: 'Classification',
      value:
        ceiling === 'confidential'
          ? 'Confidential — every AI model the app uses must run on on-premise hardware.'
          : `${capitalised(ceiling)} — every AI model the app uses must be approved for ${ceiling} data.`,
      source: 'manifest.yaml: data.classification',
    },
    ...(spec.egress.allow.length === 0
      ? [
          {
            label: 'Outside connections',
            value:
              'The app may connect to nothing outside the platform: every other address is refused.',
            source: 'manifest.yaml: egress.allow',
          },
        ]
      : spec.egress.allow.map((host) => ({
          label: host,
          value: `The app may send data to ${host}, outside the platform.`,
          source: 'manifest.yaml: egress.allow',
        }))),
    ...(spec.ai.models.length === 0
      ? [
          {
            label: 'AI',
            value: 'The app uses no AI model.',
            source: 'manifest.yaml: ai.models',
          },
        ]
      : spec.ai.models.map((name) => modelFlow(name, catalogue))),
    ...(input.repository.provider === 'github'
      ? [
          {
            label: 'Changes to the app',
            value: `The names of the people who change the app through Manifest are sent to GitHub (${input.repository.organisation}), as the author of each change.`,
            source: REPOSITORY,
          },
        ]
      : []),
  ]
  const unknown =
    catalogue === null
      ? spec.ai.models
      : spec.ai.models.filter((name) => !catalogue.some((m) => m.name === name))
  return {
    id: 'flows',
    title: TITLES.flows,
    facts,
    gaps:
      unknown.length === 0
        ? []
        : [
            `Where ${unknown.join(', ')} sends the app’s data could not be read when this was drafted: ask an administrator, then draft this again.`,
          ],
  }
}

function retention(input: AssessmentInput): Section {
  const days = input.spec.data.retention_days
  return {
    id: 'retention',
    title: TITLES.retention,
    facts: [
      input.retentionDeclared
        ? {
            label: 'How long',
            value: `The app keeps its data for ${days} days.`,
            source: 'manifest.yaml: data.retention_days',
          }
        : {
            label: 'How long',
            value: `The app keeps its data for ${days} days — Manifest’s default, because the manifest does not say.`,
            source: 'Manifest’s default',
          },
    ],
    gaps: [
      ...(input.retentionDeclared
        ? []
        : [
            'No retention declared — add data.retention_days to manifest.yaml, with how long the app must keep its data.',
          ]),
      'How the app’s data is disposed of when the app is retired follows UBC’s sunset procedure, which the Privacy Office has not set out yet: say what should happen to it.',
    ],
  }
}

function accountable(input: AssessmentInput): Section {
  const person = (c: Contact) => `${c.name} <${c.email}>`
  return {
    id: 'accountable',
    title: TITLES.accountable,
    facts: [
      ...input.members
        .filter((m) => m.role === 'owner')
        .map((m) => ({ label: 'Owner', value: person(m), source: MEMBERS })),
      ...input.members
        .filter((m) => m.role !== 'owner')
        .map((m) => ({ label: 'Collaborator', value: person(m), source: MEMBERS })),
      ...input.platformContacts.map((c) => ({
        label: 'Platform contact',
        value: person(c),
        source: 'the platform’s contacts',
      })),
    ],
    gaps:
      input.platformContacts.length === 0
        ? [
            'No platform contact is set, and the platform has no administrator to name: ask who answers for the platform, and add them.',
          ]
        : [],
  }
}

/** Where a runtime driver places an app, in words — the one this platform has, else its name. */
const RUNTIME_PLACES: Readonly<Record<string, string>> = {
  docker: 'In containers on the machine Manifest runs on, under its Docker driver.',
}

function hosting(input: AssessmentInput): Section {
  const { spec, catalogue } = input
  const entries = spec.ai.models.flatMap((name) => {
    const entry = catalogue?.find((m) => m.name === name)
    return entry === undefined ? [] : [entry]
  })
  const offPremise = entries.filter((e) => !staysOnPremise(e.maxClassification))
  return {
    id: 'hosting',
    title: TITLES.hosting,
    facts: [
      {
        label: 'Where the app runs',
        value:
          RUNTIME_PLACES[input.runtime] ?? `Under Manifest’s ${input.runtime} driver.`,
        source: 'the platform’s runtime driver',
      },
      {
        label: 'Where its code is kept',
        value:
          input.repository.provider === 'github'
            ? `In a private repository in the GitHub organisation ${input.repository.organisation}.`
            : 'In a repository on the machine Manifest runs on.',
        source: REPOSITORY,
      },
      ...entries.map((e) => ({
        label: e.name,
        value: `Approved for ${e.maxClassification} data at most.`,
        source: 'the model catalogue',
      })),
    ],
    gaps: [
      'Where UBC will host the app in production is not decided yet: UBC has not chosen the infrastructure Manifest runs on there.',
      ...(offPremise.length === 0
        ? []
        : [
            `Whether the app’s ${spec.data.classification} data may reach an AI provider outside Canada is the Privacy Office’s to say: ${offPremise.map((e) => e.name).join(', ')} may be answered off-premise.`,
          ]),
    ],
  }
}

/**
 * The draft, from values its caller derived. **Pure**: `draftPrivacyAssessment` reads the manifest,
 * the people, the catalogue and the drivers; this decides only what the draft says about them.
 */
export function assembleAssessment(input: AssessmentInput): PrivacyAssessmentDraft {
  const draft: Omit<PrivacyAssessmentDraft, 'text'> = {
    project: { slug: input.project.slug, name: input.project.name },
    generatedAt: input.generatedAt.toISOString(),
    fromCommit: input.fromCommit,
    sections: [
      collected(input.spec),
      stored(input.spec),
      flows(input),
      retention(input),
      accountable(input),
      hosting(input),
    ],
    warnings: input.warnings,
  }
  return { ...draft, text: renderAssessmentText(draft) }
}

/**
 * THE DRAFT AS PLAIN TEXT, to paste into the Privacy Office's form — no HTML, no PDF (Decision 16).
 * Every fact with where it came from, and every gap under *"For you to add"*. Nothing a person would
 * not recognise: a value is always a sentence, never an absent field's name.
 */
export function renderAssessmentText(
  draft: Omit<PrivacyAssessmentDraft, 'text'>,
): string {
  const lines = [
    'Privacy impact assessment — draft',
    `${draft.project.name} (${draft.project.slug})`,
    `Drafted by Manifest on ${vancouverDayInWords(new Date(draft.generatedAt))}, from commit ${draft.fromCommit.slice(0, 12)}.`,
  ]
  if (draft.warnings.length > 0)
    lines.push('', 'Before you send this:', ...draft.warnings.map((w) => `  - ${w}`))
  draft.sections.forEach((s, i) => {
    lines.push('', `${i + 1}. ${s.title}`)
    for (const f of s.facts) lines.push(`  - ${f.label}: ${f.value} (from ${f.source})`)
    if (s.gaps.length > 0)
      lines.push('  For you to add:', ...s.gaps.map((g) => `  - ${g}`))
  })
  return `${lines.join('\n')}\n`
}

/**
 * A STORED DRAFT, READ BACK — or null for a row with none. `generated_draft` is `jsonb`, written only
 * by `draftPrivacyAssessment`, so this checks the fields its readers use rather than trusting a cast:
 * the submission's day (`generatedAt`), the sections and the text.
 */
export function readAssessmentDraft(value: unknown): PrivacyAssessmentDraft | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Partial<PrivacyAssessmentDraft>
  return typeof v.project === 'object' &&
    v.project !== null &&
    typeof v.generatedAt === 'string' &&
    typeof v.fromCommit === 'string' &&
    typeof v.text === 'string' &&
    Array.isArray(v.sections) &&
    Array.isArray(v.warnings)
    ? (v as PrivacyAssessmentDraft)
    : null
}
