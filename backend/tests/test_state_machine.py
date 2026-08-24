"""Lifecycle state-machine transitions (design doc section 7)."""

import pytest

from sehati.errors import StateTransitionError
from sehati.state_machine import (
    LifecycleState as S,
)
from sehati.state_machine import (
    assert_transition,
    can_transition,
    coerce,
)


def test_happy_path_transitions():
    path = [
        (S.INTAKE, S.AI_INTERVIEW),
        (S.AI_INTERVIEW, S.DOCTOR_REVIEW),
        (S.DOCTOR_REVIEW, S.IN_PROGRESS),
        (S.IN_PROGRESS, S.RESULTS_DISCUSSION),
        (S.RESULTS_DISCUSSION, S.DIAGNOSIS),
        (S.DIAGNOSIS, S.TREATMENT),
        (S.TREATMENT, S.CLOSED),
    ]
    for frm, to in path:
        assert can_transition(frm, to)
        assert_transition(frm, to)  # should not raise


def test_loops_are_allowed():
    # needs more tests: ResultsDiscussion -> InProgress
    assert can_transition(S.RESULTS_DISCUSSION, S.IN_PROGRESS)
    # doctor forces re-eval: Diagnosis -> ResultsDiscussion
    assert can_transition(S.DIAGNOSIS, S.RESULTS_DISCUSSION)
    # unexpected outcome on treatment: Treatment -> ResultsDiscussion
    assert can_transition(S.TREATMENT, S.RESULTS_DISCUSSION)


def test_signing_off_a_diagnosis_parks_the_case_in_treatment():
    """Accepting a diagnosis is a move to treatment, not to closed. The doctor
    can still close from there — see
    :func:`test_a_case_can_be_completed_from_any_open_state` — but sign-off
    itself does not do it."""
    assert can_transition(S.DIAGNOSIS, S.TREATMENT)


def test_a_case_can_be_completed_from_any_open_state():
    """The "Mark case complete" action in the case header is always available,
    so every non-terminal state has to be able to reach Closed."""
    for state in S:
        if state is S.CLOSED:
            continue
        assert can_transition(state, S.CLOSED), state


def test_illegal_transitions_rejected():
    assert not can_transition(S.INTAKE, S.DIAGNOSIS)
    assert not can_transition(S.CLOSED, S.INTAKE)
    with pytest.raises(StateTransitionError):
        assert_transition(S.INTAKE, S.DIAGNOSIS)


def test_closed_is_terminal():
    for target in S:
        assert not can_transition(S.CLOSED, target)


def test_coerce_unknown_state():
    assert coerce("Intake") == S.INTAKE
    with pytest.raises(StateTransitionError):
        coerce("Nonsense")
