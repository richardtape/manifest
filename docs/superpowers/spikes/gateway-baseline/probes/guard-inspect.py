# The UBC AI Gateway plan's Task 1, [M5]: the REAL fallback guard (infra/litellm/manifest_guard.py, mounted beside this
# file in gw-probe), subclassed only to print what it reads — the failed attempt's exception CLASS and its
# `status_code`, `type`, `code` and `param` attributes, never its message (which can quote the request or a key).
# Every decision is the real guard's: each hook calls the parent's. The streaming-iterator hook is redefined here
# because LiteLLM chains an iterator hook only from a class's OWN __dict__ (TRAPS.md); it delegates unchanged.
from manifest_guard import ManifestFallbackGuard


def _attr(failure, name):
    value = getattr(failure, name, None)
    return repr(value)[:60]


class GuardInspect(ManifestFallbackGuard):
    async def async_pre_call_deployment_hook(self, kwargs, call_type):
        try:
            depth = kwargs.get("fallback_depth")
            details = getattr(kwargs.get("litellm_logging_obj"), "model_call_details", None)
            failure = details.get("exception") if isinstance(details, dict) else None
            if isinstance(depth, int) and depth >= 1:
                print(
                    "guard_inspect: fallback_depth=%s class=%s status_code=%s type=%s code=%s param=%s"
                    % (
                        depth,
                        type(failure).__name__ if failure is not None else None,
                        _attr(failure, "status_code"),
                        _attr(failure, "type"),
                        _attr(failure, "code"),
                        _attr(failure, "param"),
                    ),
                    flush=True,
                )
        except Exception as error:
            print(f"guard_inspect: could not read ({type(error).__name__})", flush=True)
        return await super().async_pre_call_deployment_hook(kwargs, call_type)

    async def async_post_call_streaming_iterator_hook(self, user_api_key_dict, response, request_data):
        async for item in super().async_post_call_streaming_iterator_hook(user_api_key_dict, response, request_data):
            yield item


proxy_handler_instance = GuardInspect()
