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
