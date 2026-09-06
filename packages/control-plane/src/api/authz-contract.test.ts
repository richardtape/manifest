import { describeAuthorizationContract } from './authz-contract.js'
import { testDeps } from './testing.js'

describeAuthorizationContract('fake driver', () => testDeps({ devAuth: true }))
