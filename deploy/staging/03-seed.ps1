#Requires -Version 5.1
<#
.SYNOPSIS
  Load docs/seed into Cloud SQL staging via cloud-sql-proxy (local).

.NOTES
  Install proxy once:
    https://cloud.google.com/sql/docs/postgres/connect-auth-proxy
  Or: gcloud components install cloud-sql-proxy
#>
param(
  [string] $Project = "yuruicamp-2026",
  [string] $Region = "asia-east1",
  [string] $Instance = "yuruicamp-pg-staging",
  [string] $DbName = "yuruicamp",
  [string] $DbUser = "yuruicamp_app",
  [int] $ProxyPort = 5434
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$seedEntry = Join-Path $repoRoot "docs\seed\002-dev-seed.sql"
$passFile = Join-Path $env:TEMP "yuruicamp-db-app-pass.txt"

if (-not (Test-Path $passFile)) {
  throw "Missing $passFile — run 01-provision.ps1 first."
}
if (-not (Test-Path $seedEntry)) {
  throw "Missing seed file: $seedEntry"
}

$connectionName = gcloud sql instances describe $Instance --project=$Project --format="value(connectionName)"
$dbPass = (Get-Content -LiteralPath $passFile -Raw).Trim()

$proxyCmd = Get-Command cloud-sql-proxy -ErrorAction SilentlyContinue
if (-not $proxyCmd) {
  $proxyCmd = Get-Command cloud_sql_proxy -ErrorAction SilentlyContinue
}
if (-not $proxyCmd) {
  throw @"
cloud-sql-proxy not found on PATH.
Install: https://cloud.google.com/sql/docs/postgres/connect-auth-proxy
Then re-run this script.
"@
}

Write-Host "==> Starting Cloud SQL Auth Proxy on 127.0.0.1:$ProxyPort"
$proxy = Start-Process -FilePath $proxyCmd.Source `
  -ArgumentList @("--port=$ProxyPort", $connectionName) `
  -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 3

try {
  $env:PGPASSWORD = $dbPass
  Write-Host "==> Waiting for Flyway tables (products)..."
  $ready = $false
  for ($i = 0; $i -lt 30; $i++) {
    $count = psql -h 127.0.0.1 -p $ProxyPort -U $DbUser -d $DbName -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='products'" 2>$null
    if ($count -eq "1") { $ready = $true; break }
    Start-Sleep -Seconds 5
  }
  if (-not $ready) {
    throw "Table public.products not found. Deploy API first so Flyway can run (02-deploy-api.ps1)."
  }

  Write-Host "==> Loading seed (may take a minute)"
  # psql \ir needs cwd = docs/seed
  Push-Location (Join-Path $repoRoot "docs\seed")
  try {
    psql -h 127.0.0.1 -p $ProxyPort -U $DbUser -d $DbName -v ON_ERROR_STOP=1 -f "002-dev-seed.sql"
    if ($LASTEXITCODE -ne 0) { throw "seed failed" }
  }
  finally {
    Pop-Location
  }
  Write-Host "Seed OK."
}
finally {
  $env:PGPASSWORD = $null
  if ($proxy -and -not $proxy.HasExited) {
    Stop-Process -Id $proxy.Id -Force -ErrorAction SilentlyContinue
  }
}
