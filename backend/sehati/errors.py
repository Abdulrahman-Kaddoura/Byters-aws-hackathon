"""Typed application errors.

These map onto API Gateway proxy responses via ``http_status``. ``AppError.code``
is surfaced to the client in ``errorType`` so the frontend can branch on it,
while ``message`` is safe to display. Never put PHI in an error message.
"""

from __future__ import annotations


class AppError(Exception):
    """Base class for all expected, client-facing errors."""

    code = "AppError"
    http_status = 400

    def __init__(self, message: str, *, details: dict | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details or {}

    def to_dict(self) -> dict:
        return {"errorType": self.code, "message": self.message, "details": self.details}


class NotFoundError(AppError):
    code = "NotFound"
    http_status = 404


class UnauthorizedError(AppError):
    """Caller is not authenticated / has no valid identity."""

    code = "Unauthorized"
    http_status = 401


class ForbiddenError(AppError):
    """Authenticated but not allowed to touch this resource.

    This is the data-layer isolation guard (the DynamoDB analog of Aurora RLS):
    e.g. a patient trying to read another patient's case, or a physician acting
    on a case they are not assigned to.
    """

    code = "Forbidden"
    http_status = 403


class ValidationError(AppError):
    code = "ValidationError"
    http_status = 400


class StateTransitionError(AppError):
    """An illegal case-lifecycle transition was requested (see state_machine)."""

    code = "StateTransitionError"
    http_status = 409


class ConflictError(AppError):
    """The request conflicts with existing state (e.g. a username already
    taken, or deleting a system group)."""

    code = "Conflict"
    http_status = 409


class AIServiceError(AppError):
    """The AI model call failed or returned unusable output (throttled,
    unavailable, or malformed/truncated JSON)."""

    code = "AIServiceError"
    http_status = 502
