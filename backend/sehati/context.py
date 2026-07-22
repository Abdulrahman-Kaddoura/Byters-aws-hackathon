"""Authorization context — the caller's verified identity.

AppSync validates the Cognito JWT *before* the resolver runs and passes the
claims in ``event.identity``. We never trust anything the client puts in the
GraphQL arguments for identity; the ``sub`` and ``groups`` come from the signed
token only. This object is threaded through every resolver and every repo call
so authorization decisions live in the data layer (design doc section 10).
"""

from __future__ import annotations

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


def from_appsync_identity(identity: dict[str, Any] | None) -> AuthContext:
    """Build an :class:`AuthContext` from an AppSync ``event.identity`` object.

    Supports the Cognito User Pools identity shape. Groups arrive either as a
    top-level ``groups`` list or inside ``claims['cognito:groups']``.
    """
    if not identity:
        raise UnauthorizedError("Request is not authenticated.")

    sub = identity.get("sub") or identity.get("username")
    if not sub:
        raise UnauthorizedError("Identity is missing a subject.")

    claims = identity.get("claims", {}) or {}
    groups: set[str] = set()
    raw_groups = identity.get("groups")
    if isinstance(raw_groups, list):
        groups.update(raw_groups)
    claim_groups = claims.get("cognito:groups")
    if isinstance(claim_groups, list):
        groups.update(claim_groups)
    elif isinstance(claim_groups, str) and claim_groups:
        groups.update(g.strip() for g in claim_groups.split(","))

    return AuthContext(
        sub=str(sub),
        username=str(identity.get("username") or sub),
        groups=frozenset(groups),
        claims=claims,
    )
