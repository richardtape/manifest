import net from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMailer, smtpTransport, type TeamNotice } from './index.js'
import { composingTransport } from './testing.js'
import { scaled } from '../test-timeouts.js'

/**
 * THE MAILER (Decisions 10–12): a message nodemailer composes — one subject line, UTF-8, text only,
 * no Bcc, one To — told in the background, bounded, and never silent when it fails.
 */
const MAIL = {
  smtp: {
    host: '127.0.0.1',
    port: 7111,
    secure: false,
    requireTLS: false,
    auth: null,
  },
  team: 'team@manifest.internal',
  from: 'Manifest <manifest@manifest.internal>',
}
const CONFIG = { mail: MAIL, sp: { origin: 'https://console.manifest.internal' } }
const notice = (name: string): TeamNotice => ({
  kind: 'sign-off-asked',
  project: { id: '6f1c1d2e-8a4b-4c3d-9e2f-1a2b3c4d5e6f', slug: 'chem-labs', name },
  releaseId: '87155b5c-f7d8-4519-9042-cc5fa8e2d352',
  by: 'Bio Prof',
  viaToken: false,
  at: new Date('2026-10-08T19:30:00Z'),
})

/** A raw message's headers, unfolded, and its body. */
function parse(raw: string): { headers: [string, string][]; body: string } {
  const split = raw.indexOf('\r\n\r\n')
  const lines = raw.slice(0, split).split('\r\n')
  const headers: [string, string][] = []
  for (const line of lines) {
    if (/^[ \t]/.test(line) && headers.length > 0) headers.at(-1)![1] += line
    else {
      const colon = line.indexOf(':')
      headers.push([line.slice(0, colon).toLowerCase(), line.slice(colon + 1).trim()])
    }
  }
  return { headers, body: raw.slice(split + 4) }
}

/** RFC 2047's encoded words — `=?UTF-8?Q?…?=` or `=?UTF-8?B?…?=` — back to text. */
function decodeWords(value: string): string {
  return value
    .replace(/\?=\s+=\?/g, '?==?')
    .replace(/=\?utf-8\?([QB])\?([^?]*)\?=/gi, (_, how: string, text: string) =>
      how.toUpperCase() === 'B'
        ? Buffer.from(text, 'base64').toString('utf8')
        : Buffer.from(
            text
              .replace(/_/g, ' ')
              .replace(/=([0-9A-F]{2})/gi, (_m, hex: string) =>
                String.fromCharCode(parseInt(hex, 16)),
              ),
            'latin1',
          ).toString('utf8'),
    )
}

/** A text body, by its transfer encoding. */
function decodeBody(body: string, encoding: string | undefined): string {
  if (encoding === 'base64') return Buffer.from(body, 'base64').toString('utf8')
  if (encoding === 'quoted-printable')
    return Buffer.from(
      body
        .replace(/=\r\n/g, '')
        .replace(/=([0-9A-F]{2})/gi, (_m, hex: string) =>
          String.fromCharCode(parseInt(hex, 16)),
        ),
      'latin1',
    ).toString('utf8')
  return body
}

afterEach(() => vi.restoreAllMocks())

describe('the message (Review Focus 2)', () => {
  it('a name carrying a line break and a Bcc is ONE subject line, readable in UTF-8 — and no Bcc, one To, text only', async () => {
    const transport = composingTransport()
    const mailer = createMailer(CONFIG, transport)
    mailer.tellTeam(notice('Chimie générale\r\nBcc: x@example.invalid'))
    await mailer.settled()

    expect(transport.raw).toHaveLength(1)
    const { headers, body } = parse(transport.raw[0]!)
    const named = (name: string) => headers.filter(([n]) => n === name).map(([, v]) => v)
    expect(named('subject')).toHaveLength(1)
    expect(named('subject')[0]).toMatch(/^=\?UTF-8\?[QB]\?/i)
    expect(decodeWords(named('subject')[0]!)).toBe(
      'Chimie générale Bcc: x@example.invalid (chem-labs): a release is waiting for sign-off for production',
    )
    expect(named('bcc')).toEqual([])
    expect(named('to')).toEqual(['team@manifest.internal'])
    expect(named('from')).toEqual(['Manifest <manifest@manifest.internal>'])
    expect(named('content-type')).toEqual(['text/plain; charset=utf-8'])
    // Text only: no multipart, no html part, no attachment.
    expect(transport.raw[0]).not.toMatch(/multipart|text\/html|Content-Disposition/i)
    expect(decodeBody(body, named('content-transfer-encoding')[0])).toContain(
      'Bio Prof asked for the release serving staging of Chimie générale\r\nBcc: x@example.invalid (chem-labs)',
    )
  })
})

describe('the mailer’s failures (Decision 11)', () => {
  it('returns before the transport answers, and settled() waits for it', async () => {
    let release!: () => void
    const answered = new Promise<void>((resolve) => (release = resolve))
    let finished = false
    const mailer = createMailer(CONFIG, {
      sendMail: async () => {
        await answered
        finished = true
        return {}
      },
    } as never)
    mailer.tellTeam(notice('Chem Labs'))
    expect(finished).toBe(false)
    const waiting = mailer.settled()
    release()
    await waiting
    expect(finished).toBe(true)
  })

  it('an undelivered email writes ONE operator line — the code, never the message, the subject or an address — and throws nothing', async () => {
    const lines: unknown[] = []
    vi.spyOn(console, 'error').mockImplementation((line: unknown) => {
      lines.push(line)
    })
    const mailer = createMailer(CONFIG, {
      sendMail: async () => {
        throw Object.assign(new Error('550 secret@example.invalid is not allowed'), {
          code: 'ECONNECTION',
          response: '550 secret@example.invalid is not allowed',
        })
      },
    } as never)
    expect(() => mailer.tellTeam(notice('Chem Labs'))).not.toThrow()
    await mailer.settled()
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0] as string)).toEqual({
      level: 'error',
      msg: 'the Manifest team could not be emailed; the queue still holds the item',
      notice: 'sign-off-asked',
      projectId: '6f1c1d2e-8a4b-4c3d-9e2f-1a2b3c4d5e6f',
      error: 'ECONNECTION',
    })
    expect(String(lines[0])).not.toMatch(
      /secret@|team@|manifest@|Chem Labs|waiting for sign-off/,
    )
  })

  it(
    'a server that accepts and never answers is given up on at the transport’s bound, with its code',
    async () => {
      const silent = net.createServer(() => {})
      await new Promise<void>((resolve) => silent.listen(0, '127.0.0.1', resolve))
      const lines: unknown[] = []
      vi.spyOn(console, 'error').mockImplementation((line: unknown) => {
        lines.push(line)
      })
      try {
        const port = (silent.address() as net.AddressInfo).port
        const mail = { ...MAIL, smtp: { ...MAIL.smtp, port } }
        // The platform's own transport, with its bound lowered for the test (10 s on the platform).
        const mailer = createMailer(
          { ...CONFIG, mail },
          smtpTransport(mail, { timeoutMs: 500 }),
        )
        const started = Date.now()
        mailer.tellTeam(notice('Chem Labs'))
        expect(Date.now() - started).toBeLessThan(100)
        await mailer.settled()
        expect(Date.now() - started).toBeLessThan(3_000)
        expect(lines.map((l) => JSON.parse(l as string).error)).toEqual(['ETIMEDOUT'])
      } finally {
        silent.close()
      }
    },
    scaled(10_000),
  )
})
