import { z } from 'zod/v4'
import { memberRole } from '../../db/index.js'
import type { MemberRow } from '../../projects/index.js'
import { representation, request, Uuid } from '../contract/schemas.js'

export const Member = representation(
  'Member',
  z
    .object({
      userId: Uuid.describe('The person’s user id — what `removeMember` names.'),
      puid: z.string().describe('Their ubcEduCwlPuid (§9) — what `addMember` names.'),
      displayName: z.string().describe('Their name, as CWL gave it.'),
      email: z.string().describe('Their address, as CWL gave it.'),
      role: z
        .enum(memberRole.enumValues)
        .describe(
          '`owner` may do everything on the project; `collaborator` the same except managing members, deleting the project and promoting a release to production (§13).',
        ),
    })
    .describe('A person who may work on the project, and their role on it.'),
)

export const MemberList = representation(
  'MemberList',
  z
    .array(Member)
    .describe('Everyone who may work on the project; every project has an owner.'),
)

export const AddMemberRequest = request(
  'AddMemberRequest',
  z
    .strictObject({
      puid: z
        .string()
        .min(1)
        .max(64)
        .describe('The person’s ubcEduCwlPuid. They must have signed in once.'),
      role: z
        .enum(memberRole.enumValues)
        .describe('The role to grant: `owner` or `collaborator`.'),
    })
    .describe(
      'Who to add, and as what. Adding someone who is already a member changes their role.',
    ),
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
