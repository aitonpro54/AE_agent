[CmdletBinding()]
param(
    [string]$SdkRoot = 'C:\Users\Ant\AppData\Local\AEAgent\SDK\after-effects-26.5\AfterEffectsSDK_26.5_win',
    [string]$MsBuild = 'C:\Users\Ant\AppData\Local\AEAgent\BuildTools2022\MSBuild\Current\Bin\MSBuild.exe',
    [string]$BuildId = ('build-' + [guid]::NewGuid().ToString('N'))
)
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
$outputParent = Join-Path $repoRoot '.codex-runtime\ame-native-prerequisites\native-probe-build'
$sourceRoot = Join-Path $repoRoot 'native\ame-snapshot-probe'
$archiveSha = 'ad86bd6d66a1e1ffe8471e4618e3de4dbc9679f2ca47ae9bbe69f78805c82960'
function Get-ProbeSourceHashes {
    $hashes = @()
    foreach ($file in (Get-ChildItem -LiteralPath $sourceRoot -File | Sort-Object Name)) {
        $hashes += [ordered]@{ path = $file.FullName.Substring($repoRoot.Length + 1); sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $file.FullName).Hash.ToLowerInvariant() }
    }
    $hashes += [ordered]@{ path = 'scripts\ame-native-probe-build.ps1'; sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $PSCommandPath).Hash.ToLowerInvariant() }
    return $hashes
}
if ($BuildId -notmatch '^build-[a-f0-9]{32}$') { throw 'BuildId must be build- followed by 32 lowercase hex characters.' }
function Assert-NoReparse([string]$Path) {
    $absolutePath = [IO.Path]::GetFullPath($Path)
    $componentPath = $absolutePath
    while ($componentPath) {
        if (Test-Path -LiteralPath $componentPath) {
            $entry = Get-Item -LiteralPath $componentPath -Force
            if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Reparse point refused: $componentPath" }
        }
        $parentPath = Split-Path -Parent $componentPath
        if (!$parentPath -or $parentPath -eq $componentPath) { break }
        $componentPath = $parentPath
    }
    return $absolutePath
}
$SdkRoot = Assert-NoReparse $SdkRoot
$MsBuild = Assert-NoReparse $MsBuild
foreach ($relativePath in @('Examples\Headers\AE_GeneralPlug.h', 'Examples\Headers\AE_GeneralPlugOld.h', 'Examples\Headers\AE_AdvEffectSuites.h', 'Examples\Headers\SP\SPBasic.h', 'Examples\Resources\PiPLtool.exe')) {
    if (!(Test-Path -LiteralPath (Join-Path $SdkRoot $relativePath) -PathType Leaf)) { throw "External licensed SDK prerequisite missing: $relativePath" }
}
if (!(Test-Path -LiteralPath $MsBuild -PathType Leaf)) { throw 'MSBuild prerequisite missing; this script does not install dependencies.' }
$nativeSource = Get-Content -Encoding UTF8 -LiteralPath (Join-Path $sourceRoot 'ame_snapshot_probe.cpp') -Raw
if ($nativeSource -match '->\s*(AEGP_SaveProjectToPath|PF_SetProjectDirty)\s*\(' -or $nativeSource -match '\bp\.(save|saveWithDialog|saveAs)\s*\(') {
    throw 'Current disabled destination contract must contain zero native/ExtendScript project save or dirty restoration dispatch sites.'
}
$sourceHashes = @(Get-ProbeSourceHashes)
$headers = Get-Content -Encoding UTF8 -LiteralPath (Join-Path $SdkRoot 'Examples\Headers\AE_GeneralPlug.h') -Raw
$oldHeaders = Get-Content -Encoding UTF8 -LiteralPath (Join-Path $SdkRoot 'Examples\Headers\AE_GeneralPlugOld.h') -Raw
if ($headers -notmatch 'kAEGPProjSuiteVersion6\s+9' -or $headers -notmatch 'AEGP_SaveProjectToPath' -or $oldHeaders -notmatch 'kAEGPCompSuiteVersion12\s+26') { throw 'Required ABI evidence absent; no guessed fallback suite.' }
if (!(Test-Path -LiteralPath $outputParent)) { New-Item -ItemType Directory -Path $outputParent | Out-Null }
$outputParent = Assert-NoReparse $outputParent
$buildRoot = [IO.Path]::GetFullPath((Join-Path $outputParent $BuildId))
if (!$buildRoot.StartsWith($outputParent + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Build path escaped the owned ignored root.' }
if (Test-Path -LiteralPath $buildRoot) { throw 'Build directory already exists. Inspect prior outcome; choose a fresh build id explicitly.' }
New-Item -ItemType Directory -Path $buildRoot | Out-Null
Assert-NoReparse $buildRoot | Out-Null
$utf8 = [Text.UTF8Encoding]::new($false)
$owner = [ordered]@{ schema = 'ae-agent.native-probe-build.v1'; buildId = $BuildId; offline = $true; sdkRoot = $SdkRoot; sdkArchiveSha256 = $archiveSha; outputRoot = $buildRoot; timestampUtc = [DateTime]::UtcNow.ToString('o') }
[IO.File]::WriteAllText((Join-Path $buildRoot 'build-owner.json'), ($owner | ConvertTo-Json -Depth 6), $utf8)
$identity = "#pragma once`n#define PROBE_BUILD_ID `"$BuildId`"`n#define PROBE_SDK_ARCHIVE_SHA256 `"$archiveSha`"`n"
[IO.File]::WriteAllText((Join-Path $buildRoot 'probe_build_identity.h'), $identity, $utf8)
foreach ($projectName in @('AEAgentSnapshotProbe', 'ProtocolSmoke', 'RelativeRenameRepro')) {
    $arguments = @((Join-Path $sourceRoot "$projectName.vcxproj"), '/nologo', '/m:1', '/t:Build', '/p:Configuration=Release', '/p:Platform=x64', "/p:SdkRoot=$SdkRoot", "/p:ProbeBuildRoot=$buildRoot", '/p:PreferredToolArchitecture=x64', '/v:minimal')
    $buildLog = Join-Path $buildRoot "$projectName.build.log"
    & $MsBuild @arguments 2>&1 | Tee-Object -FilePath $buildLog
    if ($LASTEXITCODE -ne 0) { throw "Build failed ($projectName). Inspect $buildLog; no AE or install action was attempted." }
}
$binary = Join-Path $buildRoot 'bin\AEAgentSnapshotProbe.aex'
$binaryBytes = [IO.File]::ReadAllBytes($binary)
if ($binaryBytes.Length -lt 256 -or [Text.Encoding]::ASCII.GetString($binaryBytes, 0, 2) -ne 'MZ') { throw 'Missing PE binary.' }
$peOffset = [BitConverter]::ToInt32($binaryBytes, 0x3c)
if ($peOffset -lt 0 -or $peOffset + 26 -gt $binaryBytes.Length -or [BitConverter]::ToUInt32($binaryBytes, $peOffset) -ne 0x4550 -or [BitConverter]::ToUInt16($binaryBytes, $peOffset + 4) -ne 0x8664 -or !([BitConverter]::ToUInt16($binaryBytes, $peOffset + 22) -band 0x2000) -or [BitConverter]::ToUInt16($binaryBytes, $peOffset + 24) -ne 0x20b) { throw 'Binary is not a Windows x64 PE32+ DLL.' }
$reproOutput = & (Join-Path $buildRoot 'bin\RelativeRenameRepro.exe') $buildRoot 2>&1
$reproExit = $LASTEXITCODE
[IO.File]::WriteAllText((Join-Path $buildRoot 'relative-rename-repro.json'), ($reproOutput -join "`n"), $utf8)
if ($reproExit -ne 0) { throw "Offline minimal rename repro failed: $reproOutput" }
$reproResult = ($reproOutput -join "`n") | ConvertFrom-Json
$smokeOutput = & (Join-Path $buildRoot 'bin\ProtocolSmoke.exe') $buildRoot 2>&1
$smokeExit = $LASTEXITCODE
[IO.File]::WriteAllText((Join-Path $buildRoot 'protocol-smoke.log'), ($smokeOutput -join "`n"), $utf8)
$smokeResult = ($smokeOutput -join "`n") | ConvertFrom-Json
if (!$smokeResult.offline -or $smokeResult.hostLoaded -or
    $smokeResult.destinationWriteContract -ne 'destination_write_contract_unverified' -or
    $smokeResult.guardHarnessNativeSaves -ne 0 -or $smokeResult.guardHarnessExtendScriptSaves -ne 0 -or
    $smokeResult.guardHarnessFixtureDispatches -ne 0) { throw 'Offline harness did not preserve the disabled project-write contract.' }
$afterHashes = @(Get-ProbeSourceHashes)
if (($sourceHashes | ConvertTo-Json -Depth 4 -Compress) -cne ($afterHashes | ConvertTo-Json -Depth 4 -Compress)) {
    throw 'Source files changed during the build; binary/source provenance is unknown. Do not reuse this build id.'
}
$sdkEvidence = @()
foreach ($relativePath in @('Examples\Headers\AE_GeneralPlug.h', 'Examples\Headers\AE_GeneralPlugOld.h', 'Examples\Headers\AE_AdvEffectSuites.h', 'Examples\Resources\PiPLtool.exe')) { $sdkEvidence += [ordered]@{ path = $relativePath; sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $SdkRoot $relativePath)).Hash.ToLowerInvariant() } }
$receipt = [ordered]@{ schema = 'ae-agent.native-probe-build.v1'; buildId = $BuildId; offline = $true; readiness = $false; productionBackend = $false; installed = $false; loadedInAE = $false; liveSemantics = 'UNVERIFIED'; destinationWriteContract = 'destination_write_contract_unverified'; sourceProjectSaveDispatchSites = 0; fixtureMutationsEnabled = $false; dirtyRestorationEnabled = $false; controlReceiptPublication = 'same-held-handle FileRenameInfo absolute-only no-replace; trusted stable root/ancestors; no runtime fallback; producer retained until OwnedRoot lifetime ends'; rootMetadataIsolation = 'UNVERIFIED'; mediaHandoff = 'NOT_ATTEMPTED'; binaryPath = $binary; binarySha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $binary).Hash.ToLowerInvariant(); peMachine = 'AMD64'; peType = 'PE32+ DLL'; sdkRoot = $SdkRoot; sdkArchiveSha256 = $archiveSha; archiveHashProvenance = 'supplied prerequisite; archive not rehashed by build'; sdkFiles = $sdkEvidence; msbuildVersion = (Get-Item -LiteralPath $MsBuild).VersionInfo.FileVersion; windowsSdk = '10.0.26100.0'; suiteABI = @{ project6 = 9; comp12 = 26; register5 = 6; memory1 = 1; item9 = 14; layer9 = 15; footage5 = 11; utility6 = 13; collection2 = 2 }; sourceFiles = $sourceHashes; sourceHashesStableAcrossBuild = $true; protocolSmoke = $smokeResult; timestampUtc = [DateTime]::UtcNow.ToString('o') }
$receiptPath = Join-Path $buildRoot 'build-receipt.json'
$receipt.relativeRenameRepro = $reproResult
$receipt.protocolSmokeExitCode = $smokeExit
$receipt.offlineValidationAccepted = ($smokeExit -eq 0 -and $smokeResult.status -eq 'passed')
$receipt.windowsRuntimeVersion = [Environment]::OSVersion.VersionString
[IO.File]::WriteAllText($receiptPath, ($receipt | ConvertTo-Json -Depth 10), $utf8)
[IO.File]::WriteAllText((Join-Path $buildRoot 'AEAgentSnapshotProbe.aex.sha256'), ($receipt.binarySha256 + '  AEAgentSnapshotProbe.aex' + "`n"), $utf8)
if (!$receipt.offlineValidationAccepted) { throw "Offline protocol smoke failed; binary/source/partial evidence retained at $receiptPath. Reason: $($smokeResult.reason)" }
[ordered]@{ status = 'built_offline'; binary = $binary; sha256 = $receipt.binarySha256; receipt = $receiptPath; protocolChecks = $smokeResult.passed; loadedInAE = $false; readiness = $false } | ConvertTo-Json -Compress
