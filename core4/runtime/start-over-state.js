'use strict';
// Private B3 owner request and durable inspection. This slice does not archive
// stores, remove fences, finish a reset, open a new session or expose an RPC.
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto');
const { canonical, hash, fail } = require('../protocol/json');
const { inspectStartOverHistory, assertStartOverHistoryContinuation } = require('./start-over-inspection');
const { observeStartOverInventory, observeStartOverStop } = require('./start-over-process');
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
    try { s = fs.lstatSync(cursor, { bigint: true }); } catch (e) {
      if (missing && e.code === 'ENOENT') {
        const existing = path.dirname(cursor);
        if (fs.realpathSync(existing) !== existing) fail('start_over_path');
        return false;
      }
      throw e;
    }
    if (s.isSymbolicLink() || s.reparsePoint || (i < parts.length - 1 || directory ? !s.isDirectory() : !s.isFile())) fail('start_over_path');
  }
  // lstat rejects a link/reparse point at EVERY component. One full realpath
  // still checks canonical spelling/aliases of the complete existing path;
  // resolving every prefix separately repeats the same traversal quadratically.
  if (fs.realpathSync(file) !== file) fail('start_over_path');
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
  const mac = (purpose, body) => crypto.createHmac('sha256', key(purpose)).update('ae-core4/' + purpose + '-record/v1\0' + canonical(body)).digest('hex');
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
    return { values, owner, actors, scopes: [...full.values()], facts: Object.fromEntries(MARKERS.map(name => [name, { ...info(values[name]), bytes: values[name].bytes?.toString('base64') ?? null }])) };
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
      const archiveDirectory = ['archive-broker', 'archive-receiver'].includes(name), archiveFile = ['archive-owner', 'archive-owner-next', 'archive-diagnostic', 'archive-maintenance', 'archive-session', 'archive-baseline'].includes(name);
      const published = ['intent.json', 'inventory.json', 'continuation-inventory.json', 'stop-requested.json', 'archive-plan.json', 'archive-completed.json', 'session-candidate.json', 'session-publish-intent.json', 'session-published.json', 'reset-completed.json', 'enable-intent.json'].includes(name) || /^archive-0[0-7]-(?:intent|done)\.json$/.test(name);
      const leased = /^(?:lease|claim|prior-gate)-([a-f0-9-]{36})$/.exec(name) || /^attempt-([a-f0-9-]{36})\.json$/.exec(name);
      const staged = name.match(/^(.+)\.stage-([a-f0-9-]{36})$/);
      const validStage = staged && UUID.test(staged[2]) && (/^(?:inventory|continuation-inventory|stop-requested|archive-plan|archive-completed|session-candidate|session-publish-intent|session-published|reset-completed|enable-intent|archive-0[0-7]-(?:intent|done))\.json$/.test(staged[1]) || /^(?:lease-([a-f0-9-]{36})|attempt-([a-f0-9-]{36})\.json)$/.test(staged[1]));
      if (!anchor && !archiveDirectory && !archiveFile && !published && !(leased && UUID.test(leased[1])) && !validStage) fail('start_over_phase');
      // Unpublished stages remain inert evidence, but never opaque symlinks,
      // directories or unbounded files inside an otherwise accepted phase.
      if (archiveDirectory) plain(path.join(dir, name), false, true); else read(path.join(dir, name), anchor ? 64 * 1024 * 1024 : 128 * 1024);
    }
    return { barrier, body, dir };
  }
  function continuation(a) {
    const currentIntent = active(); if (!currentIntent || !equal(info(currentIntent.barrier), info(a.barrier))) fail('start_over_intent_identity');
    const archive = require('./start-over-archive').readArchive(api, a), currentProtected = protectedFacts();
    if (archive) {
      for (const key of Object.keys(a.body.protected)) if (key !== 'state/production/work-session.json' && !equal(currentProtected[key], a.body.protected[key])) fail('start_over_changed');
      const r = archive.p.body.roles.find(r => r.role === 'session'), original = r.original.type === 'absent' ? { hash: null, stat: null } : { hash: r.original.hash, stat: r.original.stat };
      if (!equal(original, a.body.protected['state/production/work-session.json'])) fail('start_over_changed');
    } else if (!equal(currentProtected, a.body.protected)) fail('start_over_changed');
    const now = archive ? require('./start-over-archive').readArchiveHistories(api, a) : histories(), initial = {};
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
    return { ...result, archiveProofHash: archive?.proofHash ?? null };
  }
  function record(a, name, kind, fields) { const v = read(path.join(a.dir, name)); if (!v.bytes) return null; const b = decode(v, kind, ['id', 'intentHash', ...fields]); if (b.id !== a.body.id || b.intentHash !== a.barrier.hash) fail('start_over_record'); if (['start-over-inventory', 'start-over-continuation-inventory'].includes(kind)) validateInventory(b.observation); return b; }
  function stoppedMarkers(a) {
    const original = markerSnapshot(a.body.markers), values = Object.fromEntries(MARKERS.map(name => [name, read(path.join(d.stateDir, name))]));
    const owner = original.owner?.scope, expected = owner && { 'broker/broker-owner.lock': JSON.stringify({ pid: owner.pid, token: owner.brokerToken }), 'broker/broker-owner.gate': owner.brokerToken, 'receiver/owner': canonical({ version: 1, pid: owner.pid, token: owner.receiverToken }) };
    for (const [name, v] of Object.entries(values)) if (v.bytes !== null) {
      const wanted = expected?.[name] ?? (a.body.markers[name].bytes === null ? null : Buffer.from(a.body.markers[name].bytes, 'base64'));
      if (wanted === null || !v.bytes.equals(Buffer.isBuffer(wanted) ? wanted : Buffer.from(wanted))) fail('start_over_foreign_marker');
    }
    const leases = require('./start-over-finisher').inspectStartOverLeases(api, a), gate = leases.gate;
    if (gate.bytes) {
      if (!leases.current) {
        const b = decode(gate, 'startup-gate', ['scope', 'recoveryId', 'readyId', 'takeoverId', 'phase'], 'lifecycle'); scope(b.scope, true);
        const creator = original.scopes.find(s => equal(short(s), a.body.requestor));
        if (b.phase !== 'shutdown' || b.readyId !== null || b.takeoverId !== null || !UUID.test(b.recoveryId) || !creator || !equal(b.scope, creator)) fail('start_over_foreign_marker');
      }
    }
    const maintenance = read(path.join(d.stateDir, 'runtime-maintenance.json'));
    if (maintenance.bytes) {
      const b = decode(maintenance, 'maintenance-stop', ['id', 'scope', 'protected', 'authorizationHash', 'nonce'], 'maintenance'); scope(b.scope);
      if (!equal(b.scope, a.body.requestor) || !UUID.test(b.id) || !UUID.test(b.nonce) || !HEX.test(b.authorizationHash)) fail('start_over_foreign_marker');
    }
    return { markers: Object.fromEntries(MARKERS.map(n => [n, info(values[n])])), installGate: info(gate), maintenance: info(maintenance), finisherActors: leases.actors };
  }
  function phaseFacts(a) { return Object.fromEntries(fs.readdirSync(a.dir).sort().map(name => [name, ['archive-broker', 'archive-receiver'].includes(name) ? require('./start-over-archive').snapshot(api, path.join(a.dir, name)) : info(read(path.join(a.dir, name), name.startsWith('original-') ? 64 * 1024 * 1024 : 128 * 1024))])); }
  function historicalAE() {
    const v = read(path.join(d.stateDir, 'host-adoption.json')); if (v.bytes === null) return [];
    if (!Buffer.from(v.bytes.toString('utf8')).equals(v.bytes)) fail('start_over_host_origin');
    let b; try { b = JSON.parse(v.bytes); } catch { fail('start_over_host_origin'); }
    exact(b, ['version', 'installationId', 'machineId', 'host', 'allowedProject', 'rootObservationDigest', 'observedDigest', 'policy', 'adoptedAt']);
    const h = b.host; exact(h, ['machineId', 'aePid', 'aeProcessBirth', 'executablePath', 'executableHash']);
    if (!Buffer.from(canonical(b)).equals(v.bytes) || b.version !== 1 || b.installationId !== d.installationId || b.machineId !== d.machineId || h.machineId !== d.machineId || b.policy !== 'registered-Core4-lane-and-current-target-native-confirmation' || typeof b.allowedProject !== 'string' || !path.win32.isAbsolute(b.allowedProject) || !HEX.test(b.rootObservationDigest) || !HEX.test(b.observedDigest) || !Number.isFinite(Date.parse(b.adoptedAt)) || new Date(b.adoptedAt).toISOString() !== b.adoptedAt || !Number.isSafeInteger(h.aePid) || h.aePid < 1 || h.aePid > 0xffffffff || typeof h.aeProcessBirth !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{7}Z$/.test(h.aeProcessBirth) || typeof h.executablePath !== 'string' || !path.win32.isAbsolute(h.executablePath) || !HEX.test(h.executableHash)) fail('start_over_host_origin');
    const time = Date.parse(h.aeProcessBirth); if (!Number.isFinite(time) || new Date(time).toISOString() !== h.aeProcessBirth.slice(0, 23) + 'Z') fail('start_over_host_origin');
    const ticks = BigInt(time) * 10000n + 621355968000000000n + BigInt(h.aeProcessBirth.slice(23, 27)); if (ticks < 1n || ticks > 3155378975999999999n) fail('start_over_host_origin');
    return [{ pid: h.aePid, birthTicks: String(ticks) }];
  }
  function effectiveHistories(a) { return require('./start-over-archive').readArchiveHistories(api, a) || histories(); }
  function archivedIntent(id) {
    const dir = directory(id), original = read(path.join(dir, 'intent.json')), body = decode(original, 'start-over-intent', INTENT); scope(body.requestor);
    if (body.id !== id || !UUID.test(body.newSessionId) || !equal(directoryStamp(fs.lstatSync(dir, { bigint: true })), body.directory) || !equal(markerSnapshot(body.markers).actors, body.actors)) fail('start_over_intent_identity');
    return { dir, body, barrier: original };
  }
  const api = { d, descriptorPath, protectedFacts, histories, effectiveHistories, historyOptions, markers, active, archivedIntent, continuation, directory, seal, decode, record, validateInventory, stoppedMarkers, phaseFacts, historicalAE, read, info, plain, atomic }; return api;
}
function inspect(c) {
  const a = c.active(); if (!a) return Object.freeze({ phase: 'running', id: null, resetComplete: false, resetPermit: false, aeAuthority: false });
  const h = c.continuation(a), primary = c.record(a, 'inventory.json', 'start-over-inventory', ['observation']), recovered = c.record(a, 'continuation-inventory.json', 'start-over-continuation-inventory', ['observation', 'nativeStop']), stop = c.record(a, 'stop-requested.json', 'start-over-stop-requested', []);
  if (primary && recovered) fail('start_over_phase'); const inventory = primary || recovered;
  return Object.freeze({ id: a.body.id, intentHash: a.barrier.hash, newSessionId: a.body.newSessionId, phase: stop ? 'stop-requested' : inventory ? 'intent-with-inventory' : 'intent-without-inventory', requiresAEExit: h.requiresAEExit, inventoryRecorded: !!inventory, actors: Object.freeze(a.body.actors.map(s => Object.freeze({ ...s }))), resetComplete: false, resetPermit: false, aeAuthority: false });
}
function inspectStartOver(options) { return inspect(context(options)); }
function publishReset(c, id, requestor, protectedFacts, markers, histories, initial) {
  if (!initial.archiveEligibleHistory) fail('start_over_resource_fenced');
  if (!markers.actors.some(a => equal(a, requestor))) fail('start_over_scope');
  if (markers.owner?.receiverIdentity != null && markers.owner.receiverIdentity !== initial.receiver.identity) fail('start_over_marker_history');
  const dir = path.join(c.d.installRoot, 'transactions', id + '-start-over');
  plain(path.dirname(dir), false, true); fs.mkdirSync(dir); plain(dir, false, true);
  const prefix = Object.fromEntries(['receiver', 'ledger'].map(k => [k, { ...info(histories[k]), byteLength: histories[k].bytes?.length ?? 0 }]));
  const original = atomic(path.join(dir, 'intent.json'), c.seal('start-over-intent', { id, newSessionId: crypto.randomUUID(), directory: directoryStamp(fs.lstatSync(dir, { bigint: true })), requestor, actors: markers.actors, protected: protectedFacts, markers: markers.facts, prefix, createdAt: new Date().toISOString() }));
  if (!equal(c.protectedFacts(), protectedFacts) || !equal(c.markers().facts, markers.facts)) fail('start_over_changed');
  // Keep each original journal inode anchored before admitting a reset.
  for (const k of ['receiver', 'ledger']) if (histories[k].bytes !== null) {
    fs.linkSync(histories[k].file, path.join(dir, 'original-' + k));
    const anchor = read(path.join(dir, 'original-' + k), 64 * 1024 * 1024);
    if (!anchor.bytes?.equals(histories[k].bytes) || !same(anchor.stat, histories[k].stat, ['ctimeNs'])) fail('start_over_prefix_changed');
  }
  fs.linkSync(original.file, path.join(c.d.stateDir, 'runtime-start-over.json'));
  return c.active();
}
async function stoppedStartOver({ installation, descriptorPath, operationId, confirmedPlanHash }) {
  if (!UUID.test(operationId) || confirmedPlanHash !== undefined && !HEX.test(confirmedPlanHash)) fail('start_over_stopped_options');
  const c = context({ installation, descriptorPath });
  const physical = require('node:net').createServer(socket => socket.destroy());
  const ipc = require('node:net').createServer(socket => socket.destroy());
  const listen = (server, address) => new Promise((resolve, reject) => {
    server.once('error', reject); server.listen(address, resolve);
  });
  const close = server => server.listening && new Promise(resolve => server.close(resolve));
  try {
    await listen(physical, { host: '127.0.0.1', port: 3457 });
    await listen(ipc, require('./client-entry').ownerEndpoint(installation));
    function snapshot() {
      if (c.active() || read(path.join(c.d.installRoot, 'install.lock')).bytes || read(path.join(c.d.stateDir, 'runtime-maintenance.json')).bytes) fail('start_over_install_busy');
      const protectedFacts = c.protectedFacts(), markers = c.markers(), histories = c.histories();
      const initial = inspectStartOverHistory(c.historyOptions(histories));
      if (!markers.owner || !initial.requiresAEExit || !initial.archiveEligibleHistory) fail('start_over_stopped_scope');
      const requestor = short(markers.owner.scope);
      const ae = [...new Map([...initial.requiredAE, ...c.historicalAE()].map(a => [a.pid + ':' + a.birthTicks, a])).values()];
      const plan = { operationId, installationId: installation.installationId, packageHash: installation.packageHash,
        requestor, actors: markers.actors, ae, protectedDigest: hash(protectedFacts), markersDigest: hash(markers.facts),
        receiver: { bytes: histories.receiver.bytes?.length ?? 0, sha256: initial.receiver.byteHash },
        ledger: { bytes: histories.ledger.bytes?.length ?? 0, sha256: initial.ledger.byteHash } };
      return { plan, requestor, protectedFacts, markers, histories, initial };
    }
    const before = snapshot();
    const native = await observeStartOverStop({ actors: before.plan.actors.map(({pid,birthTicks}) => ({pid,birthTicks})), ae: before.plan.ae });
    if (native.inventory.machineId !== installation.machineId || native.inventory.processes.length || !native.allObservedIncarnationsGone) fail('start_over_stopped_producers_alive');
    const now = snapshot(), planHash = hash(now.plan);
    if (!equal(now.plan, before.plan) || Math.abs(Date.now() - Date.parse(native.inventory.observedAt)) > 5000) fail('start_over_stopped_changed');
    if (confirmedPlanHash === undefined) return { plan: now.plan, planHash, dispatched: false, aeAuthority: false };
    if (confirmedPlanHash !== planHash) fail('start_over_operator_confirmation_changed');
    const a = publishReset(c, crypto.randomUUID(), now.requestor, now.protectedFacts, now.markers, now.histories, now.initial);
    c.validateInventory(native.inventory);
    atomic(path.join(a.dir, 'inventory.json'), c.seal('start-over-inventory', { id: a.body.id, intentHash: a.barrier.hash, observation: native.inventory }));
    return { operationId, planHash, reset: inspect(c), dispatched: true, aeAuthority: false };
  } finally { await close(ipc); await close(physical); }
}
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
      id = crypto.randomUUID();
      const a = publishReset(c, id, requestor, protectedFacts, markers, histories, initial);
      const dir = a.dir; c.continuation(a);
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
function startOverBarrierContext(capability) {
  const p = require('./start-over-barrier').startOverBarrierRequest(capability);
  return context({ installation: p.installation, descriptorPath: p.descriptorPath });
}
function startOverFinisherContext(capability) {
  const p = require('./start-over-finisher').startOverFinisherRequest(capability); return context({ installation: p.installation, descriptorPath: p.descriptorPath });
}
module.exports = { createOwnerStartOver, inspectStartOver, stoppedStartOver, startOverBarrierContext, startOverFinisherContext };
