"""Doctor-facing free-text feedback on a case — distinct from the
accept/reject flywheel dataset in resolvers/collab.py.

Feedback is asked for once, at the end: only a **resolved** case accepts it.
Judging how the AI reasoned is something a doctor can only do once they know
how the patient actually turned out, and a form that sits open mid-workup
collects impressions instead of outcomes. This check is the rule, not a UI
convention — the frontend offers the form in exactly one place because this is
the only place the server will take it.

Requires the case to be visible to the caller (cases_repo.get_case enforces
the row-level-security check) but is not gated behind a fine-grained
permission, matching resolvers/documents.py's upload_case_document.
"""

from __future__ import annotations

from typing import Any

from ..context import AuthContext
from ..db import cases_repo, feedback_repo
from ..errors import ValidationError


def submit_feedback(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    case_id = _require(args, "caseId")
    feedback_text = _require(args, "feedback")
    category = args.get("category", "general")

    # Confirms the caller may see this case before recording feedback against it.
    case = cases_repo.get_case(case_id, ctx)
    if case.get("lifecycleState") != "Closed":
        raise ValidationError(
            "Feedback can only be given once the case is resolved. Mark the case "
            "resolved on the Diagnosis tab first."
        )

    item = feedback_repo.save_doctor_feedback(ctx.sub, case_id, feedback_text, category)
    return {"status": "success", "data": item}


def _require(args: dict[str, Any], key: str) -> Any:
    val = args.get(key)
    if val in (None, ""):
        raise ValidationError(f"Missing required argument '{key}'.")
    return val
