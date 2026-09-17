import type { FastifyRequest } from 'fastify'
import type { Actor } from '../projects/index.js'

export type SessionActor = Actor & { puid: string }

/**
 * Its own file so `api/contract/route.ts` can use it without importing `server.ts`, which
 * imports the route definitions — a cycle that works only until something reads a value
 * at module load (P5a Task 6).
 */
export function requireActor(request: FastifyRequest): SessionActor {
  if (!request.actor) {
    throw Object.assign(new Error('a session is required'), { statusCode: 401 })
  }
  return request.actor
}
