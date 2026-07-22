"""AWS Lambda entry point for AppSync Direct Lambda Resolvers.

AppSync invokes this handler for every GraphQL field. The event carries:
  * ``info.fieldName``  — which query/mutation to run,
  * ``arguments``       — the GraphQL arguments,
  * ``identity``        — the verified Cognito identity (sub, groups, claims).

We build an :class:`AuthContext` from the *signed* identity only (never from the
arguments), dispatch through the router, and return the resolver's value. Errors
are converted to AppSync error payloads so the client receives ``errorType`` +
``message`` without leaking internals or PHI.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

from .context import from_appsync_identity
from .errors import AppError
from .router import resolve

logger = logging.getLogger()
logger.setLevel(os.environ.get("LOG_LEVEL", "INFO"))


def handler(event: dict[str, Any], context: Any = None) -> Any:  # noqa: ANN401
    field = (event.get("info") or {}).get("fieldName", "<unknown>")
    args = event.get("arguments") or {}
    identity = event.get("identity")

    logger.info("resolve field=%s", field)
    try:
        ctx = from_appsync_identity(identity)
        result = resolve(field, ctx, args)
        # AppSync JSON-serializes the return value; ensure it is plain JSON.
        return json.loads(json.dumps(result, default=str))
    except AppError as exc:
        logger.warning("app_error field=%s type=%s msg=%s", field, exc.code, exc.message)
        # AppSync surfaces raised errors; use a structured, typed shape.
        raise _AppSyncError(exc.to_dict()) from exc
    except Exception:  # noqa: BLE001
        logger.exception("unhandled_error field=%s", field)
        raise _AppSyncError(
            {"errorType": "InternalError", "message": "An internal error occurred."}
        )


class _AppSyncError(Exception):
    """Serializes to a JSON string so AppSync exposes a structured error.

    AppSync reads the exception message as the error text; encoding a JSON object
    lets the frontend parse ``errorType`` while keeping the message safe.
    """

    def __init__(self, payload: dict[str, Any]) -> None:
        super().__init__(json.dumps(payload))
