# UBC'S AI GATEWAY KEY — the two checks `make verify`, `make doctor` and `make demo-gateway` share (the UBC AI
# Gateway plan's Decisions 4 and 11, and its Task 6's phase 0). Each prints ONE verdict line and returns 0 when it holds;
# neither ever prints the key or a hash of it. Sourced after `cd` to the repository root; MANIFEST_ENV_FILE points
# either at a scratch copy of .env (the plan's controls).

# UBC'S AI GATEWAY KEY, AS LiteLLM HOLDS IT (the UBC AI Gateway plan's Decision 4, C1). The control plane cannot see
# LiteLLM's environment, and LiteLLM reads its environment only when `make up` CREATES it — so a key added to or
# rotated in .env without `make up` leaves LiteLLM with none or a stale one, and every gateway call then answers 401,
# which the capable model's fallback hides. Compared by FINGERPRINT, never presence alone: each side hashed in its
# own process — .env's by `printf | shasum` (printf is a builtin, so the value is on no command line), LiteLLM's
# by Python inside the container — and ONLY A VERDICT is written out, never a value or a hash. The env file is
# re-read in a subshell, so MANIFEST_ENV_FILE can point the check at a scratch copy (the plan's control (e)).
litellm_gateway_key_matches() {
  ( unset UBC_AI_GATEWAY_API_KEY
    env_file="${MANIFEST_ENV_FILE:-.env}"
    [ -f "$env_file" ] && { set -a; . "$env_file"; set +a; }
    ours=""
    [ -n "${UBC_AI_GATEWAY_API_KEY:-}" ] \
      && ours=$(printf %s "$UBC_AI_GATEWAY_API_KEY" | shasum -a 256 | cut -d' ' -f1)
    if ! theirs=$(docker exec manifest-litellm python3 -c \
        'import hashlib, os; v = os.environ.get("UBC_AI_GATEWAY_API_KEY", ""); print(hashlib.sha256(v.encode()).hexdigest() if v else "")' \
        2>/dev/null); then
      echo "could not read manifest-litellm's environment — is it running? (make up)"; exit 1
    fi
    if [ -z "$ours" ] && [ -z "$theirs" ]; then
      # NOT CONFIGURED IS TRUE ONLY WHEN THE CATALOGUE AGREES (the whole-branch review's I2): with no key on either
      # side, a deployment still at the gateway's address — the key removed and `make up` run, the control plane not
      # restarted — resolves its reference to nothing, and LiteLLM sends OPENAI_API_KEY to UBC for it ([M7]).
      gw="${MANIFEST_UBC_AI_GATEWAY_URL:-https://ai-gateway.apps.ltic.ubc.ca/v1}"
      left=$(printf 'header = "Authorization: Bearer %s"\n' "${LITELLM_MASTER_KEY:-}" |
        curl -sS -K - -m 10 "http://127.0.0.1:${PORT_LITELLM:-7106}/model/info" 2>/dev/null |
        node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>{try{const g=process.argv[1].replace(/\/+$/,"")
          console.log((JSON.parse(s).data??[]).filter((d)=>(d.litellm_params?.api_base??"").replace(/\/+$/,"")===g||
            String(d.model_info?.id??"").startsWith("manifest-gateway-")).length)}catch{console.log("unread")}})' "$gw")
      case "$left" in
        0) echo "not configured (neither $env_file nor LiteLLM holds a gateway key, and no deployment is at the gateway)"; exit 0 ;;
        unread | '') echo "neither holds a gateway key, and LiteLLM's catalogue could not be read to confirm none is at the gateway"; exit 1 ;;
        *) echo "neither holds a gateway key, but LiteLLM still has $left deployment(s) at the gateway, which would send OPENAI_API_KEY there — restart the control plane (its boot removes them)"; exit 1 ;;
      esac
    fi
    if [ "$ours" = "$theirs" ]; then echo "matches"; exit 0; fi
    if [ -z "$theirs" ]; then echo "absent from LiteLLM — run make up, then restart the control plane"; exit 1; fi
    if [ -z "$ours" ]; then echo "LiteLLM holds a key $env_file does not — run make up"; exit 1; fi
    echo "differs — run make up, then restart the control plane"; exit 1
  )
}
# THE UBC AI GATEWAY KEY'S EXPIRY (the UBC AI Gateway plan's Decision 11). A WARNING, as the database's age is: an
# expired key answers 401, and the capable model's fallback answers that silently — every capable call moving to the
# on-premise model with no operator line — so this says so FOURTEEN days ahead, because a rotation is Rich's, in the
# gateway's admin UI, and needs `make up` and a restart after it. The date is HIS reading of that UI (a gateway key
# cannot read its own /key/info — the plan's F10), written to .env as UBC_AI_GATEWAY_KEY_EXPIRES=<YYYY-MM-DD>. The
# key itself is read only as present or absent. Offline it works unchanged. MANIFEST_ENV_FILE points it at a scratch
# copy (the plan's control (f)).
gateway_key_expiry() {
  ( unset UBC_AI_GATEWAY_API_KEY UBC_AI_GATEWAY_KEY_EXPIRES
    env_file="${MANIFEST_ENV_FILE:-.env}"
    [ -f "$env_file" ] && { set -a; . "$env_file"; set +a; }
    [ -n "${UBC_AI_GATEWAY_API_KEY:-}" ] || { echo "no UBC AI Gateway key in $env_file"; exit 0; }
    when="${UBC_AI_GATEWAY_KEY_EXPIRES:-}"
    rotate="rotate it in the gateway's admin UI, set UBC_AI_GATEWAY_API_KEY and UBC_AI_GATEWAY_KEY_EXPIRES in $env_file, run make up, then restart the control plane"
    if [ -z "$when" ]; then
      echo "a UBC AI Gateway key is in $env_file, but its expiry is unknown — add UBC_AI_GATEWAY_KEY_EXPIRES=<YYYY-MM-DD> from the gateway's admin UI"
      exit 1
    fi
    # BSD date: a format with no time takes the CURRENT time of day, so midnight is named.
    expires=$(date -j -f '%Y-%m-%d %H:%M:%S' "$when 00:00:00" +%s 2>/dev/null) || expires=""
    case "$when" in [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]) ;; *) expires="" ;; esac
    [ -n "$expires" ] || { echo "UBC_AI_GATEWAY_KEY_EXPIRES is '$when', not a YYYY-MM-DD date"; exit 1; }
    days=$(( (expires - $(date +%s)) / 86400 ))
    if [ "$expires" -le "$(date +%s)" ]; then
      echo "the UBC AI Gateway key EXPIRED on $when: every gateway call answers 401 and the capable model falls back silently — $rotate"
      exit 1
    fi
    if [ "$days" -lt 14 ]; then
      echo "the UBC AI Gateway key expires on $when, in $days days — an expired key answers 401 and the capable model falls back silently: $rotate"
      exit 1
    fi
    echo "the UBC AI Gateway key expires on $when, in $days days (warned from 14 days ahead)"
  )
}
