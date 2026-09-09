/**
 * A minimal USTAR writer, for `PUT /containers/{id}/archive`.
 *
 * §8 specifies two variables as paths to files the PLATFORM mounts —
 * `SAML_IDP_CERT_PATH` and `SAML_PRIVATE_KEY_PATH` — and `InstanceSpec` had no
 * way to put a file in a container at all, so those rows named paths nothing
 * created. This is the mechanism that fixes that.
 *
 * THE ARCHIVE ENDPOINT RATHER THAN A BIND MOUNT, deliberately. A bind would put
 * the SP's private key on the developer's filesystem in plaintext, which is
 * exactly what `secrets/` exists to avoid, and §20 calls production SP private
 * keys the highest-value identity secrets. Through the archive endpoint the
 * bytes go from the control plane's memory into the container's own filesystem
 * and touch no host path. It is what `docker cp` does.
 *
 * Dependency-free for the same reason `logs.ts` demuxes by hand: the format is
 * 512-byte blocks and a checksum, and this repository already carries the
 * discipline for that. `archive.test.ts` hands the bytes to a REAL tar, because
 * a hand-rolled writer checked by a hand-rolled reader only proves the two
 * agree with each other.
 */

export interface InstanceFile {
  /** Absolute path inside the container. Its parent directory must exist —
   *  no directory entries are emitted, because creating `/app` would rewrite
   *  the mode and ownership of the directory holding the app's own code. */
  path: string
  contents: string
  /** Octal. Default 0o444: readable by whatever uid the blueprint runs as,
   *  without this writer having to know it. A private key wants 0o400 and an
   *  explicit `uid`. */
  mode?: number
  /** Owner uid inside the container. Default 0 (root).
   *
   *  PREFER root-owned + group-readable over app-owned. The files volume must be
   *  mounted READ-WRITE — measured 2026-09-08, the daemon refuses to write into
   *  a `:ro` mount ("mounted volume is marked read-only") — so ownership is what
   *  carries the protection. A file the app OWNS, the app can chmod; a
   *  root-owned 0440 file with the app's gid, it can read and cannot alter. */
  uid?: number
  /** Owner gid inside the container. Default 0. Set it to the blueprint's group
   *  for a key the app must read but must not be able to rewrite. */
  gid?: number
}

const BLOCK = 512

/** Octal, zero-padded, NUL-terminated — USTAR's numeric field encoding. */
function octal(value: number, length: number): string {
  const digits = value.toString(8)
  if (digits.length > length - 1) {
    throw new Error(`value ${value} does not fit in a ${length}-byte octal field`)
  }
  return digits.padStart(length - 1, '0') + '\0'
}

function header(file: InstanceFile, size: number): Buffer {
  const name = file.path.replace(/^\/+/, '')
  if (!file.path.startsWith('/')) {
    throw new Error(
      `tarArchive: '${file.path}' must be an absolute path — the archive is ` +
        'extracted at the container root, so a relative name lands somewhere ' +
        'that depends on the daemon rather than on this code',
    )
  }
  if (Buffer.byteLength(name) > 100) {
    throw new Error(
      `tarArchive: '${file.path}' is too long for USTAR's 100-byte name field. ` +
        'Truncating it would write the file at a path nobody asked for.',
    )
  }

  const block = Buffer.alloc(BLOCK)
  block.write(name, 0, 100, 'utf8')
  block.write(octal(file.mode ?? 0o444, 8), 100, 8, 'utf8')
  block.write(octal(file.uid ?? 0, 8), 108, 8, 'utf8')
  block.write(octal(file.gid ?? 0, 8), 116, 8, 'utf8')
  block.write(octal(size, 12), 124, 12, 'utf8')
  // A FIXED mtime, not Date.now(). §13 binds an approval to a build digest and
  // the driver contract asserts that identical inputs produce identical output;
  // a wall-clock timestamp here would make two identical deploys differ.
  block.write(octal(0, 12), 136, 12, 'utf8')
  // The checksum is computed with this field read as eight spaces.
  block.write('        ', 148, 8, 'utf8')
  block.write('0', 156, 1, 'utf8') // typeflag: regular file
  block.write('ustar\0', 257, 6, 'utf8')
  block.write('00', 263, 2, 'utf8')

  let sum = 0
  for (const byte of block) sum += byte
  // Six octal digits, NUL, space — the encoding GNU tar and Docker both accept.
  block.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'utf8')
  return block
}

/** The files as one uncompressed tar stream, ready for the archive endpoint. */
export function tarArchive(files: InstanceFile[]): Buffer {
  const parts: Buffer[] = []
  for (const file of files) {
    const body = Buffer.from(file.contents, 'utf8')
    parts.push(header(file, body.length), body)
    const remainder = body.length % BLOCK
    if (remainder !== 0) parts.push(Buffer.alloc(BLOCK - remainder))
  }
  // Two zero blocks mark the end of the archive. Without them tar reports
  // "unexpected end of file" and Docker rejects the upload.
  parts.push(Buffer.alloc(BLOCK * 2))
  return Buffer.concat(parts)
}
