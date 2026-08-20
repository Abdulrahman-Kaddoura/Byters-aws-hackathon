"""Differential, explainability, re-ranking and final-diagnosis resolvers
(design doc sections 6.2–6.4)."""

from __future__ import annotations

from typing import Any

from ..ai import factory
from ..context import AuthContext
from ..db import audit_repo, cases_repo
from ..errors import NotFoundError, ValidationError
from ..models import chat_message, new_id, now_iso, recent_update, timeline_event
from .cases import _apply_state
from .helpers import find, touch_progress


def request_recommendations(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    """Generate the prioritised differential + recommended tests."""
    ctx.require_permission("diagnoses.manage")
    case = cases_repo.get_case(_require(args, "caseId"), ctx)

    ai = factory.get_ai_service()
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
    ctx.require_permission("diagnoses.manage")
    case = cases_repo.get_case(_require(args, "caseId"), ctx)
    question = _require(args, "question")
    diagnosis_id = args.get("diagnosisId")

    result = factory.get_ai_service().answer(case, question, diagnosis_id)
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
    ctx.require_permission("diagnoses.manage")
    case = cases_repo.get_case(_require(args, "caseId"), ctx)

    result = factory.get_ai_service().rerank_after_results(case)
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


# Tests the doctor never acted on carry no information, so a new round drops
# them rather than letting an ever-growing list of dead recommendations pile
# up. Anything the doctor ordered or resulted is history and is always kept.
_TEST_HISTORY_STATUSES = ("ordered", "pending", "completed")


def analyze_results(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    """Read the results the doctor entered and either name the diagnosis or
    ask for another round of tests.

    This is the differential's only entry point once a workup is underway. It
    is deliberately results-driven: with nothing resulted there is nothing to
    reason over, and rather than inventing a differential out of the intake
    alone it says so and stops. With at least one result in hand the AI weighs
    each recommendation against what actually came back and returns one of two
    verdicts — ``confident`` (here is the diagnosis) or ``needs_more_tests``,
    which writes a fresh round of investigations onto the workup tab and tells
    the doctor to go fill them in.
    """
    ctx.require_permission("diagnoses.manage")
    case = cases_repo.get_case(_require(args, "caseId"), ctx)

    resulted = [
        t for t in case.get("tests", [])
        if t.get("status") == "completed" and str(t.get("result", "")).strip()
    ]
    if not resulted:
        message = (
            "No test results have been entered yet, so there is nothing to "
            "reason over. Enter at least one result on the Workup tab and run "
            "the analysis again."
        )
        case["analysis"] = {
            "verdict": "no_results",
            "message": message,
            "at": now_iso(),
            "newTestCount": 0,
            "round": case.get("testRound", 1),
        }
        cases_repo.save_case(case, ctx)
        return {
            "case": case,
            "verdict": "no_results",
            "message": message,
            "diagnoses": case.get("diagnoses", []),
            "newTests": [],
        }

    result = factory.get_ai_service().analyze_results(case)
    payload = result.value if isinstance(result.value, dict) else {}
    verdict = "needs_more_tests" if payload.get("verdict") == "needs_more_tests" else "confident"
    diagnoses = payload.get("diagnoses") or []
    if diagnoses:
        case["diagnoses"] = diagnoses
        case["primaryImpression"] = diagnoses[0].get("name", case.get("primaryImpression", ""))

    new_tests: list[dict[str, Any]] = []
    if verdict == "needs_more_tests":
        new_tests = _start_new_test_round(case, payload.get("newTests") or [])
        if not new_tests:
            # The model asked for more tests but named none — that's not an
            # actionable verdict, so present what it did produce instead of
            # sending the doctor to an unchanged workup tab.
            verdict = "confident"

    message = str(payload.get("message") or "").strip()
    if not message:
        message = (
            f"{len(new_tests)} further investigation(s) were added to the Workup tab. "
            "Enter their results, then run the analysis again."
            if verdict == "needs_more_tests"
            else "The results support a leading diagnosis — see the ranking below."
        )

    if verdict == "needs_more_tests":
        if case.get("lifecycleState") == "ResultsDiscussion":
            _apply_state(case, "InProgress")
        else:
            touch_progress(case, "tests")
    else:
        if case.get("lifecycleState") == "InProgress":
            _apply_state(case, "ResultsDiscussion")
        else:
            touch_progress(case, "results")

    case["analysis"] = {
        "verdict": verdict,
        "message": message,
        "at": now_iso(),
        "newTestCount": len(new_tests),
        "round": case.get("testRound", 1),
        "resultsConsidered": [
            {"name": t.get("name"), "result": t.get("result"), "flag": t.get("resultFlag")}
            for t in resulted
        ],
    }
    case.setdefault("recentUpdates", []).insert(
        0,
        recent_update(
            "Aura analysed the results and requested more tests"
            if verdict == "needs_more_tests"
            else "Aura analysed the results and reached a leading diagnosis",
            "ai",
        ),
    )
    case.setdefault("timeline", []).append(
        timeline_event(
            "Results analysed",
            message,
            "ai",
            "tests" if verdict == "needs_more_tests" else "results",
        )
    )

    cases_repo.save_case(case, ctx)
    audit_repo.record(
        ctx, case_id=case["id"], action="analyzeResults",
        model_version=result.model_version, retrieved_context=result.retrieved_context,
        output={"verdict": verdict, "newTests": [t.get("name") for t in new_tests]},
    )
    return {
        "case": case,
        "verdict": verdict,
        "message": message,
        "diagnoses": case.get("diagnoses", []),
        "newTests": new_tests,
    }


def _start_new_test_round(case: dict[str, Any], proposed: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Replace the open recommendations with a fresh round, keeping history.

    Everything the doctor ordered or resulted stays on the case and keeps its
    round number, so the workup tab can show round 1 as history under round 2.
    Recommendations that were never acted on are dropped — they were the
    guesses this analysis has just superseded.
    """
    existing = case.get("tests", [])
    round_no = int(case.get("testRound", 1)) + 1
    kept: list[dict[str, Any]] = []
    for t in existing:
        if t.get("status") not in _TEST_HISTORY_STATUSES:
            continue
        t.setdefault("round", 1)
        kept.append(t)

    seen = {str(t.get("name", "")).strip().lower() for t in kept}
    fresh: list[dict[str, Any]] = []
    for t in proposed:
        name = str(t.get("name", "")).strip()
        if not name or name.lower() in seen:
            continue
        seen.add(name.lower())
        item = dict(t)
        item["id"] = item.get("id") or new_id("TST")
        item["name"] = name
        item["status"] = "recommended"
        item["round"] = round_no
        item.setdefault("category", "Investigation")
        item.setdefault("reason", "")
        item.setdefault("expectedFinding", "")
        item.setdefault("priority", "Medium")
        item.setdefault("cost", "—")
        item.setdefault("urgency", "Routine")
        item.setdefault("diagnosticValue", 60)
        fresh.append(item)

    if not fresh:
        return []
    case["tests"] = kept + fresh
    case["testRound"] = round_no
    return fresh


def propose_final_diagnosis(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    ctx.require_permission("diagnoses.manage")
    case = cases_repo.get_case(_require(args, "caseId"), ctx)

    result = factory.get_ai_service().propose_final_diagnosis(case)
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
    """Physician signs off the final diagnosis; the case moves to treatment.

    Sign-off is not resolution. The patient still has to be treated, and the
    treatment is where an unexpected outcome surfaces — so the case parks in
    ``Treatment`` until the doctor either resolves it (:func:`resolve_case`) or
    reopens it (:func:`reopen_case`).
    """
    ctx.require_permission("final_diagnosis.accept")
    case = cases_repo.get_case(_require(args, "caseId"), ctx)
    if not case.get("finalDiagnosis"):
        raise ValidationError("No final diagnosis has been proposed for this case.")

    case["finalDiagnosis"]["status"] = "accepted"
    if args.get("note"):
        case.setdefault("notes", []).append(
            {"time": _now_clock(), "author": ctx.username, "text": args["note"]}
        )
    if case.get("lifecycleState") == "Diagnosis":
        _apply_state(case, "Treatment")
    case["outcome"] = case["finalDiagnosis"].get("name", "")
    case.setdefault("recentUpdates", []).insert(
        0, recent_update("Final diagnosis accepted; patient on treatment", "doctor")
    )

    cases_repo.save_case(case, ctx)
    audit_repo.record(
        ctx, case_id=case["id"], action="acceptFinalDiagnosis",
        output={"name": case["finalDiagnosis"].get("name")},
    )
    return {"case": case, "finalDiagnosis": case["finalDiagnosis"]}


def resolve_case(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    """The patient responded to treatment: close the case for good.

    This — not accepting a diagnosis — is what "resolved" means, and it is the
    only thing that unlocks the doctor's feedback form (resolvers/feedback.py).
    """
    ctx.require_permission("cases.manage_state")
    case = cases_repo.get_case(_require(args, "caseId"), ctx)
    if case.get("lifecycleState") != "Treatment":
        raise ValidationError(
            "Only a case on treatment can be marked resolved. Accept a final "
            "diagnosis first."
        )

    outcome = args.get("outcome") or case.get("finalDiagnosis", {}).get("name", "")
    case["outcome"] = outcome
    if args.get("note"):
        case.setdefault("notes", []).append(
            {"time": _now_clock(), "author": ctx.username, "text": args["note"]}
        )
    _apply_state(case, "Closed")
    case.setdefault("recentUpdates", []).insert(0, recent_update("Case resolved and closed", "doctor"))

    cases_repo.save_case(case, ctx)
    audit_repo.record(ctx, case_id=case["id"], action="resolveCase", output={"outcome": outcome})
    return {"case": case}


def reopen_case(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    """Treatment didn't go as the diagnosis predicted — re-reason from scratch.

    The doctor's account of what actually happened is written into the case
    (as a note the AI reads) before the analysis re-runs, which is what makes
    the new round of tests different from the last one.
    """
    ctx.require_permission("cases.manage_state")
    case = cases_repo.get_case(_require(args, "caseId"), ctx)
    if case.get("lifecycleState") != "Treatment":
        raise ValidationError("Only a case on treatment can be reopened.")
    reason = _require(args, "reason")

    case["reopenReason"] = reason
    case.setdefault("notes", []).append(
        {"time": _now_clock(), "author": ctx.username, "text": f"Unexpected outcome: {reason}"}
    )
    # The accepted diagnosis is no longer settled — it goes back to a proposal
    # so the sign-off has to be earned again.
    if case.get("finalDiagnosis"):
        case["finalDiagnosis"]["status"] = "proposed"
    case.pop("outcome", None)
    _apply_state(case, "ResultsDiscussion")
    case.setdefault("timeline", []).append(
        timeline_event("Case reopened", f"Unexpected outcome on treatment: {reason}", "doctor", "results")
    )
    case.setdefault("recentUpdates", []).insert(0, recent_update("Case reopened after unexpected outcome", "doctor"))
    cases_repo.save_case(case, ctx)
    audit_repo.record(ctx, case_id=case["id"], action="reopenCase", output={"reason": reason})

    # Re-run the analysis immediately so the doctor lands on a fresh set of
    # tests rather than an empty differential.
    return analyze_results(ctx, {"caseId": case["id"]})


def _require(args: dict[str, Any], key: str) -> Any:
    val = args.get(key)
    if val in (None, ""):
        raise ValidationError(f"Missing required argument '{key}'.")
    return val


def _now_clock() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).strftime("%H:%M")
