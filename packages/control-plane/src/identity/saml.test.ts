import { describe, expect, it } from 'vitest'
import { answersARequest } from './saml.js'

/**
 * The LogoutResponse's own check (`requireInResponseTo`), read ONCE — `[S3]`'s class (the
 * front-end enablement plan's Task 5). As one expression it read to a tag's end again from
 * every opening in it: 1.65 s for 256 KiB of openings, on a message nobody had yet verified.
 */
describe('answersARequest — a LogoutResponse answers a request', () => {
  it('reads 1 MiB of openings with no end in well under a second', () => {
    const xml = '<LogoutResponse '.repeat(64 * 1024)
    const started = performance.now()
    expect(answersARequest(xml)).toBe(false)
    const ms = performance.now() - started
    expect(ms, `${Math.round(ms)} ms`).toBeLessThan(1000)
    // …and still finds the answer after all of them.
    expect(answersARequest(`${xml} InResponseTo="_abc">`)).toBe(true)
  })

  it('answers exactly what the expression answered before, over 20,000 generated messages', () => {
    // THE ORACLE: the check exactly as written until 2026-09-27.
    const before = /<(?:[\w-]+:)?LogoutResponse\b[^>]*\bInResponseTo="[^"]+"/
    let state = 20260927
    const random = () => {
      state = (state + 0x6d2b79f5) | 0
      let t = Math.imul(state ^ (state >>> 15), 1 | state)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const PIECES = [
      '<LogoutResponse',
      '<samlp:LogoutResponse',
      '<LogoutResponses',
      '<a-b:LogoutResponse',
      ' ',
      '>',
      '<',
      'InResponseTo="',
      'xInResponseTo="',
      '"',
      '_id',
      '""',
      'ID="_x"',
      '/>',
      '\n',
      'a',
      ':',
    ]
    const disagree: string[] = []
    let answered = 0
    for (let n = 0; n < 20_000; n++) {
      const xml = Array.from(
        { length: 1 + Math.floor(random() * 16) },
        () => PIECES[Math.floor(random() * PIECES.length)]!,
      ).join('')
      const was = before.test(xml)
      if (was) answered += 1
      if (answersARequest(xml) !== was && disagree.length < 5)
        disagree.push(JSON.stringify(xml))
    }
    expect(disagree).toEqual([])
    expect(answered).toBeGreaterThan(200) // not vacuous
    expect(answered).toBeLessThan(19_800)
  })
})
