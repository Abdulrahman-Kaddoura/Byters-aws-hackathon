"""The patient-interview (kiosk) exit gate and the settings behind it.

The whole point of checking the password here rather than in the browser is
that a comparison done in JavaScript is readable in the shipped bundle. These
tests pin the properties that make the server-side check worth having: the hash
never leaves the Lambda, an unset password fails closed, and only an admin can
change it.
"""

import pytest

from sehati.db import settings_repo
from sehati.errors import ForbiddenError, ValidationError
from sehati.router import resolve


def test_admin_sets_and_verifies_the_exit_password(aws, admin, nurse):
    resolve("adminUpdateSettings", admin, {"kioskExitPassword": "ward-7-exit"})

    assert resolve("kioskExit", nurse, {"password": "ward-7-exit"}) == {"ok": True}
    with pytest.raises(ForbiddenError):
        resolve("kioskExit", nurse, {"password": "wrong"})


def test_unset_password_keeps_the_device_locked(aws, nurse):
    """Failing closed matters more here than failing open: an unconfigured
    hospital should not hand out an unlocked kiosk."""
    with pytest.raises(ForbiddenError) as exc:
        resolve("kioskExit", nurse, {"password": "anything"})
    assert "administrator" in str(exc.value).lower()


def test_exit_requires_a_password(aws, nurse):
    with pytest.raises(ValidationError):
        resolve("kioskExit", nurse, {})
    with pytest.raises(ValidationError):
        resolve("kioskExit", nurse, {"password": ""})


def test_settings_never_expose_the_hash(aws, admin):
    resolve("adminUpdateSettings", admin, {"kioskExitPassword": "ward-7-exit"})
    settings = resolve("adminGetSettings", admin, {})

    assert settings["kioskExitPasswordSet"] is True
    assert settings["updatedBy"] == admin.username
    for key in settings:
        assert "hash" not in key.lower()
        assert "salt" not in key.lower()


def test_password_is_not_stored_in_plaintext(aws, admin):
    resolve("adminUpdateSettings", admin, {"kioskExitPassword": "ward-7-exit"})
    raw = settings_repo._get_raw()  # noqa: SLF001

    assert "ward-7-exit" not in str(raw)
    assert raw["kioskExitPasswordHash"] != "ward-7-exit"
    assert raw["kioskExitPasswordSalt"]


def test_rotating_the_password_invalidates_the_old_one(aws, admin, nurse):
    resolve("adminUpdateSettings", admin, {"kioskExitPassword": "first-code"})
    resolve("adminUpdateSettings", admin, {"kioskExitPassword": "second-code"})

    assert resolve("kioskExit", nurse, {"password": "second-code"}) == {"ok": True}
    with pytest.raises(ForbiddenError):
        resolve("kioskExit", nurse, {"password": "first-code"})


def test_only_settings_manage_can_change_it(aws, nurse, doctor):
    for ctx in (nurse, doctor):
        with pytest.raises(ForbiddenError):
            resolve("adminGetSettings", ctx, {})
        with pytest.raises(ForbiddenError):
            resolve("adminUpdateSettings", ctx, {"kioskExitPassword": "hijack"})


def test_short_passwords_are_rejected(aws, admin):
    with pytest.raises(ValidationError):
        resolve("adminUpdateSettings", admin, {"kioskExitPassword": "ab"})
    with pytest.raises(ValidationError):
        resolve("adminUpdateSettings", admin, {})


def test_staff_can_check_whether_a_password_exists(aws, admin, nurse):
    """So the nurse's UI can warn her *before* she hands the device over."""
    assert resolve("kioskStatus", nurse, {}) == {"kioskExitPasswordSet": False}
    resolve("adminUpdateSettings", admin, {"kioskExitPassword": "ward-7-exit"})
    assert resolve("kioskStatus", nurse, {}) == {"kioskExitPasswordSet": True}
