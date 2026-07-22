"""End-to-end workflow through the resolvers (design doc section 6)."""

import pytest

from sehati.errors import StateTransitionError, ValidationError
from sehati.router import resolve


def _drive_to_doctor_review(patient, physician, sample_intake):
    case = resolve("submitIntake", patient, sample_intake)
    cid = case["id"]
    for _ in range(6):
        r = resolve("postInterviewMessage", patient, {"caseId": cid, "text": "some answer"})
        if r["complete"]:
            break
    resolve("generateSummary", patient, {"caseId": cid})
    return cid


def test_intake_starts_interview(aws, patient, sample_intake):
    case = resolve("submitIntake", patient, sample_intake)
    assert case["lifecycleState"] == "AIInterview"
    assert case["status"] == "AI Interview"
    assert case["interview"][-1]["role"] == "ai"


def test_full_lifecycle_to_closed(aws, patient, physician, sample_intake):
    cid = _drive_to_doctor_review(patient, physician, sample_intake)

    summary_case = resolve("getCase", physician, {"id": cid})
    assert summary_case["lifecycleState"] == "DoctorReview"
    assert summary_case["summary"]["hpi"]

    resolve("recommendExams", physician, {"caseId": cid})
    rec = resolve("requestRecommendations", physician, {"caseId": cid})
    assert rec["diagnoses"]

    test_id = rec["tests"][0]["id"]
    resolve("orderTest", physician, {"caseId": cid, "testId": test_id})
    in_progress = resolve("getCase", physician, {"id": cid})
    assert in_progress["lifecycleState"] == "InProgress"

    resolve("recordTestResult", physician, {"caseId": cid, "testId": test_id, "result": "WBC 16"})
    resolve("rerankAfterResults", physician, {"caseId": cid})
    resolve("proposeFinalDiagnosis", physician, {"caseId": cid})
    closed = resolve("acceptFinalDiagnosis", physician, {"caseId": cid, "note": "agree"})

    assert closed["case"]["lifecycleState"] == "Closed"
    assert closed["case"]["status"] == "Completed"
    assert closed["finalDiagnosis"]["status"] == "accepted"


def test_reject_requires_reason(aws, patient, physician, sample_intake):
    cid = _drive_to_doctor_review(patient, physician, sample_intake)
    rec = resolve("requestRecommendations", physician, {"caseId": cid})
    dx_id = rec["diagnoses"][0]["id"]

    with pytest.raises(ValidationError):
        resolve("rejectRecommendation", physician, {"caseId": cid, "targetId": dx_id})

    ok = resolve("rejectRecommendation", physician, {
        "caseId": cid, "targetId": dx_id, "reason": "Prefer to wait for imaging.",
    })
    assert ok["accepted"] is False


def test_accept_recommendation_records_feedback(aws, patient, physician, sample_intake):
    from sehati.db import feedback_repo

    cid = _drive_to_doctor_review(patient, physician, sample_intake)
    rec = resolve("requestRecommendations", physician, {"caseId": cid})
    resolve("acceptRecommendation", physician, {
        "caseId": cid, "targetId": rec["tests"][0]["id"], "targetType": "test",
    })
    fb = feedback_repo.list_for_case(cid)
    assert any(f["kind"] == "accept" for f in fb)


def test_illegal_manual_state_transition_rejected(aws, patient, physician, sample_intake):
    case = resolve("submitIntake", patient, sample_intake)
    # Intake/AIInterview -> Closed is not allowed.
    with pytest.raises(StateTransitionError):
        resolve("setCaseState", physician, {"caseId": case["id"], "state": "Closed"})


def test_explainability_chat_persists_to_diagnosis(aws, patient, physician, sample_intake):
    cid = _drive_to_doctor_review(patient, physician, sample_intake)
    rec = resolve("requestRecommendations", physician, {"caseId": cid})
    dx_id = rec["diagnoses"][0]["id"]
    out = resolve("askDiagnosis", physician, {
        "caseId": cid, "diagnosisId": dx_id, "question": "What evidence supports this?",
    })
    assert out["aiMessage"]["role"] == "ai"
    case = resolve("getCase", physician, {"id": cid})
    dx = next(d for d in case["diagnoses"] if d["id"] == dx_id)
    assert len(dx["discussion"]) >= 2  # doctor question + ai answer
