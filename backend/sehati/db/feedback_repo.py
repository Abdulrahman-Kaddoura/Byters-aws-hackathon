"""Feedback flywheel dataset (design doc section 13).

Rather than attempt RLHF in a hackathon window (which risks sycophancy), we
capture every physician accept / reject / edit as a first-class, structured
dataset from day one — with the reason, the model version, and the retrieved
context that produced the recommendation. This is the raw material for an
offline eval harness and a future DPO/preference-tuning path.
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
    kind: str,  # "accept" | "reject" | "edit"
    target_type: str,  # "recommendation" | "test" | "diagnosis" | "final_diagnosis"
    target_id: str,
    reason: str | None = None,
    model_version: str | None = None,
    retrieved_context: Any = None,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    ts = now_iso()
    entry: dict[str, Any] = {
        "caseId": case_id,
        "sk": f"{ts}#{uuid.uuid4().hex[:8]}",
        "ts": ts,
        "physicianId": ctx.sub,
        "kind": kind,
        "targetType": target_type,
        "targetId": target_id,
    }
    if reason:
        entry["reason"] = reason
    if model_version:
        entry["modelVersion"] = model_version
    if retrieved_context is not None:
        entry["retrievedContext"] = retrieved_context
    if payload:
        entry["payload"] = payload
    tables.feedback_table().put_item(Item=tables.to_dynamo(entry))
    return entry


def list_for_case(case_id: str) -> list[dict[str, Any]]:
    resp = tables.feedback_table().query(
        KeyConditionExpression=Key("caseId").eq(case_id),
        ScanIndexForward=True,
    )
    return [tables.from_dynamo(i) for i in resp.get("Items", [])]
