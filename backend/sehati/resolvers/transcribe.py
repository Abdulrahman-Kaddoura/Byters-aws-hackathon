"""AWS HealthScribe transcription resolvers.

Kicking off a medical scribe job is fast; the transcription itself can take
minutes, well past any API Gateway integration timeout (REST or HTTP API are
both capped around 30s). So this stays two calls: start_transcription kicks
the job off and returns immediately with a job name, and transcription_status
is polled by the frontend until the job completes.

What the second call does when the job *does* complete is the part that makes a
recording matter: it writes the transcript onto the case's audio document
(``resolvers/documents.attach_audio_transcription``). From that moment the
recording is grounding context on the same path an uploaded referral letter is
— the model's ``retrieve_case_documents`` tool scores its passages, and
``documentContext`` carries it. Doing it here rather than in the browser also
means a doctor who closes the tab mid-job still gets the transcript on the
case: the next poll, from anywhere, persists it.
"""

from __future__ import annotations

from typing import Any

from ..ai import healthscribe
from ..context import AuthContext
from ..db import audit_repo, cases_repo
from ..errors import ValidationError
from . import documents


def transcribe_audio(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    case_id = _require(args, "caseId")
    # Confirms the caller may see this case before spending a transcription job on it.
    case = cases_repo.get_case(case_id, ctx)

    # ``documentId`` is what the upload hands back and the normal way in; a raw
    # key or URI still works for a caller that has one. With none of the three,
    # the case's most recent recording is the only thing it could mean.
    document = documents.find_audio_document(case, document_id=args.get("documentId"))
    s3_key = args.get("s3Key")
    # The document records the bucket it was actually written to. A bare key
    # only resolves against the HealthScribe bucket, which is the same bucket
    # today but need not stay that way.
    audio_s3_uri = (
        args.get("audioS3Uri")
        or (f"s3://{healthscribe.HEALTHSCRIBE_BUCKET}/{s3_key}" if s3_key else None)
        or (document or {}).get("s3Uri")
    )
    if not audio_s3_uri:
        raise ValidationError("Provide either 'documentId', 's3Key' or 'audioS3Uri'.")

    started = healthscribe.start_transcription(case_id, audio_s3_uri)

    if document is not None:
        documents.mark_audio_transcribing(case, document, started["jobName"])
        cases_repo.save_case(case, ctx)
        started["documentId"] = document["id"]
    audit_repo.record(
        ctx, case_id=case_id, action="startTranscription",
        output={"jobName": started["jobName"], "audioS3Uri": audio_s3_uri},
    )
    return started


def transcription_status(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    """Poll a job, and persist its result to the case the moment it lands."""
    case_id = _require(args, "caseId")
    job_name = _require(args, "jobName")
    case = cases_repo.get_case(case_id, ctx)
    status = healthscribe.get_job_status(job_name)

    document = documents.find_audio_document(
        case, document_id=args.get("documentId"), job_name=job_name
    )
    if document is None:
        return status

    if status["status"] == "COMPLETED" and document.get("status") != documents.AUDIO_TRANSCRIBED:
        documents.attach_audio_transcription(
            case, document, status.get("summary"), status.get("transcript") or ""
        )
        cases_repo.save_case(case, ctx)
        audit_repo.record(
            ctx, case_id=case_id, action="transcriptionCompleted",
            output={"jobName": job_name, "documentId": document["id"]},
        )
    elif status["status"] == "FAILED" and document.get("status") != documents.AUDIO_FAILED:
        documents.mark_audio_failed(case, document, status.get("reason", "Unknown failure"))
        cases_repo.save_case(case, ctx)

    status["documentId"] = document["id"]
    status["case"] = case
    return status


def _require(args: dict[str, Any], key: str) -> Any:
    val = args.get(key)
    if val in (None, ""):
        raise ValidationError(f"Missing required argument '{key}'.")
    return val
