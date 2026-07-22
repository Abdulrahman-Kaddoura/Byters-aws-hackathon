#!/usr/bin/env python3
"""CDK app entry point for the SEHATI-AI backend.

Deploys the full AWS-native serverless stack described in the design document:
AppSync (GraphQL + subscriptions) + Lambda + DynamoDB + Cognito + S3/KMS, in
eu-central-1 (Frankfurt) by default. See docs/AWS_DEPLOYMENT.md.
"""

import os

import aws_cdk as cdk

from stacks.sehati_stack import SehatiStack

app = cdk.App()

# Region is fixed to Frankfurt per the design doc; override with CDK_DEFAULT_REGION.
env = cdk.Environment(
    account=os.environ.get("CDK_DEFAULT_ACCOUNT"),
    region=os.environ.get("CDK_DEFAULT_REGION", "eu-central-1"),
)

SehatiStack(
    app,
    "SehatiBackend",
    env=env,
    # Toggle the AI provider at deploy time: "stub" (default) or "bedrock".
    ai_provider=app.node.try_get_context("ai_provider") or os.environ.get("AI_PROVIDER", "stub"),
    description="SEHATI-AI clinical decision-support backend (AppSync + Lambda + DynamoDB + Cognito)",
)

app.synth()
