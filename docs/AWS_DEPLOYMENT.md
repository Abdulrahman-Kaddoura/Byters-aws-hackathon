# SEHATI-AI — Hosting on AWS (Step by Step)

This guide puts the backend on AWS. It's organised as **Task Sets** — each one is a
self-contained job with a clear goal, the exact commands, what you should see, and a
**checkpoint** so you know it worked before moving on. Do them in order.

You run **most sets once**. After the first deploy, day-to-day you'll only use
Task Set 8 (update) and occasionally Task Set 9 (teardown).

| Task Set | Goal | Run it… |
|---|---|---|
| **0** | Install the tools | once per computer |
| **1** | Point at your AWS account | once (per shell session) |
| **2** | Prepare CDK (bootstrap) | once per account+region |
| **3** | Deploy the backend | once, then on updates |
| **4** | Save the connection details (outputs) | after each deploy |
| **5** | Create login users (Cognito) | once (add more anytime) |
| **6** | Load the 7 sample cases | once (optional) |
| **7** | Verify it works | after first deploy |
| **8** | Turn on real AI (Bedrock) | optional |
| **9** | Update / redeploy | whenever code changes |
| **10** | Tear it down | when finished |
| **11** | Host the frontend on AWS (S3 + CloudFront) | once, then on frontend updates |

**What you're building:** one CloudFormation stack called `SehatiBackend` in the
**us-east-1 (N. Virginia)** region, containing API Gateway (the REST API),
Lambda (the logic), DynamoDB (3 tables), Cognito (logins), S3 + KMS (files,
audit, encryption).

**Cost:** ~$150–500/month at pilot scale *with real AI on*, dominated by AI tokens;
**near-zero when idle**. With the default stub AI there is **no model cost at all**.

---

## Task Set 0 — Install the tools (once per computer)

**Goal:** have the four tools the deployment needs.

| Tool | Install | Verify |
|------|---------|--------|
| AWS CLI v2 | https://aws.amazon.com/cli/ | `aws --version` |
| Node.js 18+ | https://nodejs.org (needed only to run the CDK command) | `node --version` |
| AWS CDK | `npm install -g aws-cdk` | `cdk --version` |
| Python 3.12 | https://www.python.org | `python3 --version` |

**Checkpoint:** all four version commands print a version number.

---

## Task Set 1 — Point at your AWS account (per shell session)

**Goal:** let the tools talk to *your* AWS account, in `us-east-1`.

1. Configure your AWS credentials (access key + secret) once:
   ```bash
   aws configure
   # Region: enter  us-east-1
   ```
2. Confirm you're connected and remember your account number + region:
   ```bash
   aws sts get-caller-identity
   export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
   export CDK_DEFAULT_REGION=us-east-1
   ```

**Checkpoint:** `aws sts get-caller-identity` prints your account id (no error).

---

## Task Set 2 — Prepare CDK (once per account + region)

**Goal:** create the small helper stack CDK needs to deploy things
("bootstrapping"). You only ever do this once per account/region.

1. Install the deployment code's Python dependencies:
   ```bash
   cd infra
   python3 -m venv .venv && source .venv/bin/activate
   pip install -r requirements.txt
   ```
2. Bootstrap:
   ```bash
   cdk bootstrap aws://$CDK_DEFAULT_ACCOUNT/us-east-1
   ```

**Checkpoint:** you see `✅ Environment aws://…/us-east-1 bootstrapped`.

---

## Task Set 3 — Deploy the backend

**Goal:** create the whole stack in your account. The default AI is the **stub**, so
this works immediately with nothing else to enable.

1. From `infra/` (venv still active):
   ```bash
   cdk synth      # optional: preview the CloudFormation it will create
   cdk deploy     # it lists the security/IAM changes — type "y" to approve
   ```
2. Wait ~3–5 minutes. When it finishes it prints an **Outputs** block.

**Checkpoint:** the command ends with `✅ SehatiBackend` and an Outputs list.

> If it says you need to bootstrap, go back to Task Set 2.

---

## Task Set 4 — Save the connection details (after each deploy)

**Goal:** record the values the frontend and later task sets need.

After a deploy, CDK prints these (you can re-print them anytime with the command
below). **Copy them somewhere safe:**

```bash
aws cloudformation describe-stacks --stack-name SehatiBackend \
  --query "Stacks[0].Outputs" --output table
```

| Output | What it's for |
|--------|---------------|
| `ApiUrl` | The API address the app calls (ends in `/prod/`). |
| `UserPoolId` | The Cognito user directory id (for creating users). |
| `UserPoolClientId` | The app's login client id (for signing in). |
| `Region` | `us-east-1`. |
| `CasesTableName` | The cases table name (used by the seed step). |
| `AIProvider` | `stub` or `bedrock` (which AI is active). |

**Checkpoint:** you have `ApiUrl`, `UserPoolId`, and `UserPoolClientId` saved.

---

## Task Set 5 — Create login users (Cognito)

**Goal:** create at least one **physician** and one **patient** so you can log in.
Replace `<UserPoolId>` with your saved value.

```bash
POOL=<UserPoolId>

# --- A physician (can do everything clinical) ---
aws cognito-idp admin-create-user --user-pool-id $POOL --username dr.karim \
  --user-attributes Name=email,Value=karim@example.com Name=email_verified,Value=true \
  --message-action SUPPRESS
aws cognito-idp admin-set-user-password --user-pool-id $POOL --username dr.karim \
  --password 'Passw0rd!Demo' --permanent
aws cognito-idp admin-add-user-to-group --user-pool-id $POOL --username dr.karim \
  --group-name physician

# --- A patient (sees only their own cases) ---
aws cognito-idp admin-create-user --user-pool-id $POOL --username layla \
  --user-attributes Name=email,Value=layla@example.com Name=email_verified,Value=true \
  --message-action SUPPRESS
aws cognito-idp admin-set-user-password --user-pool-id $POOL --username layla \
  --password 'Passw0rd!Demo' --permanent
aws cognito-idp admin-add-user-to-group --user-pool-id $POOL --username layla \
  --group-name patient
```

Available groups: **patient**, **physician**, **admin**, **compliance**. Add an
`admin`/`compliance` user the same way if you want to test the audit trail.

**Optional — get a user's stable id (`sub`)** for the seeding step:
```bash
aws cognito-idp admin-get-user --user-pool-id $POOL --username dr.karim \
  --query "UserAttributes[?Name=='sub'].Value" --output text
```

**Checkpoint:** `admin-add-user-to-group` returned no error for both users.

---

## Task Set 6 — Load the 7 sample cases (optional but recommended)

**Goal:** put real data in the database so the app has something to show. These are
the same 7 cases the frontend was built around.

```bash
cd ../backend
pip install -r requirements.txt
export AWS_REGION=us-east-1

# Assign who owns the seeded cases (use the subs from Task Set 5):
export SEED_PATIENT_SUB=<layla-sub>
export SEED_PHYSICIAN_SUB=<dr.karim-sub>

python scripts/seed_cases.py
```

**Checkpoint:** it prints "Seeded 7 cases into sehati-cases".

---

## Task Set 7 — Verify it works

**Goal:** prove the API answers and that role-based access works.

```bash
# 1) get a login token for the physician
TOKEN=$(aws cognito-idp initiate-auth --auth-flow USER_PASSWORD_AUTH \
  --client-id <UserPoolClientId> \
  --auth-parameters USERNAME=dr.karim,PASSWORD='Passw0rd!Demo' \
  --query "AuthenticationResult.IdToken" --output text)

# 2) call the API — note: the raw ID token, no "Bearer " prefix
curl -s "<ApiUrl>cases" -H "Authorization: $TOKEN"
```

Now sign in as **`layla`** (patient) the same way and call `GET /cases` again —
she should see **only her own** cases. That proves the isolation works.

**Checkpoint:** `GET /cases` returns case data for the physician; a patient sees
only their own. See [`API.md`](./API.md) for every endpoint.

---

## Task Set 8 — Turn on real AI with Amazon Bedrock (optional)

**Goal:** switch from the built-in stub to real Claude reasoning. Skip this if the
stub is fine for your demo.

**Console model access is gone.** AWS retired the Bedrock "Model access" page —
foundation models now enable automatically the first time your account invokes
them, nothing to click in advance. The one thing that can still gate you: the
**first time your account ever calls an Anthropic model**, Bedrock may require a
one-time "use case details" form (Bedrock console → Model catalog → open any
Claude model → it'll prompt you if needed). Submit it and access is typically
granted within a minute or two.

1. **Redeploy with Bedrock selected:**
   ```bash
   cd ../infra
   cdk deploy SehatiBackend -c ai_provider=bedrock
   ```
   (The Lambda already has permission to call Bedrock.) This also bakes in
   `BEDROCK_MODEL_ID` — see the next point.
2. **Model id must be an inference profile, not a bare model id.** Recent Claude
   models on Bedrock reject on-demand `Converse` calls against the bare model id
   (`anthropic.claude-...`) with `ValidationException: ... isn't supported.
   Retry your request with the ID or ARN of an inference profile`. Use the
   `us.anthropic.claude-...` (or `global.anthropic.claude-...`) cross-region
   inference profile id instead. `infra/stacks/sehati_stack.py` defaults
   `BEDROCK_MODEL_ID` to `us.anthropic.claude-sonnet-4-5-20250929-v1:0` — a
   currently-active, non-legacy Sonnet model that doesn't need the use-case form.
   Override it at deploy time with `-c bedrock_model_id=<id>` if you want a
   different one. To see what's actually available/active in your account:
   ```bash
   aws bedrock list-inference-profiles --region us-east-1 \
     --query "inferenceProfileSummaries[].{Id:inferenceProfileId,Name:inferenceProfileName}" \
     --output table
   ```
   Two failure modes you may hit picking a model:
   - `ResourceNotFoundException: ... marked by provider as Legacy` — that model id
     is retired from active serving; pick a newer one from the list above.
   - `AccessDeniedException: ... is not available for this account` — usually the
     brand-newest models (e.g. a freshly released Sonnet/Opus) gated behind the
     one-time Anthropic use-case form described above; fall back to an
     already-active model (like Sonnet 4.5) or submit the form and retry.
3. **Optional, for production quality:** create a Bedrock **Guardrail** and a
   **Knowledge Base** (your curated medical corpus), then redeploy with their
   ids so the Lambda's IAM grant is scoped to those specific resources (instead
   of just the model):
   ```bash
   cdk deploy SehatiBackend -c ai_provider=bedrock \
     -c bedrock_guardrail_id=<guardrail-id> \
     -c bedrock_guardrail_version=<version-or-DRAFT> \
     -c bedrock_knowledge_base_id=<kb-id>
   ```

If Bedrock is unavailable or a model isn't enabled, requests return a real
`500 InternalError` instead of silently degrading — there is no stub fallback
once `AI_PROVIDER=bedrock` is deployed. Check CloudWatch logs on
`sehati-orchestrator` for the underlying Bedrock error:
```bash
aws logs tail /aws/lambda/sehati-orchestrator --since 15m --region us-east-1 --format short
```

**API Gateway's 29-second hard timeout.** REST API Lambda integrations cannot be
configured past 29 seconds — this is an AWS ceiling, not something this stack
can raise. The Lambda's own timeout is 60s, so a slow Bedrock call can finish
successfully server-side (visible in CloudWatch as a normal, non-error
`REPORT` line) while the physician-facing request already failed client-side
with a generic error a second earlier. `ai/bedrock.py`'s `answer()` (case chat)
caps `maxTokens` at 600 to keep replies fast and reliably under that ceiling;
`_converse`/`_converse_json` still default to 2000 tokens for the
structured, JSON-shaped calls (differential, summary, etc.) that need the room.
If you still see intermittent timeouts, that's Bedrock-side latency/throttling
variance, not a code bug — retry, or space out requests.

**Checkpoint:** the `AIProvider` output (Task Set 4) now reads `bedrock`, and a
`POST /cases/{caseId}/assistant` call returns a model-generated answer.

---

## Task Set 9 — Update / redeploy (whenever code changes)

**Goal:** push new backend or infra code.

```bash
cd infra
source .venv/bin/activate
cdk deploy
```

The Lambda code is automatically re-packaged from `../backend`. Nothing else to do.

**Checkpoint:** deploy ends with `✅ SehatiBackend`.

---

## Task Set 10 — Tear it down (when finished)

**Goal:** remove everything and stop any charges.

```bash
cd infra
cdk destroy
```

**One thing is kept on purpose:** the **audit bucket** (it's a tamper-proof WORM
store, so it isn't auto-deleted). To remove it after `cdk destroy`, find its name
in the S3 console (starts with `sehatibackend-auditbucket…`) and:
```bash
aws s3 rm s3://<AuditBucketName> --recursive
aws s3 rb s3://<AuditBucketName>
```
(If objects are still under a 1-day retention lock, wait a day or remove the lock
first.)

**Checkpoint:** `cdk destroy` finishes and the stack is gone from CloudFormation.

---

## Task Set 11 — Host the frontend on AWS (S3 + CloudFront)

**Goal:** put the built React app online at a real HTTPS URL, not just `npm run dev`
on your machine. Do this after Task Set 4 — the frontend needs `.env` (from
Task Set 4 / `scripts/deploy.sh`) baked into the build before it's uploaded.

**What you're adding:** a second stack, `SehatiFrontend` — a private S3 bucket
(no public access) served through CloudFront (HTTPS, CDN, and 403/404s rewritten
to `/index.html` so React Router's client-side routes work on refresh/deep-link).

1. Make sure `.env` has the real values (Task Set 4) — `cdk synth`/`deploy` for
   `SehatiFrontend` doesn't need AWS creds for this, but the **build** needs
   `.env` so the deployed site points at your real API/Cognito.
2. One command does build + deploy:
   ```bash
   ./scripts/deploy-frontend.sh        # or .\scripts\deploy-frontend.ps1 on Windows
   ```
   Equivalently, by hand:
   ```bash
   npm install && npm run build          # produces ./dist
   cd infra && source .venv/bin/activate # if not already active
   cdk deploy SehatiFrontend --require-approval never
   ```
3. It prints a `SiteUrl` output (a `*.cloudfront.net` HTTPS address) — that's
   your live site.

**Checkpoint:** opening `SiteUrl` in a browser shows the login page, and signing
in with a Cognito user from Task Set 5 works exactly like `npm run dev` did
locally, just from a public AWS URL.

**Important — allow the deployed site through CORS.** The API only accepts
browser requests from an explicit origin allowlist (never `*`, since requests
carry a bearer token). It defaults to `http://localhost:5173` only, so the
`SiteUrl` from this task set will get CORS-blocked until you redeploy the
backend with it included:
```bash
cd ../infra
cdk deploy SehatiBackend -c allowed_origins=<SiteUrl>,http://localhost:5173
```
(Drop `,http://localhost:5173` if you no longer need local dev access.)

**Updating after a frontend change:** re-run `./scripts/deploy-frontend.sh`. It
rebuilds, re-syncs the S3 bucket, and invalidates the CloudFront cache
automatically — no manual cache-busting needed.

**Custom domain (optional):** not wired up by default. If you want
`app.yourdomain.com` instead of the CloudFront domain, you'll need an ACM
certificate in `us-east-1` and to add `domain_names`/`certificate` to the
`Distribution` in `infra/stacks/frontend_stack.py`, plus a DNS record pointing
at the distribution.

**Cost:** S3 storage for a handful of static files (cents/month) + CloudFront
data transfer (free tier covers low traffic; otherwise a few dollars/month at
hackathon scale).

---

## Connecting the frontend (hand-off)

Give the frontend team these four values from Task Set 4:

```
API base URL          = <ApiUrl>
AWS region            = us-east-1
Cognito User Pool Id  = <UserPoolId>
Cognito App Client Id = <UserPoolClientId>
```

They log the user in with Cognito and send the resulting **ID token** (raw, no
`Bearer ` prefix) in the `Authorization` header on every request to the API base
URL. All endpoints and shapes are in [`API.md`](./API.md); every case they
receive matches the frontend's existing `PatientCase` type.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `cdk deploy` says "bootstrap" | Do Task Set 2 for this account/region. |
| `Unauthorized` from the API | Login token missing/expired — get a fresh one (Task Set 7). |
| Patient gets `Forbidden` on another case | Correct behaviour — patients only see their own. |
| `listCases` is empty | Run the seed step (Task Set 6), and check you're in `us-east-1`. |
| Bedrock `ValidationException: ... isn't supported ... inference profile` | Bare model id used instead of an inference profile id — see Task Set 8, step 2. |
| Bedrock `ResourceNotFoundException: ... marked by provider as Legacy` | That model id is retired; pick a currently-active one (Task Set 8, step 2). |
| Bedrock `AccessDeniedException: ... not available for this account` | Newest model gated behind Anthropic's one-time use-case form, or genuinely not enabled — see Task Set 8's intro, or fall back to an already-active model. |
| Chat works a couple of times then a generic "internal error" for no CloudWatch error | API Gateway's 29s hard timeout beat a slow-but-successful Bedrock call — see Task Set 8's timeout note. Not caused by `AI_PROVIDER=bedrock` having no stub fallback (that still applies for genuine Bedrock errors, which do show up in CloudWatch as a real exception). |
| Frontend site shows a blank page / old content after redeploy | Hard-refresh (CloudFront may still be serving a stale edge cache for a few seconds after invalidation) or re-run `deploy-frontend.sh`. |
| Browser console shows a CORS error calling the API from the deployed site | The backend's origin allowlist doesn't include your `SiteUrl` yet — see Task Set 11's CORS note. |
| Changed code but AWS didn't update | Re-run Task Set 9 (`cdk deploy`). |
| Can't delete the audit bucket | It's WORM by design — see Task Set 10. |
| `cdk deploy` fails with `Unzipped size must be smaller than 262144000 bytes` | A Python virtualenv (e.g. `backend/.venv`) is sitting inside `backend/` and getting bundled into the Lambda zip along with `boto3`/`botocore`. Move the venv outside `backend/` (e.g. to the repo root) and redeploy. The stack's asset `exclude` list also filters `.venv`/`venv`/`.pytest_cache` as a second line of defense. |
| On Windows, `./scripts/deploy.sh` won't run | It's a bash script. Use Git Bash/WSL, or run `.\scripts\deploy.ps1` instead — a PowerShell-native equivalent that does the same steps. |
