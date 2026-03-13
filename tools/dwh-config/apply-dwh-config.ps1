param(
  [Parameter(Mandatory = $true)]
  [string]$BaseUrl,

  [Parameter(Mandatory = $true)]
  [string]$JwtToken
)

$ErrorActionPreference = "Stop"

function Put-Config {
  param(
    [Parameter(Mandatory = $true)]
    [string]$DatasetKey,

    [Parameter(Mandatory = $true)]
    [string]$JsonPath
  )

  if (-not (Test-Path $JsonPath)) {
    throw "File not found: $JsonPath"
  }

  $body = Get-Content -Raw -Path $JsonPath
  $uri = "$BaseUrl/api/dwh-sync/configs/$DatasetKey"

  Write-Host "PUT $uri"
  Invoke-RestMethod `
    -Method Put `
    -Uri $uri `
    -Headers @{ Authorization = "Bearer $JwtToken" } `
    -ContentType "application/json" `
    -Body $body | Out-Null
}

function Post-Test {
  param(
    [Parameter(Mandatory = $true)]
    [string]$DatasetKey,

    [Parameter(Mandatory = $true)]
    [string]$Date
  )

  $uri = "$BaseUrl/api/dwh-sync/configs/$DatasetKey/test?date=$Date"
  Write-Host "POST $uri"
  $result = Invoke-RestMethod `
    -Method Post `
    -Uri $uri `
    -Headers @{ Authorization = "Bearer $JwtToken" } `
    -ContentType "application/json"

  $result | ConvertTo-Json -Depth 8
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Put-Config -DatasetKey "blood_results" -JsonPath (Join-Path $scriptDir "blood_results.sample.json")
Put-Config -DatasetKey "urgent_prescriptions" -JsonPath (Join-Path $scriptDir "urgent_prescriptions.sample.json")
Put-Config -DatasetKey "guidance_orders" -JsonPath (Join-Path $scriptDir "guidance_orders.sample.json")

Write-Host ""
Write-Host "Config upload completed."
Write-Host "Run tests with a date (YYYY-MM-DD), for example:"
Write-Host "  Post-Test -DatasetKey blood_results -Date 2026-03-13"
Write-Host "  Post-Test -DatasetKey urgent_prescriptions -Date 2026-03-13"
Write-Host "  Post-Test -DatasetKey guidance_orders -Date 2026-03-13"
