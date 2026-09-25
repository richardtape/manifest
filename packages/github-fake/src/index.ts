/**
 * `@manifest/github-fake` — a GitHub-compatible FAKE for D5's driver 2 (the D5 plan, Task 4).
 * NOT GitHub. Tests start one in process through `@manifest/github-fake/testing`; the
 * container runs `main.ts`.
 */
export { createFakeServer, type FakeConfig, type FakeServer } from './server.js'
export type { FakeRepo, FakeState, Protection } from './state.js'
export type { Grant, Permission } from './app-auth.js'
