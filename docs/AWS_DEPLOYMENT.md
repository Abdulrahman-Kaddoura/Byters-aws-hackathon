# SEHATI-AI — AWS Deployment Runbook

Step-by-step instructions to host the SEHATI-AI backend on AWS. Everything is
defined as code (AWS CDK, Python) in [`../infra`](../infra); this document is the
operator's checklist to stand it up, verify it, connect the frontend, and tear it
down. CDN/CloudFront is intentionally out of scope.

**What gets created** (one CloudFormation stack, `SehatiBackend`, in
`eu-central-1` / Frankfurt):

| Service | Resource |
|---|---|
| AWS AppSync | `sehati-api` GraphQL API (+ subscriptions) |
| AWS Lambda | `sehati-orchestrator` (Python 3.12) |
| Amazon DynamoDB | `sehati-cases`, `sehati-audit`, `sehati-feedback` |
| Amazon Cognito | `sehati-users` user pool + 4 groups + app client |
| Amazon S3 | documents bucket + WORM (Object Lock) audit bucket |
| AWS KMS | customer-managed key `alias/sehati` |
| Amazon Bedrock | *called* by Lambda when `AI_PROVIDER=bedrock` (access enabled manually) |

**Estimated cost at pilot scale: ~$150–500/month**, dominated by Bedrock tokens;
near-zero when idle (DynamoDB on-demand, Lambda/AppSync pay-per-use). The stub
provider (default) has **no model cost at all**.

---

## 0. Prerequisites (once)

Install and configure:

| Tool | Check | Notes |
|---|---|---|
| AWS account + admin/deploy IAM user | `aws sts get-caller-identity` | Use an account you can create IAM/KMS/Cognito in |
| AWS CLI v2 | `aws --version` | `aws configure` with your keys + `eu-central-1` |
| Node.js 18+ | `node --version` | Only for the CDK CLI |
| AWS CDK CLI v2 | `cdk --version` | `npm install -g aws-cdk` |
| Python 3.12 | `python3 --version` | Matches the Lambda runtime |

```bash
# From the repo root:
cd infra
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Confirm your target account/region:
export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
export CDK_DEFAULT_REGION=eu-central-1
```

## 1. Bootstrap CDK (once per account/region)

CDK needs a small "toolkit" stack (an S3 bucket + roles for deployments):

```bash
cdk bootstrap aws://$CDK_DEFAULT_ACCOUNT/eu-central-1
```

## 2. Deploy the backend

The default AI provider is **`stub`**, so this first deploy is fully functional
with **zero model dependencies** — nothing to enable in Bedrock yet.

```bash
# still in infra/, venv active
cdk synth        # optional: preview the generated CloudFormation
cdk deploy       # review the IAM changes, then approve
```

On success, CDK prints the **stack outputs** — copy these; the frontend and the
next steps need them:

```
SehatiBackend.GraphQLApiUrl     = https://xxxx.appsync-api.eu-central-1.amazonaws.com/graphql
SehatiBackend.GraphQLApiId      = xxxxxxxx
SehatiBackend.UserPoolId        = eu-central-1_XXXXXXXXX
SehatiBackend.UserPoolClientId  = xxxxxxxxxxxxxxxxxxxxxxxxxx
SehatiBackend.Region            = eu-central-1
SehatiBackend.CasesTableName    = sehati-cases
SehatiBackend.AIProvider        = stub
```

Retrieve them again any time with:

```bash
aws cloudformation describe-stacks --stack-name SehatiBackend \
  --query "Stacks[0].Outputs" --output table
```

## 3. Create test users (Cognito)

Create one physician and one patient, and put each in the right group. Replace
`<UserPoolId>` with the output from step 2.

```bash
POOL=<UserPoolId>

# --- Physician ---
aws cognito-idp admin-create-user --user-pool-id $POOL \
  --username dr.karim --user-attributes Name=email,Value=karim@example.com Name=email_verified,Value=true \
  --message-action SUPPRESS
aws cognito-idp admin-set-user-password --user-pool-id $POOL \
  --username dr.karim --password 'Passw0rd!Demo' --permanent
aws cognito-idp admin-add-user-to-group --user-pool-id $POOL \
  --username dr.karim --group-name physician

# --- Patient ---
aws cognito-idp admin-create-user --user-pool-id $POOL \
  --username layla --user-attributes Name=email,Value=layla@example.com Name=email_verified,Value=true \
  --message-action SUPPRESS
aws cognito-idp admin-set-user-password --user-pool-id $POOL \
  --username layla --password 'Passw0rd!Demo' --permanent
aws cognito-idp admin-add-user-to-group --user-pool-id $POOL \
  --username layla --group-name patient
```

> Groups available: `patient`, `physician`, `admin`, `compliance`. Add an `admin`
> and a `compliance` user the same way if you want to exercise the audit-trail query.

To get the **Cognito `sub`** (stable user id) for seeding ownership:

```bash
aws cognito-idp admin-get-user --user-pool-id $POOL --username dr.karim \
  --query "UserAttributes[?Name=='sub'].Value" --output text
```

## 4. Seed the 7 sample cases (optional but recommended)

This loads the same cases the frontend was designed around, so the UI has real
data on first run. Run it with credentials that can write to DynamoDB.

```bash
cd ../backend
pip install -r requirements.txt
export AWS_REGION=eu-central-1

# Assign ownership to the users you created (use their Cognito subs):
export SEED_PATIENT_SUB=<layla-sub>
export SEED_PHYSICIAN_SUB=<dr.karim-sub>

python scripts/seed_cases.py     # writes to the deployed sehati-cases table
```

## 5. Verify it works

### Option A — AppSync console (fastest)
1. Open **AWS AppSync → `sehati-api` → Queries**.
2. Under **"Run a query"**, pick **Login with User Pools**, enter the app client
   id (`UserPoolClientId`) and sign in as `dr.karim`.
3. Run:
   ```graphql
   query { listCases }
   ```
   You should get the seeded cases. Then create one end-to-end:
   ```graphql
   mutation {
     submitIntake(input: "{\"patient\":{\"name\":\"Test\",\"age\":40,\"gender\":\"Male\"},\"chiefComplaint\":\"Chest pain\"}")
   }
   ```
4. Sign in as `layla` (patient) and confirm `listCases` returns **only** her own
   cases — this demonstrates the data-layer isolation.

### Option B — from the command line
Get an ID token, then call the GraphQL endpoint:

```bash
TOKEN=$(aws cognito-idp initiate-auth --auth-flow USER_PASSWORD_AUTH \
  --client-id <UserPoolClientId> \
  --auth-parameters USERNAME=dr.karim,PASSWORD='Passw0rd!Demo' \
  --query "AuthenticationResult.IdToken" --output text)

curl -s -X POST <GraphQLApiUrl> \
  -H "Authorization: $TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"query { listCases }"}' | jq .
```

See [`API.md`](./API.md) for the full operation catalogue the frontend uses.

## 6. (Optional) Switch on Amazon Bedrock

The stub AI is fine for the demo. To use real Claude reasoning:

1. **Enable model access:** AWS console → **Amazon Bedrock → Model access** (in
   `eu-central-1`) → request/enable the Claude model you want (e.g. Claude Sonnet).
2. **Redeploy with the Bedrock provider:**
   ```bash
   cd ../infra
   cdk deploy -c ai_provider=bedrock
   ```
   (The Lambda already has the necessary `bedrock:*` permissions.)
3. *(Optional, recommended for production)* create a **Guardrail** and a
   **Knowledge Base** (curated corpus per design doc §11), then set on the Lambda:
   `BEDROCK_GUARDRAIL_ID`, `BEDROCK_GUARDRAIL_VERSION`, `BEDROCK_KNOWLEDGE_BASE_ID`,
   and optionally `BEDROCK_MODEL_ID`. You can add these under the Lambda's
   Configuration → Environment variables, or wire them into the CDK stack.

If a Bedrock call fails or a model isn't enabled, the adapter **degrades
gracefully to the stub** so the workflow never breaks.

## 7. Connect the frontend

Hand the frontend team these four values from the stack outputs:

```
AppSync GraphQL URL   = <GraphQLApiUrl>
AWS region            = eu-central-1
Cognito User Pool Id  = <UserPoolId>
Cognito App Client Id = <UserPoolClientId>
```

They authenticate with Cognito (e.g. AWS Amplify or `amazon-cognito-identity-js`)
and send the resulting **ID token** in the `Authorization` header to the GraphQL
URL. Operation names and shapes are in [`API.md`](./API.md); every `case` payload
matches the frontend's `PatientCase` type in `src/types.ts`.

## 8. Update / redeploy

Change backend Python or infra, then:

```bash
cd infra && cdk deploy
```

Lambda code is re-bundled from `../backend` automatically.

## 9. Teardown

```bash
cd infra && cdk destroy
```

Notes:
- Most resources delete cleanly (tables, Lambda, AppSync, Cognito, KMS,
  documents bucket).
- The **WORM audit bucket is retained on purpose** (immutability). To remove it
  after destroying the stack: disable Object Lock retention on the objects (or
  wait out the 1-day governance retention), empty the bucket, then delete it —
  e.g. in the S3 console, or:
  ```bash
  aws s3 rm s3://<AuditBucketName> --recursive
  aws s3 rb s3://<AuditBucketName>
  ```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `cdk bootstrap` needed | Run step 1 for this account/region |
| `Unauthorized` from GraphQL | Missing/expired `Authorization` token, or the user isn't in a group |
| `Forbidden` on `listCases` as a patient | Expected — patients only see their own cases |
| Empty `listCases` | Seed step 4 not run, or wrong region |
| Bedrock `AccessDenied` / model not found | Enable model access (step 6.1) in `eu-central-1` |
| Lambda import error after edits | Re-run `cdk deploy` to re-bundle `../backend` |
| Proxy/TLS errors in this sandbox only | See `/root/.ccr/README.md`; does not affect real AWS |
