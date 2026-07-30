"""Side conversations — extra chat sessions layered on a case, additive to
the primary intake `interview` (which must stay untouched)."""

import pytest

from sehati.errors import ForbiddenError, NotFoundError
from sehati.router import resolve


def test_create_and_post_conversation_message(aws, patient, sample_intake):
    case = resolve("submitIntake", patient, sample_intake)
    cid = case["id"]

    created = resolve("createConversation", patient, {"caseId": cid, "title": "Follow-up"})
    conv_id = created["conversation"]["id"]
    assert created["conversation"]["title"] == "Follow-up"
    assert created["conversation"]["messages"] == []

    posted = resolve("postConversationMessage", patient, {
        "caseId": cid, "conversationId": conv_id, "text": "My symptoms got worse.",
    })
    messages = posted["conversation"]["messages"]
    assert messages[0]["role"] == "patient"
    assert messages[0]["text"] == "My symptoms got worse."
    assert messages[1]["role"] == "ai"
    assert posted["aiMessage"]["role"] == "ai"


def test_conversation_is_ownership_scoped(aws, patient, other_patient, sample_intake):
    case = resolve("submitIntake", patient, sample_intake)
    cid = case["id"]

    with pytest.raises(ForbiddenError):
        resolve("createConversation", other_patient, {"caseId": cid, "title": "Nope"})


def test_missing_conversation_id_raises_not_found(aws, patient, sample_intake):
    case = resolve("submitIntake", patient, sample_intake)
    cid = case["id"]

    with pytest.raises(NotFoundError):
        resolve("postConversationMessage", patient, {
            "caseId": cid, "conversationId": "does-not-exist", "text": "hi",
        })


def test_conversation_activity_does_not_affect_interview_or_lifecycle(aws, patient, sample_intake):
    case = resolve("submitIntake", patient, sample_intake)
    cid = case["id"]
    before = resolve("getCase", patient, {"id": cid})
    interview_before = list(before["interview"])
    lifecycle_before = before["lifecycleState"]
    status_before = before["status"]

    created = resolve("createConversation", patient, {"caseId": cid})
    resolve("postConversationMessage", patient, {
        "caseId": cid, "conversationId": created["conversation"]["id"], "text": "Quick question.",
    })

    after = resolve("getCase", patient, {"id": cid})
    assert after["interview"] == interview_before
    assert after["lifecycleState"] == lifecycle_before
    assert after["status"] == status_before
    assert len(after["conversations"]) == 1
