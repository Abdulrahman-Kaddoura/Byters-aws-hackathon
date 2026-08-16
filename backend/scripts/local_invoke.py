"""End-to-end local walkthrough of the backend.

Spins up an in-memory DynamoDB with ``moto``, then drives a case through the
entire clinical lifecycle, printing each resolver's result:

    admit -> interview -> summary -> assign -> exams -> differential -> tests
          -> results -> re-rank -> final diagnosis -> close

It finishes by demonstrating the two access guards: a second doctor is denied
the case (assignment is the boundary), and the nurse's payload is shown to have
no clinical content in it.

By default this patches in the same deterministic test-only AI double the
test suite uses (``tests.fakes.ai_double.FakeAIService``), so it runs free and
offline with no AWS account needed — production code has no such fallback,
this is purely a dev-script convenience. Pass ``--bedrock`` (or set
``USE_REAL_BEDROCK=1``) to exercise the real Bedrock adapter instead, which
requires real AWS credentials with Bedrock model access.

Usage:
    pip install -r backend/requirements.txt
    python backend/scripts/local_invoke.py
    python backend/scripts/local_invoke.py --bedrock   # hits real Bedrock
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

os.environ.setdefault("AWS_REGION", "us-east-1")
os.environ.setdefault("AWS_ACCESS_KEY_ID", "testing")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "testing")

USE_REAL_BEDROCK = "--bedrock" in sys.argv[1:] or os.environ.get("USE_REAL_BEDROCK") == "1"


def _create_aux_tables(tables) -> None:
    """Create every non-case table this walkthrough touches, for local dev."""
    client = tables._resource().meta.client  # noqa: SLF001
    existing = client.list_tables().get("TableNames", [])
    for name in (tables.AUDIT_TABLE, tables.FEEDBACK_TABLE):
        if name in existing:
            continue
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
        client.get_waiter("table_exists").wait(TableName=name)

    # Assignment validates its target against sehati-users, and permissions are
    # computed from sehati-groups, so both are needed for the walkthrough.
    for name, key in (
        (tables.USERS_TABLE, "sub"),
        (tables.GROUPS_TABLE, "id"),
        (tables.SETTINGS_TABLE, "id"),
    ):
        if name in existing:
            continue
        client.create_table(
            TableName=name,
            BillingMode="PAY_PER_REQUEST",
            AttributeDefinitions=[{"AttributeName": key, "AttributeType": "S"}],
            KeySchema=[{"AttributeName": key, "KeyType": "HASH"}],
        )
        client.get_waiter("table_exists").wait(TableName=name)


def _print(title: str, payload: object) -> None:
    print(f"\n{'='*70}\n{title}\n{'-'*70}")
    text = json.dumps(payload, indent=2, default=str)
    print(text if len(text) < 1600 else text[:1600] + "\n… (truncated)")


def run() -> None:
    from moto import mock_aws

    with mock_aws():
        # Import after mock is active so boto3 clients are mocked.
        from scripts.seed_cases import _maybe_create_table
        from sehati.context import AuthContext
        from sehati.db import tables
        from sehati.errors import ForbiddenError
        from sehati.router import resolve

        _maybe_create_table()
        _create_aux_tables(tables)

        if not USE_REAL_BEDROCK:
            from sehati.ai import factory
            from tests.fakes.ai_double import FakeAIService

            factory.get_ai_service.cache_clear()
            factory.get_ai_service = lambda: FakeAIService()  # noqa: E731

        from sehati.db import cases_repo, groups_repo, users_repo
        from sehati.permissions import SYSTEM_GROUPS

        def _ctx(sub, username, role):
            return AuthContext(
                sub=sub, username=username, groups=frozenset({role}),
                permissions=frozenset(SYSTEM_GROUPS[role]["permissions"]),
            )

        nurse = _ctx("nurse-rima", "nurse.rima", "nurse")
        doctor = _ctx("dr-karim", "dr.karim", "doctor")
        other_doctor = _ctx("dr-nabil", "dr.nabil", "doctor")
        admin = _ctx("admin-1", "admin", "admin")

        # Assignment validates its target against the users table.
        for role, spec in SYSTEM_GROUPS.items():
            groups_repo.create_group(
                name=spec["name"], description=spec["description"],
                permissions=list(spec["permissions"]), group_id=spec["id"], is_system=True,
            )
        for ctx in (nurse, doctor, other_doctor, admin):
            users_repo.create_user(
                sub=ctx.sub, username=ctx.username, email=f"{ctx.username}@example.test",
                name=ctx.username, cognito_group=next(iter(ctx.groups)),
                custom_groups=[SYSTEM_GROUPS[next(iter(ctx.groups))]["id"]],
            )

        # 1. Nurse admits the patient ------------------------------------------
        intake = resolve("submitIntake", nurse, {"input": {
            "patient": {"name": "Layla Haddad", "age": 54, "gender": "Female",
                        "height": "165 cm", "weight": "70 kg"},
            "chiefComplaint": "Headache for 3 days with fever",
            "vitals": {"bloodPressure": "128/82", "heartRate": 88,
                       "temperature": 38.6, "oxygenSaturation": 97},
        }})
        case_id = intake["id"]
        _print("1) submitIntake (nurse) -> case created + AI interview started", {
            "id": case_id, "status": intake["status"], "lifecycleState": intake["lifecycleState"],
            "firstAIMessage": intake["interview"][-1]["text"],
        })

        # 2. Interview loop until complete -------------------------------------
        answers = ["It started 3 days ago and is getting worse.",
                   "About 7 out of 10; light makes it worse.",
                   "Yes, I've had fever and a stiff neck.",
                   "No regular medications.",
                   "No prior episodes like this."]
        complete = False
        for ans in answers:
            r = resolve("postInterviewMessage", nurse, {"caseId": case_id, "text": ans})
            complete = r["complete"]
            if complete:
                break
        _print("2) postInterviewMessage (looped) -> interview complete", {"complete": complete})

        # 3. Generate structured summary ---------------------------------------
        s = resolve("generateSummary", nurse, {"caseId": case_id})
        _print("3) generateSummary -> DoctorReview", {
            "status": s["case"]["status"], "summary": s["summary"],
        })

        # 3b. Nurse routes the case to a doctor --------------------------------
        assigned = resolve("assignCase", nurse, {"caseId": case_id, "doctorId": doctor.sub})
        _print("3b) assignCase (nurse -> doctor) — this is what grants access", {
            "assignedPhysicianId": assigned["assignedPhysicianId"],
            "assignedBy": assigned["assignedBy"],
        })

        # 4. Doctor: recommend exams + record a finding ------------------------
        ex = resolve("recommendExams", doctor, {"caseId": case_id})
        first_exam_id = ex["exams"][0]["id"]
        resolve("recordExamFinding", doctor, {
            "caseId": case_id, "examId": first_exam_id,
            "finding": "Temp 38.6°C, neck stiffness present", "flag": "abnormal",
        })
        _print("4) recommendExams + recordExamFinding", {
            "exams": [e["name"] for e in ex["exams"]], "recorded": first_exam_id,
        })

        # 5. Differential + recommended tests ----------------------------------
        rec = resolve("requestRecommendations", doctor, {"caseId": case_id})
        _print("5) requestRecommendations -> differential + tests", {
            "diagnoses": [d["name"] for d in rec["diagnoses"]],
            "tests": [t["name"] for t in rec["tests"]],
        })

        # 6. Explainability chat ------------------------------------------------
        dx_id = rec["diagnoses"][0]["id"]
        ans = resolve("askDiagnosis", doctor, {
            "caseId": case_id, "diagnosisId": dx_id, "question": "What would increase your confidence?",
        })
        _print("6) askDiagnosis -> grounded explanation", {"aiMessage": ans["aiMessage"]["text"]})

        # 7. Order a test + record its result ----------------------------------
        test_id = rec["tests"][0]["id"]
        resolve("orderTest", doctor, {"caseId": case_id, "testId": test_id})
        res = resolve("recordTestResult", doctor, {
            "caseId": case_id, "testId": test_id, "result": "WBC 16.4 (neutrophilia)", "resultFlag": "abnormal",
        })
        _print("7) orderTest + recordTestResult -> InProgress", {
            "status": res["case"]["status"], "lifecycleState": res["case"]["lifecycleState"],
        })

        # 8. Re-rank after results ---------------------------------------------
        rr = resolve("rerankAfterResults", doctor, {"caseId": case_id})
        _print("8) rerankAfterResults -> ResultsDiscussion", {
            "lifecycleState": rr["case"]["lifecycleState"],
            "topConfidence": rr["diagnoses"][0]["confidence"],
        })

        # 9. Propose + accept final diagnosis ----------------------------------
        pf = resolve("proposeFinalDiagnosis", doctor, {"caseId": case_id})
        af = resolve("acceptFinalDiagnosis", doctor, {"caseId": case_id, "note": "Agree, treating as bacterial."})
        _print("9) proposeFinalDiagnosis + acceptFinalDiagnosis -> Closed", {
            "proposed": pf["finalDiagnosis"]["name"],
            "status": af["case"]["status"], "lifecycleState": af["case"]["lifecycleState"],
        })

        # 10. Admin reads the immutable audit trail ----------------------------
        audit = resolve("caseAudit", admin, {"id": case_id})
        _print("10) caseAudit (admin) -> immutable trail", {
            "entries": len(audit), "actions": [a["action"] for a in audit],
        })

        # 11. Row-level guard: an unassigned doctor is denied ------------------
        try:
            resolve("getCase", other_doctor, {"id": case_id})
            print("\n[!] SECURITY FAILURE: an unassigned doctor read the case!")
        except ForbiddenError as exc:
            _print("11) Row guard (dr-nabil -> dr-karim's case) DENIED", {
                "errorType": "Forbidden", "message": exc.message,
            })

        # 12. Field-level guard: the nurse's payload has no clinical content ---
        stored = cases_repo.get_case(case_id, nurse)
        nurse_view = cases_repo.project_for_role(stored, nurse)
        leaked = [
            f for f in ("interview", "summary", "diagnoses", "tests", "finalDiagnosis")
            if f in nurse_view
        ]
        if leaked:
            print(f"\n[!] SECURITY FAILURE: nurse payload leaked {leaked}")
        else:
            _print("12) Field guard (nurse's view of the same case) REDACTED", {
                "visible": sorted(nurse_view),
                "patient": nurse_view["patient"]["name"],
                "vitals": nurse_view["vitals"],
            })

        print(f"\n{'='*70}\nEnd-to-end walkthrough complete. Case {case_id} closed.\n{'='*70}")


if __name__ == "__main__":
    run()
