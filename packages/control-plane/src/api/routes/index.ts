import type { AnyRoute } from '../contract/route.js'
import { agentRoutes } from './agents.js'
import { intakeRoutes } from './intake.js'
import { blueprintRoutes } from './blueprints.js'
import { buildRoutes } from './builds.js'
import { docRoutes } from './docs.js'
import { fleetRoutes } from './fleet.js'
import { instanceRoutes } from './instances.js'
import { launchRoutes } from './launch.js'
import { lifecycleRoutes } from './lifecycle.js'
import { meRoutes } from './me.js'
import { pendingActionReads, pendingActionRoutes } from './pending-actions.js'
import { projectReadRoutes } from './project-reads.js'
import { projectWriteRoutes } from './projects.js'
import { releaseRoutes } from './releases.js'
import { secretRoutes } from './secrets.js'
import { slugRoutes } from './slugs.js'
import { sourceRoutes } from './source.js'
import { tokenRoutes } from './tokens.js'

/**
 * EVERY `/v1` ROUTE (P5a Decision 1). `server.ts` registers this array and
 * `api/contract/document.test.ts` writes the OpenAPI document from it; a route defined
 * and not listed here exists nowhere. Each P5a task appends its own.
 */
export const ROUTE_DEFINITIONS: readonly AnyRoute[] = [
  ...meRoutes,
  ...projectReadRoutes,
  ...projectWriteRoutes,
  ...lifecycleRoutes,
  ...slugRoutes,
  ...blueprintRoutes,
  ...sourceRoutes,
  ...buildRoutes,
  ...releaseRoutes,
  ...instanceRoutes,
  ...secretRoutes,
  ...launchRoutes,
  ...fleetRoutes,
  ...tokenRoutes,
  ...agentRoutes,
  ...intakeRoutes,
  ...pendingActionRoutes,
  ...pendingActionReads,
  ...docRoutes,
]
