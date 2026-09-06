export interface ServiceImage {
  image: string
  /** §12: pinned by digest, not tag. Read off this machine on 2026-08-31. */
  digest: string
  port: number
  supportedVersions: string[]
  /**
   * The URI scheme, which is NOT the service type. `binding.type` is `mongo` and
   * the scheme is `mongodb` — measured, `mongo://…` is rejected outright by
   * mongosh with `MongoshInvalidInputError: Invalid URI`.
   */
  uriScheme: string
  /**
   * Query string the endpoint needs to be usable. Mongo's root user is created in
   * the `admin` database, so a connection aimed at the app's own database must say
   * `authSource=admin` or every authentication attempt fails.
   */
  uriQuery: string
  /**
   * The container-side liveness probe, run by the DAEMON as a Docker healthcheck.
   * It cannot be a probe the control plane makes itself: the control plane is a
   * host process and §21 establishes it cannot reach container IPs, so it asks
   * the daemon whether the container is healthy instead of connecting.
   */
  healthTest: string[]
}

export class ServiceCatalogueError extends Error {
  readonly code = 'SERVICE_NOT_IN_CATALOGUE'
  constructor(
    message: string,
    readonly hint: string,
  ) {
    super(message)
    this.name = 'ServiceCatalogueError'
  }
}

/**
 * §20: "service images are platform-owned and platform-pinned; apps choose a
 * supported version line, not an arbitrary tag". This is that sentence. It is also
 * what makes the fleet-wide "rebuild every app on base image X" operation possible
 * later — there is a fleet only if the platform chose the images.
 */
export const SERVICE_CATALOGUE: Record<'mongo' | 'qdrant', ServiceImage> = {
  mongo: {
    image: 'mongodb/mongodb-community-server',
    digest: 'sha256:56d07a0227ceeb04ba763bfe5681660c465114d2f6fb943e8e8f3718134b5436',
    port: 27017,
    supportedVersions: ['7'],
    uriScheme: 'mongodb',
    uriQuery: 'authSource=admin',
    // `ping` is served before authentication, which makes it useless as a
    // SECURITY assertion and exactly right as a LIVENESS one.
    healthTest: ['CMD', 'mongosh', '--quiet', '--eval', 'db.adminCommand({ping:1}).ok'],
  },
  // §21: opt-in, not part of the default blueprint — one per app per environment is
  // affordable on UBC infrastructure and is not affordable on a laptop.
  qdrant: {
    image: 'qdrant/qdrant',
    digest: 'sha256:94728574965d17c6485dd361aa3c0818b325b9016dac5ea6afec7b4b2700865f',
    port: 6333,
    supportedVersions: ['1'],
    uriScheme: 'http',
    uriQuery: '',
    healthTest: ['CMD', 'curl', '-fsS', 'http://127.0.0.1:6333/readyz'],
  },
}

export function resolveServiceImage(type: string, version: string): ServiceImage {
  const entry = SERVICE_CATALOGUE[type as keyof typeof SERVICE_CATALOGUE]
  if (!entry) {
    throw new ServiceCatalogueError(
      `no platform image for service type '${type}'`,
      `Supported types: ${Object.keys(SERVICE_CATALOGUE).join(', ')}.`,
    )
  }
  if (!entry.supportedVersions.includes(version)) {
    throw new ServiceCatalogueError(
      `'${type}' version line '${version}' is not supported`,
      `Supported version lines for ${type}: ${entry.supportedVersions.join(', ')}. ` +
        'Apps choose a version line, never an image tag (§20).',
    )
  }
  return entry
}
