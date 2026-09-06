import type { ManifestError } from '../errors/index.js'
import type { ManifestSpec } from '../spec/index.js'
import type { BlueprintDescriptor } from './descriptor.js'

export const BLUEPRINT_CODES = {
  SERVICE_UNSUPPORTED: 'BLUEPRINT_SERVICE_UNSUPPORTED',
  AUTH_UNSUPPORTED: 'BLUEPRINT_AUTH_UNSUPPORTED',
  AI_UNSUPPORTED: 'BLUEPRINT_AI_UNSUPPORTED',
  SCHEMA_VERSION_UNSUPPORTED: 'BLUEPRINT_SCHEMA_VERSION_UNSUPPORTED',
} as const

/**
 * Stage two of validation (§25). Schema validation says the file is well-formed;
 * this says the pinned blueprint can actually deliver what it asks for.
 */
export function checkBlueprintCompatibility(
  spec: ManifestSpec,
  descriptor: BlueprintDescriptor,
): ManifestError[] {
  const errors: ManifestError[] = []
  const ref = `${descriptor.blueprint}@${descriptor.major_version}`

  if (!descriptor.schema_versions.includes(spec.manifest)) {
    errors.push({
      code: BLUEPRINT_CODES.SCHEMA_VERSION_UNSUPPORTED,
      path: 'manifest',
      message: `blueprint ${ref} does not understand manifest schema version ${spec.manifest}`,
      hint: `${ref} understands: ${descriptor.schema_versions.join(', ')}. Pin a blueprint major that supports your schema version.`,
    })
  }

  spec.services.forEach((service, i) => {
    if (!descriptor.provides.services.includes(service.type)) {
      errors.push({
        code: BLUEPRINT_CODES.SERVICE_UNSUPPORTED,
        path: `services.${i}.type`,
        message: `blueprint ${ref} cannot bind service type "${service.type}"`,
        hint: `${ref} supports: ${descriptor.provides.services.join(', ')}.`,
      })
    }
  })

  if (!descriptor.provides.auth_providers.includes(spec.auth.provider)) {
    errors.push({
      code: BLUEPRINT_CODES.AUTH_UNSUPPORTED,
      path: 'auth.provider',
      message: `blueprint ${ref} does not support auth.provider "${spec.auth.provider}"`,
      hint: `${ref} supports: ${descriptor.provides.auth_providers.join(', ')}.`,
    })
  }

  if (spec.ai.models.length > 0 && !descriptor.provides.ai) {
    errors.push({
      code: BLUEPRINT_CODES.AI_UNSUPPORTED,
      path: 'ai.models',
      message: `blueprint ${ref} does not provide AI model access`,
      hint: `Remove ai.models, or pin a blueprint that provides AI.`,
    })
  }

  return errors
}
