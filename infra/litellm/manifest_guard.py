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
# provider's own `status_code`. So the status decides; the class only when an exception carries no status.
#
# EACH REQUEST IS JUDGED BY ITS OWN FAILURE, READ FROM ITS OWN LOGGING OBJECT (fix round 1). The proxy makes one
# logging object per request and hands it to every attempt, the fallback's included (router.py:~3005 passes
# `litellm_logging_obj` through); a PROVIDER's failed attempt's exception is stored on it
# (`model_call_details["exception"]`, litellm_logging.py:~2875) BEFORE its failure reaches the router, and nothing
# between that attempt and the fallback's pre-call hook replaces it (`update_environment_variables` updates the
# dict, and runs after the hook). A ROUTER-MADE rejection is not stored that way (the whole-branch review's O1,
# sitting 4): `There are no healthy deployments for this model` (router.py:~10901, a `BadRequestError`, status 400)
# is logged in the BACKGROUND — a thread and a task, router.py:~11221–11235 — so the fallback's hook may or may not
# see it: seen, it is a 400 and the fallback is refused; not seen, there is no exception and the fallback is allowed.
# Measured at the fix round, in a probe LiteLLM from the pinned image: the fallback's hook saw the SAME object as
# the primary's attempt, holding the primary's exception and status (400, 401, 403, 404, 408, 413, 429, 503), and
# two concurrent requests sharing one trace and session id saw two different objects.
#   The first shape keyed a shared store by trace or session id, and a CLIENT names both — `x-litellm-trace-id`,
#   `x-litellm-session-id`, any `x-<vendor>-session-id` (an agent's `x-claude-code-session-id`), W3C `traceparent`
#   and `baggage` — so one request was judged by another's failure: a 401 sent with `baggage` was refused, and a
#   `no-log` request inherited its session's earlier status (the review; the Docker test's red run). No client can
#   name a logging object, and there is no store to go stale.
#
# The hook runs on the fallback deployment's call with `fallback_depth >= 1` ([M5]) and never on a first call.
# When it cannot see a failure — no logging object, no exception on it, or a read that fails — it ALLOWS the
# fallback: a failure it cannot see is treated as a failure.
#
# ITS KNOWN LIMITS (the whole-branch review, sitting 4) — named, not handled, and neither reachable today:
#  - It refuses EVERY fallback of EVERY model after a 400, 413 or 422: the hook is not told which model's fallback
#    list, or which TYPE of list, sent it. Today the platform sets only `general` fallbacks (`ai/capable.ts` never
#    sets `context_window` or `content_policy` ones). A future `context_window_fallbacks` entry would be defeated by
#    this file — LiteLLM names a context-window overflow `ContextWindowExceededError`, a 400 — and so would a
#    `content_policy_fallbacks` one.
#  - A 400 is not always the caller's. A provider may answer its OWN failure — a billing one, say — with 400; and
#    `LiteLLMUnknownProvider`, a `BadRequestError`, is the PLATFORM's misconfiguration (a provider prefix LiteLLM
#    does not know), which `ai/capable.ts` refuses to register. Either would be refused its fallback as malformed.
#
# WHAT THE CLIENT SEES WHEN REFUSED: the provider's refusal. When a fallback raises, the router answers the ORIGINAL
# exception (router.py's async_function_with_fallbacks_common_utils) — the provider's status, LiteLLM's `type` for
# it, `code` the status, and the provider's message with LiteLLM's fallback debug text appended ([M5], F10). The
# message raised here lands in that debug text AND in LiteLLM's ERROR log line, so it is a fixed sentence: never
# the provider's message, which could quote the request.
#
# A PROVIDER'S 422 IS ANSWERED 422 — THE SECOND GUARD, BELOW (F8; the faculty-ready plan's Task 6, its Task 1's
# [M3] guard (E)). With `drop_params: true`, LiteLLM 1.98.0's OpenAI provider answers a 422 by dropping params and
# retrying once (llms/openai/openai.py, `for _ in range(2)`), and when the retry is refused too the loop ends
# without returning: `None`. No exception, so no fallback is asked and the hook above never runs. Unguarded, the
# proxy answered that `None` as HTTP 200 with the body `null`, and a STREAMED request as 500 with LiteLLM's own
# Python error ("'async for' requires an object with __aiter__ method, got NoneType"). So two proxy hooks refuse a
# `None` answer as 422 before anything is sent: the post-call success hook (a request) and the streaming iterator
# hook (a stream, checked BEFORE it is iterated — the stream object itself is `None`). The provider's own 422 is
# swallowed by then, so the refusal is a fixed sentence. 422 stays in the set below for the fallback guard too.
#
# PRINTS NOTHING FROM A REQUEST — no message, key, header or prompt: one line at load (`make verify` reads the
# callback list instead, which proves it is REGISTERED and not merely imported), and one per refusal naming the
# status, the class and the request's trace id — which a client may name, so it is printed as `repr()` and cut,
# never as raw text that could forge a log line. It must never throw anything but the deliberate refusal: a guard
# that crashed on its own reading would turn every fallback into a failure, so every read is wrapped and a failed
# read ALLOWS.
import httpx
import litellm
import openai
from litellm.integrations.custom_logger import CustomLogger

# The provider refused the request as malformed. 413 is LiteLLM's too (it names Anthropic's and Replicate's 413 a
# BadRequestError); 422 is the provider's unprocessable request.
MALFORMED_STATUSES = frozenset({400, 413, 422})

# Only for an exception that carries no status: openai's BadRequestError covers LiteLLM 1.98.0's BadRequestError
# and every subclass of it (read in the running container at Task 6: ContentPolicyViolationError,
# ContextWindowExceededError, ImageFetchError, LiteLLMUnknownProvider, RejectedRequestError,
# UnsupportedParamsError) and its InvalidRequestError; openai's UnprocessableEntityError covers LiteLLM's.
MALFORMED_CLASSES = (openai.BadRequestError, openai.UnprocessableEntityError)

print(
    "manifest_guard: loaded — the capable model's fallback answers a provider that failed, "
    "never a request it refused as malformed (400, 413, 422)",
    flush=True,
)


class ManifestFallbackGuard(CustomLogger):
    async def async_pre_call_deployment_hook(self, kwargs, call_type):
        try:
            depth = kwargs.get("fallback_depth")
            if not isinstance(depth, int) or depth < 1:
                return None
            details = getattr(kwargs.get("litellm_logging_obj"), "model_call_details", None)
            failure = details.get("exception") if isinstance(details, dict) else None
            if failure is None:
                return None
            status = getattr(failure, "status_code", None)
            if isinstance(status, int):
                refused = status in MALFORMED_STATUSES
            else:
                refused = isinstance(failure, MALFORMED_CLASSES)
            trace = repr(str(kwargs.get("litellm_trace_id"))[:64])
        except Exception as error:  # a read that fails ALLOWS the fallback — and says so
            print(f"manifest_guard: could not read a fallback ({type(error).__name__}); allowed", flush=True)
            return None
        if not refused:
            return None
        print(
            f"manifest_guard: refused a fallback — its provider answered "
            f"{status if isinstance(status, int) else 'no status'} ({type(failure).__name__}), "
            f"a request refused as malformed; trace {trace}",
            flush=True,
        )
        raise _refusal(status, str(kwargs.get("model")))

    # F8 (above): a provider's 422 leaves LiteLLM with no answer at all. Refused 422 here, never sent as `null`.
    async def async_post_call_success_hook(self, data, user_api_key_dict, response):
        if response is None:
            print("manifest_guard: a provider's 422 left no answer; refused 422", flush=True)
            raise _unprocessable()
        return response

    # The same for a stream: the stream object itself is `None`, so it is checked BEFORE it is iterated, and the
    # refusal is raised at the first chunk the proxy asks for — before any byte of a stream is sent. Every other
    # stream passes through unchanged. Defining this hook on the class is what puts it in LiteLLM's iterator chain
    # (proxy/utils.py reads the class's own attributes).
    async def async_post_call_streaming_iterator_hook(self, user_api_key_dict, response, request_data):
        if response is None:
            print("manifest_guard: a provider's 422 left no stream; refused 422", flush=True)
            raise _unprocessable()
        async for item in response:
            yield item


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


def _unprocessable():
    """F8's refusal: what the client sees, streamed or not — `422`, `invalid_request_error`, code `"422"`, and a
    fixed message (the provider's own is swallowed by then). The streaming path takes its status from
    `status_code` (proxy/common_request_processing.py: `getattr(e, "status_code", 500)`), and a ProxyException
    carries only `code`, so both are set ([M3]: without `status_code` a stream is answered 500)."""
    from litellm.proxy._types import ProxyException  # at call time: the proxy imports this module while it loads

    refusal = ProxyException(
        message="the provider could not process this request (422), so it was not answered; correct the request",
        type="invalid_request_error",
        param=None,
        code=422,
    )
    refusal.status_code = 422
    return refusal


proxy_handler_instance = ManifestFallbackGuard()
