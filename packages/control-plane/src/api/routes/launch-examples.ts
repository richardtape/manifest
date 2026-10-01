import type { z } from 'zod/v4'
import type { IamRegistration, LaunchRecords } from '../representations/launch.js'

/**
 * THE LAUNCH ROUTES' EXAMPLES THAT CARRY A PACKAGE (the launch path plan's Task 10), each an answer
 * CAPTURED from `api/launch.test.ts` (the Global Constraints: examples are captured, never written) —
 * a CWL app's staging registration drafted, then sent. Long because a real package is: the certificate
 * and the metadata are what a person sends UBC IAM. Their own module so the routes stay readable.
 */

/** `draftIamRegistration`: the first draft of the staging registration. */
export const DRAFTED_EXAMPLE = {
  id: 'fa225a19-b57e-46c0-bc3e-eb44e428169c',
  projectId: 'f07c67f0-a378-4b1b-9e34-1afe372b187e',
  environment: 'staging',
  entityId: 'https://manifest.internal/sp/cwl-56a0c1e2/staging',
  acsUrl: 'https://cwl-56a0c1e2.staging.manifest.internal/auth/ubcshib/callback',
  sloUrl: 'https://cwl-56a0c1e2.staging.manifest.internal/auth/logout',
  certFingerprint: null,
  certExpiresAt: null,
  registeredAttributes: [],
  requestedAttributes: null,
  registeredAt: null,
  state: 'draft',
  externalTicketRef: null,
  submittedAt: null,
  submittedBy: null,
  package: {
    environment: 'staging',
    generatedAt: '2026-10-01T14:53:01.024Z',
    fromCommit: '682bbf005259758fd3ab2ea903983077d1a468b4',
    entityId: 'https://manifest.internal/sp/cwl-56a0c1e2/staging',
    acsUrl: 'https://cwl-56a0c1e2.staging.manifest.internal/auth/ubcshib/callback',
    sloUrl: 'https://cwl-56a0c1e2.staging.manifest.internal/auth/logout',
    certificate: {
      pem: '-----BEGIN CERTIFICATE-----\nMIIFhTCCA22gAwIBAgIUA6kwjjsTzFhDnISuIdlr29NKt20wDQYJKoZIhvcNAQEL\nBQAwMjEdMBsGA1UEAwwUY3dsLTU2YTBjMWUyLXN0YWdpbmcxETAPBgNVBAoMCE1h\nbmlmZXN0MB4XDTI2MTAwMTE0NTMwMFoXDTI4MDkzMDE0NTMwMFowMjEdMBsGA1UE\nAwwUY3dsLTU2YTBjMWUyLXN0YWdpbmcxETAPBgNVBAoMCE1hbmlmZXN0MIICIjAN\nBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAoHjx8128O6LkcC0Ib/fgDb7QeH6L\n6ENdNu37ho+vpWnpe2B/43/ihpxYyZPhL7S2tbCyWY0/azjkC7ZrdxYotEBnVSbs\n+0QK+MbR0DpK+Hy/cFZN0LICoaSluUW8KZsOiRGd1GPDYx0zjLR0WDBrZ5sOvyNp\nIOoz6WWCKfMYtIQgUTNpUu8lVZDcQUnhbiYaNnwEX2ZwadL31erYydLCk5DXvRtT\n2ridNlUuq1RtniKrPZSjsvjW6mPBR4HpHEbpu6V2mFG7eEndV4iRbQggCOG93sUV\ngn7zU3W3HC/uHKgOIJV/TTuoeS0rw1tDDF7WTE1odGjN1wWXu6kAI0UnNIOZufv4\nHcVykvUaJcvBp154HR/RQzgN4Fc4xY7MizuRtzO1dH5lbFOqhKNRw0JgcwaxDqsf\nqO2GjSoHxhmkGkbhsFUlz0xi4+OYMDUwcG6zTyVyRz9Gw5Ykk6mcKSw2Tbzynu1w\nQ9G3h9xf3J4h/vCeswZGVOP8HS8QabI0i6afEJF7b8OVVH1QonGWnfnuzfc+PpdL\nD00sf/EPdvzpvebm86kJDPUu3F/swYY92Tkwa9YD3iJaolWVhzOsyeCPty5nPUvK\nGXLf7lorn7FLWRdPV6W4mZtcHGM0PxCoUwPbTL+Gah/wLhYMV/qYZPA24MJJ+WH3\nImVfkD7hNYM0dWECAwEAAaOBkjCBjzAdBgNVHQ4EFgQUXTRB4dpCJD5Q/wSsVgr5\ng4PSLi8wHwYDVR0jBBgwFoAUXTRB4dpCJD5Q/wSsVgr5g4PSLi8wDwYDVR0TAQH/\nBAUwAwEB/zA8BgNVHREENTAzhjFodHRwczovL21hbmlmZXN0LmludGVybmFsL3Nw\nL2N3bC01NmEwYzFlMi9zdGFnaW5nMA0GCSqGSIb3DQEBCwUAA4ICAQAbRgLhQ4W+\n7yQQ/+KoFFF/F4q01yDwTMCr06OdFY5Cxs2IemKAQgHWGsypaaVdB8GszY7os+sZ\niIFgOLgADMF4EqRfhX+LrFmHZBNppobrceOylUuk1JOELCxUgYy7M2U84vARe/ZE\n04+9I93sndiOHDWYza1viQvIbDAc0is0sqZ3TonIVnKpRMQ4oKWrgB+Tx++sXBBL\nrfl9ILYXU2I6YsL9N+CS/TkW9xvdHExzcPtyFuem0AtqSa647BBxQNtPWIKLLFku\nbf6os8qQuM6DuGJqX+wTnG5FIjNLNoKIPPa0EUDrmBuSZJoeCH10tRI5kq//owM4\nuji1QP4cWbdbBiQWgSGOM4KhttLKjpN5Uw/tcpxq2ccg6ZB3fo0C7Ug1cpHfSX2j\nKsi0Y12EmFHaz0neRdXkuCKdc8Krc5tqijIPKgdem5qALQhDLw4kZL1N7xQbTbuG\nLhcONHDAH6qC2hiJ3dJaW6xs/sHmY/uCT1F2WafdMKAODr2FeqUuMPOwV7BrKXDx\n2KjNAMHN7xumweDJVVVUIUixYqMOQn+PPmrxMUo6lZW6OlNeZ6lkzKod31BUFN0Q\niGOE/fcB6EwpCKd1I7RR7qDvfNdWKgd6+S/4Iz17lCapy9vV5FldReldjYWc961K\n9NfNOOAOoIXRsM0lpjwYnm86+6XiX7iw+Q==\n-----END CERTIFICATE-----\n',
      fingerprint:
        'F3:D6:88:CD:AF:34:68:BC:8A:E2:14:C0:1B:B8:8D:FE:CC:F2:07:2C:DB:20:72:92:0E:FF:3F:FF:5A:75:24:95',
      expiresAt: '2028-09-30T14:53:00.000Z',
    },
    attributes: [
      {
        name: 'ubcEduCwlPuid',
        oid: 'urn:oid:1.3.6.1.4.1.60.6.1.6',
        purpose:
          'Identifies the person who signs in, so the app can recognise them when they return and keep their work apart from everyone else’s.',
        usedAt: [
          {
            path: 'routes/people.js',
            line: 3,
          },
        ],
        justification:
          'Identifies the person who signs in, so the app can recognise them when they return and keep their work apart from everyone else’s. The app reads it in routes/people.js:3.',
        unused: false,
      },
      {
        name: 'mail',
        oid: 'urn:oid:0.9.2342.19200300.100.1.3',
        purpose: 'The person’s email address, so the app can show it or write to them.',
        usedAt: [
          {
            path: 'public/app.js',
            line: 2,
          },
        ],
        justification:
          'The person’s email address, so the app can show it or write to them. The app shows it to the person in the browser, in public/app.js:2.',
        unused: false,
      },
      {
        name: 'givenName',
        oid: 'urn:oid:2.5.4.42',
        purpose:
          'The person’s first name, so the app can greet them and show who wrote what.',
        usedAt: [
          {
            path: 'routes/people.js',
            line: 3,
          },
        ],
        justification:
          'The person’s first name, so the app can greet them and show who wrote what. The app reads it in routes/people.js:3.',
        unused: false,
      },
    ],
    usedAtTruncated: false,
    contacts: {
      technical: [
        {
          name: 'Bio Prof',
          email: 'bio_prof@example.ubc.ca',
        },
      ],
      support: [
        {
          name: 'Platform Admin',
          email: 'platform_admin@example.ubc.ca',
        },
      ],
    },
    privacyAssessmentReference: null,
    metadataXml:
      '<?xml version="1.0" encoding="UTF-8"?>\n<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:alg="urn:oasis:names:tc:SAML:metadata:algsupport" ID="_ffa24c163d06a582e524876b6a9ed218" entityID="https://manifest.internal/sp/cwl-56a0c1e2/staging">\n\n  <md:Extensions>\n    <alg:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>\n    <alg:DigestMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#sha384"/>\n    <alg:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha512"/>\n    <alg:SigningMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>\n    <alg:SigningMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha384"/>\n    <alg:SigningMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha512"/>\n    <alg:SigningMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256"/>\n  </md:Extensions>\n\n  <md:SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">\n    <md:KeyDescriptor use="signing">\n      <ds:KeyInfo>\n        <ds:KeyName>cwl-56a0c1e2.staging.manifest.internal</ds:KeyName>\n        <ds:X509Data>\n          <ds:X509SubjectName>O=Manifest,CN=cwl-56a0c1e2-staging</ds:X509SubjectName>\n          <ds:X509Certificate>MIIFhTCCA22gAwIBAgIUA6kwjjsTzFhDnISuIdlr29NKt20wDQYJKoZIhvcNAQEL\nBQAwMjEdMBsGA1UEAwwUY3dsLTU2YTBjMWUyLXN0YWdpbmcxETAPBgNVBAoMCE1h\nbmlmZXN0MB4XDTI2MTAwMTE0NTMwMFoXDTI4MDkzMDE0NTMwMFowMjEdMBsGA1UE\nAwwUY3dsLTU2YTBjMWUyLXN0YWdpbmcxETAPBgNVBAoMCE1hbmlmZXN0MIICIjAN\nBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAoHjx8128O6LkcC0Ib/fgDb7QeH6L\n6ENdNu37ho+vpWnpe2B/43/ihpxYyZPhL7S2tbCyWY0/azjkC7ZrdxYotEBnVSbs\n+0QK+MbR0DpK+Hy/cFZN0LICoaSluUW8KZsOiRGd1GPDYx0zjLR0WDBrZ5sOvyNp\nIOoz6WWCKfMYtIQgUTNpUu8lVZDcQUnhbiYaNnwEX2ZwadL31erYydLCk5DXvRtT\n2ridNlUuq1RtniKrPZSjsvjW6mPBR4HpHEbpu6V2mFG7eEndV4iRbQggCOG93sUV\ngn7zU3W3HC/uHKgOIJV/TTuoeS0rw1tDDF7WTE1odGjN1wWXu6kAI0UnNIOZufv4\nHcVykvUaJcvBp154HR/RQzgN4Fc4xY7MizuRtzO1dH5lbFOqhKNRw0JgcwaxDqsf\nqO2GjSoHxhmkGkbhsFUlz0xi4+OYMDUwcG6zTyVyRz9Gw5Ykk6mcKSw2Tbzynu1w\nQ9G3h9xf3J4h/vCeswZGVOP8HS8QabI0i6afEJF7b8OVVH1QonGWnfnuzfc+PpdL\nD00sf/EPdvzpvebm86kJDPUu3F/swYY92Tkwa9YD3iJaolWVhzOsyeCPty5nPUvK\nGXLf7lorn7FLWRdPV6W4mZtcHGM0PxCoUwPbTL+Gah/wLhYMV/qYZPA24MJJ+WH3\nImVfkD7hNYM0dWECAwEAAaOBkjCBjzAdBgNVHQ4EFgQUXTRB4dpCJD5Q/wSsVgr5\ng4PSLi8wHwYDVR0jBBgwFoAUXTRB4dpCJD5Q/wSsVgr5g4PSLi8wDwYDVR0TAQH/\nBAUwAwEB/zA8BgNVHREENTAzhjFodHRwczovL21hbmlmZXN0LmludGVybmFsL3Nw\nL2N3bC01NmEwYzFlMi9zdGFnaW5nMA0GCSqGSIb3DQEBCwUAA4ICAQAbRgLhQ4W+\n7yQQ/+KoFFF/F4q01yDwTMCr06OdFY5Cxs2IemKAQgHWGsypaaVdB8GszY7os+sZ\niIFgOLgADMF4EqRfhX+LrFmHZBNppobrceOylUuk1JOELCxUgYy7M2U84vARe/ZE\n04+9I93sndiOHDWYza1viQvIbDAc0is0sqZ3TonIVnKpRMQ4oKWrgB+Tx++sXBBL\nrfl9ILYXU2I6YsL9N+CS/TkW9xvdHExzcPtyFuem0AtqSa647BBxQNtPWIKLLFku\nbf6os8qQuM6DuGJqX+wTnG5FIjNLNoKIPPa0EUDrmBuSZJoeCH10tRI5kq//owM4\nuji1QP4cWbdbBiQWgSGOM4KhttLKjpN5Uw/tcpxq2ccg6ZB3fo0C7Ug1cpHfSX2j\nKsi0Y12EmFHaz0neRdXkuCKdc8Krc5tqijIPKgdem5qALQhDLw4kZL1N7xQbTbuG\nLhcONHDAH6qC2hiJ3dJaW6xs/sHmY/uCT1F2WafdMKAODr2FeqUuMPOwV7BrKXDx\n2KjNAMHN7xumweDJVVVUIUixYqMOQn+PPmrxMUo6lZW6OlNeZ6lkzKod31BUFN0Q\niGOE/fcB6EwpCKd1I7RR7qDvfNdWKgd6+S/4Iz17lCapy9vV5FldReldjYWc961K\n9NfNOOAOoIXRsM0lpjwYnm86+6XiX7iw+Q==</ds:X509Certificate>\n        </ds:X509Data>\n      </ds:KeyInfo>\n    </md:KeyDescriptor>\n\n    <md:KeyDescriptor use="encryption">\n      <ds:KeyInfo>\n        <ds:KeyName>cwl-56a0c1e2.staging.manifest.internal</ds:KeyName>\n        <ds:X509Data>\n          <ds:X509SubjectName>O=Manifest,CN=cwl-56a0c1e2-staging</ds:X509SubjectName>\n          <ds:X509Certificate>MIIFhTCCA22gAwIBAgIUA6kwjjsTzFhDnISuIdlr29NKt20wDQYJKoZIhvcNAQEL\nBQAwMjEdMBsGA1UEAwwUY3dsLTU2YTBjMWUyLXN0YWdpbmcxETAPBgNVBAoMCE1h\nbmlmZXN0MB4XDTI2MTAwMTE0NTMwMFoXDTI4MDkzMDE0NTMwMFowMjEdMBsGA1UE\nAwwUY3dsLTU2YTBjMWUyLXN0YWdpbmcxETAPBgNVBAoMCE1hbmlmZXN0MIICIjAN\nBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAoHjx8128O6LkcC0Ib/fgDb7QeH6L\n6ENdNu37ho+vpWnpe2B/43/ihpxYyZPhL7S2tbCyWY0/azjkC7ZrdxYotEBnVSbs\n+0QK+MbR0DpK+Hy/cFZN0LICoaSluUW8KZsOiRGd1GPDYx0zjLR0WDBrZ5sOvyNp\nIOoz6WWCKfMYtIQgUTNpUu8lVZDcQUnhbiYaNnwEX2ZwadL31erYydLCk5DXvRtT\n2ridNlUuq1RtniKrPZSjsvjW6mPBR4HpHEbpu6V2mFG7eEndV4iRbQggCOG93sUV\ngn7zU3W3HC/uHKgOIJV/TTuoeS0rw1tDDF7WTE1odGjN1wWXu6kAI0UnNIOZufv4\nHcVykvUaJcvBp154HR/RQzgN4Fc4xY7MizuRtzO1dH5lbFOqhKNRw0JgcwaxDqsf\nqO2GjSoHxhmkGkbhsFUlz0xi4+OYMDUwcG6zTyVyRz9Gw5Ykk6mcKSw2Tbzynu1w\nQ9G3h9xf3J4h/vCeswZGVOP8HS8QabI0i6afEJF7b8OVVH1QonGWnfnuzfc+PpdL\nD00sf/EPdvzpvebm86kJDPUu3F/swYY92Tkwa9YD3iJaolWVhzOsyeCPty5nPUvK\nGXLf7lorn7FLWRdPV6W4mZtcHGM0PxCoUwPbTL+Gah/wLhYMV/qYZPA24MJJ+WH3\nImVfkD7hNYM0dWECAwEAAaOBkjCBjzAdBgNVHQ4EFgQUXTRB4dpCJD5Q/wSsVgr5\ng4PSLi8wHwYDVR0jBBgwFoAUXTRB4dpCJD5Q/wSsVgr5g4PSLi8wDwYDVR0TAQH/\nBAUwAwEB/zA8BgNVHREENTAzhjFodHRwczovL21hbmlmZXN0LmludGVybmFsL3Nw\nL2N3bC01NmEwYzFlMi9zdGFnaW5nMA0GCSqGSIb3DQEBCwUAA4ICAQAbRgLhQ4W+\n7yQQ/+KoFFF/F4q01yDwTMCr06OdFY5Cxs2IemKAQgHWGsypaaVdB8GszY7os+sZ\niIFgOLgADMF4EqRfhX+LrFmHZBNppobrceOylUuk1JOELCxUgYy7M2U84vARe/ZE\n04+9I93sndiOHDWYza1viQvIbDAc0is0sqZ3TonIVnKpRMQ4oKWrgB+Tx++sXBBL\nrfl9ILYXU2I6YsL9N+CS/TkW9xvdHExzcPtyFuem0AtqSa647BBxQNtPWIKLLFku\nbf6os8qQuM6DuGJqX+wTnG5FIjNLNoKIPPa0EUDrmBuSZJoeCH10tRI5kq//owM4\nuji1QP4cWbdbBiQWgSGOM4KhttLKjpN5Uw/tcpxq2ccg6ZB3fo0C7Ug1cpHfSX2j\nKsi0Y12EmFHaz0neRdXkuCKdc8Krc5tqijIPKgdem5qALQhDLw4kZL1N7xQbTbuG\nLhcONHDAH6qC2hiJ3dJaW6xs/sHmY/uCT1F2WafdMKAODr2FeqUuMPOwV7BrKXDx\n2KjNAMHN7xumweDJVVVUIUixYqMOQn+PPmrxMUo6lZW6OlNeZ6lkzKod31BUFN0Q\niGOE/fcB6EwpCKd1I7RR7qDvfNdWKgd6+S/4Iz17lCapy9vV5FldReldjYWc961K\n9NfNOOAOoIXRsM0lpjwYnm86+6XiX7iw+Q==</ds:X509Certificate>\n        </ds:X509Data>\n      </ds:KeyInfo>\n      <md:EncryptionMethod Algorithm="http://www.w3.org/2009/xmlenc11#aes128-gcm"/>\n      <md:EncryptionMethod Algorithm="http://www.w3.org/2009/xmlenc11#aes256-gcm"/>\n      <md:EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes256-cbc"/>\n    </md:KeyDescriptor>\n\n    <md:SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://cwl-56a0c1e2.staging.manifest.internal/auth/logout"/>\n\n    <md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://cwl-56a0c1e2.staging.manifest.internal/auth/ubcshib/callback" index="1" isDefault="true"/>\n  </md:SPSSODescriptor>\n\n  <md:Organization>\n    <md:OrganizationName>University of British Columbia</md:OrganizationName>\n    <md:OrganizationDisplayName>University of British Columbia</md:OrganizationDisplayName>\n    <md:OrganizationURL>https://www.ubc.ca</md:OrganizationURL>\n  </md:Organization>\n\n  <md:ContactPerson contactType="technical">\n    <md:EmailAddress>bio_prof@example.ubc.ca</md:EmailAddress>\n  </md:ContactPerson>\n  <md:ContactPerson contactType="support">\n    <md:EmailAddress>platform_admin@example.ubc.ca</md:EmailAddress>\n  </md:ContactPerson>\n\n</md:EntityDescriptor>\n',
    warnings: [
      'The privacy assessment’s PIA number is not recorded yet, and UBC IAM asks for it. Once an administrator records the assessment approved with its number, draft this again so the package carries it.',
    ],
  },
  createdAt: '2026-10-01T14:53:01.034Z',
  updatedAt: '2026-10-01T14:53:01.034Z',
} satisfies z.input<typeof IamRegistration>

/** `submitIamRegistration` sent `{ reference: 'IAM-2026-0500' }`: the package kept as it was sent. */
export const SUBMITTED_EXAMPLE = {
  id: 'c774307b-db67-486e-a201-38a76e2e45af',
  projectId: '433b7cfc-6735-480e-89cc-52836329df29',
  environment: 'staging',
  entityId: 'https://manifest.internal/sp/cwl-eabfcf05/staging',
  acsUrl: 'https://cwl-eabfcf05.staging.manifest.internal/auth/ubcshib/callback',
  sloUrl: 'https://cwl-eabfcf05.staging.manifest.internal/auth/logout',
  certFingerprint: null,
  certExpiresAt: null,
  registeredAttributes: [],
  requestedAttributes: null,
  registeredAt: null,
  state: 'submitted',
  externalTicketRef: 'IAM-2026-0500',
  submittedAt: '2026-10-01T19:00:00.000Z',
  submittedBy: {
    id: '88c5198a-c93f-48fa-9c7c-4f309dc1fa87',
    displayName: 'Bio Prof',
  },
  package: {
    environment: 'staging',
    generatedAt: '2026-10-01T14:53:03.289Z',
    fromCommit: 'de62c6ea74bf32249eb8cfa6f0e63feaae7e177c',
    entityId: 'https://manifest.internal/sp/cwl-eabfcf05/staging',
    acsUrl: 'https://cwl-eabfcf05.staging.manifest.internal/auth/ubcshib/callback',
    sloUrl: 'https://cwl-eabfcf05.staging.manifest.internal/auth/logout',
    certificate: {
      pem: '-----BEGIN CERTIFICATE-----\nMIIFhTCCA22gAwIBAgIUViZ1Fnx70pZfrmlZtF+p4+S5GtowDQYJKoZIhvcNAQEL\nBQAwMjEdMBsGA1UEAwwUY3dsLWVhYmZjZjA1LXN0YWdpbmcxETAPBgNVBAoMCE1h\nbmlmZXN0MB4XDTI2MTAwMTE0NTMwM1oXDTI4MDkzMDE0NTMwM1owMjEdMBsGA1UE\nAwwUY3dsLWVhYmZjZjA1LXN0YWdpbmcxETAPBgNVBAoMCE1hbmlmZXN0MIICIjAN\nBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEArpimvEnKSrLK5uTxziNBik3fCojW\ngJrYDoOqKf/Hin9gdyVCQ480+DZSPUx31OsJW0Cj2slHPYiRcxe5+OkxdPIwbwo+\nZNzDCcn4MDz41fI/pFxO799iHoq5i6+gwhamEx/0Nusz4cm2BV4XzdYocub67PJc\nMnxIa4iT2XJsubCRKtXdkZHM6WR6b1lVWz+/6D/wdXjrlF/RY1P43zbcW4hNJMmv\n8vF19gC57YrswtPp9ME0Ao2l1EqUglobE47sOml4vMbdhkY3JMCnSOfcHZSZ0TkN\nJpwtJIUfeGOmhPOX9EnZIIV/vp9b2BBtiTEcSW+HZH6ybQ4sEDwvLM/4Z+qWiAfx\n1q6r/qrlapWF92HqULbLbQdU/SnAZwLSsipycDnFGDZTcCltYGkomfFGVC51543f\nnu9jZCdrhA4XnVvoA/+8gFRPgtbzpIoKK9NUBlh8qSnREqVaPlWf8FcGqGcgKMDM\nd5RHeLWHmLJUxZSEvAD5VAHkiZNpPPNkssfmK7g9j7lf2gTSwoQQXW9Atuh+Hy3j\nE+XTNw8dsBhxOBc01YHMmzF3i54vDPxIypjZkdkvZ+QsVfZyj8IC/HaEP9t905bW\nPUQF5eTYb2KD24jfqXz4xpyavrz1YpZJF4ac64QEBzAM8GeM+cihQUdqKzeEjafG\nOGxisJi2/XDNcrECAwEAAaOBkjCBjzAdBgNVHQ4EFgQUgtY6OEKJYftJ1BFz2Oc2\nXQksVpwwHwYDVR0jBBgwFoAUgtY6OEKJYftJ1BFz2Oc2XQksVpwwDwYDVR0TAQH/\nBAUwAwEB/zA8BgNVHREENTAzhjFodHRwczovL21hbmlmZXN0LmludGVybmFsL3Nw\nL2N3bC1lYWJmY2YwNS9zdGFnaW5nMA0GCSqGSIb3DQEBCwUAA4ICAQCuDP8YJNk3\nEhJSOoXQ2jAnvjASVI4grSZzFXvDqLnN2lVBtE5LkUFW6YQzrN5hg6KWOzqV30BT\nUy/WSPFF2yDc0WRGALseNawsmgFVLuCRYgjTylBQzLaL5F0ml42W9MIRMs2evRIl\nwxMqKd9P1xuE5AkUnBkVFOW4OB6v7JnQp2dr50IlLvx+w9YA3DWFSXvQXKBNrTHD\n5Gxj5PuV4zv9xVJMaqKHEnGJ3SJiV+kaSqSoPBKsko4Mkg+/sa6cb4CDHllZvaLC\np79r4a+hNF6uyfdVoBr64hsHzdUf/jBIxKaDykZqocwzdBpxVSWaG2ZSzbF4T501\ns+gKIR7Na5HaXojbkFEEYzCQHwreO0pDeLwdDjFxvOjbuyufD0z9ldBMemDnLsYw\np2SnTUaRzhxNCDfo7NR7Il/gLdZJqfig8JbfD+OR0j26HONyK389rhbykS4x9gp+\nHU46h10fuxBn4rnMf+GLO48B0BowI05IFx3HROjYtDQdjlolGWy7yOPTKc4fD/6v\nZDoJgVL5vcFoBSwZQi8ssFol4ov8Paj67vKL6Rt7c+KfwCJUa6nqOmHuK8q2UkPx\ns/8KM7Ys8uGwlIShvnZxK7sBxfWYcz4cSYENUqLFIMEBvFvmZ9aRLJl7Z940NlK9\nZvXcbgCi3VnABjPKJ3l/Rq14q0lPfBPS8Q==\n-----END CERTIFICATE-----\n',
      fingerprint:
        '64:A4:FD:CE:F0:C6:35:D7:A3:94:CC:70:D7:6D:A2:75:5C:8E:B5:50:B3:17:7D:03:D2:A6:6B:AE:65:E2:CD:B0',
      expiresAt: '2028-09-30T14:53:03.000Z',
    },
    attributes: [
      {
        name: 'ubcEduCwlPuid',
        oid: 'urn:oid:1.3.6.1.4.1.60.6.1.6',
        purpose:
          'Identifies the person who signs in, so the app can recognise them when they return and keep their work apart from everyone else’s.',
        usedAt: [
          {
            path: 'routes/people.js',
            line: 3,
          },
        ],
        justification:
          'Identifies the person who signs in, so the app can recognise them when they return and keep their work apart from everyone else’s. The app reads it in routes/people.js:3.',
        unused: false,
      },
      {
        name: 'mail',
        oid: 'urn:oid:0.9.2342.19200300.100.1.3',
        purpose: 'The person’s email address, so the app can show it or write to them.',
        usedAt: [
          {
            path: 'public/app.js',
            line: 2,
          },
        ],
        justification:
          'The person’s email address, so the app can show it or write to them. The app shows it to the person in the browser, in public/app.js:2.',
        unused: false,
      },
    ],
    usedAtTruncated: false,
    contacts: {
      technical: [
        {
          name: 'Bio Prof',
          email: 'bio_prof@example.ubc.ca',
        },
      ],
      support: [
        {
          name: 'Platform Admin',
          email: 'platform_admin@example.ubc.ca',
        },
      ],
    },
    privacyAssessmentReference: null,
    metadataXml:
      '<?xml version="1.0" encoding="UTF-8"?>\n<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:alg="urn:oasis:names:tc:SAML:metadata:algsupport" ID="_6d0d62b3bd029bc004f89da18650d613" entityID="https://manifest.internal/sp/cwl-eabfcf05/staging">\n\n  <md:Extensions>\n    <alg:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>\n    <alg:DigestMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#sha384"/>\n    <alg:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha512"/>\n    <alg:SigningMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>\n    <alg:SigningMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha384"/>\n    <alg:SigningMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha512"/>\n    <alg:SigningMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256"/>\n  </md:Extensions>\n\n  <md:SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">\n    <md:KeyDescriptor use="signing">\n      <ds:KeyInfo>\n        <ds:KeyName>cwl-eabfcf05.staging.manifest.internal</ds:KeyName>\n        <ds:X509Data>\n          <ds:X509SubjectName>O=Manifest,CN=cwl-eabfcf05-staging</ds:X509SubjectName>\n          <ds:X509Certificate>MIIFhTCCA22gAwIBAgIUViZ1Fnx70pZfrmlZtF+p4+S5GtowDQYJKoZIhvcNAQEL\nBQAwMjEdMBsGA1UEAwwUY3dsLWVhYmZjZjA1LXN0YWdpbmcxETAPBgNVBAoMCE1h\nbmlmZXN0MB4XDTI2MTAwMTE0NTMwM1oXDTI4MDkzMDE0NTMwM1owMjEdMBsGA1UE\nAwwUY3dsLWVhYmZjZjA1LXN0YWdpbmcxETAPBgNVBAoMCE1hbmlmZXN0MIICIjAN\nBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEArpimvEnKSrLK5uTxziNBik3fCojW\ngJrYDoOqKf/Hin9gdyVCQ480+DZSPUx31OsJW0Cj2slHPYiRcxe5+OkxdPIwbwo+\nZNzDCcn4MDz41fI/pFxO799iHoq5i6+gwhamEx/0Nusz4cm2BV4XzdYocub67PJc\nMnxIa4iT2XJsubCRKtXdkZHM6WR6b1lVWz+/6D/wdXjrlF/RY1P43zbcW4hNJMmv\n8vF19gC57YrswtPp9ME0Ao2l1EqUglobE47sOml4vMbdhkY3JMCnSOfcHZSZ0TkN\nJpwtJIUfeGOmhPOX9EnZIIV/vp9b2BBtiTEcSW+HZH6ybQ4sEDwvLM/4Z+qWiAfx\n1q6r/qrlapWF92HqULbLbQdU/SnAZwLSsipycDnFGDZTcCltYGkomfFGVC51543f\nnu9jZCdrhA4XnVvoA/+8gFRPgtbzpIoKK9NUBlh8qSnREqVaPlWf8FcGqGcgKMDM\nd5RHeLWHmLJUxZSEvAD5VAHkiZNpPPNkssfmK7g9j7lf2gTSwoQQXW9Atuh+Hy3j\nE+XTNw8dsBhxOBc01YHMmzF3i54vDPxIypjZkdkvZ+QsVfZyj8IC/HaEP9t905bW\nPUQF5eTYb2KD24jfqXz4xpyavrz1YpZJF4ac64QEBzAM8GeM+cihQUdqKzeEjafG\nOGxisJi2/XDNcrECAwEAAaOBkjCBjzAdBgNVHQ4EFgQUgtY6OEKJYftJ1BFz2Oc2\nXQksVpwwHwYDVR0jBBgwFoAUgtY6OEKJYftJ1BFz2Oc2XQksVpwwDwYDVR0TAQH/\nBAUwAwEB/zA8BgNVHREENTAzhjFodHRwczovL21hbmlmZXN0LmludGVybmFsL3Nw\nL2N3bC1lYWJmY2YwNS9zdGFnaW5nMA0GCSqGSIb3DQEBCwUAA4ICAQCuDP8YJNk3\nEhJSOoXQ2jAnvjASVI4grSZzFXvDqLnN2lVBtE5LkUFW6YQzrN5hg6KWOzqV30BT\nUy/WSPFF2yDc0WRGALseNawsmgFVLuCRYgjTylBQzLaL5F0ml42W9MIRMs2evRIl\nwxMqKd9P1xuE5AkUnBkVFOW4OB6v7JnQp2dr50IlLvx+w9YA3DWFSXvQXKBNrTHD\n5Gxj5PuV4zv9xVJMaqKHEnGJ3SJiV+kaSqSoPBKsko4Mkg+/sa6cb4CDHllZvaLC\np79r4a+hNF6uyfdVoBr64hsHzdUf/jBIxKaDykZqocwzdBpxVSWaG2ZSzbF4T501\ns+gKIR7Na5HaXojbkFEEYzCQHwreO0pDeLwdDjFxvOjbuyufD0z9ldBMemDnLsYw\np2SnTUaRzhxNCDfo7NR7Il/gLdZJqfig8JbfD+OR0j26HONyK389rhbykS4x9gp+\nHU46h10fuxBn4rnMf+GLO48B0BowI05IFx3HROjYtDQdjlolGWy7yOPTKc4fD/6v\nZDoJgVL5vcFoBSwZQi8ssFol4ov8Paj67vKL6Rt7c+KfwCJUa6nqOmHuK8q2UkPx\ns/8KM7Ys8uGwlIShvnZxK7sBxfWYcz4cSYENUqLFIMEBvFvmZ9aRLJl7Z940NlK9\nZvXcbgCi3VnABjPKJ3l/Rq14q0lPfBPS8Q==</ds:X509Certificate>\n        </ds:X509Data>\n      </ds:KeyInfo>\n    </md:KeyDescriptor>\n\n    <md:KeyDescriptor use="encryption">\n      <ds:KeyInfo>\n        <ds:KeyName>cwl-eabfcf05.staging.manifest.internal</ds:KeyName>\n        <ds:X509Data>\n          <ds:X509SubjectName>O=Manifest,CN=cwl-eabfcf05-staging</ds:X509SubjectName>\n          <ds:X509Certificate>MIIFhTCCA22gAwIBAgIUViZ1Fnx70pZfrmlZtF+p4+S5GtowDQYJKoZIhvcNAQEL\nBQAwMjEdMBsGA1UEAwwUY3dsLWVhYmZjZjA1LXN0YWdpbmcxETAPBgNVBAoMCE1h\nbmlmZXN0MB4XDTI2MTAwMTE0NTMwM1oXDTI4MDkzMDE0NTMwM1owMjEdMBsGA1UE\nAwwUY3dsLWVhYmZjZjA1LXN0YWdpbmcxETAPBgNVBAoMCE1hbmlmZXN0MIICIjAN\nBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEArpimvEnKSrLK5uTxziNBik3fCojW\ngJrYDoOqKf/Hin9gdyVCQ480+DZSPUx31OsJW0Cj2slHPYiRcxe5+OkxdPIwbwo+\nZNzDCcn4MDz41fI/pFxO799iHoq5i6+gwhamEx/0Nusz4cm2BV4XzdYocub67PJc\nMnxIa4iT2XJsubCRKtXdkZHM6WR6b1lVWz+/6D/wdXjrlF/RY1P43zbcW4hNJMmv\n8vF19gC57YrswtPp9ME0Ao2l1EqUglobE47sOml4vMbdhkY3JMCnSOfcHZSZ0TkN\nJpwtJIUfeGOmhPOX9EnZIIV/vp9b2BBtiTEcSW+HZH6ybQ4sEDwvLM/4Z+qWiAfx\n1q6r/qrlapWF92HqULbLbQdU/SnAZwLSsipycDnFGDZTcCltYGkomfFGVC51543f\nnu9jZCdrhA4XnVvoA/+8gFRPgtbzpIoKK9NUBlh8qSnREqVaPlWf8FcGqGcgKMDM\nd5RHeLWHmLJUxZSEvAD5VAHkiZNpPPNkssfmK7g9j7lf2gTSwoQQXW9Atuh+Hy3j\nE+XTNw8dsBhxOBc01YHMmzF3i54vDPxIypjZkdkvZ+QsVfZyj8IC/HaEP9t905bW\nPUQF5eTYb2KD24jfqXz4xpyavrz1YpZJF4ac64QEBzAM8GeM+cihQUdqKzeEjafG\nOGxisJi2/XDNcrECAwEAAaOBkjCBjzAdBgNVHQ4EFgQUgtY6OEKJYftJ1BFz2Oc2\nXQksVpwwHwYDVR0jBBgwFoAUgtY6OEKJYftJ1BFz2Oc2XQksVpwwDwYDVR0TAQH/\nBAUwAwEB/zA8BgNVHREENTAzhjFodHRwczovL21hbmlmZXN0LmludGVybmFsL3Nw\nL2N3bC1lYWJmY2YwNS9zdGFnaW5nMA0GCSqGSIb3DQEBCwUAA4ICAQCuDP8YJNk3\nEhJSOoXQ2jAnvjASVI4grSZzFXvDqLnN2lVBtE5LkUFW6YQzrN5hg6KWOzqV30BT\nUy/WSPFF2yDc0WRGALseNawsmgFVLuCRYgjTylBQzLaL5F0ml42W9MIRMs2evRIl\nwxMqKd9P1xuE5AkUnBkVFOW4OB6v7JnQp2dr50IlLvx+w9YA3DWFSXvQXKBNrTHD\n5Gxj5PuV4zv9xVJMaqKHEnGJ3SJiV+kaSqSoPBKsko4Mkg+/sa6cb4CDHllZvaLC\np79r4a+hNF6uyfdVoBr64hsHzdUf/jBIxKaDykZqocwzdBpxVSWaG2ZSzbF4T501\ns+gKIR7Na5HaXojbkFEEYzCQHwreO0pDeLwdDjFxvOjbuyufD0z9ldBMemDnLsYw\np2SnTUaRzhxNCDfo7NR7Il/gLdZJqfig8JbfD+OR0j26HONyK389rhbykS4x9gp+\nHU46h10fuxBn4rnMf+GLO48B0BowI05IFx3HROjYtDQdjlolGWy7yOPTKc4fD/6v\nZDoJgVL5vcFoBSwZQi8ssFol4ov8Paj67vKL6Rt7c+KfwCJUa6nqOmHuK8q2UkPx\ns/8KM7Ys8uGwlIShvnZxK7sBxfWYcz4cSYENUqLFIMEBvFvmZ9aRLJl7Z940NlK9\nZvXcbgCi3VnABjPKJ3l/Rq14q0lPfBPS8Q==</ds:X509Certificate>\n        </ds:X509Data>\n      </ds:KeyInfo>\n      <md:EncryptionMethod Algorithm="http://www.w3.org/2009/xmlenc11#aes128-gcm"/>\n      <md:EncryptionMethod Algorithm="http://www.w3.org/2009/xmlenc11#aes256-gcm"/>\n      <md:EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes256-cbc"/>\n    </md:KeyDescriptor>\n\n    <md:SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://cwl-eabfcf05.staging.manifest.internal/auth/logout"/>\n\n    <md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://cwl-eabfcf05.staging.manifest.internal/auth/ubcshib/callback" index="1" isDefault="true"/>\n  </md:SPSSODescriptor>\n\n  <md:Organization>\n    <md:OrganizationName>University of British Columbia</md:OrganizationName>\n    <md:OrganizationDisplayName>University of British Columbia</md:OrganizationDisplayName>\n    <md:OrganizationURL>https://www.ubc.ca</md:OrganizationURL>\n  </md:Organization>\n\n  <md:ContactPerson contactType="technical">\n    <md:EmailAddress>bio_prof@example.ubc.ca</md:EmailAddress>\n  </md:ContactPerson>\n  <md:ContactPerson contactType="support">\n    <md:EmailAddress>platform_admin@example.ubc.ca</md:EmailAddress>\n  </md:ContactPerson>\n\n</md:EntityDescriptor>\n',
    warnings: [
      'The privacy assessment’s PIA number is not recorded yet, and UBC IAM asks for it. Once an administrator records the assessment approved with its number, draft this again so the package carries it.',
    ],
  },
  createdAt: '2026-10-01T14:53:03.291Z',
  updatedAt: '2026-10-01T14:53:03.327Z',
} satisfies z.input<typeof IamRegistration>

/** `getLaunchRecords`: the three records once the staging registration was sent. */
export const RECORDS_EXAMPLE = {
  projectId: '433b7cfc-6735-480e-89cc-52836329df29',
  iamRegistration: null,
  stagingRegistration: {
    id: 'c774307b-db67-486e-a201-38a76e2e45af',
    projectId: '433b7cfc-6735-480e-89cc-52836329df29',
    environment: 'staging',
    entityId: 'https://manifest.internal/sp/cwl-eabfcf05/staging',
    acsUrl: 'https://cwl-eabfcf05.staging.manifest.internal/auth/ubcshib/callback',
    sloUrl: 'https://cwl-eabfcf05.staging.manifest.internal/auth/logout',
    certFingerprint: null,
    certExpiresAt: null,
    registeredAttributes: [],
    requestedAttributes: null,
    registeredAt: null,
    state: 'submitted',
    externalTicketRef: 'IAM-2026-0500',
    submittedAt: '2026-10-01T19:00:00.000Z',
    submittedBy: {
      id: '88c5198a-c93f-48fa-9c7c-4f309dc1fa87',
      displayName: 'Bio Prof',
    },
    package: {
      environment: 'staging',
      generatedAt: '2026-10-01T14:53:03.289Z',
      fromCommit: 'de62c6ea74bf32249eb8cfa6f0e63feaae7e177c',
      entityId: 'https://manifest.internal/sp/cwl-eabfcf05/staging',
      acsUrl: 'https://cwl-eabfcf05.staging.manifest.internal/auth/ubcshib/callback',
      sloUrl: 'https://cwl-eabfcf05.staging.manifest.internal/auth/logout',
      certificate: {
        pem: '-----BEGIN CERTIFICATE-----\nMIIFhTCCA22gAwIBAgIUViZ1Fnx70pZfrmlZtF+p4+S5GtowDQYJKoZIhvcNAQEL\nBQAwMjEdMBsGA1UEAwwUY3dsLWVhYmZjZjA1LXN0YWdpbmcxETAPBgNVBAoMCE1h\nbmlmZXN0MB4XDTI2MTAwMTE0NTMwM1oXDTI4MDkzMDE0NTMwM1owMjEdMBsGA1UE\nAwwUY3dsLWVhYmZjZjA1LXN0YWdpbmcxETAPBgNVBAoMCE1hbmlmZXN0MIICIjAN\nBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEArpimvEnKSrLK5uTxziNBik3fCojW\ngJrYDoOqKf/Hin9gdyVCQ480+DZSPUx31OsJW0Cj2slHPYiRcxe5+OkxdPIwbwo+\nZNzDCcn4MDz41fI/pFxO799iHoq5i6+gwhamEx/0Nusz4cm2BV4XzdYocub67PJc\nMnxIa4iT2XJsubCRKtXdkZHM6WR6b1lVWz+/6D/wdXjrlF/RY1P43zbcW4hNJMmv\n8vF19gC57YrswtPp9ME0Ao2l1EqUglobE47sOml4vMbdhkY3JMCnSOfcHZSZ0TkN\nJpwtJIUfeGOmhPOX9EnZIIV/vp9b2BBtiTEcSW+HZH6ybQ4sEDwvLM/4Z+qWiAfx\n1q6r/qrlapWF92HqULbLbQdU/SnAZwLSsipycDnFGDZTcCltYGkomfFGVC51543f\nnu9jZCdrhA4XnVvoA/+8gFRPgtbzpIoKK9NUBlh8qSnREqVaPlWf8FcGqGcgKMDM\nd5RHeLWHmLJUxZSEvAD5VAHkiZNpPPNkssfmK7g9j7lf2gTSwoQQXW9Atuh+Hy3j\nE+XTNw8dsBhxOBc01YHMmzF3i54vDPxIypjZkdkvZ+QsVfZyj8IC/HaEP9t905bW\nPUQF5eTYb2KD24jfqXz4xpyavrz1YpZJF4ac64QEBzAM8GeM+cihQUdqKzeEjafG\nOGxisJi2/XDNcrECAwEAAaOBkjCBjzAdBgNVHQ4EFgQUgtY6OEKJYftJ1BFz2Oc2\nXQksVpwwHwYDVR0jBBgwFoAUgtY6OEKJYftJ1BFz2Oc2XQksVpwwDwYDVR0TAQH/\nBAUwAwEB/zA8BgNVHREENTAzhjFodHRwczovL21hbmlmZXN0LmludGVybmFsL3Nw\nL2N3bC1lYWJmY2YwNS9zdGFnaW5nMA0GCSqGSIb3DQEBCwUAA4ICAQCuDP8YJNk3\nEhJSOoXQ2jAnvjASVI4grSZzFXvDqLnN2lVBtE5LkUFW6YQzrN5hg6KWOzqV30BT\nUy/WSPFF2yDc0WRGALseNawsmgFVLuCRYgjTylBQzLaL5F0ml42W9MIRMs2evRIl\nwxMqKd9P1xuE5AkUnBkVFOW4OB6v7JnQp2dr50IlLvx+w9YA3DWFSXvQXKBNrTHD\n5Gxj5PuV4zv9xVJMaqKHEnGJ3SJiV+kaSqSoPBKsko4Mkg+/sa6cb4CDHllZvaLC\np79r4a+hNF6uyfdVoBr64hsHzdUf/jBIxKaDykZqocwzdBpxVSWaG2ZSzbF4T501\ns+gKIR7Na5HaXojbkFEEYzCQHwreO0pDeLwdDjFxvOjbuyufD0z9ldBMemDnLsYw\np2SnTUaRzhxNCDfo7NR7Il/gLdZJqfig8JbfD+OR0j26HONyK389rhbykS4x9gp+\nHU46h10fuxBn4rnMf+GLO48B0BowI05IFx3HROjYtDQdjlolGWy7yOPTKc4fD/6v\nZDoJgVL5vcFoBSwZQi8ssFol4ov8Paj67vKL6Rt7c+KfwCJUa6nqOmHuK8q2UkPx\ns/8KM7Ys8uGwlIShvnZxK7sBxfWYcz4cSYENUqLFIMEBvFvmZ9aRLJl7Z940NlK9\nZvXcbgCi3VnABjPKJ3l/Rq14q0lPfBPS8Q==\n-----END CERTIFICATE-----\n',
        fingerprint:
          '64:A4:FD:CE:F0:C6:35:D7:A3:94:CC:70:D7:6D:A2:75:5C:8E:B5:50:B3:17:7D:03:D2:A6:6B:AE:65:E2:CD:B0',
        expiresAt: '2028-09-30T14:53:03.000Z',
      },
      attributes: [
        {
          name: 'ubcEduCwlPuid',
          oid: 'urn:oid:1.3.6.1.4.1.60.6.1.6',
          purpose:
            'Identifies the person who signs in, so the app can recognise them when they return and keep their work apart from everyone else’s.',
          usedAt: [
            {
              path: 'routes/people.js',
              line: 3,
            },
          ],
          justification:
            'Identifies the person who signs in, so the app can recognise them when they return and keep their work apart from everyone else’s. The app reads it in routes/people.js:3.',
          unused: false,
        },
        {
          name: 'mail',
          oid: 'urn:oid:0.9.2342.19200300.100.1.3',
          purpose: 'The person’s email address, so the app can show it or write to them.',
          usedAt: [
            {
              path: 'public/app.js',
              line: 2,
            },
          ],
          justification:
            'The person’s email address, so the app can show it or write to them. The app shows it to the person in the browser, in public/app.js:2.',
          unused: false,
        },
      ],
      usedAtTruncated: false,
      contacts: {
        technical: [
          {
            name: 'Bio Prof',
            email: 'bio_prof@example.ubc.ca',
          },
        ],
        support: [
          {
            name: 'Platform Admin',
            email: 'platform_admin@example.ubc.ca',
          },
        ],
      },
      privacyAssessmentReference: null,
      metadataXml:
        '<?xml version="1.0" encoding="UTF-8"?>\n<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:alg="urn:oasis:names:tc:SAML:metadata:algsupport" ID="_6d0d62b3bd029bc004f89da18650d613" entityID="https://manifest.internal/sp/cwl-eabfcf05/staging">\n\n  <md:Extensions>\n    <alg:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>\n    <alg:DigestMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#sha384"/>\n    <alg:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha512"/>\n    <alg:SigningMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>\n    <alg:SigningMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha384"/>\n    <alg:SigningMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha512"/>\n    <alg:SigningMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256"/>\n  </md:Extensions>\n\n  <md:SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">\n    <md:KeyDescriptor use="signing">\n      <ds:KeyInfo>\n        <ds:KeyName>cwl-eabfcf05.staging.manifest.internal</ds:KeyName>\n        <ds:X509Data>\n          <ds:X509SubjectName>O=Manifest,CN=cwl-eabfcf05-staging</ds:X509SubjectName>\n          <ds:X509Certificate>MIIFhTCCA22gAwIBAgIUViZ1Fnx70pZfrmlZtF+p4+S5GtowDQYJKoZIhvcNAQEL\nBQAwMjEdMBsGA1UEAwwUY3dsLWVhYmZjZjA1LXN0YWdpbmcxETAPBgNVBAoMCE1h\nbmlmZXN0MB4XDTI2MTAwMTE0NTMwM1oXDTI4MDkzMDE0NTMwM1owMjEdMBsGA1UE\nAwwUY3dsLWVhYmZjZjA1LXN0YWdpbmcxETAPBgNVBAoMCE1hbmlmZXN0MIICIjAN\nBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEArpimvEnKSrLK5uTxziNBik3fCojW\ngJrYDoOqKf/Hin9gdyVCQ480+DZSPUx31OsJW0Cj2slHPYiRcxe5+OkxdPIwbwo+\nZNzDCcn4MDz41fI/pFxO799iHoq5i6+gwhamEx/0Nusz4cm2BV4XzdYocub67PJc\nMnxIa4iT2XJsubCRKtXdkZHM6WR6b1lVWz+/6D/wdXjrlF/RY1P43zbcW4hNJMmv\n8vF19gC57YrswtPp9ME0Ao2l1EqUglobE47sOml4vMbdhkY3JMCnSOfcHZSZ0TkN\nJpwtJIUfeGOmhPOX9EnZIIV/vp9b2BBtiTEcSW+HZH6ybQ4sEDwvLM/4Z+qWiAfx\n1q6r/qrlapWF92HqULbLbQdU/SnAZwLSsipycDnFGDZTcCltYGkomfFGVC51543f\nnu9jZCdrhA4XnVvoA/+8gFRPgtbzpIoKK9NUBlh8qSnREqVaPlWf8FcGqGcgKMDM\nd5RHeLWHmLJUxZSEvAD5VAHkiZNpPPNkssfmK7g9j7lf2gTSwoQQXW9Atuh+Hy3j\nE+XTNw8dsBhxOBc01YHMmzF3i54vDPxIypjZkdkvZ+QsVfZyj8IC/HaEP9t905bW\nPUQF5eTYb2KD24jfqXz4xpyavrz1YpZJF4ac64QEBzAM8GeM+cihQUdqKzeEjafG\nOGxisJi2/XDNcrECAwEAAaOBkjCBjzAdBgNVHQ4EFgQUgtY6OEKJYftJ1BFz2Oc2\nXQksVpwwHwYDVR0jBBgwFoAUgtY6OEKJYftJ1BFz2Oc2XQksVpwwDwYDVR0TAQH/\nBAUwAwEB/zA8BgNVHREENTAzhjFodHRwczovL21hbmlmZXN0LmludGVybmFsL3Nw\nL2N3bC1lYWJmY2YwNS9zdGFnaW5nMA0GCSqGSIb3DQEBCwUAA4ICAQCuDP8YJNk3\nEhJSOoXQ2jAnvjASVI4grSZzFXvDqLnN2lVBtE5LkUFW6YQzrN5hg6KWOzqV30BT\nUy/WSPFF2yDc0WRGALseNawsmgFVLuCRYgjTylBQzLaL5F0ml42W9MIRMs2evRIl\nwxMqKd9P1xuE5AkUnBkVFOW4OB6v7JnQp2dr50IlLvx+w9YA3DWFSXvQXKBNrTHD\n5Gxj5PuV4zv9xVJMaqKHEnGJ3SJiV+kaSqSoPBKsko4Mkg+/sa6cb4CDHllZvaLC\np79r4a+hNF6uyfdVoBr64hsHzdUf/jBIxKaDykZqocwzdBpxVSWaG2ZSzbF4T501\ns+gKIR7Na5HaXojbkFEEYzCQHwreO0pDeLwdDjFxvOjbuyufD0z9ldBMemDnLsYw\np2SnTUaRzhxNCDfo7NR7Il/gLdZJqfig8JbfD+OR0j26HONyK389rhbykS4x9gp+\nHU46h10fuxBn4rnMf+GLO48B0BowI05IFx3HROjYtDQdjlolGWy7yOPTKc4fD/6v\nZDoJgVL5vcFoBSwZQi8ssFol4ov8Paj67vKL6Rt7c+KfwCJUa6nqOmHuK8q2UkPx\ns/8KM7Ys8uGwlIShvnZxK7sBxfWYcz4cSYENUqLFIMEBvFvmZ9aRLJl7Z940NlK9\nZvXcbgCi3VnABjPKJ3l/Rq14q0lPfBPS8Q==</ds:X509Certificate>\n        </ds:X509Data>\n      </ds:KeyInfo>\n    </md:KeyDescriptor>\n\n    <md:KeyDescriptor use="encryption">\n      <ds:KeyInfo>\n        <ds:KeyName>cwl-eabfcf05.staging.manifest.internal</ds:KeyName>\n        <ds:X509Data>\n          <ds:X509SubjectName>O=Manifest,CN=cwl-eabfcf05-staging</ds:X509SubjectName>\n          <ds:X509Certificate>MIIFhTCCA22gAwIBAgIUViZ1Fnx70pZfrmlZtF+p4+S5GtowDQYJKoZIhvcNAQEL\nBQAwMjEdMBsGA1UEAwwUY3dsLWVhYmZjZjA1LXN0YWdpbmcxETAPBgNVBAoMCE1h\nbmlmZXN0MB4XDTI2MTAwMTE0NTMwM1oXDTI4MDkzMDE0NTMwM1owMjEdMBsGA1UE\nAwwUY3dsLWVhYmZjZjA1LXN0YWdpbmcxETAPBgNVBAoMCE1hbmlmZXN0MIICIjAN\nBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEArpimvEnKSrLK5uTxziNBik3fCojW\ngJrYDoOqKf/Hin9gdyVCQ480+DZSPUx31OsJW0Cj2slHPYiRcxe5+OkxdPIwbwo+\nZNzDCcn4MDz41fI/pFxO799iHoq5i6+gwhamEx/0Nusz4cm2BV4XzdYocub67PJc\nMnxIa4iT2XJsubCRKtXdkZHM6WR6b1lVWz+/6D/wdXjrlF/RY1P43zbcW4hNJMmv\n8vF19gC57YrswtPp9ME0Ao2l1EqUglobE47sOml4vMbdhkY3JMCnSOfcHZSZ0TkN\nJpwtJIUfeGOmhPOX9EnZIIV/vp9b2BBtiTEcSW+HZH6ybQ4sEDwvLM/4Z+qWiAfx\n1q6r/qrlapWF92HqULbLbQdU/SnAZwLSsipycDnFGDZTcCltYGkomfFGVC51543f\nnu9jZCdrhA4XnVvoA/+8gFRPgtbzpIoKK9NUBlh8qSnREqVaPlWf8FcGqGcgKMDM\nd5RHeLWHmLJUxZSEvAD5VAHkiZNpPPNkssfmK7g9j7lf2gTSwoQQXW9Atuh+Hy3j\nE+XTNw8dsBhxOBc01YHMmzF3i54vDPxIypjZkdkvZ+QsVfZyj8IC/HaEP9t905bW\nPUQF5eTYb2KD24jfqXz4xpyavrz1YpZJF4ac64QEBzAM8GeM+cihQUdqKzeEjafG\nOGxisJi2/XDNcrECAwEAAaOBkjCBjzAdBgNVHQ4EFgQUgtY6OEKJYftJ1BFz2Oc2\nXQksVpwwHwYDVR0jBBgwFoAUgtY6OEKJYftJ1BFz2Oc2XQksVpwwDwYDVR0TAQH/\nBAUwAwEB/zA8BgNVHREENTAzhjFodHRwczovL21hbmlmZXN0LmludGVybmFsL3Nw\nL2N3bC1lYWJmY2YwNS9zdGFnaW5nMA0GCSqGSIb3DQEBCwUAA4ICAQCuDP8YJNk3\nEhJSOoXQ2jAnvjASVI4grSZzFXvDqLnN2lVBtE5LkUFW6YQzrN5hg6KWOzqV30BT\nUy/WSPFF2yDc0WRGALseNawsmgFVLuCRYgjTylBQzLaL5F0ml42W9MIRMs2evRIl\nwxMqKd9P1xuE5AkUnBkVFOW4OB6v7JnQp2dr50IlLvx+w9YA3DWFSXvQXKBNrTHD\n5Gxj5PuV4zv9xVJMaqKHEnGJ3SJiV+kaSqSoPBKsko4Mkg+/sa6cb4CDHllZvaLC\np79r4a+hNF6uyfdVoBr64hsHzdUf/jBIxKaDykZqocwzdBpxVSWaG2ZSzbF4T501\ns+gKIR7Na5HaXojbkFEEYzCQHwreO0pDeLwdDjFxvOjbuyufD0z9ldBMemDnLsYw\np2SnTUaRzhxNCDfo7NR7Il/gLdZJqfig8JbfD+OR0j26HONyK389rhbykS4x9gp+\nHU46h10fuxBn4rnMf+GLO48B0BowI05IFx3HROjYtDQdjlolGWy7yOPTKc4fD/6v\nZDoJgVL5vcFoBSwZQi8ssFol4ov8Paj67vKL6Rt7c+KfwCJUa6nqOmHuK8q2UkPx\ns/8KM7Ys8uGwlIShvnZxK7sBxfWYcz4cSYENUqLFIMEBvFvmZ9aRLJl7Z940NlK9\nZvXcbgCi3VnABjPKJ3l/Rq14q0lPfBPS8Q==</ds:X509Certificate>\n        </ds:X509Data>\n      </ds:KeyInfo>\n      <md:EncryptionMethod Algorithm="http://www.w3.org/2009/xmlenc11#aes128-gcm"/>\n      <md:EncryptionMethod Algorithm="http://www.w3.org/2009/xmlenc11#aes256-gcm"/>\n      <md:EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes256-cbc"/>\n    </md:KeyDescriptor>\n\n    <md:SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://cwl-eabfcf05.staging.manifest.internal/auth/logout"/>\n\n    <md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://cwl-eabfcf05.staging.manifest.internal/auth/ubcshib/callback" index="1" isDefault="true"/>\n  </md:SPSSODescriptor>\n\n  <md:Organization>\n    <md:OrganizationName>University of British Columbia</md:OrganizationName>\n    <md:OrganizationDisplayName>University of British Columbia</md:OrganizationDisplayName>\n    <md:OrganizationURL>https://www.ubc.ca</md:OrganizationURL>\n  </md:Organization>\n\n  <md:ContactPerson contactType="technical">\n    <md:EmailAddress>bio_prof@example.ubc.ca</md:EmailAddress>\n  </md:ContactPerson>\n  <md:ContactPerson contactType="support">\n    <md:EmailAddress>platform_admin@example.ubc.ca</md:EmailAddress>\n  </md:ContactPerson>\n\n</md:EntityDescriptor>\n',
      warnings: [
        'The privacy assessment’s PIA number is not recorded yet, and UBC IAM asks for it. Once an administrator records the assessment approved with its number, draft this again so the package carries it.',
      ],
    },
    createdAt: '2026-10-01T14:53:03.291Z',
    updatedAt: '2026-10-01T14:53:03.327Z',
  },
  privacyAssessment: {
    id: '659dd0f4-aee4-43cc-93a6-c51a236de4eb',
    projectId: '433b7cfc-6735-480e-89cc-52836329df29',
    state: 'approved',
    reviewer: 'K. Privacy',
    approvedAt: '2026-10-01T14:53:03.310Z',
    externalTicketRef: 'PIA-2026-0088',
    submittedAt: '2026-10-01T14:53:03.304Z',
    submittedBy: {
      id: '9bbae740-1083-45a8-b90e-830ee067b028',
      displayName: 'Platform Admin',
    },
    createdAt: '2026-10-01T14:53:03.303Z',
    updatedAt: '2026-10-01T14:53:03.310Z',
  },
} satisfies z.input<typeof LaunchRecords>
