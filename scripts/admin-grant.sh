#!/usr/bin/env bash
# §20: "the first administrator is created by a documented out-of-band procedure, never
# by 'first user to log in wins'. Role changes are audited." THIS IS THAT PROCEDURE
# (P5a Task 16). RUNBOOK's *The first administrator* documents it.
#
#   scripts/admin-grant.sh grant  <puid> "<reason>"
#   scripts/admin-grant.sh revoke <puid> "<reason>"
#
# OUT OF BAND, deliberately: it speaks to Postgres as the database OWNER, inside the
# Postgres container. No control-plane route can change a platform role, and no delegated
# token ever will (D24) — so there is nothing on the network to steal that does this.
# At UBC the procedure is the same SQL, run by whoever holds the database owner's
# credential; the script is its local form.
#
# The person must have signed in once (the users row is created at sign-in, §9). Sessions
# carry the role they were issued with, so the change reaches them when they SIGN IN
# AGAIN — the stateless-session divergence from §20 recorded for P5b.
#
# macOS ships bash 3.2 and a BSD userland.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

fail() { printf '%s\n' "$*" >&2; exit 1; }

[ "$#" -eq 3 ] || fail 'usage: scripts/admin-grant.sh <grant|revoke> <puid> "<reason>"'
ACTION="$1"; PUID="$2"; REASON="$3"
case "$ACTION" in
  grant) TO=admin ;;
  revoke) TO=member ;;
  *) fail "the first argument is grant or revoke, not '$ACTION'" ;;
esac
[ -n "$(printf '%s' "$REASON" | tr -d '[:space:]')" ] \
  || fail 'a reason is required: it is stored with the audit record, which is what makes the change attributable (§26)'
ACTOR="bootstrap:$(id -un)@$(hostname -s)"

# Values reach SQL as psql VARIABLES, quoted by psql (:'name'), then as session settings
# the DO block reads — never interpolated into SQL by this shell.
docker exec -i manifest-postgres psql -U manifest -d manifest_control \
  -v ON_ERROR_STOP=1 --single-transaction -q \
  -v puid="$PUID" -v to_role="$TO" -v actor="$ACTOR" -v reason="$REASON" <<'SQL'
SELECT set_config('manifest.puid', :'puid', true),
       set_config('manifest.to_role', :'to_role', true),
       set_config('manifest.actor', :'actor', true),
       set_config('manifest.reason', :'reason', true) \gset
DO $$
DECLARE
  target users%ROWTYPE;
  wanted user_role := current_setting('manifest.to_role')::user_role;
BEGIN
  SELECT * INTO target FROM users WHERE ubc_cwl_puid = current_setting('manifest.puid');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no user with PUID % has ever signed in; they must sign in once first', current_setting('manifest.puid');
  END IF;
  IF target.role = wanted THEN
    RAISE NOTICE 'PUID % is already %; nothing changed and nothing was recorded', target.ubc_cwl_puid, wanted;
    RETURN;
  END IF;
  UPDATE users SET role = wanted WHERE id = target.id;
  INSERT INTO audit.role_changes (user_id, from_role, to_role, actor, reason)
  VALUES (target.id, target.role, wanted, current_setting('manifest.actor'), current_setting('manifest.reason'));
  RAISE NOTICE 'PUID % is now %', target.ubc_cwl_puid, wanted;
END $$;
SQL
echo "Done. A session issued before this still carries the old role — sign in again."
