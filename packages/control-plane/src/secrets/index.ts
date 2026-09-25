export {
  generateMasterKeypair,
  openSecret,
  rewrapSecret,
  sealSecret,
  SecretError,
  sodiumReady,
  type MasterKeypair,
  type SecretEnvelope,
} from './envelope.js'
export {
  createAppSecrets,
  deleteSecret,
  ensureSessionSecret,
  getSecret,
  loadMasterKeypair,
  putSecret,
  secretValuesFor,
  type AppSecretResolver,
  type EnvironmentKind,
  type Secret,
  type SecretScope,
} from './store.js'
export { SECRET_ENV_NAMES, scrubSecretEnv } from './scrub.js'
export { assertOwnerOnly } from './custody.js'
