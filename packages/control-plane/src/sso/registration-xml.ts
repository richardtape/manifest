import { createHash, X509Certificate } from 'node:crypto'

/**
 * D19'S SP METADATA, IN THE STRUCTURE UBC IAM RECEIVES (§2's asset row and §9 as Spec action 4
 * applied them; the launch path plan's Task 10, Decision 12, `[M6]`).
 *
 * **UBC's `saml-metadata-generator`'s STRUCTURE, NEVER ITS CODE.** The tool is a web application, not
 * a library: its ACS and logout paths are the Shibboleth daemon's (`/Shibboleth.sso/…`), its `ID` is
 * `Math.random`, its `entityID` is the app's URL, and it hands the person a private key. So this
 * renderer writes, by hand, the elements the tool writes and in its order — the `md`, `ds` and `alg`
 * namespaces, its algorithm extensions, both key descriptors with the encryption methods, the
 * organisation, a technical contact — with MANIFEST'S values: the entity id derived for the
 * environment, its ACS and SLO (D15), and the certificate Manifest issued for it (D20).
 *
 * What `[M6]` changes from the tool's output, and why:
 *  - SAML 2.0 alone (`passport-ubcshib` speaks nothing else);
 *  - ONE `SingleLogoutService` (HTTP-Redirect) and ONE `AssertionConsumerService` (HTTP-POST, at the
 *    tool's own index 1, the default) — the app's, where the tool lists the daemon's six and three;
 *  - no `RequestInitiator` and no `ManageNameIDService` (the daemon's);
 *  - a `support` contact after the technical ones: the platform's administrators.
 *
 * **No `NameIDFormat` and no requested attributes**, as the tool writes none: UBC IAM asks for the
 * attributes on its own form, which is what the package's justifications are for.
 *
 * **A CERTIFICATE IS PUBLIC.** The input has no field a private key could arrive in, and the caller
 * holds only the public half (`sso/keypair.ts`'s `SpCertificate`).
 */

export interface Contact {
  name: string
  email: string
}

export interface RegistrationXmlInput {
  entityId: string
  acsUrl: string
  sloUrl: string
  /** The environment's own certificate, as PEM — never a private key. */
  certificatePem: string
  organization: { name: string; displayName: string; url: string }
  contacts: { technical: Contact[]; support: Contact[] }
}

const BINDING = {
  post: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST',
  redirect: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect',
}

/** The tool's default algorithm lists, exactly (`[M6]`). */
const DIGESTS = [
  'http://www.w3.org/2001/04/xmlenc#sha256',
  'http://www.w3.org/2001/04/xmldsig-more#sha384',
  'http://www.w3.org/2001/04/xmlenc#sha512',
]
const SIGNING = [
  'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
  'http://www.w3.org/2001/04/xmldsig-more#rsa-sha384',
  'http://www.w3.org/2001/04/xmldsig-more#rsa-sha512',
  'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256',
]
const ENCRYPTION = [
  'http://www.w3.org/2009/xmlenc11#aes128-gcm',
  'http://www.w3.org/2009/xmlenc11#aes256-gcm',
  'http://www.w3.org/2001/04/xmlenc#aes256-cbc',
]

/** Text and attribute values both: everything that is not markup is escaped. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** The certificate's base64 body, wrapped at 64 characters as the tool wraps it. */
function certificateBody(pem: string): string {
  const body = pem.replace(/-----(BEGIN|END) CERTIFICATE-----|\s/g, '')
  return (body.match(/.{1,64}/g) ?? []).join('\n')
}

/**
 * The certificate's subject as an RFC 2253 string — the last RDN first, comma-separated — which is
 * what `X509SubjectName` holds. Node lists the RDNs in the certificate's own order, one a line.
 */
function subjectName(pem: string): string {
  return new X509Certificate(pem).subject.split('\n').reverse().join(',')
}

/**
 * THE SAME INPUT RENDERS THE SAME BYTES: the document's `ID` is derived from the entity id's hash,
 * where the tool's is random — so a package drafted twice from the same values is the same package,
 * and a reader comparing two can trust a difference to mean something.
 */
function documentId(entityId: string): string {
  return `_${createHash('sha256').update(entityId).digest('hex').slice(0, 32)}`
}

function keyDescriptor(
  use: 'signing' | 'encryption',
  input: RegistrationXmlInput,
): string {
  const lines = [
    `    <md:KeyDescriptor use="${use}">`,
    '      <ds:KeyInfo>',
    `        <ds:KeyName>${esc(new URL(input.acsUrl).hostname)}</ds:KeyName>`,
    '        <ds:X509Data>',
    `          <ds:X509SubjectName>${esc(subjectName(input.certificatePem))}</ds:X509SubjectName>`,
    `          <ds:X509Certificate>${certificateBody(input.certificatePem)}</ds:X509Certificate>`,
    '        </ds:X509Data>',
    '      </ds:KeyInfo>',
    ...(use === 'encryption'
      ? ENCRYPTION.map((a) => `      <md:EncryptionMethod Algorithm="${a}"/>`)
      : []),
    '    </md:KeyDescriptor>',
  ]
  return lines.join('\n')
}

function contactPerson(type: 'technical' | 'support', contact: Contact): string {
  return [
    `  <md:ContactPerson contactType="${type}">`,
    `    <md:EmailAddress>${esc(contact.email)}</md:EmailAddress>`,
    '  </md:ContactPerson>',
  ].join('\n')
}

/**
 * The `EntityDescriptor` UBC IAM receives for one environment's registration. The caller is
 * `launch/package.ts`'s `assemblePackage`, which draws every value from the package it is building.
 */
export function renderRegistrationMetadata(input: RegistrationXmlInput): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:alg="urn:oasis:names:tc:SAML:metadata:algsupport" ID="${documentId(input.entityId)}" entityID="${esc(input.entityId)}">`,
    '',
    '  <md:Extensions>',
    ...DIGESTS.map((a) => `    <alg:DigestMethod Algorithm="${a}"/>`),
    ...SIGNING.map((a) => `    <alg:SigningMethod Algorithm="${a}"/>`),
    '  </md:Extensions>',
    '',
    '  <md:SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">',
    keyDescriptor('signing', input),
    '',
    keyDescriptor('encryption', input),
    '',
    `    <md:SingleLogoutService Binding="${BINDING.redirect}" Location="${esc(input.sloUrl)}"/>`,
    '',
    `    <md:AssertionConsumerService Binding="${BINDING.post}" Location="${esc(input.acsUrl)}" index="1" isDefault="true"/>`,
    '  </md:SPSSODescriptor>',
    '',
    '  <md:Organization>',
    `    <md:OrganizationName>${esc(input.organization.name)}</md:OrganizationName>`,
    `    <md:OrganizationDisplayName>${esc(input.organization.displayName)}</md:OrganizationDisplayName>`,
    `    <md:OrganizationURL>${esc(input.organization.url)}</md:OrganizationURL>`,
    '  </md:Organization>',
    '',
    ...input.contacts.technical.map((c) => contactPerson('technical', c)),
    ...input.contacts.support.map((c) => contactPerson('support', c)),
    '',
    '</md:EntityDescriptor>',
    '',
  ].join('\n')
}
