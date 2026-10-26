# Offline managed ports around the ACTUAL loss dispatcher, main loop and emitters.
# Console.Out is never replaced or collected. The parent uses production createPipe.
param([ValidateSet('fixed','old-pipeline')] [string]$WireVariant='fixed')
$ErrorActionPreference='Stop'
$helper=Join-Path $PSScriptRoot 'owned-runtime-daemon-helper.ps1'
$errors=$null;$tokens=$null;$ast=[Management.Automation.Language.Parser]::ParseFile($helper,[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'stdout_fixture_parse'}
foreach($name in @('Exact','Canon','Emit','NativeFailure','AssertController','ReleaseLocks','ReleaseTarget','AssertIdentity')){
 $f=$ast.Find({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -ceq $name}.GetNewClosure(),$true)
 if(!$f){throw 'stdout_fixture_function'};. ([ScriptBlock]::Create($f.Extent.Text))
}
Add-Type -TypeDefinition @'
using System;using System.IO;
public static class OwnedDaemonKernel {
 public static int Starts,Disposes;
 public static string Hash(Stream s){return new string('a',64);}
 public static IntPtr StartIndependent(string n,string f,string r,object e){Starts++;return new IntPtr(42);}
 public static object Identity(IntPtr h){return new {pid=h.ToInt64()==9001?9001:123,birthFileTime="1",birthUtc="2026-01-01T00:00:00.0000000Z",imagePath="C:/fixture-pwsh.exe"};}
 public static object Wait(IntPtr h,int ms){return new {signaled=false,waitResult="WAIT_TIMEOUT",exitCode=(int?)null};}
 public static bool IsInAnyJob(IntPtr h){return false;}
 public static IntPtr Open(int pid,bool terminate){return new IntPtr(pid);}
 public static string[] Args(string text){return new string[]{"managed-fixture"};}
 public static void Dispose(IntPtr h){Disposes++;}
}
public class ManagedLossMutex {
 public ManagedLossMutex(bool owned,string name){} public bool WaitOne(int ms){return true;}
 public void ReleaseMutex(){} public void Dispose(){}
}
public class ProgressInput:TextReader {
 TextReader original;int reads;
 public ProgressInput(TextReader value){original=value;}
 public override string ReadLine(){Console.Error.WriteLine("fixture-read:"+(++reads));Console.Error.Flush();return original.ReadLine();}
}
'@
$module=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'core-owned-loss-native.ps1')).Replace('[Threading.Mutex]::new','[ManagedLossMutex]::new')
# Reproduce the old calls to the unchanged production Emit, with no emitter mock.
if($WireVariant -ceq 'old-pipeline'){$module=$module.Replace('LossEmit @{','Emit @{')}
. ([ScriptBlock]::Create($module))
$repo='C:/synthetic-never-existing-loss-stdout';$base=Join-Path $repo '.codex-runtime/owned-runtime-maintenance';$node='C:/fixture-node.exe';$nodeSha='a'*64;$schema='ae-agent.owned-runtime-supervisor.v1'
$script:handle=[IntPtr]::Zero;$script:image=$null;$script:locks=@();$script:mode=$null;$script:process=$null
$script:controllerMutex=$null;$script:controllerOwned=$false;$script:sourceControllerMutex=$null;$script:sourceControllerOwned=$false;$script:migration=$false
$generation='22222222-2222-4222-8222-222222222222';$script:fixtureWrites=0
function LossOriginal {$script:lossDir=Join-Path $repo 'loss';return @{}}
function LossParent($mode){$script:lossOwnerPid=1000}
function LossPreflight([bool]$withBinding=$false){LossAssertPair}
function LossCodeRepair([bool]$fresh=$false){return @{runtime=@{}}}
function LossBinding([bool]$fresh=$false){return @{generation=$generation;reservation=@{sha256=('a'*64)};ticket=@{sha256=('a'*64)};runtime=@{pwsh=@{executable='C:/fixture-pwsh.exe';sha256=('a'*64)}}}}
function LossRaw([string]$name){return 'a'*64}
function LossRead([string]$name){
 switch($name){
  'edge'{return @{successorGeneration=$generation;bindingRawSha256=('a'*64);exitProven=$false}}
  'observer-captured'{return @{bindingRawSha256=('a'*64);identity=$script:expected;observerSessionId='88888888-8888-4888-8888-888888888888';observerIdentity=@{pid=9001;birthFileTime='1';birthUtc='2026-01-01T00:00:00.0000000Z';imagePath='C:/fixture-pwsh.exe';executableSha256=('a'*64)};observerArgv=@('managed-fixture')}}
  'redirect-complete'{return @{generation=$generation;bindingRawSha256=('a'*64);survivalRawSha256=('a'*64)}}
  'survival'{return @{observerSessionId=$script:lossSession;pairSessionId=$script:lossPairSession}}
  default{return @{}}
 }
}
function LossWrite([string]$name,$value){$script:fixtureWrites++;return 'a'*64}
function LossObserverIdentity{return @{pid=9001}}
function HashText($text){return 'a'*64}
function Test-Path {param($LiteralPath);return ($script:handle -ne [IntPtr]::Zero -and $LiteralPath.EndsWith('launch-binding.json'))}
function Get-CimInstance {param($ClassName,$Filter,$ErrorAction);return @{ParentProcessId=$PID;CommandLine='managed-fixture'}}
function Envelope($file){if($file.EndsWith('native-candidate.json')){return @{value=@{kernelIdentity=@{pid=123;birthFileTime='1';birthUtc='2026-01-01T00:00:00.0000000Z';imagePath='C:/fixture-pwsh.exe';executableSha256=('a'*64)};argv=@('managed-fixture')}}};return @{value=@{generation=$generation}}}
function OpenExact($identity,$argv,$force){$script:handle=[IntPtr]42;$script:expected=$identity;$script:image=[IO.MemoryStream]::new()}
function AssertPrestartSignature($value,$token){}
function Reservation($g,$fresh){return @{dir=Join-Path $repo 'reservation';reservation=@{sha256=('a'*64);value=@{generation=$g;bootNonce='44444444-4444-4444-8444-444444444444';credentialSha256=('a'*64);sourceSha256=('a'*64);authorizationRef=@{};command=@{argv=@('managed-fixture')}}};ticket=@{sha256=('a'*64);value=@{expiresAt=[DateTimeOffset]::UtcNow.AddMinutes(1).ToString('o')}}}}
function Config{return @{token='fixture';values=@{}}}
function Policy($v){}
function SourcePins($v){}
function EndpointFree{return $true}
function SafeFile($file,$image){return [IO.MemoryStream]::new()}
function AssertProductDeployment($env){return 'product'}
function AssertActivationSuccessorConfiguration($r,$token,$env){}
function AssertArgv($argv){}
function Hmac($v,$token){return 'a'*64}
function WriteOnce($file,$value){return @{}}
$loop=[IO.File]::ReadAllText($helper);$loop=$loop.Substring($loop.IndexOf('try{while($null -ne ($line=[Console]::ReadLine()))'))
[Console]::SetIn([ProgressInput]::new([Console]::In))
try{. ([ScriptBlock]::Create($loop))}finally{[Console]::Error.WriteLine('fixture-stats:'+(ConvertTo-Json -Compress @{starts=[OwnedDaemonKernel]::Starts;disposes=[OwnedDaemonKernel]::Disposes;writes=$script:fixtureWrites}));[Console]::Error.Flush()}
