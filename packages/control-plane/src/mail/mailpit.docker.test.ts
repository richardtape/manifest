import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { describeDocker } from '../runtime/testing.js'
import { createMailer, smtpTransport } from './index.js'

/**
 * ONE MESSAGE THROUGH THE REAL MAILPIT (§21's tenth container; the FE-46/47/5 plan's Task 3): the
 * platform's own transport to 127.0.0.1:7111, read back through its API on 7112 by a nonce, and
 * deleted by id — the only message this touches. The name carries an accent and a `\r\nBcc:` line,
 * so what arrives is the answer to Review Focus 2, read from the inbox rather than a composer.
 */
const API = 'http://127.0.0.1:7112/api/v1'
const MAIL = {
  smtp: { host: '127.0.0.1', port: 7111, secure: false, requireTLS: false, auth: null },
  team: 'team@manifest.internal',
  from: 'Manifest <manifest@manifest.internal>',
}

describeDocker('the Manifest team’s email, through Mailpit', () => {
  it('arrives with one subject line in UTF-8, no Bcc, the team as its one recipient, and the text', async () => {
    const nonce = `fe46-${randomUUID().slice(0, 8)}`
    const mailer = createMailer(
      { mail: MAIL, sp: { origin: 'https://console.manifest.internal' } },
      smtpTransport(MAIL),
    )
    mailer.tellTeam({
      kind: 'sign-off-asked',
      project: {
        id: randomUUID(),
        slug: 'chem-labs',
        name: `${nonce} Chimie générale\r\nBcc: probe@example.invalid`,
      },
      releaseId: randomUUID(),
      by: 'Bio Prof',
      viaToken: false,
      at: new Date(),
    })
    await mailer.settled()

    const search = `${API}/search?query=${encodeURIComponent(`subject:"${nonce}"`)}`
    let id: string | undefined
    for (let i = 0; i < 20 && id === undefined; i++) {
      id = ((await (await fetch(search)).json()) as { messages: { ID: string }[] })
        .messages[0]?.ID
      if (id === undefined) await new Promise((resolve) => setTimeout(resolve, 250))
    }
    expect(id, `Mailpit never found a subject with ${nonce}`).toBeDefined()
    try {
      const message = (await (await fetch(`${API}/message/${id}`)).json()) as {
        Subject: string
        To: { Address: string }[]
        Bcc: unknown[]
        Text: string
      }
      const headers = (await (
        await fetch(`${API}/message/${id}/headers`)
      ).json()) as Record<string, string[]>
      expect(headers.Subject).toHaveLength(1)
      expect(message.Subject).toBe(
        `${nonce} Chimie générale Bcc: probe@example.invalid (chem-labs): a release is waiting for sign-off for production`,
      )
      expect(headers.Bcc).toBeUndefined()
      expect(message.Bcc).toEqual([])
      expect(message.To.map((to) => to.Address)).toEqual(['team@manifest.internal'])
      expect(headers['Content-Type']).toEqual(['text/plain; charset=utf-8'])
      expect(message.Text).toContain('Bio Prof asked for the release serving staging of')
      expect(message.Text).toContain('Chimie générale')
    } finally {
      await fetch(`${API}/messages`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ IDs: [id] }),
      })
      const left = (await (await fetch(search)).json()) as { messages_count: number }
      expect(left.messages_count).toBe(0)
    }
  })
})
