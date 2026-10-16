import type { Schemas } from '@manifest/contract'
import { createMockServer } from '@manifest/mock'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApi } from './api.js'
import {
  askedWords,
  attemptOf,
  CAUSE_WORDS,
  incidentGroups,
  lastDeployOf,
  levelOf,
  NO_LONGER_ON_THE_PROJECT,
  personOf,
  questionsOf,
  recordSince,
  releaseRows,
  setOf,
  type EnvironmentRead,
  type ProjectRead,
} from './project-state.js'
import { readProject } from './screens/project.js'

/**
 * A PROJECT'S SECTIONS, FROM THE DEMO FLEET'S OWN ANSWERS — every object read through the console's
 * client and the page's own read (`readProject`), so each is the contract's shape, checked on the way out
 * by the mock.
 */
let server: ReturnType<typeof createMockServer>
const read: Record<string, ProjectRead> = {}

beforeAll(async () => {
  server = createMockServer({ scanSilenceMs: 50, role: 'admin', fleet: 'demo' })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as { port: number }
  const api = createApi({ origin: `http://127.0.0.1:${port}`, session: 'mock-session' })
  const fleet = await api.listFleet()
  for (const slug of [
    'bio-201-scheduler',
    'cpsc-110-help',
    'econ-101-polls',
    'mus-100-listening',
    'rubric-helper',
  ])
    read[slug] = await readProject(api, fleet.find((p) => p.slug === slug)!.id)
})

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
})

const envOf = (r: ProjectRead, kind: string): EnvironmentRead =>
  r.environments.find((e) => e.environment.kind === kind)!

describe('the app’s data level', () => {
  it('is what the SERVING production release declares — bio-201-scheduler’s newest release raises it and serves nowhere', () => {
    const bio = read['bio-201-scheduler']!
    // The newest release (listReleases is newest first) declares very-high; production serves the one before.
    expect(bio.releases[0]!.config.production.classification).toBe('very-high')
    expect(levelOf(bio.environments, bio.releases)).toEqual({
      level: 'high',
      from: 'production',
    })
  })

  it('is staging’s when nothing serves production — mus-100-listening, never launched', () => {
    const mus = read['mus-100-listening']!
    expect(levelOf(mus.environments, mus.releases)).toEqual({
      level: 'low',
      from: 'staging',
    })
  })

  it('is not known when nothing serves staging or production — rubric-helper’s first staging deploy failed', () => {
    const rubric = read['rubric-helper']!
    expect(levelOf(rubric.environments, rubric.releases)).toBeNull()
  })
})

describe('who the platform records by id', () => {
  it('names a token’s minter from the members — the lab-group agent is Noor Aziz’s', () => {
    const bio = read['bio-201-scheduler']!
    const token = bio.tokens.find((t) => t.name === 'lab-group agent')!
    expect(personOf(token.mintedBy, bio.members)).toBe('Noor Aziz')
  })

  it('says “someone no longer on the project” for a minter who is not a member', () => {
    const bio = read['bio-201-scheduler']!
    expect(personOf('00000000-0000-4000-8000-00000000dead', bio.members)).toBe(
      NO_LONGER_ON_THE_PROJECT,
    )
    expect(NO_LONGER_ON_THE_PROJECT).toBe('someone no longer on the project')
  })

  it('names who made each release, and which environments it serves now', () => {
    const bio = read['bio-201-scheduler']!
    const rows = releaseRows(bio.releases, bio.environments, bio.members)
    expect(rows.map((r) => r.servesIn)).toEqual([
      [],
      ['production', 'staging', 'sandbox'],
    ])
    expect(rows.every((r) => r.madeBy === 'Dr. Lucia Moreno')).toBe(true)
  })
})

describe('the Incidents, by cause', () => {
  it('reads econ-101-polls’ four, newest first: replacing gave up, after three stopped and replaced', () => {
    const groups = incidentGroups(read['econ-101-polls']!.environments)
    expect(groups.map((g) => g.kind)).toEqual(['production'])
    expect(groups[0]!.incidents.map((i) => [i.incident.cause, i.words])).toEqual([
      ['exit_stopped', 'It stopped, and replacing it gave up'],
      ['exit', 'A serving instance stopped and was replaced'],
      ['exit', 'A serving instance stopped and was replaced'],
      ['exit', 'A serving instance stopped and was replaced'],
    ])
    const at = groups[0]!.incidents.map((i) => Date.parse(i.incident.createdAt))
    expect([...at].sort((a, b) => b - a)).toEqual(at)
  })

  it('words a failed deploy, and leaves an environment with none out', () => {
    expect(CAUSE_WORDS.deploy).toBe('A deploy failed')
    expect(incidentGroups(read['bio-201-scheduler']!.environments)).toEqual([])
  })
})

describe('the set each hostname reaches', () => {
  it('says econ-101-polls’ production serves 1 of 2 — its stopped member stays in the set', () => {
    const econ = envOf(read['econ-101-polls']!, 'production')
    expect(setOf(econ)).toEqual({
      serving: 1,
      size: 2,
      words: '1 of 2 serving',
      truncated: false,
    })
    expect(econ.instances.instances).toHaveLength(8)
  })

  it('lists cpsc-110-help’s FOUR: two serving, the failed one and its retired partner', () => {
    const cpsc = envOf(read['cpsc-110-help']!, 'production')
    expect(setOf(cpsc).words).toBe('2 of 2 serving')
    expect(cpsc.instances.instances.map((i) => [i.state, i.serving])).toEqual([
      ['healthy', true],
      ['healthy', true],
      ['failed', false],
      ['gone', false],
    ])
  })
})

describe('what the last attempt did', () => {
  const age = () => 'some time'

  it('is econ-101-polls’ Incident after its last deploy: replacing gave up', () => {
    expect(attemptOf(envOf(read['econ-101-polls']!, 'production'), age)).toEqual({
      overline: 'Stopped, not replaced · some time ago',
      title: 'the process exited with code 137',
      note: 'Replacing it gave up: nothing more starts until the app is deployed again.',
      tone: 'attention',
    })
  })

  it('is cpsc-110-help’s last deploy — the replacement came after its exit', () => {
    const cpsc = envOf(read['cpsc-110-help']!, 'production')
    expect(attemptOf(cpsc, age)).toEqual({
      overline: 'Last deploy · some time ago',
      title: 'It became healthy',
      tone: 'neutral',
    })
    expect(lastDeployOf(cpsc)! > cpsc.incidents.incidents[0]!.createdAt).toBe(true)
  })

  it('is rubric-helper’s failed first staging deploy — nothing ever served there', () => {
    const cell = attemptOf(envOf(read['rubric-helper']!, 'staging'), age)
    expect(cell.tone).toBe('attention')
    expect(cell.title.startsWith('Failed: ')).toBe(true)
  })
})

describe('since when each launch record has been where it is', () => {
  it('reads bio-201-scheduler’s approved assessment and active registration from their own instants', () => {
    const { privacyAssessment, iamRegistration } = read['bio-201-scheduler']!.records
    expect(recordSince(privacyAssessment!)).toBe(privacyAssessment!.approvedAt)
    expect(recordSince(iamRegistration!)).toBe(iamRegistration!.registeredAt)
    expect(iamRegistration!.registeredAt).not.toBeNull()
  })

  it('reads a change the team filed from its submission, and UBC’s questions from the last change', () => {
    const r = read['bio-201-scheduler']!.records.iamRegistration!
    const filed = {
      ...r,
      state: 'change_requested' as const,
      changeRequestedFrom: 'active' as const,
      submittedAt: '2026-10-01T19:00:00.000Z',
    }
    expect(recordSince(filed)).toBe('2026-10-01T19:00:00.000Z')
    expect(recordSince({ ...filed, changeRequestedFrom: 'submitted' as const })).toBe(
      r.updatedAt,
    )
  })
})

describe('the agents’ questions', () => {
  const question = (
    over: Partial<Schemas['PendingAction']>,
  ): Schemas['PendingAction'] => ({
    ...read['bio-201-scheduler']!.pendingActions[0]!,
    ...over,
  })

  it('offers the waiting ones oldest first and keeps the answered ones newest first', () => {
    const waiting = question({})
    const older = question({ id: 'b', createdAt: '2026-10-01T00:00:00.000Z' })
    const rejected = question({
      id: 'c',
      state: 'rejected',
      createdAt: '2026-10-02T00:00:00.000Z',
    })
    const lapsed = question({
      id: 'd',
      state: 'expired',
      createdAt: '2026-10-03T00:00:00.000Z',
    })
    const split = questionsOf([waiting, rejected, older, lapsed])
    expect(split.waiting.map((a) => a.id)).toEqual(['b', waiting.id])
    expect(split.answered.map((a) => a.id)).toEqual(['d', 'c'])
  })

  it('says what bio-201-scheduler’s agent asked, as the platform says it', () => {
    expect(askedWords(question({}))).toBe(
      'make the person whose CWL login is dpatel a collaborator of this project',
    )
  })

  it('says a removal and a deploy as the platform does', () => {
    const removal = question({
      object: {
        kind: 'member-removal',
        person: {
          namedBy: 'userId',
          value: 'x',
          member: { userId: 'x', displayName: 'Noor Aziz' },
        },
      },
    })
    expect(askedWords(removal)).toBe('remove Noor Aziz from this project')
    const deploy = question({
      object: {
        kind: 'deploy',
        release: {
          id: 'f1ee7004-0011-4002-8000-000000000000',
          commitSha: '0123456789abcdef',
        },
        environment: { id: 'e', kind: 'production' },
      },
    })
    expect(askedWords(deploy)).toBe(
      'deploy release f1ee7004 (commit 0123456789ab) to production',
    )
  })
})
