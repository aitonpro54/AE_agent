# Fixed drained-idle maintenance retirement. Inspect observes handles only.
# Retire uses one held target HANDLE; no tree, reopen, launch or graceful ACK.
$ErrorActionPreference='Stop'
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
try {
$bootstrapPhase='kernel_read'
$repo=[IO.Path]::GetFullPath('C:/Users/Ant/Documents/Codex/AE_agent')
$stagedJs=Join-Path $PSScriptRoot 'owned-runtime-maintenance-retire.js'
$stagedPs=Join-Path $PSScriptRoot 'owned-runtime-maintenance-retire-helper.ps1'
$base=Join-Path $repo '.codex-runtime/owned-runtime-maintenance'
$schema='ae-agent.owned-runtime-maintenance-retirement.v1'
$node=[IO.Path]::GetFullPath('C:/Users/Ant/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe')
$nodeSha='3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237'
$source=Join-Path $repo 'scripts/owned-runtime-daemon-helper.ps1'
$a=[IO.Path]::GetFullPath($source);while($a){if(((Get-Item -LiteralPath $a -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)-ne 0){throw 'owned_maintenance_kernel_reparse'};$a=[IO.Path]::GetDirectoryName($a)}
$kernelSource=[IO.FileStream]::new($source,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
if([Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($kernelSource)).ToLowerInvariant() -cne '38c34cc3abb4e3dca75629f623b7f36ca531a35189fc4f7dcce26fb672da1be9'){$kernelSource.Dispose();throw 'owned_maintenance_kernel_source_changed'}
$kernelSource.Position=0;$reader=[IO.StreamReader]::new($kernelSource,[Text.UTF8Encoding]::new($false),$true,4096,$true);try{$kernelText=$reader.ReadToEnd()}finally{$reader.Dispose()}
$errors=$null;$tokens=$null;$ast=[Management.Automation.Language.Parser]::ParseInput($kernelText,[ref]$tokens,[ref]$errors);if($errors.Count){throw 'owned_maintenance_kernel_parser_invalid'}
$bootstrapPhase='kernel_compile'
$add=$ast.Find({param($n)$n -is [Management.Automation.Language.CommandAst] -and $n.GetCommandName() -ceq 'Add-Type'},$true);Invoke-Expression $add.Extent.Text
[OwnedDaemonKernel]::FileIdentity($kernelSource)
$bootstrapPhase='binary_compile'
# Executables may have legitimate hardlinks. This verifier is used only after
# exact authenticated Node/protected membership; private SafeFile stays nlink=1.
Add-Type -TypeDefinition @'
using System;using System.ComponentModel;using System.IO;using System.Runtime.InteropServices;using System.Text;
public static class OwnedMaintenanceBinary {
 [StructLayout(LayoutKind.Sequential,Pack=4)] struct FI {public uint attributes;public long birth,access,write;public uint volume,sh,sl,links,ih,il;}
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandle(IntPtr h,out FI f);
 [DllImport("kernel32.dll",SetLastError=true)] static extern uint GetFileType(IntPtr h);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern uint GetFinalPathNameByHandleW(IntPtr h,StringBuilder path,uint length,uint flags);
 public sealed class Stamp {
  public readonly uint Attributes,Volume,Links,IndexHigh,IndexLow;public readonly long Birth,Write;public readonly ulong Size;
  public Stamp(uint attributes,uint volume,uint links,uint high,uint low,long birth,long write,ulong size){Attributes=attributes;Volume=volume;Links=links;IndexHigh=high;IndexLow=low;Birth=birth;Write=write;Size=size;}
 }
 public static void Validate(Stamp s){if(s==null || s.Links<1 || (s.Attributes&0x410)!=0 || (s.IndexHigh==0 && s.IndexLow==0) || s.Size==0 || s.Size>1073741824UL)throw new InvalidOperationException("owned_maintenance_binary_identity_invalid");}
 public static void Stable(Stamp a,Stamp b){Validate(a);Validate(b);if(a.Attributes!=b.Attributes || a.Volume!=b.Volume || a.Links!=b.Links || a.IndexHigh!=b.IndexHigh || a.IndexLow!=b.IndexLow || a.Birth!=b.Birth || a.Write!=b.Write || a.Size!=b.Size)throw new InvalidOperationException("owned_maintenance_binary_identity_changed");}
 public static Stamp Capture(FileStream stream,string expectedPath){
  IntPtr h=stream.SafeFileHandle.DangerousGetHandle();FI f;if(GetFileType(h)!=1 || !GetFileInformationByHandle(h,out f))throw new InvalidOperationException("owned_maintenance_binary_file_type_invalid");
  StringBuilder name=new StringBuilder(32768);uint n=GetFinalPathNameByHandleW(h,name,(uint)name.Capacity,0);if(n==0 || n>=name.Capacity)throw new InvalidOperationException("owned_maintenance_binary_final_path_invalid");string p=name.ToString();if(p.StartsWith(@"\\?\UNC\",StringComparison.OrdinalIgnoreCase))p=@"\\"+p.Substring(8);else if(p.StartsWith(@"\\?\",StringComparison.Ordinal))p=p.Substring(4);if(!String.Equals(Path.GetFullPath(p),Path.GetFullPath(expectedPath),StringComparison.OrdinalIgnoreCase))throw new InvalidOperationException("owned_maintenance_binary_path_changed");
  Stamp s=new Stamp(f.attributes,f.volume,f.links,f.ih,f.il,f.birth,f.write,((ulong)f.sh<<32)|f.sl);Validate(s);if((ulong)stream.Length!=s.Size)throw new InvalidOperationException("owned_maintenance_binary_size_changed");return s;
 }
}
'@
$bootstrapPhase='kernel_contract'
foreach($name in @('Exact','Canon','HashText','SafeFile','ReadJson','Envelope','WriteOnce','ReleaseLocks','Hmac','Config','Policy','BootstrapIdle','SafeInteger','ProcessBirth','OriginalRetirementProof')){$fn=$ast.Find({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -ceq $name},$true);if(!$fn){throw 'owned_maintenance_kernel_contract_missing'};Invoke-Expression $fn.Extent.Text}
$script:locks=@($kernelSource);$handle=[IntPtr]::Zero;$image=$null;$script:protection=@();$script:token=$null;$script:binaryAuthority=@();$script:binaryStreams=@()
}catch{
 $e=$_.Exception;while($e.InnerException){$e=$e.InnerException};$code='owned_maintenance_native_bootstrap_refused';if($e.Message -cmatch '^owned_[a-z0-9_]+$'){$code=$e.Message}
 $diagnostics=@([regex]::Matches($_.ToString(),'\b(?:CS|BC)\d{4}\b')|ForEach-Object {$_.Value}|Select-Object -Unique)
 @{ok=$false;code=$code;nativeDiagnostic=@{phase=$bootstrapPhase;exceptionType=$e.GetType().FullName;compilerDiagnosticCodes=$diagnostics};effectIntentWritten=$false;replayAllowed=$false}|ConvertTo-Json -Depth 5 -Compress;exit 1
}
function Authentication($value,[string]$token){$data=@{};foreach($p in $value.PSObject.Properties){if($p.Name -cne 'authentication'){$data[$p.Name]=$p.Value}};return Hmac $data $token}
function BinaryParents([string]$file){$a=[IO.Path]::GetFullPath($file);while($a){if(((Get-Item -LiteralPath $a -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)-ne 0){throw 'owned_maintenance_binary_reparse'};$a=[IO.Path]::GetDirectoryName($a)}}
function BinaryAuthority($target,$protected){
 if($target.pid -ne 26540 -or $target.birthFileTime -cne '134361986424362966' -or $target.birthUtc -cne '2026-10-11T13:24:02.4362966Z' -or $target.imagePath -ine $node -or $target.executableSha256 -cne $nodeSha -or @($protected).Count -ne 4 -or @($protected.pid|Select-Object -Unique).Count -ne 4 -or @($protected|Where-Object {$_.pid -eq $target.pid}).Count){throw 'owned_maintenance_binary_authority_invalid'}
 $script:binaryAuthority=@($target)+@($protected)
}
function KnownBinary($expected){
 if(@($script:binaryAuthority|Where-Object {(Canon $_) -ceq (Canon $expected)}).Count -ne 1){throw 'owned_maintenance_binary_authority_required'}
 $p=[IO.Path]::GetFullPath($expected.imagePath);if($p -ine $expected.imagePath -or $expected.executableSha256 -cnotmatch '^[a-f0-9]{64}$'){throw 'owned_maintenance_binary_expected_invalid'};BinaryParents $p
 $entries=@($script:binaryStreams|Where-Object {$_.path -ieq $p -and $_.sha -ceq $expected.executableSha256});if($entries.Count -gt 1){throw 'owned_maintenance_binary_ambiguous'}
 if($entries.Count -eq 1){$entry=$entries[0];[OwnedMaintenanceBinary]::Stable($entry.stamp,[OwnedMaintenanceBinary]::Capture($entry.stream,$p));BinaryParents $p;return $entry.stream}
 $s=[IO.FileStream]::new($p,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read);try{$stamp=[OwnedMaintenanceBinary]::Capture($s,$p);if([OwnedDaemonKernel]::Hash($s) -cne $expected.executableSha256){throw 'owned_maintenance_executable_changed'};[OwnedMaintenanceBinary]::Stable($stamp,[OwnedMaintenanceBinary]::Capture($s,$p));BinaryParents $p;$script:binaryStreams+=@(@{path=$p;sha=$expected.executableSha256;stamp=$stamp;stream=$s});$script:locks+=@($s);return $s}catch{$s.Dispose();throw}
}
function Identity($h,$expected){
 $v=[OwnedDaemonKernel]::Identity($h);if($v.pid -ne $expected.pid -or $v.birthFileTime -cne $expected.birthFileTime -or $v.birthUtc -cne $expected.birthUtc -or $v.imagePath -ine $expected.imagePath){throw 'owned_maintenance_kernel_identity_changed'}
 [void](KnownBinary $expected)
}
function Protected {foreach($p in $script:protection){Identity $p.handle $p.identity;if(([OwnedDaemonKernel]::Wait($p.handle,0)).signaled){throw 'owned_maintenance_protected_exited'}}}
function LockPin([string]$file,[string]$sha){$s=SafeFile $file;if([OwnedDaemonKernel]::Hash($s) -cne $sha){$s.Dispose();throw 'owned_maintenance_raw_pin_changed'};$script:locks+=@($s)}
function CheckCode($pins){
 if(@($pins).Count -lt 2 -or @($pins).Count -gt 128 -or $pins[0].path -ine $stagedJs -or $pins[1].path -ine $stagedPs){throw 'owned_maintenance_fixed_staged_code_required'}
 foreach($p in $pins){Exact $p @('path','rawSha256');$resolved=[IO.Path]::GetFullPath($p.path);if(!$resolved.StartsWith([IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'owned_maintenance_staged_path_required'};LockPin $p.path $p.rawSha256}
}
function CheckHistory([string]$op='private-check'){
 $info=[Diagnostics.ProcessStartInfo]::new($node);$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden;$info.WorkingDirectory=$repo;$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
 foreach($arg in @($stagedJs,$op,'--repo-root',$repo,'--operation-id',$row.operationId)){[void]$info.ArgumentList.Add($arg)}
 $p=[Diagnostics.Process]::Start($info);try{$p.StandardInput.Close();$out=$p.StandardOutput.ReadToEndAsync();$err=$p.StandardError.ReadToEndAsync();if(!$p.WaitForExit(30000)){throw 'owned_maintenance_history_unknown'};$text=$out.GetAwaiter().GetResult();[void]$err.GetAwaiter().GetResult();if($p.ExitCode -ne 0 -or $text.Length -gt 2097152){throw 'owned_maintenance_history_refused'};$v=$text|ConvertFrom-Json -DateKind String;if($v.ok -cne $true){throw 'owned_maintenance_history_refused'};return $v}finally{$p.Dispose()}
}
function ExactTarget($v){
 if($v.generation -cne '896f2ae3-6b32-47ae-aba5-2da8545e2bdf' -or $v.bootNonce -cne '6e63436b-34c8-43ab-ac2f-c3d16cd369aa' -or $v.sourceSha256 -cne 'd0c414d6472add49cc57fa3285d5270dee380fa63b5c4fb6aecd9567bcdc5c0a' -or $v.kernelIdentity.pid -ne 26540 -or $v.kernelIdentity.birthFileTime -cne '134361986424362966' -or $v.kernelIdentity.birthUtc -cne '2026-10-11T13:24:02.4362966Z' -or $v.kernelIdentity.imagePath -ine $node -or $v.kernelIdentity.executableSha256 -cne $nodeSha -or (Canon $v.argv) -cne (Canon @($node,(Join-Path $repo 'mcp-server/bridge-daemon.js')))){throw 'owned_maintenance_exact_target_required'}
}
function CheckExistingDrainRefs($a){
 $names=@($a.PSObject.Properties.Name);if($names -cnotcontains 'acquisitionMode' -and $names -cnotcontains 'existingDrainRefs'){return}
 if($a.acquisitionMode -cne 'after_existing_drain' -or @($a.existingDrainRefs).Count -ne 5){throw 'owned_maintenance_resume_reference_invalid'}
 $kinds=@('generation-key','maintenance-drain-intent','maintenance-drain-transport','service-intent','service-drain-ack');$paths=@((Join-Path $base ('maintenance-retirement-keys/'+$cap.generation+'.json')),(Join-Path $base ('maintenance-retirements/'+$cap.operationId+'/drain-intent.json')),(Join-Path $base ('maintenance-retirements/'+$cap.operationId+'/drain-transport.json')),(Join-Path $base ('daemon-operations/'+$cap.operationId+'/intent.json')),(Join-Path $base ('daemon-operations/'+$cap.operationId+'/drain-ack.json')))
 for($i=0;$i -lt 5;$i++){$ref=$a.existingDrainRefs[$i];Exact $ref @('kind','path','rawSha256');if($ref.kind -cne $kinds[$i] -or $ref.path -cne $paths[$i] -or $ref.rawSha256 -cnotmatch '^[a-f0-9]{64}$'){throw 'owned_maintenance_resume_reference_invalid'}}
 foreach($ref in $a.existingDrainRefs){LockPin $ref.path $ref.rawSha256}
}
function CheckSnapshot($a){
 CheckExistingDrainRefs $a
 if(@($a.sourcePins).Count -ne 74 -or (HashText (Canon $a.sourcePins)) -cne $cap.registration.sourceSha256 -or @($a.snapshot).Count -ne 74){throw 'owned_maintenance_source_set_invalid'}
 for($i=0;$i -lt 74;$i++){$p=$a.sourcePins[$i];$s=$a.snapshot[$i];if($s.name -cne $p.name -or $s.sha256 -cne $p.sha256 -or $s.snapshotFile -cne ('files/'+$p.name)){throw 'owned_maintenance_snapshot_invalid'};LockPin (Join-Path $repo $p.name) $p.sha256;LockPin (Join-Path $historical $s.snapshotFile) $p.sha256}
 $chain=@{reservation='c9589becd8c8c4cfcc69ef9c7a6bfe1477a1b84a3f534e5256f8fb2ff48d176a';'startup-ticket'='43758e003a35c0ba6d2dac5b5cda987844e59ae3a48a19f6b9f92b2ba46946d1';'native-candidate'='ba9795bc91b63a3268025dcc4e824329642f01f411d0a3ae01f00908290de10b';registration='bf025b3f56d8b8f07e7e77d9a1b04fd54f70f696bda7a6015802687527fd5396'};foreach($name in $chain.Keys){LockPin (Join-Path $base ('daemon-reservations/'+$cap.generation+'/'+$name+'.json')) $chain[$name]}
 foreach($ref in $a.auditRefs){LockPin $ref.path $ref.rawSha256};foreach($ref in $a.state.panelReloadStage.files){LockPin $ref.path $ref.rawSha256}
 if(@($a.originalProofRefs).Count -ne 2){throw 'owned_maintenance_original_two_exit_proofs_required'}
 foreach($member in $a.originalProofRefs){$launch=ReadJson $member.launch.path $member.launch.rawSha256 $true;$proof=ReadJson $member.retirementProof.path $member.retirementProof.rawSha256 $true;if($launch.sha256 -cne $member.launch.envelopeSha256 -or $proof.sha256 -cne $member.retirementProof.envelopeSha256){throw 'owned_maintenance_original_exit_pin_changed'};[void](OriginalRetirementProof $proof.value $launch.value.process)}
 foreach($ref in @($a.state.nativeCensus.preStartInventory)) {LockPin $ref.path $ref.rawSha256;LockPin $ref.sealPath $ref.sealRawSha256}
 foreach($ref in @($a.state.nativeCensus.ledgerAndCanonicalFiles)+@($a.state.nativeCensus.recoveredObservations)){LockPin (Join-Path $repo $ref.path) $ref.rawSha256};foreach($root in $a.state.nativeCensus.probeRoots){foreach($ref in $root.files){LockPin (Join-Path $repo $ref.path) $ref.rawSha256}}
 if($a.state.nativeLaunchCoverage.kind -cne 'unchanged_since_verified_pre_start' -or $a.state.nativeLaunchCoverage.censusSha256 -cne (HashText (Canon $a.state.nativeCensus))){throw 'owned_maintenance_native_coverage_required'}
}
function Lease {
 if([DateTimeOffset]::UtcNow -lt [DateTimeOffset]::Parse($cap.issuedAt) -or [DateTimeOffset]::UtcNow -ge [DateTimeOffset]::Parse($cap.expiresAt)){throw 'owned_maintenance_capability_expired'}
 $v=ReadJson (Join-Path $dir 'authority.json') $capRaw $true;if((Canon $v) -cne (Canon $cap)){throw 'owned_maintenance_capability_changed'};Policy $cap.authorizationRef
 $lock=ReadJson (Join-Path $repo 'logs/cep-panel-control/controller.lock') $lockRaw $true;if((Canon $lock) -cne (Canon $row.owner) -or $lock.requestId -cne $row.operationId){throw 'owned_maintenance_foreign_lock'}
 $facts=CheckHistory;if($facts.authorityRawSha256 -cne $capRaw -or $facts.acquisitionRawSha256 -cne $cap.acquisitionRawSha256 -or $facts.submissionSha256 -cne $row.submissionSha256 -or $facts.lockRawSha256 -cne $lockRaw -or (Canon $facts.identity) -cne (Canon $cap.registration.kernelIdentity) -or (Canon $facts.protected) -cne (Canon $cap.protected)){throw 'owned_maintenance_history_binding_changed'}
 if([DateTimeOffset]::UtcNow -ge [DateTimeOffset]::Parse($cap.expiresAt)){throw 'owned_maintenance_capability_expired'};Policy $cap.authorizationRef;Identity $handle $cap.registration.kernelIdentity;Protected
 $cim=Get-CimInstance Win32_Process -Filter ('ProcessId='+$cap.registration.kernelIdentity.pid);if(!$cim -or (Canon ([OwnedDaemonKernel]::Args($cim.CommandLine))) -cne (Canon $cap.registration.argv)){throw 'owned_maintenance_argv_changed'}
 if(([OwnedDaemonKernel]::Wait($handle,0)).signaled){throw 'owned_maintenance_target_exited_before_effect'}
}
$effectIntentWritten=$false
try {
 $line=[Console]::ReadLine();if($null -eq $line -or $line.Length -gt 4096){throw 'owned_maintenance_rpc_budget'};$row=$line|ConvertFrom-Json -DateKind String
 if($row.op -ceq 'inspect'){Exact $row @('op','repoRoot','operationId','owner')}else{Exact $row @('op','repoRoot','operationId','owner','submissionSha256')};Exact $row.owner @('pid','requestId','token')
 if($row.op -cnotin @('inspect','retire-once') -or [IO.Path]::GetFullPath($row.repoRoot) -ine $repo -or $row.operationId -cnotmatch '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' -or $row.owner.requestId -cne $row.operationId){throw 'owned_maintenance_closed_schema'}
 if($row.op -ceq 'inspect'){
  $facts=CheckHistory 'inspection-facts';if((Canon $facts.lockOwner) -cne (Canon $row.owner) -or @($facts.protected).Count -ne 4 -or @($facts.sourcePins).Count -ne 74 -or (HashText (Canon $facts.sourcePins)) -cne 'd0c414d6472add49cc57fa3285d5270dee380fa63b5c4fb6aecd9567bcdc5c0a'){throw 'owned_maintenance_inspection_binding_changed'}
  CheckCode $facts.codePins;LockPin (Join-Path $repo 'logs/cep-panel-control/controller.lock') $facts.lockRawSha256;foreach($p in $facts.sourcePins){LockPin (Join-Path $repo $p.name) $p.sha256};Policy $facts.authorizationRef;$config=Config;if((HashText $config.token) -cne $facts.credentialSha256){throw 'owned_maintenance_credentials_changed'}
  BinaryAuthority $facts.identity $facts.protected;$handle=[OwnedDaemonKernel]::Open([int]$facts.identity.pid,$false);Identity $handle $facts.identity
  foreach($p in $facts.protected){$h=[OwnedDaemonKernel]::Open([int]$p.pid,$false);$script:protection+=@(@{handle=$h;identity=$p})};Protected
  $again=CheckHistory 'inspection-facts';if((Canon $again) -cne (Canon $facts)){throw 'owned_maintenance_inspection_changed'};Identity $handle $facts.identity;Protected;$wait=[OwnedDaemonKernel]::Wait($handle,0);if($wait.signaled -cne $false -or $wait.waitResult -cne 'WAIT_TIMEOUT'){throw 'owned_maintenance_target_not_alive'}
  @{ok=$true;status='maintenance_native_inspected_no_effects';identity=$facts.identity;protected=$facts.protected;wait=$wait;shutdownExitProven=$false;effectIntentWritten=$false;replayAllowed=$false}|ConvertTo-Json -Depth 12 -Compress;exit 0
 }
 $dir=Join-Path $base ('maintenance-retirements/'+$row.operationId);$s=SafeFile (Join-Path $dir 'authority.json');try{$capRaw=[OwnedDaemonKernel]::Hash($s)}finally{$s.Dispose()};$cap=ReadJson (Join-Path $dir 'authority.json') $capRaw $true
 Exact $cap @('schema','kind','operationId','generation','registration','acquisitionRawSha256','drainAckSha256','inventorySha256','protected','authorizationRef','policyRawSha256','credentialSha256','codePins','issuedAt','expiresAt','executionFenced','ingressFenced','historicalOutcome','replayAllowed','authentication');ExactTarget $cap.registration
 if($cap.schema -cne ($schema+'.authority') -or $cap.kind -cne 'DRAINED_IDLE_MAINTENANCE_RETIREMENT' -or $cap.operationId -cne $row.operationId -or $cap.generation -cne $cap.registration.generation -or @($cap.protected).Count -ne 4 -or @($cap.protected.pid|Select-Object -Unique).Count -ne 4 -or @($cap.protected|Where-Object {$_.pid -eq $cap.registration.kernelIdentity.pid}).Count -ne 0 -or ([DateTimeOffset]::Parse($cap.expiresAt)-[DateTimeOffset]::Parse($cap.issuedAt)).TotalSeconds -ne 120 -or $cap.executionFenced -cne $true -or $cap.ingressFenced -cne $false -or $cap.historicalOutcome -cne 'unknown' -or $cap.replayAllowed -cne $false){throw 'owned_maintenance_capability_invalid'}
 CheckCode $cap.codePins;$historical=Join-Path $base ('historical-sources/'+$cap.generation);$acq=Envelope (Join-Path $historical 'maintenance-source-acquisition.json') $true;LockPin (Join-Path $historical 'maintenance-source-acquisition.json') $cap.acquisitionRawSha256;$acquisition=$acq.value;CheckSnapshot $acquisition
 $config=Config;if((HashText $config.token) -cne $cap.credentialSha256 -or (Authentication $cap $config.token) -cne $cap.authentication -or (Authentication $acquisition $config.token) -cne $acquisition.authentication){throw 'owned_maintenance_authentication_invalid'};$script:token=$config.token
 $submission=Envelope (Join-Path $dir 'native-submission.json') $true;$gkey=Envelope (Join-Path $base ('maintenance-retirement-keys/'+$cap.generation+'.json')) $true;if($submission.sha256 -cne $row.submissionSha256 -or $submission.value.authorityRawSha256 -cne $capRaw -or (Canon $submission.value.lockOwner) -cne (Canon $row.owner) -or $gkey.value.operationId -cne $row.operationId -or $gkey.value.generation -cne $cap.generation -or $gkey.value.replayAllowed -cne $false){throw 'owned_maintenance_submission_required'}
 $s=SafeFile (Join-Path $repo 'logs/cep-panel-control/controller.lock');try{$lockRaw=[OwnedDaemonKernel]::Hash($s);$script:locks+=@($s);$s=$null}finally{if($null -ne $s){$s.Dispose()}}
 foreach($name in @('force-intent.json','native-attempt.json','exit-result.json')){if(Test-Path -LiteralPath (Join-Path $dir $name)){throw 'owned_maintenance_consumed_readback_only'}}
 BinaryAuthority $cap.registration.kernelIdentity $cap.protected;$handle=[OwnedDaemonKernel]::Open([int]$cap.registration.kernelIdentity.pid,$true);$opened=[DateTimeOffset]::UtcNow.ToString('o');foreach($p in $cap.protected){$h=[OwnedDaemonKernel]::Open([int]$p.pid,$false);$script:protection+=@(@{handle=$h;identity=$p})};Lease
 # Known pre-effect identity/config/compiler failures leave no force-intent.
 # Submission was consumed before this helper started; unknown cannot replay.
 $intent=WriteOnce (Join-Path $dir 'force-intent.json') @{schema=$schema+'.force-intent';kind=$cap.kind;operationId=$cap.operationId;generation=$cap.generation;nativeSubmissionSha256=$submission.sha256;authorityRawSha256=$capRaw;acquisitionRawSha256=$cap.acquisitionRawSha256;drainAckSha256=$cap.drainAckSha256;inventorySha256=$cap.inventorySha256;lockOwner=$row.owner;createdAt=[DateTimeOffset]::UtcNow.ToString('o');executionFenced=$true;ingressFenced=$false;historicalOutcome='unknown';replayAllowed=$false};$effectIntentWritten=$true
 $attempt=WriteOnce (Join-Path $dir 'native-attempt.json') @{schema=$schema+'.native-attempt';operationId=$cap.operationId;generation=$cap.generation;authorityRawSha256=$capRaw;intentSha256=$intent.sha256;identity=$cap.registration.kernelIdentity;handleOpenedAt=$opened;replayAllowed=$false}
 [OwnedDaemonKernel]::Force($handle,$cap.expiresAt,[Action]{Lease})
 $wait=[OwnedDaemonKernel]::Wait($handle,10000)
 # Persist factual same-HANDLE WAIT before post-exit reads can fail.
 $exit=@{schema=$schema+'.exit-result';kind='drained_idle_maintenance_retirement';operationId=$cap.operationId;generation=$cap.generation;intentSha256=$intent.sha256;nativeAttemptSha256=$attempt.sha256;authorityRawSha256=$capRaw;drainAckSha256=$cap.drainAckSha256;identity=$cap.registration.kernelIdentity;wait=$wait;handleOpenedAt=$opened;observedAt=[DateTimeOffset]::UtcNow.ToString('o');executionFenced=$true;ingressFenced=$false;historicalOutcome='unknown';replayAllowed=$false};$exit.authentication=Hmac $exit $script:token;$result=WriteOnce (Join-Path $dir 'exit-result.json') $exit
 if($wait.signaled -cne $true -or $wait.waitResult -cne 'WAIT_OBJECT_0'){throw 'owned_maintenance_exit_unknown'}
 $post=CheckHistory 'private-post-exit';$value=@{schema=$schema+'.post-exit-inventory';operationId=$cap.operationId;generation=$cap.generation;exitResultSha256=$result.sha256;inventory=$post.inventory;namespace=$post.namespace;cutoffStable=$post.cutoffStable;observedAt=[DateTimeOffset]::UtcNow.ToString('o');executionFenced=$true;ingressFenced=$false;historicalOutcome='unknown';replayAllowed=$false};$value.authentication=Hmac $value $script:token;[void](WriteOnce (Join-Path $dir 'post-exit-inventory.json') $value)
 @{ok=$true;status='drained_idle_maintenance_exit_proven';operationId=$cap.operationId;wait=$wait;cutoffStable=$post.cutoffStable;successorPermitted=($post.cutoffStable -ceq $true);replayAllowed=$false}|ConvertTo-Json -Depth 8 -Compress
}catch{$e=$_.Exception;while($e.InnerException){$e=$e.InnerException};$code='owned_maintenance_refused';if($e.Message -cmatch '^owned_[a-z0-9_]+$'){$code=$e.Message};@{ok=$false;code=$code;effectIntentWritten=$effectIntentWritten;replayAllowed=$false}|ConvertTo-Json -Compress;exit 1}finally{foreach($p in $script:protection){[OwnedDaemonKernel]::Dispose($p.handle)};if($handle -ne [IntPtr]::Zero){[OwnedDaemonKernel]::Dispose($handle)};ReleaseLocks}
