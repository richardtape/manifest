import {
  ATTRIBUTE_OIDS,
  renderRegistrationMetadata,
  type Contact,
  type SpCertificate,
} from '../sso/index.js'
import type { RegistrationEnvironment } from './records.js'
import type { AttributeUse } from './usage.js'

/**
 * D19'S REGISTRATION PACKAGE (§9 as Spec action 4 applied it; the launch path plan's Task 10,
 * Decisions 11–15): what a person sends UBC IAM to register one environment of a CWL app — derived,
 * every value, so a faculty member reviews and sends rather than authors from nothing:
 *
 *  - the entity id, ACS and SLO the platform derives for the environment (D15);
 *  - the certificate Manifest issued for it (D20) — never its private key;
 *  - each attribute the app asks for, with its PURPOSE and THE LINES THAT READ IT, and a flag on one
 *    the code never reads, so it is removed before it is asked for;
 *  - the contacts: the owner and the collaborators, and the platform's;
 *  - the privacy assessment's reference, the PIA number UBC IAM asks for;
 *  - the SP metadata in UBC's structure, rendered from those same values (`sso/registration-xml.ts`).
 *
 * **A JUSTIFICATION IS DERIVED, NEVER WRITTEN BY A MODEL** (Decision 13): a stock purpose and the lines
 * found. A document sent to UBC is no place for prose that can be wrong, and no budget is spent.
 */

/**
 * ONE PLAIN SENTENCE FOR EACH ATTRIBUTE THE BRIDGE KNOWS — what a faculty member cannot write unaided
 * (§9), in words a reviewer outside the project reads. Keyed by `sso/attributes.ts`'s table, so a name
 * added there without a purpose here is a `tsc` error.
 */
export const ATTRIBUTE_PURPOSES: Readonly<Record<keyof typeof ATTRIBUTE_OIDS, string>> = {
  ubcEduCwlPuid:
    'Identifies the person who signs in, so the app can recognise them when they return and keep their work apart from everyone else’s.',
  mail: 'The person’s email address, so the app can show it or write to them.',
  givenName:
    'The person’s first name, so the app can greet them and show who wrote what.',
  sn: 'The person’s last name, shown with their first name so people can tell each other apart.',
  eduPersonAffiliation:
    'Whether the person is a student, faculty or staff, so the app can decide what they may see and do.',
  eduPersonPrincipalName:
    'The person’s UBC-scoped sign-in name, for an app that must match people with another UBC system.',
  uid: 'The person’s CWL login name, for an app that must match people with another UBC system.',
}

/** A name the bridge does not know cannot pass the manifest's own check; said honestly if one does. */
const UNKNOWN_PURPOSE =
  'An attribute Manifest has no description of: say in the request why the app needs it.'

/** The organisation every UBC registration names — `saml-metadata-generator`'s own default. */
export const UBC_ORGANIZATION = {
  name: 'University of British Columbia',
  displayName: 'University of British Columbia',
  url: 'https://www.ubc.ca',
} as const

/** Decision 14's bound, applied by the caller and stated in the package when it was reached. */
export const SEARCH_BOUND = { files: 200, bytes: 2 * 1024 * 1024 } as const

export interface PackageAttribute {
  name: string
  oid: string
  purpose: string
  usedAt: AttributeUse[]
  justification: string
  unused: boolean
}

export interface RegistrationPackage {
  environment: RegistrationEnvironment
  /** When Manifest drafted it — the earliest day a person can have sent it. */
  generatedAt: string
  /** The commit whose `manifest.yaml` and code it was drawn from. */
  fromCommit: string
  entityId: string
  acsUrl: string
  sloUrl: string
  certificate: { pem: string; fingerprint: string; expiresAt: string }
  attributes: PackageAttribute[]
  usedAtTruncated: boolean
  contacts: { technical: Contact[]; support: Contact[] }
  /** The PIA number, when the privacy assessment has one recorded. */
  privacyAssessmentReference: string | null
  metadataXml: string
  warnings: string[]
}

export interface PackageInput {
  environment: RegistrationEnvironment
  generatedAt: Date
  fromCommit: string
  entity: {
    entityId: string
    acsUrl: string
    sloUrl: string
    attributes: readonly string[]
  }
  certificate: SpCertificate
  uses: Record<string, AttributeUse[]>
  usedAtTruncated: boolean
  contacts: { technical: Contact[]; support: Contact[] }
  privacyAssessmentReference: string | null
  /** What the caller knows the package must say — production drawn without a candidate. First. */
  warnings: string[]
}

/** `a, b, c, d and e, and 2 more places` — the first five, then how many more. */
function places(uses: readonly AttributeUse[]): string {
  const shown = uses.slice(0, 5).map((u) => `${u.path}:${u.line}`)
  const listed =
    shown.length === 1
      ? shown[0]!
      : `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]!}`
  const more = uses.length - shown.length
  return more === 0 ? listed : `${listed}, and ${more} more place${more === 1 ? '' : 's'}`
}

/** Served to the browser: a path with a `public` directory in it (`[M9]`'s F12). */
const inBrowser = (use: AttributeUse) => use.path.split('/').includes('public')

const UNREAD =
  'The app asks for it and does not read it anywhere Manifest looked — remove it from `auth.attributes` before you send this.'

function justify(
  purpose: string,
  usedAt: readonly AttributeUse[],
  truncated: boolean,
): string {
  if (usedAt.length === 0)
    return truncated
      ? `${UNREAD} Manifest did not read every file of the app, so look before you remove it.`
      : UNREAD
  const code = usedAt.filter((u) => !inBrowser(u))
  const browser = usedAt.filter(inBrowser)
  const reads = code.length === 0 ? '' : `reads it in ${places(code)}`
  const shows =
    browser.length === 0
      ? ''
      : `shows it to the person in the browser, in ${places(browser)}`
  return `${purpose} The app ${[reads, shows].filter((s) => s !== '').join(', and ')}.`
}

/**
 * The package, from values its caller derived. **Pure**: the caller (`draftIamRegistration`) reads
 * the manifest, the tree, the certificate store and the people; this decides only what the package
 * says about them, so every sentence is held by `package.test.ts` without a database.
 */
export function assemblePackage(input: PackageInput): RegistrationPackage {
  const attributes = input.entity.attributes.map((name): PackageAttribute => {
    const purpose =
      (ATTRIBUTE_PURPOSES as Readonly<Record<string, string>>)[name] ?? UNKNOWN_PURPOSE
    const usedAt = input.uses[name] ?? []
    return {
      name,
      oid: (ATTRIBUTE_OIDS as Readonly<Record<string, string>>)[name] ?? name,
      purpose,
      usedAt,
      justification: justify(purpose, usedAt, input.usedAtTruncated),
      unused: usedAt.length === 0,
    }
  })
  const warnings = [
    ...input.warnings,
    ...attributes
      .filter((a) => a.unused)
      .map(
        (a) =>
          `The app asks for ${a.name} and does not read it anywhere Manifest looked. Remove it from auth.attributes, validate the manifest and draft this again before you send it — UBC IAM asks why an app needs each attribute.`,
      ),
    ...(input.usedAtTruncated
      ? [
          `Manifest searched only part of the app’s code (at most ${SEARCH_BOUND.files} files and 2 MiB), so where an attribute is read in the rest is not shown.`,
        ]
      : []),
    ...(input.privacyAssessmentReference === null
      ? [
          'The privacy assessment’s PIA number is not recorded yet, and UBC IAM asks for it. Once an administrator records the assessment approved with its number, draft this again so the package carries it.',
        ]
      : []),
  ]
  const { entityId, acsUrl, sloUrl } = input.entity
  return {
    environment: input.environment,
    generatedAt: input.generatedAt.toISOString(),
    fromCommit: input.fromCommit,
    entityId,
    acsUrl,
    sloUrl,
    certificate: {
      pem: input.certificate.certificatePem,
      fingerprint: input.certificate.fingerprint,
      expiresAt: input.certificate.expiresAt.toISOString(),
    },
    attributes,
    usedAtTruncated: input.usedAtTruncated,
    contacts: input.contacts,
    privacyAssessmentReference: input.privacyAssessmentReference,
    metadataXml: renderRegistrationMetadata({
      entityId,
      acsUrl,
      sloUrl,
      certificatePem: input.certificate.certificatePem,
      organization: UBC_ORGANIZATION,
      contacts: input.contacts,
    }),
    warnings,
  }
}

/**
 * A STORED PACKAGE, READ BACK — or null for a row with none. `generated_package` is `jsonb`, written
 * only by `draftIamRegistration`, so this checks the fields its readers use rather than trusting a
 * cast: the submission's day (`generatedAt`) and the checklist's comparison (the attributes, the ACS
 * and the SLO).
 */
export function readPackage(value: unknown): RegistrationPackage | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Partial<RegistrationPackage>
  return typeof v.generatedAt === 'string' &&
    typeof v.acsUrl === 'string' &&
    typeof v.sloUrl === 'string' &&
    Array.isArray(v.attributes)
    ? (v as RegistrationPackage)
    : null
}
