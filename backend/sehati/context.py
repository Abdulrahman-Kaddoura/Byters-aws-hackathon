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
from .models import (
    GROUP_ADMIN,
    GROUP_COMPLIANCE,
    GROUP_PATIENT,
    GROUP_PHYSICIAN,
)


@dataclass(frozen=True)
class AuthContext:
    sub: str
    username: str
    groups: frozenset[str] = field(default_factory=frozenset)
    claims: dict[str, Any] = field(default_factory=dict)

    # --- Role predicates ---
    @property
    def is_patient(self) -> bool:
        return GROUP_PATIENT in self.groups

    @property
    def is_physician(self) -> bool:
        return GROUP_PHYSICIAN in self.groups

    @property
    def is_admin(self) -> bool:
        return GROUP_ADMIN in self.groups

    @property
    def is_compliance(self) -> bool:
        return GROUP_COMPLIANCE in self.groups

    @property
    def is_clinical_staff(self) -> bool:
        """Anyone permitted to see across patients within the hospital tenant."""
        return self.is_physician or self.is_admin or self.is_compliance

    def require_physician(self) -> None:
        if not (self.is_physician or self.is_admin):
            raise ForbiddenError("This action requires a physician role.")

    def require_clinical_staff(self) -> None:
        if not self.is_clinical_staff:
            raise ForbiddenError("This action requires clinical staff privileges.")


def from_apigw_claims(claims: dict[str, Any] | None) -> AuthContext:
    """Build an :class:`AuthContext` from API Gateway's authorizer claims.

    A ``COGNITO_USER_POOLS`` authorizer places the verified JWT claims at
    ``event.requestContext.authorizer.claims``. Array claims (like
    ``cognito:groups``) get flattened to a string by API Gateway — either
    comma-joined or space-joined inside brackets (e.g. ``"[physician admin]"``)
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
