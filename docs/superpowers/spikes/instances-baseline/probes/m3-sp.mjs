// [M3], library level: ONE service provider process, its strategy built by the
// blueprint skeleton's OWN auth/ubcshib.js (mounted from the repository), on the
// node_modules of a built node-ts-mongo app image. Errors are answered with their message.
import express from 'express'
import session from 'express-session'
import passport from 'passport'
import { configureCwl } from './auth/ubcshib.js'

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
app.get('/login/failed', (_req, res) => res.status(401).json({ instance: name, failed: true }))
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- express knows an error handler by its four parameters
app.use((err, _req, res, _next) => res.status(500).json({ instance: name, error: err.message }))
app.listen(Number(process.env.PORT), '127.0.0.1', () => process.send?.('ready'))
