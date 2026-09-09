import { describe, expect, it } from 'vitest'
import { listenerFor, routeIdFor } from './hostnames.js'
import { hostnameFor, loadConfig } from '../config.js'

const config = loadConfig({
  MANIFEST_ENV: 'development',
  MANIFEST_DATABASE_URL: 'postgres://m:m@127.0.0.1:7103/m',
  MANIFEST_IDP_DATABASE_URL: 'postgres://m:m@127.0.0.1:7103/idp',
  MANIFEST_SESSION_SECRET: 'x'.repeat(32),
  MANIFEST_BLUEPRINTS_ROOT: '/tmp/b',
  MANIFEST_REPOS_ROOT: '/tmp/r',
})

describe('§23 hostname derivation', () => {
  // The environment kind is carried by the ZONE, never by a suffix on the label.
  // A suffix scheme is squattable: `chem-labs-staging` is itself a legal slug.
  it('puts the environment kind in the zone, never in the label', () => {
    expect(hostnameFor(config, 'sandbox', 'chem-labs')).toBe(
      'chem-labs.sandbox.manifest.internal',
    )
    expect(hostnameFor(config, 'staging', 'chem-labs')).toBe(
      'chem-labs.staging.manifest.internal',
    )
    expect(hostnameFor(config, 'production', 'chem-labs')).toBe(
      'chem-labs.manifest.internal',
    )
  })

  it('makes a project named chem-labs-staging distinct from chem-labs staging', () => {
    expect(hostnameFor(config, 'production', 'chem-labs-staging')).not.toBe(
      hostnameFor(config, 'staging', 'chem-labs'),
    )
  })
})

describe('listener assignment (§12)', () => {
  it('binds sandbox and staging internal, production public', () => {
    expect(listenerFor('sandbox')).toBe('internal')
    expect(listenerFor('staging')).toBe('internal')
    expect(listenerFor('production')).toBe('public')
  })
})

describe('route ids', () => {
  it('derives a stable, Caddy-safe id from the hostname', () => {
    expect(routeIdFor('chem-labs.staging.manifest.internal')).toBe(
      'mf-chem-labs-staging-manifest-internal',
    )
    expect(routeIdFor('a.b')).toBe(routeIdFor('a.b'))
  })
})
