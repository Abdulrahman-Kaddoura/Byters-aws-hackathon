# SEHATI-AI — Project Status Summary (2026-07-23)

> **Superseded:** references below to the stub AI / `AI_PROVIDER=stub` /
> `AI_PROVIDER=bedrock` as a deploy-time toggle no longer apply — the stub
> provider has since been removed from the codebase entirely; the backend
> only ever talks to real Amazon Bedrock. Kept below as a historical record.

A plain-language snapshot of where things stand: what was done to the
backend/infra in this branch, what the AI team already had running
independently in AWS, and what's live right now. Written so anyone on the
team can catch up without reading code or chat history.

---

## 1. What was done here (this branch)

Starting point: a working backend (Lambda + DynamoDB + Cognito) existed, but
its front door was **AWS AppSync (GraphQL)**. Someone was separately building
a plain **API Gateway** with REST-style routes by hand in the AWS console
(see §2) — two different API styles, and the AppSync one wasn't what the rest
of the team was expecting to integrate against.

**Changes made:**

1. **Replaced AppSync with API Gateway (REST) end-to-end.**
   - `infra/stacks/sehati_stack.py`: swapped the `GraphqlApi` construct for
     `apigateway.RestApi`, with a `CognitoUserPoolsAuthorizer` on the same
     Cognito user pool, and a resource tree covering 20 routes (`/cases`,
     `/cases/{caseId}/interview/messages`, `/cases/{caseId}/final-diagnosis`,
     etc.) — all pointing at the same Lambda orchestrator.
   - `backend/sehati/handler.py`: rewritten to parse API Gateway's proxy
     event shape (method + resource path → route table → args from
     path/query/body) instead of AppSync's GraphQL event shape, and to return
     proper HTTP responses (status code + JSON body) instead of AppSync's
     raise-a-JSON-string error convention.
   - `backend/sehati/context.py`: identity now comes from
     `event.requestContext.authorizer.claims` (API Gateway's Cognito
     authorizer) instead of AppSync's `event.identity`.
   - Dropped `publishCaseUpdate`/`publishMessage` — those were AppSync
     subscription fan-out triggers with no REST equivalent; there's no
     real-time push channel today (clients poll instead).
   - `infra/schema.graphql` deleted; `docs/API.md` rewritten to document the
     REST surface (method + path + request/response body per endpoint).
   - Full endpoint list, request/response shapes: [`API.md`](./API.md).

2. **Switched the default deploy region from `eu-central-1` to `us-east-1`**,
   to match the AI team's existing setup (see §2) instead of the design doc's
   original EU-region recommendation — a deliberate call to avoid
   cross-region friction, not an oversight. See
   [`AWS_CURRENT_STATE.md`](./AWS_CURRENT_STATE.md) and
   [`ARCHITECTURE.md`](./ARCHITECTURE.md) §2 for the reasoning.

3. **Deployed `SehatiBackend` to AWS for the first time.** Live as of
   2026-07-23:
   | Output | Value |
   |---|---|
   | `ApiUrl` | `https://6ufo0lkytj.execute-api.us-east-1.amazonaws.com/prod/` |
   | `UserPoolId` | `us-east-1_6JwDuCQQP` |
   | `UserPoolClientId` | `78ss73p2li5eq3sbj1fk9n3qk` |
   | `Region` | `us-east-1` |
   | `CasesTableName` | `sehati-cases` |
   | `AIProvider` | `stub` (no real model wired in yet — see §3) |

   This created: Cognito user pool (4 groups: patient/physician/admin/
   compliance), the API Gateway REST API + Cognito authorizer, the
   `sehati-orchestrator` Lambda, 3 DynamoDB tables, 2 S3 buckets (documents +
   WORM audit), and a KMS key. Full step-by-step in
   [`AWS_DEPLOYMENT.md`](./AWS_DEPLOYMENT.md).

4. **Audited and documented what the AI team already had in AWS** (§2 below),
   since none of it was written as code — see
   [`AWS_CURRENT_STATE.md`](./AWS_CURRENT_STATE.md) for the full detail.

**Deliberately not touched:** the AI team's Lambdas, Bedrock Agent, and
Knowledge Bases — left exactly as they were. `backend/sehati/ai/bedrock.py`
still isn't wired to real Bedrock; the app runs on the built-in stub AI.

---

## 2. What the AI team already had running (independently, no IaC)

Discovered by CLI audit on 2026-07-23 (full detail in
[`AWS_CURRENT_STATE.md`](./AWS_CURRENT_STATE.md)), all built by hand in the
console, all in `us-east-1`, same AWS account (`782968044136`):

- **API Gateway HTTP API** `Frontend_AI_connection` — 8 routes defined
  (`/transcribe`, `/tests`, `/query`, `/history`, `/physical-examinations`,
  `/final-diagnosis`, `/differential-diagnosis`, `/Update`), but **only
  `POST /transcribe` is actually wired to a Lambda** — the other 7 have no
  integration and do nothing if called. No authorizer on any route.
- **4 Lambda functions**: `RAG`, `LLM`, `Doctor-Patient_Dialogue_Transcribe`,
  `health-scribe-call`. Each is a working proof-of-concept for one AWS
  capability (Bedrock KB retrieval, Claude invocation, Transcribe Medical,
  AWS HealthScribe) but **none take a case id or dynamic per-case input** —
  each is hardcoded to one demo scenario. `health-scribe-call` (the one
  that's live) has a real bug: it ignores the request entirely (hardcoded
  audio file) and has module-level code that runs at cold start and can crash
  initialization if a specific S3 file doesn't exist yet.
- **Amazon Bedrock**: an Agent (`AI-Diagnosis-Assistant`, Claude 3 Haiku) with
  a real, on-topic system instruction, plus 2 Knowledge Bases — none of the 4
  Lambdas above actually call the Agent.
- **No Cognito, no DynamoDB** in this pipeline — no auth, no persistence.
- **No CloudFormation/CDK** — 100% console click-ops, nothing reproducible as
  code.

**Bottom line:** this is real, working exploration of the individual AWS AI
building blocks, but not yet a case-aware or auth-protected pipeline.

---

## 3. Where things stand now

- **`SehatiBackend`** (auth, case data, clinical workflow, HTTP API) is
  **live and deployed**, running on the stub AI. Independent of the AI team's
  pipeline — no resource collisions, both exist side by side in the same
  account/region.
- **The AI team's pipeline** continues to be built independently, on its own
  timeline. Per team decision, it is **not yet integrated** with
  `SehatiBackend` — `ai/bedrock.py` is not pointed at their Agent/Lambdas.

---

## 4. System design right now (both systems, same account)

```
                              ┌─ Amazon Cognito ─────────────────────┐
                              │  user pool: us-east-1_6JwDuCQQP      │
                              │  groups: patient/physician/          │
                              │          admin/compliance            │
                              └──────────────┬────────────────────────┘
                                              │ verifies ID token
                                              ▼
   Frontend (React, currently   ┌─ API Gateway REST ──────────────┐
   on hardcoded mock data,      │  Cognito authorizer              │
   not wired to either API  ──▶ │  20 routes: /cases, /cases/{id}/ │
   yet)                         │  interview/..., /final-diagnosis,│
                                 │  /tests/..., etc.                │
                                 └──────────────┬────────────────────┘
                                                 ▼
                                 ┌─ Lambda: sehati-orchestrator ───┐
                                 │  router.py → resolvers/*.py     │
                                 │  state_machine.py (lifecycle)   │
                                 └───┬──────────────┬───────────────┘
                                     ▼              ▼
                        ┌─ DynamoDB (×3) ─┐  ┌─ AIService seam ──────┐
                        │ sehati-cases    │  │ stub (ACTIVE today)   │
                        │ sehati-audit    │  │ bedrock.py (NOT wired │
                        │ sehati-feedback │  │ to anything real yet) │
                        └─────────────────┘  └────────────────────────┘
                                 +  S3/KMS (documents, WORM audit)

   ── completely separate, not connected to the above ──────────────

   Frontend (?) ──▶ API Gateway HTTP "Frontend_AI_connection"
                       │ no authorizer, 8 routes, only /transcribe wired
                       ▼
                    Lambda: health-scribe-call ──▶ Amazon HealthScribe
                    Lambda: RAG            ──▶ Bedrock Knowledge Base (retrieve)
                    Lambda: LLM            ──▶ Bedrock (Claude invoke)
                    Lambda: Doctor-Patient_Dialogue_Transcribe ──▶ Amazon Transcribe Medical
                    (Bedrock Agent "AI-Diagnosis-Assistant" configured but unused by any of these)
```

**In one sentence:** the top block is a real, auth-protected, case-aware
backend with a placeholder AI; the bottom block is real, unprotected,
non-case-aware AI plumbing. Nothing currently connects them.

---

## 5. Next steps

**To finish standing up `SehatiBackend` (short-term, do these next):**
1. Create Cognito test users (physician + patient) — commands in
   [`AWS_DEPLOYMENT.md`](./AWS_DEPLOYMENT.md) Task Set 5.
2. Verify the live API end-to-end: get a token, call `GET /cases`, confirm a
   200 with `[]` (or seeded data), confirm a patient only ever sees their own
   cases.
3. Optionally seed the 7 sample cases (`backend/scripts/seed_cases.py`).
4. Hand the frontend team `ApiUrl` + `UserPoolId` + `UserPoolClientId` +
   region so they can replace the hardcoded mock data (`src/data/`) with real
   API calls — this is the biggest remaining gap, since the frontend isn't
   wired to *either* backend yet.

**Cross-team, needs a conversation before acting (not solo decisions):**
5. Decide, with the AI team, whether/when to wire `ai/bedrock.py` to their
   Bedrock Agent + Knowledge Bases — and if so, redesign their Lambdas to be
   case-scoped (take a `caseId`/input instead of hardcoded demo data) first.
6. Flag the `health-scribe-call` cold-start bug and the hardcoded audio file
   to the AI team directly — it's their code to fix, not something to patch
   from this side.
7. Decide whether the 7 empty routes on `Frontend_AI_connection`
   (`/tests`, `/query`, `/history`, `/physical-examinations`,
   `/final-diagnosis`, `/differential-diagnosis`, `/Update`) should be wired
   up there, or retired in favor of the equivalent (already working) routes
   on `SehatiBackend`'s API — having two front doors long-term is confusing.
8. Revisit the `us-east-1` region choice if a real data-residency
   requirement is confirmed (currently chosen only to match the AI team, not
   for a compliance reason).

**Longer-term / production hardening (not urgent for the hackathon):**
9. CDN/WAF at the edge, real Guardrails, Aurora+pgvector for cohort search,
   multilingual/voice pipeline — all cataloged in
   [`ARCHITECTURE.md`](./ARCHITECTURE.md) §8 as intentionally deferred.

---

## 6. Document upload + HealthScribe integration (2026-07-25)

Someone (AI team) edited `sehati-orchestrator`'s code **directly in the
Lambda console** instead of through this repo. That is unsafe by
construction: `infra/stacks/sehati_stack.py` packages the entire `backend/`
directory from git on every `cdk deploy` and overwrites whatever is live —
**console edits to this function will be silently destroyed by the next
deploy anyone runs.** Don't edit `sehati-orchestrator` in the console again;
edit `backend/sehati/` here and `cdk deploy`.

**What was recovered (via Lambda → Code → Export function) and what it
contained:**

1. **A live-breaking bug, likely the cause of "the app doesn't work" reports
   around this date:** `handler.py` had a real Python `SyntaxError` (two
   `_Route(...)` route entries were mistyped as `_    Route(...)`). The
   Lambda could not import, so **every** API call failed, not just the new
   ones. **Fixed** — `handler.py` now parses and the module imports cleanly
   (verified locally with the exact Lambda env vars).
2. **A silent regression:** `router.py` mapped the `"assistantChat"` field
   twice — the existing, working `collab.assistant_chat` (uses
   `AIService.answer()`, implemented by both Stub and Bedrock) and a new
   `assistant.assistant_chat` (calls `AIService.assistant_chat()`, which
   neither implements). The dict literal silently kept the second, so
   merging as-is would have replaced a working feature with one that
   crashes on every call. **Fixed** — `router.py` keeps only the working
   `collab.assistant_chat` mapping; the new `resolvers/assistant.py` is kept
   in the repo but intentionally not registered (see file docstring).
3. **Document upload (`resolvers/documents.py`) — finished and wired:**
   upload a doc → S3 → extract text (`pypdf`/`python-docx`, now in
   `requirements.txt`) → stored as `case.documentContext`, which
   `ai/prompts.py`'s per-step prompt builders now include. Fixed the
   hardcoded, unprovisioned bucket name (`"referencedocument"`) to use the
   CDK-managed `DOCUMENTS_BUCKET` env var instead — the Lambda already has
   read/write IAM permission on that bucket, nothing else to grant. Added
   the missing `POST /cases/{caseId}/documents` API Gateway route (was
   never added to the CDK stack, so even a working Lambda would have 403'd
   the frontend on this one — **needs `cdk deploy` to take effect**).
4. **Not wired — genuinely unfinished, not just "needs a route added":**
   `ai/service.py` (a new `AIService` implementation meant to call a Bedrock
   Agent) imports `.client` (`invoke_agent`) and `.result` (`AIResult`) —
   **neither file exists anywhere in the exported code**, only referenced.
   `resolvers/transcription.py` imports `ai_get_service` from the `ai`
   package (the package exports `get_ai_service`, a factory function — no
   such name exists) and calls it as an already-instantiated object rather
   than invoking it. `ai/healthscribe.py` calls Amazon Transcribe and a
   hand-made IAM role (`health-scribe-call-role-...`) and bucket
   (`healthscribetry`) that aren't provisioned anywhere in the CDK stack —
   the Lambda's execution role has no `transcribe:*` permission, no
   `iam:PassRole` for that role, and no access to that bucket. All three
   files are kept in the repo (not deleted — real work, just not
   connected to anything) with a docstring stating their status; none are
   registered in `router.py`/`handler.py`, so calling their intended
   endpoints today gives a clean 400 ("No resolver registered"), not a
   crash or silent no-op.

**To finish the HealthScribe/agent pipeline**, in order: create
`ai/client.py` (the actual Bedrock Agent invocation — presumably against the
existing `AI-Diagnosis-Assistant` agent from §2) and `ai/result.py` (or just
reuse `AIResult` from `ai/base.py` instead of a new file); decide whether the
new capabilities (`assistant_chat`, `start_interview_audio`,
`ingest_transcription_summary`) belong on the existing `AIService` abstract
interface (implemented by Stub/Bedrock too) or are provider-specific; add
Transcribe + `iam:PassRole` + the target bucket to the CDK stack's Lambda
IAM grants (or migrate onto CDK-managed resources instead of hand-made
ones); fix `resolvers/transcription.py`'s import; register the finished
pieces in `router.py`/`handler.py` and add their API Gateway routes; `cdk
deploy`.

---

## 7. Bedrock turned on for real (2026-07-27)

`SehatiBackend` was redeployed with `AI_PROVIDER=bedrock`
(`cdk deploy SehatiBackend -c ai_provider=bedrock`) — the assistant chat
(`POST /cases/{caseId}/assistant`, `ai/bedrock.py::answer`) now calls real
Claude on Amazon Bedrock instead of the stub. `ai/bedrock.py` itself needed no
code changes to work at all; getting a working reply end-to-end took three
real, sequential AWS-side issues (each confirmed via CloudWatch logs on
`sehati-orchestrator`), documented in full in `AWS_DEPLOYMENT.md` Task Set 8:

1. **Bare model id rejected.** `Converse` on a bare `anthropic.claude-...` id
   fails with `ValidationException: ... isn't supported. Retry your request
   with the ID or ARN of an inference profile`. Recent Claude models require a
   cross-region inference profile id (`us.anthropic.claude-...`).
2. **First inference profile tried was legacy.** `claude-sonnet-4-20250514`
   came back `ResourceNotFoundException: ... marked by provider as Legacy`.
   `aws bedrock list-inference-profiles` was used to find what's actually
   active in the account.
3. **Newest model gated behind a use-case form.** `claude-sonnet-5` came back
   `AccessDeniedException: ... not available for this account` — AWS's Bedrock
   "Model access" console page is retired (models auto-enable on first
   invoke), but first-time use of a brand-new Anthropic model can still
   require submitting a one-time "use case details" form. Fell back to
   `us.anthropic.claude-sonnet-4-5-20250929-v1:0` (current, non-legacy,
   no form required) instead of chasing that down.
4. **API Gateway's 29-second hard integration timeout** (a REST API ceiling
   that cannot be raised) was intermittently beating slow-but-successful
   Bedrock calls — the Lambda (60s timeout) would finish fine and CloudWatch
   showed no error, but the physician-facing request already failed. Fixed by
   capping `answer()`'s `maxTokens` at 600 (chat replies don't need the 2000
   used by the structured JSON tasks) so replies reliably land well under 29s.

**Also fixed:** `BEDROCK_MODEL_ID` was initially patched by hand via
`aws lambda update-function-configuration` — a dead end, since CDK owns the
Lambda's entire environment map and replaces it wholesale on every deploy,
silently reverting a hand-set var on the next `cdk deploy`. `bedrock_model_id`
is now a proper stack prop / CLI context value (`-c bedrock_model_id=...`,
mirroring `ai_provider`), defaulting to the working Sonnet 4.5 inference
profile, in both `infra/app.py` and `infra/stacks/sehati_stack.py`.

**Still not done:** no Guardrail or Knowledge Base configured (`answer()` runs
without grounding/retrieval evidence until `BEDROCK_KNOWLEDGE_BASE_ID` is set —
those two env vars remain hand-set only, not CDK-managed). The AI team's
separate pipeline (§2) is still fully disconnected — none of this used their
Agent, Lambdas, or Knowledge Bases.

---

## 8. Admin panel + fuller patient intake (2026-08-02)

Previously, hospital accounts could only be created by hand via
`aws cognito-idp admin-create-user`/`admin-add-user-to-group` (documented in
`AWS_DEPLOYMENT.md` Task Set 5), and access control was entirely the 4 fixed
Cognito groups baked into hardcoded resolver checks — no way to see who had
an account, no way to grant anything more precise than "is this a physician."
New Case intake also only collected the patient's name.

**Changes made:**

1. **A real `/admin` panel** (Users + Groups tabs) — only an account with the
   new `users.manage` permission (granted to the "Administrator" system group
   by default) can create accounts, assign a Cognito role, assign
   fine-grained permission groups, and set per-user permission overrides.
2. **A second, admin-editable permission layer, decoupled from Cognito's 4
   groups.** Cognito's groups stay the coarse identity/row-level-security
   boundary (unchanged — still drives `is_patient`/`is_clinical_staff` in
   `context.py` and case ownership in `cases_repo.py`). A new pair of
   DynamoDB tables (`sehati-users`, `sehati-groups`) carries fine-grained
   permissions from a fixed 10-key catalog (`permissions.py`); the **9**
   backend call sites that used to gate on `ctx.require_clinical_staff()` /
   `ctx.require_physician()` (plus one inline check in `db/audit_repo.py`)
   now gate on `ctx.require_permission("the.key")` instead, computed at
   request time in `handler.py` from the caller's group memberships +
   overrides. 4 system groups (seeded by the new
   `scripts/bootstrap_admin.py`) reproduce today's exact role behavior by
   default, so this is additive, not a behavior change, until an admin
   actually creates/edits a custom group. Full model:
   [`ARCHITECTURE.md`](./ARCHITECTURE.md) §5; endpoints:
   [`API.md`](./API.md)'s admin section; table shapes:
   [`DATA_MODEL.md`](./DATA_MODEL.md) Part C.
3. **New users get a server-generated one-time temp password** shown once in
   the admin UI (Cognito never returns an auto-generated one, so it's
   generated server-side and passed explicitly), left in
   `FORCE_CHANGE_PASSWORD` state — first sign-in goes through the existing
   `NEW_PASSWORD_REQUIRED` flow the frontend already had.
4. **New Case now collects the full patient record** (name, age, gender,
   weight, height, blood type, occupation — all required) instead of just
   the name, before creating the case and entering Patient Mode. No backend
   schema change — `submitIntake` already accepted arbitrary fields on
   `patient`, only `name` was ever validated.
5. Added `backend/tests/test_admin.py` (permission computation, admin CRUD,
   and an end-to-end test proving a restrictive custom group actually blocks
   a Cognito-`physician`-role user from a clinical action) — full existing
   suite still passes unmodified against the rewired permission checks.

**Not yet done:** wiring the fine-grained permission system into the
patient-facing intake/interview/conversations/document-upload endpoints —
those are intentionally ungated today (any authenticated user, scoped only
by case ownership) and were left untouched by design, since gating them
wasn't part of this change and touches the patient-access model directly.

---

## 9. Admin panel route guard + fixed super admin (2026-08-07)

The `/admin` API endpoints were always correctly gated server-side (§8), but
`/admin` itself had no client-side route check — any signed-in user (any
role) could navigate to it by URL and load the admin UI shell, even though
every data call on it then 403'd. The sidebar link being hidden for
non-admins was explicitly cosmetic (see the comment it replaced in
`AppLayout.tsx`). Separately, nothing stopped an admin from accidentally
demoting, disabling, or stripping permissions from the only admin account,
locking the hospital out of `/admin` entirely.

**Changes made:**

1. **Frontend route guard** (`src/components/RequireAdmin.tsx`), wrapping
   `/admin/:tab?` in `src/App.tsx`: redirects any signed-in user without the
   `admin` Cognito group to `/dashboard` before the admin components render.
2. **A fixed, protected super admin account**
   (`sehati.models.SUPER_ADMIN_USERNAME`, default username `admin`,
   provisioned by `scripts/bootstrap_admin.py`, default email changed to
   `admin@mail.com`). `resolvers/admin.py`'s `update_user` refuses to move
   that account out of the `admin` role, disable it, drop it from the
   Administrator permission group, or revoke `users.manage` via an override.
   `handler.py`'s `_enrich_with_permissions` also gives that username the
   full permission set unconditionally, even with a missing/corrupted
   `sehati-users` record — defense-in-depth so the panel can never fully
   lock the hospital out of itself. Bootstrapping with a different
   `--username` creates a normal, unprotected admin instead.
3. `AppUser` gained an `isSuperAdmin` field; the admin UI shows a "Super
   admin" badge on that account and disables the controls the server would
   reject.
4. Added `test_super_admin_cannot_be_demoted_disabled_or_stripped` and
   `test_super_admin_always_has_full_access_even_without_a_user_record` to
   `backend/tests/test_admin.py`.

Full detail: [`ARCHITECTURE.md`](./ARCHITECTURE.md)'s "Admin panel access"
subsection; endpoint contract: [`API.md`](./API.md)'s admin section;
deployment: [`AWS_DEPLOYMENT.md`](./AWS_DEPLOYMENT.md) Task Set 5b.

No infrastructure changes — this is backend + frontend code only, picked up
by the normal redeploy (`cdk deploy` for the backend,
`./scripts/deploy-frontend.sh` for the frontend).
