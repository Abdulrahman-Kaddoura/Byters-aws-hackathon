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
# "ordered" is the doctor saying "this is running, I'm waiting on the result";
# "declined" is them saying they chose not to run it. Both keep a decision on
# the record rather than leaving a recommendation dangling forever.
TestStatus = Literal["recommended", "ordered", "pending", "declined", "completed"]

# Cognito groups — the three kinds of person who hold an account. Patients
# never log in: a nurse admits them and hands over her own device for the AI
# interview, so there is no patient identity to model here.
GROUP_DOCTOR = "doctor"
GROUP_NURSE = "nurse"
GROUP_ADMIN = "admin"

ROLES: tuple[str, ...] = (GROUP_DOCTOR, GROUP_NURSE, GROUP_ADMIN)

# The one fixed, always-available admin account, provisioned by
# scripts/bootstrap_admin.py. See resolvers/admin.py and handler.py: it can't
# be demoted, disabled, or stripped of user-management access through the
# admin panel, and always has full permissions regardless of its stored
# group/override state — so the hospital can never fully lock itself out of
# /admin.
SUPER_ADMIN_USERNAME = "admin"


# --- TypedDicts (documentation of the JSON document shape) ------------------
class ChatMessage(TypedDict, total=False):
    role: Speaker
    text: str
    time: str


class Conversation(TypedDict, total=False):
    """A single extra chat session on a case, layered on top of the primary
    intake `interview` — a return visit or follow-up question, not the first
    interview (that stays on `PatientCase.interview` and keeps driving the
    lifecycle state machine unchanged)."""

    id: str
    title: str
    createdAt: str
    updatedAt: str
    messages: list[ChatMessage]


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
    conversations: list[Conversation]
    progress: list[dict[str, Any]]
    documents: list[dict[str, Any]]
    # The doctor's own consultation with the patient, transcribed — a second
    # source of history alongside `interview`. See resolvers/consultation.py.
    consultation: dict[str, Any]
    # Which round of investigations the workup is on. Bumped by the results
    # analysis when the results in hand don't settle the question.
    testRound: int
    # The last results analysis's verdict + message (resolvers/diagnosis.py).
    analysis: dict[str, Any]
    # Why the doctor reopened a case that was on treatment.
    reopenReason: str
    # --- Backend-only fields (not rendered by the UI) ---
    lifecycleState: str
    # The nurse who admitted this patient. Indexed (byNurse) so the admissions
    # desk can list its own intake without scanning.
    createdByNurseId: str
    # The one doctor this case is routed to. This is an *access boundary*, not
    # a filter: db/cases_repo._visible_to lets a doctor read only their own.
    assignedPhysicianId: str
    assignedAt: str
    assignedBy: str


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


# --- Diagnosis / final-diagnosis defaulting ----------------------------------
# Fields the frontend (src/types.ts Diagnosis / FinalDiagnosis) always reads
# unconditionally (`.length`, `.map`) — the model is asked for all of these
# but, being free text turned into JSON, sometimes leaves one out entirely, or
# emits an explicit `null` (both of which the frontend sees as a missing
# array). Every diagnosis/final-diagnosis gets defaulted through here — both
# when an AI call site first stores one (resolvers/diagnosis.py) and again
# whenever a case is read back (db/cases_repo.py) — so a record written before
# this defaulting existed, or one an AI call left incomplete, still renders.
# Arrays the UI renders one entry at a time as a React child — they must be
# plain strings or React throws. See coerce_text_list.
DIAGNOSIS_TEXT_LIST_FIELDS = (
    "supporting",
    "contradicting",
    "missing",
    "recommendedTests",
)
# Arrays of objects, read field by field; defaulted but never flattened.
DIAGNOSIS_OBJECT_LIST_FIELDS = (
    "references",
    "similarCases",
    "trend",
    "discussion",
)
DIAGNOSIS_LIST_FIELDS = DIAGNOSIS_TEXT_LIST_FIELDS + DIAGNOSIS_OBJECT_LIST_FIELDS
DIAGNOSIS_STR_FIELDS = (
    "name",
    "category",
    "tagline",
    "reasoning",
    "confidenceExplanation",
    "whyNot100",
    "riskAssessment",
    "nextAction",
)
FINAL_DIAGNOSIS_TEXT_LIST_FIELDS = (
    "evidenceSummary",
    "treatment",
    "monitoring",
    "complications",
    "followUp",
)
FINAL_DIAGNOSIS_LIST_FIELDS = FINAL_DIAGNOSIS_TEXT_LIST_FIELDS + ("ruledOut",)


# Keys that carry no meaning in a rendered bullet — a score attached to a
# treatment line is noise once the line is prose, and an id is never prose.
_TEXT_NOISE_KEYS = frozenset(
    {"confidence", "score", "probability", "certainty", "id", "priority", "rank"}
)

# Preferred reading order when an object has to be flattened into one line, so
# "Review chest X-ray — in 2 weeks" comes out that way round rather than
# "in 2 weeks — Review chest X-ray". Keys not listed keep their own order,
# after these.
_TEXT_PRIMARY_KEYS = (
    "name", "title", "item", "test", "parameter", "action", "step",
    "finding", "text", "description", "detail", "details", "value",
    "reason", "rationale", "note", "dose", "dosage", "route",
    "frequency", "duration", "timing", "when",
)


def _flatten_to_text(value: Any) -> str:
    """Render one AI-produced list entry as a single line of prose.

    The prompts ask for arrays of plain strings, but the model reaches for an
    object whenever the item has structure — a treatment becomes
    ``{"name": ..., "details": ..., "confidence": 85}``, a monitoring item
    becomes ``{"parameter": ..., "frequency": ...}``. ``src/types.ts`` types
    all of these as ``string[]`` and the UI renders each entry directly as a
    React child, so an object there is not a cosmetic problem: React throws
    (minified error #31) and the whole Diagnosis tab goes blank.

    Rather than drop the content, flatten it — the doctor still gets the dose
    and the frequency, just as one line.
    """
    if value is None or isinstance(value, bool):
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, (list, tuple)):
        return "; ".join(part for part in (_flatten_to_text(v) for v in value) if part)
    if isinstance(value, dict):
        remaining = [k for k in value if k not in _TEXT_PRIMARY_KEYS]
        ordered = [k for k in _TEXT_PRIMARY_KEYS if k in value] + remaining
        parts: list[str] = []
        for key in ordered:
            if key.lower() in _TEXT_NOISE_KEYS:
                continue
            part = _flatten_to_text(value[key])
            if part and part not in parts:
                parts.append(part)
        return " — ".join(parts)
    return str(value).strip()


def coerce_text_list(value: Any) -> list[str]:
    """Coerce an AI-produced list into the ``string[]`` the frontend expects."""
    if value is None:
        return []
    if isinstance(value, (str, dict)):
        value = [value]
    if not isinstance(value, (list, tuple)):
        return []
    return [line for line in (_flatten_to_text(v) for v in value) if line]


def coerce_ruled_out(value: Any) -> list[dict[str, str]]:
    """Normalise ``ruledOut`` to the ``{name, reason}`` pairs the UI reads.

    A bare string here renders as two blank lines rather than crashing, so it
    is quieter than the arrays above — and just as wrong.
    """
    if not isinstance(value, (list, tuple)):
        return []
    out: list[dict[str, str]] = []
    for item in value:
        if isinstance(item, dict):
            name = _flatten_to_text(
                next((item[k] for k in ("name", "diagnosis", "title", "condition") if item.get(k)), "")
            )
            reason = _flatten_to_text(
                next((item[k] for k in ("reason", "rationale", "why", "explanation") if item.get(k)), "")
            )
            if not name and not reason:
                name = _flatten_to_text(item)
        else:
            name, reason = _flatten_to_text(item), ""
        if name or reason:
            out.append({"name": name, "reason": reason})
    return out


def coerce_confidence(value: Any) -> int:
    """Coerce whatever the model emitted for a confidence into a 0-100 integer.

    The prompts ask for an integer percentage, but a language model asked for a
    "confidence" reaches for a probability just as readily, and it has also been
    seen returning the string ``"82%"``. Left alone, ``0.82`` renders as a bar
    that is 0.82% wide with the label ``0.82%`` next to it — which is what the
    confidence looking like zero on every diagnosis actually was. Normalising
    here rather than at the call site means it applies on read too
    (``db/cases_repo._normalize_case``), so cases already stored with a 0-1
    confidence render correctly without a backfill.
    """
    if isinstance(value, bool) or value is None:
        return 0
    if isinstance(value, str):
        cleaned = value.strip().rstrip("%").strip()
        try:
            value = float(cleaned)
        except ValueError:
            return 0
    if not isinstance(value, (int, float)):
        return 0
    # A value in (0, 1] is a probability, not a percentage. 1 itself is
    # ambiguous — read it as 1%, since a model that means certainty writes 100.
    if 0 < value < 1:
        value = value * 100
    return max(0, min(100, round(value)))


def normalize_diagnosis(d: dict[str, Any]) -> dict[str, Any]:
    d = dict(d)
    d["id"] = d.get("id") or new_id("DX")
    d["confidence"] = coerce_confidence(d.get("confidence"))
    d["priority"] = d.get("priority") or "Medium"
    for field in DIAGNOSIS_STR_FIELDS:
        d[field] = _flatten_to_text(d.get(field))
    for field in DIAGNOSIS_TEXT_LIST_FIELDS:
        d[field] = coerce_text_list(d.get(field))
    for field in DIAGNOSIS_OBJECT_LIST_FIELDS:
        d[field] = d.get(field) or []
    return d


def normalize_diagnoses(diagnoses: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    return [normalize_diagnosis(d) for d in (diagnoses or [])]


def normalize_final_diagnosis(d: dict[str, Any]) -> dict[str, Any]:
    d = dict(d)
    d["name"] = _flatten_to_text(d.get("name"))
    d["confidence"] = coerce_confidence(d.get("confidence"))
    d["reasoning"] = _flatten_to_text(d.get("reasoning"))
    for field in FINAL_DIAGNOSIS_TEXT_LIST_FIELDS:
        d[field] = coerce_text_list(d.get(field))
    d["ruledOut"] = coerce_ruled_out(d.get("ruledOut"))
    d["status"] = d.get("status") or "proposed"
    return d


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
    vitals: dict[str, Any] | None = None,
    created_by_nurse_id: str | None = None,
    assigned_physician_id: str | None = None,
    case_id: str | None = None,
) -> PatientCase:
    """Build a fresh case document at the ``Intake`` lifecycle state.

    The AI interview, summary, differential, tests and diagnosis are filled in
    later by the workflow resolvers via the ``AIService`` seam.
    """
    ts = now_iso()
    cid = case_id or new_id()
    case: PatientCase = {
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
        "vitals": vitals or {},
        "exams": [],
        "diagnoses": [],
        "tests": [],
        "timeline": [
            timeline_event(
                "Patient admitted",
                f"{patient.get('name', 'Patient')} was admitted and their details recorded.",
                "system",
                "intake",
            )
        ],
        "notes": [],
        "insights": [],
        "nextSteps": [],
        "recentUpdates": [recent_update("Patient admitted at intake", "system")],
        "assistantThread": [],
        "documents": [],
        "progress": build_progress("intake"),
        "consultation": {"prompted": False},
        "testRound": 1,
        # Backend-only:
        "lifecycleState": "Intake",
    }
    # Only set index keys when they have a value — DynamoDB rejects empty
    # strings on a GSI key attribute (an unassigned case is simply absent from
    # the byPhysician index until a nurse routes it).
    if created_by_nurse_id:
        case["createdByNurseId"] = created_by_nurse_id
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
