"""Doctor-facing free-text feedback on a case — distinct from the
accept/reject flywheel dataset in resolvers/collab.py.

Feedback is asked for once, at the end of the reasoning: a case only accepts it
once its final diagnosis has been **accepted** (lifecycle ``Treatment`` or
``Closed``). A form that sits open mid-workup collects impressions rather than
a judgment of the reasoning — but sign-off is the moment the doctor has
actually judged that reasoning, and it is where the UI now asks, in a dialog
the moment they accept. Waiting for the case to be fully closed meant asking
days later, when nobody answers. This check is the rule, not a UI convention —
the frontend prompts in one place because this is where the server will take
it.

Requires the case to be visible to the caller (cases_repo.get_case enforces
the row-level-security check) but is not gated behind a fine-grained
permission, matching resolvers/documents.py's upload_case_document.
"""

from __future__ import annotations

from typing import Any

from ..context import AuthContext
from ..db import cases_repo, feedback_repo
from ..errors import ValidationError

# Accepting the final diagnosis lands the case in ``Treatment``; completing it
# lands it in ``Closed``. Both mean the doctor has passed judgment on how Sehati AI
# reasoned, so both take feedback.
_FEEDBACK_STATES = ("Treatment", "Closed")


def submit_feedback(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    case_id = _require(args, "caseId")
    feedback_text = _require(args, "feedback")
    category = args.get("category", "general")

    # Confirms the caller may see this case before recording feedback against it.
    case = cases_repo.get_case(case_id, ctx)
    if case.get("lifecycleState") not in _FEEDBACK_STATES:
        raise ValidationError(
            "Feedback can only be given once you've accepted a final diagnosis "
            "for this case."
        )

    item = feedback_repo.save_doctor_feedback(ctx.sub, case_id, feedback_text, category)
    return {"status": "success", "data": item}


def _require(args: dict[str, Any], key: str) -> Any:
    val = args.get(key)
    if val in (None, ""):
        raise ValidationError(f"Missing required argument '{key}'.")
    return val
