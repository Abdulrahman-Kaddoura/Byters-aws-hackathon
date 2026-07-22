"""Case persistence — ownership-scoped access (the data-layer RLS analog).

Every read/write goes through an :class:`~sehati.context.AuthContext`. This is
where the design document's core security principle is enforced:

    "The AI is never the authorization boundary. Authorization is enforced in
     the data layer before retrieval." (design doc section 10.1)

DynamoDB has no native row-level security, so we implement the equivalent here:
a patient may only touch cases where ``patientId == caller.sub``; clinical staff
(physician/admin/compliance) may access any case in the hospital tenant. Callers
never reach the table directly.
"""

from __future__ import annotations

from typing import Any

from boto3.dynamodb.conditions import Key

from ..context import AuthContext
from ..errors import ForbiddenError, NotFoundError
from ..models import PatientCase, now_iso
from . import tables


# GSI key attributes must never be empty strings (DynamoDB rejects them).
_INDEX_KEYS = ("patientId", "assignedPhysicianId", "status", "createdAt")


def _sanitize_index_keys(case: dict[str, Any]) -> dict[str, Any]:
    for key in _INDEX_KEYS:
        if case.get(key) == "":
            case.pop(key, None)
    return case


def _visible_to(case: dict[str, Any], ctx: AuthContext) -> bool:
    """The RLS predicate. Clinical staff see all; patients see only their own."""
    if ctx.is_clinical_staff:
        return True
    if ctx.is_patient:
        return case.get("patientId") == ctx.sub
    return False


def get_case(case_id: str, ctx: AuthContext) -> PatientCase:
    resp = tables.cases_table().get_item(Key={"id": case_id})
    item = resp.get("Item")
    if not item:
        raise NotFoundError(f"Case '{case_id}' not found.")
    case = tables.from_dynamo(item)
    if not _visible_to(case, ctx):
        # Do not leak existence details across the isolation boundary.
        raise ForbiddenError("You are not permitted to access this case.")
    return case


def list_cases(
    ctx: AuthContext,
    *,
    status: str | None = None,
    mine: bool = False,
) -> list[PatientCase]:
    """List cases visible to the caller.

    Patients are always restricted to their own cases (queried via the
    ``byPatient`` GSI). Clinical staff list the tenant, optionally filtered by
    status or to cases assigned to them.
    """
    table = tables.cases_table()

    if ctx.is_patient:
        resp = table.query(
            IndexName="byPatient",
            KeyConditionExpression=Key("patientId").eq(ctx.sub),
        )
        items = resp.get("Items", [])
    elif mine and ctx.is_physician:
        resp = table.query(
            IndexName="byPhysician",
            KeyConditionExpression=Key("assignedPhysicianId").eq(ctx.sub),
        )
        items = resp.get("Items", [])
    elif status:
        resp = table.query(
            IndexName="byStatus",
            KeyConditionExpression=Key("status").eq(status),
        )
        items = resp.get("Items", [])
    else:
        # Full tenant scan is acceptable at pilot scale (few hundred cases).
        items = table.scan().get("Items", [])

    cases = [tables.from_dynamo(i) for i in items]
    cases = [c for c in cases if _visible_to(c, ctx)]
    if status:
        cases = [c for c in cases if c.get("status") == status]
    cases.sort(key=lambda c: c.get("createdAt", ""), reverse=True)
    return cases


def put_case(case: PatientCase, ctx: AuthContext) -> PatientCase:
    """Create or replace a case. Enforces ownership on overwrite."""
    if not ctx.is_clinical_staff and not ctx.is_patient:
        raise ForbiddenError("You are not permitted to write cases.")
    # On overwrite of an existing case, re-check visibility.
    existing = tables.cases_table().get_item(Key={"id": case["id"]}).get("Item")
    if existing is not None:
        prev = tables.from_dynamo(existing)
        if not _visible_to(prev, ctx):
            raise ForbiddenError("You are not permitted to modify this case.")
    case["updatedAt"] = now_iso()
    tables.cases_table().put_item(Item=tables.to_dynamo(_sanitize_index_keys(case)))
    return case


def save_case(case: PatientCase, ctx: AuthContext) -> PatientCase:
    """Persist an already-authorized case mutation (touch ``updatedAt``)."""
    case["updatedAt"] = now_iso()
    tables.cases_table().put_item(Item=tables.to_dynamo(_sanitize_index_keys(case)))
    return case
