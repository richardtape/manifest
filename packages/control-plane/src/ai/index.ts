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
  deleteAppUsers,
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
export {
  agentKeyAlias,
  budgetSpend,
  ensureIntakeBudget,
  ensurePersonBudget,
  INTAKE_AI_USER,
  intakeKeyAlias,
  intakeSpend,
  mintAgentKey,
  mintCappedKey,
  mintIntakeKey,
  personAiUserId,
  personSpend,
  revokeAgentKey,
  revokeIntakeKey,
  revokeKeyByAlias,
} from './agent-keys.js'
export type { BudgetSpend, CappedKeyInput } from './agent-keys.js'
export {
  agentModelsFor,
  classificationFloor,
  environmentFloor,
  type BuilderModels,
} from './models.js'
export {
  appKeysAtBoot,
  countLegacyKeys,
  heldModels,
  withdrawLoweredAppModels,
} from './app-key-sweep.js'
export type { AppKeysAtBoot, AppKeySweep, AppKeySweepDeps } from './app-key-sweep.js'
export {
  CAPABLE_FALLBACK_SETTING,
  CAPABLE_MODEL_NAME,
  CAPABLE_MODEL_SETTING,
  capableModelAtBoot,
  ensureCapableFallback,
  ensureCapableModel,
} from './capable.js'
export type {
  CapableAtBoot,
  CapableFallbackResult,
  CapableModelResult,
} from './capable.js'
export {
  GATEWAY_KEY_ENV,
  GATEWAY_NUM_RETRIES,
  GATEWAY_PREFIX,
  GATEWAY_TIMEOUT_S,
  gatewayKeyRef,
  resolveSetting,
} from './providers.js'
export type { Gateway, ProviderParams } from './providers.js'
export {
  ensureGatewayModels,
  GATEWAY_MODELS_SETTING,
  gatewayModelsAtBoot,
  platformModelsAtBoot,
} from './gateway-models.js'
export type {
  GatewayModel,
  GatewayModelResult,
  GatewayModelsAtBoot,
  PlatformModelsAtBoot,
} from './gateway-models.js'
export {
  AgentSessionError,
  agentSessionById,
  agentSessionsOf,
  cachedPersonSpend,
  endAgentSession,
  endSessionsOf,
  gatewayOf,
  liveSessionsCount,
  narrowSessionsHoldingMore,
  sessionState,
  startAgentSession,
} from './sessions.js'
export type {
  AgentSessionCode,
  AgentSessionDeps,
  AgentSessionRow,
  EndedBy,
  EndReason,
} from './sessions.js'
export {
  endIntakeSession,
  INTAKE_DAY_ZONE,
  intakeSessionById,
  startIntakeSession,
} from './intake.js'
export type { IntakeDeps, IntakeSessionRow } from './intake.js'
