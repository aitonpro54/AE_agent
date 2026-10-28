'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { hash, canonical, fail } = require('../protocol/json');
const { verifyPackage } = require('./package-installable');
const { acquireInstallLease, assertInstallLease, ownedLeaseGates, checkpointInstallLease, retainInstallLease, releaseInstallLease } = require('../runtime/install-lease');
const BUNDLE = 'com.codex.aeagentcore4';
const preparedPlans = new WeakMap();
function planDigest(plan) { return hash({ transactionId: plan.transactionId, package: plan.pkg, origin: plan.origin, descriptor: plan.descriptor, descriptorPath: plan.descriptorPath, configPath: plan.configPath, nextConfig: plan.nextConfig, cepDir: plan.cepDir, cep: plan.cep, previousDescriptor: plan.previousDescriptor?.toString('base64') || null, previousConfig: plan.previousConfig?.toString('base64') || null, previousCep: plan.previousCep, baseline: plan.baseline }); }
function assertPreparedInstallPlan(plan) {
  const entry = plan && preparedPlans.get(plan); if (!entry || entry.digest !== planDigest(plan)) fail('prepared_install_plan_brand_or_changed');
  return Object.freeze({ transactionId: plan.transactionId, packageHash: plan.pkg.packageHash, appliedDescriptorHash: hash(canonical(plan.descriptor)), previousDescriptorHash: plan.baseline.descriptor, preparedPlanHash: entry.digest, preparedStateHash: entry.prepared?.hash || null });
}
function prepareInstallPlan(plan, { lease }) {
  const fingerprint = assertPreparedInstallPlan(plan), scope = { installRoot: plan.descriptor.installRoot, stateDir: plan.descriptor.stateDir, descriptorPath: plan.descriptorPath };
  assertInstallLease(lease, scope); const entry = preparedPlans.get(plan);
  if (!entry.prepared) {
    const directory = path.join(scope.installRoot, 'transactions', plan.transactionId + '-prepared');
    const payload = { version: 1, transactionId: plan.transactionId, preparedPlanHash: fingerprint.preparedPlanHash, package: plan.pkg, origin: plan.origin, descriptorBytes: Buffer.from(canonical(plan.descriptor)).toString('base64'), descriptorPath: plan.descriptorPath, configPath: plan.configPath, configBytes: Buffer.from(plan.nextConfig).toString('base64'), cepDir: plan.cepDir, cep: plan.cep, previousDescriptor: plan.previousDescriptor?.toString('base64') || null, previousConfig: plan.previousConfig?.toString('base64') || null, previousCep: plan.previousCep, baseline: plan.baseline };
    try {
      const parent = path.dirname(directory); if (!fs.lstatSync(parent).isDirectory() || fs.lstatSync(parent).isSymbolicLink() || fs.realpathSync(parent) !== parent) fail('prepared_install_path');
      fs.mkdirSync(directory, { recursive: false });
      if (fs.lstatSync(directory).isSymbolicLink() || fs.realpathSync(directory) !== directory) fail('prepared_install_path');
      durable(path.join(directory, 'prepared.json'), canonical(payload));
      durable(path.join(directory, 'descriptor.json'), canonical(plan.descriptor));
      entry.prepared = { directory, hash: hash(canonical(payload)), descriptorHash: fingerprint.appliedDescriptorHash };
    } catch (e) { retainInstallLease(lease); e.preparedDirectory = directory; e.leaseRetained = true; throw e; }
  }
  return assertDurablePreparedInstallPlan(plan, { lease });
}
function assertDurablePreparedInstallPlan(plan, { lease }) {
  assertPreparedInstallPlan(plan); assertInstallLease(lease, { installRoot: plan.descriptor.installRoot, stateDir: plan.descriptor.stateDir, descriptorPath: plan.descriptorPath });
  const prepared = preparedPlans.get(plan).prepared; if (!prepared) fail('prepared_install_state_required');
  const plain = file => { const s = fs.lstatSync(file); return s.isFile() && !s.isSymbolicLink() && !s.reparsePoint && fs.realpathSync(file) === file; };
  if (fs.lstatSync(prepared.directory).isSymbolicLink() || fs.realpathSync(prepared.directory) !== prepared.directory || canonical(fs.readdirSync(prepared.directory).sort()) !== canonical(['descriptor.json', 'prepared.json']) || !plain(path.join(prepared.directory, 'prepared.json')) || !plain(path.join(prepared.directory, 'descriptor.json')) || hash(fs.readFileSync(path.join(prepared.directory, 'prepared.json'))) !== prepared.hash || hash(fs.readFileSync(path.join(prepared.directory, 'descriptor.json'))) !== prepared.descriptorHash) { retainInstallLease(lease); fail('prepared_install_state_changed'); }
  return assertPreparedInstallPlan(plan);
}
function durable(file, data, flag = 'wx') { fs.mkdirSync(path.dirname(file), { recursive: true }); const fd = fs.openSync(file, flag); try { if (fs.writeSync(fd, data) !== Buffer.byteLength(data)) fail('install_short_write'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
function bytes(file) { return fs.existsSync(file) ? fs.readFileSync(file) : null; }
function snapshot(directory) {
  if (!fs.existsSync(directory)) return null;
  const result = {};
  function visit(dir) { for (const item of fs.readdirSync(dir, { withFileTypes: true })) { const file = path.join(dir, item.name); if (item.isSymbolicLink()) fail('install_symlink'); if (item.isDirectory()) visit(file); else result[path.relative(directory, file).replace(/\\/g, '/')] = fs.readFileSync(file).toString('base64'); } }
  visit(directory); return result;
}
function treeHash(value) { return hash(value); }
function restoreTree(directory, data) { fs.mkdirSync(directory, { recursive: true }); for (const [relative, b64] of Object.entries(data || {})) durable(path.join(directory, relative), Buffer.from(b64, 'base64')); }
function configText(previous, descriptor, nodePath, entry) {
  const text = previous ? previous.toString('utf8') : '';
  if (Buffer.byteLength(text) > 1024 * 1024 || previous && !Buffer.from(text, 'utf8').equals(previous) || text.includes('"""') || text.includes("'''")) fail('config_syntax_requires_review');
  const headers = []; let offset = 0, currentTable = '';
  // Deliberately bounded TOML subset: bare dotted tables and single-line values.
  // Unsupported table syntax is rejected BEFORE any installation writes.
  for (const line of text.match(/[^\n]*(?:\n|$)/g).filter(Boolean)) {
    if (/^[ \t]*\[/.test(line)) {
      const parsed = /^[ \t]*\[[ \t]*([A-Za-z0-9_-]+(?:[ \t]*\.[ \t]*[A-Za-z0-9_-]+)*)[ \t]*\][ \t]*(?:#[^\r\n]*)?(?:\r?\n)?$/.exec(line);
      if (!parsed) fail('config_syntax_requires_review');
      currentTable = parsed[1].split('.').map(part => part.trim()).join('.');
      if (currentTable.startsWith('mcp_servers.after-effects-core4.')) fail('config_core4_nested_requires_review');
      headers.push({ name: currentTable, start: offset, end: offset + line.length, line });
    } else if (/^[ \t]*mcp_servers[ \t]*\.[ \t]*after-effects-core4[ \t]*[.=]/.test(line) || currentTable === 'mcp_servers' && /^[ \t]*["']?after-effects-core4["']?[ \t]*=/.test(line)) fail('config_ambiguous_core4');
    offset += line.length;
  }
  const matches = headers.filter(h => h.name === 'mcp_servers.after-effects-core4'); if (matches.length > 1) fail('config_ambiguous_core4');
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const body = 'command = ' + JSON.stringify(nodePath.replace(/\\/g, '/')) + newline + 'args = ' + JSON.stringify([entry.replace(/\\/g, '/'), '--installation', descriptor.replace(/\\/g, '/')]) + newline;
  if (!matches.length) return text + (text && !text.endsWith('\n') ? newline : '') + newline + '[mcp_servers.after-effects-core4]' + newline + 'tool_timeout_sec = 120' + newline + body;
  const own = matches[0], following = headers.find(h => h.start > own.start);
  const ownBody = text.slice(own.end, following ? following.start : text.length), preferences = [], timeouts = [];
  for (const line of ownBody.match(/[^\n]*(?:\n|$)/g).filter(Boolean)) if (/^[ \t]*(?:enabled|"enabled"|'enabled')[ \t]*=/.test(line)) {
    if (!/^[ \t]*(?:enabled|"enabled"|'enabled')[ \t]*=[ \t]*(?:true|false)[ \t]*(?:#[^\r\n]*)?(?:\r?\n)?$/.test(line)) fail('config_enabled_preference_requires_review');
    preferences.push(line);
  }
  for (const line of ownBody.match(/[^\n]*(?:\n|$)/g).filter(Boolean)) if (/^[ \t]*(?:tool_timeout_sec|"tool_timeout_sec"|'tool_timeout_sec')[ \t]*=/.test(line)) {
    if (!/^[ \t]*(?:tool_timeout_sec|"tool_timeout_sec"|'tool_timeout_sec')[ \t]*=[ \t]*[1-9][0-9]*[ \t]*(?:#[^\r\n]*)?(?:\r?\n)?$/.test(line)) fail('config_timeout_preference_requires_review');
    timeouts.push(line);
  }
  if (preferences.length > 1) fail('config_duplicate_enabled_preference');
  if (timeouts.length > 1) fail('config_duplicate_timeout_preference');
  const preference = preferences.length ? preferences[0] + (preferences[0].endsWith('\n') ? '' : newline) : '';
  const timeout = timeouts.length ? timeouts[0] + (timeouts[0].endsWith('\n') ? '' : newline) : 'tool_timeout_sec = 120' + newline;
  return text.slice(0, own.end) + (own.line.endsWith('\n') ? '' : newline) + preference + timeout + body + text.slice(following ? following.start : text.length);
}
function planInstall({ pkg, nodePath, installRoot, extensionsDir, configPath, machineId }) {
  verifyPackage(pkg);
  const receiverContract = pkg.files['runtime/receiver-contract.json'] && JSON.parse(Buffer.from(pkg.files['runtime/receiver-contract.json'], 'base64'));
  if (!receiverContract || receiverContract.version !== 1 || receiverContract.descriptorVersion !== 2 || receiverContract.journalFormat !== 2 || receiverContract.terminalReadFailureDispositionVersion !== 1) fail('candidate_receiver_contract_unsupported');
  for (const value of [nodePath, installRoot, extensionsDir, configPath]) if (!path.isAbsolute(value)) fail('absolute_install_paths_required');
  if (path.basename(installRoot).toLowerCase() !== 'aeagentcore4' || path.basename(path.join(extensionsDir, BUNDLE)) !== BUNDLE) fail('install_scope');
  nodePath = path.resolve(nodePath);
  const resolvedNode = fs.realpathSync(nodePath); if (resolvedNode !== nodePath) fail('node_path_not_exact');
  if (path.resolve(process.execPath).toLowerCase() !== nodePath.toLowerCase()) fail('installer_candidate_node_must_be_current_process');
  const version = process.version;
  if (!/^v(2\d|[3-9]\d)\./.test(version)) fail('node_20_required');
  const releaseDir = path.join(installRoot, 'releases', pkg.packageHash), descriptor = path.join(installRoot, 'installation.json'), stateDir = path.join(installRoot, 'state', 'production'), cepDir = path.join(extensionsDir, BUNDLE);
  const originBytes = bytes(path.join(installRoot, 'origin.json')), anchorBytes = bytes(path.join(stateDir, 'origin.json'));
  if (!!originBytes !== !!anchorBytes || (originBytes && !originBytes.equals(anchorBytes))) fail('stable_state_origin_missing_or_mismatch');
  if (!originBytes && (fs.existsSync(descriptor) || fs.existsSync(cepDir) || fs.existsSync(stateDir))) fail('existing_installation_without_origin');
  const origin = originBytes ? JSON.parse(originBytes) : { version: 1, installationId: 'installation-' + crypto.randomUUID(), machineId: machineId || os.hostname(), createdAt: new Date().toISOString() };
  if (origin.machineId !== (machineId || os.hostname())) fail('machine_origin_mismatch');
  const previousDescriptor = bytes(descriptor), previousConfig = bytes(configPath), previousCep = snapshot(cepDir);
  if (previousDescriptor) {
    const old = JSON.parse(previousDescriptor); if (old.installationId !== origin.installationId || old.installRoot !== installRoot || old.stateDir !== stateDir) fail('installation_identity_mismatch');
    if (old.version === 2 && old.cepDir !== cepDir) fail('installation_cep_binding_change_unsupported');
  }
  const transactionId = crypto.randomUUID();
  const d = { version: 2, installRoot, installationId: origin.installationId, machineId: origin.machineId, packageHash: pkg.packageHash, releaseDir, stateDir, nodePath, nodeHash: hash(fs.readFileSync(nodePath)), nodeVersion: version, panelToken: crypto.randomBytes(32).toString('hex'), controlToken: crypto.randomBytes(32).toString('hex'), cepDir, receiverFormatVersion: 2, predecessor: previousDescriptor ? { transactionId, previousDescriptorHash: hash(previousDescriptor) } : null };
  const inspection = JSON.parse(Buffer.from(pkg.files['modules/project-inspection/artifact.json'], 'base64'));
  const manualAdmission = JSON.parse(Buffer.from(pkg.files['config/admissions/titles-current-target.json'], 'base64'));
  const cep = Object.fromEntries(Object.entries(pkg.files).filter(([f]) => f.startsWith('cep/')).map(([f, data]) => [f.slice(4), data]));
  cep['installation.js'] = Buffer.from('window.Core4Installation=' + canonical({ installationId: d.installationId, packageHash: d.packageHash, panelToken: d.panelToken, executorHash: inspection.executorHash, assetKey: 'project-inspection-v1', assets: [{ assetKey: 'project-inspection-v1', executorHash: inspection.executorHash, phases: ['inspect'] }, { assetKey: 'titles-current-target-v1', executorHash: manualAdmission.executorHash, phases: ['inspect', 'mutate', 'verify'] }] }) + ';\n').toString('base64');
  const nextConfig = configText(previousConfig, descriptor, nodePath, path.join(releaseDir, 'runtime/stdio-entry.js'));
  const plan = { pkg, origin, transactionId, descriptor: d, descriptorPath: descriptor, configPath, nextConfig, cepDir, cep, previousDescriptor, previousConfig, previousCep, baseline: { config: previousConfig ? hash(previousConfig) : null, descriptor: previousDescriptor ? hash(previousDescriptor) : null, cep: treeHash(previousCep) } };
  preparedPlans.set(plan, { digest: planDigest(plan), prepared: null }); return plan;
}
function assertBaseline(plan) { if ((bytes(plan.configPath) ? hash(bytes(plan.configPath)) : null) !== plan.baseline.config || (bytes(plan.descriptorPath) ? hash(bytes(plan.descriptorPath)) : null) !== plan.baseline.descriptor || treeHash(snapshot(plan.cepDir)) !== plan.baseline.cep) fail('install_baseline_changed'); }
function entryExists(file) { try { fs.lstatSync(file); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } }
function assertRuntimeStopped(stateDir, { lease, descriptorPath, cepDir, plan } = {}) {
  const scope = { installRoot: path.resolve(stateDir, '../..'), stateDir, descriptorPath };
  const owned = lease ? (assertInstallLease(lease, scope), ownedLeaseGates(lease)) : new Map();
  for (const relative of ['broker/broker-owner.lock', 'broker/broker-owner.gate', 'receiver/owner']) {
    const file = path.join(stateDir, relative);
    if (entryExists(file) && !(relative === 'broker/broker-owner.gate' && owned.has(file) && fs.readFileSync(file).equals(owned.get(file)))) fail('runtime_state_owned_or_unknown');
  }
  const ledger = path.join(stateDir, 'broker/ledger.ndjson');
  if (entryExists(ledger)) {
    const stat = fs.lstatSync(ledger); if (stat.isSymbolicLink() || fs.realpathSync(ledger) !== ledger) fail('runtime_ledger_unknown');
    const { Ledger } = require('../core/ledger'); const value = new Ledger(ledger); if (value.corrupt || value.unresolved().length) fail('runtime_ledger_unresolved');
  }
  if (entryExists(path.join(stateDir, 'receiver/completions.ndjson'))) {
    const options = { directory: path.join(stateDir, 'receiver'), descriptorPath, cepDir };
    if (plan) require('./disposition-install-preflight').assertPreparedReceiverJournalSettled({ ...options, plan, lease });
    else require('../runtime/native-read-disposition').assertReceiverJournalSettled(options);
  }
}
function checkRelease(directory, release) {
  const expectedFiles = new Set(['release.json']), expectedDirs = new Set(['']);
  for (const relative of Object.keys(release.hashes)) {
    if (!/^[A-Za-z0-9_./-]+$/.test(relative) || relative.split('/').some(p => !p || p === '.' || p === '..') || path.isAbsolute(relative) || relative === 'release.json') fail('immutable_release_mismatch');
    expectedFiles.add(relative); for (let dir = path.posix.dirname(relative); dir !== '.'; dir = path.posix.dirname(dir)) expectedDirs.add(dir);
  }
  function visit(dir, rel) {
    const stat = fs.lstatSync(dir); if (stat.isSymbolicLink() || !stat.isDirectory() || fs.realpathSync(dir) !== dir || !expectedDirs.delete(rel)) fail('immutable_release_mismatch');
    for (const item of fs.readdirSync(dir)) {
      const file = path.join(dir, item), relative = rel ? rel + '/' + item : item, stat = fs.lstatSync(file);
      if (stat.isSymbolicLink() || fs.realpathSync(file) !== file) fail('immutable_release_mismatch');
      if (stat.isDirectory()) visit(file, relative);
      else if (!stat.isFile() || !expectedFiles.delete(relative)) fail('immutable_release_mismatch');
      else if (relative === 'release.json' ? fs.readFileSync(file, 'utf8') !== canonical(release) : hash(fs.readFileSync(file)) !== release.hashes[relative]) fail('immutable_release_mismatch');
    }
  }
  visit(path.resolve(directory), ''); if (expectedFiles.size || expectedDirs.size) fail('immutable_release_mismatch');
}
function applyInstall(plan, { lease: borrowed } = {}) {
  let fingerprint = assertPreparedInstallPlan(plan);
  assertBaseline(plan);
  const d = plan.descriptor; fs.mkdirSync(d.installRoot, { recursive: true });
  const scope = { installRoot: d.installRoot, stateDir: d.stateDir, descriptorPath: plan.descriptorPath };
  const lease = borrowed || acquireInstallLease(scope); assertInstallLease(lease, scope);
  let txnFile, txn, writes = false;
  try {
    assertBaseline(plan);
    if (d.version !== 2 || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(plan.transactionId) || (plan.previousDescriptor ? canonical(d.predecessor) !== canonical({ transactionId: plan.transactionId, previousDescriptorHash: hash(plan.previousDescriptor) }) : d.predecessor !== null)) fail('install_lineage_plan');
    assertRuntimeStopped(d.stateDir, { lease, descriptorPath: plan.descriptorPath, cepDir: plan.cepDir, plan });
    writes = true;
    fs.mkdirSync(path.join(d.installRoot, 'transactions'), { recursive: true });
    fingerprint = prepareInstallPlan(plan, { lease });
    checkpointInstallLease(lease, 'installing');
    // State is stable across reinstall and rollback; no cleanup/reclaim is performed.
    if (!fs.existsSync(path.join(d.installRoot, 'origin.json'))) {
      writes = true;
      durable(path.join(d.installRoot, 'origin.json'), canonical(plan.origin));
      durable(path.join(d.stateDir, 'origin.json'), canonical(plan.origin));
    }
    if (!fs.existsSync(d.releaseDir)) {
      writes = true;
      const stage = path.join(d.installRoot, 'releases', '.stage-' + crypto.randomUUID());
      for (const [relative, b64] of Object.entries(plan.pkg.files)) durable(path.join(stage, relative), Buffer.from(b64, 'base64'));
      durable(path.join(stage, 'release.json'), canonical(plan.pkg.release)); checkRelease(stage, plan.pkg.release); fs.renameSync(stage, d.releaseDir);
    }
    checkRelease(d.releaseDir, plan.pkg.release);
    const transactionId = plan.transactionId; txnFile = path.join(d.installRoot, 'transactions', transactionId + '.json');
    const backupCep = path.join(d.installRoot, 'transactions', transactionId + '-cep');
    txn = { version: 2, transactionId, preparedPlanHash: fingerprint.preparedPlanHash, preparedStateHash: fingerprint.preparedStateHash, installRoot: d.installRoot, descriptorPath: plan.descriptorPath, configPath: plan.configPath, cepDir: plan.cepDir, backupCep, previousDescriptor: plan.previousDescriptor?.toString('base64') || null, previousConfig: plan.previousConfig?.toString('base64') || null, previousCepHash: treeHash(plan.previousCep), appliedDescriptorHash: hash(canonical(d)), appliedConfigHash: hash(plan.nextConfig), appliedCepHash: treeHash(plan.cep), stateDir: d.stateDir };
    writes = true;
    durable(txnFile, canonical(txn));
    // Last CAS before any visible switch. Unknown filesystem outcomes are not retried.
    assertBaseline(plan);
    if (fs.existsSync(plan.cepDir)) fs.renameSync(plan.cepDir, backupCep);
    restoreTree(plan.cepDir, plan.cep);
    durable(plan.descriptorPath + '.next', canonical(d));
    durable(plan.configPath + '.core4-next', plan.nextConfig);
    fs.renameSync(plan.descriptorPath + '.next', plan.descriptorPath);
    fs.renameSync(plan.configPath + '.core4-next', plan.configPath);
    if (hash(bytes(plan.descriptorPath)) !== txn.appliedDescriptorHash || hash(bytes(plan.configPath)) !== txn.appliedConfigHash || treeHash(snapshot(plan.cepDir)) !== txn.appliedCepHash) fail('install_readback_mismatch');
    require('../runtime/installation').verifyInstallation(plan.descriptorPath); checkpointInstallLease(lease, 'installed');
    return { installed: true, packageHash: d.packageHash, installationId: d.installationId, descriptorPath: plan.descriptorPath, transactionFile: txnFile, stateDir: d.stateDir, requiresPanelOpen: true, requiresMcpReconnect: true, liveProof: false };
  } catch (e) { if (writes) { retainInstallLease(lease); e.leaseRetained = true; if (txnFile) e.transactionFile = txnFile; } throw e; }
  finally { if (!borrowed) { const state = assertInstallLease(lease, scope); if (!state.retained) releaseInstallLease(lease); } }
}
function rollback(file) {
  const t = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (![1, 2].includes(t.version) || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(t.transactionId) || !path.isAbsolute(t.installRoot) || path.basename(t.installRoot).toLowerCase() !== 'aeagentcore4' || t.descriptorPath !== path.join(t.installRoot, 'installation.json') || t.backupCep !== path.join(t.installRoot, 'transactions', t.transactionId + '-cep') || path.basename(t.cepDir) !== BUNDLE || path.resolve(file) !== path.join(t.installRoot, 'transactions', t.transactionId + '.json') || fs.lstatSync(file).isSymbolicLink() || fs.realpathSync(file) !== path.resolve(file)) fail('rollback_scope');
  if (hash(bytes(t.descriptorPath)) !== t.appliedDescriptorHash || hash(bytes(t.configPath)) !== t.appliedConfigHash || treeHash(snapshot(t.cepDir)) !== t.appliedCepHash) fail('rollback_baseline_changed');
  const scope = { installRoot: t.installRoot, stateDir: t.stateDir, descriptorPath: t.descriptorPath }, lease = acquireInstallLease(scope); let writes = false;
  try {
    assertRuntimeStopped(t.stateDir, { lease, descriptorPath: t.descriptorPath, cepDir: t.cepDir });
    const priorBytes = t.previousDescriptor === null ? null : Buffer.from(t.previousDescriptor, 'base64'), target = priorBytes && JSON.parse(priorBytes);
    if (priorBytes && priorBytes.toString('base64') !== t.previousDescriptor) fail('rollback_previous_bytes');
    require('../runtime/native-read-disposition').assertRollbackReaderCompatible({ directory: path.join(t.stateDir, 'receiver'), target });
    if (target && (target.nodePath !== process.execPath || target.nodeHash !== hash(fs.readFileSync(process.execPath)))) fail('rollback_node_binding_unsupported');
    if (t.previousCepHash !== treeHash(fs.existsSync(t.backupCep) ? snapshot(t.backupCep) : null)) fail('rollback_backup_mismatch');
    checkpointInstallLease(lease, 'installing');
    // Move only the exact owned bundle. Keep recoverable applied files as evidence.
    writes = true;
    fs.renameSync(t.cepDir, path.join(t.installRoot, 'transactions', t.transactionId + '-applied-cep'));
    if (fs.existsSync(t.backupCep)) fs.renameSync(t.backupCep, t.cepDir);
    for (const [target, prior] of [[t.descriptorPath, t.previousDescriptor], [t.configPath, t.previousConfig]]) {
      if (prior === null) fs.unlinkSync(target);
      else { durable(target + '.rollback', Buffer.from(prior, 'base64')); fs.renameSync(target + '.rollback', target); }
    }
    if (t.previousDescriptor !== null) require('../runtime/installation').verifyInstallation(t.descriptorPath, { cepDir: t.cepDir });
    checkpointInstallLease(lease, 'installed');
    return { rolledBack: true, transactionId: t.transactionId, statePreserved: true, liveProof: false };
  } catch (e) { if (writes) { retainInstallLease(lease); e.leaseRetained = true; e.transactionFile = file; } throw e; }
  finally { const state = assertInstallLease(lease, scope); if (!state.retained) releaseInstallLease(lease); }
}
function sourceWorkspace(explicit) {
  // Source checkout layout is the discovery contract; neither CWD nor machine
  // identity selects a configuration target. Standalone copies need --workspace.
  const workspaceRoot = explicit === undefined ? path.resolve(__dirname, '../..') : explicit;
  if (typeof workspaceRoot !== 'string' || !path.isAbsolute(workspaceRoot) || path.resolve(workspaceRoot) !== workspaceRoot) fail('workspace_absolute_exact_path_required');
  try {
    const marker = path.join(workspaceRoot, 'core4/package.json'), installer = path.join(workspaceRoot, 'core4/tools/install-core4.js');
    if (explicit === undefined && __filename !== installer) fail('workspace_source_layout_required');
    if (!fs.lstatSync(workspaceRoot).isDirectory() || fs.realpathSync(workspaceRoot) !== workspaceRoot || ![marker, installer].every(file => fs.lstatSync(file).isFile() && !fs.lstatSync(file).isSymbolicLink() && fs.realpathSync(file) === file) || JSON.parse(fs.readFileSync(marker, 'utf8')).name !== 'ae-agent-core4') fail('workspace_source_layout_required');
  } catch { fail('workspace_source_layout_required'); }
  return { workspaceRoot, workspaceSource: explicit === undefined ? 'installer-location' : 'explicit-workspace', installerPath: __filename };
}
function defaults(pkg, nodePath, workspaceRoot) { return { pkg, nodePath, installRoot: path.join(process.env.LOCALAPPDATA, 'AEAgentCore4'), extensionsDir: path.join(process.env.APPDATA, 'Adobe/CEP/extensions'), configPath: path.join(workspaceRoot, '.codex/config.toml') }; }
if (require.main === module) {
  try {
    const args = process.argv.slice(2), get = flag => args[args.indexOf(flag) + 1];
    if (args[0] === 'rollback' && args.length === 2) console.log(canonical(rollback(path.resolve(args[1]))));
    else {
      const flags = args.slice(1).filter((_, index) => index % 2 === 0);
      if (!['dry-run', 'apply'].includes(args[0]) || args.length % 2 !== 1 || flags.some(f => !['--package', '--node', '--workspace', '--expected-package-hash'].includes(f)) || new Set(flags).size !== flags.length || !flags.includes('--package') || args[0] === 'apply' && !flags.includes('--expected-package-hash')) fail('usage_install_mode_package_node_expected_hash');
      const pkg = verifyPackage(JSON.parse(fs.readFileSync(get('--package'), 'utf8')));
      if (flags.includes('--expected-package-hash') && (!/^[a-f0-9]{64}$/.test(get('--expected-package-hash')) || pkg.packageHash !== get('--expected-package-hash'))) fail('reviewed_package_hash_mismatch');
      const workspace = sourceWorkspace(flags.includes('--workspace') ? get('--workspace') : undefined);
      const plan = planInstall(defaults(pkg, flags.includes('--node') ? get('--node') : process.execPath, workspace.workspaceRoot));
      console.log(canonical(args[0] === 'apply' ? applyInstall(plan) : { dryRun: true, ...workspace, packageHash: pkg.packageHash, expectedPackageHash: pkg.packageHash, releaseDir: plan.descriptor.releaseDir, descriptorPath: plan.descriptorPath, stateDir: plan.descriptor.stateDir, cepDir: plan.cepDir, configPath: plan.configPath, nodePath: plan.descriptor.nodePath, nodeVersion: plan.descriptor.nodeVersion, nodeHash: plan.descriptor.nodeHash, baseline: plan.baseline, liveProof: false }));
    }
  } catch (e) { console.error(canonical({ error: e.code || 'install_failed', ...(e.transactionFile ? { transactionFile: e.transactionFile } : {}) })); process.exitCode = 1; }
}
module.exports = { planInstall, assertPreparedInstallPlan, prepareInstallPlan, assertDurablePreparedInstallPlan, applyInstall, rollback, snapshot, configText, checkRelease };
