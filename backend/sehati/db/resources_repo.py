"""The shared reference-document library.

Clinical staff upload reference material (e.g. a guideline PDF for a specific
condition), tagged with the topics it covers. Unlike case documents
(``db/cases_repo.py``'s ``documentContext``), these aren't scoped to one
case — ``ai/bedrock.py`` pulls matching ones in as grounding evidence for
*any* case whose chief complaint/question overlaps their tags (see
``search_resources`` below).

Extracted text is capped before storage — DynamoDB items top out at 400KB,
and an oversized single document would also blow the model's context window
once folded into a prompt as evidence.
"""

from __future__ import annotations

import uuid
from typing import Any

from ..models import now_iso
from . import tables

_MAX_TEXT_CHARS = 50_000


def list_resources() -> list[dict[str, Any]]:
    items = tables.resources_table().scan().get("Items", [])
    resources = [tables.from_dynamo(i) for i in items]
    resources.sort(key=lambda r: r.get("createdAt", ""), reverse=True)
    return resources


def get_resource(resource_id: str) -> dict[str, Any] | None:
    resp = tables.resources_table().get_item(Key={"id": resource_id})
    item = resp.get("Item")
    return tables.from_dynamo(item) if item else None


def save_resource(
    *,
    title: str,
    tags: list[str],
    text: str,
    s3_uri: str,
    file_extension: str,
    uploaded_by: str,
    uploaded_by_username: str,
) -> dict[str, Any]:
    resource = {
        "id": f"res-{uuid.uuid4().hex[:10]}",
        "title": title,
        "tags": sorted({t.strip().lower() for t in tags if t.strip()}),
        "text": text[:_MAX_TEXT_CHARS],
        "truncated": len(text) > _MAX_TEXT_CHARS,
        "s3Uri": s3_uri,
        "fileExtension": file_extension,
        "uploadedBy": uploaded_by,
        "uploadedByUsername": uploaded_by_username,
        "createdAt": now_iso(),
    }
    tables.resources_table().put_item(Item=tables.to_dynamo(resource))
    return resource


def delete_resource(resource_id: str) -> None:
    tables.resources_table().delete_item(Key={"id": resource_id})


def search_resources(query: str | None, limit: int = 3) -> list[dict[str, Any]]:
    """Naive keyword match: a resource scores once per tag (or title word)
    that appears as a substring of the query. No match anywhere -> empty list
    rather than dumping the whole corpus as evidence.

    This is intentionally simple (no embeddings/vector search) — the corpus
    is expected to be a curated handful of documents per topic, not a large
    unstructured collection. A production-scale corpus should move to a real
    Bedrock Knowledge Base instead (see ``ai/bedrock.py``'s ``_retrieve``,
    which already supports one alongside this).
    """
    if not query:
        return []
    q = query.lower()
    scored: list[tuple[int, dict[str, Any]]] = []
    for resource in list_resources():
        haystack = {*resource.get("tags", []), *resource.get("title", "").lower().split()}
        score = sum(1 for term in haystack if term and term in q)
        if score > 0:
            scored.append((score, resource))
    scored.sort(key=lambda pair: pair[0], reverse=True)
    return [r for _, r in scored[:limit]]
