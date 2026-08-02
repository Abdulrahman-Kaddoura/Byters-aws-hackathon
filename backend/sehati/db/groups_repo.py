"""Custom permission groups — admin-CRUD'd, decoupled from Cognito's 4 groups.

Each group is a name + a set of permission keys drawn from the fixed catalog
in ``permissions.py``. The 4 "system" groups (one per Cognito role) are
seeded by ``scripts/bootstrap-admin.py`` and can have their permissions
edited like any other group, but cannot be deleted — see ``delete_group``.
"""

from __future__ import annotations

import uuid
from typing import Any

from ..errors import ConflictError, NotFoundError, ValidationError
from ..models import now_iso
from ..permissions import is_valid_permission
from . import tables


def list_groups() -> list[dict[str, Any]]:
    items = tables.groups_table().scan().get("Items", [])
    groups = [tables.from_dynamo(i) for i in items]
    groups.sort(key=lambda g: g.get("name", ""))
    return groups


def get_group(group_id: str) -> dict[str, Any]:
    resp = tables.groups_table().get_item(Key={"id": group_id})
    item = resp.get("Item")
    if not item:
        raise NotFoundError(f"Group '{group_id}' not found.")
    return tables.from_dynamo(item)


def create_group(
    *, name: str, description: str = "", permissions: list[str] | None = None, group_id: str | None = None, is_system: bool = False
) -> dict[str, Any]:
    perms = _validate_permissions(permissions or [])
    ts = now_iso()
    group = {
        "id": group_id or f"grp-{uuid.uuid4().hex[:10]}",
        "name": name,
        "description": description,
        "permissions": perms,
        "isSystem": is_system,
        "createdAt": ts,
        "updatedAt": ts,
    }
    tables.groups_table().put_item(Item=tables.to_dynamo(group))
    return group


def update_group(group_id: str, *, name: str | None = None, description: str | None = None, permissions: list[str] | None = None) -> dict[str, Any]:
    group = get_group(group_id)
    if name is not None:
        group["name"] = name
    if description is not None:
        group["description"] = description
    if permissions is not None:
        group["permissions"] = _validate_permissions(permissions)
    group["updatedAt"] = now_iso()
    tables.groups_table().put_item(Item=tables.to_dynamo(group))
    return group


def delete_group(group_id: str) -> None:
    group = get_group(group_id)
    if group.get("isSystem"):
        raise ConflictError("System groups cannot be deleted; edit their permissions instead.")
    tables.groups_table().delete_item(Key={"id": group_id})


def _validate_permissions(permissions: list[str]) -> list[str]:
    for perm in permissions:
        if not is_valid_permission(perm):
            raise ValidationError(f"Unknown permission '{perm}'.")
    return sorted(set(permissions))
