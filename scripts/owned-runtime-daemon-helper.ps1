# Private fixed daemon launcher/held-handle transport. No caller executable,
# argv, PID, path, force policy, title selection or process-tree operation.
$ErrorActionPreference='Stop'
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$base=Join-Path $repo '.codex-runtime/owned-runtime-maintenance'
$node=[IO.Path]::GetFullPath('C:/Users/Ant/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe')
$nodeSha='3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237'
$schema='ae-agent.owned-runtime-supervisor.v1'
Add-Type -TypeDefinition @'
using System;using System.ComponentModel;using System.Diagnostics;using System.Globalization;using System.IO;using System.Runtime.InteropServices;using System.Security.Cryptography;using System.Text;using System.Collections.Generic;
public static class OwnedDaemonKernel {
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint r,bool i,int p);
 [DllImport("kernel32.dll",SetLastError=true)] static extern uint GetProcessId(IntPtr h);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetProcessTimes(IntPtr h,out long b,out long e,out long k,out long u);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool QueryFullProcessImageName(IntPtr h,uint f,StringBuilder p,ref uint n);
 [DllImport("kernel32.dll",SetLastError=true)] static extern uint WaitForSingleObject(IntPtr h,uint ms);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr h,out uint c);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool TerminateProcess(IntPtr h,uint c);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool CloseHandle(IntPtr h);
 [StructLayout(LayoutKind.Sequential)] struct SA {public int nLength;public IntPtr descriptor;[MarshalAs(UnmanagedType.Bool)] public bool inherit;}
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct SI {public uint cb;public string reserved,desktop,title;public uint x,y,xSize,ySize,xChars,yChars,fill,flags;public ushort show,reservedLength;public IntPtr reservedBytes,input,output,error;}
 [StructLayout(LayoutKind.Sequential)] struct SX {public SI startup;public IntPtr attributes;}
 [StructLayout(LayoutKind.Sequential)] struct PI {public IntPtr process,thread;public uint pid,tid;}
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateFileW(string name,uint access,uint share,ref SA security,uint creation,uint flags,IntPtr template);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool InitializeProcThreadAttributeList(IntPtr list,int count,uint flags,ref IntPtr bytes);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool UpdateProcThreadAttribute(IntPtr list,uint flags,IntPtr attribute,IntPtr value,IntPtr bytes,IntPtr previous,IntPtr returned);
 [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr list);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcessW(string app,StringBuilder command,IntPtr processSecurity,IntPtr threadSecurity,bool inherit,uint flags,IntPtr environment,string cwd,ref SX startup,out PI process);
 [DllImport("shell32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CommandLineToArgvW(string c,out int n);
 [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr p);
 [StructLayout(LayoutKind.Sequential,Pack=4)] struct FI {public uint attributes;public long birth,access,write;public uint volume,sh,sl,links,ih,il;}
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandle(IntPtr h,out FI f);
 static void Error(){throw new Win32Exception(Marshal.GetLastWin32Error());}
 public static void FileIdentity(FileStream s){FI f;if(!GetFileInformationByHandle(s.SafeFileHandle.DangerousGetHandle(),out f))Error();if(f.links!=1 || (f.attributes&0x400)!=0)throw new InvalidOperationException("owned_supervisor_file_identity");}
 public static IntPtr Open(int p,bool terminate){IntPtr h=OpenProcess(0x00100000|0x1000|(terminate?(uint)1:0),false,p);if(h==IntPtr.Zero)Error();return h;}
 public static object Identity(IntPtr h){uint pid=GetProcessId(h);long b=0,e=0,k=0,u=0;if(pid==0 || !GetProcessTimes(h,out b,out e,out k,out u))Error();StringBuilder p=new StringBuilder(32768);uint n=(uint)p.Capacity;if(!QueryFullProcessImageName(h,0,p,ref n))Error();return new {pid=(int)pid,birthFileTime=b.ToString(CultureInfo.InvariantCulture),birthUtc=DateTime.FromFileTimeUtc(b).ToString("yyyy-MM-ddTHH:mm:ss.fffffffZ",CultureInfo.InvariantCulture),imagePath=p.ToString()};}
 public static object Wait(IntPtr h,uint ms){uint w=WaitForSingleObject(h,ms);if(w==0){uint c;if(!GetExitCodeProcess(h,out c))Error();return new {waitResult="WAIT_OBJECT_0",signaled=true,exitCode=(long?)c};}if(w==258)return new {waitResult="WAIT_TIMEOUT",signaled=false,exitCode=(long?)null};Error();throw new InvalidOperationException("owned_supervisor_wait_invalid");}
 public static string[] Args(string command){int n;IntPtr p=CommandLineToArgvW(command,out n);if(p==IntPtr.Zero)Error();try{string[] a=new string[n];for(int i=0;i<n;i++)a[i]=Marshal.PtrToStringUni(Marshal.ReadIntPtr(p,i*IntPtr.Size));return a;}finally{LocalFree(p);}}
 public static string Hash(Stream f){f.Position=0;using(SHA256 s=SHA256.Create())return BitConverter.ToString(s.ComputeHash(f)).Replace("-","").ToLowerInvariant();}
 public static void Force(IntPtr h,string expiry,Action check){check();if(DateTimeOffset.UtcNow>=DateTimeOffset.Parse(expiry,CultureInfo.InvariantCulture))throw new InvalidOperationException("owned_supervisor_lease_expired");if(!TerminateProcess(h,0))Error();}
 public static void Dispose(IntPtr h){if(h!=IntPtr.Zero && !CloseHandle(h))Error();}
 public static IntPtr StartIndependent(string executable,string script,string cwd,IDictionary<string,string> environment){
  if(executable.IndexOfAny(new char[]{'"','\0','\r','\n'})>=0 || script.IndexOfAny(new char[]{'"','\0','\r','\n'})>=0)throw new InvalidOperationException("owned_supervisor_fixed_argv_invalid");
  IntPtr input=IntPtr.Zero,output=IntPtr.Zero,error=IntPtr.Zero,list=IntPtr.Zero,handles=IntPtr.Zero,block=IntPtr.Zero;bool initialized=false;
  try{SA security=new SA{nLength=Marshal.SizeOf(typeof(SA)),inherit=true};
   input=CreateFileW("NUL",0x80000000,3,ref security,3,0,IntPtr.Zero);if(input==new IntPtr(-1))Error();
   output=CreateFileW("NUL",0x40000000,3,ref security,3,0,IntPtr.Zero);if(output==new IntPtr(-1))Error();
   error=CreateFileW("NUL",0x40000000,3,ref security,3,0,IntPtr.Zero);if(error==new IntPtr(-1))Error();
   IntPtr bytes=IntPtr.Zero;InitializeProcThreadAttributeList(IntPtr.Zero,1,0,ref bytes);if(bytes==IntPtr.Zero)Error();list=Marshal.AllocHGlobal(bytes);if(!InitializeProcThreadAttributeList(list,1,0,ref bytes))Error();initialized=true;
   handles=Marshal.AllocHGlobal(IntPtr.Size*3);Marshal.WriteIntPtr(handles,0,input);Marshal.WriteIntPtr(handles,IntPtr.Size,output);Marshal.WriteIntPtr(handles,IntPtr.Size*2,error);
   if(!UpdateProcThreadAttribute(list,0,new IntPtr(0x20002),handles,new IntPtr(IntPtr.Size*3),IntPtr.Zero,IntPtr.Zero))Error();
   List<string> keys=new List<string>(environment.Keys);keys.Sort(StringComparer.OrdinalIgnoreCase);StringBuilder values=new StringBuilder();foreach(string key in keys){string value=environment[key];if(key.IndexOf('\0')>=0 || value==null || value.IndexOf('\0')>=0)throw new InvalidOperationException("owned_supervisor_environment_invalid");values.Append(key).Append('=').Append(value).Append('\0');}values.Append('\0');block=Marshal.StringToHGlobalUni(values.ToString());
   SX sx=new SX{startup=new SI{cb=(uint)Marshal.SizeOf(typeof(SX)),flags=0x101,show=0,input=input,output=output,error=error},attributes=list};PI pi;
   if(!CreateProcessW(executable,new StringBuilder("\""+executable+"\" \""+script+"\""),IntPtr.Zero,IntPtr.Zero,true,0x08000000|0x00000400|0x00080000,block,cwd,ref sx,out pi))Error();CloseHandle(pi.thread);return pi.process;
  }finally{foreach(IntPtr h in new IntPtr[]{input,output,error})if(h!=IntPtr.Zero && h!=new IntPtr(-1))CloseHandle(h);if(initialized)DeleteProcThreadAttributeList(list);foreach(IntPtr p in new IntPtr[]{list,handles,block})if(p!=IntPtr.Zero)Marshal.FreeHGlobal(p);}
 }
}
'@
function Emit($v){$v|ConvertTo-Json -Depth 40 -Compress;[Console]::Out.Flush()}
function Exact($v,[string[]]$keys){if ((($v.PSObject.Properties.Name|Sort-Object)-join ',') -cne (($keys|Sort-Object)-join ',')){throw 'owned_supervisor_rpc_schema'}}
function Canon($v){
 if($null -eq $v){return 'null'}
 if($v -is [string]){return ($v|ConvertTo-Json -Compress)}
 if($v -is [bool]){if($v){return 'true'}else{return 'false'}}
 if($v -is [ValueType]){return [Convert]::ToString($v,[Globalization.CultureInfo]::InvariantCulture)}
 if($v -is [Collections.IDictionary]){$keys=[string[]]@($v.Keys);[Array]::Sort($keys,[StringComparer]::Ordinal);return '{'+(($keys|ForEach-Object {(Canon $_)+':'+(Canon $v[$_])})-join ',')+'}'}
 if($v -is [Collections.IEnumerable]){return '['+(($v|ForEach-Object {Canon $_})-join ',')+']'}
 $values=@{};foreach($p in $v.PSObject.Properties){$values[$p.Name]=$p.Value};return Canon $values
}
function HashText([string]$text){$s=[IO.MemoryStream]::new([Text.Encoding]::UTF8.GetBytes($text));try{return [OwnedDaemonKernel]::Hash($s)}finally{$s.Dispose()}}
function SafeFile([string]$file,[bool]$image=$false){$p=[IO.Path]::GetFullPath($file);$a=$p;while($a -ne ''){if(((Get-Item -LiteralPath $a -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)-ne 0){throw 'owned_supervisor_reparse_refused'};$a=[IO.Path]::GetDirectoryName($a);if($null -eq $a){break}};$s=[IO.FileStream]::new($p,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read);try{[OwnedDaemonKernel]::FileIdentity($s);if($s.Length -gt $(if($image){1073741824}else{16777216})){throw 'owned_supervisor_file_budget'};return $s}catch{$s.Dispose();throw}}
function ReadJson([string]$file,[string]$rawPin=$null,[bool]$keep=$false){$s=SafeFile $file;try{if($rawPin -and [OwnedDaemonKernel]::Hash($s) -cne $rawPin){throw 'owned_supervisor_private_source_changed'};$s.Position=0;$reader=[IO.StreamReader]::new($s,[Text.UTF8Encoding]::new($false),$true,4096,$true);try{$v=$reader.ReadToEnd()|ConvertFrom-Json -DateKind String}finally{$reader.Dispose()};if($keep){$script:locks+=@($s);$s=$null};return $v}finally{if($null -ne $s){$s.Dispose()}}}
function Envelope([string]$file,[bool]$keep=$false){$v=ReadJson $file $null $keep;if($v.schema -cne 'ae-agent.owned-runtime-shutdown.v1.envelope' -or $v.sha256 -cne (HashText (Canon $v.value))){throw 'owned_supervisor_envelope_invalid'};return $v}
function WriteOnce([string]$file,$value){$row=@{schema='ae-agent.owned-runtime-shutdown.v1.envelope';sha256=(HashText (Canon $value));value=$value};$bytes=[Text.Encoding]::UTF8.GetBytes((Canon $row));$s=[IO.FileStream]::new($file,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read);try{$s.Write($bytes,0,$bytes.Length);$s.Flush($true)}finally{$s.Dispose()};return $row}
function ReleaseLocks{foreach($s in $script:locks){$s.Dispose()};$script:locks=@()}
function Config {
 # Reuse the accepted R1 parser AST from its exact immutable source pin.
 $file=Join-Path $repo 'scripts/owned-runtime-win32-helper.ps1';$s=SafeFile $file
 try{if([OwnedDaemonKernel]::Hash($s) -cne 'eab199fb33e42debc9f1d266711bc0e610bef6bcb57f02d7ed4b92e0618c9f4e'){throw 'owned_supervisor_r1_parser_changed'}}finally{$s.Dispose()}
 $errors=$null;$tokens=$null;$ast=[Management.Automation.Language.Parser]::ParseFile($file,[ref]$tokens,[ref]$errors);if($errors.Count){throw 'owned_supervisor_r1_parser_invalid'}
 $fn=$ast.Find({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -ceq 'ParseCredentialConfig'},$true);Invoke-Expression $fn.Extent.Text
 $s=SafeFile (Join-Path $repo '.codex/config.toml');try{$reader=[IO.StreamReader]::new($s,[Text.UTF8Encoding]::new($false),$true,4096,$true);try{$text=$reader.ReadToEnd()}finally{$reader.Dispose()};$token=ParseCredentialConfig $text $repo;$values=@{};$selected=$false
  foreach($line in ($text -replace '^\uFEFF','') -split '\r?\n'){if($line -match '^\s*\['){$selected=$line.Trim() -ceq '[mcp_servers."after-effects".env]';continue};if($selected -and $line -cmatch '^\s*([A-Z][A-Z0-9_]*)\s*=\s*("(?:[^"\\]|\\.)*")\s*(?:#.*)?$'){$values[$Matches[1]]=($Matches[2]|ConvertFrom-Json -DateKind String)}}
  $script:locks+=@($s);$s=$null;return @{token=$token;values=$values}
 }finally{if($null -ne $s){$s.Dispose()}}
}
function Policy($authorization){$p=ReadJson (Join-Path $base 'policy.json') $null $true;if($p.schema -cne 'ae-agent.owned-runtime-policy.v1' -or $p.enabled -cne $true -or $p.acceptedServerCoverage -cnotcontains 'owned_daemon_lifecycle' -or (Canon $p.authorization) -cne (Canon $authorization)){throw 'owned_supervisor_policy_disabled_or_changed'}}
function BootstrapIdle($value) {
  if ($null -eq $value) { return $false }
  $keys=@($value.PSObject.Properties.Name)
  if ($keys -contains 'stage' -and $value.stage -cne 'verified') { return $false }
  return ($value.busy -ceq $false -or ($keys -notcontains 'busy' -and $value.stage -ceq 'verified'))
}
function SafeInteger($value,[long]$minimum,[long]$maximum) {
 return (($value -is [int] -or $value -is [long] -or $value -is [uint32] -or $value -is [uint64]) -and $value -ge $minimum -and $value -le $maximum)
}
function ProcessBirth([string]$value) {
 if($value -cnotmatch '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{1,7}(Z|\+00:00)$'){throw 'owned_supervisor_legacy_original_proof_required'}
 $normalized=$value -replace '\+00:00$','Z';$normalized=[regex]::Replace($normalized,'\.(\d+)Z$',{param($m)'.'+$m.Groups[1].Value.PadRight(7,'0')+'Z'})
 return [DateTimeOffset]::ParseExact($normalized,"yyyy-MM-dd'T'HH:mm:ss.fffffff'Z'",[Globalization.CultureInfo]::InvariantCulture,[Globalization.DateTimeStyles]::AssumeUniversal)
}
function OriginalRetirementProof($retirement,$expected) {
 try{
  Exact $retirement @('schema','process','proof','nativeExecutionProven');Exact $expected @('pid','createdUnixMs','createdAt','path')
  $p=$retirement.process;$w=$retirement.proof;$keys=@('pid','createdUnixMs','createdAt','path');if(@($p.PSObject.Properties.Name) -contains 'createdFileTime'){$keys+=@('createdFileTime')};Exact $p $keys;Exact $w @('kind','waitResult','exitCode','handleOpenedAt','identityVerifiedAt','observedAt')
  if($retirement.schema -cne 'ae-agent.native-fixture-retirement-proof.v1' -or $retirement.nativeExecutionProven -isnot [bool] -or $retirement.nativeExecutionProven -cne $false -or $w.kind -cne 'held_process_handle_signaled' -or $w.waitResult -cne 'WAIT_OBJECT_0' -or !(SafeInteger $w.exitCode 0 4294967295) -or !(SafeInteger $p.pid 1 2147483647) -or !(SafeInteger $p.createdUnixMs 1 9007199254740991) -or !(SafeInteger $expected.pid 1 2147483647) -or !(SafeInteger $expected.createdUnixMs 1 9007199254740991) -or $p.pid -ne $expected.pid -or $p.createdUnixMs -ne $expected.createdUnixMs -or $p.path -isnot [string] -or $expected.path -isnot [string] -or [string]::IsNullOrEmpty($p.path) -or $p.path -ine $expected.path){throw 'owned_supervisor_legacy_original_proof_required'}
  $birth=ProcessBirth $p.createdAt;$launchBirth=ProcessBirth $expected.createdAt
  if($birth.UtcDateTime.Ticks -ne $launchBirth.UtcDateTime.Ticks -or $birth.ToUnixTimeMilliseconds() -ne $p.createdUnixMs -or $launchBirth.ToUnixTimeMilliseconds() -ne $expected.createdUnixMs){throw 'owned_supervisor_legacy_original_proof_required'}
  if($keys -contains 'createdFileTime' -and ($p.createdFileTime -isnot [string] -or $p.createdFileTime -cne $birth.UtcDateTime.ToFileTimeUtc().ToString([Globalization.CultureInfo]::InvariantCulture))){throw 'owned_supervisor_legacy_original_proof_required'}
  $opened=[DateTimeOffset]::Parse($w.handleOpenedAt,[Globalization.CultureInfo]::InvariantCulture);$verified=[DateTimeOffset]::Parse($w.identityVerifiedAt,[Globalization.CultureInfo]::InvariantCulture);$observed=[DateTimeOffset]::Parse($w.observedAt,[Globalization.CultureInfo]::InvariantCulture)
  if($opened.UtcDateTime.Ticks -lt $birth.UtcDateTime.Ticks -or $verified.UtcDateTime.Ticks -lt $opened.UtcDateTime.Ticks -or $observed.UtcDateTime.Ticks -lt $verified.UtcDateTime.Ticks){throw 'owned_supervisor_legacy_original_proof_required'}
  return $true
 }catch{throw 'owned_supervisor_legacy_original_proof_required'}
}
function AssertIdentity($expected){$actual=[OwnedDaemonKernel]::Identity($script:handle);if($actual.pid -ne $expected.pid -or $actual.birthFileTime -cne $expected.birthFileTime -or $actual.birthUtc -cne $expected.birthUtc -or $actual.imagePath -ine $expected.imagePath -or [OwnedDaemonKernel]::Hash($script:image) -cne $expected.executableSha256){throw 'owned_supervisor_identity_changed'};return $actual}
function AssertArgv($expected){if(([OwnedDaemonKernel]::Wait($script:handle,0)).signaled){return};$pidValue=([OwnedDaemonKernel]::Identity($script:handle)).pid;$cim=Get-CimInstance Win32_Process -Filter ('ProcessId='+$pidValue);if(!$cim -or $cim.ExecutablePath -ine $node -or (Canon ([OwnedDaemonKernel]::Args($cim.CommandLine))) -cne (Canon $expected)){throw 'owned_supervisor_argv_changed'}}
function OpenExact($identity,$argv,[bool]$terminate){$script:handle=[OwnedDaemonKernel]::Open([int]$identity.pid,$terminate);$script:image=SafeFile $identity.imagePath $true;[void](AssertIdentity $identity);AssertArgv $argv;$script:expected=$identity;$script:expectedArgv=$argv}
function Reservation([string]$generation,[bool]$fresh){if($generation -cnotmatch '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'){throw 'owned_supervisor_generation_invalid'};$dir=Join-Path $base ('daemon-reservations/'+$generation);$r=Envelope (Join-Path $dir 'reservation.json') $true;$v=$r.value;$t=Envelope (Join-Path $dir 'startup-ticket.json') $true
 if($v.schema -cne ($schema+'.reservation') -or $v.generation -cne $generation -or $v.command.executable -ine $node -or $v.command.executableSha256 -cne $nodeSha -or $v.command.cwd -ine $repo -or (Canon $v.command.argv) -cne (Canon @($node,(Join-Path $repo 'mcp-server/bridge-daemon.js'))) -or $v.replayAllowed -cne $false -or $t.value.schema -cne ($schema+'.startup-ticket') -or $t.value.generation -cne $generation -or $t.value.bootNonce -cne $v.bootNonce -or $t.value.reservationSha256 -cne $r.sha256 -or $t.value.replayAllowed -cne $false -or ($fresh -and ([DateTimeOffset]::UtcNow -ge [DateTimeOffset]::Parse($t.value.expiresAt) -or [DateTimeOffset]::UtcNow -lt [DateTimeOffset]::Parse($t.value.issuedAt)))){throw 'owned_supervisor_startup_ticket_invalid'}
 return @{reservation=$r;ticket=$t;dir=$dir}
}
function SourcePins($pins){foreach($pin in $pins){if($pin.name -cmatch '(^|[\\/])\.\.([\\/]|$)' -or [IO.Path]::IsPathRooted($pin.name)){throw 'owned_supervisor_source_path'};$s=SafeFile (Join-Path $repo $pin.name);if([OwnedDaemonKernel]::Hash($s) -cne $pin.sha256){$s.Dispose();throw 'owned_supervisor_source_changed'};$script:locks+=@($s)}}
function Hmac($value,[string]$token){$mac=[Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($token));try{return [Convert]::ToHexString($mac.ComputeHash([Text.Encoding]::UTF8.GetBytes((Canon $value)))).ToLowerInvariant()}finally{$mac.Dispose()}}
function AssertProtected($profile){foreach($protected in $profile.protected){if($protected.pid -eq $profile.daemon.identity.pid){throw 'owned_supervisor_protected_target'};$h=[OwnedDaemonKernel]::Open([int]$protected.pid,$false);try{$i=[OwnedDaemonKernel]::Identity($h);if($i.birthFileTime -cne $protected.birthFileTime -or $i.birthUtc -cne $protected.birthUtc -or $i.imagePath -ine $protected.imagePath -or ([OwnedDaemonKernel]::Wait($h,0)).signaled){throw 'owned_supervisor_protected_identity_changed'};$f=SafeFile $i.imagePath $true;try{if([OwnedDaemonKernel]::Hash($f) -cne $protected.executableSha256){throw 'owned_supervisor_protected_image_changed'}}finally{$f.Dispose()}}finally{[OwnedDaemonKernel]::Dispose($h)}}}
function LegacyLease([string]$operationId){
 $file=Join-Path $base 'profiles/bridge-daemon-migration-v1.json';$s=SafeFile $file;try{$raw=[OwnedDaemonKernel]::Hash($s);if($script:legacyRaw -and $raw -cne $script:legacyRaw){throw 'owned_supervisor_legacy_profile_changed'};$script:legacyRaw=$raw}finally{$s.Dispose()}
 $p=ReadJson $file $raw $true;if($p.schema -cne ($schema+'.legacy-profile') -or $p.profileId -cne 'bridge-daemon-migration-v1' -or $p.policy.transition -cne 'native_forced_legacy_transition' -or [DateTimeOffset]::UtcNow -ge [DateTimeOffset]::Parse($p.expiresAt) -or [DateTimeOffset]::UtcNow -lt [DateTimeOffset]::Parse($p.issuedAt) -or $p.daemon.port -ne 3456 -or $p.policy.waitMs -lt 1 -or $p.policy.waitMs -gt 10000){throw 'owned_supervisor_legacy_lease_refused'}
 Policy $p.authorizationRef;SourcePins $p.sourcePins;$config=Config;if((HashText $config.token) -cne $p.daemon.credentialSha256){throw 'owned_supervisor_legacy_credential_changed'}
 $next=Reservation $p.successor.generation $true;$script:successorExpiresAt=$next.ticket.value.expiresAt;$prepared=Envelope (Join-Path $base 'prepared-successor.json') $true
 if($next.reservation.sha256 -cne $p.successor.reservationSha256 -or $next.ticket.sha256 -cne $p.successor.startupTicketSha256 -or $next.reservation.value.bootNonce -cne $p.successor.bootNonce -or $next.reservation.value.sourceSha256 -cne $p.sourcePair.currentSourceSha256 -or (Canon $next.reservation.value.authorizationRef) -cne (Canon $p.authorizationRef) -or $prepared.value.generation -cne $p.successor.generation -or $prepared.value.targetGeneration -cne $p.generation -or $prepared.value.operationId -cne $next.reservation.value.operationId -or ($operationId -and $operationId -cne $next.reservation.value.operationId)){throw 'owned_supervisor_legacy_successor_changed'}
 $pins=@($p.launchReceipt,$p.capsule);foreach($c in $p.children){$pins+=@($c.launch,$c.retirementProof)};if(@($p.children).Count -ne 2){throw 'owned_supervisor_legacy_two_proofs_required'}
 foreach($pin in $pins){$resolved=[IO.Path]::GetFullPath($pin.path);if(!$resolved.StartsWith($repo+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'owned_supervisor_legacy_pin_path'};$row=ReadJson $resolved $pin.rawSha256 $true;if($row.sha256 -cne $pin.envelopeSha256){throw 'owned_supervisor_legacy_pin_changed'}}
 foreach($c in $p.children){$launch=ReadJson $c.launch.path $c.launch.rawSha256;$proof=ReadJson $c.retirementProof.path $c.retirementProof.rawSha256;[void](OriginalRetirementProof $proof.value $launch.value.process)}
 if($script:handle -ne [IntPtr]::Zero){[void](AssertIdentity $p.daemon.identity);AssertArgv $p.daemon.argv}
 AssertProtected $p
 $client=[Net.Http.HttpClient]::new();$client.Timeout=[TimeSpan]::FromSeconds(3);try{[void]$client.DefaultRequestHeaders.Add('x-ae-bridge-token',$config.token);$status=$client.GetStringAsync('http://127.0.0.1:3456/dev/status').GetAwaiter().GetResult()|ConvertFrom-Json -DateKind String;if(!$status.ok -or $status.humanGuardRuntime.pid -ne $p.daemon.identity.pid -or $status.humanGuardRuntime.sourceSha256 -cne $p.daemon.loadedRuntimeSha256 -or $status.startedAt -cne $p.daemon.startedAt -or $status.pendingCommands -ne 0 -or @($status.inflightCommands).Count -ne 0 -or $null -ne $status.activeEditSession -or $status.projectLifecycle.blocked -cne $false -or $status.projectLifecycle.pending -or !(BootstrapIdle $status.panelBootstrap)){throw 'owned_supervisor_legacy_quiescence_refused'}}finally{$client.Dispose()}
 if($operationId){$dir=Join-Path $base ('supervisor-operations/'+$operationId);$intent=Envelope (Join-Path $dir 'intent.json') $true;if($intent.value.targetGeneration -cne $p.generation -or $intent.value.command -cnotin @('restart','shutdown','ensure') -or $intent.value.desiredSourceSha256 -cne $p.sourcePair.currentSourceSha256 -or (Canon $intent.value.authorizationRef) -cne (Canon $p.authorizationRef) -or !(Test-Path -LiteralPath (Join-Path $dir 'pre-stop-inventory.json'))){throw 'owned_supervisor_legacy_intent_required'}}
 return $p
}
$script:handle=[IntPtr]::Zero;$script:image=$null;$script:locks=@();$script:mode=$null
try{while($null -ne ($line=[Console]::ReadLine())){try{
 if($line.Length -gt 65536){throw 'owned_supervisor_rpc_budget'};$row=$line|ConvertFrom-Json -DateKind String
 if($script:handle -eq [IntPtr]::Zero){
  if($row.op -eq 'launch'){
   Exact $row @('op','generation');$chain=Reservation $row.generation $true;$r=$chain.reservation.value;Policy $r.authorizationRef;SourcePins $r.sourcePins;$config=Config;if((HashText $config.token) -cne $r.credentialSha256){throw 'owned_supervisor_credential_changed'}
   if(@(Get-NetTCPConnection -State Listen -LocalPort 3456 -ErrorAction SilentlyContinue).Count -ne 0){throw 'owned_supervisor_endpoint_occupied'}
   $image=SafeFile $node $true;if([OwnedDaemonKernel]::Hash($image) -cne $nodeSha){$image.Dispose();throw 'owned_supervisor_node_pin_changed'}
   $info=[Diagnostics.ProcessStartInfo]::new($node);$info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden;$info.WorkingDirectory=$repo;[void]$info.ArgumentList.Add((Join-Path $repo 'mcp-server/bridge-daemon.js'))
   foreach($key in @($info.Environment.Keys)){if($key -match '^AE_BRIDGE_|^AE_OWNED_RUNTIME_'){$info.Environment.Remove($key)|Out-Null}};foreach($key in $config.values.Keys){$info.Environment[$key]=$config.values[$key]};$info.Environment['AE_BRIDGE_HOST']='127.0.0.1';$info.Environment['AE_BRIDGE_PORT']='3456';$info.Environment['AE_BRIDGE_LOG_DIR']=Join-Path $repo 'logs';$info.Environment['AE_OWNED_RUNTIME_GENERATION']=$r.generation;$info.Environment['AE_OWNED_RUNTIME_BOOT_NONCE']=$r.bootNonce
   if([DateTimeOffset]::UtcNow -ge [DateTimeOffset]::Parse($chain.ticket.value.expiresAt)){throw 'owned_supervisor_successor_expired'};$script:handle=[OwnedDaemonKernel]::StartIndependent($node,(Join-Path $repo 'mcp-server/bridge-daemon.js'),$repo,$info.Environment);$opened=[DateTimeOffset]::UtcNow.ToString('o');$identity=[OwnedDaemonKernel]::Identity($script:handle);$identity=$identity|ConvertTo-Json -Compress|ConvertFrom-Json -DateKind String;$identity|Add-Member executableSha256 $nodeSha;$script:image=$image;$script:expected=$identity;$script:expectedArgv=$r.command.argv;AssertArgv $r.command.argv
   $candidate=@{schema=$schema+'.native-candidate';generation=$r.generation;bootNonce=$r.bootNonce;reservationSha256=$chain.reservation.sha256;startupTicketSha256=$chain.ticket.sha256;kernelIdentity=$identity;argv=$r.command.argv;sourceSha256=$r.sourceSha256;heldLaunchWitness=@{kind='native_launch_held_process_handle';handleOpenedAt=$opened;identityVerifiedAt=[DateTimeOffset]::UtcNow.ToString('o')}};$signature=Hmac $candidate $config.token;$candidate.authentication=$signature;[void](WriteOnce (Join-Path $chain.dir 'native-candidate.json') $candidate);$script:mode='owned';ReleaseLocks;Emit @{ok=$true;identity=$identity};continue
  }
  if($row.op -eq 'open-owned'){
   Exact $row @('op','generation');$chain=Reservation $row.generation $false;$config=Config;$candidate=Envelope (Join-Path $chain.dir 'native-candidate.json');$c=$candidate.value;$signature=$c.authentication;$data=@{};foreach($p in $c.PSObject.Properties){if($p.Name -cne 'authentication'){$data[$p.Name]=$p.Value}}
   if($signature -cne (Hmac $data $config.token) -or $c.reservationSha256 -cne $chain.reservation.sha256 -or $c.startupTicketSha256 -cne $chain.ticket.sha256 -or $c.bootNonce -cne $chain.reservation.value.bootNonce){throw 'owned_supervisor_candidate_authentication'};OpenExact $c.kernelIdentity $c.argv $false;$script:mode='owned';ReleaseLocks;Emit @{ok=$true;identity=$c.kernelIdentity};continue
  }
  if($row.op -eq 'open-legacy'){Exact $row @('op');$p=LegacyLease $null;OpenExact $p.daemon.identity $p.daemon.argv $true;$script:mode='legacy';ReleaseLocks;Emit @{ok=$true;identity=$p.daemon.identity};continue}
  if($row.op -eq 'open-synthetic'){
   Exact $row @('op','nonce');if($row.nonce -cnotmatch '^[a-f0-9]{32}$'){throw 'owned_supervisor_synthetic_nonce'};$script:syntheticDir=Join-Path $base ('supervisor-synthetic-'+$row.nonce);$v=ReadJson (Join-Path $script:syntheticDir 'target.json');$argv=@($node,(Join-Path $script:syntheticDir 'fixture.js'))
   if($v.schema -cne ($schema+'.synthetic-target') -or $v.productionAuthority -cne $false -or (Canon $v.argv) -cne (Canon $argv) -or $v.identity.imagePath -ine $node -or $v.identity.executableSha256 -cne $nodeSha){throw 'owned_supervisor_synthetic_target'};OpenExact $v.identity $argv $true;$script:mode='synthetic';$script:syntheticRaw=HashText (Canon $v);ReleaseLocks;Emit @{ok=$true;identity=$v.identity};continue
  }
  throw 'owned_supervisor_named_open_required'
 }
 if($row.op -eq 'wait'){Exact $row @('op','milliseconds');if($row.milliseconds -lt 0 -or $row.milliseconds -gt 30000){throw 'owned_supervisor_wait_budget'};Emit @{ok=$true;wait=[OwnedDaemonKernel]::Wait($script:handle,[uint32]$row.milliseconds)};continue}
 if($row.op -eq 'dispose'){Exact $row @('op');Emit @{ok=$true};break}
 if($row.op -eq 'stop-legacy'){
  Exact $row @('op','operationId');if($script:mode -cne 'legacy' -or $script:stopped -or $row.operationId -cnotmatch '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'){throw 'owned_supervisor_distinct_legacy_authority_required'};$script:stopped=$true;$dir=Join-Path $base ('supervisor-operations/'+$row.operationId)
  $p=LegacyLease $row.operationId;$attempt=Join-Path $dir 'native-legacy-attempt.json';$result=Join-Path $dir 'native-legacy-result.json';if((Test-Path -LiteralPath $attempt)-or(Test-Path -LiteralPath $result)){throw 'owned_supervisor_legacy_consumed_readback_only'}
  [void](WriteOnce $attempt @{schema=$schema+'.native-legacy-attempt';identity=$p.daemon.identity;profileRawSha256=$script:legacyRaw;operationId=$row.operationId;attemptedAt=[DateTimeOffset]::UtcNow.ToString('o');replayAllowed=$false});[OwnedDaemonKernel]::Force($script:handle,$p.expiresAt,[Action]{AssertProtected $p;[void](AssertIdentity $script:expected);AssertArgv $script:expectedArgv;if([DateTimeOffset]::UtcNow -ge [DateTimeOffset]::Parse($script:successorExpiresAt)){throw 'owned_supervisor_successor_expired'}});$wait=[OwnedDaemonKernel]::Wait($script:handle,[uint32]$p.policy.waitMs)
  # Persist factual positive exit before any later lease/readback await.
  [void](WriteOnce $result @{schema=$schema+'.native-legacy-result';identity=$script:expected;wait=$wait;shutdownExitProven=$wait.signaled;replayAllowed=$false});ReleaseLocks;Emit @{ok=$true;wait=$wait};continue
 }
 if($row.op -eq 'stop-synthetic'){
  Exact $row @('op');if($script:mode -cne 'synthetic' -or $script:stopped){throw 'owned_supervisor_synthetic_effect_refused'};$script:stopped=$true;$v=ReadJson (Join-Path $script:syntheticDir 'target.json') $null $true;if((HashText (Canon $v)) -cne $script:syntheticRaw){throw 'owned_supervisor_synthetic_lease_changed'};[void](WriteOnce (Join-Path $script:syntheticDir 'attempt.json') @{identity=$script:expected;replayAllowed=$false});[OwnedDaemonKernel]::Force($script:handle,[DateTimeOffset]::UtcNow.AddSeconds(5).ToString('o'),[Action]{[void](AssertIdentity $script:expected);AssertArgv $script:expectedArgv});$wait=[OwnedDaemonKernel]::Wait($script:handle,3000);ReleaseLocks;Emit @{ok=$true;wait=$wait};continue
 }
 throw 'owned_supervisor_rpc_operation'
}catch{$reason=$_.Exception;while($reason.InnerException){$reason=$reason.InnerException};$code='owned_supervisor_native_refused';if($reason.Message -cmatch '^owned_[a-z0-9_]+$'){$code=$reason.Message};Emit @{ok=$false;code=$code};break}}}finally{ReleaseLocks;if($script:image){$script:image.Dispose()};if($script:process){$script:process.Dispose();$script:handle=[IntPtr]::Zero};if($script:handle -ne [IntPtr]::Zero){[OwnedDaemonKernel]::Dispose($script:handle)}}
