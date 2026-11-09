'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const { canonical, fail } = require('../protocol/json');
const { plainPath } = require('./project-file');

const fileKey = file => file.replace(/\\/g, '/').toLowerCase();
const same = (a, b) => canonical(a) === canonical(b);
const lockError = 'media_file_lock_unavailable';
// Fixed Windows command, like the host probe. File and process identities are
// data in the child environment, never interpolated into the command.
const LOCK_COMMAND = String.raw`
$ErrorActionPreference = 'Stop'
$target = $null
$file = $null
$reader = $null
$directories = [Collections.Generic.List[Microsoft.Win32.SafeHandles.SafeFileHandle]]::new()
try {
    Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class Core4MediaDirectory {
    [DllImport("kernel32.dll", EntryPoint = "CreateFileW", CharSet = CharSet.Unicode, ExactSpelling = true)]
    private static extern SafeFileHandle CreateFile(string path, uint access, uint sharing,
        System.IntPtr security, uint disposition, uint flags, System.IntPtr template);
    public static SafeFileHandle Open(string path) {
        // Share read/write, deny delete/rename. Open the directory entry itself.
        return CreateFile(path, 1, 3, System.IntPtr.Zero, 3, 0x02200000, System.IntPtr.Zero);
    }
}
'@
    $target = [Diagnostics.Process]::GetProcessById([int]$env:AE_CORE4_MEDIA_HOST_PID)
    $null = $target.Handle
    # CIM creation timestamps have microsecond precision.
    $birth = $target.StartTime.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss.ffffff", [Globalization.CultureInfo]::InvariantCulture)
    if ($birth -cne $env:AE_CORE4_MEDIA_HOST_BIRTH -or $target.HasExited) { throw 'host identity changed' }
    $source = $env:AE_CORE4_MEDIA_SOURCE
    $ancestors = [Collections.Generic.Stack[string]]::new()
    $directory = [IO.Path]::GetDirectoryName($source)
    $root = [IO.Path]::GetPathRoot($source)
    while ($directory -ine $root) {
        $ancestors.Push($directory)
        $directory = [IO.Path]::GetDirectoryName($directory)
    }
    foreach ($directory in $ancestors) {
        $handle = [Core4MediaDirectory]::Open($directory)
        $directories.Add($handle)
        if ($handle.IsInvalid -or ([IO.File]::GetAttributes($directory) -band [IO.FileAttributes]::ReparsePoint)) { throw 'source directory changed' }
    }
    $file = [IO.File]::Open($source, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
    $reader = [IO.StreamReader]::new([Console]::OpenStandardInput())
    $release = $reader.ReadLineAsync()
    [Console]::Out.WriteLine('held')
    [Console]::Out.Flush()
    while (!$target.HasExited) {
        if ($release.Wait(250)) {
            # Owner loss/EOF is not a release. Protect delayed native execution
            # until the exact host process exits.
            if ($release.Result -cne 'release') { $target.WaitForExit() }
            break
        }
    }
} catch {
    [Console]::Error.WriteLine('media_file_lock_unavailable')
    exit 1
} finally {
    if ($file) { $file.Dispose() }
    foreach ($handle in $directories) { $handle.Dispose() }
    if ($reader) { $reader.Dispose() }
    if ($target) { $target.Dispose() }
}
`;

async function lockImportFile(input, observed, origin) {
  const { resolved } = plainPath(input.file);
  const systemRoot = process.env.SystemRoot;
  if (process.platform !== 'win32' || !systemRoot || !path.isAbsolute(systemRoot) ||
      !Number.isSafeInteger(origin?.aePid) || origin.aePid < 1 || origin.aePid > 0x7fffffff ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{7}Z$/.test(origin.aeProcessBirth)) fail(lockError);
  const executable = path.join(systemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const env = { SystemRoot: systemRoot, WINDIR: systemRoot, USERPROFILE: os.userInfo().homedir,
    TEMP: os.tmpdir(), TMP: os.tmpdir(), AE_CORE4_MEDIA_SOURCE: resolved,
    AE_CORE4_MEDIA_HOST_PID: String(origin.aePid), AE_CORE4_MEDIA_HOST_BIRTH: origin.aeProcessBirth.slice(0, 26) };
  const child = spawn(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', LOCK_COMMAND],
    { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'], env });
  let lost = false, released = false, ready = false;
  const lock = Object.freeze({
    assert() {
      if (!ready || released || lost || child.exitCode !== null || child.signalCode !== null) fail(lockError);
      try { process.kill(child.pid, 0); } catch { fail(lockError); }
    },
    release() {
      if (released) return;
      released = true;
      child.stdin.end('release\n');
    }
  });
  try {
    await new Promise((resolve, reject) => {
      let line = '';
      const refuse = () => { clearTimeout(timer); lost = true; reject(Object.assign(new Error(lockError), { code: lockError })); };
      const timer = setTimeout(refuse, 8000);
      child.once('error', refuse);
      child.once('exit', refuse);
      child.stdin.on('error', refuse);
      child.stdout.on('data', chunk => {
        line += chunk.toString('ascii');
        if (line === 'held\r\n' || line === 'held\n') { ready = true; clearTimeout(timer); resolve(); }
        else if (line.length >= 6) refuse();
      });
      child.stdout.once('close', () => { clearTimeout(timer); if (!ready) refuse(); });
    });
    lock.assert();
    assertImportFile(input, observed);
    lock.assert();
    child.unref();
    child.stdin.unref();
    child.stdout.unref();
    return lock;
  } catch (error) {
    // Preparation has not offered a command. There is no native work to drain.
    lock.release();
    throw error;
  }
}

function assertImportFile(input, observed) {
  const { resolved, info } = plainPath(input.file);
  const modifiedMs = Number(info.mtimeNs / 1000000n);
  const nativeTime = observed.modifiedMs;
  if (info.size !== BigInt(observed.bytes) ||
      (nativeTime % 1000 === 0 ? Math.floor(modifiedMs / 1000) * 1000 !== nativeTime : Math.abs(modifiedMs - nativeTime) > 1)) {
    fail('media_import_file_changed');
  }
  const digest = createHash('sha256');
  const fd = fs.openSync(resolved, 'r');
  const assertSame = current => {
    if (['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs', 'nlink'].some(key => info[key] !== current[key])) fail('media_import_file_changed');
  };
  try {
    assertSame(fs.fstatSync(fd, { bigint: true }));
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    for (let remaining = observed.bytes; remaining > 0;) {
      const count = fs.readSync(fd, buffer, 0, Math.min(remaining, buffer.length), null);
      if (count === 0) fail('media_import_file_changed');
      digest.update(buffer.subarray(0, count));
      remaining -= count;
    }
    assertSame(fs.fstatSync(fd, { bigint: true }));
    assertSame(plainPath(resolved).info);
    if (digest.digest('hex') !== input.sha256) fail('media_import_digest_mismatch');
  } finally { fs.closeSync(fd); }
}

function createMediaImportProof(currentSessionId, lock = lockImportFile) {
  const assertTarget = target => {
    if (target.sessionId !== currentSessionId()) fail('media_layer_work_session_changed');
  };
  return {
    assertTarget,
    lockSource({ input, before, descriptor }) { return lock(input, before, descriptor.executionScope.origin); },
    validateResult({ input, before }, after) {
      assertImportFile(input, after);
      const previous = new Set(before.items.map(item => item.id));
      const additions = after.items.filter(item => !previous.has(item.id));
      if (additions.length !== 1 || after.createdItemId !== additions[0].id || !['still', 'av'].includes(additions[0].kind) ||
          fileKey(additions[0].file) !== fileKey(input.file) || before.bytes !== after.bytes ||
          before.modifiedMs !== after.modifiedMs ||
          !same(after.items.filter(item => previous.has(item.id)), before.items)) fail('media_import_readback');
    }
  };
}

module.exports = { createMediaImportProof, assertImportFile, lockImportFile };
