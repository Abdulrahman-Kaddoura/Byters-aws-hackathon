#!/usr/bin/env python3
"""CDK app entry point for the SEHATI-AI backend.

Deploys the full AWS-native serverless stack described in the design document:
API Gateway (REST) + Lambda + DynamoDB + Cognito + S3/KMS, in us-east-1
(N. Virginia) by default — matching the region the AI team's Bedrock/Lambda
pipeline already runs in. See docs/AWS_DEPLOYMENT.md.
"""

import os

import aws_cdk as cdk

from stacks.frontend_stack import SehatiFrontendStack
from stacks.sehati_stack import SehatiStack

app = cdk.App()

# Region defaults to us-east-1 to match the AI team's existing setup; override with CDK_DEFAULT_REGION.
env = cdk.Environment(
    account=os.environ.get("CDK_DEFAULT_ACCOUNT"),
    region=os.environ.get("CDK_DEFAULT_REGION", "us-east-1"),
)

SehatiStack(
    app,
    "SehatiBackend",
    env=env,
    # Bedrock model id (or cross-region inference profile id) to use.
    bedrock_model_id=app.node.try_get_context("bedrock_model_id")
    or os.environ.get("BEDROCK_MODEL_ID", "us.anthropic.claude-sonnet-4-5-20250929-v1:0"),
    # Optional: a Guardrail scopes the IAM grant to bedrock:ApplyGuardrail on that
    # resource only; a Knowledge Base similarly scopes bedrock:Retrieve. Leave
    # unset to omit both the runtime feature and the IAM grant entirely.
    bedrock_guardrail_id=app.node.try_get_context("bedrock_guardrail_id")
    or os.environ.get("BEDROCK_GUARDRAIL_ID", ""),
    bedrock_guardrail_version=app.node.try_get_context("bedrock_guardrail_version")
    or os.environ.get("BEDROCK_GUARDRAIL_VERSION", "DRAFT"),
    bedrock_knowledge_base_id=app.node.try_get_context("bedrock_knowledge_base_id")
    or os.environ.get("BEDROCK_KNOWLEDGE_BASE_ID", ""),
    description="SEHATI-AI clinical decision-support backend (API Gateway + Lambda + DynamoDB + Cognito)",
)

# CloudFront requires ACM certs for the distribution itself to live in us-east-1,
# which is already our default region, so no cross-region complication here.
SehatiFrontendStack(
    app,
    "SehatiFrontend",
    env=env,
    description="SEHATI-AI frontend static hosting (S3 + CloudFront)",
)

app.synth()
