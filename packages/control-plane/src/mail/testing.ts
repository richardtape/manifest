import nodemailer, { type Transporter } from 'nodemailer'
import type { Mailer, TeamNotice } from './index.js'

/**
 * WHAT THE UNIT TIER'S SERVERS GET (`api/testing.ts`'s `testDeps`): a mailer that records each notice
 * and opens no socket. `told` is what a test reads to assert who was told what.
 */
export function recordingMailer(): Mailer & { told: TeamNotice[] } {
  const told: TeamNotice[] = []
  return {
    told,
    tellTeam(notice) {
      told.push(notice)
    },
    async settled() {},
  }
}

/**
 * NODEMAILER'S OWN COMPOSER, SENDING NOTHING (`streamTransport`, buffered, CRLF): the raw message each
 * send WOULD have put on the wire, so a test asserts the real headers and body rather than its own idea
 * of them.
 */
export function composingTransport(): Pick<Transporter, 'sendMail'> & { raw: string[] } {
  const raw: string[] = []
  const transport = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: 'windows',
  })
  return {
    raw,
    sendMail: async (message) => {
      const info = await transport.sendMail(message)
      raw.push((info.message as Buffer).toString('utf8'))
      return info
    },
  } as Pick<Transporter, 'sendMail'> & { raw: string[] }
}
