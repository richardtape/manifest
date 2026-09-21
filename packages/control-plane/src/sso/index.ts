/**
 * `sso/` — the Service Provider registration §9 describes.
 *
 * The identity path was proved end to end first (Task 3), against a hand-written
 * `saml20_sp_remote` row; this module is the code that produces such a row
 * automatically. Every origin in it is derived by Manifest — §9: *"A free-text
 * ACS URL is an assertion-phishing primitive."*
 */
export { SsoError } from './errors.js'
export {
  ATTRIBUTE_OIDS,
  friendlyAttributeName,
  type FriendlyAttributeName,
} from './attributes.js'
export {
  createCwlSignInProbe,
  SAML_LOGIN_HOPS,
  type CwlSignInInput,
  type CwlSignInProbe,
  type CwlSignInProbeOptions,
  type CwlSignInResult,
} from './sign-in.js'
export {
  deriveSpEntity,
  SpEntityError,
  type SpEntity,
  type SpEntityInput,
} from './entity.js'
export {
  describeKeypair,
  ensureSpKeypair,
  mintSpKeypair,
  type SpKeypair,
  type SpKeypairScope,
} from './keypair.js'
export {
  createIdpPool,
  deleteSpRow,
  readSpRow,
  renderSpMetadata,
  upsertSpRow,
  SP_NAME_ID_FORMAT,
  type SpMetadataRow,
} from './metadata-store.js'
export {
  controlPlaneSpEntity,
  registerControlPlaneSp,
  CONTROL_PLANE_ATTRIBUTES,
  CONTROL_PLANE_ENVIRONMENT,
  CONTROL_PLANE_SLUG,
  type ControlPlaneSpInput,
} from './platform.js'
export {
  createSsoRegistrar,
  registerServiceProvider,
  type SpRegistration,
  type SpRegistrationInput,
  type SsoRegistrar,
} from './registration.js'
