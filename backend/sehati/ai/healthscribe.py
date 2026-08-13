"""AWS HealthScribe transcription — separate concern from the reasoning agent.

NOT WIRED YET — see docs/PROJECT_STATUS.md. The Lambda execution role (CDK
stack) grants no `transcribe:*` permissions, no `iam:PassRole` for
HEALTHSCRIBE_ROLE_ARN below, and no access to HEALTHSCRIBE_BUCKET — none of
that is provisioned as code. Landed here as-is (from the live Lambda) so the
work is version-controlled instead of living only in the console.
"""

from __future__ import annotations

import json
import os
import time

import boto3

from .client import AgentInvokeError

_REGION = os.environ.get("AWS_REGION", "us-east-1")
_transcribe_client = boto3.client("transcribe", region_name=_REGION)
_s3_client = boto3.client("s3", region_name=_REGION)

# No hardcoded account-specific defaults: this data-access role and bucket are
# environment config, not source, and must be supplied per-deployment.
HEALTHSCRIBE_ROLE_ARN = os.environ.get("HEALTHSCRIBE_ROLE_ARN", "")
HEALTHSCRIBE_BUCKET = os.environ.get("HEALTHSCRIBE_BUCKET", "")


def start_transcription(case_id: str, audio_s3_uri: str) -> dict:
    """Kick off a HealthScribe medical scribe job for a case's audio."""
    if not HEALTHSCRIBE_ROLE_ARN or not HEALTHSCRIBE_BUCKET:
        raise AgentInvokeError(
            "HealthScribe is not configured: set HEALTHSCRIBE_ROLE_ARN and "
            "HEALTHSCRIBE_BUCKET."
        )
    job_name = f"case-{case_id}-{int(time.time())}"
    try:
        _transcribe_client.start_medical_scribe_job(
            MedicalScribeJobName=job_name,
            Media={"MediaFileUri": audio_s3_uri},
            OutputBucketName=HEALTHSCRIBE_BUCKET,
            DataAccessRoleArn=HEALTHSCRIBE_ROLE_ARN,
            Settings={"ShowSpeakerLabels": True, "MaxSpeakerLabels": 2},
        )
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
    if status == "COMPLETED":
        summary_s3_key = f"medical-scribe-output/{job_name}/summary.json"
        return {"status": status, "summary": get_clinical_summary(summary_s3_key)}
    if status == "FAILED":
        return {"status": status, "reason": job.get("FailureReason", "Unknown failure")}
    return {"status": status}


def get_clinical_summary(summary_s3_key: str) -> dict:
    """Fetch + extract a structured clinical summary from a completed job's output."""
    if not HEALTHSCRIBE_BUCKET:
        raise AgentInvokeError("HealthScribe is not configured: set HEALTHSCRIBE_BUCKET.")
    try:
        response = _s3_client.get_object(Bucket=HEALTHSCRIBE_BUCKET, Key=summary_s3_key)
        clinical_doc = json.loads(response["Body"].read())

        sections = {
            s["SectionName"]: s
            for s in clinical_doc["ClinicalDocumentation"]["Sections"]
        }

        def get_content(section_name: str) -> str | None:
            section = sections.get(section_name)
            if not section:
                return None
            return " ".join(
                s["SummarizedSegment"] for s in section.get("Summary", [])
            )

        return {
            "chief_complaint": get_content("CHIEF_COMPLAINT"),
            "history_of_present_illness": get_content("HISTORY_OF_PRESENT_ILLNESS"),
            "review_of_systems": get_content("REVIEW_OF_SYSTEMS"),
            "past_medical_history": get_content("PAST_MEDICAL_HISTORY"),
        }
    except Exception as exc:
        raise AgentInvokeError(str(exc)) from exc
