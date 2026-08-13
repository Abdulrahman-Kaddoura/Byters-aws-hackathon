"""The shared reference-document library — clinical staff upload documents
(e.g. a guideline for a specific condition) that the AI seam can pull in as
grounding evidence on any case (see ``ai/bedrock.py``'s ``_retrieve`` and
``db/resources_repo.search_resources``). Gated behind ``resources.manage``,
distinct from ``uploadCaseDocument`` (per-case, no permission gate)."""

from __future__ import annotations

import base64
import os
import uuid
from functools import lru_cache
from typing import Any

import boto3

from ..context import AuthContext
from ..db import resources_repo
from ..errors import ValidationError
from ..text_extract import extract_document_text


@lru_cache(maxsize=1)
def _s3_client():
    return boto3.client("s3", region_name=os.environ.get("AWS_REGION", "us-east-1"))


def list_resources(ctx: AuthContext, args: dict[str, Any]) -> list[dict[str, Any]]:
    ctx.require_permission("resources.manage")
    resources = resources_repo.list_resources()
    return [_without_text(r) for r in resources]


def upload_resource(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    ctx.require_permission("resources.manage")
    title = _require(args, "title")
    file_base64 = _require(args, "fileBase64")
    file_ext = args.get("fileExtension", "pdf")
    tags = args.get("tags") or []
    if not isinstance(tags, list):
        raise ValidationError("'tags' must be a list of strings.")

    raw_bytes = base64.b64decode(file_base64)

    bucket = os.environ["DOCUMENTS_BUCKET"]
    key = f"resources/{uuid.uuid4()}.{file_ext}"
    _s3_client().put_object(
        Bucket=bucket,
        Key=key,
        Body=raw_bytes,
        ContentType=args.get("contentType", "application/octet-stream"),
    )
    s3_uri = f"s3://{bucket}/{key}"
    text = extract_document_text(raw_bytes, file_ext)

    resource = resources_repo.save_resource(
        title=title,
        tags=tags,
        text=text,
        s3_uri=s3_uri,
        file_extension=file_ext,
        uploaded_by=ctx.sub,
        uploaded_by_username=ctx.username,
    )
    return _without_text(resource)


def delete_resource(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    ctx.require_permission("resources.manage")
    resource_id = _require(args, "id")
    resources_repo.delete_resource(resource_id)
    return {"deleted": True}


def _without_text(resource: dict[str, Any]) -> dict[str, Any]:
    """The frontend lists metadata only — the extracted text can be tens of
    thousands of characters and is only ever consumed server-side."""
    return {k: v for k, v in resource.items() if k != "text"}


def _require(args: dict[str, Any], key: str) -> Any:
    val = args.get(key)
    if val in (None, ""):
        raise ValidationError(f"Missing required argument '{key}'.")
    return val
