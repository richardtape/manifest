import type { Schemas } from '@manifest/contract'
import { describe, expect, it } from 'vitest'
import { questionWords } from './question-words.js'

/**
 * THE QUEUE SAYS WHAT A QUESTION WOULD DO (FE-5): who and in what role, which release and where —
 * and the operation's summary only when the platform recorded nothing more.
 */
const ASKED: Schemas['PendingAction'] = {
  id: '88888888-8888-4888-8888-888888888881',
  projectId: '11111111-1111-4111-8111-111111111111',
  tokenId: '22222222-2222-4222-8222-222222222222',
  action: 'members:manage',
  state: 'pending',
  method: 'POST',
  path: '/v1/projects/11111111-1111-4111-8111-111111111111/members',
  bodySha256: 'a'.repeat(64),
  summary: 'Add or change a member',
  object: null,
  expiresAt: '2026-10-09T17:00:00.000Z',
  createdAt: '2026-10-08T17:00:00.000Z',
  resolvedAt: null,
  waitingSeconds: 42,
  reason: null,
  consumedAt: null,
}

describe('the words of an agent’s question', () => {
  it('names a member by name, and anyone else as the agent named them', () => {
    expect(
      questionWords({
        ...ASKED,
        object: {
          kind: 'member',
          person: {
            namedBy: 'cwlLogin',
            value: 'colleague',
            member: { userId: ASKED.tokenId, displayName: 'Test Colleague' },
          },
          role: 'owner',
        },
      }),
    ).toBe('Make Test Colleague an owner of this project')
    expect(
      questionWords({
        ...ASKED,
        object: {
          kind: 'member',
          person: { namedBy: 'email', value: 'jane.doe@ubc.ca', member: null },
          role: 'collaborator',
        },
      }),
    ).toBe(
      'Make the person whose email is jane.doe@ubc.ca a collaborator of this project',
    )
    expect(
      questionWords({
        ...ASKED,
        object: {
          kind: 'member-removal',
          person: { namedBy: 'userId', value: ASKED.tokenId, member: null },
        },
      }),
    ).toBe(`Remove the person with user id ${ASKED.tokenId} from this project`)
  })

  it('names the release, its commit and where a deploy would run', () => {
    expect(
      questionWords({
        ...ASKED,
        action: 'release:promote',
        object: {
          kind: 'deploy',
          release: {
            id: '87155b5c-f7d8-4519-9042-cc5fa8e2d352',
            commitSha: 'b'.repeat(40),
          },
          environment: { id: ASKED.projectId, kind: 'production' },
        },
      }),
    ).toBe('Deploy release 87155b5c (commit bbbbbbbbbbbb) to production')
  })

  it('falls back to the operation’s summary when nothing more was recorded', () => {
    expect(questionWords(ASKED)).toBe('Add or change a member')
  })
})
