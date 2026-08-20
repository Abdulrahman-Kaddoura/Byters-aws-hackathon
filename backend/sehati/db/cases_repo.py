"""Case persistence — ownership-scoped access (the data-layer RLS analog).

Every read/write goes through an :class:`~sehati.context.AuthContext`. This is
where the design document's core security principle is enforced:

    "The AI is never the authorization boundary. Authorization is enforced in
     the data layer before retrieval." (design doc section 10.1)

DynamoDB has no native row-level security, so we implement the equivalent here.
There are two independent gates, and both matter:

*Which rows* you can reach (``_visible_to``) — a doctor reaches only the cases
assigned to them, a nurse reaches the admissions desk, an admin reaches all.

*Which fields* of a reachable row you get back (``project_for_role``) — a nurse
can reach a case in order to route it, but the clinical content is stripped out
of the payload before it leaves the Lambda. Hiding tabs in the browser is not
access control; the redaction has to happen here.

Callers never reach the table directly.
"""

from __future__ import annotations

from typing import Any

from boto3.dynamodb.conditions import Key

from ..context import AuthContext
from ..errors import ForbiddenError, NotFoundError
from ..models import PatientCase, normalize_diagnoses, normalize_final_diagnosis, now_iso
from ..permissions import CASES_VIEW_CLINICAL
from . import tables


def _normalize_case(case: PatientCase) -> PatientCase:
    """Defend reads against records written before diagnosis/final-diagnosis
    defaulting existed (resolvers/diagnosis.py normalizes on write, but that
    can't reach rows already sitting in the table) — the frontend reads
    `diagnoses[].supporting.length` etc. unconditionally, so a stale record
    missing one of those keys crashes the Diagnosis tab rather than just
    rendering it empty."""
    case["diagnoses"] = normalize_diagnoses(case.get("diagnoses"))
    if case.get("finalDiagnosis"):
        case["finalDiagnosis"] = normalize_final_diagnosis(case["finalDiagnosis"])
    case.setdefault("notes", [])
    return case


# GSI key attributes must never be empty strings (DynamoDB rejects them).
_INDEX_KEYS = ("createdByNurseId", "assignedPhysicianId", "status", "createdAt")

# The only case fields a caller without CASES_VIEW_CLINICAL may see. This is an
# allow-list on purpose: a field added to PatientCase later is hidden by
# default rather than silently exposed.
_NON_CLINICAL_FIELDS = frozenset(
    {
        "id",
        "patient",
        "vitals",
        "status",
        "stage",
        "priority",
        "createdAt",
        "updatedAt",
        "chiefComplaint",
        "lifecycleState",
        "createdByNurseId",
        "assignedPhysicianId",
        "assignedAt",
        "assignedBy",
        "progress",
        "documents",
    }
)


def _sanitize_index_keys(case: dict[str, Any]) -> dict[str, Any]:
    for key in _INDEX_KEYS:
        if case.get(key) == "":
            case.pop(key, None)
    return case


def _visible_to(case: dict[str, Any], ctx: AuthContext) -> bool:
    """The row-level RLS predicate.

    Assignment is the boundary, not a filter: a doctor reads the cases routed
    to them and nothing else. Nurses share one admissions desk and may reassign
    each other's cases, so they can reach any case — but only ever the redacted
    projection (see ``project_for_role``).
    """
    if ctx.is_admin:
        return True
    if ctx.is_doctor:
        return bool(case.get("assignedPhysicianId")) and case["assignedPhysicianId"] == ctx.sub
    if ctx.is_nurse:
        return True
    return False


def project_for_role(case: dict[str, Any], ctx: AuthContext) -> dict[str, Any]:
    """Prepare a case for the wire: strip clinical content for callers without
    ``cases.view_clinical``, and always drop server-side document internals.

    Applied on the way *out* of the Lambda (see ``handler._project_result``),
    never inside :func:`get_case` — mutation resolvers read a case, mutate the
    same dict and hand it to :func:`save_case`, so redacting on read would
    quietly delete those fields from the database.
    """
    if ctx.has_permission(CASES_VIEW_CLINICAL):
        projected = dict(case)
    else:
        projected = {k: v for k, v in case.items() if k in _NON_CLINICAL_FIELDS}

    # Every document carries its extracted text (grounding for the AI seam) and
    # its S3 key. Neither belongs in a client payload: the text is already
    # summarized into the case, and downloads go through a presigned URL rather
    # than a raw key.
    if projected.get("documents"):
        projected["documents"] = [
            {k: v for k, v in doc.items() if k not in ("text", "s3Key", "s3Uri")}
            for doc in projected["documents"]
        ]
    return projected


def get_case(case_id: str, ctx: AuthContext) -> PatientCase:
    resp = tables.cases_table().get_item(Key={"id": case_id})
    item = resp.get("Item")
    if not item:
        raise NotFoundError(f"Case '{case_id}' not found.")
    case = tables.from_dynamo(item)
    if not _visible_to(case, ctx):
        # Do not leak existence details across the isolation boundary.
        raise ForbiddenError("You are not permitted to access this case.")
    return _normalize_case(case)


def list_cases(
    ctx: AuthContext,
    *,
    status: str | None = None,
    scope: str | None = None,
) -> list[PatientCase]:
    """List cases visible to the caller.

    The index is chosen to narrow the read; ``_visible_to`` then re-filters
    every row regardless, so a wrong index can never widen access.

    ``scope`` is a nurse/admin convenience: ``"mine"`` restricts an admissions
    list to the cases that caller admitted, ``"all"`` (the default for nurses)
    covers the whole desk so cases can be reassigned between nurses.
    """
    table = tables.cases_table()

    if ctx.is_doctor:
        # A doctor's list is their assignment index, always. There is no
        # "everything" mode for a doctor.
        resp = table.query(
            IndexName="byPhysician",
            KeyConditionExpression=Key("assignedPhysicianId").eq(ctx.sub),
        )
        items = resp.get("Items", [])
    elif ctx.is_nurse and scope == "mine":
        resp = table.query(
            IndexName="byNurse",
            KeyConditionExpression=Key("createdByNurseId").eq(ctx.sub),
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
    cases = [_normalize_case(c) for c in cases]
    cases.sort(key=lambda c: c.get("createdAt", ""), reverse=True)
    return cases


def put_case(case: PatientCase, ctx: AuthContext) -> PatientCase:
    """Create or replace a case. Enforces ownership on overwrite."""
    if ctx.role is None:
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
