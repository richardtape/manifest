/**
 * WHAT THE MANIFEST TEAM IS TOLD (§26: *"the queue is the record, and the email is how the team hears
 * of it"*; Decision 12). Fixed sentences over ids and names — which app, what was sent or asked, by
 * whom, on what day — and two links on the platform's origin. **The notice has no field for a draft,
 * an answer, an attribute, a note or a reason**, so none can reach an email: the app's name and the
 * sender's are the only words a person wrote that it carries.
 */

/** A launch record the owner sent to the team, or a sign-off asked for. */
export type TeamNotice =
  | {
      kind: 'record-sent'
      record: 'privacy-assessment' | 'staging-registration' | 'production-registration'
      /** A change to a live registration (`active → sent`), which the team files as a change request. */
      change: boolean
      project: { id: string; slug: string; name: string }
      /** The sender, by name. */
      by: string
      at: Date
    }
  | {
      kind: 'sign-off-asked'
      project: { id: string; slug: string; name: string }
      releaseId: string
      /** The person who asked — for an agent, the person who minted its token. */
      by: string
      viaToken: boolean
      at: Date
    }

/**
 * An instant's day in Vancouver, in words — `launch/`'s `vancouverDayInWords`, restated: `launch/`
 * imports this module, so this one cannot import it back.
 */
const dayOf = (at: Date): string =>
  new Intl.DateTimeFormat('en-CA', {
    dateStyle: 'long',
    timeZone: 'America/Vancouver',
  }).format(at)

const RECORD_WORDS = {
  'privacy-assessment': 'privacy assessment',
  'staging-registration': 'staging IAM registration',
  'production-registration': 'production IAM registration',
} as const

/** The email for one notice: its subject (one line, before `oneLine`) and its plain text. */
export function teamEmail(
  notice: TeamNotice,
  origin: string,
): { subject: string; text: string } {
  const app = `${notice.project.name} (${notice.project.slug})`
  const queue = `Everything waiting on the team: ${origin}/queue`
  if (notice.kind === 'sign-off-asked') {
    const who = notice.viaToken ? `An agent on ${notice.by}’s token` : notice.by
    return {
      subject: `${app}: a release is waiting for sign-off for production`,
      text: [
        `${who} asked for the release serving staging of ${app} to be signed off for production, on ${dayOf(notice.at)}.`,
        '',
        'Read it, and approve or reject it in Manifest.',
        '',
        `The release: ${origin}/releases/${notice.releaseId}/approval`,
        queue,
        '',
      ].join('\n'),
    }
  }
  const record = RECORD_WORDS[notice.record]
  const where =
    notice.record === 'privacy-assessment'
      ? 'the UBC Privacy Office, through PRISM'
      : 'UBC IAM'
  return {
    subject: notice.change
      ? `${app}: a change to the ${record} was sent to the Manifest team`
      : `${app}: the ${record} was sent to the Manifest team`,
    text: [
      notice.change
        ? `${notice.by} asked for a change to the ${record} of ${app}, sent to the Manifest team on ${dayOf(notice.at)}.`
        : `${notice.by} sent the ${record} of ${app} to the Manifest team on ${dayOf(notice.at)}.`,
      '',
      notice.change
        ? 'File it with UBC IAM as a change request, and record in Manifest that you have — or hand it back to them.'
        : `Submit it to ${where}, and record in Manifest that you have — or hand it back to them.`,
      '',
      `The record: ${origin}/projects/${notice.project.id}/records`,
      queue,
      '',
    ].join('\n'),
  }
}
