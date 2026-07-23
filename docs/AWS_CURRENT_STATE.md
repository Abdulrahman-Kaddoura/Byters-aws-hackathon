# AWS Current State — Audit Snapshot (2026-07-23)

This records what already exists in the shared AWS account, discovered by CLI
audit since none of it is defined as code (no CloudFormation/CDK). It exists so
the team has one place that reflects **reality**, separate from what
[`AWS_DEPLOYMENT.md`](./AWS_DEPLOYMENT.md) will create when `SehatiBackend` is
first deployed.

**Status: the two systems are currently fully separate, and that's intentional
for now.** The AI team continues to iterate on their pipeline independently;
this repo's backend runs on the built-in stub AI (`AI_PROVIDER=stub`) until a
deliberate decision is made to integrate. See §5 below.

---

## Account & region

- Account: `782968044136`.
- **The AI team's resources all live in `us-east-1`** (every Lambda ARN, the API
  Gateway, the Bedrock Agent and both Knowledge Bases).
- **`SehatiBackend`** (this repo's CDK stack) defaults to **`eu-central-1`**, per
  the design doc's region decision (EU model catalog + EU data-protection
  jurisdiction, design doc §5).
- These are two different regions in the same account. This needs a deliberate
  decision before any integration — not something to inherit by accident.
  Cross-region calls add latency, and for a healthcare product the region also
  carries the design doc's data-residency reasoning.

## 1. API Gateway

HTTP API **`Frontend_AI_connection`** (id `shvvyn8bg3`), `us-east-1`. No
authorizer on any route (`AuthorizationType: NONE` everywhere).

| Route | Wired to a Lambda? |
|---|---|
| `POST /transcribe` | ✅ → `health-scribe-call` |
| `PUT /Update` | ❌ no integration |
| `POST /tests` | ❌ no integration |
| `GET /query` | ❌ no integration |
| `GET /history` | ❌ no integration |
| `POST /physical-examinations` | ❌ no integration |
| `POST /final-diagnosis` | ❌ no integration |
| `POST /differential-diagnosis` | ❌ no integration |

Only 1 of 8 routes is functional today.

## 2. Lambda functions

All `python3.14`, handler `lambda_function.lambda_handler`, `us-east-1`.

| Function | Wired to API GW? | Timeout | Notes |
|---|---|---|---|
| `health-scribe-call` | ✅ `/transcribe` | 3s | Hardcodes the input audio (`s3://healthscribetry/CAR0001.mp3`) — ignores whatever the caller sends. Has code sitting **after** `lambda_handler` at module level, which Lambda runs at cold start / import time, not per-request — it reads `healthscribetry/summary.json` from S3 immediately on init. If that key doesn't exist yet, the function **fails to initialize entirely**. |
| `RAG` | ❌ | 30s | Query and knowledge-base id are hardcoded (`"what is the recommended physical examinations for chest pain"`, KB `8VHWWL8H7N`); always overwrites the same S3 result file. Has leftover interactive-debug code. |
| `LLM` | ❌ | 30s | Best-structured of the four — reads a `question` from a JSON body if present. But it only ever has `RAG`'s fixed chest-pain output to draw on (reads a fixed S3 key by default); no `caseId` or per-case scoping. |
| `Doctor-Patient_Dialogue_Transcribe` | ❌ | 3s | Starts an async Amazon Transcribe Medical job and returns; nothing anywhere retrieves the result afterward. |

## 3. Amazon Bedrock

- **Agent** `AI-Diagnosis-Assistant` (id `NBOUHAFI0C`), model
  `claude-3-haiku-20240307`, with a real, on-topic system instruction. **Not
  invoked by any of the four Lambdas above** — currently unused by the pipeline.
- **Knowledge Bases**: `knowledge-base-quick-start-ji91c` (`RLZCTFCQSQ`) and
  `knowledge-base-quick-start-ulv25` (`8VHWWL8H7N` — the one `RAG` actually
  queries). Worth asking the AI team whether the first one is a leftover.
- No Guardrails configured.

## 4. Storage

- S3 buckets: `audiooooo`, `doctor-pateint-audio`, `healthscribetry`,
  `rag-physical-examinations`, plus SageMaker's auto-created buckets in
  `us-east-1`/`us-east-2` (so SageMaker Studio has been used too).
- **No DynamoDB tables, no Cognito user pools** — no persistence and no auth
  layer exists anywhere in this pipeline.

## 5. What this means for `SehatiBackend`

- **No naming or resource collisions** — safe to `cdk deploy` `SehatiBackend`
  independently; nothing above shares a name with what the CDK stack creates.
- The two systems are complementary, unfinished halves, not competitors:
  `SehatiBackend` will have real auth/data/workflow but a stub AI; the AI
  pipeline has a real (partial) Bedrock setup but no auth/data/workflow.
- **Team decision (2026-07-23): do not integrate them yet.** The AI team keeps
  iterating on their pipeline independently and on their own timeline; this repo
  proceeds with `AI_PROVIDER=stub`. Revisit wiring `ai/bedrock.py` to their
  Bedrock setup once their pipeline is case-scoped and further along — see
  [`ARCHITECTURE.md`](./ARCHITECTURE.md) §6.

---

*This is a point-in-time snapshot from a CLI audit, not a live source of truth
— nothing here is enforced or monitored. Re-audit before relying on it if much
time has passed. See the chat history / team channel for the exact commands
used, if you need to re-run this audit.*
