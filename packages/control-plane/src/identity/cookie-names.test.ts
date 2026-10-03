import { describe, expect, it } from 'vitest'
import {
  HOST_LOGIN_COOKIE,
  HOST_SESSION_COOKIE,
  HOST_STEP_UP_COOKIE,
  LOGIN_COOKIE,
  SESSION_COOKIE,
  STEP_UP_COOKIE,
  cookieNames,
} from './index.js'

/**
 * FE-28: the three cookies a sign-in uses are named by the SCHEME of the origin a request
 * arrived on. On https the `__Host-` prefix makes a browser refuse any cookie of that name
 * that is not Secure, `Path=/` and host-only, so no sibling `<slug>.manifest.internal` can
 * plant one with `Domain=manifest.internal`. On loopback http the plain names stay.
 */
describe('cookieNames — by the origin’s scheme (FE-28)', () => {
  it('names the __Host- cookies on an https origin', () => {
    for (const origin of [
      'https://console.manifest.internal',
      'https://app.manifest.internal',
    ]) {
      expect(cookieNames(origin)).toEqual({
        session: '__Host-manifest_session',
        login: '__Host-manifest_login',
        stepUp: '__Host-manifest_stepup',
      })
    }
    expect([HOST_SESSION_COOKIE, HOST_LOGIN_COOKIE, HOST_STEP_UP_COOKIE]).toEqual([
      '__Host-manifest_session',
      '__Host-manifest_login',
      '__Host-manifest_stepup',
    ])
  })

  it('keeps the plain names on a loopback http origin', () => {
    for (const origin of ['http://127.0.0.1:7189', 'http://localhost:7189']) {
      expect(cookieNames(origin)).toEqual({
        session: SESSION_COOKIE,
        login: LOGIN_COOKIE,
        stepUp: STEP_UP_COOKIE,
      })
    }
    expect([SESSION_COOKIE, LOGIN_COOKIE, STEP_UP_COOKIE]).toEqual([
      'manifest_session',
      'manifest_login',
      'manifest_stepup',
    ])
  })
})
