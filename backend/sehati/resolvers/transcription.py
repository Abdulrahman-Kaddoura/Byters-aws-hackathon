"""Doctor-patient audio transcription resolvers (AWS HealthScribe).

Separate from the text-based AI interview (interview.py) — this handles
audio uploads and their structured clinical documentation output. Ingestion
runs async: start the job here, then ingest its output once complete.

NOT WIRED — see docs/PROJECT_STATUS.md. `from ..ai import ai_get_service`
does not exist (the package exports `get_ai_service`, a factory function, not
an instance) and is called below without being invoked. Not registered in
`router.py` or `handler.py`. Landed here as-is (from the live Lambda) so the
work is version-controlled instead of living only in the console.
"""

from __future__ import annotations

from typing import Any

from ..ai import ai_get_service
from ..ai.client import AgentInvokeError
from ..context import AuthContext
from ..db import audit_repo, cases_repo
from ..errors import ValidationError
from ..models import recent_update


def start_interview_audio(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    """Kick off a HealthScribe medical scribe job for this case's audio."""
    case = cases_repo.get_case(_require(args, "caseId"), ctx)
    audio_s3_uri = _require(args, "audioS3Uri")

    try:
        result = ai_get_service.start_interview_audio(case, audio_s3_uri)
    except AgentInvokeError as exc:
        raise ValidationError(f"Failed to start transcription: {exc}") from exc

    case["transcriptionJobName"] = result.value
    case.setdefault("recentUpdates", []).insert(0, recent_update("Audio transcription started", "system"))

    cases_repo.save_case(case, ctx)
    audit_repo.record(
        ctx, case_id=case["id"], action="startInterviewAudio",
        output={"audioS3Uri": audio_s3_uri, "jobName": case["transcriptionJobName"]},
    )
    return {"case": case, "jobName": case["transcriptionJobName"]}


def ingest_transcription_summary(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    """Pull the completed HealthScribe clinical summary into the case."""
    case = cases_repo.get_case(_require(args, "caseId"), ctx)
    summary_s3_key = _require(args, "summaryS3Key")

    try:
        result = ai_get_service.ingest_transcription_summary(case, summary_s3_key)
    except AgentInvokeError as exc:
        raise ValidationError(f"Failed to ingest transcription summary: {exc}") from exc

    case["transcriptionSummary"] = result.value
    case.setdefault("recentUpdates", []).insert(0, recent_update("Transcription summary ingested", "system"))

    cases_repo.save_case(case, ctx)
    audit_repo.record(
        ctx, case_id=case["id"], action="ingestTranscriptionSummary",
        output={"summaryS3Key": summary_s3_key},
    )
    return {"case": case, "transcriptionSummary": result.value}


def _require(args: dict[str, Any], key: str) -> Any:
    val = args.get(key)
    if val in (None, ""):
        raise ValidationError(f"Missing required argument '{key}'.")
    return val
