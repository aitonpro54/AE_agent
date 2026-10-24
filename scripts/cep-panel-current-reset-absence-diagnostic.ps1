# Diagnostic evidence only: no grant, CONTROL adoption, AE script or state write.
[CmdletBinding(PositionalBinding=$false)]
param([switch]$CompileOnly,[switch]$ProjectionOnly)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false);[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$schema='ae-agent.current-reset-absence-diagnostic.v1'
function Emit($value){$value|ConvertTo-Json -Compress -Depth 16;[Console]::Out.Flush()}
function Chain($reason){$rows=@();for($n=0;$null -ne $reason -and $n -lt 8;$n++){$native=$null;if($reason -is [ComponentModel.Win32Exception]){$native=$reason.NativeErrorCode};$rows+=@{type=$reason.GetType().FullName;hresult=$reason.HResult;nativeErrorCode=$native};$reason=$reason.InnerException};return ,$rows}
function Exact($value,$names){if($null -eq $value -or (@($value.PSObject.Properties.Name|Sort-Object)-join ',') -cne (@($names|Sort-Object)-join ',')){throw 'diagnostic_input_invalid'}}
try{
 Add-Type -TypeDefinition @'
using System;using System.ComponentModel;using System.Globalization;using System.Runtime.InteropServices;using System.Text;
public static class ResetAbsenceDiagnosticKernel {
 [DllImport("kernel32.dll",SetLastError=true)]static extern IntPtr OpenProcess(uint rights,bool inherit,int pid);
 [DllImport("kernel32.dll",SetLastError=true)]static extern uint GetProcessId(IntPtr handle);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool GetProcessTimes(IntPtr handle,out long birth,out long exit,out long kernel,out long user);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool QueryFullProcessImageName(IntPtr handle,uint flags,StringBuilder path,ref uint size);
 [DllImport("kernel32.dll",SetLastError=true)]static extern uint WaitForSingleObject(IntPtr handle,uint timeout);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool GetExitCodeProcess(IntPtr handle,out uint code);
 [DllImport("kernel32.dll",SetLastError=true)]static extern bool CloseHandle(IntPtr handle);
 public sealed class Identity {public int pid;public string birthFileTime,birthUtc,imagePath;}
 public sealed class Observation {public bool openSucceeded;public int openWin32Error;public Identity actual;public string waitResult;public long? exitCode;public Exception queryException;}
 public static Observation Observe(int pid){
  IntPtr h=OpenProcess(0x00100000|0x1000,false,pid);int immediateError=Marshal.GetLastWin32Error();
  Observation result=new Observation{openSucceeded=h!=IntPtr.Zero,openWin32Error=h==IntPtr.Zero?immediateError:0};if(h==IntPtr.Zero)return result;
  try{uint id=GetProcessId(h);long b,e,k,u;if(id==0||!GetProcessTimes(h,out b,out e,out k,out u))throw new Win32Exception(Marshal.GetLastWin32Error());StringBuilder path=new StringBuilder(32768);uint n=(uint)path.Capacity;if(!QueryFullProcessImageName(h,0,path,ref n))throw new Win32Exception(Marshal.GetLastWin32Error());result.actual=new Identity{pid=checked((int)id),birthFileTime=b.ToString(CultureInfo.InvariantCulture),birthUtc=DateTime.FromFileTimeUtc(b).ToString("yyyy-MM-ddTHH:mm:ss.fffffffZ",CultureInfo.InvariantCulture),imagePath=path.ToString()};uint wait=WaitForSingleObject(h,0);result.waitResult=wait==0?"WAIT_OBJECT_0":wait==258?"WAIT_TIMEOUT":"WAIT_FAILED";if(wait==0){uint code;if(!GetExitCodeProcess(h,out code))throw new Win32Exception(Marshal.GetLastWin32Error());result.exitCode=code;}else if(wait!=258)throw new Win32Exception(Marshal.GetLastWin32Error());}
  catch(Exception error){result.queryException=error;}finally{CloseHandle(h);}return result;
 }
 public static IntPtr Synthetic(int code){throw new Win32Exception(code);}
}
'@
 if($CompileOnly){Emit @{schema=$schema;status='compiled';readOnly=$true;adoptionAllowed=$false;nativeQueries=0};return}
 if($ProjectionOnly){$rows=@();foreach($code in @(87,5)){try{[void][ResetAbsenceDiagnosticKernel]::Synthetic($code)}catch{$rows+=@{expectedCode=$code;exceptions=(Chain $_.Exception)}}};Emit @{schema=$schema;readOnly=$true;adoptionAllowed=$false;nativeQueries=0;projections=$rows};return}
 $raw=[Console]::In.ReadToEnd();if([Text.Encoding]::UTF8.GetByteCount($raw)-gt 65536){throw 'diagnostic_input_budget'};$request=$raw|ConvertFrom-Json -DateKind String
 Exact $request @('schema','operationId','generation','expected');if($request.schema -cne $schema -or $request.operationId -cnotmatch '^[a-f0-9-]{36}$' -or $request.generation -cnotmatch '^[a-f0-9-]{36}$'){throw 'diagnostic_binding_invalid'}
 $expected=@($request.expected);if($expected.Count-lt 2 -or $expected.Count-gt 256){throw 'diagnostic_identity_budget'};$seen=@{};$rows=@();$firstFailure=$null
 foreach($e in $expected){Exact $e @('pid','birthFileTime','birthUtc','imagePath');if($e.pid -isnot [ValueType] -or [double]$e.pid-ne [Math]::Floor([double]$e.pid) -or $e.pid-lt 1 -or $e.pid-gt 2147483647 -or $e.birthFileTime -cnotmatch '^[0-9]{17,19}$' -or $e.birthUtc -isnot [string] -or $e.imagePath -isnot [string] -or $seen.ContainsKey([int]$e.pid)){throw 'diagnostic_identity_invalid'};$seen[[int]$e.pid]=$true
  $observation=$null;$exceptions=@();$state='unexpected_exception'
  try{$value=[ResetAbsenceDiagnosticKernel]::Observe([int]$e.pid);$exceptions=Chain $value.queryException;$observation=@{openSucceeded=$value.openSucceeded;openWin32Error=$value.openWin32Error;actual=$value.actual;waitResult=$value.waitResult;exitCode=$value.exitCode};if(!$value.openSucceeded){$state=$(if($value.openWin32Error-eq 87){'absent87'}else{'open_failed'})}elseif($exceptions.Count){$state='query_exception'}elseif($value.actual.birthFileTime-cne $e.birthFileTime -or $value.actual.imagePath-ine $e.imagePath){$state='pid_reused'}else{$state='opened_exact'}}catch{$exceptions=Chain $_.Exception}
  if($null-eq $firstFailure -and $state-cne 'absent87'){$firstFailure=$rows.Count};$rows+=@{expected=$e;state=$state;observation=$observation;exceptions=$exceptions}
 }
 $sha=[Security.Cryptography.SHA256]::Create();try{$inputSha=([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($raw)))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
 Emit @{schema=$schema;status='diagnostic_observed';operationId=$request.operationId;generation=$request.generation;inputSha256=$inputSha;rows=$rows;firstFailureIndex=$firstFailure;observedAt=[DateTime]::UtcNow.ToString('o');readOnly=$true;adoptionAllowed=$false}
}catch{Emit @{schema=$schema;status='diagnostic_refused';exceptions=(Chain $_.Exception);readOnly=$true;adoptionAllowed=$false};exit 1}
