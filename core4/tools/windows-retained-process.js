'use strict';
// Private installer operator support. A retained OS handle is not AE authority.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto'), cp = require('node:child_process');
const handles = new WeakMap();
function fail(code) { throw Object.assign(Error(code), { code }); }
const SCRIPT = String.raw`
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';$nativeHandle=[IntPtr]::Zero
try {
Add-Type -TypeDefinition @'
using System; using System.Text; using System.Runtime.InteropServices;
public static class Core4RetainedProcess {
 [DllImport("kernel32.dll",SetLastError=true)] public static extern IntPtr OpenProcess(uint access,bool inherit,uint pid);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool GetProcessTimes(IntPtr h,out long creation,out long exit,out long kernel,out long user);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] public static extern bool QueryFullProcessImageName(IntPtr h,uint flags,StringBuilder buffer,ref uint size);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern uint WaitForSingleObject(IntPtr h,uint milliseconds);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool TerminateProcess(IntPtr h,uint code);
 [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
}
'@
$spec=ConvertFrom-Json -InputObject $env:AE_CORE4_RETAINED_PROCESS
$nativeHandle=[Core4RetainedProcess]::OpenProcess(0x101001,$false,[uint32]$spec.pid)
if($nativeHandle -eq [IntPtr]::Zero){throw 'open_failed'}
$creation=0L;$exit=0L;$kernel=0L;$user=0L
if(-not [Core4RetainedProcess]::GetProcessTimes($nativeHandle,[ref]$creation,[ref]$exit,[ref]$kernel,[ref]$user)){throw 'times_failed'}
$birth=[DateTime]::FromFileTimeUtc($creation).Ticks.ToString([Globalization.CultureInfo]::InvariantCulture)
$buffer=New-Object Text.StringBuilder 32768;$size=[uint32]32768
if(-not [Core4RetainedProcess]::QueryFullProcessImageName($nativeHandle,0,$buffer,[ref]$size)){throw 'path_failed'}
$exe=$buffer.ToString()
if($birth -cne $spec.birthTicks -or -not [string]::Equals($exe,$spec.executablePath,[StringComparison]::OrdinalIgnoreCase)){throw 'identity_changed'}
function Reply($state){[Console]::Out.WriteLine((ConvertTo-Json -Compress -InputObject ([ordered]@{version=1;state=$state;pid=$spec.pid;birthTicks=$birth;executablePath=$exe;nonce=$spec.nonce})));[Console]::Out.Flush()}
Reply 'retained'
$terminated=$false
while($null -ne ($line=[Console]::In.ReadLine())) {
 $request=ConvertFrom-Json -InputObject $line
 if($request.nonce -cne $spec.nonce){throw 'nonce_changed'}
 if($request.action -ceq 'close'){break}
 $wait=[Core4RetainedProcess]::WaitForSingleObject($nativeHandle,0)
 if($wait -ne 0 -and $wait -ne 258){throw 'wait_failed'}
 if($request.action -ceq 'inspect'){if($wait -eq 0){Reply 'exited'}else{Reply 'alive'};continue}
 if($request.action -cne 'stop-once' -or $terminated){throw 'action_refused'}
 $terminated=$true
 if($wait -eq 0){Reply 'exited';continue}
 if(-not [Core4RetainedProcess]::TerminateProcess($nativeHandle,0)){throw 'stop_unknown'}
 if([Core4RetainedProcess]::WaitForSingleObject($nativeHandle,5000) -ne 0){throw 'stop_unknown'}
 Reply 'stopped'
}
} catch {[Console]::Error.Write('retained_process_failed');exit 1}
finally {if($nativeHandle -ne [IntPtr]::Zero){[void][Core4RetainedProcess]::CloseHandle($nativeHandle)}}
`;
function value(capability) { const item = capability && handles.get(capability); if (!item || item.closed || item.failed) fail('retained_process_capability'); return item; }
function exactResponse(item, line, allowed) {
  let result; try { result = JSON.parse(line.replace(/^\uFEFF/, '')); } catch { fail('retained_process_protocol'); }
  const keys = ['version', 'state', 'pid', 'birthTicks', 'executablePath', 'nonce'];
  if (!result || Object.keys(result).length !== keys.length || keys.some(k => !Object.hasOwn(result, k)) || result.version !== 1 || !allowed.includes(result.state) || result.pid !== item.identity.pid || result.birthTicks !== item.identity.birthTicks || typeof result.executablePath !== 'string' || result.executablePath.toLowerCase() !== item.identity.executablePath.toLowerCase() || result.nonce !== item.nonce) fail('retained_process_protocol');
  return Object.freeze({ version: 1, state: result.state, ...item.identity });
}
function pending(item, allowed) {
  if (item.pending || item.failed || item.closed) fail('retained_process_unavailable');
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { item.failed = true; item.pending = null; item.child.stdin.end(); reject(Object.assign(Error('retained_process_outcome_unknown'), { code: 'retained_process_outcome_unknown' })); }, 9000);
    item.pending = { allowed, resolve(result) { clearTimeout(timer); item.pending = null; resolve(result); }, reject(error) { clearTimeout(timer); item.pending = null; item.failed = true; reject(error); } };
  });
}
async function retainProcess(identity) {
  if (process.platform !== 'win32' || !identity || Object.keys(identity).sort().join(',') !== 'birthTicks,executablePath,pid' || !Number.isInteger(identity.pid) || identity.pid < 1 || identity.pid > 0xffffffff || typeof identity.birthTicks !== 'string' || !/^[1-9][0-9]{0,18}$/.test(identity.birthTicks) || typeof identity.executablePath !== 'string' || !path.win32.isAbsolute(identity.executablePath)) fail('retained_process_identity');
  const systemRoot = process.env.SystemRoot;
  if (!systemRoot || !path.win32.isAbsolute(systemRoot)) fail('retained_process_platform');
  const executable = path.join(systemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
  if (fs.realpathSync(executable) !== executable) fail('retained_process_platform');
  const nonce = crypto.randomBytes(32).toString('hex'), env = {};
  for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP']) if (process.env[key]) env[key] = process.env[key];
  env.USERPROFILE = os.userInfo().homedir;
  env.AE_CORE4_RETAINED_PROCESS = JSON.stringify({ ...identity, nonce });
  const child = cp.spawn(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(SCRIPT, 'utf16le').toString('base64')], { env, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const item = { child, identity: Object.freeze({ ...identity }), nonce, pending: null, stopped: false, closed: false, failed: false, buffer: '', stderr: 0 }, capability = Object.freeze({});
  handles.set(capability, item); const ready = pending(item, ['retained']);
  function refuse() { item.failed = true; item.pending?.reject(Object.assign(Error('retained_process_outcome_unknown'), { code: 'retained_process_outcome_unknown' })); child.stdin.destroy(); }
  child.on('error', refuse); child.stdin.on('error', refuse); child.on('exit', () => { if (!item.closed) refuse(); });
  child.stderr.on('data', chunk => { item.stderr += chunk.length; if (item.stderr > 4096) refuse(); });
  child.stdout.on('data', chunk => {
    item.buffer += chunk.toString('utf8'); if (Buffer.byteLength(item.buffer) > 4096) { refuse(); return; }
    let at; while ((at = item.buffer.indexOf('\n')) >= 0) {
      const line = item.buffer.slice(0, at).replace(/\r$/, ''); item.buffer = item.buffer.slice(at + 1);
      try { if (!item.pending) fail('retained_process_protocol'); item.pending.resolve(exactResponse(item, line, item.pending.allowed)); } catch { refuse(); }
    }
  });
  await ready; return capability;
}
async function inspectRetainedProcess(capability) {
  const item = value(capability), response = pending(item, ['alive', 'exited']);
  item.child.stdin.write(JSON.stringify({ action: 'inspect', nonce: item.nonce }) + '\n'); return response;
}
async function stopRetainedProcess(capability, permit) {
  const item = value(capability);
  require('./legacy-owner-migration').assertLegacyStopPermit(permit, capability);
  if (item.stopped) fail('retained_process_no_replay'); item.stopped = true;
  const response = pending(item, ['stopped', 'exited']);
  item.child.stdin.write(JSON.stringify({ action: 'stop-once', nonce: item.nonce }) + '\n'); return response;
}
function closeRetainedProcess(capability) {
  const item = capability && handles.get(capability); if (!item || item.closed) return;
  item.closed = true;
  // EOF only releases our handle. It never terminates the retained target.
  item.pending?.reject(Object.assign(Error('retained_process_closed'), { code: 'retained_process_closed' })); item.child.stdin.end();
}
module.exports = { retainProcess, inspectRetainedProcess, stopRetainedProcess, closeRetainedProcess };
