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
