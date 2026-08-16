"""The caller's own identity, role and effective permissions.

This exists so the frontend can gate on exactly what the backend gates on. It
used to guess from the JWT's ``cognito:groups`` claim while every resolver
checked an admin-editable permission key instead, so the two could — and did —
disagree in both directions: users locked out of a panel the server would have
allowed, and users shown a panel that then 403'd on every request.
"""

from __future__ import annotations

from typing import Any

from ..context import AuthContext
from ..db import users_repo


def me(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    user = users_repo.find_user(ctx.sub)
    return {
        "sub": ctx.sub,
        "username": ctx.username,
        "name": (user or {}).get("name") or "",
        "email": (user or {}).get("email") or ctx.claims.get("email") or "",
        # The role comes from the verified token, not the user record: the
        # token is what the API Gateway authorizer validated.
        "role": ctx.role,
        # Sorted so the payload is stable between requests and diffs cleanly.
        "permissions": sorted(ctx.permissions),
        "caseTags": (user or {}).get("caseTags") or {},
    }
