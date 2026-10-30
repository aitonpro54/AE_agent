'use strict';
const path = require('node:path');
const os = require('node:os');
const childProcess = require('node:child_process');

// Local read-only observation seam. A process result is not install/reclaim/AE
// authority. No process command line, executable contents or credentials read.
const PID_ENV = 'AE_CORE4_OWNER_PROCESS_PID';
const QUERY = String.raw`$ErrorActionPreference='Stop';try {
  $target=[UInt32]::Parse($env:AE_CORE4_OWNER_PROCESS_PID,[Globalization.CultureInfo]::InvariantCulture);
  if($target -eq 0){throw 'invalid_pid'};
  $rows=@(Get-CimInstance -ClassName Win32_Process -Property ProcessId,CreationDate,ExecutablePath -Filter ('ProcessId = '+$target.ToString([Globalization.CultureInfo]::InvariantCulture)) -ErrorAction Stop);
  if($rows.Count -gt 1){throw 'ambiguous_pid'};
  $stamp=[DateTime]::UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'",[Globalization.CultureInfo]::InvariantCulture);
  if($rows.Count -eq 0){$result=[ordered]@{version=1;pid=$target;status='absent';birthTicks=$null;executablePath=$null;observedAt=$stamp}}
  else {
    $p=$rows[0];if($p.ProcessId -ne $target -or $null -eq $p.CreationDate -or -not ($p.CreationDate -is [DateTime])){throw 'missing_birth'};
    $birth=$p.CreationDate.ToUniversalTime().Ticks.ToString([Globalization.CultureInfo]::InvariantCulture);
    $exe=$p.ExecutablePath;if($null -ne $exe -and -not ($exe -is [string])){throw 'invalid_path'};if($exe -eq ''){$exe=$null};
    $result=[ordered]@{version=1;pid=$target;status='present';birthTicks=$birth;executablePath=$exe;observedAt=$stamp}
  };
  $json=ConvertTo-Json -InputObject $result -Depth 3 -Compress -ErrorAction Stop;
  [Console]::Out.Write([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json)))
}catch{[Console]::Error.Write('owner_process_probe_unavailable');exit 1}`;
function unavailable() { throw Object.assign(new Error('owner_process_probe_unavailable'), { code: 'owner_process_probe_unavailable' }); }
function pidValue(value) { return Number.isSafeInteger(value) && value > 0 && value <= 0xffffffff; }
function ticks(value) {
  return typeof value === 'string' && /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= 3155378975999999999n;
}
function exact(value, keys) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const names = Reflect.ownKeys(value);
  return names.length === keys.length && names.every(key => typeof key === 'string' && keys.includes(key) &&
    Object.getOwnPropertyDescriptor(value, key).enumerable && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'));
}
function absoluteWindows(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 2048 && !/[\x00-\x1f]/.test(value) &&
    path.win32.isAbsolute(value) && !/^[\\/]$/.test(path.win32.parse(value).root);
}
function observation(value, pid, now) {
  if (!exact(value, ['version', 'pid', 'status', 'birthTicks', 'executablePath', 'observedAt']) || value.version !== 1 || value.pid !== pid || !pidValue(value.pid) ||
      typeof value.observedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.observedAt)) return false;
  const time = Date.parse(value.observedAt);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value.observedAt || Math.abs(now - time) > 5000) return false;
  return value.status === 'absent' ? value.birthTicks === null && value.executablePath === null :
    value.status === 'present' && ticks(value.birthTicks) && (value.executablePath === null || absoluteWindows(value.executablePath));
}
function decode(stdout, pid) {
  if (typeof stdout !== 'string' || Buffer.byteLength(stdout) > 4096) unavailable();
  const encoded = stdout.replace(/^\uFEFF/, '').replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '');
  if (!encoded || encoded.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) unavailable();
  const bytes = Buffer.from(encoded, 'base64'), text = bytes.toString('utf8');
  if (bytes.toString('base64') !== encoded || !Buffer.from(text).equals(bytes)) unavailable();
  const value = JSON.parse(text);
  if (!observation(value, pid, Date.now())) unavailable();
  return Object.freeze(value);
}
async function observeOwnerProcess(pid) {
  if (arguments.length !== 1 || process.platform !== 'win32' || !pidValue(pid)) unavailable();
  const systemRoot = process.env.SystemRoot;
  if (!absoluteWindows(systemRoot)) unavailable();
  const executable = path.win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), env = Object.create(null);
  for (const key of ['PATH', 'HOMEDRIVE', 'HOMEPATH', 'LOGONSERVER', 'SYSTEMDRIVE', 'USERDOMAIN', 'USERNAME', 'USERPROFILE', 'NODE_V8_COVERAGE']) env[key] = '';
  for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP']) {
    const value = process.env[key]; if (absoluteWindows(value)) env[key] = value;
  }
  // Windows PowerShell 5.1 cannot initialize with an empty profile directory,
  // even with -NoProfile. Read the current token's native directory, never the
  // inherited USERPROFILE value. Other account fields/PATH remain empty.
  let profile;
  try { profile = os.userInfo().homedir; } catch { unavailable(); }
  if (!absoluteWindows(profile)) unavailable();
  env.USERPROFILE = profile;
  env[PID_ENV] = String(pid);
  return new Promise((resolve, reject) => {
    const refuse = () => reject(Object.assign(new Error('owner_process_probe_unavailable'), { code: 'owner_process_probe_unavailable' }));
    try {
      childProcess.execFile(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', QUERY],
        { shell: false, windowsHide: true, timeout: 4000, maxBuffer: 4096, encoding: 'utf8', env }, (error, stdout, stderr) => {
          if (error || typeof stderr !== 'string' || stderr.trim()) { refuse(); return; }
          try { resolve(decode(stdout, pid)); } catch { refuse(); }
        });
    } catch { refuse(); }
  });
}
function classifyOwnerProcess(expected, value) {
  try {
    if (arguments.length !== 2 || !exact(expected, ['pid', 'birthTicks']) || !pidValue(expected.pid) || !ticks(expected.birthTicks) || !observation(value, expected.pid, Date.now())) return 'unknown';
    if (value.status === 'absent') return 'absent';
    return value.birthTicks === expected.birthTicks ? 'alive' : 'pid-reused';
  } catch { return 'unknown'; }
}
module.exports = { observeOwnerProcess, classifyOwnerProcess };
