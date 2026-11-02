'use strict';
// Private B3 owner request and durable inspection. This slice does not archive
// stores, remove fences, finish a reset, open a new session or expose an RPC.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const { canonical, hash, fail } = require('../protocol/json');
const { inspectStartOverHistory, assertStartOverHistoryContinuation } = require('./start-over-inspection');
const { observeStartOverInventory } = require('./start-over-process');
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/, HEX = /^[a-f0-9]{64}$/;
const STATS = ['dev', 'ino', 'size', 'birthtimeNs', 'mtimeNs', 'ctimeNs'];
const MARKERS = ['runtime-owner.json', 'runtime-owner.next', 'runtime-diagnostic.json', 'broker/broker-owner.lock', 'broker/broker-owner.gate', 'receiver/owner'];
const PROTECTED = ['installation.json', 'origin.json', 'core-client.json', 'state/production/origin.json', 'state/production/host-adoption.json', 'state/production/work-session.json'];
const INTENT = ['id', 'newSessionId', 'directory', 'requestor', 'actors', 'protected', 'markers', 'prefix', 'createdAt'];
const equal = (a, b) => canonical(a) === canonical(b);
const stamp = s => Object.fromEntries(STATS.map(k => [k, String(s[k])]));
const directoryStamp = s => Object.fromEntries(['dev', 'ino', 'birthtimeNs'].map(k => [k, String(s[k])]));
function exact(v, keys) { if (!v || Object.getPrototypeOf(v) !== Object.prototype || !equal(Object.keys(v).sort(), [...keys].sort())) fail('start_over_schema'); }
function same(a, b, ignored = []) { return !!a && !!b && STATS.filter(k => !ignored.includes(k)).every(k => String(a[k]) === String(b[k])); }
function scope(s, full = false) {
  exact(s, ['bootId', 'pid', 'birthTicks', ...(full ? ['brokerToken', 'receiverToken', 'startupToken'] : [])]);
  if (![s.bootId, ...(full ? [s.brokerToken, s.receiverToken, s.startupToken] : [])].every(v => UUID.test(v)) || !Number.isSafeInteger(s.pid) || s.pid < 1 || s.pid > 0xffffffff || typeof s.birthTicks !== 'string' || !/^[1-9][0-9]{0,18}$/.test(s.birthTicks) || BigInt(s.birthTicks) > 3155378975999999999n) fail('start_over_scope');
}
const short = s => ({ bootId: s.bootId, pid: s.pid, birthTicks: s.birthTicks });
function plain(file, missing = false, directory = false) {
  if (!path.isAbsolute(file) || path.resolve(file) !== file) fail('start_over_path');
  let cursor = path.parse(file).root; const parts = file.slice(cursor.length).split(path.sep).filter(Boolean);
  for (const [i, part] of parts.entries()) {
    cursor = path.join(cursor, part); let s;
    try { s = fs.lstatSync(cursor, { bigint: true }); } catch (e) { if (missing && e.code === 'ENOENT') return false; throw e; }
    if (s.isSymbolicLink() || s.reparsePoint || fs.realpathSync(cursor) !== cursor || (i < parts.length - 1 || directory ? !s.isDirectory() : !s.isFile())) fail('start_over_path');
  }
  return true;
}
function read(file, limit = 128 * 1024) {
  if (!plain(file, true)) return { file, bytes: null, hash: null, stat: null };
  const before = fs.lstatSync(file, { bigint: true }), fd = fs.openSync(file, 'r'); let bytes, stat;
  try {
    const s = fs.fstatSync(fd, { bigint: true }); if (!same(s, before) || s.size > BigInt(limit)) fail('start_over_changed');
    bytes = Buffer.alloc(Number(s.size)); let at = 0;
    while (at < bytes.length) { const n = fs.readSync(fd, bytes, at, bytes.length - at, at); if (!n) fail('start_over_changed'); at += n; }
    if (fs.readSync(fd, Buffer.alloc(1), 0, 1, at) || !same(s, fs.fstatSync(fd, { bigint: true })) || !plain(file) || !same(s, fs.lstatSync(file, { bigint: true }))) fail('start_over_changed'); stat = stamp(s);
  } finally { fs.closeSync(fd); }
  if (!plain(file) || !same(stat, fs.lstatSync(file, { bigint: true }))) fail('start_over_changed');
  return { file, bytes, hash: hash(bytes), stat };
}
const info = v => ({ hash: v.hash, stat: v.stat });
function atomic(file, bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length > 128 * 1024 || plain(file, true)) fail('start_over_destination');
  plain(path.dirname(file), false, true); const stage = file + '.stage-' + crypto.randomUUID(); let fd;
  try {
    fd = fs.openSync(stage, 'wx+'); if (fs.writeSync(fd, bytes) !== bytes.length) fail('start_over_short_write'); fs.fsyncSync(fd);
    const before = fs.fstatSync(fd, { bigint: true });
    if (!plain(stage) || !same(before, fs.lstatSync(stage, { bigint: true })) || !read(stage).bytes?.equals(bytes)) fail('start_over_changed');
    fs.linkSync(stage, file);
    if (!plain(file) || !same(fs.fstatSync(fd, { bigint: true }), fs.lstatSync(file, { bigint: true })) || !read(file).bytes?.equals(bytes)) fail('start_over_changed');
    fs.unlinkSync(stage); const final = stamp(fs.fstatSync(fd, { bigint: true })), closing = fd; fd = undefined; fs.closeSync(closing);
    const result = read(file); if (!result.bytes?.equals(bytes) || !same(final, result.stat, ['ctimeNs'])) fail('start_over_changed'); return result;
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}
function context(options) {
  exact(options, ['installation', 'descriptorPath']); const { installation: d, descriptorPath } = options;
  if (!d || d.machineId !== os.hostname() || descriptorPath !== path.join(d.installRoot, 'installation.json') || d.stateDir !== path.join(d.installRoot, 'state/production') || !HEX.test(d.packageHash) || !HEX.test(d.panelToken) || !HEX.test(d.controlToken) || d.panelToken === d.controlToken) fail('start_over_installation');
  const descriptor = read(descriptorPath); if (!descriptor.bytes || !equal(JSON.parse(descriptor.bytes), d)) fail('start_over_installation');
  const verify = () => { if (!equal(require('./installation').verifyInstallation(descriptorPath), d)) fail('start_over_installation'); };
  verify(); const descriptorHash = descriptor.hash;
  const key = purpose => crypto.createHmac('sha256', Buffer.from(d.panelToken, 'hex')).update('ae-core4/' + purpose + '-key/v1\0').update(Buffer.from(d.controlToken, 'hex')).digest();
  const mac = (purpose, body) => crypto.createHmac('sha256', key(purpose)).update('ae-core4/' + (purpose === 'lifecycle' ? 'lifecycle' : 'start-over') + '-record/v1\0' + canonical(body)).digest('hex');
  const common = { version: 1, installationId: d.installationId, machineId: d.machineId, descriptorHash };
  function seal(kind, value) { const body = { ...common, kind, ...value }; return Buffer.from(canonical({ body, mac: mac('start-over', body) })); }
  function decode(v, kind, fields, purpose = 'start-over') {
    if (!v.bytes?.length || !Buffer.from(v.bytes.toString('utf8')).equals(v.bytes)) fail('start_over_record');
    let e; try { e = JSON.parse(v.bytes); } catch { fail('start_over_record'); }
    exact(e, ['body', 'mac']); exact(e.body, ['version', 'kind', 'installationId', 'machineId', 'descriptorHash', ...fields]);
    if (!HEX.test(e.mac) || !crypto.timingSafeEqual(Buffer.from(mac(purpose, e.body), 'hex'), Buffer.from(e.mac, 'hex')) || !Buffer.from(canonical(e)).equals(v.bytes) || !equal(Object.fromEntries(Object.keys(common).map(k => [k, e.body[k]])), common) || e.body.kind !== kind) fail('start_over_record');
    return e.body;
  }
  function protectedFacts() {
    verify(); const values = Object.fromEntries(PROTECTED.map(name => [name, read(path.join(d.installRoot, name))]));
    if (!values['installation.json'].bytes?.equals(descriptor.bytes) || !same(values['installation.json'].stat, descriptor.stat) || !values['origin.json'].bytes || !values['core-client.json'].bytes || !values['state/production/origin.json'].bytes?.equals(values['origin.json'].bytes)) fail('start_over_changed');
    const origin = JSON.parse(values['origin.json'].bytes); if (origin.installationId !== d.installationId || origin.machineId !== d.machineId) fail('start_over_installation');
    return Object.fromEntries(PROTECTED.map(name => [name, info(values[name])]));
  }
  function histories() { return { receiver: read(path.join(d.stateDir, 'receiver/completions.ndjson'), 64 * 1024 * 1024), ledger: read(path.join(d.stateDir, 'broker/ledger.ndjson'), 64 * 1024 * 1024) }; }
  const historyOptions = h => ({ installationId: d.installationId, machineId: d.machineId, descriptorPath, receiverBytes: h.receiver.bytes, ledgerBytes: h.ledger.bytes });
  function attributeMarkers(values) {
    const actors = [], full = new Map();
    function add(s) { scope(s, true); const k = s.bootId; if (full.has(k) && !equal(full.get(k), s)) fail('start_over_marker_scope'); if (!full.has(k)) { full.set(k, s); actors.push(short(s)); } }
    let owner;
    for (const name of ['runtime-owner.json', 'runtime-owner.next']) if (values[name].bytes) {
      const b = decode(values[name], 'runtime-owner', ['scope', 'phase', 'receiverIdentity'], 'lifecycle'); add(b.scope);
      if (!['starting', 'active'].includes(b.phase) || b.receiverIdentity !== null && typeof b.receiverIdentity !== 'string' || b.phase === 'active' && !b.receiverIdentity) fail('start_over_marker_scope');
      if (name === 'runtime-owner.json') owner = b;
      else if (!owner || !equal(owner.scope, b.scope) || b.phase !== 'active' || owner.receiverIdentity !== null && owner.receiverIdentity !== b.receiverIdentity) fail('start_over_marker_scope');
    }
    if (values['runtime-diagnostic.json'].bytes) { const b = decode(values['runtime-diagnostic.json'], 'diagnostic-owner', ['scope', 'reason'], 'lifecycle'); add(b.scope); if (typeof b.reason !== 'string' || !b.reason) fail('start_over_marker_scope'); }
    const expected = owner && { 'broker/broker-owner.lock': JSON.stringify({ pid: owner.scope.pid, token: owner.scope.brokerToken }), 'broker/broker-owner.gate': owner.scope.brokerToken, 'receiver/owner': canonical({ version: 1, pid: owner.scope.pid, token: owner.scope.receiverToken }) };
    for (const name of MARKERS.slice(3)) if (values[name].bytes && (!expected || !values[name].bytes.equals(Buffer.from(expected[name])))) fail('start_over_foreign_marker');
    return { values, owner, actors, facts: Object.fromEntries(MARKERS.map(name => [name, { ...info(values[name]), bytes: values[name].bytes?.toString('base64') ?? null }])) };
  }
  function markers() { return attributeMarkers(Object.fromEntries(MARKERS.map(name => [name, read(path.join(d.stateDir, name))]))); }
  function markerSnapshot(value) {
    exact(value, MARKERS); const values = {};
    for (const name of MARKERS) {
      const v = value[name]; exact(v, ['hash', 'stat', 'bytes']);
      if (v.hash === null) { if (v.stat !== null || v.bytes !== null) fail('start_over_record'); values[name] = { hash: null, stat: null, bytes: null }; continue; }
      if (!HEX.test(v.hash) || typeof v.bytes !== 'string' || v.bytes.length > 32768) fail('start_over_record'); exact(v.stat, STATS);
      if (Object.values(v.stat).some(n => typeof n !== 'string' || !/^(0|[1-9][0-9]*)$/.test(n))) fail('start_over_record');
      const bytes = Buffer.from(v.bytes, 'base64'); if (bytes.toString('base64') !== v.bytes || hash(bytes) !== v.hash || String(bytes.length) !== v.stat.size) fail('start_over_record');
      values[name] = { ...v, bytes };
    }
    return attributeMarkers(values);
  }
  function validateInventory(v) {
    exact(v, ['version', 'machineId', 'observedAt', 'processes']);
    if (v.version !== 1 || v.machineId !== d.machineId || typeof v.observedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v.observedAt) || !Number.isFinite(Date.parse(v.observedAt)) || new Date(v.observedAt).toISOString() !== v.observedAt || !Array.isArray(v.processes) || v.processes.length > 64) fail('start_over_inventory');
    const seen = new Set();
    for (const p of v.processes) {
      exact(p, ['pid', 'birthTicks', 'executablePath']);
      if (!Number.isSafeInteger(p.pid) || p.pid < 1 || p.pid > 0xffffffff || seen.has(p.pid) || typeof p.birthTicks !== 'string' || !/^[1-9][0-9]{0,18}$/.test(p.birthTicks) || BigInt(p.birthTicks) > 3155378975999999999n || typeof p.executablePath !== 'string' || p.executablePath.length > 2048 || /[\x00-\x1f]/.test(p.executablePath) || !path.win32.isAbsolute(p.executablePath) || /^[\\/]$/.test(path.win32.parse(p.executablePath).root) || path.win32.basename(p.executablePath).toLowerCase() !== 'afterfx.exe') fail('start_over_inventory');
      seen.add(p.pid);
    }
  }
  function directory(id) { if (!UUID.test(id)) fail('start_over_id'); const dir = path.join(d.installRoot, 'transactions', id + '-start-over'); plain(dir, false, true); return dir; }
  function active() {
    const barrier = read(path.join(d.stateDir, 'runtime-start-over.json')); if (!barrier.bytes) return null;
    const body = decode(barrier, 'start-over-intent', INTENT); if (!UUID.test(body.id) || !UUID.test(body.newSessionId)) fail('start_over_id'); scope(body.requestor);
    if (!Array.isArray(body.actors) || body.actors.length < 1 || body.actors.length > 16 || new Set(body.actors.map(s => { scope(s); return s.bootId; })).size !== body.actors.length || !body.actors.some(s => equal(s, body.requestor))) fail('start_over_scope');
    const dir = directory(body.id), original = read(path.join(dir, 'intent.json'));
    if (!original.bytes?.equals(barrier.bytes) || !same(original.stat, barrier.stat) || !equal(directoryStamp(fs.lstatSync(dir, { bigint: true })), body.directory)) fail('start_over_intent_identity');
    const a = fs.lstatSync(original.file, { bigint: true }), b = fs.lstatSync(barrier.file, { bigint: true }); if (a.nlink !== 2n || b.nlink !== 2n) fail('start_over_intent_identity');
    if (!equal(Object.keys(body.protected).sort(), [...PROTECTED].sort()) || typeof body.createdAt !== 'string' || !Number.isFinite(Date.parse(body.createdAt)) || new Date(body.createdAt).toISOString() !== body.createdAt || !equal(markerSnapshot(body.markers).actors, body.actors)) fail('start_over_schema');
    exact(body.prefix, ['receiver', 'ledger']);
    for (const k of ['receiver', 'ledger']) {
      const p = body.prefix[k]; exact(p, ['hash', 'stat', 'byteLength']);
      if (p.hash === null) { if (p.stat !== null || p.byteLength !== 0) fail('start_over_record'); continue; }
      if (!HEX.test(p.hash) || !Number.isSafeInteger(p.byteLength) || p.byteLength < 0 || p.byteLength > 64 * 1024 * 1024) fail('start_over_record'); exact(p.stat, STATS);
      if (Object.values(p.stat).some(n => typeof n !== 'string' || !/^(0|[1-9][0-9]*)$/.test(n)) || p.stat.size !== String(p.byteLength)) fail('start_over_record');
      const anchor = read(path.join(dir, 'original-' + k), 64 * 1024 * 1024);
      if (!anchor.bytes || anchor.bytes.length < p.byteLength || hash(anchor.bytes.subarray(0, p.byteLength)) !== p.hash || ['dev', 'ino', 'birthtimeNs'].some(n => p.stat[n] !== anchor.stat[n])) fail('start_over_prefix_changed');
    }
    const names = fs.readdirSync(dir); if (names.length > 64) fail('start_over_phase');
    for (const name of names) {
      const anchor = ['receiver', 'ledger'].find(k => name === 'original-' + k && body.prefix[k].hash !== null);
      if (!anchor && !['intent.json', 'inventory.json', 'stop-requested.json'].includes(name)) {
        const match = name.match(/^(?:inventory|stop-requested)\.json\.stage-([a-f0-9-]{36})$/); if (!match || !UUID.test(match[1])) fail('start_over_phase');
      }
      // Unpublished stages remain inert evidence, but never opaque symlinks,
      // directories or unbounded files inside an otherwise accepted phase.
      read(path.join(dir, name), anchor ? 64 * 1024 * 1024 : 128 * 1024);
    }
    return { barrier, body, dir };
  }
  function continuation(a) {
    const currentIntent = active(); if (!currentIntent || !equal(info(currentIntent.barrier), info(a.barrier))) fail('start_over_intent_identity');
    if (!equal(protectedFacts(), a.body.protected)) fail('start_over_changed');
    const now = histories(), initial = {};
    exact(a.body.prefix, ['receiver', 'ledger']);
    for (const k of ['receiver', 'ledger']) {
      const p = a.body.prefix[k], v = now[k]; exact(p, ['hash', 'stat', 'byteLength']);
      if (p.hash === null) { if (p.stat !== null || p.byteLength !== 0) fail('start_over_record'); initial[k + 'Bytes'] = null; continue; }
      if (!HEX.test(p.hash) || !Number.isSafeInteger(p.byteLength) || p.byteLength < 0 || p.byteLength > 64 * 1024 * 1024 || !v.bytes || v.bytes.length < p.byteLength || ['dev', 'ino', 'birthtimeNs'].some(n => p.stat?.[n] !== v.stat[n])) fail('start_over_prefix_changed');
      const prefix = v.bytes.subarray(0, p.byteLength); if (hash(prefix) !== p.hash) fail('start_over_prefix_changed'); initial[k + 'Bytes'] = prefix;
      const anchor = read(path.join(a.dir, 'original-' + k), 64 * 1024 * 1024); if (!anchor.bytes?.equals(v.bytes) || !same(anchor.stat, v.stat)) fail('start_over_prefix_changed');
    }
    const current = { receiverBytes: now.receiver.bytes, ledgerBytes: now.ledger.bytes };
    const result = assertStartOverHistoryContinuation({ installationId: d.installationId, machineId: d.machineId, descriptorPath, initial, current });
    if (!result.archiveEligibleHistory) fail('start_over_resource_fenced');
    return result;
  }
  function record(a, name, kind, fields) { const v = read(path.join(a.dir, name)); if (!v.bytes) return null; const b = decode(v, kind, ['id', 'intentHash', ...fields]); if (b.id !== a.body.id || b.intentHash !== a.barrier.hash) fail('start_over_record'); if (kind === 'start-over-inventory') validateInventory(b.observation); return b; }
  return { d, descriptorPath, protectedFacts, histories, historyOptions, markers, active, continuation, directory, seal, decode, record, validateInventory };
}
function inspect(c) {
  const a = c.active(); if (!a) return Object.freeze({ phase: 'running', id: null, resetComplete: false, resetPermit: false, aeAuthority: false });
  const h = c.continuation(a), inventory = c.record(a, 'inventory.json', 'start-over-inventory', ['observation']), stop = c.record(a, 'stop-requested.json', 'start-over-stop-requested', []);
  return Object.freeze({ id: a.body.id, newSessionId: a.body.newSessionId, phase: stop ? 'stop-requested' : inventory ? 'intent-with-inventory' : 'intent-without-inventory', requiresAEExit: h.requiresAEExit, inventoryRecorded: !!inventory, actors: Object.freeze(a.body.actors.map(s => Object.freeze({ ...s }))), resetComplete: false, resetPermit: false, aeAuthority: false });
}
function inspectStartOver(options) { return inspect(context(options)); }
function createOwnerStartOver(options) {
  exact(options, ['installation', 'descriptorPath', 'lifecycle', 'freeze', 'fencePhysical', 'stop']);
  const { lifecycle, freeze, fencePhysical, stop } = options;
  if (!lifecycle || typeof lifecycle.state !== 'function' || ![freeze, fencePhysical, stop].every(v => typeof v === 'function')) fail('start_over_owner_options');
  const c = context({ installation: options.installation, descriptorPath: options.descriptorPath }), s = lifecycle.state(), requestor = { bootId: s.processBootId, pid: s.pid, birthTicks: s.birthTicks }; scope(requestor);
  if (requestor.pid !== process.pid) fail('start_over_scope'); let pending, id = null, fault = null;
  async function begin() {
    try {
      freeze(); fencePhysical();
      if (c.active()) fail('start_over_in_progress');
      if (read(path.join(c.d.installRoot, 'install.lock')).bytes !== null || read(path.join(c.d.stateDir, 'runtime-maintenance.json')).bytes !== null) fail('start_over_install_busy');
      const protectedFacts = c.protectedFacts(), markers = c.markers(), histories = c.histories(), initial = inspectStartOverHistory(c.historyOptions(histories));
      if (!initial.archiveEligibleHistory) fail('start_over_resource_fenced');
      if (!markers.actors.some(a => equal(a, requestor))) fail('start_over_scope');
      if (markers.owner?.receiverIdentity !== null && markers.owner?.receiverIdentity !== undefined && markers.owner.receiverIdentity !== initial.receiver.identity) fail('start_over_marker_history');
      id = crypto.randomUUID(); const dir = path.join(c.d.installRoot, 'transactions', id + '-start-over'); plain(path.dirname(dir), false, true); fs.mkdirSync(dir); plain(dir, false, true);
      const prefix = Object.fromEntries(['receiver', 'ledger'].map(k => [k, { ...info(histories[k]), byteLength: histories[k].bytes?.length ?? 0 }]));
      const original = atomic(path.join(dir, 'intent.json'), c.seal('start-over-intent', { id, newSessionId: crypto.randomUUID(), directory: directoryStamp(fs.lstatSync(dir, { bigint: true })), requestor, actors: markers.actors, protected: protectedFacts, markers: markers.facts, prefix, createdAt: new Date().toISOString() }));
      if (!equal(c.protectedFacts(), protectedFacts) || !equal(c.markers().facts, markers.facts)) fail('start_over_changed');
      // Retain each observed journal inode before publishing admission intent.
      // Its prefix remains hash-bound while legitimate completions may append;
      // removing/recreating both current names cannot exploit inode reuse.
      for (const k of ['receiver', 'ledger']) if (histories[k].bytes !== null) {
        fs.linkSync(histories[k].file, path.join(dir, 'original-' + k));
        const anchor = read(path.join(dir, 'original-' + k), 64 * 1024 * 1024);
        if (!anchor.bytes?.equals(histories[k].bytes) || !same(anchor.stat, histories[k].stat, ['ctimeNs'])) fail('start_over_prefix_changed');
      }
      fs.linkSync(original.file, path.join(c.d.stateDir, 'runtime-start-over.json'));
      const a = c.active(); c.continuation(a);
      const observation = await observeStartOverInventory();
      c.continuation(a); c.validateInventory(observation);
      if (Math.abs(Date.now() - Date.parse(observation.observedAt)) > 5000) fail('start_over_inventory');
      atomic(path.join(dir, 'inventory.json'), c.seal('start-over-inventory', { id, intentHash: a.barrier.hash, observation }));
      c.continuation(a);
      const value = stop(id); if (!value || value.requested !== true || value.id !== id || value.fault) fail('start_over_stop_uncertain');
      atomic(path.join(dir, 'stop-requested.json'), c.seal('start-over-stop-requested', { id, intentHash: a.barrier.hash }));
      return inspect(c);
    } catch (e) { fault = e.code || 'start_over_request_uncertain'; throw e; }
  }
  return Object.freeze({ request() { if (!pending) pending = begin(); return pending; }, inspect: () => inspect(c), status: () => Object.freeze({ requested: !!pending, id, fault, resetComplete: false, aeAuthority: false }) });
}
module.exports = { createOwnerStartOver, inspectStartOver };
