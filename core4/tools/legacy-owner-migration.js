'use strict';
// Private first transition for the pinned constructor-closed stdio profile.
// No AE command is sent; history is immutable. No PID-only termination.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto'), cp = require('node:child_process'), http = require('node:http');
const { canonical, hash, fail } = require('../protocol/json');
const native = require('./windows-retained-process');
const permits = new WeakMap(), stops = new WeakMap(), stopped = new WeakMap();
const preparedRecoveries = new WeakMap(), HEX = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const FIELDS = ['dev', 'ino', 'size', 'birthtimeNs', 'mtimeNs', 'ctimeNs'];
const RECORD_FIELDS = Object.freeze({
  'legacy-migration-intent': ['id', 'actor', 'nonce', 'target', 'proof', 'planHash', 'prepared', 'gates'],
  'legacy-migration-gate': ['id', 'actor', 'role', 'nonce'],
  'legacy-migration-stop': ['id', 'actor', 'target', 'intentHash', 'snapshot', 'nonce'],
  'legacy-migration-root-stop': ['id', 'actor', 'target', 'barrierHash', 'barrier', 'intentHash', 'snapshot', 'markers'],
  'legacy-migration-stop-observed': ['id', 'actor', 'target', 'stopIntentHash', 'stopIntent', 'state'],
  'legacy-migration-retirement': ['id', 'actor', 'snapshot', 'originals', 'stopIntentHash'],
  'legacy-migration-completed': ['id', 'actor', 'target', 'stopHash', 'retirementHash', 'snapshot', 'markers'],
  'legacy-migration-recovery-attempt': ['id', 'attemptId', 'parentHash', 'actor', 'intentHash', 'proofHash', 'protected', 'sources', 'targets'],
  'legacy-migration-recovery-gate': ['id', 'attemptId', 'actor', 'role', 'nonce'],
  'legacy-migration-recovered-stop': ['id', 'actor', 'target', 'intentHash', 'snapshot', 'attemptId', 'attemptHash', 'nonce'],
  'legacy-migration-recovery-completed': ['id', 'actor', 'intentHash', 'attemptHash', 'stopHash', 'snapshot']
});
const PROFILE = Object.freeze({ packageHash: '3f9293f76f5dbef30f8919151145e28ebceb8fe796ee4495b9747e18e0ff8c51', hashes: {
  'runtime/stdio-entry.js': 'b756c068a0be8f311d644f38b7b499a94df6fac9972a3f9fc5ccd3e88121ebbf',
  'integrations/cep/completion-store.js': 'c5678e98b6eea7cb0ad7db605b4bd9a5a4f73080bb1e32f60c6a99420e904835',
  'integrations/cep/http-peer.js': '678aa498eee23498d143017834be0be1f60df10d36de39aad6fec91ba7938757'
} });
const stamp = s => Object.fromEntries(FIELDS.map(k => [k, String(s[k])]));
const equal = (a, b) => canonical(a) === canonical(b);
function plain(file, missing = false, directory = false) {
  if (!path.isAbsolute(file) || path.resolve(file) !== file) fail('legacy_migration_path');
  let at = path.parse(file).root; const parts = file.slice(at.length).split(path.sep).filter(Boolean);
  for (const [n, part] of parts.entries()) {
    at = path.join(at, part); let s; try { s = fs.lstatSync(at); } catch (e) { if (missing && e.code === 'ENOENT') return false; throw e; }
    if (s.isSymbolicLink() || s.reparsePoint || fs.realpathSync(at) !== at || (n < parts.length - 1 || directory ? !s.isDirectory() : !s.isFile())) fail('legacy_migration_path');
  }
  return true;
}
function read(file, limit = 128 * 1024) {
  if (!plain(file, true)) return { file, bytes: null, stat: null };
  const before = fs.lstatSync(file, { bigint: true }), fd = fs.openSync(file, 'r');
  try {
    const s = fs.fstatSync(fd, { bigint: true }); if (!equal(stamp(before), stamp(s)) || s.size > BigInt(limit)) fail('legacy_migration_changed');
    const bytes = Buffer.alloc(Number(s.size)); let at = 0, n;
    while (at < bytes.length && (n = fs.readSync(fd, bytes, at, bytes.length - at, at))) at += n;
    if (at !== bytes.length || fs.readSync(fd, Buffer.alloc(1), 0, 1, at) || !equal(stamp(s), stamp(fs.fstatSync(fd, { bigint: true }))) || !plain(file) || !equal(stamp(s), stamp(fs.lstatSync(file, { bigint: true })))) fail('legacy_migration_changed');
    return { file, bytes, stat: stamp(s) };
  } finally { fs.closeSync(fd); }
}
const info = v => ({ hash: v.bytes === null ? null : hash(v.bytes), stat: v.stat });
function write(file, bytes) {
  if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes); if (bytes.length > 64 * 1024 * 1024) fail('legacy_migration_budget'); const fd = fs.openSync(file, 'wx');
  try { if (fs.writeSync(fd, bytes) !== bytes.length) fail('legacy_migration_short_write'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  const v = read(file, Math.max(128 * 1024, bytes.length)); if (!v.bytes?.equals(bytes)) fail('legacy_migration_changed'); return v;
}
function commandArguments(text) {
  if (typeof text !== 'string' || text.length > 8192 || /[\x00\r\n]/.test(text)) fail('legacy_migration_process');
  const args = []; let at = 0;
  while (at < text.length) {
    while (/[ \t]/.test(text[at] || '') && at < text.length) at++;
    if (at === text.length) break; let word = '', quoted = false;
    while (at < text.length && (quoted || !/[ \t]/.test(text[at]))) {
      let slashes = 0; while (text[at] === '\\') { slashes++; at++; }
      if (text[at] === '"') { word += '\\'.repeat(Math.floor(slashes / 2)); if (slashes % 2) word += '"'; else quoted = !quoted; at++; }
      else { word += '\\'.repeat(slashes); if (at < text.length) word += text[at++]; }
    }
    if (quoted) fail('legacy_migration_process'); args.push(word);
  }
  return args;
}
async function processFacts(pid, listener = true, allowAbsent = false) {
  if (process.platform !== 'win32' || !Number.isInteger(pid) || pid < 1 || pid > 0xffffffff) fail('legacy_migration_process');
  const executable = path.join(process.env.SystemRoot || '', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  if (!path.isAbsolute(executable) || fs.realpathSync(executable) !== executable) fail('legacy_migration_process');
  const script = String.raw`$ErrorActionPreference='Stop';try{$idValue=[uint32]::Parse($env:AE_CORE4_LEGACY_PID);$p=Get-Process -Id $idValue -ErrorAction SilentlyContinue;$c=@(Get-CimInstance Win32_Process -Filter ('ProcessId = '+$idValue) -Property ProcessId,ExecutablePath,CommandLine);$listeners=@();if($env:AE_CORE4_LEGACY_LISTENER -eq 'yes'){$listeners=@(Get-NetTCPConnection -LocalPort 3457 -State Listen -ErrorAction SilentlyContinue|Select-Object -ExpandProperty OwningProcess -Unique)};if($null -eq $p -and $c.Count -eq 0 -and $env:AE_CORE4_LEGACY_ALLOW_ABSENT -eq 'yes'){$value=[ordered]@{pid=$idValue;birthTicks=$null;executablePath=$null;commandLine=$null;listeners=$listeners;observedAt=[DateTime]::UtcNow.ToString('o')}}else{if($null -eq $p -or $c.Count -ne 1){throw 'ambiguous'};$value=[ordered]@{pid=$idValue;birthTicks=$p.StartTime.ToUniversalTime().Ticks.ToString();executablePath=$c[0].ExecutablePath;commandLine=$c[0].CommandLine;listeners=$listeners;observedAt=[DateTime]::UtcNow.ToString('o')}};[Console]::Out.Write([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -Compress -Depth 3 -InputObject $value))))}catch{[Console]::Error.Write('legacy_process_probe_failed');exit 1}`;
  const env = {}; for (const k of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP']) if (process.env[k]) env[k] = process.env[k]; env.USERPROFILE = os.userInfo().homedir; env.AE_CORE4_LEGACY_PID = String(pid); env.AE_CORE4_LEGACY_LISTENER = listener ? 'yes' : 'no'; env.AE_CORE4_LEGACY_ALLOW_ABSENT = allowAbsent ? 'yes' : 'no';
  const stdout = await new Promise((resolve, reject) => cp.execFile(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], { env, windowsHide: true, shell: false, timeout: 7000, maxBuffer: 16384, encoding: 'utf8' }, (e, out) => e ? reject(Object.assign(Error('legacy_process_probe_failed'), { code: 'legacy_process_probe_failed' })) : resolve(out)));
  let value; try { value = JSON.parse(Buffer.from(stdout.trim(), 'base64').toString('utf8')); } catch { fail('legacy_process_probe_failed'); }
  const absent = allowAbsent && value?.birthTicks === null && value.executablePath === null && value.commandLine === null;
  if (!value || Object.keys(value).sort().join(',') !== 'birthTicks,commandLine,executablePath,listeners,observedAt,pid' || value.pid !== pid || (!absent && (!/^[1-9][0-9]{0,18}$/.test(value.birthTicks) || typeof value.executablePath !== 'string' || !path.isAbsolute(value.executablePath))) || !Array.isArray(value.listeners) || typeof value.observedAt !== 'string' || !Number.isFinite(Date.parse(value.observedAt)) || Math.abs(Date.now() - Date.parse(value.observedAt)) > 10000) fail('legacy_process_probe_failed');
  return value;
}
function context(plan, rootStatus, observedAt) {
  const installer = require('./install-core4'), fingerprint = installer.assertPreparedInstallBaseline(plan);
  if (!plan.previousDescriptor || !Object.hasOwn(plan.pkg.release.hashes, 'runtime/owner-contract.json')) fail('legacy_migration_plan');
  const d = require('../runtime/stdio-entry').verifyInstallation(plan.descriptorPath), old = JSON.parse(plan.previousDescriptor);
  if (!equal(d, old) || d.machineId !== os.hostname() || d.packageHash !== PROFILE.packageHash || d.releaseDir === plan.descriptor.releaseDir) fail('legacy_migration_profile');
  for (const [file, digest] of Object.entries(PROFILE.hashes)) if (hash(fs.readFileSync(path.join(d.releaseDir, file))) !== digest) fail('legacy_migration_profile');
  if (!rootStatus || rootStatus.synthetic !== false || rootStatus.pid < 1 || rootStatus.installation?.installationId !== d.installationId || rootStatus.installation?.packageHash !== d.packageHash || rootStatus.physical?.storeClosed !== true || rootStatus.physical?.storeFault !== false || rootStatus.physical?.pending !== null || rootStatus.worker?.pending !== 0 || rootStatus.ledgerFault !== false || rootStatus.ownershipFault !== null || !Array.isArray(rootStatus.unresolved) || rootStatus.unresolved.length || typeof observedAt !== 'string' || !Number.isFinite(Date.parse(observedAt)) || Math.abs(Date.now() - Date.parse(observedAt)) > 30000) fail('legacy_migration_root_observation');
  return { ...stateContext(d, plan.descriptorPath, plan.previousDescriptor, plan.originBytes), fingerprint, rootStatusHash: hash(rootStatus), observedAt, rootStatus };
}
function stateContext(d, descriptorPath, previousDescriptor, originBytes) {
  const key = crypto.createHmac('sha256', Buffer.from(d.panelToken, 'hex')).update('ae-core4/legacy-migration-key/v1\0').update(Buffer.from(d.controlToken, 'hex')).digest();
  const seal = (kind, payload) => { const body = { version: 1, kind, installationId: d.installationId, descriptorHash: hash(previousDescriptor), ...payload }; return Buffer.from(canonical({ body, mac: crypto.createHmac('sha256', key).update(canonical(body)).digest('hex') })); };
  function decode(view, kind) { let v; try { v = JSON.parse(view.bytes); } catch { fail('legacy_migration_record'); } if (!view.bytes || !v || !RECORD_FIELDS[kind] || !equal(Object.keys(v).sort(), ['body', 'mac']) || v.body?.kind !== kind || !equal(Object.keys(v.body).sort(), ['version', 'kind', 'installationId', 'descriptorHash', ...RECORD_FIELDS[kind]].sort()) || !seal(kind, Object.fromEntries(Object.entries(v.body).filter(([k]) => !['version', 'kind', 'installationId', 'descriptorHash'].includes(k)))).equals(view.bytes)) fail('legacy_migration_record'); return v.body; }
  const p = { descriptor: descriptorPath, origin: path.join(d.installRoot, 'origin.json'), anchor: path.join(d.stateDir, 'origin.json'), client: path.join(d.installRoot, 'core-client.json'), journal: path.join(d.stateDir, 'receiver/completions.ndjson'), ledger: path.join(d.stateDir, 'broker/ledger.ndjson') };
  const markerNames = ['runtime-owner.json', 'runtime-owner.next', 'runtime-diagnostic.json', 'broker/broker-owner.lock', 'broker/broker-owner.gate', 'receiver/owner'];
  function snapshot() {
    const values = Object.fromEntries(Object.entries(p).map(([k, file]) => [k, read(file, ['journal', 'ledger'].includes(k) ? 64 * 1024 * 1024 : 128 * 1024)]));
    if (!values.descriptor.bytes?.equals(previousDescriptor) || !values.origin.bytes?.equals(originBytes) || !values.anchor.bytes?.equals(originBytes) || values.client.bytes !== null) fail('legacy_migration_changed');
    const inspect = require('../runtime/recovery-inspection');
    const receiver = inspect.inspectReceiverHistory(values.journal.bytes, { descriptorPath }), ledger = inspect.inspectLedgerHistory(values.ledger.bytes, { installationId: d.installationId });
    if (!receiver.settled || !ledger.settled || values.ledger.bytes !== null) fail('legacy_migration_unsettled');
    return { values, facts: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, info(v)])) };
  }
  function markers() { return Object.fromEntries(markerNames.map(n => [n, info(read(path.join(d.stateDir, n)))])); }
  return { d, p, seal, decode, snapshot, markers };
}
function knownMarkers(c, snap, process, saved) {
  const markers = c.markers(), owner = read(path.join(c.d.stateDir, 'broker/broker-owner.lock')), receiver = read(path.join(c.d.stateDir, 'receiver/owner'));
  let value; try { value = JSON.parse(owner.bytes); } catch { fail('legacy_migration_marker'); }
  if (!value || Object.keys(value).sort().join(',') !== 'pid,token' || value.pid !== process.pid || !UUID.test(value.token) || receiver.bytes === null || receiver.bytes.length !== 0 || Object.entries(markers).some(([k, v]) => !['broker/broker-owner.lock', 'receiver/owner'].includes(k) && v.hash !== null)) fail('legacy_migration_marker');
  const nativeUnixNs = (BigInt(process.birthTicks) - 621355968000000000n) * 100n;
  if (BigInt(receiver.stat.birthtimeNs) >= nativeUnixNs) fail('legacy_migration_not_constructor_closed');
  if (saved && !equal(markers, saved)) fail('legacy_migration_changed'); return markers;
}
async function inspectLegacyMigration({ plan, rootStatus, observedAt }) {
  const c = context(plan, rootStatus, observedAt), before = c.snapshot(), process = await processFacts(rootStatus.pid);
  if (process.executablePath.toLowerCase() !== c.d.nodePath.toLowerCase() || !equal(commandArguments(process.commandLine), [c.d.nodePath, path.join(c.d.releaseDir, 'runtime/stdio-entry.js'), '--installation', plan.descriptorPath]) || !equal(process.listeners, [rootStatus.pid])) fail('legacy_migration_process');
  const markers = knownMarkers(c, before, process);
  if (read(path.join(c.d.installRoot, 'install.lock')).bytes !== null || read(path.join(c.d.stateDir, 'runtime-maintenance.json')).bytes !== null) fail('legacy_migration_busy');
  const after = c.snapshot(); if (!equal(before.facts, after.facts)) fail('legacy_migration_changed');
  const proof = { preparedPlanHash: c.fingerprint.preparedPlanHash, descriptorHash: hash(plan.previousDescriptor), rootStatusHash: c.rootStatusHash, snapshot: after.facts, markers, process: { pid: process.pid, birthTicks: process.birthTicks, executablePath: process.executablePath } };
  return Object.freeze({ proof, proofHash: hash(proof), inspectionOnly: true, nativeDispatch: 0 });
}
function legacyMigrationLeasePermit(capability) { const p = permits.get(capability); if (!p) fail('legacy_migration_lease_brand'); p.check(); return p.value; }
function assertLegacyStopPermit(permit, handle) { const p = stops.get(permit); if (!p || p.handle !== handle || p.used) fail('legacy_migration_stop_brand'); p.check(); p.used = true; }
function assertLegacyStoppedCapability(capability, { plan, lease }) {
  const p = stopped.get(capability); if (!p || p.plan !== plan || p.lease !== lease) fail('legacy_migration_stopped_brand'); p.check();
  return { installation: p.c.d, descriptorPath: plan.descriptorPath, id: p.id, facts: structuredClone(p.facts) };
}
// The caller retains the same plan and lease throughout stop, retirement, update.
async function stopLegacyForUpdate({ plan, rootStatus, observedAt, id, expectedProofHash }) {
  if (!UUID.test(id)) fail('legacy_migration_id');
  const inspected = await inspectLegacyMigration({ plan, rootStatus, observedAt }); if (inspected.proofHash !== expectedProofHash) fail('legacy_migration_changed');
  const c = context(plan, rootStatus, observedAt), baseline = inspected.proof.snapshot, originalMarkers = inspected.proof.markers, target = inspected.proof.process;
  const actorFacts = await processFacts(process.pid, false), actor = { bootId: crypto.randomUUID(), pid: process.pid, birthTicks: actorFacts.birthTicks }, nonce = crypto.randomUUID();
  const directory = path.join(c.d.installRoot, 'transactions', id + '-legacy-migration'); plain(path.dirname(directory), false, true); fs.mkdirSync(directory);
  const gates = ['install', 'broker'].map(role => c.seal('legacy-migration-gate', { id, actor, role, nonce }));
  // Original keys and all payload bytes survive a pre-switch operator death.
  // This is sealed DATA for the dedicated recovery path, never a plan rebrand.
  const prepared = require('./install-core4').preparedInstallPayload(plan);
  const preparedView = write(path.join(directory, 'original-prepared.json'), canonical(prepared));
  const intent = write(path.join(directory, 'intent.json'), c.seal('legacy-migration-intent', { id, actor, nonce, target, proof: inspected.proof, planHash: c.fingerprint.preparedPlanHash, prepared: info(preparedView), gates: gates.map(v => v.toString('base64')) }));
  const scope = { installRoot: c.d.installRoot, stateDir: c.d.stateDir, descriptorPath: plan.descriptorPath };
  const configBaseline = info(read(plan.configPath, 64 * 1024 * 1024));
  let lease, handle, stopBarrier, stopRecord, retained = true, stoppedReady = false;
  function baseCheck() {
    const installer = require('./install-core4'), held = lease && require('../runtime/install-lease').assertInstallLease(lease, scope);
    if (!stoppedReady || held?.phase !== 'installing') installer.assertPreparedInstallBaseline(plan);
    else {
      // Only the finalized stopped capability can accompany this SAME branded
      // installer lease into staging. applyInstall independently pins each of
      // its staged files and performs its staged-aware final baseline CAS.
      installer.assertPreparedInstallPlan(plan);
      if (!equal(info(read(plan.configPath, 64 * 1024 * 1024)), configBaseline) || !equal(installer.snapshot(plan.cepDir), plan.previousCep)) fail('install_baseline_changed');
      for (const [file, expected] of [[plan.descriptorPath + '.next', Buffer.from(canonical(plan.descriptor))], [plan.clientBinding.clientDescriptorPath + '.next', plan.nextClient], [plan.configPath + '.core4-next', Buffer.from(plan.nextConfig)]]) {
        const stage = read(file, 64 * 1024 * 1024); if (stage.bytes && (!expected || !stage.bytes.equals(expected))) fail('legacy_migration_staging_changed');
      }
      if (read(plan.clientBinding.clientDescriptorPath + '.rollback').bytes !== null) fail('client_binding_staging_exists');
    }
    if (stopBarrier && !equal(info(read(stopBarrier.file)), info(stopBarrier)) || stopRecord && !equal(info(read(stopRecord.file)), info(stopRecord))) fail('legacy_migration_changed');
    if (!equal(require('../runtime/stdio-entry').verifyInstallation(plan.descriptorPath), c.d)) fail('legacy_migration_changed');
    if (!equal(c.snapshot().facts, baseline) || !equal(info(read(preparedView.file, 64 * 1024 * 1024)), info(preparedView)) || !equal(info(read(intent.file)), info(intent))) fail('legacy_migration_changed');
  }
  function capability(installOnly, check = baseCheck) { const cap = Object.freeze({}); permits.set(cap, { check, value: { scope, nonce, gates, installOnly } }); return cap; }
  try {
    const api = require('../runtime/install-lease'); lease = api.acquireLegacyMigrationInstallLease(capability(true));
    baseCheck(); knownMarkers(c, c.snapshot(), target, originalMarkers);
    const barrier = stopBarrier = write(path.join(c.d.stateDir, 'runtime-maintenance.json'), c.seal('legacy-migration-stop', { id, actor, target, intentHash: hash(intent.bytes), snapshot: baseline, nonce }));
    handle = await native.retainProcess(target); baseCheck(); knownMarkers(c, c.snapshot(), target, originalMarkers);
    if ((await native.inspectRetainedProcess(handle)).state !== 'alive') fail('legacy_migration_process');
    baseCheck(); knownMarkers(c, c.snapshot(), target, originalMarkers);
    const stopIntent = stopRecord = write(path.join(directory, 'stop-intent.json'), c.seal('legacy-migration-root-stop', { id, actor, target, barrierHash: hash(barrier.bytes), barrier: info(barrier), intentHash: hash(intent.bytes), snapshot: baseline, markers: originalMarkers }));
    const stopPermit = Object.freeze({}); stops.set(stopPermit, { handle, used: false, check() { baseCheck(); if (!equal(info(read(stopIntent.file)), info(stopIntent)) || !equal(info(read(barrier.file)), info(barrier))) fail('legacy_migration_changed'); knownMarkers(c, c.snapshot(), target, originalMarkers); } });
    const response = await native.stopRetainedProcess(handle, stopPermit);
    if (!['stopped', 'exited'].includes(response.state) || (await native.inspectRetainedProcess(handle)).state !== 'exited') fail('legacy_migration_stop_unknown');
    baseCheck(); knownMarkers(c, c.snapshot(), target, originalMarkers);
    write(path.join(directory, 'stop-receipt.json'), c.seal('legacy-migration-stop-observed', { id, actor, target, stopIntentHash: hash(stopIntent.bytes), stopIntent: info(stopIntent), state: response.state }));
    api.promoteLegacyMigrationInstallLease(lease, capability(false));
    const retirement = write(path.join(directory, 'retirement-intent.json'), c.seal('legacy-migration-retirement', { id, actor, snapshot: baseline, originals: originalMarkers, stopIntentHash: hash(stopIntent.bytes) }));
    for (const [name, archive] of [['broker/broker-owner.lock', 'broker-owner.lock'], ['receiver/owner', 'receiver-owner']]) {
      const file = path.join(c.d.stateDir, name), saved = originalMarkers[name], view = read(file);
      if (!equal(info(view), saved)) fail('legacy_migration_changed'); fs.renameSync(file, path.join(directory, archive));
      const after = read(path.join(directory, archive)); if (!after.bytes?.equals(view.bytes) || ['dev', 'ino', 'size', 'mtimeNs'].some(k => after.stat[k] !== view.stat[k]) || read(file).bytes !== null) fail('legacy_migration_changed');
    }
    baseCheck(); api.assertInstallLease(lease, scope);
    const completion = write(path.join(directory, 'completion.json'), c.seal('legacy-migration-completed', { id, actor, target, stopHash: hash(barrier.bytes), retirementHash: hash(retirement.bytes), snapshot: baseline, markers: c.markers() }));
    const phaseStat = fs.lstatSync(directory, { bigint: true }), phase = { directory: { dev: String(phaseStat.dev), ino: String(phaseStat.ino), birthtimeNs: String(phaseStat.birthtimeNs) }, tree: Object.fromEntries(fs.readdirSync(directory).sort().map(n => [n, info(read(path.join(directory, n), 64 * 1024 * 1024))])) };
    function projectedMarkers() { api.assertInstallLease(lease, scope, { full: true }); const result = c.markers(); result['broker/broker-owner.gate'] = { hash: null, stat: null }; return result; }
    const facts = { id, stopHash: hash(barrier.bytes), stop: info(barrier), certificateHash: hash(completion.bytes), descriptorHash: baseline.descriptor.hash, snapshot: baseline, phase, lifecycle: { markers: projectedMarkers(), transactions: {} }, markers: projectedMarkers(), installGate: { hash: null, stat: null } };
    const result = Object.freeze({}); stopped.set(result, { plan, lease, c, id, facts, check() {
      baseCheck(); api.assertInstallLease(lease, scope);
      const currentDirectory = fs.lstatSync(directory, { bigint: true });
      if (!equal({ dev: String(currentDirectory.dev), ino: String(currentDirectory.ino), birthtimeNs: String(currentDirectory.birthtimeNs) }, phase.directory) || !equal(info(read(barrier.file)), info(barrier)) || !read(completion.file).bytes?.equals(completion.bytes) || !equal(fs.readdirSync(directory).sort(), Object.keys(phase.tree).sort()) || !equal(projectedMarkers(), facts.markers)) fail('legacy_migration_changed');
      for (const [n, expected] of Object.entries(phase.tree)) if (!equal(info(read(path.join(directory, n), 64 * 1024 * 1024)), expected)) fail('legacy_migration_changed');
    } });
    stoppedReady = true; retained = false; return { stoppedCapability: result, lease, installation: c.d, id, descriptorPath: plan.descriptorPath, nativeDispatch: 0 };
  } catch (e) { if (lease) require('../runtime/install-lease').retainInstallLease(lease); e.leaseRetained = true; e.recoveryDirectory = directory; throw e; }
  finally { if (handle) native.closeRetainedProcess(handle); if (retained && lease) require('../runtime/install-lease').retainInstallLease(lease); }
}
function endpoint(server) { const a = server instanceof http.Server && server.listening && server.address(); if (!a || a.address !== '127.0.0.1' || !Number.isInteger(a.port) || server.listenerCount('request')) fail('legacy_migration_endpoint'); }
function actorScope(a) { if (!a || Object.keys(a).sort().join(',') !== 'birthTicks,bootId,pid' || !UUID.test(a.bootId) || !Number.isInteger(a.pid) || a.pid < 1 || a.pid > 0xffffffff || !/^[1-9][0-9]{0,18}$/.test(a.birthTicks)) fail('legacy_migration_actor'); }
const moved = (a, b) => a?.hash === b?.hash && !!a?.stat === !!b?.stat && (!a.stat || ['dev', 'ino', 'size', 'mtimeNs'].every(k => a.stat[k] === b.stat[k]));
const nil = () => ({ hash: null, stat: null });
function phaseTree(directory) {
  plain(directory, false, true); const s = fs.lstatSync(directory, { bigint: true }), names = fs.readdirSync(directory).sort(); if (names.length > 160) fail('legacy_migration_budget');
  const fixed = ['original-prepared.json', 'intent.json', 'stop-intent.json', 'stop-receipt.json', 'retirement-intent.json', 'completion.json', 'broker-owner.lock', 'receiver-owner'];
  const tree = {};
  for (const n of names) {
    const base = n.replace(/\.stage-[a-f0-9-]{36}$/, '');
    const recovery = /^recover-[a-f0-9-]{36}(\.json|-completed\.json|-(install|broker)-(old|new))$/.test(base) && UUID.test(base.slice(8, 44));
    if ((!fixed.includes(base) && !recovery) || base !== n && (!UUID.test(n.slice(base.length + 7)) || !/^recover-[a-f0-9-]{36}(\.json|-completed\.json|-(install|broker)-new)$/.test(base))) fail('legacy_migration_phase');
    tree[n] = info(read(path.join(directory, n), 64 * 1024 * 1024));
  }
  return { directory: { dev: String(s.dev), ino: String(s.ino), birthtimeNs: String(s.birthtimeNs) }, tree };
}
function publish(file, bytes, nonce) {
  plain(path.dirname(file), false, true); if (plain(file, true)) fail('legacy_migration_destination');
  const stage = file + '.stage-' + nonce; let fd = fs.openSync(stage, 'wx+');
  try {
    if (fs.writeSync(fd, bytes) !== bytes.length) fail('legacy_migration_short_write'); fs.fsyncSync(fd);
    const before = read(stage); if (!before.bytes.equals(bytes) || !equal(before.stat, stamp(fs.fstatSync(fd, { bigint: true })))) fail('legacy_migration_changed');
    fs.linkSync(stage, file); const linked = read(file); if (!moved(info(linked), info(before))) fail('legacy_migration_changed');
    fs.unlinkSync(stage); const closing = fd; fd = undefined; fs.closeSync(closing);
    const after = read(file); if (!after.bytes.equals(bytes) || !moved(info(after), info(before))) fail('legacy_migration_changed'); return after;
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}
function payloadData(view, intent, options, d) {
  if (!equal(info(view), intent.prepared)) fail('legacy_migration_prepared_changed');
  let p, next; try { p = JSON.parse(view.bytes); next = JSON.parse(Buffer.from(p.descriptorBytes, 'base64')); } catch { fail('legacy_migration_prepared_changed'); }
  const keys = ['version', 'transactionId', 'preparedPlanHash', 'package', 'origin', 'originBytes', 'clientBinding', 'nextClient', 'descriptorBytes', 'descriptorPath', 'configPath', 'configBytes', 'cepDir', 'cep', 'previousDescriptor', 'previousConfig', 'previousCep', 'baseline'];
  if (!equal(Object.keys(p).sort(), keys.sort()) || !Buffer.from(canonical(p)).equals(view.bytes) || p.version !== 1 || !UUID.test(p.transactionId) || p.preparedPlanHash !== intent.planHash || !HEX.test(p.preparedPlanHash) || p.descriptorPath !== options.descriptorPath || !Buffer.from(p.previousDescriptor || '', 'base64').equals(read(options.descriptorPath).bytes) || next.packageHash !== options.expectedPackageHash || p.package?.packageHash !== next.packageHash || next.installationId !== d.installationId || next.machineId !== d.machineId || next.installRoot !== d.installRoot || next.stateDir !== d.stateDir || next.releaseDir !== path.join(d.installRoot, 'releases', next.packageHash) || next.nodePath !== d.nodePath || next.nodeHash !== d.nodeHash || next.nodeVersion !== d.nodeVersion || next.cepDir !== p.cepDir || next.predecessor?.transactionId !== p.transactionId || next.predecessor?.previousDescriptorHash !== options.expectedPreviousDescriptorHash) fail('legacy_migration_prepared_changed');
  const pkg = require('./package-installable'); pkg.verifyPackage(p.package); if (pkg.runtimeBinding(p.package.release, f => Buffer.from(p.package.files[f], 'base64')).runtimeModel !== 'owner') fail('legacy_migration_prepared_changed');
  const digest = hash({ transactionId: p.transactionId, package: p.package, origin: p.origin, originBytes: p.originBytes, clientBinding: p.clientBinding, nextClient: p.nextClient, descriptor: next, descriptorPath: p.descriptorPath, configPath: p.configPath, nextConfig: Buffer.from(p.configBytes, 'base64').toString('utf8'), cepDir: p.cepDir, cep: p.cep, previousDescriptor: p.previousDescriptor, previousConfig: p.previousConfig, previousCep: p.previousCep, baseline: p.baseline });
  if (digest !== p.preparedPlanHash || !path.isAbsolute(p.configPath) || path.resolve(p.configPath) !== p.configPath || !path.isAbsolute(p.cepDir) || path.resolve(p.cepDir) !== p.cepDir || d.cepDir && d.cepDir !== p.cepDir) fail('legacy_migration_prepared_changed');
  return p;
}
function readPreparedRecovery(options) {
  endpoint(options.reservedServer);
  const { descriptorPath, id, expectedPreviousDescriptorHash, expectedPackageHash } = options;
  if (!UUID.test(id) || !HEX.test(expectedPreviousDescriptorHash) || !HEX.test(expectedPackageHash)) fail('legacy_migration_recovery_scope');
  const oldView = read(descriptorPath); if (!oldView.bytes || hash(oldView.bytes) !== expectedPreviousDescriptorHash) fail('legacy_migration_changed');
  const d = require('../runtime/stdio-entry').verifyInstallation(descriptorPath);
  if (d.machineId !== os.hostname() || descriptorPath !== path.join(d.installRoot, 'installation.json') || d.stateDir !== path.join(d.installRoot, 'state/production') || d.packageHash !== PROFILE.packageHash) fail('legacy_migration_profile');
  for (const [file, digest] of Object.entries(PROFILE.hashes)) if (hash(fs.readFileSync(path.join(d.releaseDir, file))) !== digest) fail('legacy_migration_profile');
  const directory = path.join(d.installRoot, 'transactions', id + '-legacy-migration'), raw = read(path.join(directory, 'original-prepared.json'), 64 * 1024 * 1024);
  let originBytes; try { originBytes = Buffer.from(JSON.parse(raw.bytes).originBytes, 'base64'); } catch { fail('legacy_migration_record'); }
  const c = stateContext(d, descriptorPath, oldView.bytes, originBytes), intentView = read(path.join(directory, 'intent.json')), intent = c.decode(intentView, 'legacy-migration-intent');
  actorScope(intent.actor);
  if (intent.id !== id || !UUID.test(intent.nonce) || !intent.proof || intent.proof.descriptorHash !== expectedPreviousDescriptorHash || intent.proof.preparedPlanHash !== intent.planHash || !equal(intent.target, intent.proof.process) || !Array.isArray(intent.gates) || intent.gates.length !== 2) fail('legacy_migration_record');
  intent.gates.forEach((s, i) => { const bytes = Buffer.from(s, 'base64'), b = c.decode({ bytes }, 'legacy-migration-gate'); if (bytes.toString('base64') !== s || b.id !== id || !equal(b.actor, intent.actor) || b.role !== ['install', 'broker'][i] || b.nonce !== intent.nonce) fail('legacy_migration_record'); });
  const payload = payloadData(raw, intent, options, d), snap = c.snapshot();
  if (!equal(snap.facts, intent.proof.snapshot)) fail('legacy_migration_changed');
  const config = read(payload.configPath, 64 * 1024 * 1024), cep = require('./install-core4').snapshot(payload.cepDir);
  if (config.bytes?.toString('base64') !== payload.previousConfig || !equal(cep, payload.previousCep) || config.bytes && hash(config.bytes) !== payload.baseline.config || hash(cep) !== payload.baseline.cep) fail('legacy_migration_changed');
  const base = { snapshot: snap.facts, config: info(config), cep };
  const phase = phaseTree(directory), get = n => read(path.join(directory, n), 64 * 1024 * 1024), barrier = read(path.join(d.stateDir, 'runtime-maintenance.json'));
  const stopView = get('stop-intent.json'), receiptView = get('stop-receipt.json'), retirementView = get('retirement-intent.json'), completionView = get('completion.json');
  let stopIntent, receipt, retirement, recoveredBarrier;
  if (barrier.bytes) {
    let kind; try { kind = JSON.parse(barrier.bytes).body.kind; } catch { fail('legacy_migration_record'); }
    const b = c.decode(barrier, kind);
    if (b.id !== id || !equal(b.target, intent.target) || b.intentHash !== hash(intentView.bytes) || !equal(b.snapshot, snap.facts)) fail('legacy_migration_record');
    if (kind === 'legacy-migration-stop') { if (!equal(b.actor, intent.actor) || b.nonce !== intent.nonce) fail('legacy_migration_record'); }
    else if (kind === 'legacy-migration-recovered-stop' && !stopView.bytes && !receiptView.bytes && !retirementView.bytes) recoveredBarrier = b;
    else fail('legacy_migration_record');
  }
  if (stopView.bytes) { stopIntent = c.decode(stopView, 'legacy-migration-root-stop'); if (!barrier.bytes || stopIntent.id !== id || !equal(stopIntent.actor, intent.actor) || !equal(stopIntent.target, intent.target) || stopIntent.intentHash !== hash(intentView.bytes) || stopIntent.barrierHash !== hash(barrier.bytes) || !equal(stopIntent.barrier, info(barrier)) || !equal(stopIntent.snapshot, snap.facts) || !equal(stopIntent.markers, intent.proof.markers)) fail('legacy_migration_record'); }
  if (receiptView.bytes) { receipt = c.decode(receiptView, 'legacy-migration-stop-observed'); if (!stopIntent || receipt.id !== id || !equal(receipt.actor, intent.actor) || !equal(receipt.target, intent.target) || receipt.stopIntentHash !== hash(stopView.bytes) || !equal(receipt.stopIntent, info(stopView)) || !['stopped', 'exited'].includes(receipt.state)) fail('legacy_migration_record'); }
  if (retirementView.bytes) { retirement = c.decode(retirementView, 'legacy-migration-retirement'); if (!receipt || retirement.id !== id || !equal(retirement.actor, intent.actor) || !equal(retirement.snapshot, snap.facts) || !equal(retirement.originals, intent.proof.markers) || retirement.stopIntentHash !== hash(stopView.bytes)) fail('legacy_migration_record'); }
  const gatePaths = [path.join(d.installRoot, 'install.lock'), path.join(d.stateDir, 'broker/broker-owner.gate')], gates = gatePaths.map(file => read(file));
  const chains = new Map(), children = new Map();
  for (const n of Object.keys(phase.tree).filter(n => /^recover-[a-f0-9-]{36}\.json$/.test(n))) {
    const v = get(n), a = c.decode(v, 'legacy-migration-recovery-attempt'); actorScope(a.actor);
    if (a.id !== id || !UUID.test(a.attemptId) || n !== 'recover-' + a.attemptId + '.json' || a.parentHash !== null && !HEX.test(a.parentHash) || a.intentHash !== hash(intentView.bytes) || !HEX.test(a.proofHash) || !Array.isArray(a.sources) || a.sources.length !== 2 || !Array.isArray(a.targets) || a.targets.length !== 2 || children.has(a.parentHash)) fail('legacy_migration_recovery_chain');
    a.targets.forEach((s, i) => { const g = c.decode({ bytes: Buffer.from(s, 'base64') }, 'legacy-migration-recovery-gate'); if (g.id !== id || g.attemptId !== a.attemptId || !equal(g.actor, a.actor) || g.role !== ['install', 'broker'][i] || !UUID.test(g.nonce)) fail('legacy_migration_record'); });
    if (!a.protected || !equal(a.protected.base, base) || (a.protected.barrier?.hash !== null ? !equal(a.protected.barrier, info(barrier)) : barrier.bytes && !recoveredBarrier) || !a.protected.records?.['original-prepared.json'] || !a.protected.records?.['intent.json']) fail('legacy_migration_changed');
    for (const name of ['stop-intent.json', 'stop-receipt.json', 'retirement-intent.json', 'completion.json']) if (Object.hasOwn(a.protected.records, name) !== Object.hasOwn(phase.tree, name)) fail('legacy_migration_changed');
    for (const [name, fact] of Object.entries(a.protected.records || {})) if (!equal(phase.tree[name], fact)) fail('legacy_migration_changed');
    const digest = hash(v.bytes); chains.set(digest, { ...a, digest }); children.set(a.parentHash, digest);
  }
  if (chains.size > 16) fail('legacy_migration_budget');
  const attempts = []; for (let next = children.get(null); next; next = children.get(next)) { if (attempts.length >= chains.size || !chains.has(next)) fail('legacy_migration_recovery_chain'); attempts.push(chains.get(next)); }
  if (attempts.length !== chains.size) fail('legacy_migration_recovery_chain');
  const initial = attempts[0]?.sources || gates.map(v => ({ ...info(v), bytes: v.bytes?.toString('base64') ?? null }));
  initial.forEach((s, i) => { if (s.bytes !== null && s.bytes !== intent.gates[i] || s.bytes === null && (i === 0 && (barrier.bytes && !recoveredBarrier || stopView.bytes || receiptView.bytes || retirementView.bytes) || i === 1 && retirementView.bytes)) fail('legacy_migration_phase'); });
  if (initial[1].bytes !== null && (!receipt || initial[0].bytes === null)) fail('legacy_migration_phase');
  for (const [index, a] of attempts.entries()) {
    const end = attempts[index + 1]?.sources || gates.map(v => ({ ...info(v), bytes: v.bytes?.toString('base64') ?? null }));
    const states = end.map((s, i) => s.bytes === a.targets[i] ? 'T' : s.bytes === a.sources[i].bytes && moved(s, a.sources[i]) ? 'S' : 'X').join('');
    if (!['SS', 'TS', 'TT'].includes(states)) fail('legacy_migration_phase');
    for (const [i, role] of ['install', 'broker'].entries()) {
      const old = get('recover-' + a.attemptId + '-' + role + '-old'), next = get('recover-' + a.attemptId + '-' + role + '-new');
      if (old.bytes && (a.sources[i].bytes === null || old.bytes.toString('base64') !== a.sources[i].bytes || !moved(info(old), a.sources[i]))) fail('legacy_migration_changed');
      if (states[i] === 'T' && a.sources[i].bytes !== null && !old.bytes) fail('legacy_migration_phase');
      if (next.bytes && next.bytes.toString('base64') !== a.targets[i]) fail('legacy_migration_changed');
    }
  }
  for (const n of Object.keys(phase.tree).filter(n => /^recover-.*-(old|new)/.test(n))) if (!attempts.some(a => n.startsWith('recover-' + a.attemptId + '-'))) fail('legacy_migration_phase');
  if (recoveredBarrier) { const a = attempts.find(a => a.attemptId === recoveredBarrier.attemptId); if (!a || recoveredBarrier.attemptHash !== a.digest || !equal(recoveredBarrier.actor, a.actor) || !UUID.test(recoveredBarrier.nonce)) fail('legacy_migration_record'); }
  const markers = c.markers(), archived = {};
  for (const [name, archive] of [['broker/broker-owner.lock', 'broker-owner.lock'], ['receiver/owner', 'receiver-owner']]) {
    const source = read(path.join(d.stateDir, name)), target = get(archive), saved = intent.proof.markers[name]; archived[archive] = info(target);
    if (source.bytes && target.bytes || !source.bytes && !target.bytes || source.bytes && !equal(info(source), saved) || target.bytes && !moved(info(target), saved) || target.bytes && !retirement && !attempts.length) fail('legacy_migration_marker');
    const original = source.bytes ? source : target;
    if (name === 'receiver/owner') { if (original.bytes.length || BigInt(saved.stat.birthtimeNs) >= (BigInt(intent.target.birthTicks) - 621355968000000000n) * 100n) fail('legacy_migration_marker'); }
    else { let owner; try { owner = JSON.parse(original.bytes); } catch { fail('legacy_migration_marker'); } if (!owner || Object.keys(owner).sort().join(',') !== 'pid,token' || owner.pid !== intent.target.pid || !UUID.test(owner.token)) fail('legacy_migration_marker'); }
  }
  for (const [n, f] of Object.entries(markers)) if (!['broker/broker-owner.lock', 'receiver/owner', 'broker/broker-owner.gate'].includes(n) && f.hash !== null) fail('legacy_migration_marker');
  if (completionView.bytes) { const b = c.decode(completionView, 'legacy-migration-completed'); if (!retirement || b.id !== id || !equal(b.actor, intent.actor) || !equal(b.target, intent.target) || b.stopHash !== hash(barrier.bytes) || b.retirementHash !== hash(retirementView.bytes) || !equal(b.snapshot, snap.facts) || Object.values(archived).some(v => v.hash === null)) fail('legacy_migration_record'); }
  for (const n of Object.keys(phase.tree).filter(n => /^recover-[a-f0-9-]{36}-completed\.json$/.test(n))) {
    const a = attempts.find(a => n === 'recover-' + a.attemptId + '-completed.json'), b = c.decode(get(n), 'legacy-migration-recovery-completed');
    if (!a || b.id !== id || b.intentHash !== hash(intentView.bytes) || b.attemptHash !== a.digest || !equal(b.actor, a.actor) || b.stopHash !== hash(barrier.bytes) || !equal(b.snapshot, snap.facts) || Object.values(archived).some(v => v.hash === null)) fail('legacy_migration_record');
  }
  const recoveryCompletion = attempts.length ? get('recover-' + attempts.at(-1).attemptId + '-completed.json') : { bytes: null };
  const facts = { base, phase, barrier: info(barrier), gates: gates.map(info), markers };
  return { c, directory, intent, intentView, payload, base, phase, barrier, stopIntent, receipt, retirement, completionView, recoveryCompletion, attempts, gatePaths, gates, facts, proofHash: hash(facts) };
}
async function nativeDead(identity) { const v = await processFacts(identity.pid, false, true); if (v.birthTicks === identity.birthTicks) fail('legacy_migration_process_not_dead'); return v; }
async function inspectedPreparedRecovery(options) {
  const first = readPreparedRecovery(options); await nativeDead(first.intent.actor); await nativeDead(first.intent.target);
  for (const a of first.attempts) await nativeDead(a.actor);
  const after = readPreparedRecovery(options); if (!equal(after.facts, first.facts)) fail('legacy_migration_changed'); return after;
}
async function inspectLegacyPreparedRecovery(options) { const r = await inspectedPreparedRecovery(options); return Object.freeze({ id: options.id, transactionId: r.payload.transactionId, phase: r.recoveryCompletion.bytes || r.completionView.bytes ? 'legacy-stopped-prepared' : 'legacy-stop-pending', proofHash: r.proofHash, inspectionOnly: true, runtimeStarted: false, nativeDispatch: 0 }); }
function assertLegacyPreparedRecovery(capability) { const p = preparedRecoveries.get(capability); if (!p) fail('legacy_migration_recovery_brand'); p.check(); return { lease: p.lease, installation: p.installation, descriptorPath: p.descriptorPath, id: p.id, facts: structuredClone(p.facts), reservedServer: p.reservedServer, payload: structuredClone(p.payload), originalActor: structuredClone(p.originalActor) }; }
async function finishLegacyPreparedRecovery(options) {
  if (!HEX.test(options.expectedProofHash)) fail('legacy_migration_expected_proof');
  const r = await inspectedPreparedRecovery(options); if (r.proofHash !== options.expectedProofHash) fail('legacy_migration_changed');
  const self = await processFacts(process.pid, false); if (self.executablePath.toLowerCase() !== r.c.d.nodePath.toLowerCase()) fail('legacy_migration_process');
  if (!equal(readPreparedRecovery(options).facts, r.facts)) fail('legacy_migration_changed');
  if (r.attempts.length >= 16) fail('legacy_migration_budget');
  const actor = { bootId: crypto.randomUUID(), pid: process.pid, birthTicks: self.birthTicks }, attemptId = crypto.randomUUID(), targets = ['install', 'broker'].map(role => r.c.seal('legacy-migration-recovery-gate', { id: options.id, attemptId, actor, role, nonce: crypto.randomUUID() }));
  const sources = r.gates.map(v => ({ ...info(v), bytes: v.bytes?.toString('base64') ?? null }));
  const protectedFacts = { base: r.base, barrier: info(r.barrier), records: Object.fromEntries(Object.entries(r.phase.tree).filter(([n]) => /\.json(?:\.stage-[a-f0-9-]{36})?$/.test(n))) };
  const checkBase = () => { endpoint(options.reservedServer); const now = readPreparedRecovery(options); if (!equal(now.base, r.base) || r.barrier.bytes && !equal(info(now.barrier), info(r.barrier))) fail('legacy_migration_changed'); for (const [n, f] of Object.entries(protectedFacts.records)) if (!equal(now.phase.tree[n], f)) fail('legacy_migration_changed'); return now; };
  const record = publish(path.join(r.directory, 'recover-' + attemptId + '.json'), r.c.seal('legacy-migration-recovery-attempt', { id: options.id, attemptId, parentHash: r.attempts.at(-1)?.digest || null, actor, intentHash: hash(r.intentView.bytes), proofHash: r.proofHash, protected: protectedFacts, sources, targets: targets.map(b => b.toString('base64')) }), actor.bootId);
  function takeover(i) {
    checkBase(); const file = r.gatePaths[i], prefix = path.join(r.directory, 'recover-' + attemptId + '-' + ['install', 'broker'][i]), prepared = publish(prefix + '-new', targets[i], actor.bootId), source = read(file);
    if (!moved(info(source), sources[i]) || source.bytes?.toString('base64') !== (sources[i].bytes ?? undefined)) fail('legacy_migration_changed');
    if (source.bytes) {
      const fd = fs.openSync(file, 'r'); try { if (!equal(stamp(fs.fstatSync(fd, { bigint: true })), source.stat)) fail('legacy_migration_changed'); fs.linkSync(file, prefix + '-old'); if (!moved(info(read(prefix + '-old')), info(source))) fail('legacy_migration_changed'); } finally { fs.closeSync(fd); }
      if (!moved(info(read(file)), info(source))) fail('legacy_migration_changed'); fs.renameSync(prepared.file, file);
    } else { fs.linkSync(prepared.file, file); fs.unlinkSync(prepared.file); }
    const current = read(file); if (!current.bytes.equals(targets[i]) || !moved(info(current), info(prepared))) fail('legacy_migration_changed'); checkBase();
  }
  let lease;
  try {
    takeover(0);
    const api = require('../runtime/install-lease'), scope = { installRoot: r.c.d.installRoot, stateDir: r.c.d.stateDir, descriptorPath: options.descriptorPath };
    function permit(installOnly) { const cap = Object.freeze({}); permits.set(cap, { check() { checkBase(); if (lease) api.assertInstallLease(lease, scope); }, value: { scope, nonce: actor.bootId, gates: targets, recovery: true, installOnly, facts: r.gatePaths.map((file, i) => ({ file, ...info(read(file)), hash: hash(targets[i]) })) } }); return cap; }
    lease = api.acquireLegacyMigrationRecoveryLease(permit(true));
    // No stop is retried. Fresh exact native death was proved above; preserve
    // an existing original barrier, or issue our own separately identified one.
    if (!r.barrier.bytes) publish(path.join(r.c.d.stateDir, 'runtime-maintenance.json'), r.c.seal('legacy-migration-recovered-stop', { id: options.id, actor, target: r.intent.target, intentHash: hash(r.intentView.bytes), snapshot: r.base.snapshot, attemptId, attemptHash: hash(record.bytes), nonce: crypto.randomUUID() }), actor.bootId);
    takeover(1); api.promoteLegacyMigrationInstallLease(lease, permit(false));
    for (const [name, archive] of [['broker/broker-owner.lock', 'broker-owner.lock'], ['receiver/owner', 'receiver-owner']]) {
      checkBase(); const source = read(path.join(r.c.d.stateDir, name)), target = read(path.join(r.directory, archive));
      if (source.bytes) {
        if (target.bytes || !equal(info(source), r.intent.proof.markers[name])) fail('legacy_migration_changed');
        const fd = fs.openSync(source.file, 'r');
        try {
          if (!equal(stamp(fs.fstatSync(fd, { bigint: true })), source.stat) || !equal(stamp(fs.lstatSync(source.file, { bigint: true })), source.stat)) fail('legacy_migration_changed');
          fs.renameSync(source.file, path.join(r.directory, archive)); const archived = read(path.join(r.directory, archive));
          if (!archived.bytes?.equals(source.bytes) || !moved(info(archived), info(source)) || !equal(archived.stat, stamp(fs.fstatSync(fd, { bigint: true }))) || read(source.file).bytes) fail('legacy_migration_changed');
        } finally { fs.closeSync(fd); }
        if (!moved(info(read(path.join(r.directory, archive))), info(source))) fail('legacy_migration_changed');
      }
    }
    checkBase(); api.assertInstallLease(lease, scope, { full: true });
    const currentBarrier = read(path.join(r.c.d.stateDir, 'runtime-maintenance.json'));
    const completion = publish(path.join(r.directory, 'recover-' + attemptId + '-completed.json'), r.c.seal('legacy-migration-recovery-completed', { id: options.id, actor, intentHash: hash(r.intentView.bytes), attemptHash: hash(record.bytes), stopHash: hash(currentBarrier.bytes), snapshot: r.base.snapshot }), actor.bootId);
    const final = readPreparedRecovery(options), markers = final.c.markers(); markers['broker/broker-owner.gate'] = nil(); if (Object.values(markers).some(v => v.hash !== null)) fail('legacy_migration_marker');
    const facts = { id: options.id, stopHash: hash(final.barrier.bytes), stop: info(final.barrier), certificateHash: hash(completion.bytes), descriptorHash: r.base.snapshot.descriptor.hash, snapshot: r.base.snapshot, phase: final.phase, lifecycle: { markers, transactions: {} }, markers, installGate: nil() };
    const cap = Object.freeze({}); preparedRecoveries.set(cap, { lease, installation: r.c.d, descriptorPath: options.descriptorPath, id: options.id, facts, reservedServer: options.reservedServer, payload: r.payload, originalActor: r.intent.actor, check() { api.assertInstallLease(lease, scope, { full: true }); const now = readPreparedRecovery(options); if (!equal(now.facts, final.facts)) fail('legacy_migration_changed'); } });
    return cap;
  } catch (error) { if (lease) require('../runtime/install-lease').retainInstallLease(lease); error.leaseRetained = true; throw error; }
}
module.exports = { inspectLegacyMigration, stopLegacyForUpdate, legacyMigrationLeasePermit, assertLegacyStopPermit, assertLegacyStoppedCapability,
  inspectLegacyPreparedRecovery, finishLegacyPreparedRecovery, assertLegacyPreparedRecovery };
