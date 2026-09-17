import { z } from 'zod/v4'
import type { users } from '../../db/index.js'
import { representation, Uuid } from '../contract/schemas.js'

export const Me = representation(
  'Me',
  z
    .object({
      id: Uuid,
      puid: z.string().describe("The person's ubcEduCwlPuid (§9)."),
      displayName: z.string(),
      email: z.string(),
      role: z
        .enum(['admin', 'member'])
        .describe('The platform role THIS SESSION is authorized as.'),
    })
    .describe('The person the session belongs to.'),
)

/**
 * The role comes from the SESSION, the rest from the row. Sessions are stateless and carry
 * the role they were issued with (brief §7 item 6), so after `scripts/admin-grant.sh` the
 * row says `admin` and the session says `member` until the person signs in again — and it
 * is the session's role every authorization decision uses. Showing the row's would tell a
 * person they hold a capability their next request will be refused.
 */
export function toMe(
  user: typeof users.$inferSelect,
  role: 'admin' | 'member',
): z.input<typeof Me> {
  return {
    id: user.id,
    puid: user.ubcCwlPuid,
    displayName: user.displayName,
    email: user.email,
    role,
  }
}
