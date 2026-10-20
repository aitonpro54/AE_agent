# Private, fixed read-only witness for the current product reset repair.
# The caller closes AE gracefully only after persisting ready. This helper never
# closes windows, sends input, launches processes, terminates processes or writes
# AE state. JSONL is evidence for the private journal, not reset authorization.
[CmdletBinding(PositionalBinding = $false)]
param(
    [switch]$CompileOnly,
    [ValidateRange(1000, 300000)][int]$MaxWaitMs = 300000
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$script:schema = 'ae-agent.cep-reset-physical-fence.v1'
$script:fixedImage = 'C:\Program Files\Adobe\Adobe After Effects 2026\Support Files\AfterFX.exe'
$script:held = @{}
$script:ready = $false
$script:rootPid = 0
$script:clock = [Diagnostics.Stopwatch]::StartNew()

function Emit($value) {
    $value | ConvertTo-Json -Depth 12 -Compress
    [Console]::Out.Flush()
}

function UtcNow { return [DateTime]::UtcNow.ToString('o') }

function Check-Budget {
    if ($script:clock.ElapsedMilliseconds -ge $MaxWaitMs) { throw 'physical_fence_timeout' }
}

function Get-Census {
    Check-Budget
    # No command lines, credentials, environment or endpoint-derived identity.
    $rows = @(Get-CimInstance -ClassName Win32_Process -Property ProcessId, ParentProcessId, Name, CreationDate, ExecutablePath -OperationTimeoutSec 5 -ErrorAction Stop)
    Check-Budget
    if ($rows.Count -gt 65536) { throw 'physical_fence_census_budget' }
    $seen = @{}
    foreach ($row in $rows) {
        $key = [int]$row.ProcessId
        if ($seen.ContainsKey($key)) { throw 'physical_fence_duplicate_pid' }
        $seen[$key] = $true
    }
    return $rows
}

function Assert-CimIdentity($row, $identity) {
    if ($null -eq $row.CreationDate -or [string]::IsNullOrWhiteSpace([string]$row.ExecutablePath)) { throw 'physical_fence_cim_identity_unknown' }
    $cimBirth = ([DateTime]$row.CreationDate).ToUniversalTime().ToFileTimeUtc()
    $nativeBirth = [long]::Parse($identity.birthFileTimeUtc, [Globalization.CultureInfo]::InvariantCulture)
    # CIM_DATETIME has microsecond resolution; the retained native value has 100ns.
    if ([long][Math]::Floor($cimBirth / 10D) -ne [long][Math]::Floor($nativeBirth / 10D) -or
        [int]$row.ProcessId -ne $identity.pid -or
        [string]$row.ExecutablePath -ine $identity.imagePath -or
        [IO.Path]::GetFileName($identity.imagePath) -ine [string]$row.Name) {
        throw 'physical_fence_identity_race'
    }
}

function Add-Held($row) {
    Check-Budget
    $key = [int]$row.ProcessId
    if ($script:held.ContainsKey($key)) {
        $entry = $script:held[$key]
        Assert-CimIdentity $row $entry.identity
        if ([int]$row.ParentProcessId -ne $entry.parentPid) { throw 'physical_fence_parent_changed' }
        return
    }
    if ($script:held.Count -ge 256) { throw 'physical_fence_descendant_budget' }
    $handle = [IntPtr]::Zero
    try {
        $handle = [CepResetPhysicalFenceKernel]::Open($key)
        $identity = [CepResetPhysicalFenceKernel]::Identity($handle)
        Assert-CimIdentity $row $identity
        $entry = @{
            handle = $handle; identity = $identity; parentPid = [int]$row.ParentProcessId
            name = [string]$row.Name; handleOpenedAt = UtcNow; exit = $null; exitObservedAt = $null
        }
        $script:held[$key] = $entry
        $handle = [IntPtr]::Zero
    }
    finally {
        if ($handle -ne [IntPtr]::Zero) { [CepResetPhysicalFenceKernel]::Close($handle) }
    }
}

function Update-ExitWitnesses {
    foreach ($entry in $script:held.Values) {
        if ($null -eq $entry.exit) {
            $wait = [CepResetPhysicalFenceKernel]::Poll($entry.handle)
            if ($wait.signaled) { $entry.exit = $wait; $entry.exitObservedAt = UtcNow }
        }
    }
}

function Reconcile-Census($rows) {
    Update-ExitWitnesses
    # Expand through all descendants, including non-CEP intermediates. Keep their
    # handles too: a live intermediate must not outlive a completed fence.
    $changed = $true
    while ($changed) {
        $changed = $false
        foreach ($row in $rows) {
            $key = [int]$row.ProcessId
            if ($script:held.ContainsKey($key)) { Add-Held $row; continue }
            $parentKey = [int]$row.ParentProcessId
            if (!$script:held.ContainsKey($parentKey)) { continue }
            $parent = $script:held[$parentKey]
            if ($null -eq $row.CreationDate) { throw 'physical_fence_child_birth_unknown' }
            $childBirth = ([DateTime]$row.CreationDate).ToUniversalTime().ToFileTimeUtc()
            $parentBirth = [long]::Parse($parent.identity.birthFileTimeUtc, [Globalization.CultureInfo]::InvariantCulture)
            if ($childBirth -lt ($parentBirth - 9) -or
                ($null -ne $parent.exit -and $childBirth -gt [long]::Parse($parent.exit.exitFileTimeUtc, [Globalization.CultureInfo]::InvariantCulture))) {
                throw 'physical_fence_parent_identity_ambiguous'
            }
            Add-Held $row
            $changed = $true
        }
    }
    foreach ($row in $rows) {
        if ($row.Name -ieq 'AfterFX.exe' -and [int]$row.ProcessId -ne $script:rootPid) { throw 'physical_fence_other_ae_context' }
        # Fail closed for foreign/orphan CEP, including engines whose host or
        # intermediate parent disappeared between scans. Never close foreign apps.
        if ($row.Name -ieq 'CEPHtmlEngine.exe' -and !$script:held.ContainsKey([int]$row.ProcessId)) {
            throw 'physical_fence_unassociated_cep_context'
        }
    }
    Update-ExitWitnesses
}

function Public-Process($entry, [bool]$completed) {
    $value = [ordered]@{
        pid = $entry.identity.pid; parentPid = $entry.parentPid; name = $entry.name
        birthFileTimeUtc = $entry.identity.birthFileTimeUtc; birthUtc = $entry.identity.birthUtc
        imagePath = $entry.identity.imagePath; handleOpenedAt = $entry.handleOpenedAt
    }
    if ($completed) {
        if ($null -eq $entry.exit -or !$entry.exit.signaled) { throw 'physical_fence_exit_not_proven' }
        $value.waitResult = $entry.exit.waitResult
        $value.signaled = $true
        $value.exitCode = $entry.exit.exitCode
        $value.exitFileTimeUtc = $entry.exit.exitFileTimeUtc
        $value.exitObservedAt = $entry.exitObservedAt
    }
    return $value
}

function Public-Group([string]$kind, [bool]$completed) {
    foreach ($key in @($script:held.Keys | Sort-Object)) {
        $entry = $script:held[$key]
        if ($key -eq $script:rootPid) { continue }
        if (($kind -ceq 'cep' -and $entry.name -ieq 'CEPHtmlEngine.exe') -or
            ($kind -ceq 'lineage' -and $entry.name -ine 'CEPHtmlEngine.exe')) {
            Public-Process $entry $completed
        }
    }
}

try {
    Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;
public static class CepResetPhysicalFenceKernel {
    [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
    [DllImport("kernel32.dll", SetLastError=true)] static extern uint GetProcessId(IntPtr handle);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetProcessTimes(IntPtr handle, out long birth, out long exit, out long kernel, out long user);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool QueryFullProcessImageName(IntPtr handle, uint flags, StringBuilder path, ref uint size);
    [DllImport("kernel32.dll", SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr handle, out uint exitCode);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool CloseHandle(IntPtr handle);
    static void Fail(string code) { throw new InvalidOperationException(code, new Win32Exception(Marshal.GetLastWin32Error())); }
    public static IntPtr Open(int pid) {
        // SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION. No write/terminate right.
        IntPtr handle = OpenProcess(0x00100000 | 0x1000, false, pid);
        if (handle == IntPtr.Zero) Fail("physical_fence_open_failed");
        return handle;
    }
    public static ProcessIdentity Identity(IntPtr handle) {
        uint pid = GetProcessId(handle); long birth, exit, kernel, user;
        if (pid == 0 || !GetProcessTimes(handle, out birth, out exit, out kernel, out user)) { Fail("physical_fence_identity_failed"); throw new InvalidOperationException(); }
        StringBuilder path = new StringBuilder(32768); uint size = (uint)path.Capacity;
        if (!QueryFullProcessImageName(handle, 0, path, ref size)) Fail("physical_fence_image_failed");
        uint code; if (!GetExitCodeProcess(handle, out code)) Fail("physical_fence_exit_code_failed");
        return new ProcessIdentity { pid = checked((int)pid), birthFileTimeUtc = birth.ToString(CultureInfo.InvariantCulture), birthUtc = DateTime.FromFileTimeUtc(birth).ToString("yyyy-MM-ddTHH:mm:ss.fffffffZ", CultureInfo.InvariantCulture), imagePath = path.ToString() };
    }
    public static ExitWitness Poll(IntPtr handle) {
        uint wait = WaitForSingleObject(handle, 0);
        if (wait == 258) return new ExitWitness { signaled = false, waitResult = "WAIT_TIMEOUT" };
        if (wait != 0) { Fail("physical_fence_wait_failed"); throw new InvalidOperationException(); }
        uint code; long birth, exit, kernel, user;
        if (!GetExitCodeProcess(handle, out code)) { Fail("physical_fence_exit_code_failed"); throw new InvalidOperationException(); }
        if (!GetProcessTimes(handle, out birth, out exit, out kernel, out user)) { Fail("physical_fence_exit_time_failed"); throw new InvalidOperationException(); }
        if (exit <= 0) throw new InvalidOperationException("physical_fence_exit_time_unknown");
        return new ExitWitness { signaled = true, waitResult = "WAIT_OBJECT_0", exitCode = code, exitFileTimeUtc = exit.ToString(CultureInfo.InvariantCulture) };
    }
    public static void Close(IntPtr handle) { if (handle != IntPtr.Zero && !CloseHandle(handle)) Fail("physical_fence_close_failed"); }
    public sealed class ProcessIdentity { public int pid; public string birthFileTimeUtc, birthUtc, imagePath; }
    public sealed class ExitWitness { public bool signaled; public string waitResult, exitFileTimeUtc; public long exitCode; }
}
'@
    if ($CompileOnly) {
        Emit @{ schema = $script:schema; status = 'compiled'; readOnly = $true; processEnumerationPerformed = $false }
        return
    }
    $rows = @(Get-Census)
    $roots = @($rows | Where-Object { $_.Name -ieq 'AfterFX.exe' })
    if ($roots.Count -ne 1) { throw 'physical_fence_sole_ae_required' }
    if ([string]$roots[0].ExecutablePath -ine $script:fixedImage) { throw 'physical_fence_fixed_ae_image_required' }
    $script:rootPid = [int]$roots[0].ProcessId
    Add-Held $roots[0]
    if ($script:held[$script:rootPid].identity.imagePath -ine $script:fixedImage) { throw 'physical_fence_fixed_ae_image_required' }
    # Two stable post-bind inventories before ready; every handle is retained.
    $stable = 0
    for ($attempt = 0; $attempt -lt 16 -and $stable -lt 2; $attempt++) {
        $before = $script:held.Count
        Reconcile-Census $rows
        if ($script:held.Count -eq $before) { $stable++ } else { $stable = 0 }
        if ($null -ne $script:held[$script:rootPid].exit) { throw 'physical_fence_ae_exited_before_ready' }
        if ($stable -lt 2) { [Threading.Thread]::Sleep(100); $rows = @(Get-Census) }
    }
    if ($stable -lt 2) { throw 'physical_fence_initial_tree_unstable' }
    $readyAt = UtcNow
    Emit ([ordered]@{
        schema = $script:schema; status = 'ready'; observedAt = $readyAt
        root = (Public-Process $script:held[$script:rootPid] $false)
        cep = @(Public-Group 'cep' $false); lineage = @(Public-Group 'lineage' $false)
        heldHandleCount = $script:held.Count; readOnly = $true
    })
    $script:ready = $true
    $quietSamples = 0
    while ($true) {
        [Threading.Thread]::Sleep(500)
        $rows = @(Get-Census)
        Reconcile-Census $rows
        $alive = @($script:held.Values | Where-Object { $null -eq $_.exit })
        $globalContexts = @($rows | Where-Object { $_.Name -ieq 'AfterFX.exe' -or $_.Name -ieq 'CEPHtmlEngine.exe' })
        if ($alive.Count -eq 0 -and $globalContexts.Count -eq 0) { $quietSamples++ } else { $quietSamples = 0 }
        if ($quietSamples -ge 3) { break }
    }
    Emit ([ordered]@{
        schema = $script:schema; status = 'completed'; readyAt = $readyAt; completedAt = UtcNow
        root = (Public-Process $script:held[$script:rootPid] $true)
        cep = @(Public-Group 'cep' $true); lineage = @(Public-Group 'lineage' $true)
        heldHandleCount = $script:held.Count; treeQuiescent = $true; quiescentSamples = $quietSamples
        globalAeCepCensusEmpty = $true; readOnly = $true
    })
}
catch {
    $reason = $_.Exception
    $code = 'physical_fence_observation_unknown'
    $nativeError = $null
    while ($null -ne $reason) {
        if ($reason.Message -cmatch '^physical_fence_[a-z0-9_]+$') { $code = $reason.Message }
        if ($reason -is [ComponentModel.Win32Exception]) { $nativeError = $reason.NativeErrorCode }
        $reason = $reason.InnerException
    }
    Emit @{ schema = $script:schema; status = $(if ($script:ready) { 'unknown' } else { 'refused' }); code = $code; win32Error = $nativeError; observedAt = UtcNow; readOnly = $true }
    exit 1
}
finally {
    # Best effort for every handle, including partial setup. Never stop at one error.
    foreach ($entry in $script:held.Values) {
        try { [CepResetPhysicalFenceKernel]::Close($entry.handle) } catch { }
    }
    $script:clock.Stop()
}
