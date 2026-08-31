import { describeDriverContract } from './driver-contract.js'
import { createFakeDriver } from './fake-driver.js'

describeDriverContract('fake', () => createFakeDriver())
