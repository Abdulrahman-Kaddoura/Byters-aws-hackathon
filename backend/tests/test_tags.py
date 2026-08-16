"""Private per-doctor case tags.

Tags live on the *user* record rather than the case, so privacy is structural:
there is no payload in which one doctor's labels could appear to another.
"""

import pytest

from sehati.db import users_repo
from sehati.errors import ForbiddenError, ValidationError
from sehati.router import resolve


def _assigned_case(nurse, doctor, sample_intake) -> str:
    case = resolve("submitIntake", nurse, sample_intake)
    resolve("assignCase", nurse, {"caseId": case["id"], "doctorId": doctor.sub})
    return case["id"]


def test_tags_round_trip_through_me(aws, nurse, doctor, sample_intake, seeded_users):
    cid = _assigned_case(nurse, doctor, sample_intake)

    result = resolve("setCaseTags", doctor, {"caseId": cid, "tags": ["follow up monday", "complex"]})
    assert result == {"caseId": cid, "tags": ["follow up monday", "complex"]}

    assert resolve("me", doctor, {})["caseTags"] == {cid: ["follow up monday", "complex"]}


def test_tags_are_private_to_each_doctor(
    aws, nurse, doctor, other_doctor, sample_intake, seeded_users
):
    cid = _assigned_case(nurse, doctor, sample_intake)
    resolve("setCaseTags", doctor, {"caseId": cid, "tags": ["teaching case"]})

    # The other doctor's own view carries nothing, and the stored case is clean.
    assert resolve("me", other_doctor, {})["caseTags"] == {}
    from sehati.db import cases_repo

    assert "tags" not in cases_repo.get_case(cid, doctor)


def test_clearing_tags_removes_the_entry(aws, nurse, doctor, sample_intake, seeded_users):
    cid = _assigned_case(nurse, doctor, sample_intake)
    resolve("setCaseTags", doctor, {"caseId": cid, "tags": ["temp"]})
    resolve("setCaseTags", doctor, {"caseId": cid, "tags": []})

    assert resolve("me", doctor, {})["caseTags"] == {}


def test_tags_are_trimmed_deduplicated_and_bounded(aws, nurse, doctor, sample_intake, seeded_users):
    cid = _assigned_case(nurse, doctor, sample_intake)

    result = resolve("setCaseTags", doctor, {
        "caseId": cid, "tags": ["  urgent  ", "urgent", "", "x" * 60],
    })
    assert result["tags"][0] == "urgent"
    assert result["tags"].count("urgent") == 1
    assert len(result["tags"][1]) == 40  # long labels are truncated, not rejected

    with pytest.raises(ValidationError):
        resolve("setCaseTags", doctor, {"caseId": cid, "tags": [f"t{i}" for i in range(11)]})
    with pytest.raises(ValidationError):
        resolve("setCaseTags", doctor, {"caseId": cid, "tags": "not-a-list"})


def test_you_can_only_tag_a_case_you_can_see(
    aws, nurse, doctor, other_doctor, sample_intake, seeded_users
):
    cid = _assigned_case(nurse, doctor, sample_intake)
    with pytest.raises(ForbiddenError):
        resolve("setCaseTags", other_doctor, {"caseId": cid, "tags": ["sneaky"]})


def test_me_reflects_role_and_permissions(aws, doctor, seeded_users):
    identity = resolve("me", doctor, {})

    assert identity["sub"] == doctor.sub
    assert identity["role"] == "doctor"
    assert identity["permissions"] == sorted(doctor.permissions)
    assert "users.manage" not in identity["permissions"]


def test_me_survives_a_missing_user_record(aws, doctor):
    """A token that authenticates but has no provisioned record still gets a
    usable (empty) answer rather than an error."""
    identity = resolve("me", doctor, {})
    assert identity["role"] == "doctor"
    assert identity["caseTags"] == {}
    assert users_repo.find_user(doctor.sub) is None
