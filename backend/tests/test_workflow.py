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
    # AIInterview -> Diagnosis skips the whole workup and is not allowed.
    # (AIInterview -> Closed *is*: the doctor can always end a case.)
    with pytest.raises(StateTransitionError):
        resolve("setCaseState", doctor, {"caseId": case["id"], "state": "Diagnosis"})


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


def test_diagnoses_are_normalized_when_the_model_omits_optional_arrays(
    aws, nurse, doctor, sample_intake, seeded_users, monkeypatch
):
    """The fake AI (like a real Bedrock reply) always fills in every array
    field, so it can't catch the model simply leaving one out — which real
    JSON-from-free-text output does, e.g. no `references` when it has nothing
    to cite. `src/types.ts` types every Diagnosis field as required and the
    frontend reads `.length`/`.map` on them unconditionally, so a missing key
    (not even an empty list) crashes the client. Simulate that here and check
    the resolver backfills it before the case is ever saved."""
    from sehati.ai.base import AIResult
    from tests.fakes.ai_double import FakeAIService

    cid = _drive_to_doctor_review(nurse, doctor, sample_intake)

    bare_diagnosis = {
        "id": "DX-bare",
        "name": "Acute appendicitis",
        "confidence": 62,
        "priority": "High",
        # Everything below is entirely absent, not empty — the shape a model
        # produces when it has nothing to say for a field.
    }
    monkeypatch.setattr(
        FakeAIService, "differential",
        lambda self, case: AIResult(value=[bare_diagnosis], model_version="test"),
    )

    rec = resolve("requestRecommendations", doctor, {"caseId": cid})
    dx = rec["diagnoses"][0]
    for field in (
        "supporting", "contradicting", "missing", "recommendedTests",
        "references", "similarCases", "trend", "discussion",
    ):
        assert dx[field] == [], f"{field} should default to [] when the model omits it"
    for field in (
        "category", "tagline", "reasoning", "confidenceExplanation",
        "whyNot100", "riskAssessment", "nextAction",
    ):
        assert dx[field] == ""

    # And the same object round-trips through storage with those defaults
    # intact, so a later GET never re-exposes the gap.
    stored = resolve("getCase", doctor, {"id": cid})
    assert stored["diagnoses"][0]["references"] == []


def test_a_probability_confidence_is_read_as_a_percentage(
    aws, nurse, doctor, sample_intake, seeded_users, monkeypatch
):
    """A model asked for a "confidence" reaches for 0.82 as readily as 82. The
    UI renders the number straight into `width: {value}%` and a "{value}%"
    label, so an unconverted probability drew every diagnosis at effectively
    zero — which is what confidence showing as 0 on every card actually was."""
    from sehati.ai.base import AIResult
    from tests.fakes.ai_double import FakeAIService

    cid = _drive_to_doctor_review(nurse, doctor, sample_intake)
    monkeypatch.setattr(
        FakeAIService, "differential",
        lambda self, case: AIResult(
            value=[
                {"id": "DX-prob", "name": "Community-acquired pneumonia", "confidence": 0.82},
                {"id": "DX-str", "name": "Acute bronchitis", "confidence": "45%"},
                {"id": "DX-none", "name": "Pulmonary embolism"},
            ],
            model_version="test",
        ),
    )

    dx = resolve("requestRecommendations", doctor, {"caseId": cid})["diagnoses"]
    assert [d["confidence"] for d in dx] == [82, 45, 0]

    # Normalisation also runs on read, so a case stored before this existed
    # renders correctly without a backfill.
    stored = resolve("getCase", doctor, {"id": cid})
    assert stored["diagnoses"][0]["confidence"] == 82


def test_object_entries_in_prose_arrays_are_flattened_to_strings(
    aws, nurse, doctor, sample_intake, seeded_users, monkeypatch
):
    """Asked for a `treatment` list the model returns
    `[{"name": ..., "details": ..., "confidence": 85}]` rather than strings.
    `src/types.ts` types these as string[] and the UI renders each entry
    directly as a React child, so an object there throws React's minified
    error #31 and blanks the whole Diagnosis tab. Flatten rather than drop —
    the doctor still needs the dose and the frequency."""
    from sehati.ai.base import AIResult
    from tests.fakes.ai_double import FakeAIService

    cid = _drive_to_doctor_review(nurse, doctor, sample_intake)
    resolve("requestRecommendations", doctor, {"caseId": cid})
    monkeypatch.setattr(
        FakeAIService, "propose_final_diagnosis",
        lambda self, case: AIResult(
            value={
                "name": "Community-acquired pneumonia",
                "confidence": 84,
                "reasoning": "Consolidation on CXR with raised inflammatory markers.",
                "evidenceSummary": ["RLL infiltrate on chest film"],
                "ruledOut": [{"name": "Pulmonary embolism", "reason": "D-dimer negative"}, "Pneumothorax"],
                "treatment": [{"name": "Amoxicillin 500mg", "details": "TDS for 7 days", "confidence": 85}],
                "monitoring": [{"parameter": "Temperature", "frequency": "every 4 hours", "confidence": 90}],
                "complications": [{"name": "Empyema", "details": "Consider if fever persists", "confidence": 30}],
                "followUp": [{"timing": "2 weeks", "action": "Repeat chest X-ray", "confidence": 80}],
            },
            model_version="test",
        ),
    )

    fd = resolve("proposeFinalDiagnosis", doctor, {"caseId": cid})["finalDiagnosis"]
    for field in ("evidenceSummary", "treatment", "monitoring", "complications", "followUp"):
        assert all(isinstance(x, str) for x in fd[field]), f"{field} must be plain strings"
    # The structure is flattened into the line, not thrown away.
    assert fd["treatment"] == ["Amoxicillin 500mg — TDS for 7 days"]
    assert fd["monitoring"] == ["Temperature — every 4 hours"]
    assert fd["followUp"] == ["Repeat chest X-ray — 2 weeks"]
    # The score is noise once the entry is prose.
    assert "85" not in fd["treatment"][0]
    # A bare string in ruledOut becomes a proper {name, reason} pair.
    assert fd["ruledOut"] == [
        {"name": "Pulmonary embolism", "reason": "D-dimer negative"},
        {"name": "Pneumothorax", "reason": ""},
    ]

    # And it survives the round-trip through storage, so a later GET is safe.
    stored = resolve("getCase", doctor, {"id": cid})["finalDiagnosis"]
    assert stored["treatment"] == ["Amoxicillin 500mg — TDS for 7 days"]


def test_final_diagnosis_is_normalized_when_the_model_omits_optional_arrays(
    aws, nurse, doctor, sample_intake, seeded_users, monkeypatch
):
    from sehati.ai.base import AIResult
    from tests.fakes.ai_double import FakeAIService

    cid = _drive_to_doctor_review(nurse, doctor, sample_intake)
    resolve("requestRecommendations", doctor, {"caseId": cid})

    bare_final = {"name": "Acute appendicitis", "confidence": 88}
    monkeypatch.setattr(
        FakeAIService, "propose_final_diagnosis",
        lambda self, case: AIResult(value=bare_final, model_version="test"),
    )

    out = resolve("proposeFinalDiagnosis", doctor, {"caseId": cid})
    fd = out["finalDiagnosis"]
    for field in ("evidenceSummary", "ruledOut", "treatment", "monitoring", "complications", "followUp"):
        assert fd[field] == []
    assert fd["status"] == "proposed"


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


def test_a_case_can_be_completed_before_a_diagnosis_is_signed_off(
    aws, nurse, doctor, sample_intake, seeded_users
):
    """The doctor's "Mark case complete" action is available at any point — a
    patient can be discharged or referred on mid-workup and the record still
    has to be closed."""
    cid = _drive_to_doctor_review(nurse, doctor, sample_intake)
    case = resolve("resolveCase", doctor, {"caseId": cid, "outcome": "Referred to cardiology"})["case"]
    assert case["lifecycleState"] == "Closed"
    assert case["outcome"] == "Referred to cardiology"


def test_a_completed_case_cannot_be_completed_twice(
    aws, nurse, doctor, sample_intake, seeded_users
):
    cid = _to_treatment(nurse, doctor, sample_intake)
    resolve("resolveCase", doctor, {"caseId": cid})
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
