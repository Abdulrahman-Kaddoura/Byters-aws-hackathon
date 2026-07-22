"""AI interview + summary resolvers (design doc section 6.1).

The interview runs on the patient-facing path. Per the design doc it has **no
data-access tools**: the AI service is called only with the current case's
transcript, never with a retrieval capability over other records.
"""

from __future__ import annotations

from typing import Any

from ..ai import get_ai_service
from ..context import AuthContext
from ..db import audit_repo, cases_repo
from ..errors import ValidationError
from ..models import chat_message, recent_update, timeline_event
from .cases import _apply_state
from .helpers import touch_progress


def post_interview_message(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    """Append the patient's turn, then return the AI's next question.

    Returns ``{case, aiMessage, complete}``. When the AI decides the interview
    is complete, ``complete`` is true and no further question is produced.
    """
    case = cases_repo.get_case(_require(args, "caseId"), ctx)
    patient_text = _require(args, "text")

    case.setdefault("interview", []).append(chat_message("patient", patient_text))

    ai = get_ai_service()
    result = ai.next_interview_question(case, case["interview"])

    complete = result.value is None
    ai_message = None
    if not complete:
        ai_message = result.value
        case["interview"].append(ai_message)
    else:
        # Interview finished — advance the lifecycle if still interviewing.
        if case.get("lifecycleState") == "AIInterview":
            case.setdefault("timeline", []).append(
                timeline_event("AI interview completed", "Adaptive interview complete; summary can be generated.", "ai", "interview")
            )
            case.setdefault("recentUpdates", []).insert(0, recent_update("AI interview completed", "ai"))

    cases_repo.save_case(case, ctx)
    audit_repo.record(
        ctx,
        case_id=case["id"],
        action="postInterviewMessage",
        model_version=result.model_version,
        output={"complete": complete},
    )
    return {"case": case, "aiMessage": ai_message, "complete": complete}


def generate_summary(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    """Build the structured summary and move the case to DoctorReview."""
    case = cases_repo.get_case(_require(args, "caseId"), ctx)

    ai = get_ai_service()
    result = ai.build_summary(case)
    case["summary"] = result.value

    if case.get("lifecycleState") == "AIInterview":
        _apply_state(case, "DoctorReview")
    else:
        touch_progress(case, "examination")

    case.setdefault("recentUpdates", []).insert(0, recent_update("Structured summary generated", "ai"))
    cases_repo.save_case(case, ctx)
    audit_repo.record(
        ctx,
        case_id=case["id"],
        action="generateSummary",
        model_version=result.model_version,
        retrieved_context=result.retrieved_context,
    )
    return {"case": case, "summary": result.value}


def _require(args: dict[str, Any], key: str) -> Any:
    val = args.get(key)
    if val in (None, ""):
        raise ValidationError(f"Missing required argument '{key}'.")
    return val
