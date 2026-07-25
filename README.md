# Aura — AI Clinical Decision Support (Prototype)

An interactive prototype of an AI-powered clinical decision support platform.
Aura assists physicians throughout the entire diagnostic journey — organizing
patient information, interviewing patients, brainstorming differential
diagnoses, recommending examinations and tests, explaining its reasoning with
confidence scores and references, and collaborating with the doctor until a
final diagnosis is reached.

> ⚠️ **This is not a real medical product.** Patients, conversations, diagnoses,
> test results and references are dummy data used to demonstrate the workflow,
> UX and physician–AI collaboration.

### Two run modes

| Mode | When | Data source |
|------|------|-------------|
| **Demo** (default) | No `.env` present | Bundled sample cases; AI replies are simulated in-browser |
| **Live AWS** | `.env` points at a deployed stack | Cognito login → API Gateway → Lambda → DynamoDB |

Demo mode needs nothing but `npm install`. For live mode see
[AWS deployment](#-aws-deployment) below.

---

## ✨ What it demonstrates

The prototype walks through the complete clinical workflow:

1. **Patient intake** — a multi-step wizard capturing demographics, history and the current complaint.
2. **AI patient interview** — a simulated adaptive Q&A that auto-generates a **structured clinical summary** (so the doctor never reads the raw transcript).
3. **Doctor workspace** — a per-case dashboard with patient summary, progress tracker, AI insights, suggested next steps and recent updates.
4. **Physical examination** — AI-recommended exams (with reason, importance, confidence) where the doctor enters findings, marks complete/skip, and adds notes.
5. **Differential diagnosis** — ranked diagnosis cards with confidence meters, supporting/contradicting evidence, and full **explainability** (how confidence was calculated, why not 100%, risk, next action, guideline/paper/textbook references, similar historical cases).
6. **AI discussion** — every diagnosis has its own chat where the doctor can challenge the reasoning ("Why not pulmonary embolism?", "What would increase confidence?"). Responses are simulated but reasoning-first.
7. **Recommended tests & results** — investigations with reason, expected finding, priority, cost, urgency and diagnostic value; results arrive and the differential re-ranks.
8. **Final diagnosis** — proposed diagnosis with evidence summary, ruled-out alternatives, treatment, monitoring, complications and follow-up. The doctor can Accept / Modify / Continue investigation / Add notes.
9. **Timeline & completion** — a vertical case timeline and read-only archived cases with outcomes and lessons learned.

A persistent, case-aware **Aura Assistant** panel is available throughout for
open-ended collaboration.

### Sample cases

Seven dummy patients across different diseases and workflow stages:

| Case | Condition | Stage / status |
|------|-----------|----------------|
| Robert Hayes | Community-acquired Pneumonia | Diagnosis in progress (showcase) |
| Sofia Marino | Acute Appendicitis | Awaiting tests |
| Margaret Ellis | Decompensated Heart Failure | Differential |
| Daniel Osei | Uncontrolled Asthma | Awaiting examination |
| Priya Nair | Migraine with Aura | AI interview |
| James Whitfield | Type 2 Diabetes | Completed (read-only) |
| Ahmed Farouk | Kidney Stone (renal colic) | Completed (read-only) |

---

## 🚀 Getting started

Requirements: Node.js 18+ (developed on Node 22).

```bash
npm install
npm run dev      # start the dev server (http://localhost:5173)
```

Other scripts:

```bash
npm run build    # type-check + production build to dist/
npm run preview  # preview the production build
```

---

## ☁️ AWS deployment

One command provisions the stack, seeds the sample cases and writes your `.env`:

```bash
export AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=...
./scripts/deploy.sh
```

It deploys `SehatiBackend` (API Gateway + Lambda + DynamoDB + Cognito + S3/KMS)
via CDK, then prints the `aws cognito-idp admin-create-user` commands to create
your first physician login. Restart `npm run dev` afterwards and the app will
require sign-in and read every case from DynamoDB.

To switch the AI from the deterministic stub to Amazon Bedrock:

```bash
AI_PROVIDER=bedrock ./scripts/deploy.sh
```

Request flow once live:

```
Browser ──Cognito JWT──> API Gateway ──> Lambda (sehati.handler)
                          (authorizer)      │
                                            ├─ router.py  → resolvers/*.py
                                            ├─ db/*_repo.py → DynamoDB (row-level authz)
                                            └─ ai/factory.py → stub | Bedrock
```

Details: [`docs/AWS_DEPLOYMENT.md`](docs/AWS_DEPLOYMENT.md),
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/API.md`](docs/API.md).

---

## 🧱 Tech stack

- **React 18** + **TypeScript** + **Vite**
- **Tailwind CSS** (custom design system, light + dark themes via CSS variables)
- **React Router** for navigation
- **Recharts** for confidence-trend charts
- **lucide-react** for icons

In live mode the frontend talks to AWS directly — Cognito for auth
(`src/lib/auth.ts`) and API Gateway for data (`src/lib/api.ts`), with no SDK
dependency. In demo mode no application network calls are made.

## 📁 Project structure

```
src/
  data/          # Hardcoded cases, type helpers, and the simulated AI responder
  components/    # Reusable UI: sidebar, cards, chat, charts, drawer, badges…
  pages/         # Route pages
    case/        # The per-case workspace (Overview, Interview, Examination,
                 # Differential, Tests, Final Diagnosis, Timeline)
  lib/           # Theme hook + UI/color utilities
  types.ts       # Domain model
```

The "AI" is a rule/keyword-based responder (`src/data/aiResponder.ts`) that
produces believable, reasoning-first answers grounded in each case's data — so
the chat feels interactive during a demo without any model behind it.

---

## 🔌 Backend (AWS-native)

A real, working backend now lives alongside this prototype. It implements the
SEHATI-AI clinical decision-support design as an AWS-native serverless stack —
**API Gateway (REST) + Lambda (Python) + DynamoDB + Cognito**, with a pluggable
AI seam (a built-in stub today, Amazon Bedrock ready) — and serves the same
`PatientCase` shape this frontend already uses.

| Where | What |
|-------|------|
| [`backend/`](backend/) | The Python backend: workflow, API resolvers, data layer, AI seam, tests. Fully runnable locally with no AWS account (`python backend/scripts/local_invoke.py`). |
| [`infra/`](infra/) | AWS CDK app (Python) that provisions the whole stack. |
| [`docs/AWS_DEPLOYMENT.md`](docs/AWS_DEPLOYMENT.md) | Step-by-step runbook to host it on AWS. |
| [`docs/API.md`](docs/API.md) | REST API reference for wiring up this frontend. |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | How it maps to the design document. |

> The backend is a decision-support aid for a licensed physician, not a medical
> device — it presents option lists for independent review, never directives.
