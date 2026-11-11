'use strict';
// One reviewed desktop incident, not an installer or an authority issuer.
// All admission starts with builtins. No caller-supplied paths or validators.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const crypto = require('node:crypto'), cp = require('node:child_process'), net = require('node:net');
const PROFILE = Object.freeze({
  machine: 'DESKTOP-32974QF', backupId: '3884194e-07fb-4c33-8df0-130e284a674c',
  backupHash: 'c9915f2ebb991f7e9509b5910e5456d82b717f6b41492255b36752d7e1e80300',
  currentId: 'installation-e0e81ad5-6bce-451c-8cfd-8e2ec14f3700',
  foreignId: 'installation-7ece2c0b-8f3b-4839-b689-3ea661464e7b',
  descriptorHash: 'd3371a0858d2540fd6ebc0b4cdf43f2578fcffb4d08972a930bac902603900b1',
  currentUpdate: '7f087a29-7f60-45a9-ba11-78f72493f4f9', foreignUpdate: '004c57c5-e53b-48b0-8c8c-ad78033c82ae',
  stop: 'dfcc12b3-a01d-4b10-8e8e-198d7126f0d2',
  ledgerHash: '53f132d20be491ee75fa3845a9a1f55b44d3572a647e15c817f00bbbae35ac66',
  ledgerEvents: 166, terminals: 13, aePid: 14008, aeBirth: '2026-11-10T06:11:08.3950680Z',
  report: '.codex-runtime/p2-desktop-visible-20261110/installed-proof/native-receipts.json',
  foreignReceiverHash: '8a0dd0056a387ce371a9c20818350e453593e51e2ec4ba6fc349f9522e9d7cac'
});
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/, HEX = /^[a-f0-9]{64}$/;
const STATS = ['dev', 'ino', 'size', 'birthtimeNs', 'mtimeNs', 'ctimeNs'];
const FOREIGN = ['broker/ledger.ndjson', 'runtime-owner.json', 'broker/broker-owner.lock', 'receiver/owner'];
const CORE = path.resolve(__dirname, '..'), REPO = path.dirname(CORE);
// Pure dependencies from the reviewed 51eee397 source. Admission precedes import.
const SOURCE_CLOSURE_HASH = '6b133951906fc51115d70aaeb4a2ea26c8cffe9f211bab6be892879ff18ad41d';
function fail(code) { throw Object.assign(Error(code), { code }); }
function canonical(v) {
  if (v === null || ['string', 'boolean'].includes(typeof v) || typeof v === 'number' && Number.isFinite(v)) return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (!v || Object.getPrototypeOf(v) !== Object.prototype) fail('repair_json');
  return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
}
const hash = v => crypto.createHash('sha256').update(Buffer.isBuffer(v) || typeof v === 'string' ? v : canonical(v)).digest('hex');
const equal = (a, b) => canonical(a) === canonical(b);
const stamp = s => Object.fromEntries(STATS.map(k => [k, String(s[k])]));
function exact(v, keys) { if (!v || !equal(Object.keys(v).sort(), [...keys].sort())) fail('repair_schema'); }
function plain(file, directory = false, missing = false) {
  if (!path.isAbsolute(file) || path.resolve(file) !== file) fail('repair_path');
  let cursor = path.parse(file).root;
  for (const [i, part] of file.slice(cursor.length).split(path.sep).filter(Boolean).entries()) {
    cursor = path.join(cursor, part); let s;
    try { s = fs.lstatSync(cursor); } catch (e) { if (missing && e.code === 'ENOENT') return false; throw e; }
    const last = cursor === file;
    if (s.isSymbolicLink() || s.reparsePoint || fs.realpathSync(cursor) !== cursor || (!last || directory ? !s.isDirectory() : !s.isFile())) fail('repair_path');
  }
  return true;
}
function read(file, missing = false) {
  if (!plain(file, false, missing)) return { hash: null, stat: null, bytes: null };
  const fd = fs.openSync(file, 'r');
  try {
    const before = stamp(fs.fstatSync(fd, { bigint: true }));
    if (BigInt(before.size) > 128n * 1024n * 1024n) fail('repair_budget');
    const bytes = fs.readFileSync(fd);
    if (!equal(before, stamp(fs.fstatSync(fd, { bigint: true }))) || !equal(before, stamp(fs.lstatSync(file, { bigint: true }))) || bytes.length !== Number(before.size)) fail('repair_changed');
    return { bytes, hash: hash(bytes), stat: before };
  } finally { fs.closeSync(fd); }
}
const info = v => ({ hash: v.hash, stat: v.stat });
function same(actual, expected, moved = false) {
  // NTFS file tunnelling can replace creation time when a staged inode is
  // published under a recently vacated name. Keep the same moved-file CAS
  // fields as the ordinary stopped updater: dev/ino/size/mtime and bytes.
  return actual.hash === expected.hash && !!actual.stat === !!expected.stat && (!actual.stat || STATS.filter(k => !moved || !['birthtimeNs', 'ctimeNs'].includes(k)).every(k => actual.stat[k] === expected.stat[k]));
}
function tree(dir) {
  if (!plain(dir, true, true)) return null;
  const result = {};
  function visit(base, rel) {
    if (Object.keys(result).length > 4096) fail('repair_budget');
    result[rel] = { directory: true, stat: stamp(fs.lstatSync(base, { bigint: true })) };
    for (const name of fs.readdirSync(base).sort()) {
      const file = path.join(base, name), key = rel ? rel + '/' + name : name;
      const s = fs.lstatSync(file); plain(file, s.isDirectory());
      if (s.isDirectory()) visit(file, key); else result[key] = info(read(file));
    }
  }
  visit(dir, ''); return result;
}
function sameTree(a, b, moved = false) {
  if (a === null || b === null) return a === b;
  return equal(Object.keys(a), Object.keys(b)) && Object.keys(b).every(k => b[k].directory ? a[k].directory && STATS.filter(f => !(moved && k === '' && ['birthtimeNs', 'ctimeNs'].includes(f))).every(f => a[k].stat[f] === b[k].stat[f]) : same(a[k], b[k]));
}
function decoded(bytes) { const v = JSON.parse(bytes); if (!Buffer.from(canonical(v)).equals(bytes)) fail('repair_noncanonical'); return v; }
function key(d, domain) {
  if (!HEX.test(d.panelToken) || !HEX.test(d.controlToken) || d.panelToken === d.controlToken) fail('repair_credentials');
  return crypto.createHmac('sha256', Buffer.from(d.panelToken, 'hex')).update('ae-core4/' + domain + (domain === 'stopped-update' ? '/key/v1\0' : '-key/v1\0')).update(Buffer.from(d.controlToken, 'hex')).digest();
}
function checkMac(actual, expected) { if (!HEX.test(actual) || !crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'))) fail('repair_mac'); }
function signed(bytes, d, domain, kind, fields) {
  const v = decoded(bytes); exact(v, ['body', 'mac']);
  exact(v.body, ['version', 'kind', 'installationId', 'machineId', 'descriptorHash', ...fields]);
  const b = v.body;
  if (b.version !== 1 || b.kind !== kind || b.installationId !== d.installationId || b.machineId !== d.machineId || b.descriptorHash !== hash(canonical(d))) fail('repair_binding');
  checkMac(v.mac, crypto.createHmac('sha256', key(d, domain)).update('ae-core4/' + domain + '-record/v1\0' + canonical(b)).digest('hex'));
  return b;
}
function update(bytes, id) {
  const e = decoded(bytes); exact(e, ['body', 'oldMac', 'newMac']); const b = e.body;
  const old = decoded(Buffer.from(b.oldDescriptor, 'base64')), next = decoded(Buffer.from(b.newDescriptor, 'base64'));
  const binding = { version: 1, installationId: old.installationId, machineId: old.machineId, oldDescriptorHash: hash(canonical(old)), newDescriptorHash: hash(canonical(next)), transactionId: id };
  if (b.kind !== 'update-intent' || Object.keys(binding).some(k => b[k] !== binding[k]) || next.installationId !== old.installationId || next.machineId !== old.machineId || !equal(next.predecessor, { transactionId: id, previousDescriptorHash: binding.oldDescriptorHash })) fail('repair_update_binding');
  const message = 'ae-core4/stopped-update/record/v1\0' + canonical(b);
  for (const [d, mac] of [[old, e.oldMac], [next, e.newMac]]) checkMac(mac, crypto.createHmac('sha256', key(d, 'stopped-update')).update(message).digest('hex'));
  const p = b.payload;
  if (p.transactionId !== id || p.descriptorBytes !== b.newDescriptor || p.previousDescriptor !== b.oldDescriptor || p.descriptorPath !== path.join(next.installRoot, 'installation.json') || p.cepDir !== next.cepDir || p.package.packageHash !== next.packageHash) fail('repair_update_payload');
  return { body: b, old, next, payload: p, bytes };
}
function sourceClosure() {
  const files = {}, seen = new Set();
  function visit(file) {
    file = path.resolve(file); if (seen.has(file)) return; seen.add(file);
    if (!file.startsWith(CORE + path.sep) || seen.size > 256) fail('repair_source_closure');
    const bytes = read(file).bytes; files[path.relative(CORE, file).split(path.sep).join('/')] = hash(bytes);
    if (!file.endsWith('.js')) return;
    for (const match of bytes.toString('utf8').matchAll(/require\(['"]([^'"]+)['"]\)/g)) {
      if (!match[1].startsWith('.')) { if (!match[1].startsWith('node:')) fail('repair_source_dependency'); continue; }
      let next = path.resolve(path.dirname(file), match[1]); if (!path.extname(next)) next += '.js'; visit(next);
    }
  }
  // configText and supplied-history semantics have no default runtime writes.
  visit(path.join(CORE, 'tools/install-core4.js')); visit(path.join(CORE, 'runtime/recovery-inspection.js'));
  return Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
}
function roles(id) {
  if (!UUID.test(id)) fail('repair_id');
  const home = os.userInfo().homedir, root = path.join(home, 'AppData/Local/AEAgentCore4');
  return { root, state: path.join(root, 'state/production'), config: path.join(REPO, '.codex/config.toml'),
    backup: path.join(home, 'AppData/Local/AEAgentCore4-Recovery', PROFILE.backupId),
    dir: path.join(root, 'transactions', id + '-mixed-local-repair'),
    cep: path.join(home, 'AppData/Roaming/Adobe/CEP/extensions/com.codex.aeagentcore4') };
}
function backup(r) {
  const view = read(path.join(r.backup, 'manifest.json'));
  if (view.hash !== PROFILE.backupHash) fail('repair_backup_pin');
  const m = JSON.parse(view.bytes);
  if (m.version !== 1 || m.target !== r.backup || !Array.isArray(m.jobs) || new Set(m.jobs.map(j => j.role)).size !== m.jobs.length) fail('repair_backup_manifest');
  const originals = {}, copies = {}, expected = new Set(['manifest.json']);
  for (const j of m.jobs) {
    if (!/^(installation|cep|preferences|project-config|global-config|aep-[0-3])$/.test(j.role) || !path.isAbsolute(j.source) || !j.target.startsWith(r.backup + path.sep)) fail('repair_backup_scope');
    for (const [relative, f] of Object.entries(j.files)) {
      const src = relative ? path.resolve(j.source, relative) : j.source, dst = relative ? path.resolve(j.target, relative) : j.target;
      if (relative && (!src.startsWith(j.source + path.sep) || !dst.startsWith(j.target + path.sep)) || !HEX.test(f.sha256) || !f.stat) fail('repair_backup_scope');
      const b = read(dst);
      if (b.hash !== f.sha256 || b.bytes.length !== f.bytes) fail('repair_backup_bytes');
      originals[src] = { hash: f.sha256, stat: f.stat }; copies[src] = dst; expected.add(path.relative(r.backup, dst).split(path.sep).join('/'));
    }
  }
  const actual = Object.entries(tree(r.backup)).filter(([, v]) => !v.directory).map(([f]) => f);
  if (!equal([...expected].sort(), actual.sort())) fail('repair_backup_closure');
  const job = role => m.jobs.find(j => j.role === role);
  if (job('installation')?.source !== r.root || job('cep')?.source !== r.cep || job('project-config')?.source !== r.config) fail('repair_backup_scope');
  return { originals, copies, manifest: m };
}
function gather(id) {
  const r = roles(id); if (os.hostname() !== PROFILE.machine) fail('repair_machine');
  const bk = backup(r), from = f => read(bk.copies[f] || fail('repair_backup_missing')).bytes;
  const descriptorPath = path.join(r.root, 'installation.json'), descriptor = decoded(from(descriptorPath));
  if (hash(canonical(descriptor)) !== PROFILE.descriptorHash || descriptor.installationId !== PROFILE.currentId || descriptor.machineId !== PROFILE.machine || descriptor.installRoot !== r.root || descriptor.stateDir !== r.state || descriptor.cepDir !== r.cep || descriptor.nodePath.toLowerCase() !== fs.realpathSync(process.execPath).toLowerCase() || read(descriptor.nodePath).hash !== descriptor.nodeHash) fail('repair_current_identity');
  const chain = id => update(from(path.join(r.root, 'transactions', id + '-stopped-update/intent.json')), id);
  const current = chain(PROFILE.currentUpdate), foreign = chain(PROFILE.foreignUpdate);
  if (!equal(current.next, descriptor) || foreign.next.installationId !== PROFILE.foreignId || foreign.next.machineId !== descriptor.machineId || foreign.next.installRoot !== r.root || foreign.next.stateDir !== r.state || foreign.next.cepDir !== r.cep || current.payload.configPath !== r.config || foreign.payload.configPath !== r.config) fail('repair_chain_scope');
  const stop = signed(from(path.join(r.state, 'runtime-maintenance.json')), descriptor, 'maintenance', 'maintenance-stop', ['id', 'scope', 'protected', 'authorizationHash', 'nonce']);
  const receipt = signed(from(path.join(r.root, 'transactions', PROFILE.stop + '-owner-maintenance/stopped.json')), descriptor, 'maintenance', 'maintenance-stopped', ['id', 'stopHash', 'scope', 'protected', 'markers', 'settled']);
  if (stop.id !== PROFILE.stop || receipt.id !== PROFILE.stop || receipt.stopHash !== hash(from(path.join(r.state, 'runtime-maintenance.json'))) || !equal(receipt.scope, stop.scope) || receipt.settled !== true || Object.values(receipt.markers).some(v => v.hash !== null)) fail('repair_stop');
  const bindings = { descriptor: descriptorPath, origin: path.join(r.root, 'origin.json'), anchor: path.join(r.state, 'origin.json'), client: path.join(r.root, 'core-client.json'), journal: path.join(r.state, 'receiver/completions.ndjson'), ledger: path.join(r.state, 'broker/ledger.ndjson') };
  for (const [name, fact] of Object.entries(receipt.protected)) {
    if (name === 'renderJobs') { if (fact !== null) fail('repair_jobs'); continue; }
    const actual = name === 'ledger' ? { hash: null, stat: null } : bk.originals[bindings[name]];
    if (!actual || !equal(actual, fact)) fail('repair_original_snapshot');
  }
  for (const [name, fact] of Object.entries(stop.protected)) if (!equal(name === 'renderJobs' ? receipt.protected[name] ?? null : receipt.protected[name], fact)) fail('repair_stop');
  const owner = signed(from(path.join(r.state, 'runtime-owner.json')), foreign.next, 'lifecycle', 'runtime-owner', ['scope', 'phase', 'receiverIdentity']);
  if (owner.phase !== 'active' || !owner.receiverIdentity) fail('repair_owner');
  exact(stop.scope, ['pid', 'birthTicks', 'bootId']);
  exact(owner.scope, ['pid', 'birthTicks', 'bootId', 'startupToken', 'brokerToken', 'receiverToken']);
  for (const s of [stop.scope, owner.scope]) {
    if (!Number.isSafeInteger(s.pid) || s.pid < 1 || s.pid > 0xffffffff || typeof s.birthTicks !== 'string' || !/^[1-9][0-9]{0,18}$/.test(s.birthTicks) || BigInt(s.birthTicks) > 3155378975999999999n || !UUID.test(s.bootId)) fail('repair_scope');
  }
  if (!['startupToken', 'brokerToken', 'receiverToken'].every(k => UUID.test(owner.scope[k]))) fail('repair_scope');
  const broker = decoded(from(path.join(r.state, 'broker/broker-owner.lock'))), receiver = decoded(from(path.join(r.state, 'receiver/owner')));
  exact(broker, ['pid', 'token']); exact(receiver, ['version', 'pid', 'token']);
  if (broker.pid !== owner.scope.pid || receiver.pid !== owner.scope.pid || receiver.version !== 1 || broker.token !== owner.scope.brokerToken || receiver.token !== owner.scope.receiverToken || !UUID.test(broker.token) || !UUID.test(receiver.token)) fail('repair_owner_tokens');
  const ledgerBytes = from(bindings.ledger); if (hash(ledgerBytes) !== PROFILE.ledgerHash) fail('repair_ledger_pin');
  const closure = sourceClosure(); // Complete before the first project import.
  if (hash(closure) !== SOURCE_CLOSURE_HASH) fail('repair_source_changed');
  const { inspectLedgerHistory } = require('../runtime/recovery-inspection');
  const { configText } = require('./install-core4');
  const ledger = inspectLedgerHistory(ledgerBytes, { installationId: foreign.next.installationId });
  // This is deliberately not a settled certification: receiver is unavailable.
  if (ledger.eventCount !== PROFILE.ledgerEvents || ledger.commands.length !== PROFILE.terminals || ledger.commands.some(c => c.state !== 'succeeded') || ledger.unresolved.length) fail('repair_foreign_history');
  const events = ledgerBytes.toString('utf8').trimEnd().split('\n').map(JSON.parse);
  for (const e of events.filter(e => e.type === 'constraint')) {
    const c = e.record, resource = c.resource;
    exact(c, ['allowedEffects', 'checkpointRef', 'constraintId', 'origin', 'owner', 'provenance', 'reservationOwner', 'resource', 'revision', 'schemaVersion', 'unresolvedOutcome']);
    exact(c.origin, ['aePid', 'aeProcessBirth', 'machineId']);
    if (c.schemaVersion !== 2 || c.owner !== PROFILE.foreignId || c.reservationOwner !== PROFILE.foreignId || c.unresolvedOutcome !== false || c.origin.aePid !== PROFILE.aePid || c.origin.aeProcessBirth !== PROFILE.aeBirth || c.origin.machineId !== PROFILE.machine || !resource || !resource.projectId || Object.keys(resource).some(k => !['projectId', 'compId', 'layerId', 'itemId'].includes(k))) fail('repair_external_fence');
  }
  // Fences are execution resource scopes, not schema property names, read-only
  // source media filenames, or recordContext.project.file provenance.
  for (const e of events.filter(e => ['reservation', 'intent'].includes(e.type))) {
    const scan = value => { if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) { if (['file', 'output', 'outputFile', 'jobId', 'renderJobId'].includes(k)) fail('repair_external_fence'); scan(v); } };
    scan(e.reservation?.executionScope); scan(e.grant?.executionScope);
  }
  const reportView = read(path.join(REPO, PROFILE.report)), report = JSON.parse(reportView.bytes);
  if (report.ledger?.sha256 !== ledger.byteHash || report.ledger?.count !== PROFILE.ledgerEvents || report.receiver?.sha256 !== PROFILE.foreignReceiverHash || report.receiver?.count !== 119 || report.receipts?.length !== PROFILE.terminals) fail('repair_native_report');
  const terminals = events.filter(e => e.type === 'command' && e.state === 'succeeded');
  for (const e of terminals) if (report.receipts.filter(v => v.commandId === e.commandId && v.ledgerRecordHash === e.recordHash && v.native?.outcome === 'applied').length !== 1) fail('repair_native_report');
  const targetConfig = Buffer.from(configText(from(r.config), path.join(r.root, 'core-client.json'), descriptor.nodePath, path.join(descriptor.releaseDir, 'runtime/client-entry.js'), '--client-descriptor'));
  if (!targetConfig.equals(Buffer.from(current.payload.configBytes, 'base64')) || !from(r.config).equals(Buffer.from(foreign.payload.configBytes, 'base64'))) fail('repair_config_contract');
  const fixedCep = current.payload.cep;
  if (Object.keys(fixedCep).length !== 7 || !equal(Object.keys(fixedCep).sort(), Object.keys(foreign.payload.cep).sort())) fail('repair_cep_contract');
  for (const [name, bytes] of Object.entries(foreign.payload.cep)) if (!from(path.join(r.cep, name)).equals(Buffer.from(bytes, 'base64'))) fail('repair_foreign_cep');
  const mutable = new Set([r.config, ...Object.keys(fixedCep).map(f => path.join(r.cep, f)), ...FOREIGN.map(f => path.join(r.state, f))]);
  const protectedFacts = Object.fromEntries(Object.entries(bk.originals).filter(([file]) => !mutable.has(file)));
  const plan = { version: 1, purpose: 'desktop-mixed-local-repair-v1', id, machine: PROFILE.machine, operatorHash: read(__filename).hash, sourceClosure: closure, roles: r, backupHash: PROFILE.backupHash,
    identities: { current: descriptor.installationId, foreign: foreign.next.installationId }, originalFacts: bk.originals, protectedFacts,
    originalCep: treeFromBackup(r.cep, bk, r.dir), foreignFiles: Object.fromEntries(FOREIGN.map(f => [f, bk.originals[path.join(r.state, f)]])),
    targetCepHashes: Object.fromEntries(Object.entries(fixedCep).map(([f, v]) => [f, hash(Buffer.from(v, 'base64'))])), targetConfigHash: hash(targetConfig),
    chains: { current: hash(current.bytes), foreign: hash(foreign.bytes), stopHash: receipt.stopHash, nativeReportHash: reportView.hash },
    foreignReceiver: { available: false, reportedCount: 119, sha256: PROFILE.foreignReceiverHash, reconstructed: false }, foreignOutcomesReissued: false, foreignHistorySettlementCertified: false, commandsReplayed: 0 };
  return { r, bk, descriptor, foreign, stop, owner, targetConfig, fixedCep, plan, planHash: hash(plan) };
}
function treeFromBackup(base, bk, repairDirectory) {
  // Directory inode facts come from current originals and are frozen in plan.
  // Backup manifest contains original file facts, not copied inode identities.
  // Recovery reads its original tree snapshot; publication has legitimately
  // replaced the visible CEP by then. The caller still pins the whole plan.
  if (fs.existsSync(repairDirectory)) for (const suffix of ['plan.json', 'plan.json.stage']) {
    const v = read(path.join(repairDirectory, suffix), true);
    if (v.bytes) { const p = decoded(v.bytes); if (p.roles?.cep === base && p.id + '-mixed-local-repair' === path.basename(repairDirectory)) return p.originalCep; }
  }
  const result = tree(base);
  if (!result) fail('repair_cep_missing');
  for (const [file, fact] of Object.entries(result)) if (!fact.directory && !equal(fact, bk.originals[path.join(base, file)])) fail('repair_cep_changed');
  return result;
}
// No command line or inherited script text is interpolated into the native query.
const CENSUS = String.raw`$ErrorActionPreference='Stop';try{$wanted=@(ConvertFrom-Json -InputObject $env:AE_CORE4_REPAIR_PIDS);$rows=@(Get-CimInstance Win32_Process -Property ProcessId,Name,CreationDate,ExecutablePath -ErrorAction Stop);$result=@();foreach($p in $rows){if($wanted -contains [int]$p.ProcessId -or $p.Name -match '^(AfterFX|CEPHtmlEngine|aerender|Adobe Media Encoder)\.exe$'){if($null -eq $p.CreationDate -or -not ($p.CreationDate -is [DateTime])){throw 'birth'};$result+=@{pid=[int]$p.ProcessId;name=[string]$p.Name;birthTicks=$p.CreationDate.ToUniversalTime().Ticks.ToString([Globalization.CultureInfo]::InvariantCulture);executablePath=$p.ExecutablePath}}};[Console]::Out.Write((ConvertTo-Json -Compress -Depth 4 -InputObject @{observedAt=[DateTime]::UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'");processes=$result}))}catch{[Console]::Error.Write('repair_process_unknown');exit 1}`;
async function census(c, prior = []) {
  if (process.platform !== 'win32') fail('repair_process_unknown');
  const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'); plain(executable);
  const env = { ...process.env, AE_CORE4_REPAIR_PIDS: JSON.stringify([...new Set([process.pid, c.stop.scope.pid, c.owner.scope.pid, PROFILE.aePid, ...prior.map(s => s.pid)])]) };
  const value = await new Promise((resolve, reject) => cp.execFile(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', CENSUS], { encoding: 'utf8', shell: false, windowsHide: true, timeout: 12000, maxBuffer: 2 * 1024 * 1024, env }, (e, out, err) => {
    if (e || err?.trim()) return reject(Object.assign(Error('repair_process_unknown'), { code: 'repair_process_unknown' }));
    try { resolve(JSON.parse(out.replace(/^\uFEFF/, ''))); } catch { reject(Object.assign(Error('repair_process_unknown'), { code: 'repair_process_unknown' })); }
  }));
  if (!Array.isArray(value.processes) || !Number.isFinite(Date.parse(value.observedAt)) || Math.abs(Date.now() - Date.parse(value.observedAt)) > 5000 || new Set(value.processes.map(p => p.pid)).size !== value.processes.length) fail('repair_process_unknown');
  for (const p of value.processes) if (!Number.isSafeInteger(p.pid) || p.pid < 1 || p.pid > 0xffffffff || typeof p.name !== 'string' || typeof p.birthTicks !== 'string' || !/^[1-9][0-9]{0,18}$/.test(p.birthTicks)) fail('repair_process_unknown');
  if (value.processes.some(p => /^(AfterFX|CEPHtmlEngine|aerender|Adobe Media Encoder)\.exe$/i.test(p.name))) fail('repair_active_host');
  const aeTicks = String(BigInt(Date.parse(PROFILE.aeBirth.slice(0, 23) + 'Z')) * 10000n + 621355968000000000n + BigInt(PROFILE.aeBirth.slice(23, 27)));
  const scopes = [c.stop.scope, c.owner.scope, { pid: PROFILE.aePid, birthTicks: aeTicks }, ...prior];
  for (const s of scopes) {
    if (!Number.isSafeInteger(s.pid) || typeof s.birthTicks !== 'string' || !/^[1-9][0-9]{0,18}$/.test(s.birthTicks)) fail('repair_process_unknown');
    if (value.processes.some(p => p.pid === s.pid && p.birthTicks === s.birthTicks)) fail('repair_actor_alive');
  }
  const self = value.processes.find(p => p.pid === process.pid);
  if (!self || typeof self.executablePath !== 'string' || self.executablePath.toLowerCase() !== c.descriptor.nodePath.toLowerCase()) fail('repair_process_unknown');
  return { pid: self.pid, birthTicks: self.birthTicks };
}
function protectedNow(c, plan, bytes = false) {
  for (const [file, fact] of Object.entries(plan.protectedFacts)) {
    plain(file);
    if (bytes ? !same(read(file), fact) : !equal(stamp(fs.lstatSync(file, { bigint: true })), fact.stat)) fail('repair_protected_changed');
  }
  const gates = gateState(c, plan);
  for (const file of ['runtime-owner.next', 'runtime-diagnostic.json', 'runtime-start-over.json', 'render-job-toolchain.json']) if (plain(path.join(c.r.state, file), false, true)) fail('repair_uncovered_writer_or_job');
  if (plain(path.join(c.r.state, 'render-jobs-v1'), true, true)) fail('repair_uncovered_writer_or_job');
  // An unlisted installed file is never silently accepted as a new baseline.
  const expected = new Set(Object.keys(plan.originalFacts).filter(f => f.startsWith(c.r.root + path.sep)).map(f => path.relative(c.r.root, f).split(path.sep).join('/')));
  function visit(base, relative = '') {
    for (const name of fs.readdirSync(base)) {
      const file = path.join(base, name), rel = relative ? relative + '/' + name : name, s = fs.lstatSync(file); plain(file, s.isDirectory());
      if (s.isDirectory()) { if (rel !== 'transactions/' + plan.id + '-mixed-local-repair') visit(file, rel); }
      else if (rel !== 'install.lock' && !(rel === 'state/production/broker/broker-owner.gate' && gates[1].present) && !expected.has(rel)) fail('repair_uncovered_writer_or_job');
    }
  }
  visit(c.r.root);
}
function recordBytes(c, plan, kind, body) {
  const value = { version: 1, id: plan.id, planHash: hash(plan), kind, ...body };
  const mac = crypto.createHmac('sha256', key(c.descriptor, 'mixed-local-repair')).update(canonical(value)).digest('hex');
  return Buffer.from(canonical({ body: value, mac }));
}
function record(c, plan, name, kind) {
  let v = read(path.join(c.r.dir, name), true);
  if (!v.bytes) v = read(path.join(c.r.dir, name + '.stage'), true);
  if (!v.bytes) return null;
  const e = decoded(v.bytes); exact(e, ['body', 'mac']);
  if (e.body.version !== 1 || e.body.id !== plan.id || e.body.planHash !== hash(plan) || e.body.kind !== kind || !recordBytes(c, plan, kind, Object.fromEntries(Object.entries(e.body).filter(([k]) => !['version', 'id', 'planHash', 'kind'].includes(k)))).equals(v.bytes)) fail('repair_record');
  return e.body;
}
function gateSpecs(c) {
  return [
    { role: 'install', file: path.join(c.r.root, 'install.lock'), stage: path.join(c.r.dir, 'install-gate') },
    { role: 'broker', file: path.join(c.r.state, 'broker/broker-owner.gate'), stage: path.join(c.r.dir, 'broker-gate') }
  ];
}
function gateState(c, plan) {
  const claim = record(c, plan, 'gate-intent.json', 'gate-intent');
  const state = gateSpecs(c).map(g => {
    const visible = read(g.file, true), stage = read(g.stage, true);
    const acquired = record(c, plan, 'gate-' + g.role + '-acquired.json', 'gate-acquired');
    const releasing = record(c, plan, 'gate-' + g.role + '-release-intent.json', 'gate-release-intent');
    const released = record(c, plan, 'gate-' + g.role + '-released.json', 'gate-released');
    const bytes = claim && recordBytes(c, plan, g.role + '-gate', { actor: claim.actor });
    const identity = stage.bytes && { hash: stage.hash, dev: stage.stat.dev, ino: stage.stat.ino };
    if (stage.bytes && (!claim || !stage.bytes.equals(bytes)) || acquired && (!identity || !equal(acquired.gate, identity) || acquired.role !== g.role) || releasing && releasing.role !== g.role || released && (!releasing || released.role !== g.role)) fail('repair_gate_changed');
    if (visible.bytes && (!bytes || !stage.bytes || !visible.bytes.equals(bytes) || visible.stat.dev !== stage.stat.dev || visible.stat.ino !== stage.stat.ino)) fail('repair_gate_busy');
    if (!visible.bytes && acquired && !releasing) fail('repair_gate_missing');
    if (visible.bytes && released) fail('repair_release_changed');
    return { ...g, present: !!visible.bytes, acquired: !!acquired, releasing: !!releasing, released: !!released, bytes, identity };
  });
  // Acquire install -> broker; release broker -> install. A broker-only prefix
  // can never be produced by this operator, including crash recovery.
  if (!state[0].present && state[1].present) fail('repair_gate_prefix');
  if (state.some(g => g.releasing) && !record(c, plan, 'completed.json', 'completed')) fail('repair_gate_prefix');
  if (state[0].releasing && !state[1].released) fail('repair_gate_prefix');
  return state;
}
function publish(file, bytes) {
  const stage = file + '.stage';
  for (const target of [stage, file]) { const v = read(target, true); if (v.bytes && !v.bytes.equals(bytes)) fail('repair_publication_changed'); }
  if (!plain(stage, false, true)) {
    const fd = fs.openSync(stage, 'wx'); try { if (fs.writeSync(fd, bytes) !== bytes.length) fail('repair_short_write'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  } else { const fd = fs.openSync(stage, 'r+'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
  if (!plain(file, false, true)) fs.linkSync(stage, file);
  const a = read(stage), b = read(file);
  if (!a.bytes.equals(bytes) || !b.bytes.equals(bytes) || a.stat.dev !== b.stat.dev || a.stat.ino !== b.stat.ino) fail('repair_publication_changed');
  // Both names remain attributable; no generic stage cleanup after a crash.
}
function pub(c, plan, name, kind, body) { publish(path.join(c.r.dir, name), recordBytes(c, plan, kind, body)); }
function mkdir(dir) { if (!plain(dir, true, true)) fs.mkdirSync(dir); plain(dir, true); }
function loadPlan(c) {
  let v = read(path.join(c.r.dir, 'plan.json'), true);
  if (!v.bytes) v = read(path.join(c.r.dir, 'plan.json.stage'), true);
  if (!v.bytes) return null;
  const plan = decoded(v.bytes);
  if (plan.id !== c.plan.id || plan.operatorHash !== c.plan.operatorHash || !equal(plan.sourceClosure, c.plan.sourceClosure) || !equal(plan.roles, c.r) || !equal(plan.protectedFacts, c.plan.protectedFacts) || !equal(plan.originalFacts, c.plan.originalFacts) || !equal(plan.chains, c.plan.chains)) fail('repair_plan_changed');
  return plan;
}
async function reservations(c) {
  const servers = [];
  try {
    const endpoints = [{ host: '127.0.0.1', port: 3457 }, ...[c.descriptor, c.foreign.next].map(d => ({ path: '\\\\.\\pipe\\ae-core4-owner-' + hash(JSON.stringify({ installationId: d.installationId, machineId: d.machineId })).slice(0, 32) }))];
    for (const endpoint of endpoints) {
      const s = net.createServer(socket => socket.destroy()); servers.push(s);
      await new Promise((resolve, reject) => { s.once('error', () => reject(Object.assign(Error('repair_endpoint_busy'), { code: 'repair_endpoint_busy' }))); s.listen(endpoint, resolve); });
    }
    return async () => { for (const s of servers.reverse()) if (s.listening) await new Promise(resolve => s.close(resolve)); };
  } catch (e) { for (const s of servers) if (s.listening) await new Promise(resolve => s.close(resolve)); throw e; }
}
function stage(c, plan) {
  const cep = path.join(c.r.dir, 'cep-stage'), config = path.join(c.r.dir, 'config-stage');
  const ready = record(c, plan, 'stage-ready.json', 'stage-ready'); if (ready) return ready;
  mkdir(cep);
  const allowed = new Set(Object.keys(c.fixedCep));
  for (const [rel, f] of Object.entries(tree(cep))) if (!f.directory && !allowed.has(rel)) fail('repair_staging_changed');
  for (const [rel, encoded] of Object.entries(c.fixedCep)) {
    if (!/^[A-Za-z0-9_./-]+$/.test(rel) || rel.split('/').some(p => p === '..' || !p)) fail('repair_staging_path');
    let cursor = cep; for (const part of rel.split('/').slice(0, -1)) { cursor = path.join(cursor, part); mkdir(cursor); }
    const file = path.join(cep, rel), bytes = Buffer.from(encoded, 'base64'), v = read(file, true);
    if (v.bytes ? !v.bytes.equals(bytes) : false) fail('repair_staging_changed');
    if (!v.bytes) { const fd = fs.openSync(file, 'wx'); try { if (fs.writeSync(fd, bytes) !== bytes.length) fail('repair_short_write'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
  }
  const v = read(config, true);
  if (v.bytes && !v.bytes.equals(c.targetConfig)) fail('repair_staging_changed');
  if (!v.bytes) { const fd = fs.openSync(config, 'wx'); try { if (fs.writeSync(fd, c.targetConfig) !== c.targetConfig.length) fail('repair_short_write'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
  const body = { cep: tree(cep), config: info(read(config)) }; pub(c, plan, 'stage-ready.json', 'stage-ready', body); return body;
}
function steps(c, plan, ready) {
  const ops = FOREIGN.map((rel, i) => ({ role: 'foreign-' + i, from: path.join(c.r.state, rel), to: path.join(c.r.dir, 'foreign-history', String(i)), expected: plan.foreignFiles[rel], directory: false }));
  return [...ops,
    { role: 'archive-cep', from: c.r.cep, to: path.join(c.r.dir, 'foreign-cep'), expected: plan.originalCep, directory: true },
    { role: 'publish-cep', from: path.join(c.r.dir, 'cep-stage'), to: c.r.cep, expected: ready.cep, directory: true },
    { role: 'archive-config', from: c.r.config, to: path.join(c.r.dir, 'foreign-config.toml'), expected: plan.originalFacts[c.r.config], directory: false },
    { role: 'publish-config', from: path.join(c.r.dir, 'config-stage'), to: c.r.config, expected: ready.config, directory: false }];
}
function viewMove(op, target, moved = false) { return op.directory ? sameTree(tree(target), op.expected, moved) : same(read(target, true), op.expected, moved); }
function prefix(c, plan, ops) {
  const candidates = [];
  // Simulate the complete visible names at each monotonic rename boundary.
  const base = new Map();
  for (const op of ops) if (!base.has(op.from)) base.set(op.from, { ...op });
  base.delete(c.r.cep); base.set(c.r.cep, { ...ops[4] }); base.delete(c.r.config); base.set(c.r.config, { ...ops[6] });
  const names = new Set(ops.flatMap(op => [op.from, op.to])), actual = new Map();
  for (const file of names) {
    const directory = ops.some(op => op.directory && [op.from, op.to].includes(file));
    actual.set(file, directory ? tree(file) : info(read(file, true)));
  }
  for (let n = 0; n <= ops.length; n++) {
    const wanted = new Map(base);
    for (let i = 0; i < n; i++) { wanted.delete(ops[i].from); wanted.set(ops[i].to, { ...ops[i], moved: true }); }
    if ([...names].every(file => {
      const op = wanted.get(file), got = actual.get(file);
      return op ? op.directory ? sameTree(got, op.expected, !!op.moved) : same(got, op.expected, !!op.moved) : got === null || got.hash === null;
    })) candidates.push(n);
  }
  if (candidates.length !== 1) {
    const error = Object.assign(Error('repair_nonmonotonic_prefix'), { code: 'repair_nonmonotonic_prefix' });
    error.mismatches = [...names].filter(file => { const op = base.get(file), got = actual.get(file); return op && !(op.directory ? sameTree(got, op.expected) : same(got, op.expected)); }).map(file => path.basename(file));
    error.firstFile = { actual: actual.get(ops[0].from), expected: ops[0].expected };
    throw error;
  }
  const n = candidates[0];
  for (let i = 0; i < ops.length; i++) {
    const intent = record(c, plan, 'move-' + i + '-intent.json', 'move-intent'), done = record(c, plan, 'move-' + i + '-done.json', 'move-done');
    if (intent && !equal(intent.operation, ops[i]) || done && (!intent || !equal(done.operation, ops[i])) || i < n && !intent || i > n && intent || i >= n && done) fail('repair_record_prefix');
  }
  return n;
}
async function execute(mode, id, pin) {
  if (!['plan', 'inspect', 'apply', 'recover'].includes(mode) || !UUID.test(id) || mode !== 'plan' && !HEX.test(pin || '')) fail('repair_usage');
  const c = gather(id); let plan = c.plan;
  const saved = plain(c.r.dir, true, true) ? loadPlan(c) : null;
  if (saved) plan = saved;
  if (mode !== 'plan' && hash(plan) !== pin) fail('repair_plan_pin');
  if (mode === 'apply' && saved || mode === 'recover' && !saved) fail('repair_use_inspect_recover');
  protectedNow(c, plan, true);
  const actors = [];
  if (saved) for (const name of [...new Set(fs.readdirSync(c.r.dir).filter(f => /^actor-[0-9]+\.json(?:\.stage)?$/.test(f)).map(f => f.replace(/\.stage$/, '')))].sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))) { const a = record(c, plan, name, 'actor'); if (!a) fail('repair_record'); actors.push(a.actor); }
  const actor = await census(c, actors);
  if (mode === 'plan') {
    if (saved || gateState(c, plan).some(g => g.present)) fail('repair_gate_busy');
    for (const [file, fact] of Object.entries(plan.originalFacts)) if (!same(read(file), fact)) fail('repair_original_changed');
    return { planHash: hash(plan), plan, inspectionOnly: true, runtimeAuthority: false };
  }
  if (!saved) {
    if (mode !== 'apply') fail('repair_no_intent');
    if (gateState(c, plan).some(g => g.present)) fail('repair_gate_busy');
    for (const [file, fact] of Object.entries(plan.originalFacts)) if (!same(read(file), fact)) fail('repair_original_changed');
  }
  let ready = saved && record(c, plan, 'stage-ready.json', 'stage-ready'), ops = ready && steps(c, plan, ready);
  let at = ready ? prefix(c, plan, ops) : 0;
  const released = saved && record(c, plan, 'released.json', 'released');
  if (released) {
    if (at !== 8 || gateState(c, plan).some(g => g.present || !g.released)) fail('repair_release_changed');
    return { id, planHash: hash(plan), phase: 'repaired', runtimeAuthority: false, foreignHistorySettlementCertified: false, commandsReplayed: 0 };
  }
  gateState(c, plan);
  const release = await reservations(c);
  try {
    await census(c, actors); protectedNow(c, plan);
    if (mode === 'inspect') return { id, planHash: hash(plan), phase: 'repair-pending', switchIndex: at, inspectionOnly: true, runtimeAuthority: false };
    mkdir(c.r.dir); publish(path.join(c.r.dir, 'plan.json'), Buffer.from(canonical(plan)));
    mkdir(path.join(c.r.dir, 'foreign-history'));
    pub(c, plan, 'actor-' + actors.length + '.json', 'actor', { actor });
    let claim = record(c, plan, 'gate-intent.json', 'gate-intent');
    if (!claim) { pub(c, plan, 'gate-intent.json', 'gate-intent', { actor: actors[0] || actor }); claim = record(c, plan, 'gate-intent.json', 'gate-intent'); }
    const finishingRelease = !!record(c, plan, 'release-intent.json', 'release-intent');
    if (!finishingRelease) for (const g of gateSpecs(c)) {
      publish(g.stage, recordBytes(c, plan, g.role + '-gate', { actor: claim.actor }));
      let state = gateState(c, plan), own = state.find(v => v.role === g.role);
      if (!own.present) {
        if (g.role === 'broker' && !state[0].present) fail('repair_gate_prefix');
        fs.linkSync(g.stage, g.file);
      }
      own = gateState(c, plan).find(v => v.role === g.role);
      if (!own.acquired) pub(c, plan, 'gate-' + g.role + '-acquired.json', 'gate-acquired', { role: g.role, gate: own.identity });
    }
    function check() {
      protectedNow(c, plan);
      if (gateState(c, plan).some(g => !g.present || !g.acquired || g.releasing)) fail('repair_gate_changed');
    }
    if (!ready) { check(); ready = stage(c, plan); ops = steps(c, plan, ready); }
    at = prefix(c, plan, ops);
    for (let i = 0; i < at; i++) if (!record(c, plan, 'move-' + i + '-done.json', 'move-done')) { check(); pub(c, plan, 'move-' + i + '-done.json', 'move-done', { operation: ops[i] }); }
    for (let i = at; i < ops.length; i++) {
      check(); await census(c, actors); check();
      if (prefix(c, plan, ops) !== i) fail('repair_nonmonotonic_prefix');
      pub(c, plan, 'move-' + i + '-intent.json', 'move-intent', { operation: ops[i] }); check();
      if (!viewMove(ops[i], ops[i].from) || fs.existsSync(ops[i].to)) fail('repair_cas');
      fs.renameSync(ops[i].from, ops[i].to);
      if (prefix(c, plan, ops) !== i + 1) fail('repair_cas');
      pub(c, plan, 'move-' + i + '-done.json', 'move-done', { operation: ops[i] });
    }
    protectedNow(c, plan, true);
    if (prefix(c, plan, ops) !== 8 || FOREIGN.some(f => fs.existsSync(path.join(c.r.state, f)))) fail('repair_readback');
    pub(c, plan, 'completed.json', 'completed', { protectedUnchanged: true, foreignHistorySettlementCertified: false, commandsReplayed: 0 });
    if (!record(c, plan, 'release-intent.json', 'release-intent')) { check(); pub(c, plan, 'release-intent.json', 'release-intent', { actor }); }
    for (const g of [...gateSpecs(c)].reverse()) {
      protectedNow(c, plan, true);
      const current = gateState(c, plan).find(v => v.role === g.role);
      if (!current.acquired) fail('repair_gate_prefix');
      if (!current.releasing) pub(c, plan, 'gate-' + g.role + '-release-intent.json', 'gate-release-intent', { role: g.role });
      const before = gateState(c, plan).find(v => v.role === g.role);
      if (before.present) fs.unlinkSync(g.file);
      if (gateState(c, plan).find(v => v.role === g.role).present) fail('repair_release_changed');
      if (!before.released) pub(c, plan, 'gate-' + g.role + '-released.json', 'gate-released', { role: g.role });
    }
    if (gateState(c, plan).some(g => g.present || !g.released)) fail('repair_release_changed');
    pub(c, plan, 'released.json', 'released', { completedHash: read(path.join(c.r.dir, 'completed.json')).hash });
    return { id, planHash: hash(plan), phase: 'repaired', runtimeAuthority: false, foreignReceiver: plan.foreignReceiver, foreignHistorySettlementCertified: false, foreignOutcomesReissued: false, commandsReplayed: 0, nextAction: 'standard maintain-owner inspect for original stop, then ordinary stopped update' };
  } finally { await release(); }
}
if (require.main === module) {
  const [mode, ...args] = process.argv.slice(2), options = {};
  try {
    for (let i = 0; i < args.length; i += 2) { if (!['--operation', '--plan-hash'].includes(args[i]) || options[args[i]] || !args[i + 1]) fail('repair_usage'); options[args[i]] = args[i + 1]; }
    if (Object.keys(options).length !== (mode === 'plan' ? 1 : 2)) fail('repair_usage');
    execute(mode, options['--operation'], options['--plan-hash']).then(v => console.log(canonical(v)), e => { console.error(e.code || 'repair_failed'); process.exitCode = 1; });
  } catch (e) { console.error(e.code || 'repair_failed'); process.exitCode = 1; }
}
module.exports = { execute };
