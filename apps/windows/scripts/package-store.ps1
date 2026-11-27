<#
.SYNOPSIS
  Builds unsigned x64 and arm64 MSIX packages and combines them into one
  .msixbundle and one .msixupload for the Microsoft Store.

.DESCRIPTION
  Single-project MSIX does not bundle platforms in one msbuild call, so each
  platform is built on its own, then `makeappx bundle` combines them and the
  bundle is zipped into the .msixupload Partner Center accepts. Identity values
  are MSBuild properties (see docs/windows.md); the defaults are placeholders.
  Run scripts/build-web.ps1 first.

.EXAMPLE
  pwsh apps/windows/scripts/package-store.ps1 -Version 1.0.12.0 -OutDir out
#>
param(
  [string]$Version = '1.0.0.0',
  [string]$OutDir = 'out',
  [string[]]$Platforms = @('x64', 'arm64'),
  [string]$IdentityName = $env:MUSICPORTAL_IDENTITY_NAME,
  [string]$Publisher = $env:MUSICPORTAL_PUBLISHER,
  [string]$PublisherDisplayName = $env:MUSICPORTAL_PUBLISHER_DISPLAY_NAME
)
$ErrorActionPreference = 'Stop'

if ($Version -notmatch '^\d+\.\d+\.\d+\.0$') { throw "Store versions look like 1.2.3.0 (last part 0), got '$Version'" }
$repo = Resolve-Path (Join-Path $PSScriptRoot '..\..\..')
$project = Join-Path $repo 'apps\windows\MusicPortal\MusicPortal.csproj'
if (-not (Test-Path (Join-Path $repo 'apps\windows\MusicPortal\web\index.html'))) { throw 'No web build in MusicPortal\web: run scripts/build-web.ps1 first' }

$out = [IO.Path]::GetFullPath((Join-Path (Get-Location) $OutDir))
$staging = Join-Path $out 'packages'
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Path $staging | Out-Null

$identity = @()
if ($IdentityName) { $identity += "/p:MusicPortalIdentityName=$IdentityName" }
if ($Publisher) { $identity += "/p:MusicPortalPublisher=$Publisher" }
if ($PublisherDisplayName) { $identity += "/p:MusicPortalPublisherDisplayName=$PublisherDisplayName" }

foreach ($platform in $Platforms) {
  $platformDir = Join-Path $out "build-$platform\"
  & msbuild $project /restore /m /v:minimal `
    /p:Configuration=Release /p:Platform=$platform `
    /p:AppxBundle=Never /p:UapAppxPackageBuildMode=SideloadOnly `
    /p:AppxPackageSigningEnabled=false /p:GenerateAppxPackageOnBuild=true `
    /p:AppxSymbolPackageEnabled=false `
    "/p:AppxPackageDir=$platformDir" "/p:MusicPortalVersion=$Version" @identity
  if ($LASTEXITCODE -ne 0) { throw "msbuild failed for $platform ($LASTEXITCODE)" }
  $msix = Get-ChildItem $platformDir -Recurse -Filter '*.msix' | Select-Object -First 1
  if (-not $msix) { throw "No .msix produced for $platform" }
  Copy-Item $msix.FullName (Join-Path $staging "MusicPortal_${Version}_$platform.msix")
}

# makeappx ships with the Windows SDK and with the Microsoft.Windows.SDK.BuildTools package.
$makeappx = @(
  Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\makeappx.exe" -ErrorAction SilentlyContinue
  Get-ChildItem "$env:USERPROFILE\.nuget\packages\microsoft.windows.sdk.buildtools\*\bin\*\x64\makeappx.exe" -ErrorAction SilentlyContinue
) | Sort-Object { [version]($_.Directory.Parent.Name -replace '[^\d\.]', '') } -Descending | Select-Object -First 1
if (-not $makeappx) { throw 'makeappx.exe not found (install the Windows SDK)' }

$bundle = Join-Path $out "MusicPortal_${Version}.msixbundle"
& $makeappx.FullName bundle /o /bv $Version /d $staging /p $bundle
if ($LASTEXITCODE -ne 0) { throw "makeappx bundle failed ($LASTEXITCODE)" }

# A .msixupload is a zip holding the bundle.
$zip = Join-Path $out "MusicPortal_${Version}.zip"
Compress-Archive -Path $bundle -DestinationPath $zip -Force
$upload = Join-Path $out "MusicPortal_${Version}.msixupload"
Move-Item $zip $upload -Force

Get-ChildItem $out -File | ForEach-Object { '{0} ({1:N1} MB)' -f $_.Name, ($_.Length / 1MB) }
