"""Test ordering + results ingestion resolvers (design doc section 6.4)."""

from __future__ import annotations

from typing import Any

from ..context import AuthContext
from ..db import audit_repo, cases_repo
from ..errors import NotFoundError, ValidationError
from ..models import recent_update, timeline_event
from .cases import _apply_state
from .helpers import find, touch_progress


def order_test(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    """Physician orders a recommended test (recommended -> ordered)."""
    ctx.require_permission("tests.manage")
    case = cases_repo.get_case(_require(args, "caseId"), ctx)
    test_id = _require(args, "testId")
    test = find(case.get("tests", []), test_id)
    if not test:
        raise NotFoundError(f"Test '{test_id}' not found on case '{case['id']}'.")
    test["status"] = "ordered"
    touch_progress(case, "tests")
    # First order moves DoctorReview -> InProgress (accepts tests + records plan).
    if case.get("lifecycleState") == "DoctorReview":
        _apply_state(case, "InProgress")
    case.setdefault("recentUpdates", []).insert(0, recent_update(f"Test ordered: {test.get('name')}", "doctor"))
    cases_repo.save_case(case, ctx)
    audit_repo.record(ctx, case_id=case["id"], action="orderTest", output={"testId": test_id})
    return {"case": case, "test": test}


def record_test_result(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    """Ingest a test result (text; radiologist reports ingested as text)."""
    ctx.require_permission("tests.manage")
    case = cases_repo.get_case(_require(args, "caseId"), ctx)
    test_id = _require(args, "testId")
    test = find(case.get("tests", []), test_id)
    if not test:
        raise NotFoundError(f"Test '{test_id}' not found on case '{case['id']}'.")

    test["result"] = _require(args, "result")
    if args.get("resultFlag") is not None:
        test["resultFlag"] = args["resultFlag"]
    if args.get("resultDetail") is not None:
        test["resultDetail"] = args["resultDetail"]
    test["status"] = "completed"

    case.setdefault("timeline", []).append(
        timeline_event("Result received", f"{test.get('name')}: {test['result']}", "system", "results")
    )
    case.setdefault("recentUpdates", []).insert(0, recent_update(f"Result: {test.get('name')} — {test['result']}", "system"))
    touch_progress(case, "results")
    cases_repo.save_case(case, ctx)
    audit_repo.record(
        ctx, case_id=case["id"], action="recordTestResult",
        output={"testId": test_id, "result": test["result"], "flag": test.get("resultFlag")},
    )
    return {"case": case, "test": test}


def _require(args: dict[str, Any], key: str) -> Any:
    val = args.get(key)
    if val in (None, ""):
        raise ValidationError(f"Missing required argument '{key}'.")
    return val
