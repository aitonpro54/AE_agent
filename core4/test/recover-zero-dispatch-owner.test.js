'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { hash, canonical } = require('../protocol/json');
const { buildPackage } = require('../tools/package-installable');
const { planInstall, applyInstall } = require('../tools/install-core4');
const { createRecovery, PROCESS_PROBE } = require('../tools/recover-zero-dispatch-owner');
function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'core4-zero-dispatch-'));
  const plan = planInstall({ pkg: buildPackage(), nodePath: fs.realpathSync(process.execPath), installRoot: path.join(directory, 'AEAgentCore4'), extensionsDir: path.join(directory, 'extensions'), configPath: path.join(directory, 'project/.codex/config.toml'), machineId: 'explicit-offline-fixture-machine' });
  const installed = applyInstall(plan), descriptor = installed.descriptorPath, d = JSON.parse(fs.readFileSync(descriptor)), broker = path.join(d.stateDir, 'broker'), receiver = path.join(d.stateDir, 'receiver'); fs.mkdirSync(broker); fs.mkdirSync(receiver);
  const ownerFile = path.join(broker, 'broker-owner.lock'), receiverOwner = path.join(receiver, 'owner'), journal = path.join(receiver, 'completions.ndjson'), ledger = path.join(broker, 'ledger.ndjson');
  const ownerBytes = Buffer.from(JSON.stringify({ pid: 123456789, token: '00000000-1111-4222-8333-444444444444' })); fs.writeFileSync(ownerFile, ownerBytes); fs.writeFileSync(receiverOwner, '');
  const origin = { type: 'origin', identity: 'receiver-store-explicit-fixture', seq: 1, previousHash: 'origin' }; fs.writeFileSync(journal, canonical({ ...origin, recordHash: hash(origin) }) + '\n');
  const witness = path.join(directory, 'root-witness.json');
  const value = { version: 1, installationId: d.installationId, descriptorHash: hash(fs.readFileSync(descriptor)), brokerOwnerHash: hash(ownerBytes), receiverOwnerHash: hash(Buffer.alloc(0)), managedProcess: { pid: 123456789, nodePath: d.nodePath, entryPath: path.join(d.releaseDir, 'runtime/stdio-entry.js'), descriptorPath: descriptor, launchUtc: new Date(Date.now() - 60000).toISOString(), endedByUtc: new Date(Date.now() - 30000).toISOString() }, rootObservationDigest: 'a'.repeat(64) }; fs.writeFileSync(witness, canonical(value));
  const probes = { probePid: () => 'dead', probeProcesses: async () => ({ version: 1, matchedPids: [], observedAt: new Date().toISOString() }), probePort: async () => 'absent' };
  return { directory, descriptor, d, witness, witnessValue: value, ownerFile, ownerBytes, receiverOwner, journal, ledger, broker, receiver, probes, installGate: path.join(d.installRoot, 'install.lock'), brokerGate: path.join(broker, 'broker-owner.gate') };
}
test('zero-dispatch recovery inspect is pure, apply archives only exact two markers and preserves journal/origins/store identity', async () => {
  const f = fixture(), recovery = createRecovery(f.probes), journal = fs.readFileSync(f.journal), origin = fs.readFileSync(path.join(f.d.installRoot, 'origin.json')), anchor = fs.readFileSync(path.join(f.d.stateDir, 'origin.json'));
  const beforeTransactions = fs.readdirSync(path.join(f.d.installRoot, 'transactions')); const inspected = await recovery.inspect(f); assert.equal(inspected.inspectionOnly, true); assert.equal(fs.existsSync(f.ownerFile), true); assert.equal(fs.existsSync(f.receiverOwner), true); assert.deepEqual(fs.readdirSync(path.join(f.d.installRoot, 'transactions')), beforeTransactions);
  const repeated = await recovery.inspect(f); assert.equal(repeated.proofHash, inspected.proofHash, 'volatile times do not change the proof hash');
  const result = await recovery.apply({ ...f, expectedProofHash: inspected.proofHash }); assert.equal(result.retired, true); assert.equal(result.mutationGrant, false); assert.equal(result.receiverStoreIdentity, 'receiver-store-explicit-fixture');
  assert.equal(fs.existsSync(f.ownerFile), false); assert.equal(fs.existsSync(f.receiverOwner), false); assert.equal(fs.existsSync(f.ledger), false); assert.equal(fs.existsSync(f.installGate), false); assert.equal(fs.existsSync(f.brokerGate), false);
  assert.ok(fs.readFileSync(path.join(result.transaction, 'broker-owner.lock')).equals(f.ownerBytes)); assert.equal(fs.statSync(path.join(result.transaction, 'receiver-owner')).size, 0);
  assert.ok(fs.readFileSync(f.journal).equals(journal)); assert.ok(fs.readFileSync(path.join(f.d.installRoot, 'origin.json')).equals(origin)); assert.ok(fs.readFileSync(path.join(f.d.stateDir, 'origin.json')).equals(anchor));
  const completion = JSON.parse(fs.readFileSync(path.join(result.transaction, 'completion.json'))); assert.equal(completion.state, 'completed'); assert.equal(completion.ledger, 'absent');
});
test('zero-dispatch recovery refuses live/reused/unknown owner PID, managed process, active/unknown port and stale process observation', async () => {
  const f = fixture();
  const cases = [
    [{ probePid: () => 'alive' }, 'recovery_pid_not_provably_dead'], [{ probePid: () => 'unknown' }, 'recovery_pid_not_provably_dead'],
    [{ probeProcesses: async () => ({ version: 1, matchedPids: [42], observedAt: new Date().toISOString() }) }, 'recovery_managed_process_not_absent'],
    [{ probeProcesses: async () => ({ version: 1, matchedPids: [], observedAt: new Date(Date.now() - 6000).toISOString() }) }, 'recovery_managed_process_not_absent'],
    [{ probePort: async () => 'active' }, 'recovery_port_not_absent'], [{ probePort: async () => 'unknown' }, 'recovery_port_not_absent']
  ];
  for (const [override, code] of cases) { await assert.rejects(createRecovery({ ...f.probes, ...override }).inspect(f), new RegExp(code)); assert.ok(fs.readFileSync(f.ownerFile).equals(f.ownerBytes)); assert.equal(fs.statSync(f.receiverOwner).size, 0); }
});
test('zero-dispatch recovery rejects any ledger, begin/torn/hash-bad receiver journal, nonempty marker and provenance mismatch', async () => {
  const f = fixture(), journal = fs.readFileSync(f.journal), recovery = createRecovery(f.probes);
  fs.writeFileSync(f.ledger, ''); await assert.rejects(recovery.inspect(f), /recovery_requires_absent_ledger/); fs.unlinkSync(f.ledger);
  for (const bad of [journal.toString() + '{"type":"begin"}\n', journal.toString().trimEnd(), journal.toString().replace('receiver-store-explicit-fixture', 'receiver-store-tampered'), journal.toString() + '\n']) { fs.writeFileSync(f.journal, bad); await assert.rejects(recovery.inspect(f), /recovery_requires_single_origin/); }
  fs.writeFileSync(f.journal, journal); fs.writeFileSync(f.receiverOwner, 'unknown'); await assert.rejects(recovery.inspect(f), /recovery_owner_unknown/); fs.writeFileSync(f.receiverOwner, '');
  fs.writeFileSync(f.witness, canonical({ ...f.witnessValue, brokerOwnerHash: 'b'.repeat(64) })); await assert.rejects(recovery.inspect(f), /recovery_provenance_mismatch/);
  assert.ok(fs.readFileSync(f.ownerFile).equals(f.ownerBytes));
});
test('zero-dispatch recovery proof CAS detects changed bytes and gates without moving markers', async () => {
  const f = fixture(), recovery = createRecovery(f.probes), inspected = await recovery.inspect(f);
  await assert.rejects(recovery.apply({ ...f, expectedProofHash: 'c'.repeat(64) }), /recovery_proof_changed/); assert.equal(fs.existsSync(f.installGate), false); assert.equal(fs.existsSync(f.brokerGate), false);
  fs.writeFileSync(f.brokerGate, 'unknown-existing-gate'); await assert.rejects(recovery.apply({ ...f, expectedProofHash: inspected.proofHash }), /recovery_gate_unavailable/); assert.equal(fs.readFileSync(f.brokerGate, 'utf8'), 'unknown-existing-gate'); fs.unlinkSync(f.brokerGate);
  let calls = 0; const changing = createRecovery({ ...f.probes, probeProcesses: async () => { if (++calls === 1) fs.appendFileSync(f.journal, '\n'); return { version: 1, matchedPids: [], observedAt: new Date().toISOString() }; } });
  await assert.rejects(changing.apply({ ...f, expectedProofHash: inspected.proofHash }), /recovery_requires_single_origin/); assert.equal(fs.existsSync(f.installGate), false); assert.equal(fs.existsSync(f.brokerGate), false); assert.ok(fs.readFileSync(f.ownerFile).equals(f.ownerBytes));
});
test('zero-dispatch recovery rejects dangling ledger entry as present before any owner marker move', async () => {
  const f = fixture(), recovery = createRecovery(f.probes);
  fs.symlinkSync(path.join(f.directory, 'missing-ledger-target'), f.ledger, process.platform === 'win32' ? 'junction' : 'file');
  assert.equal(fs.existsSync(f.ledger), false); assert.equal(fs.lstatSync(f.ledger).isSymbolicLink(), true);
  await assert.rejects(recovery.inspect(f), /recovery_requires_absent_ledger/);
  await assert.rejects(recovery.apply({ ...f, expectedProofHash: 'b'.repeat(64) }), /recovery_requires_absent_ledger/);
  assert.ok(fs.readFileSync(f.ownerFile).equals(f.ownerBytes)); assert.equal(fs.statSync(f.receiverOwner).size, 0); assert.equal(fs.existsSync(f.installGate), false); assert.equal(fs.existsSync(f.brokerGate), false);
});
test('zero-dispatch recovery partial second rename retains both gates and transaction, no automatic retry/rollback', async () => {
  const f = fixture(), normal = createRecovery(f.probes), proof = await normal.inspect(f), io = Object.create(fs); let renames = 0;
  io.renameSync = (from, to) => { if (++renames === 2) throw Object.assign(new Error('injected second rename failure'), { code: 'EIO' }); return fs.renameSync(from, to); };
  const recovery = createRecovery({ ...f.probes, io }); let transaction;
  await assert.rejects(recovery.apply({ ...f, expectedProofHash: proof.proofHash }), error => { transaction = error.transaction; return error.code === 'EIO'; });
  assert.equal(renames, 2); assert.equal(fs.existsSync(f.ownerFile), false); assert.equal(fs.existsSync(f.receiverOwner), true); assert.equal(fs.existsSync(f.installGate), true); assert.equal(fs.existsSync(f.brokerGate), true); assert.equal(fs.existsSync(path.join(transaction, 'intent.json')), true); assert.equal(fs.existsSync(path.join(transaction, 'completion.json')), false);
  await assert.rejects(normal.inspect(f), /recovery_gate_unavailable/); assert.equal(fs.existsSync(f.ledger), false);
});
test('zero-dispatch recovery rejects junction state and unverified dependency sentinel before any imports', async () => {
  const f = fixture(), target = path.join(f.directory, 'receiver-junction-target'); assert.ok(path.resolve(target).startsWith(path.resolve(f.directory) + path.sep)); assert.ok(path.resolve(f.receiver).startsWith(path.resolve(f.directory) + path.sep)); fs.renameSync(f.receiver, target); fs.symlinkSync(target, f.receiver, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(createRecovery(f.probes).inspect(f), /recovery_symlink_or_path/);
  const sentinel = path.join(f.directory, 'UNVERIFIED-RECOVERY-DEPENDENCY'), shadow = path.join(f.d.releaseDir, 'core/broker'); fs.writeFileSync(shadow, 'require("node:fs").writeFileSync(' + JSON.stringify(sentinel) + ',"executed");');
  const result = spawnSync(process.execPath, [path.resolve(__dirname, '../tools/recover-zero-dispatch-owner.js'), 'inspect', '--installation', f.descriptor, '--witness', f.witness], { encoding: 'utf8', windowsHide: true, timeout: 5000 }); assert.equal(result.status, 1); assert.match(result.stderr, /release_tree_mismatch/); assert.equal(fs.existsSync(sentinel), false);
});
test('zero-dispatch Windows inventory probe is fixed data-only script, emits no command lines; package excludes operator recovery', () => {
  assert.ok(PROCESS_PROBE.includes('Get-CimInstance Win32_Process')); assert.ok(PROCESS_PROBE.includes('matchedPids')); assert.ok(!PROCESS_PROBE.includes('CommandLine=$')); assert.ok(!PROCESS_PROBE.includes('Invoke-Expression'));
  const pkg = buildPackage(); assert.ok(!Object.keys(pkg.files).some(file => /recover-zero-dispatch|recovery/.test(file)));
});
