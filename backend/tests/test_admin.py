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
def test_non_admin_cannot_manage_users(aws, physician):
    with pytest.raises(ForbiddenError):
        resolve("adminListUsers", physician, {})
    with pytest.raises(ForbiddenError):
        resolve("adminCreateUser", physician, {"username": "x", "email": "x@example.com", "cognitoGroup": "patient"})
    with pytest.raises(ForbiddenError):
        resolve("adminListGroups", physician, {})
    with pytest.raises(ForbiddenError):
        resolve("adminCreateGroup", physician, {"name": "x"})


# --- User provisioning ------------------------------------------------------
def test_admin_create_user_provisions_cognito_and_record(cognito_pool, admin):
    _seed_system_groups()
    result = resolve(
        "adminCreateUser", admin,
        {"username": "dr.new", "email": "new@example.com", "cognitoGroup": "physician", "name": "Dr New"},
    )
    user = result["user"]
    assert user["username"] == "dr.new"
    assert user["cognitoGroup"] == "physician"
    assert user["customGroups"] == ["system-physician"]
    assert len(result["temporaryPassword"]) >= 12

    idp, pool_id = cognito_pool["idp"], cognito_pool["pool_id"]
    cog_user = idp.admin_get_user(UserPoolId=pool_id, Username="dr.new")
    assert cog_user["UserStatus"] == "FORCE_CHANGE_PASSWORD"
    groups = [g["GroupName"] for g in idp.admin_list_groups_for_user(UserPoolId=pool_id, Username="dr.new")["Groups"]]
    assert groups == ["physician"]

    # First sign-in with the temp password must force a permanent-password change.
    auth = idp.admin_initiate_auth(
        UserPoolId=pool_id, ClientId=cognito_pool["client_id"], AuthFlow="ADMIN_NO_SRP_AUTH",
        AuthParameters={"USERNAME": "dr.new", "PASSWORD": result["temporaryPassword"]},
    )
    assert auth["ChallengeName"] == "NEW_PASSWORD_REQUIRED"


def test_admin_create_user_duplicate_username_conflicts(cognito_pool, admin):
    _seed_system_groups()
    resolve("adminCreateUser", admin, {"username": "dup", "email": "a@example.com", "cognitoGroup": "patient"})
    with pytest.raises(ConflictError):
        resolve("adminCreateUser", admin, {"username": "dup", "email": "b@example.com", "cognitoGroup": "patient"})


def test_admin_update_user_changes_role_and_status(cognito_pool, admin):
    _seed_system_groups()
    created = resolve(
        "adminCreateUser", admin, {"username": "u1", "email": "u1@example.com", "cognitoGroup": "patient"}
    )["user"]

    updated = resolve("adminUpdateUser", admin, {"sub": created["sub"], "cognitoGroup": "physician", "status": "disabled"})
    assert updated["cognitoGroup"] == "physician"
    assert updated["status"] == "disabled"

    idp, pool_id = cognito_pool["idp"], cognito_pool["pool_id"]
    groups = [g["GroupName"] for g in idp.admin_list_groups_for_user(UserPoolId=pool_id, Username="u1")["Groups"]]
    assert groups == ["physician"]
    assert idp.admin_get_user(UserPoolId=pool_id, Username="u1")["Enabled"] is False


# --- Effective permission computation (group union + per-user overrides) ---
def test_permission_override_grants_and_revokes(aws):
    _seed_system_groups()
    nurse = users_repo.create_user(
        sub="s1", username="nurse", email="n@example.com",
        cognito_group="patient", custom_groups=["system-patient"],
    )
    granted = users_repo.update_user("s1", permission_overrides={"cases.add_note": True})
    assert "cases.add_note" in users_repo.effective_permissions(granted)

    physician_user = users_repo.create_user(
        sub="s2", username="doc2", email="d2@example.com",
        cognito_group="physician", custom_groups=["system-physician"],
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

    groups_repo.create_group(name="Physician", permissions=[], group_id="system-physician", is_system=True)
    with pytest.raises(ConflictError):
        resolve("adminDeleteGroup", admin, {"id": "system-physician"})


def test_list_permissions_matches_catalog(aws, admin):
    result = resolve("adminListPermissions", admin, {})
    assert {p["key"] for p in result} == set(PERMISSIONS)


# --- End-to-end: a restrictive custom group actually blocks the handler ----
def _event(method, resource, *, path_params=None, body=None, sub, username):
    return {
        "httpMethod": method,
        "resource": resource,
        "pathParameters": path_params,
        "queryStringParameters": None,
        "body": json.dumps(body) if body is not None else None,
        "requestContext": {
            "authorizer": {
                "claims": {"sub": sub, "cognito:username": username, "cognito:groups": "physician"}
            }
        },
    }


def test_custom_group_restricts_access_end_to_end(cognito_pool, admin, physician, sample_intake):
    _seed_system_groups()
    case = resolve("submitIntake", physician, sample_intake)

    triage = resolve("adminCreateGroup", admin, {"name": "Triage Nurse", "permissions": ["cases.add_note"]})
    nurse = resolve(
        "adminCreateUser", admin,
        {"username": "nurse1", "email": "nurse1@example.com", "cognitoGroup": "physician", "customGroups": [triage["id"]]},
    )["user"]

    # Granted: adding a note (cases.add_note is on the Triage Nurse group).
    resp = handler(_event(
        "POST", "/cases/{caseId}/notes", path_params={"caseId": case["id"]},
        body={"text": "Vitals stable"}, sub=nurse["sub"], username="nurse1",
    ))
    assert resp["statusCode"] == 200

    # Denied: generating the differential (diagnoses.manage is NOT on that group),
    # even though this user's Cognito role is "physician" — the coarse role no
    # longer grants clinical actions by itself once the fine-grained system is wired in.
    resp2 = handler(_event(
        "POST", "/cases/{caseId}/diagnoses", path_params={"caseId": case["id"]},
        sub=nurse["sub"], username="nurse1",
    ))
    assert resp2["statusCode"] == 403
    assert json.loads(resp2["body"])["errorType"] == "Forbidden"


# --- Super admin lockout protection ------------------------------------------
def test_super_admin_cannot_be_demoted_disabled_or_stripped(cognito_pool, admin):
    _seed_system_groups()
    created = resolve(
        "adminCreateUser", admin,
        {"username": SUPER_ADMIN_USERNAME, "email": "super@example.com", "cognitoGroup": "admin"},
    )["user"]
    assert created["isSuperAdmin"] is True

    with pytest.raises(ValidationError):
        resolve("adminUpdateUser", admin, {"sub": created["sub"], "cognitoGroup": "physician"})
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
        "adminCreateUser", admin, {"username": "u2", "email": "u2@example.com", "cognitoGroup": "physician"}
    )["user"]
    assert other["isSuperAdmin"] is False


def test_super_admin_always_has_full_access_even_without_a_user_record(cognito_pool):
    """Simulates a corrupted/missing sehati-users record for the super admin —
    the permission floor in handler.py must still let them into the panel."""
    resp = handler(_event("GET", "/admin/users", sub="ghost-sub", username=SUPER_ADMIN_USERNAME))
    assert resp["statusCode"] == 200
