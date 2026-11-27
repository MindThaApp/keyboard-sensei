<#
.SYNOPSIS
  Builds apps/web for the Windows app and copies it into MusicPortal/web.

.DESCRIPTION
  The Windows app serves the web build from its package at
  https://app.musicportal.invalid, so the API URL must be absolute (the API's
  CORS_ORIGIN must list that origin). Writes web/host-config.json, which the
  host reads to allow navigations to the API origin.

.EXAMPLE
  pwsh apps/windows/scripts/build-web.ps1 -ApiUrl https://api.example.org
#>
param(
  [Parameter(Mandatory = $true)][string]$ApiUrl,
  [switch]$SkipBuild
)
$ErrorActionPreference = 'Stop'

$uri = $null
if (-not [Uri]::TryCreate($ApiUrl, [UriKind]::Absolute, [ref]$uri) -or ($uri.Scheme -ne 'https' -and $uri.Scheme -ne 'http')) {
  throw "ApiUrl must be an absolute http(s) URL, got '$ApiUrl'"
}

$repo = Resolve-Path (Join-Path $PSScriptRoot '..\..\..')
$dist = Join-Path $repo 'apps\web\dist'
$target = Join-Path $repo 'apps\windows\MusicPortal\web'

if (-not $SkipBuild) {
  Push-Location $repo
  try {
    $env:VITE_API_URL = $ApiUrl.TrimEnd('/')
    pnpm --filter '@keyboard-sensei/web' build
    if ($LASTEXITCODE -ne 0) { throw "web build failed ($LASTEXITCODE)" }
  } finally {
    Remove-Item Env:VITE_API_URL -ErrorAction SilentlyContinue
    Pop-Location
  }
}

if (-not (Test-Path (Join-Path $dist 'index.html'))) { throw "No web build at $dist" }
if (Test-Path $target) { Remove-Item $target -Recurse -Force }
New-Item -ItemType Directory -Path $target | Out-Null
Copy-Item -Path (Join-Path $dist '*') -Destination $target -Recurse
# Source maps are for crash symbolication, not for the package.
Get-ChildItem $target -Recurse -Filter '*.map' | Remove-Item -Force

@{ apiUrl = $ApiUrl.TrimEnd('/') } | ConvertTo-Json | Set-Content -Path (Join-Path $target 'host-config.json') -Encoding utf8
$count = (Get-ChildItem $target -Recurse -File).Count
Write-Host "Copied $count files to $target"
