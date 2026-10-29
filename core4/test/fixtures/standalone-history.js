'use strict';
// Synthetic signed DATA in test-owned TEMP only. No capture, IPC, port or AE.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { hash, canonical } = require('../../protocol/json');
const { dispatchBinding } = require('../../protocol/dispatch');
const { buildPackage } = require('../../tools/package-installable');
const { planInstall, applyInstall, prepareInstallPlan } = require('../../tools/install-core4');
const leaseApi = require('../../runtime/install-lease');
const { validateCaptureSeal, validateDisposition } = require('../../runtime/native-read-disposition');
const { legacyV1Data } = require('./legacy-installation-v1');
const { fixedFormat1Package } = require('./fixed-format1-package');
const SOURCE_A = 'f3c51cd62a04a09cc8aaf6a0dd4564319c6d7809c2ff132bdb134ba04956120e';
const DOMAIN = 'AECore4/old-control/terminal-read-failure-disposition/v1';
const mac = (v, key) => crypto.createHmac('sha256', key).update(canonical(v)).digest('hex');
function signedHistory(args) {
  const historical = fixedFormat1Package(), initial = planInstall({ ...args, pkg: historical }); legacyV1Data(initial);
  const descriptorPath = initial.descriptorPath, d = JSON.parse(fs.readFileSync(descriptorPath)), descriptorHash = hash(fs.readFileSync(descriptorPath));
  const receiver = path.join(d.stateDir, 'receiver'), journal = path.join(receiver, 'completions.ndjson'), owner = path.join(receiver, 'owner'); fs.mkdirSync(receiver); fs.writeFileSync(owner, '');
  const admission = JSON.parse(Buffer.from(historical.files['modules/project-inspection/artifact.json'], 'base64')), contract = JSON.parse(Buffer.from(historical.files['modules/project-inspection/contract.json'], 'base64'));
  const command = { protocolVersion: 1, controllerId: 'synthetic-controller', channelEpoch: 'synthetic-old-epoch', commandId: 'synthetic-old-read', moduleId: 'project-inspection', operationId: 'inspect', executorHash: admission.executorHash, phase: 'inspect', payloadHash: hash(canonical({})), payload: {} };
  const binding = dispatchBinding(command, 'synthetic-store'), events = [];
  function event(body) { const b = { ...body, seq: events.length + 1, previousHash: events.at(-1)?.recordHash || 'origin' }; const e = { ...b, recordHash: hash(b) }; events.push(e); return e; }
  event({ type: 'origin', identity: binding.receiverStoreIdentity }); event({ type: 'begin', commandId: command.commandId, commandDigest: hash(command), command, originalBinding: binding }); event({ type: 'unknown', commandId: command.commandId });
  const prefix = Buffer.from(events.map(canonical).join('\n') + '\n'); fs.writeFileSync(journal, prefix);
  const pins = { packageHash: d.packageHash, installationId: d.installationId, executorHash: command.executorHash }, protectedHashes = {};
  for (const file of [descriptorPath, d.nodePath, journal, owner, path.join(d.installRoot, 'origin.json'), path.join(d.stateDir, 'origin.json'), ...Object.keys(initial.cep).map(file => path.join(initial.cepDir, file))]) protectedHashes[file] = hash(fs.readFileSync(file));
  const proof = { version: 1, purpose: 'native-read-evidence-capture-v1', operatorHash: SOURCE_A, descriptorHash, installationId: d.installationId, machineId: d.machineId, packageHash: d.packageHash, receiverStoreIdentity: binding.receiverStoreIdentity, journalHash: hash(prefix), journalTailHash: events.at(-1).recordHash, commandDigest: hash(command), contractId: hash({ packageHash: d.packageHash, admission, contract }), originalBinding: binding, pins, provenanceHash: hash('synthetic-provenance'), managedPid: 123456789, protectedHashes };
  const q = { nonce: hash('synthetic-nonce'), epoch: 'capture-synthetic', role: 'panel', origin: 'null', ...pins, controllerId: 'synthetic-capture', purpose: proof.purpose, receiverStoreIdentity: binding.receiverStoreIdentity, commandDigest: proof.commandDigest, journalTailHash: proof.journalTailHash }, peerId = 'synthetic-peer';
  const linked = { linked: true, epoch: q.epoch, peerId, controllerId: q.controllerId, pins, receiverStoreIdentity: binding.receiverStoreIdentity, laneClosed: true }, result = { readFailureVersion: 1, outcome: 'rejected', code: 'host_registry_unavailable' };
  const complete = { epoch: q.epoch, peerId, sequence: 1, method: 'POST', path: '/complete', payload: { commandId: command.commandId, originalBinding: binding, pins, result } };
  const capture = { version: 1, purpose: proof.purpose, proofHash: hash(proof), proof, transcript: [{ route: '/challenge', request: { role: 'panel' }, response: q }, { route: '/link', request: { challenge: q, peerId, proof: mac({ challenge: q, peerId }, d.panelToken) }, response: { body: linked, mac: mac(linked, d.panelToken) } }, { route: '/complete', request: { body: complete, mac: mac(complete, d.panelToken) }, response: { error: 'capture_recorded_no_ack' } }], result, evidenceOnly: true, authority: false, unknownUnchanged: true };
  const facts = { version: 1, witnessHash: proof.provenanceHash, sourceThread: 'synthetic-thread', sourceTurn: 'synthetic-turn', sourceCommandItem: 'synthetic-command', originalManagedPid: proof.managedPid, originalManagedExitCode: 0, originalDelivered: true, originalTimeout: 'host_callback_timeout', mutatingCommands: 0, files: ['context.json', 'requests.jsonl', 'stdio.raw.jsonl', 'exit.jsonl', 'original-managed-command-evidence.json', 'original-receiver-journal.jsonl'].map(name => ({ name, sha256: name === 'original-receiver-journal.jsonl' ? hash(prefix) : hash('synthetic-' + name) })), producer: { driverHash: 'b763348b9a6139b2b6bd143a1cc25bc38b3bc3c2ca50d37ca584d2a34691196a', sourceAHash: SOURCE_A, pid: 123456788, exitCode: 0, globalTimeoutMs: 600000, completionTimeoutMs: 15000, contextHash: hash('synthetic-context'), stdoutHash: hash('synthetic-stdout'), exitHash: hash('synthetic-exit') } };
  const candidate = buildPackage(), plan = planInstall({ ...args, pkg: candidate }), scope = { installRoot: d.installRoot, stateDir: d.stateDir, descriptorPath }, lease = leaseApi.acquireInstallLease(scope);
  try {
    const fingerprint = prepareInstallPlan(plan, { lease }); leaseApi.checkpointInstallLease(lease, 'validated');
    const stat = fs.lstatSync(owner, { bigint: true }), seal = { version: 1, sourceAHash: SOURCE_A, historicalDescriptorHash: descriptorHash, oldCepDir: initial.cepDir, journalPrefix: prefix.toString('base64'), capture, facts, candidate: { packageHash: candidate.packageHash, installRoot: d.installRoot, stateDir: d.stateDir, descriptorPath, cepDir: initial.cepDir, nodePath: d.nodePath, nodeHash: d.nodeHash, nodeVersion: d.nodeVersion }, ownerObservation: { version: 1, path: owner, ...Object.fromEntries(['dev', 'ino', 'size', 'birthtimeNs', 'mtimeNs', 'ctimeNs'].map(k => [k, String(stat[k])])) } };
    const semantic = validateCaptureSeal(seal, { descriptor: d, descriptorHash, release: historical.release }, prefix);
    const authorization = { domain: DOMAIN, version: 1, operation: 'terminal-read-failure-disposition-and-install', proofHash: hash(seal), nonce: hash('synthetic-control-nonce'), operatorClosureHash: hash('synthetic-operator'), installationId: d.installationId, receiverStoreIdentity: binding.receiverStoreIdentity, commandId: command.commandId, journalPrefixHash: semantic.journalPrefixHash, journalTailHash: semantic.journalTailHash, historicalDescriptorHash: descriptorHash, candidatePackageHash: candidate.packageHash, installTransactionId: fingerprint.transactionId, appliedDescriptorHash: fingerprint.appliedDescriptorHash, preparedPlanHash: fingerprint.preparedPlanHash, preparedStateHash: fingerprint.preparedStateHash, dispositionTransactionId: crypto.randomUUID() };
    const disposition = event({ type: 'terminal-read-failure-disposition', dispositionVersion: 1, commandId: command.commandId, seal, authorization, controlMac: mac({ domain: DOMAIN, seal, authorization }, d.controlToken) });
    fs.appendFileSync(journal, canonical(disposition) + '\n'); const journalHash = hash(fs.readFileSync(journal)); leaseApi.checkpointInstallLease(lease, 'disposition-appended', { journalHash });
    fs.renameSync(owner, path.join(receiver, 'synthetic-archived-owner')); leaseApi.checkpointInstallLease(lease, 'receiver-archived', { journalHash, archivedOwnerHash: hash('') });
    const applied = applyInstall(plan, { lease }); validateDisposition(disposition, { descriptorPath, journalPrefixBytes: prefix });
    return { ...applied, prefix, journal, command, binding, disposition, historicalDescriptorHash: descriptorHash };
  } finally { leaseApi.releaseInstallLease(lease); }
}
module.exports = { signedHistory };
