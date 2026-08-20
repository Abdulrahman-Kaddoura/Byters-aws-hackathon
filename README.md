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

The prototype follows a real ward workflow: a nurse admits the patient, the AI
interviews them on her locked device, she routes the case to a doctor, and the
doctor works it up.

1. **Admission (nurse)** — she records what she can measure: name, age, sex, height, weight, and vitals. Symptoms and history are deliberately not on the form — the AI asks the patient directly, so a field here would mean asking twice.
2. **AI patient interview (locked device)** — she hands over her tablet and it **locks**: routing is pinned to the interview screen, so the URL bar and the back button lead nowhere and a refresh lands back in it. An adaptive Q&A (`AIService.next_interview_question`) auto-generates a **structured clinical summary**, so the doctor never reads the raw transcript. Getting out costs an admin-set exit password, checked server-side.
3. **Routing (nurse)** — she assigns the case to a doctor. This is the moment access is granted: **a doctor sees only the cases assigned to them**, and an unassigned case is invisible to every doctor. Nurses and admins can reassign; it's audit-logged either way.
4. **The doctor's consultation recording** — the first time a doctor opens a case routed to them, they're asked once whether they recorded themselves talking to the patient. If they did, AWS HealthScribe transcribes it and **every** subsequent AI step reasons over both accounts — the patient's AI interview and the doctor's own consultation. Saying "no recording" is a complete answer; the case then runs on the interview alone. It's asked up front because a recording added after the differential is built is too late to inform anything.
5. **Physical examination** — AI-recommended exams (with reason, importance, confidence) where the doctor enters findings, marks complete/skip, and adds notes — plus anything they examined that the AI didn't ask for.
6. **Recommended tests & results** — investigations with reason, expected finding, priority, cost, urgency and diagnostic value. The doctor marks each one awaiting results or declined, enters what came back, and can add tests they ordered themselves when none of the AI's are the right one.
7. **Differential diagnosis** — driven by the results, not the intake. It weighs each recommended test against the result that actually came back and answers honestly: nothing resulted yet (it says so rather than guessing), a ranked differential it's confident in, or "not sure yet" — in which case it writes a **new round of tests** onto the workup and tells the doctor to go and fill them in. Earlier rounds stay as history. Each diagnosis card carries full **explainability** (how confidence was calculated, why not 100%, risk, next action, guideline/paper/textbook references, similar historical cases).
8. **AI discussion** — every diagnosis has its own chat where the doctor can challenge the reasoning ("Why not pulmonary embolism?", "What would increase confidence?"), answered by the backend AI seam (Amazon Bedrock).
9. **Final diagnosis, then treatment** — proposed diagnosis with evidence summary, ruled-out alternatives, treatment, monitoring, complications and follow-up. Signing it off doesn't close the case: the patient still has to be treated, so the case parks in **Treatment** until the doctor either marks it **resolved** or reopens it with an account of what went wrong — which withdraws the sign-off and re-runs the analysis on what actually happened.
10. **Feedback, once and at the end** — only after a case is resolved is the doctor asked how Aura did. It's the single place in the app feedback can be given, enforced server-side, because how the AI reasoned can only be judged once the patient's outcome is known. It's kept as memory for future cases.
11. **Timeline & completion** — a vertical case timeline and read-only archived cases with outcomes and lessons learned.

A persistent, case-aware **Aura Assistant** panel is available throughout for
open-ended collaboration. Each case has a **Documents** tab (upload, list,
download, inline preview — extracted text feeds every AI step as grounding,
and nurses can attach referral letters at admission), and doctors can tag any
case with **private labels** that nobody else can see. The **Knowledge Base**
page holds a shared, tagged reference library (e.g. a diabetes guideline
tagged "diabetes") that Aura pulls in as grounding evidence for any case whose
chief complaint or a doctor's question matches — no per-case action needed.

### 🔑 Who sees what

Three kinds of account: **doctor**, **nurse**, **admin**. Patients never sign
in — they only ever hold a nurse's locked device.

Two rules do the real work, and both are enforced in the data layer rather
than in the browser:

- **A doctor sees only their assigned cases.** Assignment is an access
  boundary, not a filter.
- **A nurse never receives clinical content.** She can open a case to check her
  intake and route it, but the interview, differential, tests and diagnosis are
  stripped from the response *before it leaves the Lambda* — the payload
  genuinely doesn't contain them, so this isn't a hidden tab.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §5.

### 🔐 Admin panel

The hospital doesn't self-register — only an **admin** account can create
other accounts. Admins land in `/admin`, which has three tabs:

- **Users** — create an account (role + one-time temp password shown once),
  edit someone's role, permission groups, and per-user permission overrides,
  or disable them.
- **Groups** — create/edit/delete admin-defined permission groups from a
  fixed catalog of fine-grained permissions (e.g. "manage exams", "sign off
  final diagnosis", "view the audit trail"). The 3 groups matching the roles
  are seeded and can't be deleted, but their permissions can be edited, and
  new groups (e.g. a locum doctor who may add notes but not sign off) can be
  created and assigned independent of a user's role.
- **Settings** — the patient-interview exit password. Stored as a PBKDF2 hash
  and never readable, only replaceable. **Set this before anyone hands a
  device to a patient**: without it the interview screen locks with no way out.

Cognito's 3 role groups decide *whose data you can see at all*; the permission
groups decide *which actions you can take* on top of that — see
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §5. The frontend asks
`GET /me` for its own effective permissions rather than reading the JWT, so it
can't disagree with what the backend enforces. The very first admin account is
created by a one-time bootstrap script — see
[AWS deployment](#-aws-deployment) below.

### Seeding sample cases (optional, manual)

`scripts/deploy.sh` / `scripts/deploy.ps1` **no longer seed automatically** —
the sample data's `createdByNurseId`/`assignedPhysicianId` have to be real
Cognito subs or the cases are invisible to any doctor (assignment is the
access boundary; see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §5), so
seeding before you have real accounts just leaves orphaned rows.

If you want the 7 sample patients (community-acquired pneumonia, acute
appendicitis, decompensated heart failure, uncontrolled asthma, migraine with
aura, and two completed/archived cases — see
[`backend/sehati/data/seed_cases.json`](backend/sehati/data/seed_cases.json)),
create a nurse and a doctor from `/admin` first, then run:

```bash
cd backend
CASES_TABLE=<CasesTableName from the stack output> AWS_REGION=us-east-1 \
  SEED_NURSE_SUB=<the nurse's sub> SEED_DOCTOR_SUB=<the doctor's sub> \
  python -m scripts.seed_cases
```

Get a user's `sub` with `aws cognito-idp admin-get-user --user-pool-id
<UserPoolId> --username <username> --query "UserAttributes[?Name=='sub']
.Value" --output text`. These are real rows in `sehati-cases`, not
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

One command provisions the stack and writes your `.env`:

```bash
export AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=...
./scripts/deploy.sh
```

On Windows, without Git Bash/WSL, use the PowerShell-native equivalent instead:

```powershell
$env:AWS_ACCESS_KEY_ID = "..."; $env:AWS_SECRET_ACCESS_KEY = "..."
.\scripts\deploy.ps1
```

Both deploy `SehatiBackend` (API Gateway + Lambda + DynamoDB + Cognito +
S3/KMS) via CDK.

**Start with the admin account** — every other account is created from the
panel, and a Cognito user on its own can't do anything (permissions come from
the `sehati-users` record, and a user without one fails closed):

```bash
cd backend
pip install -r requirements.txt
USER_POOL_ID=<UserPoolId from the deploy output> AWS_REGION=us-east-1 \
  python -m scripts.bootstrap_admin
```

Seeds the 3 permission groups and creates username `admin` / password
`Admin@123456` (override with `--username`/`--email`/`--password`) as a
ready-to-use permanent login — safe to re-run.

Then sign in and, in order:

1. **Admin → Settings**: set the patient-interview exit password. Do this
   first — without it, a device handed to a patient locks with no way out.
2. **Admin → Users**: create a nurse and a doctor.
3. `npm run dev`, sign in as the nurse, admit a patient, run the interview,
   unlock with the exit password, and assign the case to the doctor.

### Upgrading an existing deployment

If you are deploying over a stack that predates the doctor/nurse/admin roles,
run the migration **after** `cdk deploy` — the deploy replaces the old Cognito
groups, so the script reads each account's role from DynamoDB instead:

```bash
cd backend
python -m scripts.migrate_roles --dry-run   # see what would change
python -m scripts.migrate_roles
```

It maps `physician` → `doctor` and re-seeds the permission groups. Accounts
that were `compliance` or `patient` are reported, not guessed at: those roles
no longer exist, so those users can still sign in but reach nothing until an
admin re-roles or disables them.

Leaving the username at its default `admin` provisions the **fixed super
admin** account: the panel won't let it be demoted, disabled, or stripped of
admin access, and it always has full permissions even if its database record
is ever missing — so you can never fully lock yourself out of `/admin`. Full
detail: [`docs/AWS_DEPLOYMENT.md`](docs/AWS_DEPLOYMENT.md) Task Set 5b.

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
  pages/         # Route pages (CasesHub, CasesBrowser, CaseWorkspace, NewCase,
                 # PatientMode, Login, Settings, admin/…)
  tabs/          # The per-case workspace's tabs (Overview, Interview,
                 # Conversations, Examination, Differential, Tests, Diagnosis,
                 # Timeline), rendered inside CaseWorkspace
  components/    # Reusable UI: sidebar, cards, chat, charts, the consultation
                 # prompt, end-of-case feedback, badges…
  hooks/         # React Query hooks wrapping lib/api.ts (one per endpoint)
  lib/           # api.ts (fetch client), auth.ts (Cognito), theme, utils
  data/          # UI helpers (data/helpers.ts) and suggested-prompt labels for
                 # the chat panels (data/prompts.ts)
  types.ts       # Domain model
```

All AI reasoning comes from the backend seam (`backend/sehati/ai/`) — Amazon
Bedrock (Claude); there is no offline/fake mode. `src/data/prompts.ts` only
holds the clickable suggested-prompt labels shown above the chat input (e.g.
"Why not the alternatives?") — clicking one sends that question through the
real API like any typed message.

---

## 🔌 Backend (AWS-native)

A real, working backend now lives alongside this prototype. It implements the
SEHATI-AI clinical decision-support design as an AWS-native serverless stack —
**API Gateway (HTTP API) + Lambda (Python) + DynamoDB + Cognito**, with AI
reasoning via **Amazon Bedrock** (no offline/stub mode) and audio
transcription via **AWS HealthScribe** — and serves the same `PatientCase`
shape this frontend already uses.

| Where | What |
|-------|------|
| [`backend/`](backend/) | The Python backend: workflow, API resolvers, data layer, AI seam, tests. Fully runnable locally with no AWS account (`python backend/scripts/local_invoke.py`). |
| [`infra/`](infra/) | AWS CDK app (Python) that provisions the whole stack. |
| [`docs/AWS_DEPLOYMENT.md`](docs/AWS_DEPLOYMENT.md) | Step-by-step runbook to host it on AWS. |
| [`docs/API.md`](docs/API.md) | API reference for wiring up this frontend. |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | How it maps to the design document. |

> The backend is a decision-support aid for a licensed physician, not a medical
> device — it presents option lists for independent review, never directives.
