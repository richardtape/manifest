import type { FastifyInstance } from 'fastify'
import type { ServerDeps } from '../server.js'

// Stub — Task 19 replaces this. The parameters are declared even though nothing
// uses them yet: the plan's `(): Promise<void> {}` form does not typecheck against
// its own call site in server.ts, which passes two arguments.
export async function registerDeliveryRoutes(
  _app: FastifyInstance,
  _deps: ServerDeps,
): Promise<void> {}
