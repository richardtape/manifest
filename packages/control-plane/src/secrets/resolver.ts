import type { Db } from '../db/index.js'
import { appEnvSecretValues, setAppSecret } from './app-env.js'
import type { MasterKeypair } from './envelope.js'
import { ensureSessionSecret, secretValuesFor, type EnvironmentKind } from './store.js'

/**
 * `ensureSessionSecret` with the master keypair already bound.
 *
 * `releases/` holds a resolver rather than key material, exactly as it does for
 * service credentials and for the SP registrar — three bound objects, none of
 * which lets the module that deploys read the secret store directly.
 */
export interface AppSecretResolver {
  sessionSecret(
    db: Db,
    scope: { projectId: string; environmentKind: EnvironmentKind },
  ): Promise<string>
  /**
   * Every secret stored for one app+environment, as plaintext: the exact-match half of
   * §14's redactor for what `releases/` records about the app — an Incident (P4b Task
   * 13). VALUES, not `secretValuesFor`'s Map: a Map is iterable too, as `[name, value]`
   * pairs, and a redactor built over those matches nothing (P4b sitting 1, divergence 5).
   */
  secretValues(
    db: Db,
    scope: { projectId: string; environmentKind: EnvironmentKind },
  ): Promise<string[]>
  /**
   * The app's OWN declared secrets for one app+environment, by name — what `deployRelease`
   * renders into the app and refuses a deploy without (the authoring API plan's Task 8).
   */
  envSecrets(
    db: Db,
    scope: { projectId: string; environmentKind: EnvironmentKind },
  ): Promise<Map<string, string>>
  /**
   * Stores one of them, and answers when its value last changed — for the route, which holds
   * this resolver and never the keypair (Task 8). Nothing answers a value back.
   */
  setEnvSecret(
    db: Db,
    scope: { projectId: string; environmentKind: EnvironmentKind },
    name: string,
    value: string,
  ): Promise<Date>
}

export function createAppSecrets(keys: MasterKeypair): AppSecretResolver {
  return {
    sessionSecret: (db, scope) => ensureSessionSecret(db, scope, keys),
    secretValues: async (db, scope) => [
      ...(await secretValuesFor(db, scope, keys)).values(),
    ],
    envSecrets: (db, scope) => appEnvSecretValues(db, keys, scope),
    setEnvSecret: (db, scope, name, value) => setAppSecret(db, keys, scope, name, value),
  }
}
