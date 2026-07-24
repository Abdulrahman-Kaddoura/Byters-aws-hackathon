# SEHATI-AI — Backend

A doctor-in-the-loop **clinical decision-support (CDS)** backend, built AWS-native
per the SEHATI-AI design document. It owns the case data, the clinical workflow,
the API, security and the audit trail. The **AI team** plugs its model/prompt/RAG
work into a single seam (`sehati/ai/`); the **frontend team** consumes a REST
API. This service works fully **today** with a built-in stub AI — no model, no
network, no cost.

> Not a medical device. A CDS aid presents prioritised option lists for a
> licensed physician to independently review — never a directive, never a
> direct-to-patient diagnosis. See [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).

---

## Architecture at a glance

```
Cognito (auth, groups)
   → API Gateway (REST, Cognito authorizer)
      → Lambda orchestrator (this Python package, Lambda proxy integration)
         → AIService seam  (stub | Amazon Bedrock + Guardrails + Knowledge Bases)
         → DynamoDB        (cases · audit · feedback)
         → S3 + KMS        (documents · immutable WORM audit)
```

- **Data store:** DynamoDB (serverless, scale-to-zero). Patient isolation is
  enforced in the **data-access layer** (`db/cases_repo.py`) — the DynamoDB
  analog of Aurora row-level security. The AI is never the authorization boundary.
- **AI seam:** `AI_PROVIDER=stub` (default) or `AI_PROVIDER=bedrock`.
- Deploy with the CDK app in [`../infra`](../infra); hosting steps in
  [`../docs/AWS_DEPLOYMENT.md`](../docs/AWS_DEPLOYMENT.md).

## Package layout

```
sehati/
  handler.py          # Lambda entry — routes API Gateway events, shapes errors
  router.py           # API route field name -> resolver function
  context.py          # AuthContext built from the *signed* Cognito identity
  models.py           # Domain model, mirror of ../src/types.ts + factories
  state_machine.py    # Case lifecycle transitions (design doc §7)
  errors.py           # Typed, client-safe errors
  resolvers/          # cases · interview · exams · diagnosis · tests · collab
  ai/                 # base (contract) · stub · bedrock · prompts · factory
  db/                 # tables · cases_repo (RLS) · audit_repo · feedback_repo
  data/seed_cases.json# 7 sample cases generated from ../src/data/cases.ts
tests/                # pytest (moto-mocked DynamoDB) — 28 tests
scripts/              # seed_cases.py · local_invoke.py
```

## Local development (no AWS account)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate     # optional
pip install -r requirements.txt

# 1) Run the test suite (moto mocks DynamoDB in-memory)
pytest

# 2) Drive a full case through the entire lifecycle with the stub AI,
#    including the patient-isolation guard, printing each step:
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

Implement `sehati.ai.base.AIService`. The two shipped implementations share the
exact same contract and output shapes (which match `../src/types.ts`):

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
retrieval. Flip it on with `AI_PROVIDER=bedrock`.

## Configuration (environment variables)

| Variable | Default | Purpose |
|---|---|---|
| `AI_PROVIDER` | `stub` | `stub` or `bedrock` |
| `CASES_TABLE` / `AUDIT_TABLE` / `FEEDBACK_TABLE` | `sehati-*` | DynamoDB table names (set by CDK) |
| `AWS_REGION` | `us-east-1` | Region |
| `DYNAMODB_ENDPOINT` | – | Local DynamoDB endpoint override |
| `BEDROCK_MODEL_ID` | `anthropic.claude-sonnet-4-...` | Claude model (bedrock provider) |
| `BEDROCK_GUARDRAIL_ID` / `_VERSION` | – | Optional Bedrock Guardrail |
| `BEDROCK_KNOWLEDGE_BASE_ID` | – | Optional Knowledge Base for RAG |

## Security model (design doc §10)

- **AuthN:** Cognito user pool (MFA-capable). **AuthZ:** Cognito groups
  (`patient`/`physician`/`admin`/`compliance`) → API Gateway's Cognito authorizer
  (verifies the token) + data-layer ownership/role checks in `db/cases_repo.py`
  and the resolvers (`ctx.require_*`).
- **Patient-facing interview path has no data-access tools** — it can only ever
  see the current case.
- **Rejections require a reason** (anti-rubber-stamp / anti-automation-bias).
- **Immutable audit:** every significant action is appended to the audit table
  (who/what/when/model version/retrieved context/output); production mirrors to
  an S3 Object Lock (WORM) bucket.
- **Encryption:** KMS CMK on DynamoDB + S3; TLS in transit.
