"""Hospital-provisioned user records — the app-level companion to a Cognito
identity: which custom permission groups (see ``groups_repo``) a user
belongs to, plus any per-user permission overrides.

Cognito remains the identity store (sign-in, password, the coarse
patient/physician/admin/compliance group). This table never duplicates that;
it's keyed by the Cognito ``sub`` and only carries what Cognito has no
concept of.
"""

from __future__ import annotations

from typing import Any

from ..errors import NotFoundError, ValidationError
from ..models import now_iso
from ..permissions import is_valid_permission
from . import groups_repo, tables


def list_users() -> list[dict[str, Any]]:
    items = tables.users_table().scan().get("Items", [])
    users = [tables.from_dynamo(i) for i in items]
    users.sort(key=lambda u: u.get("username", ""))
    return users


def get_user(sub: str) -> dict[str, Any]:
    resp = tables.users_table().get_item(Key={"sub": sub})
    item = resp.get("Item")
    if not item:
        raise NotFoundError(f"User '{sub}' not found.")
    return tables.from_dynamo(item)


def find_user(sub: str) -> dict[str, Any] | None:
    """Like :func:`get_user` but returns ``None`` instead of raising — used
    by the request-time permission-enrichment step, where a missing record
    (identity not yet provisioned in this table) should fail closed rather
    than error the whole request."""
    resp = tables.users_table().get_item(Key={"sub": sub})
    item = resp.get("Item")
    return tables.from_dynamo(item) if item else None


def create_user(
    *,
    sub: str,
    username: str,
    email: str,
    name: str = "",
    cognito_group: str,
    custom_groups: list[str],
    permission_overrides: dict[str, bool] | None = None,
    status: str = "active",
) -> dict[str, Any]:
    _validate_custom_groups(custom_groups)
    overrides = _validate_overrides(permission_overrides or {})
    ts = now_iso()
    user = {
        "sub": sub,
        "username": username,
        "email": email,
        "name": name,
        "cognitoGroup": cognito_group,
        "customGroups": custom_groups,
        "permissionOverrides": overrides,
        "status": status,
        "createdAt": ts,
        "updatedAt": ts,
    }
    tables.users_table().put_item(Item=tables.to_dynamo(user))
    return user


def update_user(
    sub: str,
    *,
    cognito_group: str | None = None,
    custom_groups: list[str] | None = None,
    permission_overrides: dict[str, bool] | None = None,
    status: str | None = None,
) -> dict[str, Any]:
    user = get_user(sub)
    if cognito_group is not None:
        user["cognitoGroup"] = cognito_group
    if custom_groups is not None:
        _validate_custom_groups(custom_groups)
        user["customGroups"] = custom_groups
    if permission_overrides is not None:
        user["permissionOverrides"] = _validate_overrides(permission_overrides)
    if status is not None:
        if status not in ("active", "disabled"):
            raise ValidationError("status must be 'active' or 'disabled'.")
        user["status"] = status
    user["updatedAt"] = now_iso()
    tables.users_table().put_item(Item=tables.to_dynamo(user))
    return user


def effective_permissions(user: dict[str, Any]) -> frozenset[str]:
    """Union of the user's custom groups' permissions, with per-user
    overrides applied on top (``True`` grants, ``False`` revokes,
    irrespective of group membership)."""
    granted: set[str] = set()
    for group_id in user.get("customGroups", []):
        try:
            granted.update(groups_repo.get_group(group_id).get("permissions", []))
        except NotFoundError:
            continue  # a since-deleted group; ignore rather than fail the request
    for perm, allowed in user.get("permissionOverrides", {}).items():
        if allowed:
            granted.add(perm)
        else:
            granted.discard(perm)
    return frozenset(granted)


def _validate_custom_groups(custom_groups: list[str]) -> None:
    for group_id in custom_groups:
        groups_repo.get_group(group_id)  # raises NotFoundError if missing


def _validate_overrides(overrides: dict[str, bool]) -> dict[str, bool]:
    for perm in overrides:
        if not is_valid_permission(perm):
            raise ValidationError(f"Unknown permission '{perm}'.")
    return dict(overrides)
