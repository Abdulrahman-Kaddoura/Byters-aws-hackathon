"""AWS HealthScribe transcription resolvers.

Kicking off a medical scribe job is fast; the transcription itself can take
minutes, well past any API Gateway integration timeout (REST or HTTP API are
both capped around 30s). So this stays two calls: start_transcription kicks
the job off and returns immediately with a job name, and transcription_status
is polled by the frontend until the job completes.
"""

from __future__ import annotations

from typing import Any

from ..ai import healthscribe
from ..context import AuthContext
from ..db import cases_repo
from ..errors import ValidationError


def transcribe_audio(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    case_id = _require(args, "caseId")
    # Confirms the caller may see this case before spending a transcription job on it.
    cases_repo.get_case(case_id, ctx)

    # If the client passes a full URI, use it; otherwise build it from the S3 key
    # returned by documents.upload_case_audio.
    s3_key = args.get("s3Key")
    audio_s3_uri = args.get("audioS3Uri") or (
        f"s3://{healthscribe.HEALTHSCRIBE_BUCKET}/{s3_key}" if s3_key else None
    )
    if not audio_s3_uri:
        raise ValidationError("Provide either 's3Key' or 'audioS3Uri'.")

    return healthscribe.start_transcription(case_id, audio_s3_uri)


def transcription_status(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    case_id = _require(args, "caseId")
    job_name = _require(args, "jobName")
    cases_repo.get_case(case_id, ctx)
    return healthscribe.get_job_status(job_name)


def _require(args: dict[str, Any], key: str) -> Any:
    val = args.get(key)
    if val in (None, ""):
        raise ValidationError(f"Missing required argument '{key}'.")
    return val
