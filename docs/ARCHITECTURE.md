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
  → Amazon Cognito .......... AuthN + role groups (doctor/nurse/admin)
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
| 3. Case summary for the doctor | `generateSummary`, `ai.build_summary` |
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
  and write is scoped to the caller's Cognito role and the case's
  `assignedPhysicianId`. A doctor physically cannot read a case that isn't
  assigned to them; the check happens before any data is returned. A second
  gate then strips clinical fields for callers without `cases.view_clinical`,
  so a nurse's response doesn't contain the record she isn't cleared for.
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
  (OWASP LLM01), via the system > doctor > retrieved-docs hierarchy in
  `ai/prompts.py`.

### Two-tier authorization: Cognito roles vs. admin-editable permission groups

Access control is deliberately split into two layers that answer different
questions:

1. **Cognito's 3 role groups** (`doctor`/`nurse`/`admin`) — the coarse
   **identity** layer. `AuthContext.is_doctor` / `is_nurse` / `is_admin`
   derive straight from these and drive the row-level predicate in
   `db/cases_repo.py`. Fixed by design, not admin-editable, because who may
   reach which patient's record is a data-isolation boundary rather than a
   capability to toggle. Patients are not in this list: they never sign in, so
   there is no patient identity to model.
2. **Custom permission groups** (`permissions.py`, `db/groups_repo.py`,
   `db/users_repo.py`) — a separate, fully admin-CRUD'd concept for
   fine-grained **capability**. Each group is a name plus a subset of a fixed
   permission catalog (one key per real gated action: `cases.create`,
   `cases.assign`, `cases.view_clinical`, `cases.manage_state`,
   `cases.add_note`, `exams.manage`, `diagnoses.manage`,
   `final_diagnosis.accept`, `tests.manage`, `assistant.chat`,
   `recommendations.record`, `documents.manage`, `audit.view`,
   `resources.manage`, plus `users.manage` and `settings.manage` for the admin
   panel itself). A user belongs to one or more custom groups, with optional
   per-user overrides on top; effective permission = union of group
   permissions, with overrides applied last. Stored in `sehati-users` and
   `sehati-groups` — see [`DATA_MODEL.md`](./DATA_MODEL.md) Part C.

At request time, `handler.py` builds the base `AuthContext` from the verified
JWT claims (`context.from_apigw_claims` — pure, no I/O), then a separate
enrichment step looks up the caller's `sehati-users` record and attaches their
computed permission set (`AuthContext.permissions`). Every gated action calls
`ctx.require_permission("the.key")`. The 3 system permission groups (seeded by
`scripts/bootstrap_admin.py`, one per role) give each role its default
behaviour; an admin can then narrow or extend any individual user — e.g. a
locum doctor who may add notes but not sign off a diagnosis.

There is deliberately **no `is_clinical_staff` catch-all** on `AuthContext`.
That property was what made "any clinician can read any case" the default;
removing it forces every call site to name the role it actually means.

### The two case-access gates

Reaching a case and seeing its contents are separate decisions, and both are
enforced in the data layer rather than by the AI.

**Row level — `db/cases_repo._visible_to`.** Assignment is a *boundary*, not a
filter: a doctor reads the cases whose `assignedPhysicianId` is their own
`sub`, and nothing else. An unassigned case is invisible to every doctor. No
permission grant widens this — it is keyed to the Cognito role and the case
row. Nurses reach the whole admissions desk (they reassign for each other);
admins reach everything. `list_cases` picks a narrowing index and then
re-applies the predicate to every row, so a wrong index can never widen
access.

**Field level — `db/cases_repo.project_for_role`.** A caller without
`cases.view_clinical` receives a case stripped of `interview`, `summary`,
`exams`, `diagnoses`, `tests`, `finalDiagnosis`, `notes`, `insights`,
`assistantThread`, `conversations`, `timeline`, `primaryImpression`,
`documentContext` and `recentUpdates`. This is what lets a nurse open a case to
verify her intake and route it without ever holding the clinical record. The
allow-list is positive, so a field added to `PatientCase` later is hidden by
default rather than silently exposed.

The projection runs at **one outbound choke point**
(`handler._project_result`), not per resolver, so a new endpoint cannot forget
it. It has to run *after* the resolver has saved: mutation resolvers read a
case, mutate that same dict and hand it to `save_case`, so redacting on read
would delete those fields from the database instead of from the response.

One consequence worth naming: the interview transcript is clinical content, but
the interview itself runs on the nurse's device while the patient answers. So
the live conversation is served by its own endpoint (`resolvers/interview.
get_interview`) rather than read off the case — visible on the locked kiosk
screen, absent from her ordinary case view once she takes the device back.

### The patient-interview (kiosk) lock

The nurse hands the patient her own authenticated device. Rendering a
chrome-less page was never sufficient — the URL bar reached the entire
caseload. Two mechanisms replace it:

- **Routing lock (`src/lib/kiosk.ts`).** A `sessionStorage` entry pins routing
  to the interview page; `KioskGuard` in `App.tsx` redirects every other path
  back to it. `sessionStorage` rather than React state so a refresh, a
  navigation or a restored tab cannot clear it.
- **Server-verified exit (`resolvers/settings.kiosk_exit`).** The admin-set
  password is stored as a PBKDF2-HMAC-SHA256 hash with a per-record salt in
  `sehati-settings` and compared with `hmac.compare_digest`. A password
  compared in the browser would be readable in the shipped JS bundle. If no
  password has been set the endpoint refuses to unlock and says to ask an
  admin — an unconfigured hospital fails closed, not open.

**Known limitation.** The device still carries the nurse's ID token in
`localStorage`. The lock stops navigation; it does not stop a patient with
devtools from reading that token. Closing it properly needs a short-lived
interview-scoped token minted per session, which is a larger change than this
one. It is recorded here rather than papered over.

### Admin panel access: one source of truth

`/admin` is authorized server-side and *reported* to the client, rather than
guessed by it:

- **Server-side (authoritative).** Every `/admin/*` resolver calls
  `ctx.require_permission("users.manage")`, and API Gateway's Cognito
  authorizer rejects unauthenticated requests before the Lambda runs.
- **Client-side (`src/components/RequirePermission.tsx`).** The guard asks
  `GET /me` for the caller's effective permissions — the same set the
  resolvers check — and renders a 403 page if `users.manage` is absent.

The previous guard read the ID token's `cognito:groups` claim for `"admin"`.
That is a *different axis* from the permission the server checks: effective
permissions come from `customGroups` + `permissionOverrides` and never from
`cognitoGroup`. The two could disagree in both directions — a user the server
would have allowed was redirected away, and a user in the `admin` Cognito
group without `system-admin` got a panel where every request 403'd.
`currentIdentity()` and the JWT decoder were deleted along with the guard, so
the mistake is not available to make again.

A single fixed account (`models.SUPER_ADMIN_USERNAME`, default `"admin"`,
provisioned by `scripts/bootstrap_admin.py`) is protected from ever being
locked out of the panel:

- `resolvers/admin.py`'s `update_user` refuses to move that username out of
  the `admin` role, disable it, drop it from the `system-admin` permission
  group, or override `users.manage` to `false`.
- `handler.py`'s `_enrich_with_permissions` grants that username the full
  permission set unconditionally — even if its `sehati-users` record is
  missing or the `system-admin` group's permissions were edited elsewhere.
  This is a defense-in-depth floor against corrupted state, not just against
  panel-driven changes to that one account.
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
  doctor's question) and folds matches in as evidence alongside any
  Knowledge Base results, with no separate ingestion step. Prompt
  architecture (§9.3): system prompt fixes the CDS-not-diagnostician role, the
  instruction hierarchy is system > doctor > retrieved-docs, and every
  structured method requests strict JSON. Failures (model access, throttling,
  malformed JSON) surface as real API errors — there is no fake-data fallback,
  ever, in production. Tests substitute a deterministic double at the
  `factory.get_ai_service` seam instead of a second production implementation
  (`backend/tests/fakes/ai_double.py`).

- **The case document tool** (`ai/tools.py`): the model's own retrieval hook
  into the documents a nurse or doctor uploaded to *this* case
  (`resolvers/documents.py`). `_converse` offers it as a Bedrock
  `toolConfig`; when the model emits a `toolUse` the agent runs
  `documents.retrieve_document_passages`, hands the matching passages back as a
  `toolResult` (wrapped in the same untrusted-data framing as
  `<retrieved_evidence>` — a PDF is data, never instructions), and the model
  answers with them in view. Up to `MAX_TOOL_ROUNDS` rounds, then the tool is
  withdrawn so the turn always terminates. What was retrieved is merged into
  `AIResult.retrieved_context`, so a document that shaped a recommendation is
  reviewable in the audit trail like any other evidence. The tool takes a query
  and no case id — the case is bound by the caller, so no query can reach
  another patient's folder — and the patient-facing paths
  (`next_interview_question`, `chat`) are not offered it at all (§10.2).

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

**Transcription** (design doc §12): `ai/healthscribe.py` +
`resolvers/transcribe.py` wrap AWS HealthScribe (built on Amazon Transcribe
Medical). `startTranscription` kicks off a medical-scribe job against a
doctor-uploaded audio recording and returns immediately — a job can run
minutes past any API Gateway integration timeout, so the Lambda never blocks
waiting for it. The frontend polls `transcriptionStatus` until the job
completes, then gets back a structured clinical summary (chief complaint,
HPI, review of systems, past medical history, plus whatever further sections
HealthScribe emitted) and the verbatim transcript.

Three things about that flow are load-bearing:

- **A recording is a case document.** It lives in `case["documents"]` with
  `kind: "audio"`, and the transcript fills the same `text` field an uploaded
  PDF's extracted text fills. That is what makes it *context*: the model's
  `retrieve_case_documents` tool scores its passages and `documentContext`
  carries it, on exactly the path a referral letter takes. Nothing about the
  AI seam knows audio exists.
- **The bytes never pass through the API.** API Gateway caps a request body at
  10MB and Lambda at 6MB, and base64 inflates by a third — a few minutes of
  audio is already over. `createCaseAudioUpload` hands out a presigned `PUT`
  and the browser uploads straight to the documents bucket (which is why that
  bucket carries a CORS rule).
- **The result is persisted server-side, by the poll.** The first
  `transcriptionStatus` call that sees `COMPLETED` writes the transcript onto
  the case. A doctor who closes the tab mid-job does not lose the recording,
  and the dialog that started it is a view, not the system of record.

Where the output lands is HealthScribe's decision, so `get_job_status` reads
the `MedicalScribeOutput` URIs off the job rather than guessing an output key.

## 7. Deliberate deviation: DynamoDB instead of Aurora

The design doc prescribes **Aurora Serverless PostgreSQL** (row-level security +
pgvector). We use **DynamoDB** (chosen for buildability: true serverless, no VPC,
scale-to-zero, trivial IaC). We preserve the doc's security guarantee by
implementing the RLS equivalent in the access layer (`db/cases_repo.py`). The full
`PatientCase` is stored as one JSON document keyed by `id`, with GSIs
`byNurse` / `byPhysician` / `byStatus` for listing.

**Production path to the doc's design:** move cases to Aurora Serverless v2 with
Postgres RLS policies keyed on `assigned_physician_id`, and add pgvector for privacy-preserving
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
(reasoning + `retrieved_context`) for independent doctor review; it enforces
explicit doctor accept/reject with logging; there is no direct-to-patient
diagnosis and no time-critical alerting. Design to GDPR/HIPAA as the higher bar
(Lebanon PDPL Law 81/2018); the AWS services chosen are HIPAA-eligible.
