#!/usr/bin/env bash
# Build the frontend and host it on AWS (S3 + CloudFront).
#
#   ./scripts/deploy-frontend.sh
#
# Requires: .env already populated (see scripts/deploy.sh), AWS credentials,
# aws CLI, node, python3.
set -euo pipefail

STACK=SehatiFrontend
REGION="${CDK_DEFAULT_REGION:-us-east-1}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Verifying AWS credentials"
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
echo "    account=$ACCOUNT region=$REGION"

echo "==> Installing frontend dependencies and building"
cd "$ROOT"
npm install
npm run build

echo "==> Installing CDK dependencies"
python3 -m pip install -q -r "$ROOT/infra/requirements.txt"
command -v cdk >/dev/null || npm install -g aws-cdk

echo "==> Bootstrapping (no-op if already done)"
cd "$ROOT/infra"
CDK_DEFAULT_ACCOUNT=$ACCOUNT CDK_DEFAULT_REGION=$REGION \
  cdk bootstrap "aws://$ACCOUNT/$REGION"

echo "==> Deploying $STACK"
CDK_DEFAULT_ACCOUNT=$ACCOUNT CDK_DEFAULT_REGION=$REGION \
  cdk deploy "$STACK" --require-approval never

echo "==> Reading site URL"
SITE_URL=$(aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='SiteUrl'].OutputValue" --output text)

cat <<EOF

==> Done. Your app is live at:

  $SITE_URL

Re-run this script after any frontend code change to rebuild and redeploy
(it re-syncs S3 and invalidates the CloudFront cache automatically).
EOF
