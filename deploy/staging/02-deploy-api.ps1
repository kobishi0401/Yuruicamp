#Requires -Version 5.1
<#
.SYNOPSIS
  Stage 6: build/push image and deploy Cloud Run with stub=false + Cloud SQL + secrets.
#>
param(
  [string] $Project = "yuruicamp-2026",
  [string] $Region = "asia-east1",
  [string] $Instance = "yuruicamp-pg-staging",
  [string] $DbName = "yuruicamp",
  [string] $DbUser = "yuruicamp_app",
  [string] $Repo = "yuruicamp",
  [string] $Service = "yuruicamp-api-staging",
  [string] $ImageTag = "staging",
  # Staging Hosting origin (ECPay browser return + CORS). Custom domain + legacy web.app.
  [string] $FrontendBaseUrl = "https://yuruicamp.com",
  [string] $CorsOrigins = "https://yuruicamp.com,https://www.yuruicamp.com,https://yuruicamp-2026.web.app,https://yuruicamp-2026.firebaseapp.com,http://127.0.0.1:5173"
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$backendDir = Join-Path $repoRoot "backend"

gcloud config set project $Project | Out-Null
gcloud config set run/region $Region | Out-Null

$connectionName = gcloud sql instances describe $Instance --project=$Project --format="value(connectionName)"
if (-not $connectionName) {
  throw "Cannot read Cloud SQL connectionName for $Instance"
}

$image = "$Region-docker.pkg.dev/$Project/$Repo/backend:$ImageTag"
$dbUrl = "jdbc:postgresql:///$DbName?cloudSqlInstance=$connectionName&socketFactory=com.google.cloud.sql.postgres.SocketFactory"

Write-Host "==> Configure Docker auth for Artifact Registry"
gcloud auth configure-docker "$Region-docker.pkg.dev" --quiet

# Skip rebuild when -SkipBuild is passed via env (optional speed-up).
$skipBuild = ($env:YURUICAMP_SKIP_DOCKER_BUILD -eq "1")
if (-not $skipBuild) {
  Write-Host "==> docker build $image"
  Push-Location $backendDir
  try {
    docker build -t $image .
    if ($LASTEXITCODE -ne 0) { throw "docker build failed" }
    docker push $image
    if ($LASTEXITCODE -ne 0) { throw "docker push failed" }
  }
  finally {
    Pop-Location
  }
}
else {
  Write-Host "==> Skip docker build (YURUICAMP_SKIP_DOCKER_BUILD=1)"
}

# Env file: YAML single-quotes — "?" / "&" in JDBC URL break unquoted/double-quoted YAML.
$envFile = Join-Path $env:TEMP "yuruicamp-run-env.yaml"
$envLines = @(
  "DB_URL: '$dbUrl'",
  "DB_USERNAME: '$DbUser'",
  "FIREBASE_ENABLED: 'true'",
  "FIREBASE_PROJECT_ID: '$Project'",
  "FIREBASE_CREDENTIALS: '/secrets/firebase/credentials.json'",
  "YURUICAMP_ECPAY_STUB: 'false'",
  "YURUICAMP_ECPAY_LOGISTICS_STUB: 'false'",
  "YURUICAMP_FRONTEND_BASE_URL: '$FrontendBaseUrl'",
  "CORS_ALLOWED_ORIGINS: '$CorsOrigins'",
  "YURUICAMP_ECPAY_PAYMENT_URL: 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5'",
  "YURUICAMP_ECPAY_LOGISTICS_API_BASE_URL: 'https://logistics-stage.ecpay.com.tw'"
)
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllLines($envFile, $envLines, $utf8NoBom)
Write-Host "Env file DB_URL line: $($envLines[0])"

Write-Host "==> Deploy Cloud Run $Service (stub=false)"
gcloud run deploy $Service `
  --project=$Project `
  --region=$Region `
  --image=$image `
  --platform=managed `
  --allow-unauthenticated `
  --port=8080 `
  --cpu=1 `
  --memory=1Gi `
  --min-instances=0 `
  --max-instances=3 `
  --timeout=300 `
  --add-cloudsql-instances=$connectionName `
  --env-vars-file=$envFile `
  --set-secrets="DB_PASSWORD=yuruicamp-staging-db-password:latest,YURUICAMP_ECPAY_MERCHANT_ID=yuruicamp-staging-ecpay-merchant-id:latest,YURUICAMP_ECPAY_HASH_KEY=yuruicamp-staging-ecpay-hash-key:latest,YURUICAMP_ECPAY_HASH_IV=yuruicamp-staging-ecpay-hash-iv:latest,YURUICAMP_ECPAY_LOGISTICS_MERCHANT_ID=yuruicamp-staging-ecpay-logistics-merchant-id:latest,YURUICAMP_ECPAY_LOGISTICS_HASH_KEY=yuruicamp-staging-ecpay-logistics-hash-key:latest,YURUICAMP_ECPAY_LOGISTICS_HASH_IV=yuruicamp-staging-ecpay-logistics-hash-iv:latest,/secrets/firebase/credentials.json=yuruicamp-staging-firebase-sa:latest"

if ($LASTEXITCODE -ne 0) { throw "gcloud run deploy failed" }

$serviceUrl = gcloud run services describe $Service --project=$Project --region=$Region --format="value(status.url)"
$publicApi = "$serviceUrl/api"

Write-Host "==> Set PUBLIC_API_BASE_URL=$publicApi"
gcloud run services update $Service `
  --project=$Project `
  --region=$Region `
  --update-env-vars="YURUICAMP_ECPAY_PUBLIC_API_BASE_URL=$publicApi"
if ($LASTEXITCODE -ne 0) { throw "failed to set PUBLIC_API_BASE_URL" }

Write-Host ""
Write-Host "Deploy OK."
Write-Host "  Service URL = $serviceUrl"
Write-Host "  Health      = $publicApi/health"
Write-Host "  stub        = false (ECPay sandbox)"
Write-Host ""
Write-Host "Smoke: curl.exe $publicApi/health"
Write-Host "Next: seed (03-seed.ps1) then phase 7 Hosting (update CORS + FRONTEND_BASE_URL)."
