"""Physical examination resolvers (design doc section 6.2).

Aura recommends manoeuvres, but a doctor examines the patient in front of them
— so ``add_custom_exam`` lets a finding onto the case whether or not the AI
thought to ask for it. It lands complete, because it describes something that
has already happened.
"""

from __future__ import annotations

from typing import Any

from ..ai import factory
from ..context import AuthContext
from ..db import audit_repo, cases_repo
from ..errors import NotFoundError, ValidationError
from ..models import new_id, recent_update
from .helpers import find, touch_progress


def recommend_exams(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    ctx.require_permission("exams.manage")
    case = cases_repo.get_case(_require(args, "caseId"), ctx)
    result = factory.get_ai_service().recommend_exams(case)
    # Merge without clobbering exams that already have findings.
    existing_ids = {e.get("id") for e in case.get("exams", [])}
    for exam in result.value:
        if exam.get("id") not in existing_ids:
            case.setdefault("exams", []).append(exam)
    touch_progress(case, "examination")
    cases_repo.save_case(case, ctx)
    audit_repo.record(ctx, case_id=case["id"], action="recommendExams", model_version=result.model_version)
    return {"case": case, "exams": case["exams"]}


def add_custom_exam(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    """Record an examination the doctor performed that Aura didn't recommend."""
    ctx.require_permission("exams.manage")
    case = cases_repo.get_case(_require(args, "caseId"), ctx)
    name = _require(args, "name")

    exam = {
        "id": new_id("EXM"),
        "name": name,
        "reason": args.get("reason") or "Performed by the treating physician.",
        "importance": args.get("importance") or "Routine",
        "confidence": 0,
        "status": "complete",
        "finding": args.get("finding") or "",
        "custom": True,
    }
    for field in ("flag", "note", "normalRange"):
        if args.get(field):
            exam[field] = args[field]
    case.setdefault("exams", []).append(exam)
    touch_progress(case, "examination")
    case.setdefault("recentUpdates", []).insert(0, recent_update(f"Doctor recorded exam: {name}", "doctor"))
    cases_repo.save_case(case, ctx)
    audit_repo.record(ctx, case_id=case["id"], action="addCustomExam", output={"name": name})
    return {"case": case, "exam": exam}


def record_exam_finding(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    """Record a physician's finding for one recommended examination."""
    ctx.require_permission("exams.manage")
    case = cases_repo.get_case(_require(args, "caseId"), ctx)
    exam_id = _require(args, "examId")
    exam = find(case.get("exams", []), exam_id)
    if not exam:
        raise NotFoundError(f"Exam '{exam_id}' not found on case '{case['id']}'.")

    for field in ("finding", "normalRange", "flag", "note"):
        if args.get(field) is not None:
            exam[field] = args[field]
    exam["status"] = args.get("status", "complete")

    case.setdefault("recentUpdates", []).insert(0, recent_update(f"Exam recorded: {exam.get('name')}", "doctor"))
    cases_repo.save_case(case, ctx)
    audit_repo.record(
        ctx, case_id=case["id"], action="recordExamFinding",
        output={"examId": exam_id, "finding": exam.get("finding"), "flag": exam.get("flag")},
    )
    return {"case": case, "exam": exam}


def _require(args: dict[str, Any], key: str) -> Any:
    val = args.get(key)
    if val in (None, ""):
        raise ValidationError(f"Missing required argument '{key}'.")
    return val
