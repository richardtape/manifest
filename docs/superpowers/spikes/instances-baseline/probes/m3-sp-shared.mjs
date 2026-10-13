// [M3]'s positive control: sp.mjs with ONE change — the strategy is given a request-id cache
// that both processes share (a directory standing in for the app's Mongo), passed as
// node-saml's cacheProvider through passport-ubcshib's unmanaged-option pass-through.
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
const DIR = '/tmp/m3-shared-cache'
mkdirSync(DIR, { recursive: true })
const file = (k) => `${DIR}/${Buffer.from(k).toString('hex')}`
globalThis.__m3cache = {
  async saveAsync(key, value) {
    if (existsSync(file(key))) return null
    writeFileSync(file(key), value)
    return { createdAt: Date.now(), value }
  },
  async getAsync(key) {
    return existsSync(file(key)) ? readFileSync(file(key), 'utf8') : null
  },
  async removeAsync(key) {
    if (!existsSync(file(key))) return null
    rmSync(file(key))
    return key
  },
}
const express = (await import('express')).default
const session = (await import('express-session')).default
const passport = (await import('passport')).default
const { configureCwl } = await import('./auth/ubcshib.js')
const name = process.env.NAME
const cwl = configureCwl()
const app = express()
app.use(express.urlencoded({ extended: false }))
app.use(session({ secret: 'a1s1-m3-throwaway', resave: false, saveUninitialized: false }))
app.use(passport.initialize())
app.use(passport.session())
app.get('/login', cwl.login)
app.post('/auth/ubcshib/callback', cwl.callback, (req, res) =>
  res.status(200).json({ instance: name, signedIn: true, puid: req.user?.user?.ubcEduCwlPuid ?? null }),
)
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- express knows an error handler by its four parameters
app.use((err, _req, res, _next) => res.status(500).json({ instance: name, error: err.message }))
app.listen(Number(process.env.PORT), '127.0.0.1', () => process.send?.('ready'))
