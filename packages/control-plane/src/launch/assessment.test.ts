import { describe, expect, it } from 'vitest'
import type { ModelEntry } from '../ai/index.js'
import { manifestSchema } from '../spec/index.js'
import {
  assembleAssessment,
  readAssessmentDraft,
  renderAssessmentText,
  type AssessmentInput,
  type Section,
} from './assessment.js'
import { ATTRIBUTE_PURPOSES } from './package.js'

/**
 * D19'S PRIVACY-ASSESSMENT DRAFT, ASSEMBLED (the launch path plan's Task 11; Decision 16): §9's six
 * rows — what is collected, where it is stored, where it flows, how long it is kept, who is
 * accountable, where it is hosted — each a list of facts with where Manifest read them, and the gaps
 * only the owner can fill, named rather than left out. Pure: the caller reads the manifest, the
 * people, the catalogue and the drivers.
 *
 * **Every fact is what the platform does TODAY** (sitting 8's whole-branch review, I1, I2, M1): no
 * retention Manifest does not enforce, no default stated as the owner's choice, no deletion that does
 * not happen.
 */

const SPEC = manifestSchema.parse({
  manifest: 1,
  name: 'lp-sample',
  blueprint: 'node-ts-mongo@1',
  runtime: { port: 3000 },
  services: [{ type: 'mongo', version: '7', name: 'db' }],
  auth: { provider: 'cwl', attributes: ['ubcEduCwlPuid', 'mail'] },
  ai: { models: ['default-chat', 'default-chat-onprem'] },
  egress: { allow: ['api.ubc.ca'] },
  data: { classification: 'internal', retention_days: 180 },
})

const CATALOGUE: ModelEntry[] = [
  { name: 'default-chat', maxClassification: 'internal', kind: 'chat' },
  { name: 'default-chat-onprem', maxClassification: 'confidential', kind: 'chat' },
  { name: 'default-embed', maxClassification: 'internal', kind: 'embedding' },
]

const input = (over: Partial<AssessmentInput> = {}): AssessmentInput => ({
  generatedAt: new Date('2026-10-01T15:00:00.000Z'),
  fromCommit: 'a'.repeat(40),
  spec: SPEC,
  declared: { retention: true, classification: true },
  project: { slug: 'lp-sample', name: 'Lab Sample' },
  members: [
    { name: 'Bio Prof', email: 'bio.prof@example.ubc.ca', role: 'owner' },
    {
      name: 'Bio Colleague',
      email: 'bio.colleague@example.ubc.ca',
      role: 'collaborator',
    },
  ],
  platformContacts: [{ name: 'Platform Admin', email: 'admin@example.ubc.ca' }],
  catalogue: CATALOGUE,
  runtime: 'docker',
  repository: { provider: 'local' },
  warnings: [],
  ...over,
})

/** A spec with everything optional left out — the sparsest manifest that validates. */
const BARE = manifestSchema.parse({
  manifest: 1,
  name: 'lp-bare',
  blueprint: 'fixture-node@1',
  runtime: { port: 3000 },
})
const UNDECLARED = { retention: false, classification: false }

const section = (draft: { sections: Section[] }, id: Section['id']): Section =>
  draft.sections.find((s) => s.id === id)!

const valueOf = (s: Section, label: string) => s.facts.find((f) => f.label === label)

const INCIDENT_LOGS = {
  label: 'Incident logs',
  value:
    'When a deploy of the app fails, Manifest keeps the last 200 lines of the app’s output with the Incident, with secrets removed. They can include what the app printed about the people using it.',
  source: 'the platform',
}
const DELETION = {
  label: 'Deletion',
  value:
    'Manifest deletes nothing it keeps for the app on a schedule — neither its databases nor its Incident logs. A project that never launched can be deleted, which destroys its databases; one that has launched cannot be deleted yet.',
  source: 'the platform',
}
const SUNSET =
  'How the app’s data is disposed of when the app is retired follows UBC’s sunset procedure, which the Privacy Office has not set out yet: say what should happen to it.'
const BREACH =
  'Who responds if the app’s data is breached, and how the people affected are told, is not yet set at UBC — the Privacy Office’s procedure is still to come: say who answers for this app meanwhile.'

describe('assembleAssessment (Task 11)', () => {
  it('is §9’s six rows, in its order, each with a title, drawn from one commit', () => {
    const draft = assembleAssessment(input())
    expect(draft.sections.map((s) => s.id)).toEqual([
      'collected',
      'stored',
      'flows',
      'retention',
      'accountable',
      'hosting',
    ])
    for (const s of draft.sections) {
      expect(s.title).toMatch(/^[A-Z][^.]+$/)
      expect(s.facts.length).toBeGreaterThan(0)
    }
    expect(draft).toMatchObject({
      project: { slug: 'lp-sample', name: 'Lab Sample' },
      generatedAt: '2026-10-01T15:00:00.000Z',
      fromCommit: 'a'.repeat(40),
      warnings: [],
    })
  })

  it('collected: every attribute the app asks for, with the registration’s own purpose — and the app’s database named as a gap', () => {
    const collected = section(assembleAssessment(input()), 'collected')
    expect(valueOf(collected, 'ubcEduCwlPuid')).toEqual({
      label: 'ubcEduCwlPuid',
      value: ATTRIBUTE_PURPOSES.ubcEduCwlPuid,
      source: 'manifest.yaml: auth.attributes',
    })
    expect(valueOf(collected, 'mail')).toEqual({
      label: 'mail',
      value: ATTRIBUTE_PURPOSES.mail,
      source: 'manifest.yaml: auth.attributes',
    })
    // An attribute it does not ask for is not listed.
    expect(valueOf(collected, 'givenName')).toBeUndefined()
    expect(collected.gaps).toEqual([
      expect.stringMatching(/^What the app keeps in its own database/),
    ])
    // An app that signs nobody in learns nothing from CWL, and says so.
    const none = section(assembleAssessment(input({ spec: BARE })), 'collected')
    expect(none.facts).toEqual([
      {
        label: 'Sign-in',
        value:
          'The app signs nobody in, so UBC releases nothing about the people who use it.',
        source: 'manifest.yaml: auth.provider',
      },
    ])
    expect(none.gaps).toEqual(collected.gaps)
  })

  it('stored: each service, each environment’s copy — none backed up — Manifest’s own Incident logs, and staging’s use by real people as a gap', () => {
    const stored = section(assembleAssessment(input()), 'stored')
    expect(valueOf(stored, 'db')).toEqual({
      label: 'db',
      value:
        'A mongo database, version 7, which Manifest runs for the app — one in each environment.',
      source: 'manifest.yaml: services',
    })
    expect(stored.facts.filter((f) => f.source === 'Manifest’s environments')).toEqual([
      {
        label: 'Sandbox',
        value:
          'Where the app is built and tried: its own copy of each database, never backed up.',
        source: 'Manifest’s environments',
      },
      {
        label: 'Staging',
        value:
          'Where the app is tested before launch: its own copy of each database, never backed up.',
        source: 'Manifest’s environments',
      },
      {
        label: 'Production',
        value:
          'Where people use the app: its own copy of each database, not backed up on this platform yet.',
        source: 'Manifest’s environments',
      },
    ])
    // What the platform does not do is not said: nothing clears staging, nothing reaps a sandbox.
    for (const f of stored.facts)
      expect(f.value).not.toMatch(/thrown away|resettable|cleared/)
    // What Manifest keeps ITSELF, whatever the app declares.
    expect(valueOf(stored, 'Incident logs')).toEqual(INCIDENT_LOGS)
    expect(stored.gaps).toEqual([
      expect.stringMatching(/staging.*real people.*Privacy Office/s),
    ])
    // No service: no database, and no environment's copy to describe — the logs still.
    const bare = section(assembleAssessment(input({ spec: BARE })), 'stored')
    expect(bare.facts).toEqual([
      {
        label: 'Services',
        value: 'The app declares no service, so Manifest keeps no database for it.',
        source: 'manifest.yaml: services',
      },
      INCIDENT_LOGS,
    ])
    expect(bare.gaps).toEqual(stored.gaps)
  })

  it('flows: every outside host, every AI model with its classification and whether it leaves on-premise hardware, and the data’s classification', () => {
    const flows = section(assembleAssessment(input()), 'flows')
    expect(valueOf(flows, 'Classification')).toEqual({
      label: 'Classification',
      value: 'Internal — every AI model the app uses must be approved for internal data.',
      source: 'manifest.yaml: data.classification',
    })
    expect(valueOf(flows, 'api.ubc.ca')).toEqual({
      label: 'api.ubc.ca',
      value: 'The app may send data to api.ubc.ca, outside the platform.',
      source: 'manifest.yaml: egress.allow',
    })
    expect(valueOf(flows, 'default-chat')).toEqual({
      label: 'default-chat',
      value:
        'Approved for internal data at most: it may be answered by a provider off-premise, so what the app sends it may leave UBC.',
      source: 'manifest.yaml: ai.models; the model catalogue',
    })
    expect(valueOf(flows, 'default-chat-onprem')).toEqual({
      label: 'default-chat-onprem',
      value:
        'Approved for confidential data: it runs on on-premise hardware, so what the app sends it stays there.',
      source: 'manifest.yaml: ai.models; the model catalogue',
    })
    // On the platform's own repositories, a commit's author goes nowhere else.
    expect(valueOf(flows, 'Changes to the app')).toBeUndefined()
    expect(flows.gaps).toEqual([])
  })

  it('flows: a classification the manifest does not declare is Manifest’s default — said, and named as a gap', () => {
    const flows = section(
      assembleAssessment(input({ declared: { retention: true, classification: false } })),
      'flows',
    )
    expect(valueOf(flows, 'Classification')).toEqual({
      label: 'Classification',
      value:
        'Internal — Manifest’s default, because the manifest does not say: every AI model the app uses must be approved for internal data.',
      source: 'Manifest’s default',
    })
    expect(flows.gaps).toEqual([
      'No classification declared — add data.classification to manifest.yaml, saying how sensitive the app’s data is. Manifest treats it as internal, which allows AI models that may be answered off-premise.',
    ])
  })

  it('flows: on GitHub, the names of the people who change the app are sent there as each change’s author', () => {
    const flows = section(
      assembleAssessment(
        input({ repository: { provider: 'github', organisation: 'Manifest-local-dev' } }),
      ),
      'flows',
    )
    expect(valueOf(flows, 'Changes to the app')).toEqual({
      label: 'Changes to the app',
      value:
        'The names of the people who change the app through Manifest are sent to GitHub (Manifest-local-dev), as the author of each change.',
      source: 'the project’s repository',
    })
  })

  it('flows: no outside host, no model — each said; a model the catalogue lacks, or AI switched off, is a gap', () => {
    const bare = section(assembleAssessment(input({ spec: BARE })), 'flows')
    expect(valueOf(bare, 'Outside connections')?.value).toBe(
      'The app may connect to nothing outside the platform: every other address is refused.',
    )
    expect(valueOf(bare, 'AI')?.value).toBe('The app uses no AI model.')
    expect(bare.gaps).toEqual([])

    const unknown = section(
      assembleAssessment(input({ catalogue: CATALOGUE.slice(1) })),
      'flows',
    )
    expect(valueOf(unknown, 'default-chat')?.value).toMatch(
      /not in the platform’s model catalogue/,
    )
    expect(unknown.gaps).toEqual([expect.stringMatching(/default-chat/)])

    const off = section(assembleAssessment(input({ catalogue: null })), 'flows')
    expect(valueOf(off, 'default-chat')?.value).toMatch(/AI is switched off/)
    expect(off.gaps).toHaveLength(1)
  })

  it('retention: what the manifest says, never a period Manifest enforces — Manifest deletes nothing on a schedule — and the gaps that follow', () => {
    const declared = section(assembleAssessment(input()), 'retention')
    expect(declared.facts).toEqual([
      {
        label: 'How long',
        value: 'The manifest says the app keeps its data for 180 days.',
        source: 'manifest.yaml: data.retention_days',
      },
      DELETION,
    ])
    expect(declared.gaps).toEqual([
      'How the app removes its data once it is older than 180 days — Manifest does not remove it for the app.',
      SUNSET,
    ])

    const undeclared = section(
      assembleAssessment(input({ spec: BARE, declared: UNDECLARED })),
      'retention',
    )
    // The schema's 365 is no one's decision, and nothing enforces it: not stated at all.
    expect(undeclared.facts).toEqual([
      {
        label: 'How long',
        value: 'The manifest gives no retention period.',
        source: 'manifest.yaml: data.retention_days',
      },
      DELETION,
    ])
    for (const f of undeclared.facts) expect(f.value).not.toMatch(/365/)
    expect(undeclared.gaps).toEqual([
      'No retention declared — add data.retention_days to manifest.yaml, with how long the app must keep its data.',
      SUNSET,
    ])
  })

  it('accountable: the owners, the collaborators and the platform’s contacts — breach response always a gap, and no platform contact one', () => {
    const accountable = section(assembleAssessment(input()), 'accountable')
    expect(accountable.facts).toEqual([
      {
        label: 'Owner',
        value: 'Bio Prof <bio.prof@example.ubc.ca>',
        source: 'the project’s members',
      },
      {
        label: 'Collaborator',
        value: 'Bio Colleague <bio.colleague@example.ubc.ca>',
        source: 'the project’s members',
      },
      {
        label: 'Platform contact',
        value: 'Platform Admin <admin@example.ubc.ca>',
        source: 'the platform’s contacts',
      },
    ])
    expect(accountable.gaps).toEqual([BREACH])
    const alone = section(
      assembleAssessment(input({ platformContacts: [] })),
      'accountable',
    )
    expect(alone.facts.map((f) => f.label)).toEqual(['Owner', 'Collaborator'])
    expect(alone.gaps).toEqual([expect.stringMatching(/No platform contact/), BREACH])
  })

  it('hosting: where Manifest runs the app and keeps its code, each model’s ceiling, and where UBC will host it as a gap', () => {
    const hosting = section(assembleAssessment(input()), 'hosting')
    expect(valueOf(hosting, 'Where the app runs')).toEqual({
      label: 'Where the app runs',
      value: 'In containers on the machine Manifest runs on, under its Docker driver.',
      source: 'the platform’s runtime driver',
    })
    expect(valueOf(hosting, 'Where its code is kept')?.value).toBe(
      'In a repository on the machine Manifest runs on.',
    )
    expect(valueOf(hosting, 'default-chat')?.value).toBe(
      'Approved for internal data at most.',
    )
    expect(valueOf(hosting, 'default-chat-onprem')?.value).toBe(
      'Approved for confidential data at most.',
    )
    expect(hosting.gaps).toEqual([
      'Where UBC will host the app in production is not decided yet: UBC has not chosen the infrastructure Manifest runs on there.',
      expect.stringMatching(/outside Canada.*default-chat\b/s),
    ])
    const github = section(
      assembleAssessment(
        input({ repository: { provider: 'github', organisation: 'Manifest-local-dev' } }),
      ),
      'hosting',
    )
    expect(valueOf(github, 'Where its code is kept')?.value).toBe(
      'In a private repository in the GitHub organisation Manifest-local-dev.',
    )
    // On GitHub, the people's names are a second flow whose jurisdiction is the Office's question.
    expect(github.gaps).toEqual([
      ...hosting.gaps,
      'Whether people’s names may be sent to GitHub, which may hold them outside Canada, is the Privacy Office’s to say.',
    ])
    // Only on-premise models: no provider outside Canada to ask about.
    const onPrem = section(
      assembleAssessment(
        input({ spec: { ...SPEC, ai: { ...SPEC.ai, models: ['default-chat-onprem'] } } }),
      ),
      'hosting',
    )
    expect(onPrem.gaps).toHaveLength(1)
  })

  it('carries the warnings its caller knows first', () => {
    expect(
      assembleAssessment(input({ warnings: ['Nothing is serving staging yet.'] }))
        .warnings,
    ).toEqual(['Nothing is serving staging yet.'])
  })
})

describe('renderAssessmentText (Task 11)', () => {
  const RICH = assembleAssessment(input())
  const SPARSE = assembleAssessment(
    input({
      spec: BARE,
      declared: UNDECLARED,
      catalogue: null,
      platformContacts: [],
      repository: { provider: 'github', organisation: 'Manifest-local-dev' },
      warnings: ['Nothing is serving staging yet.'],
    }),
  )

  it('is the draft’s own text: every fact, every gap and every warning, under its section’s title', () => {
    for (const draft of [RICH, SPARSE]) {
      expect(draft.text).toBe(renderAssessmentText(draft))
      for (const s of draft.sections) {
        expect(draft.text).toContain(s.title)
        for (const f of s.facts) expect(draft.text).toContain(f.value)
        for (const g of s.gaps) expect(draft.text).toContain(g)
      }
      for (const w of draft.warnings) expect(draft.text).toContain(w)
    }
    expect(RICH.text).toContain('Lab Sample (lp-sample)')
    expect(RICH.text).toContain('a'.repeat(12))
  })

  it('names nothing the owner would not recognise — no machine words, whatever is absent', () => {
    for (const draft of [RICH, SPARSE])
      for (const token of [
        /\bjsonb\b/i,
        /\buuid\b/i,
        /\bnull\b/i,
        /\bundefined\b/i,
        /\[object/,
      ])
        expect(draft.text).not.toMatch(token)
  })
})

describe('readAssessmentDraft (Task 11)', () => {
  it('reads back what was stored, and nothing that is not a draft', () => {
    const draft = assembleAssessment(input())
    expect(readAssessmentDraft(JSON.parse(JSON.stringify(draft)))).toEqual(draft)
    expect(readAssessmentDraft(null)).toBeNull()
    expect(readAssessmentDraft({ placeholder: 'x' })).toBeNull()
    expect(readAssessmentDraft({ generatedAt: '2026-10-01T15:00:00.000Z' })).toBeNull()
  })
})
