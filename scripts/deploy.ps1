# Deploy the SEHATI backend, seed sample cases, and write the frontend .env.
#
#   .\scripts\deploy.ps1
#
# Requires: AWS credentials in the environment (with Bedrock model access
# enabled for the target model in the target region — there is no offline
# fallback), aws CLI, node, python.
$ErrorActionPreference = "Stop"

$Stack = "SehatiBackend"
$Region = if ($env:CDK_DEFAULT_REGION) { $env:CDK_DEFAULT_REGION } else { "us-east-1" }
$Root = (Resolve-Path "$PSScriptRoot\..").Path

Write-Host "==> Verifying AWS credentials"
$Account = aws sts get-caller-identity --query Account --output text
Write-Host "    account=$Account region=$Region"

Write-Host "==> Installing CDK dependencies"
python -m pip install -q -r "$Root\infra\requirements.txt"
if (-not (Get-Command cdk -ErrorAction SilentlyContinue)) {
    npm install -g aws-cdk
}

Write-Host "==> Bootstrapping (no-op if already done)"
Push-Location "$Root\infra"
try {
    $env:CDK_DEFAULT_ACCOUNT = $Account
    $env:CDK_DEFAULT_REGION = $Region
    cdk bootstrap "aws://$Account/$Region"

    Write-Host "==> Deploying $Stack"
    cdk deploy --require-approval never
} finally {
    Pop-Location
}

Write-Host "==> Reading stack outputs"
function Get-StackOutput($Key) {
    aws cloudformation describe-stacks --stack-name $Stack --region $Region `
        --query "Stacks[0].Outputs[?OutputKey=='$Key'].OutputValue" --output text
}
$ApiUrl = Get-StackOutput "ApiUrl"
$UserPoolId = Get-StackOutput "UserPoolId"
$ClientId = Get-StackOutput "UserPoolClientId"
$CasesTable = Get-StackOutput "CasesTableName"

Write-Host "==> Seeding sample cases into DynamoDB"
Push-Location "$Root\backend"
try {
    $env:CASES_TABLE = $CasesTable
    $env:AWS_REGION = $Region
    python -m scripts.seed_cases
} finally {
    Pop-Location
}

Write-Host "==> Writing $Root\.env"
$ApiUrlTrimmed = $ApiUrl.TrimEnd("/")
@"
VITE_API_URL=$ApiUrlTrimmed
VITE_AWS_REGION=$Region
VITE_COGNITO_USER_POOL_ID=$UserPoolId
VITE_COGNITO_CLIENT_ID=$ClientId
"@ | Set-Content -Path "$Root\.env" -Encoding utf8
Get-Content "$Root\.env"

Write-Host ""
Write-Host "==> Done. Create a physician login before signing in:"
Write-Host ""
Write-Host "  aws cognito-idp admin-create-user --region $Region ``"
Write-Host "    --user-pool-id $UserPoolId --username dr.hale ``"
Write-Host "    --user-attributes Name=email,Value=you@example.com Name=email_verified,Value=true ``"
Write-Host "    --temporary-password 'TempPassw0rd!2026'"
Write-Host ""
Write-Host "  aws cognito-idp admin-add-user-to-group --region $Region ``"
Write-Host "    --user-pool-id $UserPoolId --username dr.hale --group-name physician"
Write-Host ""
Write-Host "Then: npm run dev  (the app will prompt for the temporary password, then a new one)"
