"""Shared pytest fixtures: an in-memory DynamoDB (moto) with the tables created,
plus ready-made auth contexts for each role."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

os.environ.setdefault("AI_PROVIDER", "stub")
os.environ.setdefault("AWS_REGION", "us-east-1")
os.environ.setdefault("AWS_ACCESS_KEY_ID", "testing")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "testing")
os.environ.setdefault("AWS_SECURITY_TOKEN", "testing")
os.environ.setdefault("AWS_SESSION_TOKEN", "testing")


@pytest.fixture()
def aws(monkeypatch):
    """Activate moto and create the three tables; clear cached boto3 resource."""
    from moto import mock_aws

    with mock_aws():
        # Reset the cached DynamoDB resource so it binds to the mock.
        from sehati.db import tables

        tables._resource.cache_clear()  # noqa: SLF001

        _create_tables(tables)
        yield tables
        tables._resource.cache_clear()  # noqa: SLF001


def _create_tables(tables) -> None:
    client = tables._resource().meta.client  # noqa: SLF001
    client.create_table(
        TableName=tables.CASES_TABLE,
        BillingMode="PAY_PER_REQUEST",
        AttributeDefinitions=[
            {"AttributeName": "id", "AttributeType": "S"},
            {"AttributeName": "patientId", "AttributeType": "S"},
            {"AttributeName": "assignedPhysicianId", "AttributeType": "S"},
            {"AttributeName": "status", "AttributeType": "S"},
            {"AttributeName": "createdAt", "AttributeType": "S"},
        ],
        KeySchema=[{"AttributeName": "id", "KeyType": "HASH"}],
        GlobalSecondaryIndexes=[
            _gsi("byPatient", "patientId"),
            _gsi("byPhysician", "assignedPhysicianId"),
            _gsi("byStatus", "status"),
        ],
    )
    for name in (tables.AUDIT_TABLE, tables.FEEDBACK_TABLE):
        client.create_table(
            TableName=name,
            BillingMode="PAY_PER_REQUEST",
            AttributeDefinitions=[
                {"AttributeName": "caseId", "AttributeType": "S"},
                {"AttributeName": "sk", "AttributeType": "S"},
            ],
            KeySchema=[
                {"AttributeName": "caseId", "KeyType": "HASH"},
                {"AttributeName": "sk", "KeyType": "RANGE"},
            ],
        )


def _gsi(name: str, pk: str) -> dict:
    return {
        "IndexName": name,
        "KeySchema": [
            {"AttributeName": pk, "KeyType": "HASH"},
            {"AttributeName": "createdAt", "KeyType": "RANGE"},
        ],
        "Projection": {"ProjectionType": "ALL"},
    }


@pytest.fixture()
def patient():
    from sehati.context import AuthContext

    return AuthContext(sub="patient-1", username="layla", groups=frozenset({"patient"}))


@pytest.fixture()
def other_patient():
    from sehati.context import AuthContext

    return AuthContext(sub="patient-2", username="sami", groups=frozenset({"patient"}))


@pytest.fixture()
def physician():
    from sehati.context import AuthContext

    return AuthContext(sub="dr-karim", username="dr.karim", groups=frozenset({"physician"}))


@pytest.fixture()
def compliance():
    from sehati.context import AuthContext

    return AuthContext(sub="dr-nabil", username="dr.nabil", groups=frozenset({"compliance"}))


@pytest.fixture()
def sample_intake() -> dict:
    return {
        "input": {
            "patient": {"name": "Layla Haddad", "age": 54, "gender": "Female"},
            "chiefComplaint": "Headache for 3 days with fever",
            "complaint": {"symptoms": ["Headache", "Fever"], "painScale": 6, "duration": "3 days"},
        }
    }
