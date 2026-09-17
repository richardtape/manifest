import { z } from 'zod/v4'
import { memberRole } from '../../db/index.js'
import type { MemberRow } from '../../projects/index.js'
import { representation, request, Uuid } from '../contract/schemas.js'

export const Member = representation(
  'Member',
  z.object({
    userId: Uuid,
    puid: z.string(),
    displayName: z.string(),
    email: z.string(),
    role: z.enum(memberRole.enumValues),
  }),
)

export const MemberList = representation('MemberList', z.array(Member))

export const AddMemberRequest = request(
  'AddMemberRequest',
  z.strictObject({
    puid: z
      .string()
      .min(1)
      .max(64)
      .describe('The person’s ubcEduCwlPuid. They must have signed in once.'),
    role: z.enum(memberRole.enumValues),
  }),
)

export function toMember(row: MemberRow): z.input<typeof Member> {
  return {
    userId: row.userId,
    puid: row.puid,
    displayName: row.displayName,
    email: row.email,
    role: row.role,
  }
}
