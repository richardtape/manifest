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
export { agentModelsFor, classificationFloor } from './models.js'
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
  AgentSessionError,
  agentSessionById,
  agentSessionsOf,
  cachedPersonSpend,
  endAgentSession,
  endSessionsOf,
  gatewayOf,
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
