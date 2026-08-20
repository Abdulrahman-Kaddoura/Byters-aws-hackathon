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
    signed_off = resolve("acceptFinalDiagnosis", doctor, {"caseId": cid, "note": "agree"})

    # Signing off the diagnosis starts treatment; it does not close the case.
    assert signed_off["case"]["lifecycleState"] == "Treatment"
    assert signed_off["case"]["status"] == "Treatment"
    assert signed_off["finalDiagnosis"]["status"] == "accepted"

    closed = resolve("resolveCase", doctor, {"caseId": cid, "note": "Patient recovered."})
    assert closed["case"]["lifecycleState"] == "Closed"
    assert closed["case"]["status"] == "Completed"


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


# --- Results-driven differential (resolvers/diagnosis.analyze_results) -------
def test_analysis_refuses_to_reason_with_no_results(aws, nurse, doctor, sample_intake, seeded_users):
    """With nothing resulted there is nothing to weigh, and the analysis says
    so rather than inventing a differential from the intake alone."""
    cid = _drive_to_doctor_review(nurse, doctor, sample_intake)
    resolve("recommendTests", doctor, {"caseId": cid})

    out = resolve("analyzeResults", doctor, {"caseId": cid})
    assert out["verdict"] == "no_results"
    assert "Workup" in out["message"]
    assert out["newTests"] == []


def test_equivocal_results_open_a_new_test_round_and_keep_history(
    aws, nurse, doctor, sample_intake, seeded_users
):
    cid = _drive_to_doctor_review(nurse, doctor, sample_intake)
    rec = resolve("recommendTests", doctor, {"caseId": cid})
    resulted_id = rec["tests"][0]["id"]
    untouched_id = rec["tests"][1]["id"]

    resolve("orderTest", doctor, {"caseId": cid, "testId": resulted_id})
    resolve("recordTestResult", doctor, {
        "caseId": cid, "testId": resulted_id, "result": "WBC 7.1", "resultFlag": "normal",
    })

    out = resolve("analyzeResults", doctor, {"caseId": cid})
    assert out["verdict"] == "needs_more_tests"
    assert out["newTests"]

    tests = {t["id"]: t for t in out["case"]["tests"]}
    # The resulted test stays on the case as round-1 history...
    assert tests[resulted_id]["status"] == "completed"
    assert tests[resulted_id]["round"] == 1
    # ...while a recommendation the doctor never acted on is superseded.
    assert untouched_id not in tests
    # And the new round is tagged as such.
    assert out["case"]["testRound"] == 2
    assert all(t["round"] == 2 for t in out["newTests"])


def test_informative_results_reach_a_leading_diagnosis(
    aws, nurse, doctor, sample_intake, seeded_users
):
    cid = _drive_to_doctor_review(nurse, doctor, sample_intake)
    rec = resolve("recommendTests", doctor, {"caseId": cid})
    test_id = rec["tests"][0]["id"]
    resolve("orderTest", doctor, {"caseId": cid, "testId": test_id})
    resolve("recordTestResult", doctor, {
        "caseId": cid, "testId": test_id, "result": "WBC 16.4", "resultFlag": "abnormal",
    })

    out = resolve("analyzeResults", doctor, {"caseId": cid})
    assert out["verdict"] == "confident"
    assert out["diagnoses"]
    assert out["case"]["analysis"]["verdict"] == "confident"


# --- The doctor's own additions ---------------------------------------------
def test_doctor_can_add_a_test_the_ai_did_not_suggest(aws, nurse, doctor, sample_intake, seeded_users):
    cid = _drive_to_doctor_review(nurse, doctor, sample_intake)

    out = resolve("addCustomTest", doctor, {"caseId": cid, "name": "Bedside ultrasound"})
    assert out["test"]["custom"] is True
    # It describes something already ordered, so it starts awaiting a result.
    assert out["test"]["status"] == "ordered"

    resolve("recordTestResult", doctor, {
        "caseId": cid, "testId": out["test"]["id"], "result": "Free fluid in Morison's pouch",
        "resultFlag": "critical",
    })
    analysis = resolve("analyzeResults", doctor, {"caseId": cid})
    assert analysis["verdict"] == "confident"


def test_doctor_can_record_an_exam_the_ai_did_not_recommend(
    aws, nurse, doctor, sample_intake, seeded_users
):
    cid = _drive_to_doctor_review(nurse, doctor, sample_intake)
    out = resolve("addCustomExam", doctor, {
        "caseId": cid, "name": "Kernig's sign", "finding": "Negative",
    })
    assert out["exam"]["custom"] is True
    assert out["exam"]["status"] == "complete"
    assert out["exam"]["finding"] == "Negative"


def test_marking_a_test_awaiting_results(aws, nurse, doctor, sample_intake, seeded_users):
    cid = _drive_to_doctor_review(nurse, doctor, sample_intake)
    rec = resolve("recommendTests", doctor, {"caseId": cid})
    test_id = rec["tests"][0]["id"]

    out = resolve("updateTest", doctor, {"caseId": cid, "testId": test_id, "status": "ordered"})
    assert out["test"]["status"] == "ordered"

    declined = resolve("updateTest", doctor, {
        "caseId": cid, "testId": rec["tests"][1]["id"], "status": "declined",
    })
    assert declined["test"]["status"] == "declined"

    with pytest.raises(ValidationError):
        resolve("updateTest", doctor, {"caseId": cid, "testId": test_id, "status": "completed"})


# --- Treatment, resolution and reopening -------------------------------------
def _to_treatment(nurse, doctor, sample_intake) -> str:
    cid = _drive_to_doctor_review(nurse, doctor, sample_intake)
    rec = resolve("requestRecommendations", doctor, {"caseId": cid})
    test_id = rec["tests"][0]["id"]
    resolve("orderTest", doctor, {"caseId": cid, "testId": test_id})
    resolve("recordTestResult", doctor, {"caseId": cid, "testId": test_id, "result": "WBC 16"})
    resolve("rerankAfterResults", doctor, {"caseId": cid})
    resolve("proposeFinalDiagnosis", doctor, {"caseId": cid})
    resolve("acceptFinalDiagnosis", doctor, {"caseId": cid})
    return cid


def test_cannot_resolve_a_case_that_is_not_on_treatment(
    aws, nurse, doctor, sample_intake, seeded_users
):
    cid = _drive_to_doctor_review(nurse, doctor, sample_intake)
    with pytest.raises(ValidationError):
        resolve("resolveCase", doctor, {"caseId": cid})


def test_unexpected_outcome_reopens_the_case_and_re_reasons(
    aws, nurse, doctor, sample_intake, seeded_users
):
    cid = _to_treatment(nurse, doctor, sample_intake)

    out = resolve("reopenCase", doctor, {
        "caseId": cid, "reason": "No response to antibiotics after 72 hours.",
    })
    case = out["case"]
    # Sign-off is withdrawn and the case is back in the diagnostic loop.
    assert case["finalDiagnosis"]["status"] == "proposed"
    assert case["reopenReason"].startswith("No response")
    assert case["lifecycleState"] in ("ResultsDiscussion", "InProgress")
    assert "outcome" not in case
    # The doctor's account of what happened is on the case for the AI to read.
    assert any("No response to antibiotics" in n["text"] for n in case["notes"])


# --- The doctor's consultation recording -------------------------------------
def test_consultation_prompt_is_answered_once_either_way(
    aws, nurse, doctor, sample_intake, seeded_users
):
    cid = _drive_to_doctor_review(nurse, doctor, sample_intake)
    fresh = resolve("getCase", doctor, {"id": cid})
    assert fresh["consultation"]["prompted"] is False

    # Saying "no recording" is a real answer — it's what stops the prompt
    # coming back, and the case runs on the AI interview alone.
    out = resolve("setConsultation", doctor, {"caseId": cid, "hasRecording": False})
    assert out["consultation"] == {
        "prompted": True, "hasRecording": False,
        "answeredAt": out["consultation"]["answeredAt"], "answeredBy": doctor.username,
    }


def test_a_recorded_consultation_must_carry_its_summary(
    aws, nurse, doctor, sample_intake, seeded_users
):
    cid = _drive_to_doctor_review(nurse, doctor, sample_intake)
    with pytest.raises(ValidationError):
        resolve("setConsultation", doctor, {"caseId": cid, "hasRecording": True})

    out = resolve("setConsultation", doctor, {
        "caseId": cid, "hasRecording": True, "jobName": "job-1",
        "summary": {"chief_complaint": "Headache", "history_of_present_illness": "3 days"},
    })
    assert out["consultation"]["summary"]["chief_complaint"] == "Headache"


def test_the_consultation_summary_reaches_the_model_context(aws, nurse, doctor, sample_intake, seeded_users):
    """The recording only matters if the AI actually sees it — this is the
    seam where every downstream step picks it up."""
    from sehati.ai.bedrock import _case_context

    cid = _drive_to_doctor_review(nurse, doctor, sample_intake)
    resolve("setConsultation", doctor, {
        "caseId": cid, "hasRecording": True,
        "summary": {"chief_complaint": "Headache", "review_of_systems": "No neck stiffness"},
    })
    case = resolve("getCase", doctor, {"id": cid})
    ctx = _case_context(case)
    assert ctx["consultation"]["review_of_systems"] == "No neck stiffness"
    assert ctx["interview"], "the AI interview is still passed alongside it"
