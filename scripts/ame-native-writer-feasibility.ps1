[CmdletBinding()]
param([string]$RunId = ('run-' + [guid]::NewGuid().ToString('N')))
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
$sourceRoot = Join-Path $repoRoot 'native\ame-snapshot-writer-feasibility'
$outputParent = Join-Path $repoRoot '.codex-runtime\ame-native-prerequisites\native-writer-feasibility'
$MsBuild = 'C:\Users\Ant\AppData\Local\AEAgent\BuildTools2022\MSBuild\Current\Bin\MSBuild.exe'
$windowsSdkRoot = 'C:\Program Files (x86)\Windows Kits\10\Include\10.0.26100.0'
$utf8 = [Text.UTF8Encoding]::new($false)
if ($RunId -notmatch '^run-[a-f0-9]{32}$') { throw 'RunId must be run- followed by 32 lowercase hex; no reuse.' }
function Assert-NoReparse([string]$Path) {
    $absolute = [IO.Path]::GetFullPath($Path); $component = $absolute
    while ($component) {
        if ((Test-Path -LiteralPath $component) -and ((Get-Item -LiteralPath $component -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw "Reparse component refused: $component" }
        $parent = Split-Path -Parent $component
        if (!$parent -or $parent -eq $component) { break }; $component = $parent
    }
    return $absolute
}
function Source-Hashes {
    $hashes = @()
    foreach ($file in (Get-ChildItem -LiteralPath $sourceRoot -File | Sort-Object Name)) {
        $hashes += [ordered]@{ path = $file.FullName.Substring($repoRoot.Length + 1); sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $file.FullName).Hash.ToLowerInvariant() }
    }
    $hashes += [ordered]@{ path = 'scripts\ame-native-writer-feasibility.ps1'; sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $PSCommandPath).Hash.ToLowerInvariant() }; return $hashes
}
function New-OwnedBytes([string]$Path, [byte[]]$Bytes) {
    $stream = [IO.FileStream]::new($Path, [IO.FileMode]::CreateNew, [IO.FileAccess]::ReadWrite, [IO.FileShare]::Read, 4096, [IO.FileOptions]::WriteThrough)
    try { $stream.Write($Bytes, 0, $Bytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
}
function Move-OwnedMarker([string]$Source, [string]$Destination) {
    foreach ($path in @($Source,$Destination)) {
        $absolute = Assert-NoReparse $path
        if (!$absolute.StartsWith($runRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Marker move escaped the exact new owned run.' }
    }
    if (!(Test-Path -LiteralPath $Source -PathType Leaf) -or (Test-Path -LiteralPath $Destination)) { throw 'Marker move state changed; no overwrite/replay.' }
    Move-Item -LiteralPath $Source -Destination $Destination
}
function Cpp-String([string]$Value) { return '"' + $Value.Replace('\', '\\').Replace('"', '\"').Replace("`r", '\r').Replace("`n", '\n') + '"' }
function Assert-X64Exe([string]$Path) {
    $bytes = [IO.File]::ReadAllBytes($Path)
    if ($bytes.Length -lt 256 -or [Text.Encoding]::ASCII.GetString($bytes, 0, 2) -ne 'MZ') { throw 'Executable PE prerequisite failed.' }
    $pe = [BitConverter]::ToInt32($bytes, 0x3c)
    if ($pe -lt 0 -or $pe + 26 -gt $bytes.Length -or [BitConverter]::ToUInt32($bytes, $pe) -ne 0x4550 -or [BitConverter]::ToUInt16($bytes, $pe + 4) -ne 0x8664 -or
        ([BitConverter]::ToUInt16($bytes, $pe + 22) -band 0x2000) -or [BitConverter]::ToUInt16($bytes, $pe + 24) -ne 0x20b) { throw 'Only an own Windows AMD64 PE32+ EXE can run.' }
}
function Tree-Hashes([string]$Root) {
    return @(Get-ChildItem -LiteralPath $Root -Recurse -Force | Sort-Object FullName | ForEach-Object {
        if ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Guard tree contains reparse metadata; terminal.' }
        [ordered]@{ path = $_.FullName.Substring($Root.Length + 1); kind = $(if ($_.PSIsContainer) { 'directory' } else { 'file' }); sha256 = $(if ($_.PSIsContainer) { '' } else { (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant() }) }
    })
}
function Guard-Case([string]$Name, [string]$Exe, [string]$ExpectedOperation, [int[]]$ExpectedCodes, [string[]]$AclPaths) {
    $before = @(Tree-Hashes $runRoot); $aclBefore = @($AclPaths | ForEach-Object { (Get-Acl -LiteralPath $_).Sddl })
    $output = & $Exe 2>&1 # No native arguments and no valid AppContainer execution.
    $exit = $LASTEXITCODE; $text = $output -join "`n"
    $after = @(Tree-Hashes $runRoot); $aclAfter = @($AclPaths | ForEach-Object { (Get-Acl -LiteralPath $_).Sddl })
    if (($before | ConvertTo-Json -Depth 4 -Compress) -cne ($after | ConvertTo-Json -Depth 4 -Compress)) { throw "Native guard wrote a file ($Name); no replay." }
    if (($aclBefore | ConvertTo-Json -Compress) -cne ($aclAfter | ConvertTo-Json -Compress)) { throw "Native guard changed an ACL ($Name); no replay." }
    New-OwnedBytes (Join-Path $runRoot "$Name.stdout.json") ($utf8.GetBytes($text))
    $observed = $text | ConvertFrom-Json
    if ($exit -ne 10 -or $observed.schema -ne 'ae-agent.writer-feasibility-guard-refusal.v1' -or $observed.outcome -ne 'early_refusal' -or
        $observed.errorOperation -ne $ExpectedOperation -or $observed.errorCode -notin $ExpectedCodes) { throw "Unexpected early guard result ($Name); retain evidence, no replay." }
    foreach ($counter in @('nativeFileWrites','profileCreateCalls','aclMutationCalls','childCreateCalls','privateOutputWrites','setThreadTokenCalls','aepWriteDispatches')) {
        if ($observed.$counter -ne 0) { throw "Effects were reported by guard ($Name/$counter); no replay." }
    }
    return [ordered]@{ name = $Name; nativeExitCode = $exit; observed = $observed; treeHashesIdentical = $true; aclSddlIdentical = $true; entriesCompared = $before.Count }
}
$MsBuild = Assert-NoReparse $MsBuild
if (!(Test-Path -LiteralPath $MsBuild -PathType Leaf)) { throw 'Existing toolchain unavailable; no installer/fallback.' }
Assert-NoReparse $windowsSdkRoot | Out-Null
$sourceHashes = @(Source-Hashes)
if (!(Test-Path -LiteralPath $outputParent)) { New-Item -ItemType Directory -Path $outputParent | Out-Null }
$outputParent = Assert-NoReparse $outputParent; $runRoot = [IO.Path]::GetFullPath((Join-Path $outputParent $RunId))
if (!$runRoot.StartsWith($outputParent + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Run escaped the owned ignored root.' }
if (Test-Path -LiteralPath $runRoot) { throw 'Run already exists; inspect prior outcome. No replay/attachment.' }
New-Item -ItemType Directory -Path $runRoot | Out-Null; Assert-NoReparse $runRoot | Out-Null
$nonce = $RunId.Substring(4); $ownerPath = Join-Path $runRoot 'run-owner.json'; $headerPath = Join-Path $runRoot 'feasibility_identity.h'
$owner = [ordered]@{ schema = 'ae-agent.writer-feasibility-owner.v2'; runId = $RunId; nonce = $nonce; offline = $true; production = $false; aepWritesAllowed = $false; outputRoot = $runRoot; noReplay = $true; timestampUtc = [DateTime]::UtcNow.ToString('o') }
$ownerJson = ($owner | ConvertTo-Json -Depth 4 -Compress) + "`n"
New-OwnedBytes $ownerPath ($utf8.GetBytes($ownerJson))
$ownerHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $ownerPath).Hash.ToLowerInvariant()
$ownerRead = [IO.FileStream]::new($ownerPath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
$headerRead = $null
$baseHeader = "#pragma once`n#define FEASIBILITY_NONCE $(Cpp-String $nonce)`n#define FEASIBILITY_OWNED_ROOT $(Cpp-String $runRoot)`n#define FEASIBILITY_OWNER_MARKER_SHA256 $(Cpp-String $ownerHash)`n#define FEASIBILITY_OWNER_MARKER_JSON $(Cpp-String $ownerJson)`n"
try {
    New-OwnedBytes $headerPath ($utf8.GetBytes($baseHeader))
    foreach ($project in @('TokenHolder', 'OfflineProbe')) {
        $arguments = @((Join-Path $sourceRoot "$project.vcxproj"), '/nologo', '/m:1', '/t:Build', '/p:Configuration=Release', '/p:Platform=x64', "/p:FeasibilityRunRoot=$runRoot", '/p:PreferredToolArchitecture=x64', '/v:minimal')
        & $MsBuild @arguments 2>&1 | Tee-Object -FilePath (Join-Path $runRoot "$project.build.log")
        if ($LASTEXITCODE -ne 0) { throw "Own C++ build failed ($project); no native guard ran. This run id cannot be reused." }
        if ($project -eq 'TokenHolder') {
            $holderHash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $runRoot 'TokenHolder.exe')).Hash.ToLowerInvariant()
            [IO.File]::WriteAllText($headerPath, ($baseHeader + "#define FEASIBILITY_TOKEN_HOLDER_SHA256 $(Cpp-String $holderHash)`n"), $utf8)
        }
    }
    $binaryHashes = @()
    foreach ($name in @('OfflineProbe.exe', 'TokenHolder.exe')) {
        $path = Join-Path $runRoot $name; Assert-X64Exe $path
        $binaryHashes += [ordered]@{ name = $name; path = $path; sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash.ToLowerInvariant(); machine = 'AMD64'; type = 'PE32+ EXE'; runtime = 'static MSVC /MT' }
    }
    $generatedHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $headerPath).Hash.ToLowerInvariant()
    $headerRead = [IO.FileStream]::new($headerPath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
    $guards = @(); $nativeExe = Join-Path $runRoot 'OfflineProbe.exe'; $holderExe = Join-Path $runRoot 'TokenHolder.exe'
    $copyParent = Join-Path $runRoot 'guard-copy'; $copyRoot = Join-Path $copyParent $RunId
    New-Item -ItemType Directory -Path $copyRoot | Out-Null; Assert-NoReparse $copyRoot | Out-Null
    foreach ($name in @('OfflineProbe.exe','TokenHolder.exe','run-owner.json')) { Copy-Item -LiteralPath (Join-Path $runRoot $name) -Destination (Join-Path $copyRoot $name) }
    $guards += Guard-Case 'copied-root' (Join-Path $copyRoot 'OfflineProbe.exe') 'compiled_owned_root_mismatch' @(13) @($runRoot,$holderExe,$copyRoot,(Join-Path $copyRoot 'TokenHolder.exe'))
    $ownerRead.Dispose(); $ownerRead = $null
    $originalMarker = Join-Path $runRoot 'guard-original-owner.json'; $changedMarker = Join-Path $runRoot 'guard-changed-owner.json'
    Move-OwnedMarker $ownerPath $originalMarker
    $guards += Guard-Case 'missing-marker' $nativeExe 'compiled_owner_marker_open' @(2) @($runRoot,$holderExe)
    New-OwnedBytes $ownerPath ($utf8.GetBytes("changed own marker, no nonce`n"))
    $guards += Guard-Case 'changed-marker' $nativeExe 'compiled_owner_marker_hash_or_nonce_mismatch' @(13) @($runRoot,$holderExe)
    Move-OwnedMarker $ownerPath $changedMarker; Move-OwnedMarker $originalMarker $ownerPath
    if ((Get-FileHash -Algorithm SHA256 -LiteralPath $ownerPath).Hash.ToLowerInvariant() -ne $ownerHash) { throw 'Original marker changed; no next native execution.' }
    $ownerRead = [IO.FileStream]::new($ownerPath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
    # Parent-owned durable terminal seal: the final native check must refuse this
    # claim. No valid native admission/AppContainer experiment is executed here.
    $claimPath = Join-Path $runRoot 'execution.attempt.json'
    New-OwnedBytes $claimPath ($utf8.GetBytes('{"schema":"ae-agent.writer-feasibility-guard-terminal-seal.v1","noReplay":true}'))
    $claimHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $claimPath).Hash.ToLowerInvariant()
    $guards += Guard-Case 'existing-claim' $nativeExe 'native_single_use_claim_create_new' @(80,183) @($runRoot,$holderExe)
    if ((Get-FileHash -Algorithm SHA256 -LiteralPath $claimPath).Hash.ToLowerInvariant() -ne $claimHash) { throw 'Existing claim changed; terminal.' }
    $afterHashes = @(Source-Hashes)
    if (($sourceHashes | ConvertTo-Json -Depth 4 -Compress) -cne ($afterHashes | ConvertTo-Json -Depth 4 -Compress)) { throw 'Source changed during guard build; preserve outcome, no replay.' }
    if ((Get-FileHash -Algorithm SHA256 -LiteralPath $headerPath).Hash.ToLowerInvariant() -ne $generatedHash) { throw 'Compiled binding changed; no replay.' }
    $priorPath = Join-Path $outputParent 'run-ae6c99d7aabe41a4a2dadedd608e7421\build-receipt.json'; $priorEvidence = $null
    if (Test-Path -LiteralPath $priorPath -PathType Leaf) {
        $prior = Get-Content -LiteralPath $priorPath -Encoding UTF8 -Raw | ConvertFrom-Json
        $priorEvidence = [ordered]@{ path = $priorPath; sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $priorPath).Hash.ToLowerInvariant(); runId = $prior.runId; observedOutcome = $prior.observedOutcome; sourceFiles = $prior.sourceFiles; appliesToCurrentSource = $false }
    }
    $sdkHashes = @(); foreach ($relative in @('um\winbase.h','um\securitybaseapi.h','um\userenv.h','um\aclapi.h')) {
        $sdkHashes += [ordered]@{ path = $relative; sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $windowsSdkRoot $relative)).Hash.ToLowerInvariant() }
    }
    $receipt = [ordered]@{ schema = 'ae-agent.native-writer-feasibility-guards.v2'; runId = $RunId; offline = $true; terminal = $true; noReplay = $true; guardOnly = $true; validAppContainerExperimentExecuted = $false; readiness = $false; production = $false; snapshotWriterReady = $false; aepWriteDispatches = 0; rootMetadataIsolation = 'UNVERIFIED'; trustModel = 'trusted backend and stable full root/ancestors; no hostile namespace isolation claim'; compiledOwnedRoot = $runRoot; ownerMarkerSha256 = $ownerHash; generatedBindingSha256 = $generatedHash; existingTerminalClaimSha256 = $claimHash; sourceFiles = $sourceHashes; sourceHashesStableAcrossRun = $true; binaries = $binaryHashes; msbuildVersion = (Get-Item -LiteralPath $MsBuild).VersionInfo.FileVersion; windowsSdk = '10.0.26100.0'; windowsSdkHeaders = $sdkHashes; windowsRuntimeVersion = [Environment]::OSVersion.VersionString; guards = $guards; priorVersionAclEvidence = $priorEvidence; timestampUtc = [DateTime]::UtcNow.ToString('o') }
    $receiptPath = Join-Path $runRoot 'build-receipt.json'; New-OwnedBytes $receiptPath ($utf8.GetBytes(($receipt | ConvertTo-Json -Depth 20)))
    [ordered]@{ status = 'guard_evidence_recorded'; runId = $RunId; guardsPassed = $guards.Count; nativeWrites = 0; profileCreates = 0; aclMutations = 0; validAppContainerExperimentExecuted = $false; terminal = $true; receipt = $receiptPath; readiness = $false } | ConvertTo-Json -Compress
} finally { if ($ownerRead) { $ownerRead.Dispose() }; if ($headerRead) { $headerRead.Dispose() } }
