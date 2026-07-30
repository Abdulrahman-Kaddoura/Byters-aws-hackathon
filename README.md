# Aura — AI Clinical Decision Support (Prototype)

An interactive prototype of an AI-powered clinical decision support platform.
Aura assists physicians throughout the entire diagnostic journey — organizing
patient information, interviewing patients, brainstorming differential
diagnoses, recommending examinations and tests, explaining its reasoning with
confidence scores and references, and collaborating with the doctor until a
final diagnosis is reached.

> ⚠️ **This is not a real medical product.** It is a decision-support aid for a
> licensed physician — it presents option lists for independent review, never
> a directive.

### Always live — no demo mode

The frontend has a single code path: **Cognito login → API Gateway → Lambda →
DynamoDB**. There is no bundled sample data and no simulated AI in the
browser — every case, message, exam finding, test result and diagnosis is
read from and written to a deployed AWS stack. This means the app **will not
run at all** until you've completed [AWS deployment](#-aws-deployment) below
and have a `.env` pointing at it (see `.env.example`) — `npm run dev` fails
fast with a clear error if `VITE_API_URL` or the Cognito variables are
missing.

---

## ✨ What it demonstrates

The prototype walks through the complete clinical workflow:

1. **Patient intake** — staff enter just the patient's name, then hand the device to the patient for a full-screen **Patient Mode** chat (`/cases/:id/patient-mode`) — no form fields to fill in, the AI gathers demographics, history and the current complaint conversationally.
2. **AI patient interview** — an adaptive Q&A (backend `AIService.next_interview_question`) that auto-generates a **structured clinical summary** (so the doctor never reads the raw transcript). A case can also have extra **side conversations** (return visits/follow-ups) started from the doctor's "Sessions" tab, each its own Patient Mode session.
3. **Doctor workspace** — a per-case dashboard with patient summary, progress tracker, AI insights, suggested next steps and recent updates.
4. **Physical examination** — AI-recommended exams (with reason, importance, confidence) where the doctor enters findings, marks complete/skip, and adds notes.
5. **Differential diagnosis** — ranked diagnosis cards with confidence meters, supporting/contradicting evidence, and full **explainability** (how confidence was calculated, why not 100%, risk, next action, guideline/paper/textbook references, similar historical cases).
6. **AI discussion** — every diagnosis has its own chat where the doctor can challenge the reasoning ("Why not pulmonary embolism?", "What would increase confidence?"), answered by the backend AI seam (Amazon Bedrock).
7. **Recommended tests & results** — investigations with reason, expected finding, priority, cost, urgency and diagnostic value; results arrive and the differential re-ranks.
8. **Final diagnosis** — proposed diagnosis with evidence summary, ruled-out alternatives, treatment, monitoring, complications and follow-up. The doctor can Accept / Modify / Continue investigation / Add notes.
9. **Timeline & completion** — a vertical case timeline and read-only archived cases with outcomes and lessons learned.

A persistent, case-aware **Aura Assistant** panel is available throughout for
open-ended collaboration.

### Seeding sample cases (optional)

`scripts/deploy.sh` / `scripts/deploy.ps1` seed 7 sample patients across
different diseases and workflow stages into DynamoDB so there's something to
look at right after deploying — see [`backend/sehati/data/seed_cases.json`](backend/sehati/data/seed_cases.json)
for the full list (community-acquired pneumonia, acute appendicitis,
decompensated heart failure, uncontrolled asthma, migraine with aura, and two
completed/archived cases). These are real rows in `sehati-cases`, not
frontend-bundled data — delete them from DynamoDB like any other case if you
don't want them.

---

## 🚀 Getting started

Requirements: Node.js 18+ (developed on Node 22). The backend must already be
deployed (see [AWS deployment](#-aws-deployment) below) — the frontend has no
offline/demo mode and won't start without a `.env` pointing at a real stack.

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

On Windows, without Git Bash/WSL, use the PowerShell-native equivalent instead:

```powershell
$env:AWS_ACCESS_KEY_ID = "..."; $env:AWS_SECRET_ACCESS_KEY = "..."
.\scripts\deploy.ps1
```

Both do the same thing: deploy `SehatiBackend` (API Gateway + Lambda +
DynamoDB + Cognito + S3/KMS) via CDK, then print the
`aws cognito-idp admin-create-user` commands to create your first physician
login. After creating that user (and adding it to the `physician` group), run
`npm run dev` — the app requires sign-in and reads every case from DynamoDB.

> **Local dev gotcha:** don't create a Python virtualenv inside `backend/`
> (e.g. `backend/.venv`) — CDK zips the whole `backend/` directory as the
> Lambda deployment package, and a venv full of `boto3`/`botocore` pushes it
> past Lambda's 250 MB unzipped-code limit, causing `cdk deploy` to fail with
> `Unzipped size must be smaller than 262144000 bytes`. Put your venv at the
> repo root (or anywhere outside `backend/`) instead. The stack's asset
> `exclude` list also filters out `.venv`/`venv`/`.pytest_cache` as a
> second line of defense.

Request flow once live:

```
Browser ──Cognito JWT──> API Gateway ──> Lambda (sehati.handler)
                          (authorizer)      │
                                            ├─ router.py  → resolvers/*.py
                                            ├─ db/*_repo.py → DynamoDB (row-level authz)
                                            └─ ai/factory.py → Amazon Bedrock (Claude)
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

The frontend talks to AWS directly — Cognito for auth (`src/lib/auth.ts`) and
API Gateway for data (`src/lib/api.ts`), with no SDK dependency.

## 📁 Project structure

```
src/
  data/          # Type/UI helpers and suggested-prompt labels for the chat panels
  components/    # Reusable UI: sidebar, cards, chat, charts, drawer, badges…
  pages/         # Route pages
    case/        # The per-case workspace (Overview, Interview, Examination,
                 # Differential, Tests, Final Diagnosis, Timeline)
  lib/           # Theme hook + UI/color utilities
  types.ts       # Domain model
```

All AI reasoning comes from the backend seam (`backend/sehati/ai/`) — Amazon
Bedrock (Claude); there is no offline/fake mode.
`src/data/aiResponder.ts` only holds the clickable suggested-prompt labels
shown above the chat input (e.g. "Why not the alternatives?") — clicking one
sends that question through the real API like any typed message.

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
