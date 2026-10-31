'use strict';
// Fixed, read-only installed preflight. Only exclusive evidence/witness writes.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const out = __dirname, repo = path.resolve(out, '../../../..');
const meta = JSON.parse(fs.readFileSync(path.join(out, 'official-distribution.json')));
const descriptorPath = 'C:\\Users\\Ant\\AppData\\Local\\AEAgentCore4\\installation.json';
require(path.join(meta.output, 'tools/standalone-installer')).verifyStandalone(meta.output, meta.distributionHash);
const d = require(path.join(meta.output, 'tools/maintain-owner')).verifyOwnerInstallation(descriptorPath, meta.packageHash);
const { canonical, hash } = require(path.join(meta.output, 'protocol/json'));
const check = (ok, code) => { if (!ok) throw Error(code); };
const old = JSON.parse(fs.readFileSync(path.join(out, '../OWNERPREREADY/installed-readback.json')));
const proof = JSON.parse(fs.readFileSync(path.join(out, 'configured-preflight.json')));
const status = JSON.parse(fs.readFileSync(path.join(out, 'pre-stop-status.json'))).status;
check(status.ready && status.pid === 6716 && status.installation.packageHash === d.packageHash && status.attachmentOwner.mode === 'idle' && status.attachmentOwner.holderClientId === null && status.attachmentOwner.accepted === 0 && !status.attachmentOwner.pending && !status.physical.pending && !status.physical.unknown && !status.physical.storeFault && !status.ledgerFault && !status.ownershipFault && status.unresolved.length === 0 && !status.worker.pending && status.maintenance.phase === 'running', 'configured_preflight_not_idle');
const seen = new Map();
function read(file) {
  if (!fs.existsSync(file)) { seen.set(file, null); return null; }
  const a = fs.lstatSync(file, { bigint: true }); check(a.isFile() && !a.isSymbolicLink(), 'non_plain_file');
  const bytes = fs.readFileSync(file), b = fs.lstatSync(file, { bigint: true });
  check(['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].every(k => a[k] === b[k]), 'read_changed');
  seen.set(file, { hash: hash(bytes), stat: b }); return bytes;
}
const files = { descriptor: descriptorPath, client: path.join(d.installRoot, 'core-client.json'), config: path.join(repo, '.codex/config.toml'), rootOrigin: path.join(d.installRoot, 'origin.json'), anchorOrigin: path.join(d.stateDir, 'origin.json'), adoption: path.join(d.stateDir, 'host-adoption.json'), journal: path.join(d.stateDir, 'receiver/completions.ndjson'), ledger: path.join(d.stateDir, 'broker/ledger.ndjson') };
const data = Object.fromEntries(Object.entries(files).map(([name, file]) => [name, read(file)]));
const hashes = Object.fromEntries(Object.entries(data).map(([name, bytes]) => [name, bytes === null ? null : hash(bytes)]));
for (const [name, key] of Object.entries({ descriptor: 'descriptorHash', config: 'configHash', rootOrigin: 'rootOriginHash', anchorOrigin: 'anchorOriginHash', adoption: 'hostAdoptionHash' })) check(hashes[name] === old[key], name + '_changed');
check(data.ledger === null, 'unexpected_ledger');
const key = crypto.createHmac('sha256', Buffer.from(d.panelToken, 'hex')).update('ae-core4/lifecycle-key/v1\0').update(Buffer.from(d.controlToken, 'hex')).digest();
function sealed(bytes) { const v = JSON.parse(bytes); check(canonical(v) === bytes.toString('utf8'), 'noncanonical'); const mac = crypto.createHmac('sha256', key).update('ae-core4/lifecycle-record/v1\0' + canonical(v.body)).digest('hex'); check(v.mac === mac && v.body.installationId === d.installationId && v.body.machineId === d.machineId && v.body.descriptorHash === hashes.descriptor, 'seal_or_binding'); return v.body; }
const owner = sealed(read(path.join(d.stateDir, 'runtime-owner.json')));
check(owner.scope.pid === status.pid && owner.scope.birthTicks === status.lifecycle.birthTicks && owner.scope.bootId === status.lifecycle.processBootId && owner.phase === 'active', 'owner_binding');
const lines = data.journal.toString('utf8').trimEnd().split('\n');
const prefix = count => hash(Buffer.from(lines.slice(0, count).join('\n') + '\n'));
check(prefix(16) === old.original16EventsHash && prefix(18) === old.journalHash && prefix(20) === '262a093495e4c789e5465e592a47c74eec82edb31a8215e37327488af37f574c', 'historical_prefix_changed');
const complete = JSON.parse(lines.at(-1)), begin = JSON.parse(lines.at(-2));
check(begin.type === 'begin' && complete.type === 'complete' && begin.commandId === proof.loadedProject.originalBinding.commandId && complete.commandId === begin.commandId && canonical(complete.response.result) === canonical(proof.loadedProject.observation), 'configured_observation_binding');
const receiver = require(path.join(meta.output, 'runtime/recovery-inspection')).inspectReceiverHistory(data.journal, { descriptorPath });
check(receiver.settled && receiver.unresolved.length === 0, 'history_unsettled');
const gates = { maintenance: path.join(d.stateDir, 'runtime-maintenance.json'), install: path.join(d.installRoot, 'install.lock'), broker: path.join(d.stateDir, 'broker/broker-owner.gate') };
for (const file of Object.values(gates)) check(read(file) === null, 'gate_present');
const projectPath = proof.loadedProject.observation.target.projectId;
check(proof.loadedProject.authority === false && proof.loadedProject.continuity === false && projectPath === path.join(repo, 'snapshots/titles-product/20261030/live/Titles-T2-test.aep'), 'project_selection');
const aep = read(projectPath), aepStat = seen.get(projectPath).stat;
check(aep.length === 33557830 && hash(aep) === 'e3b249894cbd602c44483b12b3847e97fa23c358c429687755f88e90d5b9f170', 'test_copy_changed');
(async () => {
  const provider = require(path.join(meta.output, 'runtime/windows-reservation-provider'));
  const observation = await provider.probeWindows(), host = provider.hostIdentity(observation);
  check(host.machineId === d.machineId && host.aePid === 26308 && host.aeProcessBirth === '2026-10-31T10:32:49.0521480Z' && observation.endpoints.every(e => e.state === 'observed-absent'), 'host_or_endpoint_changed');
  const process = await require(path.join(meta.output, 'runtime/windows-owner-process')).observeOwnerProcess(owner.scope.pid);
  check(process.birthTicks === owner.scope.birthTicks, 'owner_process_changed');
  for (const [file, before] of seen) { if (before === null) { check(!fs.existsSync(file), 'absent_appeared'); continue; } const after = fs.lstatSync(file, { bigint: true }); check(['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].every(k => before.stat[k] === after[k]) && hash(fs.readFileSync(file)) === before.hash, 'preflight_changed'); }
  const witness = { installationId: d.installationId, machineId: d.machineId, host, allowedProject: projectPath, rootObservationDigest: hash(proof.loadedProject) };
  const witnessBytes = Buffer.from(canonical(witness)); check(witnessBytes.length <= 16384, 'witness_budget');
  const operation = { id: crypto.randomUUID(), descriptorPath, nodePath: d.nodePath, distribution: meta.output, distributionHash: meta.distributionHash, packageHash: d.packageHash, witnessPath: path.join(out, 'witness.json'), witnessHash: hash(witnessBytes) };
  const report = { collectedAt: new Date().toISOString(), recordContext: { purpose: 'technical_check', lifetime: 'ephemeral_check' }, hashes, journalEvents: lines.length, original16Hash: prefix(16), original18Hash: prefix(18), original20Hash: prefix(20), receiverSettled: true, owner: owner.scope, ownerSealVerified: true, ownerProcess: process, host, observation, currentAdoption: JSON.parse(data.adoption), project: { path: projectPath, bytes: aep.length, hash: hash(aep), mtimeNs: String(aepStat.mtimeNs), historicalExpectedBytes: 32001325, historicalExpectedHash: '9d5d15a11fccc24b7ca284b6da866bd46f3626d621c80f83c8c1672791ff996f', historicalBytesPreserved: true }, operation, actualStop: 0, actualAdoption: 0, actualEnable: 0, aeMutation: 0, save: 0, aeRestart: 0 };
  report.owner = { pid: owner.scope.pid, birthTicks: owner.scope.birthTicks, bootId: owner.scope.bootId };
  fs.writeFileSync(operation.witnessPath, witnessBytes, { flag: 'wx' });
  fs.writeFileSync(path.join(out, 'operation.json'), JSON.stringify(operation, null, 2) + '\n', { flag: 'wx' });
  fs.writeFileSync(path.join(out, 'preflight.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(report));
})().catch(e => { console.error(JSON.stringify({ error: e.code || e.message })); process.exitCode = 1; });
