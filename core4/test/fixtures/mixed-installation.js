'use strict';
// Synthetic TEMP incident only. No production credentials or runtime authority.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto'), Module = require('node:module');
const { canonical, hash } = require('../../protocol/json');
const { buildPackage } = require('../../tools/package-installable');
const { deriveComposition, installationConfig } = require('../../runtime/stdio-entry');
const { dispatchBinding } = require('../../protocol/dispatch');
const SOURCE = path.resolve(__dirname, '../..'), packages = new Map();
const stats = file => Object.fromEntries(['dev', 'ino', 'size', 'birthtimeNs', 'mtimeNs', 'ctimeNs'].map(k => [k, String(fs.statSync(file, { bigint: true })[k])]));
const uuid = () => crypto.randomUUID(), token = () => crypto.randomBytes(32).toString('hex');
function pkg(name) { if (!packages.has(name)) packages.set(name, buildPackage(SOURCE, name, { runtimeModel: 'owner' })); return packages.get(name); }
function write(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.isBuffer(value) || typeof value === 'string' ? value : canonical(value)); }
function copySource(file, destination, seen = new Set()) {
  if (seen.has(file)) return; seen.add(file); const bytes = fs.readFileSync(file); write(path.join(destination, path.relative(SOURCE, file)), bytes);
  if (file.endsWith('.js')) for (const m of bytes.toString('utf8').matchAll(/require\(['"]([^'"]+)['"]\)/g)) if (m[1].startsWith('.')) { let child = path.resolve(path.dirname(file), m[1]); if (!path.extname(child)) child += '.js'; if (child.startsWith(SOURCE + path.sep)) copySource(child, destination, seen); }
}
function signingKey(d, domain) { return crypto.createHmac('sha256', Buffer.from(d.panelToken, 'hex')).update('ae-core4/' + domain + (domain === 'stopped-update' ? '/key/v1\0' : '-key/v1\0')).update(Buffer.from(d.controlToken, 'hex')).digest(); }
function signed(d, domain, kind, value) {
  const body = { version: 1, kind, installationId: d.installationId, machineId: d.machineId, descriptorHash: hash(canonical(d)), ...value };
  return { body, mac: crypto.createHmac('sha256', signingKey(d, domain)).update('ae-core4/' + domain + '-record/v1\0' + canonical(body)).digest('hex') };
}
function updateRecord(old, next, id, payload) {
  const body = { version: 1, kind: 'update-intent', installationId: old.installationId, machineId: old.machineId, oldDescriptorHash: hash(canonical(old)), newDescriptorHash: hash(canonical(next)), transactionId: id, oldDescriptor: Buffer.from(canonical(old)).toString('base64'), newDescriptor: Buffer.from(canonical(next)).toString('base64'), payload };
  const message = 'ae-core4/stopped-update/record/v1\0' + canonical(body);
  return { body, oldMac: crypto.createHmac('sha256', signingKey(old, 'stopped-update')).update(message).digest('hex'), newMac: crypto.createHmac('sha256', signingKey(next, 'stopped-update')).update(message).digest('hex') };
}
async function fixture(t, change = () => {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'core4-mixed-repair-')), home = path.join(base, 'home'), repo = path.join(base, 'repo'), core = path.join(repo, 'core4');
  let birth = 639000000000000000n, censusMode = 'dead', fault = null, mutations = [];
  const io = { ...fs };
  // These private TEMP fixtures have one writer. Cache unchanged ancestor
  // lookups between recorded mutations so fault coverage does not repeat tens
  // of thousands of Windows ancestor syscalls. File stats stay live; each
  // run and every mutation invalidates the cache, including injected crashes.
  const ancestors = new Map(), realpaths = new Map();
  const descriptors = new Map();
  const clearLookups = () => { ancestors.clear(); realpaths.clear(); };
  io.lstatSync = (file, options) => {
    const key = String(file) + ':' + !!options?.bigint;
    if (ancestors.has(key)) return ancestors.get(key);
    const value = fs.lstatSync(file, options);
    if (value.isDirectory()) ancestors.set(key, value);
    return value;
  };
  io.realpathSync = file => {
    if (!realpaths.has(file)) realpaths.set(file, fs.realpathSync(file));
    return realpaths.get(file);
  };
  io.openSync = (file, ...args) => { const fd = fs.openSync(file, ...args); descriptors.set(fd, file); return fd; };
  io.closeSync = fd => { try { return fs.closeSync(fd); } finally { descriptors.delete(fd); } };
  for (const method of ['writeSync', 'fsyncSync', 'linkSync', 'renameSync', 'unlinkSync', 'mkdirSync']) io[method] = (...args) => {
    const result = fs[method](...args); const event = { method, file: descriptors.get(args[0]), args: args.map(a => typeof a === 'string' ? a : typeof a === 'number' ? a : '<bytes>') };
    clearLookups();
    mutations.push(event); if (fault) fault(event); return result;
  };
  const modules = new Map();
  function load(file, sidecar = false) {
    file = path.resolve(file); if (!path.extname(file)) file += '.js';
    if (modules.has(file)) return modules.get(file).exports;
    const mod = new Module(file, module); modules.set(file, mod); mod.filename = file; mod.paths = Module._nodeModulePaths(path.dirname(file));
    mod.require = target => {
      if (target === 'node:fs' && sidecar) return io;
      if (target === 'node:os' && sidecar) return { ...os, userInfo: () => ({ ...os.userInfo(), homedir: home }) };
      if (target === 'node:child_process' && sidecar) return { execFile(exe, args, options, callback) {
        if (censusMode === 'unknown') return callback(Error('fixture unavailable'), '', '');
        const rows = [{ pid: process.pid, name: 'node.exe', birthTicks: String(birth), executablePath: fs.realpathSync(process.execPath) }];
        if (censusMode === 'active') rows.push({ pid: 14008, name: 'AfterFX.exe', birthTicks: '639298879750000000', executablePath: 'C:\\fixture\\AfterFX.exe' });
        if (censusMode === 'owner') rows.push({ pid: 4940, name: 'node.exe', birthTicks: '639298879750215940', executablePath: fs.realpathSync(process.execPath) });
        callback(null, JSON.stringify({ observedAt: new Date().toISOString(), processes: rows }), '');
      } };
      if (target.endsWith('windows-owner-process')) return { classifyOwnerProcess: require('../../runtime/windows-owner-process').classifyOwnerProcess, async observeOwnerProcess(pid) { return { version: 1, pid, status: pid === process.pid ? 'present' : 'absent', birthTicks: pid === process.pid ? String(birth) : null, executablePath: pid === process.pid ? fs.realpathSync(process.execPath) : null, observedAt: new Date().toISOString() }; } };
      if (target.startsWith('.')) { const next = path.resolve(path.dirname(file), target); if (next.startsWith(SOURCE + path.sep)) return load(next); return require(next); }
      return require(target);
    };
    mod._compile(fs.readFileSync(file, 'utf8'), file); return mod.exports;
  }
  const installer = load(path.join(SOURCE, 'tools/install-core4'));
  const root = path.join(home, 'AppData/Local/AEAgentCore4'), cep = path.join(home, 'AppData/Roaming/Adobe/CEP/extensions/com.codex.aeagentcore4'), config = path.join(repo, '.codex/config.toml');
  write(config, '# fixture outside Core\n[mcp_servers.other]\ncommand = "other"\n');
  const installArgs = { installRoot: root, extensionsDir: path.dirname(cep), configPath: config, machineId: os.hostname(), nodePath: fs.realpathSync(process.execPath) };
  installer.applyInstall(installer.planInstall({ ...installArgs, pkg: pkg('readonly') }));
  const descriptorPath = path.join(root, 'installation.json'), old = JSON.parse(fs.readFileSync(descriptorPath));
  const nextPlan = installer.planInstall({ ...installArgs, pkg: pkg('manual') }), payload = installer.preparedInstallPayload(nextPlan);
  installer.applyInstall(nextPlan);
  const d = JSON.parse(fs.readFileSync(descriptorPath)), state = d.stateDir, currentId = nextPlan.transactionId;
  load(path.join(SOURCE, 'integrations/cep/completion-store')).openCompletionStore({ directory: path.join(state, 'receiver') }).close();
  const maintenance = load(path.join(SOURCE, 'runtime/owner-maintenance')), stop = uuid();
  const scope = { processBootId: uuid(), pid: 39384, birthTicks: '639298353474484660' };
  const m = maintenance.createOwnerMaintenance({ installation: d, descriptorPath, lifecycle: { state: () => scope }, freeze() {}, activity: () => ({ pending: false }), accepted: () => 0, async close() {} });
  m.request(maintenance.createStopAuthorization({ installation: d, descriptorPath, scope: { bootId: scope.processBootId, pid: scope.pid, birthTicks: scope.birthTicks }, id: stop }));
  if ((await m.done).phase !== 'stopped') throw Error('fixture stop failed');
  write(path.join(root, 'transactions', currentId + '-stopped-update/intent.json'), updateRecord(old, d, currentId, payload));
  const foreignId = uuid(), foreignOld = { ...d, installationId: 'installation-' + uuid(), panelToken: token(), controlToken: token(), predecessor: null };
  const foreignPkg = pkg('manual-titles-variants'), foreign = { ...foreignOld, packageHash: foreignPkg.packageHash, releaseDir: path.join(root, 'releases', foreignPkg.packageHash), predecessor: { transactionId: foreignId, previousDescriptorHash: hash(canonical(foreignOld)) } };
  const fixedCep = Object.fromEntries(Object.entries(foreignPkg.files).filter(([f]) => f.startsWith('cep/')).map(([f, v]) => [f.slice(4), v]));
  const selected = deriveComposition(foreignPkg.release, f => Buffer.from(foreignPkg.files[f], 'base64'));
  fixedCep['installation.js'] = Buffer.from('window.Core4Installation=' + canonical(installationConfig(foreign, selected)) + ';\n').toString('base64');
  const foreignConfig = Buffer.from(installer.configText(fs.readFileSync(config), path.join(root, 'core-client.json'), d.nodePath, path.join(foreign.releaseDir, 'runtime/client-entry.js'), '--client-descriptor'));
  const foreignPayload = { ...payload, transactionId: foreignId, descriptorBytes: Buffer.from(canonical(foreign)).toString('base64'), previousDescriptor: Buffer.from(canonical(foreignOld)).toString('base64'), configBytes: foreignConfig.toString('base64'), cep: fixedCep, package: foreignPkg };
  write(path.join(root, 'transactions', foreignId + '-stopped-update/intent.json'), updateRecord(foreignOld, foreign, foreignId, foreignPayload));
  for (const [f, bytes] of Object.entries(fixedCep)) write(path.join(cep, f), Buffer.from(bytes, 'base64'));
  write(config, foreignConfig);
  const ownerScope = { bootId: uuid(), pid: 4940, birthTicks: '639298879750215940', startupToken: uuid(), brokerToken: uuid(), receiverToken: uuid() };
  write(path.join(state, 'runtime-owner.json'), signed(foreign, 'lifecycle', 'runtime-owner', { phase: 'active', receiverIdentity: 'receiver-store-foreign', scope: ownerScope }));
  write(path.join(state, 'broker/broker-owner.lock'), { pid: ownerScope.pid, token: ownerScope.brokerToken });
  write(path.join(state, 'receiver/owner'), { version: 1, pid: ownerScope.pid, token: ownerScope.receiverToken });
  const events = [], receipts = [];
  function append(e) { const body = { ...e, seq: events.length + 1, previousHash: events.at(-1)?.recordHash || 'origin' }; const value = { ...body, recordHash: hash(body) }; events.push(value); return value; }
  for (let i = 0; i < 13; i++) {
    const commandId = 'command-' + uuid(), cmd = { protocolVersion: 1, controllerId: 'fixture', channelEpoch: 'fixture', commandId, moduleId: 'layer-overlay', operationId: 'replace', executorHash: token(), phase: 'mutate', payloadHash: hash({}), payload: {} };
    append({ type: 'intent', commandId, dispatchBinding: dispatchBinding(cmd, 'receiver-store-foreign') });
    const e = append({ type: 'command', commandId, state: 'succeeded' });
    receipts.push({ commandId, ledgerRecordHash: e.recordHash, native: { outcome: 'applied' } });
  }
  append({ type: 'constraint', record: { schemaVersion: 2, constraintId: 'constraint-1', resource: { projectId: path.join(base, 'work.aep'), compId: 1 }, owner: foreign.installationId, reservationOwner: foreign.installationId, allowedEffects: ['mutate'], checkpointRef: 'checkpoint', unresolvedOutcome: false, revision: null, provenance: 'fixture', origin: { machineId: os.hostname(), aePid: 14008, aeProcessBirth: '2026-11-10T06:11:08.3950680Z' } } });
  while (events.length < 166) append({ type: 'evidence', fixture: true });
  const ledgerBytes = Buffer.from(events.map(canonical).join('\n') + '\n'); write(path.join(state, 'broker/ledger.ndjson'), ledgerBytes);
  const report = '.codex-runtime/native-receipts.json';
  write(path.join(repo, report), { ledger: { count: 166, sha256: hash(ledgerBytes) }, receiver: { count: 119, sha256: hash('unavailable') }, receipts });
  write(path.join(state, 'host-adoption.json'), { fixture: true });
  write(path.join(state, 'work-session.json'), { fixture: true });
  const preferences = path.join(home, 'AppData/Roaming/Adobe/After Effects'); write(path.join(preferences, 'prefs.txt'), 'preferences');
  const global = path.join(home, '.codex/config.toml'); write(global, 'global preferences');
  for (let i = 0; i < 4; i++) write(path.join(base, i + '.aep'), 'AEP fixture ' + i);
  const profile = { machine: os.hostname(), backupId: uuid(), backupHash: '', currentId: d.installationId, foreignId: foreign.installationId, descriptorHash: hash(canonical(d)), currentUpdate: currentId, foreignUpdate: foreignId, stop, ledgerHash: hash(ledgerBytes), ledgerEvents: 166, terminals: 13, aePid: 14008, aeBirth: '2026-11-10T06:11:08.3950680Z', report, foreignReceiverHash: hash('unavailable') };
  const backup = path.join(home, 'AppData/Local/AEAgentCore4-Recovery', profile.backupId), manifest = { version: 1, target: backup, jobs: [] };
  const spec = [['installation', root, 'installation'], ['cep', cep, 'cep'], ['preferences', preferences, 'preferences'], ['project-config', config, 'project-config.toml'], ['global-config', global, 'global-config.toml'], ...[0, 1, 2, 3].map(i => ['aep-' + i, path.join(base, i + '.aep'), 'assets/' + i + '.aep'])];
  function refreshBackup() {
    manifest.jobs = [];
    for (const [role, source, relative] of spec) {
      const target = path.join(backup, relative), files = {};
      const names = fs.statSync(source).isDirectory() ? fs.readdirSync(source, { recursive: true, withFileTypes: true }).filter(e => e.isFile()).map(e => path.relative(source, path.join(e.parentPath, e.name))) : [''];
      for (const f of names) { const src = f ? path.join(source, f) : source, dst = f ? path.join(target, f) : target, bytes = fs.readFileSync(src); write(dst, bytes); files[f] = { sha256: hash(bytes), bytes: bytes.length, stat: stats(src) }; }
      manifest.jobs.push({ role, source, target, files });
    }
    write(path.join(backup, 'manifest.json'), manifest); profile.backupHash = hash(fs.readFileSync(path.join(backup, 'manifest.json')));
  }
  const h = { base, home, root, repo, core, state, cep, config, backup, d, foreign, profile, descriptorPath, stop, installer, installArgs, load, refreshBackup, events, receipts, signed, updateRecord, write, stats, ledgerBytes,
    setCensus(v) { censusMode = v; }, crashAfter(callback) { fault = callback; }, clearFault() { fault = null; }, mutations,
    die() { birth += 10n; }, modules };
  await change(h); refreshBackup();
  copySource(path.join(SOURCE, 'tools/install-core4.js'), core); copySource(path.join(SOURCE, 'runtime/recovery-inspection.js'), core);
  const operator = path.join(core, 'tools/repair-mixed-installation.js');
  const original = fs.readFileSync(path.join(SOURCE, 'tools/repair-mixed-installation.js'), 'utf8');
  // Private harness rewrite of incident constants, never a production CLI seam.
  write(operator, original.replace(/const PROFILE = Object\.freeze\(\{[\s\S]*?\n\}\);/, 'const PROFILE = Object.freeze(' + canonical(profile) + ');'));
  h.api = load(operator, true); h.id = uuid(); h.repairDir = path.join(root, 'transactions', h.id + '-mixed-local-repair');
  h.plan = () => { clearLookups(); return h.api.execute('plan', h.id); };
  h.run = (mode, pin) => { clearLookups(); return h.api.execute(mode, h.id, pin); };
  t.after(() => { if (!path.resolve(base).startsWith(path.resolve(os.tmpdir()) + path.sep + 'core4-mixed-repair-')) throw Error('unsafe cleanup'); fs.rmSync(base, { recursive: true, force: true }); });
  return h;
}
module.exports = { fixture, pkg, hash, canonical, stats, signed, write };
