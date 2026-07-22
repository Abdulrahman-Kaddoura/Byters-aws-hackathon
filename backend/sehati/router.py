"""Maps GraphQL field names to resolver functions.

AppSync is configured with **Direct Lambda Resolvers**: every query/mutation
field routes to this one Lambda, which dispatches on ``event.info.fieldName``.
No VTL templates are involved. Each resolver has the signature
``(ctx: AuthContext, args: dict) -> Any``.
"""

from __future__ import annotations

from typing import Any, Callable

from .context import AuthContext
from .resolvers import cases, collab, diagnosis, exams, interview, tests

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
    # Real-time fan-out (subscription triggers). Passthrough: AppSync delivers
    # the returned payload to subscribers of the matching subscription.
    "publishCaseUpdate": collab.publish_case_update,
    "publishMessage": collab.publish_message,
}


def resolve(field_name: str, ctx: AuthContext, args: dict[str, Any]) -> Any:
    resolver = ROUTES.get(field_name)
    if resolver is None:
        from .errors import ValidationError

        raise ValidationError(f"No resolver registered for field '{field_name}'.")
    return resolver(ctx, args)
