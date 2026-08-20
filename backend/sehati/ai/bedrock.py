"""BedrockAIService — Amazon Bedrock (Claude) implementation of the AI seam.

This is the file the **AI team owns and tunes**. It wires the workflow to:
  * Bedrock **Converse API** (Claude) for reasoning,
  * Bedrock **Guardrails** for prompt-attack / PII / grounding defense,
  * Bedrock **Knowledge Bases** (``retrieve``) for the curated, versioned corpus,
  * the shared reference-document library (``db/resources_repo.py``) — a
    lighter-weight alternative/complement to a Knowledge Base: clinical staff
    upload a doc (e.g. a guideline for a specific condition) via
    ``resolvers/resources.py``, tagged with the topics it covers, and it's
    keyword-matched in here alongside any Knowledge Base results.

It implements the :class:`~sehati.ai.base.AIService` contract. Where the model
returns free text that must become a structured object (summary, differential
…), we ask for strict JSON and parse it. Failures (model unavailable,
throttled, malformed JSON) are raised as real errors — this adapter never
substitutes fake data for a genuine model response.

Prerequisites (see docs/AWS_DEPLOYMENT.md):
  * Bedrock model access enabled for the chosen Claude model in us-east-1.
  * (Optional) A Guardrail and a Knowledge Base; pass their IDs via env vars.
"""

from __future__ import annotations

import json
import os
from typing import Any

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from ..errors import AIServiceError
from ..models import PatientCase, chat_message
from . import prompts
from .base import AIResult, AIService

# Claude on Bedrock (2026). Override via env to pin a specific model/version.
DEFAULT_MODEL_ID = os.environ.get(
    "BEDROCK_MODEL_ID", "anthropic.claude-sonnet-4-20250514-v1:0"
)
GUARDRAIL_ID = os.environ.get("BEDROCK_GUARDRAIL_ID", "")
GUARDRAIL_VERSION = os.environ.get("BEDROCK_GUARDRAIL_VERSION", "DRAFT")
KNOWLEDGE_BASE_ID = os.environ.get("BEDROCK_KNOWLEDGE_BASE_ID", "")
REGION = os.environ.get("AWS_REGION", "us-east-1")


def _case_context(case: PatientCase) -> dict[str, Any]:
    """A compact, de-identified-ish view of the case for the prompt.

    We pass clinical content, not identifiers, to the model. Names are dropped;
    the model reasons over the presentation, not the person.

    Two sources of history sit side by side here on purpose. ``interview`` is
    what the patient told the AI on the nurse's device; ``consultation`` is the
    clinical summary of the doctor actually talking to the patient, transcribed
    by HealthScribe. Neither replaces the other, and every downstream step —
    summary, exams, differential, analysis — reasons over both.
    """
    patient = case.get("patient", {})
    consultation = case.get("consultation") or {}
    return {
        "age": patient.get("age"),
        "gender": patient.get("gender"),
        "stage": case.get("stage"),
        "status": case.get("status"),
        "chiefComplaint": case.get("chiefComplaint"),
        "complaint": case.get("complaint"),
        "history": case.get("history"),
        "vitals": case.get("vitals"),
        "interview": [
            {"role": m.get("role"), "text": m.get("text")} for m in case.get("interview", [])
        ],
        "summary": case.get("summary"),
        "consultation": consultation.get("summary") or None,
        "doctorNotes": [n.get("text") for n in case.get("notes", [])],
        "reopenReason": case.get("reopenReason"),
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
        """Grounding passages for ``query``: Knowledge Base hits (if
        configured) plus keyword-matched entries from the shared reference
        library (always checked — no separate opt-in)."""
        return self._retrieve_kb(query, k) + self._retrieve_resources(query, k)

    def _retrieve_kb(self, query: str, k: int) -> list[dict[str, Any]]:
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

    def _retrieve_resources(self, query: str, k: int) -> list[dict[str, Any]]:
        """Keyword-matched passages from the shared reference-document
        library (``resolvers/resources.py``). Degrades to no evidence on any
        failure — an unreachable/misconfigured table must never block
        reasoning that doesn't strictly need it."""
        from ..db import resources_repo

        try:
            matches = resources_repo.search_resources(query, limit=k)
        except Exception:  # noqa: BLE001
            return []
        return [
            {
                "text": r["text"] + (" [...truncated]" if r.get("truncated") else ""),
                "source": {"title": r.get("title"), "resourceId": r.get("id")},
                "score": None,
            }
            for r in matches
        ]

    def _converse(
        self,
        *,
        task_instruction: str,
        case: PatientCase,
        physician_question: str | None = None,
        retrieval_query: str | None = None,
        max_tokens: int = 4096,
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
            "inferenceConfig": {"maxTokens": max_tokens, "temperature": 0.2},
        }
        if GUARDRAIL_ID:
            kwargs["guardrailConfig"] = {
                "guardrailIdentifier": GUARDRAIL_ID,
                "guardrailVersion": GUARDRAIL_VERSION,
            }
        try:
            resp = self._runtime.converse(**kwargs)
        except (ClientError, BotoCoreError) as exc:
            raise AIServiceError(f"AI model call failed: {exc}") from exc
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
        try:
            return _parse_json(text), evidence
        except json.JSONDecodeError as exc:
            raise AIServiceError(
                "AI model returned malformed output; please retry."
            ) from exc

    # --- AIService contract -------------------------------------------------
    def next_interview_question(
        self, case: PatientCase, transcript: list[dict[str, Any]]
    ) -> AIResult:
        asked = sum(1 for m in transcript if m.get("role") == "ai")
        if asked >= 6:
            return AIResult(value=None, model_version=self.model_version)
        instruction = (
            "You are conducting an adaptive patient intake interview. The case "
            "context's `interview` field is the full transcript of this conversation "
            "so far, in order, including your own earlier questions and the patient's "
            "answers. Read it before responding. Do not reintroduce yourself and do "
            "not re-ask anything already answered there. Based on what is still "
            "missing, ask ONE concise clarifying question (plain language, "
            "patient-friendly). If enough has been gathered, reply with exactly the "
            "token DONE."
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

    def analyze_results(self, case: PatientCase) -> AIResult:
        instruction = (
            "The case context's `tests` array holds the investigations recommended for "
            "this patient. Some carry a `result` the physician entered, with a "
            "`resultFlag` of normal/abnormal/critical. Work test by test: compare each "
            "recommendation's `expectedFinding` and `reason` against the result that "
            "actually came back, and say what that result rules in or out.\n\n"
            "Then decide honestly whether the resulted investigations are enough to "
            "name a leading diagnosis.\n"
            "- If they are, return verdict 'confident'.\n"
            "- If they are not — the results are equivocal, contradict each other, or "
            "leave a dangerous alternative standing — return verdict "
            "'needs_more_tests' and populate `newTests` with the specific further "
            "investigations that would settle it. Do NOT repeat a test that already "
            "has a result. Never claim confidence you do not have to avoid asking.\n\n"
            "Return JSON: {\"verdict\": \"confident\"|\"needs_more_tests\", "
            "\"message\": str (one or two sentences for the physician, naming what the "
            "results showed and what is still missing), "
            "\"diagnoses\": [Diagnosis objects, same shape and keys as the differential, "
            "re-ranked in light of the results, each with a trend point labelled "
            "'Results'], "
            "\"newTests\": [TestRecommendation objects with keys id, name, category, "
            "reason, expectedFinding, priority, cost, urgency, diagnosticValue(0-100), "
            "status('recommended')] — empty when verdict is 'confident'}."
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
            max_tokens=600,
        )
        return AIResult(chat_message("ai", text.strip()), self.model_version, evidence)

    def chat(
        self, case: PatientCase, conversation_messages: list[dict[str, Any]]
    ) -> AIResult:
        transcript = "\n".join(
            f"{m.get('role')}: {m.get('text')}" for m in conversation_messages
        )
        last_patient_text = next(
            (m.get("text", "") for m in reversed(conversation_messages) if m.get("role") == "patient"),
            "",
        )
        instruction = (
            "You are continuing a conversation with the patient about this case — this "
            "may be a follow-up visit or a new question, separate from the original "
            "intake interview. Reply in plain, patient-friendly language, grounded in "
            "the case's own data (including its current stage/status). Do not give a "
            "diagnosis directly to the patient; if asked, explain a physician will "
            "review and follow up.\n\n"
            f"Conversation so far:\n{transcript}"
        )
        text, evidence = self._converse(
            task_instruction=instruction,
            case=case,
            retrieval_query=last_patient_text or None,
            max_tokens=600,
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
