'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
// ONLY builtins are loaded until the entire installed release is verified.
function fail(code) { throw Object.assign(new Error(code), { code }); }
function canonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) fail('invalid_installation_json');
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}
function hash(value) { return crypto.createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : canonical(value)).digest('hex'); }
function verifyRelease(directory, release) {
  const root = path.resolve(directory), expectedFiles = new Set(['release.json']), expectedDirs = new Set(['']);
  for (const relative of Object.keys(release.hashes || {})) {
    if (!/^[A-Za-z0-9_./-]+$/.test(relative) || relative.includes('\\') || relative.split('/').some(p => !p || p === '.' || p === '..') || path.isAbsolute(relative) || relative === 'release.json') fail('release_path');
    expectedFiles.add(relative);
    for (let dir = path.posix.dirname(relative); dir !== '.'; dir = path.posix.dirname(dir)) expectedDirs.add(dir);
  }
  function visit(directory, relative) {
    const stat = fs.lstatSync(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory() || fs.realpathSync(directory) !== directory || !expectedDirs.delete(relative)) fail('release_tree_mismatch');
    for (const item of fs.readdirSync(directory)) {
      const file = path.join(directory, item), rel = relative ? relative + '/' + item : item, child = fs.lstatSync(file);
      if (child.isSymbolicLink() || fs.realpathSync(file) !== file) fail('release_tree_mismatch');
      if (child.isDirectory()) visit(file, rel);
      else if (!child.isFile() || !expectedFiles.delete(rel)) fail('release_tree_mismatch');
      else if (rel === 'release.json' ? fs.readFileSync(file, 'utf8') !== canonical(release) : hash(fs.readFileSync(file)) !== release.hashes[rel]) fail('installed_release_bytes');
    }
  }
  visit(root, ''); if (expectedFiles.size || expectedDirs.size) fail('release_tree_mismatch');
}
function verifyInstallation(file, { verifyNode = true } = {}) {
  if (!path.isAbsolute(file)) fail('absolute_descriptor_required');
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (d.version !== 1 || !path.isAbsolute(d.releaseDir) || !path.isAbsolute(d.stateDir) || !path.isAbsolute(d.nodePath) || !/^[a-f0-9]{64}$/.test(d.nodeHash) || !d.installationId || d.panelToken === d.controlToken || !/^[a-f0-9]{64}$/.test(d.panelToken) || !/^[a-f0-9]{64}$/.test(d.controlToken)) fail('installation_descriptor');
  const origin = JSON.parse(fs.readFileSync(path.join(d.installRoot, 'origin.json'), 'utf8'));
  const anchor = JSON.parse(fs.readFileSync(path.join(d.stateDir, 'origin.json'), 'utf8'));
  if (canonical(origin) !== canonical(anchor) || origin.installationId !== d.installationId || origin.machineId !== d.machineId) fail('installation_origin_mismatch');
  if (verifyNode && (path.resolve(process.execPath).toLowerCase() !== path.resolve(d.nodePath).toLowerCase() || hash(fs.readFileSync(d.nodePath)) !== d.nodeHash || Number(process.versions.node.split('.')[0]) < 20)) fail('external_node_mismatch');
  const manifest = JSON.parse(fs.readFileSync(path.join(d.releaseDir, 'release.json'), 'utf8'));
  if (hash(manifest) !== d.packageHash) fail('installation_package_hash');
  verifyRelease(d.releaseDir, manifest); return Object.freeze(d);
}
// Private reviewed operator bootstrap. No runtime imports, grants or replay.
const net = require('node:net');
const { execFile } = require('node:child_process');
function pidState(pid) { try { process.kill(pid, 0); return 'alive'; } catch (e) { return e.code === 'ESRCH' ? 'dead' : 'unknown'; } }
function portState() {
  return new Promise(resolve => { const socket = net.connect({ host: '127.0.0.1', port: 3457 }); let done = false; const finish = value => { if (!done) { done = true; socket.destroy(); resolve(value); } }; socket.once('connect', () => finish('active')); socket.once('error', e => finish(e.code === 'ECONNREFUSED' ? 'absent' : 'unknown')); socket.setTimeout(500, () => finish('unknown')); });
}
const PROCESS_PROBE = '$ErrorActionPreference="Stop";[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false);$matches=@();foreach($p in @(Get-CimInstance Win32_Process -Filter "Name = \'node.exe\'")){if($p.ProcessId -eq [int]$env:CORE4_RETIRE_SELF_PID){continue};if(-not $p.CommandLine){throw "process_inventory_unavailable"};$line=$p.CommandLine.Replace("/","\\");if($line.IndexOf($env:CORE4_RETIRE_DESCRIPTOR,[StringComparison]::OrdinalIgnoreCase) -ge 0 -or $line.IndexOf($env:CORE4_RETIRE_INSTALL_ROOT,[StringComparison]::OrdinalIgnoreCase) -ge 0){$matches+=[int]$p.ProcessId}};[ordered]@{version=1;matchedPids=$matches;observedAt=[DateTime]::UtcNow.ToString("o")}|ConvertTo-Json -Depth 3 -Compress';
function processesForInstallation(installation, descriptor) {
  if (process.platform !== 'win32') fail('windows_process_probe_required');
  const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'TEMP', 'TMP'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
  Object.assign(env, { CORE4_RETIRE_SELF_PID: String(process.pid), CORE4_RETIRE_DESCRIPTOR: descriptor.replace(/\//g, '\\'), CORE4_RETIRE_INSTALL_ROOT: installation.installRoot.replace(/\//g, '\\') });
  return new Promise((resolve, reject) => execFile(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', PROCESS_PROBE], { env, windowsHide: true, timeout: 4000, maxBuffer: 16384 }, (error, stdout) => { if (error) { reject(Object.assign(new Error('process_probe_unavailable'), { code: 'process_probe_unavailable' })); return; } try { resolve(JSON.parse(stdout.replace(/^\uFEFF/, '').trim())); } catch { reject(Object.assign(new Error('process_probe_invalid'), { code: 'process_probe_invalid' })); } }));
}
function createRecovery({ io = fs, probePid = pidState, probeProcesses = processesForInstallation, probePort = portState } = {}) {
  function entryExists(file) { try { io.lstatSync(file); return true; } catch (e) { if (e.code === 'ENOENT') return false; fail('recovery_absence_unknown'); } }
  function exact(value, keys) { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k))) fail('recovery_schema'); }
  function safe(file, { missing = false, directory = false } = {}) {
    const absolute = path.resolve(file), parsed = path.parse(absolute); let cursor = parsed.root;
    for (const part of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
      cursor = path.join(cursor, part);
      if (!io.existsSync(cursor)) { if (missing && cursor === absolute) return false; fail('recovery_path_missing'); }
      const stat = io.lstatSync(cursor); if (stat.isSymbolicLink() || io.realpathSync(cursor) !== cursor || cursor !== absolute && !stat.isDirectory()) fail('recovery_symlink_or_path');
    }
    const stat = io.lstatSync(absolute); if (directory ? !stat.isDirectory() : !stat.isFile()) fail('recovery_path_type'); return true;
  }
  function read(file) { safe(file); const value = io.readFileSync(file); if (value.length > 262144) fail('recovery_file_too_large'); return value; }
  function json(file) { const bytes = read(file); if (!Buffer.from(bytes.toString('utf8')).equals(bytes)) fail('recovery_invalid_utf8'); return { bytes, value: JSON.parse(bytes.toString('utf8')) }; }
  function pathsFor(installation, descriptor) {
    const installRoot = path.resolve(installation.installRoot), state = path.join(installRoot, 'state', 'production');
    if (path.resolve(descriptor) !== path.join(installRoot, 'installation.json') || installation.stateDir !== state || installation.releaseDir !== path.join(installRoot, 'releases', installation.packageHash)) fail('recovery_installation_scope');
    safe(installRoot, { directory: true }); safe(state, { directory: true }); safe(path.join(state, 'broker'), { directory: true }); safe(path.join(state, 'receiver'), { directory: true });
    return { installRoot, state, descriptor: path.resolve(descriptor), brokerOwner: path.join(state, 'broker/broker-owner.lock'), receiverOwner: path.join(state, 'receiver/owner'), journal: path.join(state, 'receiver/completions.ndjson'), ledger: path.join(state, 'broker/ledger.ndjson'), installGate: path.join(installRoot, 'install.lock'), brokerGate: path.join(state, 'broker/broker-owner.gate'), origin: path.join(installRoot, 'origin.json'), anchor: path.join(state, 'origin.json') };
  }
  function snapshot(descriptor, witnessFile, ownedGates) {
    const installation = verifyInstallation(path.resolve(descriptor)), p = pathsFor(installation, descriptor);
    for (const gate of [p.installGate, p.brokerGate]) {
      if (ownedGates?.has(gate)) { if (!read(gate).equals(ownedGates.get(gate))) fail('recovery_gate_changed'); }
      else if (entryExists(gate)) fail('recovery_gate_unavailable');
    }
    if (entryExists(p.ledger)) fail('recovery_requires_absent_ledger');
    const owner = json(p.brokerOwner), receiver = read(p.receiverOwner), journal = read(p.journal), witness = json(path.resolve(witnessFile));
    exact(owner.value, ['pid', 'token']);
    if (!Number.isSafeInteger(owner.value.pid) || owner.value.pid < 1 || typeof owner.value.token !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(owner.value.token) || receiver.length !== 0) fail('recovery_owner_unknown');
    const text = journal.toString('utf8'); if (!Buffer.from(text).equals(journal) || !text.endsWith('\n') || text.split('\n').length !== 2) fail('recovery_requires_single_origin');
    const record = JSON.parse(text.slice(0, -1)); exact(record, ['type', 'identity', 'seq', 'previousHash', 'recordHash']); const { recordHash, ...body } = record;
    if (record.type !== 'origin' || typeof record.identity !== 'string' || !record.identity || record.seq !== 1 || record.previousHash !== 'origin' || hash(body) !== recordHash) fail('recovery_requires_single_origin');
    const w = witness.value; exact(w, ['version', 'installationId', 'descriptorHash', 'brokerOwnerHash', 'receiverOwnerHash', 'managedProcess', 'rootObservationDigest']); exact(w.managedProcess, ['pid', 'nodePath', 'entryPath', 'descriptorPath', 'launchUtc', 'endedByUtc']);
    if (w.version !== 1 || w.installationId !== installation.installationId || w.descriptorHash !== hash(read(p.descriptor)) || w.brokerOwnerHash !== hash(owner.bytes) || w.receiverOwnerHash !== hash(receiver) || !/^[a-f0-9]{64}$/.test(w.rootObservationDigest) || w.managedProcess.pid !== owner.value.pid || w.managedProcess.nodePath !== installation.nodePath || w.managedProcess.entryPath !== path.join(installation.releaseDir, 'runtime/stdio-entry.js') || w.managedProcess.descriptorPath !== p.descriptor || !Number.isFinite(Date.parse(w.managedProcess.launchUtc)) || !Number.isFinite(Date.parse(w.managedProcess.endedByUtc)) || Date.parse(w.managedProcess.launchUtc) > Date.parse(w.managedProcess.endedByUtc) || Date.parse(w.managedProcess.endedByUtc) > Date.now()) fail('recovery_provenance_mismatch');
    const stable = { version: 1, reason: 'zero-dispatch-owner-retirement', installationId: installation.installationId, packageHash: installation.packageHash, descriptorPath: p.descriptor, descriptorHash: hash(read(p.descriptor)), ownerPid: owner.value.pid, brokerOwnerHash: hash(owner.bytes), receiverOwnerHash: hash(receiver), journalHash: hash(journal), receiverStoreIdentity: record.identity, originHash: hash(read(p.origin)), anchorHash: hash(read(p.anchor)), witnessHash: hash(witness.bytes), operatorHash: hash(io.readFileSync(__filename)), ledger: 'absent' };
    return { installation, paths: p, stable, witness: w };
  }
  async function observe(state) {
    if (await probePid(state.stable.ownerPid) !== 'dead') fail('recovery_pid_not_provably_dead');
    const observation = await probeProcesses(state.installation, state.paths.descriptor);
    if (!observation || observation.version !== 1 || !Array.isArray(observation.matchedPids) || observation.matchedPids.length || !Number.isFinite(Date.parse(observation.observedAt)) || Math.abs(Date.now() - Date.parse(observation.observedAt)) > 5000) fail('recovery_managed_process_not_absent');
    if (await probePort() !== 'absent') fail('recovery_port_not_absent');
  }
  async function inspect({ descriptor, witness, ownedGates } = {}) {
    const state = snapshot(descriptor, witness, ownedGates); await observe(state); const final = snapshot(descriptor, witness, ownedGates);
    if (canonical(state.stable) !== canonical(final.stable)) fail('recovery_proof_changed');
    const proof = { ...final.stable, pidObservation: 'ESRCH', managedProcesses: 'observed-none', port3457: 'observed-absent' };
    return { proof, proofHash: hash(proof), inspectionOnly: true, mutationGrant: false };
  }
  function durable(file, data) { const fd = io.openSync(file, 'wx'); try { if (io.writeSync(fd, data) !== Buffer.byteLength(data)) fail('recovery_short_write'); io.fsyncSync(fd); } finally { io.closeSync(fd); } }
  async function apply({ descriptor, witness, expectedProofHash } = {}) {
    if (!/^[a-f0-9]{64}$/.test(expectedProofHash)) fail('recovery_expected_proof_required');
    const initial = snapshot(descriptor, witness), p = initial.paths, ownedGates = new Map(); let installFd, brokerFd, installHealthy = false, brokerHealthy = false, keepGates = false, transaction;
    function gate(file) { const bytes = Buffer.from('zero-dispatch-retirement-' + crypto.randomUUID()); const fd = io.openSync(file, 'wx'); try { if (io.writeSync(fd, bytes) !== bytes.length) fail('recovery_gate_short_write'); io.fsyncSync(fd); if (!io.readFileSync(file).equals(bytes)) fail('recovery_gate_changed'); ownedGates.set(file, bytes); return fd; } catch (e) { io.closeSync(fd); keepGates = true; throw e; } }
    try {
      installFd = gate(p.installGate); installHealthy = true; brokerFd = gate(p.brokerGate); brokerHealthy = true;
      const current = await inspect({ descriptor, witness, ownedGates }); if (current.proofHash !== expectedProofHash) fail('recovery_proof_changed');
      const transactions = path.join(p.installRoot, 'transactions'); safe(transactions, { directory: true });
      transaction = path.join(transactions, crypto.randomUUID() + '-zero-dispatch-retirement'); io.mkdirSync(transaction); safe(transaction, { directory: true });
      keepGates = true;
      durable(path.join(transaction, 'intent.json'), canonical({ version: 1, reason: 'zero-dispatch-owner-retirement', proof: current.proof, proofHash: current.proofHash, provenance: initial.witness, originalPaths: { brokerOwner: p.brokerOwner, receiverOwner: p.receiverOwner }, state: 'rename-not-yet-certified' }));
      const archiveBroker = path.join(transaction, 'broker-owner.lock'), archiveReceiver = path.join(transaction, 'receiver-owner');
      if (io.lstatSync(p.brokerOwner).dev !== io.lstatSync(transaction).dev || io.lstatSync(p.receiverOwner).dev !== io.lstatSync(transaction).dev) fail('recovery_archive_filesystem');
      io.renameSync(p.brokerOwner, archiveBroker); io.renameSync(p.receiverOwner, archiveReceiver);
      for (const [file, expected] of [[archiveBroker, current.proof.brokerOwnerHash], [archiveReceiver, current.proof.receiverOwnerHash]]) { safe(file); const fd = io.openSync(file, 'r+'); try { io.fsyncSync(fd); } finally { io.closeSync(fd); } if (hash(read(file)) !== expected) fail('recovery_archive_readback'); }
      if (entryExists(p.brokerOwner) || entryExists(p.receiverOwner) || entryExists(p.ledger) || hash(read(p.journal)) !== current.proof.journalHash || hash(read(p.origin)) !== current.proof.originHash || hash(read(p.anchor)) !== current.proof.anchorHash || hash(read(p.descriptor)) !== current.proof.descriptorHash) fail('recovery_readback_changed');
      durable(path.join(transaction, 'completion.json'), canonical({ version: 1, reason: 'zero-dispatch-owner-retirement', proofHash: current.proofHash, archived: [{ name: 'broker-owner.lock', hash: current.proof.brokerOwnerHash }, { name: 'receiver-owner', hash: current.proof.receiverOwnerHash }], receiverStoreIdentity: current.proof.receiverStoreIdentity, journalHash: current.proof.journalHash, ledger: 'absent', state: 'completed' }));
      keepGates = false; return { retired: true, proofHash: current.proofHash, transaction, receiverStoreIdentity: current.proof.receiverStoreIdentity, journalUnchanged: true, ledger: 'absent', mutationGrant: false };
    } catch (e) { if (transaction) e.transaction = transaction; throw e; }
    finally {
      for (const [file, fd, healthy] of [[p.brokerGate, brokerFd, brokerHealthy], [p.installGate, installFd, installHealthy]]) if (fd !== undefined) { io.closeSync(fd); if (!keepGates && healthy) { if (!io.readFileSync(file).equals(ownedGates.get(file))) fail('recovery_gate_changed'); io.unlinkSync(file); } }
    }
  }
  return Object.freeze({ inspect, apply });
}
if (require.main === module) {
  const args = process.argv.slice(2), flags = args.slice(1).filter((_, index) => index % 2 === 0), get = flag => args[args.indexOf(flag) + 1];
  if (!['inspect', 'apply'].includes(args[0]) || args.length % 2 !== 1 || new Set(flags).size !== flags.length || flags.some(flag => !['--installation', '--witness', '--expected-proof-hash'].includes(flag)) || !flags.includes('--installation') || !flags.includes('--witness') || args[0] === 'apply' && !flags.includes('--expected-proof-hash')) { process.stderr.write('recover-zero-dispatch-owner inspect|apply --installation ABS_DESCRIPTOR --witness ABS_ROOT_WITNESS [--expected-proof-hash HASH]\n'); process.exitCode = 2; }
  else {
    const recovery = createRecovery(), operation = args[0] === 'inspect' ? recovery.inspect : recovery.apply;
    operation({ descriptor: get('--installation'), witness: get('--witness'), expectedProofHash: get('--expected-proof-hash') }).then(result => console.log(canonical(result))).catch(e => { process.stderr.write(canonical({ error: e.code || 'zero_dispatch_retirement_failed', ...(e.transaction ? { transaction: e.transaction } : {}) }) + '\n'); process.exitCode = 1; });
  }
}
module.exports = { createRecovery, processesForInstallation, pidState, portState, PROCESS_PROBE };
