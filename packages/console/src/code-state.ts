import type { Schemas } from '@manifest/contract'

/**
 * THE CODE SCREEN'S PURE HALF (the authoring API plan's Task 10): which entries it offers to
 * edit, what it sends as `createCommit`'s `changes`, and how it names who made a commit. The
 * console has no DOM tier (P5c Decision 7), so every decision the screen makes that a test
 * can check is made here, and `screens/code.tsx` only renders.
 */

export type SourceEntry = Schemas['SourceTree']['entries'][number]
export type Change = Schemas['CreateCommitRequest']['changes'][number]
export type MadeThrough = Schemas['CommitSummary']['madeThrough']

/**
 * THE PLATFORM'S LIMIT, RESTATED — 1 MiB of UTF-8, as `SourceFile.content` and the write's
 * `content` describe it. Restated because the tree carries a size and no "too large" flag;
 * the platform still refuses a larger file `409 SOURCE_FILE_TOO_LARGE`, and that refusal is
 * the control. If the two ever disagree the worst case is a sentence beside a refusal that
 * is still correct.
 */
export const MAX_FILE_BYTES = 1024 * 1024

/**
 * WHETHER THE SCREEN OFFERS TO EDIT AN ENTRY, and when it will not, the sentence it shows
 * instead. It EDITS regular text files only; a binary file (`binary: true`) is SHOWN — an image
 * previewed, anything else offered as a download — and replaced by an upload, since the front-end
 * enablement plan's Task 4 let a commit carry bytes (`[S3]` (2): the old words said Manifest
 * wrote text alone, which stopped being true). A file the platform did not classify as text
 * (`binary` not `false`) is not guessed to be one.
 * A file that is not valid UTF-8 is marked nowhere in the tree — `getFile` refuses it `409
 * SOURCE_FILE_NOT_TEXT`, and the screen renders that refusal.
 */
export function editable(entry: SourceEntry): { ok: true } | { ok: false; why: string } {
  switch (entry.type) {
    case 'directory':
      return { ok: false, why: 'a directory — open a file inside it' }
    case 'symlink':
      return {
        ok: false,
        why: 'a symlink — Manifest reads and writes regular files only',
      }
    case 'submodule':
      return {
        ok: false,
        why: 'a submodule — another repository, which Manifest does not change',
      }
    case 'file':
      if (entry.binary !== false)
        return {
          ok: false,
          why: 'a binary file — shown here, not edited; replace it with Upload a file',
        }
      if ((entry.size ?? 0) > MAX_FILE_BYTES)
        return {
          ok: false,
          why: 'larger than 1 MiB, the most Manifest carries in one file — change it with git',
        }
      return { ok: true }
  }
}

/**
 * ONE EDIT THE PERSON MADE, IN THE ORDER THEY MADE IT. `isNew` is true on the write that
 * CREATES a file — the New file button — and false on every later write to it: the fold
 * below remembers which paths this session created, so a keystroke need not re-state it.
 */
export type Edit =
  | {
      op: 'write'
      path: string
      content: string
      isNew: boolean
      /** An UPLOAD: `content` is the file's bytes as canonical base64 (Task 4). */
      encoding?: 'base64'
    }
  | { op: 'delete'; path: string }

/** Where each path the person touched stands now — what the screen marks beside it. */
export interface Pending {
  path: string
  op: 'write' | 'delete'
  /** The file did not exist at the base commit: this session created it. */
  isNew: boolean
  /** The whole new text, for a write — or the bytes as base64, for an upload. */
  content?: string
  encoding?: 'base64'
}

/**
 * THE EDITS, FOLDED: one entry per path — the last edit to it — sorted by path. **A file
 * created and then deleted in the same session is DROPPED**, because the base commit does
 * not have it and a deletion of it would be refused `409 SOURCE_PATH_NOT_FOUND`; an existing
 * file deleted is a deletion, whatever was written to it first.
 */
export function pending(edits: readonly Edit[]): Pending[] {
  const created = new Set<string>()
  const byPath = new Map<string, Pending>()
  for (const edit of edits) {
    if (edit.op === 'write') {
      if (edit.isNew) created.add(edit.path)
      byPath.set(edit.path, {
        path: edit.path,
        op: 'write',
        isNew: created.has(edit.path),
        content: edit.content,
        ...(edit.encoding === undefined ? {} : { encoding: edit.encoding }),
      })
    } else if (created.has(edit.path)) {
      created.delete(edit.path)
      byPath.delete(edit.path)
    } else {
      byPath.set(edit.path, { path: edit.path, op: 'delete', isNew: false })
    }
  }
  return [...byPath.values()].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  )
}

/** `createCommit`'s `changes`, from the screen's edits — Task 10's `changesFrom`. */
export function changesFrom(edits: readonly Edit[]): Change[] {
  return pending(edits).map((p) =>
    p.op === 'write'
      ? {
          op: 'write',
          path: p.path,
          content: p.content ?? '',
          ...(p.encoding === undefined ? {} : { encoding: p.encoding }),
        }
      : { op: 'delete', path: p.path },
  )
}

/**
 * THE PLATFORM'S RULES FOR A FILE WRITTEN AS BYTES, RESTATED (the front-end enablement plan's Task
 * 4; `source/binary.ts` and `api/representations/source.ts`, which this package cannot import):
 * at most 2 MiB, at a path ending in one of the ten kinds' extensions. Restated so a person is told
 * BEFORE the upload is sent, in the platform's own words; the platform's refusal stays the
 * control — it also checks the bytes are one of the ten kinds, which only it does.
 */
export const BINARY_FILE_BYTES = 2 * 1024 * 1024
export const BINARY_EXTENSIONS: readonly string[] = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.pdf',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
]

/** What an upload breaks, in the platform's words — or undefined when nothing does. */
export function uploadProblem(path: string, bytes: Uint8Array): string | undefined {
  if (bytes.length > BINARY_FILE_BYTES)
    return `'${path}': content decodes to ${bytes.length} bytes; a binary file is at most 2 MiB`
  const lower = path.toLowerCase()
  if (!BINARY_EXTENSIONS.some((ext) => lower.endsWith(ext)))
    return `'${path}' is not named as a file the API writes as bytes — its name must end in ${BINARY_EXTENSIONS.join(', ')}`
  return undefined
}

/** Bytes as CANONICAL base64 — the standard alphabet with its padding — which the platform requires. */
export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  // In chunks: `String.fromCharCode(...bytes)` over 2 MiB overflows the argument limit.
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

const MEDIA_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
}

/**
 * HOW THE SCREEN SHOWS A BINARY FILE: an image previewed from its bytes (`getFile?encoding=base64`
 * as a `data:` URL), anything else offered as a download. By its NAME, because a preview is a
 * convenience — the browser decides what the bytes are, and a wrong guess shows a broken image.
 */
export function binaryView(path: string): {
  kind: 'image' | 'download'
  mediaType: string
} {
  const lower = path.toLowerCase()
  const ext = Object.keys(MEDIA_TYPES).find((e) => lower.endsWith(e))
  const mediaType = ext === undefined ? 'application/octet-stream' : MEDIA_TYPES[ext]!
  return { kind: mediaType.startsWith('image/') ? 'image' : 'download', mediaType }
}

/**
 * WHAT A COMMIT MESSAGE BREAKS (`[S4]` (2)), restated from `api/representations/source.ts`'s
 * `messageProblems` in its words: the platform refuses it `400 REQUEST_INVALID` without naming
 * the character or where, and an escape or a C1 character pasted into a text box is invisible —
 * so the screen says so before it sends.
 */
export function messageProblems(message: string): string[] {
  const problems: string[] = []
  if (/\p{Surrogate}/u.test(message))
    problems.push('the message is not well-formed Unicode (a lone surrogate)')
  if (/(?![\n\t])\p{Cc}/u.test(message))
    problems.push(
      'the message contains a control character — only a line break (\\n) and a tab are allowed; no NUL, carriage return or escape',
    )
  return problems
}

/**
 * WHO MADE A COMMIT, IN THE PLATFORM'S OWN RECORD — never git's author text, which anyone who
 * can push can write (the authoring API plan's Decision 5). `null` is a commit that did not
 * come through Manifest at all.
 */
export function madeThroughSentence(made: MadeThrough): string {
  if (made === null) return 'pushed with git'
  if (made.kind === 'person') return made.name
  return made.tokenName === null
    ? `${made.name}’s agent`
    : `${made.name}’s agent — token '${made.tokenName}'`
}

/** How the history reads a project's first commit, which Manifest writes when it creates one. */
export const STARTING_POINT = 'The project’s starting point, made by Manifest'

/**
 * WHERE A COMMIT CAME FROM, as the history says it. The platform records nobody as making a
 * project's FIRST commit — `madeThrough` is `null` for it, as published — so a commit with no
 * parent and no record is that one, not a person's push (the authoring API plan's sitting 10,
 * F4; the front-end enablement plan's Decision 11: the console's words, not a new kind).
 */
export function commitOrigin(
  commit: Pick<Schemas['CommitSummary'], 'madeThrough' | 'parents'>,
): string {
  if (commit.madeThrough === null && commit.parents.length === 0) return STARTING_POINT
  return madeThroughSentence(commit.madeThrough)
}
