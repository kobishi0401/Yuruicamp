#Requires -Version 5.1
<#
.SYNOPSIS
  Stage 4–5: Cloud SQL DB/user, Artifact Registry, Secret Manager, IAM.

.PARAMETER FirebaseCredentialsPath
  Path to Firebase Admin SDK service account JSON (mounted as a file on Cloud Run).

.PARAMETER Project
  GCP project id (default yuruicamp-2026).

.PARAMETER Region
  Region (default asia-east1).
#>
param(
  [Parameter(Mandatory = $true)]
  [string] $FirebaseCredentialsPath,

  [string] $Project = "yuruicamp-2026",
  [string] $Region = "asia-east1",
  [string] $Instance = "yuruicamp-pg-staging",
  [string] $DbName = "yuruicamp",
  [string] $DbUser = "yuruicamp_app",
  [string] $Repo = "yuruicamp"
)

$ErrorActionPreference = "Stop"

function New-RandomPassword([int] $Length = 32) {
  -join ((48..57) + (65..90) + (97..122) | Get-Random -Count $Length | ForEach-Object { [char]$_ })
}

function Ensure-Secret([string] $Name, [string] $Value) {
  # Write to a temp file (no trailing newline) — piping strings into gcloud can corrupt passwords.
  $tmp = Join-Path $env:TEMP ("secret-" + $Name + ".txt")
  $utf8NoBom = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($tmp, $Value, $utf8NoBom)
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $null = gcloud secrets describe $Name --project=$Project 2>&1
  $exists = ($LASTEXITCODE -eq 0)
  $ErrorActionPreference = $prev
  if ($exists) {
    Write-Host "Secret exists, adding new version: $Name"
    gcloud secrets versions add $Name --project=$Project --data-file=$tmp
  }
  else {
    Write-Host "Creating secret: $Name"
    gcloud secrets create $Name --project=$Project --replication-policy=automatic --data-file=$tmp
  }
}

function Ensure-SecretFile([string] $Name, [string] $FilePath) {
  if (-not (Test-Path -LiteralPath $FilePath)) {
    throw "File not found: $FilePath"
  }
  $exists = gcloud secrets describe $Name --project=$Project 2>$null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "Secret exists, adding new version from file: $Name"
    gcloud secrets versions add $Name --project=$Project --data-file="$FilePath"
  }
  else {
    Write-Host "Creating secret from file: $Name"
    gcloud secrets create $Name --project=$Project --replication-policy=automatic --data-file="$FilePath"
  }
}

Write-Host "==> Project / region"
gcloud config set project $Project | Out-Null
gcloud config set run/region $Region | Out-Null

$instanceState = gcloud sql instances describe $Instance --project=$Project --format="value(state)" 2>$null
if ($LASTEXITCODE -ne 0) {
  throw "Cloud SQL instance '$Instance' not found. Create it first (see deploy/staging/README.md)."
}
if ($instanceState -ne "RUNNABLE") {
  throw "Cloud SQL instance state is '$instanceState' (want RUNNABLE). Wait and retry."
}

Write-Host "==> Database + app user"
$dbList = gcloud sql databases list --instance=$Instance --project=$Project --format="value(name)"
if ($dbList -notcontains $DbName) {
  gcloud sql databases create $DbName --instance=$Instance --project=$Project
}
else {
  Write-Host "Database already exists: $DbName"
}

$appPassFile = Join-Path $env:TEMP "yuruicamp-db-app-pass.txt"
if (-not (Test-Path $appPassFile)) {
  $appPass = New-RandomPassword 32
  Set-Content -Path $appPassFile -Value $appPass -Encoding ascii
}
else {
  $appPass = (Get-Content -LiteralPath $appPassFile -Raw).Trim()
}

$userList = gcloud sql users list --instance=$Instance --project=$Project --format="value(name)"
if ($userList -notcontains $DbUser) {
  gcloud sql users create $DbUser --instance=$Instance --project=$Project --password=$appPass
}
else {
  Write-Host "Updating password for existing user: $DbUser"
  gcloud sql users set-password $DbUser --instance=$Instance --project=$Project --password=$appPass
}

Write-Host "==> Artifact Registry"
# gcloud may write informational lines to stderr; don't treat as terminating errors.
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$repoCheck = & gcloud artifacts repositories describe $Repo --location=$Region --project=$Project 2>&1
$repoOk = ($LASTEXITCODE -eq 0)
$ErrorActionPreference = $prevEap
if (-not $repoOk) {
  gcloud artifacts repositories create $Repo `
    --repository-format=docker `
    --location=$Region `
    --project=$Project `
    --description="Yuruicamp container images"
}
else {
  Write-Host "Artifact Registry repo exists: $Repo"
}

Write-Host "==> Secrets"
Ensure-Secret -Name "yuruicamp-staging-db-password" -Value $appPass
Ensure-SecretFile -Name "yuruicamp-staging-firebase-sa" -FilePath $FirebaseCredentialsPath

# ECPay sandbox test vectors (same as application.properties defaults). Replace later if needed.
Ensure-Secret -Name "yuruicamp-staging-ecpay-merchant-id" -Value "3002607"
Ensure-Secret -Name "yuruicamp-staging-ecpay-hash-key" -Value "pwFHCqoQZGmho4w6"
Ensure-Secret -Name "yuruicamp-staging-ecpay-hash-iv" -Value "EkRm7iFT261dpevs"
Ensure-Secret -Name "yuruicamp-staging-ecpay-logistics-merchant-id" -Value "2000132"
Ensure-Secret -Name "yuruicamp-staging-ecpay-logistics-hash-key" -Value "5294y06JbISpM5x9"
Ensure-Secret -Name "yuruicamp-staging-ecpay-logistics-hash-iv" -Value "v77hoKGq4kWxNNIS"

Write-Host "==> IAM for Cloud Run runtime SA"
$projectNumber = gcloud projects describe $Project --format="value(projectNumber)"
$runtimeSa = "$projectNumber-compute@developer.gserviceaccount.com"
$roles = @(
  "roles/cloudsql.client",
  "roles/secretmanager.secretAccessor"
)
foreach ($role in $roles) {
  gcloud projects add-iam-policy-binding $Project `
    --member="serviceAccount:$runtimeSa" `
    --role=$role `
    --condition=None `
    --quiet | Out-Null
}

$connectionName = gcloud sql instances describe $Instance --project=$Project --format="value(connectionName)"
Write-Host ""
Write-Host "Provision OK."
Write-Host "  Cloud SQL connectionName = $connectionName"
Write-Host "  DB password file         = $appPassFile"
Write-Host "  Runtime SA               = $runtimeSa"
Write-Host "Next: .\deploy\staging\02-deploy-api.ps1"
