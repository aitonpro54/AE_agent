[CmdletBinding()]
param(
    [string]$SdkRoot = 'C:\Users\Ant\AppData\Local\AEAgent\SDK\after-effects-26.5\AfterEffectsSDK_26.5_win',
    [string]$MsBuild = 'C:\Users\Ant\AppData\Local\AEAgent\BuildTools2022\MSBuild\Current\Bin\MSBuild.exe',
    [string]$BuildId = ('build-' + [guid]::NewGuid().ToString('N')),
    [switch]$OfflineSmokeOnly
)
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
$sourceRoot = Join-Path $repoRoot 'native\ame-snapshot-service'
$outputParent = Join-Path $repoRoot '.codex-runtime\ame-native-prerequisites\native-service-build'
$archiveSha = 'ad86bd6d66a1e1ffe8471e4618e3de4dbc9679f2ca47ae9bbe69f78805c82960'
$utf8 = [Text.UTF8Encoding]::new($false)
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
function Get-SourceHashes {
    $hashes = @()
    foreach ($file in (Get-ChildItem -LiteralPath $sourceRoot -File | Sort-Object Name)) {
        Assert-NoReparse $file.FullName | Out-Null
        $hashes += [ordered]@{ path = $file.FullName.Substring($repoRoot.Length + 1); sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $file.FullName).Hash.ToLowerInvariant() }
    }
    $hashes += [ordered]@{ path = 'scripts\ame-native-service-build.ps1'; sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $PSCommandPath).Hash.ToLowerInvariant() }
    return $hashes
}
function Hash-Text([string]$Text) {
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($algorithm.ComputeHash($utf8.GetBytes($Text)))).Replace('-', '').ToLowerInvariant() }
    finally { $algorithm.Dispose() }
}
if ($BuildId -notmatch '^build-[a-f0-9]{32}$') { throw 'BuildId must be build- plus 32 lowercase hex characters.' }
$SdkRoot = Assert-NoReparse $SdkRoot
$MsBuild = Assert-NoReparse $MsBuild
$sourceRoot = Assert-NoReparse $sourceRoot
if (!(Test-Path -LiteralPath $MsBuild -PathType Leaf)) { throw 'MSBuild missing; this helper does not install dependencies.' }
$sdkEvidence = @()
foreach ($relativePath in @('Examples\Headers\AEConfig.h', 'Examples\Headers\AE_GeneralPlug.h', 'Examples\Headers\AE_GeneralPlugOld.h', 'Examples\Headers\SP\SPBasic.h', 'Examples\Resources\PiPLtool.exe')) {
    $file = Assert-NoReparse (Join-Path $SdkRoot $relativePath)
    if (!(Test-Path -LiteralPath $file -PathType Leaf)) { throw "External licensed SDK prerequisite missing: $relativePath" }
    $sdkEvidence += [ordered]@{ path = $relativePath; sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $file).Hash.ToLowerInvariant() }
}
$header = Get-Content -LiteralPath (Join-Path $SdkRoot 'Examples\Headers\AE_GeneralPlug.h') -Encoding UTF8 -Raw
if ($header -notmatch 'kAEGPRegisterSuiteVersion5\s+6' -or $header -notmatch 'AEGP_RegisterIdleHook' -or $header -notmatch 'AEGP_RegisterDeathHook') { throw 'Required official registration ABI evidence absent; no fallback suite.' }
$productionText = ''
foreach ($name in @('ame_snapshot_service.cpp', 'service_protocol.cpp', 'service_protocol.h', 'service_win32.cpp', 'service_win32.h')) {
    $productionText += Get-Content -LiteralPath (Join-Path $sourceRoot $name) -Encoding UTF8 -Raw
}
if ($productionText -match '(AE_AGENT_NATIVE_FIXTURE|AE_AGENT_NATIVE_PROBE|fixture_grant\.h|GetEnvironmentVariable|CreateNamedPipe|CreateThread|std::thread|AEGP_Save|AEGP_GetProject|AEGP_GetItem|AEGP_GetComp|AEGP_ExecuteScript|PF_SetProjectDirty|queueInAME|executeCommand|aerender)') {
    throw 'Dormant foundation contains an unexpected fixture dependency, active endpoint/worker or project/export dispatch; review source before build.'
}
if ($productionText -notmatch 'production_authorization_not_implemented' -or $productionText -notmatch 'GetNamedPipeServerProcessId' -or $productionText -notmatch 'GetNamedPipeClientProcessId') { throw 'Authorization gap or endpoint peer-identity seam missing.' }
$sourceHashes = @(Get-SourceHashes)
$sourceDigest = Hash-Text ($sourceHashes | ConvertTo-Json -Depth 4 -Compress)
if (!(Test-Path -LiteralPath $outputParent)) { New-Item -ItemType Directory -Path $outputParent | Out-Null }
$outputParent = Assert-NoReparse $outputParent
$buildRoot = [IO.Path]::GetFullPath((Join-Path $outputParent $BuildId))
if (!$buildRoot.StartsWith($outputParent + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Build path escaped ignored owned root.' }
if (Test-Path -LiteralPath $buildRoot) { throw 'Build root already exists; inspect prior outcome. No replay/reuse of an unknown build.' }
New-Item -ItemType Directory -Path $buildRoot | Out-Null
Assert-NoReparse $buildRoot | Out-Null
$owner = [ordered]@{ schema = 'ae-agent.native-service-build-owner.v1'; buildId = $BuildId; outputRoot = $buildRoot; offline = $true; sourceDigestSha256 = $sourceDigest }
[IO.File]::WriteAllText((Join-Path $buildRoot 'build-owner.json'), ($owner | ConvertTo-Json -Depth 4), $utf8)
$identity = "#pragma once`n#define SNAPSHOT_SERVICE_BUILD_ID `"$BuildId`"`n#define SNAPSHOT_SERVICE_SDK_ARCHIVE_SHA256 `"$archiveSha`"`n"
[IO.File]::WriteAllText((Join-Path $buildRoot 'service_build_identity.h'), $identity, $utf8)
$queryArgs = @((Join-Path $sourceRoot 'OfflineProtocolSmoke.vcxproj'), '/nologo', '/p:Configuration=Release', '/p:Platform=x64', "/p:SdkRoot=$SdkRoot", "/p:ServiceBuildRoot=$buildRoot", '/p:PreferredToolArchitecture=x64', '/getProperty:VCToolsInstallDir,VCToolsVersion,WindowsSdkDir,WindowsTargetPlatformVersion')
$toolchainText = & $MsBuild @queryArgs 2>&1
if ($LASTEXITCODE -ne 0) { throw 'MSBuild toolchain property query failed; no fallback build attempted.' }
$toolchain = ($toolchainText -join "`n") | ConvertFrom-Json
$compiler = Assert-NoReparse (Join-Path $toolchain.Properties.VCToolsInstallDir 'bin\Hostx64\x64\cl.exe')
$linker = Assert-NoReparse (Join-Path $toolchain.Properties.VCToolsInstallDir 'bin\Hostx64\x64\link.exe')
$resourceCompiler = Assert-NoReparse (Join-Path $toolchain.Properties.WindowsSdkDir ("bin\" + $toolchain.Properties.WindowsTargetPlatformVersion + '\x64\rc.exe'))
$toolEvidence = @()
foreach ($file in @($MsBuild, $compiler, $linker, $resourceCompiler)) {
    if (!(Test-Path -LiteralPath $file -PathType Leaf)) { throw 'Resolved toolchain executable missing.' }
    $toolEvidence += [ordered]@{ path = $file; sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $file).Hash.ToLowerInvariant(); fileVersion = (Get-Item -LiteralPath $file).VersionInfo.FileVersion }
}
$projects = @('OfflineProtocolSmoke')
if (!$OfflineSmokeOnly) { $projects += 'AEAgentSnapshotService' }
foreach ($project in $projects) {
    $arguments = @((Join-Path $sourceRoot "$project.vcxproj"), '/nologo', '/m:1', '/t:Build', '/p:Configuration=Release', '/p:Platform=x64', "/p:SdkRoot=$SdkRoot", "/p:ServiceBuildRoot=$buildRoot", '/p:PreferredToolArchitecture=x64', '/v:minimal')
    & $MsBuild @arguments 2>&1 | Tee-Object -FilePath (Join-Path $buildRoot "$project.build.log")
    if ($LASTEXITCODE -ne 0) { throw "Offline build failed ($project); inspect the owned build logs. No AE/install action attempted." }
}
$smokeText = & (Join-Path $buildRoot 'bin\OfflineProtocolSmoke.exe') 2>&1
$smokeExit = $LASTEXITCODE
[IO.File]::WriteAllText((Join-Path $buildRoot 'offline-protocol-smoke.json'), ($smokeText -join "`n"), $utf8)
$smoke = ($smokeText -join "`n") | ConvertFrom-Json
if ($smokeExit -ne 0 -or $smoke.status -ne 'passed' -or !$smoke.offline -or !$smoke.syntheticHostFacts -or $smoke.hostLoaded -or
    $smoke.productionReady -or $smoke.projectWrites -ne 0 -or $smoke.exports -ne 0 -or $smoke.checks -lt 230 -or
    $smoke.authorizationGap -ne 'production_authorization_not_implemented' -or $smoke.scope -notmatch 'Adobe suites/hooks, Win32 peer/receipt helpers NOT executed') {
    throw 'Offline harness failed or misrepresented synthetic validation; retained evidence is not live proof.'
}
$afterHashes = @(Get-SourceHashes)
if (($sourceHashes | ConvertTo-Json -Depth 4 -Compress) -cne ($afterHashes | ConvertTo-Json -Depth 4 -Compress)) { throw 'Source changed during build; provenance unknown. No build id reuse.' }
foreach ($item in $sdkEvidence) {
    if ((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $SdkRoot $item.path)).Hash.ToLowerInvariant() -cne $item.sha256) { throw 'SDK changed during build; provenance unknown.' }
}
foreach ($item in $toolEvidence) {
    if ((Get-FileHash -Algorithm SHA256 -LiteralPath $item.path).Hash.ToLowerInvariant() -cne $item.sha256) { throw 'Toolchain changed during build; provenance unknown.' }
}
$binaryEvidence = @()
foreach ($name in @('OfflineProtocolSmoke.exe', 'AEAgentSnapshotService.aex')) {
    $file = Join-Path $buildRoot ("bin\" + $name)
    if (!(Test-Path -LiteralPath $file)) { continue }
    $bytes = [IO.File]::ReadAllBytes($file)
    if ($bytes.Length -lt 256 -or [Text.Encoding]::ASCII.GetString($bytes, 0, 2) -ne 'MZ') { throw 'Missing PE binary.' }
    $offset = [BitConverter]::ToInt32($bytes, 0x3c)
    if ($offset -lt 0 -or $offset + 26 -gt $bytes.Length -or [BitConverter]::ToUInt32($bytes, $offset) -ne 0x4550 -or
        [BitConverter]::ToUInt16($bytes, $offset + 4) -ne 0x8664 -or [BitConverter]::ToUInt16($bytes, $offset + 24) -ne 0x20b) { throw 'Binary is not Windows x64 PE32+.' }
    if ($name.EndsWith('.aex') -and !([BitConverter]::ToUInt16($bytes, $offset + 22) -band 0x2000)) { throw 'AEX is not a PE DLL.' }
    $binaryEvidence += [ordered]@{ path = $file; sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $file).Hash.ToLowerInvariant() }
}
$receipt = [ordered]@{
    schema = 'ae-agent.native-service-build.v1'; buildId = $BuildId; offline = $true; productionReady = $false
    aexBuilt = (!$OfflineSmokeOnly); installed = $false; loadedInAE = $false; liveSemantics = 'UNVERIFIED'
    authorizationGap = 'production_authorization_not_implemented'; ipcListenerStarted = $false; ipcWorkerStarted = $false
    projectFactsExposed = $false; projectWrites = 0; exports = 0; fixtureProtocolReused = $false
    sourceDigestSha256 = $sourceDigest; sourceFiles = $sourceHashes; sourceHashesStableAcrossBuild = $true
    sdkRoot = $SdkRoot; sdkArchiveSha256 = $archiveSha; archiveHashProvenance = 'supplied prerequisite; archive not rehashed by this helper'
    sdkFiles = $sdkEvidence; toolchain = $toolchain.Properties; tools = $toolEvidence; binaries = $binaryEvidence
    suiteABI = [ordered]@{ register5 = 6 }; offlineProtocolSmoke = $smoke
    bootReceipt = 'untrusted informational OS/module identity; atomic same-held-handle no-replace, fixed KnownFolder user data path; no authority or hostile-same-user-writer claim'
    validationLimits = 'pure C++ synthetic facts; EntryPoint/Adobe/Win32 peer and receipt helpers NOT executed; no build/install/load request is implied'
}
$receiptPath = Join-Path $buildRoot 'build-receipt.json'
[IO.File]::WriteAllText($receiptPath, ($receipt | ConvertTo-Json -Depth 10), $utf8)
[ordered]@{ status = 'built_offline'; buildId = $BuildId; aexBuilt = (!$OfflineSmokeOnly); receipt = $receiptPath; checks = $smoke.checks; productionReady = $false; loadedInAE = $false } | ConvertTo-Json -Compress
