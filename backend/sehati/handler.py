"""AWS Lambda entry point for API Gateway (HTTP API, Lambda proxy integration,
payload format version 1.0).

API Gateway invokes this handler for every request. Payload format 1.0 keeps
the event shape identical to the old REST API proxy integration this replaced:
the matched ``resource`` template (e.g.
``"/cases/{caseId}/tests/{testId}/order"``) and ``httpMethod``, plus
``pathParameters``, ``queryStringParameters``, a JSON ``body``, and — once the
Cognito JWT authorizer has verified the caller's ID token — the verified
claims under ``requestContext.authorizer.jwt.claims`` (see
:func:`_extract_claims`, which also accepts the old REST API authorizer's
``requestContext.authorizer.claims`` shape).

We look up the ``(method, resource)`` pair in the route table below to find
which internal field to dispatch, build the resolver's ``args`` from the path
params + query string + JSON body, build an :class:`AuthContext` from the
*verified* claims only (never from the body), dispatch through the router,
and shape the result into an API Gateway proxy response.
"""

from __future__ import annotations

import dataclasses
import json
import logging
import os
from dataclasses import dataclass, field
from typing import Any

from .context import AuthContext, from_apigw_claims
from .db import users_repo
from .errors import AppError, NotFoundError
from .models import SUPER_ADMIN_USERNAME
from .permissions import PERMISSIONS
from .router import resolve

logger = logging.getLogger()
logger.setLevel(os.environ.get("LOG_LEVEL", "INFO"))

def _cors_headers() -> dict[str, str]:
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    }


@dataclass(frozen=True)
class _Route:
    method: str
    resource: str
    field: str
    # If set, the whole JSON body becomes args[body_key]. Otherwise the body's
    # top-level keys are spread directly into args (mirrors REST convention).
    body_key: str | None = None
    # Maps a pathParameters key to the resolver arg name, when they differ
    # (e.g. the {caseId} path segment feeds getCase's "id" argument).
    path_arg_map: dict[str, str] = field(default_factory=dict)


_ROUTES = [
    _Route("GET", "/cases", "listCases"),
    _Route("POST", "/cases", "submitIntake", body_key="input"),
    _Route("GET", "/cases/{caseId}", "getCase", path_arg_map={"caseId": "id"}),
    _Route("PUT", "/cases/{caseId}", "setCaseState"),
    _Route("GET", "/cases/{caseId}/audit", "caseAudit", path_arg_map={"caseId": "id"}),
    _Route("POST", "/cases/{caseId}/notes", "addNote"),
    _Route("POST", "/cases/{caseId}/interview/messages", "postInterviewMessage"),
    _Route("POST", "/cases/{caseId}/interview/summary", "generateSummary"),
    _Route("POST", "/cases/{caseId}/conversations", "createConversation"),
    _Route("POST", "/cases/{caseId}/conversations/{conversationId}/messages", "postConversationMessage"),
    _Route("POST", "/cases/{caseId}/exams", "recommendExams"),
    _Route("PUT", "/cases/{caseId}/exams/{examId}", "recordExamFinding"),
    _Route("POST", "/cases/{caseId}/diagnoses", "requestRecommendations"),
    _Route("POST", "/cases/{caseId}/diagnoses/ask", "askDiagnosis"),
    _Route("POST", "/cases/{caseId}/diagnoses/rerank", "rerankAfterResults"),
    _Route("POST", "/cases/{caseId}/final-diagnosis", "proposeFinalDiagnosis"),
    _Route("PUT", "/cases/{caseId}/final-diagnosis", "acceptFinalDiagnosis"),
    _Route("POST", "/cases/{caseId}/tests/{testId}/order", "orderTest"),
    _Route("PUT", "/cases/{caseId}/tests/{testId}/result", "recordTestResult"),
    _Route("POST", "/cases/{caseId}/assistant", "assistantChat"),
    _Route("POST", "/cases/{caseId}/recommendations/{targetId}/accept", "acceptRecommendation"),
    _Route("POST", "/cases/{caseId}/recommendations/{targetId}/reject", "rejectRecommendation"),
    _Route("POST", "/cases/{caseId}/documents", "uploadCaseDocument"),
    _Route("POST", "/cases/{caseId}/audio", "uploadCaseAudio"),
    _Route("POST", "/cases/{caseId}/transcribe", "startTranscription"),
    _Route("GET", "/cases/{caseId}/transcribe/{jobName}", "transcriptionStatus"),
    _Route("POST", "/cases/{caseId}/feedback", "submitFeedback"),
    _Route("GET", "/resources", "listResources"),
    _Route("POST", "/resources", "uploadResource"),
    _Route("DELETE", "/resources/{resourceId}", "deleteResource", path_arg_map={"resourceId": "id"}),
    _Route("GET", "/admin/users", "adminListUsers"),
    _Route("POST", "/admin/users", "adminCreateUser"),
    _Route("GET", "/admin/users/{userId}", "adminGetUser", path_arg_map={"userId": "sub"}),
    _Route("PUT", "/admin/users/{userId}", "adminUpdateUser", path_arg_map={"userId": "sub"}),
    _Route("GET", "/admin/groups", "adminListGroups"),
    _Route("POST", "/admin/groups", "adminCreateGroup"),
    _Route("PUT", "/admin/groups/{groupId}", "adminUpdateGroup", path_arg_map={"groupId": "id"}),
    _Route("DELETE", "/admin/groups/{groupId}", "adminDeleteGroup", path_arg_map={"groupId": "id"}),
    _Route("GET", "/admin/permissions", "adminListPermissions"),
]
_ROUTE_INDEX: dict[tuple[str, str], _Route] = {(r.method, r.resource): r for r in _ROUTES}


def handler(event: dict[str, Any], context: Any = None) -> dict[str, Any]:  # noqa: ANN401
    method = event.get("httpMethod", "")
    resource = event.get("resource", "")

    cors = _cors_headers()

    if method == "OPTIONS":
        return _response(200, "", cors)

    route = _ROUTE_INDEX.get((method, resource))
    logger.info("dispatch method=%s resource=%s field=%s", method, resource, route.field if route else None)

    try:
        if route is None:
            raise NotFoundError(f"No route for {method} {resource}.")

        claims = _extract_claims(event)
        ctx = from_apigw_claims(claims)
        ctx = _enrich_with_permissions(ctx)
        args = _build_args(event, route)
        result = resolve(route.field, ctx, args)
        return _response(200, json.dumps(result, default=str), cors)
    except AppError as exc:
        logger.warning("app_error resource=%s type=%s msg=%s", resource, exc.code, exc.message)
        return _response(exc.http_status, json.dumps(exc.to_dict()), cors)
    except Exception:  # noqa: BLE001
        logger.exception("unhandled_error resource=%s", resource)
        return _response(
            500,
            json.dumps({"errorType": "InternalError", "message": "An internal error occurred."}),
            cors,
        )


def _extract_claims(event: dict[str, Any]) -> dict[str, Any] | None:
    """Pull the verified JWT claims out of the authorizer context.

    HTTP API's JWT authorizer (Cognito used as issuer) nests claims one level
    deeper — ``requestContext.authorizer.jwt.claims`` — than REST API's
    COGNITO_USER_POOLS authorizer, which put them directly under
    ``requestContext.authorizer.claims``. Checking both keeps this working
    across either API Gateway type without the caller needing to know which
    one is in front of it.
    """
    authorizer = (event.get("requestContext") or {}).get("authorizer") or {}
    return (authorizer.get("jwt") or {}).get("claims") or authorizer.get("claims")


def _enrich_with_permissions(ctx: AuthContext) -> AuthContext:
    """Attach the caller's fine-grained permission set (from the admin-editable
    custom-group system), looked up in the data layer by ``sub`` — never
    trusted from the JWT. A caller with no user record yet (not provisioned
    in ``sehati-users``) gets an empty permission set: fails closed.

    The fixed super-admin account (``SUPER_ADMIN_USERNAME``) is the one
    exception: it always gets the full permission set, regardless of its
    stored group/override state or even a missing ``sehati-users`` record.
    That's what makes it safe to promise this account "can always log in and
    manage the panel" — a stale or corrupted permission record can't lock it
    out too."""
    user = users_repo.find_user(ctx.sub)
    permissions = users_repo.effective_permissions(user) if user is not None else frozenset()
    if ctx.username == SUPER_ADMIN_USERNAME:
        permissions = permissions | frozenset(PERMISSIONS)
    return dataclasses.replace(ctx, permissions=permissions)


def _build_args(event: dict[str, Any], route: _Route) -> dict[str, Any]:
    query = event.get("queryStringParameters") or {}
    body_raw = event.get("body")
    body: dict[str, Any] = json.loads(body_raw) if body_raw else {}

    args: dict[str, Any] = {k: _coerce_query_value(v) for k, v in query.items()}
    if route.body_key:
        args[route.body_key] = body
    else:
        args.update(body)

    for key, value in (event.get("pathParameters") or {}).items():
        args[route.path_arg_map.get(key, key)] = value
    return args


def _coerce_query_value(value: str) -> Any:
    """Query string values are always strings; coerce obvious booleans."""
    if value.lower() == "true":
        return True
    if value.lower() == "false":
        return False
    return value


def _response(status: int, body: str, cors: dict[str, str]) -> dict[str, Any]:
    return {
        "statusCode": status,
        "headers": {**cors, "Content-Type": "application/json"},
        "body": body,
    }
