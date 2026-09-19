import { useState } from 'react'
import type { Api } from '../api'
import { Field, Panel, Pill, Refusal, useAsync } from '../ui'

/**
 * D25's catalogue. A blueprint is what a project is created FROM (§25), so this screen is
 * the one place a person can read what each one provides before choosing it on the create
 * form — and it is what gives `getBlueprint` and `getKnowledgePack` callers that are not
 * tests (Decision 15's coverage gate, Task 13).
 */
export function Blueprints({ api }: { api: Api }) {
  const list = useAsync(() => api.listBlueprints(), [])
  const [chosen, setChosen] = useState<string | undefined>(undefined)
  return (
    <>
      <Panel title="Blueprints">
        <Refusal error={list.error} />
        {list.value?.length === 0 && <p>This platform offers no blueprints.</p>}
        <ul>
          {(list.value ?? []).map((b) => (
            <li key={b.ref}>
              <button type="button" onClick={() => setChosen(b.ref)}>
                {b.ref}
              </button>{' '}
              {b.name} — {b.language}
            </li>
          ))}
        </ul>
      </Panel>
      {chosen !== undefined && <BlueprintDetail api={api} blueprintRef={chosen} />}
    </>
  )
}

/**
 * Read from `GET /v1/blueprints/{blueprintRef}` rather than from the list already in hand.
 * The list carries the same fields today, and that is exactly why the single-resource route
 * is worth calling: if the list representation is ever narrowed — a catalogue of forty
 * blueprints has no business shipping every starter's summary — this screen keeps working
 * and the route keeps its caller. It never carries the base image or build internals (§25).
 */
function BlueprintDetail({ api, blueprintRef }: { api: Api; blueprintRef: string }) {
  const detail = useAsync(() => api.getBlueprint(blueprintRef), [blueprintRef])
  const [packOpen, setPackOpen] = useState(false)
  const b = detail.value
  return (
    <Panel title={blueprintRef}>
      <Refusal error={detail.error} />
      {b !== undefined && (
        <>
          <Field label="Language">{b.language}</Field>
          <Field label="Listens on">
            <code>
              :{b.defaultPort}
              {b.healthPath}
            </code>
          </Field>
          <Field label="Manifest versions">{b.schemaVersions.join(', ')}</Field>
          <Field label="Provides">
            {b.provides.services.map((s) => (
              <Pill key={s} tone="plain">
                {s}
              </Pill>
            ))}{' '}
            {b.provides.authProviders.map((a) => (
              <Pill key={a} tone="plain">
                {a}
              </Pill>
            ))}{' '}
            {b.provides.ai && <Pill tone="good">ai</Pill>}
          </Field>
          <Field label="Starters">
            {b.starters.length === 0 ? (
              'the skeleton only'
            ) : (
              <ul>
                {b.starters.map((s) => (
                  <li key={s.name}>
                    <code>{s.name}</code> — {s.summary}
                  </li>
                ))}
              </ul>
            )}
          </Field>
          {/*
            D25's whole argument is that a third-party agent on someone's laptop can read
            this over the API. Loaded only when asked: the pack is whole file bodies, and a
            catalogue screen has no business fetching them for a blueprint nobody opened.
          */}
          <button type="button" onClick={() => setPackOpen((o) => !o)}>
            {packOpen ? 'Hide' : 'Show'} knowledge pack
          </button>
          {packOpen && <KnowledgePack api={api} blueprintRef={blueprintRef} />}
        </>
      )}
    </Panel>
  )
}

function KnowledgePack({ api, blueprintRef }: { api: Api; blueprintRef: string }) {
  const pack = useAsync(() => api.getKnowledgePack(blueprintRef), [blueprintRef])
  return (
    <div className="pack">
      <Refusal error={pack.error} />
      {(pack.value?.files ?? []).map((f) => (
        <div key={f.path}>
          <p>
            <code>{f.path}</code> <span className="hint">{f.mediaType}</span>
          </p>
          <pre>{f.content.split('\n').slice(0, 8).join('\n')}</pre>
        </div>
      ))}
    </div>
  )
}
