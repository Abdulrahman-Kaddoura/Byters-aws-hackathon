"""Admin panel resolvers — user + custom permission-group management.

Every resolver here requires the ``users.manage`` permission (granted to the
"Administrator" system group by default; see ``permissions.py``). This is a
fine-grained permission check like any other, not a special-cased "is this
person in the Cognito admin group" — an admin could, in principle, later
delegate user management to a non-"admin" Cognito-role user by granting them
this one permission, without granting them clinical-staff access.
"""

from __future__ import annotations

from typing import Any

from .. import cognito_admin
from ..context import AuthContext
from ..db import groups_repo, users_repo
from ..errors import ValidationError
from ..models import GROUP_ADMIN, GROUP_COMPLIANCE, GROUP_PATIENT, GROUP_PHYSICIAN
from ..permissions import PERMISSION_LABELS, PERMISSIONS, SYSTEM_GROUPS

_COGNITO_GROUPS = frozenset({GROUP_PATIENT, GROUP_PHYSICIAN, GROUP_ADMIN, GROUP_COMPLIANCE})


# --- Users --------------------------------------------------------------
def list_users(ctx: AuthContext, args: dict[str, Any]) -> list[dict[str, Any]]:
    ctx.require_permission("users.manage")
    return users_repo.list_users()


def get_user(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    ctx.require_permission("users.manage")
    return users_repo.get_user(_require(args, "sub"))


def create_user(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    """Provision a hospital account: creates the Cognito identity (with a
    generated temporary password, shown once) and the app-level permission
    record in one step."""
    ctx.require_permission("users.manage")
    username = _require(args, "username")
    email = _require(args, "email")
    cognito_group = _require(args, "cognitoGroup")
    name = args.get("name", "")
    if cognito_group not in _COGNITO_GROUPS:
        raise ValidationError(f"cognitoGroup must be one of {sorted(_COGNITO_GROUPS)}.")
    custom_groups = args.get("customGroups") or [SYSTEM_GROUPS[cognito_group]["id"]]

    sub, temp_password = cognito_admin.create_user(username=username, email=email, name=name)
    cognito_admin.add_to_group(username, cognito_group)

    user = users_repo.create_user(
        sub=sub,
        username=username,
        email=email,
        name=name,
        cognito_group=cognito_group,
        custom_groups=custom_groups,
    )
    return {"user": user, "temporaryPassword": temp_password}


def update_user(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    ctx.require_permission("users.manage")
    sub = _require(args, "sub")
    existing = users_repo.get_user(sub)

    cognito_group = args.get("cognitoGroup")
    if cognito_group is not None and cognito_group != existing["cognitoGroup"]:
        if cognito_group not in _COGNITO_GROUPS:
            raise ValidationError(f"cognitoGroup must be one of {sorted(_COGNITO_GROUPS)}.")
        cognito_admin.remove_from_group(existing["username"], existing["cognitoGroup"])
        cognito_admin.add_to_group(existing["username"], cognito_group)

    status = args.get("status")
    if status is not None and status != existing.get("status"):
        if status == "disabled":
            cognito_admin.disable_user(existing["username"])
        elif status == "active":
            cognito_admin.enable_user(existing["username"])

    return users_repo.update_user(
        sub,
        cognito_group=cognito_group,
        custom_groups=args.get("customGroups"),
        permission_overrides=args.get("permissionOverrides"),
        status=status,
    )


# --- Custom permission groups --------------------------------------------
def list_groups(ctx: AuthContext, args: dict[str, Any]) -> list[dict[str, Any]]:
    ctx.require_permission("users.manage")
    return groups_repo.list_groups()


def create_group(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    ctx.require_permission("users.manage")
    return groups_repo.create_group(
        name=_require(args, "name"),
        description=args.get("description", ""),
        permissions=args.get("permissions") or [],
    )


def update_group(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    ctx.require_permission("users.manage")
    return groups_repo.update_group(
        _require(args, "id"),
        name=args.get("name"),
        description=args.get("description"),
        permissions=args.get("permissions"),
    )


def delete_group(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    ctx.require_permission("users.manage")
    groups_repo.delete_group(_require(args, "id"))
    return {"deleted": True}


# --- Catalog ---------------------------------------------------------------
def list_permissions(ctx: AuthContext, args: dict[str, Any]) -> list[dict[str, str]]:
    ctx.require_permission("users.manage")
    return [{"key": key, "label": PERMISSION_LABELS[key]} for key in PERMISSIONS]


def _require(args: dict[str, Any], key: str) -> Any:
    val = args.get(key)
    if val in (None, ""):
        raise ValidationError(f"Missing required argument '{key}'.")
    return val
