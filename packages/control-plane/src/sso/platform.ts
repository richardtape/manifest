import type pg from 'pg'
import type { SpEntity } from './entity.js'
import { SsoError } from './errors.js'
import type { SpKeypair } from './keypair.js'
import { renderSpMetadata, upsertSpRow } from './metadata-store.js'

/**
 * §9's first sentence, and the one that is easy to forget: **Manifest itself is
 * an SP.** Its own users log in with CWL, and locally it uses the Manifest IdP
 * like everything else. This is its registration.
 *
 * **Why it is here and not in `ensure-idp-sql.sh`.** The plan asks for a row
 * written by that shell script. That would be a SECOND PRODUCER of the
 * `entity_data` document `renderSpMetadata` already produces — the defect shape
 * this project has paid for more than any other, most recently as defect 49,
 * where §16's own login suite built §8's variables by hand and proved a login
 * against an environment the platform does not produce. So the platform's row
 * goes through the same renderer every app's row goes through, and the only
 * thing that differs is where the entity comes from.
 *
 * **Why the entity is built here and not by `deriveSpEntity`.** That function is
 * for APPS: it joins a Manifest §23 hostname to an app-supplied path and always
 * over `https`. The control plane is a host process on 7100 (§21) that the edge
 * does not route, so its ACS is the one Manifest ACS that is not an
 * `https://….manifest.internal` URL. Feeding it through `deriveSpEntity` would
 * mean loosening the function that exists to make a free-text ACS URL
 * impossible — §9 calls that an assertion-phishing primitive — for the benefit
 * of the single caller that does not need it.
 */

/** §9's `{slug}` position. Not a project; no `projects` row has this slug. */
export const CONTROL_PLANE_SLUG = 'manifest-control-plane'

/**
 * §9's `{env}` position. Deliberately not one of §7's three environment kinds:
 * the control plane has no sandbox, staging or production instance — there is
 * one of it — and reusing `production` would put the platform's own entityID in
 * the same namespace an app called `manifest-control-plane` could claim.
 */
export const CONTROL_PLANE_ENVIRONMENT = 'platform'

/**
 * What the control plane asks the IdP to release about the person logging in.
 *
 * Four names, and the omission is the interesting one: **`eduPersonAffiliation`
 * is not requested.** A platform role is Manifest's to decide (§9 —
 * authentication is the IdP's job, authorization is not), so an attribute
 * saying `faculty` has no consumer here; requesting it anyway would put a value
 * in the assertion that nothing may act on, which is how it eventually gets
 * acted on. §9's attribute release is enforced at the IdP against this list, so
 * an attribute absent here is not sent at all.
 */
export const CONTROL_PLANE_ATTRIBUTES = ['ubcEduCwlPuid', 'mail', 'givenName', 'sn']

const ORIGIN = /^https?:\/\/[^/?#]+$/

export interface ControlPlaneSpInput {
  /** §9's `{platform-domain}` — `config.idp.spEntityBase`. */
  entityBase: string
  /**
   * Where the control plane actually answers. `http://127.0.0.1:7100` locally,
   * `https://manifest.ubc.ca` at UBC. A bare origin: scheme, host, no path.
   */
  origin: string
}

/**
 * The platform's own `SpEntity` — every value Manifest computes, computed once.
 *
 * `identity/saml.ts` reads `entityId` as its SAML issuer AND its expected
 * audience, and `acsUrl` as its callback; `registerControlPlaneSp` writes both
 * into the row. One function, so the AuthnRequest the control plane sends and
 * the row the IdP reads cannot describe two different Service Providers.
 */
export function controlPlaneSpEntity(input: ControlPlaneSpInput): SpEntity {
  if (!ORIGIN.test(input.origin)) {
    throw new SsoError(
      'SSO_CONTROL_PLANE_ORIGIN_INVALID',
      `'${input.origin}' is not a bare origin (MANIFEST_CONTROL_PLANE_ORIGIN, e.g. ` +
        'http://127.0.0.1:7100 — scheme and host, no path and no trailing slash). ' +
        'Every URL the IdP is told to send a person to is built from this one.',
    )
  }
  return {
    entityId: `${input.entityBase}/sp/${CONTROL_PLANE_SLUG}/${CONTROL_PLANE_ENVIRONMENT}`,
    acsUrl: `${input.origin}/auth/saml/callback`,
    sloUrl: `${input.origin}/auth/logout`,
    attributes: [...CONTROL_PLANE_ATTRIBUTES],
  }
}

/**
 * Writes the platform's registration, through the renderer every app uses.
 *
 * Called at boot rather than by `make up`, and re-run on every boot rather than
 * once: the row's ACS URL and certificate are derived from this process's own
 * configuration and keypair, so a boot that does not refresh the row is a boot
 * after which the IdP may be posting assertions somewhere the control plane no
 * longer listens. §9 audits an ACS change for exactly that reason.
 *
 * It makes the IdP database a hard boot dependency, deliberately. An IdP whose
 * metadata store is unreachable is an IdP nobody can log in through, and this
 * fails at boot with a message naming the database instead of at the first
 * login with a message naming nothing.
 */
export async function registerControlPlaneSp(
  pool: pg.Pool,
  entity: SpEntity,
  keypair: SpKeypair,
): Promise<void> {
  await upsertSpRow(pool, entity.entityId, renderSpMetadata(entity, keypair))
}
