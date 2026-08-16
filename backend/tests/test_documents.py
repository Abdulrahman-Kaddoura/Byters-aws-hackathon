"""Case documents: many per case, downloadable, and capped as AI grounding.

The previous implementation kept only the newest file's text and offered no way
to get the file back, so these tests pin the behaviour that replaced it.
"""

import base64

import pytest

from sehati.errors import ForbiddenError, NotFoundError
from sehati.resolvers import documents as documents_resolver
from sehati.router import resolve


@pytest.fixture()
def bucket(aws, monkeypatch):
    import boto3

    monkeypatch.setenv("DOCUMENTS_BUCKET", "sehati-documents-test")
    boto3.client("s3", region_name="us-east-1").create_bucket(Bucket="sehati-documents-test")
    return "sehati-documents-test"


def _assigned_case(nurse, doctor, sample_intake) -> str:
    case = resolve("submitIntake", nurse, sample_intake)
    resolve("assignCase", nurse, {"caseId": case["id"], "doctorId": doctor.sub})
    return case["id"]


def _upload(ctx, cid, name="report.txt", body=b"CT chest: no acute finding."):
    return resolve("uploadCaseDocument", ctx, {
        "caseId": cid,
        "fileBase64": base64.b64encode(body).decode(),
        "fileExtension": name.rsplit(".", 1)[-1],
        "fileName": name,
        "contentType": "text/plain",
    })


def test_documents_accumulate_rather_than_overwrite(
    bucket, nurse, doctor, sample_intake, seeded_users
):
    cid = _assigned_case(nurse, doctor, sample_intake)
    _upload(doctor, cid, "first.txt", b"first document text")
    _upload(doctor, cid, "second.txt", b"second document text")

    listed = resolve("listCaseDocuments", doctor, {"caseId": cid})["documents"]
    assert [d["name"] for d in listed] == ["first.txt", "second.txt"]

    # Both remain available to the AI as grounding, not just the newest.
    case = resolve("getCase", doctor, {"id": cid})
    from sehati.db import cases_repo

    stored = cases_repo.get_case(cid, doctor)
    assert "first document text" in stored["documentContext"]
    assert "second document text" in stored["documentContext"]
    assert len(case["documents"]) == 2


def test_document_metadata_records_who_attached_it(
    bucket, nurse, doctor, sample_intake, seeded_users
):
    cid = _assigned_case(nurse, doctor, sample_intake)
    document = _upload(nurse, cid, "referral.txt", b"referral letter")["document"]

    assert document["uploadedBy"] == nurse.sub
    assert document["uploadedByName"] == nurse.username
    assert document["size"] == len(b"referral letter")
    assert document["name"] == "referral.txt"
    assert document["uploadedAt"]


def test_download_returns_a_presigned_url(bucket, nurse, doctor, sample_intake, seeded_users):
    cid = _assigned_case(nurse, doctor, sample_intake)
    document_id = _upload(doctor, cid)["document"]["id"]

    result = resolve("getCaseDocument", doctor, {"caseId": cid, "documentId": document_id})
    assert result["url"].startswith("https://")
    # Signed and time-limited (the exact signature scheme differs between moto
    # and real S3, so match on the presence of a signature, not its flavour).
    assert "Signature=" in result["url"]
    assert "Expires=" in result["url"]
    assert result["expiresIn"] == 300
    # The raw S3 key stays server-side — the URL is the only handle a client gets.
    assert "s3Key" not in result["document"]


def test_missing_document_is_a_404(bucket, nurse, doctor, sample_intake, seeded_users):
    cid = _assigned_case(nurse, doctor, sample_intake)
    with pytest.raises(NotFoundError):
        resolve("getCaseDocument", doctor, {"caseId": cid, "documentId": "nope"})


def test_nurse_can_attach_but_not_remove(bucket, nurse, doctor, sample_intake, seeded_users):
    """She adds referral letters at admission; removing something from the
    record is a clinical decision."""
    cid = _assigned_case(nurse, doctor, sample_intake)
    document_id = _upload(nurse, cid, "referral.txt")["document"]["id"]

    assert resolve("listCaseDocuments", nurse, {"caseId": cid})["documents"]
    with pytest.raises(ForbiddenError):
        resolve("deleteCaseDocument", nurse, {"caseId": cid, "documentId": document_id})

    resolve("deleteCaseDocument", doctor, {"caseId": cid, "documentId": document_id})
    assert resolve("listCaseDocuments", doctor, {"caseId": cid})["documents"] == []


def test_deleting_a_document_drops_it_from_the_ai_context(
    bucket, nurse, doctor, sample_intake, seeded_users
):
    from sehati.db import cases_repo

    cid = _assigned_case(nurse, doctor, sample_intake)
    keep = _upload(doctor, cid, "keep.txt", b"keep this text")["document"]["id"]
    drop = _upload(doctor, cid, "drop.txt", b"drop this text")["document"]["id"]

    resolve("deleteCaseDocument", doctor, {"caseId": cid, "documentId": drop})
    context = cases_repo.get_case(cid, doctor)["documentContext"]
    assert "keep this text" in context
    assert "drop this text" not in context
    assert keep  # the surviving document is still addressable


def test_grounding_context_is_capped(bucket, nurse, doctor, sample_intake, seeded_users, monkeypatch):
    """A thick case folder must not quietly blow out the model's context."""
    from sehati.db import cases_repo

    monkeypatch.setattr(documents_resolver, "_MAX_CONTEXT_CHARS", 500)
    cid = _assigned_case(nurse, doctor, sample_intake)
    for i in range(4):
        _upload(doctor, cid, f"doc{i}.txt", b"x" * 400)

    context = cases_repo.get_case(cid, doctor)["documentContext"]
    assert len(context) <= 500 + 64  # the cap, plus one document's header
    assert len(resolve("listCaseDocuments", doctor, {"caseId": cid})["documents"]) == 4


def test_documents_require_the_documents_permission(bucket, nurse, doctor, sample_intake, seeded_users):
    import dataclasses

    cid = _assigned_case(nurse, doctor, sample_intake)
    stripped = dataclasses.replace(
        doctor, permissions=doctor.permissions - {"documents.manage"}
    )
    with pytest.raises(ForbiddenError):
        _upload(stripped, cid)
    with pytest.raises(ForbiddenError):
        resolve("listCaseDocuments", stripped, {"caseId": cid})


def test_documents_respect_case_isolation(bucket, nurse, doctor, other_doctor, sample_intake, seeded_users):
    cid = _assigned_case(nurse, doctor, sample_intake)
    _upload(doctor, cid)
    with pytest.raises(ForbiddenError):
        resolve("listCaseDocuments", other_doctor, {"caseId": cid})
