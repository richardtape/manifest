# THE CAPABLE MODEL'S FALLBACK GUARD (FE-34 — the launch path plan's Task 6, Branch G). Loaded by config.yaml's
# `litellm_settings.callbacks: manifest_guard.proxy_handler_instance`; mounted read-only beside it by compose.yaml.
#
# §7, as Spec action 6 amended it: the on-premise model answers `default-chat-large` "whenever its provider cannot
# be reached or fails — a refused connection, a timeout, a rate limit or a server error, the network off included —
# and never for a request the provider refused as malformed, which is answered as the provider's refusal so its
# caller can correct it." LiteLLM 1.98.0's `general` fallback answers EVERY provider error, a client's malformed
# request included (Task 1's [M5], F7) — so without this file a caller who sent a bad request is answered by a
# smaller model and never learns the request was wrong.
#
# MALFORMED MEANS THE PROVIDER ANSWERED 400, 413 OR 422 (the controller's ruling 1, from the spec's words). A 401,
# 403 or 404 is the PLATFORM's provider credential, permission or model name failing — "fails" — and falls back,
# as do 408, 429, every 5xx, a timeout and a refused connection. A client told 401 would doubt its own key.
#
# THE PROVIDER'S STATUS, NOT LITELLM'S CLASS NAME (measured at Task 6). LiteLLM names an OpenAI-shaped error
# `BadRequestError` whenever its body says `invalid_request_error` — WHATEVER the status: a stub answering 401, 403,
# 404, 408, 413 and 422 with that body was named `BadRequestError` every time, while the exception kept the
# provider's own `status_code`. The router's `previous_models` (what [M5] measured the fallback's hook can see)
# stores only the class NAME, so a guard reading it alone refused a 401. So the guard has two halves:
#
#   1. `async_log_failure_event` records each failed call's provider status against its request's trace id.
#      LiteLLM AWAITS it before the exception reaches the router ("router retry fallback relies on this!",
#      utils.py's wrapper_async), so the record exists before any fallback starts. The key is the failure's
#      `standard_logging_object.trace_id` — the failed call's own `litellm_trace_id` is a different value, and
#      only the former equals the fallback call's `litellm_trace_id` (measured at Task 6).
#   2. `async_pre_call_deployment_hook` runs on the fallback deployment's call with `fallback_depth >= 1` ([M5])
#      and refuses it when THIS request's provider status is 400, 413 or 422. With no status recorded for it, it
#      reads THIS request's own `previous_models` entry, picked by `litellm_trace_id` — that list is the ROUTER's,
#      at most four entries shared across requests (F9) — and refuses a class of LiteLLM's that means malformed.
#      With neither, it ALLOWS the fallback: a failure it cannot see is treated as a failure.
#
# WHAT THE CLIENT SEES WHEN REFUSED: the provider's refusal. When a fallback raises, the router answers the ORIGINAL
# exception (router.py's async_function_with_fallbacks_common_utils) — the provider's status, LiteLLM's `type` for
# it, `code` the status, and the provider's message with LiteLLM's fallback debug text appended ([M5], F10). The
# message raised here lands in that debug text AND in LiteLLM's ERROR log line, so it is a fixed sentence: never
# the provider's message, which could quote the request.
#
# A 422 NEVER REACHES THIS FILE (F8, read at Task 6): with `drop_params: true`, LiteLLM's OpenAI provider answers a
# 422 by dropping params and retrying once (llms/openai/openai.py, `for _ in range(2)`), and when the retry is
# refused too the loop ends without returning — `None`, which the proxy answers as HTTP 200 with the body `null`.
# No exception, so no fallback and no hook. It stays in the set below for a LiteLLM that fixes it.
#
# PRINTS NOTHING FROM A REQUEST — no message, key, header or prompt: one line at load (`make verify` reads the
# callback list instead, which proves it is REGISTERED and not merely imported), and one per refusal naming the
# trace id, the status and the class. It must never throw anything but the deliberate refusal: a guard that
# crashes on its own reading would turn every fallback into a failure, so every read is wrapped and a failed
# read ALLOWS.
from collections import OrderedDict

import httpx
import litellm
from litellm.integrations.custom_logger import CustomLogger

# The provider refused the request as malformed. 413 is LiteLLM's too (it names Anthropic's and Replicate's 413 a
# BadRequestError); 422 is the provider's unprocessable request.
MALFORMED_STATUSES = frozenset({400, 413, 422})

# When no status was recorded: LiteLLM 1.98.0's BadRequestError and every subclass of it, listed by NAME because
# `previous_models` stores `type(e).__name__` — read inside the running container at Task 6 (litellm/exceptions.py:
# ContentPolicyViolationError, ContextWindowExceededError, ImageFetchError, LiteLLMUnknownProvider,
# RejectedRequestError, UnsupportedParamsError) — its InvalidRequestError (openai's BadRequestError, status 400),
# and its UnprocessableEntityError.
MALFORMED_CLASSES = frozenset(
    {
        "BadRequestError",
        "ContentPolicyViolationError",
        "ContextWindowExceededError",
        "ImageFetchError",
        "InvalidRequestError",
        "LiteLLMUnknownProvider",
        "RejectedRequestError",
        "UnprocessableEntityError",
        "UnsupportedParamsError",
    }
)

# How many requests' statuses are remembered. A fallback starts within the same request, milliseconds after its
# failure is recorded, so this only has to outlast the requests in flight at once; the oldest goes first.
REMEMBERED = 4096

print(
    "manifest_guard: loaded — the capable model's fallback answers a provider that failed, "
    "never a request it refused as malformed (400, 413, 422)",
    flush=True,
)


class ManifestFallbackGuard(CustomLogger):
    def __init__(self) -> None:
        super().__init__()
        self._statuses: "OrderedDict[str, int]" = OrderedDict()

    async def async_log_failure_event(self, kwargs, response_obj, start_time, end_time):
        try:
            trace = (kwargs.get("standard_logging_object") or {}).get("trace_id")
            status = getattr(kwargs.get("exception"), "status_code", None)
            if not isinstance(trace, str):
                return
            if not isinstance(status, int):
                # A failure with no status — a deployment in cooldown answers RouterRateLimitError (measured) —
                # clears the trace's record, so a caller that reuses its own trace id is never judged by the
                # status of an earlier request.
                self._statuses.pop(trace, None)
                return
            self._statuses[trace] = status
            self._statuses.move_to_end(trace)
            while len(self._statuses) > REMEMBERED:
                self._statuses.popitem(last=False)
        except Exception as error:  # never break LiteLLM's failure logging; say so, with nothing from the request
            print(f"manifest_guard: could not record a failure ({type(error).__name__})", flush=True)

    async def async_pre_call_deployment_hook(self, kwargs, call_type):
        try:
            if not isinstance(kwargs.get("fallback_depth"), int) or kwargs["fallback_depth"] < 1:
                return None
            trace = kwargs.get("litellm_trace_id")
            if not isinstance(trace, str):
                return None
            status = self._statuses.get(trace)
            meta = kwargs.get("metadata") or kwargs.get("litellm_metadata") or {}
            mine = [
                p
                for p in (meta.get("previous_models") or [])
                if isinstance(p, dict) and p.get("litellm_trace_id") == trace
            ]
            named = mine[-1].get("exception_type") if mine else None
            refused = status in MALFORMED_STATUSES if status is not None else named in MALFORMED_CLASSES
        except Exception as error:  # a read that fails ALLOWS the fallback — and says so
            print(f"manifest_guard: could not read a fallback ({type(error).__name__}); allowed", flush=True)
            return None
        if not refused:
            return None
        print(
            f"manifest_guard: refused the fallback of trace {trace} — its provider answered "
            f"{status if status is not None else 'a status not recorded'} ({named or 'class not recorded'}), "
            "a request refused as malformed",
            flush=True,
        )
        raise _refusal(status, str(kwargs.get("model")))


def _refusal(status, model):
    """The class LiteLLM gives the provider's status (the controller's ruling 3). The client never sees it — the
    router answers the ORIGINAL exception — but LiteLLM's ERROR line names it, so it says what happened."""
    message = "the provider refused this request as malformed, so no fallback model answers it"
    if status == 422:
        # UnprocessableEntityError will not construct without a response (measured: openai's base reads its request).
        request = httpx.Request("POST", "https://gateway.invalid/v1/chat/completions")
        return litellm.UnprocessableEntityError(
            message=message, model=model, llm_provider="manifest", response=httpx.Response(422, request=request)
        )
    return litellm.BadRequestError(message=message, model=model, llm_provider="manifest")


proxy_handler_instance = ManifestFallbackGuard()
