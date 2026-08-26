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
  * the **case document tool** (``ai/tools.py``) — the one piece of retrieval
    the model drives itself. The corpus and reference library are fetched up
    front from a query we pick; the patient's own uploaded documents are pulled
    on demand, by a query the model picks, mid-turn. See ``_converse``.

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
from . import prompts, tools
from .base import AIResult, AIService

# Claude on Bedrock (2026). Override via env to pin a specific model/version.
DEFAULT_MODEL_ID = os.environ.get(
    "BEDROCK_MODEL_ID", "anthropic.claude-sonnet-4-20250514-v1:0"
)
GUARDRAIL_ID = os.environ.get("BEDROCK_GUARDRAIL_ID", "")
GUARDRAIL_VERSION = os.environ.get("BEDROCK_GUARDRAIL_VERSION", "DRAFT")
KNOWLEDGE_BASE_ID = os.environ.get("BEDROCK_KNOWLEDGE_BASE_ID", "")
REGION = os.environ.get("AWS_REGION", "us-east-1")

# Appended to every instruction that asks for a confidence. Without it the
# model reaches for a probability (0.82) as readily as a percentage (82), and
# the UI — which renders the number straight into `width: {value}%` and a
# "{value}%" label — then draws every diagnosis at effectively zero.
# `models.coerce_confidence` repairs a probability that slips through; this
# stops it being emitted in the first place.
_CONFIDENCE_SCALE = (
    "Every `confidence` field is an INTEGER PERCENTAGE from 0 to 100 (e.g. 82 "
    "for 82% confident). Never express it as a 0-1 probability, and never as a "
    "string with a percent sign. "
)

# Appended wherever the schema names an array the UI renders one entry at a
# time. Asked for a "treatment" list the model reaches for
# [{"name": ..., "details": ..., "confidence": 85}]; `src/types.ts` types these
# as string[] and React throws on an object child, blanking the tab.
# `models.coerce_text_list` flattens one that slips through; this stops it
# being emitted.
_PROSE_ARRAYS = (
    "supporting, contradicting, missing, recommendedTests, evidenceSummary, "
    "treatment, monitoring, complications and followUp are arrays of PLAIN "
    "STRINGS — one complete sentence or phrase per entry, with any dose, "
    "frequency or timing written into that sentence. Never objects. "
)


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
        evidence_k: int = 5,
        use_document_tool: bool = True,
    ) -> tuple[str, list[dict[str, Any]]]:
        """Run one agent turn: prompt the model, serve any tool calls it makes,
        and return its final text plus everything that grounded it.

        Two kinds of grounding meet here. ``_retrieve`` is *push* — the curated
        corpus and reference library, fetched up front from a query we choose.
        The document tool is *pull* — the model asks for this patient's own
        uploaded paperwork, by a query it chooses, as many times as it needs.
        Both end up in the returned evidence list, because the audit trail
        makes no distinction: it records what the answer actually rested on.
        """
        evidence = self._retrieve(retrieval_query, evidence_k) if retrieval_query else []
        document_count = _document_count(case) if use_document_tool else 0
        if document_count:
            task_instruction = (
                task_instruction.rstrip()
                + "\n\n"
                + prompts.document_tool_hint(document_count)
            )
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
        # The tool is offered whenever the path allows it, even with an empty
        # folder: the model asking and being told "nothing here" is a better
        # failure than it assuming a document it can't see says something.
        if use_document_tool:
            kwargs["toolConfig"] = tools.tool_config()

        for _ in range(tools.MAX_TOOL_ROUNDS):
            resp = self._call_converse(kwargs)
            message = resp["output"]["message"]
            tool_uses = [
                block["toolUse"] for block in message.get("content", []) if "toolUse" in block
            ]
            if resp.get("stopReason") != "tool_use" or not tool_uses:
                return _text_of(message), evidence

            # Bedrock requires the assistant's tool_use message to be echoed
            # back verbatim, followed by one toolResult per toolUse.
            messages.append(message)
            results = []
            for use in tool_uses:
                text, passages = tools.run_tool(
                    use.get("name", ""), use.get("input") or {}, case
                )
                evidence.extend(passages)
                results.append(
                    {
                        "toolResult": {
                            "toolUseId": use.get("toolUseId"),
                            "content": [{"text": text}],
                        }
                    }
                )
            messages.append({"role": "user", "content": results})

        # Out of rounds. Ask once more with the tool withdrawn so the model has
        # no option but to answer from what it has already retrieved. Bedrock
        # rejects a call carrying toolUse/toolResult blocks with no toolConfig
        # ("The toolConfig field must be defined when using toolUse and
        # toolResult content blocks"), so the tool exchanges are flattened into
        # plain text — the retrieved passages stay in front of the model.
        kwargs.pop("toolConfig", None)
        kwargs["messages"] = _without_tool_blocks(messages)
        return _text_of(self._call_converse(kwargs)["output"]["message"]), evidence

    def _call_converse(self, kwargs: dict[str, Any]) -> dict[str, Any]:
        try:
            return self._runtime.converse(**kwargs)
        except (ClientError, BotoCoreError) as exc:
            raise AIServiceError(f"AI model call failed: {exc}") from exc

    def _converse_json(
        self,
        *,
        task_instruction: str,
        case: PatientCase,
        retrieval_query: str | None = None,
        evidence_k: int = 5,
        use_document_tool: bool = True,
    ) -> tuple[Any, list[dict[str, Any]]]:
        instruction = (
            task_instruction
            + "\n\nRespond with ONLY valid JSON, no prose, no markdown fences. "
            "The JSON is your FINAL answer — retrieve everything you need from "
            "the tools first, then emit it."
        )
        text, evidence = self._converse(
            task_instruction=instruction,
            case=case,
            retrieval_query=retrieval_query,
            evidence_k=evidence_k,
            use_document_tool=use_document_tool,
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
        # Patient-facing: no data-access tools at all (design doc section 10.2).
        text, _ = self._converse(
            task_instruction=instruction, case=case, use_document_tool=False
        )
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
            "similarCases[], trend[{label,value}], discussion[]). "
            + _CONFIDENCE_SCALE
            + _PROSE_ARRAYS
            + "Every clinical claim must "
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
            "Recommend AT MOST 5 investigations — no more than 5 even if more "
            "could be justified — the most diagnostically valuable ones only, as "
            "a JSON array with keys: id, name, category, reason (one short "
            "phrase), expectedFinding (one short phrase), priority, cost, "
            "urgency, diagnosticValue(0-100), status('recommended')."
        )
        value, evidence = self._converse_json(
            task_instruction=instruction,
            case=case,
            retrieval_query=case.get("chiefComplaint"),
            evidence_k=3,
        )
        return AIResult(value, self.model_version, evidence)

    def rerank_after_results(self, case: PatientCase) -> AIResult:
        instruction = (
            "Test results are now available in the case context. Re-reason and return the "
            "UPDATED prioritised differential in the same Diagnosis JSON array shape, "
            "adjusting confidence and adding a trend point labelled 'Results'. "
            + _CONFIDENCE_SCALE
            + _PROSE_ARRAYS
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
            "'needs_more_tests' and populate `newTests` with AT MOST 5 of the most "
            "specific further investigations that would settle it — no more than "
            "5 even if more could be justified. Do NOT repeat a test that already "
            "has a result. Never claim confidence you do not have to avoid asking. "
            "Keep every reasoning field to one or two sentences — the physician "
            "needs the answer quickly, not an essay.\n\n"
            "Return JSON: {\"verdict\": \"confident\"|\"needs_more_tests\", "
            "\"message\": str (one or two sentences for the physician, naming what the "
            "results showed and what is still missing), "
            "\"diagnoses\": [Diagnosis objects, same shape and keys as the differential, "
            "re-ranked in light of the results, each with a trend point labelled "
            "'Results'], "
            "\"newTests\": [TestRecommendation objects with keys id, name, category, "
            "reason, expectedFinding, priority, cost, urgency, diagnosticValue(0-100), "
            "status('recommended')] — empty when verdict is 'confident', at most 5 "
            "otherwise}. " + _CONFIDENCE_SCALE + _PROSE_ARRAYS
        )
        value, evidence = self._converse_json(
            task_instruction=instruction,
            case=case,
            retrieval_query=case.get("chiefComplaint"),
            evidence_k=3,
        )
        return AIResult(value, self.model_version, evidence)

    def propose_final_diagnosis(self, case: PatientCase) -> AIResult:
        instruction = (
            "Propose a final diagnosis as a JSON FinalDiagnosis object (keys: name, confidence, "
            "status('proposed'), reasoning, evidenceSummary[], ruledOut[{name,reason}], "
            "treatment[], monitoring[], complications[], followUp[]). "
            + _CONFIDENCE_SCALE
            + _PROSE_ARRAYS
            + "Confidence is a qualitative judgment, not a validated probability."
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
            # Physician answers reason before they conclude and can run to
            # several hundred words of clinical explanation — the original
            # 600 cap (sized for a short reply) was truncating them mid-turn.
            max_tokens=2000,
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
            # Patient-facing, like the intake interview: the patient is not the
            # audience for what a referral letter says about them.
            use_document_tool=False,
        )
        return AIResult(chat_message("ai", text.strip()), self.model_version, evidence)


def _document_count(case: PatientCase) -> int:
    from ..resolvers import documents

    return documents.document_count(case)


def _without_tool_blocks(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """A copy of ``messages`` with every tool exchange flattened into text.

    A conversation that used the document tool carries ``toolUse`` blocks (from
    the model) and ``toolResult`` blocks (from us). Bedrock only accepts those
    alongside a ``toolConfig``, so a final tool-free call has to rewrite them
    rather than drop the turns: what the model asked for, and the passages it
    got back, both stay in the conversation as ordinary text.
    """
    out: list[dict[str, Any]] = []
    for message in messages:
        content: list[dict[str, Any]] = []
        for block in message.get("content", []):
            if "text" in block:
                content.append(block)
            elif "toolUse" in block:
                use = block["toolUse"]
                query = (use.get("input") or {}).get("query") or ""
                content.append(
                    {"text": f"[Requested {use.get('name', 'tool')}: {query}]".strip()}
                )
            elif "toolResult" in block:
                text = "".join(
                    c["text"] for c in block["toolResult"].get("content", []) if "text" in c
                )
                content.append({"text": f"[Tool result]\n{text}"})
        if content:
            out.append({**message, "role": message.get("role", "assistant"), "content": content})
    return out


def _text_of(message: dict[str, Any]) -> str:
    """Concatenate the text blocks of a Converse response message.

    A message that reasoned before answering can carry several; taking only
    content[0] used to drop everything after the first.
    """
    return "".join(block["text"] for block in message.get("content", []) if "text" in block)


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
