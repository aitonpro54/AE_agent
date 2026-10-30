'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { hash, canonical, fail } = require('../protocol/json');
const { verifyPackage, runtimeBinding } = require('./package-installable');
const { deriveComposition, installationConfig } = require('../runtime/stdio-entry.js');
const { acquireInstallLease, assertInstallLease, ownedLeaseGates, checkpointInstallLease, retainInstallLease, releaseInstallLease } = require('../runtime/install-lease');
const BUNDLE = 'com.codex.aeagentcore4';
function safeFile(file) {
  if (!path.isAbsolute(file) || path.resolve(file) !== file) fail('client_binding_path');
  let cursor = path.parse(file).root;
  const parts = file.slice(cursor.length).split(path.sep).filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    cursor = path.join(cursor, parts[i]); let stat;
    try { stat = fs.lstatSync(cursor); } catch (e) { if (e.code === 'ENOENT') return false; throw e; }
    if (stat.isSymbolicLink() || stat.reparsePoint || fs.realpathSync(cursor) !== cursor || (i < parts.length - 1 ? !stat.isDirectory() : !stat.isFile())) fail('client_binding_path');
  }
  return true;
}
function checkedBytes(file, limit = 16384) {
  if (!safeFile(file)) return null;
  const named = fs.lstatSync(file), fd = fs.openSync(file, 'r');
  try {
    const stat = fs.fstatSync(fd);
    if (!named.isFile() || !stat.isFile() || named.dev !== stat.dev || named.ino !== stat.ino) fail('client_binding_path');
    if (!Number.isSafeInteger(stat.size) || stat.size < 1 || stat.size > limit) fail('client_binding_budget');
    const value = Buffer.alloc(stat.size); let offset = 0;
    while (offset < value.length) { const count = fs.readSync(fd, value, offset, value.length - offset, offset); if (!count) fail('client_binding_changed'); offset += count; }
    const extra = fs.readSync(fd, Buffer.alloc(1), 0, 1, offset), after = fs.fstatSync(fd);
    if (extra || ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'].some(key => after[key] !== stat[key])) fail('client_binding_changed');
    let final;
    try { if (!safeFile(file)) fail('client_binding_changed'); final = fs.lstatSync(file); } catch { fail('client_binding_changed'); }
    if (!final.isFile() || ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'].some(key => final[key] !== after[key])) fail('client_binding_changed');
    return value;
  } finally { fs.closeSync(fd); }
}
function clientPaths(root) {
  const file = path.join(root, 'core-client.json'); safeFile(file);
  for (const suffix of ['.next', '.rollback']) if (safeFile(file + suffix)) fail('client_binding_staging_exists');
  return file;
}
function originState(d) { return { root: checkedBytes(path.join(d.installRoot, 'origin.json'), 8192), anchor: checkedBytes(path.join(d.stateDir, 'origin.json'), 8192) }; }
function installedBinding(d) {
  if (!/^[a-f0-9]{64}$/.test(d.packageHash) || d.releaseDir !== path.join(d.installRoot, 'releases', d.packageHash)) fail('client_previous_release');
  const release = JSON.parse(checkedBytes(path.join(d.releaseDir, 'release.json'), 4 * 1024 * 1024));
  if (hash(release) !== d.packageHash) fail('client_previous_release'); checkRelease(d.releaseDir, release);
  return runtimeBinding(release, file => fs.readFileSync(path.join(d.releaseDir, file)));
}
function assertOwnedClient(value, d, originBytes) {
  if (!value || !d || !originBytes) fail('foreign_client_descriptor');
  // Historical releases are data only. This closed projection also works in a
  // stdio-only standalone candidate that deliberately has no client-entry code.
  const { installationId, machineId, installRoot, releaseDir, packageHash, nodePath, nodeHash, controlToken } = d;
  if (![installationId, machineId].every(v => typeof v === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(v)) ||
      ![packageHash, nodeHash, controlToken].every(v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v))) fail('foreign_client_descriptor');
  const origin = JSON.parse(originBytes);
  if (origin.installationId !== installationId || origin.machineId !== machineId) fail('foreign_client_descriptor');
  const expected = { version: 1, role: 'core4-control-client', installationId, machineId, installRoot, releaseDir, packageHash, nodePath, nodeHash, controlToken,
    originHash: hash(originBytes), ownerEndpoint: '\\\\.\\pipe\\ae-core4-owner-' + hash(JSON.stringify({ installationId, machineId })).slice(0, 32) };
  if (value.length > 16384 || !value.equals(Buffer.from(canonical(expected)))) fail('foreign_client_descriptor');
}
function validateClientBinding(binding, root) {
  const keys = ['version', 'runtimeModel', 'clientDescriptorPath', 'previousClient', 'appliedClientHash'];
  if (!binding || Object.getPrototypeOf(binding) !== Object.prototype || Object.keys(binding).length !== keys.length || keys.some(k => !Object.hasOwn(binding, k)) ||
      binding.version !== 1 || !['stdio', 'owner'].includes(binding.runtimeModel) || binding.clientDescriptorPath !== path.join(root, 'core-client.json') ||
      (binding.runtimeModel === 'owner' ? !/^[a-f0-9]{64}$/.test(binding.appliedClientHash) : binding.appliedClientHash !== null) ||
      binding.previousClient !== null && (typeof binding.previousClient !== 'string' || binding.previousClient.length > 22000 || Buffer.from(binding.previousClient, 'base64').toString('base64') !== binding.previousClient)) fail('client_binding_schema');
}
const preparedPlans = new WeakMap();
function planDigest(plan) { return hash({ transactionId: plan.transactionId, package: plan.pkg, origin: plan.origin, originBytes: plan.originBytes.toString('base64'), clientBinding: plan.clientBinding, nextClient: plan.nextClient?.toString('base64') ?? null, descriptor: plan.descriptor, descriptorPath: plan.descriptorPath, configPath: plan.configPath, nextConfig: plan.nextConfig, cepDir: plan.cepDir, cep: plan.cep, previousDescriptor: plan.previousDescriptor?.toString('base64') || null, previousConfig: plan.previousConfig?.toString('base64') || null, previousCep: plan.previousCep, baseline: plan.baseline }); }
function assertPreparedInstallPlan(plan) {
  const entry = plan && preparedPlans.get(plan); let digest;
  try { if (entry) digest = planDigest(plan); } catch { fail('prepared_install_plan_brand_or_changed'); }
  if (!entry || entry.digest !== digest) fail('prepared_install_plan_brand_or_changed');
  return Object.freeze({ transactionId: plan.transactionId, packageHash: plan.pkg.packageHash, appliedDescriptorHash: hash(canonical(plan.descriptor)), previousDescriptorHash: plan.baseline.descriptor, preparedPlanHash: entry.digest, preparedStateHash: entry.prepared?.hash || null });
}
function prepareInstallPlan(plan, { lease }) {
  const fingerprint = assertPreparedInstallPlan(plan), scope = { installRoot: plan.descriptor.installRoot, stateDir: plan.descriptor.stateDir, descriptorPath: plan.descriptorPath };
  assertInstallLease(lease, scope); const entry = preparedPlans.get(plan);
  if (!entry.prepared) {
    const directory = path.join(scope.installRoot, 'transactions', plan.transactionId + '-prepared');
    const payload = { version: 1, transactionId: plan.transactionId, preparedPlanHash: fingerprint.preparedPlanHash, package: plan.pkg, origin: plan.origin, originBytes: plan.originBytes.toString('base64'), clientBinding: plan.clientBinding, nextClient: plan.nextClient?.toString('base64') ?? null, descriptorBytes: Buffer.from(canonical(plan.descriptor)).toString('base64'), descriptorPath: plan.descriptorPath, configPath: plan.configPath, configBytes: Buffer.from(plan.nextConfig).toString('base64'), cepDir: plan.cepDir, cep: plan.cep, previousDescriptor: plan.previousDescriptor?.toString('base64') || null, previousConfig: plan.previousConfig?.toString('base64') || null, previousCep: plan.previousCep, baseline: plan.baseline };
    try {
      const parent = path.dirname(directory); if (!fs.lstatSync(parent).isDirectory() || fs.lstatSync(parent).isSymbolicLink() || fs.realpathSync(parent) !== parent) fail('prepared_install_path');
      fs.mkdirSync(directory, { recursive: false });
      if (fs.lstatSync(directory).isSymbolicLink() || fs.realpathSync(directory) !== directory) fail('prepared_install_path');
      durable(path.join(directory, 'prepared.json'), canonical(payload));
      durable(path.join(directory, 'descriptor.json'), canonical(plan.descriptor));
      if (plan.nextClient) durable(path.join(directory, 'client.json'), plan.nextClient);
      entry.prepared = { directory, hash: hash(canonical(payload)), descriptorHash: fingerprint.appliedDescriptorHash };
    } catch (e) { retainInstallLease(lease); e.preparedDirectory = directory; e.leaseRetained = true; throw e; }
  }
  return assertDurablePreparedInstallPlan(plan, { lease });
}
function assertDurablePreparedInstallPlan(plan, { lease }) {
  assertPreparedInstallPlan(plan); assertInstallLease(lease, { installRoot: plan.descriptor.installRoot, stateDir: plan.descriptor.stateDir, descriptorPath: plan.descriptorPath });
  const prepared = preparedPlans.get(plan).prepared; if (!prepared) fail('prepared_install_state_required');
  const plain = file => { const s = fs.lstatSync(file); return s.isFile() && !s.isSymbolicLink() && !s.reparsePoint && fs.realpathSync(file) === file; };
  const expected = ['descriptor.json', 'prepared.json', ...(plan.nextClient ? ['client.json'] : [])].sort();
  if (fs.lstatSync(prepared.directory).isSymbolicLink() || fs.realpathSync(prepared.directory) !== prepared.directory || canonical(fs.readdirSync(prepared.directory).sort()) !== canonical(expected) || !plain(path.join(prepared.directory, 'prepared.json')) || !plain(path.join(prepared.directory, 'descriptor.json')) || hash(fs.readFileSync(path.join(prepared.directory, 'prepared.json'))) !== prepared.hash || hash(fs.readFileSync(path.join(prepared.directory, 'descriptor.json'))) !== prepared.descriptorHash || plan.nextClient && (!plain(path.join(prepared.directory, 'client.json')) || !fs.readFileSync(path.join(prepared.directory, 'client.json')).equals(plan.nextClient))) { retainInstallLease(lease); fail('prepared_install_state_changed'); }
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
function configText(previous, descriptor, nodePath, entry, argument = '--installation') {
  if (!['--installation', '--client-descriptor'].includes(argument)) fail('config_runtime_argument');
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
  // TOML basic strings accept JSON's escaped backslashes. Preserve native path
  // bytes: the installed verifier deliberately rejects noncanonical spellings.
  const body = 'command = ' + JSON.stringify(nodePath) + newline + 'args = ' + JSON.stringify([entry, argument, descriptor]) + newline;
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
function planInstall({ pkg, nodePath, installRoot, extensionsDir, configPath, machineId, runtimeModel }) {
  verifyPackage(pkg);
  const runtime = runtimeBinding(pkg.release, file => Buffer.from(pkg.files[file], 'base64'));
  if (runtimeModel !== undefined && runtimeModel !== runtime.runtimeModel) fail('runtime_selector_mismatch');
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
  const clientDescriptorPath = clientPaths(installRoot), previousClient = checkedBytes(clientDescriptorPath);
  const originBytes = checkedBytes(path.join(installRoot, 'origin.json'), 8192), anchorBytes = checkedBytes(path.join(stateDir, 'origin.json'), 8192);
  if (!!originBytes !== !!anchorBytes || (originBytes && !originBytes.equals(anchorBytes))) fail('stable_state_origin_missing_or_mismatch');
  if (!originBytes && (fs.existsSync(descriptor) || fs.existsSync(cepDir) || fs.existsSync(stateDir))) fail('existing_installation_without_origin');
  const origin = originBytes ? JSON.parse(originBytes) : { version: 1, installationId: 'installation-' + crypto.randomUUID(), machineId: machineId || os.hostname(), createdAt: new Date().toISOString() };
  if (origin.machineId !== (machineId || os.hostname())) fail('machine_origin_mismatch');
  const previousDescriptor = bytes(descriptor), previousConfig = bytes(configPath), previousCep = snapshot(cepDir);
  if (previousDescriptor) {
    const old = JSON.parse(previousDescriptor); if (old.installationId !== origin.installationId || old.installRoot !== installRoot || old.stateDir !== stateDir) fail('installation_identity_mismatch');
    if (old.version === 2 && old.cepDir !== cepDir) fail('installation_cep_binding_change_unsupported');
    const previousRuntime = installedBinding(old);
    if (previousRuntime.runtimeModel === 'owner') assertOwnedClient(previousClient, old, originBytes);
    else if (previousClient) fail('foreign_client_descriptor');
  }
  else if (previousClient) fail('foreign_client_descriptor');
  const transactionId = crypto.randomUUID();
  const d = { version: 2, installRoot, installationId: origin.installationId, machineId: origin.machineId, packageHash: pkg.packageHash, releaseDir, stateDir, nodePath, nodeHash: hash(fs.readFileSync(nodePath)), nodeVersion: version, panelToken: crypto.randomBytes(32).toString('hex'), controlToken: crypto.randomBytes(32).toString('hex'), cepDir, receiverFormatVersion: 2, predecessor: previousDescriptor ? { transactionId, previousDescriptorHash: hash(previousDescriptor) } : null };
  const selected = deriveComposition(pkg.release, file => Buffer.from(pkg.files[file], 'base64'));
  const cep = Object.fromEntries(Object.entries(pkg.files).filter(([f]) => f.startsWith('cep/')).map(([f, data]) => [f.slice(4), data]));
  cep['installation.js'] = Buffer.from('window.Core4Installation=' + canonical(installationConfig(d, selected)) + ';\n').toString('base64');
  const plannedOrigin = originBytes || Buffer.from(canonical(origin));
  const nextClient = runtime.runtimeModel === 'owner' ? Buffer.from(canonical(require('../runtime/client-entry').projectClientDescriptor(d, { originBytes: plannedOrigin }))) : null;
  const clientBinding = { version: 1, runtimeModel: runtime.runtimeModel, clientDescriptorPath, previousClient: previousClient?.toString('base64') ?? null, appliedClientHash: nextClient ? hash(nextClient) : null };
  const nextConfig = configText(previousConfig, runtime.runtimeModel === 'owner' ? clientDescriptorPath : descriptor, nodePath, path.join(releaseDir, runtime.clientEntry), runtime.clientArgument);
  const plan = { pkg, origin, originBytes: plannedOrigin, clientBinding, nextClient, transactionId, descriptor: d, descriptorPath: descriptor, configPath, nextConfig, cepDir, cep, previousDescriptor, previousConfig, previousCep, baseline: { client: previousClient ? hash(previousClient) : null, rootOrigin: originBytes ? hash(originBytes) : null, anchorOrigin: anchorBytes ? hash(anchorBytes) : null, config: previousConfig ? hash(previousConfig) : null, descriptor: previousDescriptor ? hash(previousDescriptor) : null, cep: treeHash(previousCep) } };
  preparedPlans.set(plan, { digest: planDigest(plan), prepared: null }); return plan;
}
function assertBaseline(plan, originPublished = false) {
  validateClientBinding(plan.clientBinding, plan.descriptor.installRoot); clientPaths(plan.descriptor.installRoot);
  const client = checkedBytes(plan.clientBinding.clientDescriptorPath), origin = originState(plan.descriptor);
  const originHash = hash(plan.originBytes), rootExpected = originPublished && plan.baseline.rootOrigin === null ? originHash : plan.baseline.rootOrigin, anchorExpected = originPublished && plan.baseline.anchorOrigin === null ? originHash : plan.baseline.anchorOrigin;
  if ((client ? hash(client) : null) !== plan.baseline.client || (origin.root ? hash(origin.root) : null) !== rootExpected || (origin.anchor ? hash(origin.anchor) : null) !== anchorExpected || (bytes(plan.configPath) ? hash(bytes(plan.configPath)) : null) !== plan.baseline.config || (bytes(plan.descriptorPath) ? hash(bytes(plan.descriptorPath)) : null) !== plan.baseline.descriptor || treeHash(snapshot(plan.cepDir)) !== plan.baseline.cep) fail('install_baseline_changed');
}
function entryExists(file) { try { fs.lstatSync(file); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } }
function assertNoLifecycleMarkers(stateDir) {
  for (const name of ['runtime-owner.json', 'runtime-owner.next', 'runtime-diagnostic.json', 'runtime-maintenance.json']) if (entryExists(path.join(stateDir, name))) fail('runtime_lifecycle_owned_or_maintenance');
}
function assertRuntimeStopped(stateDir, { lease, descriptorPath, cepDir, plan } = {}) {
  const scope = { installRoot: path.resolve(stateDir, '../..'), stateDir, descriptorPath };
  const owned = lease ? (assertInstallLease(lease, scope), ownedLeaseGates(lease)) : new Map();
  assertNoLifecycleMarkers(stateDir);
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
  const d = plan.descriptor; assertNoLifecycleMarkers(d.stateDir); fs.mkdirSync(d.installRoot, { recursive: true });
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
      durable(path.join(d.installRoot, 'origin.json'), plan.originBytes);
      durable(path.join(d.stateDir, 'origin.json'), plan.originBytes);
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
    txn = { version: 2, transactionId, preparedPlanHash: fingerprint.preparedPlanHash, preparedStateHash: fingerprint.preparedStateHash, clientBinding: plan.clientBinding, originBinding: { version: 1, rootOriginHash: hash(plan.originBytes), anchorOriginHash: hash(plan.originBytes) }, installRoot: d.installRoot, descriptorPath: plan.descriptorPath, configPath: plan.configPath, cepDir: plan.cepDir, backupCep, previousDescriptor: plan.previousDescriptor?.toString('base64') || null, previousConfig: plan.previousConfig?.toString('base64') || null, previousCepHash: treeHash(plan.previousCep), appliedDescriptorHash: hash(canonical(d)), appliedConfigHash: hash(plan.nextConfig), appliedCepHash: treeHash(plan.cep), stateDir: d.stateDir };
    writes = true;
    durable(txnFile, canonical(txn));
    // Last CAS before any visible switch. Unknown filesystem outcomes are not retried.
    assertBaseline(plan, true);
    if (fs.existsSync(plan.cepDir)) fs.renameSync(plan.cepDir, backupCep);
    restoreTree(plan.cepDir, plan.cep);
    durable(plan.descriptorPath + '.next', canonical(d));
    clientPaths(d.installRoot);
    if (plan.nextClient) durable(plan.clientBinding.clientDescriptorPath + '.next', plan.nextClient);
    durable(plan.configPath + '.core4-next', plan.nextConfig);
    fs.renameSync(plan.descriptorPath + '.next', plan.descriptorPath);
    safeFile(plan.clientBinding.clientDescriptorPath); safeFile(plan.clientBinding.clientDescriptorPath + '.next'); safeFile(plan.clientBinding.clientDescriptorPath + '.rollback');
    const beforeClient = checkedBytes(plan.clientBinding.clientDescriptorPath);
    if ((beforeClient ? hash(beforeClient) : null) !== plan.baseline.client) fail('client_binding_changed');
    if (plan.nextClient) fs.renameSync(plan.clientBinding.clientDescriptorPath + '.next', plan.clientBinding.clientDescriptorPath);
    else if (plan.clientBinding.previousClient !== null) {
      if (!safeFile(plan.clientBinding.clientDescriptorPath)) fail('client_binding_changed');
      fs.unlinkSync(plan.clientBinding.clientDescriptorPath);
    }
    const appliedClient = checkedBytes(clientPaths(d.installRoot)), appliedOrigin = originState(d);
    if ((appliedClient ? hash(appliedClient) : null) !== txn.clientBinding.appliedClientHash || !appliedOrigin.root || !appliedOrigin.anchor || hash(appliedOrigin.root) !== txn.originBinding.rootOriginHash || hash(appliedOrigin.anchor) !== txn.originBinding.anchorOriginHash || hash(bytes(plan.descriptorPath)) !== txn.appliedDescriptorHash || (bytes(plan.configPath) ? hash(bytes(plan.configPath)) : null) !== plan.baseline.config || treeHash(snapshot(plan.cepDir)) !== txn.appliedCepHash) fail('install_readback_mismatch');
    fs.renameSync(plan.configPath + '.core4-next', plan.configPath);
    if (hash(bytes(plan.configPath)) !== txn.appliedConfigHash) fail('install_readback_mismatch');
    require('../runtime/installation').verifyInstallation(plan.descriptorPath); checkpointInstallLease(lease, 'installed');
    return { installed: true, packageHash: d.packageHash, installationId: d.installationId, descriptorPath: plan.descriptorPath, transactionFile: txnFile, stateDir: d.stateDir, requiresPanelOpen: true, requiresMcpReconnect: true, liveProof: false };
  } catch (e) { if (writes) { retainInstallLease(lease); e.leaseRetained = true; if (txnFile) e.transactionFile = txnFile; } throw e; }
  finally { if (!borrowed) { const state = assertInstallLease(lease, scope); if (!state.retained) releaseInstallLease(lease); } }
}
function rollbackBinding(t, current, target) {
  if (current.installRoot !== t.installRoot || current.stateDir !== t.stateDir || target &&
      ['installRoot', 'stateDir', 'installationId', 'machineId'].some(key => target[key] !== current[key])) fail('rollback_client_scope');
  const file = clientPaths(t.installRoot), value = checkedBytes(file), origin = originState(current);
  if (!origin.root || !origin.anchor || !origin.root.equals(origin.anchor)) fail('rollback_client_baseline_changed');
  const originValue = JSON.parse(origin.root);
  if (originValue.installationId !== current.installationId || originValue.machineId !== current.machineId) fail('rollback_client_baseline_changed');
  const currentRuntime = installedBinding(current), targetRuntime = target ? installedBinding(target) : null;
  if (!Object.hasOwn(t, 'clientBinding')) {
    if (Object.hasOwn(t, 'originBinding') || currentRuntime.runtimeModel !== 'stdio' || targetRuntime?.runtimeModel === 'owner' || value) fail('rollback_client_extension_required');
    return { file, previous: null, value: null, origin };
  }
  validateClientBinding(t.clientBinding, t.installRoot);
  const binding = t.clientBinding, prior = binding.previousClient === null ? null : Buffer.from(binding.previousClient, 'base64');
  const o = t.originBinding;
  if (!o || Object.keys(o).sort().join(',') !== 'anchorOriginHash,rootOriginHash,version' || o.version !== 1 || !/^[a-f0-9]{64}$/.test(o.rootOriginHash) || !/^[a-f0-9]{64}$/.test(o.anchorOriginHash) ||
      !origin.root || !origin.anchor || hash(origin.root) !== o.rootOriginHash || hash(origin.anchor) !== o.anchorOriginHash ||
      binding.runtimeModel !== currentRuntime.runtimeModel || (value ? hash(value) : null) !== binding.appliedClientHash) fail('rollback_client_baseline_changed');
  if (currentRuntime.runtimeModel === 'owner') assertOwnedClient(value, current, origin.root);
  if (targetRuntime?.runtimeModel === 'owner') assertOwnedClient(prior, target, origin.root);
  else if (prior) fail('foreign_client_descriptor');
  const preparedFile = path.join(t.installRoot, 'transactions', t.transactionId + '-prepared', 'prepared.json');
  const preparedBytes = checkedBytes(preparedFile, 64 * 1024 * 1024), prepared = preparedBytes && JSON.parse(preparedBytes);
  if (!prepared || hash(preparedBytes) !== t.preparedStateHash || prepared.preparedPlanHash !== t.preparedPlanHash || prepared.transactionId !== t.transactionId ||
      prepared.descriptorPath !== t.descriptorPath || prepared.configPath !== t.configPath || prepared.cepDir !== t.cepDir ||
      prepared.previousDescriptor !== t.previousDescriptor || prepared.previousConfig !== t.previousConfig || treeHash(prepared.previousCep) !== t.previousCepHash ||
      canonical(prepared.clientBinding) !== canonical(binding) ||
      hash(Buffer.from(prepared.originBytes, 'base64')) !== o.rootOriginHash ||
      (prepared.nextClient === null ? null : hash(Buffer.from(prepared.nextClient, 'base64'))) !== binding.appliedClientHash ||
      hash(Buffer.from(prepared.descriptorBytes, 'base64')) !== t.appliedDescriptorHash || hash(Buffer.from(prepared.configBytes, 'base64')) !== t.appliedConfigHash || treeHash(prepared.cep) !== t.appliedCepHash) fail('rollback_client_prepared_changed');
  const planned = JSON.parse(Buffer.from(prepared.descriptorBytes, 'base64'));
  const previousDescriptorHash = t.previousDescriptor === null ? null : hash(Buffer.from(t.previousDescriptor, 'base64'));
  const previousConfigHash = t.previousConfig === null ? null : hash(Buffer.from(t.previousConfig, 'base64'));
  const predecessor = t.previousDescriptor === null ? null : { transactionId: t.transactionId, previousDescriptorHash };
  if (t.version !== 2 || planned.version !== 2 || canonical(planned) !== canonical(current) || canonical(planned.predecessor) !== canonical(predecessor) ||
      planned.installRoot !== t.installRoot || planned.stateDir !== path.join(t.installRoot, 'state/production') || planned.cepDir !== t.cepDir ||
      prepared.package.packageHash !== planned.packageHash || hash(prepared.package.release) !== planned.packageHash ||
      prepared.origin.installationId !== planned.installationId || prepared.origin.machineId !== planned.machineId ||
      prepared.baseline.descriptor !== previousDescriptorHash || prepared.baseline.config !== previousConfigHash || prepared.baseline.cep !== t.previousCepHash) fail('rollback_client_prepared_changed');
  const preparedDirectory = path.dirname(preparedFile), expected = ['descriptor.json', 'prepared.json', ...(prepared.nextClient === null ? [] : ['client.json'])].sort();
  if (canonical(fs.readdirSync(preparedDirectory).sort()) !== canonical(expected) || hash(checkedBytes(path.join(preparedDirectory, 'descriptor.json'))) !== t.appliedDescriptorHash ||
      prepared.nextClient !== null && hash(checkedBytes(path.join(preparedDirectory, 'client.json'))) !== binding.appliedClientHash) fail('rollback_client_prepared_changed');
  return { file, previous: prior, value, origin };
}
function rollback(file) {
  if (!safeFile(file)) fail('rollback_scope');
  const t = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (![1, 2].includes(t.version) || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(t.transactionId) || !path.isAbsolute(t.installRoot) || path.basename(t.installRoot).toLowerCase() !== 'aeagentcore4' || t.descriptorPath !== path.join(t.installRoot, 'installation.json') || t.backupCep !== path.join(t.installRoot, 'transactions', t.transactionId + '-cep') || path.basename(t.cepDir) !== BUNDLE || path.resolve(file) !== path.join(t.installRoot, 'transactions', t.transactionId + '.json') || fs.lstatSync(file).isSymbolicLink() || fs.realpathSync(file) !== path.resolve(file)) fail('rollback_scope');
  if (hash(bytes(t.descriptorPath)) !== t.appliedDescriptorHash || hash(bytes(t.configPath)) !== t.appliedConfigHash || treeHash(snapshot(t.cepDir)) !== t.appliedCepHash) fail('rollback_baseline_changed');
  const current = JSON.parse(bytes(t.descriptorPath)), priorBytes = t.previousDescriptor === null ? null : Buffer.from(t.previousDescriptor, 'base64'), target = priorBytes && JSON.parse(priorBytes);
  if (priorBytes && priorBytes.toString('base64') !== t.previousDescriptor) fail('rollback_previous_bytes');
  let client = rollbackBinding(t, current, target);
  assertNoLifecycleMarkers(t.stateDir);
  const scope = { installRoot: t.installRoot, stateDir: t.stateDir, descriptorPath: t.descriptorPath }, lease = acquireInstallLease(scope); let writes = false;
  try {
    if (hash(bytes(t.descriptorPath)) !== t.appliedDescriptorHash || hash(bytes(t.configPath)) !== t.appliedConfigHash || treeHash(snapshot(t.cepDir)) !== t.appliedCepHash) fail('rollback_baseline_changed');
    client = rollbackBinding(t, current, target);
    assertRuntimeStopped(t.stateDir, { lease, descriptorPath: t.descriptorPath, cepDir: t.cepDir });
    require('../runtime/native-read-disposition').assertRollbackReaderCompatible({ directory: path.join(t.stateDir, 'receiver'), target });
    if (target && (target.nodePath !== process.execPath || target.nodeHash !== hash(fs.readFileSync(process.execPath)))) fail('rollback_node_binding_unsupported');
    if (t.previousCepHash !== treeHash(fs.existsSync(t.backupCep) ? snapshot(t.backupCep) : null)) fail('rollback_backup_mismatch');
    checkpointInstallLease(lease, 'installing');
    // Move only the exact owned bundle. Keep recoverable applied files as evidence.
    writes = true;
    fs.renameSync(t.cepDir, path.join(t.installRoot, 'transactions', t.transactionId + '-applied-cep'));
    if (fs.existsSync(t.backupCep)) fs.renameSync(t.backupCep, t.cepDir);
    for (const [destination, prior] of [[t.descriptorPath, t.previousDescriptor], [client.file, client.previous?.toString('base64') ?? null], [t.configPath, t.previousConfig]]) {
      if (destination === client.file) clientPaths(t.installRoot);
      if (prior === null) { if (destination !== client.file || client.value) fs.unlinkSync(destination); }
      else { durable(destination + '.rollback', Buffer.from(prior, 'base64')); fs.renameSync(destination + '.rollback', destination); }
    }
    const restored = checkedBytes(clientPaths(t.installRoot)), restoredOrigin = originState(current);
    if ((restored?.toString('base64') ?? null) !== (client.previous?.toString('base64') ?? null) || !restoredOrigin.root?.equals(client.origin.root) || !restoredOrigin.anchor?.equals(client.origin.anchor) ||
        (bytes(t.descriptorPath)?.toString('base64') ?? null) !== t.previousDescriptor || (bytes(t.configPath)?.toString('base64') ?? null) !== t.previousConfig || treeHash(snapshot(t.cepDir)) !== t.previousCepHash) fail('rollback_readback_mismatch');
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
      if (!['dry-run', 'apply'].includes(args[0]) || args.length % 2 !== 1 || flags.some(f => !['--package', '--node', '--workspace', '--expected-package-hash', '--runtime'].includes(f)) || new Set(flags).size !== flags.length || !flags.includes('--package') || args[0] === 'apply' && !flags.includes('--expected-package-hash')) fail('usage_install_mode_package_node_expected_hash');
      const pkg = verifyPackage(JSON.parse(fs.readFileSync(get('--package'), 'utf8')));
      if (flags.includes('--expected-package-hash') && (!/^[a-f0-9]{64}$/.test(get('--expected-package-hash')) || pkg.packageHash !== get('--expected-package-hash'))) fail('reviewed_package_hash_mismatch');
      const workspace = sourceWorkspace(flags.includes('--workspace') ? get('--workspace') : undefined);
      const plan = planInstall({ ...defaults(pkg, flags.includes('--node') ? get('--node') : process.execPath, workspace.workspaceRoot), ...(flags.includes('--runtime') ? { runtimeModel: get('--runtime') } : {}) });
      console.log(canonical(args[0] === 'apply' ? applyInstall(plan) : { dryRun: true, ...workspace, packageHash: pkg.packageHash, expectedPackageHash: pkg.packageHash, releaseDir: plan.descriptor.releaseDir, descriptorPath: plan.descriptorPath, stateDir: plan.descriptor.stateDir, cepDir: plan.cepDir, configPath: plan.configPath, nodePath: plan.descriptor.nodePath, nodeVersion: plan.descriptor.nodeVersion, nodeHash: plan.descriptor.nodeHash, baseline: plan.baseline, liveProof: false }));
    }
  } catch (e) { console.error(canonical({ error: e.code || 'install_failed', ...(e.transactionFile ? { transactionFile: e.transactionFile } : {}) })); process.exitCode = 1; }
}
module.exports = { planInstall, assertPreparedInstallPlan, prepareInstallPlan, assertDurablePreparedInstallPlan, applyInstall, rollback, snapshot, configText, checkRelease };
