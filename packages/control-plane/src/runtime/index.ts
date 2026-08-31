export type {
  Driver, DriverCapabilities, ImageRef, InstanceHandle, InstanceSpec, InstanceState,
  InstanceStatus, LogLine, LogOpts, ExecOpts, ExecStream, ServiceBinding,
  ServiceHandle, SnapshotRef, SourceRef,
} from './driver.js'
export { instanceName, serviceName } from './driver.js'
export { createFakeDriver } from './fake-driver.js'
export type { FakeDriverOptions } from './fake-driver.js'
