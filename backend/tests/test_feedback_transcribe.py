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


def _signed_off_case(nurse, doctor, sample_intake) -> str:
    """A case driven to an accepted final diagnosis — the point the UI pops the
    feedback dialog, and the earliest state the server takes feedback in (see
    resolvers/feedback.py)."""
    cid = _assigned_case(nurse, doctor, sample_intake)
    for _ in range(6):
        if resolve("postInterviewMessage", nurse, {"caseId": cid, "text": "some answer"})["complete"]:
            break
    resolve("generateSummary", nurse, {"caseId": cid})
    rec = resolve("requestRecommendations", doctor, {"caseId": cid})
    test_id = rec["tests"][0]["id"]
    resolve("orderTest", doctor, {"caseId": cid, "testId": test_id})
    resolve("recordTestResult", doctor, {"caseId": cid, "testId": test_id, "result": "WBC 16"})
    resolve("rerankAfterResults", doctor, {"caseId": cid})
    resolve("proposeFinalDiagnosis", doctor, {"caseId": cid})
    resolve("acceptFinalDiagnosis", doctor, {"caseId": cid})
    return cid


def _resolved_case(nurse, doctor, sample_intake) -> str:
    """A signed-off case the doctor then marked complete."""
    cid = _signed_off_case(nurse, doctor, sample_intake)
    resolve("resolveCase", doctor, {"caseId": cid})
    return cid


def test_submit_feedback(aws, nurse, doctor, sample_intake, seeded_users):
    from sehati.db import feedback_repo

    cid = _resolved_case(nurse, doctor, sample_intake)

    result = resolve("submitFeedback", doctor, {
        "caseId": cid, "feedback": "The differential missed a common cause.", "category": "diagnosis",
    })
    assert result["status"] == "success"
    assert result["data"]["feedback"] == "The differential missed a common cause."

    history = feedback_repo.get_doctor_feedback_history(doctor.sub)
    assert history == ["The differential missed a common cause."]


def test_feedback_is_accepted_as_soon_as_the_diagnosis_is_signed_off(
    aws, nurse, doctor, sample_intake, seeded_users
):
    """The dialog pops the moment the doctor accepts, so the server has to take
    feedback then — not only once the case is also marked complete."""
    cid = _signed_off_case(nurse, doctor, sample_intake)
    result = resolve("submitFeedback", doctor, {
        "caseId": cid, "feedback": "Ranked the right diagnosis first.", "category": "diagnosis",
    })
    assert result["status"] == "success"


def test_feedback_is_refused_before_a_diagnosis_is_signed_off(
    aws, nurse, doctor, sample_intake, seeded_users
):
    """Feedback is a judgement of the reasoning, so a case whose reasoning the
    doctor hasn't ruled on yet rejects it."""
    cid = _assigned_case(nurse, doctor, sample_intake)
    with pytest.raises(ValidationError):
        resolve("submitFeedback", doctor, {"caseId": cid, "feedback": "Too early to say."})


def test_submit_feedback_requires_text(aws, nurse, doctor, sample_intake, seeded_users):
    cid = _resolved_case(nurse, doctor, sample_intake)
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


def test_create_case_audio_upload_returns_a_presigned_put(
    aws, monkeypatch, nurse, doctor, sample_intake, seeded_users
):
    """Recordings go straight to S3: base64 through API Gateway caps out at a
    few megabytes, which is a couple of minutes of audio."""
    import boto3

    monkeypatch.setenv("DOCUMENTS_BUCKET", "sehati-documents-test")
    boto3.client("s3", region_name="us-east-1").create_bucket(Bucket="sehati-documents-test")

    cid = _assigned_case(nurse, doctor, sample_intake)

    result = resolve("createCaseAudioUpload", doctor, {
        "caseId": cid,
        "fileName": "consult.m4a",
        "fileExtension": "m4a",
        "contentType": "audio/mp4",
        "size": 24_000_000,
    })
    assert result["uploadUrl"].startswith("https://")
    assert result["s3Key"].startswith(f"case-audio/{cid}/")
    assert result["s3Key"].endswith(".m4a")

    # The recording is on the case before a byte is uploaded, so a doctor who
    # abandons the upload leaves a visible row rather than an orphaned object.
    case = resolve("getCase", doctor, {"id": cid})
    audio = [d for d in case["documents"] if d.get("kind") == "audio"]
    assert len(audio) == 1
    assert audio[0]["status"] == "pending"
    assert audio[0]["id"] == result["documentId"]


def test_audio_extension_falls_back_to_the_content_type(
    aws, monkeypatch, nurse, doctor, sample_intake, seeded_users
):
    """A file picked on a phone can carry no extension at all."""
    import boto3

    monkeypatch.setenv("DOCUMENTS_BUCKET", "sehati-documents-test")
    boto3.client("s3", region_name="us-east-1").create_bucket(Bucket="sehati-documents-test")

    cid = _assigned_case(nurse, doctor, sample_intake)
    result = resolve("createCaseAudioUpload", doctor, {
        "caseId": cid, "fileExtension": "", "contentType": "audio/webm;codecs=opus",
    })
    assert result["s3Key"].endswith(".webm")


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


def _completed_job(clinical_doc, transcript_doc, bucket="sehati-healthscribe-test"):
    """A COMPLETED job whose output URIs point at the two documents."""
    return {
        "MedicalScribeJob": {
            "MedicalScribeJobStatus": "COMPLETED",
            "MedicalScribeOutput": {
                "ClinicalDocumentUri": f"s3://{bucket}/jobs/case-x-1/summary.json",
                "TranscriptFileUri": f"s3://{bucket}/jobs/case-x-1/transcript.json",
            },
        }
    }


_CLINICAL_DOC = {
    "ClinicalDocumentation": {
        "Sections": [
            {"SectionName": "CHIEF_COMPLAINT", "Summary": [{"SummarizedSegment": "Headache."}]},
            {"SectionName": "ASSESSMENT", "Summary": [{"SummarizedSegment": "Likely migraine."}]},
        ]
    }
}

_TRANSCRIPT_DOC = {
    "Conversation": {
        "TranscriptSegments": [
            {
                "Content": "When did the headache start?",
                "ParticipantDetails": {"ParticipantRole": "CLINICIAN_0"},
            },
            {
                "Content": "Three days ago, behind my left eye.",
                "ParticipantDetails": {"ParticipantRole": "PATIENT_0"},
            },
        ]
    }
}


def _stub_healthscribe_output(monkeypatch, job_response):
    """Point the HealthScribe seam at in-memory job output."""
    import json

    monkeypatch.setattr(healthscribe, "HEALTHSCRIBE_BUCKET", "sehati-healthscribe-test")
    monkeypatch.setattr(
        healthscribe._transcribe_client, "get_medical_scribe_job",
        lambda **kwargs: job_response,
    )

    bodies = {
        "jobs/case-x-1/summary.json": _CLINICAL_DOC,
        "jobs/case-x-1/transcript.json": _TRANSCRIPT_DOC,
    }

    class _FakeBody:
        def __init__(self, payload):
            self._payload = payload

        def read(self):
            return json.dumps(self._payload).encode()

    monkeypatch.setattr(
        healthscribe._s3_client, "get_object",
        lambda **kwargs: {"Body": _FakeBody(bodies[kwargs["Key"]])},
    )


def test_completed_job_is_read_from_the_uri_the_job_reports(
    aws, monkeypatch, nurse, doctor, sample_intake, seeded_users
):
    """HealthScribe chooses where its output lands. Guessing an output key was
    the bug: the fetch 404'd and every completed transcription surfaced as a
    failure."""
    _stub_healthscribe_output(monkeypatch, _completed_job(_CLINICAL_DOC, _TRANSCRIPT_DOC))

    cid = _assigned_case(nurse, doctor, sample_intake)
    result = resolve("transcriptionStatus", doctor, {"caseId": cid, "jobName": "case-x-1"})

    assert result["status"] == "COMPLETED"
    assert result["summary"]["chief_complaint"] == "Headache."
    # Sections beyond the four the case has always carried come through too.
    assert result["summary"]["assessment"] == "Likely migraine."
    assert "PATIENT 0: Three days ago" in result["transcript"]


def test_a_transcribed_recording_becomes_ai_context_like_a_document(
    aws, monkeypatch, nurse, doctor, sample_intake, seeded_users
):
    """The point of the whole flow: once transcribed, the recording is
    retrievable by the model's document tool and sits in documentContext,
    exactly like an uploaded referral letter."""
    import boto3

    from sehati.resolvers import documents

    monkeypatch.setenv("DOCUMENTS_BUCKET", "sehati-documents-test")
    boto3.client("s3", region_name="us-east-1").create_bucket(Bucket="sehati-documents-test")
    monkeypatch.setattr(healthscribe, "HEALTHSCRIBE_ROLE_ARN", "arn:aws:iam::123456789012:role/test")
    monkeypatch.setattr(healthscribe, "HEALTHSCRIBE_BUCKET", "sehati-documents-test")
    monkeypatch.setattr(
        healthscribe._transcribe_client, "start_medical_scribe_job", lambda **kwargs: {}
    )

    cid = _assigned_case(nurse, doctor, sample_intake)
    upload = resolve("createCaseAudioUpload", doctor, {
        "caseId": cid, "fileName": "consult.wav", "fileExtension": "wav", "contentType": "audio/wav",
    })
    started = resolve("startTranscription", doctor, {"caseId": cid, "documentId": upload["documentId"]})
    assert started["documentId"] == upload["documentId"]

    case = resolve("getCase", doctor, {"id": cid})
    assert documents.find_audio_document(case)["status"] == "transcribing"

    _stub_healthscribe_output(monkeypatch, _completed_job(_CLINICAL_DOC, _TRANSCRIPT_DOC))
    resolve("transcriptionStatus", doctor, {"caseId": cid, "jobName": started["jobName"]})

    case = resolve("getCase", doctor, {"id": cid})
    audio = documents.find_audio_document(case)
    assert audio["status"] == "transcribed"
    assert "behind my left eye" in audio["text"]
    assert "behind my left eye" in case["documentContext"]

    # And the tool the model actually calls returns it.
    passages = documents.retrieve_document_passages(case, "headache")
    assert any("headache" in p["text"].lower() for p in passages)
    assert documents.document_count(case) == 1


def test_a_failed_job_is_recorded_on_the_recording(
    aws, monkeypatch, nurse, doctor, sample_intake, seeded_users
):
    import boto3

    from sehati.resolvers import documents

    monkeypatch.setenv("DOCUMENTS_BUCKET", "sehati-documents-test")
    boto3.client("s3", region_name="us-east-1").create_bucket(Bucket="sehati-documents-test")
    monkeypatch.setattr(healthscribe, "HEALTHSCRIBE_ROLE_ARN", "arn:aws:iam::123456789012:role/test")
    monkeypatch.setattr(healthscribe, "HEALTHSCRIBE_BUCKET", "sehati-healthscribe-test")
    monkeypatch.setattr(
        healthscribe._transcribe_client, "start_medical_scribe_job", lambda **kwargs: {}
    )
    monkeypatch.setattr(
        healthscribe._transcribe_client, "get_medical_scribe_job",
        lambda **kwargs: {
            "MedicalScribeJob": {
                "MedicalScribeJobStatus": "FAILED",
                "FailureReason": "Unsupported media format",
            }
        },
    )

    cid = _assigned_case(nurse, doctor, sample_intake)
    upload = resolve("createCaseAudioUpload", doctor, {"caseId": cid, "fileExtension": "wav"})
    started = resolve("startTranscription", doctor, {"caseId": cid, "documentId": upload["documentId"]})

    result = resolve("transcriptionStatus", doctor, {"caseId": cid, "jobName": started["jobName"]})
    assert result["status"] == "FAILED"

    case = resolve("getCase", doctor, {"id": cid})
    audio = documents.find_audio_document(case)
    assert audio["status"] == "failed"
    assert audio["failureReason"] == "Unsupported media format"


def _client_error(code: str, message: str):
    from botocore.exceptions import ClientError

    return ClientError({"Error": {"Code": code, "Message": message}}, "GetMedicalScribeJob")


def test_a_job_transcribe_has_never_heard_of_is_terminal_not_a_500(
    aws, monkeypatch, nurse, doctor, sample_intake, seeded_users
):
    """The failure mode behind the doctor's 500 loop.

    Transcribe answers a name it doesn't know with a *BadRequest*, which used
    to escape as an unhandled error: every poll 500'd, the dialog spun, and the
    recording sat in "transcribing" forever. It is terminal information — the
    job is never going to appear — so it is recorded on the recording as a
    failure with the reason, and polling stops.
    """
    import boto3

    from sehati.resolvers import documents

    monkeypatch.setenv("DOCUMENTS_BUCKET", "sehati-documents-test")
    boto3.client("s3", region_name="us-east-1").create_bucket(Bucket="sehati-documents-test")
    monkeypatch.setattr(healthscribe, "HEALTHSCRIBE_ROLE_ARN", "arn:aws:iam::123456789012:role/test")
    monkeypatch.setattr(healthscribe, "HEALTHSCRIBE_BUCKET", "sehati-healthscribe-test")
    monkeypatch.setattr(
        healthscribe._transcribe_client, "start_medical_scribe_job", lambda **kwargs: {}
    )

    def _not_found(**kwargs):
        raise _client_error("BadRequestException", "The requested job couldn't be found.")

    monkeypatch.setattr(healthscribe._transcribe_client, "get_medical_scribe_job", _not_found)

    cid = _assigned_case(nurse, doctor, sample_intake)
    upload = resolve("createCaseAudioUpload", doctor, {"caseId": cid, "fileExtension": "mp3"})
    started = resolve("startTranscription", doctor, {"caseId": cid, "documentId": upload["documentId"]})

    result = resolve("transcriptionStatus", doctor, {"caseId": cid, "jobName": started["jobName"]})
    assert result["status"] == "FAILED"
    assert started["jobName"] in result["reason"]

    case = resolve("getCase", doctor, {"id": cid})
    audio = documents.find_audio_document(case)
    assert audio["status"] == "failed"
    assert "couldn't be found" in audio["failureReason"]


def test_a_transcribe_outage_names_its_cause(aws, monkeypatch, nurse, doctor, sample_intake, seeded_users):
    """Anything else from Transcribe is an upstream failure, and it carries the
    AWS error code — the handler turns it into a 502 the caller can read."""
    from sehati.ai.client import AgentInvokeError

    def _denied(**kwargs):
        raise _client_error("AccessDeniedException", "not authorized to GetMedicalScribeJob")

    monkeypatch.setattr(healthscribe._transcribe_client, "get_medical_scribe_job", _denied)

    cid = _assigned_case(nurse, doctor, sample_intake)
    with pytest.raises(AgentInvokeError) as excinfo:
        resolve("transcriptionStatus", doctor, {"caseId": cid, "jobName": "case-x-1"})
    assert "AccessDeniedException" in str(excinfo.value)


def test_a_completed_job_keeps_the_transcript_when_the_summary_cannot_be_read(
    aws, monkeypatch, nurse, doctor, sample_intake, seeded_users
):
    """The summary and the transcript are two objects, and one can be
    unreadable (a denied KMS decrypt, an output that never landed) while the
    other is fine. The half that arrived is still the grounding context this
    whole path exists to produce, so it is kept."""
    import json

    from sehati.resolvers import documents

    monkeypatch.setattr(healthscribe, "HEALTHSCRIBE_BUCKET", "sehati-healthscribe-test")
    monkeypatch.setattr(
        healthscribe._transcribe_client, "get_medical_scribe_job",
        lambda **kwargs: {
            "MedicalScribeJob": {
                "MedicalScribeJobStatus": "COMPLETED",
                "MedicalScribeOutput": {
                    "ClinicalDocumentUri": "s3://sehati-healthscribe-test/job/summary.json",
                    "TranscriptFileUri": "s3://sehati-healthscribe-test/job/transcript.json",
                },
            }
        },
    )
    transcript_doc = {
        "Conversation": {
            "TranscriptSegments": [
                {"Content": "Where does it hurt?", "ParticipantDetails": {"ParticipantRole": "CLINICIAN"}},
                {"Content": "Behind my left eye.", "ParticipantDetails": {"ParticipantRole": "PATIENT"}},
            ]
        }
    }

    class _FakeBody:
        def read(self):
            return json.dumps(transcript_doc).encode()

    def _get_object(**kwargs):
        if kwargs["Key"].endswith("summary.json"):
            raise _client_error("AccessDenied", "KMS key access denied")
        return {"Body": _FakeBody()}

    monkeypatch.setattr(healthscribe._s3_client, "get_object", _get_object)

    cid = _assigned_case(nurse, doctor, sample_intake)
    result = resolve("transcriptionStatus", doctor, {"caseId": cid, "jobName": "case-x-1"})
    assert result["status"] == "COMPLETED"
    assert "Behind my left eye" in result["transcript"]


def test_an_mp3_is_stored_with_an_extension_healthscribe_reads(
    aws, monkeypatch, nurse, doctor, sample_intake, seeded_users
):
    """`audio/mpeg` is what a browser calls an mp3. Storing the MIME subtype
    verbatim would key the object `.mpeg`, which HealthScribe does not read —
    a failure that only shows up minutes after the upload."""
    import boto3

    monkeypatch.setenv("DOCUMENTS_BUCKET", "sehati-documents-test")
    boto3.client("s3", region_name="us-east-1").create_bucket(Bucket="sehati-documents-test")

    cid = _assigned_case(nurse, doctor, sample_intake)
    result = resolve("createCaseAudioUpload", doctor, {
        "caseId": cid, "fileExtension": "", "contentType": "audio/mpeg",
    })
    assert result["s3Key"].endswith(".mp3")
