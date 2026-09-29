# Task 1, Step 4(b) — can a LiteLLM hook tell a FALLBACK call from a first one, and see the original error?
# Loaded by manifest-probe-litellm (never by the platform's LiteLLM). PROBE_GUARD=1 makes it refuse a fallback
# whose original error was a client error — the shape Task 6's guard would take. Prints no message, key or header.
import os
import litellm
from litellm.integrations.custom_logger import CustomLogger

CLIENT_ERRORS = {"BadRequestError", "AuthenticationError", "PermissionDeniedError", "NotFoundError", "UnprocessableEntityError"}

class ProbeHook(CustomLogger):
    async def async_pre_call_deployment_hook(self, kwargs, call_type):
        meta = kwargs.get("metadata") or kwargs.get("litellm_metadata") or {}
        previous = meta.get("previous_models") or []
        last = previous[-1] if previous else {}
        print("PROBE_HOOK", {
            "model": kwargs.get("model"),
            "fallback_depth": kwargs.get("fallback_depth"),
            "kwargs_keys": sorted(k for k in kwargs.keys() if k not in ("messages", "api_key")),
            "metadata_keys": sorted(meta.keys()),
            "previous_exception_types": [p.get("exception_type") for p in previous],
            "previous_status": getattr(last, "get", lambda *_: None)("status_code"),
            "trace_id": kwargs.get("litellm_trace_id"),
            "previous_trace_ids": [p.get("litellm_trace_id") for p in previous],
            "previous_entry_keys": sorted(last.keys()) if isinstance(last, dict) else None,
        }, flush=True)
        # the entry for THIS request, if a trace id ties one to it — the only per-request link (a guard must use it)
        mine = [p for p in previous if p.get("litellm_trace_id") and p.get("litellm_trace_id") == kwargs.get("litellm_trace_id")]
        print("PROBE_HOOK mine", [p.get("exception_type") for p in mine], flush=True)
        if os.environ.get("PROBE_GUARD") == "1" and (kwargs.get("fallback_depth") or 0) >= 1 and mine and mine[-1].get("exception_type") in CLIENT_ERRORS:
            print("PROBE_HOOK refusing a fallback after", mine[-1].get("exception_type"), flush=True)
            raise litellm.BadRequestError(message="the provider refused the request as malformed (probe guard)", model=str(kwargs.get("model")), llm_provider="openai")
        return None

proxy_handler_instance = ProbeHook()
