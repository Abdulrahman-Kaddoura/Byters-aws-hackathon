"""Side-conversation resolvers — extra chat sessions layered on a case.

Distinct from the primary intake `interview` (resolvers/interview.py), which
still drives the lifecycle state machine unchanged. A `Conversation` is a
return visit / follow-up chat: it never touches `lifecycleState`, `status`,
or `stage` — it's purely additional context for the doctor to review
alongside the case (see `PatientCase.conversations` in models.py).
"""

from __future__ import annotations

from typing import Any

from ..ai import factory
from ..context import AuthContext
from ..db import audit_repo, cases_repo
from ..errors import NotFoundError, ValidationError
from ..models import chat_message, new_id, now_iso
from .helpers import find


def create_conversation(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    """Start a new side conversation on a case."""
    case = cases_repo.get_case(_require(args, "caseId"), ctx)
    ts = now_iso()
    conversation = {
        "id": new_id("CONV"),
        "title": args.get("title") or "New conversation",
        "createdAt": ts,
        "updatedAt": ts,
        "messages": [],
    }
    case.setdefault("conversations", []).append(conversation)

    cases_repo.save_case(case, ctx)
    audit_repo.record(
        ctx, case_id=case["id"], action="createConversation",
        output={"conversationId": conversation["id"]},
    )
    return {"case": case, "conversation": conversation}


def post_conversation_message(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    """Append the patient's turn to a side conversation, then the AI's reply."""
    case = cases_repo.get_case(_require(args, "caseId"), ctx)
    conversation_id = _require(args, "conversationId")
    text = _require(args, "text")

    conversation = find(case.get("conversations", []), conversation_id)
    if not conversation:
        raise NotFoundError(f"Conversation '{conversation_id}' not found on case '{case['id']}'.")

    conversation.setdefault("messages", []).append(chat_message("patient", text))

    ai = factory.get_ai_service()
    result = ai.chat(case, conversation["messages"])
    ai_message = result.value
    conversation["messages"].append(ai_message)
    conversation["updatedAt"] = now_iso()

    cases_repo.save_case(case, ctx)
    audit_repo.record(
        ctx, case_id=case["id"], action="postConversationMessage",
        model_version=result.model_version, retrieved_context=result.retrieved_context,
        output={"conversationId": conversation_id},
    )
    return {"case": case, "conversation": conversation, "aiMessage": ai_message}


def _require(args: dict[str, Any], key: str) -> Any:
    val = args.get(key)
    if val in (None, ""):
        raise ValidationError(f"Missing required argument '{key}'.")
    return val
