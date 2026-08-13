"""Case document upload — stores file in S3, extracts text as context for all AI steps."""

from __future__ import annotations

import base64
import os
import uuid
from functools import lru_cache
from typing import Any

import boto3

from ..context import AuthContext
from ..db import audit_repo, cases_repo
from ..errors import ValidationError
from ..models import recent_update
from ..text_extract import extract_document_text


@lru_cache(maxsize=1)
def _s3_client():
    return boto3.client("s3", region_name=os.environ.get("AWS_REGION", "us-east-1"))


def upload_case_document(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    """Upload doctor's document to S3 and extract its text as case context."""
    case = cases_repo.get_case(_require(args, "caseId"), ctx)
    file_base64 = _require(args, "fileBase64")
    file_ext = args.get("fileExtension", "pdf")

    raw_bytes = base64.b64decode(file_base64)

    bucket = os.environ["DOCUMENTS_BUCKET"]
    key = f"case-documents/{case['id']}/{uuid.uuid4()}.{file_ext}"
    _s3_client().put_object(
        Bucket=bucket,
        Key=key,
        Body=raw_bytes,
        ContentType=args.get("contentType", "application/octet-stream"),
    )
    document_s3_uri = f"s3://{bucket}/{key}"

    document_text = extract_document_text(raw_bytes, file_ext)

    case["documentContext"] = document_text
    case["documentS3Uri"] = document_s3_uri
    case.setdefault("recentUpdates", []).insert(0, recent_update("Document uploaded", "doctor"))

    cases_repo.save_case(case, ctx)
    audit_repo.record(
        ctx, case_id=case["id"], action="uploadCaseDocument",
        output={"documentS3Uri": document_s3_uri},
    )
    return {"case": case, "documentS3Uri": document_s3_uri}


def upload_case_audio(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    """Upload a doctor-recorded audio file to S3 for HealthScribe transcription.

    Unlike upload_case_document, this does not attempt text extraction — the
    bytes are opaque audio, not a document. Returns the S3 key so the caller
    can immediately kick off transcribe.transcribe_audio with it.
    """
    case = cases_repo.get_case(_require(args, "caseId"), ctx)
    file_base64 = _require(args, "fileBase64")
    file_ext = args.get("fileExtension", "wav")

    raw_bytes = base64.b64decode(file_base64)

    bucket = os.environ["DOCUMENTS_BUCKET"]
    key = f"case-audio/{case['id']}/{uuid.uuid4()}.{file_ext}"
    _s3_client().put_object(
        Bucket=bucket,
        Key=key,
        Body=raw_bytes,
        ContentType=args.get("contentType", "application/octet-stream"),
    )

    case.setdefault("recentUpdates", []).insert(0, recent_update("Audio recording uploaded", "doctor"))
    cases_repo.save_case(case, ctx)
    audit_repo.record(
        ctx, case_id=case["id"], action="uploadCaseAudio",
        output={"s3Key": key},
    )
    return {"case": case, "s3Key": key, "bucket": bucket}


def _require(args: dict[str, Any], key: str) -> Any:
    val = args.get(key)
    if val in (None, ""):
        raise ValidationError(f"Missing required argument '{key}'.")
    return val
