"""Case queries + lifecycle resolvers."""

from __future__ import annotations

from typing import Any

from ..context import AuthContext
from ..db import audit_repo, cases_repo
from ..errors import ValidationError
from ..models import (
    PatientCase,
    new_case,
    recent_update,
    timeline_event,
)
from ..state_machine import STATE_PRESENTATION, assert_transition, coerce
from .helpers import touch_progress


def list_cases(ctx: AuthContext, args: dict[str, Any]) -> list[PatientCase]:
    return cases_repo.list_cases(
        ctx, status=args.get("status"), mine=bool(args.get("mine"))
    )


def get_case(ctx: AuthContext, args: dict[str, Any]) -> PatientCase:
    return cases_repo.get_case(_require(args, "id"), ctx)


def case_audit(ctx: AuthContext, args: dict[str, Any]) -> list[dict[str, Any]]:
    # Ensure the case is visible before returning its audit trail.
    cases_repo.get_case(_require(args, "id"), ctx)
    return audit_repo.list_for_case(args["id"], ctx)


def submit_intake(ctx: AuthContext, args: dict[str, Any]) -> PatientCase:
    """Create a case from an intake payload and move it to AIInterview.

    Callable by a patient (creating their own case) or clinical staff (creating
    on a patient's behalf).
    """
    payload = args.get("input") or {}
    patient = payload.get("patient") or {}
    if not patient.get("name"):
        raise ValidationError("Intake requires patient.name.")
    chief = payload.get("chiefComplaint") or _first_symptom(payload) or "Unspecified complaint"

    # A patient can only file intake under their own identity.
    patient_id = ctx.sub if ctx.is_patient else (payload.get("patientId") or ctx.sub)

    case = new_case(
        patient=patient,
        history=payload.get("history"),
        complaint=payload.get("complaint"),
        chief_complaint=chief,
        patient_id=patient_id,
        assigned_physician_id=payload.get("assignedPhysicianId"),
    )
    if payload.get("vitals"):
        case["vitals"] = payload["vitals"]

    # Intake -> AIInterview.
    _apply_state(case, "AIInterview")
    case["interview"].append(
        {
            "role": "ai",
            "text": (
                f"Hello {patient.get('name', '').split(' ')[0] or 'there'}, I'm SEHATI. "
                "I'd like to ask a few questions about your symptoms."
            ),
            "time": _now_clock(),
        }
    )
    cases_repo.put_case(case, ctx)
    audit_repo.record(ctx, case_id=case["id"], action="submitIntake", output={"chiefComplaint": chief})
    return case


def set_case_state(ctx: AuthContext, args: dict[str, Any]) -> PatientCase:
    """Explicit lifecycle transition (design doc section 7). Physician-driven."""
    ctx.require_clinical_staff()
    case = cases_repo.get_case(_require(args, "caseId"), ctx)
    target = _require(args, "state")
    _apply_state(case, target)
    if args.get("note"):
        case.setdefault("notes", []).append(
            {"time": _now_clock(), "author": ctx.username, "text": args["note"]}
        )
    cases_repo.save_case(case, ctx)
    audit_repo.record(ctx, case_id=case["id"], action="setCaseState", output={"state": target})
    return case


def add_note(ctx: AuthContext, args: dict[str, Any]) -> PatientCase:
    ctx.require_clinical_staff()
    case = cases_repo.get_case(_require(args, "caseId"), ctx)
    text = _require(args, "text")
    case.setdefault("notes", []).append(
        {"time": _now_clock(), "author": ctx.username, "text": text}
    )
    case.setdefault("recentUpdates", []).insert(0, recent_update("Doctor added a note", "doctor"))
    cases_repo.save_case(case, ctx)
    audit_repo.record(ctx, case_id=case["id"], action="addNote", output={"text": text})
    return case


# --- shared internals -------------------------------------------------------
def _apply_state(case: PatientCase, target_state: str) -> None:
    """Validate + apply a lifecycle transition and sync frontend status/stage."""
    current = coerce(case.get("lifecycleState", "Intake"))
    target = coerce(target_state)
    if current != target:
        assert_transition(current, target)
    case["lifecycleState"] = target.value
    status, stage = STATE_PRESENTATION[target]
    case["status"] = status
    case["stage"] = stage
    touch_progress(case, stage)
    case.setdefault("timeline", []).append(
        timeline_event(f"Case moved to {target.value}", f"Lifecycle state set to {target.value}.", "system", stage)
    )


def _require(args: dict[str, Any], key: str) -> Any:
    val = args.get(key)
    if val in (None, ""):
        raise ValidationError(f"Missing required argument '{key}'.")
    return val


def _first_symptom(payload: dict[str, Any]) -> str | None:
    syms = (payload.get("complaint") or {}).get("symptoms") or []
    return syms[0] if syms else None


def _now_clock() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).strftime("%H:%M")
