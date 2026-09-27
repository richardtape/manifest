# Secrets

How an app gets a credential it needs — an API key, a password — without it ever being in its code: declared by name in manifest.yaml, its value set per environment through the API, and given to the app at deploy. For a developer building a settings screen and for an agent whose app needs a key.

## Declare it

A secret is declared in manifest.yaml by its name, with `secret: true` and no value:

```yaml
env:
  - name: SIS_API_KEY
    secret: true
```

A name is upper case, digits and underscores, at most 128 characters, and not one the platform sets itself for every app (`400 SECRET_NAME_RESERVED` names it). An entry under `environments.<kind>.env` declares it for that environment alone.

## Set its value, per environment

`setAppSecret` sets the value of one name in one environment — sandbox, staging or production:

<!-- example: example-secret -->

```ts
import { createManifestClient, idempotencyKey, unwrap } from '@manifest/contract'

/**
 * Set the value of a secret the app declares in manifest.yaml (`env: - { name: SIS_API_KEY,
 * secret: true }`) for its staging environment. The value is never answered back — the list
 * says only which names are declared and which are set — and it takes effect at the next deploy.
 */
export async function setStagingSecret(
  origin: string,
  token: string,
  projectId: string,
  name: string,
  value: string,
): Promise<{ declared: boolean; set: boolean }> {
  const client = createManifestClient({ origin, token })
  const environments = unwrap(
    await client.GET('/v1/projects/{projectId}/environments', {
      params: { path: { projectId } },
    }),
    'listEnvironments',
  )
  const staging = environments.find((e) => e.kind === 'staging')
  if (staging === undefined) throw new Error('every project has a staging environment')
  unwrap(
    await client.PUT('/v1/environments/{environmentId}/secrets/{name}', {
      params: {
        path: { environmentId: staging.id, name },
        header: { 'Idempotency-Key': idempotencyKey() },
      },
      body: { value },
    }),
    'setAppSecret',
  )
  const list = unwrap(
    await client.GET('/v1/environments/{environmentId}/secrets', {
      params: { path: { environmentId: staging.id } },
    }),
    'listAppSecrets',
  )
  const status = list.secrets.find((s) => s.name === name)
  return { declared: status?.declared ?? false, set: status?.set ?? false }
}
```

<!-- /example -->

- **A value is never read back.** No operation answers one. `listAppSecrets` answers each name the environment declares or has set, with whether it is `declared`, whether it is `set`, and when it was.
- **At least six characters, at most 16 KiB of UTF-8**, with no NUL. A shorter value could not be kept out of the app’s incident logs, so it is refused (`400 REQUEST_INVALID`).
- **It takes effect at the next deploy.** Setting a value redeploys nothing; clearing one (`clearAppSecret`) leaves a running instance its value until that environment’s next deploy.
- **A value may be set before the name is declared** — an owner often sets a key first — and only a declared name is ever given to the app.
- **A retried `PUT` with the same `Idempotency-Key` is answered as the first.**

## Production is a person’s

A delegated token holding `secret:write` sets sandbox and staging values. **A production value is set only by a person, in their own session, who has signed in again within ten minutes** (`STEP_UP_REQUIRED`); a token is refused it outright (`403 TOKEN_CREDENTIAL_REFUSED`).

## A deploy refuses what it cannot give the app

A deploy of a release whose manifest declares a secret with no value in that environment is refused **`409 RELEASE_SECRET_NOT_SET`**, naming the names — never a value — and nothing starts. Set the value and deploy again. A value that is set reaches the app as an environment variable of that name, and is removed from anything the platform records about the app’s failures.
