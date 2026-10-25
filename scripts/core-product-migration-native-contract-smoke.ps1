# Offline execution of the production control loop against an in-memory kernel
# and fake mutexes. No actual helper factory, process, native API or file write.
$ErrorActionPreference='Stop'
$file=Join-Path $PSScriptRoot 'owned-runtime-daemon-helper.ps1'
$errors=$null;$tokens=$null;$ast=[Management.Automation.Language.Parser]::ParseFile($file,[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'migration_native_parser_failed'}
foreach($name in @('Exact','Canon','NativeFailure','AssertController','MigrationRecovery','AssertProductDeployment','ReleaseLocks','Emit')){
 $fn=$ast.Find({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -ceq $name}.GetNewClosure(),$true)
 if(!$fn){throw 'migration_native_function_missing'}
 if($name -ne 'Emit'){Invoke-Expression $fn.Extent.Text}
}
Add-Type -TypeDefinition @'
using System;using System.IO;
public static class OwnedDaemonKernel {
 public static string Fault;public static int Starts,Disposes;
 public static string Hash(Stream s){return new string('a',64);}
 public static IntPtr StartIndependent(string n,string f,string r,object e){Starts++;if(Fault=="start")throw new InvalidOperationException("owned_test_start_unknown");return new IntPtr(42);}
 public static object Identity(IntPtr h){if(Fault=="identity")throw new InvalidOperationException("owned_test_identity");return new {pid=123,birthFileTime="1",birthUtc="2026-01-01T00:00:00.0000000Z",imagePath="C:/synthetic-node.exe"};}
 public static object Wait(IntPtr h,uint ms){return new {signaled=false,waitResult="WAIT_TIMEOUT",exitCode=(int?)null};}
 public static void Dispose(IntPtr h){Disposes++;}
 public static object DirectoryMetadata(string p){return new {dev="1",ino="2"};}
}
'@
function Emit($value){$script:outputs.Add($value)}
function NewFakeMutex { $v=[pscustomobject]@{Held=$true};$v|Add-Member ScriptMethod WaitOne {param($ms)return $this.Held};$v|Add-Member ScriptMethod ReleaseMutex {};$v|Add-Member ScriptMethod Dispose {};return $v }
function MigrationIntent {return $script:migrationIntent}
function ProbeMigrationSource($v){AssertController;return @{state='absent';win32Error=87;endpointFree=$true}}
function AssertMigrationFinal($v){AssertController}
function Reservation($g,$fresh){return @{dir='C:/synthetic-never-existing-reservation';reservation=@{sha256=('a'*64);value=@{generation=$g;operationId=$script:migrationOperation;bootNonce='44444444-4444-4444-8444-444444444444';sourceSha256=('a'*64);sourcePins=@();credentialSha256=('a'*64);authorizationRef=@{};command=@{argv=@($node,(Join-Path $repo 'mcp-server/bridge-daemon.js'))}}};ticket=@{sha256=('a'*64);value=@{expiresAt=[DateTimeOffset]::UtcNow.AddMinutes(10).ToString('o')}}}}
function Policy($v){}
function SourcePins($v){}
function Config {return @{token='synthetic-only';values=@{}}}
function HashText($v){return 'a'*64}
function EndpointFree {return $true}
function SafeFile($v,$image){return [IO.MemoryStream]::new()}
function AssertActivationSuccessorConfiguration($v,$token,$env){}
function AssertArgv($v){if([OwnedDaemonKernel]::Fault -eq 'argv'){throw 'owned_test_argv'}}
function Hmac($v,$token){return 'a'*64}
function WriteOnce($file,$value){if($file.EndsWith('native-candidate.json')){$script:candidateWrites++;if([OwnedDaemonKernel]::Fault -eq 'candidate'){throw 'owned_test_candidate'}};return @{sha256=('a'*64);value=$value}}
$text=[IO.File]::ReadAllText($file);$loop=$text.Substring($text.IndexOf('try{while($null -ne ($line=[Console]::ReadLine()))'))
if(!$loop.StartsWith('try{while')){throw 'migration_native_loop_missing'}
$originalIn=[Console]::In;$checks=0
try{foreach($case in @('identity','argv','candidate','start','fake_pair','register','anchor','current','ack')){
 [OwnedDaemonKernel]::Fault=$case;[OwnedDaemonKernel]::Starts=0;[OwnedDaemonKernel]::Disposes=0
 $script:outputs=[Collections.Generic.List[object]]::new();$script:candidateWrites=0
 $repo='C:/synthetic-never-existing-core';$base=Join-Path $repo '.codex-runtime/owned-runtime-maintenance';$node='C:/synthetic-node.exe';$nodeSha='a'*64;$schema='ae-agent.owned-runtime-supervisor.v1'
 $script:handle=[IntPtr]::Zero;$script:image=$null;$script:locks=@();$script:mode=$null;$script:process=$null
 $script:controllerMutex=NewFakeMutex;$script:controllerOwned=$true;$script:sourceControllerMutex=NewFakeMutex;$script:sourceControllerOwned=$true
 if($case -eq 'fake_pair'){$script:sourceControllerOwned=$false}
 $script:migration=$true;$script:migrationOperation='11111111-1111-4111-8111-111111111111';$script:migrationIntent=@{generation='22222222-2222-4222-8222-222222222222';operationId=$script:migrationOperation};$script:migrationSession='33333333-3333-4333-8333-333333333333';$script:migrationPhase='controller_only';$script:migrationRecoveryOnly=$false;$script:migrationHandover=$false
 $inputLines=@('launch-core-migration','hold-core-migration-recovery','observe-core-migration','launch-core-migration','dispose','observe-core-migration')|ForEach-Object {ConvertTo-Json -Compress @{op=$_}}
 [Console]::SetIn([IO.StringReader]::new(($inputLines -join "`n")+"`n"));Invoke-Expression $loop
 $recoveries=@($script:outputs|Where-Object {$_.recovery})
 if($case -in @('start','fake_pair')){if($recoveries.Count -ne 0){throw 'migration_native_false_held_proof'};if($case -eq 'fake_pair' -and [OwnedDaemonKernel]::Starts -ne 0){throw 'migration_native_fake_pair_started'}}
 else{if([OwnedDaemonKernel]::Starts -ne 1 -or $recoveries.Count -lt 3){throw 'migration_native_recovery_loop_lost_or_respawned'};foreach($r in $recoveries){if($r.recovery.schema -cne 'ae-agent.core-native-recovery.v1' -or $r.recovery.handleState -cne 'held_same_native_session' -or $r.recovery.pairState -cne 'held'){throw 'migration_native_recovery_contract_invalid'}};if(!@($script:outputs|Where-Object {$_.observation.wait.waitResult -ceq 'WAIT_TIMEOUT'}).Count){throw 'migration_native_same_handle_observation_missing'}}
 $checks++
}}finally{[Console]::SetIn($originalIn)}
# Exercise the REAL pre-spawn namespace branch on test-owned disk files. Every
# negative must fail before source/installed/config reads or synthetic Start.
$finalFn=$ast.Find({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -ceq 'AssertMigrationFinal'},$true)
Invoke-Expression $finalFn.Extent.Text
function AssertMigrationSource($v){AssertController}
$testParent=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../.codex-runtime/core-native-prestart-smoke'))
$testRoot=Join-Path $testParent ([Guid]::NewGuid().ToString())
try{foreach($kind in @('current','foreign','candidate','registration')){
 $repo=Join-Path $testRoot $kind;$base=Join-Path $repo '.codex-runtime/owned-runtime-maintenance';$gen='22222222-2222-4222-8222-222222222222';$generationDir=Join-Path $base ('daemon-reservations/'+$gen)
 [void][IO.Directory]::CreateDirectory($generationDir);[IO.File]::WriteAllText((Join-Path $base 'policy.json'),'{}');foreach($name in @('reservation.json','startup-ticket.json')){[IO.File]::WriteAllText((Join-Path $generationDir $name),'{}')}
 $extra=switch($kind){'current'{Join-Path $base 'current-daemon.json'}'foreign'{Join-Path $base 'foreign.json'}'candidate'{Join-Path $generationDir 'native-candidate.json'}'registration'{Join-Path $generationDir 'registration.json'}};[IO.File]::WriteAllText($extra,'{}')
 $script:controllerMutex=NewFakeMutex;$script:controllerOwned=$true;$script:sourceControllerMutex=NewFakeMutex;$script:sourceControllerOwned=$true;[OwnedDaemonKernel]::Starts=0
 $caught=$null;try{AssertMigrationFinal ([pscustomobject]@{generation=$gen})}catch{$caught=$_.Exception.Message}
 if($caught -cnotin @('owned_core_migration_target_namespace_changed','owned_core_migration_target_already_started') -or [OwnedDaemonKernel]::Starts -ne 0){throw 'migration_native_known_drift_not_prestart'};$checks++
}}finally{if(!$testRoot.StartsWith($testParent+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'migration_native_test_cleanup_path'};if(Test-Path -LiteralPath $testRoot){Remove-Item -LiteralPath $testRoot -Force -Recurse}}
# Actual delta classification/absence code; owned fixture bytes and a synthetic
# metadata port only. No Win32/native function or helper factory is invoked.
$deltaParent=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../.codex-runtime/core-native-delta-smoke'))
$deltaRoot=Join-Path $deltaParent ([Guid]::NewGuid().ToString())
try{
 $source=Join-Path $deltaRoot 'legacy';$cep=Join-Path $source 'logs/cep-panel-control';[void][IO.Directory]::CreateDirectory($cep)
 $deltaFn=$ast.Find({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -ceq 'AssertMigrationLegacyCep'},$true)
 Invoke-Expression ($deltaFn.Extent.Text.Replace("$"+"source='C:\Users\Ant\Documents\Codex\AE_agent'","$"+"source='"+$source.Replace("'","''")+"'"))
 function ReadJson([string]$path,[string]$pin=$null,[bool]$keep=$false){return [IO.File]::ReadAllText($path)|ConvertFrom-Json -DateKind String}
 $old='b7f2a79a-63ac-416f-81a4-a982280f3766';$other='22222222-2222-4222-8222-222222222222'
 $identity=@{action='bridge.connect';signature=('b'*64)};$row=@{protocolVersion='ae-agent.panel-actions.v1';requestId=$other;action='bridge.connect';signature=('b'*64);state='completed';phase='completed';delivery='delivered';effect='panel_lifecycle';replayAllowed=$false}
 $index=@{schema='ae-agent.cep-panel-transport.v1';identities=@{}};$index.identities[$other]=$identity;$index.identities[$old]=@{garbage=$true}
 function SaveDeltaIndex {[IO.File]::WriteAllText((Join-Path $cep 'identities.json'),(ConvertTo-Json -Depth 12 -Compress $index))}
 SaveDeltaIndex;[IO.File]::WriteAllText((Join-Path $cep ($other+'.json')),(ConvertTo-Json -Compress $row));[IO.File]::WriteAllText((Join-Path $cep ($old+'.json')),'{ignored garbage')
 $projection=[pscustomobject]@{manifest=@{legacyCep=@{schema='ae-agent.core-legacy-cep-view.v1';sourceRoot=$source;activeSharedEffects=@();descriptorSha256=('a'*64);legacyOperationsReplayAllowed=$false;descriptors=@(@{action='bridge.connect';effect='panel_lifecycle';readOnly=$false},@{action='plan.run';effect='protected_plan_run';readOnly=$false})}}}
 AssertMigrationLegacyCep $projection;$checks++
 [IO.File]::Delete((Join-Path $cep ($old+'.json')));$index.identities.Remove($old);SaveDeltaIndex;AssertMigrationLegacyCep $projection;$checks++
 $row.signature='c'*64;$index.identities[$other].signature=$row.signature;SaveDeltaIndex;[IO.File]::WriteAllText((Join-Path $cep ($other+'.json')),(ConvertTo-Json -Compress $row));AssertMigrationLegacyCep $projection;$checks++
 $row.action='plan.run';$row.effect='protected_plan_run';$row.state='unknown';$index.identities[$other].action='plan.run';SaveDeltaIndex;[IO.File]::WriteAllText((Join-Path $cep ($other+'.json')),(ConvertTo-Json -Compress $row));$caught=$null;try{AssertMigrationLegacyCep $projection}catch{$caught=$_.Exception.Message};if($caught -cne 'owned_core_migration_legacy_shared_effect_unresolved'){throw 'delta_native_unknown_effect_not_closed'};$checks++
 $row.action='foo';$row.state='completed';$index.identities[$other].action='foo';SaveDeltaIndex;[IO.File]::WriteAllText((Join-Path $cep ($other+'.json')),(ConvertTo-Json -Compress $row));$caught=$null;try{AssertMigrationLegacyCep $projection}catch{$caught=$_.Exception.Message};if($caught -cne 'owned_core_migration_legacy_cep_descriptor_invalid'){throw 'delta_native_unknown_descriptor_not_closed'};$checks++
 $absence=$finalFn.Find({param($n)$n -is [Management.Automation.Language.ForEachStatementAst] -and $n.Condition.Extent.Text -ceq '$projection.manifest.readSet.absent'},$true);if(!$absence){throw 'delta_native_absence_loop_missing'}
 $logs=Join-Path $source 'logs';$guard=Join-Path $logs 'evidence/title-export-recovery';$projection.manifest.readSet=@{absent=@(@{path=$guard;nearestExistingParent=$logs;parentIdentity=@{dev='1';ino='2'};missingChild='evidence'})}
 Invoke-Expression $absence.Extent.Text;[void][IO.Directory]::CreateDirectory((Join-Path $logs 'evidence/plan-runs'));Invoke-Expression $absence.Extent.Text;$checks++
 [void][IO.Directory]::CreateDirectory($guard);$caught=$null;try{Invoke-Expression $absence.Extent.Text}catch{$caught=$_.Exception.Message};if($caught -cne 'owned_core_migration_resource_absence_changed'){throw 'delta_native_actual_guard_not_closed'};$checks++
}finally{
 if(!$deltaRoot.StartsWith($deltaParent+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'delta_native_cleanup_path'}
 if(Test-Path -LiteralPath $deltaRoot){Remove-Item -LiteralPath $deltaRoot -Force -Recurse}
}
Write-Output (ConvertTo-Json -Compress @{ok=$true;checks=$checks;scope='production_loop_prestart_and_delta_branches_with_synthetic_kernel_mutexes_and_owned_files';nativeCalls=0;productionWrites=0;liveProof=$false})
