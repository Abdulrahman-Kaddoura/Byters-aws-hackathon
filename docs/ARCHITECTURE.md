# SEHATI-AI — Backend Architecture

How this backend implements the SEHATI-AI design document, where it deliberately
deviates, and what is intentionally left to other teams / future work.

## 1. Scope

This repository's backend owns: the **API**, the **clinical workflow + state
machine**, the **data model + persistence**, **security/authorization**, the
**audit trail**, and the **feedback flywheel**. It exposes a clean seam for the
**AI team** (model/prompts/RAG) and an HTTP API contract for the **frontend team**.
CDN/CloudFront is out of scope for now.

## 2. System design (design doc §5)

```
Tablet / Web (frontend team)
  → Amazon Cognito .......... AuthN + groups (patient/physician/admin/compliance)
  → Amazon API Gateway ...... HTTP API (Cognito JWT authorizer, Lambda proxy integration)
  → AWS Lambda (Python) ..... orchestration; the authorization boundary
        ├─ AIService seam ... Amazon Bedrock (Claude) + Guardrails + KB (both optional)
        ├─ AWS HealthScribe . doctor-uploaded audio → structured clinical summary
        ├─ Amazon DynamoDB .. cases · audit · feedback · doctor feedback · users · groups · resources (KMS-encrypted, on-demand)
        └─ Amazon S3 + KMS .. documents/audio/images · immutable WORM audit (Object Lock)
  Observability ............ CloudWatch Logs + API Gateway access logs + X-ray
```

Region: **us-east-1 (N. Virginia)** — chosen to match the region the AI team's
original Bedrock/Lambda exploration already ran in, overriding the design
doc's original EU-region recommendation. Revisit if a real data-residency
requirement is confirmed later.

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

### Two-tier authorization: Cognito groups vs. admin-editable permission groups

Access control is deliberately split into two layers that answer different
questions:

1. **Cognito's 4 groups** (`patient`/`physician`/`admin`/`compliance`) — the
   coarse **identity** layer. `AuthContext.is_patient` / `is_clinical_staff`
   derive straight from these and drive the row-level-security predicate in
   `db/cases_repo.py` (a patient sees only their own case; clinical staff see
   the tenant). This is fixed by design — not admin-editable — because
   patient-vs-staff is a data-isolation boundary, not a permission to toggle.
2. **Custom permission groups** (`permissions.py`, `db/groups_repo.py`,
   `db/users_repo.py`) — a separate, fully admin-CRUD'd concept for
   fine-grained **capability**. Each group is a name plus a subset of a fixed
   permission catalog (one key per real gated action: `cases.manage_state`,
   `exams.manage`, `diagnoses.manage`, `final_diagnosis.accept`,
   `tests.manage`, `assistant.chat`, `recommendations.record`, `audit.view`,
   `cases.add_note`, `resources.manage`, plus `users.manage` for the admin
   panel itself). A user
   belongs to one or more custom groups, with optional per-user permission
   overrides on top; effective permission = union of group permissions, with
   overrides applied last. Stored in two new DynamoDB tables (`sehati-users`,
   `sehati-groups`) — see [`DATA_MODEL.md`](./DATA_MODEL.md) Part C.

At request time, `handler.py` builds the base `AuthContext` from the verified
JWT claims (`context.from_apigw_claims` — untouched, still pure), then a
separate enrichment step looks up the caller's `sehati-users` record and
attaches their computed permission set (`AuthContext.permissions`). Every
call site that used to gate on `ctx.require_clinical_staff()` /
`ctx.require_physician()` now calls `ctx.require_permission("the.key")`
instead; `db/audit_repo.py`'s compliance/admin check is now
`ctx.require_permission("audit.view")`. The 4 system permission groups
(seeded by `scripts/bootstrap_admin.py`, one per Cognito role) reproduce
today's exact behavior by default, so this is additive — a hospital that
never touches the Groups tab in `/admin` sees no behavior change; one that
does gets real, server-enforced fine-grained control (e.g. a "Triage Nurse"
custom group that can add notes and manage exams but can't touch diagnoses,
regardless of their Cognito role).

### Admin panel access: frontend guard + fixed super admin

`/admin` is authorized in two independent places:

- **Server-side (authoritative).** Every `/admin/*` resolver calls
  `ctx.require_permission("users.manage")`, and API Gateway's Cognito
  authorizer rejects unauthenticated requests before the Lambda even runs.
  This alone was always enough to stop privilege escalation.
- **Client-side (`src/components/RequireAdmin.tsx`).** The `/admin/:tab?`
  route in `src/App.tsx` redirects any signed-in user without the `admin`
  Cognito group to `/dashboard`. Previously only the sidebar link was
  hidden from non-admins — the route itself was reachable by URL, so any
  signed-in user could load the admin UI shell (its API calls would then
  403). The route guard closes that gap.

A single fixed account (`models.SUPER_ADMIN_USERNAME`, default `"admin"`,
provisioned by `scripts/bootstrap_admin.py`) is protected from ever being
locked out of the panel:

- `resolvers/admin.py`'s `update_user` refuses to move that username out of
  the `admin` Cognito role, disable it, drop it from the `system-admin`
  permission group, or override `users.manage` to `false`.
- `handler.py`'s `_enrich_with_permissions` grants that username the full
  permission set unconditionally — even if its `sehati-users` record is
  missing or the `system-admin` group's permissions were edited elsewhere.
  This is a defense-in-depth floor against corrupted/edited state, not just
  against panel-driven changes to that one account.
- The frontend (`AdminUsers.tsx`) mirrors this: the account shows a "Super
  admin" badge and the controls the server would reject are disabled.

Bootstrapping with a different `--username` creates a normal, unprotected
admin instead — the protection is tied to the one fixed username by design.

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
`ai/factory.get_ai_service()` constructs the one shipped implementation.

- **`BedrockAIService`** (AI team owns; the only implementation): Amazon Bedrock
  **Converse** (Claude) + **Guardrails** + **Knowledge Bases** retrieval, plus
  the **shared reference-document library** (`db/resources_repo.py`) —
  clinical staff upload a tagged document (e.g. a guideline for a specific
  condition, `resolvers/resources.py`, gated behind `resources.manage`);
  `_retrieve` keyword-matches its tags against the query (chief complaint or
  physician question) and folds matches in as evidence alongside any
  Knowledge Base results, with no separate ingestion step. Prompt
  architecture (§9.3): system prompt fixes the CDS-not-diagnostician role, the
  instruction hierarchy is system > physician > retrieved-docs, and every
  structured method requests strict JSON. Failures (model access, throttling,
  malformed JSON) surface as real API errors — there is no fake-data fallback,
  ever, in production. Tests substitute a deterministic double at the
  `factory.get_ai_service` seam instead of a second production implementation
  (`backend/tests/fakes/ai_double.py`).

**Confidence** (design doc §9.4) is carried as the frontend's qualitative fields
(reasoning, `whyNot100`, `confidenceExplanation`, trend) — an honest band, not a
spurious validated probability.

**Learning from doctors** (design doc §13): two separate mechanisms, both in
`db/feedback_repo.py`. The **feedback flywheel** (`record`/`list_for_case`) —
every accept/reject/edit captured with reason, model version and retrieved
context, not RLHF — is the dataset for a future offline eval harness and DPO
path, and it structurally avoids the sycophancy failure mode. Separately,
**free-text doctor feedback** (`save_doctor_feedback`/
`get_doctor_feedback_history`, `POST /cases/{caseId}/feedback`) is a "leave a
note" feature stored per doctor rather than per case; `ai/bedrock.py` folds a
doctor's recent feedback back into their own future prompts as a lightweight
preference signal.

**Transcription** (design doc §12, partial): `ai/healthscribe.py` +
`resolvers/transcribe.py` wrap AWS HealthScribe (built on Amazon Transcribe
Medical). `startTranscription` kicks off a medical-scribe job against a
doctor-uploaded audio recording and returns immediately — a job can run
minutes past any API Gateway integration timeout, so the Lambda never blocks
waiting for it. The frontend polls `transcriptionStatus` until the job
completes, then gets back a structured clinical summary (chief complaint,
HPI, review of systems, past medical history).

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
  section-aware chunking, hybrid retrieval + rerank, and grounding checks. The
  shared reference-document library (§6 above) is a deliberately lightweight
  stand-in for this — tag-based keyword matching, not embeddings/vector
  search — good for a curated handful of documents per topic, not a
  replacement for a real Knowledge Base at corpus scale.
- **Multilingual voice pipeline** (design doc §12): audio → clinical summary is
  now implemented (AWS HealthScribe, §6 above), but English-only and one-way —
  **Translate** and **Comprehend Medical** (non-English pivot for clinical NLP)
  and **Polly TTS** are still not wired in; add these as pre/post-processing
  steps around the existing HealthScribe call.
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
