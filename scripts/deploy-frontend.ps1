# Build the frontend and host it on AWS (S3 + CloudFront).
#
#   .\scripts\deploy-frontend.ps1
#
# Requires: .env already populated (see scripts/deploy.ps1), AWS credentials,
# aws CLI, node, python.
$ErrorActionPreference = "Stop"

# $ErrorActionPreference only stops on PowerShell-native (cmdlet) errors — a
# failed external command like cdk/npm/aws just sets $LASTEXITCODE and the
# script keeps going, silently, past a deploy that never happened.
function Assert-Success($Message) {
    if ($LASTEXITCODE -ne 0) { throw $Message }
}

$Stack = "SehatiFrontend"
$Region = if ($env:CDK_DEFAULT_REGION) { $env:CDK_DEFAULT_REGION } else { "us-east-1" }
$Root = (Resolve-Path "$PSScriptRoot\..").Path

Write-Host "==> Verifying AWS credentials"
$Account = aws sts get-caller-identity --query Account --output text
Write-Host "    account=$Account region=$Region"

Write-Host "==> Installing frontend dependencies and building"
Push-Location $Root
try {
    npm install
    Assert-Success "npm install failed (exit $LASTEXITCODE) -- see the output above."
    npm run build
    Assert-Success "npm run build failed (exit $LASTEXITCODE) -- see the output above."
} finally {
    Pop-Location
}

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
    Assert-Success "cdk deploy failed (exit $LASTEXITCODE) -- see the output above. Site was NOT redeployed."
} finally {
    Pop-Location
}

Write-Host "==> Reading site URL"
$SiteUrl = aws cloudformation describe-stacks --stack-name $Stack --region $Region `
    --query "Stacks[0].Outputs[?OutputKey=='SiteUrl'].OutputValue" --output text

Write-Host ""
Write-Host "==> Done. Your app is live at:"
Write-Host ""
Write-Host "  $SiteUrl"
Write-Host ""
Write-Host "Re-run this script after any frontend code change to rebuild and redeploy"
Write-Host "(it re-syncs S3 and invalidates the CloudFront cache automatically)."
