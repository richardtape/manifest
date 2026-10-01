import type { z } from 'zod/v4'
import type {
  IamRegistration,
  LaunchRecords,
  PrivacyAssessment,
  PrivacyAssessmentDraft,
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
    draft: null,
    createdAt: '2026-10-01T15:37:22.353Z',
    updatedAt: '2026-10-01T15:37:22.363Z',
  },
} satisfies z.input<typeof LaunchRecords>

/**
 * THE PRIVACY ASSESSMENT'S EXAMPLES (the launch path plan's Task 11), CAPTURED from one flow through the
 * routes: a CWL app with a database, a model and an outside host; its owner drafts the assessment
 * (`draftPrivacyAssessment`), says it was sent naming that draft (`submitPrivacyAssessment`), and an
 * administrator records it approved (`recordPrivacyAssessment`). One draft, kept as it was sent — so the
 * three share it. Captured in the unit tier with its runtime driver NAMED `docker`, so the hosting row
 * says what a deployment's says (sitting 8's whole-branch review, M4).
 */
const ASSESSMENT_DRAFT = {
  project: {
    slug: 'cwl-0bcfc989',
    name: 'cwl-0bcfc989',
  },
  generatedAt: '2026-10-01T18:03:26.508Z',
  fromCommit: '7d394009ba57cc955f8273581182e1090925a8a6',
  sections: [
    {
      id: 'collected',
      title: 'What personal information the app collects',
      facts: [
        {
          label: 'ubcEduCwlPuid',
          value:
            'Identifies the person who signs in, so the app can recognise them when they return and keep their work apart from everyone else’s.',
          source: 'manifest.yaml: auth.attributes',
        },
        {
          label: 'mail',
          value: 'The person’s email address, so the app can show it or write to them.',
          source: 'manifest.yaml: auth.attributes',
        },
      ],
      gaps: [
        'What the app keeps in its own database — the records it stores about the people who use it, beyond what CWL releases. Manifest cannot see inside the app’s data: describe it here.',
      ],
    },
    {
      id: 'stored',
      title: 'Where it is stored',
      facts: [
        {
          label: 'db',
          value:
            'A mongo database, version 7, which Manifest runs for the app — one in each environment.',
          source: 'manifest.yaml: services',
        },
        {
          label: 'Sandbox',
          value:
            'Where the app is built and tried: its own copy of each database, never backed up.',
          source: 'Manifest’s environments',
        },
        {
          label: 'Staging',
          value:
            'Where the app is tested before launch: its own copy of each database, never backed up.',
          source: 'Manifest’s environments',
        },
        {
          label: 'Production',
          value:
            'Where people use the app: its own copy of each database, not backed up on this platform yet.',
          source: 'Manifest’s environments',
        },
        {
          label: 'Incident logs',
          value:
            'When a deploy of the app fails, Manifest keeps the last 200 lines of the app’s output with the Incident, with secrets removed. They can include what the app printed about the people using it.',
          source: 'the platform',
        },
      ],
      gaps: [
        'Whether this assessment covers the app’s use at staging by real people — colleagues and students signing in to test it — or staging needs cover of its own, is a question for the Privacy Office that is not yet answered: ask it.',
      ],
    },
    {
      id: 'flows',
      title: 'Where it flows',
      facts: [
        {
          label: 'Classification',
          value:
            'Internal — every AI model the app uses must be approved for internal data.',
          source: 'manifest.yaml: data.classification',
        },
        {
          label: 'api.ubc.ca',
          value: 'The app may send data to api.ubc.ca, outside the platform.',
          source: 'manifest.yaml: egress.allow',
        },
        {
          label: 'default-chat',
          value:
            'Approved for internal data at most: it may be answered by a provider off-premise, so what the app sends it may leave UBC.',
          source: 'manifest.yaml: ai.models; the model catalogue',
        },
      ],
      gaps: [],
    },
    {
      id: 'retention',
      title: 'How long it is kept, and how it is disposed of',
      facts: [
        {
          label: 'How long',
          value: 'The manifest says the app keeps its data for 365 days.',
          source: 'manifest.yaml: data.retention_days',
        },
        {
          label: 'Deletion',
          value:
            'Manifest deletes nothing it keeps for the app on a schedule — neither its databases nor its Incident logs. A project that never launched can be deleted, which destroys its databases; one that has launched cannot be deleted yet.',
          source: 'the platform',
        },
      ],
      gaps: [
        'How the app removes its data once it is older than 365 days — Manifest does not remove it for the app.',
        'How the app’s data is disposed of when the app is retired follows UBC’s sunset procedure, which the Privacy Office has not set out yet: say what should happen to it.',
      ],
    },
    {
      id: 'accountable',
      title: 'Who is accountable',
      facts: [
        {
          label: 'Owner',
          value: 'Bio Prof <bio_prof@example.ubc.ca>',
          source: 'the project’s members',
        },
        {
          label: 'Platform contact',
          value: 'Platform Admin <platform_admin@example.ubc.ca>',
          source: 'the platform’s contacts',
        },
      ],
      gaps: [
        'Who responds if the app’s data is breached, and how the people affected are told, is not yet set at UBC — the Privacy Office’s procedure is still to come: say who answers for this app meanwhile.',
      ],
    },
    {
      id: 'hosting',
      title: 'Hosting and jurisdiction',
      facts: [
        {
          label: 'Where the app runs',
          value:
            'In containers on the machine Manifest runs on, under its Docker driver.',
          source: 'the platform’s runtime driver',
        },
        {
          label: 'Where its code is kept',
          value: 'In a repository on the machine Manifest runs on.',
          source: 'the project’s repository',
        },
        {
          label: 'default-chat',
          value: 'Approved for internal data at most.',
          source: 'the model catalogue',
        },
      ],
      gaps: [
        'Where UBC will host the app in production is not decided yet: UBC has not chosen the infrastructure Manifest runs on there.',
        'Whether the app’s internal data may reach an AI provider outside Canada is the Privacy Office’s to say: default-chat may be answered off-premise.',
      ],
    },
  ],
  warnings: [
    'Nothing is serving staging yet, so this is drawn from the newest valid manifest. The assessment should describe the release you will launch: once it serves staging, draft this again.',
  ],
  text: 'Privacy impact assessment — draft\ncwl-0bcfc989 (cwl-0bcfc989)\nDrafted by Manifest on October 1, 2026, from commit 7d394009ba57.\n\nBefore you send this:\n  - Nothing is serving staging yet, so this is drawn from the newest valid manifest. The assessment should describe the release you will launch: once it serves staging, draft this again.\n\n1. What personal information the app collects\n  - ubcEduCwlPuid: Identifies the person who signs in, so the app can recognise them when they return and keep their work apart from everyone else’s. (from manifest.yaml: auth.attributes)\n  - mail: The person’s email address, so the app can show it or write to them. (from manifest.yaml: auth.attributes)\n  For you to add:\n  - What the app keeps in its own database — the records it stores about the people who use it, beyond what CWL releases. Manifest cannot see inside the app’s data: describe it here.\n\n2. Where it is stored\n  - db: A mongo database, version 7, which Manifest runs for the app — one in each environment. (from manifest.yaml: services)\n  - Sandbox: Where the app is built and tried: its own copy of each database, never backed up. (from Manifest’s environments)\n  - Staging: Where the app is tested before launch: its own copy of each database, never backed up. (from Manifest’s environments)\n  - Production: Where people use the app: its own copy of each database, not backed up on this platform yet. (from Manifest’s environments)\n  - Incident logs: When a deploy of the app fails, Manifest keeps the last 200 lines of the app’s output with the Incident, with secrets removed. They can include what the app printed about the people using it. (from the platform)\n  For you to add:\n  - Whether this assessment covers the app’s use at staging by real people — colleagues and students signing in to test it — or staging needs cover of its own, is a question for the Privacy Office that is not yet answered: ask it.\n\n3. Where it flows\n  - Classification: Internal — every AI model the app uses must be approved for internal data. (from manifest.yaml: data.classification)\n  - api.ubc.ca: The app may send data to api.ubc.ca, outside the platform. (from manifest.yaml: egress.allow)\n  - default-chat: Approved for internal data at most: it may be answered by a provider off-premise, so what the app sends it may leave UBC. (from manifest.yaml: ai.models; the model catalogue)\n\n4. How long it is kept, and how it is disposed of\n  - How long: The manifest says the app keeps its data for 365 days. (from manifest.yaml: data.retention_days)\n  - Deletion: Manifest deletes nothing it keeps for the app on a schedule — neither its databases nor its Incident logs. A project that never launched can be deleted, which destroys its databases; one that has launched cannot be deleted yet. (from the platform)\n  For you to add:\n  - How the app removes its data once it is older than 365 days — Manifest does not remove it for the app.\n  - How the app’s data is disposed of when the app is retired follows UBC’s sunset procedure, which the Privacy Office has not set out yet: say what should happen to it.\n\n5. Who is accountable\n  - Owner: Bio Prof <bio_prof@example.ubc.ca> (from the project’s members)\n  - Platform contact: Platform Admin <platform_admin@example.ubc.ca> (from the platform’s contacts)\n  For you to add:\n  - Who responds if the app’s data is breached, and how the people affected are told, is not yet set at UBC — the Privacy Office’s procedure is still to come: say who answers for this app meanwhile.\n\n6. Hosting and jurisdiction\n  - Where the app runs: In containers on the machine Manifest runs on, under its Docker driver. (from the platform’s runtime driver)\n  - Where its code is kept: In a repository on the machine Manifest runs on. (from the project’s repository)\n  - default-chat: Approved for internal data at most. (from the model catalogue)\n  For you to add:\n  - Where UBC will host the app in production is not decided yet: UBC has not chosen the infrastructure Manifest runs on there.\n  - Whether the app’s internal data may reach an AI provider outside Canada is the Privacy Office’s to say: default-chat may be answered off-premise.\n',
} satisfies z.input<typeof PrivacyAssessmentDraft>

/** `draftPrivacyAssessment`: the owner's first draft. */
export const ASSESSMENT_DRAFTED_EXAMPLE = {
  id: '7eb7baa8-5a73-4f0e-a57f-7e776e40419f',
  projectId: '0429adab-74d1-45eb-81fe-44de4829ee63',
  state: 'draft',
  reviewer: null,
  approvedAt: null,
  externalTicketRef: null,
  submittedAt: null,
  submittedBy: null,
  draft: ASSESSMENT_DRAFT,
  createdAt: '2026-10-01T18:03:26.518Z',
  updatedAt: '2026-10-01T18:03:26.518Z',
} satisfies z.input<typeof PrivacyAssessment>

/** `submitPrivacyAssessment`'s request: the PIA number, and the draft the person read. */
export const ASSESSMENT_SUBMIT_REQUEST_EXAMPLE = {
  reference: 'PIA-2026-0101',
  draftGeneratedAt: '2026-10-01T18:03:26.508Z',
} satisfies z.input<typeof SubmitLaunchRecordRequest>

/** `submitPrivacyAssessment`: the assessment, now submitted — the draft kept as it was sent. */
export const ASSESSMENT_SUBMITTED_EXAMPLE = {
  id: '7eb7baa8-5a73-4f0e-a57f-7e776e40419f',
  projectId: '0429adab-74d1-45eb-81fe-44de4829ee63',
  state: 'submitted',
  reviewer: null,
  approvedAt: null,
  externalTicketRef: 'PIA-2026-0101',
  submittedAt: '2026-10-01T19:00:00.000Z',
  submittedBy: {
    id: '7fdf38c3-b751-4bb0-8199-dbec140b0a9e',
    displayName: 'Bio Prof',
  },
  draft: ASSESSMENT_DRAFT,
  createdAt: '2026-10-01T18:03:26.518Z',
  updatedAt: '2026-10-01T18:03:26.536Z',
} satisfies z.input<typeof PrivacyAssessment>

/** `recordPrivacyAssessment`: an administrator records the Privacy Office's approval. */
export const ASSESSMENT_APPROVED_EXAMPLE = {
  id: '7eb7baa8-5a73-4f0e-a57f-7e776e40419f',
  projectId: '0429adab-74d1-45eb-81fe-44de4829ee63',
  state: 'approved',
  reviewer: 'K. Privacy',
  approvedAt: '2026-10-01T18:03:26.544Z',
  externalTicketRef: 'PIA-2026-0101',
  submittedAt: '2026-10-01T19:00:00.000Z',
  submittedBy: {
    id: '7fdf38c3-b751-4bb0-8199-dbec140b0a9e',
    displayName: 'Bio Prof',
  },
  draft: ASSESSMENT_DRAFT,
  createdAt: '2026-10-01T18:03:26.518Z',
  updatedAt: '2026-10-01T18:03:26.544Z',
} satisfies z.input<typeof PrivacyAssessment>
