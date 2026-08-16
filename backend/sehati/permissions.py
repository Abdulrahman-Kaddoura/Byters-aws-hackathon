"""The fine-grained permission catalog for the admin panel's custom groups.

This sits *alongside* Cognito's 3 groups (``models.ROLES``), not on top of
them. Cognito's groups stay the coarse "kind of identity" that drives
row-level security (which cases you can reach at all) in the data layer — they
are not admin-editable. Custom groups defined here are a separate, admin-CRUD'd
concept: a named bundle of permission keys from the fixed catalog below, which
a user can belong to (many-to-many), with optional per-user overrides on top.
See ``context.AuthContext.require_permission`` for the enforcement side and
``db.users_repo.effective_permissions`` for how a user's final permission set
is computed.

The catalog is fixed (not admin-definable) because each key corresponds 1:1
to a real gate in a resolver or repo — see the comment on each entry.
"""

from __future__ import annotations

from .models import GROUP_ADMIN, GROUP_DOCTOR, GROUP_NURSE

# --- Permission catalog ------------------------------------------------------
CASES_CREATE = "cases.create"  # resolvers/cases.py: submit_intake (the nurse's admission form)
CASES_ASSIGN = "cases.assign"  # resolvers/cases.py: assign_case, list_doctors
CASES_VIEW_CLINICAL = "cases.view_clinical"  # db/cases_repo.py: project_for_role — the doctor/nurse divide
CASES_MANAGE_STATE = "cases.manage_state"  # resolvers/cases.py: set_case_state
CASES_ADD_NOTE = "cases.add_note"  # resolvers/cases.py: add_note
EXAMS_MANAGE = "exams.manage"  # resolvers/exams.py: recommend_exams, record_exam_finding
DIAGNOSES_MANAGE = "diagnoses.manage"  # resolvers/diagnosis.py: request_recommendations, ask_diagnosis, rerank_after_results, propose_final_diagnosis
FINAL_DIAGNOSIS_ACCEPT = "final_diagnosis.accept"  # resolvers/diagnosis.py: accept_final_diagnosis
TESTS_MANAGE = "tests.manage"  # resolvers/tests.py: order_test, record_test_result
ASSISTANT_CHAT = "assistant.chat"  # resolvers/collab.py: assistant_chat
RECOMMENDATIONS_RECORD = "recommendations.record"  # resolvers/collab.py: accept_recommendation, reject_recommendation
DOCUMENTS_MANAGE = "documents.manage"  # resolvers/documents.py: upload/list/download case documents
AUDIT_VIEW = "audit.view"  # db/audit_repo.py: list_for_case
USERS_MANAGE = "users.manage"  # resolvers/admin.py: everything (this panel itself)
SETTINGS_MANAGE = "settings.manage"  # resolvers/settings.py: the kiosk exit password
RESOURCES_MANAGE = "resources.manage"  # resolvers/resources.py: list/upload/delete the shared reference library

PERMISSIONS: tuple[str, ...] = (
    CASES_CREATE,
    CASES_ASSIGN,
    CASES_VIEW_CLINICAL,
    CASES_MANAGE_STATE,
    CASES_ADD_NOTE,
    EXAMS_MANAGE,
    DIAGNOSES_MANAGE,
    FINAL_DIAGNOSIS_ACCEPT,
    TESTS_MANAGE,
    ASSISTANT_CHAT,
    RECOMMENDATIONS_RECORD,
    DOCUMENTS_MANAGE,
    AUDIT_VIEW,
    USERS_MANAGE,
    SETTINGS_MANAGE,
    RESOURCES_MANAGE,
)

# Human-readable labels for the admin UI's permission checklist.
PERMISSION_LABELS: dict[str, str] = {
    CASES_CREATE: "Admit a patient and record their intake details",
    CASES_ASSIGN: "Assign or reassign a case to a doctor",
    CASES_VIEW_CLINICAL: "See a case's clinical content (interview, differential, tests, diagnosis)",
    CASES_MANAGE_STATE: "Move a case to another lifecycle state",
    CASES_ADD_NOTE: "Add a doctor's note to a case",
    EXAMS_MANAGE: "Recommend and record physical exam findings",
    DIAGNOSES_MANAGE: "Generate/interrogate/re-rank the differential and propose a final diagnosis",
    FINAL_DIAGNOSIS_ACCEPT: "Sign off (accept) the final diagnosis and close a case",
    TESTS_MANAGE: "Order tests and record results",
    ASSISTANT_CHAT: "Use the case-level AI assistant chat",
    RECOMMENDATIONS_RECORD: "Accept/reject AI recommendations (feedback)",
    DOCUMENTS_MANAGE: "Upload and read documents attached to a case",
    AUDIT_VIEW: "Read a case's audit trail",
    USERS_MANAGE: "Manage user accounts and permission groups (this admin panel)",
    SETTINGS_MANAGE: "Change hospital-wide settings, including the interview exit password",
    RESOURCES_MANAGE: "Upload/delete reference documents in the shared knowledge base",
}

_PERMISSION_SET = frozenset(PERMISSIONS)


def is_valid_permission(key: str) -> bool:
    return key in _PERMISSION_SET


# --- Seed data: the 3 system groups backing the 3 roles ---------------------
# A doctor owns the whole clinical workflow on the cases routed to them.
_DOCTOR_PERMISSIONS = (
    CASES_VIEW_CLINICAL,
    CASES_MANAGE_STATE,
    CASES_ADD_NOTE,
    EXAMS_MANAGE,
    DIAGNOSES_MANAGE,
    FINAL_DIAGNOSIS_ACCEPT,
    TESTS_MANAGE,
    ASSISTANT_CHAT,
    RECOMMENDATIONS_RECORD,
    DOCUMENTS_MANAGE,
    RESOURCES_MANAGE,
)

# A nurse runs the admissions desk: admit, attach paperwork, route to a doctor.
# Deliberately *without* CASES_VIEW_CLINICAL — that single key is what strips
# the clinical content out of every case she reads (db/cases_repo.project_for_role).
_NURSE_PERMISSIONS = (
    CASES_CREATE,
    CASES_ASSIGN,
    DOCUMENTS_MANAGE,
)

# Keyed by Cognito group name (models.ROLES) — the system group a newly
# created user defaults into based on the role picked for them.
SYSTEM_GROUPS: dict[str, dict[str, object]] = {
    GROUP_DOCTOR: {
        "id": "system-doctor",
        "name": "Doctor",
        "description": "Full clinical workflow on assigned cases, including signing off the final diagnosis.",
        "permissions": _DOCTOR_PERMISSIONS,
    },
    GROUP_NURSE: {
        "id": "system-nurse",
        "name": "Nurse",
        "description": "Admit patients, record intake details and vitals, attach documents, and route cases to a doctor. Cannot see clinical content.",
        "permissions": _NURSE_PERMISSIONS,
    },
    GROUP_ADMIN: {
        "id": "system-admin",
        "name": "Administrator",
        "description": "Everything, including user management, hospital settings, and the audit trail.",
        "permissions": PERMISSIONS,
    },
}
