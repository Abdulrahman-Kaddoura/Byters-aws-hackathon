"""Shared pytest fixtures: an in-memory DynamoDB (moto) with the tables created,
plus ready-made auth contexts for each role."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

os.environ.setdefault("AWS_REGION", "us-east-1")
os.environ.setdefault("AWS_ACCESS_KEY_ID", "testing")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "testing")
os.environ.setdefault("AWS_SECURITY_TOKEN", "testing")
os.environ.setdefault("AWS_SESSION_TOKEN", "testing")


@pytest.fixture(autouse=True)
def _fake_ai(monkeypatch):
    """Every test gets a deterministic, offline AI double — production code
    has no fake-AI mode to select, so tests can't run against real Bedrock
    (no network, no credentials, no moto support for bedrock-runtime)."""
    from sehati.ai import factory
    from tests.fakes.ai_double import FakeAIService

    monkeypatch.setattr(factory, "get_ai_service", lambda: FakeAIService())


@pytest.fixture()
def aws(monkeypatch):
    """Activate moto and create the three tables; clear cached boto3 resource."""
    from moto import mock_aws

    with mock_aws():
        # Reset cached boto3 clients/resources so they bind to the mock —
        # both must be (re)built *inside* the mock_aws() context or their
        # calls hit real AWS instead of moto.
        from sehati import cognito_admin
        from sehati.db import tables
        from sehati.resolvers import documents, resources

        tables._resource.cache_clear()  # noqa: SLF001
        cognito_admin._client.cache_clear()  # noqa: SLF001
        documents._s3_client.cache_clear()  # noqa: SLF001
        resources._s3_client.cache_clear()  # noqa: SLF001

        _create_tables(tables)
        yield tables
        tables._resource.cache_clear()  # noqa: SLF001
        cognito_admin._client.cache_clear()  # noqa: SLF001
        documents._s3_client.cache_clear()  # noqa: SLF001
        resources._s3_client.cache_clear()  # noqa: SLF001


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
    client.create_table(
        TableName=tables.DOCTOR_FEEDBACK_TABLE,
        BillingMode="PAY_PER_REQUEST",
        AttributeDefinitions=[
            {"AttributeName": "doctorId", "AttributeType": "S"},
            {"AttributeName": "timestamp", "AttributeType": "N"},
        ],
        KeySchema=[
            {"AttributeName": "doctorId", "KeyType": "HASH"},
            {"AttributeName": "timestamp", "KeyType": "RANGE"},
        ],
    )
    client.create_table(
        TableName=tables.USERS_TABLE,
        BillingMode="PAY_PER_REQUEST",
        AttributeDefinitions=[{"AttributeName": "sub", "AttributeType": "S"}],
        KeySchema=[{"AttributeName": "sub", "KeyType": "HASH"}],
    )
    client.create_table(
        TableName=tables.GROUPS_TABLE,
        BillingMode="PAY_PER_REQUEST",
        AttributeDefinitions=[{"AttributeName": "id", "AttributeType": "S"}],
        KeySchema=[{"AttributeName": "id", "KeyType": "HASH"}],
    )
    client.create_table(
        TableName=tables.RESOURCES_TABLE,
        BillingMode="PAY_PER_REQUEST",
        AttributeDefinitions=[{"AttributeName": "id", "AttributeType": "S"}],
        KeySchema=[{"AttributeName": "id", "KeyType": "HASH"}],
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


def _default_permissions(role: str) -> frozenset[str]:
    """The permission set the seeded system group for this Cognito role grants
    by default (permissions.py) — attached directly to the role fixtures below
    so resolver tests exercise realistic permission-gated behavior without
    each test standing up the users/groups tables."""
    from sehati.permissions import SYSTEM_GROUPS

    return frozenset(SYSTEM_GROUPS[role]["permissions"])


@pytest.fixture()
def patient():
    from sehati.context import AuthContext

    return AuthContext(
        sub="patient-1", username="layla", groups=frozenset({"patient"}),
        permissions=_default_permissions("patient"),
    )


@pytest.fixture()
def other_patient():
    from sehati.context import AuthContext

    return AuthContext(
        sub="patient-2", username="sami", groups=frozenset({"patient"}),
        permissions=_default_permissions("patient"),
    )


@pytest.fixture()
def physician():
    from sehati.context import AuthContext

    return AuthContext(
        sub="dr-karim", username="dr.karim", groups=frozenset({"physician"}),
        permissions=_default_permissions("physician"),
    )


@pytest.fixture()
def compliance():
    from sehati.context import AuthContext

    return AuthContext(
        sub="dr-nabil", username="dr.nabil", groups=frozenset({"compliance"}),
        permissions=_default_permissions("compliance"),
    )


@pytest.fixture()
def admin():
    from sehati.context import AuthContext

    return AuthContext(
        sub="admin-1", username="admin", groups=frozenset({"admin"}),
        permissions=_default_permissions("admin"),
    )


@pytest.fixture()
def cognito_pool(aws, monkeypatch):
    """A mocked Cognito user pool with the 4 built-in groups, for tests that
    exercise the admin panel's Cognito Admin* calls (see cognito_admin.py).
    Depends on ``aws`` so it shares the same moto session/DynamoDB tables."""
    import boto3

    idp = boto3.client("cognito-idp", region_name="us-east-1")
    pool_id = idp.create_user_pool(PoolName="sehati-users")["UserPool"]["Id"]
    for group in ("patient", "physician", "admin", "compliance"):
        idp.create_group(UserPoolId=pool_id, GroupName=group)
    client_id = idp.create_user_pool_client(
        UserPoolId=pool_id, ClientName="test-client", ExplicitAuthFlows=["ADMIN_NO_SRP_AUTH"]
    )["UserPoolClient"]["ClientId"]
    monkeypatch.setenv("USER_POOL_ID", pool_id)
    return {"idp": idp, "pool_id": pool_id, "client_id": client_id}


@pytest.fixture()
def sample_intake() -> dict:
    return {
        "input": {
            "patient": {"name": "Layla Haddad", "age": 54, "gender": "Female"},
            "chiefComplaint": "Headache for 3 days with fever",
            "complaint": {"symptoms": ["Headache", "Fever"], "painScale": 6, "duration": "3 days"},
        }
    }
