"""The AI contract.

Every method returns an :class:`AIResult`, which carries the payload plus the
provenance the audit trail and feedback flywheel require: the ``model_version``
that produced it and the ``retrieved_context`` (grounding passages) it was based
on. Grounding is not optional decoration — it is the regulatory linchpin
(design doc sections 9.5 and 14): the physician must be able to independently
review the basis for every recommendation.

The one implementation that ships is :class:`~sehati.ai.bedrock.BedrockAIService`
(Amazon Bedrock, Claude, + Guardrails + Knowledge Bases; owned and tuned by the
AI team). Tests substitute a double at the ``factory.get_ai_service`` seam
instead of a second production implementation.
"""

from __future__ import annotations

import abc
from dataclasses import dataclass, field
from typing import Any

from ..models import PatientCase


@dataclass
class AIResult:
    """A model output plus its provenance."""

    value: Any
    model_version: str = "unknown"
    #: Grounding passages / citations used to produce ``value`` (may be empty).
    retrieved_context: list[dict[str, Any]] = field(default_factory=list)


class AIService(abc.ABC):
    """Interface the workflow resolvers call. Never touches the datastore."""

    #: Human-readable identifier recorded in the audit trail.
    model_version: str = "abstract"

    @abc.abstractmethod
    def next_interview_question(
        self, case: PatientCase, transcript: list[dict[str, Any]]
    ) -> AIResult:
        """Return the next adaptive clarifying question, or ``None`` when the
        interview has gathered enough to build a summary.

        This runs on the **patient-facing** path and MUST NOT read other cases
        or use any data-access tools (design doc section 10.2)."""

    @abc.abstractmethod
    def build_summary(self, case: PatientCase) -> AIResult:
        """Produce a structured clinical summary (``StructuredSummary`` shape)
        from the intake + interview transcript."""

    @abc.abstractmethod
    def recommend_exams(self, case: PatientCase) -> AIResult:
        """Return a list of recommended physical examinations
        (``ExamRecommendation`` shape)."""

    @abc.abstractmethod
    def differential(self, case: PatientCase) -> AIResult:
        """Return a ranked differential (list of ``Diagnosis``) with rationale,
        supporting/contradicting evidence, confidence and grounded references."""

    @abc.abstractmethod
    def recommend_tests(self, case: PatientCase) -> AIResult:
        """Return recommended investigations (``TestRecommendation`` shape)."""

    @abc.abstractmethod
    def rerank_after_results(self, case: PatientCase) -> AIResult:
        """Re-reason over the case now that test results are in; return the
        updated differential."""

    @abc.abstractmethod
    def propose_final_diagnosis(self, case: PatientCase) -> AIResult:
        """Propose a final diagnosis (``FinalDiagnosis`` shape) with an honest,
        qualitative confidence band and the evidence summary."""

    @abc.abstractmethod
    def answer(
        self, case: PatientCase, question: str, diagnosis_id: str | None = None
    ) -> AIResult:
        """Answer a physician's free-text question. When ``diagnosis_id`` is
        given the answer is scoped to that diagnosis (explainability dialogue);
        otherwise it is a case-level assistant reply."""

    @abc.abstractmethod
    def chat(
        self, case: PatientCase, conversation_messages: list[dict[str, Any]]
    ) -> AIResult:
        """Free-form patient-facing reply within one named side conversation
        (a return visit / follow-up chat layered on top of the primary
        intake interview — see ``PatientCase.conversations``). Distinct from
        ``next_interview_question`` (the fixed intake sequence, which drives
        lifecycle) and ``answer`` (physician-facing explainability). Must be
        grounded in the case's own data like every other seam method."""
