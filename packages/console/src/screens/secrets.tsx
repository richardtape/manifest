import { useRef, useState, type FormEvent } from 'react'
import type { Schemas } from '@manifest/contract'
import type { Api } from '../api'
import { stepUpUrl } from '../auth'
import { Instant, Field, Panel, Pill, Refusal, useAsync } from '../ui'

/**
 * AN APP'S DECLARED SECRETS, PER ENVIRONMENT (the authoring API plan's Task 10, over its Task
 * 8) — the console's caller of `listAppSecrets`, `setAppSecret` and `clearAppSecret`.
 *
 * **WRITE-ONLY, AND THIS SCREEN KEEPS IT SO** (Decision 13). No operation answers a value, so
 * there is none to show; the value a person types lives in its input and nowhere else — never
 * a URL, never storage, never a `console.log` — and **the input is emptied the moment the
 * platform accepts it**, so a set value is never put back on screen. A refused set keeps what
 * was typed, so the person can correct it; a step-up round trip is a full-page navigation, and
 * the value goes with the page.
 *
 * WHAT A PERSON NEEDS TO READ, as the platform answers it: a declared name with no value stops
 * the NEXT deploy of that environment (`409 RELEASE_SECRET_NOT_SET`), and a name set but not
 * declared is stored and never given to the app. A value takes effect at the next deploy;
 * setting one redeploys nothing.
 */
export function Secrets({ api, projectId }: { api: Api; projectId: string }) {
  const environments = useAsync(() => api.listEnvironments(projectId), [projectId])
  return (
    <>
      <Refusal error={environments.error} />
      {(environments.value ?? []).map((environment) => (
        <EnvironmentSecrets key={environment.id} api={api} environment={environment} />
      ))}
    </>
  )
}

function EnvironmentSecrets({
  api,
  environment,
}: {
  api: Api
  environment: Schemas['EnvironmentList'][number]
}) {
  const list = useAsync(() => api.listAppSecrets(environment.id), [environment.id])
  // What the person just did, in words — the list re-read is what says where it stands.
  const [done, setDone] = useState<string | undefined>(undefined)
  const changed = (sentence: string) => {
    setDone(sentence)
    list.reload()
  }
  const secrets = list.value?.secrets ?? []

  return (
    <Panel title={`Secrets — ${environment.kind}`}>
      {environment.kind === 'production' && (
        // §20 AND SPEC ACTION 2: production's values are a stepped-up person's alone. The
        // refusal carries the same link (`<Refusal>`); offering it FIRST saves a person typing
        // a value that the round trip would then take away.
        <p className="hint">
          A production value is set only by a person who has confirmed it is them in the
          last ten minutes, and never by a token.{' '}
          <a href={stepUpUrl(window.location.pathname + window.location.search)}>
            Confirm it is you
          </a>{' '}
          before setting one.
        </p>
      )}
      <Refusal error={list.error} />
      {list.value !== undefined && secrets.length === 0 && (
        <p>manifest.yaml declares no secret for {environment.kind}, and none is set.</p>
      )}
      <ul className="secrets">
        {secrets.map((secret) => (
          <SecretRow
            key={secret.name}
            api={api}
            environment={environment}
            secret={secret}
            onChanged={changed}
          />
        ))}
      </ul>
      {done !== undefined && <p className="ok">{done}</p>}
      <NewSecret api={api} environment={environment} onChanged={changed} />
    </Panel>
  )
}

/**
 * ONE NAME: whether it is declared, whether it is set, and Set / Clear. The key for each is
 * made once per action (D23.6) and a new one when the value changes, so a retried Set of the
 * same value is one action and a different value is another — without keeping the value
 * anywhere but its input.
 */
function SecretRow({
  api,
  environment,
  secret,
  onChanged,
}: {
  api: Api
  environment: Schemas['EnvironmentList'][number]
  secret: Schemas['AppSecretStatus']
  onChanged: (sentence: string) => void
}) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(undefined)
  const setKey = useRef<string | undefined>(undefined)
  const clearKey = useRef<string | undefined>(undefined)

  async function set(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      setKey.current ??= api.newKey()
      await api.setAppSecret(environment.id, secret.name, { value }, setKey.current)
      setValue('')
      setKey.current = undefined
      onChanged(
        `${secret.name} is set for ${environment.kind} — it takes effect at the next deploy.`,
      )
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  async function clear() {
    setBusy(true)
    setError(undefined)
    try {
      clearKey.current ??= api.newKey()
      await api.clearAppSecret(environment.id, secret.name, clearKey.current)
      clearKey.current = undefined
      onChanged(`${secret.name} is cleared for ${environment.kind}.`)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <li>
      <code>{secret.name}</code>{' '}
      <Pill tone={secret.declared ? 'plain' : 'bad'}>
        {secret.declared ? 'declared' : 'not declared'}
      </Pill>{' '}
      {secret.set ? <Pill tone="good">set</Pill> : <Pill tone="bad">not set</Pill>}{' '}
      {secret.updatedAt !== null && (
        <span className="hint">
          changed <Instant at={secret.updatedAt} />
        </span>
      )}
      <br />
      <span className="hint">
        {secret.declared && !secret.set
          ? `The next deploy of ${environment.kind} will be refused until this has a value.`
          : !secret.declared
            ? 'Stored, and never given to the app: manifest.yaml does not declare it.'
            : 'The app is given this at its next deploy of this environment.'}
      </span>
      <form onSubmit={set}>
        <input
          type="password"
          autoComplete="off"
          aria-label={`New value for ${secret.name}`}
          value={value}
          onChange={(e) => {
            setKey.current = undefined
            setValue(e.target.value)
          }}
          placeholder="new value"
        />{' '}
        <button disabled={busy || value === ''}>Set</button>{' '}
        {secret.set && (
          <button type="button" disabled={busy} onClick={() => void clear()}>
            Clear
          </button>
        )}
      </form>
      <Refusal error={error} />
    </li>
  )
}

/**
 * A NAME THE LIST DOES NOT HAVE YET. A value may be set before manifest.yaml declares its
 * name — an owner often sets a key first — and is given to the app only once it is declared.
 * Whether the NAME is acceptable is the platform's to say: `400 REQUEST_INVALID` for its
 * shape, `400 SECRET_NAME_RESERVED` for one the platform sets itself (§8).
 */
function NewSecret({
  api,
  environment,
  onChanged,
}: {
  api: Api
  environment: Schemas['EnvironmentList'][number]
  onChanged: (sentence: string) => void
}) {
  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(undefined)
  const key = useRef<string | undefined>(undefined)

  async function set(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      key.current ??= api.newKey()
      await api.setAppSecret(environment.id, name, { value }, key.current)
      setValue('')
      setName('')
      key.current = undefined
      onChanged(
        `${name} is set for ${environment.kind} — it reaches the app once manifest.yaml declares it, at the next deploy.`,
      )
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={set} className="new-secret">
      <Field label="Another name">
        <input
          value={name}
          onChange={(e) => {
            key.current = undefined
            setName(e.target.value)
          }}
          placeholder="SIS_API_KEY"
          aria-label="Secret name"
        />{' '}
        <input
          type="password"
          autoComplete="off"
          value={value}
          onChange={(e) => {
            key.current = undefined
            setValue(e.target.value)
          }}
          placeholder="value"
          aria-label="Secret value"
        />{' '}
        <button disabled={busy || name === '' || value === ''}>Set</button>
      </Field>
      <Refusal error={error} />
    </form>
  )
}
