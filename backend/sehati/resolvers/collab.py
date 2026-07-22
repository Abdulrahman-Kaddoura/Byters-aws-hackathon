"""Assistant chat + accept/reject feedback resolvers.

Accept/reject writes to BOTH the immutable audit trail and the feedback flywheel
dataset (design doc section 13). Rejections REQUIRE a reason — the anti-rubber-
stamp / anti-automation-bias design point from section 14.
"""

from __future__ import annotations

from typing import Any

from ..ai import get_ai_service
from ..context import AuthContext
from ..db import audit_repo, cases_repo, feedback_repo
from ..errors import ValidationError
from ..models import chat_message


def assistant_chat(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    """Case-level assistant reply (persistent SEHATI assistant panel)."""
    ctx.require_clinical_staff()
    case = cases_repo.get_case(_require(args, "caseId"), ctx)
    question = _require(args, "text")

    case.setdefault("assistantThread", []).append(chat_message("doctor", question))
    result = get_ai_service().answer(case, question, None)
    case["assistantThread"].append(result.value)

    cases_repo.save_case(case, ctx)
    audit_repo.record(
        ctx, case_id=case["id"], action="assistantChat",
        model_version=result.model_version, retrieved_context=result.retrieved_context,
        output={"question": question},
    )
    return {"case": case, "aiMessage": result.value}


def accept_recommendation(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    ctx.require_clinical_staff()
    case = cases_repo.get_case(_require(args, "caseId"), ctx)
    target_type = args.get("targetType", "recommendation")
    target_id = _require(args, "targetId")

    feedback_repo.record(
        ctx, case_id=case["id"], kind="accept", target_type=target_type, target_id=target_id,
        reason=args.get("reason"),
    )
    audit_repo.record(
        ctx, case_id=case["id"], action="acceptRecommendation",
        output={"targetType": target_type, "targetId": target_id},
    )
    return {"case": case, "accepted": True}


def reject_recommendation(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    ctx.require_clinical_staff()
    case = cases_repo.get_case(_require(args, "caseId"), ctx)
    target_type = args.get("targetType", "recommendation")
    target_id = _require(args, "targetId")
    reason = args.get("reason")
    # Anti-rubber-stamp: a rejection must carry an explicit reason (doc section 14).
    if not reason:
        raise ValidationError("A reason is required when rejecting a recommendation.")

    feedback_repo.record(
        ctx, case_id=case["id"], kind="reject", target_type=target_type, target_id=target_id, reason=reason,
    )
    audit_repo.record(
        ctx, case_id=case["id"], action="rejectRecommendation",
        output={"targetType": target_type, "targetId": target_id, "reason": reason},
    )
    return {"case": case, "accepted": False}


def publish_case_update(ctx: AuthContext, args: dict[str, Any]) -> Any:
    """Fan-out trigger: verify access, then echo the case to subscribers.

    The frontend calls this after a mutation so other subscribers of
    ``onCaseUpdated`` receive the new state. Access is still checked in the data
    layer before anything is broadcast.
    """
    ctx.require_clinical_staff()
    cases_repo.get_case(_require(args, "caseId"), ctx)  # authorization gate
    return args.get("case")


def publish_message(ctx: AuthContext, args: dict[str, Any]) -> Any:
    """Fan-out trigger for a new chat message on a case."""
    cases_repo.get_case(_require(args, "caseId"), ctx)  # authorization gate
    return args.get("message")


def _require(args: dict[str, Any], key: str) -> Any:
    val = args.get(key)
    if val in (None, ""):
        raise ValidationError(f"Missing required argument '{key}'.")
    return val
