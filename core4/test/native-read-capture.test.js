'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { hash, canonical } = require('../protocol/json');
const { dispatchBinding } = require('../protocol/dispatch');
const { buildPackage } = require('../tools/package-installable');
const { planInstall, applyInstall } = require('../tools/install-core4');
const { legacyV1Data } = require('./fixtures/legacy-installation-v1');
const { createCapture, PROCESS_PROBE } = require('../tools/capture-native-read');
const root = path.resolve(__dirname, '..');
const failure = { readFailureVersion: 1, outcome: 'rejected', code: 'host_registry_unavailable' };
function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'core4-native-capture-')), evidenceRoot = path.join(directory, 'evidence'); fs.mkdirSync(evidenceRoot);
  const pkg = buildPackage(), config = path.join(directory, 'project/.codex/config.toml');
  const plan = planInstall({ pkg, nodePath: fs.realpathSync(process.execPath), installRoot: path.join(directory, 'AEAgentCore4'), extensionsDir: path.join(directory, 'extensions'), configPath: config, machineId: os.hostname() });
  const installed = legacyV1Data(plan), descriptor = installed.descriptorPath, d = JSON.parse(fs.readFileSync(descriptor)), receiver = path.join(d.stateDir, 'receiver'), broker = path.join(d.stateDir, 'broker'); fs.mkdirSync(receiver); fs.mkdirSync(broker);
  // Real Broker constructor layout, including one stale identity. Contents are
  // copied as fixture DATA and deliberately never imported from this cache.
  const core = JSON.parse(Buffer.from(pkg.files['core/artifact.json'], 'base64')), stalePkg = structuredClone(pkg), staleCore = structuredClone(core);
  const staleSource = Buffer.from(stalePkg.files['core/broker.js'], 'base64').toString() + '\n// inert historical fixture code copy\n'; stalePkg.files['core/broker.js'] = Buffer.from(staleSource).toString('base64'); staleCore.hashes['core/broker.js'] = hash(staleSource);
  const staleManifestBytes = JSON.stringify(staleCore, null, 2) + '\n'; stalePkg.files['core/artifact.json'] = Buffer.from(staleManifestBytes).toString('base64'); stalePkg.release.hashes['core/broker.js'] = hash(staleSource); stalePkg.release.hashes['core/artifact.json'] = hash(staleManifestBytes); stalePkg.packageHash = hash(stalePkg.release);
  const staleRelease = path.join(d.installRoot, 'releases', stalePkg.packageHash); for (const [file, encoded] of Object.entries(stalePkg.files)) { const target = path.join(staleRelease, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, Buffer.from(encoded, 'base64')); } fs.writeFileSync(path.join(staleRelease, 'release.json'), canonical(stalePkg.release));
  const cacheRoot = path.join(broker, 'artifacts'), caches = [hash(core), hash(staleCore)];
  for (const [index, identity] of caches.entries()) for (const file of Object.keys(core.hashes)) { const target = path.join(cacheRoot, 'core-' + identity, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, Buffer.from((index ? stalePkg : pkg).files[file], 'base64')); }
  const admission = JSON.parse(Buffer.from(pkg.files['modules/project-inspection/artifact.json'], 'base64')), contract = JSON.parse(Buffer.from(pkg.files['modules/project-inspection/contract.json'], 'base64'));
  const command = { protocolVersion: 1, controllerId: 'original-controller', channelEpoch: 'original-http-epoch', commandId: 'inspect-original', moduleId: 'project-inspection', operationId: 'inspect', executorHash: admission.executorHash, phase: 'inspect', payloadHash: hash(canonical({})), payload: {} };
  const identity = 'receiver-store-offline-fixture', binding = dispatchBinding(command, identity), events = [];
  function event(value) { const body = { ...value, seq: events.length + 1, previousHash: events.at(-1)?.recordHash || 'origin' }; events.push({ ...body, recordHash: hash(body) }); }
  event({ type: 'origin', identity }); event({ type: 'begin', commandId: command.commandId, commandDigest: hash(command), command, originalBinding: binding }); event({ type: 'unknown', commandId: command.commandId });
  const journal = path.join(receiver, 'completions.ndjson'), owner = path.join(receiver, 'owner'); fs.writeFileSync(journal, events.map(canonical).join('\n') + '\n'); fs.writeFileSync(owner, '');
  const start = new Date(Date.now() - 60000).toISOString(), end = new Date(Date.now() - 30000).toISOString(), pid = 123456789;
  const contractId = hash({ packageHash: d.packageHash, admission, contract });
  const status = { pid, installation: { installationId: d.installationId, packageHash: d.packageHash, machineId: d.machineId }, ledgerFault: false, ownershipFault: null, unresolved: [], worker: { pid: null, pending: 0 }, physical: { receiverStoreIdentity: identity, storeFault: false, storeClosed: false, pending: null, unknown: false } };
  const content = value => ({ result: { content: [{ type: 'text', text: canonical(value) }], isError: false } });
  const request = (id, name, payload) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: payload ? { payload } : {} } });
  const requests = [request(2, 'core_status'), request(3, 'get_module_contract', { moduleId: 'project-inspection' }), request(4, 'inspect_module_target', { moduleId: 'project-inspection', contractId: 'invalid', target: {} }), request(5, 'inspect_module_target', { moduleId: 'project-inspection', contractId, target: {} }), request(6, 'core_status'), request(8, 'core_status')];
  const replies = [{ id: 2, ...content(status) }, { id: 3, ...content({ contract, contractId, modulePin: hash(admission) }) }, { id: 4, error: { message: 'contract_required' } }, { id: 6, ...content({ ...status, physical: { ...status.physical, pending: { commandId: command.commandId, delivered: true } } }) }, { id: 5, error: { message: 'host_callback_timeout' } }, { id: 8, ...content({ ...status, physical: { ...status.physical, storeClosed: true, unknown: true } }) }];
  const managed = { sourceThread: 'fixture-thread', sourceTurn: 'fixture-turn', item: { type: 'commandExecution', id: 'fixture-command-item', command: d.nodePath + ' original-client.js ' + d.packageHash, cwd: evidenceRoot, status: 'completed', exitCode: 0, output: { truncated: false, text: JSON.stringify({ proof: 'child_started', pid, packageHash: d.packageHash }) } } };
  const evidence = { 'context.json': JSON.stringify({ at: start, packageHash: d.packageHash, automaticNativeDispatch: false, recordContext: { purpose: 'technical_check', lifetime: 'ephemeral_check' } }), 'requests.jsonl': requests.map(canonical).join('\n') + '\n', 'stdio.raw.jsonl': replies.map(canonical).join('\n') + '\n', 'exit.jsonl': canonical({ at: end, code: 0, signal: null }) + '\n', 'original-managed-command-evidence.json': JSON.stringify(managed), 'original-receiver-journal.jsonl': fs.readFileSync(journal) };
  for (const [name, bytes] of Object.entries(evidence)) fs.writeFileSync(path.join(evidenceRoot, name), bytes);
  const provenance = path.join(evidenceRoot, 'provenance.json'), witness = { version: 1, evidenceOnly: true, authority: false, sourceThread: managed.sourceThread, sourceTurn: managed.sourceTurn, sourceCommandItem: managed.item.id, managedProcess: { pid, contextBeforeSpawn: start, endedByUtc: end, exitCode: 0, packageHash: d.packageHash }, installationId: d.installationId, receiverStoreIdentity: identity, journalHash: hash(fs.readFileSync(journal)), originalCommand: command, originalBinding: binding, observations: { preDispatchStatus: 2, contractReply: 3, definiteRefusal: 4, soleDispatchedRequest: 5, deliveredStatus: 6, postTimeoutStatus: 8, successfulNativeReads: 0, mutatingCommands: 0 }, files: Object.keys(evidence).map(file => ({ file, sha256: hash(fs.readFileSync(path.join(evidenceRoot, file))) })) };
  fs.writeFileSync(provenance, canonical(witness));
  const args = { descriptor, provenance, cepDir: plan.cepDir, config, evidenceRoot }, probes = { probePid: () => 'dead', probePort: () => 'absent', probeProcesses: async (_, __, paths) => ({ version: 1, matchedPids: [], pathsChecked: paths.length, observedAt: new Date().toISOString() }) };
  const pins = { packageHash: d.packageHash, installationId: d.installationId, executorHash: command.executorHash }, frame = { assetKey: 'project-inspection-v1', phase: 'inspect', typedPayload: {}, commandId: command.commandId, originalBinding: binding, pins };
  function bytes() { return Object.fromEntries([descriptor, config, journal, owner, path.join(d.installRoot, 'origin.json'), path.join(d.stateDir, 'origin.json'), ...caches.flatMap(identity => Object.keys(core.hashes).map(file => path.join(cacheRoot, 'core-' + identity, file))), ...Object.keys(pkg.files).filter(f => f.startsWith('cep/')).map(f => path.join(plan.cepDir, f.slice(4))), path.join(plan.cepDir, 'installation.js')].map(f => [f, fs.readFileSync(f).toString('base64')])); }
  return { directory, evidenceRoot, pkg, args, d, probes, witness, command, binding, pins, frame, journal, owner, broker, receiver, cacheRoot, caches, core, stalePkg, staleRelease, bytes, gates: [path.join(d.installRoot, 'install.lock'), path.join(broker, 'broker-owner.gate')] };
}
function operator(f, extra = {}) { return createCapture({ ...f.probes, port: 0, ...extra }); }
async function start(f, op = operator(f)) {
  const proof = await op.inspect(f.args), pending = op.capture({ ...f.args, expectedProofHash: proof.proofHash });
  const outcome = pending.then(value => ({ value }), error => ({ error }));
  for (let i = 0; i < 1000 && !op.status().listening; i++) { const result = await Promise.race([outcome, new Promise(r => setTimeout(() => r(null), 5))]); if (result) throw result.error || new Error('capture ended before listening'); }
  assert.ok(op.status().listening); return { op, proof, pending, outcome, port: op.status().port };
}
function raw(port, route, body, { origin = 'null', headers = {}, method = 'POST' } = {}) {
  const h = { Origin: origin, 'Content-Type': 'application/json', ...headers }; for (const k of Object.keys(h)) if (h[k] === undefined) delete h[k];
  return new Promise((resolve, reject) => { const req = http.request('http://127.0.0.1:' + port + route, { method, agent: false, headers: h }, res => { let text = ''; res.on('data', b => text += b); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, value: text ? JSON.parse(text) : null })); }); req.on('error', reject); req.end(body === undefined ? undefined : canonical(body)); });
}
function hmac(value, token) { return require('node:crypto').createHmac('sha256', token).update(canonical(value)).digest('hex'); }
async function linked(f, port, origin = 'null') {
  const challenge = (await raw(port, '/challenge', { role: 'panel' }, { origin })).value, peerId = 'fixture-panel';
  const response = await raw(port, '/link', { challenge, peerId, proof: hmac({ challenge, peerId }, f.d.panelToken) }, { origin }); assert.equal(response.status, 200); assert.equal(response.value.body.laneClosed, true);
  function envelope(payload, sequence = 1) { const body = { epoch: challenge.epoch, peerId, sequence, method: 'POST', path: '/complete', payload }; return { body, mac: hmac(body, f.d.panelToken) }; }
  return { challenge, envelope, receipt: { commandId: f.command.commandId, originalBinding: f.binding, pins: f.pins, result: failure } };
}
async function panel(f, port, { origin = 'null', latch = 'result' } = {}) {
  const key = 'aeagentcore4-physical-' + f.d.installationId, map = new Map(), calls = []; let evals = 0, finish;
  if (latch !== 'none') map.set(key, canonical({ frame: f.frame, ...(latch === 'result' ? { result: failure } : {}) }));
  const before = map.get(key), storage = { getItem: k => map.get(k) || null, setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) }, elements = { status: {}, detail: {}, connect: { addEventListener() {}, set disabled(v) { if (!v) finish(); } } };
  const done = new Promise(r => { finish = r; });
  const context = vm.createContext({ crypto: webcrypto, TextEncoder, Uint8Array, localStorage: storage, document: { getElementById: k => elements[k] }, __adobe_cep__: { evalScript() { evals++; throw new Error('unexpected native call'); } },
    fetch: async (url, options) => { const route = new URL(url).pathname; calls.push(route); const response = await raw(port, route, JSON.parse(options.body), { origin }); return { ok: response.status < 400, status: response.status, json: async () => response.value }; }
  });
  vm.runInContext('window=this;', context); vm.runInContext(fs.readFileSync(path.join(f.args.cepDir, 'installation.js'), 'utf8'), context); vm.runInContext(fs.readFileSync(path.join(root, 'cep/js/poll-dispatcher.js'), 'utf8'), context); vm.runInContext(fs.readFileSync(path.join(root, 'cep/js/panel.js'), 'utf8'), context); await done;
  return { before, after: map.get(key), calls, evals, status: elements.status.textContent };
}
test('native-read-capture inspect is pure/stable; actual panel and dispatcher cached recover posts once with no ACK/eval/poll and unchanged protected bytes', async () => {
  for (const origin of ['null', 'file://']) {
    const f = fixture(), events = [], op = operator(f, { onListening: event => { assert.ok(Object.isFrozen(event)); events.push(event); } }), before = f.bytes(), first = await op.inspect(f.args), second = await op.inspect(f.args); assert.equal(first.proofHash, second.proofHash); assert.deepEqual(f.bytes(), before); assert.equal(f.gates.some(fs.existsSync), false); assert.equal(events.length, 0);
    const running = await start(f, op), p = await panel(f, running.port, { origin }), captured = await running.pending;
    assert.equal(events.length, 1); equal(events[0], { event: 'capture_listening', proofHash: first.proofHash, port: running.port, transaction: captured.transaction }); assert.ok(!JSON.stringify(events).includes(f.d.panelToken)); assert.ok(!JSON.stringify(events).includes(f.d.controlToken));
    assert.equal(p.evals, 0); assert.deepEqual(p.calls, ['/challenge', '/link', '/complete']); assert.equal(p.after, p.before); assert.match(p.status, /capture_recorded_no_ack/); assert.equal(captured.ack, false); assert.equal(captured.unknownUnchanged, true); assert.deepEqual(f.bytes(), before); assert.equal(f.gates.some(fs.existsSync), false);
    const bytes = fs.readFileSync(path.join(captured.transaction, 'receipt.json'), 'utf8'), receipt = JSON.parse(bytes); assert.equal(hash(bytes), captured.receiptHash); assert.ok(!bytes.includes(f.d.panelToken)); assert.ok(!bytes.includes(f.d.controlToken));
    assert.equal(receipt.transcript.length, 3); assert.equal(receipt.transcript[0].response.origin, origin); assert.notEqual(receipt.transcript[0].response.epoch, f.command.channelEpoch); assert.equal(receipt.transcript[0].response.purpose, 'native-read-evidence-capture-v1'); assert.equal(receipt.transcript[2].request.body.sequence, 1); assert.equal(receipt.transcript[2].request.mac, hmac(receipt.transcript[2].request.body, f.d.panelToken)); equal(receipt.proof.originalBinding, f.binding);
  }
});
function equal(a, b) { assert.equal(canonical(a), canonical(b)); }
test('native-read-capture missing result or latch uses bounded linked timeout, preserves latch and UNKNOWN and does not guess the cause', async () => {
  for (const latch of ['none', 'no-result']) { const f = fixture(), before = f.bytes(), running = await start(f, operator(f, { completionTimeoutMs: 100, globalTimeoutMs: 2000 })), p = await panel(f, running.port, { latch }); const result = await running.outcome;
    assert.equal(result.error.code, 'capture_completion_not_received'); assert.equal(p.evals, 0); assert.deepEqual(p.calls, ['/challenge', '/link']); assert.equal(p.after, p.before); assert.deepEqual(f.bytes(), before); assert.equal(f.gates.every(fs.existsSync), true); assert.equal(fs.existsSync(path.join(result.error.transaction, 'receipt.json')), false);
  }
});
test('native-read-capture ingress/MAC/role/sequence/original binding gates reject before an admitted one-shot receipt', async () => {
  const f = fixture(), before = f.bytes(), running = await start(f), port = running.port;
  for (const origin of [undefined, '', 'NULL', 'file:///', 'https://example.test', 'null, file://']) { const r = await raw(port, '/challenge', { role: 'panel' }, { headers: { Origin: origin } }); assert.equal(r.value.error, 'cep_origin_required'); assert.equal(r.headers['access-control-allow-origin'], undefined); }
  const wrongHost = await raw(port, '/challenge', { role: 'panel' }, { headers: { Host: 'localhost:' + port } }); assert.equal(wrongHost.value.error, 'loopback_host_required'); assert.equal(wrongHost.headers['access-control-allow-origin'], undefined);
  const control = (await raw(port, '/challenge', { role: 'control' })).value, peerId = 'control';
  assert.equal((await raw(port, '/link', { challenge: control, peerId, proof: hmac({ challenge: control, peerId }, f.d.controlToken) })).value.error, 'panel_role_required');
  const c = await linked(f, port); assert.equal((await raw(port, '/poll', {})).value.error, 'capture_route_denied');
  const badSequence = c.envelope(c.receipt, 2); assert.equal((await raw(port, '/complete', badSequence)).value.error, 'peer_auth_or_replay');
  const badMac = c.envelope(c.receipt); badMac.mac = '0'.repeat(64); assert.equal((await raw(port, '/complete', badMac)).value.error, 'peer_auth_or_replay');
  assert.equal((await raw(port, '/complete', c.envelope(c.receipt), { origin: 'file://' })).value.error, 'peer_auth_or_replay');
  const accepted = await raw(port, '/complete', c.envelope(c.receipt)); assert.equal(accepted.value.error, 'capture_recorded_no_ack'); await running.pending; assert.deepEqual(f.bytes(), before);
});
test('native-read-capture authenticated wrong binding/pins/result consumes the sole receipt attempt and never ACKs or writes receipt', async () => {
  for (const change of [r => { r.commandId = 'other'; }, r => { r.originalBinding.receiptRef = '0'.repeat(64); }, r => { r.pins.packageHash = '1'.repeat(64); }, r => { r.result.code = 'inspection_failed'; }, r => { r.result.extra = true; }]) {
    const f = fixture(), before = f.bytes(), running = await start(f), c = await linked(f, running.port), receipt = structuredClone(c.receipt); change(receipt);
    const response = await raw(running.port, '/complete', c.envelope(receipt)); assert.equal(response.status, 403); assert.equal(response.value.ack, undefined); const result = await running.outcome; assert.ok(result.error); assert.deepEqual(f.bytes(), before); assert.equal(fs.existsSync(path.join(result.error.transaction, 'receipt.json')), false); assert.equal(f.gates.every(fs.existsSync), true);
  }
});
test('native-read-capture rejects active/unknown probes, gates/ledger/owner, damaged CEP/evidence and junctions before listener', async () => {
  const f = fixture(), before = f.bytes();
  for (const probes of [{ probePid: () => 'alive' }, { probePid: () => 'unknown' }, { probePort: () => 'active' }, { probePort: () => 'unknown' }, { probeProcesses: async () => ({ version: 1, matchedPids: [4], pathsChecked: 0, observedAt: new Date().toISOString() }) }]) await assert.rejects(operator(f, probes).inspect(f.args), /capture_(pid_not_dead|port_not_absent|processes_unknown_or_active)/);
  for (const file of [path.join(f.broker, 'ledger.ndjson'), path.join(f.broker, 'broker-owner.lock'), ...f.gates]) { fs.writeFileSync(file, ''); await assert.rejects(operator(f).inspect(f.args), /capture_(other_obligations|gate_unavailable)/); fs.unlinkSync(file); }
  fs.writeFileSync(f.owner, 'unknown'); await assert.rejects(operator(f).inspect(f.args), /capture_owner_nonempty/); fs.writeFileSync(f.owner, '');
  const extra = path.join(f.args.cepDir, 'extra.js'); fs.writeFileSync(extra, 'extra'); await assert.rejects(operator(f).inspect(f.args), /capture_tree_mismatch/); fs.unlinkSync(extra);
  const generated = path.join(f.args.cepDir, 'installation.js'), original = fs.readFileSync(generated); fs.appendFileSync(generated, '\n'); await assert.rejects(operator(f).inspect(f.args), /capture_tree_bytes/); fs.writeFileSync(generated, original);
  const witnessBytes = fs.readFileSync(f.args.provenance); fs.writeFileSync(f.args.provenance, canonical({ ...f.witness, originalCommand: { ...f.command, phase: 'mutate' } })); await assert.rejects(operator(f).inspect(f.args), /capture_binding/); fs.writeFileSync(f.args.provenance, witnessBytes);
  const target = path.join(f.directory, 'receiver-target'); assert.ok(target.startsWith(f.directory + path.sep)); fs.renameSync(f.receiver, target); fs.symlinkSync(target, f.receiver, process.platform === 'win32' ? 'junction' : 'dir'); await assert.rejects(operator(f).inspect(f.args), /capture_symlink_or_reparse/); fs.unlinkSync(f.receiver); fs.renameSync(target, f.receiver); assert.deepEqual(f.bytes(), before);
});
test('native-read-capture CAS/short write/fsync/readback failure retains ambiguous gates without changing protected bytes', async () => {
  const f = fixture(), normal = operator(f), proof = await normal.inspect(f.args), before = f.bytes();
  await assert.rejects(normal.capture({ ...f.args, expectedProofHash: '0'.repeat(64) }), /capture_proof_changed/); assert.equal(f.gates.some(fs.existsSync), false);
  for (const mode of ['short', 'fsync', 'readback']) {
    const g = fixture(), before = g.bytes(), io = Object.create(fs), fdPaths = new Map();
    io.openSync = (file, flags, ...rest) => { const fd = fs.openSync(file, flags, ...rest); fdPaths.set(fd, file); return fd; };
    io.writeSync = (fd, data, ...rest) => { if (mode === 'short' && fdPaths.get(fd)?.endsWith('intent.json')) return fs.writeSync(fd, data.slice(0, -1), ...rest); return fs.writeSync(fd, data, ...rest); };
    io.fsyncSync = fd => { if (mode === 'fsync' && fdPaths.get(fd)?.endsWith('intent.json')) throw Object.assign(new Error('injected'), { code: 'EIO' }); return fs.fsyncSync(fd); };
    io.readFileSync = (file, ...rest) => mode === 'readback' && String(file).endsWith('intent.json') ? Buffer.from('wrong') : fs.readFileSync(file, ...rest);
    const op = operator(g, { io }), p = await op.inspect(g.args); await assert.rejects(op.capture({ ...g.args, expectedProofHash: p.proofHash }), /capture_short_write|injected|capture_durable_readback/); assert.equal(g.gates.every(fs.existsSync), true); assert.deepEqual(g.bytes(), before);
  }
  fs.appendFileSync(f.args.config, '# drift\n'); await assert.rejects(normal.capture({ ...f.args, expectedProofHash: proof.proofHash }), /capture_proof_changed/); assert.ok(fs.readFileSync(f.journal).toString('base64') === before[f.journal]);
});
test('native-read-capture fixed eligibility rejects validly rehashed wrong command journals and any extra obligations', async () => {
  const f = fixture(), original = fs.readFileSync(f.journal), op = operator(f);
  for (const change of [c => { c.phase = 'mutate'; }, c => { c.operationId = 'other'; }, c => { c.moduleId = 'titles-current-target'; }, c => { c.executorHash = '0'.repeat(64); }, c => { c.payloadHash = '1'.repeat(64); }, c => { c.payload.source = 'raw source'; }]) {
    const events = original.toString().trimEnd().split('\n').map(JSON.parse); change(events[1].command); events[1].commandDigest = hash(events[1].command);
    for (let i = 0; i < events.length; i++) { const { recordHash, ...body } = events[i]; body.previousHash = i ? events[i - 1].recordHash : 'origin'; events[i] = { ...body, recordHash: hash(body) }; }
    fs.writeFileSync(f.journal, events.map(canonical).join('\n') + '\n'); await assert.rejects(op.inspect(f.args), /capture_(command_scope|schema)/);
  }
  fs.writeFileSync(f.journal, original);
  for (const file of [path.join(f.broker, 'unclassified-obligation'), path.join(f.receiver, 'other-command'), path.join(f.d.stateDir, 'unknown-state')]) { fs.writeFileSync(file, 'unknown'); await assert.rejects(op.inspect(f.args), /capture_other_obligations/); fs.unlinkSync(file); }
  const changed = structuredClone(f.witness); changed.files[0].file = '../context.json'; fs.writeFileSync(f.args.provenance, canonical(changed)); await assert.rejects(op.inspect(f.args), /capture_evidence_path/);
});
test('native-read-capture receipt durability failures and partial gate writes never certify capture or ACK', async () => {
  for (const mode of ['gate-short', 'receipt-short', 'receipt-fsync', 'receipt-readback']) {
    const f = fixture(), before = f.bytes(), io = Object.create(fs), paths = new Map();
    io.openSync = (file, flags, ...rest) => { const fd = fs.openSync(file, flags, ...rest); paths.set(fd, file); return fd; };
    io.writeSync = (fd, value, ...rest) => { const file = paths.get(fd); if (mode === 'gate-short' && file?.endsWith('install.lock') || mode === 'receipt-short' && file?.endsWith('receipt.json')) return fs.writeSync(fd, value.slice(0, -1), ...rest); return fs.writeSync(fd, value, ...rest); };
    io.fsyncSync = fd => { if (mode === 'receipt-fsync' && paths.get(fd)?.endsWith('receipt.json')) throw Object.assign(new Error('injected receipt fsync'), { code: 'EIO' }); return fs.fsyncSync(fd); };
    io.readFileSync = (file, ...rest) => mode === 'receipt-readback' && String(file).endsWith('receipt.json') ? Buffer.from('unverified') : fs.readFileSync(file, ...rest);
    const op = operator(f, { io });
    if (mode === 'gate-short') { const proof = await op.inspect(f.args); await assert.rejects(op.capture({ ...f.args, expectedProofHash: proof.proofHash }), /capture_gate_short_write/); assert.equal(fs.existsSync(f.gates[0]), true); }
    else { const running = await start(f, op), c = await linked(f, running.port); const response = await raw(running.port, '/complete', c.envelope(c.receipt)); assert.equal(response.status, 403); assert.equal(response.value.ack, undefined); const result = await running.outcome; assert.ok(result.error); assert.equal(f.gates.every(fs.existsSync), true); }
    assert.deepEqual(f.bytes(), before);
  }
});
test('native-read-capture global deadline before link is finite and creates no receipt, retry, ACK or protected-state write', async () => {
  const f = fixture(), before = f.bytes(), running = await start(f, operator(f, { globalTimeoutMs: 100, completionTimeoutMs: 50 })), result = await running.outcome;
  assert.equal(result.error.code, 'capture_deadline_no_receipt'); assert.equal(fs.existsSync(path.join(result.error.transaction, 'receipt.json')), false); assert.equal(f.gates.every(fs.existsSync), true); assert.deepEqual(f.bytes(), before);
});
test('native-read-capture classifies exact current/stale core cache against verified retained release data, never executes it, and CAS protects bytes', async () => {
  const f = fixture(), duplicate = structuredClone(f.stalePkg), css = Buffer.from(duplicate.files['cep/panel.css'], 'base64').toString() + '\n/* another retained package, same core identity */\n';
  duplicate.files['cep/panel.css'] = Buffer.from(css).toString('base64'); duplicate.release.hashes['cep/panel.css'] = hash(css); duplicate.packageHash = hash(duplicate.release);
  const retained = path.join(f.d.installRoot, 'releases', duplicate.packageHash); for (const [file, encoded] of Object.entries(duplicate.files)) { const target = path.join(retained, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, Buffer.from(encoded, 'base64')); } fs.writeFileSync(path.join(retained, 'release.json'), canonical(duplicate.release));
  const op = operator(f), before = f.bytes(), proof = await op.inspect(f.args);
  assert.equal(Object.keys(proof.proof.inertCacheTrees).length, 2);
  for (const identity of f.caches) { const name = 'core-' + identity; assert.equal(Object.keys(proof.proof.inertCacheTrees[name]).length, Object.keys(f.core.hashes).length); assert.equal(proof.proof.cacheClassifications[name].evidenceOnly, true); }
  assert.equal(proof.proof.cacheClassifications['core-' + f.caches[0]].packageHash, f.d.packageHash);
  assert.equal(proof.proof.cacheClassifications['core-' + f.caches[1]].packageHash, [f.stalePkg.packageHash, duplicate.packageHash].sort()[0]);
  const file = path.join(f.cacheRoot, 'core-' + f.caches[0], 'core/broker.js'), bytes = fs.readFileSync(file), sentinel = path.join(f.directory, 'CACHE_EXECUTED');
  fs.appendFileSync(file, '\nrequire("node:fs").writeFileSync(' + JSON.stringify(sentinel) + ',"must not execute");');
  await assert.rejects(op.inspect(f.args), /capture_tree_bytes/); await assert.rejects(op.capture({ ...f.args, expectedProofHash: proof.proofHash }), /capture_tree_bytes/); assert.equal(fs.existsSync(sentinel), false); fs.writeFileSync(file, bytes); assert.deepEqual(f.bytes(), before);
  const running = await start(f, op), c = await linked(f, running.port); fs.appendFileSync(file, '\n// concurrent cache drift\n'); const drifted = f.bytes();
  const response = await raw(running.port, '/complete', c.envelope(c.receipt)); assert.equal(response.status, 403); const result = await running.outcome; assert.equal(result.error.code, 'capture_tree_bytes'); assert.equal(f.gates.every(fs.existsSync), true); assert.deepEqual(f.bytes(), drifted);
});
test('native-read-capture cache extra/stage/unknown/unclassified paths and reparse junctions fail closed as data', async () => {
  const f = fixture(), op = operator(f), before = f.bytes(), cache = path.join(f.cacheRoot, 'core-' + f.caches[0]);
  const extra = path.join(cache, 'core/extra.js'); fs.writeFileSync(extra, 'extra'); await assert.rejects(op.inspect(f.args), /capture_tree_mismatch/); fs.unlinkSync(extra);
  for (const name of ['.stage-core-test', 'modules', 'unknown']) { const full = path.join(f.cacheRoot, name); fs.mkdirSync(full); await assert.rejects(op.inspect(f.args), /capture_cache_shape/); fs.rmdirSync(full); }
  const unknown = path.join(f.cacheRoot, 'core-' + '0'.repeat(64)); fs.mkdirSync(unknown); await assert.rejects(op.inspect(f.args), /capture_cache_unclassified/); fs.rmdirSync(unknown);
  const original = path.join(cache, 'core'), target = path.join(f.directory, 'cache-junction-target'); assert.ok(original.startsWith(f.directory + path.sep)); assert.ok(target.startsWith(f.directory + path.sep)); fs.renameSync(original, target); fs.symlinkSync(target, original, process.platform === 'win32' ? 'junction' : 'dir'); await assert.rejects(op.inspect(f.args), /capture_symlink_or_reparse/); fs.unlinkSync(original); fs.renameSync(target, original);
  const staleFile = path.join(f.staleRelease, 'core/broker.js'), staleBytes = fs.readFileSync(staleFile); fs.appendFileSync(staleFile, '\n// retained data tamper\n'); await assert.rejects(op.inspect(f.args), /capture_tree_bytes/); fs.writeFileSync(staleFile, staleBytes); assert.deepEqual(f.bytes(), before);
});
test('native-read-capture machine binding is actual hostname and Windows nonstandard Node name is refused before probes/readiness', async () => {
  const f = fixture(), descriptor = fs.readFileSync(f.args.descriptor), d = JSON.parse(descriptor), events = [], op = operator(f, { onListening: event => events.push(event) });
  fs.writeFileSync(f.args.descriptor, canonical({ ...d, machineId: os.hostname() + '-foreign' })); await assert.rejects(op.inspect(f.args), /capture_machine_mismatch/); fs.writeFileSync(f.args.descriptor, descriptor);
  if (process.platform === 'win32') { fs.writeFileSync(f.args.descriptor, canonical({ ...d, nodePath: path.join(path.dirname(d.nodePath), 'renamed-node.exe') })); await assert.rejects(op.inspect(f.args), /capture_node_basename/); fs.writeFileSync(f.args.descriptor, descriptor); }
  const proof = await op.inspect(f.args); await assert.rejects(op.capture({ ...f.args, expectedProofHash: '0'.repeat(64) }), /capture_proof_changed/); assert.equal(events.length, 0); assert.equal(op.status().listening, false); assert.equal(f.gates.some(fs.existsSync), false); assert.ok(proof.proofHash);
});
test('native-read-capture Windows probe syntax and UTF8 stdin data exceed environment limits without running CIM or path inspection', { skip: process.platform !== 'win32' }, () => {
  const paths = Array.from({ length: 700 }, (_, n) => 'C:\\fixture-only\\' + 'Данные'.repeat(12) + '-' + n), input = JSON.stringify({ script: PROCESS_PROBE, paths });
  assert.ok(input.length > 32767); assert.ok(Buffer.byteLength(input) < 2 * 1024 * 1024);
  // ParseInput inspects grammar only. The supplied probe is NEVER invoked.
  const script = '$ErrorActionPreference="Stop";[Console]::InputEncoding=New-Object System.Text.UTF8Encoding($false);[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false);$wireData=[Console]::In.ReadToEnd()|ConvertFrom-Json;$wireTokens=$null;$wireErrors=$null;[void][System.Management.Automation.Language.Parser]::ParseInput($wireData.script,[ref]$wireTokens,[ref]$wireErrors);if($wireErrors){throw "probe_syntax_invalid"};[ordered]@{syntaxErrors=0;pathsCount=@($wireData.paths).Count;unicodePreserved=$wireData.paths[0].Contains("Данные");cimExecuted=$false}|ConvertTo-Json -Compress';
  const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const result = spawnSync(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], { input, encoding: 'utf8', windowsHide: true, timeout: 5000 });
  assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stderr); equal(JSON.parse(result.stdout.replace(/^\uFEFF/, '').trim()), { syntaxErrors: 0, pathsCount: 700, unicodePreserved: true, cimExecuted: false });
  assert.ok(PROCESS_PROBE.includes('[Console]::In.ReadToEnd()')); assert.ok(!PROCESS_PROBE.includes('CORE4_CAPTURE_PATHS'));
});
test('native-read-capture same production probe on Windows PowerShell 5.1 validates flat paths and actual fixture Get-Item/reparse with a test-only CIM stub', { skip: process.platform !== 'win32' }, () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'core4-ps51-probe-')), first = path.join(directory, 'Данные[one].txt'), second = path.join(directory, 'second.txt'); fs.writeFileSync(first, 'one'); fs.writeFileSync(second, 'two');
  const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  // Exercise EXACT PROCESS_PROBE, including real Get-Item on fixture-only paths.
  // Function precedence shadows the CIM cmdlet; no actual process inventory runs.
  const prefix = '$ErrorActionPreference="Stop";if($PSVersionTable.PSVersion.Major-ne 5-or $PSVersionTable.PSVersion.Minor-ne 1){throw "fixture_requires_PS51"};$script:fixtureCimCalls=0;function Get-CimInstance {param([string]$ClassName,[string]$Filter) if($ClassName-ne "Win32_Process"-or $Filter-ne "Name = \'node.exe\'"){throw "fixture_stub_contract"};$script:fixtureCimCalls++;@()};';
  const suffix = ';if($script:fixtureCimCalls-ne 1){throw "fixture_stub_not_called_once"};[ordered]@{testPSVersion=$PSVersionTable.PSVersion.ToString();stubCalls=$script:fixtureCimCalls}|ConvertTo-Json -Compress';
  function run(input) { return spawnSync(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', prefix + PROCESS_PROBE + suffix], { input: JSON.stringify(input), encoding: 'utf8', windowsHide: true, timeout: 5000 }); }
  for (const paths of [[first], [first, second]]) {
    const result = run(paths); assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stderr); assert.equal(result.stderr, '');
    const [observation, metadata] = result.stdout.replace(/^\uFEFF/, '').trim().split(/\r?\n/).map(JSON.parse); assert.equal(observation.pathsChecked, paths.length); assert.deepEqual(observation.matchedPids, []); assert.equal(metadata.stubCalls, 1); assert.match(metadata.testPSVersion, /^5\.1\./);
  }
  for (const paths of [[[first, second]], [first, 4], [null], [], first, { path: first }, ['relative.txt'], ['']]) { const result = run(paths); assert.equal(result.status, 1); assert.match(result.stderr, /capture_path_array|capture_path_string/); assert.equal(result.stdout, ''); }
  const target = path.join(directory, 'target'), junction = path.join(directory, 'junction'); fs.mkdirSync(target); assert.ok(target.startsWith(directory + path.sep)); assert.ok(junction.startsWith(directory + path.sep)); fs.symlinkSync(target, junction, 'junction');
  const reparse = run([first, junction]); assert.equal(reparse.status, 1); assert.match(reparse.stderr, /capture_reparse/); assert.equal(reparse.stdout, '');
  const missing = run([path.join(directory, 'missing')]); assert.equal(missing.status, 1); assert.equal(missing.stdout, '');
});
test('native-read-capture builtin-only CLI preflight rejects unverified release before imports; defaults and production endpoint are fixed', () => {
  const f = fixture(), sentinel = path.join(f.directory, 'UNVERIFIED_EXECUTED'); fs.writeFileSync(path.join(f.d.releaseDir, 'core/broker'), 'require("node:fs").writeFileSync(' + JSON.stringify(sentinel) + ',"bad")');
  const tool = path.join(root, 'tools/capture-native-read.js'), r = spawnSync(process.execPath, [tool, 'inspect', '--installation', f.args.descriptor, '--provenance', f.args.provenance, '--cep-dir', f.args.cepDir, '--config', f.args.config], { cwd: f.evidenceRoot, encoding: 'utf8', timeout: 5000, windowsHide: true });
  assert.equal(r.status, 1); assert.match(r.stderr, /capture_tree_mismatch/); assert.equal(fs.existsSync(sentinel), false);
  const source = fs.readFileSync(tool, 'utf8'); assert.ok([...source.matchAll(/require\(['"]([^'"]+)['"]\)/g)].every(m => m[1].startsWith('node:'))); assert.ok(PROCESS_PROBE.includes('Get-CimInstance Win32_Process')); assert.ok(PROCESS_PROBE.includes('ReparsePoint')); assert.ok(!PROCESS_PROBE.includes('Invoke-Expression'));
  const invalid = spawnSync(process.execPath, [tool, 'capture', '--port', '0'], { encoding: 'utf8', windowsHide: true }); assert.equal(invalid.status, 2); assert.ok(!Object.keys(buildPackage().files).some(f => f.includes('capture-native-read')));
});
