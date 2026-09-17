import type { AnyRoute } from '../contract/route.js'
import { meRoutes } from './me.js'

/**
 * EVERY `/v1` ROUTE (P5a Decision 1). `server.ts` registers this array and
 * `api/contract/document.test.ts` writes the OpenAPI document from it; a route defined
 * and not listed here exists nowhere. Each P5a task appends its own.
 */
export const ROUTE_DEFINITIONS: readonly AnyRoute[] = [...meRoutes]
