#!/usr/bin/env bash
# THE THREE-HOP CWL LOGIN, once, for everything on this machine that needs one.
# Sourced, never executed.
#
# There is ONE flow. Manifest's own control plane and every deployed application
# are Service Providers registered in the same IdP through the same
# `renderSpMetadata`, so a second copy of this walk would let two scripts drift
# into proving different things — which is the defect shape this project has
# paid for more than any other. `scripts/demo.sh` and `scripts/demo-identity.sh`
# both source this file, and so does the negative-control harness, which is the
# point: a control that drives a copy of the code proves nothing about the code.
#
# Three hops because that is what a browser does and curl cannot auto-submit an
# HTML form. Extracting form fields with sed is regex-over-HTML, acceptable for
# the reason `sso/testing.ts` gives: this is a fixture IdP whose SimpleSAMLphp
# version we pin, and a markup change SHOULD fail loudly.
#
# Requires: `common.sh` sourced (ZONE), and `fail()` defined by the caller.

# HTML-DECODE. These come out of HTML attributes, so '&' arrives as '&amp;' —
# and AuthState carries a query string, so posting it undecoded means
# SimpleSAMLphp cannot match the pending authentication and the flow LOOPS
# rather than failing. Measured 2026-09-08.
idp_unescape() {
  sed 's/&amp;/\&/g; s/&quot;/"/g; s/&#0*39;/'"'"'/g; s/&lt;/</g; s/&gt;/>/g'
}

##
#   $1 the SP's cookie jar     $2 the IdP's cookie jar
#   $3 the SP's login URL      $4 username        $5 password
#   $6 the ACS URL this SP answers at
#   $7 the CA bundle
#
# One jar per IDENTITY, and that is not tidiness: SimpleSAMLphp remembers who
# authenticated, so a shared IdP jar silently signs the second person in as the
# first — and an acceptance whose whole claim is "two people are two people"
# would then prove nothing.
#
# `--cacert`, never `-k`: a probe that skips verification passes against the
# wrong certificate, which is what P3 Task 14 paid for.
##
idp_login() {
  local jar="$1" idp_jar="$2" login_url="$3" user="$4" pass="$5" expect_acs="$6" ca="$7"

  # Hop 1: the SP answers 302 with a signed AuthnRequest.
  local authn
  authn="$(curl -sS --cacert "$ca" -c "$jar" -b "$jar" -o /dev/null \
    -w '%{redirect_url}' "$login_url")"
  case "$authn" in
    https://idp.$ZONE/*) : ;;
    *) fail "$login_url did not redirect to the Manifest IdP (got '$authn')" ;;
  esac

  # Hop 2: the IdP serves its login form — which it only does once it has
  # ACCEPTED the request, so a form here means the SP row and the AuthnRequest
  # signature both check out.
  local form state action post
  form="$(curl -sS --cacert "$ca" -c "$idp_jar" -b "$idp_jar" -L "$authn")"
  echo "$form" | grep -q 'name="username"' || fail "the IdP served no login form for
$login_url — it refuses a Service Provider it cannot find. Check the row in the
manifest_idp database: the control plane writes its own at boot, and
\`deployRelease\` writes an app's at deploy, for any app whose auth.provider is cwl.
The IdP said:
$(echo "$form" | sed -n 's/.*<title>\(.*\)<\/title>.*/  <title>\1<\/title>/p' | head -1)"

  state="$(echo "$form" | sed -n 's/.*name="AuthState"[^>]*value="\([^"]*\)".*/\1/p' | head -1 | idp_unescape)"
  action="$(echo "$form" | sed -n 's/.*<form[^>]*action="\([^"]*\)".*/\1/p' | head -1 | idp_unescape)"
  case "$action" in http*) post="$action" ;; *) post="https://idp.$ZONE$action" ;; esac

  # Hop 3: post the credentials. The IdP answers with an auto-submitting form
  # carrying the assertion AND the ACS it will be posted to.
  local assertion saml acs
  assertion="$(curl -sS --cacert "$ca" -c "$idp_jar" -b "$idp_jar" -L \
    --data-urlencode "username=$user" --data-urlencode "password=$pass" \
    --data-urlencode "AuthState=$state" "$post")"
  saml="$(echo "$assertion" | sed -n 's/.*name="SAMLResponse"[^>]*value="\([^"]*\)".*/\1/p' | head -1 | idp_unescape)"
  [ -n "$saml" ] || fail "the IdP returned no SAMLResponse for '$user'. If it
returned a login page again, the credentials were refused."

  # RelayState rides back to the ACS beside the assertion, as a browser's auto-submit
  # sends it (P5a Task 4): Manifest's own SP binds a sign-in to the browser that started
  # it by comparing it with a cookie hop 1 put in "$jar". An app that sent none gets none
  # back. `${relay_arg[@]+…}` because bash 3.2 under `set -u` calls an empty array unbound.
  local relay relay_arg=()
  relay="$(echo "$assertion" | sed -n 's/.*name="RelayState"[^>]*value="\([^"]*\)".*/\1/p' | head -1 | idp_unescape)"
  if [ -n "$relay" ]; then relay_arg=(--data-urlencode "RelayState=$relay"); fi

  # THE ACS IS READ OUT OF THE IdP'S OWN FORM, not constructed here, and then
  # checked against what this Service Provider actually answers at. That is the
  # assertion D15 exists for: the IdP posts to whatever its row says, so an app
  # listening anywhere else sees a login that never completes and reports
  # nothing. Constructing this URL locally would test the script's arithmetic
  # instead of the row the platform wrote.
  acs="$(echo "$assertion" | sed -n 's/.*<form[^>]*action="\([^"]*\)".*/\1/p' | head -1 | idp_unescape)"
  [ "$acs" = "$expect_acs" ] || fail "the IdP would post the assertion to
  '$acs'
but this Service Provider answers at
  '$expect_acs'
which is D15's failure: the registration and the running app disagree."

  curl -sS --cacert "$ca" -c "$jar" -b "$jar" -o /dev/null \
    --data-urlencode "SAMLResponse=$saml" ${relay_arg[@]+"${relay_arg[@]}"} "$acs"
}
