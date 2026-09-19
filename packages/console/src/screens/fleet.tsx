import type { Schemas } from '@manifest/contract'
import type { Api } from '../api'
import { Instant, Field, Panel, Pill, Refusal, useAsync } from '../ui'

/**
 * §26's FLEET — every project on the platform, for the one role that is allowed to see them
 * all (D31, §13: the platform admin approves releases, sets quotas and sees the whole fleet).
 *
 * THE LINK IS HIDDEN FOR A NON-ADMINISTRATOR AND THE ROUTE IS NOT, deliberately. `GET
 * /v1/fleet` answers a non-administrator `403 FORBIDDEN` — not `404`: there is no tenant's
 * resource to hide (P5a Task 16) — and navigating here as anybody else renders that refusal.
 * **That is the control**, and it is what proves the console holds no authority of its own:
 * hiding the route as well would make the console look like it were enforcing something,
 * and a reader would then have two places to check instead of one (`projects/authz.ts`).
 *
 * A PLATFORM ROLE IS GRANTED OUT OF BAND and reaches a person only when they SIGN IN AGAIN:
 * `scripts/admin-grant.sh grant <puid> "<reason>"` runs one transaction as the database owner
 * inside the Postgres container, and sessions are stateless and carry the role they were
 * issued with (§20, P5a Task 16). So a person who has just been granted admin and still sees
 * no Fleet link is not looking at a defect.
 */
export function Fleet({ api }: { api: Api }) {
  const fleet = useAsync(() => api.listFleet(), [])
  return (
    <Panel title="Fleet">
      <Refusal error={fleet.error} />
      {fleet.value !== undefined && (
        <>
          <p className="hint">
            {fleet.value.length} project{fleet.value.length === 1 ? '' : 's'} on this
            platform.{' '}
            {/*
              §26 NAMES THREE COLUMNS THAT DO NOT EXIST YET, and they are not invented here.
              The schema's own description says so — "Not yet: department, custom domains, AI
              spend this month" — and a table with three empty columns would read as three
              broken reads rather than as three things Phase 2 builds. Same rule the launch
              checklist follows for `not_built`.
            */}
            §26 also asks for department, custom domains and AI spend this month: the API
            does not carry them yet, and this screen does not invent them.
          </p>
          {fleet.value.length === 0 && <p>No projects yet.</p>}
          {fleet.value.map((project) => (
            <FleetProject key={project.id} project={project} />
          ))}
        </>
      )}
    </Panel>
  )
}

function FleetProject({ project }: { project: Schemas['Fleet'][number] }) {
  return (
    <div className="env">
      <Field label="Project">
        <code>{project.slug}</code>{' '}
        {/*
          §23: a project holding a label that was RESERVED after it was created. The schema
          says what to do with it — "Handle with the owner; never renamed automatically" —
          and the fleet is the one screen where somebody would notice.
        */}
        {project.slugReserved && <Pill tone="bad">holds a reserved label</Pill>}
      </Field>
      <Field label="Owner">
        {project.owner.displayName} <code>{project.owner.email}</code>
      </Field>
      <Field label="Blueprint">
        {project.blueprint}
        {project.starter !== null && ` · ${project.starter}`}
      </Field>
      <Field label="Who it is for">
        {/* §24, and NULL for a project created before the question existed. */}
        {project.audience === null
          ? 'not stated'
          : `${project.audience.scale}, ${project.audience.burst}`}
      </Field>
      <Field label="Created">
        <Instant at={project.createdAt} />
      </Field>
      <Field label="Environments">
        <ul>
          {project.environments.map((env) => (
            <li key={env.hostname}>
              <code>{env.hostname}</code> <Pill tone="plain">{env.kind}</Pill>{' '}
              {env.state === null ? (
                'never deployed'
              ) : (
                <Pill tone={env.state === 'healthy' ? 'good' : 'plain'}>{env.state}</Pill>
              )}
              {env.imageDigest !== null && (
                <>
                  {' '}
                  <code>{env.imageDigest.slice(7, 19)}</code>
                </>
              )}
              {env.lastDeployAt !== null && (
                <>
                  {' '}
                  deployed <Instant at={env.lastDeployAt} />
                </>
              )}
              {/*
                THE API CARRIES AN INSTANT, NOT A COUNT. §26 asks for "open incidents"; what
                `GET /v1/fleet` answers per environment is `latestIncidentAt`, and there is no
                open/closed state on an Incident in Phase 1 at all. Rendering "1 open" from
                this would be a number the platform never computed.
              */}
              {env.latestIncidentAt !== null && (
                <>
                  {' '}
                  <Pill tone="bad">
                    incident <Instant at={env.latestIncidentAt} />
                  </Pill>
                </>
              )}
            </li>
          ))}
        </ul>
      </Field>
    </div>
  )
}
