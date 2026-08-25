"""Case documents — stored in S3, listed on the case, and their extracted text
folded into the grounding context every subsequent AI call sees.

A case keeps a ``documents`` array rather than a single file: nurses attach
referral letters and prior records at admission, doctors attach reports later,
and all of it needs to stay retrievable. The concatenated text handed to the AI
is capped (:data:`_MAX_CONTEXT_CHARS`, newest first) so a case with a thick
folder can't quietly blow out the model's context window.
"""

from __future__ import annotations

import json
from ..doc_extract import extract_document_json
import base64
import os
import re
from functools import lru_cache
from typing import Any

import boto3
from botocore.config import Config

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
    # The documents bucket uses SSE-KMS (see infra), which SigV2 presigned
    # URLs can't authenticate against — "Requests specifying Server Side
    # Encryption with AWS KMS managed keys require AWS Signature Version 4."
    # Force SigV4 explicitly rather than relying on botocore's default.
    return boto3.client(
        "s3",
        region_name=os.environ.get("AWS_REGION", "us-east-1"),
        config=Config(signature_version="s3v4"),
    )


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
    prefix = f"case-documents/{case['id']}/{document_id}"
    original_key = f"{prefix}/original.{file_ext}"
    json_key = f"{prefix}/extracted.json"
    content_type = args.get("contentType", "application/octet-stream")

    _s3_client().put_object(
        Bucket=bucket, Key=original_key, Body=raw_bytes, ContentType=content_type
    )

    extracted = extract_document_json(raw_bytes, file_ext)
    _s3_client().put_object(
        Bucket=bucket,
        Key=json_key,
        Body=json.dumps(extracted).encode("utf-8"),
        ContentType="application/json",
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
        "s3Key": original_key,
        "s3JsonKey": json_key,
        "s3Uri": f"s3://{bucket}/{original_key}",
        "text": extract_document_text(raw_bytes, file_ext),
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


# --- Audio: the doctor's consultation recording ------------------------------
# An audio recording is a case document like any other. It arrives as bytes, it
# is transcribed instead of text-extracted (``resolvers/transcribe.py`` ->
# HealthScribe), and the transcript lands in the same ``text`` field every
# uploaded document carries. That is the whole point of keeping it in
# ``case["documents"]`` rather than a list of its own: the grounding context,
# the retrieval tool the model calls, the document list and the delete path all
# already work on that shape, so a recording becomes AI context on exactly the
# same path a referral letter does.

#: A recording is only *usable* context once HealthScribe has come back. These
#: are the states a case's audio document moves through.
AUDIO_KIND = "audio"
AUDIO_PENDING = "pending"          # bytes not in S3 yet (presigned upload issued)
AUDIO_UPLOADED = "uploaded"        # in S3, no transcription job started
AUDIO_TRANSCRIBING = "transcribing"
AUDIO_TRANSCRIBED = "transcribed"
AUDIO_FAILED = "failed"

_UPLOAD_URL_TTL_SECONDS = 900


def create_case_audio_upload(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    """A presigned PUT so the browser sends the audio straight to S3.

    Audio does not fit the base64-in-JSON path the document upload uses. API
    Gateway caps a request body at 10MB and Lambda at 6MB, and base64 inflates
    the payload by a third — so anything past roughly four minutes of recording
    was being rejected at the edge before a single line of our code ran. The
    browser PUTs the raw bytes to S3 itself instead, and only the metadata
    comes through the API.

    The document row is created here, in ``pending``, so a recording that is
    uploaded but never transcribed is still visible on the case rather than an
    orphaned object in a bucket.
    """
    ctx.require_permission("cases.view_clinical")
    case = cases_repo.get_case(_require(args, "caseId"), ctx)

    bucket = os.environ["DOCUMENTS_BUCKET"]
    document = _new_audio_document(ctx, case, args, bucket)
    content_type = document["contentType"]

    url = _s3_client().generate_presigned_url(
        "put_object",
        Params={"Bucket": bucket, "Key": document["s3Key"], "ContentType": content_type},
        ExpiresIn=_UPLOAD_URL_TTL_SECONDS,
    )

    case.setdefault("documents", []).append(document)
    cases_repo.save_case(case, ctx)
    audit_repo.record(
        ctx, case_id=case["id"], action="createCaseAudioUpload",
        output={"documentId": document["id"], "s3Key": document["s3Key"]},
    )
    return {
        "documentId": document["id"],
        "s3Key": document["s3Key"],
        "bucket": bucket,
        "uploadUrl": url,
        "contentType": content_type,
        "expiresIn": _UPLOAD_URL_TTL_SECONDS,
    }


def upload_case_audio(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    """Upload a recording through the API as base64 (small files only).

    Kept for short clips and for callers that can't do a direct PUT; anything
    of real length must go through :func:`create_case_audio_upload`, which is
    not subject to the API's payload ceiling. No text extraction happens here —
    the bytes are opaque audio, and the transcript arrives later from
    HealthScribe via ``resolvers/transcribe.py``.
    """
    ctx.require_permission("cases.view_clinical")
    case = cases_repo.get_case(_require(args, "caseId"), ctx)
    raw_bytes = base64.b64decode(_require(args, "fileBase64"))

    bucket = os.environ["DOCUMENTS_BUCKET"]
    document = _new_audio_document(ctx, case, args, bucket, size=len(raw_bytes))
    _s3_client().put_object(
        Bucket=bucket,
        Key=document["s3Key"],
        Body=raw_bytes,
        ContentType=document["contentType"],
    )
    document["status"] = AUDIO_UPLOADED

    case.setdefault("documents", []).append(document)
    case.setdefault("recentUpdates", []).insert(0, recent_update("Audio recording uploaded", "doctor"))
    cases_repo.save_case(case, ctx)
    audit_repo.record(
        ctx, case_id=case["id"], action="uploadCaseAudio",
        output={"documentId": document["id"], "s3Key": document["s3Key"]},
    )
    return {
        "case": case,
        "documentId": document["id"],
        "s3Key": document["s3Key"],
        "bucket": bucket,
    }


def _new_audio_document(
    ctx: AuthContext,
    case: dict[str, Any],
    args: dict[str, Any],
    bucket: str,
    size: int | None = None,
) -> dict[str, Any]:
    document_id = new_id()
    # A file picked from a phone can arrive with no extension at all; an empty
    # one would make the S3 key end in a bare dot and leave HealthScribe
    # guessing at the media format.
    file_ext = _audio_extension(args)
    key = f"case-audio/{case['id']}/{document_id}.{file_ext}"
    return {
        "id": document_id,
        "kind": AUDIO_KIND,
        "status": AUDIO_PENDING,
        "name": args.get("fileName") or "Consultation recording",
        "contentType": args.get("contentType") or f"audio/{file_ext}",
        "extension": file_ext,
        "size": size if size is not None else int(args.get("size") or 0),
        "uploadedBy": ctx.sub,
        "uploadedByName": ctx.username,
        "uploadedAt": now_iso(),
        "s3Key": key,
        "s3Uri": f"s3://{bucket}/{key}",
        "text": "",
    }


#: HealthScribe reads the media format off the object's extension, and it
#: knows only these. A MIME subtype is not one of them — an mp3 arrives as
#: `audio/mpeg`, an m4a as `audio/x-m4a` — so a file picked with no extension
#: would otherwise be stored as `.mpeg` and fail in the service minutes later.
_AUDIO_EXTENSION_ALIASES = {
    "mpeg": "mp3",
    "mpeg3": "mp3",
    "mpga": "mp3",
    "xmp3": "mp3",
    "xm4a": "m4a",
    "mp4a": "m4a",
    "xwav": "wav",
    "wave": "wav",
    "vndwave": "wav",
    "xpnwav": "wav",
    "xflac": "flac",
    "opus": "ogg",
    "oga": "ogg",
}


def _audio_extension(args: dict[str, Any]) -> str:
    ext = (args.get("fileExtension") or "").strip().lstrip(".").lower()
    if not ext:
        # `audio/webm;codecs=opus` -> webm
        subtype = (args.get("contentType") or "").split("/")[-1].split(";")[0].strip()
        ext = subtype or "wav"
    ext = re.sub(r"[^a-z0-9]", "", ext) or "wav"
    return _AUDIO_EXTENSION_ALIASES.get(ext, ext)


def find_audio_document(
    case: dict[str, Any], document_id: str | None = None, job_name: str | None = None
) -> dict[str, Any] | None:
    """The case's audio document, by id, by transcription job, or the newest."""
    audio = [d for d in case.get("documents", []) if d.get("kind") == AUDIO_KIND]
    if document_id:
        match = next((d for d in audio if d.get("id") == document_id), None)
        if match or not job_name:
            return match
    if job_name:
        return next((d for d in audio if d.get("jobName") == job_name), None)
    return audio[-1] if audio else None


def mark_audio_transcribing(
    case: dict[str, Any], document: dict[str, Any], job_name: str
) -> None:
    document["status"] = AUDIO_TRANSCRIBING
    document["jobName"] = job_name
    document.pop("failureReason", None)
    case.setdefault("recentUpdates", []).insert(
        0, recent_update("Consultation recording sent for transcription", "system")
    )


def attach_audio_transcription(
    case: dict[str, Any],
    document: dict[str, Any],
    summary: dict[str, Any] | None,
    transcript: str,
) -> None:
    """Fold a completed transcription into the case as document text.

    This is the step that makes a recording count as context: once ``text`` is
    populated the transcript is retrieved by the model's document tool and
    concatenated into ``documentContext`` exactly like an uploaded report.
    """
    document["status"] = AUDIO_TRANSCRIBED
    document["summary"] = summary or {}
    document["transcribedAt"] = now_iso()
    document["text"] = _audio_document_text(summary, transcript)[:_MAX_CONTEXT_CHARS]
    _rebuild_document_context(case)
    case.setdefault("recentUpdates", []).insert(
        0, recent_update("Consultation recording transcribed", "system")
    )


def mark_audio_failed(case: dict[str, Any], document: dict[str, Any], reason: str) -> None:
    document["status"] = AUDIO_FAILED
    document["failureReason"] = reason


def _audio_document_text(summary: dict[str, Any] | None, transcript: str) -> str:
    """Summary sections first, then the verbatim turns.

    Both go in. The summary is what a reader wants; the transcript is where the
    detail the summary dropped still lives, and the retrieval in this module
    scores chunks of it against whatever the model asked about.
    """
    parts = [
        "Transcript of the doctor's consultation with the patient "
        "(recorded in the room, transcribed by AWS HealthScribe)."
    ]
    for name, value in (summary or {}).items():
        text = (value or "").strip() if isinstance(value, str) else ""
        if text:
            parts.append(f"{name.replace('_', ' ').capitalize()}: {text}")
    if transcript.strip():
        parts.append("Verbatim transcript:\n" + transcript.strip())
    return "\n\n".join(parts)


def _require(args: dict[str, Any], key: str) -> Any:
    val = args.get(key)
    if val in (None, ""):
        raise ValidationError(f"Missing required argument '{key}'.")
    return val


# --- Retrieval (the AI's document tool calls in here) ------------------------
# The agent never reaches into the case dict for document text itself; it calls
# the tool in ``ai/tools.py``, which calls this. Keeping the retrieval here
# means the code that writes a document's text and the code that reads it back
# for grounding stay in one file, with one definition of what "the case's
# documents" are.

#: Documents are chunked before scoring so a 40k-char folder doesn't come back
#: as one undifferentiated blob when the model asked about one symptom.
_CHUNK_CHARS = 1_200


def retrieve_document_passages(
    case: dict[str, Any], query: str | None = None, limit: int = 5
) -> list[dict[str, Any]]:
    """Passages from this case's uploaded documents, most relevant first.

    Scoped to ``case`` and nothing else — this never reads another patient's
    folder or the shared reference library. With no ``query`` (or a query that
    matches nothing) it degrades to the newest documents' opening passages,
    which is the right answer for "what was uploaded on this case?".

    Returns the same passage shape ``ai/bedrock.py``'s Knowledge Base and
    reference-library retrieval return, so all three land in ``AIResult`` as
    one uniform ``retrieved_context`` for the audit trail.
    """
    terms = _query_terms(query)
    scored: list[tuple[float, int, dict[str, Any]]] = []
    documents = case.get("documents") or []
    for age, doc in enumerate(reversed(documents)):  # age 0 == newest
        text = (doc.get("text") or "").strip()
        if not text:
            continue
        for position, chunk in enumerate(_chunks(text)):
            score = _score(chunk, terms)
            if terms and not score:
                continue
            scored.append(
                (
                    score,
                    -(age * 1000 + position),  # newest doc, earliest chunk first
                    {
                        "text": chunk,
                        "source": {
                            "documentId": doc.get("id"),
                            "title": doc.get("name"),
                            "uploadedAt": doc.get("uploadedAt"),
                        },
                        "score": score or None,
                    },
                )
            )
    if not scored:
        # A query that matched nothing still shouldn't hand the model an empty
        # folder when documents exist — fall back to recency.
        return retrieve_document_passages(case, None, limit) if terms else []
    scored.sort(key=lambda row: (row[0], row[1]), reverse=True)
    return [passage for _, _, passage in scored[:limit]]


def document_count(case: dict[str, Any]) -> int:
    """How many uploaded documents actually carry extracted text."""
    return sum(1 for d in case.get("documents") or [] if (d.get("text") or "").strip())


def _query_terms(query: str | None) -> set[str]:
    if not query:
        return set()
    words = re.findall(r"[a-z0-9]+", query.lower())
    return {w for w in words if len(w) > 3 and w not in _STOPWORDS}


#: Clinical questions are mostly stopwords by volume; scoring on them ranks
#: every chunk identically.
_STOPWORDS = {
    "about", "after", "also", "been", "does", "from", "have", "into", "most",
    "must", "only", "over", "should", "some", "such", "than", "that", "them",
    "then", "there", "these", "they", "this", "were", "what", "when", "which",
    "with", "would", "your", "patient", "case",
}


def _chunks(text: str) -> list[str]:
    """Split on blank lines, then pack paragraphs up to ``_CHUNK_CHARS``."""
    out: list[str] = []
    current = ""
    for paragraph in re.split(r"\n\s*\n", text):
        paragraph = paragraph.strip()
        if not paragraph:
            continue
        while len(paragraph) > _CHUNK_CHARS:  # one giant paragraph (scanned PDF)
            out.append(paragraph[:_CHUNK_CHARS])
            paragraph = paragraph[_CHUNK_CHARS:]
        if len(current) + len(paragraph) + 2 > _CHUNK_CHARS:
            if current:
                out.append(current)
            current = paragraph
        else:
            current = f"{current}\n\n{paragraph}" if current else paragraph
    if current:
        out.append(current)
    return out


def _score(chunk: str, terms: set[str]) -> float:
    if not terms:
        return 0.0
    lowered = chunk.lower()
    return sum(1 for term in terms if term in lowered) / len(terms)
