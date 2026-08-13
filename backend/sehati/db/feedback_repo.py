"""Feedback flywheel dataset (design doc section 13).

Rather than attempt RLHF in a hackathon window (which risks sycophancy), we
capture every physician accept / reject / edit as a first-class, structured
dataset from day one — with the reason, the model version, and the retrieved
context that produced the recommendation. This is the raw material for an
offline eval harness and a future DPO/preference-tuning path.
"""

from __future__ import annotations

import time
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


# --- Doctor-facing free-text feedback ---------------------------------------
# A separate dataset (``sehati-doctor-feedback``, keyed by doctorId) from the
# accept/reject flywheel above: this is the "leave a note" feature exposed in
# the case UI (resolvers/feedback.py), and doubles as a per-doctor preference
# history that the AI seam can fold back into its prompts.
def save_doctor_feedback(
    doctor_id: str,
    case_id: str,
    feedback_text: str,
    category: str = "general",
) -> dict[str, Any]:
    """Saves feedback under the doctor's ID."""
    table = tables.doctor_feedback_table()
    item = {
        "doctorId": doctor_id,
        "timestamp": int(time.time()),
        "caseId": case_id,
        "feedback": feedback_text,
        "category": category,
    }
    table.put_item(Item=tables.to_dynamo(item))
    return item


def get_doctor_feedback_history(doctor_id: str, limit: int = 5) -> list[str]:
    """Gets the most recent feedback entries for a specific doctor."""
    table = tables.doctor_feedback_table()
    res = table.query(
        KeyConditionExpression=Key("doctorId").eq(doctor_id),
        ScanIndexForward=False,  # Most recent first
        Limit=limit,
    )
    return [tables.from_dynamo(item)["feedback"] for item in res.get("Items", [])]
