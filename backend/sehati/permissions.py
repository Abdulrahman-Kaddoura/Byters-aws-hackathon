"""The fine-grained permission catalog for the admin panel's custom groups.

This sits *alongside* Cognito's 4 groups (``models.GROUP_*``), not on top of
them. Cognito's groups stay the coarse "kind of identity" that drives
row-level security (patient vs. clinical staff) in the data layer — they are
not admin-editable. Custom groups defined here are a separate, admin-CRUD'd
concept: a named bundle of permission keys from the fixed catalog below, which
a user can belong to (many-to-many), with optional per-user overrides on top.
See ``context.AuthContext.require_permission`` for the enforcement side and
``db.users_repo.effective_permissions`` for how a user's final permission set
is computed.

The catalog is fixed (not admin-definable) because each key corresponds 1:1
to a real gate in a resolver or repo — see the comment on each entry.
"""

from __future__ import annotations

# --- Permission catalog ------------------------------------------------------
CASES_MANAGE_STATE = "cases.manage_state"  # resolvers/cases.py: set_case_state
CASES_ADD_NOTE = "cases.add_note"  # resolvers/cases.py: add_note
EXAMS_MANAGE = "exams.manage"  # resolvers/exams.py: recommend_exams, record_exam_finding
DIAGNOSES_MANAGE = "diagnoses.manage"  # resolvers/diagnosis.py: request_recommendations, ask_diagnosis, rerank_after_results, propose_final_diagnosis
FINAL_DIAGNOSIS_ACCEPT = "final_diagnosis.accept"  # resolvers/diagnosis.py: accept_final_diagnosis
TESTS_MANAGE = "tests.manage"  # resolvers/tests.py: order_test, record_test_result
ASSISTANT_CHAT = "assistant.chat"  # resolvers/collab.py: assistant_chat
RECOMMENDATIONS_RECORD = "recommendations.record"  # resolvers/collab.py: accept_recommendation, reject_recommendation
AUDIT_VIEW = "audit.view"  # db/audit_repo.py: list_for_case
USERS_MANAGE = "users.manage"  # resolvers/admin.py: everything (this panel itself)
RESOURCES_MANAGE = "resources.manage"  # resolvers/resources.py: list/upload/delete the shared reference library

PERMISSIONS: tuple[str, ...] = (
    CASES_MANAGE_STATE,
    CASES_ADD_NOTE,
    EXAMS_MANAGE,
    DIAGNOSES_MANAGE,
    FINAL_DIAGNOSIS_ACCEPT,
    TESTS_MANAGE,
    ASSISTANT_CHAT,
    RECOMMENDATIONS_RECORD,
    AUDIT_VIEW,
    USERS_MANAGE,
    RESOURCES_MANAGE,
)

# Human-readable labels for the admin UI's permission checklist.
PERMISSION_LABELS: dict[str, str] = {
    CASES_MANAGE_STATE: "Move a case to another lifecycle state",
    CASES_ADD_NOTE: "Add a doctor's note to a case",
    EXAMS_MANAGE: "Recommend and record physical exam findings",
    DIAGNOSES_MANAGE: "Generate/interrogate/re-rank the differential and propose a final diagnosis",
    FINAL_DIAGNOSIS_ACCEPT: "Sign off (accept) the final diagnosis and close a case",
    TESTS_MANAGE: "Order tests and record results",
    ASSISTANT_CHAT: "Use the case-level AI assistant chat",
    RECOMMENDATIONS_RECORD: "Accept/reject AI recommendations (feedback)",
    AUDIT_VIEW: "Read a case's audit trail",
    USERS_MANAGE: "Manage user accounts and permission groups (this admin panel)",
    RESOURCES_MANAGE: "Upload/delete reference documents in the shared knowledge base",
}

_PERMISSION_SET = frozenset(PERMISSIONS)


def is_valid_permission(key: str) -> bool:
    return key in _PERMISSION_SET


# --- Seed data: 4 system groups reproducing today's role behavior exactly ---
_CLINICAL_STAFF_PERMISSIONS = (
    CASES_MANAGE_STATE,
    CASES_ADD_NOTE,
    EXAMS_MANAGE,
    DIAGNOSES_MANAGE,
    TESTS_MANAGE,
    ASSISTANT_CHAT,
    RECOMMENDATIONS_RECORD,
    RESOURCES_MANAGE,
)

# Keyed by Cognito group name (models.GROUP_*) — the system group a newly
# created user defaults into based on the Cognito role picked for them.
SYSTEM_GROUPS: dict[str, dict[str, object]] = {
    "physician": {
        "id": "system-physician",
        "name": "Physician",
        "description": "Full clinical workflow, including signing off the final diagnosis.",
        "permissions": (*_CLINICAL_STAFF_PERMISSIONS, FINAL_DIAGNOSIS_ACCEPT),
    },
    "compliance": {
        "id": "system-compliance",
        "name": "Compliance",
        "description": "Full clinical workflow plus audit trail access; cannot sign off a final diagnosis.",
        "permissions": (*_CLINICAL_STAFF_PERMISSIONS, AUDIT_VIEW),
    },
    "admin": {
        "id": "system-admin",
        "name": "Administrator",
        "description": "Everything, including user and permission-group management.",
        "permissions": PERMISSIONS,
    },
    "patient": {
        "id": "system-patient",
        "name": "Patient",
        "description": "No clinical-staff permissions. Patients act on their own case only, enforced by case ownership rather than this permission system.",
        "permissions": (),
    },
}
