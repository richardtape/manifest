import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { tarArchive } from './archive.js'

/**
 * Asserted by handing the bytes to a REAL tar. A hand-rolled format checked only
 * by a hand-rolled parser proves the two agree with each other, which is not the
 * claim — the claim is that Docker's extractor accepts it.
 */
function extract(tar: Buffer): string {
  const dir = mkdtempSync(join(tmpdir(), 'mf-tar-'))
  const file = join(dir, 'a.tar')
  writeFileSync(file, tar)
  execFileSync('tar', ['-xf', file, '-C', dir])
  return dir
}

describe('tarArchive (§8: the platform places files INSIDE the container)', () => {
  it('produces an archive real tar can extract, with the content intact', () => {
    const tar = tarArchive([
      { path: '/app/idp-signing.crt', contents: '-----BEGIN-----\nx\n' },
    ])
    const dir = extract(tar)
    try {
      expect(readFileSync(join(dir, 'app/idp-signing.crt'), 'utf8')).toBe(
        '-----BEGIN-----\nx\n',
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('carries the mode, so a private key is not world-readable', () => {
    const tar = tarArchive([{ path: '/app/sp.pem', contents: 'k', mode: 0o400 }])
    const dir = extract(tar)
    try {
      // 0o400 & 0o777. tar restores permissions for the extracting user.
      expect(statSync(join(dir, 'app/sp.pem')).mode & 0o777).toBe(0o400)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('writes entries whose content length is not a multiple of 512', () => {
    // The padding rule is the easiest thing to get wrong and the failure is a
    // corrupt archive several entries later, never at the offending one.
    const tar = tarArchive([
      { path: '/app/a', contents: 'x'.repeat(513) },
      { path: '/app/b', contents: 'y' },
    ])
    const dir = extract(tar)
    try {
      expect(readFileSync(join(dir, 'app/a'), 'utf8')).toHaveLength(513)
      expect(readFileSync(join(dir, 'app/b'), 'utf8')).toBe('y')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('refuses a path it cannot represent rather than truncating it', () => {
    // USTAR's name field is 100 bytes. Silently truncating would write a file at
    // a path nobody asked for, and the app's readFileSync would ENOENT somewhere
    // far away from the cause.
    expect(() =>
      tarArchive([{ path: `/app/${'n'.repeat(120)}`, contents: 'x' }]),
    ).toThrow(/too long/i)
  })

  it('refuses a relative path, because the extraction root is /', () => {
    expect(() => tarArchive([{ path: 'app/x', contents: 'y' }])).toThrow(/absolute/i)
  })
})
