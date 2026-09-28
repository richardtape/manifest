import { describe, expect, it } from 'vitest'
import {
  binaryView,
  changesFrom,
  editable,
  commitOrigin,
  madeThroughSentence,
  MAX_FILE_BYTES,
  messageProblems,
  toBase64,
  uploadProblem,
  type SourceEntry,
} from './code-state.js'

/**
 * THE CODE SCREEN'S PURE HALF (the authoring API plan's Task 10). The console has no DOM
 * tier (P5c Decision 7), so what the screen decides — which files it offers to edit, and
 * what it sends as `createCommit`'s `changes` — is decided here, where a test can see it.
 */
const file = (over: Partial<SourceEntry> = {}): SourceEntry => ({
  path: 'src/app.js',
  type: 'file',
  mode: '100644',
  size: 39,
  binary: false,
  ...over,
})

describe('editable — which entries the Code screen offers to edit', () => {
  it('offers a text file of at most 1 MiB, executable or not', () => {
    expect(editable(file())).toEqual({ ok: true })
    expect(editable(file({ mode: '100755' }))).toEqual({ ok: true })
    // The limit is INCLUSIVE, as the platform's is: 1 MiB exactly is readable.
    expect(editable(file({ size: MAX_FILE_BYTES }))).toEqual({ ok: true })
    expect(MAX_FILE_BYTES).toBe(1024 * 1024)
  })

  it('says why it will not edit anything else, in the sentence the screen shows', () => {
    expect(editable(file({ binary: true }))).toEqual({
      ok: false,
      why: 'a binary file — shown here, not edited; replace it with Upload a file',
    })
    expect(editable(file({ size: MAX_FILE_BYTES + 1 }))).toEqual({
      ok: false,
      why: 'larger than 1 MiB, the most Manifest carries in one file — change it with git',
    })
    expect(
      editable(file({ type: 'symlink', mode: '120000', size: 7, binary: null })),
    ).toEqual({
      ok: false,
      why: 'a symlink — Manifest reads and writes regular files only',
    })
    expect(
      editable(file({ type: 'submodule', mode: '160000', size: null, binary: null })),
    ).toEqual({
      ok: false,
      why: 'a submodule — another repository, which Manifest does not change',
    })
    expect(
      editable(file({ type: 'directory', mode: '040000', size: null, binary: null })),
    ).toEqual({ ok: false, why: 'a directory — open a file inside it' })
  })

  /**
   * A FILE WHOSE `binary` IS NOT `false` IS NOT OFFERED. The document types it `boolean |
   * null`, null meaning "not a file" — so a file answered with `null` is a platform that did
   * not say, and the screen does not guess that it is text.
   */
  it('does not guess that a file the platform did not classify is text', () => {
    expect(editable(file({ binary: null })).ok).toBe(false)
  })
})

describe('changesFrom — the screen’s pending edits as createCommit’s changes', () => {
  it('sends a write as a write and a deletion as a deletion', () => {
    expect(
      changesFrom([{ op: 'write', path: 'src/app.js', content: 'x\n', isNew: false }]),
    ).toEqual([{ op: 'write', path: 'src/app.js', content: 'x\n' }])
    expect(changesFrom([{ op: 'delete', path: 'README.md' }])).toEqual([
      { op: 'delete', path: 'README.md' },
    ])
  })

  it('drops a file created and deleted in the same session — it would be SOURCE_PATH_NOT_FOUND', () => {
    expect(
      changesFrom([
        { op: 'write', path: 'notes.txt', content: 'draft', isNew: true },
        { op: 'delete', path: 'notes.txt' },
      ]),
    ).toEqual([])
  })

  it('sends one change per path — the last edit to it — sorted by path', () => {
    expect(
      changesFrom([
        { op: 'write', path: 'z.js', content: '1', isNew: false },
        { op: 'write', path: 'a.js', content: 'first', isNew: false },
        { op: 'write', path: 'a.js', content: 'second', isNew: false },
      ]),
    ).toEqual([
      { op: 'write', path: 'a.js', content: 'second' },
      { op: 'write', path: 'z.js', content: '1' },
    ])
  })

  /**
   * THE DELETION IS DROPPED ONLY FOR A FILE THIS SESSION CREATED. An existing file written
   * and then deleted is a deletion of a file `baseCommit` has, which the platform needs to
   * hear; and a file deleted and then written again is a write, whatever came before.
   */
  it('keeps the deletion of an existing file, and a write after a deletion', () => {
    expect(
      changesFrom([
        { op: 'write', path: 'server.js', content: 'changed', isNew: false },
        { op: 'delete', path: 'server.js' },
      ]),
    ).toEqual([{ op: 'delete', path: 'server.js' }])
    expect(
      changesFrom([
        { op: 'delete', path: 'server.js' },
        { op: 'write', path: 'server.js', content: 'back', isNew: false },
      ]),
    ).toEqual([{ op: 'write', path: 'server.js', content: 'back' }])
  })

  it('remembers a file was created even after it is written again, and drops it when deleted', () => {
    expect(
      changesFrom([
        { op: 'write', path: 'new.js', content: '', isNew: true },
        // The screen writes every keystroke without re-stating that the file is new.
        { op: 'write', path: 'new.js', content: 'typed', isNew: false },
        { op: 'delete', path: 'new.js' },
        { op: 'write', path: 'kept.js', content: 'k', isNew: true },
      ]),
    ).toEqual([{ op: 'write', path: 'kept.js', content: 'k' }])
  })
})

/**
 * WHO MADE A COMMIT is the platform's record, never git's author text (Decision 5), and the
 * history says it in these words — the three the plan names.
 */
describe('madeThroughSentence — who made a commit, from the platform’s record', () => {
  it('names the person, the person’s agent and its token, or says it was pushed with git', () => {
    expect(
      madeThroughSentence({ kind: 'person', name: 'Ada Lovelace', tokenName: null }),
    ).toBe('Ada Lovelace')
    expect(
      madeThroughSentence({
        kind: 'agent',
        name: 'Ada Lovelace',
        tokenName: 'claude-code',
      }),
    ).toBe("Ada Lovelace’s agent — token 'claude-code'")
    expect(madeThroughSentence(null)).toBe('pushed with git')
  })

  it('reads the FIRST commit, which the platform records nobody as making, as the project’s starting point (F4)', () => {
    // Manifest writes a project's first commit when it creates the project; `madeThrough` is
    // `null` for it, as published, and read as a person's push it said "pushed with git".
    expect(commitOrigin({ madeThrough: null, parents: [] })).toBe(
      'The project’s starting point, made by Manifest',
    )
    // Every other commit with no record is still a push, and says so.
    expect(commitOrigin({ madeThrough: null, parents: ['a'.repeat(40)] })).toBe(
      'pushed with git',
    )
    // A first commit the platform DOES record names who made it, as any other does.
    expect(
      commitOrigin({
        madeThrough: { kind: 'person', name: 'Ada Lovelace', tokenName: null },
        parents: [],
      }),
    ).toBe('Ada Lovelace')
  })
})

/**
 * BINARY FILES AND A COMMIT'S MESSAGE (the front-end enablement plan's Task 13, `[S3]` and `[S4]`):
 * what the Code screen says and checks BEFORE it sends — each rule the platform's, restated, with
 * the platform's refusal still the control.
 */
describe('binary files and the message, before anything is sent', () => {
  it('says a binary file is shown, not edited, and names an upload as the way to replace it', () => {
    expect(
      editable(file({ type: 'file', mode: '100644', size: 10, binary: true })),
    ).toEqual({
      ok: false,
      why: 'a binary file — shown here, not edited; replace it with Upload a file',
    })
  })

  it('previews an image by its extension, and offers anything else as a download', () => {
    expect(binaryView('public/logo.PNG')).toEqual({
      kind: 'image',
      mediaType: 'image/png',
    })
    expect(binaryView('assets/photo.jpeg')).toEqual({
      kind: 'image',
      mediaType: 'image/jpeg',
    })
    expect(binaryView('docs/syllabus.pdf')).toEqual({
      kind: 'download',
      mediaType: 'application/pdf',
    })
    expect(binaryView('fonts/body.woff2').kind).toBe('download')
  })

  it('refuses an upload the platform would refuse — too large, or not named as a kind it writes', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
    expect(uploadProblem('public/logo.png', png)).toBeUndefined()
    expect(uploadProblem('public/logo.svg', png)).toBe(
      "'public/logo.svg' is not named as a file the API writes as bytes — its name must end in .png, .jpg, .jpeg, .gif, .webp, .ico, .pdf, .woff, .woff2, .ttf, .otf",
    )
    const big = new Uint8Array(2 * 1024 * 1024 + 1)
    expect(uploadProblem('public/big.png', big)).toBe(
      `'public/big.png': content decodes to ${big.length} bytes; a binary file is at most 2 MiB`,
    )
  })

  it('writes an upload as canonical base64, and sends it with its encoding', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255])
    const content = toBase64(bytes)
    expect(content).toBe(Buffer.from(bytes).toString('base64'))
    expect(
      changesFrom([
        { op: 'write', path: 'public/a.png', content, isNew: true, encoding: 'base64' },
      ]),
    ).toEqual([{ op: 'write', path: 'public/a.png', content, encoding: 'base64' }])
    // A text write carries no encoding at all — the default.
    expect(
      changesFrom([{ op: 'write', path: 'a.js', content: 'x', isNew: true }]),
    ).toEqual([{ op: 'write', path: 'a.js', content: 'x' }])
  })

  it('says what is wrong with a message before it is sent, in the platform’s words', () => {
    expect(messageProblems('Greet the world\n\n\tand the class')).toEqual([])
    expect(messageProblems('colour \u001b[31mred')).toEqual([
      'the message contains a control character — only a line break (\\n) and a tab are allowed; no NUL, carriage return or escape',
    ])
    expect(messageProblems('half a pair \ud800')).toEqual([
      'the message is not well-formed Unicode (a lone surrogate)',
    ])
  })
})
