"""BedrockAIService — Amazon Bedrock (Claude) implementation of the AI seam.

This is the file the **AI team owns and tunes**. It wires the workflow to:
  * Bedrock **Converse API** (Claude) for reasoning,
  * Bedrock **Guardrails** for prompt-attack / PII / grounding defense,
  * Bedrock **Knowledge Bases** (``retrieve``) for the curated, versioned corpus.

It intentionally shares the exact contract and output shapes of
:class:`~sehati.ai.stub.StubAIService`, so flipping ``AI_PROVIDER=bedrock`` is
the only change required. Where the model returns free text that must become a
structured object (summary, differential …), we ask for strict JSON and parse
it. Failures (model unavailable, throttled, malformed JSON) are raised as real
errors — this adapter never substitutes fake data for a genuine model response.

Prerequisites (see docs/AWS_DEPLOYMENT.md):
  * Bedrock model access enabled for the chosen Claude model in us-east-1.
  * (Optional) A Guardrail and a Knowledge Base; pass their IDs via env vars.
"""

from __future__ import annotations

import json
import os
from typing import Any

import boto3

from ..models import PatientCase, chat_message
from . import prompts
from .base import AIResult, AIService

# Claude on Bedrock (2026). Override via env to pin a specific model/version.
#
# This must be a cross-region INFERENCE PROFILE id, not the bare foundation-model
# id — Bedrock rejects on-demand invocation of this model with:
#   ValidationException: Invocation of model ID anthropic.claude-sonnet-4-20250514-v1:0
#   with on-demand throughput isn't supported. Retry your request with the ID or
#   ARN of an inference profile that contains this model.
# The "us." prefix selects the US cross-region profile, matching REGION below.
DEFAULT_MODEL_ID = os.environ.get(
    "BEDROCK_MODEL_ID", "us.anthropic.claude-sonnet-4-20250514-v1:0"
)
GUARDRAIL_ID = os.environ.get("BEDROCK_GUARDRAIL_ID", "")
GUARDRAIL_VERSION = os.environ.get("BEDROCK_GUARDRAIL_VERSION", "DRAFT")
KNOWLEDGE_BASE_ID = os.environ.get("BEDROCK_KNOWLEDGE_BASE_ID", "")
REGION = os.environ.get("AWS_REGION", "us-east-1")


def _case_context(case: PatientCase) -> dict[str, Any]:
    """A compact, de-identified-ish view of the case for the prompt.

    We pass clinical content, not identifiers, to the model. Names are dropped;
    the model reasons over the presentation, not the person.
    """
    patient = case.get("patient", {})
    return {
        "age": patient.get("age"),
        "gender": patient.get("gender"),
        "chiefComplaint": case.get("chiefComplaint"),
        "complaint": case.get("complaint"),
        "history": case.get("history"),
        "vitals": case.get("vitals"),
        "summary": case.get("summary"),
        "exams": case.get("exams"),
        "tests": case.get("tests"),
        "diagnoses": [
            {k: d.get(k) for k in ("name", "confidence", "supporting", "contradicting")}
            for d in case.get("diagnoses", [])
        ],
    }


class BedrockAIService(AIService):
    model_version = DEFAULT_MODEL_ID

    def __init__(self) -> None:
        self._runtime = boto3.client("bedrock-runtime", region_name=REGION)
        self._agent = (
            boto3.client("bedrock-agent-runtime", region_name=REGION)
            if KNOWLEDGE_BASE_ID
            else None
        )

    # --- Bedrock plumbing ---------------------------------------------------
    def _retrieve(self, query: str, k: int = 5) -> list[dict[str, Any]]:
        """Retrieve grounding passages from the Knowledge Base (curated corpus)."""
        if not self._agent or not KNOWLEDGE_BASE_ID:
            return []
        try:
            resp = self._agent.retrieve(
                knowledgeBaseId=KNOWLEDGE_BASE_ID,
                retrievalQuery={"text": query},
                retrievalConfiguration={
                    "vectorSearchConfiguration": {"numberOfResults": k}
                },
            )
        except Exception:  # noqa: BLE001 - corpus optional; degrade to no evidence
            return []
        out = []
        for r in resp.get("retrievalResults", []):
            out.append(
                {
                    "text": r.get("content", {}).get("text", ""),
                    "source": r.get("location", {}),
                    "score": r.get("score"),
                }
            )
        return out

    def _converse(
        self,
        *,
        task_instruction: str,
        case: PatientCase,
        physician_question: str | None = None,
        retrieval_query: str | None = None,
    ) -> tuple[str, list[dict[str, Any]]]:
        evidence = self._retrieve(retrieval_query) if retrieval_query else []
        messages = prompts.build_messages(
            task_instruction=task_instruction,
            case_context=_case_context(case),
            retrieved_evidence=evidence,
            physician_question=physician_question,
        )
        kwargs: dict[str, Any] = {
            "modelId": DEFAULT_MODEL_ID,
            "messages": messages,
            "system": [{"text": prompts.SYSTEM_PROMPT}],
            "inferenceConfig": {"maxTokens": 2000, "temperature": 0.2},
        }
        if GUARDRAIL_ID:
            kwargs["guardrailConfig"] = {
                "guardrailIdentifier": GUARDRAIL_ID,
                "guardrailVersion": GUARDRAIL_VERSION,
            }
        resp = self._runtime.converse(**kwargs)
        text = resp["output"]["message"]["content"][0]["text"]
        return text, evidence

    def _converse_json(
        self, *, task_instruction: str, case: PatientCase, retrieval_query: str | None = None
    ) -> tuple[Any, list[dict[str, Any]]]:
        instruction = (
            task_instruction
            + "\n\nRespond with ONLY valid JSON, no prose, no markdown fences."
        )
        text, evidence = self._converse(
            task_instruction=instruction, case=case, retrieval_query=retrieval_query
        )
        return _parse_json(text), evidence

    # --- AIService contract -------------------------------------------------
    def next_interview_question(
        self, case: PatientCase, transcript: list[dict[str, Any]]
    ) -> AIResult:
        asked = sum(1 for m in transcript if m.get("role") == "ai")
        if asked >= 6:
            return AIResult(value=None, model_version=self.model_version)
        instruction = (
            "You are conducting an adaptive patient intake interview. Based on the "
            "case context and transcript so far, ask ONE concise clarifying question "
            "(plain language, patient-friendly). If enough has been gathered, reply "
            "with exactly the token DONE."
        )
        text, _ = self._converse(task_instruction=instruction, case=case)
        if text.strip().upper().startswith("DONE"):
            return AIResult(value=None, model_version=self.model_version)
        return AIResult(
            value=chat_message("ai", text.strip()), model_version=self.model_version
        )

    def build_summary(self, case: PatientCase) -> AIResult:
        instruction = (
            "Produce a structured clinical summary as JSON with keys: chiefComplaint, "
            "hpi, relevantHistory[], medications[], riskFactors[], redFlags[], "
            "timeline[{time,event}], symptoms[], findings[]."
        )
        value, evidence = self._converse_json(task_instruction=instruction, case=case)
        return AIResult(value, self.model_version, evidence)

    def recommend_exams(self, case: PatientCase) -> AIResult:
        instruction = (
            "Recommend physical examinations as a JSON array of objects with keys: "
            "id, name, reason, importance(Critical|Important|Routine), confidence(0-100), "
            "status('pending')."
        )
        value, evidence = self._converse_json(task_instruction=instruction, case=case)
        return AIResult(value, self.model_version, evidence)

    def differential(self, case: PatientCase) -> AIResult:
        instruction = (
            "Produce a PRIORITISED differential as a JSON array of Diagnosis objects "
            "(keys: id, name, confidence, priority, category, tagline, reasoning, "
            "supporting[], contradicting[], missing[], recommendedTests[], "
            "confidenceExplanation, whyNot100, riskAssessment, nextAction, references[], "
            "similarCases[], trend[{label,value}], discussion[]). Every clinical claim must "
            "be grounded in the retrieved evidence; cite only real retrieved passages."
        )
        value, evidence = self._converse_json(
            task_instruction=instruction,
            case=case,
            retrieval_query=case.get("chiefComplaint"),
        )
        return AIResult(value, self.model_version, evidence)

    def recommend_tests(self, case: PatientCase) -> AIResult:
        instruction = (
            "Recommend investigations as a JSON array with keys: id, name, category, reason, "
            "expectedFinding, priority, cost, urgency, diagnosticValue(0-100), "
            "status('recommended')."
        )
        value, evidence = self._converse_json(
            task_instruction=instruction, case=case, retrieval_query=case.get("chiefComplaint")
        )
        return AIResult(value, self.model_version, evidence)

    def rerank_after_results(self, case: PatientCase) -> AIResult:
        instruction = (
            "Test results are now available in the case context. Re-reason and return the "
            "UPDATED prioritised differential in the same Diagnosis JSON array shape, "
            "adjusting confidence and adding a trend point labelled 'Results'."
        )
        value, evidence = self._converse_json(
            task_instruction=instruction, case=case, retrieval_query=case.get("chiefComplaint")
        )
        return AIResult(value, self.model_version, evidence)

    def propose_final_diagnosis(self, case: PatientCase) -> AIResult:
        instruction = (
            "Propose a final diagnosis as a JSON FinalDiagnosis object (keys: name, confidence, "
            "status('proposed'), reasoning, evidenceSummary[], ruledOut[{name,reason}], "
            "treatment[], monitoring[], complications[], followUp[]). Confidence is a qualitative "
            "judgment, not a validated probability."
        )
        value, evidence = self._converse_json(
            task_instruction=instruction, case=case, retrieval_query=case.get("chiefComplaint")
        )
        return AIResult(value, self.model_version, evidence)

    def answer(
        self, case: PatientCase, question: str, diagnosis_id: str | None = None
    ) -> AIResult:
        instruction = (
            "Answer the physician's question about this case. Reason first, be honest about "
            "uncertainty, ground claims in the retrieved evidence, and never fabricate a citation."
        )
        text, evidence = self._converse(
            task_instruction=instruction,
            case=case,
            physician_question=question,
            retrieval_query=question,
        )
        return AIResult(chat_message("ai", text.strip()), self.model_version, evidence)


def _parse_json(text: str) -> Any:
    """Tolerant JSON extraction (handles accidental markdown fences)."""
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lstrip().lower().startswith("json"):
            text = text.lstrip()[4:]
    start = min(
        (i for i in (text.find("{"), text.find("[")) if i != -1),
        default=-1,
    )
    if start > 0:
        text = text[start:]
    return json.loads(text)
