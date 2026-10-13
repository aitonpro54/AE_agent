#requires -Version 5.1
[CmdletBinding()]
param(
    [switch]$ValidateSource,
    [switch]$PrepareSyntheticFixture,
    [switch]$BuildOnly,
    [switch]$RunSyntheticProof,
    [switch]$RunInstalledSyntheticBaseline,
    [switch]$RunInstalledSyntheticNegativeProof,
    [ValidateSet('controller_invalid_frame','creator_wrong_ack','ordinary_fixture_dot','ordinary_fixture_space')]
    [string]$NegativeCase='controller_invalid_frame',
    [switch]$ParentSourceGo,
    [string]$FixtureRoot,
    [string]$ReviewedProfileHeader,
    [string]$OutputDirectory,
    [string]$BrokerExecutable,
    [ValidateSet('launch_eof','preadmission_eof','actor_singleton','early_exit','lost_boot_ack','session_expiry','bridge_omitted','bridge_replaced')]
    [string]$Scenario='launch_eof',
    [ValidateRange(1,10000)]
    [int]$ExpectedSessionMs=2000
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$actions=[int]$ValidateSource.IsPresent+[int]$PrepareSyntheticFixture.IsPresent+[int]$BuildOnly.IsPresent+[int]$RunSyntheticProof.IsPresent+[int]$RunInstalledSyntheticBaseline.IsPresent+[int]$RunInstalledSyntheticNegativeProof.IsPresent
if($actions-ne 1){throw 'Выберите одно точное действие. Скрипт не имеет default build/run.'}
$repoRoot=Split-Path -Parent $PSScriptRoot
$ownedSource=@('native/owned-runtime-local-session/enrollment_win32.h','native/owned-runtime-local-session/enrollment_win32.cpp','native/owned-runtime-local-session/local_session_win32.h','native/owned-runtime-local-session/local_session_win32.cpp','native/owned-runtime-local-session/original_daemon_win32.h','native/owned-runtime-local-session/original_daemon_win32.cpp','native/owned-runtime-local-session/local_session_main.cpp','native/owned-runtime-local-session/LocalSessionBroker.vcxproj','native/owned-runtime-initial-fence/fence_win32.h','native/owned-runtime-initial-fence/fence_win32.cpp','native/owned-runtime-initial-durability/store_win32.h','native/owned-runtime-initial-durability/store_win32.cpp','scripts/owned-runtime-local-session-proof.ps1','scripts/owned-runtime-local-session-profile.ps1','scripts/owned-runtime-local-session-negative-proof.ps1')
$sourcePins=@($ownedSource|ForEach-Object{$file=Join-Path $repoRoot $_;[pscustomobject]@{name=$_;sha256=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()}})
if($ValidateSource){
    $parseTokens=$null;$parseErrors=$null
    [void][System.Management.Automation.Language.Parser]::ParseFile($PSCommandPath,[ref]$parseTokens,[ref]$parseErrors)
    if($parseErrors.Count){throw ($parseErrors|Out-String)}
    [void][System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'owned-runtime-local-session-negative-proof.ps1'),[ref]$parseTokens,[ref]$parseErrors)
    if($parseErrors.Count){throw ($parseErrors|Out-String)}
    [void][System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'owned-runtime-local-session-profile.ps1'),[ref]$parseTokens,[ref]$parseErrors)
    if($parseErrors.Count){throw ($parseErrors|Out-String)}
    $projectPath=Join-Path $repoRoot 'native/owned-runtime-local-session/LocalSessionBroker.vcxproj'
    [xml]$project=[System.IO.File]::ReadAllText($projectPath)
    if($project.Project.DefaultTargets-ne 'Build'){throw 'Неизвестный XML project contract.'}
    $definitions=[string]$project.Project.ItemDefinitionGroup.ClCompile.PreprocessorDefinitions
    if($definitions-notmatch '(^|;)AE_AGENT_LOCAL_SESSION_INSTALLED_SEAMS=1(;|$)'-or $definitions-match 'PREREQUISITE_TEST_ONLY'){throw 'Installed и test-only compiler profiles смешаны.'}
    foreach($relative in $ownedSource){
        $text=[System.IO.File]::ReadAllText((Join-Path $repoRoot $relative))
        if($text-match '(?m)[ \t]+\r?$'){throw "Trailing whitespace: $relative"}
        if($text-match '(?m)^(?:<<<<<<< |=======\r?$|>>>>>>> )'){throw "Conflict marker: $relative"}
    }
    [pscustomobject]@{scope='local_session_source_only';sourceBlock='L3c1_original_creator_pin_handshake';ok=$true;powerShellAst=$true;projectXml=$true;whitespace=$true;nativeBuild=$false;nativeExecuted=$false;productionReady=$false;nativeMatrix='NOT_RUN';sourcePins=$sourcePins}|ConvertTo-Json -Depth 5
    return
}
if(-not $ParentSourceGo){throw 'Build/provision/proof выполняет parent после точного source GO; это технический gate скрипта.'}
if($RunInstalledSyntheticNegativeProof){
    if($FixtureRoot-or $ReviewedProfileHeader-or $OutputDirectory-or $BrokerExecutable-or $Scenario-ne 'launch_eof'-or $PSBoundParameters.ContainsKey('ExpectedSessionMs')){throw 'Installed negatives имеют closed fixed cases; runtime selectors запрещены.'}
    . (Join-Path $PSScriptRoot 'owned-runtime-local-session-profile.ps1')
    . (Join-Path $PSScriptRoot 'owned-runtime-local-session-negative-proof.ps1')
    Invoke-LocalSessionInstalledNegativeProof -Case $NegativeCase
    return
}
if($PSBoundParameters.ContainsKey('NegativeCase')){throw 'NegativeCase доступен только в named installed-negative action.'}
if($RunInstalledSyntheticBaseline){
    if($FixtureRoot-or $ReviewedProfileHeader-or $OutputDirectory-or $BrokerExecutable-or $Scenario-ne 'launch_eof'-or $PSBoundParameters.ContainsKey('ExpectedSessionMs')){throw 'Installed baseline имеет один fixed synthetic profile; runtime selectors запрещены.'}
    . (Join-Path $PSScriptRoot 'owned-runtime-local-session-profile.ps1')
    Invoke-LocalSessionInstalledBaseline
    return
}
$scratchBase=[System.IO.Path]::GetFullPath((Join-Path $repoRoot '.codex-runtime/local-session-proof'))
function Assert-Scratch([string]$candidate){
    if([string]::IsNullOrWhiteSpace($candidate)){throw 'Нужен явный own scratch path.'}
    $full=[System.IO.Path]::GetFullPath($candidate)
    if(-not $full.StartsWith($scratchBase+[System.IO.Path]::DirectorySeparatorChar,[System.StringComparison]::OrdinalIgnoreCase)){throw 'Target вне own local-session-proof namespace.'}
    if($full-eq $scratchBase){throw 'Target должен быть отдельным run directory.'}
    return $full
}
$fixture=Assert-Scratch $FixtureRoot
$fixtureScript=Join-Path $fixture 'mcp-server/bridge-daemon.js'
$fixtureMarker=Join-Path $fixture 'synthetic-fixture.scope'
if($PrepareSyntheticFixture){
    if(Test-Path -LiteralPath $fixture){throw 'Existing/unknown fixture нельзя provision повторно; сначала parent read-back.'}
    [void][System.IO.Directory]::CreateDirectory((Join-Path $fixture 'mcp-server'))
    [void][System.IO.Directory]::CreateDirectory((Join-Path $fixture 'initial-local'))
    $syntheticSource=@'
"use strict";
// Isolated synthetic daemon only. No AE/CEP/network/provider imports or calls.
const net=require("node:net"),fs=require("node:fs"),path=require("node:path");
const events=path.join(__dirname,"..","synthetic-events.jsonl");
const scenario=fs.readFileSync(path.join(__dirname,"..","synthetic-fixture.scope"),"utf8").trim();
function event(kind,extra={}){fs.appendFileSync(events,JSON.stringify({kind,pid:process.pid,...extra})+"\n",{flag:"a"});}
function raw(name){const text=process.env[name];if(!/^[0-9a-f]{32}$/.test(text||""))throw Error("exact private nonce required");return Buffer.from(text,"hex");}
const nonce=raw("AE_AGENT_LOCAL_SESSION_NONCE"),generation=raw("AE_AGENT_LOCAL_SESSION_GENERATION"),boot=raw("AE_AGENT_LOCAL_SESSION_BOOT");
const locator=process.env.AE_AGENT_LOCAL_SESSION_PIPE;
if(!/^\\\\\.\\pipe\\AEAgent\.LocalSession\.[0-9a-f]{64}\.daemon\.[0-9a-f]{32}$/.test(locator||""))throw Error("private fixed pipe required");
event("creation");if(scenario==="early_exit")process.exit(23);
const peer=net.connect(locator);let ordinal=0n;
function send(verb,reference=Buffer.alloc(16),digest=Buffer.alloc(32),epoch=0n,mask=0){const frame=Buffer.alloc(128);frame.write("LCSB",0,"ascii");frame.writeUInt16LE(2,4);frame.writeUInt16LE(verb,6);frame.writeBigUInt64LE(++ordinal,8);nonce.copy(frame,16);generation.copy(frame,32);boot.copy(frame,48);reference.copy(frame,64);digest.copy(frame,80);frame.writeBigUInt64LE(epoch,112);frame.writeUInt32LE(mask,120);peer.write(frame);event("sent",{verb});}
peer.on("connect",()=>{event("connected");if(scenario==="lost_boot_ack")return;send(17);setTimeout(()=>send(18,undefined,undefined,1n,127),30);if(scenario==="actor_singleton"){setTimeout(()=>send(19,Buffer.alloc(16,1),Buffer.alloc(32,2)),60);setTimeout(()=>send(19,Buffer.alloc(16,3),Buffer.alloc(32,4)),120);}});
peer.on("error",error=>{event("pipe_error",{code:error.code});process.exitCode=24;});
peer.on("close",()=>{event("closed");process.exit(0);});
// The fixture remains alive until original broker abort/exit. No reconnect/replay.
setInterval(()=>{},1000);
'@
    [System.IO.File]::WriteAllText($fixtureScript,$syntheticSource,(New-Object System.Text.UTF8Encoding $false))
    [System.IO.File]::WriteAllText($fixtureMarker,$Scenario,(New-Object System.Text.UTF8Encoding $false))
    if($Scenario-eq 'bridge_omitted'){
        [System.IO.File]::WriteAllText((Join-Path $fixture 'README.txt'),'Omission fixture: reviewed profile pins this file and deliberately omits bridge-daemon.js.',(New-Object System.Text.UTF8Encoding $false))
    }
    [pscustomobject]@{scope='isolated_synthetic_fixture';productionAuthority=$false;fixtureRoot=$fixture;scriptSha256=(Get-FileHash -LiteralPath $fixtureScript -Algorithm SHA256).Hash.ToLowerInvariant();next='Parent captures independently held canonical ancestor/FileID/SID/Node/controller/source pins; embeds one reviewed profile; native --enroll-fixed; original created pins read-back and final reviewed broker build. No records are written by Node/PowerShell.'}|ConvertTo-Json
    return
}
if(-not (Test-Path -LiteralPath $fixtureScript)-or -not (Test-Path -LiteralPath $fixtureMarker)){throw 'Нет exact synthetic fixture.'}
if([System.IO.File]::ReadAllText($fixtureMarker)-ne $Scenario){throw 'Scenario drift; new reviewed own fixture required.'}
$syntheticText=[System.IO.File]::ReadAllText($fixtureScript)
if(-not $syntheticText.Contains('Isolated synthetic daemon only.')-or $syntheticText.Contains('after_effects')){throw 'Fixed synthetic script contract refused.'}
if($BuildOnly){
    $output=Assert-Scratch $OutputDirectory
    if(-not (Test-Path -LiteralPath $ReviewedProfileHeader)){throw 'Missing reviewed embedded profile.'}
    $profile=[System.IO.Path]::GetFullPath($ReviewedProfileHeader)
    if([System.IO.Path]::GetFileName($profile)-ne 'local_session_installation_pins.h'){throw 'Exact private header basename required.'}
    $msbuild='C:/Program Files (x86)/Microsoft Visual Studio/2022/BuildTools/MSBuild/Current/Bin/MSBuild.exe'
    if(-not (Test-Path -LiteralPath $msbuild)){throw 'Pinned MSBuild unavailable; no fallback.'}
    $project=Join-Path $repoRoot 'native/owned-runtime-local-session/LocalSessionBroker.vcxproj'
    & $msbuild $project /nologo /m:1 /p:Configuration=Release /p:Platform=x64 /p:LocalSessionInstalledSeamsReviewed=true "/p:LocalSessionPinsDir=$([System.IO.Path]::GetDirectoryName($profile))" "/p:LocalSessionOutputDir=$output"
    if($LASTEXITCODE-ne 0){throw "Native build failed: $LASTEXITCODE"}
    [pscustomobject]@{scope='isolated_synthetic_build';sourcePins=$sourcePins;profileSha256=(Get-FileHash -LiteralPath $profile -Algorithm SHA256).Hash.ToLowerInvariant();productionReady=$false;nativeExecuted=$false}|ConvertTo-Json -Depth 5
    return
}
# Runtime mode requires an already enrolled, parent-pinned isolated profile. This
# script does not invent FileIDs/floor/history, invoke enrollment, or edit headers.
$exe=Assert-Scratch $BrokerExecutable
if(-not (Test-Path -LiteralPath $exe)){throw 'Reviewed broker executable missing.'}
$eventsPath=Join-Path $fixture 'synthetic-events.jsonl'
if(Test-Path -LiteralPath $eventsPath){throw 'Existing daemon events make this fixture ambiguous; no replay/reprovision.'}
if($Scenario-eq 'session_expiry'){
    if(-not (Test-Path -LiteralPath $ReviewedProfileHeader)){throw 'Expiry proof requires exact reviewed short-session header.'}
    $profileSource=[System.IO.File]::ReadAllText([System.IO.Path]::GetFullPath($ReviewedProfileHeader))
    if($profileSource-notmatch ("maximumSessionMs\s*=\s*"+$ExpectedSessionMs+"\s*;")){throw 'Expected session duration is not the literal embedded reviewed fixture duration.'}
}
if($Scenario-eq 'bridge_replaced'){
    # One original ordinary-file replacement on the own synthetic fixture before
    # broker open. Preserve the old file; never repeat an unknown rename/create.
    $parkedScript=Assert-Scratch ($fixtureScript+'.before-replacement')
    if(Test-Path -LiteralPath $parkedScript){throw 'Replacement was already attempted; read-back only.'}
    $originalBytes=[System.IO.File]::ReadAllBytes($fixtureScript)
    [System.IO.File]::Move($fixtureScript,$parkedScript)
    $replacement=[System.IO.File]::Open($fixtureScript,[System.IO.FileMode]::CreateNew,[System.IO.FileAccess]::Write,[System.IO.FileShare]::Read)
    try{$replacement.Write($originalBytes,0,$originalBytes.Length);$replacement.Flush($true)}finally{$replacement.Dispose()}
}
$processInfo=New-Object System.Diagnostics.ProcessStartInfo
$processInfo.FileName=$exe;$processInfo.Arguments='--broker';$processInfo.UseShellExecute=$false;$processInfo.CreateNoWindow=$true;$processInfo.RedirectStandardOutput=$true;$processInfo.RedirectStandardError=$true
$originalBroker=New-Object System.Diagnostics.Process
$originalBroker.StartInfo=$processInfo
if(-not $originalBroker.Start()){throw 'Broker creation failed; no retry.'}
$originalBrokerBirth=$originalBroker.StartTime.ToUniversalTime().ToString('o')
$lineTask=$originalBroker.StandardOutput.ReadLineAsync()
if(-not $lineTask.Wait(10000)){throw 'Broker locator UNKNOWN; preserve exact child/scratch, no replay.'}
$locator=$lineTask.Result|ConvertFrom-Json
if($Scenario-eq 'bridge_omitted'-or $Scenario-eq 'bridge_replaced'){
    $expectedCode=if($Scenario-eq 'bridge_omitted'){'mandatory_bridge_entry_missing'}else{'original_identity_changed'}
    if($locator.schema-ne 'ae-agent.local-broker.result.v2'-or $locator.ok-ne $false-or $locator.code-ne $expectedCode){throw 'Expected mandatory source early refusal before launcher; no retry.'}
    if(-not $originalBroker.WaitForExit(5000)-or $originalBroker.ExitCode-ne 2){throw 'Original refusal child exit not proven.'}
    if(Test-Path -LiteralPath $eventsPath){throw 'Synthetic target event after mandatory bridge refusal.'}
    [pscustomobject]@{scope='isolated_synthetic_local_session';productionAuthority=$false;productionReady=$false;scenario=$Scenario;status='PASS';evidence=@{code=$expectedCode;originalBrokerBirth=$originalBrokerBirth;heldOriginalBrokerExit=$true;launcherNotEntered=$true;sourceBranch='Enrollment Bases/OpenFile refusal precedes factory and OriginalDaemon::Launch';daemonEventsAbsent=$true};sourcePins=$sourcePins;remainingNativeMatrix='UNVERIFIED';cleanup='Own scratch and original/replacement files preserved.'}|ConvertTo-Json -Depth 6
    return
}
if($locator.schema-ne 'ae-agent.local-broker.locator.v2'-or $locator.genuineChatIdentity-ne $false-or $locator.executionAdmission-ne $false){throw 'Broker closed before fixture channel.'}
$pipeName=$locator.pipe.Substring('\\.\pipe\'.Length)
$channel=New-Object System.IO.Pipes.NamedPipeClientStream('.', $pipeName,[System.IO.Pipes.PipeDirection]::InOut,[System.IO.Pipes.PipeOptions]::Asynchronous)
$channel.Connect(5000);$channel.ReadMode=[System.IO.Pipes.PipeTransmissionMode]::Message
function Convert-Nonce([string]$hex){if($hex-notmatch '^[0-9a-f]{32}$'){throw 'Exact private nonce required.'};$bytes=New-Object byte[] 16;for($i=0;$i-lt 16;$i++){$bytes[$i]=[Convert]::ToByte($hex.Substring($i*2,2),16)};return ,$bytes}
$nonce=Convert-Nonce $locator.nonce
$ordinal=[UInt64]0
function Invoke-PrivateController([UInt16]$verb){
    $script:ordinal++
    $frame=New-Object byte[] 128
    [System.Text.Encoding]::ASCII.GetBytes('LCSB').CopyTo($frame,0)
    [BitConverter]::GetBytes([UInt16]2).CopyTo($frame,4);[BitConverter]::GetBytes($verb).CopyTo($frame,6);[BitConverter]::GetBytes($script:ordinal).CopyTo($frame,8);$nonce.CopyTo($frame,16)
    $channel.Write($frame,0,$frame.Length)
    $reply=New-Object byte[] 128;$read=$channel.ReadAsync($reply,0,$reply.Length)
    if(-not $read.Wait(5000)-or $read.Result-ne 128){throw 'Private send/read UNKNOWN; no replay.'}
    if([BitConverter]::ToUInt16($reply,4)-ne 2-or [BitConverter]::ToUInt16($reply,6)-ne $verb-or [BitConverter]::ToUInt64($reply,8)-ne $script:ordinal){throw 'Closed reply mismatch.'}
    return [BitConverter]::ToUInt64($reply,112)
}
$rows=New-Object System.Collections.Generic.List[object]
$sessionWatch=[System.Diagnostics.Stopwatch]::StartNew()
$open=Invoke-PrivateController 1
if($open-ne 1){throw 'Expected SESSION_OPEN.'}
$rows.Add([pscustomobject]@{id='original_controller_channel_open';status='PASS';evidence='OS peer pinned by broker, exact v2 frame and original channel'})
if($Scenario-ne 'preadmission_eof'){
    $held=Invoke-PrivateController 2
    if($held-ne 3){throw 'Expected TARGET_HELD; no resend.'}
    $rows.Add([pscustomobject]@{id='durable_consumption_before_original_creation';status='PASS';evidence='TARGET_HELD after native AppendOnce and returned original HANDLEs'})
    Start-Sleep -Milliseconds 250
    if(-not $originalBroker.HasExited){[void](Invoke-PrivateController 3)}
}
if($Scenario-eq 'session_expiry'){
    # Keep the same process/channel alive. Only the native immutable session clock
    # expires: previous implementation stranded the target at this exact point.
    if(-not $originalBroker.WaitForExit($ExpectedSessionMs+7000)){throw 'Session expired but original target disposition remained UNKNOWN; no stop/relaunch.'}
    if($originalBroker.ExitCode-ne 0-or $sessionWatch.ElapsedMilliseconds-lt $ExpectedSessionMs){throw 'Expected original-target exit after session expiry through independent prepared grant.'}
    if(-not (Test-Path -LiteralPath $eventsPath)){throw 'No synthetic original target creation evidence.'}
    $events=@([System.IO.File]::ReadAllLines($eventsPath)|ForEach-Object{$_|ConvertFrom-Json})
    if(@($events|Where-Object{$_.kind-eq 'creation'}).Count-ne 1){throw 'Expected exactly one synthetic creation; no replacement.'}
    $newLaunchRefused=$false
    try{[void](Invoke-PrivateController 2)}catch{$newLaunchRefused=$true}
    if(-not $newLaunchRefused){throw 'New launch was acknowledged after session expiry.'}
    $rows.Add([pscustomobject]@{id='session_expiry_original_target_disposition';status='PASS';evidence='Original channel kept alive; native broker exited after original session clock via separate fixed disposition grace; one target creation.'})
    $rows.Add([pscustomobject]@{id='session_expiry_new_launch_closed';status='PASS';evidence='Single post-expiry request refused; no retry and exactly one target creation.'})
    $rows.Add([pscustomobject]@{id='session_expiry_new_ae_read_closed';status='UNVERIFIED';evidence='L4 READ/ReadAuthorization ports remain unavailable; native STATUS is factual broker status, not an AE READ.'})
}
$channel.Dispose() # EOF closes only new controller work; broker retains lifecycle.
if(-not $originalBroker.WaitForExit(10000)){throw 'Original broker/target disposition UNKNOWN; no stop/relaunch/cleanup.'}
$rows.Add([pscustomobject]@{id="${Scenario}_original_broker_exit";status=$(if($originalBroker.ExitCode-eq 0){'PASS'}else{'FAIL'});evidence=@{heldOriginalBroker=$true;birthUtc=$originalBrokerBirth;exitCode=$originalBroker.ExitCode}})
$mandatory=@('competing_brokers','wrong_enrollment','wrong_source','wrong_root','wrong_controller_peer','wrong_daemon_peer','spent_launch_source_controller_changes','early_exit_no_relaunch','lost_boot_ack_no_relaunch','first_actor_singleton','eof_preadmission','eof_inflight_completion','pending_readiness_blocks_stop','edit_readiness_blocks_stop','native_readiness_blocks_stop','job_readiness_blocks_stop','consumed_stop_lost_ack_no_replay','exact_daemon_exit_independent_ack','broker_death_replacement_closed')
foreach($id in $mandatory){$rows.Add([pscustomobject]@{id=$id;status='UNVERIFIED';evidence='Separate exact isolated fixture/phase proof required; this bounded runner does not substitute source review or L4 admission.'})}
[pscustomobject]@{scope='isolated_synthetic_local_session';productionAuthority=$false;productionReady=$false;scenario=$Scenario;rows=$rows;sourcePins=$sourcePins;cleanup='scratch preserved; no foreign stop; unknown mutation is never repeated'}|ConvertTo-Json -Depth 8
