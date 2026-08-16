#!/usr/bin/env bash
# Deploy the SEHATI backend and write the frontend .env.
#
#   ./scripts/deploy.sh
#
# Requires: AWS credentials in the environment (with Bedrock model access
# enabled for the target model in the target region — there is no offline
# fallback), aws CLI, node, python3.
#
# Does not seed sample data: the demo cases' nurse/doctor owners need to be
# real Cognito subs (a doctor only sees cases assigned to their own sub), so
# seeding before any accounts exist would just create unreachable rows. See
# "Seeding sample cases" in the root README for the manual, post-accounts step.
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

echo "==> Writing $ROOT/.env"
cat > "$ROOT/.env" <<EOF
VITE_API_URL=${API_URL%/}
VITE_AWS_REGION=$REGION
VITE_COGNITO_USER_POOL_ID=$USER_POOL_ID
VITE_COGNITO_CLIENT_ID=$CLIENT_ID
EOF
cat "$ROOT/.env"

cat <<EOF

==> Done. Bootstrap the admin account, then create every other user from the
    /admin panel (a Cognito user alone can't do anything — permissions come
    from the sehati-users record, which only the panel or the bootstrap
    script writes):

  cd $ROOT/backend
  pip install -r requirements.txt
  USER_POOL_ID=$USER_POOL_ID AWS_REGION=$REGION python -m scripts.bootstrap_admin

  Creates username 'admin' / password 'Admin@123456' (override with
  --username/--email/--password). Sign in, then from /admin:
    1. Settings tab -- set the patient-interview exit password FIRST. Without
       it, a device handed to a patient locks with no way out.
    2. Users tab -- create a nurse and a doctor account.

Then: npm run dev  (sign in as the nurse to try the admit -> interview ->
assign flow, or as the doctor to see the case workspace)
EOF
