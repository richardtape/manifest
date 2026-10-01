import type { z } from 'zod/v4'
import type {
  IamRegistration,
  LaunchRecords,
  SubmitLaunchRecordRequest,
} from '../representations/launch.js'

/**
 * THE LAUNCH ROUTES' EXAMPLES THAT CARRY A PACKAGE (the launch path plan's Task 10), each CAPTURED from
 * `api/launch.test.ts`'s *"a submitted package is never regenerated…"* (the Global Constraints: examples
 * are captured, never written) — one flow: the assessment approved, the staging registration drafted,
 * then said to be sent naming that draft. Long because a real package is: the certificate and the
 * metadata are what a person sends UBC IAM. Their own module so the routes stay readable.
 */

/** `draftIamRegistration`: the staging registration's draft, made once the assessment was approved. */
export const DRAFTED_EXAMPLE = {
  id: 'e196ea92-0c4e-4f68-b42f-00ce57e1d92f',
  projectId: '72bc6c0a-bf2b-4b4f-8165-bc86227cd46d',
  environment: 'staging',
  entityId: 'https://manifest.internal/sp/cwl-6513709a/staging',
  acsUrl: 'https://cwl-6513709a.staging.manifest.internal/auth/ubcshib/callback',
  sloUrl: 'https://cwl-6513709a.staging.manifest.internal/auth/logout',
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
    generatedAt: '2026-10-01T15:37:23.111Z',
    fromCommit: 'a4080513ab8842356764b34255f511d2d6f5bf43',
    entityId: 'https://manifest.internal/sp/cwl-6513709a/staging',
    acsUrl: 'https://cwl-6513709a.staging.manifest.internal/auth/ubcshib/callback',
    sloUrl: 'https://cwl-6513709a.staging.manifest.internal/auth/logout',
    certificate: {
      pem: '-----BEGIN CERTIFICATE-----\nMIIFhTCCA22gAwIBAgIUY5NstC0cxVL1dQ1+2Ea0OhUeUq0wDQYJKoZIhvcNAQEL\nBQAwMjEdMBsGA1UEAwwUY3dsLTY1MTM3MDlhLXN0YWdpbmcxETAPBgNVBAoMCE1h\nbmlmZXN0MB4XDTI2MTAwMTE1MzcyMloXDTI4MDkzMDE1MzcyMlowMjEdMBsGA1UE\nAwwUY3dsLTY1MTM3MDlhLXN0YWdpbmcxETAPBgNVBAoMCE1hbmlmZXN0MIICIjAN\nBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEA2ajxaGxHzkrW8Foe6BqHzHOu1HwG\nvzQMlc1KrecDx+dZFDj6Skf/2Zs/Ii0qZZ+ee7EBdC/JiCGwDt9qgOX5Su0nWzhW\nsVCteMIA+ZS7nLe/q3NFyiOKVlBSHfnCvGJ1Oyk9z4Cned8ISfSoOvVyBco/5yCL\nFwv2lNFeHOUTTb2z4aGbdLWWrSREhzIIpngy95OjVjZDmOJJhzsuLie0yHUyAmRu\nfs8lLmDMeJN9Rw7vkngdqIvLQoGgxS4Mo5oJGAbzffZjJPayt0WhiW5lR7HT9dmN\nie+qIWgcDOVFXApANPm9uYv0yQ6N3LB002Kd4f1mqj8Vc98oLz4cK7UWk1cvo1qq\nfGIPVyBX1rvmDxdX2E7lSQ9cXoH4pNDqmyL8mptSmHJLHuvJVj8Ri0i8HFWXdomA\nfPh+GK9URi1R/PVX1MZk4PmOYgDHC0F7zNQCyIlvr1Zo3UIJ37sOr3qyRmTrSzv4\nauYbn6OlF4vuZdrcApj+mZP8GAJQPnuXfMbgDWnj3Dr/VWZK/J6Th5Lp8Ckax9RS\nWddTsCsvdpnC/rz4/SuxWKkfnHwdpC8JObkApgpVoXHQ/3kLs1Y7eSUo9hfHKZwX\nwMH0LDTejECOqZ+6gBT2JY/xeKLk0y9Zh7tU93EczYLfOrpG8iCBCRxe+qaw/4my\nxwqN4bOAaWdZ2ysCAwEAAaOBkjCBjzAdBgNVHQ4EFgQUXIl3aMeZwi/krWrIsgBJ\n6g6dUIQwHwYDVR0jBBgwFoAUXIl3aMeZwi/krWrIsgBJ6g6dUIQwDwYDVR0TAQH/\nBAUwAwEB/zA8BgNVHREENTAzhjFodHRwczovL21hbmlmZXN0LmludGVybmFsL3Nw\nL2N3bC02NTEzNzA5YS9zdGFnaW5nMA0GCSqGSIb3DQEBCwUAA4ICAQC8iuV6yFcI\nesWiWonWxDdB/ygHxkdXjLm5/RbLfr7N/hsyD4wx1UheFKRflN5c7to/v06nJEUt\np3se+T4BafDkTM92ytsgOm2Iu+R4g5EvRqQmMJF7ayyimArIy98DDjrURzNGSJmA\nbsqlTreK10J8KQtEJK3tF85SnBUrXapvKs66LP6bdXFXSIYy+iYgxkiLx6ya2jmZ\nAx+9pWHC+K8d8+rcEoUq/pgMgxfkChoJBArjiAwOuZbrx6m2AYDtMbL2FK0+njyQ\nrO7I1dSCW/tgiM4td69AFw5M08SCGx3HGrz7xG6r45huL2Nk/cWpxUjzVPyo7X4c\nSkvWPO1oJ/qDTdW3UJtmxH/dM9wySpcvmgGMn7dNt4PjXq+dHdKv52gYSU9XAKBu\nsIfMW82y0QIPszGjayFiB4awNhvQ4kf/5Shgv0p2/Dg6ddlxzvttRXdoWE9z9dGi\nqsIKTXGQNGiQERNbaHe/Z6ImnllIoBmVszw5GUUk7qb+cE7RVSJFbFTOoPeFvcoE\npqPySUQBbLULxZQR7WVQuRvkmsC72UxxDdqLi4FpOE1grsv+ksF1WYbA2eviWpZQ\nyWyLHENez758GdX2LjiNMBOLNF4YCqDaucQ8IZbxq6cgZcPqKjoVe+/ENbSOBdEK\n8Rz3oeLFdUGWGyfqge/5EJld/wslALvlyQ==\n-----END CERTIFICATE-----\n',
      fingerprint:
        '35:9A:6E:22:18:33:8A:8C:8F:B5:F9:E1:53:90:A2:8A:F5:AE:65:4D:D8:B1:B6:66:DB:AE:6D:58:DC:69:97:3D',
      expiresAt: '2028-09-30T15:37:22.000Z',
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
    privacyAssessmentReference: 'PIA-2026-0088',
    metadataXml:
      '<?xml version="1.0" encoding="UTF-8"?>\n<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:alg="urn:oasis:names:tc:SAML:metadata:algsupport" ID="_4abfe24de3c184dee599fbdb8ae1bb19" entityID="https://manifest.internal/sp/cwl-6513709a/staging">\n\n  <md:Extensions>\n    <alg:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>\n    <alg:DigestMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#sha384"/>\n    <alg:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha512"/>\n    <alg:SigningMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>\n    <alg:SigningMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha384"/>\n    <alg:SigningMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha512"/>\n    <alg:SigningMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256"/>\n  </md:Extensions>\n\n  <md:SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">\n    <md:KeyDescriptor use="signing">\n      <ds:KeyInfo>\n        <ds:KeyName>cwl-6513709a.staging.manifest.internal</ds:KeyName>\n        <ds:X509Data>\n          <ds:X509SubjectName>O=Manifest,CN=cwl-6513709a-staging</ds:X509SubjectName>\n          <ds:X509Certificate>MIIFhTCCA22gAwIBAgIUY5NstC0cxVL1dQ1+2Ea0OhUeUq0wDQYJKoZIhvcNAQEL\nBQAwMjEdMBsGA1UEAwwUY3dsLTY1MTM3MDlhLXN0YWdpbmcxETAPBgNVBAoMCE1h\nbmlmZXN0MB4XDTI2MTAwMTE1MzcyMloXDTI4MDkzMDE1MzcyMlowMjEdMBsGA1UE\nAwwUY3dsLTY1MTM3MDlhLXN0YWdpbmcxETAPBgNVBAoMCE1hbmlmZXN0MIICIjAN\nBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEA2ajxaGxHzkrW8Foe6BqHzHOu1HwG\nvzQMlc1KrecDx+dZFDj6Skf/2Zs/Ii0qZZ+ee7EBdC/JiCGwDt9qgOX5Su0nWzhW\nsVCteMIA+ZS7nLe/q3NFyiOKVlBSHfnCvGJ1Oyk9z4Cned8ISfSoOvVyBco/5yCL\nFwv2lNFeHOUTTb2z4aGbdLWWrSREhzIIpngy95OjVjZDmOJJhzsuLie0yHUyAmRu\nfs8lLmDMeJN9Rw7vkngdqIvLQoGgxS4Mo5oJGAbzffZjJPayt0WhiW5lR7HT9dmN\nie+qIWgcDOVFXApANPm9uYv0yQ6N3LB002Kd4f1mqj8Vc98oLz4cK7UWk1cvo1qq\nfGIPVyBX1rvmDxdX2E7lSQ9cXoH4pNDqmyL8mptSmHJLHuvJVj8Ri0i8HFWXdomA\nfPh+GK9URi1R/PVX1MZk4PmOYgDHC0F7zNQCyIlvr1Zo3UIJ37sOr3qyRmTrSzv4\nauYbn6OlF4vuZdrcApj+mZP8GAJQPnuXfMbgDWnj3Dr/VWZK/J6Th5Lp8Ckax9RS\nWddTsCsvdpnC/rz4/SuxWKkfnHwdpC8JObkApgpVoXHQ/3kLs1Y7eSUo9hfHKZwX\nwMH0LDTejECOqZ+6gBT2JY/xeKLk0y9Zh7tU93EczYLfOrpG8iCBCRxe+qaw/4my\nxwqN4bOAaWdZ2ysCAwEAAaOBkjCBjzAdBgNVHQ4EFgQUXIl3aMeZwi/krWrIsgBJ\n6g6dUIQwHwYDVR0jBBgwFoAUXIl3aMeZwi/krWrIsgBJ6g6dUIQwDwYDVR0TAQH/\nBAUwAwEB/zA8BgNVHREENTAzhjFodHRwczovL21hbmlmZXN0LmludGVybmFsL3Nw\nL2N3bC02NTEzNzA5YS9zdGFnaW5nMA0GCSqGSIb3DQEBCwUAA4ICAQC8iuV6yFcI\nesWiWonWxDdB/ygHxkdXjLm5/RbLfr7N/hsyD4wx1UheFKRflN5c7to/v06nJEUt\np3se+T4BafDkTM92ytsgOm2Iu+R4g5EvRqQmMJF7ayyimArIy98DDjrURzNGSJmA\nbsqlTreK10J8KQtEJK3tF85SnBUrXapvKs66LP6bdXFXSIYy+iYgxkiLx6ya2jmZ\nAx+9pWHC+K8d8+rcEoUq/pgMgxfkChoJBArjiAwOuZbrx6m2AYDtMbL2FK0+njyQ\nrO7I1dSCW/tgiM4td69AFw5M08SCGx3HGrz7xG6r45huL2Nk/cWpxUjzVPyo7X4c\nSkvWPO1oJ/qDTdW3UJtmxH/dM9wySpcvmgGMn7dNt4PjXq+dHdKv52gYSU9XAKBu\nsIfMW82y0QIPszGjayFiB4awNhvQ4kf/5Shgv0p2/Dg6ddlxzvttRXdoWE9z9dGi\nqsIKTXGQNGiQERNbaHe/Z6ImnllIoBmVszw5GUUk7qb+cE7RVSJFbFTOoPeFvcoE\npqPySUQBbLULxZQR7WVQuRvkmsC72UxxDdqLi4FpOE1grsv+ksF1WYbA2eviWpZQ\nyWyLHENez758GdX2LjiNMBOLNF4YCqDaucQ8IZbxq6cgZcPqKjoVe+/ENbSOBdEK\n8Rz3oeLFdUGWGyfqge/5EJld/wslALvlyQ==</ds:X509Certificate>\n        </ds:X509Data>\n      </ds:KeyInfo>\n    </md:KeyDescriptor>\n\n    <md:KeyDescriptor use="encryption">\n      <ds:KeyInfo>\n        <ds:KeyName>cwl-6513709a.staging.manifest.internal</ds:KeyName>\n        <ds:X509Data>\n          <ds:X509SubjectName>O=Manifest,CN=cwl-6513709a-staging</ds:X509SubjectName>\n          <ds:X509Certificate>MIIFhTCCA22gAwIBAgIUY5NstC0cxVL1dQ1+2Ea0OhUeUq0wDQYJKoZIhvcNAQEL\nBQAwMjEdMBsGA1UEAwwUY3dsLTY1MTM3MDlhLXN0YWdpbmcxETAPBgNVBAoMCE1h\nbmlmZXN0MB4XDTI2MTAwMTE1MzcyMloXDTI4MDkzMDE1MzcyMlowMjEdMBsGA1UE\nAwwUY3dsLTY1MTM3MDlhLXN0YWdpbmcxETAPBgNVBAoMCE1hbmlmZXN0MIICIjAN\nBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEA2ajxaGxHzkrW8Foe6BqHzHOu1HwG\nvzQMlc1KrecDx+dZFDj6Skf/2Zs/Ii0qZZ+ee7EBdC/JiCGwDt9qgOX5Su0nWzhW\nsVCteMIA+ZS7nLe/q3NFyiOKVlBSHfnCvGJ1Oyk9z4Cned8ISfSoOvVyBco/5yCL\nFwv2lNFeHOUTTb2z4aGbdLWWrSREhzIIpngy95OjVjZDmOJJhzsuLie0yHUyAmRu\nfs8lLmDMeJN9Rw7vkngdqIvLQoGgxS4Mo5oJGAbzffZjJPayt0WhiW5lR7HT9dmN\nie+qIWgcDOVFXApANPm9uYv0yQ6N3LB002Kd4f1mqj8Vc98oLz4cK7UWk1cvo1qq\nfGIPVyBX1rvmDxdX2E7lSQ9cXoH4pNDqmyL8mptSmHJLHuvJVj8Ri0i8HFWXdomA\nfPh+GK9URi1R/PVX1MZk4PmOYgDHC0F7zNQCyIlvr1Zo3UIJ37sOr3qyRmTrSzv4\nauYbn6OlF4vuZdrcApj+mZP8GAJQPnuXfMbgDWnj3Dr/VWZK/J6Th5Lp8Ckax9RS\nWddTsCsvdpnC/rz4/SuxWKkfnHwdpC8JObkApgpVoXHQ/3kLs1Y7eSUo9hfHKZwX\nwMH0LDTejECOqZ+6gBT2JY/xeKLk0y9Zh7tU93EczYLfOrpG8iCBCRxe+qaw/4my\nxwqN4bOAaWdZ2ysCAwEAAaOBkjCBjzAdBgNVHQ4EFgQUXIl3aMeZwi/krWrIsgBJ\n6g6dUIQwHwYDVR0jBBgwFoAUXIl3aMeZwi/krWrIsgBJ6g6dUIQwDwYDVR0TAQH/\nBAUwAwEB/zA8BgNVHREENTAzhjFodHRwczovL21hbmlmZXN0LmludGVybmFsL3Nw\nL2N3bC02NTEzNzA5YS9zdGFnaW5nMA0GCSqGSIb3DQEBCwUAA4ICAQC8iuV6yFcI\nesWiWonWxDdB/ygHxkdXjLm5/RbLfr7N/hsyD4wx1UheFKRflN5c7to/v06nJEUt\np3se+T4BafDkTM92ytsgOm2Iu+R4g5EvRqQmMJF7ayyimArIy98DDjrURzNGSJmA\nbsqlTreK10J8KQtEJK3tF85SnBUrXapvKs66LP6bdXFXSIYy+iYgxkiLx6ya2jmZ\nAx+9pWHC+K8d8+rcEoUq/pgMgxfkChoJBArjiAwOuZbrx6m2AYDtMbL2FK0+njyQ\nrO7I1dSCW/tgiM4td69AFw5M08SCGx3HGrz7xG6r45huL2Nk/cWpxUjzVPyo7X4c\nSkvWPO1oJ/qDTdW3UJtmxH/dM9wySpcvmgGMn7dNt4PjXq+dHdKv52gYSU9XAKBu\nsIfMW82y0QIPszGjayFiB4awNhvQ4kf/5Shgv0p2/Dg6ddlxzvttRXdoWE9z9dGi\nqsIKTXGQNGiQERNbaHe/Z6ImnllIoBmVszw5GUUk7qb+cE7RVSJFbFTOoPeFvcoE\npqPySUQBbLULxZQR7WVQuRvkmsC72UxxDdqLi4FpOE1grsv+ksF1WYbA2eviWpZQ\nyWyLHENez758GdX2LjiNMBOLNF4YCqDaucQ8IZbxq6cgZcPqKjoVe+/ENbSOBdEK\n8Rz3oeLFdUGWGyfqge/5EJld/wslALvlyQ==</ds:X509Certificate>\n        </ds:X509Data>\n      </ds:KeyInfo>\n      <md:EncryptionMethod Algorithm="http://www.w3.org/2009/xmlenc11#aes128-gcm"/>\n      <md:EncryptionMethod Algorithm="http://www.w3.org/2009/xmlenc11#aes256-gcm"/>\n      <md:EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes256-cbc"/>\n    </md:KeyDescriptor>\n\n    <md:SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://cwl-6513709a.staging.manifest.internal/auth/logout"/>\n\n    <md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://cwl-6513709a.staging.manifest.internal/auth/ubcshib/callback" index="1" isDefault="true"/>\n  </md:SPSSODescriptor>\n\n  <md:Organization>\n    <md:OrganizationName>University of British Columbia</md:OrganizationName>\n    <md:OrganizationDisplayName>University of British Columbia</md:OrganizationDisplayName>\n    <md:OrganizationURL>https://www.ubc.ca</md:OrganizationURL>\n  </md:Organization>\n\n  <md:ContactPerson contactType="technical">\n    <md:EmailAddress>bio_prof@example.ubc.ca</md:EmailAddress>\n  </md:ContactPerson>\n  <md:ContactPerson contactType="support">\n    <md:EmailAddress>platform_admin@example.ubc.ca</md:EmailAddress>\n  </md:ContactPerson>\n\n</md:EntityDescriptor>\n',
    warnings: [],
  },
  createdAt: '2026-10-01T15:37:23.114Z',
  updatedAt: '2026-10-01T15:37:23.114Z',
} satisfies z.input<typeof IamRegistration>

/** `submitIamRegistration`'s request: UBC's reference, and the draft the person was shown. */
export const SUBMIT_REQUEST_EXAMPLE = {
  reference: 'IAM-2026-0500',
  draftGeneratedAt: '2026-10-01T15:37:23.111Z',
} satisfies z.input<typeof SubmitLaunchRecordRequest>

/** `submitIamRegistration`: that draft, said to have been sent — the package kept as it was sent. */
export const SUBMITTED_EXAMPLE = {
  id: 'e196ea92-0c4e-4f68-b42f-00ce57e1d92f',
  projectId: '72bc6c0a-bf2b-4b4f-8165-bc86227cd46d',
  environment: 'staging',
  entityId: 'https://manifest.internal/sp/cwl-6513709a/staging',
  acsUrl: 'https://cwl-6513709a.staging.manifest.internal/auth/ubcshib/callback',
  sloUrl: 'https://cwl-6513709a.staging.manifest.internal/auth/logout',
  certFingerprint: null,
  certExpiresAt: null,
  registeredAttributes: [],
  requestedAttributes: null,
  registeredAt: null,
  state: 'submitted',
  externalTicketRef: 'IAM-2026-0500',
  submittedAt: '2026-10-01T19:00:00.000Z',
  submittedBy: {
    id: 'af3dc1c0-722c-469c-8c2a-b6179ca3f327',
    displayName: 'Bio Prof',
  },
  package: {
    environment: 'staging',
    generatedAt: '2026-10-01T15:37:23.111Z',
    fromCommit: 'a4080513ab8842356764b34255f511d2d6f5bf43',
    entityId: 'https://manifest.internal/sp/cwl-6513709a/staging',
    acsUrl: 'https://cwl-6513709a.staging.manifest.internal/auth/ubcshib/callback',
    sloUrl: 'https://cwl-6513709a.staging.manifest.internal/auth/logout',
    certificate: {
      pem: '-----BEGIN CERTIFICATE-----\nMIIFhTCCA22gAwIBAgIUY5NstC0cxVL1dQ1+2Ea0OhUeUq0wDQYJKoZIhvcNAQEL\nBQAwMjEdMBsGA1UEAwwUY3dsLTY1MTM3MDlhLXN0YWdpbmcxETAPBgNVBAoMCE1h\nbmlmZXN0MB4XDTI2MTAwMTE1MzcyMloXDTI4MDkzMDE1MzcyMlowMjEdMBsGA1UE\nAwwUY3dsLTY1MTM3MDlhLXN0YWdpbmcxETAPBgNVBAoMCE1hbmlmZXN0MIICIjAN\nBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEA2ajxaGxHzkrW8Foe6BqHzHOu1HwG\nvzQMlc1KrecDx+dZFDj6Skf/2Zs/Ii0qZZ+ee7EBdC/JiCGwDt9qgOX5Su0nWzhW\nsVCteMIA+ZS7nLe/q3NFyiOKVlBSHfnCvGJ1Oyk9z4Cned8ISfSoOvVyBco/5yCL\nFwv2lNFeHOUTTb2z4aGbdLWWrSREhzIIpngy95OjVjZDmOJJhzsuLie0yHUyAmRu\nfs8lLmDMeJN9Rw7vkngdqIvLQoGgxS4Mo5oJGAbzffZjJPayt0WhiW5lR7HT9dmN\nie+qIWgcDOVFXApANPm9uYv0yQ6N3LB002Kd4f1mqj8Vc98oLz4cK7UWk1cvo1qq\nfGIPVyBX1rvmDxdX2E7lSQ9cXoH4pNDqmyL8mptSmHJLHuvJVj8Ri0i8HFWXdomA\nfPh+GK9URi1R/PVX1MZk4PmOYgDHC0F7zNQCyIlvr1Zo3UIJ37sOr3qyRmTrSzv4\nauYbn6OlF4vuZdrcApj+mZP8GAJQPnuXfMbgDWnj3Dr/VWZK/J6Th5Lp8Ckax9RS\nWddTsCsvdpnC/rz4/SuxWKkfnHwdpC8JObkApgpVoXHQ/3kLs1Y7eSUo9hfHKZwX\nwMH0LDTejECOqZ+6gBT2JY/xeKLk0y9Zh7tU93EczYLfOrpG8iCBCRxe+qaw/4my\nxwqN4bOAaWdZ2ysCAwEAAaOBkjCBjzAdBgNVHQ4EFgQUXIl3aMeZwi/krWrIsgBJ\n6g6dUIQwHwYDVR0jBBgwFoAUXIl3aMeZwi/krWrIsgBJ6g6dUIQwDwYDVR0TAQH/\nBAUwAwEB/zA8BgNVHREENTAzhjFodHRwczovL21hbmlmZXN0LmludGVybmFsL3Nw\nL2N3bC02NTEzNzA5YS9zdGFnaW5nMA0GCSqGSIb3DQEBCwUAA4ICAQC8iuV6yFcI\nesWiWonWxDdB/ygHxkdXjLm5/RbLfr7N/hsyD4wx1UheFKRflN5c7to/v06nJEUt\np3se+T4BafDkTM92ytsgOm2Iu+R4g5EvRqQmMJF7ayyimArIy98DDjrURzNGSJmA\nbsqlTreK10J8KQtEJK3tF85SnBUrXapvKs66LP6bdXFXSIYy+iYgxkiLx6ya2jmZ\nAx+9pWHC+K8d8+rcEoUq/pgMgxfkChoJBArjiAwOuZbrx6m2AYDtMbL2FK0+njyQ\nrO7I1dSCW/tgiM4td69AFw5M08SCGx3HGrz7xG6r45huL2Nk/cWpxUjzVPyo7X4c\nSkvWPO1oJ/qDTdW3UJtmxH/dM9wySpcvmgGMn7dNt4PjXq+dHdKv52gYSU9XAKBu\nsIfMW82y0QIPszGjayFiB4awNhvQ4kf/5Shgv0p2/Dg6ddlxzvttRXdoWE9z9dGi\nqsIKTXGQNGiQERNbaHe/Z6ImnllIoBmVszw5GUUk7qb+cE7RVSJFbFTOoPeFvcoE\npqPySUQBbLULxZQR7WVQuRvkmsC72UxxDdqLi4FpOE1grsv+ksF1WYbA2eviWpZQ\nyWyLHENez758GdX2LjiNMBOLNF4YCqDaucQ8IZbxq6cgZcPqKjoVe+/ENbSOBdEK\n8Rz3oeLFdUGWGyfqge/5EJld/wslALvlyQ==\n-----END CERTIFICATE-----\n',
      fingerprint:
        '35:9A:6E:22:18:33:8A:8C:8F:B5:F9:E1:53:90:A2:8A:F5:AE:65:4D:D8:B1:B6:66:DB:AE:6D:58:DC:69:97:3D',
      expiresAt: '2028-09-30T15:37:22.000Z',
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
    privacyAssessmentReference: 'PIA-2026-0088',
    metadataXml:
      '<?xml version="1.0" encoding="UTF-8"?>\n<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:alg="urn:oasis:names:tc:SAML:metadata:algsupport" ID="_4abfe24de3c184dee599fbdb8ae1bb19" entityID="https://manifest.internal/sp/cwl-6513709a/staging">\n\n  <md:Extensions>\n    <alg:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>\n    <alg:DigestMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#sha384"/>\n    <alg:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha512"/>\n    <alg:SigningMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>\n    <alg:SigningMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha384"/>\n    <alg:SigningMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha512"/>\n    <alg:SigningMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256"/>\n  </md:Extensions>\n\n  <md:SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">\n    <md:KeyDescriptor use="signing">\n      <ds:KeyInfo>\n        <ds:KeyName>cwl-6513709a.staging.manifest.internal</ds:KeyName>\n        <ds:X509Data>\n          <ds:X509SubjectName>O=Manifest,CN=cwl-6513709a-staging</ds:X509SubjectName>\n          <ds:X509Certificate>MIIFhTCCA22gAwIBAgIUY5NstC0cxVL1dQ1+2Ea0OhUeUq0wDQYJKoZIhvcNAQEL\nBQAwMjEdMBsGA1UEAwwUY3dsLTY1MTM3MDlhLXN0YWdpbmcxETAPBgNVBAoMCE1h\nbmlmZXN0MB4XDTI2MTAwMTE1MzcyMloXDTI4MDkzMDE1MzcyMlowMjEdMBsGA1UE\nAwwUY3dsLTY1MTM3MDlhLXN0YWdpbmcxETAPBgNVBAoMCE1hbmlmZXN0MIICIjAN\nBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEA2ajxaGxHzkrW8Foe6BqHzHOu1HwG\nvzQMlc1KrecDx+dZFDj6Skf/2Zs/Ii0qZZ+ee7EBdC/JiCGwDt9qgOX5Su0nWzhW\nsVCteMIA+ZS7nLe/q3NFyiOKVlBSHfnCvGJ1Oyk9z4Cned8ISfSoOvVyBco/5yCL\nFwv2lNFeHOUTTb2z4aGbdLWWrSREhzIIpngy95OjVjZDmOJJhzsuLie0yHUyAmRu\nfs8lLmDMeJN9Rw7vkngdqIvLQoGgxS4Mo5oJGAbzffZjJPayt0WhiW5lR7HT9dmN\nie+qIWgcDOVFXApANPm9uYv0yQ6N3LB002Kd4f1mqj8Vc98oLz4cK7UWk1cvo1qq\nfGIPVyBX1rvmDxdX2E7lSQ9cXoH4pNDqmyL8mptSmHJLHuvJVj8Ri0i8HFWXdomA\nfPh+GK9URi1R/PVX1MZk4PmOYgDHC0F7zNQCyIlvr1Zo3UIJ37sOr3qyRmTrSzv4\nauYbn6OlF4vuZdrcApj+mZP8GAJQPnuXfMbgDWnj3Dr/VWZK/J6Th5Lp8Ckax9RS\nWddTsCsvdpnC/rz4/SuxWKkfnHwdpC8JObkApgpVoXHQ/3kLs1Y7eSUo9hfHKZwX\nwMH0LDTejECOqZ+6gBT2JY/xeKLk0y9Zh7tU93EczYLfOrpG8iCBCRxe+qaw/4my\nxwqN4bOAaWdZ2ysCAwEAAaOBkjCBjzAdBgNVHQ4EFgQUXIl3aMeZwi/krWrIsgBJ\n6g6dUIQwHwYDVR0jBBgwFoAUXIl3aMeZwi/krWrIsgBJ6g6dUIQwDwYDVR0TAQH/\nBAUwAwEB/zA8BgNVHREENTAzhjFodHRwczovL21hbmlmZXN0LmludGVybmFsL3Nw\nL2N3bC02NTEzNzA5YS9zdGFnaW5nMA0GCSqGSIb3DQEBCwUAA4ICAQC8iuV6yFcI\nesWiWonWxDdB/ygHxkdXjLm5/RbLfr7N/hsyD4wx1UheFKRflN5c7to/v06nJEUt\np3se+T4BafDkTM92ytsgOm2Iu+R4g5EvRqQmMJF7ayyimArIy98DDjrURzNGSJmA\nbsqlTreK10J8KQtEJK3tF85SnBUrXapvKs66LP6bdXFXSIYy+iYgxkiLx6ya2jmZ\nAx+9pWHC+K8d8+rcEoUq/pgMgxfkChoJBArjiAwOuZbrx6m2AYDtMbL2FK0+njyQ\nrO7I1dSCW/tgiM4td69AFw5M08SCGx3HGrz7xG6r45huL2Nk/cWpxUjzVPyo7X4c\nSkvWPO1oJ/qDTdW3UJtmxH/dM9wySpcvmgGMn7dNt4PjXq+dHdKv52gYSU9XAKBu\nsIfMW82y0QIPszGjayFiB4awNhvQ4kf/5Shgv0p2/Dg6ddlxzvttRXdoWE9z9dGi\nqsIKTXGQNGiQERNbaHe/Z6ImnllIoBmVszw5GUUk7qb+cE7RVSJFbFTOoPeFvcoE\npqPySUQBbLULxZQR7WVQuRvkmsC72UxxDdqLi4FpOE1grsv+ksF1WYbA2eviWpZQ\nyWyLHENez758GdX2LjiNMBOLNF4YCqDaucQ8IZbxq6cgZcPqKjoVe+/ENbSOBdEK\n8Rz3oeLFdUGWGyfqge/5EJld/wslALvlyQ==</ds:X509Certificate>\n        </ds:X509Data>\n      </ds:KeyInfo>\n    </md:KeyDescriptor>\n\n    <md:KeyDescriptor use="encryption">\n      <ds:KeyInfo>\n        <ds:KeyName>cwl-6513709a.staging.manifest.internal</ds:KeyName>\n        <ds:X509Data>\n          <ds:X509SubjectName>O=Manifest,CN=cwl-6513709a-staging</ds:X509SubjectName>\n          <ds:X509Certificate>MIIFhTCCA22gAwIBAgIUY5NstC0cxVL1dQ1+2Ea0OhUeUq0wDQYJKoZIhvcNAQEL\nBQAwMjEdMBsGA1UEAwwUY3dsLTY1MTM3MDlhLXN0YWdpbmcxETAPBgNVBAoMCE1h\nbmlmZXN0MB4XDTI2MTAwMTE1MzcyMloXDTI4MDkzMDE1MzcyMlowMjEdMBsGA1UE\nAwwUY3dsLTY1MTM3MDlhLXN0YWdpbmcxETAPBgNVBAoMCE1hbmlmZXN0MIICIjAN\nBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEA2ajxaGxHzkrW8Foe6BqHzHOu1HwG\nvzQMlc1KrecDx+dZFDj6Skf/2Zs/Ii0qZZ+ee7EBdC/JiCGwDt9qgOX5Su0nWzhW\nsVCteMIA+ZS7nLe/q3NFyiOKVlBSHfnCvGJ1Oyk9z4Cned8ISfSoOvVyBco/5yCL\nFwv2lNFeHOUTTb2z4aGbdLWWrSREhzIIpngy95OjVjZDmOJJhzsuLie0yHUyAmRu\nfs8lLmDMeJN9Rw7vkngdqIvLQoGgxS4Mo5oJGAbzffZjJPayt0WhiW5lR7HT9dmN\nie+qIWgcDOVFXApANPm9uYv0yQ6N3LB002Kd4f1mqj8Vc98oLz4cK7UWk1cvo1qq\nfGIPVyBX1rvmDxdX2E7lSQ9cXoH4pNDqmyL8mptSmHJLHuvJVj8Ri0i8HFWXdomA\nfPh+GK9URi1R/PVX1MZk4PmOYgDHC0F7zNQCyIlvr1Zo3UIJ37sOr3qyRmTrSzv4\nauYbn6OlF4vuZdrcApj+mZP8GAJQPnuXfMbgDWnj3Dr/VWZK/J6Th5Lp8Ckax9RS\nWddTsCsvdpnC/rz4/SuxWKkfnHwdpC8JObkApgpVoXHQ/3kLs1Y7eSUo9hfHKZwX\nwMH0LDTejECOqZ+6gBT2JY/xeKLk0y9Zh7tU93EczYLfOrpG8iCBCRxe+qaw/4my\nxwqN4bOAaWdZ2ysCAwEAAaOBkjCBjzAdBgNVHQ4EFgQUXIl3aMeZwi/krWrIsgBJ\n6g6dUIQwHwYDVR0jBBgwFoAUXIl3aMeZwi/krWrIsgBJ6g6dUIQwDwYDVR0TAQH/\nBAUwAwEB/zA8BgNVHREENTAzhjFodHRwczovL21hbmlmZXN0LmludGVybmFsL3Nw\nL2N3bC02NTEzNzA5YS9zdGFnaW5nMA0GCSqGSIb3DQEBCwUAA4ICAQC8iuV6yFcI\nesWiWonWxDdB/ygHxkdXjLm5/RbLfr7N/hsyD4wx1UheFKRflN5c7to/v06nJEUt\np3se+T4BafDkTM92ytsgOm2Iu+R4g5EvRqQmMJF7ayyimArIy98DDjrURzNGSJmA\nbsqlTreK10J8KQtEJK3tF85SnBUrXapvKs66LP6bdXFXSIYy+iYgxkiLx6ya2jmZ\nAx+9pWHC+K8d8+rcEoUq/pgMgxfkChoJBArjiAwOuZbrx6m2AYDtMbL2FK0+njyQ\nrO7I1dSCW/tgiM4td69AFw5M08SCGx3HGrz7xG6r45huL2Nk/cWpxUjzVPyo7X4c\nSkvWPO1oJ/qDTdW3UJtmxH/dM9wySpcvmgGMn7dNt4PjXq+dHdKv52gYSU9XAKBu\nsIfMW82y0QIPszGjayFiB4awNhvQ4kf/5Shgv0p2/Dg6ddlxzvttRXdoWE9z9dGi\nqsIKTXGQNGiQERNbaHe/Z6ImnllIoBmVszw5GUUk7qb+cE7RVSJFbFTOoPeFvcoE\npqPySUQBbLULxZQR7WVQuRvkmsC72UxxDdqLi4FpOE1grsv+ksF1WYbA2eviWpZQ\nyWyLHENez758GdX2LjiNMBOLNF4YCqDaucQ8IZbxq6cgZcPqKjoVe+/ENbSOBdEK\n8Rz3oeLFdUGWGyfqge/5EJld/wslALvlyQ==</ds:X509Certificate>\n        </ds:X509Data>\n      </ds:KeyInfo>\n      <md:EncryptionMethod Algorithm="http://www.w3.org/2009/xmlenc11#aes128-gcm"/>\n      <md:EncryptionMethod Algorithm="http://www.w3.org/2009/xmlenc11#aes256-gcm"/>\n      <md:EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes256-cbc"/>\n    </md:KeyDescriptor>\n\n    <md:SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://cwl-6513709a.staging.manifest.internal/auth/logout"/>\n\n    <md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://cwl-6513709a.staging.manifest.internal/auth/ubcshib/callback" index="1" isDefault="true"/>\n  </md:SPSSODescriptor>\n\n  <md:Organization>\n    <md:OrganizationName>University of British Columbia</md:OrganizationName>\n    <md:OrganizationDisplayName>University of British Columbia</md:OrganizationDisplayName>\n    <md:OrganizationURL>https://www.ubc.ca</md:OrganizationURL>\n  </md:Organization>\n\n  <md:ContactPerson contactType="technical">\n    <md:EmailAddress>bio_prof@example.ubc.ca</md:EmailAddress>\n  </md:ContactPerson>\n  <md:ContactPerson contactType="support">\n    <md:EmailAddress>platform_admin@example.ubc.ca</md:EmailAddress>\n  </md:ContactPerson>\n\n</md:EntityDescriptor>\n',
    warnings: [],
  },
  createdAt: '2026-10-01T15:37:23.114Z',
  updatedAt: '2026-10-01T15:37:23.131Z',
} satisfies z.input<typeof IamRegistration>

/** `getLaunchRecords`: the three records once the staging registration was sent. */
export const RECORDS_EXAMPLE = {
  projectId: '72bc6c0a-bf2b-4b4f-8165-bc86227cd46d',
  iamRegistration: null,
  stagingRegistration: {
    id: 'e196ea92-0c4e-4f68-b42f-00ce57e1d92f',
    projectId: '72bc6c0a-bf2b-4b4f-8165-bc86227cd46d',
    environment: 'staging',
    entityId: 'https://manifest.internal/sp/cwl-6513709a/staging',
    acsUrl: 'https://cwl-6513709a.staging.manifest.internal/auth/ubcshib/callback',
    sloUrl: 'https://cwl-6513709a.staging.manifest.internal/auth/logout',
    certFingerprint: null,
    certExpiresAt: null,
    registeredAttributes: [],
    requestedAttributes: null,
    registeredAt: null,
    state: 'submitted',
    externalTicketRef: 'IAM-2026-0500',
    submittedAt: '2026-10-01T19:00:00.000Z',
    submittedBy: {
      id: 'af3dc1c0-722c-469c-8c2a-b6179ca3f327',
      displayName: 'Bio Prof',
    },
    package: {
      environment: 'staging',
      generatedAt: '2026-10-01T15:37:23.111Z',
      fromCommit: 'a4080513ab8842356764b34255f511d2d6f5bf43',
      entityId: 'https://manifest.internal/sp/cwl-6513709a/staging',
      acsUrl: 'https://cwl-6513709a.staging.manifest.internal/auth/ubcshib/callback',
      sloUrl: 'https://cwl-6513709a.staging.manifest.internal/auth/logout',
      certificate: {
        pem: '-----BEGIN CERTIFICATE-----\nMIIFhTCCA22gAwIBAgIUY5NstC0cxVL1dQ1+2Ea0OhUeUq0wDQYJKoZIhvcNAQEL\nBQAwMjEdMBsGA1UEAwwUY3dsLTY1MTM3MDlhLXN0YWdpbmcxETAPBgNVBAoMCE1h\nbmlmZXN0MB4XDTI2MTAwMTE1MzcyMloXDTI4MDkzMDE1MzcyMlowMjEdMBsGA1UE\nAwwUY3dsLTY1MTM3MDlhLXN0YWdpbmcxETAPBgNVBAoMCE1hbmlmZXN0MIICIjAN\nBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEA2ajxaGxHzkrW8Foe6BqHzHOu1HwG\nvzQMlc1KrecDx+dZFDj6Skf/2Zs/Ii0qZZ+ee7EBdC/JiCGwDt9qgOX5Su0nWzhW\nsVCteMIA+ZS7nLe/q3NFyiOKVlBSHfnCvGJ1Oyk9z4Cned8ISfSoOvVyBco/5yCL\nFwv2lNFeHOUTTb2z4aGbdLWWrSREhzIIpngy95OjVjZDmOJJhzsuLie0yHUyAmRu\nfs8lLmDMeJN9Rw7vkngdqIvLQoGgxS4Mo5oJGAbzffZjJPayt0WhiW5lR7HT9dmN\nie+qIWgcDOVFXApANPm9uYv0yQ6N3LB002Kd4f1mqj8Vc98oLz4cK7UWk1cvo1qq\nfGIPVyBX1rvmDxdX2E7lSQ9cXoH4pNDqmyL8mptSmHJLHuvJVj8Ri0i8HFWXdomA\nfPh+GK9URi1R/PVX1MZk4PmOYgDHC0F7zNQCyIlvr1Zo3UIJ37sOr3qyRmTrSzv4\nauYbn6OlF4vuZdrcApj+mZP8GAJQPnuXfMbgDWnj3Dr/VWZK/J6Th5Lp8Ckax9RS\nWddTsCsvdpnC/rz4/SuxWKkfnHwdpC8JObkApgpVoXHQ/3kLs1Y7eSUo9hfHKZwX\nwMH0LDTejECOqZ+6gBT2JY/xeKLk0y9Zh7tU93EczYLfOrpG8iCBCRxe+qaw/4my\nxwqN4bOAaWdZ2ysCAwEAAaOBkjCBjzAdBgNVHQ4EFgQUXIl3aMeZwi/krWrIsgBJ\n6g6dUIQwHwYDVR0jBBgwFoAUXIl3aMeZwi/krWrIsgBJ6g6dUIQwDwYDVR0TAQH/\nBAUwAwEB/zA8BgNVHREENTAzhjFodHRwczovL21hbmlmZXN0LmludGVybmFsL3Nw\nL2N3bC02NTEzNzA5YS9zdGFnaW5nMA0GCSqGSIb3DQEBCwUAA4ICAQC8iuV6yFcI\nesWiWonWxDdB/ygHxkdXjLm5/RbLfr7N/hsyD4wx1UheFKRflN5c7to/v06nJEUt\np3se+T4BafDkTM92ytsgOm2Iu+R4g5EvRqQmMJF7ayyimArIy98DDjrURzNGSJmA\nbsqlTreK10J8KQtEJK3tF85SnBUrXapvKs66LP6bdXFXSIYy+iYgxkiLx6ya2jmZ\nAx+9pWHC+K8d8+rcEoUq/pgMgxfkChoJBArjiAwOuZbrx6m2AYDtMbL2FK0+njyQ\nrO7I1dSCW/tgiM4td69AFw5M08SCGx3HGrz7xG6r45huL2Nk/cWpxUjzVPyo7X4c\nSkvWPO1oJ/qDTdW3UJtmxH/dM9wySpcvmgGMn7dNt4PjXq+dHdKv52gYSU9XAKBu\nsIfMW82y0QIPszGjayFiB4awNhvQ4kf/5Shgv0p2/Dg6ddlxzvttRXdoWE9z9dGi\nqsIKTXGQNGiQERNbaHe/Z6ImnllIoBmVszw5GUUk7qb+cE7RVSJFbFTOoPeFvcoE\npqPySUQBbLULxZQR7WVQuRvkmsC72UxxDdqLi4FpOE1grsv+ksF1WYbA2eviWpZQ\nyWyLHENez758GdX2LjiNMBOLNF4YCqDaucQ8IZbxq6cgZcPqKjoVe+/ENbSOBdEK\n8Rz3oeLFdUGWGyfqge/5EJld/wslALvlyQ==\n-----END CERTIFICATE-----\n',
        fingerprint:
          '35:9A:6E:22:18:33:8A:8C:8F:B5:F9:E1:53:90:A2:8A:F5:AE:65:4D:D8:B1:B6:66:DB:AE:6D:58:DC:69:97:3D',
        expiresAt: '2028-09-30T15:37:22.000Z',
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
      privacyAssessmentReference: 'PIA-2026-0088',
      metadataXml:
        '<?xml version="1.0" encoding="UTF-8"?>\n<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:alg="urn:oasis:names:tc:SAML:metadata:algsupport" ID="_4abfe24de3c184dee599fbdb8ae1bb19" entityID="https://manifest.internal/sp/cwl-6513709a/staging">\n\n  <md:Extensions>\n    <alg:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>\n    <alg:DigestMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#sha384"/>\n    <alg:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha512"/>\n    <alg:SigningMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>\n    <alg:SigningMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha384"/>\n    <alg:SigningMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha512"/>\n    <alg:SigningMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256"/>\n  </md:Extensions>\n\n  <md:SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">\n    <md:KeyDescriptor use="signing">\n      <ds:KeyInfo>\n        <ds:KeyName>cwl-6513709a.staging.manifest.internal</ds:KeyName>\n        <ds:X509Data>\n          <ds:X509SubjectName>O=Manifest,CN=cwl-6513709a-staging</ds:X509SubjectName>\n          <ds:X509Certificate>MIIFhTCCA22gAwIBAgIUY5NstC0cxVL1dQ1+2Ea0OhUeUq0wDQYJKoZIhvcNAQEL\nBQAwMjEdMBsGA1UEAwwUY3dsLTY1MTM3MDlhLXN0YWdpbmcxETAPBgNVBAoMCE1h\nbmlmZXN0MB4XDTI2MTAwMTE1MzcyMloXDTI4MDkzMDE1MzcyMlowMjEdMBsGA1UE\nAwwUY3dsLTY1MTM3MDlhLXN0YWdpbmcxETAPBgNVBAoMCE1hbmlmZXN0MIICIjAN\nBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEA2ajxaGxHzkrW8Foe6BqHzHOu1HwG\nvzQMlc1KrecDx+dZFDj6Skf/2Zs/Ii0qZZ+ee7EBdC/JiCGwDt9qgOX5Su0nWzhW\nsVCteMIA+ZS7nLe/q3NFyiOKVlBSHfnCvGJ1Oyk9z4Cned8ISfSoOvVyBco/5yCL\nFwv2lNFeHOUTTb2z4aGbdLWWrSREhzIIpngy95OjVjZDmOJJhzsuLie0yHUyAmRu\nfs8lLmDMeJN9Rw7vkngdqIvLQoGgxS4Mo5oJGAbzffZjJPayt0WhiW5lR7HT9dmN\nie+qIWgcDOVFXApANPm9uYv0yQ6N3LB002Kd4f1mqj8Vc98oLz4cK7UWk1cvo1qq\nfGIPVyBX1rvmDxdX2E7lSQ9cXoH4pNDqmyL8mptSmHJLHuvJVj8Ri0i8HFWXdomA\nfPh+GK9URi1R/PVX1MZk4PmOYgDHC0F7zNQCyIlvr1Zo3UIJ37sOr3qyRmTrSzv4\nauYbn6OlF4vuZdrcApj+mZP8GAJQPnuXfMbgDWnj3Dr/VWZK/J6Th5Lp8Ckax9RS\nWddTsCsvdpnC/rz4/SuxWKkfnHwdpC8JObkApgpVoXHQ/3kLs1Y7eSUo9hfHKZwX\nwMH0LDTejECOqZ+6gBT2JY/xeKLk0y9Zh7tU93EczYLfOrpG8iCBCRxe+qaw/4my\nxwqN4bOAaWdZ2ysCAwEAAaOBkjCBjzAdBgNVHQ4EFgQUXIl3aMeZwi/krWrIsgBJ\n6g6dUIQwHwYDVR0jBBgwFoAUXIl3aMeZwi/krWrIsgBJ6g6dUIQwDwYDVR0TAQH/\nBAUwAwEB/zA8BgNVHREENTAzhjFodHRwczovL21hbmlmZXN0LmludGVybmFsL3Nw\nL2N3bC02NTEzNzA5YS9zdGFnaW5nMA0GCSqGSIb3DQEBCwUAA4ICAQC8iuV6yFcI\nesWiWonWxDdB/ygHxkdXjLm5/RbLfr7N/hsyD4wx1UheFKRflN5c7to/v06nJEUt\np3se+T4BafDkTM92ytsgOm2Iu+R4g5EvRqQmMJF7ayyimArIy98DDjrURzNGSJmA\nbsqlTreK10J8KQtEJK3tF85SnBUrXapvKs66LP6bdXFXSIYy+iYgxkiLx6ya2jmZ\nAx+9pWHC+K8d8+rcEoUq/pgMgxfkChoJBArjiAwOuZbrx6m2AYDtMbL2FK0+njyQ\nrO7I1dSCW/tgiM4td69AFw5M08SCGx3HGrz7xG6r45huL2Nk/cWpxUjzVPyo7X4c\nSkvWPO1oJ/qDTdW3UJtmxH/dM9wySpcvmgGMn7dNt4PjXq+dHdKv52gYSU9XAKBu\nsIfMW82y0QIPszGjayFiB4awNhvQ4kf/5Shgv0p2/Dg6ddlxzvttRXdoWE9z9dGi\nqsIKTXGQNGiQERNbaHe/Z6ImnllIoBmVszw5GUUk7qb+cE7RVSJFbFTOoPeFvcoE\npqPySUQBbLULxZQR7WVQuRvkmsC72UxxDdqLi4FpOE1grsv+ksF1WYbA2eviWpZQ\nyWyLHENez758GdX2LjiNMBOLNF4YCqDaucQ8IZbxq6cgZcPqKjoVe+/ENbSOBdEK\n8Rz3oeLFdUGWGyfqge/5EJld/wslALvlyQ==</ds:X509Certificate>\n        </ds:X509Data>\n      </ds:KeyInfo>\n    </md:KeyDescriptor>\n\n    <md:KeyDescriptor use="encryption">\n      <ds:KeyInfo>\n        <ds:KeyName>cwl-6513709a.staging.manifest.internal</ds:KeyName>\n        <ds:X509Data>\n          <ds:X509SubjectName>O=Manifest,CN=cwl-6513709a-staging</ds:X509SubjectName>\n          <ds:X509Certificate>MIIFhTCCA22gAwIBAgIUY5NstC0cxVL1dQ1+2Ea0OhUeUq0wDQYJKoZIhvcNAQEL\nBQAwMjEdMBsGA1UEAwwUY3dsLTY1MTM3MDlhLXN0YWdpbmcxETAPBgNVBAoMCE1h\nbmlmZXN0MB4XDTI2MTAwMTE1MzcyMloXDTI4MDkzMDE1MzcyMlowMjEdMBsGA1UE\nAwwUY3dsLTY1MTM3MDlhLXN0YWdpbmcxETAPBgNVBAoMCE1hbmlmZXN0MIICIjAN\nBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEA2ajxaGxHzkrW8Foe6BqHzHOu1HwG\nvzQMlc1KrecDx+dZFDj6Skf/2Zs/Ii0qZZ+ee7EBdC/JiCGwDt9qgOX5Su0nWzhW\nsVCteMIA+ZS7nLe/q3NFyiOKVlBSHfnCvGJ1Oyk9z4Cned8ISfSoOvVyBco/5yCL\nFwv2lNFeHOUTTb2z4aGbdLWWrSREhzIIpngy95OjVjZDmOJJhzsuLie0yHUyAmRu\nfs8lLmDMeJN9Rw7vkngdqIvLQoGgxS4Mo5oJGAbzffZjJPayt0WhiW5lR7HT9dmN\nie+qIWgcDOVFXApANPm9uYv0yQ6N3LB002Kd4f1mqj8Vc98oLz4cK7UWk1cvo1qq\nfGIPVyBX1rvmDxdX2E7lSQ9cXoH4pNDqmyL8mptSmHJLHuvJVj8Ri0i8HFWXdomA\nfPh+GK9URi1R/PVX1MZk4PmOYgDHC0F7zNQCyIlvr1Zo3UIJ37sOr3qyRmTrSzv4\nauYbn6OlF4vuZdrcApj+mZP8GAJQPnuXfMbgDWnj3Dr/VWZK/J6Th5Lp8Ckax9RS\nWddTsCsvdpnC/rz4/SuxWKkfnHwdpC8JObkApgpVoXHQ/3kLs1Y7eSUo9hfHKZwX\nwMH0LDTejECOqZ+6gBT2JY/xeKLk0y9Zh7tU93EczYLfOrpG8iCBCRxe+qaw/4my\nxwqN4bOAaWdZ2ysCAwEAAaOBkjCBjzAdBgNVHQ4EFgQUXIl3aMeZwi/krWrIsgBJ\n6g6dUIQwHwYDVR0jBBgwFoAUXIl3aMeZwi/krWrIsgBJ6g6dUIQwDwYDVR0TAQH/\nBAUwAwEB/zA8BgNVHREENTAzhjFodHRwczovL21hbmlmZXN0LmludGVybmFsL3Nw\nL2N3bC02NTEzNzA5YS9zdGFnaW5nMA0GCSqGSIb3DQEBCwUAA4ICAQC8iuV6yFcI\nesWiWonWxDdB/ygHxkdXjLm5/RbLfr7N/hsyD4wx1UheFKRflN5c7to/v06nJEUt\np3se+T4BafDkTM92ytsgOm2Iu+R4g5EvRqQmMJF7ayyimArIy98DDjrURzNGSJmA\nbsqlTreK10J8KQtEJK3tF85SnBUrXapvKs66LP6bdXFXSIYy+iYgxkiLx6ya2jmZ\nAx+9pWHC+K8d8+rcEoUq/pgMgxfkChoJBArjiAwOuZbrx6m2AYDtMbL2FK0+njyQ\nrO7I1dSCW/tgiM4td69AFw5M08SCGx3HGrz7xG6r45huL2Nk/cWpxUjzVPyo7X4c\nSkvWPO1oJ/qDTdW3UJtmxH/dM9wySpcvmgGMn7dNt4PjXq+dHdKv52gYSU9XAKBu\nsIfMW82y0QIPszGjayFiB4awNhvQ4kf/5Shgv0p2/Dg6ddlxzvttRXdoWE9z9dGi\nqsIKTXGQNGiQERNbaHe/Z6ImnllIoBmVszw5GUUk7qb+cE7RVSJFbFTOoPeFvcoE\npqPySUQBbLULxZQR7WVQuRvkmsC72UxxDdqLi4FpOE1grsv+ksF1WYbA2eviWpZQ\nyWyLHENez758GdX2LjiNMBOLNF4YCqDaucQ8IZbxq6cgZcPqKjoVe+/ENbSOBdEK\n8Rz3oeLFdUGWGyfqge/5EJld/wslALvlyQ==</ds:X509Certificate>\n        </ds:X509Data>\n      </ds:KeyInfo>\n      <md:EncryptionMethod Algorithm="http://www.w3.org/2009/xmlenc11#aes128-gcm"/>\n      <md:EncryptionMethod Algorithm="http://www.w3.org/2009/xmlenc11#aes256-gcm"/>\n      <md:EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes256-cbc"/>\n    </md:KeyDescriptor>\n\n    <md:SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://cwl-6513709a.staging.manifest.internal/auth/logout"/>\n\n    <md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://cwl-6513709a.staging.manifest.internal/auth/ubcshib/callback" index="1" isDefault="true"/>\n  </md:SPSSODescriptor>\n\n  <md:Organization>\n    <md:OrganizationName>University of British Columbia</md:OrganizationName>\n    <md:OrganizationDisplayName>University of British Columbia</md:OrganizationDisplayName>\n    <md:OrganizationURL>https://www.ubc.ca</md:OrganizationURL>\n  </md:Organization>\n\n  <md:ContactPerson contactType="technical">\n    <md:EmailAddress>bio_prof@example.ubc.ca</md:EmailAddress>\n  </md:ContactPerson>\n  <md:ContactPerson contactType="support">\n    <md:EmailAddress>platform_admin@example.ubc.ca</md:EmailAddress>\n  </md:ContactPerson>\n\n</md:EntityDescriptor>\n',
      warnings: [],
    },
    createdAt: '2026-10-01T15:37:23.114Z',
    updatedAt: '2026-10-01T15:37:23.131Z',
  },
  privacyAssessment: {
    id: '4607e4d8-b73d-467f-86e2-048642d183d7',
    projectId: '72bc6c0a-bf2b-4b4f-8165-bc86227cd46d',
    state: 'approved',
    reviewer: 'K. Privacy',
    approvedAt: '2026-10-01T15:37:22.363Z',
    externalTicketRef: 'PIA-2026-0088',
    submittedAt: '2026-10-01T15:37:22.354Z',
    submittedBy: {
      id: 'c4113a47-bf3c-4653-9260-ca723416fdc6',
      displayName: 'Platform Admin',
    },
    createdAt: '2026-10-01T15:37:22.353Z',
    updatedAt: '2026-10-01T15:37:22.363Z',
  },
} satisfies z.input<typeof LaunchRecords>
