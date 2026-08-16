"""Routing a case from the admissions desk to one doctor.

Assignment is the access boundary (see ``test_isolation.py``), so who may set
it, and what it may be set to, is a security question rather than a convenience.
"""

import pytest

from sehati.errors import ForbiddenError, ValidationError
from sehati.router import resolve


def _admit(nurse, sample_intake):
    return resolve("submitIntake", nurse, sample_intake)


def test_nurse_assigns_a_case_to_a_doctor(aws, nurse, doctor, sample_intake, seeded_users):
    case = _admit(nurse, sample_intake)
    assigned = resolve("assignCase", nurse, {"caseId": case["id"], "doctorId": doctor.sub})

    assert assigned["assignedPhysicianId"] == doctor.sub
    assert assigned["assignedBy"] == nurse.sub
    assert assigned["assignedAt"]
    assert any("assigned to" in e["title"] for e in assigned["timeline"])


def test_assignment_requires_the_assign_permission(aws, nurse, doctor, sample_intake, seeded_users):
    case = _admit(nurse, sample_intake)
    resolve("assignCase", nurse, {"caseId": case["id"], "doctorId": doctor.sub})
    # A doctor may not hand their own case to a colleague.
    with pytest.raises(ForbiddenError):
        resolve("assignCase", doctor, {"caseId": case["id"], "doctorId": doctor.sub})


def test_a_case_can_only_be_assigned_to_a_doctor(aws, nurse, other_nurse, sample_intake, seeded_users):
    case = _admit(nurse, sample_intake)
    with pytest.raises(ValidationError):
        resolve("assignCase", nurse, {"caseId": case["id"], "doctorId": other_nurse.sub})
    with pytest.raises(ValidationError):
        resolve("assignCase", nurse, {"caseId": case["id"], "doctorId": "nobody"})


def test_a_disabled_doctor_cannot_be_assigned(aws, nurse, doctor, sample_intake, seeded_users):
    from sehati.db import users_repo

    users_repo.update_user(doctor.sub, status="disabled")
    case = _admit(nurse, sample_intake)
    with pytest.raises(ValidationError):
        resolve("assignCase", nurse, {"caseId": case["id"], "doctorId": doctor.sub})


def test_any_nurse_can_reassign_and_it_is_audited(
    aws, nurse, other_nurse, doctor, other_doctor, sample_intake, seeded_users
):
    from sehati.db import audit_repo

    case = _admit(nurse, sample_intake)
    resolve("assignCase", nurse, {"caseId": case["id"], "doctorId": doctor.sub})
    # A different nurse rebalances the queue.
    moved = resolve("assignCase", other_nurse, {"caseId": case["id"], "doctorId": other_doctor.sub})
    assert moved["assignedPhysicianId"] == other_doctor.sub

    from sehati.context import AuthContext

    auditor = AuthContext(
        sub="admin-1", username="admin", groups=frozenset({"admin"}),
        permissions=frozenset({"audit.view"}),
    )
    trail = [e for e in audit_repo.list_for_case(case["id"], auditor) if e["action"] == "assignCase"]
    assert len(trail) == 2
    assert trail[-1]["output"]["previousDoctorId"] == doctor.sub

    # The reassignment actually moves access, in both directions.
    assert resolve("getCase", other_doctor, {"id": case["id"]})["id"] == case["id"]
    with pytest.raises(ForbiddenError):
        resolve("getCase", doctor, {"id": case["id"]})


def test_doctor_picker_lists_only_active_doctors(aws, nurse, seeded_users):
    from sehati.db import users_repo

    doctors = resolve("listDoctors", nurse, {})
    assert {d["sub"] for d in doctors} == {"dr-karim", "dr-nabil"}
    # Names only — the picker is not a staff directory.
    assert all(set(d) == {"sub", "name"} for d in doctors)

    users_repo.update_user("dr-nabil", status="disabled")
    assert {d["sub"] for d in resolve("listDoctors", nurse, {})} == {"dr-karim"}


def test_doctor_cannot_enumerate_colleagues(aws, doctor, seeded_users):
    with pytest.raises(ForbiddenError):
        resolve("listDoctors", doctor, {})


def test_ai_assignment_suggestion_is_an_inert_seam(aws, nurse, sample_intake, seeded_users):
    """Documents the placeholder so the future feature has a home: it returns
    None today and the nurse's explicit choice is what takes effect."""
    from sehati.resolvers.cases import suggest_assignee

    case = _admit(nurse, sample_intake)
    assert suggest_assignee(case, resolve("listDoctors", nurse, {})) is None
