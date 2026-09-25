#!/usr/bin/env bash
# make doctor — CAN THIS MACHINE RUN THE PLATFORM? Runs with nothing up.
# Every check here failed or nearly failed during S7, S1 or S3 — except the host-tool
# check, which comes from P4a Task 6 finding that the control plane had acquired two
# undeclared host dependencies (`openssl`, and `git` since P2) that nothing asserted.
# None is hypothetical.
set -uo pipefail
cd "$(dirname "$0")/.."
. scripts/lib/check.sh
. infra/lib/common.sh

echo "manifest doctor — $(date)"
echo
echo "Host"
report "architecture"        uname -m
report "macOS"               sw_vers -productVersion

echo
echo "Docker"
check "docker is running"  docker info --format '{{.ServerVersion}}'

check_vm_memory() {
  local bytes; bytes=$(docker info --format '{{.MemTotal}}')
  local gb_dec; gb_dec=$(awk -v b="$bytes" 'BEGIN{printf "%.2f", b/1000000000}')
  local gib;    gib=$(awk -v b="$bytes" 'BEGIN{printf "%.2f", b/1073741824}')
  echo "$bytes bytes = ${gb_dec} GB decimal / ${gib} GiB binary; floor is 8.00 GB decimal"
  [ "$bytes" -ge "$VM_MEMORY_FLOOR_BYTES" ]
}
check "Docker VM memory >= 8.00 GB decimal"  check_vm_memory

check_disk() {
  local gb; gb=$(df -g / | awk 'NR==2{print $4}')
  echo "${gb} GB free on /"
  [ "$gb" -ge "$DISK_FLOOR_GB" ]
}
check "disk >= 40 GB free"  check_disk

echo
echo "Host tools the control plane spawns"

# The control plane is a HOST process (§21) and it shells out to four things that
# nothing here declared until 2026-09-09: `git` and `tar` (build/context.ts
# exports a commit and unpacks it; source/local-driver.ts reads bare repos),
# `openssl` (sso/keypair.ts mints each app's SAML keypair — node:crypto has no
# API that ISSUES a certificate) and the `docker buildx` CLI PLUGIN
# (runtime/docker/builder.ts). `docker info` above proves the daemon and the CLI;
# it says nothing about the plugin.
#
# WHY THIS RUNS THEM RATHER THAN LOOKING ON `PATH`. Presence is not the failure
# mode that costs anything here. macOS ships LibreSSL at /usr/bin/openssl and
# Homebrew puts OpenSSL earlier on PATH; `-addext` is the flag mintSpKeypair
# depends on and older LibreSSL does not have it, so `command -v openssl` passes
# on a machine where the keypair cannot be minted. Each probe below is the
# control plane's OWN invocation, and each asserts the SHAPE of what came back —
# 4096 bits, the subjectAltName URI, the extracted file's contents — because S3
# ran six checks that all passed while one returned 192 numbers where 768
# belonged.
#
# One check, not four: ORIENTATION §8 recorded that checking one host tool and
# not the others would be worse than checking none, and the output names whichever
# one failed.
probe_git_tar() {
  local d="$1/repo" out="$1/out" epoch got
  mkdir -p "$d" "$out" || return 1
  printf 'doctor probe\n' > "$d/probe.txt"
  # Identity and signing are forced rather than inherited: a machine with no
  # user.email, or with commit.gpgsign on and no key, would fail this probe for a
  # reason that has nothing to do with whether git works.
  git -c init.defaultBranch=main init -q "$d" >/dev/null 2>&1 || return 1
  git -C "$d" add probe.txt >/dev/null 2>&1 || return 1
  git -C "$d" -c user.email=doctor@manifest.internal -c user.name=doctor \
      -c commit.gpgsign=false commit -q -m probe >/dev/null 2>&1 || return 1

  # sourceDateEpoch()'s exact call. Its answer is the image's SOURCE_DATE_EPOCH,
  # which §13 binds an approval to, so a non-numeric answer is a real failure.
  epoch=$(git "--git-dir=$d/.git" show -s --format=%ct HEAD 2>/dev/null) || return 1
  case "$epoch" in ''|*[!0-9]*) return 1 ;; esac

  # assembleContext()'s exact composition — TWO PROCESSES, NOT A PIPE. P3 lost a
  # morning to `git archive | tar -x` taking its exit status from tar, which made
  # every way git can fail produce an empty context and report success.
  git "--git-dir=$d/.git" archive --format=tar -o "$1/probe.tar" HEAD >/dev/null 2>&1 || return 1
  tar -x -f "$1/probe.tar" -C "$out" >/dev/null 2>&1 || return 1
  got=$(cat "$out/probe.txt" 2>/dev/null)
  [ "$got" = "doctor probe" ]
}

probe_openssl() {
  # mintSpKeypair()'s exact invocation, including `-keyout /dev/stdout`, so the
  # private key never touches a file here either.
  local pem
  pem=$(openssl req -x509 -newkey rsa:4096 -nodes -sha256 -days 730 \
          -keyout /dev/stdout -out /dev/stdout \
          -subj '/CN=doctor-probe-staging/O=Manifest' \
          -addext 'subjectAltName=URI:https://manifest.internal/sp/doctor-probe/staging' \
        2>/dev/null) || return 1
  echo "$pem" | grep -q -- '-----BEGIN PRIVATE KEY-----' || return 1
  echo "$pem" | grep -q -- '-----BEGIN CERTIFICATE-----' || return 1
  # The shape, not the arrival. `-addext` is silently useless on an openssl that
  # predates it in some builds, and a 2048-bit default would satisfy "a
  # certificate came back" while breaking §9's key size.
  local text
  text=$(echo "$pem" | openssl x509 -noout -text 2>/dev/null) || return 1
  echo "$text" | grep -q '(4096 bit)' || return 1
  echo "$text" | grep -q 'URI:https://manifest.internal/sp/doctor-probe/staging'
}

probe_buildx() {
  # NOT `docker buildx version` on the default config. runBuildxBuild() builds a
  # throwaway DOCKER_CONFIG and SYMLINKS ~/.docker/cli-plugins into it, because
  # setting DOCKER_CONFIG moves plugin discovery with it. So the requirement is
  # that path specifically — buildx installed anywhere else passes a plain
  # `docker buildx version` and still fails the build with `unknown flag:
  # --builder`, which reads as a version problem and is not one. This is that
  # symlink, made and used the same way.
  local cfg="$1/dockercfg"
  mkdir -p "$cfg" || return 1
  ln -s "$HOME/.docker/cli-plugins" "$cfg/cli-plugins" || return 1
  DOCKER_CONFIG="$cfg" docker buildx version 2>/dev/null | grep -q buildx
}

check_host_tools() {
  local scratch missing="" rc=0
  scratch=$(mktemp -d "${TMPDIR:-/tmp}/manifest-doctor.XXXXXX") || {
    echo "cannot create a scratch directory"; return 1; }

  probe_git_tar "$scratch"  || missing="$missing git/tar"
  probe_openssl             || missing="$missing openssl"
  probe_buildx "$scratch"   || missing="$missing docker-buildx"
  rm -rf "$scratch"

  if [ -n "$missing" ]; then
    echo "CANNOT DO WHAT THE CONTROL PLANE ASKS:$missing"
    echo "          git+tar export a commit (build/context.ts), openssl mints each app's"
    echo "          SAML keypair (sso/keypair.ts), buildx builds every image"
    echo "          (runtime/docker/builder.ts) via ~/.docker/cli-plugins"
    rc=1
  else
    echo "$(git --version) · $(tar --version 2>&1 | head -1 | cut -d' ' -f1-2) · $(openssl version | cut -d' ' -f1-2) at $(command -v openssl) · $(docker buildx version | cut -d' ' -f1-2)"
  fi
  return $rc
}
check "git, tar, openssl and buildx do what the control plane asks of them"  check_host_tools

echo
echo "Ports"
port_free() { ! lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

# Ports the platform's OWN containers publish. doctor has to pass both with the
# stack down (a fresh machine) and with it up — `make up && make doctor` is the
# RUNBOOK's first-time flow and Task 12's round trip — so "free" cannot mean
# "unbound". It means "held by nothing except us".
manifest_own_ports() {
  docker ps --filter 'name=^manifest-' --format '{{.Ports}}' 2>/dev/null \
    | tr ',' '\n' | sed -n 's/.*:\([0-9][0-9]*\)->.*/\1/p' | sort -u
}
# §21 puts four things on the HOST rather than in a container, and the control
# plane is one of them — it needs the Docker socket, which §12 forbids mounting
# into a workload container. So `manifest_own_ports` above, which reads published
# CONTAINER ports, cannot see it, and `make doctor` failed with "CLAIMED BY
# SOMETHING ELSE: 7100" during the platform's own documented flow: `make up`,
# start the control plane, `make demo`, `make doctor`. Found 2026-09-07, once
# there was a control plane worth running.
#
# It is identified by ASKING IT, not by matching a process name: `node` on 7100 is
# a guess, whereas the D23.7 error envelope on /v1/me is this application
# answering. A different service on that port stays foreign, which is the point.
control_plane_is_ours() {
  curl -sS -m 2 "http://127.0.0.1:$PORT_CONTROL_PLANE/v1/me" 2>/dev/null \
    | grep -q 'UNAUTHENTICATED'
}
# THE SAME DEFECT, SEVEN PLANS LATER, FOR THE SAME REASON (P5c Task 4, 2026-09-18).
# §21 puts the reference console on 7104 as a host process too, so `manifest_own_ports`
# cannot see it either, and the first `make doctor` run after the console was served read
# "CLAIMED BY SOMETHING ELSE: 7104". The remedy is the one above: ASK IT, do not match a
# process name — `node` on 7104 is a guess. `vite dev` and `vite preview` both serve
# packages/console/index.html, whose #root div and title are this application's document.
#
console_is_ours() {
  local body
  body=$(curl -sS -m 2 "http://127.0.0.1:$PORT_CONSOLE/" 2>/dev/null) || return 1
  case "$body" in *'id="root"'*) ;; *) return 1 ;; esac
  case "$body" in *'<title>Manifest</title>'*) return 0 ;; *) return 1 ;; esac
}
# THE THIRD TIME, AND IT WAS PREDICTED BY NAME (P5c Task 12, 2026-09-19). The note that
# stood here said *"THE MOCK ON 7102 WILL NEED THE SAME and deliberately does not have it
# yet"* — and the first `make ci-acceptance` run with a mock listening read
# **"CLAIMED BY SOMETHING ELSE: 7102"**, for the third time on this one check, after 7100
# in 2026-09-07 and 7104 in 2026-09-18. The remedy is the same both times before: ASK IT.
#
# The mock is asked for a path the DOCUMENT DOES NOT DECLARE, which it answers `404` with
# its own name in the message. `/v1/me` would not do: the mock answers that with the same
# `UNAUTHENTICATED` envelope the control plane does, so the two would be
# indistinguishable. A different service on 7102 stays foreign, which is the point.
mock_is_ours() {
  curl -sS -m 2 "http://127.0.0.1:$PORT_MOCK/v1/__doctor" 2>/dev/null \
    | grep -q 'manifest-mock'
}
check_block() {
  local p busy="" foreign="" ours
  ours=" $(manifest_own_ports | tr '\n' ' ')"
  if control_plane_is_ours; then ours="$ours $PORT_CONTROL_PLANE "; fi
  if console_is_ours; then ours="$ours $PORT_CONSOLE "; fi
  if mock_is_ours; then ours="$ours $PORT_MOCK "; fi
  for p in $(seq $PORT_BLOCK_START $PORT_BLOCK_END); do
    port_free "$p" && continue
    case "$ours" in
      *" $p "*) busy="$busy $p" ;;
      *)        foreign="$foreign $p" ;;
    esac
  done
  if [ -n "$foreign" ]; then
    echo "CLAIMED BY SOMETHING ELSE:$foreign — the platform cannot bind these"
    return 1
  fi
  [ -z "$busy" ] && { echo "7100-7199 all free"; return 0; }
  echo "7100-7199 free except$busy, which Manifest's own containers publish"
}
check "ports 7100-7199 free, or held only by Manifest"  check_block

# NEVER assume 53, 80 or 443 are free. Valet owns all three here (S7) and the
# design accommodates that rather than fighting it.
#
# WITHOUT sudo, lsof CANNOT SEE SOCKETS OWNED BY OTHER USERS, and Valet's dnsmasq
# runs as `nobody`. So an empty result means "nothing visible to this user", NOT
# "free" — printing a bare blank line here is how a busy port reads as an idle
# one. scripts/snapshot-machine.sh was corrected for exactly this misreading.
port_owner() {
  local proto="$1" port="$2" out
  case "$proto" in
    udp) out=$(lsof -nP -iUDP:"$port" 2>/dev/null | awk 'NR>1{print $1" ("$3")"}' | sort -u | tr '\n' ' ') ;;
    *)   out=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | awk 'NR>1{print $1" ("$3")"}' | sort -u | tr '\n' ' ') ;;
  esac
  if [ -n "$out" ]; then echo "$out"
  else echo "nothing visible to this user — lsof cannot see other users' sockets without sudo, and Valet's dnsmasq runs as nobody"; fi
}
report "port 53 owner"   port_owner udp 53
report "port 443 owner"  port_owner tcp 443

echo
echo "Zone"
# Valet answers for ALL of .test. If something already owns our zone, names
# resolve, DNS looks healthy, and requests land on the wrong web server.
#
# THE ADDRESS THIS EXPECTS MOVED IN P6a (R3), and this check found it by going red.
# `probe-unclaimed` has no environment label, so it is a name in the BARE zone — which
# is the PRODUCTION zone (config.ts: MANIFEST_ZONE_PRODUCTION) — and the split sends
# the production zone to PUBLIC_EDGE_IP. It answered 127.0.0.2 before the split and
# answers 127.0.0.3 after it, and both are correct for their own day. The check still
# does its original job: anything that is not one of Manifest's own two addresses —
# Valet's 127.0.0.1, or another resolver's answer — fails it.
check_zone_unclaimed() {
  local got
  got=$(dscacheutil -q host -a name "probe-unclaimed.$ZONE" 2>/dev/null | awk '/ip_address/{print $2}' | head -1)
  if [ -z "$got" ]; then echo "nothing answers for $ZONE yet (correct before host-setup)"; return 0; fi
  echo "$ZONE resolves to $got (the bare zone is production, so $PUBLIC_EDGE_IP)"
  [ "$got" = "$PUBLIC_EDGE_IP" ]
}
check "nothing but Manifest claims $ZONE"  check_zone_unclaimed

echo
echo "Host setup (make host-setup)"

check_resolver() {
  local f=/etc/resolver/$ZONE
  [ -f "$f" ] || { echo "$f missing — run: make host-setup"; return 1; }
  grep -q "^nameserver 127.0.0.1$" "$f" && grep -q "^port $PORT_DNS$" "$f" \
    || { echo "$f present but wrong: $(tr '\n' ' ' < "$f")"; return 1; }
  echo "$f -> 127.0.0.1:$PORT_DNS"
}
check "/etc/resolver/$ZONE installed and correct"  check_resolver

# BOTH aliases since P6a (R3). This REPLACES the single-address check rather than
# sitting beside it: the loop subsumes it exactly, and two checks asserting the same
# fact about EDGE_IP is the "a document that restates a number drifts from it" shape
# applied to a gate. The message names the missing address, so it is strictly the
# more useful of the two.
check_aliases() {
  for ip in "$EDGE_IP" "$PUBLIC_EDGE_IP"; do
    ifconfig lo0 | grep -q "inet $ip" \
      || { echo "$ip not on lo0 — Docker will refuse to bind Caddy. Lost on every reboot; \`make up\` re-adds it."; return 1; }
  done
  echo "$EDGE_IP and $PUBLIC_EDGE_IP present on lo0"
}
check "both loopback aliases exist"  check_aliases

# The split's HOST answer — the half that would take the console down if it regressed.
# BOTH DIRECTIONS MATTER AND THE SECOND EARNS ITS PLACE: a check that only asserts the
# production answer stays green while the console has moved to the public address.
# `split-probe` is a name no Caddyfile site and no app owns, so it reads the zone's
# parent rule rather than anything's configuration.
check_zone_split() {
  local app internal
  app="$(dig +short "split-probe.$ZONE" @127.0.0.1 -p "$PORT_DNS" | head -1)"
  internal="$(dig +short "$CONSOLE_HOST" @127.0.0.1 -p "$PORT_DNS" | head -1)"
  [ "$app" = "$PUBLIC_EDGE_IP" ] || { echo "a production name answers ${app:-<nothing>}, want $PUBLIC_EDGE_IP"; return 1; }
  [ "$internal" = "$EDGE_IP" ] || { echo "$CONSOLE_HOST answers ${internal:-<nothing>}, want $EDGE_IP — the console is on the PUBLIC address"; return 1; }
  echo "production=$app  console=$internal  (nested zones, pinned back)"
}
check "the production zone answers the public address, and the console does not"  check_zone_split

check_ca_keychain() {
  local n
  n=$(security find-certificate -a -c "Caddy Local Authority" /Library/Keychains/System.keychain 2>/dev/null | grep -c keychain)
  echo "$n Caddy root(s) in the System keychain"
  [ "$n" -ge 1 ]
}
check "the platform CA is trusted in the macOS keychain"  check_ca_keychain

# The keychain does NOT cover host Node processes — Node ignores it entirely, and
# the control plane, admin UI and console are all host Node processes (S7).
# Verified 2026-09-05: with NODE_EXTRA_CA_CERTS Node gets 200; without it,
# UNABLE_TO_GET_ISSUER_CERT_LOCALLY, while curl on the same URL is fine.
#
# .env is sourced here for the same reason verify.sh sources it — it is where
# P1 puts NODE_EXTRA_CA_CERTS, so a developer who has run `make seed` should see
# a PASS rather than a WARN telling them to export something already recorded.
check_node_ca() {
  [ -f "$CA_FILE" ] || { echo "$CA_FILE missing — run make seed"; return 1; }
  if [ -z "${NODE_EXTRA_CA_CERTS:-}" ] && [ -f .env ]; then
    set -a; . ./.env; set +a
  fi
  [ -n "${NODE_EXTRA_CA_CERTS:-}" ] || { echo "NODE_EXTRA_CA_CERTS is unset and .env does not supply it"; return 1; }
  NODE_EXTRA_CA_CERTS="$NODE_EXTRA_CA_CERTS" node -e '
    const https=require("https");
    https.get("https://edge.manifest.internal/",r=>{console.log("node reached the edge with NODE_EXTRA_CA_CERTS="+process.env.NODE_EXTRA_CA_CERTS+", status",r.statusCode);process.exit(0)})
         .on("error",e=>{console.log("node failed:",e.code,"— the keychain does NOT cover Node (S7)");process.exit(1)});
  '
}
check_warn "host Node trusts the CA (needs NODE_EXTRA_CA_CERTS)"  check_node_ca

echo
echo "Ollama (host application — §21)"
check "Ollama is running"  sh -c 'curl -sf http://127.0.0.1:11434/api/version'
check_models() {
  local missing="" m
  while read -r m; do
    [ -z "$m" ] && continue
    case "$m" in \#*) continue;; esac
    ollama list | awk 'NR>1{print $1}' | grep -qx "$m" || missing="$missing $m"
  done < infra/models.txt
  [ -z "$missing" ] && { echo "all models in infra/models.txt present"; return 0; }
  echo "missing:$missing — run: make seed"; return 1
}
check "the models infra/models.txt names are present"  check_models

echo
echo "Seed state"

check_lockfile() {
  [ -f infra/images.lock ] || { echo "infra/images.lock missing — run: make seed"; return 1; }
  local n; n=$(grep -vc '^#\|^$' infra/images.lock)
  echo "$n images pinned by digest"
  [ "$n" -ge 1 ]
}
check "infra/images.lock exists and pins every base image"  check_lockfile

litellm_is_pinned() {
  # §16 pins the AI error mapping to "the LiteLLM version in §21's inventory",
  # and `main-stable` is a MOVING TAG. Measured 2026-09-07 it was absent from
  # images.txt and images.lock entirely, so a second machine's `make seed`
  # installed whatever the tag pointed at that day — and P4b Task 4's mapping,
  # which reads `detail` for a route denial and matches a MESSAGE SUBSTRING to
  # tell a key budget from an end-user budget, would be asserted against a
  # version nobody chose.
  #
  # It moved on 2026-09-09, two days later: a rebuild retagged `main-stable`
  # from sha256:20b5044b (litellm 1.98.0, built 08-22 — S3's) to sha256:a3715fa7
  # (built that morning). That is this check's whole reason for existing, and it
  # happened before the check was written.
  grep -q 'berriai/litellm' infra/images.lock \
    || { echo "litellm is not in infra/images.lock — run make seed"; return 1; }
  local want have
  want=$(awk '$1 ~ /berriai\/litellm/ {print $2}' infra/images.lock)
  # The DAEMON, not the file. A check that reads only the file it was written
  # from cannot fail; this one asks what is actually running, which is why it
  # can — and it is what catches a `make up` that recreated the container onto
  # a moved tag.
  have=$(docker inspect manifest-litellm --format '{{.Image}}' 2>/dev/null || echo none)
  echo "litellm lock=$want running=$have"
  [ "$want" = "$have" ]
}
check "the running LiteLLM is the digest infra/images.lock pins"  litellm_is_pinned

check_registry_has_bases() {
  local missing="" repo token
  # The registry requires a scoped token from P3 Task 9 onwards, so an
  # unauthenticated GET answers 401 and `curl -sf` reports every base image as
  # missing. Minting one per repository keeps this check asserting what it always
  # asserted -- and additionally proves the issuer keypair works.
  if [ ! -f infra/registry-auth/token.key ]; then
    echo "infra/registry-auth/token.key is missing -- cannot query the registry. Run: make seed"
    return 1
  fi
  # `berriai/litellm` is excluded, and it is the only line in images.txt that is:
  # it is pinned by digest for §16's error mapping and deliberately NOT mirrored
  # (mirror-images.sh skips it), because nothing does `FROM` a running service.
  # Without this exclusion the pin makes THIS check fail — which is exactly what
  # it did, once.
  for repo in $(grep -v '^#\|^$\|berriai/litellm' infra/images.txt | cut -d: -f1 | sed 's#.*/##'); do
    token=$(node infra/seed/mint-token.mjs "base/$repo" 2>/dev/null)
    curl -sf -H "Authorization: Bearer $token" \
      "http://127.0.0.1:$PORT_REGISTRY/v2/base/$repo/tags/list" >/dev/null 2>&1 \
      || missing="$missing $repo"
  done
  [ -z "$missing" ] && { echo "every base image is in the local registry"; return 0; }
  # This is the difference between a build that works and one that fails the
  # moment the network goes away (S1 §Evidence 5).
  echo "NOT mirrored:$missing — offline builds and scans will fail. Run: make seed"; return 1
}
check "base images are IN the local registry, not merely pulled"  check_registry_has_bases

# A WARNING, never a check: §12 says a stale database warns rather than blocks, and
# a doctor that fails here would stop an offline developer for the one gate that is
# explicitly allowed to degrade.
scanner_db_age() {
  local built secs tenths
  # Ask GRYPE, not the volume. The v6 database has no metadata.json -- it is
  # `import.json`, `last_update_check` and `vulnerability.db` -- so reading a file
  # by name reports "no database" against a perfectly good one.
  built=$(docker run --rm -v manifest-grype-db:/db \
            -e GRYPE_DB_CACHE_DIR=/db -e GRYPE_DB_AUTO_UPDATE=false \
            -e GRYPE_CHECK_FOR_APP_UPDATE=false \
            anchore/grype:v0.118.0 db status -o json 2>/dev/null \
          | sed -n 's/.*"built": *"\([^"]*\)".*/\1/p' | head -1)
  if [ -z "$built" ]; then
    echo "no vulnerability database -- run 'make refresh-vulndb' with the network on"
    return 1
  fi
  # BSD date. No -d, no --date; and -u, or an ISO-8601 Z timestamp is read as LOCAL
  # time and the age is off by the offset.
  #
  # IN SECONDS, NOT WHOLE DAYS (P6b sitting 2). `build/scan.ts` calls a database stale
  # when its age in FRACTIONAL days is > 7 (`STALENESS_THRESHOLD_DAYS`), and this check
  # used to floor to whole days and pass up to 8 — so for a whole day every week it
  # said "fresh" beside a gate that was already warning on every scan. Measured
  # 2026-09-23: "7 days old", PASS, with the database 7.4 days old and a Docker-tier
  # test red because every scan had gone stale.
  secs=$(( $(date +%s) - $(date -u -j -f '%Y-%m-%dT%H:%M:%SZ' "$built" +%s 2>/dev/null || echo 0) ))
  tenths=$(( secs * 10 / 86400 ))
  echo "vulnerability database built $built, $(( tenths / 10 )).$(( tenths % 10 )) days old (the scan gate calls it stale above 7.0 and warns rather than blocks; refresh with 'make refresh-vulndb')"
  [ "$secs" -le $(( 7 * 86400 )) ]
}
check_warn "the vulnerability database is fresh"  scanner_db_age

# NOT just "the file is there". `make seed` and the Makefile's `.env` target both
# copy .env.example ONLY when .env is absent — an existing developer's .env never
# gains a key added later. That is silent: MANIFEST_APP_PASSWORD arrived on
# 2026-09-09, and RUNBOOK's export block interpolates it, so a .env written
# before that date produces `postgres://manifest_app:@127.0.0.1…` and a login
# failure that names the role rather than the missing variable.
#
# Comparing against .env.example generalises: the NEXT key somebody adds is covered
# without anyone remembering to add a check for it.
check_env_file() {
  [ -f .env ] || { echo ".env missing — run: make seed"; return 1; }
  local keys missing="" key
  keys=$(sed -n 's/^\([A-Z_][A-Z0-9_]*\)=.*/\1/p' .env.example)
  for key in $keys; do
    grep -q "^${key}=" .env || missing="$missing $key"
  done
  if [ -n "$missing" ]; then
    echo ".env is MISSING keys .env.example declares:$missing"
    echo "          'make seed' leaves an existing .env alone, so add them by hand:"
    for key in $missing; do
      echo "            $(grep "^${key}=" .env.example)"
    done
    return 1
  fi
  echo ".env present, with every key .env.example declares ($(echo "$keys" | wc -l | tr -d ' '))"
}
check ".env exists and carries every key .env.example declares"  check_env_file

# A pinned API version nobody checks is a 400 arriving three tasks later. The
# driver pins v1.44 deliberately (§21 records the daemon's window); this asserts
# the pin is still inside it rather than trusting a number written months ago.
docker_api_window() {
  local api min
  api=$(docker version --format '{{.Server.APIVersion}}' 2>/dev/null)
  min=$(docker version --format '{{.Server.MinAPIVersion}}' 2>/dev/null)
  [ -n "$api" ] && [ -n "$min" ] || { echo "cannot read the daemon API window"; return 1; }
  echo "daemon serves API [$min, $api]; the driver pins v1.44"
  # Integer compare on the minor, which is all that varies in practice. The major
  # has been 1 since 2013 and a change there would need a driver rewrite anyway.
  [ "${api#*.}" -ge 44 ] && [ "${min#*.}" -le 44 ]
}
check "the Docker API version the driver pins is inside the daemon's window"  docker_api_window

summary
