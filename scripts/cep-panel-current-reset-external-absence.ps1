# Fixed read-only observation after an external/manual close of the exact reset
# capture. Expected identities arrive only on stdin from the signed JS reducer.
# No process launch, close, termination, executable argument or arbitrary path.
[CmdletBinding(PositionalBinding = $false)]
param([switch]$CompileOnly)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$schema = 'ae-agent.current-reset-external-absence.v1'
$handles = [Collections.Generic.List[IntPtr]]::new()
function Emit($value) { $value | ConvertTo-Json -Depth 12 -Compress; [Console]::Out.Flush() }
function Exact($value, $names) {
    if ($null -eq $value -or (@($value.PSObject.Properties.Name | Sort-Object) -join ',') -cne (@($names | Sort-Object) -join ',')) { throw 'external_absence_contract_invalid' }
}
try {
    Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;
public static class ResetExternalAbsenceKernel {
    [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint rights,bool inherit,int pid);
    [DllImport("kernel32.dll",SetLastError=true)] static extern uint GetProcessId(IntPtr h);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetProcessTimes(IntPtr h,out long birth,out long exit,out long kernel,out long user);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool QueryFullProcessImageName(IntPtr h,uint flags,StringBuilder text,ref uint size);
    [DllImport("kernel32.dll",SetLastError=true)] static extern uint WaitForSingleObject(IntPtr h,uint ms);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr h,out uint code);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool CloseHandle(IntPtr h);
    public static IntPtr Open(int pid) { IntPtr h=OpenProcess(0x00100000|0x1000,false,pid);if(h==IntPtr.Zero)throw new Win32Exception(Marshal.GetLastWin32Error());return h; }
    public static Identity Read(IntPtr h) { uint pid=GetProcessId(h);long b,e,k,u;if(pid==0||!GetProcessTimes(h,out b,out e,out k,out u))throw new Win32Exception(Marshal.GetLastWin32Error());StringBuilder p=new StringBuilder(32768);uint n=(uint)p.Capacity;if(!QueryFullProcessImageName(h,0,p,ref n))throw new Win32Exception(Marshal.GetLastWin32Error());return new Identity{pid=checked((int)pid),birthFileTime=b.ToString(CultureInfo.InvariantCulture),birthUtc=DateTime.FromFileTimeUtc(b).ToString("yyyy-MM-ddTHH:mm:ss.fffffffZ",CultureInfo.InvariantCulture),imagePath=p.ToString()}; }
    public static bool Signaled(IntPtr h) {uint w=WaitForSingleObject(h,0);if(w==0)return true;if(w==258)return false;throw new Win32Exception(Marshal.GetLastWin32Error());}
    public static long ExitCode(IntPtr h) {uint code;if(!GetExitCodeProcess(h,out code))throw new Win32Exception(Marshal.GetLastWin32Error());return code;}
    public static void Close(IntPtr h) {if(h!=IntPtr.Zero&&!CloseHandle(h))throw new Win32Exception(Marshal.GetLastWin32Error());}
    public sealed class Identity { public int pid;public string birthFileTime,birthUtc,imagePath; }
}
'@
    if ($CompileOnly) { Emit @{schema=$schema;status='compiled';readOnly=$true;processEnumerationPerformed=$false}; return }
    $inputText = [Console]::In.ReadToEnd()
    if ([Text.Encoding]::UTF8.GetByteCount($inputText) -gt 65536) { throw 'external_absence_input_budget' }
    $request = $inputText | ConvertFrom-Json -DateKind String
    Exact $request @('schema','operationId','generation','expected')
    if ($request.schema -cne $schema -or $request.operationId -cnotmatch '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' -or $request.generation -cnotmatch '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$') { throw 'external_absence_exact_reset_required' }
    $expected = @($request.expected)
    if ($expected.Count -lt 2 -or $expected.Count -gt 256) { throw 'external_absence_capture_required' }
    $seen = @{}; $results = [Collections.Generic.List[object]]::new()
    foreach ($e in $expected) {
        Exact $e @('pid','birthFileTime','birthUtc','imagePath')
        if ($e.pid -isnot [ValueType] -or [double]$e.pid -ne [Math]::Floor([double]$e.pid) -or [double]$e.pid -lt 1 -or [double]$e.pid -gt 2147483647 -or $e.birthFileTime -isnot [string] -or $e.birthFileTime -cnotmatch '^[0-9]{17,19}$' -or $e.birthUtc -isnot [string] -or $e.imagePath -isnot [string]) { throw 'external_absence_identity_invalid' }
        $birth = [long]::Parse($e.birthFileTime,[Globalization.CultureInfo]::InvariantCulture)
        if ([DateTime]::FromFileTimeUtc($birth).ToString('yyyy-MM-ddTHH:mm:ss.fffffffZ',[Globalization.CultureInfo]::InvariantCulture) -cne $e.birthUtc -or ![IO.Path]::IsPathRooted($e.imagePath) -or $seen.ContainsKey([int]$e.pid)) { throw 'external_absence_identity_invalid' }
        $seen[[int]$e.pid] = $true
        if ($results.Count -eq 0 -and $e.imagePath -ine 'C:\Program Files\Adobe\Adobe After Effects 2026\Support Files\AfterFX.exe') { throw 'external_absence_fixed_host_required' }
        if ($results.Count -gt 0 -and [IO.Path]::GetFileName($e.imagePath) -ine 'CEPHtmlEngine.exe') { throw 'external_absence_cep_capture_required' }
        $handle = [IntPtr]::Zero; $nativeError = $null
        try { $handle = [ResetExternalAbsenceKernel]::Open([int]$e.pid) }
        catch { $reason=$_.Exception;while($reason.InnerException){$reason=$reason.InnerException};if($reason -is [ComponentModel.Win32Exception]){$nativeError=$reason.NativeErrorCode};if($nativeError -ne 87){throw 'external_absence_open_unknown_or_denied'} }
        if ($handle -eq [IntPtr]::Zero) { $results.Add(@{expected=$e;state='absent';actual=$null;win32Error=87}); continue }
        $handles.Add($handle)
        $actual = [ResetExternalAbsenceKernel]::Read($handle)
        if ($actual.pid -ne [int]$e.pid) { throw 'external_absence_pid_identity_invalid' }
        if ($actual.birthFileTime -cne $e.birthFileTime) { throw 'external_absence_pid_reused' }
        throw 'external_absence_expected_not_absent87'
    }
    for ($sample=0;$sample -lt 3;$sample++) {
        $rows = @(Get-CimInstance -ClassName Win32_Process -Property ProcessId,Name -OperationTimeoutSec 5 -ErrorAction Stop | Where-Object { $_.Name -ieq 'AfterFX.exe' -or $_.Name -ieq 'CEPHtmlEngine.exe' })
        if ($rows.Count -ne 0) { throw 'external_absence_global_context_present' }
        if ($sample -lt 2) { [Threading.Thread]::Sleep(500) }
    }
    Emit @{schema=$schema;status='observed';operationId=$request.operationId;generation=$request.generation;identities=@($results.ToArray());globalAeCepCensusEmpty=$true;quiescentSamples=3;observedAt=[DateTime]::UtcNow.ToString('o');readOnly=$true}
}
catch { $code='external_absence_observation_unknown';if($_.Exception.Message -cmatch '^external_absence_[a-z0-9_]+$'){$code=$_.Exception.Message};Emit @{schema=$schema;status='refused';code=$code;readOnly=$true};exit 1 }
finally { foreach($handle in $handles){try{[ResetExternalAbsenceKernel]::Close($handle)}catch{}} }
