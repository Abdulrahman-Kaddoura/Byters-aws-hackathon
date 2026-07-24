# Aura / SEHATI-AI — AI Clinical Decision Support

A clinical decision-support platform: a React frontend wired to a real,
deployed AWS-native backend. Aura assists physicians throughout the entire
diagnostic journey — organizing patient information, interviewing patients,
brainstorming differential diagnoses, recommending examinations and tests,
explaining its reasoning with confidence scores and references, and
collaborating with the doctor until a final diagnosis is reached and signed
off.

> ⚠️ **Not a real medical product.** This is a decision-support aid for a
> licensed physician, not a medical device — it presents option lists for
> independent review, never directives.

---

## Frontend

[`AURA UPDATED FRONTEND/`](AURA%20UPDATED%20FRONTEND/) is the app — React +
Vite, Cognito login, and every stage of the case lifecycle (AI interview,
exam findings, differential diagnosis, tests, final diagnosis sign-off, and
the audit trail for admin/compliance roles) calling the live backend. No
mock or seeded data.

```bash
cd "AURA UPDATED FRONTEND"
cp .env.example .env
npm install
npm run dev      # http://localhost:5173
```

See [`AURA UPDATED FRONTEND/README.md`](AURA%20UPDATED%20FRONTEND/README.md)
for environment variables, project structure, and how to provision a demo
Cognito login (self sign-up is disabled).

## Backend (AWS-native, already deployed)

The SEHATI-AI backend is a serverless stack — **API Gateway (REST) + Lambda
(Python) + DynamoDB + Cognito**, with a pluggable AI seam (a built-in stub
today, Amazon Bedrock ready).

| Where | What |
|-------|------|
| [`backend/`](backend/) | The Python backend: workflow, API resolvers, data layer, AI seam, tests. Fully runnable locally with no AWS account (`python backend/scripts/local_invoke.py`). |
| [`infra/`](infra/) | AWS CDK app (Python) that provisions the whole stack. |
| [`docs/API.md`](docs/API.md) | REST API reference — every endpoint, request/response shape. |
| [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) | The `PatientCase` domain model, field by field. |
| [`docs/WORKFLOW.md`](docs/WORKFLOW.md) | The case lifecycle state machine. |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | How it maps to the design document. |
| [`docs/AWS_DEPLOYMENT.md`](docs/AWS_DEPLOYMENT.md) | Step-by-step runbook to (re)deploy it. |
| [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md) | Current live deployment's stack outputs (API URL, Cognito pool/client IDs, region). |

The frontend's `.env.example` is pre-filled with the current live deployment's
values from `docs/PROJECT_STATUS.md`.
