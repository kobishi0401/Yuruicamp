#Requires -Version 5.1
<#
.SYNOPSIS
  Stage 7: build+assemble Hosting folder and firebase deploy --only hosting.

.PARAMETER ApiBaseUrl
  Staging Cloud Run API base (must end with /api).

.PARAMETER SkipBuild
  Reuse existing frontend/dist (assemble only).

.PARAMETER SkipDeploy
  Only assemble; do not call firebase deploy.
#>
param(
  [string] $ApiBaseUrl = "https://yuruicamp-api-staging-952948108890.asia-east1.run.app/api",
  [switch] $SkipBuild,
  [switch] $SkipDeploy
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

Write-Host "==> Assemble hosting-out"
$assemble = Join-Path $PSScriptRoot "assemble-hosting.ps1"
$args = @{
  RepoRoot   = $repoRoot
  ApiBaseUrl = $ApiBaseUrl
}
if ($SkipBuild) { $args.SkipBuild = $true }
& $assemble @args

if ($SkipDeploy) {
  Write-Host "SkipDeploy set — not calling firebase."
  return
}

$firebase = Get-Command firebase -ErrorAction SilentlyContinue
if (-not $firebase) {
  throw @"
firebase CLI not found.
Install once:  npm install -g firebase-tools
Then:          firebase login
               firebase use yuruicamp-2026
Re-run this script.
"@
}

Push-Location $repoRoot
try {
  Write-Host "==> firebase use yuruicamp-2026"
  firebase use yuruicamp-2026
  if ($LASTEXITCODE -ne 0) { throw "firebase use failed — run firebase login" }

  Write-Host "==> firebase deploy --only hosting"
  firebase deploy --only hosting
  if ($LASTEXITCODE -ne 0) { throw "firebase deploy failed" }
}
finally {
  Pop-Location
}

Write-Host ""
Write-Host "Hosting deploy finished."
Write-Host "1) Firebase Console → Hosting → copy the .web.app URL"
Write-Host "2) Authentication → Settings → Authorized domains → add that host"
Write-Host "3) Cloud Run yuruicamp-api-staging → update:"
Write-Host "     YURUICAMP_FRONTEND_BASE_URL = https://YOUR.web.app"
Write-Host "     CORS_ALLOWED_ORIGINS       = https://YOUR.web.app,https://YOUR.firebaseapp.com"
Write-Host "4) Open https://YOUR.web.app/storefront/pages/home.html and smoke-test login"
