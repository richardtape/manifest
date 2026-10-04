# A LiteLLM model row's api_key, DECRYPTED, as a VERDICT — never a value (`make demo-gateway`'s phase 5; copied from the UBC
# AI Gateway plan's Task 1 probe, docs/superpowers/spikes/gateway-baseline/probes/decrypt-verdict.py, where [M3].5 measured it).
# Run INSIDE manifest-litellm, so LiteLLM's own helper and salt key decrypt: the row's litellm_params JSON on stdin, the
# expected reference as argv[1]:
#   docker exec -i manifest-litellm python3 -c "$(cat scripts/lib/litellm-decrypt-verdict.py)" os.environ/UBC_AI_GATEWAY_API_KEY < row.json
#
# LiteLLM 1.98.0 encrypts every `litellm_params` value of a LiteLLM_ProxyModelTable row with LITELLM_SALT_KEY, so a
# clear-text count of a database dump reads 0 whether or not a key is there. This decrypts the row's `api_key` with
# LiteLLM's OWN helper — litellm.proxy.common_utils.encrypt_decrypt_utils.decrypt_value_helper (read from the pinned
# image, ghcr.io/berriai/litellm@sha256:20b5044b…, litellm-1.98.0) — and the container's own salt key, and prints
# ONLY a verdict: `equals the reference`, `other`, `absent` or `undecryptable`. Never the value.
import json
import sys

from litellm.proxy.common_utils.encrypt_decrypt_utils import decrypt_value_helper

reference = sys.argv[1] if len(sys.argv) > 1 else "os.environ/UBC_AI_GATEWAY_API_KEY"
raw = sys.stdin.read().strip()
if not raw:
    print("no row")
    sys.exit(0)
params = json.loads(raw)
if "api_key" not in params or params["api_key"] in (None, ""):
    print("absent")
    sys.exit(0)
stored = params["api_key"]
value = decrypt_value_helper(value=stored, key="api_key", exception_type="debug", return_original_value=False)
if value is None:
    print("undecryptable")
elif value == reference:
    print("equals the reference")
else:
    print("other")
print("stored form: " + ("ciphertext (not the reference as text)" if stored != reference else "the reference IN CLEAR TEXT"))
