import { useRef, useState, type FormEvent } from 'react'
import { ManifestApiError, type Schemas, type StreamFrame } from '@manifest/contract'
import type { Api } from '../api'
import {
  changesFrom,
  editable,
  commitOrigin,
  madeThroughSentence,
  pending,
  STARTING_POINT,
  type Edit,
} from '../code-state'
import { Field, Instant, Panel, Pill, Refusal, useAsync, Warnings } from '../ui'

/**
 * THE CODE SCREEN (the authoring API plan's Task 10) — reading a project's source, changing
 * it, and seeing who changed it: the console's caller of `getTree`, `getFile`, `createCommit`,
 * `listCommits` and `getCommit`.
 *
 * **THE TREE'S COMMIT IS THE BASE OF EVERY EDIT** (Decision 3). Every file is read AT that
 * commit and the commit is sent back as `baseCommit`, so a push that lands in between is
 * refused `409 SOURCE_CONFLICT` rather than silently overwritten by a whole-file write
 * computed from older text. The editor is keyed on that commit: a new base is a fresh editor
 * with no edits, and nothing ever re-bases an edit the person made against text they did not
 * see.
 *
 * THE CONSOLE NEVER POLLS (D23.2): the history re-reads when the project's one socket says
 * `main` moved — `repository.committed` (through the API) or `repository.pushed` (with git).
 */
export function Code({
  api,
  projectId,
  frames,
}: {
  api: Api
  projectId: string
  frames: StreamFrame[]
}) {
  const moved = frames.filter(
    (f) =>
      f.kind === 'event' &&
      (f.type === 'repository.committed' || f.type === 'repository.pushed'),
  ).length
  const tree = useAsync(() => api.getTree(projectId), [projectId])
  const history = useAsync(() => api.listCommits(projectId), [projectId, moved])
  const [committed, setCommitted] = useState<Schemas['CommitOutcome'] | undefined>(
    undefined,
  )
  // EVERY COMMIT STARTS A FRESH EDITOR, whatever the tree answers next. The editor is keyed
  // on its base AND on this: a commit whose answer named the base's own id (the stateless
  // mock's, found by clicking) left the committed edits on screen, marked `changed`, ready to
  // be sent again — so clearing them rests on the commit having happened, not on the id.
  const [generation, setGeneration] = useState(0)

  const base = tree.value?.commitSha
  const head = history.value?.commits[0]?.commitSha
  // `main` MOVED UNDER THE EDITOR — said, never acted on. Only once both reads have settled,
  // or a commit this screen made would read as somebody else's for the moment between them.
  const stale =
    base !== undefined &&
    head !== undefined &&
    head !== base &&
    !tree.loading &&
    !history.loading
  // RELOADING MAIN RE-READS BOTH (sitting 10's F3, found by clicking): the tree alone moved the
  // base past the history's newest commit — a person's `git push` on the local driver sends no
  // frame, so nothing re-read the history — and the banner above then said `main` had moved to
  // the OLDER commit, and said it again after every Reload. The note of this screen's own last
  // commit goes with it: after a reload it is history, which the list below shows.
  const reloadMain = () => {
    setCommitted(undefined)
    tree.reload()
    history.reload()
  }

  return (
    <>
      <Panel title="Code">
        <Refusal error={tree.error} />
        {committed !== undefined && committed.commitSha !== null && (
          <p>
            Committed <code>{committed.commitSha.slice(0, 12)}</code> —{' '}
            {committed.changes.length} file{committed.changes.length === 1 ? '' : 's'}.{' '}
            <span className="hint">
              It builds when someone starts a build of it; committing deploys nothing.
            </span>
          </p>
        )}
        {committed !== undefined && committed.commitSha !== null && (
          <Warnings warnings={committed.spec.warnings} />
        )}
        {stale && (
          <div className="refusal">
            <p>
              <code>main</code> has moved since you opened it (it is now{' '}
              <code>{head.slice(0, 12)}</code>) — reload to see the latest, and make your
              change again.
            </p>
            <button type="button" onClick={reloadMain}>
              Reload main — this discards the edits below
            </button>
          </div>
        )}
        {tree.value !== undefined && (
          <Editor
            key={`${tree.value.commitSha}:${generation}`}
            api={api}
            projectId={projectId}
            tree={tree.value}
            onReload={reloadMain}
            onCommitted={(outcome) => {
              setCommitted(outcome)
              setGeneration((g) => g + 1)
              tree.reload()
              history.reload()
            }}
          />
        )}
      </Panel>
      <History
        api={api}
        projectId={projectId}
        firstPage={history.value}
        error={history.error}
      />
    </>
  )
}

/**
 * THE FILES, ONE OPEN, AND THE COMMIT. Everything here is state of ONE base commit — the
 * parent remounts this component when the base changes — so an edit can never outlive the
 * text it was made against.
 */
function Editor({
  api,
  projectId,
  tree,
  onReload,
  onCommitted,
}: {
  api: Api
  projectId: string
  tree: Schemas['SourceTree']
  onReload: () => void
  onCommitted: (outcome: Schemas['CommitOutcome']) => void
}) {
  const base = tree.commitSha
  const [edits, setEdits] = useState<Edit[]>([])
  const [open, setOpen] = useState<string | undefined>(undefined)
  // The text of each file AS READ AT THE BASE — what "back to how it was" means.
  const [originals, setOriginals] = useState<Record<string, string>>({})
  // A READ'S REFUSAL BELONGS TO THE FILE IT WAS FOR. Kept by path, so it is shown only while
  // that file is open: unkeyed, `manifest.yaml`'s refusal stayed under a new file opened next
  // (found clicking against the mock), and a slow read could land under another file.
  const [readError, setReadError] = useState<{ path: string; error: unknown }>()
  const [newPath, setNewPath] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState<'check' | 'commit' | undefined>(undefined)
  const [checked, setChecked] = useState<Schemas['CommitOutcome'] | undefined>(undefined)
  const [error, setError] = useState<unknown>(undefined)
  // D23.6: ONE KEY PER COMMIT THE PERSON MEANT. Pressing Commit again for the same changes
  // and message — after a timeout they could not see the end of — replays the first answer
  // rather than committing twice; any change to what would be sent is a new action.
  const commitKey = useRef<{ body: string; key: string } | undefined>(undefined)

  const byPath = new Map(tree.entries.map((e) => [e.path, e]))
  const pendings = pending(edits)
  const pendingOf = new Map(pendings.map((p) => [p.path, p]))
  const changes = changesFrom(edits)
  const created = pendings.filter((p) => p.isNew).map((p) => p.path)

  function touched() {
    setChecked(undefined)
    setError(undefined)
  }

  async function openFile(path: string) {
    setOpen(path)
    const entry = byPath.get(path)
    if (entry === undefined || !editable(entry).ok || path in originals) return
    try {
      // AT THE BASE, never `main`: the text an edit is made against is the base's.
      const file = await api.getFile(projectId, path, base)
      setOriginals((o) => ({ ...o, [path]: file.content }))
    } catch (e) {
      setReadError({ path, error: e })
    }
  }

  function write(path: string, content: string) {
    touched()
    setEdits((es) => {
      const original = originals[path]
      // BACK TO HOW IT WAS: an existing file whose text is the base's again has no edit.
      if (byPath.has(path) && content === original)
        return es.filter((e) => e.path !== path)
      const last = es[es.length - 1]
      // One entry per burst of typing, not per keystroke; the fold keeps `isNew`.
      if (last?.op === 'write' && last.path === path)
        return [...es.slice(0, -1), { ...last, content }]
      return [...es, { op: 'write', path, content, isNew: false }]
    })
  }

  function remove(path: string) {
    touched()
    // A FILE THIS SESSION CREATED IS DROPPED, NOT DELETED (`pending`'s fold) — so it is also
    // closed: nothing is left of it to show.
    if (pendingOf.get(path)?.isNew === true) setOpen(undefined)
    setEdits((es) => [...es, { op: 'delete', path }])
  }

  function undo(path: string) {
    touched()
    setEdits((es) => es.filter((e) => e.path !== path))
  }

  function create(event: FormEvent) {
    event.preventDefault()
    const path = newPath.trim()
    if (path === '') return
    touched()
    // AN EXISTING PATH IS OPENED, NOT OVERWRITTEN. Whether a NEW path is acceptable is the
    // platform's to say — `400 REQUEST_INVALID` for its shape, `409 SOURCE_PATH_CONFLICT`
    // for a file where a directory is — and the Check button asks it.
    if (byPath.has(path) || pendingOf.has(path)) {
      void openFile(path)
    } else {
      setEdits((es) => [...es, { op: 'write', path, content: '', isNew: true }])
      setOpen(path)
    }
    setNewPath('')
  }

  async function send(dryRun: boolean) {
    setBusy(dryRun ? 'check' : 'commit')
    setError(undefined)
    setChecked(undefined)
    const body: Schemas['CreateCommitRequest'] = {
      baseCommit: base,
      message,
      changes,
      ...(dryRun ? { dryRun: true } : {}),
    }
    try {
      if (dryRun) {
        // A DRY RUN WRITES NOTHING, so a replay protects nothing — and would answer a check
        // made before `main` moved. A fresh key every press.
        setChecked(await api.createCommit(projectId, body, api.newKey()))
      } else {
        const text = JSON.stringify(body)
        if (commitKey.current?.body !== text)
          commitKey.current = { body: text, key: api.newKey() }
        const outcome = await api.createCommit(projectId, body, commitKey.current.key)
        commitKey.current = undefined
        onCommitted(outcome)
      }
    } catch (e) {
      setError(e)
    } finally {
      setBusy(undefined)
    }
  }

  const files = tree.entries.filter((e) => e.type !== 'directory')
  const openEntry = open === undefined ? undefined : byPath.get(open)
  const openPending = open === undefined ? undefined : pendingOf.get(open)
  const openReadError =
    readError !== undefined && readError.path === open ? readError.error : undefined
  const conflict = error instanceof ManifestApiError && error.code === 'SOURCE_CONFLICT'

  return (
    <>
      <Field label="Branch">
        <code>main</code> at <code>{base.slice(0, 12)}</code>{' '}
        <span className="hint">— every change below is made against this commit</span>
      </Field>
      {tree.truncated && (
        <p className="hint">
          More than 10,000 entries: the first 10,000 by path are listed.
        </p>
      )}
      <ul className="files">
        {[...files.map((e) => e.path), ...created].map((path) => {
          const entry = byPath.get(path)
          const p = pendingOf.get(path)
          const why = entry === undefined ? undefined : editable(entry)
          return (
            <li key={path}>
              <button
                type="button"
                className="link"
                aria-current={open === path}
                onClick={() => void openFile(path)}
              >
                <code>{path}</code>
              </button>{' '}
              {p !== undefined && (
                <Pill tone="bad">
                  {p.op === 'delete' ? 'deleted' : p.isNew ? 'new' : 'changed'}
                </Pill>
              )}
              {why !== undefined && !why.ok && <span className="hint"> {why.why}</span>}
            </li>
          )
        })}
      </ul>
      <form onSubmit={create}>
        <Field label="New file">
          <input
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            placeholder="src/board.js"
          />{' '}
          <button disabled={newPath.trim() === ''}>Create</button>
        </Field>
      </form>

      {open !== undefined && (
        <div className="open-file">
          <h3>
            <code>{open}</code>
          </h3>
          <Refusal error={openReadError} />
          {openEntry !== undefined && !editable(openEntry).ok ? (
            <p className="hint">{(editable(openEntry) as { why: string }).why}</p>
          ) : openPending?.op === 'delete' ? (
            <p>
              Deleted — committing removes it.{' '}
              <button type="button" onClick={() => undo(open)}>
                Undo
              </button>
            </p>
          ) : openPending?.op === 'write' || open in originals ? (
            <>
              <textarea
                className="source"
                spellCheck={false}
                value={openPending?.content ?? originals[open] ?? ''}
                onChange={(e) => write(open, e.target.value)}
              />
              <p>
                <button type="button" onClick={() => remove(open)}>
                  Delete this file
                </button>{' '}
                {openPending !== undefined && !openPending.isNew && (
                  <button type="button" onClick={() => undo(open)}>
                    Undo my changes
                  </button>
                )}
              </p>
            </>
          ) : (
            openReadError === undefined && <p className="hint">reading…</p>
          )}
        </div>
      )}

      <div className="commit-form">
        <h3>
          {changes.length === 0
            ? 'Nothing changed yet'
            : `${changes.length} change${changes.length === 1 ? '' : 's'} to commit`}
        </h3>
        <ul>
          {pendings.map((p) => (
            <li key={p.path}>
              <code>{p.path}</code>{' '}
              {p.op === 'delete' ? 'deleted' : p.isNew ? 'added' : 'changed'}
            </li>
          ))}
        </ul>
        <Field label="Message">
          <input
            className="message"
            value={message}
            onChange={(e) => {
              touched()
              setMessage(e.target.value)
            }}
            placeholder="What this change does"
          />
        </Field>
        <p>
          {/*
            CHECK IS THE COMMIT WITH `dryRun: true`: every check the commit would make —
            the paths, the text, secret-shaped values, the base, the tree and the manifest —
            and nothing written.
          */}
          <button
            type="button"
            onClick={() => void send(true)}
            disabled={busy !== undefined || changes.length === 0 || message === ''}
          >
            {busy === 'check' ? 'checking…' : 'Check'}
          </button>{' '}
          <button
            type="button"
            onClick={() => void send(false)}
            disabled={busy !== undefined || changes.length === 0 || message === ''}
          >
            {busy === 'commit' ? 'committing…' : 'Commit'}
          </button>
        </p>
        {checked !== undefined && <Checked outcome={checked} />}
        {conflict && (
          <div className="refusal">
            <p>
              <code>main</code> has moved since you opened it — reload to see the latest,
              and make your change again. Your edits are still here: copy anything you
              want to keep first.
            </p>
            <button type="button" onClick={onReload}>
              Reload main — this discards the edits above
            </button>
          </div>
        )}
        {/*
          EVERY OTHER REFUSAL IS THE PLATFORM'S, rendered as it answered: `422 SPEC_INVALID`
          with each error and its path in manifest.yaml, `409 SOURCE_SECRET_DETECTED` naming
          `path:line` and the rule (never the value), `409 SOURCE_PATH_CONFLICT` naming the
          path. Nothing was committed for any of them.
        */}
        <Refusal error={error} />
      </div>
    </>
  )
}

/** A DRY RUN'S ANSWER: what would change, and what the manifest it would leave changes. */
function Checked({ outcome }: { outcome: Schemas['CommitOutcome'] }) {
  const diff = outcome.spec.sensitiveDiff
  return (
    <div className="evidence">
      <p>
        <Pill tone="good">would commit</Pill> nothing was written — press Commit to make
        it.
      </p>
      <ul>
        {outcome.changes.map((c) => (
          <li key={c.path}>
            <code>{c.path}</code> {c.status}
          </li>
        ))}
      </ul>
      <Field label="manifest.yaml">
        valid{' '}
        {diff.sensitive ? (
          <>
            — it changes{' '}
            {diff.fields.map((f) => (
              <code key={f}>{f} </code>
            ))}
            — §7’s sensitive fields: a launched app’s production deploy of it needs an
            administrator’s approval (§13)
          </>
        ) : (
          <span className="hint">— none of §7’s sensitive fields change</span>
        )}
      </Field>
      <Warnings warnings={outcome.spec.warnings} />
    </div>
  )
}

/**
 * `main`'s HISTORY, newest first, a page at a time — and for each commit who made it, IN THE
 * PLATFORM'S RECORD (`madeThrough`) beside what git was told (`authorName`), because the
 * second is a claim anyone who can push can write (Decision 5).
 */
function History({
  api,
  projectId,
  firstPage,
  error,
}: {
  api: Api
  projectId: string
  firstPage: Schemas['CommitList'] | undefined
  error: unknown
}) {
  const [older, setOlder] = useState<{
    after: Schemas['CommitList'] | undefined
    pages: Schemas['CommitList'][]
  }>({ after: undefined, pages: [] })
  const [pageError, setPageError] = useState<unknown>(undefined)
  const [shown, setShown] = useState<string | undefined>(undefined)
  // A NEW FIRST PAGE STARTS THE HISTORY AGAIN. Older pages belong to the first page they
  // were paged from, so they are kept only while it is the same object.
  const pages = older.after === firstPage ? older.pages : []
  const last = pages[pages.length - 1] ?? firstPage
  const commits = [firstPage, ...pages].flatMap((p) => p?.commits ?? [])

  async function more() {
    if (last?.next === null || last?.next === undefined) return
    setPageError(undefined)
    try {
      const page = await api.listCommits(projectId, last.next)
      setOlder({ after: firstPage, pages: [...pages, page] })
    } catch (e) {
      setPageError(e)
    }
  }

  return (
    <Panel title="History">
      <Refusal error={error} />
      <ul className="history">
        {commits.map((c) => (
          <li key={c.commitSha}>
            <button
              type="button"
              className="link"
              aria-current={shown === c.commitSha}
              onClick={() => setShown(shown === c.commitSha ? undefined : c.commitSha)}
            >
              {c.subject}
            </button>{' '}
            <code>{c.commitSha.slice(0, 12)}</code> <Instant at={c.authoredAt} />
            <br />
            <MadeBy commit={c} />
            {shown === c.commitSha && (
              <CommitView api={api} projectId={projectId} commitSha={c.commitSha} />
            )}
          </li>
        ))}
      </ul>
      {last?.next !== null && last?.next !== undefined && (
        <button type="button" onClick={() => void more()}>
          Older
        </button>
      )}
      <Refusal error={pageError} />
    </Panel>
  )
}

function MadeBy({ commit }: { commit: Schemas['CommitSummary'] }) {
  if (commitOrigin(commit) === STARTING_POINT) {
    return (
      <span className="hint">
        <Pill tone="plain">first commit</Pill> {STARTING_POINT}
      </span>
    )
  }
  return (
    <span className="hint">
      {commit.madeThrough === null ? (
        <>
          <Pill tone="plain">pushed with git</Pill> git says the author is{' '}
          {commit.authorName}, which Manifest does not verify
        </>
      ) : (
        <>
          <Pill tone="good">through Manifest</Pill>{' '}
          {madeThroughSentence(commit.madeThrough)}
          {commit.authorName !== commit.madeThrough.name && (
            <> · git records {commit.authorName}</>
          )}
        </>
      )}
    </span>
  )
}

/** ONE COMMIT: its whole message, and every file it changed with its patch. */
function CommitView({
  api,
  projectId,
  commitSha,
}: {
  api: Api
  projectId: string
  commitSha: string
}) {
  const detail = useAsync(() => api.getCommit(projectId, commitSha), [commitSha])
  const d = detail.value
  return (
    <div className="commit-detail">
      <Refusal error={detail.error} />
      {d !== undefined && (
        <>
          {d.message.trim() !== d.subject && (
            <pre>
              {d.message}
              {d.messageTruncated && ' …'}
            </pre>
          )}
          <Field label="Parents">
            {d.parents.length === 0
              ? 'none — the first commit'
              : d.parents.map((p) => <code key={p}>{p.slice(0, 12)} </code>)}
          </Field>
          {d.changes.map((c) => (
            <div key={c.path}>
              <p>
                <code>{c.path}</code> {c.status}
                {c.additions !== null && c.deletions !== null && (
                  <span className="hint">
                    {' '}
                    +{c.additions} −{c.deletions}
                  </span>
                )}
              </p>
              {c.binary ? (
                <p className="hint">a binary file — no patch</p>
              ) : c.patch !== null ? (
                <pre>{c.patch}</pre>
              ) : null}
            </div>
          ))}
          {d.patchesTruncated && (
            <p className="hint">
              More changes than can be shown: the rest of the patches are not included.
            </p>
          )}
        </>
      )}
    </div>
  )
}
