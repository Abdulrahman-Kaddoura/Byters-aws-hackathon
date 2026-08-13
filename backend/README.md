# SEHATI-AI — Backend

A doctor-in-the-loop **clinical decision-support (CDS)** backend, built AWS-native
per the SEHATI-AI design document. It owns the case data, the clinical workflow,
the API, security and the audit trail. The **AI team** plugs its model/prompt/RAG
work into a single seam (`sehati/ai/`); the **frontend team** consumes an HTTP
API. AI reasoning always goes through Amazon Bedrock (Claude) — there is no
offline/fake-AI mode in production; tests substitute a deterministic double
at the AI seam instead (`backend/tests/fakes/ai_double.py`).

> Not a medical device. A CDS aid presents prioritised option lists for a
> licensed physician to independently review — never a directive, never a
> direct-to-patient diagnosis. See [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).

---

## Architecture at a glance

```
Cognito (auth, groups)
   → API Gateway (HTTP API, Cognito JWT authorizer)
      → Lambda orchestrator (this Python package, Lambda proxy integration)
         → AIService seam  (Amazon Bedrock + Guardrails + Knowledge Bases, both optional)
         → AWS HealthScribe (doctor-uploaded audio → structured clinical summary)
         → DynamoDB        (cases · audit · feedback · doctor feedback · users · groups)
         → S3 + KMS        (documents/audio · immutable WORM audit)
```

- **Data store:** DynamoDB (serverless, scale-to-zero). Patient isolation is
  enforced in the **data-access layer** (`db/cases_repo.py`) — the DynamoDB
  analog of Aurora row-level security. The AI is never the authorization boundary.
- **AI seam:** Amazon Bedrock (Claude) only — no provider toggle.
- Deploy with the CDK app in [`../infra`](../infra); hosting steps in
  [`../docs/AWS_DEPLOYMENT.md`](../docs/AWS_DEPLOYMENT.md).

## Package layout

```
sehati/
  handler.py          # Lambda entry — routes API Gateway events, shapes errors
  router.py           # API route field name -> resolver function
  context.py          # AuthContext built from the *verified* Cognito JWT claims
  models.py           # Domain model, mirror of ../src/types.ts + factories
  state_machine.py    # Case lifecycle transitions (design doc §7)
  errors.py           # Typed, client-safe errors
  permissions.py      # Fine-grained permission catalog (admin-editable groups)
  cognito_admin.py     # Cognito Admin* API wrapper (admin panel account provisioning)
  resolvers/          # cases · interview · conversations · exams · diagnosis ·
                       # tests · collab · documents · transcribe · feedback · admin
  ai/                 # base (contract) · bedrock (shipped impl) · healthscribe ·
                       # prompts · factory · client/service (unfinished, see docstrings)
  db/                 # tables · cases_repo (RLS) · audit_repo · feedback_repo ·
                       # users_repo · groups_repo
  data/seed_cases.json# 7 sample cases generated from ../src/data/cases.ts
tests/                # pytest (moto-mocked DynamoDB)
scripts/              # seed_cases.py · local_invoke.py · bootstrap_admin.py
```

## Local development (no AWS account)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate     # optional
pip install -r requirements.txt

# 1) Run the test suite (moto mocks DynamoDB in-memory; the AI seam is
#    patched to a deterministic test double, see tests/fakes/ai_double.py)
pytest

# 2) Drive a full case through the entire lifecycle (also uses the test
#    double by default, no AWS account needed — pass --bedrock to hit real
#    Bedrock instead), including the patient-isolation guard, printing each step:
python scripts/local_invoke.py
```

`local_invoke.py` walks: intake → interview → summary → exams → differential →
tests → results → re-rank → final diagnosis → close, then shows a second patient
being **denied** access to the first patient's case, and the compliance role
reading the immutable audit trail.

### Optional: run against a local DynamoDB

```bash
docker run -p 8000:8000 amazon/dynamodb-local
export DYNAMODB_ENDPOINT=http://localhost:8000 AWS_REGION=us-east-1
export AWS_ACCESS_KEY_ID=local AWS_SECRET_ACCESS_KEY=local
python scripts/seed_cases.py --create-table   # loads the 7 sample cases
```

## The AI seam (for the AI team)

Implement `sehati.ai.base.AIService`. The shipped `BedrockAIService`
implementation follows this exact contract and output shapes (which match
`../src/types.ts`):

| Method | Produces |
|---|---|
| `next_interview_question` | next adaptive clarifying question (or `None` = done) |
| `build_summary` | `StructuredSummary` |
| `recommend_exams` | `ExamRecommendation[]` |
| `differential` | ranked `Diagnosis[]` with grounded references |
| `recommend_tests` | `TestRecommendation[]` |
| `rerank_after_results` | updated `Diagnosis[]` |
| `propose_final_diagnosis` | `FinalDiagnosis` |
| `answer` | grounded chat reply (`ChatMessage`) |

Every method returns an `AIResult(value, model_version, retrieved_context)` so the
audit trail and feedback flywheel capture provenance. The **Bedrock adapter**
(`ai/bedrock.py`) is where the AI team owns the model id, prompts (`ai/prompts.py`,
system > physician > retrieved-docs hierarchy), Guardrails, and Knowledge-Base
retrieval.

## Configuration (environment variables)

All of these are set by the CDK stack (`infra/stacks/sehati_stack.py`) at
deploy time — this table is for local development / reference, not something
you hand-set against a live Lambda (CDK owns its environment map wholesale
and reverts hand-set vars on the next `cdk deploy`).

| Variable | Default | Purpose |
|---|---|---|
| `CASES_TABLE` / `AUDIT_TABLE` / `FEEDBACK_TABLE` / `DOCTOR_FEEDBACK_TABLE` / `USERS_TABLE` / `GROUPS_TABLE` | `sehati-*` | DynamoDB table names |
| `DOCUMENTS_BUCKET` / `AUDIT_BUCKET` | – | S3 buckets for uploaded files/audio and the WORM audit mirror |
| `USER_POOL_ID` | – | Cognito user pool id (admin panel's `Admin*` API calls) |
| `AWS_REGION` | `us-east-1` | Region |
| `DYNAMODB_ENDPOINT` | – | Local DynamoDB endpoint override |
| `BEDROCK_MODEL_ID` | `us.anthropic.claude-sonnet-4-5-...` | Claude model / inference profile id |
| `BEDROCK_GUARDRAIL_ID` / `_VERSION` | – | Optional Bedrock Guardrail |
| `BEDROCK_KNOWLEDGE_BASE_ID` | – | Optional Knowledge Base for RAG |
| `HEALTHSCRIBE_BUCKET` / `HEALTHSCRIBE_ROLE_ARN` | – | S3 bucket + IAM data-access role for AWS HealthScribe transcription |

## Security model (design doc §10)

- **AuthN:** Cognito user pool (MFA-capable). **AuthZ:** Cognito groups
  (`patient`/`physician`/`admin`/`compliance`) → API Gateway's Cognito JWT
  authorizer (verifies the token) + data-layer ownership/role checks in
  `db/cases_repo.py` and the resolvers (`ctx.require_permission`), plus a
  second, admin-editable fine-grained permission layer (`permissions.py`) —
  see `../docs/ARCHITECTURE.md` §5.
- **Patient-facing interview path has no data-access tools** — it can only ever
  see the current case.
- **Rejections require a reason** (anti-rubber-stamp / anti-automation-bias).
- **Immutable audit:** every significant action is appended to the audit table
  (who/what/when/model version/retrieved context/output); production mirrors to
  an S3 Object Lock (WORM) bucket.
- **Encryption:** KMS CMK on DynamoDB + S3; TLS in transit.
