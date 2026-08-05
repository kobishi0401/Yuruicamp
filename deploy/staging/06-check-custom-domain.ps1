#Requires -Version 5.1
<#
.SYNOPSIS
  Poll Firebase Hosting custom domain status for yuruicamp.com / www.
#>
param(
  [string] $Project = "yuruicamp-2026",
  [string] $Site = "yuruicamp-2026"
)

$ErrorActionPreference = "Stop"
$token = gcloud auth print-access-token
$domains = @("yuruicamp.com", "www.yuruicamp.com")

foreach ($d in $domains) {
  Write-Host "==> $d"
  $json = curl.exe -sS `
    -H "Authorization: Bearer $token" `
    -H "x-goog-user-project: $Project" `
    "https://firebasehosting.googleapis.com/v1beta1/projects/$Project/sites/$Site/customDomains/$d"
  $obj = $json | ConvertFrom-Json
  if ($obj.error) {
    Write-Host "  ERROR: $($obj.error.message)" -ForegroundColor Red
    continue
  }
  Write-Host ("  ownership = {0}" -f $obj.ownershipState)
  Write-Host ("  host      = {0}" -f $obj.hostState)
  Write-Host ("  cert      = {0}" -f $obj.cert.state)
  if ($obj.redirectTarget) {
    Write-Host ("  redirect  = {0}" -f $obj.redirectTarget)
  }
  $add = @()
  if ($obj.requiredDnsUpdates.desired) {
    foreach ($set in $obj.requiredDnsUpdates.desired) {
      foreach ($r in $set.records) {
        if ($r.requiredAction -eq "ADD") {
          $add += ("{0} {1} → {2}" -f $r.type, $r.domainName, $r.rdata)
        }
      }
    }
  }
  if ($add.Count -gt 0) {
    Write-Host "  still need DNS ADD:" -ForegroundColor Yellow
    $add | ForEach-Object { Write-Host "    $_" }
  }
  else {
    Write-Host "  no pending requiredDnsUpdates.ADD" -ForegroundColor Green
  }
  Write-Host ""
}

Write-Host "GoDaddy steps: deploy/staging/custom-domain-godaddy.md"
Write-Host "Auth domains: add yuruicamp.com + www.yuruicamp.com in Firebase Console."
