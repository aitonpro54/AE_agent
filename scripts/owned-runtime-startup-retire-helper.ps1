# Distinct NEVER_ADMITTED_STARTUP_RETIREMENT. No controller, fixture, tree,
# launch, ordinary shutdown force, admission release or outcome inference.
$ErrorActionPreference='Stop'
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$base=Join-Path $repo '.codex-runtime/owned-runtime-maintenance'
$schema='ae-agent.owned-runtime-startup-retirement.v1'
$node=[IO.Path]::GetFullPath('C:/Users/Ant/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe')
$nodeSha='3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237'
$source=Join-Path $PSScriptRoot 'owned-runtime-daemon-helper.ps1'
$a=[IO.Path]::GetFullPath($source);while($a){if(((Get-Item -LiteralPath $a -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)-ne 0){throw 'owned_startup_kernel_reparse'};$a=[IO.Path]::GetDirectoryName($a)}
$kernelSource=[IO.FileStream]::new($source,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
if([Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($kernelSource)).ToLowerInvariant() -cne '5f173e8de54274f10e81df1adc872f61da958da1314e4e740e51b8d9ce0f6388'){$kernelSource.Dispose();throw 'owned_startup_kernel_source_changed'}
$kernelSource.Position=0;$reader=[IO.StreamReader]::new($kernelSource,[Text.UTF8Encoding]::new($false),$true,4096,$true);try{$kernelText=$reader.ReadToEnd()}finally{$reader.Dispose()}
$errors=$null;$tokens=$null;$ast=[Management.Automation.Language.Parser]::ParseInput($kernelText,[ref]$tokens,[ref]$errors);if($errors.Count){throw 'owned_startup_kernel_parser_invalid'}
$add=$ast.Find({param($n)$n -is [Management.Automation.Language.CommandAst] -and $n.GetCommandName() -ceq 'Add-Type'},$true);Invoke-Expression $add.Extent.Text
[OwnedDaemonKernel]::FileIdentity($kernelSource)
foreach($name in @('Exact','Canon','HashText','SafeFile','ReadJson','Envelope','WriteOnce','ReleaseLocks','Hmac','Config','Policy','BootstrapIdle','SafeInteger','ProcessBirth','OriginalRetirementProof')){$fn=$ast.Find({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -ceq $name},$true);if(!$fn){throw 'owned_startup_kernel_contract_missing'};Invoke-Expression $fn.Extent.Text}
$script:locks=@($kernelSource);$handle=[IntPtr]::Zero;$image=$null;$script:protection=@();$script:token=$null
function Authentication($value,[string]$token){$data=@{};foreach($p in $value.PSObject.Properties){if($p.Name -cne 'authentication'){$data[$p.Name]=$p.Value}};return Hmac $data $token}
function Identity($h,$expected){
 $v=[OwnedDaemonKernel]::Identity($h);if($v.pid -ne $expected.pid -or $v.birthFileTime -cne $expected.birthFileTime -or $v.birthUtc -cne $expected.birthUtc -or $v.imagePath -ine $expected.imagePath){throw 'owned_startup_kernel_identity_changed'}
 $s=SafeFile $v.imagePath $true;try{if([OwnedDaemonKernel]::Hash($s) -cne $expected.executableSha256){throw 'owned_startup_executable_changed'}}finally{$s.Dispose()}
}
function CheckFiles($cap,$acquisition){
 foreach($p in $cap.sourcePins){$s=SafeFile (Join-Path $repo $p.name);if([OwnedDaemonKernel]::Hash($s) -cne $p.sha256){$s.Dispose();throw 'owned_startup_helper_source_changed'};$script:locks+=@($s)}
 if(@($acquisition.sourcePins).Count -ne 71 -or (HashText (Canon $acquisition.sourcePins)) -cne $cap.sourceSha256 -or @($acquisition.snapshot).Count -ne 71){throw 'owned_startup_source_set_invalid'}
 for($i=0;$i -lt 71;$i++){$p=$acquisition.sourcePins[$i];$copy=$acquisition.snapshot[$i];if($copy.name -cne $p.name -or $copy.sha256 -cne $p.sha256 -or $copy.snapshotFile -cne ('files/'+$p.name)){throw 'owned_startup_snapshot_invalid'};foreach($file in @((Join-Path $repo $p.name),(Join-Path $historical $copy.snapshotFile))){$s=SafeFile $file;if([OwnedDaemonKernel]::Hash($s) -cne $p.sha256){$s.Dispose();throw 'owned_startup_source_changed'};$script:locks+=@($s)}}
 if(@($acquisition.originalProofRefs).Count -ne 2 -or @($acquisition.originalProofRefs.stageId|Select-Object -Unique).Count -ne 2){throw 'owned_startup_original_two_proofs_required'}
 foreach($member in $acquisition.originalProofRefs){$launch=ReadJson $member.launch.path $member.launch.rawSha256 $true;$proof=ReadJson $member.retirementProof.path $member.retirementProof.rawSha256 $true;if($launch.sha256 -cne $member.launch.envelopeSha256 -or $proof.sha256 -cne $member.retirementProof.envelopeSha256){throw 'owned_startup_original_proof_changed'};[void](OriginalRetirementProof $proof.value $launch.value.process)}
}
function CheckHistory([string]$op='private-check'){
 $info=[Diagnostics.ProcessStartInfo]::new($node);$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden;$info.WorkingDirectory=$repo;$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
 foreach($arg in @((Join-Path $repo 'scripts/owned-runtime-startup-retire.js'),$op,'--operation-id',$row.operationId)){[void]$info.ArgumentList.Add($arg)}
 $p=[Diagnostics.Process]::Start($info);try{$p.StandardInput.Close();$out=$p.StandardOutput.ReadToEndAsync();$err=$p.StandardError.ReadToEndAsync();if(!$p.WaitForExit(30000)){throw 'owned_startup_history_unknown'};$text=$out.GetAwaiter().GetResult();[void]$err.GetAwaiter().GetResult();if($p.ExitCode -ne 0 -or $text.Length -gt 2097152){throw 'owned_startup_history_refused'};$v=$text|ConvertFrom-Json -DateKind String;if($v.ok -cne $true){throw 'owned_startup_history_refused'};return $v}finally{$p.Dispose()}
}
function StatusIdle($dev,$owned,$registration){
 $d=$owned.readiness.details
 return ($dev.ok -ceq $true -and $dev.startedAt -ceq $registration.serviceStartedAt -and $dev.humanGuardRuntime.startedAt -ceq $registration.serviceStartedAt -and $dev.humanGuardRuntime.pid -eq $registration.kernelIdentity.pid -and $dev.humanGuardRuntime.sourceSha256 -ceq $registration.sourceSha256 -and $dev.pendingCommands -ceq 0 -and $dev.inflightCommands -is [array] -and @($dev.inflightCommands).Count -eq 0 -and $null -eq $dev.activeEditSession -and $dev.projectLifecycle.blocked -ceq $false -and !$dev.projectLifecycle.pending -and (BootstrapIdle $dev.panelBootstrap) -and $owned.ok -ceq $true -and $owned.owned -ceq $true -and $owned.generation -ceq $registration.generation -and $owned.writeAdmission -ceq 'retained_audit_and_fresh_adoption_required' -and $owned.activeTickets -ceq 0 -and $owned.draining -ceq $false -and $owned.closing -ceq $false -and $owned.replayAllowed -ceq $false -and $owned.readiness.activeTickets -ceq 0 -and $d.nativeExecutionIdle -ceq $true -and $d.bootstrapIdle -ceq $true -and $d.pendingCommands -ceq 0 -and $d.inflightCommands -is [array] -and @($d.inflightCommands).Count -eq 0 -and $null -eq $d.activeEditSession -and $d.projectLifecycle.blocked -ceq $false -and !$d.projectLifecycle.pending)
}
function DecodeStatus([string]$text){
 if($text.Length -gt 2097152){throw 'owned_startup_status_budget'}
 # Identity timestamps are exact witness strings, never date-coerced values.
 return ($text|ConvertFrom-Json -DateKind String)
}
function ReadAuthenticatedStatus([string]$route,[string]$credential){
 if($route -cnotin @('/dev/status','/runtime/owned/status')){throw 'owned_startup_status_route_refused'}
 $handler=[Net.Http.HttpClientHandler]::new();$handler.AllowAutoRedirect=$false
 $client=[Net.Http.HttpClient]::new($handler,$true);$client.Timeout=[TimeSpan]::FromSeconds(3);$client.MaxResponseContentBufferSize=2097152
 try{[void]$client.DefaultRequestHeaders.Add('x-ae-bridge-token',$credential);return DecodeStatus ($client.GetStringAsync('http://127.0.0.1:3456'+$route).GetAwaiter().GetResult())}finally{$client.Dispose()}
}
function Protected {
 foreach($p in $script:protection){Identity $p.handle $p.identity;if(([OwnedDaemonKernel]::Wait($p.handle,0)).signaled){throw 'owned_startup_protected_exited'}}
}
function Lease {
 if([DateTimeOffset]::UtcNow -lt [DateTimeOffset]::Parse($cap.issuedAt) -or [DateTimeOffset]::UtcNow -ge [DateTimeOffset]::Parse($cap.expiresAt)){throw 'owned_startup_capability_expired'}
 $v=ReadJson (Join-Path $dir 'authority.json') $capRaw $true;if((Canon $v) -cne (Canon $cap)){throw 'owned_startup_capability_changed'};Policy $cap.authorizationRef;$config=Config;if((HashText $config.token) -cne $cap.credentialSha256){throw 'owned_startup_credentials_changed'};$script:token=$config.token
 $lock=ReadJson (Join-Path $repo 'logs/cep-panel-control/controller.lock') $lockRaw $true;if((Canon $lock) -cne (Canon $row.owner) -or $lock.requestId -cne $row.operationId){throw 'owned_startup_foreign_lock'}
 $facts=CheckHistory;if($facts.authorityRawSha256 -cne $capRaw -or $facts.acquisitionRawSha256 -cne $cap.acquisitionRawSha256 -or $facts.intentSha256 -cne $row.intentSha256 -or $facts.lockRawSha256 -cne $lockRaw -or (Canon $facts.identity) -cne (Canon $cap.identity) -or (Canon $facts.argv) -cne (Canon $cap.argv) -or (Canon $facts.protected) -cne (Canon $cap.protected)){throw 'owned_startup_history_binding_changed'}
 Identity $handle $cap.identity;if(([OwnedDaemonKernel]::Wait($handle,0)).signaled){throw 'owned_startup_target_exited_before_effect'};$cim=Get-CimInstance Win32_Process -Filter ('ProcessId='+$cap.identity.pid);if(!$cim -or (Canon ([OwnedDaemonKernel]::Args($cim.CommandLine))) -cne (Canon $cap.argv)){throw 'owned_startup_argv_changed'}
 $dev=ReadAuthenticatedStatus '/dev/status' $script:token;$owned=ReadAuthenticatedStatus '/runtime/owned/status' $script:token
 if(!(StatusIdle $dev $owned $facts.registration)){throw 'owned_startup_authenticated_idle_required'}
 # Every awaited history/auth read precedes this final native/policy/lock frame.
 if([DateTimeOffset]::UtcNow -ge [DateTimeOffset]::Parse($cap.expiresAt)){throw 'owned_startup_capability_expired'};Policy $cap.authorizationRef;$current=ReadJson (Join-Path $repo 'logs/cep-panel-control/controller.lock') $lockRaw $true;if((Canon $current) -cne (Canon $row.owner)){throw 'owned_startup_foreign_lock'}
 foreach($file in $acquisition.absentAdmissionPaths){if(Test-Path -LiteralPath (Join-Path $repo $file)){throw 'owned_startup_ever_admitted_or_partial_audit'}}
 Identity $handle $cap.identity;Protected;if(([OwnedDaemonKernel]::Wait($handle,0)).signaled){throw 'owned_startup_target_exited_before_effect'}
}
try{
 $line=[Console]::ReadLine();if($null -eq $line -or $line.Length -gt 4096){throw 'owned_startup_rpc_budget'};$row=$line|ConvertFrom-Json -DateKind String
 if($row.op -ceq 'inspect'){Exact $row @('op','operationId','owner')}else{Exact $row @('op','operationId','owner','intentSha256')};Exact $row.owner @('pid','requestId','token');if($row.op -cnotin @('inspect','retire-once') -or $row.operationId -cnotmatch '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' -or $row.owner.requestId -cne $row.operationId){throw 'owned_startup_closed_schema'}
 if($row.op -ceq 'inspect'){
  $facts=CheckHistory 'inspection-facts';if((Canon $facts.lockOwner) -cne (Canon $row.owner) -or @($facts.protected).Count -ne 4 -or @($facts.sourcePins).Count -ne 71 -or (HashText (Canon $facts.sourcePins)) -cne '9e926eced4d581e23c814cf54d0974e8d16b726b05ce526aa6bd55e5f167976c'){throw 'owned_startup_inspection_binding_changed'}
  $lock=ReadJson (Join-Path $repo 'logs/cep-panel-control/controller.lock') $facts.lockRawSha256 $true;if((Canon $lock) -cne (Canon $row.owner)){throw 'owned_startup_foreign_lock'}
  foreach($pin in $facts.sourcePins){$s=SafeFile (Join-Path $repo $pin.name);if([OwnedDaemonKernel]::Hash($s) -cne $pin.sha256){$s.Dispose();throw 'owned_startup_source_changed'};$script:locks+=@($s)}
  Policy $facts.authorizationRef;$config=Config;if((HashText $config.token) -cne $facts.credentialSha256){throw 'owned_startup_credentials_changed'}
  $handle=[OwnedDaemonKernel]::Open([int]$facts.identity.pid,$false);Identity $handle $facts.identity;$cim=Get-CimInstance Win32_Process -Filter ('ProcessId='+$facts.identity.pid);if(!$cim -or (Canon ([OwnedDaemonKernel]::Args($cim.CommandLine))) -cne (Canon $facts.argv)){throw 'owned_startup_argv_changed'}
  foreach($p in $facts.protected){$h=[OwnedDaemonKernel]::Open([int]$p.pid,$false);$script:protection+=@(@{handle=$h;identity=$p})};Protected
  $dev=ReadAuthenticatedStatus '/dev/status' $config.token;$owned=ReadAuthenticatedStatus '/runtime/owned/status' $config.token;if(!(StatusIdle $dev $owned $facts.registration)){throw 'owned_startup_authenticated_idle_required'}
  [void](CheckHistory 'inspection-facts');Policy $facts.authorizationRef;Identity $handle $facts.identity;Protected;if(([OwnedDaemonKernel]::Wait($handle,0)).signaled){throw 'owned_startup_target_not_alive'}
  @{ok=$true;status='startup_native_inspected_no_effects';replayAllowed=$false}|ConvertTo-Json -Compress;exit 0
 }
 $dir=Join-Path $base ('startup-retirements/'+$row.operationId);$s=SafeFile (Join-Path $dir 'authority.json');try{$capRaw=[OwnedDaemonKernel]::Hash($s)}finally{$s.Dispose()};$cap=ReadJson (Join-Path $dir 'authority.json') $capRaw $true
 Exact $cap @('schema','kind','operationId','initialOperationId','generation','bootNonce','issuedAt','expiresAt','authorizationRef','acquisitionRawSha256','identity','argv','credentialSha256','sourceSha256','protected','sourcePins','replayAllowed','authentication')
 if($cap.schema -cne ($schema+'.authority') -or $cap.kind -cne 'NEVER_ADMITTED_STARTUP_RETIREMENT' -or $cap.operationId -cne $row.operationId -or $cap.sourceSha256 -cne '9e926eced4d581e23c814cf54d0974e8d16b726b05ce526aa6bd55e5f167976c' -or $cap.identity.imagePath -ine $node -or $cap.identity.executableSha256 -cne $nodeSha -or (Canon $cap.argv) -cne (Canon @($node,(Join-Path $repo 'mcp-server/bridge-daemon.js'))) -or @($cap.protected).Count -ne 4 -or @($cap.protected.pid|Select-Object -Unique).Count -ne 4 -or @($cap.protected|Where-Object {$_.pid -eq $cap.identity.pid}).Count -ne 0 -or ([DateTimeOffset]::Parse($cap.expiresAt)-[DateTimeOffset]::Parse($cap.issuedAt)).TotalSeconds -ne 120 -or $cap.replayAllowed -cne $false){throw 'owned_startup_capability_invalid'}
 $names=@('scripts/owned-runtime-startup-retire.js','scripts/owned-runtime-startup-retire-helper.ps1','scripts/owned-runtime-finalize-launch.js');if(@($cap.sourcePins).Count -ne 3 -or (Canon @($cap.sourcePins.name|Sort-Object)) -cne (Canon @($names|Sort-Object))){throw 'owned_startup_helper_sources_required'}
 $historical=Join-Path $base ('historical-sources/'+$cap.generation);$acq=Envelope (Join-Path $historical 'source-acquisition.json') $true;$acquisition=$acq.value;$s=SafeFile (Join-Path $historical 'source-acquisition.json');try{if([OwnedDaemonKernel]::Hash($s) -cne $cap.acquisitionRawSha256){throw 'owned_startup_acquisition_changed'}}finally{$s.Dispose()};CheckFiles $cap $acquisition
 $config=Config;if((HashText $config.token) -cne $cap.credentialSha256 -or (Authentication $cap $config.token) -cne $cap.authentication){throw 'owned_startup_authentication_invalid'};$script:token=$config.token
 $intent=Envelope (Join-Path $dir 'intent.json') $true;$gkey=Envelope (Join-Path $base ('startup-retirement-keys/'+$cap.generation+'.json')) $true;if($intent.sha256 -cne $row.intentSha256 -or $intent.value.authorityRawSha256 -cne $capRaw -or (Canon $intent.value.lockOwner) -cne (Canon $row.owner) -or $gkey.value.operationId -cne $row.operationId -or $gkey.value.generation -cne $cap.generation -or $gkey.value.authorityRawSha256 -cne $capRaw -or $gkey.value.replayAllowed -cne $false){throw 'owned_startup_intent_required'}
 $s=SafeFile (Join-Path $repo 'logs/cep-panel-control/controller.lock');try{$lockRaw=[OwnedDaemonKernel]::Hash($s);$script:locks+=@($s);$s=$null}finally{if($null -ne $s){$s.Dispose()}}
 if((Test-Path -LiteralPath (Join-Path $dir 'native-attempt.json')) -or (Test-Path -LiteralPath (Join-Path $dir 'exit-result.json'))){throw 'owned_startup_consumed_readback_only'}
 $handle=[OwnedDaemonKernel]::Open([int]$cap.identity.pid,$true);$opened=[DateTimeOffset]::UtcNow.ToString('o');foreach($p in $cap.protected){$h=[OwnedDaemonKernel]::Open([int]$p.pid,$false);$script:protection+=@(@{handle=$h;identity=$p})};Lease
 $attempt=WriteOnce (Join-Path $dir 'native-attempt.json') @{schema=$schema+'.native-attempt';operationId=$cap.operationId;generation=$cap.generation;authorityRawSha256=$capRaw;intentSha256=$intent.sha256;identity=$cap.identity;handleOpenedAt=$opened;replayAllowed=$false}
 [OwnedDaemonKernel]::Force($handle,$cap.expiresAt,[Action]{Lease})
 $wait=[OwnedDaemonKernel]::Wait($handle,10000)
 # Preserve factual WAIT_OBJECT_0 before any subsequent awaited read/policy.
 $exit=@{schema=$schema+'.exit';kind='never_admitted_startup_retirement';operationId=$cap.operationId;generation=$cap.generation;intentSha256=$intent.sha256;nativeAttemptSha256=$attempt.sha256;authorityRawSha256=$capRaw;identity=$cap.identity;wait=$wait;handleOpenedAt=$opened;observedAt=[DateTimeOffset]::UtcNow.ToString('o');historicalOutcome='unknown';ingressFenced=$false;replayAllowed=$false};$exit.authentication=Hmac $exit $script:token;$result=WriteOnce (Join-Path $dir 'exit-result.json') $exit
 if($wait.signaled -cne $true -or $wait.waitResult -cne 'WAIT_OBJECT_0'){throw 'owned_startup_exit_unknown'}
 $post=CheckHistory 'private-post-exit';$value=@{schema=$schema+'.post-exit-inventory';operationId=$cap.operationId;generation=$cap.generation;exitResultSha256=$result.sha256;inventory=$post.inventory;namespace=$post.namespace;observedAt=[DateTimeOffset]::UtcNow.ToString('o');historicalOutcome='unknown';ingressFenced=$false;replayAllowed=$false};$value.authentication=Hmac $value $script:token;$postRow=WriteOnce (Join-Path $dir 'post-exit-inventory.json') $value
 # retired-source is sealed later by the root-only completion sealer, after the
 # ORIGINAL controller's real unified-exec completion. Never infer it here.
 @{ok=$true;status='never_admitted_startup_exit_proven';operationId=$cap.operationId;wait=$wait;replayAllowed=$false}|ConvertTo-Json -Depth 8 -Compress
}catch{$e=$_.Exception;while($e.InnerException){$e=$e.InnerException};$code='owned_startup_refused';if($e.Message -cmatch '^owned_[a-z0-9_]+$'){$code=$e.Message};@{ok=$false;code=$code;replayAllowed=$false}|ConvertTo-Json -Compress;exit 1}finally{foreach($p in $script:protection){[OwnedDaemonKernel]::Dispose($p.handle)};if($handle -ne [IntPtr]::Zero){[OwnedDaemonKernel]::Dispose($handle)};ReleaseLocks}
