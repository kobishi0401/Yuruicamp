#Requires -Version 5.1
<#
.SYNOPSIS
  Upload GitHub Actions secrets for Deploy Staging (GCP_SA_KEY + VITE_FIREBASE_*).

.DESCRIPTION
  Prerequisites:
  1) gcloud already created SA key (default path below) — see github-actions-secrets.md
  2) gh auth login  (one-time in your terminal)
  3) frontend/.env.local contains VITE_FIREBASE_* (same as local Vite)

  Does NOT print secret values.
#>
param(
  [string] $Repo = "kobishi0401/Yuruicamp",
  [string] $GcpSaKeyPath = "C:\Users\Amy\Desktop\java_bootcamp\yurui-secret\github-deploy-staging.json",
  [string] $EnvLocalPath = "",
  [string] $StagingApiBaseUrl = "https://yuruicamp-api-staging-952948108890.asia-east1.run.app/api"
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
if (-not $EnvLocalPath) {
  $EnvLocalPath = Join-Path $repoRoot "frontend\.env.local"
}

function Assert-Command([string] $Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Command not found: $Name. Install GitHub CLI and ensure it is on PATH."
  }
}

Assert-Command "gh"

Write-Host "==> Checking gh auth"
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$authOut = & gh auth status 2>&1 | Out-String
$ErrorActionPreference = $prevEap
if ($LASTEXITCODE -ne 0 -or $authOut -match "not logged into") {
  throw "Not logged into GitHub CLI. Run: gh auth login  (then re-run this script)"
}

if (-not (Test-Path -LiteralPath $GcpSaKeyPath)) {
  throw "GCP SA key not found: $GcpSaKeyPath"
}
if (-not (Test-Path -LiteralPath $EnvLocalPath)) {
  throw "frontend/.env.local not found: $EnvLocalPath — copy from .env.example and fill Firebase Web config"
}

# Parse KEY=VALUE from .env.local (simple; ignores comments / blanks)
$envMap = @{}
Get-Content -LiteralPath $EnvLocalPath -Encoding UTF8 | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith("#")) { return }
  $i = $line.IndexOf("=")
  if ($i -lt 1) { return }
  $k = $line.Substring(0, $i).Trim()
  $v = $line.Substring($i + 1).Trim().Trim('"').Trim("'")
  $envMap[$k] = $v
}

$required = @(
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID"
)
foreach ($k in $required) {
  if (-not $envMap.ContainsKey($k) -or [string]::IsNullOrWhiteSpace($envMap[$k])) {
    throw "Missing or empty $k in $EnvLocalPath"
  }
  Write-Host ("  OK {0} (len={1})" -f $k, $envMap[$k].Length)
}

Write-Host "==> Set secret GCP_SA_KEY from file"
gh secret set GCP_SA_KEY --repo $Repo --body (Get-Content -LiteralPath $GcpSaKeyPath -Raw -Encoding UTF8)
if ($LASTEXITCODE -ne 0) { throw "gh secret set GCP_SA_KEY failed" }

foreach ($k in $required) {
  Write-Host "==> Set secret $k"
  gh secret set $k --repo $Repo --body $envMap[$k]
  if ($LASTEXITCODE -ne 0) { throw "gh secret set $k failed" }
}

Write-Host "==> Set variable STAGING_API_BASE_URL"
gh variable set STAGING_API_BASE_URL --repo $Repo --body $StagingApiBaseUrl
if ($LASTEXITCODE -ne 0) {
  Write-Host "WARNING: gh variable set failed (optional). Workflow has a default URL."
}

Write-Host ""
Write-Host "Done. Verify:"
Write-Host "  gh secret list --repo $Repo"
Write-Host "  GitHub → Actions → Deploy Staging → Run workflow"
Write-Host ""
Write-Host "Never commit $GcpSaKeyPath or frontend/.env.local"
