'use strict';
// Private helper filesystem primitives. Entry requires a live module capability;
// callers cannot inject an IO/probe implementation or select arbitrary roots.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { canonical, hash, fail } = require('../protocol/json');
const FIELDS = ['dev', 'ino', 'mode', 'nlink', 'size', 'birthtimeNs', 'mtimeNs', 'ctimeNs'];
const BASIC = ['dev', 'ino', 'size', 'birthtimeNs', 'mtimeNs', 'ctimeNs'];
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const equal = (a, b) => canonical(a) === canonical(b);
const stamp = s => Object.fromEntries(FIELDS.map(k => [k, String(s[k])]));
const directoryStamp = s => ({ dev: String(s.dev), ino: String(s.ino), birthtimeNs: String(s.birthtimeNs) });
function exact(value, fields) { if (!value || Object.getPrototypeOf(value) !== Object.prototype || !equal(Object.keys(value).sort(), [...fields].sort())) fail('readopt_schema'); }
function same(a, b, ignored = []) { return !!a && !!b && a.hash === b.hash && (a.stat === null ? b.stat === null : !!b.stat && FIELDS.filter(k => !ignored.includes(k)).every(k => a.stat[k] === b.stat[k])); }
function open(capability) {
  const operation = require('./stopped-host-readoption').stoppedReadoptionOperation(capability), { request: o, context: c } = operation;
  const live = () => { if (require('./stopped-host-readoption').stoppedReadoptionOperation(capability) !== operation) fail('readopt_operation_brand'); };
  const phase = path.join(o.installation.installRoot, 'transactions', o.id + '-owner-maintenance'), transactions = path.dirname(phase);
  const paths = { phase, transactions, adoption: path.join(o.installation.stateDir, 'host-adoption.json'), barrier: path.join(o.installation.stateDir, 'runtime-maintenance.json'), gates: [path.join(o.installation.installRoot, 'install.lock'), path.join(o.installation.stateDir, 'broker/broker-owner.gate')], stage: path.join(o.installation.stateDir, 'host-adoption.readopt-' + o.id + '.json') };
  function read(file, limit = 128 * 1024) {
    live(); if (!c.plain(file, true)) return { file, bytes: null, hash: null, stat: null };
    const before = fs.lstatSync(file, { bigint: true }), value = c.read(file, limit), after = fs.lstatSync(file, { bigint: true });
    if (!value.bytes || !BASIC.every(k => String(before[k]) === value.stat[k]) || FIELDS.filter(k => k !== 'ctimeNs').some(k => String(before[k]) !== String(after[k]))) fail('readopt_file_changed');
    // c.read closed OUR read FD. Windows may flush only ctime at that close;
    // all identity/data/link facts above remain exact, then pin the new stamp.
    return { file, bytes: value.bytes, hash: hash(value.bytes), stat: stamp(after) };
  }
  const info = v => ({ hash: v.hash, stat: v.stat });
  const basic = v => ({ hash: v.hash, stat: v.stat && Object.fromEntries(BASIC.map(k => [k, v.stat[k]])) });
  function canonicalIdentity(file) {
    live(); if (![...paths.gates, paths.barrier].includes(file)) fail('readopt_canonical_path');
    // Only the fixed parent chain is traversed. The direct current object is
    // opaque: a later owner's gate/barrier may be a foreign file or symlink.
    c.plain(path.dirname(file), false, true); let value;
    try { value = fs.lstatSync(file, { bigint: true }); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    c.plain(path.dirname(file), false, true);
    return value ? { dev: String(value.dev), ino: String(value.ino), regular: value.isFile() && !value.isSymbolicLink() && !value.reparsePoint } : null;
  }
  function prepPath(value) {
    exact(value, ['id', 'directory']); if (!UUID.test(value.id)) fail('readopt_preparation');
    const target = path.join(transactions, 'readopt-preparation-' + value.id); c.plain(target, false, true);
    if (!equal(directoryStamp(fs.lstatSync(target, { bigint: true })), value.directory)) fail('readopt_preparation_changed'); return target;
  }
  function prepare() {
    live(); const id = crypto.randomUUID(), target = path.join(transactions, 'readopt-preparation-' + id); fs.mkdirSync(target); c.plain(target, false, true);
    const value = { id, directory: directoryStamp(fs.lstatSync(target, { bigint: true })) };
    if (value.directory.dev !== String(fs.lstatSync(phase, { bigint: true }).dev)) fail('readopt_cross_filesystem'); return value;
  }
  function materialize(preparation, name, bytes) { live(); c.atomic(path.join(prepPath(preparation), name), bytes, crypto.randomUUID()); return read(path.join(prepPath(preparation), name)); }
  function seal(kind, payload, preparation) { return c.seal('maintenance-readopt-' + kind, { id: o.id, preparation, payload }); }
  function decode(view, kind, fields) {
    const body = c.decode(view, 'maintenance-readopt-' + kind, ['id', 'preparation', 'payload']);
    if (body.id !== o.id) fail('readopt_record_binding'); exact(body.payload, fields); prepPath(body.preparation); return body;
  }
  function publish(name, kind, payload, preparation = prepare()) {
    live(); if (!/^readopt-(?:[a-z-]+|attempt-[0-9]{2})\.json$/.test(name)) fail('readopt_record_name');
    const candidate = materialize(preparation, 'candidate.json', seal(kind, payload, preparation));
    materialize(preparation, 'publication.json', seal('publication', { kind, record: info(candidate) }, preparation));
    if (kind === 'intent') require('./stopped-host-readoption-transaction').validatePreparedReadoptionIntent(capability, candidate);
    // The FIRST authoritative intent appears only at this single exclusive link.
    // Partial external candidates are inert and are never searched for recovery.
    fs.linkSync(candidate.file, path.join(phase, name)); return read(path.join(phase, name));
  }
  function record(name, kind, fields) {
    const view = read(path.join(phase, name)); if (!view.bytes) return null;
    const body = decode(view, kind, fields), directory = prepPath(body.preparation), candidate = read(path.join(directory, 'candidate.json')), publication = read(path.join(directory, 'publication.json'));
    const proof = decode(publication, 'publication', ['kind', 'record']);
    if (proof.payload.kind !== kind || !equal(proof.preparation, body.preparation) || !same(view, candidate) || !same(view, proof.payload.record, ['nlink', 'ctimeNs']) || view.stat.nlink !== String(BigInt(proof.payload.record.stat.nlink) + 1n) || publication.stat.nlink !== '1') fail('readopt_record_identity');
    const allowed = ['candidate.json', 'publication.json', ...(kind === 'intent' ? ['replacement.json', 'install-gate', 'broker-gate'] : kind === 'enable-intent' ? ['install-gate', 'broker-gate'] : [])];
    if (!equal(fs.readdirSync(directory).sort(), allowed.sort())) fail('readopt_preparation_inventory');
    return { body, view, facts: { phase: info(view), candidate: info(candidate), publication: info(publication) } };
  }
  function phaseNames() { live(); const names = fs.readdirSync(phase).sort(); if (names.length > 48) fail('readopt_inventory_budget'); return names; }
  function base(baseFacts, extension, gates, archivedStop = false) {
    const owned = new Map(gates.filter(v => v.bytes).map(v => [v.file, basic(v)]));
    return require('./stopped-host-readoption').readStoppedReadoptionBase(capability, { expectedFacts: baseFacts, extension, owned, archivedStop });
  }
  function verifyPreparationFiles(preparation, expected) {
    const directory = prepPath(preparation);
    for (const [name, fact] of Object.entries(expected)) if (!same(read(path.join(directory, name)), fact)) fail('readopt_preparation_changed');
  }
  return Object.freeze({ o, c, paths, live, read, info, basic, canonicalIdentity, prepare, prepPath, materialize, publish, record, phaseNames, base, verifyPreparationFiles, seal, decode });
}
module.exports = { open, exact, equal, same, stamp, directoryStamp, FIELDS, UUID };
