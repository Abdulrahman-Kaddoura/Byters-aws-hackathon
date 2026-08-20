"""AIService — implements every AI capability the resolvers depend on.

NOT WIRED YET. `factory.get_ai_service()` always returns `BedrockAIService`
(`ai/bedrock.py`); this alternative implementation is never selected, so its
`from .result import AIResult` below — a module that doesn't exist anywhere in
this repo — never actually gets exercised. Finishing this would mean pointing
it at `ai/base.py`'s `AIResult` instead and implementing `invoke_agent`
(`ai/client.py`, currently `raise NotImplementedError`). Kept in the repo as
real, unfinished work rather than deleted; see `docs/ARCHITECTURE.md` §6 for
what's actually wired.
"""

from __future__ import annotations

from typing import Any

from . import prompts
from .client import invoke_agent
from .result import AIResult

MODEL_VERSION = "aura-agent-v1"


class AIService:
    def next_interview_question(
        self, case: dict[str, Any], interview: list[dict[str, Any]]
    ) -> AIResult:
        raw = invoke_agent(prompts.interview_prompt(case, interview), session_id=case["id"])
        question = None if raw.get("done") else raw.get("question")
        return AIResult(value=question, model_version=MODEL_VERSION)

    def build_summary(self, case: dict[str, Any]) -> AIResult:
        raw = invoke_agent(prompts.summary_prompt(case), session_id=case["id"])
        return AIResult(
            value=raw.get("summary", raw),
            model_version=MODEL_VERSION,
            retrieved_context=raw.get("retrievedContext"),
        )

    def differential(self, case: dict[str, Any]) -> AIResult:
        raw = invoke_agent(prompts.differential_prompt(case), session_id=case["id"])
        return AIResult(
            value=raw.get("diagnoses", []),
            model_version=MODEL_VERSION,
            retrieved_context=raw.get("retrievedContext"),
        )

    def recommend_tests(self, case: dict[str, Any]) -> AIResult:
        raw = invoke_agent(prompts.recommend_tests_prompt(case), session_id=case["id"])
        return AIResult(value=raw.get("tests", []), model_version=MODEL_VERSION)

    def recommend_exams(self, case: dict[str, Any]) -> AIResult:
        raw = invoke_agent(prompts.recommend_exams_prompt(case), session_id=case["id"])
        return AIResult(value=raw.get("exams", []), model_version=MODEL_VERSION)

    def rerank_after_results(self, case: dict[str, Any]) -> AIResult:
        raw = invoke_agent(prompts.rerank_prompt(case), session_id=case["id"])
        return AIResult(
            value=raw.get("diagnoses", []),
            model_version=MODEL_VERSION,
            retrieved_context=raw.get("retrievedContext"),
        )

    def analyze_results(self, case: dict[str, Any]) -> AIResult:
        raw = invoke_agent(prompts.analyze_results_prompt(case), session_id=case["id"])
        return AIResult(
            value=raw,
            model_version=MODEL_VERSION,
            retrieved_context=raw.get("retrievedContext"),
        )

    def propose_final_diagnosis(self, case: dict[str, Any]) -> AIResult:
        raw = invoke_agent(prompts.final_diagnosis_prompt(case), session_id=case["id"])
        return AIResult(
            value=raw,
            model_version=MODEL_VERSION,
            retrieved_context=raw.get("retrievedContext"),
        )

    def answer(
        self, case: dict[str, Any], question: str, diagnosis_id: str | None
    ) -> AIResult:
        raw = invoke_agent(
            prompts.answer_prompt(case, question, diagnosis_id), session_id=case["id"]
        )
        return AIResult(
            value=raw,
            model_version=MODEL_VERSION,
            retrieved_context=raw.get("retrievedContext"),
        )

    def start_interview_audio(self, case: dict[str, Any], audio_s3_uri: str) -> AIResult:
        raw = start_transcription(case["id"], audio_s3_uri)
        return AIResult(value=raw.get("MedicalScribeJob", {}).get("MedicalScribeJobName"), model_version="healthscribe-v1")

    def ingest_transcription_summary(self, case: dict[str, Any], summary_s3_key: str) -> AIResult:
        raw = get_clinical_summary(summary_s3_key)
        return AIResult(value=raw, model_version="healthscribe-v1")

    def assistant_chat(self, case: dict[str, Any], message: str) -> AIResult:
        raw = invoke_agent(prompts.assistant_chat_prompt(case, message), session_id=case["id"])
        return AIResult(
            value=raw.get("reply", raw),
            model_version=MODEL_VERSION,
            retrieved_context=raw.get("retrievedContext"),
        )
