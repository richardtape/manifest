import type { AnyRoute } from '../contract/route.js'
import { blueprintRoutes } from './blueprints.js'
import { buildRoutes } from './builds.js'
import { meRoutes } from './me.js'
import { projectReadRoutes } from './project-reads.js'
import { createProjectRoutes } from './projects.js'
import { releaseRoutes } from './releases.js'
import { slugRoutes } from './slugs.js'

/**
 * EVERY `/v1` ROUTE (P5a Decision 1). `server.ts` registers this array and
 * `api/contract/document.test.ts` writes the OpenAPI document from it; a route defined
 * and not listed here exists nowhere. Each P5a task appends its own.
 */
export const ROUTE_DEFINITIONS: readonly AnyRoute[] = [
  ...meRoutes,
  ...projectReadRoutes,
  ...createProjectRoutes,
  ...slugRoutes,
  ...blueprintRoutes,
  ...buildRoutes,
  ...releaseRoutes,
]
