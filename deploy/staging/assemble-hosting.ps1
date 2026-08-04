#Requires -Version 5.1
<#
.SYNOPSIS
  Merge Vite dist + classic static JS/HTML into deploy/staging/hosting-out.

.DESCRIPTION
  Vite only emits HTML/CSS/assets for listed MPA entries. Pages still load
  /storefront/js/*.js, /booking/**, /admin/**, /components/**, /data/** — those
  must be copied from frontend source into the Hosting public folder.

  After copying storefront/js, overlays dist-firebase-app/firebase-app.js so
  Hosting can load Firebase without bare npm specifiers.
#>
param(
  [string] $RepoRoot = "",
  [switch] $SkipBuild,
  [string] $ApiBaseUrl = "https://yuruicamp-api-staging-952948108890.asia-east1.run.app/api"
)

$ErrorActionPreference = "Stop"

if (-not $RepoRoot) {
  $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

$frontend = Join-Path $RepoRoot "frontend"
$dist = Join-Path $frontend "dist"
$firebaseAppDist = Join-Path $frontend "dist-firebase-app\firebase-app.js"
$out = Join-Path $RepoRoot "deploy\staging\hosting-out"

if (-not (Test-Path $frontend)) {
  throw "frontend/ not found: $frontend"
}

if (-not $SkipBuild) {
  Write-Host "==> npm run build (VITE_API_BASE_URL=$ApiBaseUrl)"
  Push-Location $frontend
  try {
    $env:VITE_API_BASE_URL = $ApiBaseUrl
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }
  }
  finally {
    Pop-Location
  }
}

if (-not (Test-Path $dist)) {
  throw "frontend/dist missing. Run build first."
}

Write-Host "==> Clean $out"
if (Test-Path $out) {
  Remove-Item -LiteralPath $out -Recurse -Force
}
New-Item -ItemType Directory -Path $out | Out-Null

function Copy-Tree([string] $Src, [string] $Dest) {
  if (-not (Test-Path $Src)) {
    Write-Host "  skip (missing): $Src"
    return
  }
  Write-Host "  copy $Src -> $Dest"
  New-Item -ItemType Directory -Force -Path $Dest | Out-Null
  Copy-Item -Path (Join-Path $Src "*") -Destination $Dest -Recurse -Force
}

Write-Host "==> Copy Vite dist (built HTML / assets / yurui-env.js)"
Copy-Item -Path (Join-Path $dist "*") -Destination $out -Recurse -Force

Write-Host "==> Copy classic runtime trees from frontend/"
# storefront: keep dist HTML under storefront/pages; overlay js/css/components
Copy-Tree (Join-Path $frontend "storefront\js") (Join-Path $out "storefront\js")
Copy-Tree (Join-Path $frontend "storefront\css") (Join-Path $out "storefront\css")

# Hosting cannot resolve bare firebase/app imports; overwrite with Vite-bundled ESM.
# Chinese: source firebase-app.js only works under Vite; Hosting needs the bundled file.
if (-not (Test-Path $firebaseAppDist)) {
  throw "Missing bundled firebase-app.js at $firebaseAppDist. Run: npm run build (in frontend/)"
}
$firebaseAppDest = Join-Path $out "storefront\js\firebase-app.js"
Copy-Item -LiteralPath $firebaseAppDist -Destination $firebaseAppDest -Force
Write-Host "  overlay bundled firebase-app.js -> $firebaseAppDest"
$mapSrc = Join-Path $frontend "dist-firebase-app\firebase-app.js.map"
if (Test-Path $mapSrc) {
  Copy-Item -LiteralPath $mapSrc -Destination (Join-Path $out "storefront\js\firebase-app.js.map") -Force
}
# booking: only booking-success.html is in Vite input; copy rest of booking site
Copy-Tree (Join-Path $frontend "booking") (Join-Path $out "booking")
# Re-apply Vite-built booking-success if present (overwrite source HTML with built one)
$builtBookingSuccess = Join-Path $dist "booking\pages\booking-success.html"
if (Test-Path $builtBookingSuccess) {
  $destBs = Join-Path $out "booking\pages\booking-success.html"
  New-Item -ItemType Directory -Force -Path (Split-Path $destBs) | Out-Null
  Copy-Item $builtBookingSuccess $destBs -Force
  Write-Host "  restore Vite booking-success.html"
}
# admin is not a Vite MPA entry
Copy-Tree (Join-Path $frontend "admin") (Join-Path $out "admin")
Copy-Tree (Join-Path $frontend "components") (Join-Path $out "components")
Copy-Tree (Join-Path $frontend "data") (Join-Path $out "data")
# Static media (videos may be absent if gitignored)
Copy-Tree (Join-Path $frontend "assets") (Join-Path $out "assets")

# Drop junk that must not ship
$drop = @(
  (Join-Path $out "admin\scripts"),
  (Join-Path $out "booking\BookingChangeLog.md")
)
foreach ($p in $drop) {
  if (Test-Path $p) {
    Remove-Item -LiteralPath $p -Recurse -Force -ErrorAction SilentlyContinue
  }
}

# Sanity checks
$checks = @(
  "yurui-env.js",
  "storefront\js\config.js",
  "storefront\js\api-client.js",
  "storefront\js\firebase-app.js",
  "storefront\pages\home.html",
  "admin\login.html",
  "index.html"
)
Write-Host "==> Sanity checks"
foreach ($rel in $checks) {
  $full = Join-Path $out $rel
  if (-not (Test-Path $full)) {
    throw "Missing required hosting file: $rel"
  }
  Write-Host "  OK $rel"
}

# Bundled file must NOT still ask the browser to resolve npm bare specifiers.
$firebaseBundle = Get-Content (Join-Path $out "storefront\js\firebase-app.js") -Raw -Encoding UTF8
$hasBareFirebaseImport =
  $firebaseBundle.Contains('from "firebase/') -or
  $firebaseBundle.Contains("from 'firebase/")
if ($hasBareFirebaseImport) {
  throw "hosting-out firebase-app.js still contains bare firebase/* imports - bundle step failed"
}
if ($firebaseBundle.Length -lt 50000) {
  Write-Host "WARNING: bundled firebase-app.js looks small ($($firebaseBundle.Length) bytes); firebase SDK may be missing."
}
else {
  Write-Host "  OK firebase-app.js looks bundled ($($firebaseBundle.Length) bytes)"
}

$envJs = Get-Content (Join-Path $out "yurui-env.js") -Raw -Encoding UTF8
if ($envJs -notmatch [regex]::Escape($ApiBaseUrl.TrimEnd('/'))) {
  Write-Host "WARNING: yurui-env.js may not contain ApiBaseUrl. Check VITE_API_BASE_URL / .env.local."
}
else {
  Write-Host "  OK yurui-env.js contains staging API base"
}

Write-Host ""
Write-Host "Assemble OK -> $out"
Write-Host "Next: firebase deploy --only hosting   (from repo root)"
