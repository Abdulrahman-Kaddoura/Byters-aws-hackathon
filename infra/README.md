# SEHATI-AI — Infrastructure (AWS CDK, Python)

This CDK app provisions two CloudFormation stacks in **us-east-1**:
- `SehatiBackend` — API Gateway (HTTP API), Lambda, DynamoDB (×7), Cognito, S3
  (documents/audio + WORM audit), the AWS HealthScribe data-access IAM role,
  and a KMS key.
- `SehatiFrontend` — S3 + CloudFront static hosting for the built React app.

**Full hosting instructions are in [`../docs/AWS_DEPLOYMENT.md`](../docs/AWS_DEPLOYMENT.md).**
Quick version:

```bash
cd infra
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
export CDK_DEFAULT_REGION=us-east-1

cdk bootstrap                          # once per account/region
cdk deploy SehatiBackend               # talks to real Amazon Bedrock (Claude) - see docs/AWS_DEPLOYMENT.md Task Set 8

npm run build --prefix ..              # SehatiFrontend uploads whatever is in ../dist
cdk deploy SehatiFrontend
```

Files:
- `app.py` — CDK app entry (region, Bedrock model context, both stacks).
- `stacks/sehati_stack.py` — backend resources + IAM + wiring, including the
  API Gateway HTTP API + Cognito JWT authorizer (the API contract itself is
  documented in [`../docs/API.md`](../docs/API.md)).
- `stacks/frontend_stack.py` — S3 bucket (private, OAI-only) + CloudFront
  distribution (HTTPS, SPA routing) + `BucketDeployment` that uploads
  `../dist` and invalidates the CDN cache on every deploy.
- `cdk.json` — CDK config/context defaults.

The Lambda code is bundled directly from [`../backend`](../backend) at deploy time.
`scripts/deploy.sh`/`.ps1` handle `SehatiBackend`; `scripts/deploy-frontend.sh`/`.ps1`
build the app and deploy `SehatiFrontend`.
