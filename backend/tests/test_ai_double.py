"""FakeAIService — the ported aiResponder logic and structured generation."""

import json
from pathlib import Path

from tests.fakes.ai_double import FakeAIService

CASES = json.loads(
    (Path(__file__).resolve().parents[1] / "sehati" / "data" / "seed_cases.json").read_text(
        encoding="utf-8"
    )
)
PNEUMONIA = next(c for c in CASES if c["id"] == "AUR-1042")


def test_answer_why_diagnosis_uses_reasoning():
    ai = FakeAIService()
    dx = PNEUMONIA["diagnoses"][0]
    # Mirrors the frontend prompt: "Why do you think this is {dx.name}?"
    out = ai.answer(PNEUMONIA, f"Why do you think this is {dx['name']}?", diagnosis_id=dx["id"])
    assert str(dx["confidence"]) in out.value["text"]
    assert "confidence" in out.value["text"].lower()


def test_answer_why_not_alternative():
    ai = FakeAIService()
    out = ai.answer(PNEUMONIA, "Why not pulmonary embolism?")
    text = out.value["text"].lower()
    assert "pulmonary embolism" in text


def test_answer_references():
    ai = FakeAIService()
    dx = PNEUMONIA["diagnoses"][0]
    # "reference" (without "support"/"evidence") hits the references branch.
    out = ai.answer(PNEUMONIA, "What references are you using?", diagnosis_id=dx["id"])
    assert "ATS/IDSA" in out.value["text"]


def test_interview_terminates():
    ai = FakeAIService()
    transcript = []
    # Simulate a full interview; it must eventually signal completion (None).
    completed = False
    for _ in range(10):
        r = ai.next_interview_question(PNEUMONIA, transcript)
        if r.value is None:
            completed = True
            break
        transcript.append(r.value)
        transcript.append({"role": "patient", "text": "ok"})
    assert completed


def test_build_summary_shape():
    ai = FakeAIService()
    minimal = {
        "chiefComplaint": "Cough and fever",
        "patient": {"age": 40, "gender": "Male"},
        "complaint": {"symptoms": ["Cough", "Fever"], "duration": "2 days", "painScale": 3},
        "history": {"previousIllnesses": ["Asthma"], "medications": [], "smoking": "Never"},
        "summary": {"timeline": []},
    }
    out = ai.build_summary(minimal)
    for key in ("chiefComplaint", "hpi", "redFlags", "symptoms", "findings"):
        assert key in out.value


def test_rerank_bumps_top_confidence():
    ai = FakeAIService()
    before = max(d["confidence"] for d in PNEUMONIA["diagnoses"])
    out = ai.rerank_after_results(PNEUMONIA)
    after = out.value[0]["confidence"]
    assert after >= before
    assert after <= 95


def test_model_version_recorded():
    ai = FakeAIService()
    out = ai.answer(PNEUMONIA, "summarize the case")
    assert out.model_version == "test-fake-v0"
