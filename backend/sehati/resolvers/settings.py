"""Hospital settings + the patient-interview (kiosk) exit gate.

The nurse hands her device to the patient for the AI interview. While the
interview is running the client refuses to navigate anywhere else; the only way
out is this endpoint, which checks the admin-set password server-side. Doing the
check here rather than in the browser is the point — a password compared in
JavaScript is readable in the bundle.
"""

from __future__ import annotations

from typing import Any

from ..context import AuthContext
from ..db import settings_repo
from ..errors import ForbiddenError, ValidationError

_MIN_PASSWORD_LENGTH = 4


def get_settings(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    ctx.require_permission("settings.manage")
    return settings_repo.get_settings()


def update_settings(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    ctx.require_permission("settings.manage")
    password = args.get("kioskExitPassword")
    if password is None:
        raise ValidationError("Nothing to update.")
    if not isinstance(password, str) or len(password.strip()) < _MIN_PASSWORD_LENGTH:
        raise ValidationError(
            f"The exit password must be at least {_MIN_PASSWORD_LENGTH} characters."
        )
    return settings_repo.set_kiosk_password(password.strip(), updated_by=ctx.username)


def kiosk_status(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    """Whether an exit password exists at all.

    Any signed-in staff member may ask, so the nurse's UI can warn her *before*
    she hands the device over that nobody has set one yet. It reveals only the
    boolean.
    """
    return {"kioskExitPasswordSet": settings_repo.is_kiosk_password_set()}


def kiosk_exit(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    """Verify the exit password and unlock the device."""
    password = args.get("password")
    if not isinstance(password, str) or not password:
        raise ValidationError("Missing required argument 'password'.")
    if not settings_repo.verify_kiosk_password(password):
        if not settings_repo.is_kiosk_password_set():
            raise ForbiddenError(
                "No exit password has been set. Ask an administrator to set one "
                "in the admin panel."
            )
        raise ForbiddenError("Incorrect exit password.")
    return {"ok": True}
