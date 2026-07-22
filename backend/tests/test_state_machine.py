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
        (S.DIAGNOSIS, S.CLOSED),
    ]
    for frm, to in path:
        assert can_transition(frm, to)
        assert_transition(frm, to)  # should not raise


def test_loops_are_allowed():
    # needs more tests: ResultsDiscussion -> InProgress
    assert can_transition(S.RESULTS_DISCUSSION, S.IN_PROGRESS)
    # doctor forces re-eval: Diagnosis -> ResultsDiscussion
    assert can_transition(S.DIAGNOSIS, S.RESULTS_DISCUSSION)


def test_illegal_transitions_rejected():
    assert not can_transition(S.INTAKE, S.CLOSED)
    assert not can_transition(S.INTAKE, S.DIAGNOSIS)
    assert not can_transition(S.CLOSED, S.INTAKE)
    with pytest.raises(StateTransitionError):
        assert_transition(S.INTAKE, S.CLOSED)


def test_closed_is_terminal():
    for target in S:
        assert not can_transition(S.CLOSED, target)


def test_coerce_unknown_state():
    assert coerce("Intake") == S.INTAKE
    with pytest.raises(StateTransitionError):
        coerce("Nonsense")
