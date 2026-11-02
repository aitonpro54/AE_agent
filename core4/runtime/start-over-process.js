'use strict';
// Fixed read-only native observation for B3. Caller scopes select exact prior
// incarnations; they do not supply a probe, command, PID-only death assertion or
// reset permit. One CIM query also inventories every current AfterFX process.
const path = require('node:path'), os = require('node:os'), cp = require('node:child_process');
const TARGETS = 'AE_CORE4_START_OVER_PIDS';
const QUERY = String.raw`$ErrorActionPreference='Stop';try {
  $raw=$env:AE_CORE4_START_OVER_PIDS;if($null -eq $raw){throw 'missing_targets'};
  $ids=@();if($raw -ne '-'){foreach($part in $raw.Split(',')){if($part -notmatch '^[1-9][0-9]{0,9}$'){throw 'invalid_pid'};$ids+=([UInt32]::Parse($part,[Globalization.CultureInfo]::InvariantCulture))}};
  if($ids.Count -gt 48 -or @($ids|Select-Object -Unique).Count -ne $ids.Count){throw 'target_budget'};
  $filter="Name = 'AfterFX.exe'";foreach($id in $ids){$filter+=' OR ProcessId = '+$id.ToString([Globalization.CultureInfo]::InvariantCulture)};
  $found=@(Get-CimInstance -ClassName Win32_Process -Property ProcessId,Name,CreationDate,ExecutablePath -Filter $filter -ErrorAction Stop);
  if($found.Count -gt 64){throw 'inventory_budget'};$rows=@();
  foreach($p in $found){
    if($null -eq $p.CreationDate -or -not ($p.CreationDate -is [DateTime]) -or $null -eq $p.Name){throw 'incomplete_process'};
    $rows+=[ordered]@{pid=$p.ProcessId;name=$p.Name;birthTicks=$p.CreationDate.ToUniversalTime().Ticks.ToString([Globalization.CultureInfo]::InvariantCulture);executablePath=$p.ExecutablePath}
  };
  $value=[ordered]@{version=1;observedAt=[DateTime]::UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'",[Globalization.CultureInfo]::InvariantCulture);rows=@($rows)};
  $json=ConvertTo-Json -InputObject $value -Depth 5 -Compress -ErrorAction Stop;
  [Console]::Out.Write([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json)))
}catch{[Console]::Error.Write('start_over_process_probe_unavailable');exit 1}`;
function refuse() { throw Object.assign(new Error('start_over_process_probe_unavailable'), { code: 'start_over_process_probe_unavailable' }); }
function exact(value, keys) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const names = Reflect.ownKeys(value);
  return names.length === keys.length && names.every(k => typeof k === 'string' && keys.includes(k) && Object.getOwnPropertyDescriptor(value, k).enumerable && Object.hasOwn(Object.getOwnPropertyDescriptor(value, k), 'value'));
}
const pid = value => Number.isSafeInteger(value) && value > 0 && value <= 0xffffffff;
const ticks = value => typeof value === 'string' && /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= 3155378975999999999n;
function absolute(value) { return typeof value === 'string' && value.length > 0 && value.length <= 2048 && !/[\x00-\x1f]/.test(value) && path.win32.isAbsolute(value) && !/^[\\/]$/.test(path.win32.parse(value).root); }
function scopes(value, minimum, maximum) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) refuse();
  const result = value.map(s => { if (!exact(s, ['pid', 'birthTicks']) || !pid(s.pid) || !ticks(s.birthTicks)) refuse(); return Object.freeze({ ...s }); });
  if (new Set(result.map(s => s.pid + ':' + s.birthTicks)).size !== result.length) refuse();
  return result;
}
function decode(stdout, targets) {
  if (typeof stdout !== 'string' || Buffer.byteLength(stdout) > 65536) refuse();
  const wire = stdout.replace(/^\uFEFF/, '').trim();
  if (!wire || wire.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(wire)) refuse();
  const bytes = Buffer.from(wire, 'base64'), text = bytes.toString('utf8');
  if (bytes.toString('base64') !== wire || !Buffer.from(text).equals(bytes)) refuse();
  const v = JSON.parse(text), now = Date.now();
  if (!exact(v, ['version', 'observedAt', 'rows']) || v.version !== 1 || typeof v.observedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v.observedAt) || !Number.isFinite(Date.parse(v.observedAt)) || new Date(v.observedAt).toISOString() !== v.observedAt || Math.abs(now - Date.parse(v.observedAt)) > 5000 || !Array.isArray(v.rows) || v.rows.length > 64) refuse();
  const seen = new Set();
  for (const p of v.rows) {
    if (!exact(p, ['pid', 'name', 'birthTicks', 'executablePath']) || !pid(p.pid) || !ticks(p.birthTicks) || typeof p.name !== 'string' || !p.name || p.name.length > 256 || /[\x00-\x1f]/.test(p.name) || seen.has(p.pid) || p.executablePath !== null && !absolute(p.executablePath)) refuse();
    const ae = p.name.toLowerCase() === 'afterfx.exe';
    if (ae ? !absolute(p.executablePath) || path.win32.basename(p.executablePath).toLowerCase() !== 'afterfx.exe' : !targets.includes(p.pid)) refuse();
    seen.add(p.pid); Object.freeze(p);
  }
  return Object.freeze({ version: 1, observedAt: v.observedAt, rows: Object.freeze(v.rows) });
}
async function query(targets) {
  if (process.platform !== 'win32') refuse();
  const systemRoot = process.env.SystemRoot; if (!absolute(systemRoot)) refuse();
  const env = Object.create(null);
  for (const key of ['PATH', 'HOMEDRIVE', 'HOMEPATH', 'LOGONSERVER', 'SYSTEMDRIVE', 'USERDOMAIN', 'USERNAME', 'USERPROFILE', 'NODE_V8_COVERAGE']) env[key] = '';
  for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP']) if (absolute(process.env[key])) env[key] = process.env[key];
  let profile; try { profile = os.userInfo().homedir; } catch { refuse(); }
  if (!absolute(profile)) refuse(); env.USERPROFILE = profile; env[TARGETS] = targets.length ? targets.join(',') : '-';
  return new Promise((resolve, reject) => {
    const failed = () => { try { refuse(); } catch (e) { reject(e); } };
    try {
      cp.execFile(path.win32.join(systemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', QUERY], { shell: false, windowsHide: true, timeout: 4000, maxBuffer: 65536, encoding: 'utf8', env }, (error, stdout, stderr) => {
        if (error || typeof stderr !== 'string' || stderr.trim()) { failed(); return; }
        try { resolve(decode(stdout, targets)); } catch { failed(); }
      });
    } catch { failed(); }
  });
}
function inventory(value) {
  let machineId; try { machineId = os.hostname(); } catch { refuse(); }
  if (typeof machineId !== 'string' || !machineId || machineId.length > 255 || /[\x00-\x1f]/.test(machineId)) refuse();
  return Object.freeze({ version: 1, machineId, observedAt: value.observedAt, processes: Object.freeze(value.rows.filter(p => p.name.toLowerCase() === 'afterfx.exe').map(p => Object.freeze({ pid: p.pid, birthTicks: p.birthTicks, executablePath: p.executablePath }))) });
}
async function observeStartOverInventory() {
  if (arguments.length) refuse(); return inventory(await query([]));
}
async function observeStartOverStop(value) {
  if (arguments.length !== 1 || !exact(value, ['actors', 'ae'])) refuse();
  const actors = scopes(value.actors, 1, 16), ae = scopes(value.ae, 0, 32), targets = [...new Set([...actors, ...ae].map(s => s.pid))].sort((a, b) => a - b);
  const actual = await query(targets), byPid = new Map(actual.rows.map(p => [p.pid, p]));
  const results = expected => Object.freeze(expected.map(s => {
    const p = byPid.get(s.pid), state = !p ? 'absent' : p.birthTicks === s.birthTicks ? 'alive' : 'pid-reused';
    return Object.freeze({ ...s, state, observedBirthTicks: p?.birthTicks || null });
  }));
  const actorResults = results(actors), aeResults = results(ae);
  return Object.freeze({ coverage: 'native-process-snapshot', inventory: inventory(actual), actors: actorResults, ae: aeResults,
    allObservedIncarnationsGone: [...actorResults, ...aeResults].every(s => s.state !== 'alive'), resetPermit: false, aeAuthority: false });
}
module.exports = { observeStartOverInventory, observeStartOverStop };
