#Requires -Version 5.1
<#
.SYNOPSIS
  Staging smoke for acceptance sections A + F (and public prep for B/C/E).

.DESCRIPTION
  No Firebase login required. Exit 0 if all checks pass.
#>
param(
  [string] $ApiBase = "https://yuruicamp-api-staging-952948108890.asia-east1.run.app/api",
  [string] $HostingBase = "https://yuruicamp-2026.web.app",
  [string] $Project = "yuruicamp-2026",
  [string] $Region = "asia-east1",
  [string] $Service = "yuruicamp-api-staging"
)

$ErrorActionPreference = "Stop"
$failed = 0

function Ok([string] $Msg) { Write-Host "  PASS  $Msg" -ForegroundColor Green }
function Fail([string] $Msg) {
  Write-Host "  FAIL  $Msg" -ForegroundColor Red
  $script:failed++
}
function Info([string] $Msg) { Write-Host "  INFO  $Msg" -ForegroundColor Cyan }

function Assert-HttpOk([string] $Url, [string] $Label, [int[]] $Accept = @(200)) {
  $tmp = Join-Path $env:TEMP ("smoke-" + [guid]::NewGuid().ToString("n") + ".bin")
  $code = 0
  try {
    $code = [int](curl.exe -sS -o $tmp -w "%{http_code}" $Url)
  }
  catch {
    Fail "$Label → request error: $_"
    return $null
  }
  if ($Accept -notcontains $code) {
    Fail "$Label → HTTP $code ($Url)"
    return $null
  }
  Ok "$Label → HTTP $code"
  return (Get-Content $tmp -Raw -Encoding UTF8)
}

Write-Host "==> A/F Staging smoke"
Write-Host "    API     = $ApiBase"
Write-Host "    Hosting = $HostingBase"
Write-Host ""

Write-Host "-- A / F: API health & catalog --"
$body = Assert-HttpOk "$ApiBase/health" "health"
if ($body -and $body -notmatch '"status"\s*:\s*"UP"') { Fail "health body missing UP" }

$body = Assert-HttpOk "$ApiBase/products?page=0&size=1" "products"
if ($body -and $body -notmatch '"totalElements"\s*:\s*[1-9]') { Fail "products totalElements should be > 0" }

Assert-HttpOk "$ApiBase/products/bestsellers?limit=3" "bestsellers" | Out-Null
Assert-HttpOk "$ApiBase/booking/campgrounds" "booking campgrounds" | Out-Null
Assert-HttpOk "$ApiBase/brands" "brands" | Out-Null

Write-Host ""
Write-Host "-- F: Hosting pages & env --"
Assert-HttpOk "$HostingBase/storefront/pages/home.html" "home.html" | Out-Null
Assert-HttpOk "$HostingBase/storefront/pages/checkout.html" "checkout.html" | Out-Null
Assert-HttpOk "$HostingBase/booking/pages/booking-checkout.html" "booking-checkout.html" | Out-Null
Assert-HttpOk "$HostingBase/admin/login.html" "admin login.html" | Out-Null

$envJs = Assert-HttpOk "$HostingBase/yurui-env.js" "yurui-env.js"
if ($envJs -and $envJs -notmatch [regex]::Escape($ApiBase.TrimEnd('/'))) {
  Fail "yurui-env.js API_BASE_URL does not match $ApiBase"
}

$faPath = Join-Path $env:TEMP "smoke-firebase-app.js"
$code = [int](curl.exe -sS -o $faPath -w "%{http_code}" "$HostingBase/storefront/js/firebase-app.js")
if ($code -ne 200) {
  Fail "firebase-app.js → HTTP $code"
}
else {
  $len = (Get-Item $faPath).Length
  $raw = Get-Content $faPath -Raw -Encoding UTF8
  if ($raw.Contains('from "firebase/') -or $raw.Contains("from 'firebase/")) {
    Fail "firebase-app.js still has bare firebase/* imports (not bundled)"
  }
  elseif ($len -lt 50000) {
    Fail "firebase-app.js too small ($len bytes) — likely unbundled source"
  }
  else {
    Ok "firebase-app.js bundled ($len bytes)"
  }
}

Write-Host ""
Write-Host "-- F: CORS from Hosting origin --"
$hdrFile = Join-Path $env:TEMP "smoke-cors-headers.txt"
curl.exe -sS -D $hdrFile -o NUL -H "Origin: $HostingBase" "$ApiBase/products?page=0&size=1" | Out-Null
$hdrs = Get-Content $hdrFile -Raw -Encoding UTF8
if ($hdrs -match [regex]::Escape("access-control-allow-origin: $HostingBase")) {
  Ok "CORS allows $HostingBase"
}
else {
  Fail "CORS missing Access-Control-Allow-Origin: $HostingBase"
}

Write-Host ""
Write-Host "-- B prep: Cloud Run stub flags (expect false) --"
try {
  $envDump = gcloud run services describe $Service --project=$Project --region=$Region --format=json | ConvertFrom-Json
  $envs = @{}
  foreach ($e in $envDump.spec.template.spec.containers[0].env) {
    if ($e.value) { $envs[$e.name] = [string]$e.value }
  }
  foreach ($key in @("YURUICAMP_ECPAY_STUB", "YURUICAMP_ECPAY_LOGISTICS_STUB")) {
    if ($envs.ContainsKey($key) -and $envs[$key] -eq "false") { Ok "$key=false" }
    else { Fail "$key should be false (got: $($envs[$key]))" }
  }
  $fe = $envs["YURUICAMP_FRONTEND_BASE_URL"]
  if ($fe -eq $HostingBase) { Ok "FRONTEND_BASE_URL=$fe" }
  else { Fail "FRONTEND_BASE_URL expected $HostingBase got $fe" }
  $pub = $envs["YURUICAMP_ECPAY_PUBLIC_API_BASE_URL"]
  if ($pub -eq $ApiBase) { Ok "PUBLIC_API_BASE_URL=$pub" }
  else { Fail "PUBLIC_API_BASE_URL expected $ApiBase got $pub" }
}
catch {
  Fail "gcloud describe failed: $_"
}

Write-Host ""
Write-Host "-- A prep: ECPay secret lengths (no CRLF) --"
$expect = @{
  "yuruicamp-staging-ecpay-merchant-id" = 7
  "yuruicamp-staging-ecpay-hash-key" = 16
  "yuruicamp-staging-ecpay-hash-iv" = 16
  "yuruicamp-staging-ecpay-logistics-merchant-id" = 7
  "yuruicamp-staging-ecpay-logistics-hash-key" = 16
  "yuruicamp-staging-ecpay-logistics-hash-iv" = 16
}
foreach ($name in $expect.Keys) {
  $tmp = Join-Path $env:TEMP ("smoke-secret-" + $name + ".bin")
  gcloud secrets versions access latest --secret=$name --project=$Project --out-file=$tmp | Out-Null
  $n = (Get-Item $tmp).Length
  if ($n -eq $expect[$name]) { Ok "$name length=$n" }
  else { Fail "$name length=$n (expected $($expect[$name]); CRLF?)" }
}

Write-Host ""
if ($failed -eq 0) {
  Write-Host "ALL AUTOMATED CHECKS PASSED ($failed failures)." -ForegroundColor Green
  Write-Host "Next: complete human runbook for A-2..A-4, B, C, D, E (browser + Google + ECPay)."
  exit 0
}
Write-Host "FAILED: $failed check(s)." -ForegroundColor Red
exit 1
