"""Differential, explainability, re-ranking and final-diagnosis resolvers
(design doc sections 6.2–6.4)."""

from __future__ import annotations

from typing import Any

from ..ai import get_ai_service
from ..context import AuthContext
from ..db import audit_repo, cases_repo
from ..errors import NotFoundError, ValidationError
from ..models import chat_message, recent_update
from .cases import _apply_state
from .helpers import find, touch_progress


def request_recommendations(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    """Generate the prioritised differential + recommended tests."""
    ctx.require_clinical_staff()
    case = cases_repo.get_case(_require(args, "caseId"), ctx)

    ai = get_ai_service()
    dx = ai.differential(case)
    tests = ai.recommend_tests(case)
    case["diagnoses"] = dx.value
    if not case.get("tests"):
        case["tests"] = tests.value
    if case["diagnoses"]:
        case["primaryImpression"] = case["diagnoses"][0].get("name", case.get("primaryImpression", ""))
    touch_progress(case, "differential")
    case.setdefault("recentUpdates", []).insert(0, recent_update("AI differential generated", "ai"))

    cases_repo.save_case(case, ctx)
    audit_repo.record(
        ctx, case_id=case["id"], action="requestRecommendations",
        model_version=dx.model_version, retrieved_context=dx.retrieved_context,
        output={"diagnoses": [d.get("name") for d in case["diagnoses"]]},
    )
    return {"case": case, "diagnoses": case["diagnoses"], "tests": case["tests"]}


def ask_diagnosis(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    """Explainability dialogue scoped to one diagnosis ("Why this test?")."""
    ctx.require_clinical_staff()
    case = cases_repo.get_case(_require(args, "caseId"), ctx)
    question = _require(args, "question")
    diagnosis_id = args.get("diagnosisId")

    result = get_ai_service().answer(case, question, diagnosis_id)
    ai_message = result.value

    # Persist the turn into that diagnosis's discussion thread when scoped.
    if diagnosis_id:
        dx = find(case.get("diagnoses", []), diagnosis_id)
        if not dx:
            raise NotFoundError(f"Diagnosis '{diagnosis_id}' not found.")
        dx.setdefault("discussion", []).append(chat_message("doctor", question))
        dx["discussion"].append(ai_message)
        cases_repo.save_case(case, ctx)

    audit_repo.record(
        ctx, case_id=case["id"], action="askDiagnosis",
        model_version=result.model_version, retrieved_context=result.retrieved_context,
        output={"diagnosisId": diagnosis_id, "question": question},
    )
    return {"case": case, "aiMessage": ai_message}


def rerank_after_results(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    """Re-reason once results are in and move to ResultsDiscussion."""
    ctx.require_clinical_staff()
    case = cases_repo.get_case(_require(args, "caseId"), ctx)

    result = get_ai_service().rerank_after_results(case)
    case["diagnoses"] = result.value
    if case.get("lifecycleState") == "InProgress":
        _apply_state(case, "ResultsDiscussion")
    else:
        touch_progress(case, "results")
    case.setdefault("recentUpdates", []).insert(0, recent_update("Differential re-ranked after results", "system"))

    cases_repo.save_case(case, ctx)
    audit_repo.record(
        ctx, case_id=case["id"], action="rerankAfterResults",
        model_version=result.model_version, retrieved_context=result.retrieved_context,
    )
    return {"case": case, "diagnoses": case["diagnoses"]}


def propose_final_diagnosis(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    ctx.require_clinical_staff()
    case = cases_repo.get_case(_require(args, "caseId"), ctx)

    result = get_ai_service().propose_final_diagnosis(case)
    case["finalDiagnosis"] = result.value
    if case.get("lifecycleState") in ("ResultsDiscussion",):
        _apply_state(case, "Diagnosis")
    else:
        touch_progress(case, "diagnosis")
    case.setdefault("recentUpdates", []).insert(0, recent_update("Final diagnosis proposed", "ai"))

    cases_repo.save_case(case, ctx)
    audit_repo.record(
        ctx, case_id=case["id"], action="proposeFinalDiagnosis",
        model_version=result.model_version, retrieved_context=result.retrieved_context,
        output={"name": result.value.get("name"), "confidence": result.value.get("confidence")},
    )
    return {"case": case, "finalDiagnosis": case["finalDiagnosis"]}


def accept_final_diagnosis(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    """Physician signs off the final diagnosis and closes the case."""
    ctx.require_physician()
    case = cases_repo.get_case(_require(args, "caseId"), ctx)
    if not case.get("finalDiagnosis"):
        raise ValidationError("No final diagnosis has been proposed for this case.")

    case["finalDiagnosis"]["status"] = "accepted"
    if args.get("note"):
        case.setdefault("notes", []).append(
            {"time": _now_clock(), "author": ctx.username, "text": args["note"]}
        )
    if case.get("lifecycleState") == "Diagnosis":
        _apply_state(case, "Closed")
    case["outcome"] = case["finalDiagnosis"].get("name", "")
    case.setdefault("recentUpdates", []).insert(0, recent_update("Final diagnosis accepted; case closed", "doctor"))

    cases_repo.save_case(case, ctx)
    audit_repo.record(
        ctx, case_id=case["id"], action="acceptFinalDiagnosis",
        output={"name": case["finalDiagnosis"].get("name")},
    )
    return {"case": case, "finalDiagnosis": case["finalDiagnosis"]}


def _require(args: dict[str, Any], key: str) -> Any:
    val = args.get(key)
    if val in (None, ""):
        raise ValidationError(f"Missing required argument '{key}'.")
    return val


def _now_clock() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).strftime("%H:%M")
