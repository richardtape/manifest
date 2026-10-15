import { stateOf } from './state-of'

export interface EnvCellProps {
  env: {
    state: string | null
    /** How many instances the hostname reaches (`Fleet.environments[].instances`). */
    instances?: number
    age?: string
    /** An incident after the deploy. */
    incident?: string
  } | null
}

/** One environment in a fleet row: its state, its instances, the deploy's age, an incident after it. */
export function EnvCell(props: EnvCellProps) {
  const e = props.env
  if (!e || !e.state)
    return (
      <span className="mfa-env mfa-env--none">
        <span className="mfa-env__dot" />
        not deployed
      </span>
    )
  return (
    <span className={'mfa-env mfa-env--' + stateOf(e.state)}>
      <span className="mfa-env__dot" aria-hidden="true" />
      {e.state}
      {e.instances ? (
        <span
          className="mfa-env__n"
          title={e.instances + (e.instances === 1 ? ' instance' : ' instances')}
        >
          {'· ' + e.instances}
        </span>
      ) : null}
      {e.age ? <span className="mfa-env__age">{e.age}</span> : null}
      {e.incident ? <span className="mfa-env__inc">{'failed ' + e.incident}</span> : null}
    </span>
  )
}
