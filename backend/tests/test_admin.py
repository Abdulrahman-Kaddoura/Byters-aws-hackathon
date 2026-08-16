"""Admin panel: user provisioning, custom permission groups, and the
end-to-end enforcement of the fine-grained permission system that replaced
the old hardcoded role checks."""

from __future__ import annotations

import json

import pytest

from sehati.db import groups_repo, users_repo
from sehati.errors import ConflictError, ForbiddenError, NotFoundError, ValidationError
from sehati.handler import handler
from sehati.models import SUPER_ADMIN_USERNAME
from sehati.permissions import PERMISSIONS, SYSTEM_GROUPS
from sehati.router import resolve


def _seed_system_groups() -> None:
    for spec in SYSTEM_GROUPS.values():
        groups_repo.create_group(
            name=spec["name"], description=spec["description"],
            permissions=list(spec["permissions"]), group_id=spec["id"], is_system=True,
        )


# --- Access control on the admin endpoints themselves -----------------------
def test_non_admin_cannot_manage_users(aws, doctor):
    with pytest.raises(ForbiddenError):
        resolve("adminListUsers", doctor, {})
    with pytest.raises(ForbiddenError):
        resolve("adminCreateUser", doctor, {"username": "x", "email": "x@example.com", "cognitoGroup": "nurse"})
    with pytest.raises(ForbiddenError):
        resolve("adminListGroups", doctor, {})
    with pytest.raises(ForbiddenError):
        resolve("adminCreateGroup", doctor, {"name": "x"})


# --- User provisioning ------------------------------------------------------
def test_admin_create_user_provisions_cognito_and_record(cognito_pool, admin):
    _seed_system_groups()
    result = resolve(
        "adminCreateUser", admin,
        {"username": "dr.new", "email": "new@example.com", "cognitoGroup": "doctor", "name": "Dr New"},
    )
    user = result["user"]
    assert user["username"] == "dr.new"
    assert user["cognitoGroup"] == "doctor"
    assert user["customGroups"] == ["system-doctor"]
    assert len(result["temporaryPassword"]) >= 12

    idp, pool_id = cognito_pool["idp"], cognito_pool["pool_id"]
    cog_user = idp.admin_get_user(UserPoolId=pool_id, Username="dr.new")
    assert cog_user["UserStatus"] == "FORCE_CHANGE_PASSWORD"
    groups = [g["GroupName"] for g in idp.admin_list_groups_for_user(UserPoolId=pool_id, Username="dr.new")["Groups"]]
    assert groups == ["doctor"]

    # First sign-in with the temp password must force a permanent-password change.
    auth = idp.admin_initiate_auth(
        UserPoolId=pool_id, ClientId=cognito_pool["client_id"], AuthFlow="ADMIN_NO_SRP_AUTH",
        AuthParameters={"USERNAME": "dr.new", "PASSWORD": result["temporaryPassword"]},
    )
    assert auth["ChallengeName"] == "NEW_PASSWORD_REQUIRED"


def test_admin_create_user_duplicate_username_conflicts(cognito_pool, admin):
    _seed_system_groups()
    resolve("adminCreateUser", admin, {"username": "dup", "email": "a@example.com", "cognitoGroup": "nurse"})
    with pytest.raises(ConflictError):
        resolve("adminCreateUser", admin, {"username": "dup", "email": "b@example.com", "cognitoGroup": "nurse"})


def test_admin_update_user_changes_role_and_status(cognito_pool, admin):
    _seed_system_groups()
    created = resolve(
        "adminCreateUser", admin, {"username": "u1", "email": "u1@example.com", "cognitoGroup": "nurse"}
    )["user"]

    updated = resolve("adminUpdateUser", admin, {"sub": created["sub"], "cognitoGroup": "doctor", "status": "disabled"})
    assert updated["cognitoGroup"] == "doctor"
    assert updated["status"] == "disabled"

    idp, pool_id = cognito_pool["idp"], cognito_pool["pool_id"]
    groups = [g["GroupName"] for g in idp.admin_list_groups_for_user(UserPoolId=pool_id, Username="u1")["Groups"]]
    assert groups == ["doctor"]
    assert idp.admin_get_user(UserPoolId=pool_id, Username="u1")["Enabled"] is False


# --- Effective permission computation (group union + per-user overrides) ---
def test_permission_override_grants_and_revokes(aws):
    _seed_system_groups()
    users_repo.create_user(
        sub="s1", username="nurse1", email="n@example.com",
        cognito_group="nurse", custom_groups=["system-nurse"],
    )
    granted = users_repo.update_user("s1", permission_overrides={"cases.add_note": True})
    assert "cases.add_note" in users_repo.effective_permissions(granted)

    users_repo.create_user(
        sub="s2", username="doc2", email="d2@example.com",
        cognito_group="doctor", custom_groups=["system-doctor"],
    )
    revoked = users_repo.update_user("s2", permission_overrides={"final_diagnosis.accept": False})
    perms = users_repo.effective_permissions(revoked)
    assert "final_diagnosis.accept" not in perms
    assert "cases.manage_state" in perms  # unrelated permission unaffected


# --- Custom groups CRUD ------------------------------------------------------
def test_group_crud_and_system_group_delete_guard(aws, admin):
    created = resolve(
        "adminCreateGroup", admin,
        {"name": "Triage Nurse", "description": "", "permissions": ["cases.add_note", "exams.manage"]},
    )
    assert sorted(created["permissions"]) == ["cases.add_note", "exams.manage"]

    updated = resolve("adminUpdateGroup", admin, {"id": created["id"], "permissions": ["cases.add_note"]})
    assert updated["permissions"] == ["cases.add_note"]

    resolve("adminDeleteGroup", admin, {"id": created["id"]})
    with pytest.raises(NotFoundError):
        groups_repo.get_group(created["id"])

    groups_repo.create_group(name="Doctor", permissions=[], group_id="system-doctor", is_system=True)
    with pytest.raises(ConflictError):
        resolve("adminDeleteGroup", admin, {"id": "system-doctor"})


def test_list_permissions_matches_catalog(aws, admin):
    result = resolve("adminListPermissions", admin, {})
    assert {p["key"] for p in result} == set(PERMISSIONS)


# --- End-to-end: a restrictive custom group actually blocks the handler ----
def _event(method, resource, *, path_params=None, body=None, sub, username, role="doctor"):
    return {
        "httpMethod": method,
        "resource": resource,
        "pathParameters": path_params,
        "queryStringParameters": None,
        "body": json.dumps(body) if body is not None else None,
        "requestContext": {
            "authorizer": {
                "claims": {"sub": sub, "cognito:username": username, "cognito:groups": role}
            }
        },
    }


def test_custom_group_restricts_access_end_to_end(cognito_pool, admin, nurse, sample_intake, seeded_users):
    """A doctor whose custom group grants only note-taking can add a note but
    not drive the differential — the coarse Cognito role grants nothing by
    itself once the fine-grained system is wired in."""
    case = resolve("submitIntake", nurse, sample_intake)

    limited_group = resolve(
        "adminCreateGroup", admin,
        {"name": "Locum", "permissions": ["cases.add_note", "cases.view_clinical"]},
    )
    locum = resolve(
        "adminCreateUser", admin,
        {
            "username": "dr.locum",
            "email": "locum@example.com",
            "cognitoGroup": "doctor",
            "customGroups": [limited_group["id"]],
        },
    )["user"]
    # Assignment is what lets any doctor reach the case at all.
    resolve("assignCase", nurse, {"caseId": case["id"], "doctorId": locum["sub"]})

    # Granted: adding a note (cases.add_note is on the Locum group).
    resp = handler(_event(
        "POST", "/cases/{caseId}/notes", path_params={"caseId": case["id"]},
        body={"text": "Vitals stable"}, sub=locum["sub"], username="dr.locum",
    ))
    assert resp["statusCode"] == 200

    # Denied: generating the differential (diagnoses.manage is NOT on that group).
    resp2 = handler(_event(
        "POST", "/cases/{caseId}/diagnoses", path_params={"caseId": case["id"]},
        sub=locum["sub"], username="dr.locum",
    ))
    assert resp2["statusCode"] == 403
    assert json.loads(resp2["body"])["errorType"] == "Forbidden"


def test_me_reports_the_same_permissions_the_server_enforces(
    cognito_pool, admin, nurse, seeded_users
):
    """The frontend gates on /me. If it could disagree with what the resolvers
    enforce, we would be back to the bug where every account saw the admin
    panel — so assert the two agree."""
    created = resolve(
        "adminCreateUser", admin,
        {"username": "nurse.new", "email": "nn@example.com", "cognitoGroup": "nurse"},
    )["user"]

    resp = handler(_event("GET", "/me", sub=created["sub"], username="nurse.new", role="nurse"))
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert body["role"] == "nurse"
    assert "users.manage" not in body["permissions"]
    assert "cases.view_clinical" not in body["permissions"]
    assert "cases.create" in body["permissions"]

    # And the panel it does not advertise is genuinely closed to it.
    denied = handler(_event("GET", "/admin/users", sub=created["sub"], username="nurse.new", role="nurse"))
    assert denied["statusCode"] == 403


def test_admin_panel_is_closed_to_a_doctor_end_to_end(cognito_pool, admin, seeded_users):
    """The bug this replaces: /admin was gated in the browser on the JWT group
    while the server gated on a permission, so the two could disagree."""
    created = resolve(
        "adminCreateUser", admin,
        {"username": "dr.plain", "email": "p@example.com", "cognitoGroup": "doctor"},
    )["user"]

    me = json.loads(
        handler(_event("GET", "/me", sub=created["sub"], username="dr.plain"))["body"]
    )
    assert "users.manage" not in me["permissions"]

    for method, resource in (
        ("GET", "/admin/users"),
        ("GET", "/admin/groups"),
        ("GET", "/admin/settings"),
    ):
        resp = handler(_event(method, resource, sub=created["sub"], username="dr.plain"))
        assert resp["statusCode"] == 403, f"{method} {resource} should be forbidden"


# --- Super admin lockout protection ------------------------------------------
def test_super_admin_cannot_be_demoted_disabled_or_stripped(cognito_pool, admin):
    _seed_system_groups()
    created = resolve(
        "adminCreateUser", admin,
        {"username": SUPER_ADMIN_USERNAME, "email": "super@example.com", "cognitoGroup": "admin"},
    )["user"]
    assert created["isSuperAdmin"] is True

    with pytest.raises(ValidationError):
        resolve("adminUpdateUser", admin, {"sub": created["sub"], "cognitoGroup": "doctor"})
    with pytest.raises(ValidationError):
        resolve("adminUpdateUser", admin, {"sub": created["sub"], "status": "disabled"})
    with pytest.raises(ValidationError):
        resolve("adminUpdateUser", admin, {"sub": created["sub"], "customGroups": []})
    with pytest.raises(ValidationError):
        resolve("adminUpdateUser", admin, {"sub": created["sub"], "permissionOverrides": {"users.manage": False}})

    # Unrelated updates still go through, and a normal user isn't flagged.
    updated = resolve(
        "adminUpdateUser", admin, {"sub": created["sub"], "permissionOverrides": {"cases.add_note": True}}
    )
    assert updated["isSuperAdmin"] is True
    other = resolve(
        "adminCreateUser", admin, {"username": "u2", "email": "u2@example.com", "cognitoGroup": "doctor"}
    )["user"]
    assert other["isSuperAdmin"] is False


def test_super_admin_always_has_full_access_even_without_a_user_record(cognito_pool):
    """Simulates a corrupted/missing sehati-users record for the super admin —
    the permission floor in handler.py must still let them into the panel."""
    resp = handler(_event("GET", "/admin/users", sub="ghost-sub", username=SUPER_ADMIN_USERNAME))
    assert resp["statusCode"] == 200
