"""Domain model — the Python mirror of ``src/types.ts``.

The canonical entity is :class:`PatientCase`, stored in DynamoDB as a single
JSON document so the shape the frontend consumes is preserved end-to-end. We use
``TypedDict`` for editor/type-checker documentation and light factory helpers
(``new_case``, ``chat_message``, ``timeline_event`` …) rather than heavyweight
ORM classes — the store is schemaless and the UI owns the presentation.

Keep this file in sync with ``src/types.ts``. Enumerations below are the exact
string unions the frontend expects.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Literal, TypedDict

# --- String unions (mirror src/types.ts) -----------------------------------
Gender = Literal["Male", "Female", "Other"]
CaseStatus = Literal[
    "New",
    "AI Interview",
    "Doctor Review",
    "Awaiting Examination",
    "Awaiting Tests",
    "Diagnosis in Progress",
    "Treatment",
    "Follow-up",
    "Completed",
    "Archived",
]
StageKey = Literal[
    "intake",
    "interview",
    "examination",
    "differential",
    "tests",
    "results",
    "diagnosis",
    "treatment",
    "followup",
    "completion",
]
Priority = Literal["High", "Medium", "Low"]
Importance = Literal["Critical", "Important", "Routine"]
Flag = Literal["normal", "abnormal", "critical"]
Speaker = Literal["ai", "patient", "doctor", "system"]
TestStatus = Literal["recommended", "ordered", "pending", "completed"]

# Cognito groups (design doc section 10.2).
GROUP_PATIENT = "patient"
GROUP_PHYSICIAN = "physician"
GROUP_ADMIN = "admin"
GROUP_COMPLIANCE = "compliance"


# --- TypedDicts (documentation of the JSON document shape) ------------------
class ChatMessage(TypedDict, total=False):
    role: Speaker
    text: str
    time: str


class PatientCase(TypedDict, total=False):
    id: str
    patient: dict[str, Any]
    history: dict[str, Any]
    complaint: dict[str, Any]
    status: CaseStatus
    stage: StageKey
    priority: Priority
    createdAt: str
    updatedAt: str
    chiefComplaint: str
    primaryImpression: str
    interview: list[ChatMessage]
    summary: dict[str, Any]
    vitals: dict[str, Any]
    exams: list[dict[str, Any]]
    diagnoses: list[dict[str, Any]]
    tests: list[dict[str, Any]]
    timeline: list[dict[str, Any]]
    finalDiagnosis: dict[str, Any]
    notes: list[dict[str, Any]]
    insights: list[dict[str, Any]]
    nextSteps: list[str]
    recentUpdates: list[dict[str, Any]]
    assistantThread: list[ChatMessage]
    progress: list[dict[str, Any]]
    # --- Backend-only fields (not rendered by the UI) ---
    lifecycleState: str
    patientId: str
    assignedPhysicianId: str


# --- Helpers ----------------------------------------------------------------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id(prefix: str = "AUR") -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def chat_message(role: Speaker, text: str, time: str | None = None) -> ChatMessage:
    return {"role": role, "text": text, "time": time or _clock()}


def timeline_event(
    title: str, description: str, actor: Speaker, stage: StageKey
) -> dict[str, Any]:
    dt = datetime.now(timezone.utc)
    return {
        "time": dt.strftime("%H:%M"),
        "date": dt.strftime("%b %-d") if _supports_dash_d() else dt.strftime("%b %d"),
        "title": title,
        "description": description,
        "actor": actor,
        "stage": stage,
    }


def recent_update(text: str, actor: Speaker) -> dict[str, Any]:
    return {"time": "just now", "text": text, "actor": actor}


def _clock() -> str:
    return datetime.now(timezone.utc).strftime("%H:%M")


def _supports_dash_d() -> bool:
    try:
        datetime.now().strftime("%-d")
        return True
    except ValueError:  # pragma: no cover - platform dependent
        return False


# Stage order mirrors src/data/helpers.ts STAGE_ORDER.
STAGE_ORDER: list[tuple[str, str]] = [
    ("intake", "Patient Intake"),
    ("interview", "AI Interview"),
    ("examination", "Physical Examination"),
    ("differential", "Differential Diagnosis"),
    ("tests", "Tests Ordered"),
    ("results", "Results Review"),
    ("diagnosis", "Final Diagnosis"),
    ("treatment", "Treatment"),
    ("followup", "Follow-up"),
    ("completion", "Completion"),
]


def build_progress(current: StageKey, completed: bool = False) -> list[dict[str, str]]:
    """Port of ``buildProgress`` from ``src/data/helpers.ts``."""
    idx = next((i for i, (k, _) in enumerate(STAGE_ORDER) if k == current), 0)
    out = []
    for i, (key, label) in enumerate(STAGE_ORDER):
        if completed:
            status = "done"
        elif i < idx:
            status = "done"
        elif i == idx:
            status = "active"
        else:
            status = "pending"
        out.append({"key": key, "label": label, "status": status})
    return out


def new_case(
    *,
    patient: dict[str, Any],
    history: dict[str, Any] | None = None,
    complaint: dict[str, Any] | None = None,
    chief_complaint: str,
    patient_id: str,
    assigned_physician_id: str | None = None,
    case_id: str | None = None,
) -> PatientCase:
    """Build a fresh case document at the ``Intake`` lifecycle state.

    The AI interview, summary, differential, tests and diagnosis are filled in
    later by the workflow resolvers via the ``AIService`` seam.
    """
    ts = now_iso()
    cid = case_id or new_id()
    return {
        "id": cid,
        "patient": patient,
        "history": history or _empty_history(),
        "complaint": complaint or _empty_complaint(),
        "status": "New",
        "stage": "intake",
        "priority": "Medium",
        "createdAt": ts,
        "updatedAt": ts,
        "chiefComplaint": chief_complaint,
        "primaryImpression": "",
        "interview": [],
        "summary": _empty_summary(chief_complaint),
        "vitals": {},
        "exams": [],
        "diagnoses": [],
        "tests": [],
        "timeline": [
            timeline_event(
                "Patient submitted symptoms",
                f"{patient.get('name', 'Patient')} completed intake.",
                "patient",
                "intake",
            )
        ],
        "notes": [],
        "insights": [],
        "nextSteps": [],
        "recentUpdates": [recent_update("Case created from intake", "patient")],
        "assistantThread": [],
        "progress": build_progress("intake"),
        # Backend-only:
        "lifecycleState": "Intake",
        "patientId": patient_id,
    }
    # Only set the physician index key when one is assigned — DynamoDB rejects
    # empty strings on a GSI key attribute (an unassigned case is simply absent
    # from the byPhysician index).
    if assigned_physician_id:
        case["assignedPhysicianId"] = assigned_physician_id
    return case


def _empty_history() -> dict[str, Any]:
    return {
        "previousIllnesses": [],
        "medications": [],
        "allergies": [],
        "familyHistory": [],
        "lifestyle": "",
        "smoking": "",
        "alcohol": "",
        "surgeries": [],
    }


def _empty_complaint() -> dict[str, Any]:
    return {
        "symptoms": [],
        "painScale": 0,
        "duration": "",
        "timeline": "",
        "aggravating": "",
        "relieving": "",
    }


def _empty_summary(chief_complaint: str) -> dict[str, Any]:
    return {
        "chiefComplaint": chief_complaint,
        "hpi": "",
        "relevantHistory": [],
        "medications": [],
        "riskFactors": [],
        "redFlags": [],
        "timeline": [],
        "symptoms": [],
        "findings": [],
    }
