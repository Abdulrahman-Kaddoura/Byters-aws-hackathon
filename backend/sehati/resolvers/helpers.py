"""Small shared helpers for resolvers."""

from __future__ import annotations

from typing import Any

from ..models import PatientCase, StageKey, build_progress


def touch_progress(case: PatientCase, stage: StageKey) -> None:
    """Recompute the progress tracker for the given stage (keeps UI in sync)."""
    completed = stage == "completion"
    case["progress"] = build_progress(stage, completed=completed)
    case["stage"] = stage


def find(items: list[dict[str, Any]], id_: str) -> dict[str, Any] | None:
    return next((i for i in items if i.get("id") == id_), None)
