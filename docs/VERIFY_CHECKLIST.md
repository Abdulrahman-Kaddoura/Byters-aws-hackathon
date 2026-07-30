# End-to-end verification checklist

Goal: touch every AWS service this app depends on, confirm it's actually
configured the way the code expects, and know exactly which log/command to
check when something's broken. Go top to bottom — each section only works if
the one above it is correct, so don't skip ahead.

This app has **zero offline mode**. There is no mock data, no local API, no
"it just works on localhost." Every single screen is:

```
Browser → Cognito (login) → API Gateway (authorizer) → Lambda → DynamoDB / S3 / (Bedrock)
```

If any one box in that chain is misconfigured, you get a blank screen, a
stuck spinner, or an action that silently fails. There is no way to "half
deploy" this and have it work.

---

## 0. Prerequisites

| Check | Command | Expect |
|---|---|---|
| AWS CLI | `aws --version` | prints a version |
| Node 18+ | `node --version` | v18+ |
| CDK | `cdk --version` | prints a version |
| Python 3.12 | `python3 --version` | 3.12.x |
| AWS credentials work | `aws sts get-caller-identity` | prints Account/UserId, no error |

If `aws sts get-caller-identity` fails, **nothing below this line will
work** — fix credentials first (`aws configure`).

---

## 1. The backend CloudFormation stack (`SehatiBackend`)

```bash
aws cloudformation describe-stacks --stack-name SehatiBackend \
  --query "Stacks[0].StackStatus" --output text
```

**Expect:** `CREATE_COMPLETE` or `UPDATE_COMPLETE`. Anything ending in
`_ROLLBACK_COMPLETE` or `_FAILED` means the deploy never actually finished —
everything below is moot until you fix and redeploy (`cd infra && cdk
deploy`).

Get every output in one shot (you'll need these values repeatedly below):

```bash
aws cloudformation describe-stacks --stack-name SehatiBackend \
  --query "Stacks[0].Outputs" --output table
```

You should see 6 outputs: `ApiUrl`, `UserPoolId`, `UserPoolClientId`,
`Region`, `CasesTableName`, `AIProvider`. If this list is empty or the stack
doesn't exist, you haven't deployed yet — go run `./scripts/deploy.sh`.

---

## 2. DynamoDB — 3 tables, all must exist and be `ACTIVE`

The app uses three tables, all encrypted with a customer-managed KMS key
(`alias/sehati`):

| Table | Partition key | Sort key | GSIs |
|---|---|---|---|
| `sehati-cases` | `id` | — | `byPatient` (patientId+createdAt), `byPhysician` (assignedPhysicianId+createdAt), `byStatus` (status+createdAt) |
| `sehati-audit` | `caseId` | `sk` | — |
| `sehati-feedback` | `caseId` | `sk` | — |

```bash
for t in sehati-cases sehati-audit sehati-feedback; do
  echo "== $t =="
  aws dynamodb describe-table --table-name $t --query "Table.TableStatus" --output text
done
```

**Expect:** `ACTIVE` for all three. Then confirm the GSIs on the cases table
specifically (this is the #1 cause of "list is empty" / "case doesn't show
up"):

```bash
aws dynamodb describe-table --table-name sehati-cases \
  --query "Table.GlobalSecondaryIndexes[].{Name:IndexName,Status:IndexStatus}" --output table
```

**Expect:** `byPatient`, `byPhysician`, `byStatus`, all `ACTIVE`.

**Why this matters for you specifically:** `listCases` for a patient queries
the `byPatient` GSI by `patientId == caller's Cognito sub`. If a case in the
table has no `patientId` (or the wrong one), it will **never** show up for
that patient — not a bug, just how the query works. Same for physicians and
`byPhysician`/`assignedPhysicianId`. Spot-check a real row:

```bash
aws dynamodb scan --table-name sehati-cases --max-items 1
```

Confirm the item actually has `patientId` / `assignedPhysicianId` /
`status` / `createdAt` populated — the code strips empty-string index keys
on write (DynamoDB rejects empty GSI keys), so a case created without an
owner assigned will quietly not appear in either "mine" view.

---

## 3. S3 — 2 buckets

```bash
aws s3api list-buckets --query "Buckets[?contains(Name, 'sehatibackend')].Name" --output table
```

**Expect:** two buckets — one for documents (`documentsbucket…`), one for the
WORM audit trail (`auditbucket…`). Both should be private (`BlockPublicAccess:
BLOCK_ALL`) and KMS-encrypted — that's expected, not a bug; nothing in the app
reads these directly over the internet, only the Lambda role does.

---

## 4. Cognito — user pool, 4 groups, app client

```bash
aws cognito-idp describe-user-pool --user-pool-id <UserPoolId> \
  --query "UserPool.{Name:Name,Status:Status,MfaConfig:MfaConfiguration}" --output table

aws cognito-idp list-groups --user-pool-id <UserPoolId> --query "Groups[].GroupName" --output table
```

**Expect:** pool name `sehati-users`, and exactly 4 groups: `patient`,
`physician`, `admin`, `compliance`.

### 4a. Do you actually have a user, and is it in a group?

This is the **single most common reason "it loads but actions fail."** Login
only proves the Cognito user *exists* — it says nothing about whether that
user is in a group. And the entire authorization model is group-based:

```bash
aws cognito-idp admin-list-groups-for-user --user-pool-id <UserPoolId> --username <your-username>
```

**Expect:** at least one group in the response. **If this list is empty**,
you can log in and the app will load, but:
- Every write (create note, order test, submit intake, propose diagnosis...)
  will 403 with `ForbiddenError` — the backend's `AuthContext.is_patient` /
  `is_physician` / `is_clinical_staff` are all `False` for a user in no group.
- `GET /cases` will return an **empty list** for a groupless user (not
  clinical staff → falls through to "return only own cases" logic → no
  `patientId` match either).

If you followed the README/deploy script, `admin-add-user-to-group` is a
separate command from `admin-create-user` — it's easy to create the user and
forget this step. Fix:

```bash
aws cognito-idp admin-add-user-to-group --user-pool-id <UserPoolId> \
  --username <your-username> --group-name physician   # or patient/admin/compliance
```

**Important:** group membership is baked into the ID token at *login* time.
If you just added yourself to a group, **you must sign out and back in** in
the app — an already-issued token won't pick up the new group until it's
reissued (refresh does re-fetch claims from Cognito, but a stale in-memory
session in an open tab won't unless you trigger it).

### 4b. Confirm the token actually carries groups

```bash
TOKEN=$(aws cognito-idp initiate-auth --auth-flow USER_PASSWORD_AUTH \
  --client-id <UserPoolClientId> \
  --auth-parameters USERNAME=<user>,PASSWORD='<password>' \
  --query "AuthenticationResult.IdToken" --output text)

echo $TOKEN | cut -d. -f2 | base64 -d 2>/dev/null | python3 -m json.tool
```

**Expect:** a `cognito:groups` key with your group(s) listed, and `sub`
matching the identity you expect. No `cognito:groups` key at all = the user
is in no group = see 4a.

---

## 5. API Gateway — routes, authorizer, CORS

```bash
aws apigateway get-rest-apis --query "items[?name=='sehati-api'].id" --output text
```

Take that `<ApiId>` and confirm the `prod` stage exists and tracing/logging
are on (useful for debugging later):

```bash
aws apigateway get-stage --rest-api-id <ApiId> --stage-name prod \
  --query "{Tracing:tracingEnabled, AccessLog:accessLogSettings.destinationArn}"
```

### 5a. Real end-to-end call (this is the test that matters most)

```bash
curl -s -o /dev/null -w "%{http_code}\n" "<ApiUrl>cases" -H "Authorization: $TOKEN"
```

- **200** → auth + routing + Lambda + DynamoDB read all work. Good.
- **401** → token missing/expired/malformed, or you forgot the raw token
  has no `Bearer ` prefix (the frontend sends it raw — see `src/lib/api.ts`).
- **403** → you're authenticated but the *resolver* rejected you — almost
  always the group problem in step 4a, or (for a specific case) an ownership
  mismatch (patient hitting a case that isn't theirs — that's correct
  behavior, not a bug).
- **500** → Lambda crashed. Go straight to CloudWatch (step 6).
- **Connection/timeout error, nothing about CORS** → check `ApiUrl` is
  correct in `.env` and that you're calling the right region.

Get the body, not just the status, for anything non-200:

```bash
curl -s "<ApiUrl>cases" -H "Authorization: $TOKEN" | python3 -m json.tool
```

---

## 6. Lambda — the one log stream that tells you the truth

Every unhandled exception in the resolvers is caught by `handler.py` and
turned into a `500` with a generic message on purpose (no internals leaked to
the browser) — **the real error only exists in CloudWatch.** If actions fail
in the UI with no useful message, this is where you look, every time:

```bash
aws logs tail /aws/lambda/sehati-orchestrator --since 15m --follow
```

Reproduce the failing click in the browser while this is running. You'll see
either:
- `app_error resource=... type=... msg=...` — an expected `AppError`
  (Forbidden/NotFound/Validation) with the real reason in `msg`.
- `unhandled_error resource=...` followed by a full Python traceback — an
  actual bug (bad DynamoDB item shape, KeyError, etc.) — the traceback tells
  you exactly which line.

Also sanity-check the function's environment variables match the stack
(these are set automatically by CDK, but worth confirming after any manual
console edits, especially if you were experimenting with Bedrock env vars):

```bash
aws lambda get-function-configuration --function-name sehati-orchestrator \
  --query "Environment.Variables"
```

**Expect:** `CASES_TABLE=sehati-cases`, `AUDIT_TABLE=sehati-audit`,
`FEEDBACK_TABLE=sehati-feedback`, `DOCUMENTS_BUCKET=...`, `AUDIT_BUCKET=...`,
`LOG_LEVEL=INFO`.

---

## 7. AI provider — Bedrock only, no fallback

There is no stub/offline mode in production — every deploy talks to real
Amazon Bedrock (Claude). If Bedrock model access isn't enabled in
`us-east-1`, or the model ID is wrong, every AI-touching endpoint (interview
questions, differential diagnosis, assistant chat) returns a real `500`.
Check:

```bash
aws bedrock list-foundation-models --region us-east-1 \
  --query "modelSummaries[?contains(modelId, 'claude')].modelId"
```

and confirm model access is actually **enabled** (not just listed) in
Bedrock console → Model access. `AccessDeniedException` in the CloudWatch
trace from step 6 confirms this is the problem.

---

## 8. The frontend's `.env` — the four values, byte for byte

```bash
cat .env
```

Must have all four, matching the CloudFormation outputs from step 1 exactly:

| Var | Must equal |
|---|---|
| `VITE_API_URL` | `ApiUrl` output (keep the trailing `/prod/` — the frontend strips a trailing slash itself, either form works) |
| `VITE_AWS_REGION` | `Region` output (`us-east-1`) |
| `VITE_COGNITO_USER_POOL_ID` | `UserPoolId` output |
| `VITE_COGNITO_CLIENT_ID` | `UserPoolClientId` output |

**Any mismatch here — e.g. an `.env` left over from a previous `cdk
destroy`/redeploy that generated a new Cognito pool — causes exactly your
symptom:** the app loads (static assets don't care about `.env`), the login
screen renders, but real calls silently point at a pool or API that no
longer exists or was replaced with an emptier one. This is extremely common
after redeploying the backend without re-running `deploy.sh` (which
regenerates `.env` for you) or without rebuilding+redeploying the frontend
(`./scripts/deploy-frontend.sh`) so a stale build is still live on
CloudFront.

If you're running `npm run dev` locally, restart it after any `.env`
change — Vite only reads `VITE_*` vars at startup.

---

## 9. Browser-side check (2 minutes, tells you which layer to blame)

Open DevTools → Network tab, reproduce the failing action, click the
request:

- **Request never fires** → frontend bug, not infra. Check the Console tab
  for a JS error instead.
- **Status `(failed)` / `net::ERR_*`, no response** → wrong `VITE_API_URL`
  (typo, wrong region, stack was torn down) or a real network/DNS issue —
  not CORS (this API always returns CORS headers, including on errors —
  see `_CORS_HEADERS` in `backend/sehati/handler.py`).
- **401** → session expired or `.env` Cognito values don't match the pool
  that issued your token → sign out, sign back in.
- **403** → step 4a (group membership) or a genuine ownership boundary.
- **500** → step 6 (CloudWatch), always.
- **200 but UI doesn't update** → this is an actual frontend bug, worth
  reporting with the response body (Preview tab) attached.

---

## 10. Data actually present

```bash
aws dynamodb scan --table-name sehati-cases --select COUNT
```

**Expect:** `Count` > 0. If it's `0`, you haven't seeded anything and there's
no data for any account to see — run:

```bash
cd backend
export AWS_REGION=us-east-1
export SEED_PATIENT_SUB=<a real patient sub, from `aws cognito-idp admin-get-user`>
export SEED_PHYSICIAN_SUB=<a real physician sub>
python scripts/seed_cases.py
```

---

## 11. Frontend hosting, if you deployed `SehatiFrontend` (not just local dev)

```bash
aws cloudformation describe-stacks --stack-name SehatiFrontend \
  --query "Stacks[0].Outputs" --output table
```

Open the `SiteUrl` value. If it shows old/blank content after a change,
that's CloudFront's edge cache — `./scripts/deploy-frontend.sh` invalidates
it automatically, but propagation can take up to a minute; a hard refresh
(Ctrl/Cmd+Shift+R) usually clears it sooner.

**Reminder:** the frontend build bakes `.env` in at *build* time (Vite env
vars are compiled into the JS bundle, not read at runtime). If you changed
`.env` after the last `npm run build`, the live site is still using the old
values until you rebuild and redeploy — editing `.env` alone does nothing to
an already-deployed site.

---

## Quick triage table

| Symptom | Most likely cause | Where to look |
|---|---|---|
| Blank page before login | Missing/wrong `.env` | §8 |
| Login fails outright | No Cognito user, or wrong `VITE_COGNITO_CLIENT_ID` | §4, §8 |
| Logged in, `GET /cases` returns `[]` | User in no group, or no data seeded, or GSI key missing on the rows | §4a, §2, §10 |
| Specific action 403s | Group membership, or case ownership | §4a, §6 |
| Specific action 500s | Real bug — read the traceback | §6 |
| AI-driven action fails only | Bedrock not enabled / no model access | §7 |
| Everything was fine, now it's all broken | Stack was redeployed/destroyed and `.env` (or a stale CloudFront build) is now stale | §1, §8, §11 |

Work this checklist top to bottom once, end to end, and tell me exactly which
step number breaks and what the command printed — that's what I need to fix
the actual problem instead of guessing.
