'use strict';
// Fixed semantic reader. No issuance/sign-proof API and no caller validator.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { resolveHistoricalInstallation } = require('./installation-lineage');
const SOURCE_A = 'f3c51cd62a04a09cc8aaf6a0dd4564319c6d7809c2ff132bdb134ba04956120e';
const EXECUTOR = '787a1cc3b2a084a7a2bed11008def8be75aa61e889f48a1469c3db0b7056e019';
const CONTRACT = 'cd0e85894e11e2e070cb73113321b24dfca95b00aa934364313f04319ea6dc5a';
const DISPATCHER = '741824cffa897c8c3f04a9f8f54b81fc3b0fd45c68c5dd4a6afd59e9a3075006';
const DOMAIN = 'AECore4/old-control/terminal-read-failure-disposition/v1';
const HASH = /^[a-f0-9]{64}$/, UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function fail(code) { throw Object.assign(new Error(code), { code }); }
function canonical(v) { if (v === null || typeof v === 'boolean' || typeof v === 'string' || typeof v === 'number' && Number.isFinite(v)) return JSON.stringify(v); if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']'; if (!v || Object.getPrototypeOf(v) !== Object.prototype) fail('disposition_json'); return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}'; }
function hash(v) { return crypto.createHash('sha256').update(Buffer.isBuffer(v) || typeof v === 'string' ? v : canonical(v)).digest('hex'); }
function exact(v, keys) { if (!v || Object.getPrototypeOf(v) !== Object.prototype || Object.keys(v).length !== keys.length || keys.some(k => !Object.hasOwn(v, k))) fail('disposition_schema'); }
function equal(a, b, code = 'disposition_binding') { if (canonical(a) !== canonical(b)) fail(code); }
function validMac(value, actual, secret) { if (typeof actual !== 'string' || !HASH.test(actual)) return false; return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(crypto.createHmac('sha256', secret).update(canonical(value)).digest('hex'))); }
function read(file, max = 64 * 1024 * 1024) { const s = fs.lstatSync(file); if (!s.isFile() || s.isSymbolicLink() || s.reparsePoint || fs.realpathSync(file) !== file) fail('disposition_path'); const b = fs.readFileSync(file); if (b.length > max) fail('disposition_budget'); return b; }
function decodePrefix(encoded) { if (typeof encoded !== 'string') fail('disposition_prefix'); const b = Buffer.from(encoded, 'base64'); if (b.length > 128 * 1024 || b.toString('base64') !== encoded) fail('disposition_prefix'); return b; }
function parseJournalBytes(bytes) {
  const text = bytes.toString('utf8'); if (!Buffer.from(text).equals(bytes) || !text || !text.endsWith('\n')) fail('disposition_journal_bytes');
  const lines = text.slice(0, -1).split('\n'), events = [];
  for (const line of lines) { if (!line || Buffer.byteLength(line) > 256 * 1024) fail('disposition_journal_budget'); const event = JSON.parse(line), { recordHash, ...body } = event; if (event.seq !== events.length + 1 || event.previousHash !== (events.at(-1)?.recordHash || 'origin') || recordHash !== hash(body)) fail('disposition_journal_hash'); events.push(event); }
  return { events, lines };
}
function fixedPrefix(bytes) {
  const parsed = parseJournalBytes(bytes); if (parsed.events.length !== 3) fail('disposition_prefix_scope');
  const [origin, begin, unknown] = parsed.events;
  exact(origin, ['type', 'identity', 'seq', 'previousHash', 'recordHash']); exact(begin, ['type', 'commandId', 'commandDigest', 'command', 'originalBinding', 'seq', 'previousHash', 'recordHash']); exact(unknown, ['type', 'commandId', 'seq', 'previousHash', 'recordHash']);
  const c = begin.command; exact(c, ['protocolVersion', 'controllerId', 'channelEpoch', 'commandId', 'moduleId', 'operationId', 'executorHash', 'phase', 'payloadHash', 'payload']);
  exact(c.payload, Object.hasOwn(c.payload, 'compId') ? ['compId'] : []);
  if (Object.hasOwn(c.payload, 'compId') && (!Number.isSafeInteger(c.payload.compId) || c.payload.compId < 1)) fail('disposition_payload');
  if (origin.type !== 'origin' || typeof origin.identity !== 'string' || !origin.identity || begin.type !== 'begin' || unknown.type !== 'unknown' || c.protocolVersion !== 1 || c.moduleId !== 'project-inspection' || c.operationId !== 'inspect' || c.phase !== 'inspect' || c.executorHash !== EXECUTOR || c.commandId !== begin.commandId || unknown.commandId !== c.commandId || c.payloadHash !== hash(canonical(c.payload)) || begin.commandDigest !== hash(c)) fail('disposition_effect_scope');
  const keys = ['controllerId', 'channelEpoch', 'commandId', 'moduleId', 'operationId', 'executorHash', 'payloadHash', 'phase']; if (keys.some(k => typeof c[k] !== 'string' || !c[k])) fail('disposition_command');
  const binding = { ...Object.fromEntries(keys.map(k => [k, c[k]])), receiverStoreIdentity: origin.identity }; equal(begin.originalBinding, { ...binding, receiptRef: hash(binding) });
  return { origin, begin, unknown, command: c, binding: begin.originalBinding };
}
function validateCaptureSeal(seal, historical, journalPrefixBytes) {
  exact(seal, ['version', 'sourceAHash', 'historicalDescriptorHash', 'oldCepDir', 'journalPrefix', 'capture', 'facts', 'candidate', 'ownerObservation']);
  if (seal.version !== 1 || seal.sourceAHash !== SOURCE_A || seal.historicalDescriptorHash !== historical.descriptorHash || !path.isAbsolute(seal.oldCepDir)) fail('disposition_seal');
  const prefix = decodePrefix(seal.journalPrefix); if (journalPrefixBytes && !prefix.equals(journalPrefixBytes)) fail('disposition_prefix_changed'); const original = fixedPrefix(prefix), d = historical.descriptor, release = historical.release;
  const owner = seal.ownerObservation; exact(owner, ['version', 'path', 'dev', 'ino', 'size', 'birthtimeNs', 'mtimeNs', 'ctimeNs']);
  if (owner.version !== 1 || owner.path !== path.join(d.stateDir, 'receiver/owner') || owner.size !== '0' || ['dev', 'ino', 'birthtimeNs', 'mtimeNs', 'ctimeNs'].some(k => typeof owner[k] !== 'string' || !/^(0|[1-9][0-9]*)$/.test(owner[k])) || owner.ino === '0' || owner.birthtimeNs === '0') fail('disposition_owner_observation');
  const receipt = seal.capture; exact(receipt, ['version', 'purpose', 'proofHash', 'proof', 'transcript', 'result', 'evidenceOnly', 'authority', 'unknownUnchanged']);
  if (receipt.version !== 1 || receipt.purpose !== 'native-read-evidence-capture-v1' || receipt.evidenceOnly !== true || receipt.authority !== false || receipt.unknownUnchanged !== true || receipt.proofHash !== hash(receipt.proof)) fail('disposition_capture');
  equal(receipt.result, { readFailureVersion: 1, outcome: 'rejected', code: 'host_registry_unavailable' }, 'disposition_failure_profile');
  const p = receipt.proof, admission = JSON.parse(read(path.join(d.releaseDir, 'modules/project-inspection/artifact.json'))), contract = JSON.parse(read(path.join(d.releaseDir, 'modules/project-inspection/contract.json')));
  if (hash(contract) !== CONTRACT || admission.contractHash !== CONTRACT || admission.executorHash !== EXECUTOR || release.hashes['modules/project-inspection/executor.jsx'] !== EXECUTOR || release.hashes['cep/js/poll-dispatcher.js'] !== DISPATCHER || contract.effectPolicy.effect !== 'none' || contract.effectPolicy.continuity !== false || contract.buildSupported !== false || contract.executionPolicy !== 'read-only-current-observation-v1') fail('disposition_fixed_asset');
  const pins = { packageHash: d.packageHash, installationId: d.installationId, executorHash: EXECUTOR };
  if (p.version !== 1 || p.purpose !== receipt.purpose || p.operatorHash !== SOURCE_A || p.descriptorHash !== historical.descriptorHash || p.installationId !== d.installationId || p.machineId !== d.machineId || p.packageHash !== d.packageHash || p.receiverStoreIdentity !== original.origin.identity || p.journalHash !== hash(prefix) || p.journalTailHash !== original.unknown.recordHash || p.commandDigest !== original.begin.commandDigest || p.contractId !== hash({ packageHash: d.packageHash, admission, contract })) fail('disposition_original_proof');
  equal(p.originalBinding, original.binding); equal(p.pins, pins);
  const protectedHashes = p.protectedHashes; if (!protectedHashes || protectedHashes[path.join(d.installRoot, 'installation.json')] !== historical.descriptorHash || protectedHashes[d.nodePath] !== d.nodeHash || protectedHashes[path.join(d.stateDir, 'receiver/completions.ndjson')] !== hash(prefix) || protectedHashes[path.join(d.stateDir, 'receiver/owner')] !== hash(Buffer.alloc(0))) fail('disposition_past_bindings');
  // Only stable origins are checked on disk. Old config/CEP/cache/Node/workspace
  // paths are signed past observations, never current admission dependencies.
  for (const file of [path.join(d.installRoot, 'origin.json'), path.join(d.stateDir, 'origin.json')]) if (hash(read(file)) !== protectedHashes[file]) fail('disposition_stable_origin');
  const oldCep = Object.fromEntries(Object.entries(release.hashes).filter(([file]) => file.startsWith('cep/')).map(([file, digest]) => [file.slice(4), digest]));
  const manual = JSON.parse(read(path.join(d.releaseDir, 'config/admissions/titles-current-target.json')));
  const cfg = { installationId: d.installationId, packageHash: d.packageHash, panelToken: d.panelToken, executorHash: EXECUTOR, assetKey: 'project-inspection-v1', assets: [{ assetKey: 'project-inspection-v1', executorHash: EXECUTOR, phases: ['inspect'] }, { assetKey: 'titles-current-target-v1', executorHash: manual.executorHash, phases: ['inspect', 'mutate', 'verify'] }] };
  oldCep['installation.js'] = hash('window.Core4Installation=' + canonical(cfg) + ';\n'); if (Object.keys(oldCep).length !== 7) fail('disposition_old_cep');
  for (const [file, digest] of Object.entries(oldCep)) if (protectedHashes[path.join(seal.oldCepDir, file)] !== digest) fail('disposition_old_cep');
  if (!Array.isArray(receipt.transcript) || receipt.transcript.length !== 3) fail('disposition_transcript');
  const [challenge, link, complete] = receipt.transcript; exact(challenge, ['route', 'request', 'response']); exact(link, ['route', 'request', 'response']); exact(complete, ['route', 'request', 'response']);
  equal(challenge.request, { role: 'panel' }); if (challenge.route !== '/challenge' || link.route !== '/link' || complete.route !== '/complete') fail('disposition_routes');
  const q = challenge.response; exact(q, ['nonce', 'epoch', 'role', 'origin', 'packageHash', 'installationId', 'executorHash', 'controllerId', 'purpose', 'receiverStoreIdentity', 'commandDigest', 'journalTailHash']);
  if (!HASH.test(q.nonce) || !q.epoch.startsWith('capture-') || q.epoch === original.command.channelEpoch || !['null', 'file://'].includes(q.origin) || q.role !== 'panel' || q.purpose !== receipt.purpose || q.receiverStoreIdentity !== original.origin.identity || q.commandDigest !== p.commandDigest || q.journalTailHash !== p.journalTailHash) fail('disposition_capture_channel');
  equal({ packageHash: q.packageHash, installationId: q.installationId, executorHash: q.executorHash }, pins);
  exact(link.request, ['challenge', 'peerId', 'proof']); equal(link.request.challenge, q); if (typeof link.request.peerId !== 'string' || !/^[A-Za-z0-9-]{1,100}$/.test(link.request.peerId) || !validMac({ challenge: q, peerId: link.request.peerId }, link.request.proof, d.panelToken)) fail('disposition_panel_link_mac');
  exact(link.response, ['body', 'mac']); equal(link.response.body, { linked: true, epoch: q.epoch, peerId: link.request.peerId, controllerId: q.controllerId, pins, receiverStoreIdentity: original.origin.identity, laneClosed: true }); if (!validMac(link.response.body, link.response.mac, d.panelToken)) fail('disposition_panel_response_mac');
  exact(complete.request, ['body', 'mac']); const body = complete.request.body; exact(body, ['epoch', 'peerId', 'sequence', 'method', 'path', 'payload']);
  if (body.epoch !== q.epoch || body.peerId !== link.request.peerId || body.sequence !== 1 || body.method !== 'POST' || body.path !== '/complete' || !validMac(body, complete.request.mac, d.panelToken)) fail('disposition_panel_receipt_mac');
  equal(body.payload, { commandId: original.command.commandId, originalBinding: original.binding, pins, result: receipt.result }); equal(complete.response, { error: 'capture_recorded_no_ack' });
  const facts = seal.facts; exact(facts, ['version', 'witnessHash', 'sourceThread', 'sourceTurn', 'sourceCommandItem', 'originalManagedPid', 'originalManagedExitCode', 'originalDelivered', 'originalTimeout', 'mutatingCommands', 'files', 'producer']);
  if (facts.version !== 1 || facts.witnessHash !== p.provenanceHash || !HASH.test(facts.witnessHash) || facts.originalManagedPid !== p.managedPid || !Number.isSafeInteger(facts.originalManagedPid) || facts.originalManagedPid < 1 || facts.originalManagedExitCode !== 0 || facts.originalDelivered !== true || facts.originalTimeout !== 'host_callback_timeout' || facts.mutatingCommands !== 0 || ['sourceThread', 'sourceTurn', 'sourceCommandItem'].some(k => typeof facts[k] !== 'string' || !facts[k])) fail('disposition_provenance_facts');
  const fileNames = ['context.json', 'requests.jsonl', 'stdio.raw.jsonl', 'exit.jsonl', 'original-managed-command-evidence.json', 'original-receiver-journal.jsonl'].sort();
  if (!Array.isArray(facts.files) || canonical(facts.files.map(f => f.name).sort()) !== canonical(fileNames)) fail('disposition_provenance_files'); for (const file of facts.files) { exact(file, ['name', 'sha256']); if (!HASH.test(file.sha256)) fail('disposition_provenance_files'); }
  if (facts.files.find(f => f.name === 'original-receiver-journal.jsonl').sha256 !== hash(prefix)) fail('disposition_provenance_journal');
  const producer = facts.producer; exact(producer, ['driverHash', 'sourceAHash', 'pid', 'exitCode', 'globalTimeoutMs', 'completionTimeoutMs', 'contextHash', 'stdoutHash', 'exitHash']);
  if (producer.driverHash !== 'b763348b9a6139b2b6bd143a1cc25bc38b3bc3c2ca50d37ca584d2a34691196a' || producer.sourceAHash !== SOURCE_A || !Number.isSafeInteger(producer.pid) || producer.pid < 1 || producer.exitCode !== 0 || producer.globalTimeoutMs !== 600000 || producer.completionTimeoutMs !== 15000 || ['contextHash', 'stdoutHash', 'exitHash'].some(k => !HASH.test(producer[k]))) fail('disposition_producer_facts');
  exact(seal.candidate, ['packageHash', 'installRoot', 'stateDir', 'descriptorPath', 'cepDir', 'nodePath', 'nodeHash', 'nodeVersion']);
  if (!HASH.test(seal.candidate.packageHash) || seal.candidate.installRoot !== d.installRoot || seal.candidate.stateDir !== d.stateDir || seal.candidate.descriptorPath !== path.join(d.installRoot, 'installation.json') || seal.candidate.cepDir !== seal.oldCepDir || !path.isAbsolute(seal.candidate.nodePath) || !HASH.test(seal.candidate.nodeHash) || !/^v(2\d|[3-9]\d)\./.test(seal.candidate.nodeVersion)) fail('disposition_candidate');
  return Object.freeze({ command: original.command, binding: original.binding, pins, result: receipt.result, journalPrefixHash: hash(prefix), journalTailHash: original.unknown.recordHash });
}
function inspectSealedDispositionFacts(event, { historical, journalPrefixBytes }) {
  exact(event, ['type', 'dispositionVersion', 'commandId', 'seal', 'authorization', 'controlMac', 'seq', 'previousHash', 'recordHash']);
  if (event.type !== 'terminal-read-failure-disposition' || event.dispositionVersion !== 1 || event.seq !== 4) fail('disposition_event');
  const semantic = validateCaptureSeal(event.seal, historical, journalPrefixBytes), a = event.authorization;
  exact(a, ['domain', 'version', 'operation', 'proofHash', 'nonce', 'operatorClosureHash', 'installationId', 'receiverStoreIdentity', 'commandId', 'journalPrefixHash', 'journalTailHash', 'historicalDescriptorHash', 'candidatePackageHash', 'installTransactionId', 'appliedDescriptorHash', 'preparedPlanHash', 'preparedStateHash', 'dispositionTransactionId']);
  if (a.domain !== DOMAIN || a.version !== 1 || a.operation !== 'terminal-read-failure-disposition-and-install' || a.proofHash !== hash(event.seal) || !HASH.test(a.nonce) || !HASH.test(a.operatorClosureHash) || a.installationId !== historical.descriptor.installationId || a.receiverStoreIdentity !== semantic.binding.receiverStoreIdentity || a.commandId !== semantic.command.commandId || a.journalPrefixHash !== semantic.journalPrefixHash || a.journalTailHash !== semantic.journalTailHash || a.historicalDescriptorHash !== historical.descriptorHash || a.candidatePackageHash !== event.seal.candidate.packageHash || !UUID.test(a.installTransactionId) || !UUID.test(a.dispositionTransactionId) || !HASH.test(a.appliedDescriptorHash) || !HASH.test(a.preparedPlanHash) || !HASH.test(a.preparedStateHash) || event.commandId !== a.commandId || event.previousHash !== a.journalTailHash || !validMac({ domain: DOMAIN, seal: event.seal, authorization: a }, event.controlMac, historical.descriptor.controlToken)) fail('disposition_control_authorization');
  // Pure facts/crypto inspection only. This return is not runtime settlement.
  return Object.freeze({ semantic, authorization: a });
}
function verifyDispositionInstallEdge(event, edge) {
  const a = event.authorization, c = event.seal.candidate;
  if (!edge || edge.transactionId !== a.installTransactionId || edge.childPackageHash !== a.candidatePackageHash || edge.childDescriptorHash !== a.appliedDescriptorHash || edge.preparedPlanHash !== a.preparedPlanHash || edge.preparedStateHash !== a.preparedStateHash || edge.childNodePath !== c.nodePath || edge.childNodeHash !== c.nodeHash || edge.childNodeVersion !== c.nodeVersion || edge.childCepDir !== c.cepDir) fail('disposition_install_lineage');
}
function validateDisposition(event, options = {}) {
  if (Object.keys(options).some(key => !['descriptorPath', 'cepDir', 'journalPrefixBytes'].includes(key))) fail('runtime_disposition_context');
  const { descriptorPath, cepDir, journalPrefixBytes } = options;
  const resolved = resolveHistoricalInstallation({ descriptorPath, descriptorHash: event.seal.historicalDescriptorHash, cepDir });
  if (resolved.current.version !== 2) fail('disposition_runtime_v2_required');
  const inspected = inspectSealedDispositionFacts(event, { historical: resolved.historical, journalPrefixBytes }); verifyDispositionInstallEdge(event, resolved.edgeFromHistorical); return inspected.semantic;
}
function assertReceiverJournalSettled(options) {
  if (Object.keys(options).some(key => !['directory', 'descriptorPath', 'cepDir'].includes(key))) fail('runtime_disposition_context');
  const { directory, descriptorPath, cepDir } = options;
  const parsed = parseJournalBytes(read(path.join(directory, 'completions.ndjson'))), records = new Map(); let identity;
  for (const event of parsed.events) {
    if (event.type === 'origin') { if (event.seq !== 1 || typeof event.identity !== 'string' || !event.identity) fail('receiver_store_corrupt'); identity = event.identity; }
    else if (event.type === 'begin') {
      if (!identity || records.has(event.commandId) || event.commandId !== event.command?.commandId || event.commandDigest !== hash(event.command)) fail('receiver_store_corrupt');
      const fields = ['controllerId', 'channelEpoch', 'commandId', 'moduleId', 'operationId', 'executorHash', 'payloadHash', 'phase'], binding = { ...Object.fromEntries(fields.map(k => [k, event.command[k]])), receiverStoreIdentity: identity };
      equal(event.originalBinding, { ...binding, receiptRef: hash(binding) }, 'receiver_store_corrupt'); records.set(event.commandId, { state: 'ongoing' });
    }
    else if (event.type === 'complete' || event.type === 'unknown') { const prior = records.get(event.commandId); if (prior?.state !== 'ongoing') fail('receiver_store_corrupt'); prior.state = event.type === 'complete' ? 'completed' : 'unknown'; }
    else if (event.type === 'terminal-read-failure-disposition') { const prior = records.get(event.commandId); if (prior?.state !== 'unknown' || prior.settled) fail('receiver_store_corrupt'); validateDisposition(event, { descriptorPath, cepDir, journalPrefixBytes: Buffer.from(parsed.lines.slice(0, 3).join('\n') + '\n') }); prior.settled = true; }
    else fail('receiver_store_corrupt');
  }
  if ([...records.values()].some(r => r.state !== 'completed' && !r.settled)) fail('runtime_receiver_unresolved');
}
function assertRollbackReaderCompatible({ directory, target }) {
  const file = path.join(directory, 'completions.ndjson'); if (!fs.existsSync(file)) return;
  const { events } = parseJournalBytes(read(file));
  if (!target && events.length > 1) fail('rollback_reader_unsupported');
  if (events.some(e => e.type === 'terminal-read-failure-disposition')) {
    if (!target || target.version !== 2 || target.receiverFormatVersion !== 2) fail('rollback_reader_unsupported');
    const manifest = JSON.parse(read(path.join(target.releaseDir, 'release.json'))); if (hash(manifest) !== target.packageHash) fail('rollback_target_package');
    const contract = JSON.parse(read(path.join(target.releaseDir, 'runtime/receiver-contract.json'))); if (hash(read(path.join(target.releaseDir, 'runtime/receiver-contract.json'))) !== manifest.hashes['runtime/receiver-contract.json'] || contract.version !== 1 || contract.descriptorVersion !== 2 || contract.journalFormat !== 2 || contract.terminalReadFailureDispositionVersion !== 1) fail('rollback_reader_unsupported');
  }
}
module.exports = { validateCaptureSeal, inspectSealedDispositionFacts, verifyDispositionInstallEdge, validateDisposition, parseJournalBytes, assertReceiverJournalSettled, assertRollbackReaderCompatible };
