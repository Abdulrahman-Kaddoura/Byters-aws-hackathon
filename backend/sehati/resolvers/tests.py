"""Test recommendation, ordering + results ingestion resolvers (design doc 6.4).

Tests carry a ``round``. The differential's results analysis
(``resolvers/diagnosis.analyze_results``) opens a new round when the results in
hand don't settle the question; everything already ordered or resulted keeps
its old round number and stays on the case as history.

A recommendation is a suggestion, not a work order — so alongside the AI's list
the doctor can add a test they ran themselves (``add_custom_test``) and mark a
recommendation as declined when they chose to do something else. Both are real
case data the AI reads back.
"""

from __future__ import annotations

from typing import Any

from ..ai import factory
from ..context import AuthContext
from ..db import audit_repo, cases_repo
from ..errors import NotFoundError, ValidationError
from ..models import new_id, recent_update, timeline_event
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


def recommend_tests(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    """Ask Aura which investigations this case needs.

    Split out of ``requestRecommendations`` so the workup can be stocked
    without first committing to a differential — the differential is now
    results-driven and has nothing to say before any test is resulted.
    """
    ctx.require_permission("tests.manage")
    case = cases_repo.get_case(_require(args, "caseId"), ctx)

    result = factory.get_ai_service().recommend_tests(case)
    round_no = int(case.get("testRound", 1))
    existing = case.setdefault("tests", [])
    seen = {str(t.get("name", "")).strip().lower() for t in existing}
    added = []
    for t in result.value or []:
        name = str(t.get("name", "")).strip()
        if not name or name.lower() in seen:
            continue
        seen.add(name.lower())
        item = dict(t)
        item["id"] = item.get("id") or new_id("TST")
        item["name"] = name
        item["status"] = item.get("status") or "recommended"
        item["round"] = round_no
        added.append(item)
    existing.extend(added)

    touch_progress(case, "tests")
    if added:
        case.setdefault("recentUpdates", []).insert(
            0, recent_update(f"Aura recommended {len(added)} investigation(s)", "ai")
        )
    cases_repo.save_case(case, ctx)
    audit_repo.record(
        ctx, case_id=case["id"], action="recommendTests",
        model_version=result.model_version, retrieved_context=result.retrieved_context,
        output={"tests": [t.get("name") for t in added]},
    )
    return {"case": case, "tests": case["tests"]}


def add_custom_test(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    """Record an investigation the doctor ordered that Aura didn't suggest."""
    ctx.require_permission("tests.manage")
    case = cases_repo.get_case(_require(args, "caseId"), ctx)
    name = _require(args, "name")

    test = {
        "id": new_id("TST"),
        "name": name,
        "category": args.get("category") or "Doctor-ordered",
        "reason": args.get("reason") or "Ordered by the treating physician.",
        "expectedFinding": args.get("expectedFinding") or "",
        "priority": args.get("priority") or "Medium",
        "cost": "—",
        "urgency": args.get("urgency") or "Routine",
        "diagnosticValue": 0,
        # It exists because the doctor already ordered it, so it starts where a
        # recommendation lands only after they act on it.
        "status": "ordered",
        "custom": True,
        "round": int(case.get("testRound", 1)),
    }
    case.setdefault("tests", []).append(test)
    touch_progress(case, "tests")
    if case.get("lifecycleState") == "DoctorReview":
        _apply_state(case, "InProgress")
    case.setdefault("recentUpdates", []).insert(0, recent_update(f"Doctor added test: {name}", "doctor"))
    case.setdefault("timeline", []).append(
        timeline_event("Test added by doctor", name, "doctor", "tests")
    )
    cases_repo.save_case(case, ctx)
    audit_repo.record(ctx, case_id=case["id"], action="addCustomTest", output={"name": name})
    return {"case": case, "test": test}


#: Statuses a doctor may set directly. ``completed`` is deliberately absent —
#: a test becomes complete by having a result recorded, never by a status flip.
_SETTABLE_TEST_STATUSES = ("recommended", "ordered", "pending", "declined")


def update_test(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    """Move a test between states — most often to 'awaiting results'.

    ``declined`` is the doctor saying they chose not to run this one; it keeps
    the decision on the record instead of leaving a recommendation dangling.
    """
    ctx.require_permission("tests.manage")
    case = cases_repo.get_case(_require(args, "caseId"), ctx)
    test_id = _require(args, "testId")
    status = _require(args, "status")
    if status not in _SETTABLE_TEST_STATUSES:
        raise ValidationError(
            f"Cannot set test status to '{status}'. Allowed: {', '.join(_SETTABLE_TEST_STATUSES)}."
        )
    test = find(case.get("tests", []), test_id)
    if not test:
        raise NotFoundError(f"Test '{test_id}' not found on case '{case['id']}'.")

    test["status"] = status
    if args.get("note") is not None:
        test["note"] = args["note"]
    if status == "ordered" and case.get("lifecycleState") == "DoctorReview":
        _apply_state(case, "InProgress")
    label = "awaiting results" if status == "ordered" else status
    case.setdefault("recentUpdates", []).insert(
        0, recent_update(f"{test.get('name')} marked {label}", "doctor")
    )
    cases_repo.save_case(case, ctx)
    audit_repo.record(ctx, case_id=case["id"], action="updateTest", output={"testId": test_id, "status": status})
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
