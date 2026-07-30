"""FakeAIService — a deterministic, offline, rule/keyword-based AI double.

Test-only. Never imported by production code under ``sehati/**`` — the
deployed app has no fake-AI mode at all, it always talks to Bedrock. This
exists purely so the test suite stays fast, deterministic, and offline
(``backend/tests/conftest.py`` patches ``sehati.ai.factory.get_ai_service``
to return this for every test via an autouse fixture).

It's a straight port of what used to be ``sehati.ai.stub.StubAIService``
before the stub was deleted from production code.
"""

from __future__ import annotations

from typing import Any

from sehati.ai.base import AIResult, AIService
from sehati.models import PatientCase, chat_message

MODEL_VERSION = "test-fake-v0"


def _top_dx(case: PatientCase) -> dict[str, Any] | None:
    dxs = case.get("diagnoses") or []
    if not dxs:
        return None
    return sorted(dxs, key=lambda d: d.get("confidence", 0), reverse=True)[0]


def _bullets(items: list[str], max_items: int = 4) -> str:
    return "\n".join(f"• {s}" for s in items[:max_items])


class FakeAIService(AIService):
    model_version = MODEL_VERSION

    # --- Interview ----------------------------------------------------------
    #: A small bank of adaptive clarifying questions, asked until enough turns.
    _INTERVIEW_BANK = [
        "Can you describe your main symptom in a bit more detail — when it started and how it has changed?",
        "On a scale of 0 to 10, how severe is it, and does anything make it better or worse?",
        "Have you noticed any other symptoms alongside it — for example fever, nausea, or shortness of breath?",
        "Do you have any past medical conditions, or are you taking any regular medications?",
        "Has anything like this happened before, and is there any family history of similar problems?",
    ]

    def next_interview_question(
        self, case: PatientCase, transcript: list[dict[str, Any]]
    ) -> AIResult:
        # Count questions the AI has already asked.
        asked = sum(1 for m in transcript if m.get("role") == "ai")
        if asked >= len(self._INTERVIEW_BANK):
            # Interview complete — signal by returning None.
            return AIResult(value=None, model_version=self.model_version)
        question = self._INTERVIEW_BANK[asked]
        return AIResult(
            value=chat_message("ai", question), model_version=self.model_version
        )

    # --- Summary ------------------------------------------------------------
    def build_summary(self, case: PatientCase) -> AIResult:
        complaint = case.get("complaint", {})
        history = case.get("history", {})
        patient = case.get("patient", {})
        symptoms = complaint.get("symptoms", []) or []
        chief = case.get("chiefComplaint", "")
        age = patient.get("age", "")
        gender = str(patient.get("gender", "")).lower()

        hpi_parts = []
        if chief:
            hpi_parts.append(chief + ".")
        if complaint.get("duration"):
            hpi_parts.append(f"Duration: {complaint['duration']}.")
        if complaint.get("timeline"):
            hpi_parts.append(complaint["timeline"] + ".")
        if complaint.get("aggravating"):
            hpi_parts.append(f"Aggravated by {complaint['aggravating'].lower()}.")
        if complaint.get("relieving"):
            hpi_parts.append(f"Relieved by {complaint['relieving'].lower()}.")

        summary = {
            "chiefComplaint": (
                f"{age}-year-old {gender} presenting with {chief.lower()}."
                if age and gender and chief
                else chief
            ),
            "hpi": " ".join(hpi_parts),
            "relevantHistory": history.get("previousIllnesses", []),
            "medications": history.get("medications", []),
            "riskFactors": _derive_risk_factors(history),
            "redFlags": _derive_red_flags(symptoms, complaint),
            "timeline": case.get("summary", {}).get("timeline", []),
            "symptoms": symptoms,
            "findings": [
                "Structured summary generated from intake and interview.",
                "Physician review recommended before any clinical decision.",
            ],
        }
        return AIResult(value=summary, model_version=self.model_version)

    # --- Exams --------------------------------------------------------------
    def recommend_exams(self, case: PatientCase) -> AIResult:
        exams = [
            _exam("e1", "Vital signs", "Establish baseline and detect systemic involvement.", "Critical", 96),
            _exam("e2", "Focused physical examination", "Localize findings relevant to the chief complaint.", "Important", 88),
            _exam("e3", "Oxygen saturation", "Screen for hypoxia in any cardiorespiratory presentation.", "Important", 90),
        ]
        return AIResult(value=exams, model_version=self.model_version)

    # --- Differential -------------------------------------------------------
    def differential(self, case: PatientCase) -> AIResult:
        existing = case.get("diagnoses") or []
        if existing:
            # Return what's there, re-sorted; the double does not fabricate
            # over curated seed data.
            ranked = sorted(existing, key=lambda d: d.get("confidence", 0), reverse=True)
            return AIResult(value=ranked, model_version=self.model_version)

        chief = case.get("chiefComplaint", "the presenting complaint")
        symptoms = case.get("complaint", {}).get("symptoms", []) or []
        working = {
            "id": "dx-working",
            "name": "Working impression",
            "confidence": 55,
            "priority": case.get("priority", "Medium"),
            "category": "Provisional",
            "tagline": "Provisional impression pending examination and tests",
            "reasoning": (
                f"Based on the presentation ({chief}), a provisional impression is "
                "formed. This test double does not perform real clinical reasoning; "
                "enable the Bedrock adapter for grounded differentials."
            ),
            "supporting": symptoms[:4] or ["Reported symptoms"],
            "contradicting": ["Examination not yet performed", "No test results yet"],
            "missing": ["Focused examination", "Baseline investigations"],
            "recommendedTests": ["CBC", "CRP", "Basic metabolic panel"],
            "confidenceExplanation": (
                "Confidence is held at a provisional level until examination findings "
                "and investigations are available."
            ),
            "whyNot100": "No objective findings or results are available yet.",
            "riskAssessment": "Requires physician assessment to stratify risk.",
            "nextAction": "Complete a focused examination and order baseline investigations.",
            "references": [],
            "similarCases": [],
            "trend": [{"label": "Intake", "value": 50}, {"label": "Now", "value": 55}],
            "discussion": [],
        }
        return AIResult(value=[working], model_version=self.model_version)

    # --- Tests --------------------------------------------------------------
    def recommend_tests(self, case: PatientCase) -> AIResult:
        existing = case.get("tests") or []
        if existing:
            return AIResult(value=existing, model_version=self.model_version)
        tests = [
            _test("t1", "CBC with differential", "Hematology", "Screen for infection/inflammation.", "Medium", 70),
            _test("t2", "C-reactive protein (CRP)", "Inflammatory marker", "Quantify inflammatory burden.", "Medium", 66),
            _test("t3", "Basic metabolic panel", "Biochemistry", "Assess renal function and electrolytes.", "Low", 55),
        ]
        return AIResult(value=tests, model_version=self.model_version)

    # --- Re-rank after results ---------------------------------------------
    def rerank_after_results(self, case: PatientCase) -> AIResult:
        dxs = case.get("diagnoses") or []
        if not dxs:
            return self.differential(case)
        ranked = sorted(dxs, key=lambda d: d.get("confidence", 0), reverse=True)
        # Nudge the leading diagnosis up now that results are in (bounded).
        if ranked:
            top = dict(ranked[0])
            top["confidence"] = min(95, int(top.get("confidence", 55)) + 8)
            trend = list(top.get("trend", []))
            trend.append({"label": "Results", "value": top["confidence"]})
            top["trend"] = trend
            ranked[0] = top
        return AIResult(value=ranked, model_version=self.model_version)

    # --- Final diagnosis ----------------------------------------------------
    def propose_final_diagnosis(self, case: PatientCase) -> AIResult:
        existing = case.get("finalDiagnosis")
        if existing:
            return AIResult(value=existing, model_version=self.model_version)
        top = _top_dx(case)
        if not top:
            final = {
                "name": "Undetermined",
                "confidence": 40,
                "status": "proposed",
                "reasoning": "Insufficient data to propose a final diagnosis.",
                "evidenceSummary": [],
                "ruledOut": [],
                "treatment": [],
                "monitoring": [],
                "complications": [],
                "followUp": [],
            }
            return AIResult(value=final, model_version=self.model_version)
        final = {
            "name": top.get("name", "Working diagnosis"),
            "confidence": top.get("confidence", 60),
            "status": "proposed",
            "reasoning": top.get("reasoning", ""),
            "evidenceSummary": top.get("supporting", []),
            "ruledOut": [
                {"name": d.get("name", ""), "reason": (d.get("contradicting") or [""])[0]}
                for d in (case.get("diagnoses") or [])
                if d.get("id") != top.get("id")
            ],
            "treatment": [top.get("nextAction", "")] if top.get("nextAction") else [],
            "monitoring": [],
            "complications": [],
            "followUp": [],
        }
        return AIResult(value=final, model_version=self.model_version)

    # --- Chat / explainability (port of src/data/aiResponder.ts) -----------
    def answer(
        self, case: PatientCase, question: str, diagnosis_id: str | None = None
    ) -> AIResult:
        text = _generate_ai_response(case, question, diagnosis_id)
        return AIResult(
            value=chat_message("ai", text), model_version=self.model_version
        )


# ---------------------------------------------------------------------------
# Port of generateAIResponse() from src/data/aiResponder.ts
# ---------------------------------------------------------------------------
def _generate_ai_response(
    case: PatientCase, question: str, diagnosis_id: str | None
) -> str:
    q = question.lower()
    dxs = case.get("diagnoses") or []
    focus = None
    if diagnosis_id:
        focus = next((d for d in dxs if d.get("id") == diagnosis_id), None)
    focus = focus or _top_dx(case)

    def has(*keys: str) -> bool:
        return any(k in q for k in keys)

    # --- Why this diagnosis ---
    if has("why") and focus and (
        focus.get("name", "").lower().split(" ")[0] in q or has("this", "diagnosis", "think")
    ):
        if not has("not", "isn't", "rule out", "instead of"):
            return (
                f"{focus.get('reasoning', '')}\n\nThe features carrying the most weight are:\n"
                f"{_bullets(focus.get('supporting', []))}\n\n"
                f"That's why I currently place {focus.get('name')} at {focus.get('confidence')}% confidence."
            )

    # --- Why NOT an alternative ---
    if has("why not", "rule out", "instead", "not pulmonary", "not heart", "alternativ", "other diagnos"):
        others = [d for d in dxs if d.get("id") != (focus or {}).get("id")]
        mentioned = next(
            (d for d in others if d.get("name", "").lower().split(" ")[0] in q), None
        )
        target = mentioned or (others[0] if others else None)
        if target:
            na = target.get("nextAction", "")
            na = (na[0].lower() + na[1:]) if na else ""
            return (
                f"I've weighed {target.get('name')} but kept it lower ({target.get('confidence')}%). "
                f"The features that argue against it here are:\n"
                f"{_bullets(target.get('contradicting', []))}\n\n"
                f"It stays on the differential rather than being dismissed — {na}"
            )

    # --- Evidence ---
    if has("evidence", "support", "supporting", "proof", "basis") and focus:
        against = focus.get("contradicting") or ["No strong contradicting evidence at present"]
        return (
            f"Here's the evidence I'm weighing for {focus.get('name')}:\n\nSupporting:\n"
            f"{_bullets(focus.get('supporting', []))}\n\nAgainst / not yet confirmed:\n"
            f"{_bullets(against)}\n\n{focus.get('confidenceExplanation', '')}"
        )

    # --- Confidence questions ---
    if has("increase confidence", "raise confidence", "more confident", "higher confidence") and focus:
        items = focus.get("missing") or focus.get("recommendedTests", [])
        return (
            f"To raise my confidence in {focus.get('name')}, the highest-value inputs would be:\n"
            f"{_bullets(items)}\n\n{focus.get('whyNot100', '')}"
        )
    if has("why not 100", "isn't it 100", "not certain", "uncertain", "why not certain") and focus:
        return focus.get("whyNot100", "")
    if has("confidence", "how sure", "how confident", "change your confidence") and focus:
        trend = " → ".join(f"{t.get('label')}: {t.get('value')}%" for t in focus.get("trend", []))
        return (
            f"{focus.get('name')} is at {focus.get('confidence')}% confidence.\n\n"
            f"{focus.get('confidenceExplanation', '')}\n\nHow it has evolved: {trend}. "
            f"Each new finding re-weights the estimate — for example, {focus.get('whyNot100', '')}"
        )

    # --- What test first ---
    if has("test first", "order first", "which test", "what test", "investigation", "work up", "workup"):
        tests = (focus or {}).get("recommendedTests") or [t.get("name") for t in case.get("tests", [])]
        na = (focus or {}).get("nextAction") or (case.get("nextSteps") or [""])[0]
        return f"For {(focus or {}).get('name', 'this case')}, I'd prioritize:\n{_bullets(tests)}\n\n{na}"

    # --- Missing info ---
    if has("missing", "what don't we know", "what do we not know", "gaps", "need to know"):
        missing = (focus or {}).get("missing") or case.get("summary", {}).get("findings", [])
        return (
            f"The key gaps right now are:\n{_bullets(missing)}\n\n"
            f"Closing these would let me either confirm {(focus or {}).get('name', 'the leading diagnosis')} "
            f"or meaningfully re-rank the differential."
        )

    # --- Next steps ---
    if has("next", "what should i do", "what now", "plan", "manage", "recommend"):
        na = focus.get("nextAction", "") if focus else ""
        return f"Here's what I'd suggest next:\n{_bullets(case.get('nextSteps', []))}\n\n{na}".strip()

    # --- Red flags ---
    if has("red flag", "danger", "worried", "concern", "safety", "serious", "emergency"):
        critical = next((i for i in case.get("insights", []) if i.get("kind") == "critical"), None)
        tail = critical.get("text") if critical else "No immediately life-threatening features, but continue to monitor."
        return f"The safety considerations I'm tracking:\n{_bullets(case.get('summary', {}).get('redFlags', []))}\n\n{tail}"

    # --- Risk ---
    if has("risk", "severity", "how bad", "prognosis") and focus:
        return focus.get("riskAssessment", "")

    # --- Summary ---
    if has("summar", "overview", "tell me about", "what is going on", "what's going on", "recap"):
        return (
            f"{case.get('summary', {}).get('chiefComplaint', '')}\n\n"
            f"My leading impression is {(focus or {}).get('name', case.get('primaryImpression', ''))} "
            f"({(focus or {}).get('confidence', '')}%). {(focus or {}).get('tagline', '')}\n\n"
            f"Key supporting features:\n{_bullets((focus or {}).get('supporting', case.get('summary', {}).get('symptoms', [])))}"
        )

    # --- References ---
    if has("literature", "reference", "guideline", "paper", "research", "study", "studies", "source"):
        if focus and focus.get("references"):
            refs = "\n".join(
                f"• {r.get('title')} — {r.get('source')}"
                f"{', ' + str(r.get('year')) if r.get('year') else ''}: \"{r.get('snippet')}\""
                for r in focus["references"]
            )
            return f"Here are the references I'm drawing on for {focus.get('name')}:\n\n{refs}"

    # --- Similar cases ---
    if has("similar", "previous case", "seen before", "historical", "other patients"):
        if focus and focus.get("similarCases"):
            sc = "\n".join(
                f"• {s.get('title')} — {s.get('outcome')} ({s.get('similarity')}% similar): {s.get('detail')}"
                for s in focus["similarCases"]
            )
            return f"Comparable cases from the archive:\n\n{sc}"
        return (
            "I don't have a close historical match on file for this specific presentation, "
            "but the leading diagnosis follows a well-characterized pattern."
        )

    # --- Treatment ---
    if has("treat", "medication", "drug", "antibiotic", "therapy", "prescribe"):
        final = case.get("finalDiagnosis")
        if final:
            return (
                f"Suggested management for {final.get('name')}:\n{_bullets(final.get('treatment', []))}\n\n"
                f"I'd also monitor:\n{_bullets(final.get('monitoring', []), 3)}"
            )
        return (
            "A treatment plan is best finalized once the diagnosis is confirmed. "
            f"Based on the leading impression ({(focus or {}).get('name')}), the immediate action is: "
            f"{(focus or {}).get('nextAction', '')}"
        )

    # --- Fallback ---
    if focus:
        return (
            "Good question. Let me reason through it rather than just give a verdict.\n\n"
            f"For {focus.get('name')}, the picture rests on: "
            f"{', '.join(focus.get('supporting', [])[:3])}. {focus.get('confidenceExplanation', '')}\n\n"
            "If you can tell me more specifically what you'd like to explore — the evidence, the "
            "alternatives, what's missing, or what to order next — I can go deeper."
        )
    return (
        "I want to make sure I answer usefully. I can walk through the differential, explain my "
        "reasoning and confidence, tell you what's missing, or suggest the next test or treatment. "
        "Which would help most?"
    )


# --- Small structured-generation helpers -----------------------------------
def _derive_risk_factors(history: dict[str, Any]) -> list[str]:
    factors: list[str] = []
    if history.get("smoking") and "never" not in str(history["smoking"]).lower():
        factors.append("Smoking history")
    for illness in history.get("previousIllnesses", []) or []:
        factors.append(illness)
    return factors[:6]


def _derive_red_flags(symptoms: list[str], complaint: dict[str, Any]) -> list[str]:
    flags: list[str] = []
    keywords = {
        "fever": "Fever",
        "chest pain": "Chest pain",
        "short": "Shortness of breath",
        "bleeding": "Bleeding",
        "weight loss": "Unintended weight loss",
    }
    joined = " ".join(symptoms).lower()
    for key, label in keywords.items():
        if key in joined:
            flags.append(label)
    if complaint.get("painScale", 0) and int(complaint.get("painScale", 0)) >= 8:
        flags.append("Severe pain (≥8/10)")
    return flags or ["None identified at intake"]


def _exam(id_: str, name: str, reason: str, importance: str, confidence: int) -> dict[str, Any]:
    return {
        "id": id_,
        "name": name,
        "reason": reason,
        "importance": importance,
        "confidence": confidence,
        "status": "pending",
    }


def _test(id_: str, name: str, category: str, reason: str, priority: str, value: int) -> dict[str, Any]:
    return {
        "id": id_,
        "name": name,
        "category": category,
        "reason": reason,
        "expectedFinding": "",
        "priority": priority,
        "cost": "$",
        "urgency": "Routine",
        "diagnosticValue": value,
        "status": "recommended",
    }
