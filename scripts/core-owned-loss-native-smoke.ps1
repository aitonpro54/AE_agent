# Actual production PS functions, managed kernel/mutex and metadata ports only.
# No production loop, process factory, real mutex, OpenProcess or AE/CEP call.
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'));$helper=Join-Path $PSScriptRoot 'owned-runtime-daemon-helper.ps1';$moduleFile=Join-Path $PSScriptRoot 'core-owned-loss-native.ps1';$checks=0
function Parse([string]$file){$t=$null;$e=$null;$a=[Management.Automation.Language.Parser]::ParseFile($file,[ref]$t,[ref]$e);if($e.Count){throw 'test_parse_failed'};return $a}
$ha=Parse $helper;$ma=Parse $moduleFile
foreach($name in @('Exact','Canon','HashText','AssertController')){$f=$ha.Find({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -ceq $name},$true);. ([ScriptBlock]::Create($f.Extent.Text))}
Add-Type -TypeDefinition @'
using System;using System.ComponentModel;using System.IO;using System.Security.Cryptography;
public static class OwnedDaemonKernel {
 public static int Error=87,Opens=0; public static bool Exited=false;
 public static object Identity(IntPtr h){return new {pid=9000,birthFileTime="1",birthUtc="2026-10-26T00:00:00.0000000Z",imagePath="C:/pwsh.exe"};}
 public static object Wait(IntPtr h,int ms){return new {signaled=Exited};} public static string[] Args(string c){return new string[]{"synthetic-observer"};} public static IntPtr Open(int pid,bool terminate){Opens++;if(Error!=0)throw new Win32Exception(Error);return new IntPtr(1);}
 public static void Dispose(IntPtr h){} public static string Hash(Stream s){s.Position=0;using(var h=SHA256.Create())return Convert.ToHexString(h.ComputeHash(s)).ToLowerInvariant();}
}
public class ManagedLossMutex {
 public static string Mode="",Order=""; string name;int calls=0;
 public ManagedLossMutex(bool owned,string n){name=n;Order+=n+";";}
 public bool WaitOne(int ms){calls++;if(calls==1&&Mode=="busy")return false;if(calls==1&&Mode=="abandoned")throw new System.Threading.AbandonedMutexException();return true;}
 public void ReleaseMutex(){} public void Dispose(){}
}
'@
. ([ScriptBlock]::Create([IO.File]::ReadAllText($moduleFile).Replace('[Threading.Mutex]::new','[ManagedLossMutex]::new')))
function Check([bool]$ok,[string]$name){if(!$ok){throw ('test_failed_'+$name)};$script:checks++}
function Reject([scriptblock]$block,[string]$pattern){$failed=$false;try{& $block}catch{if($_.Exception.Message -notmatch $pattern){throw};$failed=$true};Check $failed $pattern}
function ResetPair{$script:controllerMutex=$null;$script:sourceControllerMutex=$null;$script:controllerOwned=$false;$script:sourceControllerOwned=$false;$script:lossPair=$false;$script:migration=$false;[ManagedLossMutex]::Order=''}
$repo=[IO.Path]::GetFullPath('C:/Users/Ant/Documents/Codex/AE_Agent_Core');[OwnedDaemonKernel]::Error=87;LossAbsent 29964;Check $true 'only_error87_absent'
foreach($n in @(5,6,0)){[OwnedDaemonKernel]::Error=$n;Reject {LossAbsent 29964} 'owned_core_loss_(absence_unproven|target_present_or_reused)'}
ResetPair;[ManagedLossMutex]::Mode='';LossPair $false;Check $script:lossPair 'real_order_port';Check ([ManagedLossMutex]::Order.Split(';')[0] -ne [ManagedLossMutex]::Order.Split(';')[1]) 'distinct_source_core_names'
ResetPair;[ManagedLossMutex]::Mode='abandoned';LossPair $true;Check $script:lossPair 'exact_loss_abandoned_owner_only'
ResetPair;Reject {LossPair $false} 'owned_core_loss_abandoned_observer_pair'
ResetPair;[ManagedLossMutex]::Mode='busy';Reject {LossPair $true} 'owned_core_loss_source_busy'
# Full native binding/session/once reader on explicit synthetic signed-read ports.
$script:rows=@{};$script:lossMode='owner';$script:lossPair=$true;$script:lossSession='11111111-1111-4111-8111-111111111111';$script:lossOwnerPid=1234
$d=[pscustomobject]@{oldGeneration='1672be8d-76e4-4fa3-9994-8a750c8a2209';originalCurrentRawSha256='a'*64;runtime=@{sourceSha256='b'*64;sourcePins=@()}}
$r=@{generation='22222222-2222-4222-8222-222222222222';operationId='33333333-3333-4333-8333-333333333333';bootNonce='44444444-4444-4444-8444-444444444444';sourceSha256='b'*64;sourcePins=@()}
$b=[pscustomobject]@{schema='ae-agent.core-owned-loss.v1.launch-binding';dispositionRawSha256='d'*64;codeRepairRawSha256='f'*64;onceRawSha256='e'*64;kind='normal_owned_generation_once';generation=$r.generation;operationId=$r.operationId;bootNonce=$r.bootNonce;currentBeforeRawSha256=$d.originalCurrentRawSha256;runtime=$d.runtime;reservation=@{value=$r;sha256=(HashText (Canon $r))};ticket=@{value=@{x=1};sha256=(HashText (Canon @{x=1}))};nativeSessionId=$script:lossSession;ownerPid=1234;guards=@{expiresAt=[DateTimeOffset]::UtcNow.AddSeconds(5).ToString('o')};replayAllowed=$false}
function LossCodeRepair([bool]$fresh=$false){return @{runtime=$d.runtime}};function LossOriginal{return $d};function LossRead([string]$name){return $script:rows[$name]};function LossRaw([string]$name){if($name -ceq 'disposition'){return 'd'*64};if($name -ceq 'launch-once'){return 'e'*64};return 'f'*64}
$script:rows['launch-binding']=$b;$script:rows['launch-once']=[pscustomobject]@{schema='ae-agent.core-owned-loss.v1.launch-once';dispositionRawSha256='d'*64;codeRepairRawSha256='f'*64;operationId=$b.operationId;generation=$b.generation;bootNonce=$b.bootNonce;nativeSessionId=$b.nativeSessionId;createdAt=[DateTimeOffset]::UtcNow.ToString('o');replayAllowed=$false;authentication='a'*64};[void](LossBinding $true);Check $true 'paired_current_session_binding'
$b.nativeSessionId='99999999-9999-4999-8999-999999999999';$script:rows['launch-once'].nativeSessionId=$b.nativeSessionId;Reject {[void](LossBinding $true)} 'owned_core_loss_same_session_required';$b.nativeSessionId=$script:lossSession;$script:rows['launch-once'].nativeSessionId=$b.nativeSessionId
$script:lossPair=$false;Reject {[void](LossBinding $true)} 'owned_core_loss_same_session_required';$script:lossPair=$true
$b.onceRawSha256='0'*64;Reject {[void](LossBinding $true)} 'owned_core_loss_binding_invalid';$b.onceRawSha256='e'*64
$script:rows['launch-once'].codeRepairRawSha256='0'*64;Reject {[void](LossBinding $true)} 'owned_core_loss_once_binding_changed';$script:rows['launch-once'].codeRepairRawSha256='f'*64
# Relevant CIM rows with missing metadata cannot be called unrelated.
function LossAssertPair{};function LossAbsent([int]$target){};function ReleaseLocks{};function EndpointFree{return $true};$script:lossDir='C:/synthetic/loss';$script:handle=[IntPtr]::Zero
function Test-Path{return $false};$script:cimRow=$null;function Get-CimInstance{return $script:cimRow}
foreach($missing in @('CommandLine','ExecutablePath')){$script:cimRow=[pscustomobject]@{ProcessId=5566;Name='node.exe';ExecutablePath='C:/node.exe';CommandLine='C:/unrelated.js'};$script:cimRow.$missing=$null;Reject {LossPreflight} 'owned_core_loss_runtime_metadata_unknown'}
$script:cimRow=$null;LossPreflight;Check $true 'bounded_empty_census'
# Actual observer liveness/identity/argv check before launch-owner release.
[OwnedDaemonKernel]::Error=0;$script:cimRow=[pscustomobject]@{CommandLine='synthetic-observer'};$capture=[pscustomobject]@{observerSessionId='88888888-8888-4888-8888-888888888888';observerIdentity=@{pid=9000;birthFileTime='1';birthUtc='2026-10-26T00:00:00.0000000Z';imagePath='C:/pwsh.exe';executableSha256='b'*64};observerArgv=@('synthetic-observer')};$binding=@{runtime=@{pwsh=@{executable='C:/pwsh.exe';sha256='b'*64}}};LossAssertObserver $capture $binding;Check $true 'observer_alive_exact_identity';[OwnedDaemonKernel]::Exited=$true;Reject {LossAssertObserver $capture $binding} 'owned_core_loss_observer_not_alive';[OwnedDaemonKernel]::Exited=$false;$capture.observerIdentity.birthFileTime='2';Reject {LossAssertObserver $capture $binding} 'owned_core_loss_observer_not_alive';$capture.observerIdentity.birthFileTime='1';$script:cimRow.CommandLine=$null;Reject {LossAssertObserver $capture $binding} 'owned_core_loss_observer_argv_changed'
# The actual native dispatch refuses early observer close, independently of JS.
$script:lossMode='observer';$script:lossReadbackOnly=$false;$script:lossObserverReleaseAllowed=$false;function Emit($v){};Reject {LossDispatch ([pscustomobject]@{op='dispose-core-loss'})} 'owned_core_loss_observer_release_after_redirect_only'
# The exact trusted import gate executes before any imported code or pair.
$line=([IO.File]::ReadAllLines($helper)|Where-Object {$_.StartsWith('$lossFunctions=SafeFile ')})
function SafeFile{return [IO.MemoryStream]::new([Text.Encoding]::UTF8.GetBytes('$global:lossImportedUnexpectedly=$true'))}
$line=$line.Replace('$PSScriptRoot',"'C:/synthetic'");$global:lossImportedUnexpectedly=$false;Reject {. ([ScriptBlock]::Create($line))} 'owned_core_loss_import_pin_changed';Check (!$global:lossImportedUnexpectedly) 'substituted_import_not_executed'
$add=$ha.Find({param($n)$n -is [Management.Automation.Language.CommandAst] -and $n.GetCommandName() -ceq 'Add-Type'},$true);$c=($add.CommandElements|Where-Object {$_ -is [Management.Automation.Language.StringConstantExpressionAst]}|Select-Object -Last 1).Value
Check ((HashText $c) -ceq 'b0b1e2455d4e955388403ccb68b935ac10f25b1fc4df44fe613182e22924448a') 'tested_production_primitive_unchanged'
# Actual supplement reader and private HMAC verification with a sanitized 192
# pin descriptor. FS/native-current-byte ports are managed; no production read.
foreach($name in @('Hmac','AssertPrestartSignature')){$f=$ha.Find({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -ceq $name}.GetNewClosure(),$true);. ([ScriptBlock]::Create($f.Extent.Text))}
$names=[regex]::Match([IO.File]::ReadAllText((Join-Path $root 'mcp-server/review-evidence.js')),'(?s)const RUNTIME_FILES = (\[.*?\n\]);').Groups[1].Value|ConvertFrom-Json
$emptyHash=HashText ''; $pins=@($names|ForEach-Object {[pscustomobject]@{name=$_;sha256=('a'*64)}});($pins|Where-Object {$_.name -ceq 'scripts/owned-runtime-daemon-helper.ps1'}).sha256=$emptyHash
$prior=[pscustomobject]@{sourceSha256=(HashText (Canon $pins));sourcePins=$pins;manifestRawSha256=$emptyHash;helperRawSha256=$emptyHash;node=@{executable='C:/fixture-node.exe';sha256=('a'*64)};pwsh=@{executable='C:/fixture-pwsh.exe';sha256=('a'*64)}}
$next=$prior|ConvertTo-Json -Depth 20 -Compress|ConvertFrom-Json -DateKind String;($next.sourcePins|Where-Object {$_.name -ceq 'mcp-server/core-owned-loss.js'}).sha256='b'*64;$next.sourceSha256=HashText (Canon @($next.sourcePins))
$codeRepairD0=[pscustomobject]@{runtime=$prior;lifetimeRawSha256='bc6a62d128b4822c1c80ef1d686092e9587f5174d4abb95de7bbcae2a79d87a7';oldGeneration='1672be8d-76e4-4fa3-9994-8a750c8a2209';originalCurrentRawSha256=('a'*64)}
$supplement=@{schema='ae-agent.core-owned-loss.v1.code-repair';kind='unconsumed_loss_owner_ack_code_repair';revision=1;authorization=@{source='explicit_user_chat';reference='01a171dd-b843-7141-b28a-ae75d79ce7f1'};dispositionRawSha256='c84832b82a774dc348f7e9310674828bc6ce06d0156152cf7a53e8c2497b44e9';priorRuntimeSourceSha256=$prior.sourceSha256;audit=@{path='.codex-runtime/core-cutover-observations/20261026/empty-owner-timeout-reconciliation.json';rawSha256='6071e8b2b390e8f9d2c468d6fccc203e47c685f038d6cdb114bcf9a6b9241402';evidenceClass='operator_attested_private_rpc';nativeCryptographicNoStartProof=$false};runtime=$next;lifetimeRawSha256=$codeRepairD0.lifetimeRawSha256;primitiveSha256='b0b1e2455d4e955388403ccb68b935ac10f25b1fc4df44fe613182e22924448a';effect='code_binding_only';replayAllowed=$false;createdAt=[DateTimeOffset]::UtcNow.ToString('o')}
function Config{return @{token='managed-private-test-key'}}
function SealSupplement($value){$value.authentication=Hmac $value (Config).token;return $value|ConvertTo-Json -Depth 30 -Compress|ConvertFrom-Json -DateKind String}
$sealedSupplement=SealSupplement $supplement;$script:codeRepairRow=$sealedSupplement;$script:evidenceDrift=$false;$script:freshDrift=$false;$script:freshChecks=0
function LossOriginal{return $codeRepairD0}
function ReadJson($file){if($file.EndsWith('code-repair.json')){if(!$script:codeRepairRow){throw 'owned_test_missing_code_repair'};return $script:codeRepairRow};return $script:rows[[IO.Path]::GetFileNameWithoutExtension($file)]}
function LossRaw($name){if($name -ceq 'disposition'){return 'c84832b82a774dc348f7e9310674828bc6ce06d0156152cf7a53e8c2497b44e9'};if($name -ceq 'code-repair'){return HashText (Canon $script:codeRepairRow)};return 'e'*64}
function CoreRepairRaw($file){if($script:evidenceDrift){return '0'*64};if($file.EndsWith('empty-owner-timeout-reconciliation.json')){return '6071e8b2b390e8f9d2c468d6fccc203e47c685f038d6cdb114bcf9a6b9241402'};return $codeRepairD0.lifetimeRawSha256}
function SourcePins($pins){$script:freshChecks++;if($pins.Count -ne 192 -or $script:freshDrift){throw 'owned_supervisor_source_changed'}}
function SafeFile{return [IO.MemoryStream]::new()}
$f=$ma.Find({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -ceq 'LossRead'},$true);. ([ScriptBlock]::Create($f.Extent.Text))
$f=$ma.Find({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -ceq 'LossCodeRepair'},$true);. ([ScriptBlock]::Create($f.Extent.Text.Replace('63e9ee0ffdfc5a43626b4950939e24f151b14c1aa65357d426b5d0f3d316fe8f',$prior.sourceSha256)))
[void](LossCodeRepair);[void](LossCodeRepair $true);Check ($script:freshChecks -eq 1) 'supplement_historical_and_fresh'
foreach($fault in @('hmac','disposition','audit','native-claim','primitive','order','unlisted','exe','extra')){
 $script:codeRepairRow=$sealedSupplement|ConvertTo-Json -Depth 30 -Compress|ConvertFrom-Json -DateKind String
 switch($fault){'hmac'{$script:codeRepairRow.authentication='0'*64}'disposition'{$script:codeRepairRow.dispositionRawSha256='0'*64}'audit'{$script:codeRepairRow.audit.rawSha256='0'*64}'native-claim'{$script:codeRepairRow.audit.nativeCryptographicNoStartProof=$true}'primitive'{$script:codeRepairRow.primitiveSha256='0'*64}'order'{[Array]::Reverse($script:codeRepairRow.runtime.sourcePins);$script:codeRepairRow.runtime.sourceSha256=HashText (Canon @($script:codeRepairRow.runtime.sourcePins))}'unlisted'{($script:codeRepairRow.runtime.sourcePins|Where-Object {$_.name -ceq 'mcp-server/bridge-daemon.js'}).sha256='0'*64;$script:codeRepairRow.runtime.sourceSha256=HashText (Canon @($script:codeRepairRow.runtime.sourcePins))}'exe'{$script:codeRepairRow.runtime.node.sha256='0'*64}'extra'{$script:codeRepairRow|Add-Member covered $true}}
 if($fault -cne 'hmac'){$data=@{};foreach($p in $script:codeRepairRow.PSObject.Properties){if($p.Name -cne 'authentication'){$data[$p.Name]=$p.Value}};$script:codeRepairRow=SealSupplement $data}
 Reject {[void](LossCodeRepair)} 'owned_(core_prestart_authentication_invalid|core_loss_code_repair_|supervisor_rpc_schema)'
}
$script:codeRepairRow=$sealedSupplement;$script:evidenceDrift=$true;Reject {[void](LossCodeRepair)} 'evidence_changed';$script:evidenceDrift=$false;$script:freshDrift=$true;Reject {[void](LossCodeRepair $true)} 'source_changed';$script:freshDrift=$false
# Start dispatch reaches the actual binding reader first, so missing or invalid
# S cannot reach native-attempt or the launch sentinel, even with fabricated b.
$script:lossMode='owner';$script:handle=[IntPtr]::Zero;$script:lossStartEntered=$false;$script:lossReadbackOnly=$false;$script:lossPair=$true;$script:codeRepairRow=$null
Reject {LossDispatch ([pscustomobject]@{op='start-core-loss-once'})} 'missing_code_repair';Check (!$script:lossStartEntered) 'missing_s_start_zero'
$script:codeRepairRow=$sealedSupplement|ConvertTo-Json -Depth 30 -Compress|ConvertFrom-Json -DateKind String;$script:codeRepairRow.authentication='0'*64;Reject {LossDispatch ([pscustomobject]@{op='start-core-loss-once'})} 'authentication_invalid';Check (!$script:lossStartEntered) 'tampered_s_start_zero'
$script:codeRepairRow=$sealedSupplement;$r.sourceSha256=$next.sourceSha256;$r.sourcePins=$next.sourcePins;$b.runtime=$next;$b.dispositionRawSha256=LossRaw 'disposition';$b.codeRepairRawSha256=LossRaw 'code-repair';$b.reservation.sha256=HashText (Canon $r);$b.guards.expiresAt=[DateTimeOffset]::UtcNow.AddSeconds(5).ToString('o');$script:lossSession=$b.nativeSessionId;$script:lossOwnerPid=$b.ownerPid
$bindingData=@{};foreach($p in $b.PSObject.Properties){$bindingData[$p.Name]=$p.Value};$script:rows['launch-binding']=SealSupplement $bindingData
$onceData=@{schema='ae-agent.core-owned-loss.v1.launch-once';dispositionRawSha256=(LossRaw 'disposition');codeRepairRawSha256=(LossRaw 'code-repair');operationId=$b.operationId;generation=$b.generation;bootNonce=$b.bootNonce;nativeSessionId=$b.nativeSessionId;createdAt=[DateTimeOffset]::UtcNow.ToString('o');replayAllowed=$false};$script:rows['launch-once']=SealSupplement $onceData
[void](LossBinding $true);Check $true 'native_d0_s_once_binding_runtime_positive'
$onceData.Remove('authentication');$onceData.codeRepairRawSha256='0'*64;$script:rows['launch-once']=SealSupplement $onceData;Reject {LossDispatch ([pscustomobject]@{op='start-core-loss-once'})} 'once_binding_changed';Check (!$script:lossStartEntered) 'mismatched_once_s_start_zero'
@{ok=$true;checks=$checks;scope='actual_loss_PS_functions_managed_kernel_mutex_CIM_import_ports';nativeCalls=0;liveProof=$false}|ConvertTo-Json -Compress
