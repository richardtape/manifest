import { ensureDatabaseUrl } from './vitest.env.js'

// Runs before every test file. See vitest.env.ts for why an exported shell
// variable was not enough.
ensureDatabaseUrl()
