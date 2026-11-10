'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const http = require('node:http');
const { webcrypto } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { PassThrough } = require('node:stream');
const { once } = require('node:events');
const { hash, canonical, MAX_FRAME } = require('../protocol/json');
const { mac } = require('../integrations/cep/peer-protocol');
const { encode, decode } = require('../protocol/codec');
const { createHttpPeer } = require('../integrations/cep/http-peer');
const { buildPackage, verifyPackage } = require('../tools/package-installable');
const { planInstall, applyInstall, rollback, configText, snapshot } = require('../tools/install-core4');
const { verifyInstallation } = require('../runtime/installation');
const { inspectReceiverHistory } = require('../runtime/recovery-inspection');
const root = path.resolve(__dirname, '..');
function temp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'core4-installable-')); }
function install(directory, pkg = buildPackage()) {
  const configPath = path.join(directory, 'project/.codex/config.toml'); fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, '# preserve\n[mcp_servers.legacy]\ncommand = "unchanged"\n');
  const args = { pkg, nodePath: fs.realpathSync(process.execPath), installRoot: path.join(directory, 'AEAgentCore4'), extensionsDir: path.join(directory, 'extensions'), configPath, machineId: 'test-machine' };
  return { args, plan: planInstall(args) };
}
const installation = { packageHash: '1'.repeat(64), installationId: 'test-installation', panelToken: '2'.repeat(64), controlToken: '3'.repeat(64) };
const asset = { assetKey: 'project-inspection-v1', executorHash: hash(fs.readFileSync(path.join(root, 'modules/project-inspection/executor.jsx'))) };
function rawRequest(port, route, body, { origin = 'null', headers = {}, method = 'POST', rawHeaders } = {}) {
  // Delete missing headers explicitly: Node rejects an undefined header value client-side.
  const values = { Origin: origin, 'Content-Type': 'application/json', ...headers };
  for (const key of Object.keys(values)) if (values[key] === undefined) delete values[key];
  return new Promise((resolve, reject) => {
    const req = http.request('http://127.0.0.1:' + port + route, { method, agent: false, headers: rawHeaders || values }, res => {
      let data = ''; res.on('data', b => data += b);
      res.on('end', () => { try { resolve({ status: res.statusCode, headers: res.headers, value: data ? JSON.parse(data) : null }); } catch (e) { reject(e); } });
    });
    req.on('error', reject); req.end(body === undefined ? undefined : canonical(body));
  });
}
async function client(port, config = installation, origin = 'null') {
  let sequence = 0;
  function raw(route, body, extra = {}, options = {}) { return rawRequest(port, route, body, { origin, headers: extra, ...options }); }
  const challenge = (await raw('/challenge', { role: 'panel' })).value, peerId = 'test-peer';
  const link = await raw('/link', { challenge, peerId, proof: mac({ challenge, peerId }, config.panelToken) });
  assert.equal(link.status, 200); assert.equal(link.value.mac, mac(link.value.body, config.panelToken));
  return {
    raw, challenge, peerId, pins: link.value.body.pins,
    envelope(route, payload, seq = ++sequence) { const body = { epoch: challenge.epoch, peerId, sequence: seq, method: 'POST', path: route, payload: JSON.parse(JSON.stringify(payload)) }; return { body, mac: mac(body, config.panelToken) }; },
    async call(route, payload) { const response = await raw(route, this.envelope(route, payload)); assert.equal(response.status, 200, JSON.stringify(response.value)); assert.equal(response.value.mac, mac(response.value.body, config.panelToken)); return response.value.body.payload; }
  };
}
function fakeHost(pkg) {
  function CompItem() { this.id = 7; this.name = 'Test comp'; this.numLayers = 1; this.duration = 5; }
  CompItem.prototype.layer = () => ({ id: 11, name: 'Title', property: () => ({}) });
  const comp = new CompItem();
  const context = vm.createContext({ JSON: undefined, Math, Error, CompItem, app: { version: '26.0-test', project: { file: { fsName: 'C:/test/project.aep', name: 'project.aep' }, numItems: 1, item: () => comp } } });
  vm.runInContext(Buffer.from(pkg.files['cep/jsx/registry.jsx'], 'base64').toString(), context);
  return { evalScript(script, cb) { cb(vm.runInContext(script, context)); } };
}
function dispatcher(pkg, options) {
  const context = vm.createContext({ JSON, Object, Array, Promise, Error, isFinite });
  vm.runInContext(Buffer.from(pkg.files['cep/js/poll-dispatcher.js'], 'base64').toString(), context);
  return context.Core4PollDispatcher.createDispatcher(options);
}
function memoryStorage() { const map = new Map(); return { getItem: k => map.get(k) || null, setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) }; }

function projectInspectionHost(pkg, items, state = {}) {
  function CompItem(id, { name = 'Повтор', numLayers = 1 } = {}) {
    Object.assign(this, { id, name, numLayers, duration: 5, time: 2, workAreaStart: 1, workAreaDuration: 3 });
  }
  CompItem.prototype.layer = index => ({ id: 1000 + index, name: '層'.repeat(260), property: () => ({}),
    source: { id: 1078 }, enabled: true, solo: false, guideLayer: false, inPoint: 0.5, outPoint: 5, stretch: -80, timeRemapEnabled: true });
  const rows = items.map((options, index) => options ? new CompItem(index + 1, options) : { id: index + 1 });
  const project = { file: { fsName: 'C:/test/project.aep', name: 'project.aep' }, revision: 17, dirty: true, numItems: rows.length,
    activeItem: rows.at(-1), item: index => rows[index - 1],
    itemByID: id => { if (!rows[id - 1]) throw new Error('Item Not Found'); return rows[id - 1]; }, ...state };
  const app = { version: '26.0-test', project }, context = vm.createContext({ JSON: undefined, CompItem, app });
  vm.runInContext(Buffer.from(pkg.files['cep/jsx/registry.jsx'], 'base64').toString(), context);
  const inspect = target => JSON.parse(context.AECore4Host.dispatch(JSON.stringify({ assetKey: asset.assetKey, phase: 'inspect',
    pins: { executorHash: asset.executorHash }, typedPayload: target })));
  return { app, project, inspect };
}

test('installable-runtime project inspection resolves exact IDs independently of discovery and correlates paged receipts', async t => {
  const pkg = buildPackage(root, 'readonly'), items = Array.from({ length: 1079 }, (_, i) => [254, 255, 256, 498, 499, 500, 510, 511, 512, 1078].includes(i) ? {} : null);
  const { app, project, inspect } = projectInspectionHost(pkg, items), f = await readDiagnosticPeer(t);
  const next = async (target, checkRejectedReceipt) => {
    const pending = f.peer.inspect(target), frame = (await f.c.call('/poll', {})).command;
    assert.deepEqual(frame.typedPayload, target);
    const result = inspect(target), receipt = { commandId: frame.commandId, originalBinding: frame.originalBinding, pins: frame.pins, result };
    if (checkRejectedReceipt) {
      const bad = structuredClone(receipt); bad.result.coverage.lookup.compId++;
      const rejected = await f.c.raw('/complete', f.c.envelope('/complete', bad));
      assert.equal(rejected.status, 403);
      assert.equal(rejected.value.error, 'inspection_result');
      assert.equal(f.peer.status().pending.commandId, frame.commandId);
    }
    await f.c.call('/complete', receipt);
    const response = await pending;
    assert.equal(response.continuity, false);
    return response.observation;
  };
  for (const compId of [255, 256, 257, 499, 500, 501, 511, 512, 513, 1079]) {
    const result = await next({ compId }, compId === 1079);
    assert.deepEqual(result.coverage.lookup, { compId, status: 'found', method: 'item_by_id' });
    assert.equal(result.target.compId, compId);
    assert.equal(result.layers.length, 1);
    assert.equal(result.compositions.some(comp => comp.compId === compId), compId <= 500);
    assert.equal(result.project.saved, true);
    assert.equal(result.dirty, true);
    assert.deepEqual(result.activeComp, { compId: 1079, time: 2, workAreaStart: 1, workAreaDuration: 3 });
  }
  const working = await next({ compId: 1079, includeLayerContext: true });
  assert.equal(working.coverage.layers.total, working.coverage.layers.returned);
  assert.deepEqual(working.layers[0].context, { sourceId: 1078, enabled: true, solo: false, guideLayer: false,
    inPoint: 0.5, outPoint: 5, stretch: -80, timeRemapEnabled: true });
  assert.throws(() => f.peer.inspect({ includeLayerContext: true }), /invalid_layer_context/);
  const first = await next({}), cursor = first.coverage.inventory.nextCursor;
  const second = await next({ cursor }), third = await next({ cursor: second.coverage.inventory.nextCursor });
  assert.deepEqual([first, second, third].map(x => [x.coverage.inventory.startItemIndex, x.coverage.inventory.throughItemIndex, x.coverage.inventory.itemsScanned, x.coverage.inventory.status]),
    [[1, 500, 500, 'more'], [501, 1000, 500, 'more'], [1001, 1079, 79, 'complete']]);
  assert.deepEqual([first, second, third].flatMap(x => x.compositions.map(comp => comp.compId)), [255, 256, 257, 499, 500, 501, 511, 512, 513, 1079]);
  assert.equal(third.truncated, false);
  assert.equal((await next({ compId: 1080 })).coverage.lookup.status, 'scan_incomplete');
  assert.equal((await next({ compId: 1078 })).coverage.lookup.status, 'not_found', 'native resolves the ID to footage');
  assert.equal((await next({ cursor: cursor.replace(/:\d+$/, ':502') })).coverage.inventory.status, 'cursor_stale');
  project.revision++;
  const stale = await next({ cursor, compId: 1079 });
  assert.equal(stale.coverage.inventory.status, 'cursor_stale');
  assert.equal(stale.target.compId, null);
  const fresh = await next({});
  app.project = { ...project };
  assert.equal((await next({ cursor: fresh.coverage.inventory.nextCursor })).coverage.inventory.status, 'cursor_stale');
  assert.throws(() => f.peer.inspect({ cursor: 'x'.repeat(97) }), /invalid_inspection_cursor/);
});

test('installable-runtime project inspection makes incomplete native reads and result budget coverage explicit', async t => {
  const pkg = buildPackage(root, 'readonly');
  const { inspect } = projectInspectionHost(pkg, [{}, null], { itemByID: undefined, dirty: undefined, file: null });
  assert.equal(inspect({ compId: 1 }).coverage.lookup.method, 'page_scan');
  const absent = inspect({ compId: 3 });
  assert.equal(absent.coverage.lookup.status, 'not_found');
  assert.equal(absent.project.saved, false);
  assert.equal(absent.dirty, null);
  assert.equal(absent.activeComp, null);
  const interrupted = projectInspectionHost(pkg, [{}, null], { item: () => { throw new Error('unobserved item'); } }).inspect({ compId: 3 });
  assert.equal(interrupted.coverage.lookup.status, 'scan_incomplete');
  assert.equal(interrupted.coverage.inventory.status, 'scan_incomplete');
  assert.equal(interrupted.coverage.inventory.itemsScanned, 0);
  const dense = Array.from({ length: 60 }, () => ({ name: '層'.repeat(256) + 'x', numLayers: 101 }));
  const fallback = projectInspectionHost(pkg, dense, { itemByID: undefined });
  assert.deepEqual(fallback.inspect({ compId: 60 }).coverage.lookup, { compId: 60, status: 'found', method: 'page_scan' });
  assert.deepEqual(fallback.inspect({ compId: 61 }).coverage.lookup, { compId: 61, status: 'not_found', method: 'page_scan' });
  const unversioned = projectInspectionHost(pkg, dense, { revision: undefined }).inspect({});
  assert.equal(unversioned.compositions.length, 50);
  assert.equal(unversioned.coverage.inventory.status, 'revision_unavailable');
  assert.equal(unversioned.coverage.inventory.nextCursor, null);
  const long = projectInspectionHost(pkg, dense).inspect({ compId: 60 });
  assert.ok(long.layers.length < 100);
  assert.deepEqual(long.coverage.layers, { total: 101, returned: long.layers.length });
  const escaped = projectInspectionHost(pkg, dense.map(x => ({ ...x, name: '\u0001'.repeat(256) })));
  const cut = escaped.inspect({});
  assert.ok(cut.compositions.length < 50);
  assert.equal(cut.coverage.inventory.itemsScanned, 50);
  assert.equal(cut.coverage.inventory.throughItemIndex, cut.compositions.length);
  const tail = escaped.inspect({ cursor: cut.coverage.inventory.nextCursor });
  assert.equal(tail.compositions[0].compId, cut.compositions.at(-1).compId + 1);
  const f = await readDiagnosticPeer(t);
  for (const [label, target, observation] of [['unicode', { compId: 60 }, long], ['escaped', {}, cut]]) {
    const pending = f.peer.inspect(target), frame = (await f.c.call('/poll', {})).command;
    const receipt = f.c.envelope('/complete', { commandId: frame.commandId, originalBinding: frame.originalBinding, pins: frame.pins, result: observation });
    assert.equal((await f.c.raw('/complete', receipt)).status, 200);
    const response = await pending, line = fs.readFileSync(path.join(f.directory, 'completions.ndjson'), 'utf8').trimEnd().split('\n').at(-1);
    assert.deepEqual(response.observation, observation);
    const toolResult = { evidenceRef: 'observation-' + '0'.repeat(36), moduleId: 'project-inspection', contractId: '0'.repeat(64), ...response, authority: false };
    const mcp = { jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: canonical(toolResult) }], isError: false } };
    const wire = canonical(observation);
    assert.ok(wire.length <= 40000);
    const sizes = [wire, canonical(receipt), line, canonical(mcp)].map(value => Buffer.byteLength(value));
    assert.ok(sizes.every(bytes => bytes < MAX_FRAME));
    t.diagnostic(label + ': ' + wire.length + ' code units, ' + sizes.join('/') + ' UTF-8 bytes (observation/HTTP/journal/MCP)');
  }
});

const titlesReadAliases = ['font', 'font_size', 'apply_fill', 'fill_color', 'apply_stroke', 'stroke_color', 'stroke_width', 'tracking', 'baseline_shift', 'horizontal_scale', 'vertical_scale', 'faux_bold', 'faux_italic', 'justification', 'leading', 'auto_leading'];
const titlesReadCodes = ['project_cas', 'comp_cas', 'layer_cas', 'unsupported_animated_text', 'unsupported_style_proof', 'unsupported_style_api', 'unsupported_mixed_style', 'unsupported_justification_enum', 'titles_native_target', 'titles_native_document', 'titles_native_text', 'titles_native_range', 'titles_native_serialization', ...titlesReadAliases.flatMap(field => ['titles_native_' + field, 'titles_missing_' + field])];
async function readDiagnosticPeer(t, changes = {}) {
  const directory = temp(), manual = { assetKey: 'titles-current-target-v1', moduleId: 'titles-current-target', operationId: 'set-current-text', executorHash: '7'.repeat(64), resultProfile: 'manual-text-v1', ...changes };
  const peer = createHttpPeer({ installation, directory, asset, additionalAssets: [manual], port: 0, timeout: 5000 }); await peer.listen(); t.after(() => peer.close());
  const c = await client(peer.status().port), binding = { controllerId: 'diagnostic-controller', channelEpoch: 'diagnostic-channel', secret: '4'.repeat(64) }; await peer.transport.connect(binding); let serial = 0;
  async function begin(phase = 'inspect', selected = manual, payload = {}) {
    const command = { protocolVersion: 1, controllerId: binding.controllerId, channelEpoch: binding.channelEpoch, commandId: 'diagnostic-' + ++serial, moduleId: selected.moduleId || 'project-inspection', operationId: selected.operationId || 'inspect', executorHash: selected.executorHash, phase, payloadHash: hash(canonical(payload)), payload };
    const promise = peer.transport.send(encode(command, binding.secret)); const frame = (await c.call('/poll', {})).command; assert.equal(frame.commandId, command.commandId);
    return { command, frame, promise, receipt(result) { return { commandId: frame.commandId, originalBinding: structuredClone(frame.originalBinding), pins: structuredClone(frame.pins), result }; } };
  }
  return { directory, peer, c, manual, binding, begin };
}
test('installable-runtime private completed read proof belongs to one exact direct error and is consumed once', async t => {
  const f = await readDiagnosticPeer(t), other = await readDiagnosticPeer(t);
  for (const [code, source] of [['inspection_failed', 'host'], ['inspection_result_budget', 'host'], ['host_json_unavailable', 'registry'], ['host_registry_unavailable', 'registry']]) {
    const read = f.peer.inspect({ compId: 7 }), observed = read.catch(error => error), frame = (await f.c.call('/poll', {})).command;
    const receipt = { commandId: frame.commandId, originalBinding: frame.originalBinding, pins: frame.pins, result: { readFailureVersion: 1, outcome: 'rejected', code } };
    const before = fs.readFileSync(path.join(f.directory, 'completions.ndjson'));
    const bad = structuredClone(receipt); bad.pins.executorHash = '0'.repeat(64);
    assert.equal((await f.c.raw('/complete', f.c.envelope('/complete', bad))).status, 403);
    assert.deepEqual(fs.readFileSync(path.join(f.directory, 'completions.ndjson')), before);
    assert.equal(f.peer.consumeReadRejection(Object.assign(new Error(code), { code, completed: true })), null);
    await f.c.call('/complete', receipt); const error = await observed;
    assert.equal(other.peer.consumeReadRejection(error), null);
    assert.equal(f.peer.consumeReadRejection({ ...error }), null);
    const terminal = JSON.parse(fs.readFileSync(path.join(f.directory, 'completions.ndjson'), 'utf8').trimEnd().split('\n').at(-1));
    assert.equal(terminal.type, 'complete');
    assert.equal(terminal.commandId, frame.commandId);
    assert.deepEqual(f.peer.consumeReadRejection(error), {
      code, commandId: frame.commandId, executorHash: asset.executorHash, payloadHash: hash(canonical({ compId: 7 })),
      physical: {
        code, commandId: frame.commandId, moduleId: 'project-inspection', phase: 'inspect', effect: 'none',
        stage: 'terminal', intentRecorded: true, handoff: 'offered', nativeStart: 'unknown', queue: 'idle', late: false,
        terminalReceipt: { source, receiptRef: frame.originalBinding.receiptRef, recordHash: terminal.recordHash }
      }
    });
    assert.equal(f.peer.consumeReadRejection(error), null);
  }
  for (const selected of [asset, f.manual]) {
    const q = await f.begin('inspect', selected), observed = q.promise.catch(error => error);
    await f.c.call('/complete', q.receipt({ readFailureVersion: 1, outcome: 'rejected', code: 'inspection_failed' }));
    assert.equal(f.peer.consumeReadRejection(await observed), null, 'Broker reads do not mint direct inspection proof');
  }
});
test('installable-runtime finite Titles read codes complete only admitted read phases and publish bounded diagnostics after durability', async t => {
  const f = await readDiagnosticPeer(t); assert.equal(f.peer.status().lastReadFailure, null);
  let previous = null, firstReceipt;
  for (const [index, code] of titlesReadCodes.entries()) {
    assert.match(code, /^[a-z][a-z0-9_]{0,63}$/); const phase = index % 2 ? 'verify' : 'inspect', q = await f.begin(phase), observed = assert.rejects(q.promise, error => error.code === code);
    const receipt = q.receipt({ readFailureVersion: 1, outcome: 'rejected', code }); firstReceipt ||= receipt;
    const write = fs.writeSync, sync = fs.fsyncSync; let completing = false, sawDurability = false;
    fs.writeSync = (fd, value, ...args) => { if (typeof value === 'string' && value.includes('"type":"complete"')) completing = true; return write(fd, value, ...args); };
    fs.fsyncSync = fd => { if (completing) { sawDurability = true; assert.deepEqual(f.peer.status().lastReadFailure, previous); } return sync(fd); };
    try { await f.c.call('/complete', receipt); } finally { fs.writeSync = write; fs.fsyncSync = sync; }
    await observed; assert.equal(sawDurability, true);
    previous = { commandId: q.command.commandId, moduleId: 'titles-current-target', phase, executorHash: f.manual.executorHash, code, authority: false };
    assert.deepEqual(f.peer.status().lastReadFailure, previous); assert.equal(Object.isFrozen(f.peer.status().lastReadFailure), true); assert.equal(f.peer.status().pending, null); assert.equal(f.peer.status().unknown, false);
    const records = fs.readFileSync(path.join(f.directory, 'completions.ndjson'), 'utf8').trim().split('\n').map(JSON.parse); assert.equal(records.at(-1).type, 'complete'); assert.equal(records.at(-1).response.result.code, code);
  }
  await f.c.call('/complete', firstReceipt); assert.deepEqual(f.peer.status().lastReadFailure, previous, 'duplicate older completion must not replace the current diagnostic');
});
test('installable-runtime read diagnostic rejects unknown codes extra fields and bad correlation without journal or status promotion', async t => {
  const f = await readDiagnosticPeer(t), q = await f.begin(), observed = assert.rejects(q.promise, /titles_native_stroke_color/), result = { readFailureVersion: 1, outcome: 'rejected', code: 'titles_native_stroke_color' };
  const before = fs.readFileSync(path.join(f.directory, 'completions.ndjson'));
  for (const change of [r => { r.result.code = 'titles_native_arbitrary'; }, r => { r.result.code = 'private native message'; }, r => { r.result.message = 'private'; }, r => { r.result.authority = true; }, r => { r.result.readFailureVersion = 2; }, r => { r.pins.executorHash = '0'.repeat(64); }, r => { r.originalBinding.receiptRef = '0'.repeat(64); }, r => { r.commandId = 'other'; }]) {
    const receipt = q.receipt(structuredClone(result)); change(receipt); const response = await f.c.raw('/complete', f.c.envelope('/complete', receipt)); assert.equal(response.status, 403); assert.equal(f.peer.status().lastReadFailure, null); assert.deepEqual(fs.readFileSync(path.join(f.directory, 'completions.ndjson')), before);
  }
  await f.c.call('/complete', q.receipt(result)); await observed; assert.equal(f.peer.status().lastReadFailure.code, result.code);
});

const montageDiagnostics = [
  {
    asset: { assetKey: 'media-import-v1', moduleId: 'media-import', operationId: 'ingest-footage', resultProfile: 'media-import-v1' },
    code: 'inspection_result_budget', exactTarget: { file: 'C:/fixture.jpg' },
    diagnostic: { version: 1, stage: 'field_units', itemCount: 1109, itemIndex: 22, nameUnits: 513, fileUnits: 0 },
    malformed: [{ stage: 'other' }, { itemIndex: 1110 }, { nameUnits: 512 }, { path: 'C:/private.jpg' }]
  },
  {
    asset: { assetKey: 'layer-overlay-v1', moduleId: 'layer-overlay', operationId: 'duplicate-and-replace-still', resultProfile: 'layer-overlay-v1' },
    code: 'layer_overlay_expression_scope', exactTarget: { itemId: 80 },
    diagnostic: { version: 1, projectRevision: 7, compId: 19, layerId: 28, root: 'ADBE Transform Group',
      propertyIndices: [2], cause: 'unsupported_expression', expressionUnits: 43 },
    malformed: [{ compId: 0 }, { propertyIndices: Array(32).fill(1) }, { propertyIndices: [0] }, { root: 'Private root' },
      { cause: 'expression_unavailable' }, { expression: 'private expression' }]
  }
];
for (const item of montageDiagnostics) test('installable-runtime montage diagnostic admits only the exact prospective rejection for ' + item.asset.moduleId, async t => {
  const { code, diagnostic, exactTarget, malformed } = item;
  const f = await readDiagnosticPeer(t, item.asset);
  const result = { readFailureVersion: 1, outcome: 'rejected', code, diagnostic };
  const reject = async (fixture, command, value) => {
    const journal = path.join(fixture.directory, 'completions.ndjson'), before = fs.readFileSync(journal);
    const response = await fixture.c.raw('/complete', fixture.c.envelope('/complete', command.receipt(value)));
    assert.equal(response.status, 403);
    assert.deepEqual(fs.readFileSync(journal), before);
  };
  const exact = await f.begin(), refusal = assert.rejects(exact.promise, { code });
  for (const changes of malformed) await reject(f, exact, { ...result, diagnostic: { ...diagnostic, ...changes } });
  await reject(f, exact, { ...result, code: 'inspection_failed' });
  assert.equal(f.peer.status().lastReadFailure, null);
  await f.c.call('/complete', exact.receipt(result));
  await refusal;
  const status = f.peer.status();
  assert.equal(status.lastReadFailure.code, code);
  assert.equal(status.lastReadFailure.diagnostic, undefined);
  assert.equal(status.lastCommandOutcome.diagnostic, undefined);
  assert.deepEqual(decode(await f.peer.transport.completion(exact.command.commandId), f.binding.secret).response.result, result);
  assert.equal(inspectReceiverHistory(fs.readFileSync(path.join(f.directory, 'completions.ndjson'))).settled, true);
  await f.c.call('/complete', exact.receipt(result));

  const wrongProfile = await readDiagnosticPeer(t, { ...item.asset, resultProfile: 'manual-text-v1' });
  for (const [fixture, phase, payload] of [[f, 'inspect', exactTarget], [f, 'verify', {}], [f, 'mutate', {}], [wrongProfile, 'inspect', {}]]) {
    const q = await fixture.begin(phase, fixture.manual, payload);
    const settled = phase === 'mutate' ? q.promise : assert.rejects(q.promise, { code: 'inspection_failed' });
    await reject(fixture, q, result);
    await fixture.c.call('/complete', q.receipt(phase === 'mutate' ? { outcome: 'rejected', code: 'fixture_cancelled' }
      : { readFailureVersion: 1, outcome: 'rejected', code: 'inspection_failed' }));
    await settled;
  }
});

test('installable-runtime render queue read durably accepts its owned job field only in the render profile', async t => {
  const config = { assetKey: 'comp-render-v1', moduleId: 'comp-render', operationId: 'render-text-variant', resultProfile: 'owned-comp-render-v1' };
  const f = await readDiagnosticPeer(t, config), q = await f.begin();
  const target = { projectId: 'C:/test/owned.aep', compId: 7 };
  const job = { jobCompId: 8, status: 'QUEUED', rendering: false, activeLayerId: 11 };
  const result = { target, revision: 'fresh', protected: 'preimage', layers: [], duration: 12, frameDuration: 1 / 30, queueIdle: false, job };
  await f.c.call('/complete', q.receipt(result));
  assert.deepEqual(decode(await q.promise, f.binding.secret).result, result);
  const last = fs.readFileSync(path.join(f.directory, 'completions.ndjson'), 'utf8').trim().split('\n').map(JSON.parse).at(-1);
  assert.equal(last.type, 'complete');
  assert.deepEqual(last.response.result.job, job);
  assert.equal(f.peer.status().unknown, false);

  const text = await readDiagnosticPeer(t), read = await text.begin();
  const response = await text.c.raw('/complete', text.c.envelope('/complete', read.receipt({ target, revision: 'fresh', protected: 'preimage', text: 'Title', job })));
  assert.equal(response.value.error, 'unexpected_field');
  await text.c.call('/complete', read.receipt({ target, revision: 'fresh', protected: 'preimage', text: 'Title' }));
  await read.promise;
});
for (const scope of ['project', 'foreign-key', 'foreign-module', 'foreign-operation', 'foreign-profile', 'mutate']) test('installable-runtime Titles diagnostic vocabulary is refused for ' + scope, async t => {
  const changes = scope === 'foreign-key' ? { assetKey: 'other-text-v1' } : scope === 'foreign-module' ? { moduleId: 'other-text' } : scope === 'foreign-operation' ? { operationId: 'other-operation' } : scope === 'foreign-profile' ? { resultProfile: 'other-profile' } : {};
  const f = await readDiagnosticPeer(t, changes), q = await f.begin(scope === 'mutate' ? 'mutate' : 'inspect', scope === 'project' ? asset : f.manual), observed = scope === 'mutate' ? q.promise : assert.rejects(q.promise, /inspection_failed/);
  const result = { readFailureVersion: 1, outcome: 'rejected', code: 'titles_native_font' }, before = fs.readFileSync(path.join(f.directory, 'completions.ndjson'));
  const refused = await f.c.raw('/complete', f.c.envelope('/complete', q.receipt(result))); assert.equal(refused.status, 403); assert.equal(refused.value.error, 'inspection_result'); assert.equal(f.peer.status().lastReadFailure, null); assert.deepEqual(fs.readFileSync(path.join(f.directory, 'completions.ndjson')), before);
  await f.c.call('/complete', q.receipt(scope === 'mutate' ? { outcome: 'rejected', code: 'fixture_cancelled' } : { readFailureVersion: 1, outcome: 'rejected', code: 'inspection_failed' }));
  if (scope === 'mutate') { assert.equal(decode(await observed, f.binding.secret).result.code, 'fixture_cancelled'); assert.equal(f.peer.status().lastReadFailure, null); } else await observed;
});
test('installable-runtime package deterministic closure, install CAS, exact rollback and stable origin', () => {
  const directory = temp(), pkg = buildPackage(); assert.equal(pkg.packageHash, buildPackage().packageHash);
  assert.ok(Object.keys(pkg.files).every(f => !/^(test|experiments|node_modules|tools)\//.test(f)));
  const tampered = structuredClone(pkg); tampered.files['runtime/stdio-entry.js'] = Buffer.from('tamper').toString('base64'); assert.throws(() => verifyPackage(tampered), /package_integrity/);
  const { args, plan } = install(directory, pkg); assert.equal(fs.existsSync(args.installRoot), false, 'dry-run has no writes');
  fs.appendFileSync(args.configPath, '# concurrent\n'); assert.throws(() => applyInstall(plan), /install_baseline_changed/);
  const first = applyInstall(planInstall(args)), d = verifyInstallation(first.descriptorPath);
  assert.match(fs.readFileSync(args.configPath, 'utf8'), /command = "unchanged"/);
  const beforeState = fs.readFileSync(path.join(d.stateDir, 'origin.json'));
  fs.writeFileSync(path.join(d.stateDir, 'protected-evidence'), 'do not reset');
  const second = applyInstall(planInstall(args)); assert.equal(second.installationId, first.installationId);
  assert.notEqual(JSON.parse(fs.readFileSync(first.descriptorPath)).panelToken, d.panelToken);
  rollback(second.transactionFile); assert.equal(fs.readFileSync(first.descriptorPath, 'utf8'), canonical(d));
  assert.equal(fs.readFileSync(path.join(d.stateDir, 'protected-evidence'), 'utf8'), 'do not reset');
  assert.ok(beforeState.equals(fs.readFileSync(path.join(d.stateDir, 'origin.json'))));
  fs.mkdirSync(path.join(d.stateDir, 'receiver'), { recursive: true }); fs.writeFileSync(path.join(d.stateDir, 'receiver/owner'), 'unknown');
  assert.throws(() => applyInstall(planInstall(args)), /runtime_state_owned_or_unknown/); fs.unlinkSync(path.join(d.stateDir, 'receiver/owner'));
  fs.unlinkSync(path.join(d.stateDir, 'origin.json')); assert.throws(() => planInstall(args), /stable_state_origin/);
});

function stagedFixture() {
  const directory = temp(), pkg = buildPackage(root, 'manual', { runtimeModel: 'owner' }), fixture = install(directory, pkg);
  applyInstall(fixture.plan); const plan = planInstall(fixture.args);
  const live = () => ({ descriptor: fs.readFileSync(plan.descriptorPath).toString('base64'), config: fs.readFileSync(plan.configPath).toString('base64'), client: fs.readFileSync(plan.clientBinding.clientDescriptorPath).toString('base64'), cep: snapshot(plan.cepDir) });
  return { ...fixture, directory, plan, live, before: live(), cepStage: path.join(plan.descriptor.installRoot, 'transactions', plan.transactionId + '-cep-next'), backup: path.join(plan.descriptor.installRoot, 'transactions', plan.transactionId + '-cep') };
}
test('installable-runtime staged update prepares every complete file before its first visible rename and publishes config last', () => {
  const f = stagedFixture(), original = fs.renameSync, events = [];
  fs.renameSync = (source, destination) => {
    if (source === f.plan.cepDir) {
      assert.deepEqual(f.live(), f.before); assert.deepEqual(snapshot(f.cepStage), f.plan.cep);
      assert.equal(fs.readFileSync(f.plan.descriptorPath + '.next', 'utf8'), canonical(f.plan.descriptor));
      assert.deepEqual(fs.readFileSync(f.plan.clientBinding.clientDescriptorPath + '.next'), f.plan.nextClient);
      assert.equal(fs.readFileSync(f.plan.configPath + '.core4-next', 'utf8'), f.plan.nextConfig); events.push('old-cep');
    }
    if (source === f.cepStage) { assert.equal(destination, f.plan.cepDir); assert.deepEqual(snapshot(source), f.plan.cep); events.push('new-cep'); }
    if (destination === f.plan.descriptorPath) events.push('descriptor');
    if (destination === f.plan.clientBinding.clientDescriptorPath) events.push('client');
    if (destination === f.plan.configPath) {
      assert.equal(fs.readFileSync(f.plan.configPath).toString('base64'), f.before.config);
      assert.deepEqual(JSON.parse(fs.readFileSync(f.plan.descriptorPath)), f.plan.descriptor); assert.deepEqual(snapshot(f.plan.cepDir), f.plan.cep); events.push('config');
    }
    return original(source, destination);
  };
  try { const result = applyInstall(f.plan); assert.equal(result.installed, true); }
  finally { fs.renameSync = original; }
  assert.deepEqual(events, ['old-cep', 'new-cep', 'descriptor', 'client', 'config']); assert.equal(fs.existsSync(f.cepStage), false);
  assert.deepEqual(snapshot(f.backup), f.before.cep); verifyInstallation(f.plan.descriptorPath);
});
for (const boundary of ['cep', 'descriptor', 'client', 'config']) test('installable-runtime staged short write preserves the whole live installation before switch: ' + boundary, () => {
  const f = stagedFixture(), target = { cep: path.join(f.cepStage, 'js/panel.js'), descriptor: f.plan.descriptorPath + '.next', client: f.plan.clientBinding.clientDescriptorPath + '.next', config: f.plan.configPath + '.core4-next' }[boundary];
  const open = fs.openSync, write = fs.writeSync, rename = fs.renameSync; let faultFd, injected = false, visible = 0;
  fs.openSync = (...args) => { const fd = open(...args); if (args[0] === target && args[1] === 'wx') faultFd = fd; return fd; };
  fs.writeSync = (fd, data, ...args) => {
    if (fd === faultFd && !injected) { injected = true; const bytes = Buffer.from(data); return write(fd, bytes, 0, Math.max(1, Math.floor(bytes.length / 2))); }
    return write(fd, data, ...args);
  };
  fs.renameSync = (source, destination) => { if (source === f.plan.cepDir || destination === f.plan.cepDir || destination === f.plan.descriptorPath || destination === f.plan.configPath) visible++; return rename(source, destination); };
  try { assert.throws(() => applyInstall(f.plan), e => e.code === 'install_short_write' && e.leaseRetained === true); }
  finally { fs.openSync = open; fs.writeSync = write; fs.renameSync = rename; }
  assert.equal(injected, true); assert.equal(visible, 0); assert.deepEqual(f.live(), f.before); assert.equal(fs.existsSync(target), true); assert.equal(fs.existsSync(path.join(f.plan.descriptor.installRoot, 'install.lock')), true);
});
for (const replacement of [false, true]) test('installable-runtime staged final CAS refuses changed owned client stage without publishing it: ' + replacement, () => {
  const f = stagedFixture(), transaction = path.join(f.plan.descriptor.installRoot, 'transactions', f.plan.transactionId + '.json'), target = f.plan.clientBinding.clientDescriptorPath + '.next';
  const open = fs.openSync, sync = fs.fsyncSync; let transactionFd, changed = false;
  fs.openSync = (...args) => { const fd = open(...args); if (args[0] === transaction && args[1] === 'wx') transactionFd = fd; return fd; };
  fs.fsyncSync = fd => {
    sync(fd); if (fd === transactionFd && !changed) { changed = true; if (replacement) fs.renameSync(target, target + '.held-original'); fs.writeFileSync(target, 'foreign-stage'); }
  };
  try { assert.throws(() => applyInstall(f.plan), e => e.code === 'install_staging_changed' && e.leaseRetained === true); }
  finally { fs.openSync = open; fs.fsyncSync = sync; }
  assert.equal(changed, true); assert.deepEqual(f.live(), f.before); assert.equal(fs.readFileSync(target, 'utf8'), 'foreign-stage'); assert.equal(fs.existsSync(f.backup), false);
});
test('installable-runtime staged foreign CEP stage is preserved and never replaces the live panel', () => {
  const f = stagedFixture(); fs.mkdirSync(f.cepStage); fs.writeFileSync(path.join(f.cepStage, 'foreign.txt'), 'retain');
  assert.throws(() => applyInstall(f.plan), e => e.code === 'install_staging_exists' && e.leaseRetained === true);
  assert.deepEqual(f.live(), f.before); assert.equal(fs.readFileSync(path.join(f.cepStage, 'foreign.txt'), 'utf8'), 'retain'); assert.equal(fs.existsSync(f.backup), false);
});
test('installable-runtime staged cross-volume planning and apply refuse before any installation writes', () => {
  const f = install(temp()); fs.mkdirSync(f.args.extensionsDir);
  const lstat = fs.lstatSync;
  fs.lstatSync = (file, options) => { const value = lstat(file, options); return file === f.args.extensionsDir && options?.bigint ? new Proxy(value, { get(target, key) { return key === 'dev' ? target.dev + 1n : Reflect.get(target, key); } }) : value; };
  try {
    assert.throws(() => planInstall(f.args), e => e.code === 'install_cross_volume_unsupported');
    assert.throws(() => applyInstall(f.plan), e => e.code === 'install_cross_volume_unsupported');
  } finally { fs.lstatSync = lstat; }
  assert.equal(fs.existsSync(f.args.installRoot), false); assert.deepEqual(fs.readdirSync(f.args.extensionsDir), []); assert.equal(fs.existsSync(f.args.configPath + '.core4-next'), false);
});
test('installable-runtime full generated host registry parses as ES3 before any host evaluation', () => {
  const pkg = buildPackage(), registry = Buffer.from(pkg.files['cep/jsx/registry.jsx'], 'base64').toString('utf8');
  // Dev-only parser shipped with Node. Fail closed if unavailable; modern VM
  // parsing does not establish ES3 compatibility. No host code is evaluated.
  const parser = "const fs=require('node:fs'), acorn=require('internal/deps/acorn/acorn/dist/acorn'); const options={ecmaVersion:3,allowReserved:'never'}; const tree=acorn.parse(fs.readFileSync(0,'utf8'),options); console.log(JSON.stringify({parser:'acorn',version:acorn.version,node:process.version,options,type:tree.type}));";
  const result = spawnSync(process.execPath, ['--expose-internals', '-e', parser], { input: registry, encoding: 'utf8', timeout: 5000, windowsHide: true });
  assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout); assert.equal(parsed.parser, 'acorn'); assert.ok(parsed.version); assert.equal(parsed.node, process.version);
  assert.deepEqual(parsed.options, { ecmaVersion: 3, allowReserved: 'never' }); assert.equal(parsed.type, 'Program');
});
test('installable-runtime exact release closure rejects extensionless shadow, empty directory and junction before package imports', () => {
  const directory = temp(), { args, plan } = install(directory), installed = applyInstall(plan), d = JSON.parse(fs.readFileSync(installed.descriptorPath));
  const sentinel = path.join(directory, 'UNTRUSTED-CODE-EXECUTED'), shadow = path.join(d.releaseDir, 'core/broker');
  const code = 'require("node:fs").writeFileSync(' + JSON.stringify(sentinel) + ',"executed");module.exports={};';
  fs.writeFileSync(shadow, code);
  function rejectedChild() { const result = spawnSync(process.execPath, [path.join(d.releaseDir, 'runtime/stdio-entry.js'), '--installation', installed.descriptorPath], { encoding: 'utf8', timeout: 5000, windowsHide: true }); assert.equal(result.status, 1); assert.match(result.stderr, /release_tree_mismatch|installed_release_bytes/); assert.equal(fs.existsSync(sentinel), false); }
  rejectedChild(); assert.throws(() => verifyInstallation(installed.descriptorPath), /release_tree_mismatch/);
  assert.throws(() => applyInstall(planInstall(args)), /immutable_release_mismatch/);
  assert.equal(fs.existsSync(path.join(args.installRoot, 'install.lock')), false, 'invalid previous release refuses during planning, before private preparation or a lease');
  fs.unlinkSync(shadow); const extra = path.join(d.releaseDir, 'unlisted-empty'); fs.mkdirSync(extra); rejectedChild(); fs.rmdirSync(extra);
  const core = path.join(d.releaseDir, 'core'), backup = path.join(directory, 'junction-target');
  assert.ok(path.resolve(core).startsWith(path.resolve(directory) + path.sep)); assert.ok(path.resolve(backup).startsWith(path.resolve(directory) + path.sep));
  fs.renameSync(core, backup); fs.writeFileSync(path.join(backup, 'broker.js'), code);
  fs.symlinkSync(backup, core, process.platform === 'win32' ? 'junction' : 'dir');
  rejectedChild(); assert.throws(() => applyInstall(planInstall(args)), /immutable_release_mismatch/);
  assert.equal(fs.existsSync(path.join(args.installRoot, 'install.lock')), false, 'junction refusal has no installer writes or newly created fence');
  assert.equal(fs.existsSync(sentinel), false);
});
test('installable-runtime stale release A entry cannot verify B descriptor then import unchecked A dependencies', () => {
  const directory = temp(), pkgA = buildPackage(), { args, plan } = install(directory, pkgA), installedA = applyInstall(plan), descriptorA = JSON.parse(fs.readFileSync(installedA.descriptorPath));
  const pkgB = structuredClone(pkgA), css = Buffer.from(pkgB.files['cep/panel.css'], 'base64').toString('utf8') + '\n/* independent test release B */\n';
  pkgB.files['cep/panel.css'] = Buffer.from(css).toString('base64'); pkgB.release.hashes['cep/panel.css'] = hash(css); pkgB.packageHash = hash(pkgB.release);
  const installedB = applyInstall(planInstall({ ...args, pkg: pkgB })); assert.notEqual(pkgB.packageHash, pkgA.packageHash);
  const sentinel = path.join(directory, 'STALE-RELEASE-A-EXECUTED');
  fs.appendFileSync(path.join(descriptorA.releaseDir, 'core/broker.js'), '\nrequire("node:fs").writeFileSync(' + JSON.stringify(sentinel) + ',"executed");\n');
  const result = spawnSync(process.execPath, [path.join(descriptorA.releaseDir, 'runtime/stdio-entry.js'), '--installation', installedB.descriptorPath], { encoding: 'utf8', timeout: 5000, windowsHide: true });
  assert.equal(result.status, 1); assert.match(result.stderr, /installation_entry_root_mismatch/); assert.equal(fs.existsSync(sentinel), false);
  assert.equal(verifyInstallation(installedB.descriptorPath).packageHash, pkgB.packageHash);
});
test('installable-runtime descriptor changed at startup gate is rejected before package imports', async () => {
  const directory = temp(), { plan } = install(directory), installed = applyInstall(plan), d = JSON.parse(fs.readFileSync(installed.descriptorPath));
  const entry = require(path.join(d.releaseDir, 'runtime/stdio-entry.js')), originalOpen = fs.openSync, gate = path.join(d.installRoot, 'install.lock'); let changed = false;
  fs.openSync = function (file, flags, ...rest) {
    const fd = originalOpen.call(fs, file, flags, ...rest);
    if (!changed && file === gate && flags === 'wx') { changed = true; fs.writeFileSync(installed.descriptorPath, canonical({ ...d, panelToken: 'a'.repeat(64) })); }
    return fd;
  };
  try { await assert.rejects(entry.start({ descriptor: installed.descriptorPath, port: 0 }), /installation_changed_during_start|installation_cep_bytes/); }
  finally { fs.openSync = originalOpen; }
  assert.equal(changed, true); assert.equal(fs.existsSync(path.join(d.stateDir, 'broker/broker-owner.lock')), false); assert.equal(fs.existsSync(path.join(d.stateDir, 'receiver')), false); assert.equal(fs.existsSync(gate), false);
});
test('installable-runtime bounded TOML edit preserves indented neighboring servers and inline-commented Core4 header bytes', () => {
  const before = '# prefix\r\n [mcp_servers.before] # before comment\r\ncommand = "before"\r\n';
  const ownHeader = '  [mcp_servers.after-effects-core4] # retain this header\r\n';
  const after = '  [mcp_servers.after] # adjacent indented header\r\ncommand = "must stay"\r\nargs = ["a", "b"]\r\n# suffix\r\n';
  const enabled = '  enabled = false # keep managed client disabled\r\n';
  const result = configText(Buffer.from(before + ownHeader + enabled + 'command = "old"\r\n' + after), 'C:/descriptor.json', 'C:/node.exe', 'C:/entry.js');
  assert.ok(result.startsWith(before + ownHeader)); assert.ok(result.endsWith(after)); assert.equal((result.match(/\[mcp_servers.after-effects-core4\]/g) || []).length, 1);
  assert.ok(result.includes(enabled));
  const preservedTrue = configText(Buffer.from(ownHeader + "'enabled' = true # explicit user preference\n"), 'C:/descriptor.json', 'C:/node.exe', 'C:/entry.js'); assert.ok(preservedTrue.includes("'enabled' = true # explicit user preference\n"));
  assert.throws(() => configText(Buffer.from(ownHeader + 'enabled = false\n"enabled" = true\n'), 'C:/descriptor.json', 'C:/node.exe', 'C:/entry.js'), /config_duplicate_enabled_preference/);
  assert.throws(() => configText(Buffer.from(ownHeader + 'enabled = "false"\n'), 'C:/descriptor.json', 'C:/node.exe', 'C:/entry.js'), /config_enabled_preference_requires_review/);
  const directory = temp(), { args } = install(directory);
  const invalid = Buffer.from('[mcp_servers."after\\u002deffects-core4"] # unsupported escaped key\ncommand = "old"\n'); fs.writeFileSync(args.configPath, invalid);
  assert.throws(() => planInstall(args), /config_syntax_requires_review/); assert.ok(fs.readFileSync(args.configPath).equals(invalid)); assert.equal(fs.existsSync(args.installRoot), false);
});
test('installable-runtime quoted TOML headers preserve desktop neighbor and env bytes while updating the exact Core4 alias', () => {
  const before = '# desktop prefix\r\n[mcp_servers."after-effects"]\r\ncommand = "legacy-node"\r\nargs = ["legacy-entry"]\r\n\r\n[mcp_servers."after-effects".env]\r\nLEGACY_SETTING = "preserve"\r\n';
  const after = '  ["mcp_servers".\'neighbor-server\'.env] # next table\r\nNEIGHBOR_SETTING = "preserve too"\r\n';
  const ownHeader = ' [ "mcp_servers" . \'after-effects-core4\' ] # preserve header\r\n';
  const preferences = ' "enabled" = false # disabled preference\r\n \'tool_timeout_sec\' = 240 # timeout preference\r\n';
  const previous = before + ownHeader + preferences + 'command = "old"\r\nargs = ["old"]\r\n' + after;
  const result = configText(Buffer.from(previous), 'C:/descriptor.json', 'C:/node.exe', 'C:/entry.js');
  assert.ok(result.startsWith(before + ownHeader + preferences)); assert.ok(result.endsWith(after));
  assert.ok(result.includes('command = "C:/node.exe"\r\n')); assert.ok(result.includes('args = ["C:/entry.js","--installation","C:/descriptor.json"]\r\n'));
  assert.equal((result.match(/after-effects-core4/g) || []).length, 1);
  const appended = configText(Buffer.from(before), 'C:/descriptor.json', 'C:/node.exe', 'C:/entry.js');
  assert.equal(appended.slice(0, before.length), before); assert.ok(appended.slice(before.length).includes('[mcp_servers.after-effects-core4]\r\n'));
  const directory = temp(), { args } = install(directory); fs.writeFileSync(args.configPath, previous);
  const planned = planInstall(args);
  assert.ok(planned.nextConfig.startsWith(before + ownHeader + preferences)); assert.ok(planned.nextConfig.endsWith(after));
  assert.equal(fs.readFileSync(args.configPath, 'utf8'), previous); assert.equal(fs.existsSync(args.installRoot), false);
  const values = '[mcp_servers."after-effects"]\ncommand = "literal key = value"\nargs = [\n  "after\\u002deffects-core4 = {command=old}",\n  \'enab\\u006ced = false\',\n  { NAME = "tool_timeout_\\u0073ec = 240" },\n]\n';
  assert.ok(configText(Buffer.from(values), 'C:/descriptor.json', 'C:/node.exe', 'C:/entry.js').startsWith(values));
});
test('installable-runtime quoted TOML Core4 aliases refuse duplicate nested and dotted assignment ambiguity', () => {
  const edit = text => configText(Buffer.from(text), 'C:/descriptor.json', 'C:/node.exe', 'C:/entry.js');
  for (const alias of ['mcp_servers."after-effects-core4"', '"mcp_servers".after-effects-core4', "'mcp_servers'.'after-effects-core4'"]) {
    assert.throws(() => edit('[mcp_servers.after-effects-core4]\ncommand = "old"\n[' + alias + ']\ncommand = "other"\n'), /config_ambiguous_core4/);
    assert.throws(() => edit('[' + alias + '.env]\nVALUE = "old"\n'), /config_core4_nested_requires_review/);
    assert.throws(() => edit(alias + ' = { command = "old" }\n'), /config_ambiguous_core4/);
    assert.throws(() => edit(alias + '.command = "old"\n'), /config_ambiguous_core4/);
  }
  for (const key of ['after-effects-core4', '"after-effects-core4"', "'after-effects-core4'"]) {
    assert.throws(() => edit('["mcp_servers"]\n' + key + ' = { command = "old" }\n'), /config_ambiguous_core4/);
    assert.throws(() => edit('["mcp_servers"]\n' + key + '.command = "old"\n'), /config_ambiguous_core4/);
  }
  const directory = temp(), { args } = install(directory), ambiguous = '["mcp_servers"."after-effects-core4"]\ncommand = "old"\n[mcp_servers.after-effects-core4]\ncommand = "other"\n';
  fs.writeFileSync(args.configPath, ambiguous); assert.throws(() => planInstall(args), /config_ambiguous_core4/);
  assert.equal(fs.readFileSync(args.configPath, 'utf8'), ambiguous); assert.equal(fs.existsSync(args.installRoot), false);
});
test('installable-runtime quoted TOML unsupported key syntax remains closed without treating aliases as neighbors', () => {
  for (const header of ['[mcp_servers."after\\u002deffects-core4"]', '["mcp_servers.after-effects-core4"]', '[mcp_servers.""]', '[mcp_servers."neighbor server"]', "[mcp_servers.'neighbor.server']", '[[mcp_servers."after-effects-core4"]]']) {
    assert.throws(() => configText(Buffer.from(header + '\ncommand = "old"\n'), 'C:/descriptor.json', 'C:/node.exe', 'C:/entry.js'), /config_syntax_requires_review/);
  }
  for (const marker of ['"""', "'''"]) assert.throws(() => configText(Buffer.from('[mcp_servers."neighbor"]\nvalue = ' + marker + 'unsupported' + marker + '\n'), 'C:/descriptor.json', 'C:/node.exe', 'C:/entry.js'), /config_syntax_requires_review/);
});
function assertUnsupportedConfigKeyRefusesWithoutWrites(config) {
  const directory = temp(), { args } = install(directory); fs.writeFileSync(args.configPath, config);
  const originals = new Map(), open = fs.openSync; let writes = 0;
  for (const name of ['writeFileSync', 'appendFileSync', 'mkdirSync', 'renameSync', 'unlinkSync', 'rmSync']) {
    originals.set(name, fs[name]); fs[name] = () => { writes++; throw Error('unexpected config planning write'); };
  }
  fs.openSync = (file, flags, ...rest) => {
    if (typeof flags !== 'string' || flags !== 'r') { writes++; throw Error('unexpected writable config planning open'); }
    return open(file, flags, ...rest);
  };
  try { assert.throws(() => planInstall(args), /config_syntax_requires_review/); }
  finally { fs.openSync = open; for (const [name, original] of originals) fs[name] = original; }
  assert.equal(writes, 0); assert.equal(fs.readFileSync(args.configPath, 'utf8'), config); assert.equal(fs.existsSync(args.installRoot), false);
}
test('installable-runtime quoted TOML escaped Core4 assignment alias refuses before appending a duplicate table', () => {
  const key = '"after\\u002deffects-core4"';
  assert.equal([...key].filter(char => char === '\\').length, 1);
  assert.equal(JSON.parse(key), 'after-effects-core4');
  assertUnsupportedConfigKeyRefusesWithoutWrites('["mcp_servers"]\n' + key + ' = {command="old"}\n');
});
test('installable-runtime quoted TOML escaped preference keys refuse without removing enabled or timeout settings', () => {
  for (const [key, decoded, value] of [['"enab\\u006ced"', 'enabled', 'false'], ['"tool_timeout_\\u0073ec"', 'tool_timeout_sec', '240']]) {
    assert.equal([...key].filter(char => char === '\\').length, 1); assert.equal(JSON.parse(key), decoded);
    assertUnsupportedConfigKeyRefusesWithoutWrites('[mcp_servers."after-effects-core4"]\n' + key + ' = ' + value + '\ncommand = "old"\n');
  }
});
test('installable-runtime CLI apply requires reviewed package hash and mismatches have zero installation writes', () => {
  const directory = temp(), pkg = buildPackage(), file = path.join(directory, 'package.json'), project = path.join(directory, 'project'); fs.mkdirSync(project); fs.writeFileSync(file, JSON.stringify(pkg));
  const installer = path.join(root, 'tools/install-core4.js'), args = ['apply', '--package', file, '--node', fs.realpathSync(process.execPath)];
  const env = { ...process.env, LOCALAPPDATA: path.join(directory, 'local'), APPDATA: path.join(directory, 'roaming') };
  for (const extra of [[], ['--expected-package-hash', '0'.repeat(64)]]) {
    const result = spawnSync(process.execPath, [installer, ...args, ...extra], { cwd: project, env, encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 1); assert.match(result.stderr, /usage_install_mode_package_node_expected_hash|reviewed_package_hash_mismatch/);
    assert.equal(fs.existsSync(env.LOCALAPPDATA), false); assert.equal(fs.existsSync(env.APPDATA), false); assert.equal(fs.existsSync(path.join(project, '.codex')), false);
  }
});
function installerCliFixture() {
  const directory = temp(), workspace = path.join(directory, 'source'), foreign = path.join(directory, 'unrelated'), pkg = buildPackage(), file = path.join(directory, 'candidate.json');
  // Copy the real CLI and its eager import closure, never the real config/state.
  for (const relative of ['package.json', 'tools/install-core4.js', 'tools/package-installable.js', 'protocol/json.js', 'runtime/install-lease.js', 'runtime/stdio-entry.js']) {
    const target = path.join(workspace, 'core4', relative); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(path.join(root, relative), target);
  }
  for (const [target, content] of [[workspace, '# selected source\n[mcp_servers.neighbor]\ncommand = "preserve-source"\n'], [foreign, '# unrelated CWD\n[mcp_servers.neighbor]\ncommand = "preserve-foreign"\n']]) {
    fs.mkdirSync(path.join(target, '.codex'), { recursive: true }); fs.writeFileSync(path.join(target, '.codex/config.toml'), content);
  }
  fs.writeFileSync(file, JSON.stringify(pkg));
  const installer = path.join(workspace, 'core4/tools/install-core4.js'), env = { ...process.env, LOCALAPPDATA: path.join(directory, 'local'), APPDATA: path.join(directory, 'roaming') };
  function run(extra = [], { cwd = foreign, mode = 'dry-run', entry = installer } = {}) {
    const state = () => ({ entries: fs.readdirSync(directory, { recursive: true }).sort(), files: snapshot(directory) }), before = state();
    const result = spawnSync(process.execPath, [entry, mode, '--package', file, ...extra], { cwd, env, encoding: 'utf8', timeout: 10000, windowsHide: true });
    assert.equal(result.error, undefined); assert.deepEqual(state(), before, 'CLI preflight/dry-run must leave every fixture byte and directory unchanged');
    return result;
  }
  return { directory, workspace, foreign, pkg, file, installer, env, run };
}
test('installable-runtime CLI dry-run binds source workspace independently of CWD and defaults to its current Node', () => {
  const fixture = installerCliFixture(), { workspace, foreign, installer, run } = fixture;
  const sourceConfig = path.join(workspace, '.codex/config.toml'), foreignConfig = path.join(foreign, '.codex/config.toml');
  const quotedLegacy = '# selected source\n[mcp_servers."after-effects"]\ncommand = "preserve-source"\nargs = ["synthetic-legacy-entry"]\n[mcp_servers."after-effects".env]\nSYNTHETIC_LEGACY_SETTING = "preserve-env-bytes"\n';
  fs.writeFileSync(sourceConfig, quotedLegacy);
  const beforeSource = fs.readFileSync(sourceConfig), beforeForeign = fs.readFileSync(foreignConfig);
  const result = run(); assert.equal(result.status, 0, result.stderr); const report = JSON.parse(result.stdout);
  assert.equal(report.workspaceRoot, workspace); assert.equal(report.workspaceSource, 'installer-location'); assert.equal(report.installerPath, installer);
  assert.equal(report.configPath, sourceConfig); assert.equal(report.baseline.config, hash(beforeSource)); assert.notEqual(report.baseline.config, hash(beforeForeign));
  const installRoot = path.join(fixture.env.LOCALAPPDATA, 'AEAgentCore4');
  assert.equal(report.packageHash, fixture.pkg.packageHash); assert.equal(report.releaseDir, path.join(installRoot, 'releases', fixture.pkg.packageHash));
  assert.equal(report.descriptorPath, path.join(installRoot, 'installation.json')); assert.equal(report.stateDir, path.join(installRoot, 'state', 'production'));
  assert.equal(report.cepDir, path.join(fixture.env.APPDATA, 'Adobe', 'CEP', 'extensions', 'com.codex.aeagentcore4'));
  assert.equal(report.nodePath, process.execPath); assert.equal(report.nodeVersion, process.version); assert.equal(report.nodeHash, hash(fs.readFileSync(process.execPath))); assert.equal(report.liveProof, false);
  assert.ok(beforeSource.equals(fs.readFileSync(sourceConfig))); assert.ok(beforeForeign.equals(fs.readFileSync(foreignConfig)));
  const legacy = run(['--node', fs.realpathSync(process.execPath)], { cwd: workspace }); assert.equal(legacy.status, 0, legacy.stderr);
  assert.deepEqual(JSON.parse(legacy.stdout), report, 'legacy --node and a different CWD select exactly the same preflight inputs');
  const wrongNode = run(['--node', fixture.file]); assert.equal(wrongNode.status, 1); assert.match(wrongNode.stderr, /installer_candidate_node_must_be_current_process/);
  assert.equal(fs.readFileSync(sourceConfig, 'utf8'), quotedLegacy);
  for (const target of [fixture.env.LOCALAPPDATA, fixture.env.APPDATA]) assert.equal(fs.existsSync(target), false);
});
test('installable-runtime CLI explicit workspace requires an absolute marked source layout before writes', () => {
  const { directory, workspace, file, run } = installerCliFixture(), other = path.join(directory, 'other-source');
  fs.mkdirSync(path.join(other, 'core4/tools'), { recursive: true }); fs.copyFileSync(path.join(workspace, 'core4/package.json'), path.join(other, 'core4/package.json')); fs.copyFileSync(path.join(workspace, 'core4/tools/install-core4.js'), path.join(other, 'core4/tools/install-core4.js'));
  const selected = run(['--workspace', other]); assert.equal(selected.status, 0, selected.stderr); const report = JSON.parse(selected.stdout);
  assert.equal(report.workspaceRoot, other); assert.equal(report.workspaceSource, 'explicit-workspace'); assert.equal(report.configPath, path.join(other, '.codex/config.toml')); assert.equal(report.baseline.config, null);
  const relocated = path.join(workspace, 'core4/relocated/install-core4.js'); fs.mkdirSync(path.dirname(relocated)); fs.copyFileSync(path.join(workspace, 'core4/tools/install-core4.js'), relocated); fs.copyFileSync(path.join(workspace, 'core4/tools/package-installable.js'), path.join(path.dirname(relocated), 'package-installable.js'));
  const wrongPosition = run([], { entry: relocated }); assert.equal(wrongPosition.status, 1); assert.match(wrongPosition.stderr, /workspace_source_layout_required/);
  const explicitStandalone = run(['--workspace', other], { entry: relocated }); assert.equal(explicitStandalone.status, 0, explicitStandalone.stderr); assert.equal(JSON.parse(explicitStandalone.stdout).configPath, report.configPath);
  for (const [value, code] of [['source', 'workspace_absolute_exact_path_required'], [path.join(directory, 'missing'), 'workspace_source_layout_required'], [file, 'workspace_source_layout_required'], ['', 'workspace_absolute_exact_path_required']]) {
    for (const mode of ['dry-run', 'apply']) {
      const result = run(['--workspace', value, ...(mode === 'apply' ? ['--expected-package-hash', report.packageHash] : [])], { mode });
      assert.equal(result.status, 1, value); assert.equal(JSON.parse(result.stderr).error, code);
    }
  }
  const incomplete = run(['--workspace']); assert.equal(incomplete.status, 1); assert.match(incomplete.stderr, /usage_install_mode_package_node_expected_hash/);
  const marker = path.join(other, 'core4/package.json'), cli = path.join(other, 'core4/tools/install-core4.js');
  for (const value of ['{"name":"different-product"}', '{invalid']) {
    fs.writeFileSync(marker, value); const result = run(['--workspace', other]); assert.equal(result.status, 1); assert.match(result.stderr, /workspace_source_layout_required/);
  }
  fs.copyFileSync(path.join(workspace, 'core4/package.json'), marker); fs.unlinkSync(cli);
  const missingLayout = run(['--workspace', other]); assert.equal(missingLayout.status, 1); assert.match(missingLayout.stderr, /workspace_source_layout_required/);
  fs.unlinkSync(path.join(workspace, 'core4/package.json'));
  const missingDefault = run(); assert.equal(missingDefault.status, 1); assert.match(missingDefault.stderr, /workspace_source_layout_required/);
});
test('installable-runtime unknown Broker owner, ledger fault or unresolved intent permits diagnostics but no new physical read begin', async () => {
  for (const fault of ['orphan-gate', 'ledger-corrupt', 'unresolved']) {
    const directory = temp(), { plan } = install(directory), installed = applyInstall(plan), d = JSON.parse(fs.readFileSync(installed.descriptorPath)), brokerDir = path.join(d.stateDir, 'broker'); fs.mkdirSync(brokerDir, { recursive: true });
    if (fault === 'orphan-gate') fs.writeFileSync(path.join(brokerDir, 'broker-owner.gate'), 'preserved-unknown-owner');
    if (fault === 'ledger-corrupt') fs.writeFileSync(path.join(brokerDir, 'ledger.ndjson'), '{broken\n');
    if (fault === 'unresolved') new (require('../core/ledger').Ledger)(path.join(brokerDir, 'ledger.ndjson')).append({ type: 'intent', commandId: 'test-unresolved', taskId: 'test-task', target: { projectId: 'C:/test/project.aep' } });
    const input = new PassThrough(), output = new PassThrough(), pending = new Map(); let serial = 0, buffer = '';
    output.on('data', b => { buffer += b; let n; while ((n = buffer.indexOf('\n')) >= 0) { const r = JSON.parse(buffer.slice(0, n)); buffer = buffer.slice(n + 1); pending.get(r.id)?.(r); pending.delete(r.id); } });
    const runtime = await require(path.join(d.releaseDir, 'runtime/stdio-entry.js')).start({ descriptor: installed.descriptorPath, port: 0, input, output });
    async function call(name, payload = {}) { const id = ++serial, result = new Promise(resolve => pending.set(id, resolve)); input.write(JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: { payload } } }) + '\n'); const r = await result; return r.error ? { error: r.error.message } : JSON.parse(r.result.content[0].text); }
    try {
      const status = await call('core_status'); await client(status.physical.port, d);
      const contract = await call('get_module_contract', { moduleId: 'project-inspection' });
      const result = await call('inspect_module_target', { moduleId: 'project-inspection', contractId: contract.contractId, target: {} });
      assert.equal(result.error, fault === 'orphan-gate' ? 'state_owner_gate_unavailable' : fault === 'ledger-corrupt' ? 'ledger_corrupt' : 'controller_unresolved');
      assert.equal((await call('core_status')).physical.pending, null);
      const events = fs.readFileSync(path.join(d.stateDir, 'receiver/completions.ndjson'), 'utf8').trim().split('\n').map(JSON.parse); assert.equal(events.filter(e => e.type === 'begin').length, 0);
    } finally { await runtime.close(); input.end(); }
    if (fault === 'orphan-gate') assert.equal(fs.readFileSync(path.join(brokerDir, 'broker-owner.gate'), 'utf8'), 'preserved-unknown-owner');
    if (fault === 'ledger-corrupt') assert.equal(fs.readFileSync(path.join(brokerDir, 'ledger.ndjson'), 'utf8'), '{broken\n');
  }
});
test('installable-runtime actual HTTP auth role, origin, challenge, epoch, replay, bounded input and duplicate peer', async t => {
  const peer = createHttpPeer({ installation, directory: temp(), asset, port: 0, pollTimeout: 5 }); await peer.listen(); t.after(() => peer.close());
  const c = await client(peer.status().port);
  const foreign = await c.raw('/challenge', { role: 'panel' }, { Origin: 'https://example.test' }); assert.equal(foreign.status, 403);
  const wrongHost = await c.raw('/challenge', { role: 'panel' }, { Host: 'localhost:' + peer.status().port }); assert.equal(wrongHost.status, 403);
  const control = (await c.raw('/challenge', { role: 'control' })).value;
  assert.equal((await c.raw('/link', { challenge: control, peerId: 'control', proof: mac({ challenge: control, peerId: 'control' }, installation.controlToken) })).status, 403);
  const another = (await c.raw('/challenge', { role: 'panel' })).value;
  assert.equal((await c.raw('/link', { challenge: another, peerId: 'duplicate', proof: mac({ challenge: another, peerId: 'duplicate' }, installation.panelToken) })).value.error, 'duplicate_peer');
  const poll = c.envelope('/poll', {}); assert.equal((await c.raw('/poll', poll)).status, 200); assert.equal((await c.raw('/poll', poll)).status, 403);
  const old = c.envelope('/poll', {}); old.body.epoch = 'old'; old.mac = mac(old.body, installation.panelToken); assert.equal((await c.raw('/poll', old)).status, 403);
  const big = await c.raw('/challenge', { role: 'panel', padding: 'x'.repeat(300000) }); assert.equal(big.status, 413);
  assert.ok(!canonical(peer.status()).includes(installation.panelToken)); assert.ok(!canonical(peer.status()).includes(installation.controlToken));
});
function cors(response, origin) {
  assert.equal(response.headers['access-control-allow-origin'], origin);
  assert.equal(response.headers.vary, origin === undefined ? undefined : 'Origin');
  assert.equal(response.headers['access-control-allow-credentials'], undefined);
}
test('installable-runtime exact CEP Origin ingress and CORS success/error/OPTIONS matrix at Node HTTP boundary', async t => {
  const peer = createHttpPeer({ installation, directory: temp(), asset, port: 0, pollTimeout: 5 }); await peer.listen(); t.after(() => peer.close());
  const port = peer.status().port;
  assert.deepEqual(peer.status().peer, { connected: false, origin: null });
  for (const origin of ['null', 'file://']) {
    const challenge = await rawRequest(port, '/challenge', { role: 'panel' }, { origin });
    assert.equal(challenge.status, 200); assert.equal(challenge.value.origin, origin); cors(challenge, origin);
    const error = await rawRequest(port, '/challenge', { role: 'other' }, { origin });
    assert.equal(error.value.error, 'role_required'); cors(error, origin);
    const preflight = await rawRequest(port, '/challenge', undefined, { origin, method: 'OPTIONS' });
    assert.equal(preflight.status, 204); assert.equal(preflight.value, null); cors(preflight, origin);
    assert.equal(preflight.headers['access-control-allow-methods'], 'POST'); assert.equal(preflight.headers['access-control-allow-headers'], 'Content-Type');
    for (const host of ['localhost:' + port, '127.0.0.1:' + (port === 65535 ? port - 1 : port + 1), '[::1]:' + port]) {
      for (const method of ['POST', 'OPTIONS']) {
        const response = await rawRequest(port, '/challenge', { role: 'panel' }, { origin, method, headers: { Host: host } });
        assert.equal(response.value.error, 'loopback_host_required'); cors(response, undefined);
      }
    }
  }
  const invalid = [undefined, '', 'NULL', 'FILE://', 'File://', 'file:', 'file:/', 'file:///', 'file://localhost', 'file:///C:/panel.html', 'null, null', 'null, file://', 'null file://', 'n ull', 'file: //', 'http://127.0.0.1:' + port, 'http://localhost:' + port, 'https://example.test'];
  for (const origin of invalid) for (const method of ['POST', 'OPTIONS']) {
    const response = await rawRequest(port, '/challenge', { role: 'panel' }, { headers: { Origin: origin }, method });
    assert.equal(response.value.error, 'cep_origin_required', String(origin)); cors(response, undefined);
  }
  for (const values of [['null', 'null'], ['file://', 'file://'], ['null', 'file://'], ['file://', 'null']]) for (const method of ['POST', 'OPTIONS']) {
    const response = await rawRequest(port, '/challenge', { role: 'panel' }, { method, rawHeaders: ['Host', '127.0.0.1:' + port, 'Origin', values[0], 'oRiGiN', values[1], 'Content-Type', 'application/json'] });
    assert.equal(response.value.error, 'cep_origin_required'); cors(response, undefined);
  }
  // HTTP OWS is stripped by Node's parser before application validation. This is
  // a parser-layer observation, not a claim that original wire bytes are exact.
  for (const origin of ['null', 'file://']) {
    const response = await rawRequest(port, '/challenge', { role: 'panel' }, { origin: ' \t' + origin + '\t ' });
    assert.equal(response.status, 200); assert.equal(response.value.origin, origin); cors(response, origin);
  }
  assert.deepEqual(peer.status().peer, { connected: false, origin: null }, 'challenges, OPTIONS and rejected origins do not publish a peer origin');
});
for (const origin of ['null', 'file://']) test('installable-runtime Origin-bound challenge and peer preserve auth/sequence/pending/ACK: ' + origin, async t => {
  const directory = temp(), peer = createHttpPeer({ installation, directory, asset, port: 0, pollTimeout: 5 }); await peer.listen(); t.after(() => peer.close());
  const port = peer.status().port, foreign = origin === 'null' ? 'file://' : 'null';
  assert.deepEqual(peer.status().peer, { connected: false, origin: null });
  const raw = (route, body, selected = origin) => rawRequest(port, route, body, { origin: selected });
  const challenge = async (role = 'panel') => (await raw('/challenge', { role })).value;
  const link = (value, selected = origin, secret = installation.panelToken, peerId = 'test-peer') => raw('/link', { challenge: value, peerId, proof: mac({ challenge: value, peerId }, secret) }, selected);
  const crossed = await challenge(); assert.equal((await link(crossed, foreign)).value.error, 'peer_auth');
  assert.equal((await link(crossed)).value.error, 'peer_auth', 'foreign link burns the one-time challenge');
  const tampered = await challenge(); tampered.origin = foreign;
  assert.equal((await link(tampered, foreign)).value.error, 'peer_auth', 'even a recomputed valid MAC cannot replace the stored challenge');
  const wrongPin = await challenge(); wrongPin.packageHash = 'a'.repeat(64);
  assert.equal((await link(wrongPin)).value.error, 'peer_auth', 'stored pins remain bound even with a valid MAC');
  assert.equal((await link(await challenge(), origin, installation.controlToken)).value.error, 'peer_auth');
  const control = await challenge('control');
  assert.equal((await link(control, foreign, installation.controlToken)).value.error, 'peer_auth', 'origin is checked before role');
  assert.equal((await link(await challenge('control'), origin, installation.controlToken)).value.error, 'panel_role_required');
  const expired = await challenge(), now = Date.now;
  try { Date.now = () => now() + 10001; assert.equal((await link(expired)).value.error, 'peer_auth'); } finally { Date.now = now; }
  assert.deepEqual(peer.status().peer, { connected: false, origin: null }, 'failed authenticated links do not publish an origin');
  const c = await client(port, installation, origin); assert.equal(c.challenge.origin, origin);
  const expectedPeer = { connected: true, peerId: c.peerId, origin };
  assert.deepEqual(peer.status().peer, expectedPeer, 'status exposes only the authenticated peer identity and actual Origin');
  const other = await challenge(); assert.equal((await link(other, foreign, installation.panelToken, 'other-peer')).value.error, 'peer_auth', 'origin is checked before duplicate peer');
  assert.equal(peer.status().peer.peerId, c.peerId);
  assert.equal((await link(await challenge(), origin, installation.panelToken, 'other-peer')).value.error, 'duplicate_peer');
  assert.equal((await link(c.challenge)).value.error, 'peer_auth', 'successful link is also one-time');
  assert.deepEqual(peer.status().peer, expectedPeer, 'failed and duplicate links cannot replace the authenticated Origin');
  const envelope = c.envelope('/poll', {});
  assert.equal((await raw('/poll', envelope, 'https://example.test')).value.error, 'cep_origin_required');
  assert.deepEqual(peer.status().peer, expectedPeer, 'a rejected Origin cannot replace the authenticated Origin');
  const rejected = await raw('/poll', envelope, foreign); assert.equal(rejected.value.error, 'peer_auth_or_replay'); cors(rejected, foreign);
  assert.deepEqual(peer.status().peer, expectedPeer, 'a foreign request cannot promote its Origin into status');
  const accepted = await raw('/poll', envelope); assert.equal(accepted.status, 200); cors(accepted, origin); assert.equal(accepted.value.body.sequence, 1);
  assert.equal((await raw('/poll', envelope)).value.error, 'peer_auth_or_replay');
  for (const patch of [{ epoch: 'old' }, { peerId: 'other' }, { sequence: 100 }, { method: 'GET' }, { path: '/complete' }]) {
    const bad = c.envelope('/poll', {}, 2); Object.assign(bad.body, patch); bad.mac = mac(bad.body, installation.panelToken);
    assert.equal((await raw('/poll', bad)).value.error, 'peer_auth_or_replay');
  }
  const wrongMac = c.envelope('/poll', {}, 2); wrongMac.mac = mac(wrongMac.body, installation.controlToken);
  assert.equal((await raw('/poll', wrongMac)).value.error, 'peer_auth_or_replay');
  const extraOrigin = c.envelope('/poll', {}, 2); extraOrigin.body.origin = origin; extraOrigin.mac = mac(extraOrigin.body, installation.panelToken);
  assert.equal((await raw('/poll', extraOrigin)).value.error, 'unexpected_field', 'signed request schema is unchanged');
  const fresh = c.envelope('/poll', {}, 2);
  try {
    Date.now = () => now() + 45001;
    assert.equal((await raw('/poll', fresh, foreign)).value.error, 'peer_auth_or_replay');
    assert.equal(peer.status().peer.connected, false, 'foreign request did not refresh lastSeen');
    assert.equal(peer.status().peer.origin, origin, 'an expired peer retains its authenticated Origin; connected reports freshness');
    assert.equal((await raw('/poll', fresh)).status, 200); assert.equal(peer.status().peer.connected, true);
  } finally { Date.now = now; }
  let settled = false; const inspection = peer.inspect({}); inspection.then(() => { settled = true; }, () => { settled = true; });
  const nextPoll = c.envelope('/poll', {}, 3), beforeDelivery = fs.readFileSync(path.join(directory, 'completions.ndjson'));
  assert.equal(peer.status().pending.delivered, false);
  assert.equal((await raw('/poll', nextPoll, foreign)).value.error, 'peer_auth_or_replay');
  assert.equal(peer.status().pending.delivered, false); assert.ok(fs.readFileSync(path.join(directory, 'completions.ndjson')).equals(beforeDelivery));
  const frame = (await raw('/poll', nextPoll)).value.body.payload.command;
  const receipt = { commandId: frame.commandId, originalBinding: frame.originalBinding, pins: frame.pins, result: { observationVersion: 1, target: { projectId: null, compId: null }, project: { name: 'Untitled', numItems: 0, saved: false }, compositions: [], layers: [], truncated: false, aeVersion: '26.0-fixture' } };
  const completion = c.envelope('/complete', receipt, 4), before = fs.readFileSync(path.join(directory, 'completions.ndjson'));
  const status = peer.status(); const denied = await raw('/complete', completion, foreign);
  assert.equal(denied.value.error, 'peer_auth_or_replay'); assert.equal(denied.value.body, undefined); assert.equal(settled, false);
  assert.deepEqual(peer.status().pending, status.pending); assert.ok(fs.readFileSync(path.join(directory, 'completions.ndjson')).equals(before));
  const ack = await raw('/complete', completion); assert.equal(ack.status, 200); cors(ack, origin);
  assert.equal(ack.value.mac, mac(ack.value.body, installation.panelToken)); assert.equal(ack.value.body.payload.ack.commandId, frame.commandId);
  assert.equal((await inspection).observation.project.name, 'Untitled'); assert.equal(peer.status().pending, null);
  const completed = fs.readFileSync(path.join(directory, 'completions.ndjson'));
  assert.equal(completed.toString().trim().split('\n').map(JSON.parse).filter(e => e.type === 'complete').length, 1);
  assert.equal((await raw('/complete', completion)).value.error, 'peer_auth_or_replay');
  assert.ok(fs.readFileSync(path.join(directory, 'completions.ndjson')).equals(completed), 'same signed completion cannot ACK twice');
  assert.deepEqual(peer.status().peer, expectedPeer);
  assert.ok(!canonical(peer.status()).includes(installation.panelToken)); assert.ok(!canonical(peer.status()).includes(installation.controlToken));
});
test('installable-runtime panel VM/WebCrypto shim validates challenge Origin before signing or link and signs full original challenge', async () => {
  const source = fs.readFileSync(path.join(root, 'cep/js/panel.js'), 'utf8');
  for (const origin of ['null', 'file://', undefined, '', 'NULL', 'FILE://', 'file:///', 'https://example.test']) {
    const accepted = origin === 'null' || origin === 'file://', calls = [], signed = [];
    const challenge = { epoch: 'shim-epoch', nonce: 'shim-nonce', role: 'panel', ...installation, executorHash: asset.executorHash, controllerId: 'shim-controller' };
    delete challenge.panelToken; delete challenge.controlToken; if (origin !== undefined) challenge.origin = origin;
    const cfg = { ...installation, executorHash: asset.executorHash, assetKey: asset.assetKey }, elements = { status: {}, detail: {} };
    let finish; const finished = new Promise(resolve => { finish = resolve; });
    elements.connect = { addEventListener() {}, set disabled(value) { if (!value) finish(); } };
    let recovered = 0;
    const cryptoShim = { getRandomValues: value => webcrypto.getRandomValues(value), subtle: { importKey: (...args) => webcrypto.subtle.importKey(...args), sign: (...args) => { signed.push(Buffer.from(args[2]).toString()); return webcrypto.subtle.sign(...args); } } };
    const context = vm.createContext({ crypto: cryptoShim, TextEncoder, Uint8Array, AbortController, setTimeout, clearTimeout, localStorage: memoryStorage(), document: { getElementById: id => elements[id] }, __adobe_cep__: { evalScript() { throw new Error('no native dispatch in shim'); } },
      Core4Installation: cfg,
      async fetch(url, options) {
        const route = new URL(url).pathname, value = JSON.parse(options.body); calls.push({ route, options, value });
        assert.deepEqual(Object.keys(options.headers), ['Content-Type']); assert.equal(options.credentials, 'omit'); assert.equal(options.cache, 'no-store');
        assert.ok(options.signal instanceof AbortSignal);
        if (route === '/challenge') return { ok: true, json: async () => challenge };
        if (route === '/link') {
          assert.equal(canonical(value.challenge), canonical(challenge)); assert.equal(value.proof, mac({ challenge, peerId: value.peerId }, installation.panelToken));
          const body = { linked: true, peerId: value.peerId, epoch: challenge.epoch, controllerId: challenge.controllerId, pins: { installationId: cfg.installationId, packageHash: cfg.packageHash, executorHash: cfg.executorHash }, receiverStoreIdentity: 'shim-store', laneClosed: false }; return { ok: true, json: async () => ({ body, mac: mac(body, installation.panelToken) }) };
        }
        assert.equal(route, '/poll'); throw new Error('shim_stop_after_poll');
      }
    });
    vm.runInContext('window=this;', context);
    vm.runInContext(fs.readFileSync(path.join(root, 'cep/js/poll-dispatcher.js'), 'utf8'), context);
    context.Core4PollDispatcher.createDispatcher = () => ({ recover: async () => { recovered++; } });
    vm.runInContext(source, context); await finished;
    assert.deepEqual(calls.map(c => c.route), accepted ? ['/challenge', '/link', '/poll'] : ['/challenge'], elements.status.textContent);
    assert.equal(recovered, accepted ? 1 : 0);
    if (accepted) { assert.equal(signed[0], canonical({ challenge, peerId: calls[1].value.peerId })); assert.match(elements.status.textContent, /shim_stop_after_poll/); }
    else { assert.equal(signed.length, 0); assert.equal(elements.status.textContent, 'Остановлено: installation_binding'); }
  }
});
test('installable-runtime real HTTP and compiled registry VM: begin before evaluate, receipt before POST, durable ACK then latch clear', async t => {
  const directory = temp(), pkg = buildPackage(), peer = createHttpPeer({ installation, directory, asset, port: 0, pollTimeout: 5 }); await peer.listen(); t.after(() => peer.close());
  const c = await client(peer.status().port), storage = memoryStorage(); let physicalCalls = 0;
  const host = fakeHost(pkg);
  const dispatch = dispatcher(pkg, { installationId: installation.installationId, assetKey: asset.assetKey, pins: c.pins, storage,
    csInterface: { evalScript(script, cb) { physicalCalls++; assert.match(fs.readFileSync(path.join(directory, 'completions.ndjson'), 'utf8'), /"type":"begin"/); assert.ok(dispatch.pending()); host.evalScript(script, cb); } },
    complete: async receipt => { assert.ok(dispatch.pending().result); const result = await c.call('/complete', receipt); assert.match(fs.readFileSync(path.join(directory, 'completions.ndjson'), 'utf8'), /"type":"complete"/); return result; }
  });
  const inspection = peer.inspect({ compId: 7 }); const frame = (await c.call('/poll', {})).command;
  await dispatch.dispatch(frame); const result = await inspection;
  assert.equal(result.observation.target.compId, 7); assert.equal(result.observation.layers[0].layerId, 11); assert.equal(result.continuity, false); assert.equal(dispatch.pending(), null); assert.equal(physicalCalls, 1);
  assert.throws(() => dispatch.dispatch({ ...frame, source: 'raw JSX' }), /invalid_frame/);
  const missingAck = dispatcher(pkg, { installationId: 'wrong-ack', assetKey: asset.assetKey, pins: c.pins, storage: memoryStorage(), csInterface: host, complete: async () => ({ ack: { commandId: 'wrong' } }) });
  await assert.rejects(missingAck.dispatch(frame), /completion_ack_mismatch/); assert.ok(missingAck.pending().result);
});
for (const origin of ['null', 'file://']) test('installable-runtime callback loss fences durable store and persisted browser latch: no replay on reload or cross-Origin restart: ' + origin, async t => {
  const directory = temp(), pkg = buildPackage(), peer = createHttpPeer({ installation, directory, asset, port: 0, timeout: 40 }); await peer.listen();
  const c = await client(peer.status().port, installation, origin), storage = memoryStorage(); let physicalCalls = 0;
  const options = { installationId: installation.installationId, assetKey: asset.assetKey, pins: c.pins, storage, csInterface: { evalScript() { physicalCalls++; } }, complete: () => { throw new Error('unexpected'); } };
  const dispatch = dispatcher(pkg, options);
  const inspection = peer.inspect({}); const rejected = assert.rejects(inspection, /host_callback_timeout/);
  const frame = (await c.call('/poll', {})).command; dispatch.dispatch(frame); await rejected;
  assert.equal(physicalCalls, 1); await assert.rejects(dispatcher(pkg, options).recover(), /physical_outcome_unknown_no_replay/);
  assert.throws(() => dispatch.dispatch(frame), /physical_latch_present/);
  assert.equal(peer.status().unknown, true); await peer.close();
  const reopened = createHttpPeer({ installation, directory, asset, port: 0 }); await reopened.listen(); t.after(() => reopened.close());
  assert.equal(reopened.status().storeClosed, true); assert.throws(() => reopened.inspect({}), /receiver_lane_closed/);
  const reconnected = await client(reopened.status().port, installation, origin === 'null' ? 'file://' : 'null');
  const before = fs.readFileSync(path.join(directory, 'completions.ndjson'));
  const receipt = { commandId: frame.commandId, originalBinding: frame.originalBinding, pins: frame.pins, result: { readFailureVersion: 1, outcome: 'rejected', code: 'inspection_failed' } };
  assert.equal((await reconnected.raw('/complete', reconnected.envelope('/complete', receipt))).value.error, 'unknown_no_promotion');
  assert.ok(fs.readFileSync(path.join(directory, 'completions.ndjson')).equals(before)); assert.equal(physicalCalls, 1);
  assert.throws(() => reopened.inspect({}), /receiver_lane_closed/);
});
test('installable-runtime missing fixed host registry returns known read rejection after durable begin, no raw fallback', async t => {
  const directory = temp(), pkg = buildPackage(), peer = createHttpPeer({ installation, directory, asset, port: 0 }); await peer.listen(); t.after(() => peer.close());
  const c = await client(peer.status().port), context = vm.createContext({ JSON: undefined }); let physicalCalls = 0;
  const dispatch = dispatcher(pkg, { installationId: installation.installationId, assetKey: asset.assetKey, pins: c.pins, storage: memoryStorage(), csInterface: { evalScript(script, cb) { physicalCalls++; cb(vm.runInContext(script, context)); } }, complete: p => c.call('/complete', p) });
  const rejected = assert.rejects(peer.inspect({}), /host_registry_unavailable/);
  await dispatch.dispatch((await c.call('/poll', {})).command); await rejected;
  assert.equal(physicalCalls, 1); assert.equal(peer.status().storeClosed, false); assert.equal(dispatch.pending(), null);
});
test('installable-runtime long Cyrillic display names and total inspection budget stay bounded at actual HTTP boundary; next read survives known budget refusal', async t => {
  const directory = temp(), pkg = buildPackage(), peer = createHttpPeer({ installation, directory, asset, port: 0 }); await peer.listen(); t.after(() => peer.close());
  const c = await client(peer.status().port), longName = 'ОченьДлинноеИмя'.repeat(2000);
  function CompItem(id) { this.id = id; this.name = longName; this.duration = 10; this.numLayers = 1000; this.layer = n => ({ id: 1000 + n, name: longName, property: () => ({}) }); }
  const project = { file: { fsName: 'C:/fixture/проект.aep', name: longName }, numItems: 500, item: n => new CompItem(n) };
  const context = vm.createContext({ JSON: undefined, Math, Error, CompItem, app: { version: '26.0-fixture', project } }); vm.runInContext('Object.keys=undefined;', context); vm.runInContext(Buffer.from(pkg.files['cep/jsx/registry.jsx'], 'base64').toString(), context);
  const dispatch = dispatcher(pkg, { installationId: installation.installationId, assetKey: asset.assetKey, pins: c.pins, storage: memoryStorage(), csInterface: { evalScript(script, cb) { cb(vm.runInContext(script, context)); } }, complete: p => c.call('/complete', p) });
  async function read() { const inspection = peer.inspect({ compId: 7 }); const observed = inspection.then(value => ({ value }), error => ({ error })); await dispatch.dispatch((await c.call('/poll', {})).command); return observed; }
  const first = (await read()).value.observation; assert.equal(first.target.projectId, project.file.fsName); assert.equal(first.target.compId, 7); assert.equal(first.truncated, true); assert.ok(JSON.stringify(first).length <= 40000); assert.ok(Buffer.byteLength(JSON.stringify(first)) < 200000); assert.ok([...first.layers, ...first.compositions].every(item => item.name.length <= 256));
  project.file.fsName = 'C:/' + 'я'.repeat(50000); const oversized = await read(); assert.equal(oversized.error.code, 'inspection_result_budget'); assert.equal(peer.status().storeClosed, false); assert.equal(dispatch.pending(), null);
  project.file.fsName = 'C:/fixture/проект.aep'; assert.equal((await read()).value.observation.target.compId, 7);
});
test('installable-runtime real stdio child consumes generated MCP config, advertises generic API, status without panel, then typed module inspect via HTTP + VM', async t => {
  const directory = path.join(temp(), 'Core с пробелом'), pkg = buildPackage(), { plan } = install(directory, pkg), installed = applyInstall(plan), d = JSON.parse(fs.readFileSync(installed.descriptorPath));
  const ownConfig = fs.readFileSync(plan.configPath, 'utf8').split('[mcp_servers.after-effects-core4]')[1];
  // Installer emits the JSON-compatible TOML basic-string/array subset. Consume
  // its decoded values verbatim; rebuilding paths here concealed Windows failures.
  const command = JSON.parse(/^command = (.+)$/m.exec(ownConfig)[1]), args = JSON.parse(/^args = (.+)$/m.exec(ownConfig)[1]);
  assert.equal(args.length, 3); assert.equal(args[1], '--installation');
  verifyInstallation(args[2]);
  // Only the listener port uses the fixture seam; command/entry/descriptor
  // come directly from the installed MCP config with no path normalization.
  const child = spawn(command, ['-e', 'require(process.argv[1]).start({descriptor:process.argv[3],port:0}).catch(e=>{process.stderr.write(e.code||e.message);process.exitCode=1})', ...args], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  const waiting = new Map(); let output = '', errors = '', nextId = 0;
  child.stderr.on('data', b => errors += b);
  child.stdout.on('data', b => { output += b; let n; while ((n = output.indexOf('\n')) >= 0) { const value = JSON.parse(output.slice(0, n)); output = output.slice(n + 1); waiting.get(value.id)?.(value); waiting.delete(value.id); } });
  async function rpc(method, params) { const id = ++nextId; const promise = new Promise((resolve, reject) => { waiting.set(id, resolve); const timer = setTimeout(() => reject(new Error('stdio_timeout:' + errors)), 15000); timer.unref(); }); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) }) + '\n'); const response = await promise; assert.equal(response.error, undefined, JSON.stringify(response)); return response.result; }
  async function tool(name, payload = {}) { const result = await rpc('tools/call', { name, arguments: { payload } }); return JSON.parse(result.content[0].text); }
  const initialized = await rpc('initialize'); assert.equal(initialized.serverInfo.version, '4.2.2');
  const listed = await rpc('tools/list'); assert.ok(listed.tools.some(x => x.name === 'inspect_module_target')); assert.ok(!listed.tools.some(x => x.name === 'inspect_project'));
  const withMeta = await rpc('tools/call', { name: 'core_status', arguments: { payload: {} }, _meta: { progressToken: 'fixture-progress', traceparent: 'fixture-trace' } });
  assert.equal(JSON.parse(withMeta.content[0].text).product, 'AE Agent Core 4.2.2'); assert.ok(!withMeta.content[0].text.includes('fixture-progress'));
  await assert.rejects(rpc('tools/call', { name: 'core_status', arguments: { payload: {} }, _meta: { padding: 'x'.repeat(9000) } }), /invalid_protocol_metadata/);
  await assert.rejects(rpc('tools/call', { name: 'core_status', arguments: { payload: {}, _meta: { grant: true } } }), /unexpected_field/);
  const status = await tool('core_status'); assert.equal(status.physical.peer.connected, false); assert.equal(status.automaticLifecycle, 'unavailable');
  const modules = await tool('list_modules'); assert.ok(modules.modules.some(x => x.id === 'project-inspection'));
  const contract = await tool('get_module_contract', { moduleId: 'project-inspection' }); assert.equal(contract.contract.executionPolicy, 'read-only-current-observation-v1');
  await assert.rejects(tool('inspect_module_target', { moduleId: 'titles', contractId: contract.contractId, target: {} }), /contract_identity/);
  await assert.rejects(tool('inspect_module_target', { contractId: contract.contractId, target: {} }), /contract_identity/);
  assert.equal((await tool('core_status')).physical.pending, null);
  const c = await client(status.physical.port, d), host = fakeHost(pkg); let refuse = true;
  const dispatch = dispatcher(pkg, { installationId: d.installationId, assetKey: asset.assetKey, pins: c.pins, storage: memoryStorage(), csInterface: { evalScript(script, cb) { if (refuse) { refuse = false; cb(JSON.stringify({ readFailureVersion: 1, outcome: 'rejected', code: 'host_registry_unavailable' })); } else host.evalScript(script, cb); } }, complete: p => c.call('/complete', p) });
  const refused = assert.rejects(tool('inspect_module_target', { moduleId: 'project-inspection', contractId: contract.contractId, target: {} }), /host_registry_unavailable/);
  await dispatch.dispatch((await c.call('/poll', {})).command); await refused;
  const inspection = tool('inspect_module_target', { moduleId: 'project-inspection', contractId: contract.contractId, target: { compId: 7 } });
  await dispatch.dispatch((await c.call('/poll', {})).command); assert.equal((await inspection).observation.compositions[0].compId, 7);
  child.stdin.end(); await once(child, 'exit'); assert.equal(errors, ''); assert.equal(child.exitCode, 0);
});
test('installable-runtime private adoption bootstrap imports no mutable operator-relative provider before verified release preflight', () => {
  const directory = temp(), { plan } = install(directory), installed = applyInstall(plan), d = JSON.parse(fs.readFileSync(installed.descriptorPath));
  const operator = path.join(directory, 'operator/tools/adopt-host.js'), provider = path.join(directory, 'operator/runtime/windows-reservation-provider.js'), sentinel = path.join(directory, 'UNVERIFIED-ADOPTION-PROVIDER');
  fs.mkdirSync(path.dirname(operator), { recursive: true }); fs.mkdirSync(path.dirname(provider), { recursive: true }); fs.copyFileSync(path.join(root, 'tools/adopt-host.js'), operator);
  fs.writeFileSync(provider, 'require("node:fs").writeFileSync(' + JSON.stringify(sentinel) + ',"executed");');
  const witness = path.join(directory, 'witness.json'); fs.writeFileSync(witness, JSON.stringify({ installationId: 'wrong-witness', machineId: d.machineId }));
  const rejected = spawnSync(process.execPath, [operator, '--installation', installed.descriptorPath, '--witness', witness], { encoding: 'utf8', windowsHide: true, timeout: 5000 }); assert.equal(rejected.status, 1); assert.match(rejected.stderr, /adoption_witness_identity/); assert.equal(fs.existsSync(sentinel), false);
  fs.writeFileSync(path.join(d.releaseDir, 'runtime/windows-reservation-provider.js'), 'require("node:fs").writeFileSync(' + JSON.stringify(sentinel) + ',"executed");');
  const unverified = spawnSync(process.execPath, [operator, '--installation', installed.descriptorPath, '--witness', witness], { encoding: 'utf8', windowsHide: true, timeout: 5000 }); assert.equal(unverified.status, 1); assert.match(unverified.stderr, /installed_release_bytes/); assert.equal(fs.existsSync(sentinel), false);
});
test('installable-runtime private adoption preflight verifies the installed Titles composition', t => {
  const directory = temp();
  t.after(() => {
    assert.equal(path.dirname(fs.realpathSync(directory)), fs.realpathSync(os.tmpdir()));
    assert.match(path.basename(directory), /^core4-installable-/);
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const { plan } = install(directory, buildPackage(root, 'manual-titles-variants', { runtimeModel: 'owner' }));
  const installed = applyInstall(plan), d = JSON.parse(fs.readFileSync(installed.descriptorPath));
  const witness = path.join(directory, 'witness.json');
  fs.writeFileSync(witness, JSON.stringify({ installationId: 'wrong-witness', machineId: d.machineId }));
  const invoke = () => spawnSync(process.execPath, [path.join(root, 'tools/adopt-host.js'), '--installation', installed.descriptorPath, '--witness', witness],
    { encoding: 'utf8', windowsHide: true, timeout: 5000 });
  const verified = invoke();
  assert.equal(verified.status, 1);
  assert.equal(verified.stderr.trim(), 'adoption_witness_identity');
  fs.appendFileSync(path.join(d.cepDir, 'installation.js'), '\n/* changed CEP config */\n');
  const tampered = invoke();
  assert.equal(tampered.status, 1);
  assert.equal(tampered.stderr.trim(), 'installation_cep_bytes');
  assert.equal(fs.existsSync(path.join(d.stateDir, 'host-adoption.json')), false);
  assert.equal(fs.existsSync(path.join(d.installRoot, 'install.lock')), false);
});
test('installable-runtime real stdio process crash after delivery preserves original ongoing record and blocks new reads after restart', async t => {
  const directory = temp(), { plan } = install(directory), installed = applyInstall(plan), d = JSON.parse(fs.readFileSync(installed.descriptorPath));
  function launch() {
    const child = spawn(process.execPath, ['-e', 'require(process.argv[1]).start({descriptor:process.argv[2],port:0}).catch(e=>{process.stderr.write(e.code||e.message);process.exitCode=1})', path.join(d.releaseDir, 'runtime/stdio-entry.js'), installed.descriptorPath], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    t.after(() => { if (child.exitCode === null && !child.killed) child.kill(); });
    const pending = new Map(); let buffer = '', serial = 0, errors = '';
    child.stderr.on('data', b => errors += b);
    child.stdout.on('data', b => { buffer += b; let newline; while ((newline = buffer.indexOf('\n')) >= 0) { const result = JSON.parse(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1); pending.get(result.id)?.resolve(result); pending.delete(result.id); } });
    child.on('exit', () => { for (const p of pending.values()) p.reject(new Error('child_exited:' + errors)); pending.clear(); });
    return { child, async call(name, payload = {}) { const id = ++serial; const result = new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); }); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: { payload } } }) + '\n'); const response = await result; return response.error ? { error: response.error.message } : JSON.parse(response.result.content[0].text); } };
  }
  const first = launch(), status = await first.call('core_status'), c = await client(status.physical.port, d), contract = await first.call('get_module_contract', { moduleId: 'project-inspection' });
  const inspection = first.call('inspect_module_target', { moduleId: 'project-inspection', contractId: contract.contractId, target: {} }); const crashed = assert.rejects(inspection, /child_exited/);
  const frame = (await c.call('/poll', {})).command; assert.ok(frame.commandId);
  first.child.kill(); await once(first.child, 'exit'); await crashed;
  const records = fs.readFileSync(path.join(d.stateDir, 'receiver/completions.ndjson'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(records.at(-1).type, 'begin'); assert.equal(records.at(-1).commandId, frame.commandId);
  const second = launch(), reopened = await second.call('core_status'); assert.equal(reopened.physical.storeClosed, true); assert.equal(reopened.physical.unknown, true);
  const freshContract = await second.call('get_module_contract', { moduleId: 'project-inspection' });
  assert.equal((await second.call('inspect_module_target', { moduleId: 'project-inspection', contractId: freshContract.contractId, target: {} })).error, 'receiver_lane_closed');
  second.child.stdin.end(); await once(second.child, 'exit');
});
