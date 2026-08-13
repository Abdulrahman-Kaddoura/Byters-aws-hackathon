"""The shared reference-document library: repo scoring, resolver permission
gating, and the AI seam's retrieval hookup."""

import base64

import pytest

from sehati.db import resources_repo
from sehati.errors import ForbiddenError, ValidationError
from sehati.router import resolve


def _seed(title="Type 2 Diabetes Guideline", tags=("diabetes", "endocrine"), text="Metformin is first-line therapy."):
    return resources_repo.save_resource(
        title=title, tags=list(tags), text=text, s3_uri="s3://bucket/resources/x.pdf",
        file_extension="pdf", uploaded_by="dr-karim", uploaded_by_username="dr.karim",
    )


# --- db/resources_repo.py ----------------------------------------------------
def test_save_and_list_resources(aws):
    _seed()
    resources = resources_repo.list_resources()
    assert len(resources) == 1
    assert resources[0]["title"] == "Type 2 Diabetes Guideline"
    assert resources[0]["tags"] == ["diabetes", "endocrine"]


def test_search_resources_matches_on_tag(aws):
    _seed(title="Diabetes Guideline", tags=["diabetes", "endocrine"])
    _seed(title="Chest Pain Protocol", tags=["chest pain", "cardiology"])

    hits = resources_repo.search_resources("Patient with long-standing diabetes and fatigue")
    assert [h["title"] for h in hits] == ["Diabetes Guideline"]


def test_search_resources_no_match_returns_empty(aws):
    _seed(title="Diabetes Guideline", tags=["diabetes"])
    assert resources_repo.search_resources("Isolated ankle sprain") == []


def test_search_resources_no_query_returns_empty(aws):
    _seed()
    assert resources_repo.search_resources(None) == []
    assert resources_repo.search_resources("") == []


def test_save_resource_truncates_oversized_text(aws):
    huge = "x" * (resources_repo._MAX_TEXT_CHARS + 1000)  # noqa: SLF001
    saved = resources_repo.save_resource(
        title="Huge doc", tags=[], text=huge, s3_uri="s3://bucket/x.pdf",
        file_extension="pdf", uploaded_by="dr-karim", uploaded_by_username="dr.karim",
    )
    assert len(saved["text"]) == resources_repo._MAX_TEXT_CHARS  # noqa: SLF001
    assert saved["truncated"] is True


# --- resolvers/resources.py ---------------------------------------------------
def test_list_upload_delete_resource(aws, monkeypatch, physician):
    import boto3

    monkeypatch.setenv("DOCUMENTS_BUCKET", "sehati-documents-test")
    boto3.client("s3", region_name="us-east-1").create_bucket(Bucket="sehati-documents-test")

    uploaded = resolve("uploadResource", physician, {
        "title": "Migraine Guideline",
        "tags": ["migraine", "neurology"],
        "fileBase64": base64.b64encode(b"guideline text").decode(),
        "fileExtension": "txt",
    })
    assert uploaded["title"] == "Migraine Guideline"
    assert "text" not in uploaded  # metadata only, never the extracted text
    assert uploaded["s3Uri"].startswith("s3://sehati-documents-test/resources/")

    listed = resolve("listResources", physician, {})
    assert len(listed) == 1
    assert listed[0]["id"] == uploaded["id"]

    result = resolve("deleteResource", physician, {"id": uploaded["id"]})
    assert result == {"deleted": True}
    assert resolve("listResources", physician, {}) == []


def test_upload_resource_requires_title_and_file(aws, physician):
    with pytest.raises(ValidationError):
        resolve("uploadResource", physician, {"fileBase64": base64.b64encode(b"x").decode()})
    with pytest.raises(ValidationError):
        resolve("uploadResource", physician, {"title": "No file"})


def test_resources_forbidden_for_patient(aws, patient):
    with pytest.raises(ForbiddenError):
        resolve("listResources", patient, {})
    with pytest.raises(ForbiddenError):
        resolve("uploadResource", patient, {"title": "x", "fileBase64": "eA=="})
    with pytest.raises(ForbiddenError):
        resolve("deleteResource", patient, {"id": "res-1"})


# --- AI seam retrieval hookup --------------------------------------------------
def test_bedrock_service_retrieves_matching_resources(aws):
    from sehati.ai.bedrock import BedrockAIService

    _seed(title="Diabetes Guideline", tags=["diabetes"], text="Metformin is first-line therapy.")
    service = BedrockAIService()

    evidence = service._retrieve_resources("Chief complaint: diabetes follow-up", k=3)  # noqa: SLF001
    assert len(evidence) == 1
    assert evidence[0]["text"] == "Metformin is first-line therapy."
    assert evidence[0]["source"]["title"] == "Diabetes Guideline"


def test_bedrock_service_retrieve_merges_resources_with_no_kb_configured(aws, monkeypatch):
    from sehati.ai import bedrock

    monkeypatch.setattr(bedrock, "KNOWLEDGE_BASE_ID", "")
    _seed(title="Diabetes Guideline", tags=["diabetes"], text="Metformin is first-line therapy.")
    service = bedrock.BedrockAIService()

    evidence = service._retrieve("diabetes")  # noqa: SLF001
    assert len(evidence) == 1
    assert evidence[0]["source"]["title"] == "Diabetes Guideline"
