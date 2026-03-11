param(
  [Parameter(Mandatory = $true)]
  [string]$TargetPath,
  [switch]$InitGit,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

$sourceRoot = Split-Path -Parent $PSScriptRoot
$targetRoot = (Resolve-Path -LiteralPath (Split-Path -Parent $TargetPath) -ErrorAction SilentlyContinue)
if (-not $targetRoot) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $TargetPath) | Out-Null
}
$dest = $TargetPath

if (Test-Path -LiteralPath $dest) {
  if (-not $Force) {
    throw "Target already exists: $dest (use -Force to overwrite)"
  }
  Remove-Item -LiteralPath $dest -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $dest | Out-Null

$excludeDirs = @('node_modules', '.git', 'out', '.cache')
$excludeFiles = @('*.log')

Get-ChildItem -LiteralPath $sourceRoot -Force | ForEach-Object {
  $name = $_.Name
  if ($excludeDirs -contains $name) { return }

  if ($_.PSIsContainer) {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $dest $name) -Recurse -Force
  } else {
    $skip = $false
    foreach ($pat in $excludeFiles) {
      if ($name -like $pat) { $skip = $true; break }
    }
    if (-not $skip) {
      Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $dest $name) -Force
    }
  }
}

if ($InitGit) {
  Push-Location $dest
  try {
    git init | Out-Null
    git add .
    git commit -m "Initial commit: hokuto-extractor-app" | Out-Null
  } finally {
    Pop-Location
  }
}

Write-Host "Export completed: $dest"
