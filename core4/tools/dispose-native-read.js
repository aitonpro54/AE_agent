'use strict';
// Private ROOT technical operator. CLI imports only builtins until its exact
// reviewed operator closure is verified. No public MCP tool or sign-proof API.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const A_HASH = 'f3c51cd62a04a09cc8aaf6a0dd4564319c6d7809c2ff132bdb134ba04956120e';
const DRIVER_HASH = 'b763348b9a6139b2b6bd143a1cc25bc38b3bc3c2ca50d37ca584d2a34691196a';
const DOMAIN = 'AECore4/old-control/terminal-read-failure-disposition/v1';
const HASH = /^[a-f0-9]{64}$/, UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const operatorClosures = new WeakMap();
function fail(code) { throw Object.assign(new Error(code), { code }); }
function canonical(v) { if (v === null || typeof v === 'boolean' || typeof v === 'string' || typeof v === 'number' && Number.isFinite(v)) return JSON.stringify(v); if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']'; if (!v || Object.getPrototypeOf(v) !== Object.prototype) fail('operator_json'); return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}'; }
function hash(v) { return crypto.createHash('sha256').update(Buffer.isBuffer(v) || typeof v === 'string' ? v : canonical(v)).digest('hex'); }
function exact(v, keys) { if (!v || Object.getPrototypeOf(v) !== Object.prototype || Object.keys(v).length !== keys.length || keys.some(k => !Object.hasOwn(v, k))) fail('operator_schema'); }
function equal(a, b, code = 'operator_binding') { if (canonical(a) !== canonical(b)) fail(code); }
function safe(file, directory = false) { if (!path.isAbsolute(file) || path.resolve(file) !== file) fail('operator_path'); const s = fs.lstatSync(file); if (s.isSymbolicLink() || s.reparsePoint || fs.realpathSync(file) !== file || (directory ? !s.isDirectory() : !s.isFile())) fail('operator_path'); }
function read(file, max = 8 * 1024 * 1024) { safe(file); const b = fs.readFileSync(file); if (b.length > max) fail('operator_budget'); return b; }
function json(file) { const b = read(file); if (!Buffer.from(b.toString('utf8')).equals(b)) fail('operator_utf8'); return { bytes: b, value: JSON.parse(b.toString('utf8')) }; }
function pidState(pid) { try { process.kill(pid, 0); return 'alive'; } catch (e) { return e.code === 'ESRCH' ? 'dead' : 'unknown'; } }
function verifyOperatorClosure(root, expectedHash) {
  safe(root, true); const bytes = read(path.join(root, 'operator.json')), manifest = JSON.parse(bytes); exact(manifest, ['version', 'purpose', 'hashes']);
  if (!HASH.test(expectedHash) || hash(bytes) !== expectedHash || manifest.version !== 1 || manifest.purpose !== 'native-read-disposition-and-install-v1') fail('operator_closure_hash');
  const files = new Set(['operator.json']), dirs = new Set(['']);
  for (const file of Object.keys(manifest.hashes)) { if (!/^[A-Za-z0-9_./-]+$/.test(file) || file.split('/').some(p => !p || p === '.' || p === '..') || !HASH.test(manifest.hashes[file])) fail('operator_closure_path'); files.add(file); for (let dir = path.posix.dirname(file); dir !== '.'; dir = path.posix.dirname(dir)) dirs.add(dir); }
  function visit(directory, relative) { safe(directory, true); if (!dirs.delete(relative)) fail('operator_closure_tree'); for (const name of fs.readdirSync(directory)) { const file = path.join(directory, name), rel = relative ? relative + '/' + name : name, stat = fs.lstatSync(file); safe(file, stat.isDirectory()); if (stat.isDirectory()) visit(file, rel); else if (!files.delete(rel) || rel !== 'operator.json' && hash(read(file)) !== manifest.hashes[rel]) fail('operator_closure_bytes'); } }
  visit(root, ''); if (files.size || dirs.size || manifest.hashes['tools/capture-native-read.js'] !== A_HASH || manifest.hashes['tools/dispose-native-read.js'] !== hash(read(__filename))) fail('operator_closure_tree'); const token = Object.freeze({ hash: expectedHash }); operatorClosures.set(token, { root, manifest }); return token;
}
function createDispositionOperator({ operatorRoot = path.resolve(__dirname, '..'), operatorClosure, io = fs, captureFactory, probePid = pidState, ipcTimeoutMs = 15000 } = {}) {
  // Direct construction is for trusted local test code. Production CLI requires
  // verifyOperatorClosure, supplies no IO/probe/validator injections, and IPC only.
  const aPath = path.join(operatorRoot, 'tools/capture-native-read.js'); if (hash(read(aPath)) !== A_HASH) fail('operator_source_A');
  const A = require(aPath), leaseApi = require(path.join(operatorRoot, 'runtime/install-lease.js'));
  const installation = require(path.join(operatorRoot, 'runtime/installation.js')), semantics = require(path.join(operatorRoot, 'runtime/native-read-disposition.js'));
  const { planInstall, prepareInstallPlan, assertPreparedInstallPlan, applyInstall } = require(path.join(operatorRoot, 'tools/install-core4.js')), { verifyPackage } = require(path.join(operatorRoot, 'tools/package-installable.js'));
  const { inspectPreparedDisposition } = require(path.join(operatorRoot, 'tools/disposition-install-preflight.js'));
  const makeCapture = captureFactory || (() => A.createCapture());
  function ownerStat(stat, file) {
    if (!stat.isFile() || stat.isSymbolicLink() || stat.reparsePoint || stat.size !== 0n) fail('operator_owner_identity');
    const fields = ['dev', 'ino', 'size', 'birthtimeNs', 'mtimeNs', 'ctimeNs'];
    if (fields.some(k => typeof stat[k] !== 'bigint' || stat[k] < 0n) || stat.ino === 0n || stat.birthtimeNs === 0n) fail('operator_owner_identity_unavailable');
    return { version: 1, path: file, ...Object.fromEntries(fields.map(k => [k, String(stat[k])])) };
  }
  function ownerCas(held, file = held.observation.path, renamed = false) {
    safe(file); const named = ownerStat(io.lstatSync(file, { bigint: true }), file), opened = ownerStat(io.fstatSync(held.fd, { bigint: true }), file);
    const fields = renamed ? ['dev', 'ino', 'size', 'birthtimeNs'] : ['dev', 'ino', 'size', 'birthtimeNs', 'mtimeNs', 'ctimeNs'];
    if (fields.some(k => named[k] !== held.observation[k] || opened[k] !== held.observation[k]) || io.readFileSync(held.fd).length || io.readFileSync(file).length) fail('operator_owner_identity_changed');
  }
  function openOwner(file) {
    safe(file); const observation = ownerStat(io.lstatSync(file, { bigint: true }), file), fd = io.openSync(file, 'r'), held = { fd, observation };
    try { ownerCas(held); return held; } catch (e) { io.closeSync(fd); throw e; }
  }
  function context(args) { const defaults = A.defaults(); return { ...defaults, ...args }; }
  function scopeFor(d, descriptorPath) { return { installRoot: d.installRoot, stateDir: d.stateDir, descriptorPath }; }
  function candidate(args, d, opts) {
    const pkg = verifyPackage(json(args.package).value); if (pkg.packageHash !== args.expectedPackageHash) fail('operator_candidate_package');
    const critical = ['runtime/stdio-entry.js', 'runtime/installation.js', 'runtime/install-lease.js', 'runtime/installation-lineage.js', 'runtime/native-read-disposition.js', 'runtime/receiver-contract.json', 'integrations/cep/completion-store.js', 'integrations/cep/http-peer.js'];
    for (const file of critical) if (pkg.release.hashes[file] !== hash(read(path.join(operatorRoot, file)))) fail('operator_candidate_reader_closure');
    if (d.nodePath !== path.resolve(process.execPath) || d.nodeHash !== hash(fs.readFileSync(process.execPath))) fail('operator_current_node');
    const facts = { packageHash: pkg.packageHash, installRoot: d.installRoot, stateDir: d.stateDir, descriptorPath: args.descriptor, cepDir: opts.cepDir, nodePath: d.nodePath, nodeHash: d.nodeHash, nodeVersion: process.version };
    return { pkg, facts };
  }
  function producer(args, receipt, descriptorHash) {
    safe(args.producerSession, true); const allowed = new Set(['context.json', 'stdout.raw.log', 'exit.json', 'stderr.raw.log']); if (io.readdirSync(args.producerSession).some(f => !allowed.has(f))) fail('operator_producer_files');
    const c = json(path.join(args.producerSession, 'context.json')), out = read(path.join(args.producerSession, 'stdout.raw.log')), e = json(path.join(args.producerSession, 'exit.json')), inspected = json(args.inspection), driver = read(args.producerDriver);
    const stderr = path.join(args.producerSession, 'stderr.raw.log'); if (io.existsSync(stderr) && read(stderr).length) fail('operator_producer_failed');
    exact(c.value, ['version', 'at', 'driverHash', 'operatorHash', 'inspectionHash', 'proofHash', 'packageHash', 'descriptorHash', 'recordContext', 'globalTimeoutMs', 'completionTimeoutMs', 'automaticNativeDispatch', 'ackAllowed', 'authority']);
    const meta = c.value; equal(meta.recordContext, { purpose: 'technical_check', lifetime: 'ephemeral_check', context: 'original cached read receipt, one human button action' });
    if (meta.version !== 1 || meta.driverHash !== DRIVER_HASH || hash(driver) !== DRIVER_HASH || meta.operatorHash !== A_HASH || meta.inspectionHash !== hash(inspected.bytes) || inspected.value.inspectionOnly !== true || inspected.value.authority !== false || inspected.value.proofHash !== receipt.proofHash || canonical(inspected.value.proof) !== canonical(receipt.proof) || meta.proofHash !== receipt.proofHash || meta.packageHash !== receipt.proof.packageHash || meta.descriptorHash !== descriptorHash || meta.globalTimeoutMs !== 600000 || meta.completionTimeoutMs !== 15000 || meta.automaticNativeDispatch !== false || meta.ackAllowed !== false || meta.authority !== false || !Number.isFinite(Date.parse(meta.at))) fail('operator_producer_context');
    exact(e.value, ['at', 'pid', 'code', 'signal']); if (!Number.isSafeInteger(e.value.pid) || e.value.pid < 1 || e.value.code !== 0 || e.value.signal !== null || !Number.isFinite(Date.parse(e.value.at)) || Date.parse(e.value.at) < Date.parse(meta.at) || Date.parse(e.value.at) > Date.now()) fail('operator_producer_exit');
    const text = out.toString('utf8'); if (!Buffer.from(text).equals(out) || !text.endsWith('\n')) fail('operator_producer_stdout'); const lines = text.trimEnd().split('\n').map(line => JSON.parse(line)); if (lines.length !== 2) fail('operator_producer_stdout');
    const transaction = path.dirname(args.capture);
    equal(lines[0], { event: 'capture_listening', proofHash: receipt.proofHash, port: 3457, transaction, manualWaitMs: 600000 });
    equal(lines[1], { captured: true, evidenceOnly: true, unknownUnchanged: true, ack: false, transaction, receiptHash: hash(read(args.capture)), proofHash: receipt.proofHash });
    return { driverHash: DRIVER_HASH, sourceAHash: A_HASH, pid: e.value.pid, exitCode: 0, globalTimeoutMs: 600000, completionTimeoutMs: 15000, contextHash: hash(c.bytes), stdoutHash: hash(out), exitHash: hash(e.bytes) };
  }
  async function inspectState(args, lease) {
    if (operatorClosure) { const closed = operatorClosures.get(operatorClosure); if (!closed || closed.root !== operatorRoot) fail('operator_closure_brand'); verifyOperatorClosure(operatorRoot, operatorClosure.hash); }
    const opts = context(args), d = installation.verifyInstallation(args.descriptor, { cepDir: opts.cepDir });
    if (d.version !== 1) fail('operator_original_v1_required');
    const originalDescriptorBytes = read(args.descriptor), captureBytes = read(args.capture), receipt = JSON.parse(captureBytes.toString('utf8'));
    const captureDir = path.dirname(args.capture), relative = path.relative(path.join(d.installRoot, 'transactions'), captureDir);
    if (args.capture !== path.join(captureDir, 'receipt.json') || !/^[a-f0-9-]{36}-native-read-capture$/.test(relative) || !UUID.test(relative.slice(0, 36)) || relative.includes(path.sep)) fail('operator_capture_scope');
    safe(captureDir, true); equal(io.readdirSync(captureDir).sort(), ['intent.json', 'receipt.json']);
    const intent = json(path.join(captureDir, 'intent.json')); exact(intent.value, ['version', 'purpose', 'proof', 'proofHash', 'state']); equal(intent.value, { version: 1, purpose: 'native-read-evidence-capture-v1', proof: receipt.proof, proofHash: receipt.proofHash, state: 'evidence-only-no-ack' });
    const owned = lease ? leaseApi.ownedLeaseGates(lease) : undefined;
    if (lease) leaseApi.assertInstallLease(lease, scopeFor(d, args.descriptor));
    const fresh = await makeCapture().inspect({ descriptor: args.descriptor, provenance: args.provenance, cepDir: opts.cepDir, config: opts.config, evidenceRoot: opts.evidenceRoot }, owned);
    if (fresh.proofHash !== receipt.proofHash || canonical(fresh.proof) !== canonical(receipt.proof)) fail('operator_capture_state_changed');
    const witness = json(args.provenance); if (hash(witness.bytes) !== fresh.proof.provenanceHash) fail('operator_original_provenance');
    const observedProducer = producer(args, receipt, hash(originalDescriptorBytes)); if (await probePid(observedProducer.pid) !== 'dead') fail('operator_capture_child_not_dead');
    const journal = path.join(d.stateDir, 'receiver/completions.ndjson'), prefix = read(journal), selected = candidate(args, d, opts);
    const w = witness.value;
    const facts = { version: 1, witnessHash: hash(witness.bytes), sourceThread: w.sourceThread, sourceTurn: w.sourceTurn, sourceCommandItem: w.sourceCommandItem, originalManagedPid: w.managedProcess.pid, originalManagedExitCode: w.managedProcess.exitCode, originalDelivered: true, originalTimeout: 'host_callback_timeout', mutatingCommands: w.observations.mutatingCommands, files: w.files.map(file => ({ name: path.posix.basename(file.file), sha256: file.sha256 })), producer: observedProducer };
    const observedOwner = openOwner(path.join(d.stateDir, 'receiver/owner')); let ownerObservation;
    try { ownerObservation = observedOwner.observation; } finally { io.closeSync(observedOwner.fd); }
    const seal = { version: 1, sourceAHash: A_HASH, historicalDescriptorHash: hash(originalDescriptorBytes), oldCepDir: opts.cepDir, journalPrefix: prefix.toString('base64'), capture: receipt, facts, candidate: selected.facts, ownerObservation };
    const release = JSON.parse(read(path.join(d.releaseDir, 'release.json'))), semantic = semantics.validateCaptureSeal(seal, { descriptor: d, descriptorHash: hash(originalDescriptorBytes), release }, prefix);
    return { opts, d, scope: scopeFor(d, args.descriptor), seal, semantic, prefix, journal, pkg: selected.pkg, proofHash: hash(seal), captureHash: hash(captureBytes), descriptorBytes: originalDescriptorBytes };
  }
  async function inspect(args) { const one = await inspectState(args), two = await inspectState(args); if (one.proofHash !== two.proofHash) fail('operator_proof_changed'); return { inspectionOnly: true, proofHash: two.proofHash, candidatePackageHash: two.pkg.packageHash, operation: 'terminal-read-failure-disposition-and-install', aeAuthority: false }; }
  function durable(file, value) { const bytes = Buffer.from(canonical(value)), fd = io.openSync(file, 'wx'); try { if (io.writeSync(fd, bytes) !== bytes.length) fail('operator_short_write'); io.fsyncSync(fd); } finally { io.closeSync(fd); } if (!io.readFileSync(file).equals(bytes)) fail('operator_durable_readback'); }
  async function authorization(body) {
    if (typeof process.send !== 'function' || !process.connected || !process.channel) fail('parent_ipc_required');
    let phase = 'waiting', seen = false, invalid = null, timer, waitCleanup = () => {};
    const capabilities = new WeakSet();
    const request = { event: 'native_read_disposition_authorization', version: 1, operation: body.operation, nonce: body.nonce, proofHash: body.proofHash, candidatePackageHash: body.candidatePackageHash, installTransactionId: body.installTransactionId, appliedDescriptorHash: body.appliedDescriptorHash, preparedPlanHash: body.preparedPlanHash, preparedStateHash: body.preparedStateHash, dispositionTransactionId: body.dispositionTransactionId, operatorClosureHash: body.operatorClosureHash };
    const wait = new Promise((resolve, reject) => {
      function rejectProtocol(code) { invalid = Object.assign(new Error(code), { code }); reject(invalid); }
      const onMessage = (message, handle) => {
        if (seen || phase !== 'waiting') { rejectProtocol('parent_ipc_duplicate'); return; } seen = true;
        try { if (handle || Buffer.byteLength(canonical(message)) > 4096) fail('parent_ipc_message'); exact(message, ['version', 'operation', 'nonce', 'proofHash', 'candidatePackageHash', 'installTransactionId', 'appliedDescriptorHash', 'preparedPlanHash', 'preparedStateHash', 'dispositionTransactionId', 'operatorClosureHash', 'decision']); equal(message, { ...Object.fromEntries(Object.entries(request).filter(([key]) => key !== 'event')), decision: 'approve' }, 'parent_ipc_mismatch'); }
        catch (e) { rejectProtocol(e.code || 'parent_ipc_message'); return; }
        phase = 'approved'; clearTimeout(timer); const capability = Object.freeze({}); capabilities.add(capability); setImmediate(() => resolve(capability));
      };
      const onDisconnect = () => rejectProtocol('parent_ipc_disconnected');
      process.on('message', onMessage); process.on('disconnect', onDisconnect);
      waitCleanup = () => { process.off('message', onMessage); process.off('disconnect', onDisconnect); clearTimeout(timer); };
      timer = setTimeout(() => rejectProtocol('parent_ipc_timeout'), ipcTimeoutMs);
      process.send(request, error => { if (error) rejectProtocol('parent_ipc_send_failed'); });
      // Cleanup stays private; no capability is serialized.
    });
    try { const cap = await wait; return { consume() { if (invalid || !process.connected || phase !== 'approved' || !capabilities.has(cap)) throw invalid || Object.assign(new Error('parent_ipc_capability'), { code: 'parent_ipc_capability' }); capabilities.delete(cap); phase = 'consumed'; }, async checkpoint() { await new Promise(resolve => setImmediate(resolve)); if (invalid || !process.connected) throw invalid || Object.assign(new Error('parent_ipc_disconnected'), { code: 'parent_ipc_disconnected' }); }, close() { phase = 'completed'; waitCleanup(); } }; }
    catch (e) { waitCleanup?.(); throw e; }
  }
  async function apply(args) {
    if (!operatorClosure || !operatorClosures.has(operatorClosure) || operatorClosures.get(operatorClosure).root !== operatorRoot) fail('operator_reviewed_closure_required');
    if (typeof process.send !== 'function' || !process.connected || !process.channel) fail('parent_ipc_required');
    if (!HASH.test(args.expectedProofHash)) fail('operator_expected_proof_required');
    const initial = await inspectState(args); if (initial.proofHash !== args.expectedProofHash) fail('operator_proof_changed');
    const lease = leaseApi.acquireInstallLease(initial.scope); let changed = true, transaction, authorizationState, heldOwner;
    try {
      heldOwner = openOwner(initial.seal.ownerObservation.path); equal(heldOwner.observation, initial.seal.ownerObservation, 'operator_owner_identity_changed');
      const current = await inspectState(args, lease); if (current.proofHash !== args.expectedProofHash) fail('operator_proof_changed'); leaseApi.checkpointInstallLease(lease, 'validated');
      const plan = planInstall({ pkg: current.pkg, nodePath: current.d.nodePath, installRoot: current.d.installRoot, extensionsDir: path.dirname(current.opts.cepDir), configPath: current.opts.config, machineId: current.d.machineId });
      // Operational PRIVATE installation storage only: preserve exact random
      // new descriptor/keys/plan before approval/append. No auto resume or
      // JSON-to-brand rehydration exists; a crash stays fenced for later review.
      changed = true; const prepared = prepareInstallPlan(plan, { lease });
      const dispositionTransactionId = crypto.randomUUID(); transaction = path.join(current.d.installRoot, 'transactions', dispositionTransactionId + '-native-read-disposition');
      const body = { domain: DOMAIN, version: 1, operation: 'terminal-read-failure-disposition-and-install', proofHash: current.proofHash, nonce: crypto.randomBytes(32).toString('hex'), operatorClosureHash: operatorClosure.hash, installationId: current.d.installationId, receiverStoreIdentity: current.semantic.binding.receiverStoreIdentity, commandId: current.semantic.command.commandId, journalPrefixHash: current.semantic.journalPrefixHash, journalTailHash: current.semantic.journalTailHash, historicalDescriptorHash: hash(current.descriptorBytes), candidatePackageHash: plan.pkg.packageHash, installTransactionId: plan.transactionId, appliedDescriptorHash: prepared.appliedDescriptorHash, preparedPlanHash: prepared.preparedPlanHash, preparedStateHash: prepared.preparedStateHash, dispositionTransactionId };
      authorizationState = await authorization(body);
      const fresh = await inspectState(args, lease); if (fresh.proofHash !== current.proofHash) fail('operator_proof_changed');
      ownerCas(heldOwner);
      authorizationState.consume(); await authorizationState.checkpoint();
      const controlMac = crypto.createHmac('sha256', current.d.controlToken).update(canonical({ domain: DOMAIN, seal: current.seal, authorization: body })).digest('hex');
      const eventBody = { type: 'terminal-read-failure-disposition', dispositionVersion: 1, commandId: body.commandId, seal: current.seal, authorization: body, controlMac, seq: 4, previousHash: body.journalTailHash }, event = { ...eventBody, recordHash: hash(eventBody) };
      inspectPreparedDisposition(event, { descriptorPath: args.descriptor, cepDir: current.opts.cepDir, journalPrefixBytes: current.prefix, plan, lease });
      io.mkdirSync(transaction); durable(path.join(transaction, 'intent.json'), { version: 1, operation: body.operation, proofHash: current.proofHash, authorization: body, candidatePackageHash: plan.pkg.packageHash, installTransactionId: plan.transactionId, state: 'append-not-certified' });
      await authorizationState.checkpoint(); leaseApi.assertInstallLease(lease, current.scope);
      if (!io.readFileSync(current.journal).equals(current.prefix)) fail('operator_journal_changed');
      ownerCas(heldOwner);
      const line = Buffer.from(canonical(event) + '\n'); if (line.length > 256 * 1024) fail('operator_record_budget'); const fd = io.openSync(current.journal, 'a');
      try { if (io.writeSync(fd, line) !== line.length) fail('operator_append_short_write'); io.fsyncSync(fd); } finally { io.closeSync(fd); }
      if (!io.readFileSync(current.journal).equals(Buffer.concat([current.prefix, line]))) fail('operator_append_readback');
      assertPreparedInstallPlan(plan); inspectPreparedDisposition(event, { descriptorPath: args.descriptor, cepDir: current.opts.cepDir, journalPrefixBytes: current.prefix, plan, lease });
      leaseApi.checkpointInstallLease(lease, 'disposition-appended', { journalHash: hash(io.readFileSync(current.journal)) });
      await authorizationState.checkpoint();
      const owner = path.join(current.d.stateDir, 'receiver/owner'); ownerCas(heldOwner); if (hash(io.readFileSync(current.journal)) !== leaseApi.assertInstallLease(lease, current.scope).checkpoint.journalHash) fail('operator_owner_or_journal_changed');
      const archivedOwner = path.join(transaction, 'receiver-owner'); if (io.lstatSync(owner).dev !== io.lstatSync(transaction).dev) fail('operator_archive_filesystem'); io.renameSync(owner, archivedOwner);
      ownerCas(heldOwner, archivedOwner, true);
      const ownerFd = io.openSync(archivedOwner, 'r+'); try { io.fsyncSync(ownerFd); } finally { io.closeSync(ownerFd); }
      ownerCas(heldOwner, archivedOwner, true);
      if (io.existsSync(owner) || io.readFileSync(archivedOwner).length !== 0) fail('operator_owner_archive_readback');
      leaseApi.checkpointInstallLease(lease, 'receiver-archived', { journalHash: hash(io.readFileSync(current.journal)), archivedOwnerHash: hash(io.readFileSync(archivedOwner)) });
      await authorizationState.checkpoint(); const installed = applyInstall(plan, { lease });
      await authorizationState.checkpoint(); semantics.assertReceiverJournalSettled({ directory: path.dirname(current.journal), descriptorPath: args.descriptor });
      installation.verifyInstallation(args.descriptor); durable(path.join(transaction, 'completion.json'), { version: 1, operation: body.operation, proofHash: current.proofHash, installTransactionId: plan.transactionId, packageHash: plan.pkg.packageHash, state: 'completed', originalState: 'unknown', noReplay: true });
      authorizationState.close(); authorizationState = null; io.closeSync(heldOwner.fd); heldOwner = undefined; leaseApi.releaseInstallLease(lease);
      return { disposedTerminalReadFailure: true, installed: true, transaction, installTransactionFile: installed.transactionFile, packageHash: plan.pkg.packageHash, proofHash: current.proofHash, originalState: 'unknown', aeAuthority: false, requiresFreshCepView: true };
    } catch (e) { if (changed) { leaseApi.retainInstallLease(lease); e.leaseRetained = true; if (transaction) e.transaction = transaction; } else { leaseApi.releaseInstallLease(lease); } throw e; }
    finally { authorizationState?.close(); if (heldOwner) { try { io.closeSync(heldOwner.fd); } catch { leaseApi.retainInstallLease(lease); } } }
  }
  return Object.freeze({ inspect, apply });
}
if (require.main === module) {
  const args = process.argv.slice(2), flags = args.slice(1).filter((_, i) => i % 2 === 0), get = f => args[args.indexOf(f) + 1], allowed = ['--operator-hash', '--installation', '--provenance', '--capture', '--producer-session', '--producer-driver', '--inspection', '--package', '--expected-package-hash', '--expected-proof-hash', '--cep-dir', '--config'];
  const required = ['--operator-hash', '--installation', '--provenance', '--capture', '--producer-session', '--producer-driver', '--inspection', '--package', '--expected-package-hash'];
  if (!['inspect', 'apply'].includes(args[0]) || args.length % 2 !== 1 || new Set(flags).size !== flags.length || flags.some(f => !allowed.includes(f)) || required.some(f => !flags.includes(f)) || args[0] === 'apply' && !flags.includes('--expected-proof-hash')) { process.stderr.write('dispose-native-read inspect|apply --operator-hash SHA --installation ABS --provenance ABS --capture ABS_RECEIPT --producer-session ABS --producer-driver ABS --inspection ABS --package ABS --expected-package-hash SHA [--expected-proof-hash SHA] [--cep-dir ABS] [--config ABS]\n'); process.exitCode = 2; }
  else {
    try { const operatorRoot = path.resolve(__dirname, '..'), operatorClosure = verifyOperatorClosure(operatorRoot, get('--operator-hash')), options = { descriptor: get('--installation'), provenance: get('--provenance'), capture: get('--capture'), producerSession: get('--producer-session'), producerDriver: get('--producer-driver'), inspection: get('--inspection'), package: get('--package'), expectedPackageHash: get('--expected-package-hash'), ...(flags.includes('--expected-proof-hash') ? { expectedProofHash: get('--expected-proof-hash') } : {}), ...(flags.includes('--cep-dir') ? { cepDir: get('--cep-dir') } : {}), ...(flags.includes('--config') ? { config: get('--config') } : {}) }; const op = createDispositionOperator({ operatorRoot, operatorClosure }); op[args[0]](options).then(value => { console.log(canonical(value)); if (process.connected) process.disconnect(); }).catch(e => { process.stderr.write(canonical({ error: e.code || 'disposition_failed', ...(e.transaction ? { transaction: e.transaction } : {}), ...(e.leaseRetained ? { leaseRetained: true } : {}) }) + '\n'); process.exitCode = 1; if (process.connected) process.disconnect(); }); }
    catch (e) { process.stderr.write(canonical({ error: e.code || 'disposition_failed' }) + '\n'); process.exitCode = 1; }
  }
}
module.exports = { createDispositionOperator, verifyOperatorClosure };
