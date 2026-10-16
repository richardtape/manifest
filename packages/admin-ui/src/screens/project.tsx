import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { ManifestApiError, type Schemas, type StreamFrame } from '@manifest/contract'
import { createApi, type Api, type ApiOptions } from '../api'
import { signIn } from '../auth'
import {
  askedWords,
  attemptOf,
  CAUSE_STATE,
  ENV_ORDER,
  incidentGroups,
  INSTANCE_WORDS,
  levelOf,
  personOf,
  questionsOf,
  recordSince,
  releaseRows,
  servingReleases,
  setOf,
  type EnvironmentRead,
  type FactCell,
  type ProjectRead,
} from '../project-state'
import { Refusal } from '../refusal'
import { routePath } from '../router'
import { eventsNewestFirst, useProjectStream } from '../stream'
import {
  DataTable,
  EventLine,
  FactList,
  InverseSurface,
  MachineValue,
  ObservedAction,
  RawChip,
  shorten,
  Tags,
  TwoFacts,
  type DataColumn,
} from '../system'
import { ageShort, ageWords, dayInWords } from '../time'
import { createKeys } from '../transitions'
import { scanWords } from './approval-pane'
import { recordFacts, recordsOf, stateLabel, titleOf } from './record-pane'

const RECENT_EVENTS = 20

function sec(title: string | null, children: ReactNode) {
  return (
    <section className="mfa-sec">
      {title === null ? null : <h2 className="mfa-sec__title">{title}</h2>}
      {children}
    </section>
  )
}
const para = (body: ReactNode) => <p className="mfa-sec__body">{body}</p>

function result(title: string, lines: ReactNode[]) {
  return (
    <div className="mfa-result mfa-result--neutral" role="status">
      <p className="mfa-result__title">{title}</p>
      {lines.map((line, i) => (
        <p key={i} className="mfa-result__body">
          {line}
        </p>
      ))}
    </div>
  )
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const ENV_WORDS: Record<string, string> = {
  production: 'Production',
  staging: 'Staging',
  sandbox: 'Sandbox',
}

/**
 * EVERYTHING THE PAGE READS ABOUT ONE PROJECT (the refreshed design's §6): the project with its
 * environments, each environment's instances and Incidents, the releases (and, through `getRelease`, any
 * release serving an environment that is older than `listReleases`' newest 50), the checklist and the
 * records, the members, tokens, agents' questions and agent sessions. The stream is the page's own.
 */
export async function readProject(api: Api, projectId: string): Promise<ProjectRead> {
  const [
    project,
    releases,
    readiness,
    records,
    members,
    tokens,
    pendingActions,
    sessions,
  ] = await Promise.all([
    api.getProject(projectId),
    api.listReleases(projectId),
    api.getLaunchReadiness(projectId),
    api.getLaunchRecords(projectId),
    api.listMembers(projectId),
    api.listTokens(projectId),
    api.listPendingActions(projectId),
    api.listAgentSessions(projectId),
  ])
  const environments = project.environments ?? (await api.listEnvironments(projectId))
  const reads: EnvironmentRead[] = await Promise.all(
    environments.map(async (environment) => {
      const [instances, incidents] = await Promise.all([
        api.listInstances(environment.id),
        api.listIncidents(environment.id),
      ])
      return { environment, instances, incidents }
    }),
  )
  reads.sort(
    (a, b) =>
      ENV_ORDER.indexOf(a.environment.kind) - ENV_ORDER.indexOf(b.environment.kind),
  )
  const older = [...new Set(Object.values(servingReleases(reads)))].filter(
    (id) => !releases.some((r) => r.id === id),
  )
  const olderReleases = await Promise.all(older.map((id) => api.getRelease(id)))
  return {
    project,
    environments: reads,
    releases: [...releases, ...olderReleases],
    readiness,
    records,
    members,
    tokens,
    pendingActions,
    sessions,
  }
}

/**
 * AN AGENT'S QUESTION, REJECTED FOR ITS PROJECT'S PEOPLE — the one act this page has (Decision 10). The
 * reason goes TWICE, to two readers: in the body, which the agent is told word for word; and as §26's
 * `Manifest-Admin-Reason` (the client's middleware), because the operator is a member of nothing and
 * borrows an owner's capability, so the project's people read it beside the operator's name. Without
 * the header the platform refuses `400 ADMIN_REASON_REQUIRED`. The key is the operator's action's, so a
 * retry after no answer replays the rejection rather than recording a second.
 */
export function rejectQuestion(
  options: ApiOptions,
  pendingActionId: string,
  reason: string,
  key: string,
): Promise<Schemas['PendingAction']> {
  return createApi({ ...options, adminReason: () => reason }).rejectPendingAction(
    pendingActionId,
    { reason },
    key,
  )
}

/** One question's act on this visit: in flight, answered, or refused. */
export type QuestionAct =
  | { at: 'sending' }
  | { at: 'done'; answered: Schemas['PendingAction'] }
  | { at: 'refused'; error: unknown }

export interface ProjectViewProps {
  read: ProjectRead
  me: Schemas['Me']
  now: Date
  frames: StreamFrame[]
  stream: 'connecting' | 'live' | 'closed'
  closeCode?: number | undefined
  /** The reason typed for each waiting question, by its id. */
  reasons: Record<string, string>
  acts: Record<string, QuestionAct>
  onReason?: (pendingActionId: string, reason: string) => void
  onReject?: (action: Schemas['PendingAction']) => void
  /** A re-read that failed: shown above the page it left on screen. */
  error?: unknown
}

/** The head's line: who owns it, its audience, its data, launched or not, archived or not. */
function head(read: ProjectRead) {
  const p = read.project
  const level = levelOf(read.environments, read.releases)
  return (
    <header style={{ marginBottom: 20 }}>
      <span className="mfa-over">App</span>
      <h1 className="mfa-h1">
        <span className="mfa-mono">{p.slug}</span>
        {` · ${p.name}`}
      </h1>
      <p className="mfa-pane__meta">
        <span>{`owned by ${p.owner.displayName}`}</span>
        {p.audience === null ? (
          <span>audience not asked</span>
        ) : (
          <span className="mfa-mono">{`${p.audience.scale} · ${p.audience.burst}`}</span>
        )}
        {level === null ? (
          <span>data level: not deployed yet</span>
        ) : (
          <span title={`What serves ${level.from} declares it`}>
            <span className="mfa-mono">{level.level}</span>
            {' data'}
          </span>
        )}
        <span>
          {p.launchedAt === null
            ? 'not launched'
            : `launched ${dayInWords(p.launchedAt)}`}
        </span>
        {p.state === 'archived' ? (
          <span className="mfa-mono">
            {p.archivedAt === null ? 'archived' : `archived ${dayInWords(p.archivedAt)}`}
          </span>
        ) : null}
        <span>{`created ${dayInWords(p.createdAt)}`}</span>
      </p>
    </header>
  )
}

function theApp(read: ProjectRead) {
  const p = read.project
  const level = levelOf(read.environments, read.releases)
  return (
    <FactList
      rows={[
        {
          label: 'Audience',
          value:
            p.audience === null ? (
              'Not asked yet'
            ) : (
              <span>
                <code className="mfa-mono">{`${p.audience.scale} · ${p.audience.burst}`}</code>
                {p.audience.justification === null
                  ? ''
                  : ` — ${p.audience.justification}`}
              </span>
            ),
        },
        p.audience !== null && {
          label: 'Set',
          value: `by ${personOf(p.audience.setBy, read.members)} on ${dayInWords(p.audience.setAt)}`,
        },
        {
          label: 'Data level',
          value:
            level === null ? (
              'Not deployed yet: nothing serves staging or production'
            ) : (
              <span>
                <code className="mfa-mono">{level.level}</code>
                {` — what serves ${level.from} declares it`}
              </span>
            ),
        },
        {
          label: 'Blueprint',
          value: `${p.blueprint}${p.starter === null ? '' : ` · starter ${p.starter}`}`,
          mono: true,
        },
        { label: 'Code', value: p.repository.fullName, mono: true },
        {
          label: 'Launched',
          value: p.launchedAt === null ? 'Not launched' : dayInWords(p.launchedAt),
        },
      ]}
    />
  )
}

/** One environment: what serves and what the last attempt did, then every instance it lists. */
function environment(
  read: EnvironmentRead,
  releases: ProjectRead['releases'],
  now: Date,
) {
  const kind = read.environment.kind
  const set = setOf(read)
  const servingId = servingReleases([read])[kind]
  const release = releases.find((r) => r.id === servingId)
  const serving: FactCell =
    set.size === 0
      ? { overline: `Serving · ${kind}`, title: 'Nothing deployed', tone: 'neutral' }
      : {
          overline: `Serving · ${kind}`,
          title: set.words,
          ...(release === undefined
            ? {}
            : {
                note: `${release.summary ?? 'no summary'} · ${shorten(release.imageDigest)}`,
              }),
          tone: set.serving > 0 ? 'steady' : 'attention',
        }
  const releaseOf = (id: string) => releases.find((r) => r.id === id)
  const columns: DataColumn<Schemas['InstanceSummary']>[] = [
    {
      key: 'id',
      label: 'Instance',
      render: (i) => <MachineValue value={i.id} label="instance id" copy={false} />,
    },
    {
      key: 'state',
      label: 'State',
      render: (i) => <RawChip raw={i.state} label={INSTANCE_WORDS[i.state]} />,
    },
    { key: 'serving', label: 'Serving', render: (i) => (i.serving ? 'Serving' : '—') },
    {
      key: 'lastSeenAt',
      label: 'Deployed',
      render: (i) =>
        i.lastSeenAt === null ? 'Never' : `${ageShort(i.lastSeenAt, now)} ago`,
    },
    {
      key: 'releaseId',
      label: 'Release',
      render: (i) => (
        <span className="mfa-cellstack">
          <MachineValue value={i.releaseId} label="release id" copy={false} />
          <small>{releaseOf(i.releaseId)?.summary ?? ''}</small>
        </span>
      ),
    },
  ]
  return (
    <div key={kind} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <TwoFacts
        serving={serving}
        attempt={attemptOf(read, (iso) => ageShort(iso, now))}
        foot={null}
      />
      {read.instances.instances.length === 0 ? null : (
        <DataTable
          caption={`Every instance ${kind} lists`}
          rowKey="id"
          rows={read.instances.instances}
          columns={columns}
          compact
        />
      )}
      {set.truncated
        ? para('Only the 50 instances seen most recently are listed.')
        : null}
    </div>
  )
}

function incidents(read: ProjectRead, now: Date) {
  const groups = incidentGroups(read.environments)
  if (groups.length === 0) return para('No Incident has been recorded for this app.')
  return groups.map((group) => (
    <div key={group.kind} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <span className="mfa-over">{ENV_WORDS[group.kind]}</span>
      {group.incidents.map(({ incident, words }) => (
        <div
          key={incident.id}
          style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
          className="mfa-incident"
        >
          <div className="mfa-panel__line">
            <RawChip
              raw={incident.cause}
              state={CAUSE_STATE[incident.cause]}
              label={words}
              pulse={false}
            />
            <span>{`${ageShort(incident.createdAt, now)} ago`}</span>
          </div>
          <FactList
            rows={[
              { label: 'How it ended', value: incident.exitReason },
              { label: 'The check', value: incident.failedCheck, mono: true },
              { label: 'Since healthy', value: incident.diffSinceHealthy, mono: true },
              {
                label: 'Instance',
                value: (
                  <MachineValue
                    value={incident.instanceId}
                    label="instance id"
                    copy={false}
                  />
                ),
              },
            ]}
          />
          {incident.logTail === '' ? null : <InverseSurface inset={incident.logTail} />}
        </div>
      ))}
    </div>
  ))
}

function releases(read: ProjectRead) {
  if (read.releases.length === 0) return para('No release has been made yet.')
  type Row = ReturnType<typeof releaseRows>[number] & { id: string }
  const rows: Row[] = releaseRows(read.releases, read.environments, read.members).map(
    (r) => ({ ...r, id: r.release.id }),
  )
  const columns: DataColumn<Row>[] = [
    {
      key: 'release',
      label: 'Release',
      render: (r) => (
        <span className="mfa-cellstack">
          <span>{r.release.summary ?? 'No summary'}</span>
          <small>{`${dayInWords(r.release.createdAt)} · by ${r.madeBy}`}</small>
        </span>
      ),
    },
    {
      key: 'digest',
      label: 'Image',
      render: (r) => <MachineValue value={r.release.imageDigest} label="image digest" />,
    },
    {
      key: 'level',
      label: 'Data',
      render: (r) => (
        <span className="mfa-mono">{r.release.config.production.classification}</span>
      ),
    },
    {
      key: 'scan',
      label: 'Scan',
      render: (r) => (
        <span style={{ whiteSpace: 'normal' }}>{scanWords(r.release.scan)}</span>
      ),
    },
    {
      key: 'serves',
      label: 'Serves',
      render: (r) => (r.servesIn.length === 0 ? '—' : r.servesIn.join(', ')),
    },
  ]
  return (
    <DataTable
      caption="The project’s releases, newest first"
      rowKey="id"
      rows={rows}
      columns={columns}
      compact
    />
  )
}

const CHECK_WORDS: Record<string, string> = {
  met: 'Met',
  unmet: 'Unmet',
  not_built: 'Not built',
}

function launch(read: ProjectRead) {
  type Item = Schemas['LaunchReadiness']['items'][number]
  const columns: DataColumn<Item>[] = [
    { key: 'id', label: 'Item', mono: true },
    {
      key: 'title',
      label: 'What',
      render: (c) => (
        <span className="mfa-cellstack" style={{ whiteSpace: 'normal' }}>
          <span>{c.title}</span>
          {c.state === 'met' ? null : <small>{c.why}</small>}
        </span>
      ),
    },
    {
      key: 'blocking',
      label: 'Blocking',
      render: (c) => (c.blocking ? 'Blocking' : 'No'),
    },
    {
      key: 'state',
      label: 'State',
      render: (c) => <RawChip raw={c.state} label={CHECK_WORDS[c.state]} />,
    },
    {
      key: 'since',
      label: 'Since',
      render: (c) => (c.since === null ? '—' : dayInWords(c.since)),
    },
  ]
  const found = recordsOf(read.records)
  return (
    <>
      {para(
        read.project.launchedAt === null
          ? 'Not launched. The checklist below is what a first launch is held to.'
          : `Launched on ${dayInWords(read.project.launchedAt)}. A release that changes something sensitive is held to the checklist again.`,
      )}
      <DataTable
        caption="The launch checklist"
        rowKey="id"
        rows={read.readiness.items}
        columns={columns}
        compact
      />
      {found.length === 0
        ? para('No launch record has been drafted yet.')
        : found.map((f) => {
            const since = recordSince(f.record)
            return (
              <Fragment key={f.record.id}>
                <h3 className="mfa-sec__title">{titleOf(f)}</h3>
                {para(
                  <>
                    <strong>{stateLabel(f)}</strong>
                    {since === null ? '' : ` since ${dayInWords(since)}`}
                    {f.record.sentBy === null
                      ? ''
                      : ` · sent by ${f.record.sentBy.displayName}`}
                    {f.record.submittedBy === null
                      ? ''
                      : ` · submitted by ${f.record.submittedBy.displayName}`}
                  </>,
                )}
                {recordFacts(f)}
              </Fragment>
            )
          })}
      {found.length === 0
        ? null
        : para(
            <>
              {'The team’s step and UBC’s answer are taken on '}
              <a
                href={routePath({
                  screen: 'project',
                  projectId: read.project.id,
                  section: 'records',
                })}
              >
                this app’s launch records
              </a>
              {', where the email to the Manifest team links.'}
            </>,
          )}
    </>
  )
}

function people(read: ProjectRead, now: Date) {
  const memberColumns: DataColumn<Schemas['Member']>[] = [
    { key: 'displayName', label: 'Name' },
    { key: 'role', label: 'Role', mono: true },
    {
      key: 'cwlLogin',
      label: 'CWL login',
      render: (m) =>
        m.cwlLogin === null ? '—' : <span className="mfa-mono">{m.cwlLogin}</span>,
    },
    { key: 'email', label: 'Email' },
  ]
  const tokenColumns: DataColumn<Schemas['Token']>[] = [
    { key: 'name', label: 'Token', render: (t) => `‘${t.name}’` },
    { key: 'capabilities', label: 'May', render: (t) => <Tags items={t.capabilities} /> },
    { key: 'rateLimit', label: 'Rate limit', render: (t) => `${t.rateLimit} a minute` },
    {
      key: 'expiresAt',
      label: 'Expires',
      render: (t) => `${t.expired ? 'expired ' : ''}${dayInWords(t.expiresAt)}`,
    },
    {
      key: 'lastUsedAt',
      label: 'Last used',
      render: (t) =>
        t.lastUsedAt === null ? 'Never' : `${ageShort(t.lastUsedAt, now)} ago`,
    },
    {
      key: 'revokedAt',
      label: 'Revoked',
      render: (t) => (t.revokedAt === null ? '—' : dayInWords(t.revokedAt)),
    },
    {
      key: 'mintedBy',
      label: 'Minted by',
      render: (t) => personOf(t.mintedBy, read.members),
    },
  ]
  return (
    <>
      <DataTable
        caption="The project’s members"
        rowKey="userId"
        rows={read.members}
        columns={memberColumns}
        compact
      />
      {read.tokens.length === 0 ? (
        para('No delegated token has been made for this project.')
      ) : (
        <>
          <DataTable
            caption="The project’s delegated tokens"
            rowKey="id"
            rows={read.tokens}
            columns={tokenColumns}
            compact
          />
          {para(
            'Only the person who minted a token can revoke it — an administrator cannot, from here or anywhere.',
          )}
        </>
      )}
    </>
  )
}

/** A waiting question: what it asks, through which token, who decides — and the refusal, observed. */
function question(action: Schemas['PendingAction'], props: ProjectViewProps): ReactNode {
  const { read, me, now } = props
  const token = read.tokens.find((t) => t.id === action.tokenId)
  const minter = token === undefined ? null : personOf(token.mintedBy, read.members)
  const what = askedWords(action)
  const act = props.acts[action.id]
  const lapses =
    Date.parse(action.expiresAt) > now.getTime()
      ? `in ${ageWords(now.toISOString(), new Date(action.expiresAt))}, and then the agent is told no`
      : 'now'
  return (
    <div key={action.id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {para(
        <>
          <strong>{`An agent asked to ${what}.`}</strong>
          {` Waiting ${ageWords(action.createdAt, now)}.`}
        </>,
      )}
      <FactList
        rows={[
          {
            label: 'Capability',
            value: <code className="mfa-mono">{action.action}</code>,
          },
          { label: 'Request', value: `${action.method} ${action.path}`, mono: true },
          {
            label: 'Body',
            value: (
              <MachineValue value={`sha256:${action.bodySha256}`} label="body hash" />
            ),
          },
          {
            label: 'Through',
            value:
              token === undefined
                ? 'a token no longer on the project'
                : `‘${token.name}’, minted by ${minter}`,
          },
          { label: 'Lapses', value: lapses },
        ]}
      />
      {para(
        `${minter ?? 'Whoever minted the token'} decides. If it looks like a runaway agent, you can refuse it here; you cannot revoke someone else’s token.`,
      )}
      <ObservedAction
        id={`reason-${action.id}`}
        owner={read.project.owner.displayName}
        reason={props.reasons[action.id] ?? ''}
        onReason={(reason) => props.onReason?.(action.id, reason)}
        placeholder="What the agent should be told."
        hint="Written for two readers: the agent is told it, and the project’s people see it."
        previews={[
          {
            label: 'reject',
            type: 'pending_action.rejected',
            lead: `${me.displayName} refused an agent's request to ${what}:`,
            reasonIn: 'sentence',
            after:
              'There is no Confirm here. Saying yes to someone else’s agent is theirs to do.',
          },
        ]}
        actions={[
          {
            label: 'Reject for them',
            kind: 'ghostDanger',
            needsReason: true,
            disabled: act?.at === 'sending',
            onClick: () => props.onReject?.(action),
          },
        ]}
      />
      {act?.at === 'refused' ? <Refusal error={act.error} /> : null}
    </div>
  )
}

const ANSWER_WORDS: Record<Schemas['PendingAction']['state'], string> = {
  pending: 'Waiting',
  confirmed: 'Confirmed',
  rejected: 'Rejected',
  expired: 'Lapsed',
}

function agents(props: ProjectViewProps) {
  const { read, now } = props
  const { waiting, answered } = questionsOf(read.pendingActions)
  const done = Object.entries(props.acts).flatMap(([id, act]) =>
    act.at === 'done' && !waiting.some((a) => a.id === id) ? [act.answered] : [],
  )
  const sessionColumns: DataColumn<Schemas['AgentSession']>[] = [
    { key: 'name', label: 'Session' },
    { key: 'person', label: 'For', render: (s) => s.person.name },
    {
      key: 'via',
      label: 'Through',
      render: (s) => (s.via === null ? 'A sign-in' : `‘${s.via.tokenName}’`),
    },
    { key: 'models', label: 'Models', render: (s) => <Tags items={s.models} /> },
    { key: 'state', label: 'State', render: (s) => <RawChip raw={s.state} /> },
    {
      key: 'spent',
      label: 'Spent',
      align: 'right',
      render: (s) =>
        s.spentUsd === null
          ? (s.spentUnavailable ?? '—')
          : `$${s.spentUsd.toFixed(2)} of $${s.capUsd.toFixed(2)}`,
    },
  ]
  return (
    <>
      {done.map((a) =>
        result('Refused for them', [
          <>
            {'The agent was told no, in your words: '}
            <q>{a.reason ?? ''}</q>
          </>,
          `${read.project.owner.displayName} and the project’s people read it with your name, as a platform administrator.`,
        ]),
      )}
      {waiting.length === 0
        ? para('No agent’s question is waiting.')
        : waiting.map((a) => question(a, props))}
      {answered.length === 0 ? null : (
        <ul className="mfa-events">
          {answered.map((a) => (
            <li key={a.id} className="mfa-ev">
              <span className="mfa-ev__when">
                {a.resolvedAt === null ? '' : `${ageShort(a.resolvedAt, now)} ago`}
              </span>
              <span className="mfa-ev__body">
                <span className="mfa-ev__text">
                  <RawChip raw={a.state} label={ANSWER_WORDS[a.state]} />
                  {` An agent asked to ${askedWords(a)}.`}
                </span>
                {a.reason === null ? null : (
                  <blockquote className="mfa-quote mfa-ev__reason">{a.reason}</blockquote>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {read.sessions.sessions.length === 0 ? (
        para('No agent session has been started on this project.')
      ) : (
        <DataTable
          caption="The project’s agent sessions"
          rowKey="id"
          rows={read.sessions.sessions}
          columns={sessionColumns}
          compact
        />
      )}
    </>
  )
}

function events(props: ProjectViewProps) {
  const list = eventsNewestFirst(props.frames, RECENT_EVENTS)
  const stopped = `The project’s events stopped (close ${props.closeCode ?? 'with no code'}).`
  if (list.length === 0)
    return para(
      props.stream === 'connecting'
        ? 'Reading the project’s events…'
        : props.stream === 'closed'
          ? stopped
          : 'No events yet.',
    )
  return (
    <>
      {props.stream === 'closed' ? para(stopped) : null}
      <ul className="mfa-events">
        {list.map((e) => (
          <EventLine
            key={e.id}
            when={`${ageShort(e.createdAt, props.now)} ago`}
            type={e.type}
            text={e.humanMessage}
            who={e.actor?.name}
            asAdmin={e.actor?.asAdministrator}
            reason={e.actor?.reason}
          />
        ))}
      </ul>
    </>
  )
}

/**
 * ONE PROJECT, AS AN OPERATOR SEES IT, DRAWN (the refreshed design's §6): the head (with the data's U1
 * level from what serves), the environments with their sets, the Incidents by cause, the releases and
 * their scans, the launch, people and agents, and the events live — each naming who acted, and an
 * administrator's reason quoted. It offers no owner's action: the one act is rejecting an agent's
 * question (Decision 10).
 */
export function ProjectView(props: ProjectViewProps) {
  const { read, now } = props
  return (
    <>
      {head(read)}
      <Refusal error={props.error} />
      {sec('The app', theApp(read))}
      {sec(
        'Environments',
        read.environments.length === 0 ? (
          para('No environment yet.')
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {read.environments.map((e) => environment(e, read.releases, now))}
          </div>
        ),
      )}
      {sec('Incidents', incidents(read, now))}
      {sec(`Releases · ${plural(read.releases.length, 'release')}`, releases(read))}
      {sec('The launch', launch(read))}
      {sec('People', people(read, now))}
      {sec('Agents', agents(props))}
      {sec('Events', events(props))}
      {sec(
        null,
        para(
          'An administrator sees everything here, and changes nothing from this page but an agent’s question. An owner’s action on someone else’s app — a deploy, a member, a secret, a commit — is taken in the reference console, with a reason the app’s people read.',
        ),
      )}
    </>
  )
}

/**
 * THE PROJECT'S PAGE: every read on entry, every 60 seconds and when the window is shown again; ONE
 * socket on the project while the page is open (D23.2); the rejection of an agent's question under
 * the operator's key, never sent twice at once. An ended session goes round the sign-in trip back to
 * this URL. The shell keys it by project, so moving to another project starts it afresh.
 */
export function ProjectScreen({
  api,
  me,
  projectId,
}: {
  api: Api
  me: Schemas['Me']
  projectId: string
}) {
  const [read, setRead] = useState<ProjectRead | null>(null)
  const [error, setError] = useState<unknown>(undefined)
  const [now, setNow] = useState(() => new Date())
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [acts, setActs] = useState<Record<string, QuestionAct>>({})
  const [reads, setReads] = useState(0)
  const [keys] = useState(() => createKeys(api.newKey))
  const inFlight = useRef(new Set<string>())
  const { frames, status, closeCode } = useProjectStream(projectId)

  useEffect(() => {
    let live = true
    const load = () =>
      readProject(api, projectId).then(
        (r) => {
          if (!live) return
          setRead(r)
          setNow(new Date())
          setError(undefined)
        },
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
    void load()
    const every = window.setInterval(() => void load(), 60_000)
    const onShow = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onShow)
    return () => {
      live = false
      window.clearInterval(every)
      document.removeEventListener('visibilitychange', onShow)
    }
  }, [api, projectId, reads])

  const reject = (action: Schemas['PendingAction']) => {
    const reason = (reasons[action.id] ?? '').trim()
    if (reason === '' || inFlight.current.has(action.id)) return
    inFlight.current.add(action.id)
    const name = `reject:${action.id}`
    setActs((a) => ({ ...a, [action.id]: { at: 'sending' } }))
    rejectQuestion(
      { origin: window.location.origin },
      action.id,
      reason,
      keys.keyFor(name),
    )
      .then(
        (answered) => {
          keys.answered(name)
          setActs((a) => ({ ...a, [action.id]: { at: 'done', answered } }))
          setReads((n) => n + 1)
        },
        (e: unknown) => {
          keys.answered(name, e)
          if (
            e instanceof ManifestApiError &&
            e.status === 401 &&
            e.code === 'UNAUTHENTICATED'
          ) {
            signIn(window.location.pathname + window.location.search)
            return
          }
          setActs((a) => ({ ...a, [action.id]: { at: 'refused', error: e } }))
          // Answered by someone else, lapsed, archived: the page reads what is true now.
          if (e instanceof ManifestApiError && e.status < 500) setReads((n) => n + 1)
        },
      )
      .finally(() => inFlight.current.delete(action.id))
  }

  if (read === null)
    return error === undefined ? (
      <p className="mfa-sec__body">Reading the project…</p>
    ) : (
      <Refusal error={error} />
    )
  return (
    <ProjectView
      read={read}
      me={me}
      now={now}
      frames={frames}
      stream={status}
      closeCode={closeCode}
      reasons={reasons}
      acts={acts}
      onReason={(id, reason) => setReasons((r) => ({ ...r, [id]: reason }))}
      onReject={reject}
      error={error}
    />
  )
}
