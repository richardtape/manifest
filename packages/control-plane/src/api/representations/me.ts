import { z } from 'zod/v4'
import type { users } from '../../db/index.js'
import { mayBuild } from '../../identity/index.js'
import { representation, Uuid } from '../contract/schemas.js'

export const Me = representation(
  'Me',
  z
    .object({
      id: Uuid.describe(
        'The person’s user id on this platform — what `listMembers` calls `userId`.',
      ),
      puid: z.string().describe("The person's ubcEduCwlPuid (§9)."),
      displayName: z.string().describe('Their name, as CWL gave it.'),
      email: z.string().describe('Their address, as CWL gave it.'),
      role: z
        .enum(['admin', 'member'])
        .describe('The platform role THIS SESSION is authorized as.'),
      mayBuild: z
        .boolean()
        .describe(
          'Whether this person may build: create a project, start an intake session, or be added to a project. True for a faculty member — by the CWL affiliation their last sign-in carried — and for a platform administrator; false for everyone else, who should be told that building is not open to them yet. The three operations refuse such a person `BUILDING_NOT_OPEN`, or `MEMBER_MAY_NOT_BUILD` when they are the person being added. A person who stops being faculty keeps the projects they are on.',
        ),
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
    // The platform decides, here and at each refusal, from ONE predicate (FE-39): the session's role,
    // because it is the one every authorization decision uses, and the row's affiliations, because a
    // sign-in writes them at the same moment it issues the session.
    mayBuild: mayBuild({ role, affiliations: user.affiliations }),
  }
}
