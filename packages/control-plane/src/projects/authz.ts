import { and, eq } from 'drizzle-orm'
import type { Db } from '../db/index.js'
import { projectMembers, projects } from '../db/index.js'

export type ProjectRole = 'owner' | 'collaborator'

/**
 * Every capability a ROLE can hold, as a value — and `Capability` is derived from it,
 * the way `EventType` is derived from `EVENT_TYPES` (`observability/events.ts`).
 *
 * A LIST rather than a bare union since P5b Task 4, because the mint route's request
 * schema has to name them: a `capabilities: string[]` on the wire would accept a typo
 * and mint a token that can do nothing, with nothing saying so. One list keeps the
 * document, the validator and the type from drifting — deriving the type from the array
 * means a member added to one is added to all three.
 */
export const CAPABILITIES = [
  'project:read',
  'project:write',
  'project:delete',
  'members:manage',
  'build:create',
  'release:create',
  'release:deploy',
  /**
   * §13 and D24: putting a release in front of real students, as distinct from
   * deploying it to staging. Separate from `release:deploy` because D24 forbids
   * exactly this one to a delegated token and permits the other — one capability
   * covering both would make the rule unstatable (P5b `[M2]`).
   */
  'release:promote',
  'release:approve',
  /**
   * §9 and R1 (P6a Task 6): recording what UBC IAM and the Privacy Office actually said.
   * **External state Manifest tracks and drives** (D19), so it is an administrator's and
   * not an owner's — a faculty member cannot assert that their own PIA was approved.
   *
   * **IT IS NOT ONE OF D24'S PRIVILEGED FOUR, AND SO `assertCapability` WILL NOT REFUSE A
   * TOKEN THAT HOLDS IT.** Adding it to `PRIVILEGED` would be a spec change (D24 names
   * four). The control is therefore `requireSession` on every route that asserts this,
   * and `records.test.ts` proves a token holding `launch:record` is still refused
   * `403 TOKEN_CREDENTIAL_REFUSED` — because a token that could satisfy the platform's
   * own launch gate is D14 exactly inverted (P6a Decision 4).
   */
  'launch:record',
  'quota:set',
] as const

export type Capability = (typeof CAPABILITIES)[number]

/**
 * D24's forbidden set, which is §20's step-up set — a SUPERSET of `Capability`.
 *
 * `secret:read` is in D24's list and deliberately NOT in `Capability`: no route reads a
 * secret in Phase 1 (P5b Decision 14), and adding it to the union would create a
 * capability nothing grants and nothing checks, which is the no-caller shape ORIENTATION
 * §9 names four times (measured as P5b `[M8]`). D24's list is a statement about the
 * SPEC; `Capability` is a statement about the routes that exist. The superset is what
 * lets `privileged.test.ts` hold the two against each other.
 */
export const PRIVILEGED_CAPABILITIES = [...CAPABILITIES, 'secret:read'] as const

export type PrivilegedCapability = (typeof PRIVILEGED_CAPABILITIES)[number]

/**
 * D24's four, and §20's step-up four. ONE list, because the spec says keeping the two
 * aligned is a test rather than a convention — `privileged.test.ts` is that test.
 *
 * A delegated token may NEVER hold one of these, however it was minted (P5b Task 6).
 * Step-up re-authentication for an interactive session is deferred (Rich, R1) and is
 * owed by the plan that adds the routes it would protect.
 */
export const PRIVILEGED: ReadonlySet<PrivilegedCapability> = new Set([
  'release:promote',
  'secret:read',
  'quota:set',
  'members:manage',
])

export function isPrivileged(capability: PrivilegedCapability): boolean {
  return PRIVILEGED.has(capability)
}

/**
 * Who is asking, and with WHICH credential class (D24, P5b Decision 2). Carried from the
 * one request hook that reads a credential; never read from the request body.
 *
 * A DISCRIMINATED UNION rather than an optional `token` field beside a `credential`
 * string, so that "this route is interactive only" is a type-level property a handler
 * states in its signature rather than a check somebody remembers. Two fields that must
 * agree is precisely P2's `/auth/dev-login` shape, where a guard whose enabling condition
 * was written twice was one line from an authentication bypass (ORIENTATION §9).
 */
export type Actor = SessionActor | TokenActor

/** A person, in a browser, who signed in with CWL. */
export interface SessionActor {
  credential: 'session'
  userId: string
  platformRole: 'admin' | 'member'
  /**
   * Their `ubcEduCwlPuid`. It lives HERE, on the session member, rather than as an
   * intersection over `Actor`: `SessionActor` was `Actor & { puid: string }` until P5b
   * Task 5, and `Extract<Actor, { credential: 'session' }>` over a union would have
   * dropped it silently (`[M8]`, sitting 1 finding 11).
   */
  puid: string
  /**
   * §20's step-up claim, off the session cookie (P6a Task 8, Decision 8): when this
   * person last completed a SECOND authentication round trip, or `null`.
   *
   * HERE, on the session member, for the reason `puid` above records — and because a
   * token has no session to have stepped up, which is what makes `assertStepUp`'s first
   * line a refusal rather than a question.
   */
  steppedUpAt: number | null
}

/** An agent, holding a delegated token (D24). */
export interface TokenActor {
  credential: 'token'
  /** The person who minted it. Every row the agent writes is attributed to them. */
  userId: string
  tokenId: string
  /** D24 and Decision 3: exactly ONE project. */
  projectId: string
  /** The explicit set it was minted with. Never one of `PRIVILEGED` (Task 6). */
  capabilities: ReadonlySet<Capability>
  /** §20's per-token limit, off the row. Task 9 is its only reader. */
  rateLimit: number
  /**
   * Set by the route wrapper, from a `confirmed` PendingAction whose fingerprint matches
   * THIS request (Task 7, Decision 6). Absent on every ordinary request, and nothing but
   * that wrapper can produce it. It is the single-use permission a human granted.
   */
  grant?: Capability
  /**
   * NO `platformRole`. Decision 4: a token never carries platform-admin authority, and a
   * field that exists and is deliberately never read is the next agent's bug. `/v1/fleet`
   * and every other admin-scoped route takes a `SessionActor` instead.
   */
}

const OWNER: readonly Capability[] = [
  'project:read',
  'project:write',
  'project:delete',
  'members:manage',
  'build:create',
  'release:create',
  'release:deploy',
  'release:promote',
]

// §13: "same as owner except member management and deletion" — and not promotion,
// which is the owner's decision about their own students (D24, P5b Task 2).
const COLLABORATOR: readonly Capability[] = OWNER.filter(
  (cap) =>
    cap !== 'members:manage' && cap !== 'project:delete' && cap !== 'release:promote',
)

// §13: the platform admin approves releases, sets quotas, and sees the whole fleet — and
// since P6a Task 6 records what UBC IAM and the Privacy Office said (§9, R1).
const PLATFORM_ADMIN: readonly Capability[] = [
  ...OWNER,
  'release:approve',
  'launch:record',
  'quota:set',
]

export function capabilitiesFor(
  projectRole: ProjectRole | null,
  platformRole: 'admin' | 'member',
): ReadonlySet<Capability> {
  if (platformRole === 'admin') return new Set(PLATFORM_ADMIN)
  if (projectRole === 'owner') return new Set(OWNER)
  if (projectRole === 'collaborator') return new Set(COLLABORATOR)
  return new Set()
}

export class AuthorizationError extends Error {
  constructor(
    readonly code: 'FORBIDDEN' | 'NOT_FOUND',
    message: string,
  ) {
    super(message)
    this.name = 'AuthorizationError'
  }
}

/**
 * D24's central refusal: a delegated token asked for one of `PRIVILEGED`.
 *
 * **NOT an `AuthorizationError`.** It is not a refusal a client can correct — no role
 * grants it, no re-mint helps, and "however it was minted" means the token's own
 * capability set is irrelevant. It is a question that has to be put to a person, so the
 * answer carries a `PendingAction` the human confirms, and the layer that records one is
 * the only layer holding the request: `api/contract/route.ts`'s wrapper (P5b Decision 5).
 *
 * It therefore carries WHAT was refused and WHO asked, and nothing about the request —
 * `assertCapability` cannot see one, and giving it one would put a write inside a
 * function sixteen call sites treat as a pure check.
 *
 * **If this reaches `mapError` it means the wrapper never saw it** — a capability checked
 * on a route registered outside `registerRoutes` (`[M7]`; the event stream is the one
 * such route today, and its only capability is `project:read`). `api/errors.ts` answers
 * it as a refusal WITHOUT a pending action and says so on the operator's stderr, so the
 * failure mode is a loud refusal rather than a quiet 500 or, worse, a grant.
 */
export class TokenCapabilityRefusedError extends Error {
  constructor(
    readonly capability: PrivilegedCapability,
    readonly projectId: string,
    readonly tokenId: string,
  ) {
    super(
      `a delegated token may never '${capability}' (D24); a human must confirm this action`,
    )
    this.name = 'TokenCapabilityRefusedError'
  }
}

export async function membershipOf(
  db: Db,
  userId: string,
  projectId: string,
): Promise<ProjectRole | null> {
  const [row] = await db
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(
      and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)),
    )
  return row?.role ?? null
}

/**
 * Throws NOT_FOUND when the actor has no business knowing the project exists, and
 * FORBIDDEN when they are a member who lacks this particular capability.
 *
 * The distinction is deliberate: answering FORBIDDEN to a stranger confirms the
 * project exists and turns the id space into an enumeration oracle across tenants.
 */
export async function assertCapability(
  db: Db,
  actor: Actor,
  projectId: string,
  capability: Capability,
): Promise<void> {
  /**
   * A TOKEN'S authority is the token's, not its minter's (D24, P5b Task 5).
   *
   * SCOPE FIRST, and a token addressing any other project gets the stranger's `NOT_FOUND`
   * for the stranger's reason (Decision 3): `FORBIDDEN` would confirm the project exists
   * and turn the id space into an enumeration oracle. No membership is consulted — the
   * token names its project, and the row's foreign key is what makes that project real.
   *
   * **A token therefore outlives its minter's membership.** Removing somebody from a
   * project does not stop a token they minted for it; revoking the token does. Phase 1
   * accepts that deliberately — the alternative is a `project_members` read on every
   * request a token makes, which is the per-request database cost Decision 9 rejected —
   * and the plan that adds member removal to the console is the one that revisits it.
   *
   * **THE ORDER OF THE THREE CHECKS BELOW IS THE SECURITY PROPERTY**, and the next
   * reader will want to reorder them for readability. Scope, then D24's privileged rule,
   * then the token's own set:
   *
   * 1. **Scope first**, so a token cannot learn that a project it may not address exists
   *    — not even by being told its action is privileged, and not by having a row written
   *    into that project's queue for a person there to read.
   * 2. **Then the privileged rule, BEFORE the token's own capability set**, because D24
   *    says *"regardless of how it was minted"*: a token that somehow holds one of
   *    `PRIVILEGED` is refused by this line, not by the mint route. Put after the set,
   *    this line would be unreachable for every token minted through Task 4's route —
   *    and every test using such a token would stay green.
   * 3. **Then the set**, which is the ordinary `FORBIDDEN`.
   */
  if (actor.credential === 'token') {
    if (actor.projectId !== projectId) {
      throw new AuthorizationError('NOT_FOUND', `no project '${projectId}'`)
    }
    if (isPrivileged(capability)) {
      /**
       * Decision 6: a human confirmed THIS request, once.
       *
       * `grant` is set by `api/contract/route.ts`'s wrapper and by nothing else, from a
       * `PendingAction` a person moved to `confirmed` in an interactive session whose
       * fingerprint matches the request in hand — so it cannot be manufactured by a
       * client, by a mint, or by a route. The wrapper stamps the row `consumed` once the
       * handler has resolved, which is what makes it single-use.
       *
       * It is compared for EQUALITY with the capability being asked for, not merely
       * tested for presence: a confirmation of one privileged action is not a
       * confirmation of the other three, and a route that checks two capabilities gets
       * past this line only for the one the person read.
       */
      if (actor.grant !== capability) {
        throw new TokenCapabilityRefusedError(capability, projectId, actor.tokenId)
      }
      /**
       * **AND IT RETURNS, rather than falling through to the token's own set.** The
       * grant IS the authority here: no token the platform can mint holds one of
       * `PRIVILEGED` (Task 4's route refuses it), so a confirmation that then had to be
       * seconded by the token's capability set would let exactly nothing through —
       * D24's loop would close for fixtures and for no real token, which is sitting 4's
       * F1 wearing a different hat. What authorizes this request is that a person who
       * holds the capability themselves read it and said yes.
       */
      return
    }
    if (!actor.capabilities.has(capability)) {
      throw new AuthorizationError(
        'FORBIDDEN',
        `this delegated token was not minted with '${capability}'`,
      )
    }
    return
  }

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId))
  if (!project) {
    throw new AuthorizationError('NOT_FOUND', `no project '${projectId}'`)
  }

  const projectRole =
    actor.platformRole === 'admin'
      ? null
      : await membershipOf(db, actor.userId, projectId)
  if (actor.platformRole !== 'admin' && projectRole === null) {
    throw new AuthorizationError('NOT_FOUND', `no project '${projectId}'`)
  }

  if (!capabilitiesFor(projectRole, actor.platformRole).has(capability)) {
    throw new AuthorizationError(
      'FORBIDDEN',
      `role '${projectRole ?? actor.platformRole}' may not '${capability}'`,
    )
  }
}
