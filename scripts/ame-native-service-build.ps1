[CmdletBinding()]
param(
    [string]$SdkRoot = 'C:\Users\Ant\AppData\Local\AEAgent\SDK\after-effects-26.5\AfterEffectsSDK_26.5_win',
    [string]$MsBuild = 'C:\Users\Ant\AppData\Local\AEAgent\BuildTools2022\MSBuild\Current\Bin\MSBuild.exe',
    [string]$BuildId = ('build-' + [guid]::NewGuid().ToString('N')),
    [string]$IssuerPinPath = '',
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
foreach ($name in @('ame_snapshot_service.cpp', 'service_protocol.cpp', 'service_protocol.h', 'service_win32.cpp', 'service_win32.h', 'service_authorization.cpp', 'service_authorization.h', 'service_crypto.cpp', 'service_crypto.h', 'service_transport.cpp', 'service_transport.h', 'service_inspector.cpp', 'service_inspector.h', 'native_snapshot_adapter.cpp')) {
    $productionText += Get-Content -LiteralPath (Join-Path $sourceRoot $name) -Encoding UTF8 -Raw
}
if ($productionText -match '(AE_AGENT_NATIVE_FIXTURE|AE_AGENT_NATIVE_PROBE|fixture_grant\.h|GetEnvironmentVariable|AEGP_Save|AEGP_Set|PF_SetProjectDirty|queueInAME|executeCommand|aerender)') {
    throw 'Read-only service contains an unexpected fixture dependency, environment bypass or mutation/export dispatch; review source before build.'
}
if ($productionText -notmatch 'signed_purpose_forbidden' -or $productionText -notmatch 'GetNamedPipeServerProcessId' -or $productionText -notmatch 'GetNamedPipeClientProcessId' -or $productionText -notmatch 'default build stays dormant') { throw 'Pinned authorization, endpoint peer identity or default dormant gate missing.' }
$issuerKeyId = ''; $issuerBlobHex = ''; $issuerPinEvidence = $null
if ($IssuerPinPath) {
    $IssuerPinPath = Assert-NoReparse $IssuerPinPath
    if (!(Test-Path -LiteralPath $IssuerPinPath -PathType Leaf) -or (Get-Item -LiteralPath $IssuerPinPath).Length -gt 4096) { throw 'Reviewed public issuer pin file missing or oversized; no provisioning fallback.' }
    $pinText = Get-Content -LiteralPath $IssuerPinPath -Encoding UTF8 -Raw
    $pin = $pinText | ConvertFrom-Json
    $pinFields = @($pin.PSObject.Properties.Name | Sort-Object)
    if (($pinFields -join ',') -cne 'keyId,noAutomaticRegeneration,privateKeyExported,publicBlobHex,schema' -or
        $pin.schema -cne 'ae-agent.snapshot-service.issuer-pin.v2' -or $pin.privateKeyExported -isnot [bool] -or $pin.noAutomaticRegeneration -isnot [bool] -or
        $pin.privateKeyExported -ne $false -or $pin.noAutomaticRegeneration -ne $true -or
        $pin.keyId -cnotmatch '^[a-f0-9]{32}$' -or $pin.publicBlobHex -cnotmatch '^4543533120000000[a-f0-9]{128}$') { throw 'Invalid public-only ECDSA-P256 issuer pin; no key creation or automatic regeneration.' }
    $blob = [byte[]]::new(72)
    for ($i = 0; $i -lt 72; $i++) { $blob[$i] = [Convert]::ToByte($pin.publicBlobHex.Substring($i * 2, 2), 16) }
    $pinHash = [Security.Cryptography.SHA256]::Create()
    try { $derivedId = ([BitConverter]::ToString($pinHash.ComputeHash($blob))).Replace('-', '').ToLowerInvariant().Substring(0, 32) }
    finally { $pinHash.Dispose() }
    if ($derivedId -cne $pin.keyId) { throw 'Issuer key ID does not match public blob hash.' }
    $issuerKeyId = $pin.keyId; $issuerBlobHex = $pin.publicBlobHex
    $issuerPinEvidence = [ordered]@{ path = $IssuerPinPath; sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $IssuerPinPath).Hash.ToLowerInvariant(); keyId = $issuerKeyId }
}
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
$identity = "#pragma once`n#define SNAPSHOT_SERVICE_BUILD_ID `"$BuildId`"`n#define SNAPSHOT_SERVICE_SDK_ARCHIVE_SHA256 `"$archiveSha`"`n#define SNAPSHOT_SERVICE_ISSUER_KEY_ID `"$issuerKeyId`"`n#define SNAPSHOT_SERVICE_ISSUER_PUBLIC_BLOB_HEX `"$issuerBlobHex`"`n"
[IO.File]::WriteAllText((Join-Path $buildRoot 'service_build_identity.h'), $identity, $utf8)
$identityHeaderSha = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $buildRoot 'service_build_identity.h')).Hash.ToLowerInvariant()
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
if (!$OfflineSmokeOnly) { $projects += @('AEAgentSnapshotService', 'NativeSnapshotIssuer', 'NativeSnapshotAdapter') }
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
    $smoke.productionReady -or $smoke.projectWrites -ne 0 -or $smoke.exports -ne 0 -or $smoke.protocolAuthorizationChecks -lt 425 -or
    $smoke.transportChecks -lt 80 -or $smoke.temporaryPipePairs -ne 11 -or !$smoke.actualWin32IpcUnit -or
    $smoke.productionPipeConnected -or $smoke.productionListenerStarted -or $smoke.checks -ne ($smoke.protocolAuthorizationChecks + $smoke.transportChecks) -or
    $smoke.authorizationContract -ne 'issuer_signed_enrollment_inspect_v2' -or !$smoke.genuineCngSignatures -or $smoke.persistedIssuerProvisioned -or
    $smoke.compiledIssuerPinned -ne [bool]$IssuerPinPath -or
    $smoke.productionWorkerStarted -or !$smoke.graphOverflowRefused -or $smoke.scope -notmatch 'actual Win32 IPC/peer helpers on unique own test endpoints only' -or
    $smoke.scope -notmatch 'EntryPoint, Adobe suites/hooks and boot receipt helpers NOT executed') {
    throw 'Offline harness failed or misrepresented synthetic validation; retained evidence is not live proof.'
}
$issuerRefusal = $null; $adapterSmoke = $null
if (!$OfflineSmokeOnly) {
    $issuerText = & (Join-Path $buildRoot 'bin\NativeSnapshotIssuer.exe') 2>&1
    $issuerExit = $LASTEXITCODE; $issuerRefusal = ($issuerText -join "`n") | ConvertFrom-Json
    if ($issuerExit -ne 1 -or $issuerRefusal.status -ne 'refused' -or $issuerRefusal.reason -ne 'explicit_provision_command_required') { throw 'Issuer no-argument command did not refuse before provisioning.' }
    [IO.File]::WriteAllText((Join-Path $buildRoot 'issuer-command-refusal.json'), ($issuerText -join "`n"), $utf8)
    if (!$IssuerPinPath) {
        $nodeCommand = Get-Command node -ErrorAction Stop
        $nodePath = Assert-NoReparse $nodeCommand.Source
        $toolEvidence += [ordered]@{ path = $nodePath; sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $nodePath).Hash.ToLowerInvariant(); fileVersion = (Get-Item -LiteralPath $nodePath).VersionInfo.FileVersion }
        $adapterText = & $nodePath (Join-Path $sourceRoot 'offline_adapter_smoke.js') (Join-Path $buildRoot 'bin\NativeSnapshotAdapter.node') 2>&1
        $adapterExit = $LASTEXITCODE; $adapterSmoke = ($adapterText -join "`n") | ConvertFrom-Json
        [IO.File]::WriteAllText((Join-Path $buildRoot 'offline-adapter-smoke.json'), ($adapterText -join "`n"), $utf8)
        if ($adapterExit -ne 0 -or $adapterSmoke.status -ne 'passed' -or $adapterSmoke.checks -ne 7 -or !$adapterSmoke.nodeAddonLoaded -or
            $adapterSmoke.hostLoaded -or $adapterSmoke.issuerProvisioned -or $adapterSmoke.ipcExchangeAttempted) { throw 'Scoped Node ABI/refusal smoke failed; no retry/install/live fallback.' }
    }
}
if ($issuerPinEvidence -and (Get-FileHash -Algorithm SHA256 -LiteralPath $IssuerPinPath).Hash.ToLowerInvariant() -cne $issuerPinEvidence.sha256) { throw 'Public issuer pin changed during build; provenance unknown.' }
$afterHashes = @(Get-SourceHashes)
if (($sourceHashes | ConvertTo-Json -Depth 4 -Compress) -cne ($afterHashes | ConvertTo-Json -Depth 4 -Compress)) { throw 'Source changed during build; provenance unknown. No build id reuse.' }
if ((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $buildRoot 'service_build_identity.h')).Hash.ToLowerInvariant() -cne $identityHeaderSha) { throw 'Generated identity/pin header changed during build; provenance unknown.' }
foreach ($item in $sdkEvidence) {
    if ((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $SdkRoot $item.path)).Hash.ToLowerInvariant() -cne $item.sha256) { throw 'SDK changed during build; provenance unknown.' }
}
foreach ($item in $toolEvidence) {
    if ((Get-FileHash -Algorithm SHA256 -LiteralPath $item.path).Hash.ToLowerInvariant() -cne $item.sha256) { throw 'Toolchain changed during build; provenance unknown.' }
}
$binaryEvidence = @()
foreach ($name in @('OfflineProtocolSmoke.exe', 'AEAgentSnapshotService.aex', 'NativeSnapshotIssuer.exe', 'NativeSnapshotAdapter.node')) {
    $file = Join-Path $buildRoot ("bin\" + $name)
    if (!(Test-Path -LiteralPath $file)) { continue }
    $bytes = [IO.File]::ReadAllBytes($file)
    if ($bytes.Length -lt 256 -or [Text.Encoding]::ASCII.GetString($bytes, 0, 2) -ne 'MZ') { throw 'Missing PE binary.' }
    $offset = [BitConverter]::ToInt32($bytes, 0x3c)
    if ($offset -lt 0 -or $offset + 26 -gt $bytes.Length -or [BitConverter]::ToUInt32($bytes, $offset) -ne 0x4550 -or
        [BitConverter]::ToUInt16($bytes, $offset + 4) -ne 0x8664 -or [BitConverter]::ToUInt16($bytes, $offset + 24) -ne 0x20b) { throw 'Binary is not Windows x64 PE32+.' }
    if (($name.EndsWith('.aex') -or $name.EndsWith('.node')) -and !([BitConverter]::ToUInt16($bytes, $offset + 22) -band 0x2000)) { throw 'AEX/addon is not a PE DLL.' }
    $binaryEvidence += [ordered]@{ path = $file; sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $file).Hash.ToLowerInvariant() }
}
$receipt = [ordered]@{
    schema = 'ae-agent.native-service-build.v2'; buildId = $BuildId; offline = $true; productionReady = $false
    aexBuilt = (!$OfflineSmokeOnly); installed = $false; loadedInAE = $false; liveSemantics = 'UNVERIFIED'
    authorizationContract = 'issuer_signed_enrollment_inspect_v2'; issuerPinned = [bool]$IssuerPinPath; issuerPin = $issuerPinEvidence
    defaultDormant = (!$IssuerPinPath); persistedIssuerProvisioned = $false; residentListenerStarted = $false; residentWorkerStarted = $false
    projectFactsExposed = $false; projectWrites = 0; exports = 0; fixtureProtocolReused = $false
    sourceDigestSha256 = $sourceDigest; sourceFiles = $sourceHashes; sourceHashesStableAcrossBuild = $true
    generatedIdentityHeaderSha256 = $identityHeaderSha
    sdkRoot = $SdkRoot; sdkArchiveSha256 = $archiveSha; archiveHashProvenance = 'supplied prerequisite; archive not rehashed by this helper'
    sdkFiles = $sdkEvidence; toolchain = $toolchain.Properties; tools = $toolEvidence; binaries = $binaryEvidence
    suiteABI = [ordered]@{ register5 = 6 }; offlineProtocolSmoke = $smoke
    issuerCommandRefusal = $issuerRefusal; offlineAdapterSmoke = $adapterSmoke
    bootReceipt = 'untrusted informational OS/module identity; atomic same-held-handle no-replace, fixed KnownFolder user data path; no authority or hostile-same-user-writer claim'
    actualWin32IpcUnit = $true; temporaryPipePairs = $smoke.temporaryPipePairs; productionPipeConnected = $false; productionListenerStarted = $false
    validationLimits = 'synthetic host/graph; real ephemeral CNG; actual Win32 response ACK/peer unit on unique own temporary pipes only; no resident listener or production pipe; EntryPoint/Adobe/boot receipt NOT executed; no install/load, persisted issuer, manual UI grant or M3 proof'
}
$receiptPath = Join-Path $buildRoot 'build-receipt.json'
[IO.File]::WriteAllText($receiptPath, ($receipt | ConvertTo-Json -Depth 10), $utf8)
[ordered]@{ status = 'built_offline'; buildId = $BuildId; aexBuilt = (!$OfflineSmokeOnly); receipt = $receiptPath; checks = $smoke.checks; productionReady = $false; loadedInAE = $false } | ConvertTo-Json -Compress
