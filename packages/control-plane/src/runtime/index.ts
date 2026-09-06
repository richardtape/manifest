export type {
  Driver,
  DriverCapabilities,
  ImageRef,
  InstanceHandle,
  InstanceSpec,
  InstanceState,
  InstanceStatus,
  LogLine,
  LogOpts,
  ExecOpts,
  ExecStream,
  ServiceBinding,
  ServiceHandle,
  SnapshotRef,
  SourceRef,
} from './driver.js'
export { instanceName, serviceName } from './driver.js'
export { createFakeDriver } from './fake-driver.js'
export type { FakeDriverOptions } from './fake-driver.js'
export * from './state-machine.js'

// §13's gate integrity. The api/ route that acts as registry:2's token realm
// reaches these through this module's public surface, never by a deep path.
export {
  applyGrantPolicy,
  issueBuildCredential,
  mintRegistryToken,
  parseScopeStrings,
  verifyBuildCredential,
} from './docker/registry-auth.js'
export type { Grant } from './docker/registry-auth.js'

// The Docker driver's own surface, for the modules §5 lets reach it: `build/` needs
// a client and the log demuxer to run the scanner (Task 12), and reaches them here
// rather than by a deep path into runtime/docker/.
export {
  API_VERSION,
  EngineError,
  assertApiVersionSupported,
  createEngineClient,
  registryAuthHeader,
  resolveSocketPath,
} from './docker/engine.js'
export type { EngineClient } from './docker/engine.js'
export { demux } from './docker/logs.js'
