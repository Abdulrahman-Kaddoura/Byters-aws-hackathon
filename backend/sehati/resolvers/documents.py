"""Case documents — stored in S3, listed on the case, and their extracted text
folded into the grounding context every subsequent AI call sees.

A case keeps a ``documents`` array rather than a single file: nurses attach
referral letters and prior records at admission, doctors attach reports later,
and all of it needs to stay retrievable. The concatenated text handed to the AI
is capped (:data:`_MAX_CONTEXT_CHARS`, newest first) so a case with a thick
folder can't quietly blow out the model's context window.
"""

from __future__ import annotations

import base64
import os
import uuid
from functools import lru_cache
from typing import Any

import boto3

from ..context import AuthContext
from ..db import audit_repo, cases_repo
from ..errors import NotFoundError, ValidationError
from ..models import new_id, now_iso, recent_update
from ..text_extract import extract_document_text

# Roughly 10k tokens of grounding text — generous for a case folder, small
# enough to leave the model room for the transcript and its own reasoning.
_MAX_CONTEXT_CHARS = 40_000
_DOWNLOAD_URL_TTL_SECONDS = 300


@lru_cache(maxsize=1)
def _s3_client():
    return boto3.client("s3", region_name=os.environ.get("AWS_REGION", "us-east-1"))


def _rebuild_document_context(case: dict[str, Any]) -> None:
    """Recompute the AI grounding blob from the case's documents, newest first."""
    chunks: list[str] = []
    budget = _MAX_CONTEXT_CHARS
    for doc in reversed(case.get("documents", [])):
        text = (doc.get("text") or "").strip()
        if not text:
            continue
        header = f"--- {doc.get('name', 'Document')} ---\n"
        piece = header + text
        if len(piece) > budget:
            piece = piece[:budget]
        chunks.append(piece)
        budget -= len(piece)
        if budget <= 0:
            break
    case["documentContext"] = "\n\n".join(chunks)


def upload_case_document(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    """Attach a document to a case and fold its text into the AI's context."""
    ctx.require_permission("documents.manage")
    case = cases_repo.get_case(_require(args, "caseId"), ctx)
    file_base64 = _require(args, "fileBase64")
    file_ext = args.get("fileExtension", "pdf")

    raw_bytes = base64.b64decode(file_base64)

    bucket = os.environ["DOCUMENTS_BUCKET"]
    document_id = new_id()
    key = f"case-documents/{case['id']}/{document_id}.{file_ext}"
    content_type = args.get("contentType", "application/octet-stream")
    _s3_client().put_object(
        Bucket=bucket, Key=key, Body=raw_bytes, ContentType=content_type
    )

    # Capped to _MAX_CONTEXT_CHARS: the full case item (all documents' text,
    # plus everything else on the case) has to fit in DynamoDB's 400KB item
    # limit, and this is already the most any one document contributes to the
    # AI's grounding context regardless.
    extracted_text = extract_document_text(raw_bytes, file_ext)[:_MAX_CONTEXT_CHARS]

    document = {
        "id": document_id,
        "name": args.get("fileName") or f"document.{file_ext}",
        "contentType": content_type,
        "extension": file_ext,
        "size": len(raw_bytes),
        "uploadedBy": ctx.sub,
        "uploadedByName": ctx.username,
        "uploadedAt": now_iso(),
        "s3Key": key,
        "s3Uri": f"s3://{bucket}/{key}",
        "text": extracted_text,
    }
    case.setdefault("documents", []).append(document)
    _rebuild_document_context(case)
    case.setdefault("recentUpdates", []).insert(
        0, recent_update(f"Document uploaded: {document['name']}", "doctor")
    )

    cases_repo.save_case(case, ctx)
    audit_repo.record(
        ctx, case_id=case["id"], action="uploadCaseDocument",
        output={"documentId": document_id, "documentS3Uri": document["s3Uri"]},
    )
    return {"case": case, "document": _public(document)}


def list_case_documents(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    ctx.require_permission("documents.manage")
    case = cases_repo.get_case(_require(args, "caseId"), ctx)
    return {"documents": [_public(d) for d in case.get("documents", [])]}


def get_case_document(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    """A short-lived presigned URL so the browser can download or preview it."""
    ctx.require_permission("documents.manage")
    case = cases_repo.get_case(_require(args, "caseId"), ctx)
    document = _find(case, _require(args, "documentId"))
    url = _s3_client().generate_presigned_url(
        "get_object",
        Params={"Bucket": os.environ["DOCUMENTS_BUCKET"], "Key": document["s3Key"]},
        ExpiresIn=_DOWNLOAD_URL_TTL_SECONDS,
    )
    return {
        "document": _public(document),
        "url": url,
        "expiresIn": _DOWNLOAD_URL_TTL_SECONDS,
    }


def delete_case_document(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    """Remove a document. Gated on clinical access, so a nurse can attach
    paperwork at admission but cannot remove anything from the record."""
    ctx.require_permission("cases.view_clinical")
    case = cases_repo.get_case(_require(args, "caseId"), ctx)
    document_id = _require(args, "documentId")
    document = _find(case, document_id)

    _s3_client().delete_object(
        Bucket=os.environ["DOCUMENTS_BUCKET"], Key=document["s3Key"]
    )
    case["documents"] = [d for d in case["documents"] if d.get("id") != document_id]
    _rebuild_document_context(case)
    cases_repo.save_case(case, ctx)
    audit_repo.record(
        ctx, case_id=case["id"], action="deleteCaseDocument",
        output={"documentId": document_id},
    )
    return {"case": case, "documentId": document_id}


def _find(case: dict[str, Any], document_id: str) -> dict[str, Any]:
    for doc in case.get("documents", []):
        if doc.get("id") == document_id:
            return doc
    raise NotFoundError(f"Document '{document_id}' not found on this case.")


def _public(document: dict[str, Any]) -> dict[str, Any]:
    """Metadata only — the extracted ``text`` is grounding for the AI, not a
    payload the document list needs to carry on every request."""
    return {k: v for k, v in document.items() if k not in ("text", "s3Key", "s3Uri")}


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
