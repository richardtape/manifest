import { readFileSync } from 'node:fs'
import { X509Certificate } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { mintSpKeypair, type SpKeypair } from './keypair.js'
import {
  renderRegistrationMetadata,
  type RegistrationXmlInput,
} from './registration-xml.js'

/**
 * D19's SP METADATA, IN UBC'S STRUCTURE (the launch path plan's Task 10, `[M6]`). The fixture beside
 * this file is `saml-metadata-generator`'s own output, recorded by Task 1 from a copy of the tool
 * (`docs/superpowers/spikes/launch-baseline/probes/ubc-structure.xml`). The renderer keeps its
 * elements and their order, and changes exactly what `[M6]` says it changes — so the expected order
 * below is the TOOL'S order with those changes applied, never a list written from the renderer.
 */

/** Every element's qualified name, in document order. */
function elementOrder(xml: string): string[] {
  return [...xml.matchAll(/<([A-Za-z][\w.-]*:[\w.-]+)[\s/>]/g)].map((m) => m[1]!)
}

/**
 * `[M6]`'s changes to the tool's order: its Shibboleth daemon's extension (`init:RequestInitiator`, and
 * the `md:Extensions` inside the SP descriptor that holds it) and `md:ManageNameIDService` dropped; ONE
 * `md:SingleLogoutService` and ONE `md:AssertionConsumerService`; a second `md:ContactPerson` — the
 * platform's support contact — after the technical one.
 */
function ubcStructureOrder(): string[] {
  const tool = elementOrder(
    readFileSync(new URL('./fixtures/ubc-structure.xml', import.meta.url), 'utf8'),
  )
  const out: string[] = []
  let seenSlo = false
  let seenAcs = false
  tool.forEach((name, i) => {
    if (name === 'init:RequestInitiator' || name === 'md:ManageNameIDService') return
    // The SP descriptor's own Extensions — the one whose next element is the daemon's initiator.
    if (name === 'md:Extensions' && tool[i + 1] === 'init:RequestInitiator') return
    if (name === 'md:SingleLogoutService') {
      if (seenSlo) return
      seenSlo = true
    }
    if (name === 'md:AssertionConsumerService') {
      if (seenAcs) return
      seenAcs = true
    }
    out.push(name)
  })
  return [...out, 'md:ContactPerson', 'md:EmailAddress']
}

let keypair: SpKeypair
const ORG = {
  name: 'University of British Columbia',
  displayName: 'University of British Columbia',
  url: 'https://www.ubc.ca',
}
const input = (): RegistrationXmlInput => ({
  entityId: 'https://manifest.internal/sp/lp-sample/staging',
  acsUrl: 'https://lp-sample.staging.manifest.internal/auth/saml/callback',
  sloUrl: 'https://lp-sample.staging.manifest.internal/auth/logout',
  certificatePem: keypair.certificatePem,
  organization: ORG,
  contacts: {
    technical: [{ name: 'Bio Prof', email: 'bio.prof@example.ubc.ca' }],
    support: [{ name: 'Platform Admin', email: 'admin@example.ubc.ca' }],
  },
})

beforeAll(async () => {
  keypair = await mintSpKeypair({
    projectId: '',
    environmentKind: 'staging',
    slug: 'lp-sample',
    entityId: 'https://manifest.internal/sp/lp-sample/staging',
  })
})

describe('renderRegistrationMetadata — UBC’s structure, Manifest’s values (Task 10)', () => {
  it('renders UBC’s structure with Manifest’s values, and escapes what it is given', () => {
    const xml = renderRegistrationMetadata({
      ...input(),
      organization: { ...ORG, displayName: 'Arts & Science <One>' },
    })
    expect(elementOrder(xml)).toEqual(ubcStructureOrder())
    expect(xml).toContain('entityID="https://manifest.internal/sp/lp-sample/staging"')
    expect(xml).toContain(
      'Location="https://lp-sample.staging.manifest.internal/auth/saml/callback"',
    )
    expect(xml).toContain('Arts &amp; Science &lt;One&gt;')
    expect(xml).not.toMatch(/PRIVATE KEY/)
    // The tool's daemon paths are never ours (Decision 12).
    expect(xml).not.toMatch(/Shibboleth\.sso/)
  })

  it('speaks SAML 2.0 alone, with one ACS (HTTP-POST, index 1, the default) and one SLO (HTTP-Redirect)', () => {
    const xml = renderRegistrationMetadata(input())
    expect(xml).toContain(
      'protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol"',
    )
    expect(xml).toMatch(
      /<md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2\.0:bindings:HTTP-POST" Location="https:\/\/lp-sample\.staging\.manifest\.internal\/auth\/saml\/callback" index="1" isDefault="true"\/>/,
    )
    expect(xml).toMatch(
      /<md:SingleLogoutService Binding="urn:oasis:names:tc:SAML:2\.0:bindings:HTTP-Redirect" Location="https:\/\/lp-sample\.staging\.manifest\.internal\/auth\/logout"\/>/,
    )
    // No NameIDFormat, as the tool writes none; and no attribute request — UBC asks for those on its form.
    expect(xml).not.toMatch(/NameIDFormat|RequestedAttribute/)
  })

  it('carries the certificate it is given, in both key descriptors — its body, its subject, and the app’s hostname', () => {
    const xml = renderRegistrationMetadata(input())
    const bodies = [
      ...xml.matchAll(/<ds:X509Certificate>([^<]+)<\/ds:X509Certificate>/g),
    ].map((m) => m[1]!.replace(/\s/g, ''))
    expect(bodies).toEqual([keypair.certData, keypair.certData])
    // Wrapped as the tool wraps it: 64 characters a line.
    expect(xml).toMatch(/<ds:X509Certificate>[A-Za-z0-9+/]{64}\n/)
    const subject = new X509Certificate(keypair.certificatePem).subject
      .split('\n')
      .reverse()
      .join(',')
    expect(xml.match(/<ds:X509SubjectName>([^<]+)</g)).toEqual([
      `<ds:X509SubjectName>${subject}<`,
      `<ds:X509SubjectName>${subject}<`,
    ])
    expect(xml.match(/<ds:KeyName>([^<]+)</g)).toEqual([
      '<ds:KeyName>lp-sample.staging.manifest.internal<',
      '<ds:KeyName>lp-sample.staging.manifest.internal<',
    ])
  })

  it('one ContactPerson per contact — the technical ones, then the support ones — each with its address', () => {
    const xml = renderRegistrationMetadata({
      ...input(),
      contacts: {
        technical: [
          { name: 'Bio Prof', email: 'bio.prof@example.ubc.ca' },
          { name: 'Co Instructor', email: 'co@example.ubc.ca' },
        ],
        support: [{ name: 'Platform Admin', email: 'admin@example.ubc.ca' }],
      },
    })
    expect(
      [
        ...xml.matchAll(
          /<md:ContactPerson contactType="(\w+)">\s*<md:EmailAddress>([^<]+)</g,
        ),
      ].map((m) => `${m[1]} ${m[2]}`),
    ).toEqual([
      'technical bio.prof@example.ubc.ca',
      'technical co@example.ubc.ca',
      'support admin@example.ubc.ca',
    ])
  })

  it('renders the same bytes for the same input — its ID is the entity’s hash, never random', () => {
    const first = renderRegistrationMetadata(input())
    expect(renderRegistrationMetadata(input())).toBe(first)
    expect(first).toMatch(/ ID="_[0-9a-f]{32}"/)
    expect(
      renderRegistrationMetadata({
        ...input(),
        entityId: 'https://manifest.internal/sp/lp-sample/production',
      }).match(/ ID="([^"]+)"/)?.[1],
    ).not.toBe(first.match(/ ID="([^"]+)"/)?.[1])
  })
})
