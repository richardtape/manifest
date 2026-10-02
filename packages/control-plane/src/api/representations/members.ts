import { z } from 'zod/v4'
import { memberRole } from '../../db/index.js'
import type { MemberRow } from '../../projects/index.js'
import { representation, request, Uuid } from '../contract/schemas.js'

export const Member = representation(
  'Member',
  z
    .object({
      userId: Uuid.describe('The person’s user id — what `removeMember` names.'),
      puid: z
        .string()
        .describe('Their ubcEduCwlPuid — the one key a person is identified by.'),
      cwlLogin: z
        .string()
        .nullable()
        .describe(
          'Their CWL login name, lowercased, as they last signed in with it — what a colleague adds them by. Null if CWL has never released it.',
        ),
      displayName: z.string().describe('Their name, as CWL gave it.'),
      email: z.string().describe('Their address, as CWL gave it.'),
      role: z
        .enum(memberRole.enumValues)
        .describe(
          '`owner` may do everything on the project; `collaborator` the same except managing members, deleting the project and promoting a release to production.',
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

/**
 * WHO TO ADD, BY EXACTLY ONE KEY (the front-end enablement plan's Task 7, Decision 14) — their
 * PUID, their CWL login name or their email. Additive: a client that sends `puid` alone is
 * unchanged. Two keys, or none, is a malformed request, because a request naming a person two
 * ways that disagree has no answer that is not a guess.
 */
export const AddMemberRequest = request(
  'AddMemberRequest',
  z
    .strictObject({
      puid: z.string().min(1).max(64).optional().describe('The person’s ubcEduCwlPuid.'),
      cwlLogin: z
        .string()
        .min(1)
        .max(64)
        .optional()
        .describe(
          'The person’s CWL login name, as they type it to sign in — matched whatever its case.',
        ),
      email: z
        .email()
        .max(254)
        .optional()
        .describe(
          'The person’s email address, as UBC releases it — matched whatever its case. Two people sharing one address is `MEMBER_USER_AMBIGUOUS`; add them by CWL login name instead.',
        ),
      role: z
        .enum(memberRole.enumValues)
        .describe('The role to grant: `owner` or `collaborator`.'),
    })
    .superRefine((body, ctx) => {
      const keys = [body.puid, body.cwlLogin, body.email].filter((k) => k !== undefined)
      if (keys.length !== 1) {
        ctx.addIssue({
          code: 'custom',
          message: 'name the person by exactly one of puid, cwlLogin or email',
        })
      }
    })
    .describe(
      'Who to add, and as what — the person by EXACTLY ONE of their PUID, CWL login name or email. They must have signed in to Manifest once. Adding someone who is already a member changes their role.',
    ),
)

export function toMember(row: MemberRow): z.input<typeof Member> {
  return {
    userId: row.userId,
    puid: row.puid,
    cwlLogin: row.cwlLogin,
    displayName: row.displayName,
    email: row.email,
    role: row.role,
  }
}
