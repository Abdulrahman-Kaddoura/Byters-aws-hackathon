"""Case queries + lifecycle resolvers."""

from __future__ import annotations

from typing import Any

from ..context import AuthContext
from ..db import audit_repo, cases_repo, users_repo
from ..errors import NotFoundError, ValidationError
from ..models import (
    GROUP_DOCTOR,
    PatientCase,
    new_case,
    now_iso,
    recent_update,
    timeline_event,
)
from ..state_machine import STATE_PRESENTATION, assert_transition, coerce
from .helpers import touch_progress


def list_cases(ctx: AuthContext, args: dict[str, Any]) -> list[PatientCase]:
    return cases_repo.list_cases(ctx, status=args.get("status"), scope=args.get("scope"))


def get_case(ctx: AuthContext, args: dict[str, Any]) -> PatientCase:
    return cases_repo.get_case(_require(args, "id"), ctx)


def case_audit(ctx: AuthContext, args: dict[str, Any]) -> list[dict[str, Any]]:
    # Ensure the case is visible before returning its audit trail.
    cases_repo.get_case(_require(args, "id"), ctx)
    return audit_repo.list_for_case(args["id"], ctx)


def submit_intake(ctx: AuthContext, args: dict[str, Any]) -> PatientCase:
    """Admit a patient: record their details and move the case to AIInterview.

    This is the nurse's admission form. Ownership is taken from the verified
    token, never from the body — a caller cannot file a case under someone
    else's identity or pre-assign it to a doctor of their choosing (routing is
    a separate, audited step; see :func:`assign_case`).
    """
    ctx.require_permission("cases.create")
    payload = args.get("input") or {}
    patient = payload.get("patient") or {}
    if not patient.get("name"):
        raise ValidationError("Intake requires patient.name.")
    chief = payload.get("chiefComplaint") or _first_symptom(payload) or "Unspecified complaint"

    case = new_case(
        patient=patient,
        history=payload.get("history"),
        complaint=payload.get("complaint"),
        chief_complaint=chief,
        vitals=payload.get("vitals"),
        created_by_nurse_id=ctx.sub,
    )

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


def list_doctors(ctx: AuthContext, args: dict[str, Any]) -> list[dict[str, Any]]:
    """The doctors a case can be routed to.

    Deliberately a name-and-id projection: a nurse needs enough to pick from a
    dropdown, not the staff directory.
    """
    ctx.require_permission("cases.assign")
    return [
        {"sub": u["sub"], "name": u.get("name") or u.get("username", "")}
        for u in users_repo.list_users()
        if u.get("cognitoGroup") == GROUP_DOCTOR and u.get("status", "active") == "active"
    ]


def suggest_assignee(
    case: PatientCase, doctors: list[dict[str, Any]]
) -> str | None:
    """Seam for AI-ranked assignment — intentionally inert today.

    The intended inputs are the doctor's schedule and current load, their
    experience with similar cases, and the case's urgency. Filling this in
    later needs no change to :func:`assign_case`: it only ever *prefills* the
    nurse's picker, and her explicit choice always wins.
    """
    return None


def assign_case(ctx: AuthContext, args: dict[str, Any]) -> PatientCase:
    """Route a case to one doctor. Reassignment is allowed and audited."""
    ctx.require_permission("cases.assign")
    case = cases_repo.get_case(_require(args, "caseId"), ctx)
    doctor_sub = _require(args, "doctorId")

    doctor = users_repo.find_user(doctor_sub)
    if doctor is None or doctor.get("cognitoGroup") != GROUP_DOCTOR:
        raise ValidationError("Cases can only be assigned to a doctor.")
    if doctor.get("status", "active") != "active":
        raise ValidationError("That doctor's account is disabled.")

    previous = case.get("assignedPhysicianId")
    case["assignedPhysicianId"] = doctor_sub
    case["assignedAt"] = now_iso()
    case["assignedBy"] = ctx.sub

    doctor_name = doctor.get("name") or doctor.get("username", "a doctor")
    verb = "reassigned" if previous and previous != doctor_sub else "assigned"
    case.setdefault("timeline", []).append(
        timeline_event(
            f"Case {verb} to {doctor_name}",
            f"{ctx.username} {verb} this case to {doctor_name}.",
            "system",
            case.get("stage", "intake"),
        )
    )
    case.setdefault("recentUpdates", []).insert(
        0, recent_update(f"Case {verb} to {doctor_name}", "system")
    )

    cases_repo.save_case(case, ctx)
    audit_repo.record(
        ctx,
        case_id=case["id"],
        action="assignCase",
        output={"doctorId": doctor_sub, "previousDoctorId": previous},
    )
    return case


def set_case_tags(ctx: AuthContext, args: dict[str, Any]) -> dict[str, Any]:
    """Replace the caller's private tags for a case.

    Tags live on the *user* record, not the case, so they are private by
    construction — another doctor's labels are never in a payload that could
    leak. Reaching this at all requires the case to be visible to the caller.
    """
    case_id = _require(args, "caseId")
    cases_repo.get_case(case_id, ctx)

    raw = args.get("tags") or []
    if not isinstance(raw, list):
        raise ValidationError("tags must be a list of strings.")
    tags = []
    for tag in raw:
        cleaned = str(tag).strip()[:40]
        if cleaned and cleaned not in tags:
            tags.append(cleaned)
    if len(tags) > 10:
        raise ValidationError("A case can carry at most 10 tags.")

    user = users_repo.find_user(ctx.sub)
    if user is None:
        raise NotFoundError("No account record found for the current user.")
    case_tags = dict(user.get("caseTags") or {})
    if tags:
        case_tags[case_id] = tags
    else:
        case_tags.pop(case_id, None)
    users_repo.update_user(ctx.sub, case_tags=case_tags)
    return {"caseId": case_id, "tags": tags}


def set_case_state(ctx: AuthContext, args: dict[str, Any]) -> PatientCase:
    """Explicit lifecycle transition (design doc section 7). Doctor-driven."""
    ctx.require_permission("cases.manage_state")
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
    ctx.require_permission("cases.add_note")
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
