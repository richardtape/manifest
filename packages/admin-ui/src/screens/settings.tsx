import { useEffect, useState } from 'react'
import { ManifestApiError, type Schemas } from '@manifest/contract'
import type { Api } from '../api'
import { signIn } from '../auth'
import { Refusal } from '../refusal'
import { CANNOT_READ, SECTIONS, SETTINGS, type SectionId } from '../settings'
import { RawChip, SettingRow } from '../system'

const head = (
  <div className="mfa-set__row mfa-set__row--head" aria-hidden="true">
    <span>Setting</span>
    <span>Value</span>
    <span>Set in</span>
    <span />
  </div>
)

/** A blueprint is superseded when another of its name has a newer major. */
const supersededBy = (b: Schemas['Blueprint'], all: Schemas['BlueprintList']) =>
  all.find((x) => x.name === b.name && x.majorVersion > b.majorVersion) ?? null

export interface SettingsViewProps {
  blueprints: Schemas['BlueprintList']
  /** The section the index marks as current. */
  at?: SectionId
  onSection?: (id: SectionId) => void
}

/**
 * THE PLATFORM'S SETTINGS, READ ONLY (the refreshed design's §7a, decision 24): every setting named, its
 * key in mono and where it is set — facts about the platform, not values — with the value's cell an
 * admission, because no operation reads one. The blueprints are the exception: `listBlueprints` reads
 * them. Nothing here changes anything.
 */
export function SettingsView(props: SettingsViewProps) {
  const at = props.at ?? 'quotas'
  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <h1 className="mfa-h1">Settings</h1>
        <p className="mfa-lede">
          How the platform is configured, and where each setting is set. Nothing here
          changes anything: every setting is changed where it is set, and only the
          blueprints can be read from here yet.
        </p>
      </div>
      <div className="mfa-settings">
        <nav className="mfa-setidx" aria-label="Settings sections">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-current={at === s.id ? 'true' : undefined}
              onClick={() => props.onSection?.(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>
        <div className="mfa-setsecs">
          {SECTIONS.map((s) => {
            const rows =
              s.id === 'blueprints'
                ? props.blueprints.map((b) => {
                    const newer = supersededBy(b, props.blueprints)
                    return (
                      <SettingRow
                        key={b.ref}
                        label={b.language}
                        keyName={b.ref}
                        value={
                          <>
                            <RawChip
                              state={newer === null ? 'steady' : 'notyet'}
                              label={
                                newer === null ? 'Current' : `Superseded by ${newer.ref}`
                              }
                              raw={newer === null ? 'current' : 'superseded'}
                            />
                            <span className="mfa-set__src">
                              {`starters: ${b.starters.map((x) => x.name).join(', ')}`}
                            </span>
                          </>
                        }
                        source="This repository, blueprints/"
                        action={
                          <span className="mfa-set__host">
                            A reviewed commit changes it
                          </span>
                        }
                      />
                    )
                  })
                : SETTINGS.filter((x) => x.section === s.id).map((x) => (
                    <SettingRow
                      key={x.key}
                      label={x.label}
                      keyName={x.key}
                      value={<span className="mfa-set__value--plain">{CANNOT_READ}</span>}
                      source={x.where}
                      action={<span className="mfa-set__host">{x.action}</span>}
                    />
                  ))
            return (
              <section
                key={s.id}
                className="mfa-setsec"
                id={`set-${s.id}`}
                aria-labelledby={`set-h-${s.id}`}
              >
                <div className="mfa-setsec__head">
                  <h2 className="mfa-setsec__title" id={`set-h-${s.id}`}>
                    {s.title}
                  </h2>
                  <p className="mfa-setsec__note">{s.note}</p>
                </div>
                {head}
                {rows}
                {s.foot === undefined ? null : (
                  <p className="mfa-setsec__foot">{s.foot}</p>
                )}
              </section>
            )
          })}
        </div>
      </div>
    </>
  )
}

/**
 * THE SETTINGS SCREEN: `listBlueprints` on entry — the one read there is — and the index moving to a
 * section by scrolling it into view.
 */
export function SettingsScreen({ api }: { api: Api }) {
  const [blueprints, setBlueprints] = useState<Schemas['BlueprintList'] | null>(null)
  const [error, setError] = useState<unknown>(undefined)
  const [at, setAt] = useState<SectionId>('quotas')

  useEffect(() => {
    let live = true
    api.listBlueprints().then(
      (b) => live && setBlueprints(b),
      (e: unknown) => {
        if (!live) return
        if (
          e instanceof ManifestApiError &&
          e.status === 401 &&
          e.code === 'UNAUTHENTICATED'
        )
          signIn(window.location.pathname + window.location.search)
        else setError(e)
      },
    )
    return () => {
      live = false
    }
  }, [api])

  if (blueprints === null)
    return error === undefined ? (
      <p className="mfa-sec__body">Reading the settings…</p>
    ) : (
      <Refusal error={error} />
    )
  return (
    <SettingsView
      blueprints={blueprints}
      at={at}
      onSection={(id) => {
        setAt(id)
        document.getElementById(`set-${id}`)?.scrollIntoView({ block: 'start' })
      }}
    />
  )
}
