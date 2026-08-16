"""Authorization context — the caller's verified identity.

API Gateway's Cognito authorizer validates the caller's ID token *before* the
Lambda runs and passes the verified claims in
``event.requestContext.authorizer.claims``. We never trust anything the
client puts in the request path/query/body for identity; the ``sub`` and
``groups`` come from the signed token only. This object is threaded through
every resolver and every repo call so authorization decisions live in the
data layer (design doc section 10).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from .errors import ForbiddenError, UnauthorizedError
from .models import GROUP_ADMIN, GROUP_DOCTOR, GROUP_NURSE, ROLES


@dataclass(frozen=True)
class AuthContext:
    sub: str
    username: str
    groups: frozenset[str] = field(default_factory=frozenset)
    claims: dict[str, Any] = field(default_factory=dict)
    # Fine-grained permissions from the admin-editable custom-group system
    # (permissions.py / db/users_repo.py), attached by handler.py after
    # from_apigw_claims() via a data-layer lookup — never derived from the
    # JWT itself. Empty until that enrichment step runs (fails closed).
    permissions: frozenset[str] = field(default_factory=frozenset)

    # --- Role predicates (coarse identity — drives row-level security only,
    # not admin-editable; see permissions.py for the fine-grained system).
    #
    # There is deliberately no "is_clinical_staff" catch-all. That property was
    # what made "any clinician can read any case" the default; every call site
    # now has to name the role it means.
    @property
    def is_doctor(self) -> bool:
        return GROUP_DOCTOR in self.groups

    @property
    def is_nurse(self) -> bool:
        return GROUP_NURSE in self.groups

    @property
    def is_admin(self) -> bool:
        return GROUP_ADMIN in self.groups

    @property
    def role(self) -> str | None:
        """The caller's single role, or None if their token carries no known
        group (e.g. an account left behind by the patient/compliance removal —
        it authenticates fine but can reach nothing)."""
        for role in ROLES:
            if role in self.groups:
                return role
        return None

    # --- Fine-grained permissions (admin-editable custom groups) ---
    def has_permission(self, permission: str) -> bool:
        return permission in self.permissions

    def require_permission(self, permission: str) -> None:
        if not self.has_permission(permission):
            raise ForbiddenError(f"This action requires the '{permission}' permission.")


def from_apigw_claims(claims: dict[str, Any] | None) -> AuthContext:
    """Build an :class:`AuthContext` from API Gateway's authorizer claims.

    A ``COGNITO_USER_POOLS`` authorizer places the verified JWT claims at
    ``event.requestContext.authorizer.claims``. Array claims (like
    ``cognito:groups``) get flattened to a string by API Gateway — either
    comma-joined or space-joined inside brackets (e.g. ``"[doctor admin]"``)
    depending on how the token was issued — so both are handled here.
    """
    if not claims:
        raise UnauthorizedError("Request is not authenticated.")

    sub = claims.get("sub")
    if not sub:
        raise UnauthorizedError("Identity is missing a subject.")

    groups: set[str] = set()
    raw_groups = claims.get("cognito:groups")
    if isinstance(raw_groups, list):
        groups.update(raw_groups)
    elif isinstance(raw_groups, str) and raw_groups:
        groups.update(g for g in re.split(r"[,\s]+", raw_groups.strip("[]")) if g)

    username = claims.get("cognito:username") or claims.get("username") or sub
    return AuthContext(
        sub=str(sub),
        username=str(username),
        groups=frozenset(groups),
        claims=claims,
    )
