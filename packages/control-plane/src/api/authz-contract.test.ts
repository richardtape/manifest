import { fakeLiteLlm } from '../ai/testing.js'
import { describeAuthorizationContract } from './authz-contract.js'
import { testDeps } from './testing.js'

// A RECORDING GATEWAY, not `testDeps()`'s honest `llm: undefined` (the front-end enablement plan's
// Task 10): the agent-session rows' `pass` means a key was minted, and the harness has no LiteLLM.
// Only this row's server gets it — every other test keeps the undefined gateway it meets by default.
describeAuthorizationContract('fake driver', async () => ({
  ...(await testDeps()),
  llm: fakeLiteLlm(),
}))
