# SEHATI-AI — Backend Architecture

How this backend implements the SEHATI-AI design document, where it deliberately
deviates, and what is intentionally left to other teams / future work.

## 1. Scope

This repository's backend owns: the **API**, the **clinical workflow + state
machine**, the **data model + persistence**, **security/authorization**, the
**audit trail**, and the **feedback flywheel**. It exposes a clean seam for the
**AI team** (model/prompts/RAG) and a REST contract for the **frontend team**.
CDN/CloudFront is out of scope for now.

## 2. System design (design doc §5)

```
Tablet / Web (frontend team)
  → Amazon Cognito .......... AuthN + groups (patient/physician/admin/compliance)
  → Amazon API Gateway ...... REST API (Cognito authorizer, Lambda proxy integration)
  → AWS Lambda (Python) ..... orchestration; the authorization boundary
        ├─ AIService seam ... stub (default) | Amazon Bedrock (Claude) + Guardrails + KB
        ├─ Amazon DynamoDB .. cases · audit · feedback  (KMS-encrypted, on-demand)
        └─ Amazon S3 + KMS .. documents/audio/images · immutable WORM audit (Object Lock)
  Observability ............ CloudWatch Logs + API Gateway access logs + X-ray
```

Region: **us-east-1 (N. Virginia)** — chosen to match the region the AI team's
Bedrock/Lambda pipeline already runs in, overriding the design doc's original
EU-region recommendation (see [`AWS_CURRENT_STATE.md`](./AWS_CURRENT_STATE.md)
for why). Revisit if a real data-residency requirement is confirmed later.

## 3. Requirements coverage (design doc §3)

| Functional requirement | Where |
|---|---|
| 1. Structured intake | `submitIntake` (`resolvers/cases.py`) |
| 2. Adaptive AI interview + transcript | `postInterviewMessage`, `ai.next_interview_question` |
| 3. Case summary for physician | `generateSummary`, `ai.build_summary` |
| 4. Test recommendations w/ reasoning & citations | `requestRecommendations`, `ai.differential`/`recommend_tests` |
| 5. Explainability dialogue + accept/reject (logged) | `askDiagnosis`, `accept/rejectRecommendation` |
| 6. Case state management | `state_machine.py`, `setCaseState`, `orderTest` |
| 7. Results ingestion + diagnostic dialogue | `recordTestResult`, `rerankAfterResults`, `assistantChat` |
| 8. Case closure, immutable record | `acceptFinalDiagnosis` → `Closed` + audit |
| 9–11. Multilingual / voice / imaging | Frontend + AI team + Transcribe/Translate (future, §8 below) |
| 12. Similar-case cohort signal | Diagnosis `similarCases` field; production path = pgvector (§8) |

Non-functional (design doc §3.2): PHI encrypted at rest (KMS CMK) + in transit;
record-level access control; immutable audit; low-latency interactive responses
(API Gateway + Lambda); scale-to-zero idle cost; doctor-in-the-loop.

## 4. Data workflows + state machine (design doc §6–§7)

The lifecycle states and transitions in `state_machine.py` implement the design
doc's §7 diagram exactly:

```
Intake → AIInterview → DoctorReview → InProgress → ResultsDiscussion → Diagnosis → Closed
                                          ↑______________|  (needs more tests)
                                   ResultsDiscussion ← Diagnosis  (doctor forces re-eval)
```

Each state also maps to the frontend's richer `status`/`stage` fields
(`STATE_PRESENTATION`) so the existing UI renders unchanged. Illegal transitions
raise `StateTransitionError`.

## 5. Security architecture (design doc §10)

**Core principle honoured:** *the AI is never the authorization boundary.*

- Authorization is enforced in the **data layer** (`db/cases_repo.py`): every read
  and write is scoped to the caller's Cognito identity and explicit item ownership
  (`patientId` / `assignedPhysicianId`). A patient physically cannot read another
  patient's case; the check happens before any data is returned.
- The **patient-facing interview** path calls the AI with only the current case's
  transcript — **no data-access tools** (design doc §10.2).
- **Rejections require a reason** (`rejectRecommendation`) — the anti-rubber-stamp /
  anti-automation-bias control (design doc §14).
- **Immutable audit** (`db/audit_repo.py`): who/what/when/model version/retrieved
  context/output for every significant action; production mirrors to an **S3 Object
  Lock (WORM)** bucket (provisioned by the CDK stack).
- **Encryption:** KMS customer-managed key on DynamoDB + S3; TLS in transit.
- **Prompt-injection defense** (Bedrock adapter): Guardrails prompt-attack filter,
  and retrieved documents are framed as **untrusted data, never instructions**
  (OWASP LLM01), via the system > physician > retrieved-docs hierarchy in
  `ai/prompts.py`.

### Threat model mapping (design doc §10.3)

| Threat | Mitigation in this backend |
|---|---|
| Cross-patient data leak | `_visible_to` ownership predicate at query time (data layer) |
| Jailbreak of patient bot | Interview path has no tools; Guardrails (bedrock) |
| Indirect injection via docs | Retrieved docs as untrusted data (`prompts.py`) |
| PHI exfiltration | Cognito MFA-capable, RBAC, least-privilege IAM, KMS, audit |
| Hallucinated citation | `AIResult.retrieved_context` provenance; grounding check (bedrock) |
| Network intrusion | Private managed services; add WAF/Verified Access at the edge |

## 6. AI/ML architecture (design doc §9) — the seam

The backend never hard-codes model behavior. `ai/base.AIService` is the contract;
`ai/factory.get_ai_service()` selects the implementation from `AI_PROVIDER`.

- **`StubAIService`** (default): deterministic, offline, ports the frontend's
  `aiResponder.ts` reasoning-first responder and generates believable structured
  output. Zero cost, so the product is fully demoable now.
- **`BedrockAIService`** (AI team owns): Amazon Bedrock **Converse** (Claude) +
  **Guardrails** + **Knowledge Bases** retrieval. Prompt architecture (§9.3):
  system prompt fixes the CDS-not-diagnostician role, the instruction hierarchy is
  system > physician > retrieved-docs, and every structured method requests strict
  JSON. Failures (model access, throttling, malformed JSON) surface as real API
  errors — this adapter never substitutes stub output for a genuine model response.

**Current status (2026-07-23):** the AI team has been building their Bedrock
integration independently and directly in the console (a Bedrock Agent, two
Knowledge Bases, four standalone Lambdas) rather than through this seam — see
[`AWS_CURRENT_STATE.md`](./AWS_CURRENT_STATE.md) for the full audit. That work
is not yet case-scoped or wired end-to-end, so **this backend deliberately runs
on the stub for now**; `ai/bedrock.py` is not yet pointed at their setup. This
is a conscious decision, not an oversight — revisit once their pipeline matures.

**Confidence** (design doc §9.4) is carried as the frontend's qualitative fields
(reasoning, `whyNot100`, `confidenceExplanation`, trend) — an honest band, not a
spurious validated probability.

**Learning from doctors** (design doc §13): implemented as the **feedback flywheel**
(`db/feedback_repo.py`) — every accept/reject/edit captured with reason, model
version and retrieved context — not RLHF. This is the dataset for a future offline
eval harness and DPO path, and it structurally avoids the sycophancy failure mode.

## 7. Deliberate deviation: DynamoDB instead of Aurora

The design doc prescribes **Aurora Serverless PostgreSQL** (row-level security +
pgvector). We use **DynamoDB** (chosen for buildability: true serverless, no VPC,
scale-to-zero, trivial IaC). We preserve the doc's security guarantee by
implementing the RLS equivalent in the access layer (`db/cases_repo.py`). The full
`PatientCase` is stored as one JSON document keyed by `id`, with GSIs
`byPatient` / `byPhysician` / `byStatus` for listing.

**Production path to the doc's design:** move cases to Aurora Serverless v2 with
Postgres RLS policies keyed on `patient_id`, and add pgvector for privacy-preserving
cohort/similar-case retrieval (design doc §10.4: Comprehend Medical de-identification
+ k-anonymity threshold + aggregate-only results).

## 8. Out of scope now / documented next steps

- **CDN/CloudFront + WAF/Verified Access** at the edge (hospital-only access).
- **Real model/prompt/RAG tuning** — AI team owns `ai/bedrock.py` + the curated,
  versioned corpus (design doc §11: PMC OA + ClinicalTrials.gov + openFDA/RxNorm +
  WHO/CDC + ICD-10-CM), ingested via Bedrock Knowledge Bases → S3 Vectors, with
  section-aware chunking, hybrid retrieval + rerank, and grounding checks.
- **Multilingual/voice pipeline** (design doc §12): Amazon Transcribe → Translate →
  Comprehend Medical (English pivot for clinical NLP) + Polly TTS. The backend
  accepts already-transcribed text today; add these as pre-processing Lambdas.
- **Medical imaging** (design doc §12.3): attach/view DICOM (S3 or HealthImaging);
  ingest the **radiologist's report text** — no LLM image diagnosis, by design.
- **Aurora + pgvector** cohort search, and **HealthLake/FHIR** for interop
  (design doc §14) — production drop-ins.
- **Real-time push / token-streaming** — AppSync subscriptions were dropped along
  with GraphQL; a WebSocket API (API Gateway) is the documented path if
  multi-viewer live sync or token-streamed replies are needed later. Today
  replies are complete grounded messages and clients poll `GET /cases/{caseId}`.

## 9. Regulatory posture (design doc §14)

The backend is built to keep SEHATI-AI a **non-device CDS tool**: it produces
**prioritised option lists, not directives**; it always attaches the basis
(reasoning + `retrieved_context`) for independent physician review; it enforces
explicit physician accept/reject with logging; there is no direct-to-patient
diagnosis and no time-critical alerting. Design to GDPR/HIPAA as the higher bar
(Lebanon PDPL Law 81/2018); the AWS services chosen are HIPAA-eligible.
