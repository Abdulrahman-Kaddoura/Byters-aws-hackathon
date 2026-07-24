#!/usr/bin/env python3
"""CDK app entry point for the SEHATI-AI backend.

Deploys the full AWS-native serverless stack described in the design document:
API Gateway (REST) + Lambda + DynamoDB + Cognito + S3/KMS, in us-east-1
(N. Virginia) by default — matching the region the AI team's Bedrock/Lambda
pipeline already runs in. See docs/AWS_DEPLOYMENT.md.
"""

import os

import aws_cdk as cdk

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
    # Toggle the AI provider at deploy time: "stub" (default) or "bedrock".
    ai_provider=app.node.try_get_context("ai_provider") or os.environ.get("AI_PROVIDER", "stub"),
    description="SEHATI-AI clinical decision-support backend (API Gateway + Lambda + DynamoDB + Cognito)",
)

app.synth()
