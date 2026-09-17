import { describe, expect, it } from 'vitest'
import {
  encodeLoginCookie,
  newLoginNonce,
  readLoginCookie,
  safeReturnTo,
  sameNonce,
} from './login-state.js'

describe('a sign-in’s state (P5a Task 4)', () => {
  it('keeps a same-origin path and replaces anything else with /', () => {
    expect(safeReturnTo('/projects/42')).toBe('/projects/42')
    expect(safeReturnTo('/')).toBe('/')
    expect(safeReturnTo('/v1/me?x=1#y')).toBe('/v1/me?x=1#y')
    for (const hostile of [
      '//evil.example/x',
      'https://evil.example/',
      '/\\evil.example',
      '/\tevil',
      ' /x',
      'x',
      '',
      undefined,
      42,
      `/${'a'.repeat(600)}`,
    ]) {
      expect(safeReturnTo(hostile), String(hostile)).toBe('/')
    }
  })

  it('round-trips the nonce and the return path through the cookie, and re-checks the path', () => {
    const nonce = newLoginNonce()
    expect(readLoginCookie(encodeLoginCookie(nonce, '/v1/me'))).toEqual({
      nonce,
      returnTo: '/v1/me',
    })
    const forged = `${nonce}.${Buffer.from('//evil.example').toString('base64url')}`
    expect(readLoginCookie(forged)).toEqual({ nonce, returnTo: '/' })
    expect(readLoginCookie(undefined)).toBeUndefined()
    expect(readLoginCookie('no-dot')).toBeUndefined()
    expect(readLoginCookie('.bm9ub25jZQ')).toBeUndefined()
  })

  it('makes a nonce short enough for SAML RelayState (80 bytes, SAML Bindings §3.4.3)', () => {
    expect(Buffer.byteLength(newLoginNonce())).toBeLessThanOrEqual(80)
    expect(newLoginNonce()).not.toBe(newLoginNonce())
  })

  it('compares nonces without a length or content short-circuit', () => {
    const nonce = newLoginNonce()
    expect(sameNonce(nonce, nonce)).toBe(true)
    expect(sameNonce(nonce, newLoginNonce())).toBe(false)
    expect(sameNonce(nonce, nonce.slice(1))).toBe(false)
    expect(sameNonce('', '')).toBe(false)
  })
})
