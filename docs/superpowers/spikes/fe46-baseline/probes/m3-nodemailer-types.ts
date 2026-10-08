// fe46 [M3]: do nodemailer 10.0.13's own .d.ts files carry what Decisions 10-14 assume, under
// the repo's NodeNext + strict + exactOptionalPropertyTypes? Typecheck only; nothing is sent.
import nodemailer from 'nodemailer'
import type { Transporter, SendMailOptions } from 'nodemailer'

const smtp: Transporter = nodemailer.createTransport({
  host: '127.0.0.1',
  port: 7111,
  secure: false,
  requireTLS: false,
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 10_000,
  disableFileAccess: true,
  disableUrlAccess: true,
})
const stream = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' })
const msg: SendMailOptions = { from: 'Manifest <manifest@manifest.internal>', to: 'team@manifest.internal', subject: 's', text: 't' }
export async function probe(): Promise<string> {
  const info = await stream.sendMail(msg)
  void smtp
  return String(info.messageId)
}
