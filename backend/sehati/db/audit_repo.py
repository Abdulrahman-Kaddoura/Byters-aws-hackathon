"""Immutable audit trail (design doc section 10.2 / section 14).

Every clinically or medico-legally significant action is appended here:
who / what / when / model version / retrieved context / output / accept-reject.
The table is append-only by convention; in production these entries are mirrored
to an S3 Object Lock (WORM) bucket for true immutability (see docs/ARCHITECTURE).

Entries are keyed ``(caseId, ts#uuid)`` so a case's full history is a single
range query, ordered chronologically.
"""

from __future__ import annotations

import uuid
from typing import Any

from boto3.dynamodb.conditions import Key

from ..context import AuthContext
from ..models import now_iso
from . import tables


def record(
    ctx: AuthContext,
    *,
    case_id: str,
    action: str,
    output: Any = None,
    model_version: str | None = None,
    retrieved_context: Any = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    ts = now_iso()
    entry: dict[str, Any] = {
        "caseId": case_id,
        "sk": f"{ts}#{uuid.uuid4().hex[:8]}",
        "ts": ts,
        "actor": ctx.sub,
        "actorGroups": sorted(ctx.groups),
        "action": action,
    }
    if output is not None:
        entry["output"] = output
    if model_version is not None:
        entry["modelVersion"] = model_version
    if retrieved_context is not None:
        entry["retrievedContext"] = retrieved_context
    if extra:
        entry.update(extra)
    tables.audit_table().put_item(Item=tables.to_dynamo(entry))
    return entry


def list_for_case(case_id: str, ctx: AuthContext) -> list[dict[str, Any]]:
    """Read a case's audit trail. Requires the ``audit.view`` permission."""
    ctx.require_permission("audit.view")
    resp = tables.audit_table().query(
        KeyConditionExpression=Key("caseId").eq(case_id),
        ScanIndexForward=True,
    )
    return [tables.from_dynamo(i) for i in resp.get("Items", [])]
