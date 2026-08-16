"""Data-layer isolation — the DynamoDB analog of Aurora row-level security
(design doc section 10.1). The AI is never the authorization boundary.

Two independent gates are covered here:

* **Which rows** a caller reaches. A doctor reaches only the cases assigned to
  them; assignment is the boundary, not a filter.
* **Which fields** come back. A nurse reaches a case in order to route it, but
  the clinical content is stripped server-side before the payload leaves the
  Lambda — hiding tabs in the browser would not be access control.
"""

import pytest

from sehati.db import cases_repo
from sehati.errors import ForbiddenError, UnauthorizedError
from sehati.router import resolve

# Everything a nurse must never receive about a case.
CLINICAL_FIELDS = (
    "interview",
    "summary",
    "exams",
    "diagnoses",
    "tests",
    "finalDiagnosis",
    "notes",
    "insights",
    "assistantThread",
    "conversations",
    "timeline",
    "documentContext",
)


def _admit(nurse, intake):
    return resolve("submitIntake", nurse, intake)


def _assign(case_id, doctor_sub, nurse, seeded_users):
    return resolve("assignCase", nurse, {"caseId": case_id, "doctorId": doctor_sub})


# --- Row-level access -------------------------------------------------------
def test_doctor_reads_only_cases_assigned_to_them(
    aws, nurse, doctor, other_doctor, sample_intake, seeded_users
):
    case = _admit(nurse, sample_intake)
    _assign(case["id"], doctor.sub, nurse, seeded_users)

    assert resolve("getCase", doctor, {"id": case["id"]})["id"] == case["id"]
    with pytest.raises(ForbiddenError):
        resolve("getCase", other_doctor, {"id": case["id"]})


def test_unassigned_case_is_invisible_to_every_doctor(
    aws, nurse, doctor, other_doctor, sample_intake
):
    case = _admit(nurse, sample_intake)
    for physician in (doctor, other_doctor):
        with pytest.raises(ForbiddenError):
            resolve("getCase", physician, {"id": case["id"]})


def test_doctor_list_contains_only_their_assignments(
    aws, nurse, doctor, other_doctor, sample_intake, seeded_users
):
    mine = _admit(nurse, sample_intake)
    theirs = _admit(nurse, sample_intake)
    _assign(mine["id"], doctor.sub, nurse, seeded_users)
    _assign(theirs["id"], other_doctor.sub, nurse, seeded_users)

    listed = resolve("listCases", doctor, {})
    assert [c["id"] for c in listed] == [mine["id"]]


def test_admin_reads_every_case(aws, nurse, admin, sample_intake):
    case = _admit(nurse, sample_intake)
    assert resolve("getCase", admin, {"id": case["id"]})["id"] == case["id"]


def test_nurse_scope_mine_returns_only_her_own_admissions(
    aws, nurse, other_nurse, sample_intake
):
    mine = _admit(nurse, sample_intake)
    _admit(other_nurse, sample_intake)

    scoped = resolve("listCases", nurse, {"scope": "mine"})
    assert [c["id"] for c in scoped] == [mine["id"]]
    # ...but the whole desk is reachable, so nurses can reassign for each other.
    assert len(resolve("listCases", nurse, {})) == 2


def test_account_with_no_role_reaches_nothing(aws, nurse, sample_intake):
    """An account left behind by the patient/compliance removal authenticates
    but has no role, so every case is out of reach."""
    from sehati.context import AuthContext

    case = _admit(nurse, sample_intake)
    stranded = AuthContext(sub="ghost-1", username="ghost", groups=frozenset())
    with pytest.raises(ForbiddenError):
        resolve("getCase", stranded, {"id": case["id"]})
    assert resolve("listCases", stranded, {}) == []


# --- Field-level redaction --------------------------------------------------
def test_nurse_case_payload_has_no_clinical_content(aws, nurse, sample_intake):
    case = _admit(nurse, sample_intake)
    # The stored record is complete...
    stored = cases_repo.get_case(case["id"], nurse)
    assert stored["interview"], "the interview should exist on the stored case"

    # ...but what the nurse is handed is not.
    projected = cases_repo.project_for_role(stored, nurse)
    for field in CLINICAL_FIELDS:
        assert field not in projected, f"nurse payload leaked '{field}'"
    # She still gets what she needs to do her job.
    assert projected["patient"]["name"] == "Layla Haddad"
    assert projected["vitals"]["heartRate"] == 88
    assert projected["status"]


def test_doctor_case_payload_keeps_clinical_content(
    aws, nurse, doctor, sample_intake, seeded_users
):
    case = _admit(nurse, sample_intake)
    _assign(case["id"], doctor.sub, nurse, seeded_users)
    stored = cases_repo.get_case(case["id"], doctor)
    projected = cases_repo.project_for_role(stored, doctor)
    assert projected["interview"]
    assert "summary" in projected


def test_document_text_never_reaches_any_client(aws, nurse, doctor, sample_intake, seeded_users):
    """Extracted document text is AI grounding, not a client payload — and the
    S3 key is not something a browser should ever see."""
    import base64

    case = _admit(nurse, sample_intake)
    _assign(case["id"], doctor.sub, nurse, seeded_users)
    _make_bucket()
    resolve(
        "uploadCaseDocument",
        doctor,
        {
            "caseId": case["id"],
            "fileBase64": base64.b64encode(b"prior discharge summary").decode(),
            "fileExtension": "txt",
            "fileName": "prior.txt",
        },
    )
    stored = cases_repo.get_case(case["id"], doctor)
    assert stored["documents"][0]["text"], "text is kept server-side for the AI"

    for ctx in (doctor, nurse):
        projected = cases_repo.project_for_role(stored, ctx)
        document = projected["documents"][0]
        assert "text" not in document
        assert "s3Key" not in document
        assert document["name"] == "prior.txt"


# --- Permission gates -------------------------------------------------------
def test_nurse_cannot_touch_the_clinical_workflow(aws, nurse, sample_intake):
    case = _admit(nurse, sample_intake)
    for field in (
        "requestRecommendations",
        "recommendExams",
        "proposeFinalDiagnosis",
        "assistantChat",
    ):
        with pytest.raises(ForbiddenError):
            resolve(field, nurse, {"caseId": case["id"], "question": "why?"})


def test_doctor_cannot_admit_a_patient(aws, doctor, sample_intake):
    """Admission is the nurse's job; a doctor has no cases.create."""
    with pytest.raises(ForbiddenError):
        resolve("submitIntake", doctor, sample_intake)


def test_intake_ownership_comes_from_the_token_not_the_body(aws, nurse, sample_intake):
    """A caller cannot file a case under someone else's identity or pre-assign
    it to a doctor of their choosing."""
    payload = {
        "input": {
            **sample_intake["input"],
            "createdByNurseId": "somebody-else",
            "assignedPhysicianId": "dr-of-my-choosing",
        }
    }
    case = _admit(nurse, payload)
    assert case["createdByNurseId"] == nurse.sub
    assert "assignedPhysicianId" not in case


def test_audit_trail_requires_the_audit_permission(aws, nurse, doctor, admin, sample_intake):
    case = _admit(nurse, sample_intake)
    with pytest.raises(ForbiddenError):
        resolve("caseAudit", nurse, {"id": case["id"]})
    trail = resolve("caseAudit", admin, {"id": case["id"]})
    assert any(e["action"] == "submitIntake" for e in trail)


def test_unauthenticated_identity_rejected():
    from sehati.context import from_apigw_claims

    with pytest.raises(UnauthorizedError):
        from_apigw_claims(None)


def _make_bucket() -> None:
    import os

    import boto3

    os.environ.setdefault("DOCUMENTS_BUCKET", "sehati-documents-test")
    boto3.client("s3", region_name="us-east-1").create_bucket(
        Bucket=os.environ["DOCUMENTS_BUCKET"]
    )
