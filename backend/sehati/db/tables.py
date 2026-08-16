"""boto3 resource + table accessors.

Table names come from environment variables set by the CDK stack. For local
development they default to ``sehati-*`` and honour ``AWS_ENDPOINT_URL`` /
``DYNAMODB_ENDPOINT`` so a local DynamoDB (or moto) can be used without code
changes.

DynamoDB stores all numbers as ``Decimal``. Use :func:`to_dynamo` before writing
and :func:`from_dynamo` after reading so the rest of the codebase works with
plain ``int`` / ``float`` and the JSON shape the frontend expects.
"""

from __future__ import annotations

import decimal
import json
import os
from functools import lru_cache
from typing import Any

import boto3

CASES_TABLE = os.environ.get("CASES_TABLE", "sehati-cases")
AUDIT_TABLE = os.environ.get("AUDIT_TABLE", "sehati-audit")
FEEDBACK_TABLE = os.environ.get("FEEDBACK_TABLE", "sehati-feedback")
DOCTOR_FEEDBACK_TABLE = os.environ.get("DOCTOR_FEEDBACK_TABLE", "sehati-doctor-feedback")
USERS_TABLE = os.environ.get("USERS_TABLE", "sehati-users")
GROUPS_TABLE = os.environ.get("GROUPS_TABLE", "sehati-groups")
RESOURCES_TABLE = os.environ.get("RESOURCES_TABLE", "sehati-resources")
SETTINGS_TABLE = os.environ.get("SETTINGS_TABLE", "sehati-settings")

REGION = os.environ.get("AWS_REGION", "us-east-1")


@lru_cache(maxsize=1)
def _resource():
    endpoint = os.environ.get("DYNAMODB_ENDPOINT") or os.environ.get("AWS_ENDPOINT_URL")
    kwargs: dict[str, Any] = {"region_name": REGION}
    if endpoint:
        kwargs["endpoint_url"] = endpoint
    return boto3.resource("dynamodb", **kwargs)


def cases_table():
    return _resource().Table(CASES_TABLE)


def audit_table():
    return _resource().Table(AUDIT_TABLE)


def feedback_table():
    return _resource().Table(FEEDBACK_TABLE)


def doctor_feedback_table():
    """Free-text feedback a doctor leaves on a case, keyed by doctor (not case).

    Distinct from ``feedback_table`` (the accept/reject flywheel dataset in
    ``db/feedback_repo.record`` — design doc section 13): this is the
    doctor-facing "leave a note for the product/AI team" feature, and doubles
    as a per-doctor preference history the AI seam can read back.
    """
    return _resource().Table(DOCTOR_FEEDBACK_TABLE)


def users_table():
    return _resource().Table(USERS_TABLE)


def groups_table():
    return _resource().Table(GROUPS_TABLE)


def resources_table():
    """The shared reference-document library — clinical staff upload PDFs/DOCX
    (e.g. a guideline for a specific condition); the AI seam pulls matching
    ones in as grounding evidence (see ``ai/bedrock.py``'s ``_retrieve``)."""
    return _resource().Table(RESOURCES_TABLE)


def settings_table():
    """Hospital-wide settings — a single item (``id = "app"``) holding things
    an admin sets once for everyone, currently the hashed patient-interview
    exit password. See ``db/settings_repo.py``."""
    return _resource().Table(SETTINGS_TABLE)


# --- Decimal <-> JSON number conversion ------------------------------------
def to_dynamo(value: Any) -> Any:
    """Recursively convert floats to ``Decimal`` for DynamoDB writes.

    We round-trip through JSON so ``float`` values (e.g. ``25.9``) become
    ``Decimal`` cleanly and nested structures are handled uniformly.
    """
    return json.loads(json.dumps(value), parse_float=decimal.Decimal, parse_int=decimal.Decimal)


class _DecimalEncoder(json.JSONEncoder):
    def default(self, o: Any) -> Any:  # noqa: D401
        if isinstance(o, decimal.Decimal):
            # Preserve integers as int, everything else as float.
            return int(o) if o % 1 == 0 else float(o)
        return super().default(o)


def from_dynamo(value: Any) -> Any:
    """Recursively convert ``Decimal`` back to ``int`` / ``float``."""
    return json.loads(json.dumps(value, cls=_DecimalEncoder))
