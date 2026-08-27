# Sehati — AI Clinical Decision Support (Prototype)

An AI clinical co-pilot for hospital wards. A nurse admits the patient, an AI
interviews them on her locked device and routes the case to a doctor; the
doctor works it up — exams, tests, a results-driven differential with the
reasoning and citations behind it — and signs off a final diagnosis.

> ⚠️ **Not a medical product.** Decision support for a licensed physician: it
> presents option lists for independent review, never a directive.

**No demo mode.** Every case, message, result and diagnosis comes from a
deployed AWS stack (Cognito → API Gateway → Lambda → DynamoDB). There is no
bundled sample data and no in-browser AI, so `npm run dev` fails fast until
you've deployed and written a `.env` (see `.env.example`).

---

## How a case moves

1. **Admission (nurse)** — name, age, sex, height, weight, vitals. No symptom
   fields: the AI asks the patient directly.
2. **AI interview (locked device)** — she hands over the tablet and it locks to
   the interview screen; getting out costs an admin-set exit password, checked
   server-side. The adaptive Q&A produces a structured summary, so the doctor
   never reads the raw transcript.
3. **Routing (nurse)** — she assigns the case to a doctor. This is what grants
   access; an unassigned case is invisible to every doctor.
4. **Consultation recording** — the doctor is asked once, on first open,
   whether they recorded the consultation. If so, AWS HealthScribe transcribes
   it and every later AI step reasons over it too. "No" is a complete answer.
5. **Examination** — AI-recommended exams with reasons; the doctor enters
   findings, and can add exams the AI didn't suggest.
6. **Tests & results** — recommended investigations with expected finding,
   priority and diagnostic value; the doctor orders, declines, or adds their
   own, then enters what came back.
7. **Differential** — driven by the results, not the intake. It answers
   honestly: nothing resulted yet, a ranked differential, or "not sure" — in
   which case it writes a new round of tests onto the workup. Each diagnosis
   carries its confidence explanation, risk, references and similar cases.
8. **Discussion** — every diagnosis has its own chat for challenging the
   reasoning ("Why not pulmonary embolism?"), answered by Amazon Bedrock.
9. **Sign-off** — a final diagnosis with evidence, ruled-out alternatives and a
   treatment/monitoring/follow-up plan. Accepting it asks for feedback once,
   there and then; **Mark complete** is available in the header at any stage.

Throughout: a case-aware **assistant panel**, a per-case **Documents** tab
whose extracted text grounds every AI step, private per-doctor **case tags**,
and a shared, tagged **Knowledge Base** the AI pulls from automatically.

## Who sees what

Three roles — **doctor**, **nurse**, **admin**. Patients never sign in. Two
rules do the real work, both enforced in the Lambda, not the browser:

- **A doctor sees only their assigned cases.** Assignment is an access
  boundary, not a filter.
- **A nurse never receives clinical content.** The interview, differential,
  tests and diagnosis are stripped from her response before it leaves the
  Lambda — the payload genuinely doesn't contain them.

Only an admin can create accounts (`/admin`: users, permission groups, and the
interview exit password). Cognito's role groups decide *whose data* you can
reach; admin-editable permission groups decide *which actions* you can take.
Detail: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §5.

---

## Quick start

Node 18+ (developed on Node 22). Deploy the backend first — see below.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build to dist/
```

## Deploy to AWS

```bash
export AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=...
./scripts/deploy.sh                 # or .\scripts\deploy.ps1 on Windows
```

Provisions `SehatiBackend` (API Gateway + Lambda + DynamoDB + Cognito + S3/KMS)
via CDK and writes your `.env`. Then create the first admin — a Cognito user
alone can do nothing, permissions come from its `sehati-users` record:

```bash
cd backend && pip install -r requirements.txt
USER_POOL_ID=<UserPoolId from the output> AWS_REGION=us-east-1 \
  python -m scripts.bootstrap_admin      # admin / Admin@123456, safe to re-run
```

Sign in, then: **Admin → Settings** to set the interview exit password (do this
first, or a device handed to a patient locks with no way out), **Admin → Users**
to create a nurse and a doctor.

To host the built site on a real HTTPS URL, `./scripts/deploy-frontend.sh`
deploys a second stack (S3 + CloudFront) and prints a `SiteUrl`.

Sample cases, role migration, and troubleshooting (including the
`backend/.venv` Lambda-size trap) are in
[`docs/AWS_DEPLOYMENT.md`](docs/AWS_DEPLOYMENT.md).

---

## Repo layout

| Where | What |
|---|---|
| [`src/`](src/) | React frontend — `pages/`, per-case `tabs/`, `components/`, React Query `hooks/`, `lib/` (api, Cognito auth, kiosk lock, session). |
| [`backend/`](backend/) | Python Lambda — workflow, resolvers, data layer, AI seam, tests. Runs locally with no AWS account: `python backend/scripts/local_invoke.py`. |
| [`infra/`](infra/) | AWS CDK app that provisions both stacks. |
| [`docs/`](docs/README.md) | Data model, workflow, API reference, deployment runbook, architecture, verification checklist. |

**Stack:** React 18 + TypeScript + Vite, Tailwind CSS, wouter, React Query,
Recharts, lucide-react. The frontend talks to Cognito and API Gateway directly
(`src/lib/auth.ts`, `src/lib/api.ts`) — no AWS SDK. All AI reasoning happens in
the backend seam (`backend/sehati/ai/`) against Amazon Bedrock; there is no
offline or fake mode.

```
Browser ──Cognito JWT──> API Gateway ──> Lambda (sehati.handler)
                          (authorizer)      ├─ router.py    → resolvers/*.py
                                            ├─ db/*_repo.py → DynamoDB (row-level authz)
                                            └─ ai/factory.py → Amazon Bedrock (Claude)
```
