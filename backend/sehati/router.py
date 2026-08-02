"""Maps API route field names to resolver functions.

Every API Gateway route dispatches to this one Lambda, which the handler
routes to a field name via its (method, resource) table. Each resolver has
the signature ``(ctx: AuthContext, args: dict) -> Any``.
"""

from __future__ import annotations

from typing import Any, Callable

from .context import AuthContext
from .resolvers import (
    admin,
    cases,
    collab,
    conversations,
    diagnosis,
    documents,
    exams,
    interview,
    tests,
)

Resolver = Callable[[AuthContext, dict[str, Any]], Any]

ROUTES: dict[str, Resolver] = {
    # Queries
    "listCases": cases.list_cases,
    "getCase": cases.get_case,
    "caseAudit": cases.case_audit,
    # Case lifecycle
    "submitIntake": cases.submit_intake,
    "setCaseState": cases.set_case_state,
    "addNote": cases.add_note,
    # Interview
    "postInterviewMessage": interview.post_interview_message,
    "generateSummary": interview.generate_summary,
    # Side conversations (return visits / follow-ups, additive to interview)
    "createConversation": conversations.create_conversation,
    "postConversationMessage": conversations.post_conversation_message,
    # Examination
    "recommendExams": exams.recommend_exams,
    "recordExamFinding": exams.record_exam_finding,
    # Diagnosis
    "requestRecommendations": diagnosis.request_recommendations,
    "askDiagnosis": diagnosis.ask_diagnosis,
    "rerankAfterResults": diagnosis.rerank_after_results,
    "proposeFinalDiagnosis": diagnosis.propose_final_diagnosis,
    "acceptFinalDiagnosis": diagnosis.accept_final_diagnosis,
    # Tests
    "orderTest": tests.order_test,
    "recordTestResult": tests.record_test_result,
    # Collaboration + feedback
    "assistantChat": collab.assistant_chat,
    "acceptRecommendation": collab.accept_recommendation,
    "rejectRecommendation": collab.reject_recommendation,
    # Documents
    "uploadCaseDocument": documents.upload_case_document,
    # Admin panel — users + custom permission groups
    "adminListUsers": admin.list_users,
    "adminCreateUser": admin.create_user,
    "adminGetUser": admin.get_user,
    "adminUpdateUser": admin.update_user,
    "adminListGroups": admin.list_groups,
    "adminCreateGroup": admin.create_group,
    "adminUpdateGroup": admin.update_group,
    "adminDeleteGroup": admin.delete_group,
    "adminListPermissions": admin.list_permissions,
}


def resolve(field_name: str, ctx: AuthContext, args: dict[str, Any]) -> Any:
    resolver = ROUTES.get(field_name)
    if resolver is None:
        from .errors import ValidationError

        raise ValidationError(f"No resolver registered for field '{field_name}'.")
    return resolver(ctx, args)
