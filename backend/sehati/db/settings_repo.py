"""Hospital-wide settings — one DynamoDB item, ``id = "app"``.

Today this holds exactly one thing: the password that unlocks patient-interview
(kiosk) mode. It is stored as a PBKDF2-HMAC-SHA256 hash with a per-record salt,
never in plaintext and never returned to any caller — the only read path is a
constant-time verification (:func:`verify_kiosk_password`).

PBKDF2 comes from the standard library, so this adds no Lambda dependency.
"""

from __future__ import annotations

import hashlib
import hmac
import os
from typing import Any

from ..models import now_iso
from . import tables

_SETTINGS_ID = "app"
_ITERATIONS = 240_000
_SALT_BYTES = 16


def _get_raw() -> dict[str, Any]:
    resp = tables.settings_table().get_item(Key={"id": _SETTINGS_ID})
    return tables.from_dynamo(resp.get("Item") or {})


def get_settings() -> dict[str, Any]:
    """The admin-visible view: flags only, never the hash or the salt."""
    raw = _get_raw()
    return {
        "kioskExitPasswordSet": bool(raw.get("kioskExitPasswordHash")),
        "updatedAt": raw.get("updatedAt"),
        "updatedBy": raw.get("updatedBy"),
    }


def set_kiosk_password(password: str, *, updated_by: str) -> dict[str, Any]:
    salt = os.urandom(_SALT_BYTES)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _ITERATIONS)
    item = {
        "id": _SETTINGS_ID,
        "kioskExitPasswordHash": digest.hex(),
        "kioskExitPasswordSalt": salt.hex(),
        "kioskExitPasswordIterations": _ITERATIONS,
        "updatedAt": now_iso(),
        "updatedBy": updated_by,
    }
    tables.settings_table().put_item(Item=tables.to_dynamo(item))
    return get_settings()


def verify_kiosk_password(password: str) -> bool:
    """Constant-time check. Returns False when no password has been set, so an
    unconfigured hospital fails closed (the device stays locked) rather than
    open."""
    raw = _get_raw()
    stored = raw.get("kioskExitPasswordHash")
    salt = raw.get("kioskExitPasswordSalt")
    if not stored or not salt:
        return False
    iterations = int(raw.get("kioskExitPasswordIterations") or _ITERATIONS)
    candidate = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), bytes.fromhex(salt), iterations
    )
    return hmac.compare_digest(candidate.hex(), stored)


def is_kiosk_password_set() -> bool:
    return bool(_get_raw().get("kioskExitPasswordHash"))
