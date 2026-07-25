"""Always-on assistant chat resolver.

NOT WIRED — see docs/PROJECT_STATUS.md. `router.py` still routes
"assistantChat" to the existing `collab.assistant_chat` (which works, using
`AIService.answer()`). This file calls `get_ai_service().assistant_chat(...)`,
a method neither StubAIService nor BedrockAIService implements — registering
it would replace a working feature with one that raises AttributeError on
every call. Landed here as-is (from the live Lambda) so the work is
version-controlled instead of living only in the console.
"""

from __future__ import annotations

from typing import Any

from ..ai import get_ai_service
from ..context import AuthContext
from ..db import audit_repo, cases_repo
from ..errors import ValidationError
from ..models import recent_update


def assistant_chat(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    case = cases_repo.get_case(_require(args, "caseId"), ctx)
    message = _require(args, "message")

    result = get_ai_service().assistant_chat(case, message)

    case.setdefault("chatHistory", []).append({"role": "doctor", "content": message})
    case["chatHistory"].append({"role": "assistant", "content": result.value})
    case.setdefault("recentUpdates", []).insert(0, recent_update("Assistant chat message", "system"))

    cases_repo.save_case(case, ctx)
    audit_repo.record(
        ctx, case_id=case["id"], action="assistantChat",
        output={"message": message}, model_version=result.model_version,
    )
    return {"case": case, "reply": result.value, "chatHistory": case["chatHistory"]}


def _require(args: dict[str, Any], key: str) -> Any:
    val = args.get(key)
    if val in (None, ""):
        raise ValidationError(f"Missing required argument '{key}'.")
    return val
