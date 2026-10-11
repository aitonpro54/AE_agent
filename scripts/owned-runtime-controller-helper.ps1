# Distinct root-owned CLI controller retirement. No daemon/Adobe effect.
$ErrorActionPreference='Stop'
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$base=Join-Path $repo '.codex-runtime/owned-runtime-maintenance'
$schema='ae-agent.owned-runtime-launch-finalization.v1'
$node=[IO.Path]::GetFullPath('C:/Users/Ant/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe')
$nodeSha='3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237'
$systemNode=[IO.Path]::GetFullPath('C:/Program Files/nodejs/node.exe')
$systemNodeSha='3331e1ffe19874215472217c5e94f5a0c6d8e18c4ac7111d3937aa0ad5e9b4a5'
$source=Join-Path $PSScriptRoot 'owned-runtime-daemon-helper.ps1'
$ancestor=[IO.Path]::GetFullPath($source);while($ancestor){if(((Get-Item -LiteralPath $ancestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)-ne 0){throw 'owned_controller_kernel_identity_changed'};$ancestor=[IO.Path]::GetDirectoryName($ancestor)}
$kernelSource=[IO.FileStream]::new($source,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
if([Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($kernelSource)).ToLowerInvariant() -cne '5f173e8de54274f10e81df1adc872f61da958da1314e4e740e51b8d9ce0f6388'){$kernelSource.Dispose();throw 'owned_controller_kernel_source_changed'}
$kernelSource.Position=0;$reader=[IO.StreamReader]::new($kernelSource,[Text.UTF8Encoding]::new($false),$true,4096,$true);try{$kernelText=$reader.ReadToEnd()}finally{$reader.Dispose()}
$errors=$null;$tokens=$null;$ast=[Management.Automation.Language.Parser]::ParseInput($kernelText,[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'owned_controller_kernel_parser_invalid'}
$add=$ast.Find({param($n)$n -is [Management.Automation.Language.CommandAst] -and $n.GetCommandName() -ceq 'Add-Type'},$true)
Invoke-Expression $add.Extent.Text
[OwnedDaemonKernel]::FileIdentity($kernelSource)
foreach($name in @('Exact','Canon','HashText','SafeFile','ReadJson','Envelope','WriteOnce','ReleaseLocks','Hmac','Config','Policy')){$fn=$ast.Find({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -ceq $name},$true);if(!$fn){throw 'owned_controller_kernel_contract_missing'};Invoke-Expression $fn.Extent.Text}
$script:locks=@($kernelSource);$handle=[IntPtr]::Zero;$successor=[IntPtr]::Zero;$image=$null
function Identity($handle,$expected){$actual=[OwnedDaemonKernel]::Identity($handle);if($actual.pid -ne $expected.pid -or $actual.birthFileTime -cne $expected.birthFileTime -or $actual.birthUtc -cne $expected.birthUtc -or $actual.imagePath -ine $expected.imagePath){throw 'owned_controller_identity_changed'};$file=SafeFile $actual.imagePath $true;try{if([OwnedDaemonKernel]::Hash($file) -cne $expected.executableSha256){throw 'owned_controller_image_changed'}}finally{$file.Dispose()}}
function InspectLaunch($cap){
 $info=[Diagnostics.ProcessStartInfo]::new($node);$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden;$info.WorkingDirectory=$repo;$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
 foreach($arg in @((Join-Path $repo 'scripts/owned-runtime-finalize-launch.js'),'inspect','--operation-id',$cap.operationId)){[void]$info.ArgumentList.Add($arg)}
 $process=[Diagnostics.Process]::Start($info);try{$process.StandardInput.Close();$out=$process.StandardOutput.ReadToEndAsync();$err=$process.StandardError.ReadToEndAsync();if(!$process.WaitForExit(30000)){throw 'owned_controller_inspection_unknown'};$text=$out.GetAwaiter().GetResult();[void]$err.GetAwaiter().GetResult();if($process.ExitCode -ne 0 -or $text.Length -gt 131072){throw 'owned_controller_inspection_refused'};$v=$text|ConvertFrom-Json -DateKind String;if($v.ok -cne $true -or $v.status -cne 'known_launch_verified_no_effects' -or $v.operationId -cne $cap.operationId -or (Canon $v.refs) -cne (Canon $cap.launchRefs) -or (Canon $v.kernelIdentity) -cne (Canon $cap.successorIdentity) -or (Canon $v.protectedIdentities) -cne (Canon $cap.protected) -or $v.sourceSha256 -cne $cap.sourceSha256 -or $v.writeAdmissionReleased -cne $false -or $v.replayAllowed -cne $false){throw 'owned_controller_inspection_binding_changed'}}finally{$process.Dispose()}
}
function ControllerAuthority($cap,[string]$operationId){
 Exact $cap @('schema','operationId','issuedAt','expiresAt','authorizationRef','identity','argv','execWitnessRawSha256','launchRefs','successorIdentity','credentialSha256','sourceSha256','sourcePins','protected','replayAllowed')
 $controllerNode=$node;$controllerSha=$nodeSha;if($cap.identity.imagePath -ieq $systemNode){$controllerNode=$systemNode;$controllerSha=$systemNodeSha}
 $ttl=([DateTimeOffset]::Parse($cap.expiresAt)-[DateTimeOffset]::Parse($cap.issuedAt)).TotalSeconds
 if($cap.schema -cne ($schema+'.controller-authority') -or $cap.operationId -cne $operationId -or $cap.replayAllowed -cne $false -or $cap.identity.pid -eq $cap.successorIdentity.pid -or $cap.identity.imagePath -ine $controllerNode -or $cap.identity.executableSha256 -cne $controllerSha -or $cap.successorIdentity.imagePath -ine $node -or $cap.successorIdentity.executableSha256 -cne $nodeSha -or @($cap.argv).Count -ne 5 -or ($cap.argv[0] -cne 'node' -and $cap.argv[0] -ine $controllerNode) -or ($cap.argv[1] -cne 'scripts/owned-runtime-control.js' -and $cap.argv[1] -ine (Join-Path $repo 'scripts/owned-runtime-control.js')) -or $cap.argv[2] -cne 'restart-bridge-once' -or $cap.argv[3] -cne '--operation-id' -or $cap.argv[4] -cne $operationId -or @($cap.protected).Count -lt 1 -or @($cap.protected).Count -gt 64 -or @($cap.protected.pid|Select-Object -Unique).Count -ne @($cap.protected).Count -or @($cap.protected|Where-Object {$_.pid -eq $cap.identity.pid}).Count -ne 0 -or $ttl -le 0 -or $ttl -gt 180){throw 'owned_controller_authority_invalid'}
 return $true
}
function Lease($cap,$authorityRaw){
 if([DateTimeOffset]::UtcNow -lt [DateTimeOffset]::Parse($cap.issuedAt) -or [DateTimeOffset]::UtcNow -ge [DateTimeOffset]::Parse($cap.expiresAt)){throw 'owned_controller_authority_expired'}
 $fresh=ReadJson (Join-Path $dir 'authority.json') $authorityRaw $true;if((Canon $fresh) -cne (Canon $cap)){throw 'owned_controller_authority_changed'};Policy $cap.authorizationRef;$config=Config;if((HashText $config.token) -cne $cap.credentialSha256){throw 'owned_controller_credential_changed'}
 Identity $handle $cap.identity;$pidValue=([OwnedDaemonKernel]::Identity($handle)).pid;$cim=Get-CimInstance Win32_Process -Filter ('ProcessId='+$pidValue);if(!$cim -or $cim.ParentProcessId -ne $witness.parentPid -or (Canon ([OwnedDaemonKernel]::Args($cim.CommandLine))) -cne (Canon $cap.argv)){throw 'owned_controller_argv_changed'}
 Identity $successor $cap.successorIdentity;if(([OwnedDaemonKernel]::Wait($successor,0)).signaled){throw 'owned_controller_successor_exited'}
 foreach($identity in $cap.protected){if($identity.pid -eq $cap.identity.pid){throw 'owned_controller_protected_target'};$h=[OwnedDaemonKernel]::Open([int]$identity.pid,$false);try{Identity $h $identity;if(([OwnedDaemonKernel]::Wait($h,0)).signaled){throw 'owned_controller_protected_exited'}}finally{[OwnedDaemonKernel]::Dispose($h)}}
 InspectLaunch $cap
 # Last checks after the awaited read-only inspector and immediately before force.
 if([DateTimeOffset]::UtcNow -ge [DateTimeOffset]::Parse($cap.expiresAt)){throw 'owned_controller_authority_expired'};Policy $cap.authorizationRef;Identity $handle $cap.identity;Identity $successor $cap.successorIdentity;if(([OwnedDaemonKernel]::Wait($successor,0)).signaled){throw 'owned_controller_successor_exited'}
 foreach($identity in $cap.protected){$h=[OwnedDaemonKernel]::Open([int]$identity.pid,$false);try{Identity $h $identity;if(([OwnedDaemonKernel]::Wait($h,0)).signaled){throw 'owned_controller_protected_exited'}}finally{[OwnedDaemonKernel]::Dispose($h)}}
 return $config.token
}
try{
 $line=[Console]::ReadLine();if($null -eq $line -or $line.Length -gt 4096){throw 'owned_controller_rpc_budget'};$row=$line|ConvertFrom-Json -DateKind String;Exact $row @('op','operationId');if($row.op -cne 'close-controller-once' -or $row.operationId -cnotmatch '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'){throw 'owned_controller_closed_schema'}
 $dir=Join-Path $base ('controller-cleanup/'+$row.operationId);$file=Join-Path $dir 'authority.json';$stream=SafeFile $file;try{$raw=[OwnedDaemonKernel]::Hash($stream)}finally{$stream.Dispose()};$cap=ReadJson $file $raw $true
 [void](ControllerAuthority $cap $row.operationId)
 $names=@('scripts/owned-runtime-controller-helper.ps1','scripts/owned-runtime-finalize-launch.js');if(@($cap.sourcePins).Count -ne 2 -or (Canon @($cap.sourcePins.name|Sort-Object)) -cne (Canon @($names|Sort-Object))){throw 'owned_controller_source_required'};foreach($pin in $cap.sourcePins){$f=SafeFile (Join-Path $repo $pin.name);if([OwnedDaemonKernel]::Hash($f) -cne $pin.sha256){$f.Dispose();throw 'owned_controller_source_changed'};$script:locks+=@($f)}
 $witness=ReadJson (Join-Path $dir 'exec-witness.json') $cap.execWitnessRawSha256 $true;Exact $witness @('schema','kind','operationId','sessionId','identity','argv','parentPid','workdir','observedAt','replayAllowed')
 if($witness.schema -cne ($schema+'.controller-exec-witness') -or $witness.kind -cne 'observed_after_own_tool_launch' -or $witness.operationId -cne $cap.operationId -or (Canon $witness.identity) -cne (Canon $cap.identity) -or (Canon $witness.argv) -cne (Canon $cap.argv) -or $witness.workdir -ine $repo -or [string]::IsNullOrEmpty($witness.sessionId) -or $witness.parentPid -lt 1 -or [DateTimeOffset]::Parse($witness.observedAt) -lt [DateTimeOffset]::Parse($cap.identity.birthUtc) -or $witness.replayAllowed -cne $false){throw 'owned_controller_exec_witness_invalid'}
 if((Test-Path -LiteralPath (Join-Path $dir 'intent.json')) -or (Test-Path -LiteralPath (Join-Path $dir 'exit-result.json'))){throw 'owned_controller_consumed_readback_only'}
 $handle=[OwnedDaemonKernel]::Open([int]$cap.identity.pid,$true);$opened=[DateTimeOffset]::UtcNow.ToString('o');$successor=[OwnedDaemonKernel]::Open([int]$cap.successorIdentity.pid,$false);$token=Lease $cap $raw
 $intent=WriteOnce (Join-Path $dir 'intent.json') @{schema=$schema+'.controller-intent';operationId=$cap.operationId;authorityRawSha256=$raw;execWitnessRawSha256=$cap.execWitnessRawSha256;identity=$cap.identity;handleOpenedAt=$opened;createdAt=[DateTimeOffset]::UtcNow.ToString('o');replayAllowed=$false}
 [OwnedDaemonKernel]::Force($handle,$cap.expiresAt,[Action]{[void](Lease $cap $raw)})
 $wait=[OwnedDaemonKernel]::Wait($handle,10000);$value=@{schema=$schema+'.controller-exit';operationId=$cap.operationId;intentSha256=$intent.sha256;identity=$cap.identity;wait=$wait;shutdownExitProven=$wait.signaled;handleOpenedAt=$opened;observedAt=[DateTimeOffset]::UtcNow.ToString('o');replayAllowed=$false};$value.authentication=Hmac $value $token;[void](WriteOnce (Join-Path $dir 'exit-result.json') $value)
 @{ok=$wait.signaled;status='own_controller_exit_readback';operationId=$cap.operationId;wait=$wait;successorSignaled=$false;replayAllowed=$false}|ConvertTo-Json -Depth 8 -Compress
}catch{$e=$_.Exception;while($e.InnerException){$e=$e.InnerException};$code='owned_controller_refused';if($e.Message -cmatch '^owned_[a-z0-9_]+$'){$code=$e.Message};@{ok=$false;code=$code;replayAllowed=$false}|ConvertTo-Json -Compress;exit 1}finally{ReleaseLocks;if($handle -ne [IntPtr]::Zero){[OwnedDaemonKernel]::Dispose($handle)};if($successor -ne [IntPtr]::Zero){[OwnedDaemonKernel]::Dispose($successor)}}
