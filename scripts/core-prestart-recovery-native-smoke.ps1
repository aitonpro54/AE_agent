param([Parameter(Mandatory=$true)][string]$FixtureRoot,[ValidateSet('resolver','positive','start','identity','argv','candidate','lost_pair','foreign_session','ordinary','ordinary_consumed','unrelated')][string]$Case='resolver')
# Production resolver and control loop on owned files. Every kernel API is a
# synthetic managed port. This never invokes the actual helper/native factory.
$ErrorActionPreference='Stop'
$allowed=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../.codex-runtime/core-prestart-recovery-smoke'))+[IO.Path]::DirectorySeparatorChar
$repo=[IO.Path]::GetFullPath($FixtureRoot);if(!$repo.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase)){throw 'prestart_native_fixture_containment'}
$helper=Join-Path $PSScriptRoot 'owned-runtime-daemon-helper.ps1';$text=[IO.File]::ReadAllText($helper);$errors=$null;$tokens=$null;$ast=[Management.Automation.Language.Parser]::ParseFile($helper,[ref]$tokens,[ref]$errors);if($errors.Count){throw 'prestart_native_parser_failed'}
Add-Type -TypeDefinition @'
using System;using System.IO;using System.Security.Cryptography;
public static class OwnedDaemonKernel {
 public static string Fault,NodeSha;public static int Starts,Disposes;
 public static void FileIdentity(FileStream s){}
 public static string Hash(Stream s){if(s is FileStream&&((FileStream)s).Name.EndsWith("node-fixture.bin"))return NodeSha;s.Position=0;using(var h=SHA256.Create())return BitConverter.ToString(h.ComputeHash(s)).Replace("-","").ToLowerInvariant();}
 public static IntPtr StartIndependent(string n,string s,string r,object e){Starts++;if(Fault=="start")throw new InvalidOperationException("owned_test_start_unknown");return new IntPtr(42);}
 public static object Identity(IntPtr h){if(Fault=="identity")throw new InvalidOperationException("owned_test_identity");return new {pid=123,birthFileTime="1",birthUtc="2026-10-25T01:00:00.0000000Z",imagePath="C:/fixture-node.exe"};}
 public static object Wait(IntPtr h,uint ms){return new {signaled=false,waitResult="WAIT_TIMEOUT",exitCode=(int?)null};}
 public static void Dispose(IntPtr h){Disposes++;}
}
'@
$fixedCore='C:/Users/Ant/Documents/Codex/AE_Agent_Core'.Replace('/',[IO.Path]::DirectorySeparatorChar);$fixedSource='C:/Users/Ant/Documents/Codex/AE_agent'.Replace('/',[IO.Path]::DirectorySeparatorChar)
$functions=@('Exact','Canon','HashText','SafeFile','ReadJson','Envelope','WriteOnce','ReleaseLocks','SourcePins','Hmac','AssertPrestartSignature','ReadPrestartPair','Reservation','MigrationIntent','AssertController','MigrationRecovery','AssertProductDeployment','NativeFailure')
foreach($name in $functions){$fn=$ast.Find({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -ceq $name}.GetNewClosure(),$true);if(!$fn){throw 'prestart_native_function_missing'};$body=$fn.Extent.Text.Replace($fixedCore,$repo).Replace($fixedSource,(Join-Path $repo 'legacy'));Invoke-Expression $body}
$base=Join-Path $repo '.codex-runtime/owned-runtime-maintenance';$schema='ae-agent.owned-runtime-supervisor.v1';$script:locks=@();$dir=Join-Path $repo '.codex-runtime/core-product-migration';$bindingFile=Join-Path $dir 'prestart-resume-launch.json';$decisionFile=Join-Path $dir 'prestart-disposition.json';$b=ReadJson $bindingFile;$d=ReadJson $decisionFile
$node=[IO.Path]::GetFullPath($d.runtime.node.executable);$nodeSha=$d.runtime.node.sha256;[OwnedDaemonKernel]::NodeSha=$nodeSha
function Config {return @{token='synthetic-core-key';values=@{}}}
$script:migrationSession=$b.nativeSessionId;$script:migrationOperation=$b.operationId;$checks=0
$resolved=ReadPrestartPair $true $true;if($resolved.reservation.sha256 -cne $b.reservation.sha256 -or $resolved.ticket.sha256 -cne $b.ticket.sha256){throw 'prestart_native_effective_pair_mismatch'};$checks++
$selected=Reservation $b.generation $true;if($selected.reservation.sha256 -cne $b.reservation.sha256){throw 'prestart_native_reservation_not_effective'};$checks++
ReleaseLocks
if($Case -eq 'resolver'){
 $originalBinding=[IO.File]::ReadAllBytes($bindingFile);$originalDecision=[IO.File]::ReadAllBytes($decisionFile)
 function SaveSigned($path,$value){$value.authentication='';$data=@{};foreach($p in $value.PSObject.Properties){if($p.Name -cne 'authentication'){$data[$p.Name]=$p.Value}};$value.authentication=Hmac $data 'synthetic-core-key';[IO.File]::WriteAllText($path,($value|ConvertTo-Json -Depth 100 -Compress))}
 foreach($kind in @('session','thread','retroproof','noncode','runtime_unknown','hmac')){
  $value=ReadJson $(if($kind -eq 'session'){$bindingFile}else{$decisionFile});$target=if($kind -eq 'session'){$bindingFile}else{$decisionFile}
  switch($kind){'session'{$value.nativeSessionId=[Guid]::NewGuid().ToString()}'thread'{$value.authorization.reference=[Guid]::NewGuid().ToString()}'retroproof'{$value.nativeCryptographicNoStartProof=$true}'noncode'{$value.effectiveFacts.coreConfigRawSha256='f'*64;$value.effectiveReviewDigest=HashText (Canon $value.effectiveFacts)}'runtime_unknown'{$value.runtime.sourcePins[0].name='mcp-server/unreviewed.js';$value.runtime.sourceSha256=HashText (Canon @($value.runtime.sourcePins))}'hmac'{$value.authentication='0'*64}}
  if($kind -eq 'hmac'){[IO.File]::WriteAllText($target,($value|ConvertTo-Json -Depth 100 -Compress))}else{SaveSigned $target $value}
  $caught=$null;try{[void](ReadPrestartPair $true $true)}catch{$caught=$_.Exception.Message}finally{ReleaseLocks}
  if(!$caught){throw ('prestart_native_negative_not_closed_'+$kind)};$checks++;[IO.File]::WriteAllBytes($bindingFile,$originalBinding);[IO.File]::WriteAllBytes($decisionFile,$originalDecision)
 }
 $value=ReadJson $bindingFile;$old='2000-01-01T00:00:00.000Z';$value.createdAt=$old;$value.reservation.value.createdAt=$old;$value.reservation.sha256=HashText (Canon $value.reservation.value);$value.ticket.value.reservationSha256=$value.reservation.sha256;$value.ticket.value.issuedAt=$old;$value.ticket.value.expiresAt='2000-01-01T00:10:00.000Z';$value.ticket.sha256=HashText (Canon $value.ticket.value);$value.sourceAbsence.observedAt=$old;SaveSigned $bindingFile $value
 $caught=$null;try{[void](ReadPrestartPair $true $true)}catch{$caught=$_.Exception.Message}finally{ReleaseLocks};if($caught -cne 'owned_core_prestart_effective_pair_invalid'){throw 'prestart_native_expired_ticket_not_closed'};$checks++
 [void](ReadPrestartPair $false $false);ReleaseLocks;$checks++ # immutable reader must work after ticket expiry
 [IO.File]::WriteAllBytes($bindingFile,$originalBinding)
 # A later native-attempt record does not invalidate the immutable resolver.
 [IO.File]::WriteAllText((Join-Path $dir 'native-launch-attempt.json'),'{}');[void](ReadPrestartPair $false $false);ReleaseLocks;$checks++
}else{
 function NewMutex {$m=[pscustomobject]@{};$m|Add-Member ScriptMethod WaitOne {param($ms)return $true};$m|Add-Member ScriptMethod ReleaseMutex {};$m|Add-Member ScriptMethod Dispose {};return $m}
 function Emit($v){$script:outputs.Add($v)}
 function AssertMigrationSource($v){AssertController}
 function ProbeMigrationSource($v){AssertController;return @{state='absent';win32Error=87;endpointFree=$true}}
 function AssertMigrationFinal($v){AssertController} # actual data/fence branches have separate focused suites
 function Policy($v){}
 function EndpointFree {return $true}
 function AssertActivationSuccessorConfiguration($r,$key,$env){}
 function AssertArgv($v){if($Case -eq 'argv'){throw 'owned_test_argv'}}
 $nativeSafe=${function:SafeFile};function SafeFile([string]$file,[bool]$image=$false){if($file -ieq $node){return [IO.FileStream]::new((Join-Path $repo 'node-fixture.bin'),[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)};return & $nativeSafe $file $image}
 if($Case -eq 'candidate'){$nativeWrite=${function:WriteOnce};function WriteOnce($file,$value){if($file.EndsWith('native-candidate.json')){throw 'owned_test_candidate'};return & $nativeWrite $file $value}}
 $script:outputs=[Collections.Generic.List[object]]::new();$script:controllerMutex=NewMutex;$script:controllerOwned=$true;$script:sourceControllerMutex=NewMutex;$script:sourceControllerOwned=$true;$script:migration=$true;$script:migrationPhase='controller_only';$script:migrationRecoveryOnly=$false;$script:migrationHandover=$false;$script:migrationIntent=MigrationIntent;$script:handle=[IntPtr]::Zero;$script:image=$null;$script:process=$null
 if($Case -eq 'lost_pair'){$script:sourceControllerOwned=$false};if($Case -eq 'foreign_session'){$script:migrationSession=[Guid]::NewGuid().ToString()};[OwnedDaemonKernel]::Fault=$Case
 $loop=$text.Substring($text.IndexOf('try{while($null -ne ($line=[Console]::ReadLine()))')).Replace($fixedCore,$repo)
 $loop=[regex]::Replace($loop,'(?m)^\s*\$script:controllerMutex=\[Threading\.Mutex\]::new[^\r\n]*',[Text.RegularExpressions.MatchEvaluator]{param($match)' $script:controllerMutex=NewMutex'})
 $lines=@('launch-core-prestart-resume','observe-core-migration','launch-core-prestart-resume','hold-core-migration-recovery','dispose','observe-core-migration')|ForEach-Object {ConvertTo-Json -Compress @{op=$_}}
 if($Case -in @('ordinary','ordinary_consumed','unrelated')){
  $script:migration=$false;$script:controllerMutex=$null;$script:controllerOwned=$false;$script:sourceControllerMutex=$null;$script:sourceControllerOwned=$false
  $selectedGeneration=$b.generation
  if($Case -eq 'ordinary_consumed'){[IO.File]::WriteAllText((Join-Path $dir 'native-launch-attempt.json'),'{}')}
  if($Case -eq 'unrelated'){
   $selectedGeneration=[Guid]::NewGuid().ToString();$reserved=Join-Path $base ('daemon-reservations/'+$selectedGeneration);[void][IO.Directory]::CreateDirectory($reserved)
   $r=$b.reservation.value|ConvertTo-Json -Depth 100 -Compress|ConvertFrom-Json -DateKind String;$r.generation=$selectedGeneration;$r.operationId=[Guid]::NewGuid().ToString();$r.bootNonce=[Guid]::NewGuid().ToString();$r.createdAt=[DateTimeOffset]::UtcNow.ToString('o');$res=WriteOnce (Join-Path $reserved 'reservation.json') $r
   [void](WriteOnce (Join-Path $reserved 'startup-ticket.json') @{schema=$schema+'.startup-ticket';generation=$selectedGeneration;bootNonce=$r.bootNonce;reservationSha256=$res.sha256;issuedAt=$r.createdAt;expiresAt=[DateTimeOffset]::Parse($r.createdAt).AddMinutes(10).ToString('o');replayAllowed=$false})
  }
  $lines=@((ConvertTo-Json -Compress @{op='acquire-controller'}),(ConvertTo-Json -Compress @{op='launch';generation=$selectedGeneration}),(ConvertTo-Json -Compress @{op='wait';milliseconds=0}),(ConvertTo-Json -Compress @{op='dispose'}))
 }
 $prior=[Console]::In;try{[Console]::SetIn([IO.StringReader]::new(($lines -join "`n")+"`n"));Invoke-Expression $loop}finally{[Console]::SetIn($prior)}
 if($Case -in @('lost_pair','foreign_session','ordinary','ordinary_consumed')){if([OwnedDaemonKernel]::Starts -ne 0){throw 'prestart_native_invalid_pair_started'}}else{if([OwnedDaemonKernel]::Starts -ne 1){throw 'prestart_native_start_replayed'}};$checks++
 if($Case -notin @('lost_pair','foreign_session','start','ordinary','ordinary_consumed','unrelated') -and !@($script:outputs|Where-Object {$_.recovery.handleState -ceq 'held_same_native_session'}).Count){throw 'prestart_native_fault_lost_actual_handle'};$checks++
}
Write-Output (ConvertTo-Json -Compress @{ok=$true;checks=$checks;case=$Case;scope='actual_native_resolver_and_production_resume_loop_managed_kernel_ports';starts=[OwnedDaemonKernel]::Starts;nativeCalls=0;liveProof=$false})
