"""Seed the DynamoDB ``sehati-cases`` table with the 7 sample cases.

The seed data in ``sehati/data/seed_cases.json`` is generated directly from the
frontend's ``src/data/cases.ts`` (single source of truth), so the backend serves
exactly the cases the UI was designed around. This gives the frontend real data
to talk to immediately after deployment.

Each case is augmented with the backend-only fields (``lifecycleState``,
``patientId``, ``assignedPhysicianId``) so ownership scoping and the state
machine work. Ownership is assigned to demo identities you can map to real
Cognito users.

Usage:
    # Against a deployed table (uses your AWS credentials + region):
    python -m scripts.seed_cases

    # Against a local DynamoDB / moto:
    DYNAMODB_ENDPOINT=http://localhost:8000 AWS_REGION=us-east-1 \
        python -m scripts.seed_cases --create-table
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

# Allow running as a script (python scripts/seed_cases.py) or module.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sehati.db import tables  # noqa: E402
from sehati.state_machine import LifecycleState  # noqa: E402

DATA_PATH = Path(__file__).resolve().parents[1] / "sehati" / "data" / "seed_cases.json"

# Demo ownership mapping. Replace the physician/patient ids with real Cognito
# ``sub`` values (or keep these and create matching users) as you prefer.
DEMO_PATIENT_ID = os.environ.get("SEED_PATIENT_SUB", "demo-patient")
DEMO_PHYSICIAN_ID = os.environ.get("SEED_PHYSICIAN_SUB", "demo-physician")

# Map a frontend stage/status to a lifecycle state for the backend fields.
_STAGE_TO_STATE = {
    "intake": LifecycleState.INTAKE,
    "interview": LifecycleState.AI_INTERVIEW,
    "examination": LifecycleState.DOCTOR_REVIEW,
    "differential": LifecycleState.DOCTOR_REVIEW,
    "tests": LifecycleState.IN_PROGRESS,
    "results": LifecycleState.RESULTS_DISCUSSION,
    "diagnosis": LifecycleState.DIAGNOSIS,
    "treatment": LifecycleState.DIAGNOSIS,
    "followup": LifecycleState.DIAGNOSIS,
    "completion": LifecycleState.CLOSED,
}


def _augment(case: dict) -> dict:
    stage = case.get("stage", "intake")
    case.setdefault("lifecycleState", _STAGE_TO_STATE.get(stage, LifecycleState.INTAKE).value)
    case.setdefault("patientId", DEMO_PATIENT_ID)
    case.setdefault("assignedPhysicianId", DEMO_PHYSICIAN_ID)
    # createdAt from the sample data is a display string; add a sortable ISO key
    # for the GSIs if missing.
    if "createdAt" not in case or "·" in str(case.get("createdAt", "")):
        case["createdAt"] = case.get("createdAt", "")
    return case


def _maybe_create_table() -> None:
    """Create a minimal cases table locally (for DynamoDB Local / moto)."""
    client = tables._resource().meta.client  # noqa: SLF001 - dev helper
    existing = client.list_tables().get("TableNames", [])
    if tables.CASES_TABLE in existing:
        return
    print(f"Creating table {tables.CASES_TABLE} (local dev)…")
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
    client.get_waiter("table_exists").wait(TableName=tables.CASES_TABLE)


def _gsi(name: str, pk: str) -> dict:
    return {
        "IndexName": name,
        "KeySchema": [
            {"AttributeName": pk, "KeyType": "HASH"},
            {"AttributeName": "createdAt", "KeyType": "RANGE"},
        ],
        "Projection": {"ProjectionType": "ALL"},
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed SEHATI sample cases into DynamoDB.")
    parser.add_argument("--create-table", action="store_true", help="Create the table first (local dev).")
    args = parser.parse_args()

    if args.create_table:
        _maybe_create_table()

    cases = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    table = tables.cases_table()
    for raw in cases:
        case = _augment(raw)
        table.put_item(Item=tables.to_dynamo(case))
        print(f"  seeded {case['id']:>10}  {case.get('status'):<22}  {case['patient']['name']}")
    print(f"\nSeeded {len(cases)} cases into {tables.CASES_TABLE}.")
    print(f"Patient owner:   {DEMO_PATIENT_ID}")
    print(f"Physician owner: {DEMO_PHYSICIAN_ID}")


if __name__ == "__main__":
    main()
