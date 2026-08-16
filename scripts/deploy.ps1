# Deploy the SEHATI backend and write the frontend .env.
#
#   .\scripts\deploy.ps1
#
# Requires: AWS credentials in the environment (with Bedrock model access
# enabled for the target model in the target region — there is no offline
# fallback), aws CLI, node, python.
#
# Does not seed sample data: the demo cases' nurse/doctor owners need to be
# real Cognito subs (a doctor only sees cases assigned to their own sub), so
# seeding before any accounts exist would just create unreachable rows. See
# "Seeding sample cases" in the root README for the manual, post-accounts step.
$ErrorActionPreference = "Stop"

# $ErrorActionPreference only stops on PowerShell-native (cmdlet) errors — a
# failed external command like cdk/npm/aws just sets $LASTEXITCODE and the
# script keeps going, silently, past a deploy that never happened. This is
# the PowerShell analog of bash's `set -e`, applied after each such command.
function Assert-Success($Message) {
    if ($LASTEXITCODE -ne 0) { throw $Message }
}

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
    Assert-Success "cdk bootstrap failed (exit $LASTEXITCODE) -- see the output above."

    Write-Host "==> Deploying $Stack"
    cdk deploy $Stack --require-approval never
    Assert-Success "cdk deploy failed (exit $LASTEXITCODE) -- see the output above. .env was NOT written."
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
Write-Host "==> Done. Bootstrap the admin account, then create every other user from"
Write-Host "    the /admin panel (a Cognito user alone can't do anything -- permissions"
Write-Host "    come from the sehati-users record, which only the panel or the"
Write-Host "    bootstrap script writes):"
Write-Host ""
Write-Host "  cd $Root\backend"
Write-Host "  pip install -r requirements.txt"
Write-Host "  `$env:USER_POOL_ID = '$UserPoolId'; `$env:AWS_REGION = '$Region'"
Write-Host "  python -m scripts.bootstrap_admin"
Write-Host ""
Write-Host "  Creates username 'admin' / password 'Admin@123456' (override with"
Write-Host "  --username/--email/--password). Sign in, then from /admin:"
Write-Host "    1. Settings tab -- set the patient-interview exit password FIRST."
Write-Host "       Without it, a device handed to a patient locks with no way out."
Write-Host "    2. Users tab -- create a nurse and a doctor account."
Write-Host ""
Write-Host "Then: npm run dev  (sign in as the nurse to try the admit -> interview ->"
Write-Host "assign flow, or as the doctor to see the case workspace)"
