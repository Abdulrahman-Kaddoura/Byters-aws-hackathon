"""Case lifecycle state machine (design doc section 7).

The authoritative clinical lifecycle uses the coarse states from the design
document's state diagram. Each state also carries a default mapping to the
frontend's richer ``status`` / ``stage`` fields (defined in ``src/types.ts``)
so the case document renders correctly in the existing UI.

    patient submits        -> AIInterview
    summary ready          -> DoctorReview
    accepts tests + plan   -> InProgress
    results returned       -> ResultsDiscussion
    needs more tests       -> InProgress            (loop)
    sufficient evidence    -> Diagnosis
    doctor forces re-eval  -> ResultsDiscussion     (loop)
    doctor marks cured     -> Closed
"""

from __future__ import annotations

from enum import Enum

from .errors import StateTransitionError


class LifecycleState(str, Enum):
    INTAKE = "Intake"
    AI_INTERVIEW = "AIInterview"
    DOCTOR_REVIEW = "DoctorReview"
    IN_PROGRESS = "InProgress"
    RESULTS_DISCUSSION = "ResultsDiscussion"
    DIAGNOSIS = "Diagnosis"
    CLOSED = "Closed"


# Directed graph of allowed transitions (design doc section 7).
_ALLOWED: dict[LifecycleState, set[LifecycleState]] = {
    LifecycleState.INTAKE: {LifecycleState.AI_INTERVIEW},
    LifecycleState.AI_INTERVIEW: {LifecycleState.DOCTOR_REVIEW},
    LifecycleState.DOCTOR_REVIEW: {LifecycleState.IN_PROGRESS},
    LifecycleState.IN_PROGRESS: {LifecycleState.RESULTS_DISCUSSION},
    LifecycleState.RESULTS_DISCUSSION: {
        LifecycleState.DIAGNOSIS,
        LifecycleState.IN_PROGRESS,  # needs more tests
    },
    LifecycleState.DIAGNOSIS: {
        LifecycleState.CLOSED,
        LifecycleState.RESULTS_DISCUSSION,  # doctor forces re-evaluation
    },
    LifecycleState.CLOSED: set(),  # terminal; record retained immutably
}

# Default frontend (status, stage) presentation for each lifecycle state.
# Frontend types: CaseStatus and StageKey in src/types.ts.
STATE_PRESENTATION: dict[LifecycleState, tuple[str, str]] = {
    LifecycleState.INTAKE: ("New", "intake"),
    LifecycleState.AI_INTERVIEW: ("AI Interview", "interview"),
    LifecycleState.DOCTOR_REVIEW: ("Doctor Review", "examination"),
    LifecycleState.IN_PROGRESS: ("Awaiting Tests", "tests"),
    LifecycleState.RESULTS_DISCUSSION: ("Diagnosis in Progress", "results"),
    LifecycleState.DIAGNOSIS: ("Diagnosis in Progress", "diagnosis"),
    LifecycleState.CLOSED: ("Completed", "completion"),
}


def can_transition(current: LifecycleState, target: LifecycleState) -> bool:
    return target in _ALLOWED.get(current, set())


def assert_transition(current: LifecycleState, target: LifecycleState) -> None:
    """Raise ``StateTransitionError`` if the move is not permitted."""
    if not can_transition(current, target):
        allowed = ", ".join(sorted(s.value for s in _ALLOWED.get(current, set()))) or "(none)"
        raise StateTransitionError(
            f"Cannot move case from '{current.value}' to '{target.value}'. "
            f"Allowed from '{current.value}': {allowed}.",
            details={"from": current.value, "to": target.value},
        )


def coerce(value: str | LifecycleState) -> LifecycleState:
    """Parse a string into a ``LifecycleState`` (tolerant of the enum value)."""
    if isinstance(value, LifecycleState):
        return value
    try:
        return LifecycleState(value)
    except ValueError as exc:
        valid = ", ".join(s.value for s in LifecycleState)
        raise StateTransitionError(
            f"Unknown lifecycle state '{value}'. Valid states: {valid}.",
        ) from exc
