"""Doctor feedback, document/audio upload, and HealthScribe transcription."""

import base64

import pytest

from sehati.ai import healthscribe
from sehati.errors import ForbiddenError, ValidationError
from sehati.router import resolve


def test_submit_feedback(aws, patient, physician, sample_intake):
    from sehati.db import feedback_repo

    case = resolve("submitIntake", patient, sample_intake)
    cid = case["id"]

    result = resolve("submitFeedback", physician, {
        "caseId": cid, "feedback": "The differential missed a common cause.", "category": "diagnosis",
    })
    assert result["status"] == "success"
    assert result["data"]["feedback"] == "The differential missed a common cause."

    history = feedback_repo.get_doctor_feedback_history(physician.sub)
    assert history == ["The differential missed a common cause."]


def test_submit_feedback_requires_text(aws, patient, sample_intake):
    case = resolve("submitIntake", patient, sample_intake)
    with pytest.raises(ValidationError):
        resolve("submitFeedback", patient, {"caseId": case["id"], "feedback": ""})


def test_submit_feedback_enforces_case_isolation(aws, patient, other_patient, sample_intake):
    case = resolve("submitIntake", patient, sample_intake)
    with pytest.raises(ForbiddenError):
        resolve("submitFeedback", other_patient, {"caseId": case["id"], "feedback": "hi"})


def test_upload_case_audio(aws, monkeypatch, physician, patient, sample_intake):
    import boto3

    monkeypatch.setenv("DOCUMENTS_BUCKET", "sehati-documents-test")
    boto3.client("s3", region_name="us-east-1").create_bucket(Bucket="sehati-documents-test")

    case = resolve("submitIntake", patient, sample_intake)
    cid = case["id"]

    result = resolve("uploadCaseAudio", physician, {
        "caseId": cid,
        "fileBase64": base64.b64encode(b"fake-audio-bytes").decode(),
        "fileExtension": "wav",
        "contentType": "audio/wav",
    })
    assert result["bucket"] == "sehati-documents-test"
    assert result["s3Key"].startswith(f"case-audio/{cid}/")
    assert result["s3Key"].endswith(".wav")


def test_start_transcription_requires_source(aws, monkeypatch, physician, patient, sample_intake):
    monkeypatch.setattr(healthscribe, "HEALTHSCRIBE_ROLE_ARN", "arn:aws:iam::123456789012:role/test")
    monkeypatch.setattr(healthscribe, "HEALTHSCRIBE_BUCKET", "sehati-healthscribe-test")

    case = resolve("submitIntake", patient, sample_intake)
    with pytest.raises(ValidationError):
        resolve("startTranscription", physician, {"caseId": case["id"]})


def test_start_transcription_kicks_off_job(aws, monkeypatch, physician, patient, sample_intake):
    monkeypatch.setattr(healthscribe, "HEALTHSCRIBE_ROLE_ARN", "arn:aws:iam::123456789012:role/test")
    monkeypatch.setattr(healthscribe, "HEALTHSCRIBE_BUCKET", "sehati-healthscribe-test")

    started_jobs = []
    monkeypatch.setattr(
        healthscribe._transcribe_client, "start_medical_scribe_job",
        lambda **kwargs: started_jobs.append(kwargs) or {},
    )

    case = resolve("submitIntake", patient, sample_intake)
    cid = case["id"]

    result = resolve("startTranscription", physician, {"caseId": cid, "s3Key": f"case-audio/{cid}/rec.wav"})
    assert result["status"] == "IN_PROGRESS"
    assert result["jobName"].startswith(f"case-{cid}-")
    assert started_jobs[0]["Media"]["MediaFileUri"] == f"s3://sehati-healthscribe-test/case-audio/{cid}/rec.wav"


def test_transcription_status_polls_job(aws, monkeypatch, physician, patient, sample_intake):
    monkeypatch.setattr(
        healthscribe._transcribe_client, "get_medical_scribe_job",
        lambda **kwargs: {"MedicalScribeJob": {"MedicalScribeJobStatus": "IN_PROGRESS"}},
    )

    case = resolve("submitIntake", patient, sample_intake)
    result = resolve("transcriptionStatus", physician, {"caseId": case["id"], "jobName": "case-x-1"})
    assert result == {"status": "IN_PROGRESS"}


def test_transcription_status_completed_fetches_summary(aws, monkeypatch, physician, patient, sample_intake):
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

    case = resolve("submitIntake", patient, sample_intake)
    result = resolve("transcriptionStatus", physician, {"caseId": case["id"], "jobName": "case-x-1"})
    assert result["status"] == "COMPLETED"
    assert result["summary"]["chief_complaint"] == "Headache."
