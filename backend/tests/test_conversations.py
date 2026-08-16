"""Side conversations — extra chat sessions layered on a case, additive to
the primary intake `interview` (which must stay untouched)."""

import pytest

from sehati.errors import ForbiddenError, NotFoundError
from sehati.router import resolve


def _assigned_case(nurse, doctor, sample_intake):
    case = resolve("submitIntake", nurse, sample_intake)
    resolve("assignCase", nurse, {"caseId": case["id"], "doctorId": doctor.sub})
    return case["id"]


def test_create_and_post_conversation_message(aws, nurse, doctor, sample_intake, seeded_users):
    cid = _assigned_case(nurse, doctor, sample_intake)

    created = resolve("createConversation", doctor, {"caseId": cid, "title": "Follow-up"})
    conv_id = created["conversation"]["id"]
    assert created["conversation"]["title"] == "Follow-up"
    assert created["conversation"]["messages"] == []

    posted = resolve("postConversationMessage", doctor, {
        "caseId": cid, "conversationId": conv_id, "text": "My symptoms got worse.",
    })
    messages = posted["conversation"]["messages"]
    assert messages[0]["role"] == "patient"
    assert messages[0]["text"] == "My symptoms got worse."
    assert messages[1]["role"] == "ai"
    assert posted["aiMessage"]["role"] == "ai"


def test_conversation_is_assignment_scoped(
    aws, nurse, doctor, other_doctor, sample_intake, seeded_users
):
    cid = _assigned_case(nurse, doctor, sample_intake)

    with pytest.raises(ForbiddenError):
        resolve("createConversation", other_doctor, {"caseId": cid, "title": "Nope"})


def test_missing_conversation_id_raises_not_found(aws, nurse, doctor, sample_intake, seeded_users):
    cid = _assigned_case(nurse, doctor, sample_intake)

    with pytest.raises(NotFoundError):
        resolve("postConversationMessage", doctor, {
            "caseId": cid, "conversationId": "does-not-exist", "text": "hi",
        })


def test_conversation_activity_does_not_affect_interview_or_lifecycle(
    aws, nurse, doctor, sample_intake, seeded_users
):
    cid = _assigned_case(nurse, doctor, sample_intake)
    before = resolve("getCase", doctor, {"id": cid})
    interview_before = list(before["interview"])
    lifecycle_before = before["lifecycleState"]
    status_before = before["status"]

    created = resolve("createConversation", doctor, {"caseId": cid})
    resolve("postConversationMessage", doctor, {
        "caseId": cid, "conversationId": created["conversation"]["id"], "text": "Quick question.",
    })

    after = resolve("getCase", doctor, {"id": cid})
    assert after["interview"] == interview_before
    assert after["lifecycleState"] == lifecycle_before
    assert after["status"] == status_before
    assert len(after["conversations"]) == 1
