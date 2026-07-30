#!/usr/bin/env bash
# Deploy the SEHATI backend, seed sample cases, and write the frontend .env.
#
#   ./scripts/deploy.sh
#
# Requires: AWS credentials in the environment (with Bedrock model access
# enabled for the target model in the target region — there is no offline
# fallback), aws CLI, node, python3.
set -euo pipefail

STACK=SehatiBackend
REGION="${CDK_DEFAULT_REGION:-us-east-1}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Verifying AWS credentials"
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
echo "    account=$ACCOUNT region=$REGION"

echo "==> Installing CDK dependencies"
python3 -m pip install -q -r "$ROOT/infra/requirements.txt"
command -v cdk >/dev/null || npm install -g aws-cdk

echo "==> Bootstrapping (no-op if already done)"
cd "$ROOT/infra"
CDK_DEFAULT_ACCOUNT=$ACCOUNT CDK_DEFAULT_REGION=$REGION \
  cdk bootstrap "aws://$ACCOUNT/$REGION"

echo "==> Deploying $STACK"
CDK_DEFAULT_ACCOUNT=$ACCOUNT CDK_DEFAULT_REGION=$REGION \
  cdk deploy --require-approval never

echo "==> Reading stack outputs"
out() {
  aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}
API_URL=$(out ApiUrl); USER_POOL_ID=$(out UserPoolId); CLIENT_ID=$(out UserPoolClientId)

echo "==> Seeding sample cases into DynamoDB"
cd "$ROOT/backend"
CASES_TABLE=$(out CasesTableName) AWS_REGION=$REGION python3 -m scripts.seed_cases

echo "==> Writing $ROOT/.env"
cat > "$ROOT/.env" <<EOF
VITE_API_URL=${API_URL%/}
VITE_AWS_REGION=$REGION
VITE_COGNITO_USER_POOL_ID=$USER_POOL_ID
VITE_COGNITO_CLIENT_ID=$CLIENT_ID
EOF
cat "$ROOT/.env"

cat <<EOF

==> Done. Create a physician login before signing in:

  aws cognito-idp admin-create-user --region $REGION \\
    --user-pool-id $USER_POOL_ID --username dr.hale \\
    --user-attributes Name=email,Value=you@example.com Name=email_verified,Value=true \\
    --temporary-password 'TempPassw0rd!2026'

  aws cognito-idp admin-add-user-to-group --region $REGION \\
    --user-pool-id $USER_POOL_ID --username dr.hale --group-name physician

Then: npm run dev  (the app will prompt for the temporary password, then a new one)
EOF
