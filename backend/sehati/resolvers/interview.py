"""AI interview + summary resolvers (design doc section 6.1).

The interview runs on the patient-facing path. Per the design doc it has **no
data-access tools**: the AI service is called only with the current case's
transcript, never with a retrieval capability over other records.

The transcript is clinical content, so it is stripped out of any case payload a
nurse reads (``db/cases_repo.project_for_role``). But the interview itself runs
on the *nurse's* device while the patient holds it, so the live conversation is
served by :func:`get_interview` and echoed by :func:`post_interview_message`
instead — visible on the locked kiosk screen while the patient is answering,
and gone from the nurse's ordinary case view once she takes the device back.
"""

from __future__ import annotations

from typing import Any

from ..ai import factory
from ..context import AuthContext
from ..db import audit_repo, cases_repo
from ..errors import ValidationError
from ..models import chat_message, recent_update, timeline_event
from .cases import _apply_state
from .helpers import touch_progress


def get_interview(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    """The live transcript for the kiosk screen.

    Scoped to one case and returning nothing but the conversation, so it can be
    served to whoever is running the interview without handing them the rest of
    the clinical record.
    """
    case = cases_repo.get_case(_require(args, "caseId"), ctx)
    conversation_id = args.get("conversationId")
    if conversation_id:
        for conversation in case.get("conversations", []):
            if conversation.get("id") == conversation_id:
                return {
                    "caseId": case["id"],
                    "title": conversation.get("title", "Follow-up session"),
                    "messages": conversation.get("messages", []),
                    "open": True,
                }
        raise ValidationError(f"Conversation '{conversation_id}' not found on this case.")
    return {
        "caseId": case["id"],
        "title": "Patient interview",
        "messages": case.get("interview", []),
        # The primary interview only accepts answers while the case is still in
        # the AIInterview state; afterwards the kiosk shows it read-only.
        "open": case.get("lifecycleState") == "AIInterview",
        "patientName": (case.get("patient") or {}).get("name", ""),
    }


def post_interview_message(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    """Append the patient's turn, then return the AI's next question.

    Returns ``{case, messages, aiMessage, complete}``. When the AI decides the
    interview is complete, ``complete`` is true and no further question is
    produced. ``messages`` echoes the full transcript so the kiosk can render it
    without re-reading the (redacted) case.
    """
    case = cases_repo.get_case(_require(args, "caseId"), ctx)
    patient_text = _require(args, "text")

    case.setdefault("interview", []).append(chat_message("patient", patient_text))

    ai = factory.get_ai_service()
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
    return {
        "case": case,
        "messages": case["interview"],
        "aiMessage": ai_message,
        "complete": complete,
    }


def generate_summary(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    """Build the structured summary and move the case to DoctorReview."""
    case = cases_repo.get_case(_require(args, "caseId"), ctx)

    ai = factory.get_ai_service()
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
