import { randomUUID } from 'node:crypto'
import { describeDriverContract } from './driver-contract.js'
import {
  FAKE_NEVER_READY_PATH,
  createFakeDriver,
  type FakeDriver,
} from './fake-driver.js'

// ONE driver for the contract's continuity block: those tests ensure, retire and read
// routes across calls, and a fresh in-memory driver per call would forget all of it.
const shared = createFakeDriver()

describeDriverContract('fake', () => shared, {
  continuity: {
    neverReady: (spec) => ({ ...spec, healthPath: FAKE_NEVER_READY_PATH }),
    holdRequest: async (driver, hostname) => ({
      done: (driver as FakeDriver).holdRequest(hostname, 400),
    }),
    holdMs: 400,
    shortDrainMs: 50,
    // The fake edge is one map, so dropping is all-or-nothing — which is what
    // restarting the real edge does anyway (ORIENTATION §4).
    dropRoute: async () => {
      ;(shared as FakeDriver).dropRoutes()
    },
    hostname: () => `fake-${randomUUID().slice(0, 8)}.staging.manifest.internal`,
  },
})
