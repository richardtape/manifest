import { existsSync } from 'node:fs'
import { request as httpRequest, type IncomingMessage } from 'node:http'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Pinned low on purpose. Every call this driver makes has existed since API 1.25;
 * 1.44 is Docker 25.0, comfortably inside this machine's [1.40, 1.55] window and
 * inside far older daemons' too. `assertApiVersionSupported` checks it at boot.
 */
export const API_VERSION = 'v1.44'

export class EngineError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly hint: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'EngineError'
  }
}

/**
 * The socket is discovered, never assumed. `/var/run/docker.sock` is a SYMLINK to
 * `~/.docker/run/docker.sock` on Docker Desktop, and it exists only when "Allow the
 * default Docker socket to be used" is enabled — off by default on some installs.
 * Hardcoding it yields ENOENT on a machine where `docker ps` works fine.
 */
export function resolveSocketPath(env: NodeJS.ProcessEnv = process.env): string {
  const host = env.DOCKER_HOST
  if (host !== undefined && host !== '') {
    if (!host.startsWith('unix://')) {
      throw new EngineError(
        'DOCKER_HOST_NOT_A_SOCKET',
        `DOCKER_HOST is '${host}', which is not a unix socket.`,
        'This driver holds a unix socket. Unset DOCKER_HOST, or point it at a unix:// path. ' +
          'Falling back to the default socket would talk to a different daemon than `docker` does.',
      )
    }
    return host.slice('unix://'.length)
  }
  if (env.MANIFEST_DOCKER_SOCKET) return env.MANIFEST_DOCKER_SOCKET
  // Docker Desktop's own socket first, then the classic path. Checked rather than
  // guessed, because `/var/run/docker.sock` is a symlink that exists only when
  // "Allow the default Docker socket to be used" is enabled.
  const desktop = join(env.HOME ?? homedir(), '.docker', 'run', 'docker.sock')
  return existsSync(desktop) ? desktop : '/var/run/docker.sock'
}

export interface EngineClient {
  get<T>(path: string): Promise<T | undefined>
  post<T>(
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<T | undefined>
  del<T>(path: string): Promise<T | undefined>
  /**
   * `PUT /containers/{id}/archive` — the one endpoint that takes a raw tar body
   * rather than JSON. It is what `docker cp` uses, and it is how §8's
   * SAML_IDP_CERT_PATH and SAML_PRIVATE_KEY_PATH get files into a container
   * without those bytes ever touching a host path.
   */
  putArchive(path: string, tar: Buffer): Promise<void>
  /**
   * For endpoints that answer with a raw byte stream: logs, exec, attach — and for
   * `/images/create`, which answers with newline-delimited JSON progress rather
   * than one document, so `post` cannot parse it.
   *
   * `headers` exists for exactly one of them: `X-Registry-Auth`, which is the only
   * way to hand the daemon a registry credential. See `registryAuthHeader`.
   */
  stream(
    path: string,
    method?: 'GET' | 'POST',
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<IncomingMessage>
}

/**
 * `X-Registry-Auth` as the daemon decodes it: base64 of the auth JSON, WITH
 * padding.
 *
 * Node's `'base64url'` encoding omits the `=` padding and the daemon's decoder
 * rejects the result — measured, and the failure is deeply misleading: the request
 * succeeds, the daemon falls back to **anonymous**, and the error blames the token
 * realm (`failed to fetch anonymous token … connection refused`) rather than the
 * header. The same request with padded base64 pulls in under a second.
 */
export function registryAuthHeader(registryToken: string): Record<string, string> {
  return {
    'X-Registry-Auth': Buffer.from(
      JSON.stringify({ registrytoken: registryToken }),
    ).toString('base64'),
  }
}

export function createEngineClient(opts: {
  socketPath: string
  apiVersion?: string
}): EngineClient {
  const version = opts.apiVersion ?? API_VERSION

  const send = (
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<IncomingMessage> =>
    new Promise((resolve, reject) => {
      // A Buffer is sent AS IS. `PUT /containers/{id}/archive` takes a raw tar
      // stream, and JSON.stringify of a Buffer produces `{"type":"Buffer",...}`,
      // which the daemon accepts with a 200 and extracts nothing.
      const payload =
        body === undefined
          ? undefined
          : Buffer.isBuffer(body)
            ? body
            : JSON.stringify(body)
      const req = httpRequest(
        {
          socketPath: opts.socketPath,
          path: `/${version}${path}`,
          method,
          headers:
            payload === undefined
              ? headers
              : {
                  ...headers,
                  'content-type': Buffer.isBuffer(payload)
                    ? 'application/x-tar'
                    : 'application/json',
                  'content-length': Buffer.byteLength(payload),
                },
        },
        resolve,
      )
      req.on('error', (error) =>
        reject(
          new EngineError(
            'DOCKER_UNREACHABLE',
            `cannot reach the Docker daemon at ${opts.socketPath}: ${error.message}`,
            'Is Docker Desktop running? `make doctor` checks this first.',
          ),
        ),
      )
      if (payload !== undefined) req.write(payload)
      req.end()
    })

  const collect = async (res: IncomingMessage): Promise<string> => {
    let text = ''
    for await (const chunk of res) text += chunk
    return text
  }

  const json = async <T>(
    method: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<T | undefined> => {
    const res = await send(method, path, body, headers)
    const text = await collect(res)
    const status = res.statusCode ?? 0
    // 404 is not an error here. §11 makes both destroys idempotent, and a caller
    // that has to string-match an exception message to implement that is a caller
    // that will get it wrong once.
    if (status === 404) return undefined
    if (status >= 400) {
      let message = text
      try {
        message = (JSON.parse(text) as { message?: string }).message ?? text
      } catch {
        /* the daemon answered with something that is not JSON; keep the body */
      }
      throw new EngineError(
        'DOCKER_ENGINE_ERROR',
        `${method} ${path} failed (${status}): ${message}`,
        "The message is the daemon's own. Check the container name, image digest or network first.",
        status,
      )
    }
    return text === '' ? undefined : (JSON.parse(text) as T)
  }

  return {
    get: (path) => json('GET', path),
    post: (path, body, headers) => json('POST', path, body, headers),
    putArchive: async (path, tar) => {
      const res = await send('PUT', path, tar)
      if (
        res.statusCode !== undefined &&
        (res.statusCode < 200 || res.statusCode >= 300)
      ) {
        // The body carries the daemon's reason, and the commonest one is a
        // parent directory that does not exist — which reads as nothing at all
        // if the status is discarded.
        let text = ''
        for await (const chunk of res) text += chunk
        throw new EngineError(
          'ARCHIVE_UPLOAD_FAILED',
          `PUT ${path} failed (${res.statusCode}): ${text}`,
          'The parent directory must already exist in the image; this writer emits no directory entries.',
        )
      }
      res.resume()
    },
    del: (path) => json('DELETE', path),
    stream: (path, method = 'GET', body, headers) => send(method, path, body, headers),
  }
}

/** A version pin nobody checks is a 400 arriving three tasks later with no explanation. */
export async function assertApiVersionSupported(engine: EngineClient): Promise<void> {
  const info = await engine.get<{
    ApiVersion: string
    MinAPIVersion: string
    Version: string
  }>('/version')
  if (!info) {
    throw new EngineError(
      'DOCKER_UNREACHABLE',
      'the daemon did not answer /version',
      'Is Docker running?',
    )
  }
  // Compare (major, minor) as a pair. Concatenating the digits looks equivalent
  // and stops being so the day Docker ships API 1.100, which would compare as
  // 1100 against 155 and reject a daemon that supports us perfectly well.
  const parts = (v: string): [number, number] => {
    const [major, minor] = v.replace(/^v/, '').split('.')
    return [Number(major), Number(minor)]
  }
  const cmp = (a: [number, number], b: [number, number]) => a[0] - b[0] || a[1] - b[1]
  const pinned = parts(API_VERSION)
  if (
    cmp(pinned, parts(info.ApiVersion)) > 0 ||
    cmp(pinned, parts(info.MinAPIVersion)) < 0
  ) {
    throw new EngineError(
      'DOCKER_API_VERSION_UNSUPPORTED',
      `this driver pins Docker API ${API_VERSION}, but the daemon (${info.Version}) serves ` +
        `[${info.MinAPIVersion}, ${info.ApiVersion}]`,
      `Upgrade Docker, or change API_VERSION in runtime/docker/engine.ts to a version inside that window.`,
    )
  }
}
