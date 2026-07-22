"""Data-layer isolation — the DynamoDB analog of Aurora row-level security
(design doc section 10.1). The AI is never the authorization boundary."""

import pytest

from sehati.errors import ForbiddenError, UnauthorizedError
from sehati.router import resolve


def _make_case(patient, intake):
    return resolve("submitIntake", patient, intake)


def test_patient_cannot_read_another_patients_case(aws, patient, other_patient, sample_intake):
    case = _make_case(patient, sample_intake)
    # Owner can read it.
    assert resolve("getCase", patient, {"id": case["id"]})["id"] == case["id"]
    # A different patient cannot.
    with pytest.raises(ForbiddenError):
        resolve("getCase", other_patient, {"id": case["id"]})


def test_clinical_staff_can_read_any_case(aws, patient, physician, sample_intake):
    case = _make_case(patient, sample_intake)
    assert resolve("getCase", physician, {"id": case["id"]})["id"] == case["id"]


def test_patient_list_is_scoped_to_own_cases(aws, patient, other_patient, sample_intake):
    _make_case(patient, sample_intake)
    _make_case(other_patient, sample_intake)
    mine = resolve("listCases", patient, {})
    assert len(mine) == 1
    assert mine[0]["patientId"] == patient.sub


def test_audit_trail_requires_compliance_or_admin(aws, patient, physician, compliance, sample_intake):
    case = _make_case(patient, sample_intake)
    # Physician (not compliance) may not read the audit trail.
    with pytest.raises(ForbiddenError):
        resolve("caseAudit", physician, {"id": case["id"]})
    # Compliance may.
    trail = resolve("caseAudit", compliance, {"id": case["id"]})
    assert any(e["action"] == "submitIntake" for e in trail)


def test_unauthenticated_identity_rejected():
    from sehati.context import from_appsync_identity

    with pytest.raises(UnauthorizedError):
        from_appsync_identity(None)


def test_patient_cannot_request_recommendations(aws, patient, sample_intake):
    case = _make_case(patient, sample_intake)
    with pytest.raises(ForbiddenError):
        resolve("requestRecommendations", patient, {"caseId": case["id"]})
