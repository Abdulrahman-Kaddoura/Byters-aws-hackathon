# SEHATI-AI — Infrastructure (AWS CDK, Python)

This CDK app provisions the entire SEHATI-AI backend as one CloudFormation stack
(`SehatiBackend`) in **us-east-1**: API Gateway, Lambda, DynamoDB (×3), Cognito,
S3 (documents + WORM audit), and a KMS key.

**Full hosting instructions are in [`../docs/AWS_DEPLOYMENT.md`](../docs/AWS_DEPLOYMENT.md).**
Quick version:

```bash
cd infra
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
export CDK_DEFAULT_REGION=us-east-1

cdk bootstrap                 # once per account/region
cdk deploy                    # deploy with the stub AI (default)
# cdk deploy -c ai_provider=bedrock   # switch to Amazon Bedrock (Claude)
```

Files:
- `app.py` — CDK app entry (region, AI provider context).
- `stacks/sehati_stack.py` — all resources + IAM + wiring, including the API
  Gateway REST API + Cognito authorizer (the API contract itself is documented
  in [`../docs/API.md`](../docs/API.md)).
- `cdk.json` — CDK config (`ai_provider` context default = `stub`).

The Lambda code is bundled directly from [`../backend`](../backend) at deploy time.
