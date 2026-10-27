'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { hash, canonical, fail } = require('../protocol/json');
const { verifyPackage } = require('./package-installable');
const BUNDLE = 'com.codex.aeagentcore4';
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
  if (!matches.length) return text + (text && !text.endsWith('\n') ? newline : '') + newline + '[mcp_servers.after-effects-core4]' + newline + body;
  const own = matches[0], following = headers.find(h => h.start > own.start);
  return text.slice(0, own.end) + (own.line.endsWith('\n') ? '' : newline) + body + text.slice(following ? following.start : text.length);
}
function planInstall({ pkg, nodePath, installRoot, extensionsDir, configPath, machineId }) {
  verifyPackage(pkg);
  for (const value of [nodePath, installRoot, extensionsDir, configPath]) if (!path.isAbsolute(value)) fail('absolute_install_paths_required');
  if (path.basename(installRoot).toLowerCase() !== 'aeagentcore4' || path.basename(path.join(extensionsDir, BUNDLE)) !== BUNDLE) fail('install_scope');
  const resolvedNode = fs.realpathSync(nodePath); if (resolvedNode !== nodePath) fail('node_path_not_exact');
  const version = execFileSync(nodePath, ['--version'], { encoding: 'utf8', windowsHide: true, env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR } }).trim();
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
  }
  const d = { version: 1, installRoot, installationId: origin.installationId, machineId: origin.machineId, packageHash: pkg.packageHash, releaseDir, stateDir, nodePath, nodeHash: hash(fs.readFileSync(nodePath)), nodeVersion: version, panelToken: crypto.randomBytes(32).toString('hex'), controlToken: crypto.randomBytes(32).toString('hex') };
  const inspection = JSON.parse(Buffer.from(pkg.files['modules/project-inspection/artifact.json'], 'base64'));
  const cep = Object.fromEntries(Object.entries(pkg.files).filter(([f]) => f.startsWith('cep/')).map(([f, data]) => [f.slice(4), data]));
  cep['installation.js'] = Buffer.from('window.Core4Installation=' + canonical({ installationId: d.installationId, packageHash: d.packageHash, panelToken: d.panelToken, executorHash: inspection.executorHash, assetKey: 'project-inspection-v1' }) + ';\n').toString('base64');
  const nextConfig = configText(previousConfig, descriptor, nodePath, path.join(releaseDir, 'runtime/stdio-entry.js'));
  return { pkg, origin, descriptor: d, descriptorPath: descriptor, configPath, nextConfig, cepDir, cep, previousDescriptor, previousConfig, previousCep, baseline: { config: previousConfig ? hash(previousConfig) : null, descriptor: previousDescriptor ? hash(previousDescriptor) : null, cep: treeHash(previousCep) } };
}
function assertBaseline(plan) { if ((bytes(plan.configPath) ? hash(bytes(plan.configPath)) : null) !== plan.baseline.config || (bytes(plan.descriptorPath) ? hash(bytes(plan.descriptorPath)) : null) !== plan.baseline.descriptor || treeHash(snapshot(plan.cepDir)) !== plan.baseline.cep) fail('install_baseline_changed'); }
function assertRuntimeStopped(stateDir) {
  for (const relative of ['broker/broker-owner.lock', 'broker/broker-owner.gate', 'receiver/owner']) if (fs.existsSync(path.join(stateDir, relative))) fail('runtime_state_owned_or_unknown');
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
function applyInstall(plan) {
  assertBaseline(plan);
  const d = plan.descriptor; fs.mkdirSync(d.installRoot, { recursive: true });
  const gate = path.join(d.installRoot, 'install.lock'); const fd = fs.openSync(gate, 'wx');
  let txnFile, txn, switched = false;
  try {
    assertBaseline(plan);
    assertRuntimeStopped(d.stateDir);
    // State is stable across reinstall and rollback; no cleanup/reclaim is performed.
    if (!fs.existsSync(path.join(d.installRoot, 'origin.json'))) {
      durable(path.join(d.installRoot, 'origin.json'), canonical(plan.origin));
      durable(path.join(d.stateDir, 'origin.json'), canonical(plan.origin));
    }
    if (!fs.existsSync(d.releaseDir)) {
      const stage = path.join(d.installRoot, 'releases', '.stage-' + crypto.randomUUID());
      for (const [relative, b64] of Object.entries(plan.pkg.files)) durable(path.join(stage, relative), Buffer.from(b64, 'base64'));
      durable(path.join(stage, 'release.json'), canonical(plan.pkg.release)); checkRelease(stage, plan.pkg.release); fs.renameSync(stage, d.releaseDir);
    }
    checkRelease(d.releaseDir, plan.pkg.release);
    const transactionId = crypto.randomUUID(); txnFile = path.join(d.installRoot, 'transactions', transactionId + '.json');
    const backupCep = path.join(d.installRoot, 'transactions', transactionId + '-cep');
    txn = { version: 1, transactionId, installRoot: d.installRoot, descriptorPath: plan.descriptorPath, configPath: plan.configPath, cepDir: plan.cepDir, backupCep, previousDescriptor: plan.previousDescriptor?.toString('base64') || null, previousConfig: plan.previousConfig?.toString('base64') || null, previousCepHash: treeHash(plan.previousCep), appliedDescriptorHash: hash(canonical(d)), appliedConfigHash: hash(plan.nextConfig), appliedCepHash: treeHash(plan.cep), stateDir: d.stateDir };
    durable(txnFile, canonical(txn));
    // Last CAS before any visible switch. Unknown filesystem outcomes are not retried.
    assertBaseline(plan);
    if (fs.existsSync(plan.cepDir)) fs.renameSync(plan.cepDir, backupCep);
    switched = true;
    restoreTree(plan.cepDir, plan.cep);
    durable(plan.descriptorPath + '.next', canonical(d));
    durable(plan.configPath + '.core4-next', plan.nextConfig);
    fs.renameSync(plan.descriptorPath + '.next', plan.descriptorPath);
    fs.renameSync(plan.configPath + '.core4-next', plan.configPath);
    if (hash(bytes(plan.descriptorPath)) !== txn.appliedDescriptorHash || hash(bytes(plan.configPath)) !== txn.appliedConfigHash || treeHash(snapshot(plan.cepDir)) !== txn.appliedCepHash) fail('install_readback_mismatch');
    return { installed: true, packageHash: d.packageHash, installationId: d.installationId, descriptorPath: plan.descriptorPath, transactionFile: txnFile, stateDir: d.stateDir, requiresPanelOpen: true, requiresMcpReconnect: true, liveProof: false };
  } catch (e) { if (switched) e.transactionFile = txnFile; throw e; }
  finally { fs.closeSync(fd); fs.unlinkSync(gate); }
}
function rollback(file) {
  const t = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (t.version !== 1 || !path.isAbsolute(t.installRoot) || path.basename(t.installRoot).toLowerCase() !== 'aeagentcore4' || t.descriptorPath !== path.join(t.installRoot, 'installation.json') || t.backupCep !== path.join(t.installRoot, 'transactions', t.transactionId + '-cep') || path.basename(t.cepDir) !== BUNDLE || !path.resolve(file).startsWith(path.join(t.installRoot, 'transactions') + path.sep)) fail('rollback_scope');
  if (hash(bytes(t.descriptorPath)) !== t.appliedDescriptorHash || hash(bytes(t.configPath)) !== t.appliedConfigHash || treeHash(snapshot(t.cepDir)) !== t.appliedCepHash) fail('rollback_baseline_changed');
  const gate = path.join(t.installRoot, 'install.lock'), fd = fs.openSync(gate, 'wx');
  try {
    assertRuntimeStopped(t.stateDir);
    if (t.previousCepHash !== treeHash(fs.existsSync(t.backupCep) ? snapshot(t.backupCep) : null)) fail('rollback_backup_mismatch');
    // Move only the exact owned bundle. Keep recoverable applied files as evidence.
    fs.renameSync(t.cepDir, path.join(t.installRoot, 'transactions', t.transactionId + '-applied-cep'));
    if (fs.existsSync(t.backupCep)) fs.renameSync(t.backupCep, t.cepDir);
    for (const [target, prior] of [[t.descriptorPath, t.previousDescriptor], [t.configPath, t.previousConfig]]) {
      if (prior === null) fs.unlinkSync(target);
      else { durable(target + '.rollback', Buffer.from(prior, 'base64')); fs.renameSync(target + '.rollback', target); }
    }
    return { rolledBack: true, transactionId: t.transactionId, statePreserved: true, liveProof: false };
  } finally { fs.closeSync(fd); fs.unlinkSync(gate); }
}
function defaults(pkg, nodePath) { return { pkg, nodePath, installRoot: path.join(process.env.LOCALAPPDATA, 'AEAgentCore4'), extensionsDir: path.join(process.env.APPDATA, 'Adobe/CEP/extensions'), configPath: path.join(process.cwd(), '.codex/config.toml') }; }
if (require.main === module) {
  try {
    const args = process.argv.slice(2), get = flag => args[args.indexOf(flag) + 1];
    if (args[0] === 'rollback' && args.length === 2) console.log(canonical(rollback(path.resolve(args[1]))));
    else {
      const flags = args.slice(1).filter((_, index) => index % 2 === 0);
      if (!['dry-run', 'apply'].includes(args[0]) || args.length % 2 !== 1 || flags.some(f => !['--package', '--node', '--expected-package-hash'].includes(f)) || new Set(flags).size !== flags.length || !flags.includes('--package') || !flags.includes('--node') || args[0] === 'apply' && !flags.includes('--expected-package-hash')) fail('usage_install_mode_package_node_expected_hash');
      const pkg = verifyPackage(JSON.parse(fs.readFileSync(get('--package'), 'utf8')));
      if (flags.includes('--expected-package-hash') && (!/^[a-f0-9]{64}$/.test(get('--expected-package-hash')) || pkg.packageHash !== get('--expected-package-hash'))) fail('reviewed_package_hash_mismatch');
      const plan = planInstall(defaults(pkg, get('--node')));
      console.log(canonical(args[0] === 'apply' ? applyInstall(plan) : { dryRun: true, packageHash: pkg.packageHash, expectedPackageHash: pkg.packageHash, releaseDir: plan.descriptor.releaseDir, descriptorPath: plan.descriptorPath, stateDir: plan.descriptor.stateDir, cepDir: plan.cepDir, configPath: plan.configPath, nodeVersion: plan.descriptor.nodeVersion, nodeHash: plan.descriptor.nodeHash, baseline: plan.baseline, liveProof: false }));
    }
  } catch (e) { console.error(canonical({ error: e.code || 'install_failed', ...(e.transactionFile ? { transactionFile: e.transactionFile } : {}) })); process.exitCode = 1; }
}
module.exports = { planInstall, applyInstall, rollback, snapshot, configText, checkRelease };
