"""End-to-end local walkthrough of the backend — no AWS account required.

Spins up an in-memory DynamoDB with ``moto``, then drives a case through the
entire clinical lifecycle using the stub AI (``AI_PROVIDER=stub``), printing
each resolver's result:

    intake -> interview -> summary -> exams -> differential -> tests
           -> results -> re-rank -> final diagnosis -> close

It finishes by demonstrating the data-layer isolation guard: a second patient is
denied access to the first patient's case.

Usage:
    pip install -r backend/requirements.txt
    python backend/scripts/local_invoke.py
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

os.environ.setdefault("AI_PROVIDER", "stub")
os.environ.setdefault("AWS_REGION", "us-east-1")
os.environ.setdefault("AWS_ACCESS_KEY_ID", "testing")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "testing")


def _create_aux_tables(tables) -> None:
    """Create the audit + feedback tables (caseId/sk) for local dev."""
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

        patient = AuthContext(sub="patient-1", username="layla", groups=frozenset({"patient"}))
        physician = AuthContext(sub="dr-karim", username="dr.karim", groups=frozenset({"physician"}))
        compliance = AuthContext(sub="dr-nabil", username="dr.nabil", groups=frozenset({"compliance"}))
        other_patient = AuthContext(sub="patient-2", username="sami", groups=frozenset({"patient"}))

        # 1. Patient submits intake --------------------------------------------
        intake = resolve("submitIntake", patient, {"input": {
            "patient": {"name": "Layla Haddad", "age": 54, "gender": "Female"},
            "chiefComplaint": "Headache for 3 days with fever",
            "complaint": {"symptoms": ["Headache", "Fever"], "painScale": 6, "duration": "3 days"},
        }})
        case_id = intake["id"]
        _print("1) submitIntake -> case created + AI interview started", {
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
            r = resolve("postInterviewMessage", patient, {"caseId": case_id, "text": ans})
            complete = r["complete"]
            if complete:
                break
        _print("2) postInterviewMessage (looped) -> interview complete", {"complete": complete})

        # 3. Generate structured summary ---------------------------------------
        s = resolve("generateSummary", patient, {"caseId": case_id})
        _print("3) generateSummary -> DoctorReview", {
            "status": s["case"]["status"], "summary": s["summary"],
        })

        # 4. Physician: recommend exams + record a finding ---------------------
        ex = resolve("recommendExams", physician, {"caseId": case_id})
        first_exam_id = ex["exams"][0]["id"]
        resolve("recordExamFinding", physician, {
            "caseId": case_id, "examId": first_exam_id,
            "finding": "Temp 38.6°C, neck stiffness present", "flag": "abnormal",
        })
        _print("4) recommendExams + recordExamFinding", {
            "exams": [e["name"] for e in ex["exams"]], "recorded": first_exam_id,
        })

        # 5. Differential + recommended tests ----------------------------------
        rec = resolve("requestRecommendations", physician, {"caseId": case_id})
        _print("5) requestRecommendations -> differential + tests", {
            "diagnoses": [d["name"] for d in rec["diagnoses"]],
            "tests": [t["name"] for t in rec["tests"]],
        })

        # 6. Explainability chat ------------------------------------------------
        dx_id = rec["diagnoses"][0]["id"]
        ans = resolve("askDiagnosis", physician, {
            "caseId": case_id, "diagnosisId": dx_id, "question": "What would increase your confidence?",
        })
        _print("6) askDiagnosis -> grounded explanation", {"aiMessage": ans["aiMessage"]["text"]})

        # 7. Order a test + record its result ----------------------------------
        test_id = rec["tests"][0]["id"]
        resolve("orderTest", physician, {"caseId": case_id, "testId": test_id})
        res = resolve("recordTestResult", physician, {
            "caseId": case_id, "testId": test_id, "result": "WBC 16.4 (neutrophilia)", "resultFlag": "abnormal",
        })
        _print("7) orderTest + recordTestResult -> InProgress", {
            "status": res["case"]["status"], "lifecycleState": res["case"]["lifecycleState"],
        })

        # 8. Re-rank after results ---------------------------------------------
        rr = resolve("rerankAfterResults", physician, {"caseId": case_id})
        _print("8) rerankAfterResults -> ResultsDiscussion", {
            "lifecycleState": rr["case"]["lifecycleState"],
            "topConfidence": rr["diagnoses"][0]["confidence"],
        })

        # 9. Propose + accept final diagnosis ----------------------------------
        pf = resolve("proposeFinalDiagnosis", physician, {"caseId": case_id})
        af = resolve("acceptFinalDiagnosis", physician, {"caseId": case_id, "note": "Agree, treating as bacterial."})
        _print("9) proposeFinalDiagnosis + acceptFinalDiagnosis -> Closed", {
            "proposed": pf["finalDiagnosis"]["name"],
            "status": af["case"]["status"], "lifecycleState": af["case"]["lifecycleState"],
        })

        # 10. Compliance reads the immutable audit trail -----------------------
        audit = resolve("caseAudit", compliance, {"id": case_id})
        _print("10) caseAudit (compliance) -> immutable trail", {
            "entries": len(audit), "actions": [a["action"] for a in audit],
        })

        # 11. Data-layer isolation: another patient is denied ------------------
        try:
            resolve("getCase", other_patient, {"id": case_id})
            print("\n[!] SECURITY FAILURE: cross-patient access was allowed!")
        except ForbiddenError as exc:
            _print("11) Isolation guard (patient-2 -> patient-1's case) DENIED", {
                "errorType": "Forbidden", "message": exc.message,
            })

        print(f"\n{'='*70}\nEnd-to-end walkthrough complete. Case {case_id} closed.\n{'='*70}")


if __name__ == "__main__":
    run()
