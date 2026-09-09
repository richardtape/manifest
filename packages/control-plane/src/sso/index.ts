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
  deriveSpEntity,
  SpEntityError,
  type SpEntity,
  type SpEntityInput,
} from './entity.js'
export {
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
  type SpMetadataRow,
} from './metadata-store.js'
export {
  createSsoRegistrar,
  registerServiceProvider,
  type SpRegistration,
  type SpRegistrationInput,
  type SsoRegistrar,
} from './registration.js'
