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
    feedback,
    interview,
    me,
    resources,
    settings,
    tests,
    transcribe,
)

Resolver = Callable[[AuthContext, dict[str, Any]], Any]

ROUTES: dict[str, Resolver] = {
    # Who am I / what may I do (the frontend's permission source of truth)
    "me": me.me,
    # Queries
    "listCases": cases.list_cases,
    "getCase": cases.get_case,
    "caseAudit": cases.case_audit,
    "listDoctors": cases.list_doctors,
    # Case lifecycle
    "submitIntake": cases.submit_intake,
    "assignCase": cases.assign_case,
    "setCaseTags": cases.set_case_tags,
    "setCaseState": cases.set_case_state,
    "addNote": cases.add_note,
    # Interview
    "getInterview": interview.get_interview,
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
    "listCaseDocuments": documents.list_case_documents,
    "getCaseDocument": documents.get_case_document,
    "deleteCaseDocument": documents.delete_case_document,
    "uploadCaseAudio": documents.upload_case_audio,
    # Transcription (AWS HealthScribe)
    "startTranscription": transcribe.transcribe_audio,
    "transcriptionStatus": transcribe.transcription_status,
    # Doctor feedback
    "submitFeedback": feedback.submit_feedback,
    # Shared reference-document library (AI grounding evidence)
    "listResources": resources.list_resources,
    "uploadResource": resources.upload_resource,
    "deleteResource": resources.delete_resource,
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
    "adminGetSettings": settings.get_settings,
    "adminUpdateSettings": settings.update_settings,
    # Patient-interview (kiosk) lock
    "kioskStatus": settings.kiosk_status,
    "kioskExit": settings.kiosk_exit,
}


def resolve(field_name: str, ctx: AuthContext, args: dict[str, Any]) -> Any:
    resolver = ROUTES.get(field_name)
    if resolver is None:
        from .errors import ValidationError

        raise ValidationError(f"No resolver registered for field '{field_name}'.")
    return resolver(ctx, args)
