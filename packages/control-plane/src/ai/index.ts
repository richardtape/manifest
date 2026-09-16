export { AI_CODES, AiError, mapLiteLlmError } from './errors.js'
export { AiConfigError, createLiteLlmClient } from './client.js'
export type { LiteLlmClient } from './client.js'
export {
  CATALOGUE_CODES,
  CatalogueError,
  createCatalogueCache,
  disabledCatalogue,
  loadModelCatalogue,
} from './catalogue.js'
export type { CatalogueSnapshot, ModelCatalogue, ModelEntry } from './catalogue.js'
export {
  AI_ALLOWED_ROUTES,
  aiUserId,
  createAiKeyService,
  disabledAiKeyService,
  discardAppKey,
  ensureAiUser,
  instanceKeySecretName,
  mintAppKey,
  revokeInstanceKey,
  revokeLegacyAppKey,
  storeInstanceKey,
} from './keys.js'
export type { AiKeyService, InstanceKeyScope, MintAppKeyInput } from './keys.js'
