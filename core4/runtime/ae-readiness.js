'use strict';
const { execFile } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');

// Package-pinned, read-only command. Reuses the PID-bound EnumWindows pattern
// in scripts/owned-runtime-win32-helper.ps1 without window control or process handles.
const WINDOWS_QUERY = String.raw`$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

function Get-AeProcesses {
    @(Get-Process -ErrorAction Stop | Where-Object { $_.ProcessName -eq 'AfterFX' })
}

$processes = @(Get-AeProcesses)
$result = [ordered]@{ state = 'absent'; pid = $null; birth = $null; dialogs = @() }
if ($processes.Count -gt 1) { $result.state = 'ambiguous' }
if ($processes.Count -eq 1) {
    $aeProcess = $processes[0]
    $result.pid = $aeProcess.Id
    $result.birth = $aeProcess.StartTime.ToUniversalTime().ToString('o')
    $result.state = 'window-unobserved'
    if ($aeProcess.SessionId -eq [Diagnostics.Process]::GetCurrentProcess().SessionId -and $aeProcess.SessionId -ne 0) {
        Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class Core4Windows {
    private delegate bool Callback(IntPtr window, IntPtr unused);
    [DllImport("user32.dll")] private static extern bool EnumWindows(Callback callback, IntPtr unused);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
    [DllImport("user32.dll")] private static extern IntPtr GetWindow(IntPtr window, uint command);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] private static extern bool IsWindowEnabled(IntPtr window);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetClassName(IntPtr window, StringBuilder name, int size);

    public static string[] Dialogs(uint pid) {
        var dialogs = new List<string>();
        bool complete = EnumWindows((window, unused) => {
            uint process;
            if (GetWindowThreadProcessId(window, out process) == 0) return false;
            if (process != pid || !IsWindowVisible(window)) return true;
            var name = new StringBuilder(256);
            if (GetClassName(window, name, name.Capacity) == 0) return false;
            IntPtr owner = GetWindow(window, 4); // GW_OWNER
            if (name.ToString() == "#32770" || (owner != IntPtr.Zero && !IsWindowEnabled(owner))) {
                dialogs.Add(window.ToInt64().ToString("x"));
            }
            return dialogs.Count <= 16;
        }, IntPtr.Zero);
        if (!complete) throw new InvalidOperationException("window_enumeration_incomplete");
        return dialogs.ToArray();
    }
}
'@
        $aeProcess.Refresh()
        $result.dialogs = @([Core4Windows]::Dialogs($aeProcess.Id))
        if ($result.dialogs.Count -gt 0) { $result.state = 'modal-observed' }
        elseif ($aeProcess.MainWindowHandle -eq [IntPtr]::Zero) { $result.state = 'starting-or-hidden' }
        elseif (-not $aeProcess.Responding) { $result.state = 'unresponsive' }
        else { $result.state = 'window-responsive' }
    }
    $afterScan = @(Get-AeProcesses)
    if ($afterScan.Count -ne 1 -or $afterScan[0].Id -ne $result.pid -or
        $afterScan[0].StartTime.ToUniversalTime().ToString('o') -ne $result.birth) {
        throw 'process_changed_during_observation'
    }
}
$result | ConvertTo-Json -Depth 3 -Compress`;

const FRESH_MS = 5000;
const PROCESS_STATES = new Set(['window-unobserved', 'modal-observed', 'starting-or-hidden', 'unresponsive', 'window-responsive']);
const BLOCKERS = new Set(['modal-observed', 'unresponsive']);

function parseObservation(stdout) {
  const value = JSON.parse(stdout);
  const { state, pid, birth, dialogs } = value;
  const process = PROCESS_STATES.has(state);
  if ((!process && !['absent', 'ambiguous'].includes(state)) ||
      (process ? !Number.isSafeInteger(pid) || pid < 1 || typeof birth !== 'string' || !Number.isFinite(Date.parse(birth)) : pid !== null || birth !== null) ||
      !Array.isArray(dialogs) || dialogs.length > 16 || dialogs.some(handle => typeof handle !== 'string' || !/^[a-f0-9]{1,16}$/.test(handle)) ||
      (state === 'modal-observed') !== (dialogs.length > 0)) throw new Error('ae_window_scan_invalid');
  return { state, pid, birth, dialogs };
}

function scanWindows() {
  const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'TEMP', 'TMP'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
  env.USERPROFILE = os.userInfo().homedir;
  return new Promise((resolve, reject) => {
    execFile(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', WINDOWS_QUERY],
      { windowsHide: true, timeout: 4500, maxBuffer: 8192, env }, (error, stdout, stderr) => {
        if (error || stderr.trim()) reject(new Error('ae_window_scan_failed'));
        else resolve(stdout);
      });
  });
}

function createAeReadiness({ scan = scanWindows, platform = process.platform, now = Date.now } = {}) {
  let observed = null, inFlight = null, nativeRead = null;
  function fresh() { return observed && now() - observed.observedAt <= FRESH_MS; }
  return {
    async refresh({ force = false } = {}) {
      if (platform !== 'win32') return;
      if (!inFlight && !force && fresh()) return;
      if (!inFlight) inFlight = (async () => {
        try { observed = { ...parseObservation(await scan()), observedAt: now(), coverage: 'visible-top-level-windows-in-observer-desktop' }; }
        catch { observed = { state: 'scan-failed', observedAt: now(), coverage: 'unavailable' }; }
      })().finally(() => { inFlight = null; });
      await inFlight;
    },
    blocker() { return fresh() && BLOCKERS.has(observed.state) ? 'ae_' + observed.state.replace('-', '_') : null; },
    recordRead(peerId) { nativeRead = { peerId, observedAt: now() }; },
    status({ peer, pending, storeClosed, storeFault, startOverFrozen }, baselineRequired) {
      const current = fresh();
      const nativeResponsive = !!(peer.connected && !pending && !storeClosed && !storeFault && !startOverFrozen &&
        nativeRead && nativeRead.peerId === peer.peerId && now() - nativeRead.observedAt <= FRESH_MS &&
        (!current || observed.state === 'window-responsive' || observed.state === 'scan-failed' || observed.state === 'window-unobserved'));
      return {
        process: observed ? { ...observed, fresh: !!current } : { state: platform === 'win32' ? 'not-observed' : 'unsupported-platform', fresh: false },
        cepConnected: peer.connected, baselineRequired, native: nativeResponsive ? 'recent-authenticated-read' : 'unverified'
      };
    }
  };
}

async function observeAeWindows() { return { ...parseObservation(await scanWindows()), observedAt: Date.now() }; }
module.exports = { createAeReadiness, observeAeWindows };
