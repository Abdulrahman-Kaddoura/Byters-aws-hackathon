"""Doctor feedback, document/audio upload, and HealthScribe transcription."""

import base64

import pytest

from sehati.ai import healthscribe
from sehati.errors import ForbiddenError, ValidationError
from sehati.router import resolve


def _assigned_case(nurse, doctor, sample_intake) -> str:
    """A case admitted by the nurse and routed to the doctor — the only way a
    doctor can reach a case at all."""
    case = resolve("submitIntake", nurse, sample_intake)
    resolve("assignCase", nurse, {"caseId": case["id"], "doctorId": doctor.sub})
    return case["id"]


def test_submit_feedback(aws, nurse, doctor, sample_intake, seeded_users):
    from sehati.db import feedback_repo

    cid = _assigned_case(nurse, doctor, sample_intake)

    result = resolve("submitFeedback", doctor, {
        "caseId": cid, "feedback": "The differential missed a common cause.", "category": "diagnosis",
    })
    assert result["status"] == "success"
    assert result["data"]["feedback"] == "The differential missed a common cause."

    history = feedback_repo.get_doctor_feedback_history(doctor.sub)
    assert history == ["The differential missed a common cause."]


def test_submit_feedback_requires_text(aws, nurse, doctor, sample_intake, seeded_users):
    cid = _assigned_case(nurse, doctor, sample_intake)
    with pytest.raises(ValidationError):
        resolve("submitFeedback", doctor, {"caseId": cid, "feedback": ""})


def test_submit_feedback_enforces_case_isolation(
    aws, nurse, doctor, other_doctor, sample_intake, seeded_users
):
    cid = _assigned_case(nurse, doctor, sample_intake)
    with pytest.raises(ForbiddenError):
        resolve("submitFeedback", other_doctor, {"caseId": cid, "feedback": "hi"})


def test_upload_case_audio(aws, monkeypatch, nurse, doctor, sample_intake, seeded_users):
    import boto3

    monkeypatch.setenv("DOCUMENTS_BUCKET", "sehati-documents-test")
    boto3.client("s3", region_name="us-east-1").create_bucket(Bucket="sehati-documents-test")

    cid = _assigned_case(nurse, doctor, sample_intake)

    result = resolve("uploadCaseAudio", doctor, {
        "caseId": cid,
        "fileBase64": base64.b64encode(b"fake-audio-bytes").decode(),
        "fileExtension": "wav",
        "contentType": "audio/wav",
    })
    assert result["bucket"] == "sehati-documents-test"
    assert result["s3Key"].startswith(f"case-audio/{cid}/")
    assert result["s3Key"].endswith(".wav")


def test_start_transcription_requires_source(
    aws, monkeypatch, nurse, doctor, sample_intake, seeded_users
):
    monkeypatch.setattr(healthscribe, "HEALTHSCRIBE_ROLE_ARN", "arn:aws:iam::123456789012:role/test")
    monkeypatch.setattr(healthscribe, "HEALTHSCRIBE_BUCKET", "sehati-healthscribe-test")

    cid = _assigned_case(nurse, doctor, sample_intake)
    with pytest.raises(ValidationError):
        resolve("startTranscription", doctor, {"caseId": cid})


def test_start_transcription_kicks_off_job(
    aws, monkeypatch, nurse, doctor, sample_intake, seeded_users
):
    monkeypatch.setattr(healthscribe, "HEALTHSCRIBE_ROLE_ARN", "arn:aws:iam::123456789012:role/test")
    monkeypatch.setattr(healthscribe, "HEALTHSCRIBE_BUCKET", "sehati-healthscribe-test")

    started_jobs = []
    monkeypatch.setattr(
        healthscribe._transcribe_client, "start_medical_scribe_job",
        lambda **kwargs: started_jobs.append(kwargs) or {},
    )

    cid = _assigned_case(nurse, doctor, sample_intake)

    result = resolve("startTranscription", doctor, {"caseId": cid, "s3Key": f"case-audio/{cid}/rec.wav"})
    assert result["status"] == "IN_PROGRESS"
    assert result["jobName"].startswith(f"case-{cid}-")
    assert started_jobs[0]["Media"]["MediaFileUri"] == f"s3://sehati-healthscribe-test/case-audio/{cid}/rec.wav"


def test_transcription_status_polls_job(
    aws, monkeypatch, nurse, doctor, sample_intake, seeded_users
):
    monkeypatch.setattr(
        healthscribe._transcribe_client, "get_medical_scribe_job",
        lambda **kwargs: {"MedicalScribeJob": {"MedicalScribeJobStatus": "IN_PROGRESS"}},
    )

    cid = _assigned_case(nurse, doctor, sample_intake)
    result = resolve("transcriptionStatus", doctor, {"caseId": cid, "jobName": "case-x-1"})
    assert result == {"status": "IN_PROGRESS"}


def test_transcription_status_completed_fetches_summary(
    aws, monkeypatch, nurse, doctor, sample_intake, seeded_users
):
    import json

    monkeypatch.setattr(healthscribe, "HEALTHSCRIBE_BUCKET", "sehati-healthscribe-test")
    monkeypatch.setattr(
        healthscribe._transcribe_client, "get_medical_scribe_job",
        lambda **kwargs: {"MedicalScribeJob": {"MedicalScribeJobStatus": "COMPLETED"}},
    )
    clinical_doc = {
        "ClinicalDocumentation": {
            "Sections": [
                {"SectionName": "CHIEF_COMPLAINT", "Summary": [{"SummarizedSegment": "Headache."}]},
            ]
        }
    }

    class _FakeBody:
        def read(self):
            return json.dumps(clinical_doc).encode()

    monkeypatch.setattr(
        healthscribe._s3_client, "get_object",
        lambda **kwargs: {"Body": _FakeBody()},
    )

    cid = _assigned_case(nurse, doctor, sample_intake)
    result = resolve("transcriptionStatus", doctor, {"caseId": cid, "jobName": "case-x-1"})
    assert result["status"] == "COMPLETED"
    assert result["summary"]["chief_complaint"] == "Headache."
