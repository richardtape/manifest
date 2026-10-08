import { describe, expect, it } from 'vitest'
import { teamEmail, type TeamNotice } from './team.js'

/**
 * THE MANIFEST TEAM'S EMAIL, IN WORDS (Decision 12): fixed sentences over ids and names — which app,
 * what was sent or asked, by whom, on what day, and two links on the platform's origin. Never a draft,
 * an answer, an attribute, a note or a reason: the notice has no field for one, and these tests hold
 * the WHOLE text, so a sentence that grew a field would be red here.
 */
const ORIGIN = 'https://console.manifest.internal'
const PROJECT = {
  id: '6f1c1d2e-8a4b-4c3d-9e2f-1a2b3c4d5e6f',
  slug: 'chem-labs',
  name: 'Chem Labs',
}
// 19:30 UTC on 8 October is 12:30 the same day in Vancouver; 06:30 UTC on the 9th is still the 8th there.
const AT = new Date('2026-10-09T06:30:00Z')

describe('the Manifest team’s email', () => {
  it('a sent privacy assessment: who, which app, the day, the Privacy Office, and both links', () => {
    expect(
      teamEmail(
        {
          kind: 'record-sent',
          record: 'privacy-assessment',
          change: false,
          project: PROJECT,
          by: 'Bio Prof',
          at: AT,
        },
        ORIGIN,
      ),
    ).toEqual({
      subject:
        'Chem Labs (chem-labs): the privacy assessment was sent to the Manifest team',
      text: [
        'Bio Prof sent the privacy assessment of Chem Labs (chem-labs) to the Manifest team on October 8, 2026.',
        '',
        'Submit it to the UBC Privacy Office, through PRISM, and record in Manifest that you have — or hand it back to them.',
        '',
        `The record: ${ORIGIN}/projects/${PROJECT.id}/records`,
        `Everything waiting on the team: ${ORIGIN}/queue`,
        '',
      ].join('\n'),
    })
  })

  it('a sent registration names UBC IAM and the environment', () => {
    const { subject, text } = teamEmail(
      {
        kind: 'record-sent',
        record: 'staging-registration',
        change: false,
        project: PROJECT,
        by: 'Bio Prof',
        at: AT,
      },
      ORIGIN,
    )
    expect(subject).toBe(
      'Chem Labs (chem-labs): the staging IAM registration was sent to the Manifest team',
    )
    expect(text).toContain(
      'Bio Prof sent the staging IAM registration of Chem Labs (chem-labs) to the Manifest team on October 8, 2026.',
    )
    expect(text).toContain('Submit it to UBC IAM, and record in Manifest that you have')
  })

  it('a change to a live registration is filed with UBC IAM as a change request', () => {
    const { subject, text } = teamEmail(
      {
        kind: 'record-sent',
        record: 'production-registration',
        change: true,
        project: PROJECT,
        by: 'Bio Prof',
        at: AT,
      },
      ORIGIN,
    )
    expect(subject).toBe(
      'Chem Labs (chem-labs): a change to the production IAM registration was sent to the Manifest team',
    )
    expect(text).toContain(
      'Bio Prof asked for a change to the production IAM registration of Chem Labs (chem-labs), sent to the Manifest team on October 8, 2026.',
    )
    expect(text).toContain(
      'File it with UBC IAM as a change request, and record in Manifest',
    )
  })

  it('a sign-off asked for: who — or their agent — the release’s page, and the queue', () => {
    const notice: TeamNotice = {
      kind: 'sign-off-asked',
      project: PROJECT,
      releaseId: '87155b5c-f7d8-4519-9042-cc5fa8e2d352',
      by: 'Bio Prof',
      viaToken: false,
      at: AT,
    }
    expect(teamEmail(notice, ORIGIN)).toEqual({
      subject: 'Chem Labs (chem-labs): a release is waiting for sign-off for production',
      text: [
        'Bio Prof asked for the release serving staging of Chem Labs (chem-labs) to be signed off for production, on October 8, 2026.',
        '',
        'Read it, and approve or reject it in Manifest.',
        '',
        `The release: ${ORIGIN}/releases/87155b5c-f7d8-4519-9042-cc5fa8e2d352/approval`,
        `Everything waiting on the team: ${ORIGIN}/queue`,
        '',
      ].join('\n'),
    })
    expect(teamEmail({ ...notice, viaToken: true }, ORIGIN).text).toMatch(
      /^An agent on Bio Prof’s token asked for the release serving staging/,
    )
  })

  it('the app’s name is the only person-written text that reaches it — a marker name arrives as given, and nothing else', () => {
    const marker = 'MARKER-7f3a <script>'
    const { subject, text } = teamEmail(
      {
        kind: 'record-sent',
        record: 'privacy-assessment',
        change: false,
        project: { ...PROJECT, name: marker },
        by: 'Bio Prof',
        at: AT,
      },
      ORIGIN,
    )
    expect(subject.startsWith(`${marker} (chem-labs)`)).toBe(true)
    // Exactly once in the text, in the sentence that names the app — no other field carries it.
    expect(text.split(marker)).toHaveLength(2)
  })
})
