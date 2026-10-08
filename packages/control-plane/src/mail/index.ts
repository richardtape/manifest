import nodemailer, { type Transporter } from 'nodemailer'
import type { Config } from '../config.js'
import { teamEmail, type TeamNotice } from './team.js'

export type { TeamNotice } from './team.js'
export { teamEmail } from './team.js'

/**
 * THE PLATFORM'S OUTBOUND EMAIL (Decisions 10–14): the Manifest team told when a launch record is sent
 * to it or a release's sign-off is asked for. **This module is the only importer of `nodemailer`**, and
 * `ServerDeps.mailer` is the seam: the boot builds the real one, the unit tier's servers get
 * `recordingMailer()` and open no socket.
 */
export interface Mailer {
  /** Tell the Manifest team, in the background: never awaited, never thrown, never silent (Decision 11). */
  tellTeam(notice: TeamNotice): void
  /** Wait for what is in flight — a test, and shutdown. */
  settled(): Promise<void>
}

/** One header line whatever a person typed: CR and LF become spaces (Decision 12). */
export const oneLine = (value: string): string => value.replace(/[\r\n]+/g, ' ').trim()

/**
 * THE PLATFORM'S TRANSPORT (Decision 10): every timeout bounded — nodemailer's defaults are minutes —
 * and no message may read a file or fetch a URL, because Manifest attaches nothing and never will
 * through this. STARTTLS and AUTH are UBC's relay's (Decision 13), configured and unexercised on the
 * laptop, whose Mailpit offers neither. `bounds` is for a test that cannot wait ten seconds.
 */
export function smtpTransport(
  mail: Config['mail'],
  bounds: { timeoutMs: number } = { timeoutMs: 10_000 },
): Transporter {
  return nodemailer.createTransport({
    host: mail.smtp.host,
    port: mail.smtp.port,
    secure: mail.smtp.secure,
    requireTLS: mail.smtp.requireTLS,
    ...(mail.smtp.auth === null ? {} : { auth: mail.smtp.auth }),
    connectionTimeout: bounds.timeoutMs,
    greetingTimeout: bounds.timeoutMs,
    socketTimeout: bounds.timeoutMs,
    disableFileAccess: true,
    disableUrlAccess: true,
  })
}

/**
 * The mailer, over `transport` — the platform's SMTP by default; a test hands it nodemailer's own
 * `streamTransport` (the real composer, sending nothing) or one that fails.
 *
 * **TOLD, NEVER AWAITED** (Decision 11): its callers tell it AFTER their commit and their event, and a
 * send is tracked in `inFlight` (`releases/build.ts`'s pattern) — so an owner's send is never as slow as
 * the relay, and an undelivered email changes nothing but one operator line. **No retry and no outbox**:
 * the queue is the record; the email is how the team hears of it.
 */
export function createMailer(
  config: { mail: Config['mail']; sp: Pick<Config['sp'], 'origin'> },
  transport: Pick<Transporter, 'sendMail'> = smtpTransport(config.mail),
): Mailer {
  const inFlight = new Set<Promise<void>>()
  return {
    tellTeam(notice) {
      const { subject, text } = teamEmail(notice, config.sp.origin)
      const sending: Promise<void> = transport
        .sendMail({
          from: config.mail.from,
          to: config.mail.team,
          subject: oneLine(subject),
          text,
        })
        .then(() => undefined)
        .catch((error: unknown) => {
          // WRITTEN, NEVER SWALLOWED — and only the code: a message or a server's answer can carry an address.
          const code = (error as { code?: unknown } | null)?.code
          console.error(
            JSON.stringify({
              level: 'error',
              msg: 'the Manifest team could not be emailed; the queue still holds the item',
              notice: notice.kind,
              projectId: notice.project.id,
              error: typeof code === 'string' ? code : 'SMTP_FAILED',
            }),
          )
        })
        .finally(() => inFlight.delete(sending))
      inFlight.add(sending)
    },
    async settled() {
      await Promise.all([...inFlight])
    },
  }
}
