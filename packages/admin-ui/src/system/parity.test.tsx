import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import type { Schemas } from '@manifest/contract'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import * as Ours from './index.js'

/**
 * THE CONSOLE'S LOOK IS THE DRAWING'S, HELD MARKUP-IDENTICAL (Decision 4). Each port in this
 * directory renders, prop set by prop set, exactly the markup its reference renders — the
 * references evaluated as the classic scripts they are, under OUR React 19.3.0, in a `node:vm`
 * context: the faculty front-end's measured route (manifest-app `packages/ui/src/parity.test.tsx`).
 * A component's markup therefore changes in two places, and this test says so.
 */
type Component = React.FC<Record<string, unknown>>
const DESIGN = new URL('../../../../docs/superpowers/design/', import.meta.url)

/** The references, evaluated as the classic scripts they are, under OUR React. */
function references(): {
  system: Record<string, Component>
  admin: Record<string, Component>
} {
  const window: Record<string, unknown> = { React }
  for (const file of ['system/components/bundle.js', 'admin/components.js'])
    runInNewContext(readFileSync(new URL(file, DESIGN), 'utf8'), { window, React })
  return {
    system: window['Manifest'] as Record<string, Component>,
    admin: window['ManifestAdmin'] as Record<string, Component>,
  }
}
const REF = references()
const html = (c: Component, props: Record<string, unknown>) =>
  renderToStaticMarkup(React.createElement(c, props))

const STATES = ['working', 'waiting', 'attention', 'steady', 'notyet'] as const
const DIGEST = 'sha256:9b2c1d0e3f4a5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4'
// API-SHAPED PROPS ARE TYPED BY THE CONTRACT (M3): `satisfies` makes `tsc` hold the real shape, so a
// field the contract adds or renames cannot be left out of the cases unnoticed.
const DIFF = {
  imageDigest: DIGEST,
  changes: [
    {
      path: 'egress.allow',
      from: '[]',
      to: '["api.openai.com"]',
      summary: 'one host added',
      added: ['api.openai.com'],
      removed: [],
    },
    {
      path: 'ai.models',
      from: '["default-chat"]',
      to: '["default-chat","default-chat-large"]',
      summary: 'one model added',
      added: ['default-chat-large'],
    },
  ],
  services: ['mongodb'],
  attributes: ['eduPersonPrincipalName', 'displayName'],
  resources: { cpu: 1, memory: '1Gi', disk: '2Gi', pids: 256 },
  summary: 'It may now call one outside host and a larger model.',
  summarySource: 'llm',
  summaryWithheldBecause: null,
  summaryExposures: [
    {
      path: 'egress.allow',
      sentence: 'What a student writes could reach api.openai.com.',
    },
  ],
  baselineReleaseId: 'f1ee7004-0001-4000-8000-000000000000',
  sensitiveFields: ['egress.allow', 'ai.models'],
  security: [
    { field: 'egress.allow', note: 'A new host can be sent anything the app holds.' },
  ],
  coverage: 'This compares manifest.yaml only.',
  review: {
    state: 'not_performed',
    reviewer: 'none',
    detail: 'No review is performed yet.',
  },
} satisfies Schemas['ApprovalDiff']
const RAIL = {
  user: 'Operator One',
  role: 'Platform administrator',
  homeHref: '/queue',
  signOutHref: '/auth/logout',
  items: [
    { label: 'Queue', icon: 'queue', href: '/queue', on: true },
    { label: 'Fleet', icon: 'fleet', href: '/fleet' },
    { label: 'Health', icon: 'health', href: '/health' },
  ],
  footItems: [{ label: 'Settings', icon: 'settings', href: '/settings' }],
}

/**
 * Every prop set the console renders each component with, and the edges (empty, long, every state
 * and kind) — plus every prop SHAPE the mockup's own `console.js` passes that the plan's list lacked
 * (P11 Task 1's `[M3]` recorded them): a chip's `pulse` beside its `state`, an event's actor who is
 * no administrator, a compact table with a column that renders, a filter bar's own label, a queue
 * row and a headline bounded *up to*, a setting that changed and one being edited.
 */
const CASES: Record<
  string,
  { from: 'system' | 'admin'; props: Record<string, unknown>[] }
> = {
  StateChip: {
    from: 'system',
    props: [
      ...STATES.flatMap((state) => [
        { state, label: 'Label' },
        { state, label: 'Label', pulse: false },
        { state, label: 'Label', pulse: true },
      ]),
      { state: 'healthy', label: 'A state from a newer contract' },
      { state: 'steady', label: 'Steady', className: 'extra' },
    ],
  },
  Button: {
    from: 'system',
    props: [
      ...['primary', 'secondary', 'tertiary', 'danger', 'ghostDanger'].map((kind) => ({
        kind,
        size: 'sm',
        children: 'Approve',
      })),
      { kind: 'primary', disabled: true, children: 'Approve' },
      { kind: 'secondary', href: '/fleet', children: 'Fleet' },
      {
        children: 'Default',
        type: 'submit',
        className: 'extra',
        style: { width: '100%' },
      },
    ],
  },
  TwoFacts: {
    from: 'system',
    props: [
      {
        serving: {
          overline: 'Serving · production',
          title: 'healthy · 3',
          note: 'sha256:9b2c1d0e…d3e4',
          tone: 'steady',
        },
        attempt: {
          overline: 'Last attempt · 2h ago',
          title: 'failed: exited (137)',
          note: 'GET /health answered 502',
          tone: 'attention',
        },
      },
      { serving: {}, attempt: {}, foot: null },
      { foot: 'A foot of its own.', className: 'extra' },
    ],
  },
  InverseSurface: {
    from: 'system',
    props: [
      { inset: 'line one\nline two' },
      { title: 'Its last lines', warn: true, body: 'The instance exited.', inset: 'x' },
      { title: 'No mark', children: 'below' },
    ],
  },
  SegmentedControl: {
    from: 'system',
    props: [
      { options: ['Approve', 'Reject'], value: 'Approve', role: 'tablist' },
      {
        options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
        value: 'b',
        role: 'radiogroup',
      },
      { options: ['One'], value: 'none' },
    ],
  },
  Choice: {
    from: 'system',
    props: [
      {
        name: 'next',
        type: 'radio',
        value: 'active',
        options: [
          { value: 'active', title: 'Registered (active)' },
          {
            value: 'change_requested',
            title: 'Sent back with questions',
            note: 'For its owner to answer',
          },
        ],
      },
      {
        name: 'which',
        type: 'checkbox',
        label: 'Which',
        options: [
          { value: 'a', title: 'A', checked: true },
          { value: 'b', title: 'B' },
        ],
      },
    ],
  },
  MachineValue: {
    from: 'admin',
    props: [
      { value: DIGEST, label: 'image digest' },
      { value: 'short-value' },
      { value: DIGEST, full: true, copy: false },
      { value: 'f1ee7004-0001-4000-8000-000000000000', copy: false, className: 'extra' },
    ],
  },
  ConsoleRail: {
    from: 'admin',
    props: [
      RAIL,
      { ...RAIL, items: [], footItems: [], role: undefined },
      { user: 'Operator One', product: 'Elsewhere', className: 'extra' },
    ],
  },
  SettingRow: {
    from: 'admin',
    props: [
      {
        label: 'Blueprints',
        keyName: 'listBlueprints',
        value: 'node-ts-mongo@1',
        source: 'This repository',
        action: null,
      },
      {
        label: 'The capable model',
        keyName: 'MANIFEST_CAPABLE_MODEL',
        value: 'Manifest can’t read this yet.',
        source: '.env, on the host',
      },
      {
        label: 'Edited',
        value: 'x',
        changed: 'changed just now',
        source: 'Here',
        editing: true,
        editor: 'the editor',
      },
    ],
  },
  WaitHeadline: {
    from: 'admin',
    props: [
      { oldest: null },
      {
        oldest: { text: '3 days, 4 hours' },
        people: 5,
        items: 9,
        itemsLabel: 'items · 5 on us, 4 with UBC',
        assembled: 'Read just now · again every 60 seconds',
      },
      { oldest: { text: '19 hours' }, people: 1, items: 1 },
      // The queue screen's (Task 6): a note under the age, and the read line, together.
      {
        oldest: {
          text: '3 days, 4 hours',
          note: 'Release approval, reading-responses. Its age is from when it was asked for.',
        },
        people: 5,
        items: 9,
        itemsLabel: 'items · 5 on us, 4 with UBC',
        assembled:
          'Only the oldest 200 are shown, and every number here counts those. Read 40 seconds ago · again every 60 seconds',
      },
      {
        oldest: { text: '2 days', bound: true, note: 'The 200 oldest are shown.' },
        people: 2,
        items: 200,
      },
    ],
  },
  QueueRow: {
    from: 'admin',
    props: [
      {
        id: 'q1',
        selected: true,
        item: {
          ageText: '3d 4h',
          kindLabel: 'Release approval',
          project: 'reading-responses',
          ask: 'Approve the release serving staging for production',
          meta: [
            { text: 'Instructor One asked on October 11, 2026' },
            { text: '✎ a note', flag: true },
            { text: 'Waiting on us', holder: true },
          ],
        },
      },
      // The queue screen's (Task 6): a row it selects on a click, with a registration's environment.
      {
        id: 'row-iam-registration-to-submit:x',
        onSelect: () => undefined,
        item: {
          ageText: '1d',
          kindLabel: 'Registration to submit',
          project: 'phys-101-labs',
          ask: 'Jordan Lee sent the production registration to the Manifest team.',
          meta: [
            { text: 'Jordan Lee sent it on October 14, 2026' },
            { text: 'production', mono: true },
            { text: 'Waiting on us', holder: true },
          ],
        },
      },
      {
        id: 'q2',
        item: {
          ageText: '23d',
          kindLabel: 'Privacy assessment',
          project: 'field-notes',
          ask: 'Record the Privacy Office’s answer',
          meta: [
            { text: 'PIA-2026-0118', mono: true },
            { text: 'With the Privacy Office', holder: true },
          ],
        },
      },
      {
        item: {
          ageText: 'today',
          bound: true,
          kindLabel: 'IAM registration',
          project: 'chem-lab-booking',
          ask: 'Record UBC IAM’s answer',
        },
      },
    ],
  },
  FactList: {
    from: 'admin',
    props: [
      {
        rows: [
          { label: 'Release', value: 'f1ee7004-0001-4000-8000-000000000000', mono: true },
          null,
          { label: 'Made by', value: 'Instructor One' },
          false,
          { label: 'Digest', value: React.createElement('code', null, 'sha256:…') },
        ],
      },
      { rows: [] },
    ],
  },
  Tags: {
    from: 'admin',
    props: [
      {
        items: [
          'mongodb',
          { text: 'sn', add: true },
          { text: 'egress.allow', sens: true },
        ],
      },
      { items: [] },
    ],
  },
  RawChip: {
    from: 'admin',
    props: [
      { raw: 'healthy' },
      { raw: 'failed', label: 'Needs you' },
      { raw: 'exit_stopped', state: 'attention', label: 'Stopped' },
      { raw: 'running', state: 'working', label: 'Deploying', pulse: false },
      { state: 'waiting', label: 'No enum' },
      ...[
        'succeeded',
        'active',
        'approved',
        'met',
        'pending',
        'building',
        'provisioning',
        'starting',
        'waking',
        'destroying',
        'hibernated',
        'not_built',
        'gone',
        'submitted',
      ].map((raw) => ({ raw, label: raw })),
    ],
  },
  DiffView: {
    from: 'admin',
    props: [
      { diff: DIFF },
      {
        diff: {
          ...DIFF,
          summarySource: 'unavailable',
          summary: null,
          summaryExposures: null,
        },
      },
      {
        diff: {
          ...DIFF,
          summarySource: 'no-previous-release',
          baselineReleaseId: null,
          sensitiveFields: [],
          security: [],
          changes: [],
        },
      },
      { diff: { ...DIFF, summarySource: 'withheld', summary: null, coverage: null } },
      {
        diff: {
          ...DIFF,
          sensitiveFields: ['auth.attributes'],
          security: [{ field: 'auth.attributes', note: 'More of a person is shared.' }],
          changes: [
            {
              path: 'auth.attributes.sn',
              from: 'absent',
              to: 'present',
              summary: 'one attribute added',
            },
          ],
          resources: { cpu: null, memory: null, disk: null, pids: null },
        },
      },
    ],
  },
  ObservedAction: {
    from: 'admin',
    props: [
      {
        id: 'r1',
        owner: 'Instructor One',
        reason: '',
        onReason: () => undefined,
        actions: [
          { label: 'Approve', kind: 'primary' },
          { label: 'Reject', kind: 'danger', needsReason: true },
        ],
        previews: [
          {
            label: 'Approve',
            type: 'release.approved',
            lead: 'Operator One approved this release for production.',
            reasonIn: 'record',
          },
          {
            label: 'Reject',
            type: 'release.approval_rejected',
            lead: 'Operator One did not approve this release:',
            reasonIn: 'sentence',
          },
        ],
        previewIndex: 0,
        onPreviewIndex: () => undefined,
      },
      {
        id: 'r2',
        owner: 'Instructor One',
        reason: 'The new host is not on UBC’s list.',
        onReason: () => undefined,
        actions: [{ label: 'Reject', kind: 'danger', needsReason: true }],
        previews: [
          {
            label: 'Reject',
            type: 'release.approval_rejected',
            lead: 'Operator One did not approve this release:',
            reasonIn: 'sentence',
          },
        ],
      },
      {
        id: 'r3',
        owner: 'Jordan Lee',
        canRecord: false,
        admissionLead: 'Manifest doesn’t keep a reason for a hand-back. ',
        admission: 'Tell Jordan Lee why yourself.',
        actions: [{ label: 'Hand back', kind: 'secondary' }],
        previews: [
          {
            label: 'Hand back',
            type: 'iam_registration.returned',
            lead: 'Operator One handed this app’s production registration back to its owner, unsubmitted.',
          },
        ],
      },
      {
        id: 'r4',
        owner: 'Jordan Lee',
        canRecord: false,
        admission: 'Tell them yourself.',
        hint: 'A hint.',
        note: 'A note.',
        seeLabel: 'In the record',
        children: 'between',
        placeholder: 'unused',
        actions: [{ label: 'Record', disabled: true }],
        previews: [
          {
            label: 'Record',
            type: 'iam_registration.recorded',
            lead: 'Operator One recorded UBC IAM’s answer.',
            after: 'And then.',
          },
        ],
        previewIndex: 7,
      },
      {
        id: 'r5',
        owner: 'Nobody',
        reason: '  ',
        onReason: () => undefined,
        placeholder: 'Why?',
      },
    ],
  },
  EventLine: {
    from: 'admin',
    props: [
      {
        when: '2h ago',
        text: 'cpsc-110-help is running in production.',
        type: 'instance.healthy',
      },
      {
        when: '3h ago',
        text: 'Operator One renamed this project to Bio 201 scheduler.',
        type: 'project.renamed',
        who: 'Operator One',
        asAdmin: true,
        reason: 'The course code changed this term — the department asked.',
      },
      {
        when: '1d ago',
        text: 'Instructor One asked for sign-off.',
        type: 'approval.requested',
        who: 'Instructor One',
      },
    ],
  },
  DataTable: {
    from: 'admin',
    props: [
      {
        caption: 'Every app',
        rowKey: 'slug',
        striped: true,
        sortKey: 'slug',
        sortDir: 'asc',
        onSort: () => undefined,
        columns: [
          { key: 'slug', label: 'App', sortable: true, mono: true },
          { key: 'n', label: 'Instances', align: 'right' },
        ],
        rows: [
          { slug: 'a', n: 3 },
          { slug: 'b', n: 2 },
        ],
      },
      {
        caption: 'Administrators',
        rowKey: 'who',
        columns: [{ key: 'who', label: 'Who' }],
        rows: [],
      },
      {
        caption: 'Sorted the other way, compact, rendered',
        rowKey: 'slug',
        compact: true,
        sortKey: 'n',
        sortDir: 'desc',
        onSort: () => undefined,
        onRow: () => undefined,
        columns: [
          { key: 'slug', label: 'App', sortable: true },
          { key: 'n', label: 'Instances', sortable: true, align: 'right', mono: true },
          {
            key: 'say',
            label: 'Said',
            render: (r: { slug: string }) => React.createElement('em', null, r.slug),
          },
        ],
        rows: [{ slug: 'a', n: 3 }],
      },
    ],
  },
  FilterBar: {
    from: 'admin',
    props: [
      {
        id: 'f',
        query: '',
        placeholder: 'Filter by app, owner or blueprint',
        count: '13 apps',
        onQuery: () => undefined,
        facets: [
          { label: 'In production', on: false },
          { label: 'Archived', on: true },
        ],
      },
      {
        id: 'f',
        query: 'chem',
        placeholder: 'Filter',
        count: '1 app',
        onQuery: () => undefined,
        facets: [],
      },
      // The queue screen's (Task 6): its own label, facets that toggle, and Clear.
      {
        id: 'queue-search',
        label: 'Filter the queue',
        query: 'chem',
        placeholder: 'Filter by app or person  ( / )',
        onQuery: () => undefined,
        facets: [
          { label: 'Release approvals', on: true, onToggle: () => undefined },
          { label: 'With UBC', on: false, onToggle: () => undefined },
        ],
        onClear: () => undefined,
        count: '1 of 9 · j and k move',
      },
      {
        query: '',
        placeholder: 'Filter',
        count: '0 apps',
        label: 'The fleet’s filters',
        onQuery: () => undefined,
        onClear: () => undefined,
      },
    ],
  },
  EnvCell: {
    from: 'admin',
    props: [
      { env: null },
      { env: { state: 'healthy', age: '9d' } },
      { env: { state: 'failed', age: '2h', incident: '2h 10m ago' } },
      // The refreshed reference's count (the mockup's refresh, `99af8df`).
      { env: { state: 'healthy', age: '9d', instances: 3 } },
      { env: { state: 'healthy', instances: 1 } },
      { env: { state: null, instances: 0 } },
    ],
  },
}

describe('the console’s components render exactly as the drawing’s', () => {
  for (const [name, { from, props }] of Object.entries(CASES))
    it.each(props)(`${name} %#`, (p) => {
      const ours = (Ours as unknown as Record<string, Component>)[name]!
      expect(ours, `${name} is not exported from src/system/index.ts`).toBeTypeOf(
        'function',
      )
      expect(html(ours, p)).toBe(html(REF[from][name]!, p))
    })

  it('ports every component the console uses, and no other', () => {
    // FUNCTION-VALUED exports only: the reference exports `ICONS` (an object) beside its
    // components, and so may the port (M3).
    const components = Object.entries(Ours)
      .filter(([k, v]) => /^[A-Z]/.test(k) && typeof v === 'function')
      .map(([k]) => k)
    expect(Object.keys(CASES).sort()).toEqual(components.sort())
  })

  it('carries the drawing’s helpers as the drawing writes them', () => {
    const helpers = REF.admin as unknown as {
      stateOf: (raw: string) => string
      shorten: (v: string) => string
    }
    for (const raw of [
      'healthy',
      'running',
      'failed',
      'gone',
      'submitted',
      'exit_stopped',
    ])
      expect(Ours.stateOf(raw)).toBe(helpers.stateOf(raw))
    for (const v of [DIGEST, 'short-value', 'f1ee7004-0001-4000-8000-000000000000', ''])
      expect(Ours.shorten(v)).toBe(helpers.shorten(v))
  })
})
