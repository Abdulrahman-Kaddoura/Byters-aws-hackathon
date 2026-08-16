"""End-to-end workflow through the resolvers (design doc section 6).

The path mirrors the real one: a nurse admits the patient and runs the AI
interview on her own device, routes the case to a doctor, and the doctor takes
it from there.
"""

import pytest

from sehati.errors import StateTransitionError, ValidationError
from sehati.router import resolve


def _admit_and_interview(nurse, sample_intake):
    """Nurse admits, the patient answers on her device, summary is generated."""
    case = resolve("submitIntake", nurse, sample_intake)
    cid = case["id"]
    for _ in range(6):
        r = resolve("postInterviewMessage", nurse, {"caseId": cid, "text": "some answer"})
        if r["complete"]:
            break
    resolve("generateSummary", nurse, {"caseId": cid})
    return cid


def _drive_to_doctor_review(nurse, doctor, sample_intake):
    cid = _admit_and_interview(nurse, sample_intake)
    resolve("assignCase", nurse, {"caseId": cid, "doctorId": doctor.sub})
    return cid


def test_intake_starts_interview(aws, nurse, sample_intake):
    case = resolve("submitIntake", nurse, sample_intake)
    assert case["lifecycleState"] == "AIInterview"
    assert case["status"] == "AI Interview"
    assert case["interview"][-1]["role"] == "ai"
    assert case["createdByNurseId"] == nurse.sub
    # Vitals the nurse measured are recorded up front.
    assert case["vitals"]["bloodPressure"] == "128/82"


def test_full_lifecycle_to_closed(aws, nurse, doctor, sample_intake, seeded_users):
    cid = _drive_to_doctor_review(nurse, doctor, sample_intake)

    summary_case = resolve("getCase", doctor, {"id": cid})
    assert summary_case["lifecycleState"] == "DoctorReview"
    assert summary_case["summary"]["hpi"]

    resolve("recommendExams", doctor, {"caseId": cid})
    rec = resolve("requestRecommendations", doctor, {"caseId": cid})
    assert rec["diagnoses"]

    test_id = rec["tests"][0]["id"]
    resolve("orderTest", doctor, {"caseId": cid, "testId": test_id})
    in_progress = resolve("getCase", doctor, {"id": cid})
    assert in_progress["lifecycleState"] == "InProgress"

    resolve("recordTestResult", doctor, {"caseId": cid, "testId": test_id, "result": "WBC 16"})
    resolve("rerankAfterResults", doctor, {"caseId": cid})
    resolve("proposeFinalDiagnosis", doctor, {"caseId": cid})
    closed = resolve("acceptFinalDiagnosis", doctor, {"caseId": cid, "note": "agree"})

    assert closed["case"]["lifecycleState"] == "Closed"
    assert closed["case"]["status"] == "Completed"
    assert closed["finalDiagnosis"]["status"] == "accepted"


def test_reject_requires_reason(aws, nurse, doctor, sample_intake, seeded_users):
    cid = _drive_to_doctor_review(nurse, doctor, sample_intake)
    rec = resolve("requestRecommendations", doctor, {"caseId": cid})
    dx_id = rec["diagnoses"][0]["id"]

    with pytest.raises(ValidationError):
        resolve("rejectRecommendation", doctor, {"caseId": cid, "targetId": dx_id})

    ok = resolve("rejectRecommendation", doctor, {
        "caseId": cid, "targetId": dx_id, "reason": "Prefer to wait for imaging.",
    })
    assert ok["accepted"] is False


def test_accept_recommendation_records_feedback(aws, nurse, doctor, sample_intake, seeded_users):
    from sehati.db import feedback_repo

    cid = _drive_to_doctor_review(nurse, doctor, sample_intake)
    rec = resolve("requestRecommendations", doctor, {"caseId": cid})
    resolve("acceptRecommendation", doctor, {
        "caseId": cid, "targetId": rec["tests"][0]["id"], "targetType": "test",
    })
    fb = feedback_repo.list_for_case(cid)
    assert any(f["kind"] == "accept" for f in fb)


def test_illegal_manual_state_transition_rejected(aws, nurse, doctor, sample_intake, seeded_users):
    case = resolve("submitIntake", nurse, sample_intake)
    resolve("assignCase", nurse, {"caseId": case["id"], "doctorId": doctor.sub})
    # Intake/AIInterview -> Closed is not allowed.
    with pytest.raises(StateTransitionError):
        resolve("setCaseState", doctor, {"caseId": case["id"], "state": "Closed"})


def test_explainability_chat_persists_to_diagnosis(aws, nurse, doctor, sample_intake, seeded_users):
    cid = _drive_to_doctor_review(nurse, doctor, sample_intake)
    rec = resolve("requestRecommendations", doctor, {"caseId": cid})
    dx_id = rec["diagnoses"][0]["id"]
    out = resolve("askDiagnosis", doctor, {
        "caseId": cid, "diagnosisId": dx_id, "question": "What evidence supports this?",
    })
    assert out["aiMessage"]["role"] == "ai"
    case = resolve("getCase", doctor, {"id": cid})
    dx = next(d for d in case["diagnoses"] if d["id"] == dx_id)
    assert len(dx["discussion"]) >= 2  # doctor question + ai answer


def test_interview_transcript_is_served_outside_the_case_payload(aws, nurse, sample_intake):
    """The kiosk runs on the nurse's device, so the live transcript has to reach
    her session — but only through this endpoint, never in her case view."""
    case = resolve("submitIntake", nurse, sample_intake)
    live = resolve("getInterview", nurse, {"caseId": case["id"]})
    assert live["messages"][-1]["role"] == "ai"
    assert live["open"] is True
    assert live["patientName"] == "Layla Haddad"
