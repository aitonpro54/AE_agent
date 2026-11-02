'use strict';
// Private, fixed-role B3 archival. The caller capability must own the reset
// installation lease and live endpoints. No arbitrary root, IO or action input.
const fs = require('node:fs'), path = require('node:path');
const { canonical, hash, fail } = require('../protocol/json');
const ROLES = Object.freeze([
  ['broker', 'broker', 'directory'], ['receiver', 'receiver', 'directory'],
  ['owner', 'runtime-owner.json', 'file'], ['owner-next', 'runtime-owner.next', 'file'],
  ['diagnostic', 'runtime-diagnostic.json', 'file'], ['maintenance', 'runtime-maintenance.json', 'file'],
  ['session', 'work-session.json', 'file'], ['baseline', 'work-session-baseline.json', 'file']
].map(([role, source, type]) => Object.freeze({ role, source, type })));
const FIELDS = ['dev', 'ino', 'size', 'birthtimeNs', 'mtimeNs', 'ctimeNs'];
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const equal = (a, b) => canonical(a) === canonical(b);
const stat = s => Object.fromEntries(FIELDS.map(k => [k, String(s[k])]));
function exact(v, fields) { if (!v || Object.getPrototypeOf(v) !== Object.prototype || !equal(Object.keys(v).sort(), [...fields].sort())) fail('start_over_archive_schema'); }
function snapshot(c, file, budget = { files: 0, bytes: 0 }, depth = 0) {
  if (depth > 16) fail('start_over_archive_budget');
  let s; try { s = fs.lstatSync(file, { bigint: true }); } catch (e) { if (e.code === 'ENOENT') { c.plain(path.dirname(file), false, true); return { type: 'absent' }; } throw e; }
  if (++budget.files > 2048) fail('start_over_archive_budget');
  c.plain(file, false, s.isDirectory());
  if (s.isFile()) {
    const v = c.read(file, 64 * 1024 * 1024); budget.bytes += v.bytes.length; if (budget.bytes > 256 * 1024 * 1024) fail('start_over_archive_budget');
    if (!equal(stat(s), v.stat)) fail('start_over_archive_changed'); return { type: 'file', hash: v.hash, stat: v.stat };
  }
  const names = fs.readdirSync(file).sort(), children = {};
  for (const name of names) { if (!name || name === '.' || name === '..' || /[\\/\x00-\x1f]/.test(name)) fail('start_over_archive_path'); children[name] = snapshot(c, path.join(file, name), budget, depth + 1); }
  if (!equal(names, fs.readdirSync(file).sort()) || !equal(stat(s), stat(fs.lstatSync(file, { bigint: true })))) fail('start_over_archive_changed');
  return { type: 'directory', stat: stat(s), children };
}
function sameTree(expected, actual, moved = false) {
  if (expected.type !== actual.type) return false;
  if (expected.type === 'absent') return true;
  const fields = moved ? ['dev', 'ino', 'size', 'mtimeNs'] : FIELDS;
  if (fields.some(k => expected.stat[k] !== actual.stat[k])) return false;
  if (expected.type === 'file') return expected.hash === actual.hash;
  return equal(Object.keys(expected.children).sort(), Object.keys(actual.children).sort()) && Object.keys(expected.children).every(k => sameTree(expected.children[k], actual.children[k]));
}
function paths(c, a, role) {
  const r = ROLES.find(v => v.role === role); if (!r) fail('start_over_archive_role');
  return { sourcePath: path.join(c.d.stateDir, r.source), archivePath: path.join(a.dir, 'archive-' + role) };
}
function plan(c, a) {
  const v = c.read(path.join(a.dir, 'archive-plan.json')); if (!v.bytes) return null;
  const b = c.decode(v, 'start-over-archive-plan', ['id', 'intentHash', 'roles', 'history', 'protected', 'operator']);
  if (b.id !== a.body.id || b.intentHash !== a.barrier.hash || !Array.isArray(b.roles) || b.roles.length !== ROLES.length) fail('start_over_archive_plan');
  for (const [i, r] of b.roles.entries()) { exact(r, ['role', 'source', 'type', 'original']); if (r.role !== ROLES[i].role || r.source !== ROLES[i].source || r.type !== ROLES[i].type || r.original.type !== 'absent' && r.original.type !== r.type) fail('start_over_archive_plan'); }
  return { view: v, body: b };
}
function step(c, a, p, index, suffix) {
  const name = 'archive-' + String(index).padStart(2, '0') + '-' + suffix + '.json', v = c.read(path.join(a.dir, name)); if (!v.bytes) return null;
  const b = c.decode(v, 'start-over-archive-' + suffix, ['id', 'intentHash', 'planHash', 'index', 'role', 'originalDigest', ...(suffix === 'done' ? ['archivedDigest'] : [])]);
  if (b.id !== a.body.id || b.intentHash !== a.barrier.hash || b.planHash !== p.view.hash || b.index !== index || b.role !== p.body.roles[index].role || b.originalDigest !== hash(p.body.roles[index].original)) fail('start_over_archive_step'); return { view: v, body: b };
}
function archiveManifest(c, a, p) {
  const v = c.read(path.join(a.dir, 'archive-completed.json')); if (!v.bytes) return null;
  const b = c.decode(v, 'start-over-archive-completed', ['id', 'intentHash', 'planHash', 'history', 'rolesDigest']);
  if (b.id !== a.body.id || b.intentHash !== a.barrier.hash || b.planHash !== p.view.hash || !equal(b.history, p.body.history)) fail('start_over_archive_manifest'); return { view: v, body: b };
}
function sessionAliases(c, a, candidate, actual) {
  const inode = fs.lstatSync(candidate.file, { bigint: true }); let count = 1n; // canonical session alias
  for (const name of fs.readdirSync(a.dir)) {
    const file = path.join(a.dir, name), s = fs.lstatSync(file, { bigint: true });
    if (!s.isFile() || s.dev !== inode.dev || s.ino !== inode.ino) continue;
    const stage = name.match(/^session-candidate\.json\.stage-([a-f0-9-]{36})$/);
    if (name !== 'session-candidate.json' && (!stage || !UUID.test(stage[1]))) fail('start_over_session_alias');
    c.plain(file); if (!equal(c.info(c.read(file)), c.info(candidate))) fail('start_over_session_alias'); count++;
  }
  // A completed exclusive publication can retain its own atomic stage after a
  // crash. It is an inert alias of this exact candidate, never another grant.
  if (inode.nlink !== count || fs.lstatSync(actual.file, { bigint: true }).nlink !== count) fail('start_over_session_alias');
}
function sessionPublication(c, a, p) {
  const candidate = c.read(path.join(a.dir, 'session-candidate.json')), intent = c.record(a, 'session-publish-intent.json', 'start-over-session-publish-intent', ['archiveManifestHash', 'candidate']), receipt = c.record(a, 'session-published.json', 'start-over-session-published', ['publishIntentHash', 'session']);
  if (candidate.bytes) {
    const b = c.decode(candidate, 'work-session', ['resetId', 'sessionId', 'intentHash', 'baselineRequired']);
    if (b.resetId !== a.body.id || b.sessionId !== a.body.newSessionId || b.intentHash !== a.barrier.hash || b.baselineRequired !== true) fail('start_over_session_candidate');
  }
  if (!intent) { if (receipt) fail('start_over_session_phase'); return { candidate, intent: null, receipt: null, replacement: null }; }
  const manifest = archiveManifest(c, a, p);
  if (!manifest || intent.archiveManifestHash !== manifest.view.hash || !candidate.bytes || !p.body.roles.every((_r, i) => step(c, a, p, i, 'done'))) fail('start_over_session_phase');
  const actual = c.read(path.join(c.d.stateDir, 'work-session.json'));
  if (candidate.hash !== intent.candidate.hash || ['dev', 'ino', 'size', 'birthtimeNs', 'mtimeNs'].some(k => candidate.stat[k] !== intent.candidate.stat?.[k])) fail('start_over_session_candidate');
  if (actual.bytes === null) { if (receipt) fail('start_over_session_phase'); return { candidate, intent, receipt: null, replacement: null }; }
  if (!actual.bytes.equals(candidate.bytes) || !equal(c.info(actual), c.info(candidate))) fail('start_over_session_alias'); sessionAliases(c, a, candidate, actual);
  const intentView = c.read(path.join(a.dir, 'session-publish-intent.json'));
  if (receipt && (receipt.publishIntentHash !== intentView.hash || !equal(receipt.session, c.info(actual)))) fail('start_over_session_phase');
  return { candidate, intent, receipt, replacement: c.info(actual) };
}
function roleState(c, a, p, index, publication) {
  const r = p.body.roles[index], location = paths(c, a, r.role), observedSource = snapshot(c, location.sourcePath), source = r.role === 'session' && publication.replacement ? { type: 'absent' } : observedSource, archive = snapshot(c, location.archivePath), intent = step(c, a, p, index, 'intent'), done = step(c, a, p, index, 'done');
  if (r.original.type === 'absent') {
    if (source.type !== 'absent' || archive.type !== 'absent' || intent) fail('start_over_archive_changed');
    if (done && done.body.archivedDigest !== hash({ type: 'absent' })) fail('start_over_archive_changed'); return { ...location, phase: 'absent', source, archive, intent, done };
  }
  if (source.type !== 'absent' && archive.type === 'absent') {
    if (!sameTree(r.original, source) || done) fail('start_over_archive_changed'); return { ...location, phase: 'pending', source, archive, intent, done };
  }
  if (source.type === 'absent' && archive.type !== 'absent') {
    if (!intent || !sameTree(r.original, archive, true) || done && done.body.archivedDigest !== hash(archive)) fail('start_over_archive_changed'); return { ...location, phase: 'archived', source, archive, intent, done };
  }
  fail('start_over_archive_collision');
}
function readArchive(c, a) {
  const p = plan(c, a); if (!p) return null;
  const publication = sessionPublication(c, a, p), roles = p.body.roles.map((_r, i) => roleState(c, a, p, i, publication)), manifest = archiveManifest(c, a, p);
  if (manifest && manifest.body.rolesDigest !== hash(roles.map(r => r.archive))) fail('start_over_archive_manifest');
  const facts = roles.map(r => ({ phase: r.phase, source: r.source, archive: r.archive, intentHash: r.intent?.view.hash ?? null, doneHash: r.done?.view.hash ?? null }));
  return { p, roles, publication, manifest, proofHash: hash({ plan: p.view.hash, roles: facts, replacement: publication.replacement }) };
}
function readArchiveHistories(c, a) {
  const v = readArchive(c, a); if (!v) return null;
  const file = (role, name) => { const i = ROLES.findIndex(r => r.role === role), r = v.roles[i]; return path.join(r.phase === 'archived' ? r.archivePath : r.sourcePath, name); };
  return { receiver: c.read(file('receiver', 'completions.ndjson'), 64 * 1024 * 1024), ledger: c.read(file('broker', 'ledger.ndjson'), 64 * 1024 * 1024) };
}
function readHistoricalArchive(c, a) {
  const p = plan(c, a); if (!p) fail('start_over_archive_incomplete');
  const archives = p.body.roles.map((r, i) => {
    const value = snapshot(c, paths(c, a, r.role).archivePath), intent = step(c, a, p, i, 'intent'), done = step(c, a, p, i, 'done');
    if (!done || done.body.archivedDigest !== hash(value)) fail('start_over_archive_changed');
    if (r.original.type === 'absent' ? value.type !== 'absent' : !intent || !sameTree(r.original, value, true)) fail('start_over_archive_changed');
    return value;
  });
  const manifest = archiveManifest(c, a, p); if (!manifest || manifest.body.rolesDigest !== hash(archives)) fail('start_over_archive_manifest');
  const candidate = c.read(path.join(a.dir, 'session-candidate.json')), body = c.decode(candidate, 'work-session', ['resetId', 'sessionId', 'intentHash', 'baselineRequired']);
  if (body.resetId !== a.body.id || body.sessionId !== a.body.newSessionId || body.intentHash !== a.barrier.hash || body.baselineRequired !== true) fail('start_over_session_candidate');
  const publishIntent = c.record(a, 'session-publish-intent.json', 'start-over-session-publish-intent', ['archiveManifestHash', 'candidate']), receipt = c.record(a, 'session-published.json', 'start-over-session-published', ['publishIntentHash', 'session']);
  const publishView = c.read(path.join(a.dir, 'session-publish-intent.json'));
  if (!publishIntent || !receipt || publishIntent.archiveManifestHash !== manifest.view.hash || receipt.publishIntentHash !== publishView.hash || receipt.session.hash !== candidate.hash || candidate.hash !== publishIntent.candidate.hash || ['dev', 'ino', 'size', 'mtimeNs'].some(k => candidate.stat[k] !== publishIntent.candidate.stat[k])) fail('start_over_session_phase');
  const completed = c.record(a, 'reset-completed.json', 'start-over-completed', ['archiveManifestHash', 'sessionHash', 'baselineRequired']), enable = c.record(a, 'enable-intent.json', 'start-over-enable-intent', ['completedHash']), completedView = c.read(path.join(a.dir, 'reset-completed.json'));
  if (!completed || !enable || completed.archiveManifestHash !== manifest.view.hash || completed.sessionHash !== candidate.hash || completed.baselineRequired !== true || enable.completedHash !== completedView.hash) fail('start_over_finish_completion');
  return { p, archives, manifest, candidate, completed, enable };
}
function executeArchive(capability) {
  const o = require('./start-over-finisher').startOverArchiveRequest(capability), { c, a } = o;
  o.assert(); let p = plan(c, a);
  if (!p) {
    const h = c.continuation(a), budget = { files: 0, bytes: 0 }, roles = ROLES.map(r => ({ ...r, original: snapshot(c, paths(c, a, r.role).sourcePath, budget) }));
    const history = { receiverHash: h.current.receiver.byteHash, ledgerHash: h.current.ledger.byteHash, receiverUnresolved: h.current.receiver.unresolved.length, ledgerUnresolved: h.current.ledger.unresolved.length };
    o.publish('archive-plan.json', c.seal('start-over-archive-plan', { id: a.body.id, intentHash: a.barrier.hash, roles, history, protected: c.protectedFacts(), operator: o.operator })); p = plan(c, a);
  }
  for (const [index, r] of p.body.roles.entries()) {
    o.assert(); const all = readArchive(c, a), current = all.roles[index];
    const base = { id: a.body.id, intentHash: a.barrier.hash, planHash: p.view.hash, index, role: r.role, originalDigest: hash(r.original) };
    if (current.phase === 'pending') {
      if (!current.intent) o.publish('archive-' + String(index).padStart(2, '0') + '-intent.json', c.seal('start-over-archive-intent', base));
      o.assert(); const checked = readArchive(c, a).roles[index]; if (checked.phase !== 'pending') fail('start_over_archive_changed');
      fs.renameSync(checked.sourcePath, checked.archivePath); o.renamed(index);
    }
    const after = readArchive(c, a).roles[index];
    if (!after.done) o.publish('archive-' + String(index).padStart(2, '0') + '-done.json', c.seal('start-over-archive-done', { ...base, archivedDigest: hash(after.archive) }));
  }
  o.assert(); const final = readArchive(c, a); if (final.roles.some(r => !r.done)) fail('start_over_archive_incomplete'); return final;
}
module.exports = { ROLES, snapshot, sameTree, readArchive, readArchiveHistories, readHistoricalArchive, executeArchive, sessionPublication, archiveManifest };
