"""AWS HealthScribe transcription — separate concern from the reasoning agent.

Wired in via ``resolvers/transcribe.py`` (``startTranscription`` /
``transcriptionStatus``). ``infra/stacks/sehati_stack.py`` provisions the
data-access IAM role, the `transcribe:*` + `iam:PassRole` grants, and the
HEALTHSCRIBE_ROLE_ARN / HEALTHSCRIBE_BUCKET env vars below — see
``docs/ARCHITECTURE.md`` §6.

Two things a completed job gives us, and we keep both:

* the **clinical document** (``summary.json``) — HealthScribe's sectioned
  summary of the encounter, and
* the **transcript** (``transcript.json``) — the turn-by-turn conversation.

The summary is the compact view the case carries; the transcript is what the
AI actually retrieves as grounding, the same way it retrieves an uploaded
document. Where those two files live is decided by HealthScribe, not by us:
:func:`get_job_status` reads the URIs off the job itself
(``MedicalScribeOutput``) rather than guessing an output key.
"""

from __future__ import annotations

import json
import os
import re
import time
from typing import Any
from urllib.parse import unquote, urlparse

import boto3

from .client import AgentInvokeError

_REGION = os.environ.get("AWS_REGION", "us-east-1")
_transcribe_client = boto3.client("transcribe", region_name=_REGION)
_s3_client = boto3.client("s3", region_name=_REGION)

# No hardcoded account-specific defaults: this data-access role and bucket are
# environment config, not source, and must be supplied per-deployment.
HEALTHSCRIBE_ROLE_ARN = os.environ.get("HEALTHSCRIBE_ROLE_ARN", "")
HEALTHSCRIBE_BUCKET = os.environ.get("HEALTHSCRIBE_BUCKET", "")
#: The documents bucket is SSE-KMS with a customer-managed key. Transcribe
#: writes its output there under the data-access role, so it has to be told
#: which key to encrypt with; without it the job can fail at the write step,
#: minutes after it was accepted.
HEALTHSCRIBE_KMS_KEY_ARN = os.environ.get("DOCUMENTS_KMS_KEY_ARN", "")

#: HealthScribe job names accept letters, digits, `.`, `_` and `-` only.
_JOB_NAME_SAFE = re.compile(r"[^0-9a-zA-Z._-]")

#: The four sections the case's consultation summary has always carried.
#: Anything else HealthScribe emits (assessment, plan, …) is passed through
#: alongside them rather than dropped.
_CORE_SECTIONS = (
    "chief_complaint",
    "history_of_present_illness",
    "review_of_systems",
    "past_medical_history",
)


def start_transcription(case_id: str, audio_s3_uri: str) -> dict:
    """Kick off a HealthScribe medical scribe job for a case's audio."""
    if not HEALTHSCRIBE_ROLE_ARN or not HEALTHSCRIBE_BUCKET:
        raise AgentInvokeError(
            "HealthScribe is not configured: set HEALTHSCRIBE_ROLE_ARN and "
            "HEALTHSCRIBE_BUCKET."
        )
    job_name = _JOB_NAME_SAFE.sub("-", f"case-{case_id}-{int(time.time())}")
    params: dict[str, Any] = {
        "MedicalScribeJobName": job_name,
        "Media": {"MediaFileUri": audio_s3_uri},
        "OutputBucketName": HEALTHSCRIBE_BUCKET,
        "DataAccessRoleArn": HEALTHSCRIBE_ROLE_ARN,
        "Settings": {"ShowSpeakerLabels": True, "MaxSpeakerLabels": 2},
    }
    if HEALTHSCRIBE_KMS_KEY_ARN:
        params["OutputEncryptionKMSKeyId"] = HEALTHSCRIBE_KMS_KEY_ARN
    try:
        _transcribe_client.start_medical_scribe_job(**params)
    except Exception as exc:
        raise AgentInvokeError(str(exc)) from exc
    return {"jobName": job_name, "status": "IN_PROGRESS"}


def get_job_status(job_name: str) -> dict:
    """Poll a HealthScribe job's status without blocking.

    The caller (resolvers/transcribe.py) polls this from the frontend on an
    interval rather than the Lambda blocking inside start_transcription — a
    medical scribe job can run well past API Gateway's ~30s integration
    timeout, so waiting for it synchronously inside one request is not viable
    regardless of REST vs HTTP API.
    """
    try:
        resp = _transcribe_client.get_medical_scribe_job(MedicalScribeJobName=job_name)
    except Exception as exc:
        raise AgentInvokeError(str(exc)) from exc

    job = resp["MedicalScribeJob"]
    status = job["MedicalScribeJobStatus"]
    if status == "FAILED":
        return {"status": status, "reason": job.get("FailureReason", "Unknown failure")}
    if status != "COMPLETED":
        return {"status": status}

    output = job.get("MedicalScribeOutput") or {}
    # HealthScribe decides where these land (``s3://<output-bucket>/<job>/…``).
    # Reading the URIs off the job is the only way to be sure we fetch what it
    # actually wrote; the fallbacks are for a job record that omits them.
    clinical_uri = output.get("ClinicalDocumentUri") or f"{job_name}/summary.json"
    transcript_uri = output.get("TranscriptFileUri") or f"{job_name}/transcript.json"
    return {
        "status": status,
        "summary": get_clinical_summary(clinical_uri),
        "transcript": get_transcript(transcript_uri),
    }


def get_clinical_summary(clinical_document: str) -> dict:
    """Fetch + flatten a completed job's clinical document into plain sections.

    Accepts either an ``s3://`` / ``https://`` URI (what the job reports) or a
    bare key in :data:`HEALTHSCRIBE_BUCKET`.
    """
    clinical_doc = _load_json(clinical_document)
    sections = {
        s.get("SectionName"): s
        for s in (clinical_doc.get("ClinicalDocumentation") or {}).get("Sections", [])
    }

    def content(section: dict[str, Any]) -> str | None:
        text = " ".join(
            segment.get("SummarizedSegment", "")
            for segment in section.get("Summary", [])
        ).strip()
        return text or None

    summary: dict[str, Any] = {key: None for key in _CORE_SECTIONS}
    for name, section in sections.items():
        if not name:
            continue
        summary[name.lower()] = content(section)
    return summary


def get_transcript(transcript_file: str) -> str:
    """The encounter as readable dialogue, speaker-labelled where available.

    Returns "" rather than raising when the transcript can't be read: a summary
    that arrived is still worth keeping, and the caller has no better answer
    than to carry on without the verbatim turns.
    """
    try:
        doc = _load_json(transcript_file)
    except AgentInvokeError:
        return ""

    segments = (doc.get("Conversation") or {}).get("TranscriptSegments") or []
    lines: list[str] = []
    for segment in segments:
        text = (segment.get("Content") or "").strip()
        if not text:
            continue
        speaker = _speaker_label(segment)
        lines.append(f"{speaker}: {text}" if speaker else text)
    return "\n".join(lines)


def _speaker_label(segment: dict[str, Any]) -> str | None:
    """CLINICIAN / PATIENT when HealthScribe identified roles, else spk_0/1."""
    role = segment.get("ParticipantDetails") or {}
    label = role.get("ParticipantRole") or segment.get("ChannelId") or segment.get("SpeakerLabel")
    if not label:
        return None
    return str(label).replace("_", " ").strip().upper()


def _load_json(location: str) -> dict[str, Any]:
    bucket, key = _parse_s3_location(location)
    try:
        response = _s3_client.get_object(Bucket=bucket, Key=key)
        return json.loads(response["Body"].read())
    except Exception as exc:
        raise AgentInvokeError(str(exc)) from exc


def _parse_s3_location(location: str) -> tuple[str, str]:
    """``s3://bucket/key``, an S3 https URL, or a bare key in the output bucket."""
    if location.startswith("s3://"):
        _, _, rest = location.partition("s3://")
        bucket, _, key = rest.partition("/")
        return bucket, key
    if location.startswith("https://"):
        parsed = urlparse(location)
        path = unquote(parsed.path.lstrip("/"))
        host = parsed.netloc
        if host.startswith("s3.") or host.startswith("s3-"):
            # Path style: s3.<region>.amazonaws.com/<bucket>/<key>
            bucket, _, key = path.partition("/")
            return bucket, key
        return host.split(".s3")[0], path  # virtual-hosted style
    if not HEALTHSCRIBE_BUCKET:
        raise AgentInvokeError("HealthScribe is not configured: set HEALTHSCRIBE_BUCKET.")
    return HEALTHSCRIBE_BUCKET, location
