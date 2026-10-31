'use strict';
// Private reducer, not a CLI/admin API. All entry and lease paths require the
// enclosing operation capability; durable records never become normal brands.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { canonical, hash, fail } = require('../protocol/json');
const { probeWindows, hostIdentity } = require('../runtime/windows-reservation-provider');
const { observeOwnerProcess, classifyOwnerProcess } = require('../runtime/windows-owner-process');
const { open, exact, equal, same, stamp } = require('./stopped-host-readoption-store');
const permits = new WeakMap(), HEX = /^[a-f0-9]{64}$/, ATTEMPTS = 8;
const POLICY = 'registered-Core4-lane-and-current-target-native-confirmation';
const TYPES = {
  'readopt-intent.json': ['intent', ['base', 'actor', 'witness', 'observation', 'old', 'barrier', 'replacement', 'anchors']],
  'readopt-lease.json': ['lease', ['prior', 'actor', 'gates']],
  'readopt-cas-ready.json': ['cas-ready', ['prior', 'actor', 'gates', 'oldArchive', 'replacement', 'stage']],
  'readopt-completed.json': ['completed', ['prior', 'actor', 'gates', 'oldArchive', 'replacement', 'adoption']],
  'readopt-enable-intent.json': ['enable-intent', ['prior', 'actor', 'anchors', 'completionHash']],
  'readopt-enable-ready.json': ['enable-ready', ['prior', 'actor', 'gates', 'barrier']],
  'readopt-enabled.json': ['enabled', ['prior', 'actor', 'stopArchive']]
};
const NULL = () => ({ hash: null, stat: null });
function flags(value) { return { ...value, runtimeStarted: false, mutationGrant: false, lifecycleEpoch: false, aeAuthority: false }; }
function bytes(encoded) { if (typeof encoded !== 'string' || encoded.length > 65536 || Buffer.from(encoded, 'base64').toString('base64') !== encoded) fail('readopt_encoded_bytes'); return Buffer.from(encoded, 'base64'); }
function objectBytes(value) { let result; try { result = JSON.parse(value); } catch { fail('readopt_json'); } if (!Buffer.from(value.toString('utf8')).equals(value)) fail('readopt_json'); return result; }
function host(value) {
  exact(value, ['machineId', 'aePid', 'aeProcessBirth', 'executablePath', 'executableHash']);
  if (typeof value.machineId !== 'string' || !value.machineId || !Number.isSafeInteger(value.aePid) || value.aePid < 1 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{7}Z$/.test(value.aeProcessBirth) || !path.isAbsolute(value.executablePath) || !HEX.test(value.executableHash)) fail('readopt_host');
}
function witness(value, installation) {
  const b = Buffer.isBuffer(value) ? Buffer.from(value) : fail('readopt_witness_bytes'), data = objectBytes(b);
  if (b.length > 16384) fail('readopt_witness_budget'); exact(data, ['installationId', 'machineId', 'host', 'allowedProject', 'rootObservationDigest']); host(data.host);
  if (data.installationId !== installation.installationId || data.machineId !== installation.machineId || data.host.machineId !== installation.machineId || !path.isAbsolute(data.allowedProject) || path.resolve(data.allowedProject) !== data.allowedProject || !HEX.test(data.rootObservationDigest)) fail('readopt_witness_binding');
  return { bytes: b, data };
}
function validateReadoptionObservation(actual, expected, machineId) {
  const identity = hostIdentity(actual), time = Date.parse(actual?.observedAt);
  if (!Number.isFinite(time) || Date.now() - time > 5000 || time - Date.now() > 1000 || !Number.isFinite(actual.completedAt) || Date.now() - actual.completedAt > 5000) fail('host_observation_stale');
  if (!Array.isArray(actual.endpoints) || actual.endpoints.length !== 2 || canonical(actual.endpoints.map(e => e.port).sort()) !== canonical([3456, 8787]) || actual.endpoints.some(e => e.state !== 'observed-absent')) fail('known_managed_writer_or_unknown_probe');
  if (!equal(identity, expected) || identity.machineId !== machineId) fail('adoption_observation_changed'); return identity;
}
function adoption(value, d) {
  const data = objectBytes(value); exact(data, ['version', 'installationId', 'machineId', 'host', 'allowedProject', 'rootObservationDigest', 'observedDigest', 'policy', 'adoptedAt']); host(data.host);
  if (data.version !== 1 || data.installationId !== d.installationId || data.machineId !== d.machineId || data.host.machineId !== d.machineId || data.policy !== POLICY || !path.isAbsolute(data.allowedProject) || !HEX.test(data.rootObservationDigest) || !HEX.test(data.observedDigest) || !Number.isFinite(Date.parse(data.adoptedAt))) fail('readopt_adoption'); return data;
}
function fact(value) {
  exact(value, ['hash', 'stat']); if (!HEX.test(value.hash)) fail('readopt_fact');
  exact(value.stat, ['dev', 'ino', 'mode', 'nlink', 'size', 'birthtimeNs', 'mtimeNs', 'ctimeNs']);
  if (Object.values(value.stat).some(v => typeof v !== 'string' || !/^-?[0-9]+$/.test(v)) || BigInt(value.stat.nlink) < 1n || BigInt(value.stat.size) < 0n) fail('readopt_fact');
}
function anchors(value) {
  if (!Array.isArray(value) || value.length !== 2) fail('readopt_gate_anchors');
  for (const a of value) { exact(a, ['bytes', 'fact']); fact(a.fact); const b = bytes(a.bytes); if (b.length > 16384 || hash(b) !== a.fact.hash) fail('readopt_gate_anchors'); }
}
function validateIntent(s, intent) {
  exact(intent, TYPES['readopt-intent.json'][1]); s.c.scope(intent.actor);
  const w = witness(bytes(intent.witness), s.o.installation), replacementBytes = bytes(intent.replacement.bytes), oldBytes = bytes(intent.old.bytes);
  exact(intent.old, ['bytes', 'fact']); exact(intent.replacement, ['bytes', 'fact']); fact(intent.old.fact); fact(intent.replacement.fact); fact(intent.barrier); anchors(intent.anchors);
  const oldData = adoption(oldBytes, s.o.installation), newData = adoption(replacementBytes, s.o.installation);
  if (!equal(newData.host, w.data.host) || newData.allowedProject !== w.data.allowedProject || newData.rootObservationDigest !== w.data.rootObservationDigest || newData.observedDigest !== hash(intent.observation) || !equal(hostIdentity(intent.observation), newData.host) || intent.old.fact.hash !== hash(oldBytes) || intent.replacement.fact.hash !== hash(replacementBytes)) fail('readopt_intent_binding');
  void oldData; return { w, replacementBytes, oldBytes };
}
function validatePreparedReadoptionIntent(capability, candidate) {
  const s = open(capability), body = s.decode(candidate, 'intent', TYPES['readopt-intent.json'][1]), intent = body.payload;
  validateIntent(s, intent);
  if (!same(s.read(s.paths.adoption), intent.old.fact) || !same(s.read(s.paths.barrier), intent.barrier) || s.read(s.paths.stage).bytes) fail('readopt_baseline_changed');
  s.verifyPreparationFiles(body.preparation, { 'replacement.json': intent.replacement.fact, 'install-gate': intent.anchors[0].fact, 'broker-gate': intent.anchors[1].fact });
  s.base(intent.base, {}, s.paths.gates.map(p => s.read(p)), false);
}
function preflight(s, capability) {
  const base = require('./stopped-host-readoption').readStoppedReadoptionBaseline(capability), old = s.read(s.paths.adoption), barrier = s.read(s.paths.barrier), stage = s.read(s.paths.stage);
  if (!old.bytes) return null;
  // The replay decoder's exact encoded budget applies BEFORE any preparation
  // write, including otherwise valid JSON with large whitespace/field content.
  const encoded = old.bytes.toString('base64'); adoption(bytes(encoded), s.o.installation);
  if (stage.bytes) fail('readopt_foreign_stage');
  const snapshot = { base, old: { bytes: encoded, fact: s.info(old) }, barrier: s.info(barrier), stage: s.info(stage) };
  return { base, old, barrier, snapshot, proofHash: hash(snapshot) };
}
async function checkedPreflight(s, capability) {
  const first = preflight(s, capability); if (!first) return null;
  const stable = () => { const now = preflight(s, capability); if (!now || now.proofHash !== first.proofHash) fail('readopt_baseline_changed'); };
  for (const actor of first.base.actors) { stable(); const actual = await observeOwnerProcess(actor.pid); stable(); if (!['absent', 'pid-reused'].includes(classifyOwnerProcess({ pid: actor.pid, birthTicks: actor.birthTicks }, actual))) fail('readopt_actor_not_dead'); }
  stable(); return first;
}
function pinned(actual, expected, ignored, nlink) { if (!same(actual, expected, ignored) || nlink !== undefined && actual.stat.nlink !== String(nlink)) fail('readopt_inode_changed'); }
function readState(s, capability) {
  const records = {}, names = s.phaseNames(), intentView = s.read(path.join(s.paths.phase, 'readopt-intent.json'));
  if (!intentView.bytes) return null;
  for (const name of names.filter(n => n.startsWith('readopt-') && !['readopt-old.json', 'readopt-stop.json'].includes(n))) {
    const attempt = /^readopt-attempt-0[1-8]\.json$/.test(name), type = attempt ? ['attempt', ['prior', 'actor', 'phase', 'gates']] : TYPES[name];
    if (!type) fail('readopt_unknown_phase_file'); records[name] = s.record(name, ...type);
  }
  const intentRecord = records['readopt-intent.json']; if (!intentRecord) fail('readopt_intent_missing'); const intent = intentRecord.body.payload;
  const { oldBytes } = validateIntent(s, intent);
  const ordered = Object.entries(records).sort((a, b) => (a[1].body.payload.prior ? Object.keys(a[1].body.payload.prior).length : -1) - (b[1].body.payload.prior ? Object.keys(b[1].body.payload.prior).length : -1));
  const prior = {}, actors = [intent.actor]; let attempts = 0, enableSeen = false, active = intent.actor;
  for (const [name, record] of ordered) {
    if (name !== 'readopt-intent.json') {
      const p = record.body.payload; if (!equal(p.prior, prior)) fail('readopt_record_lineage'); s.c.scope(p.actor);
      if (name.startsWith('readopt-attempt-')) { attempts++; if (name !== 'readopt-attempt-' + String(attempts).padStart(2, '0') + '.json' || p.phase !== (enableSeen ? 'enable' : 'apply')) fail('readopt_attempt_lineage'); active = p.actor; }
      else if (name === 'readopt-enable-intent.json') { if (!prior['readopt-completed.json']) fail('readopt_phase'); active = p.actor; enableSeen = true; }
      else if (!equal(p.actor, active)) fail('readopt_actor_lineage');
      actors.push(p.actor);
    } else if (Object.keys(prior).length) fail('readopt_record_lineage');
    prior[name] = record.facts;
  }
  if (attempts > ATTEMPTS) fail('readopt_attempt_budget');
  const get = name => records[name]?.body.payload, lease = get('readopt-lease.json'), ready = get('readopt-cas-ready.json'), completed = get('readopt-completed.json'), enable = get('readopt-enable-intent.json'), enableReady = get('readopt-enable-ready.json'), enabled = get('readopt-enabled.json');
  if (enable) anchors(enable.anchors);
  if (ready && !lease || completed && !ready || enableReady && !enable || enabled && !enableReady) fail('readopt_phase');
  const prep = s.prepPath(intentRecord.body.preparation), anchor = s.read(path.join(prep, 'replacement.json')), current = s.read(s.paths.adoption), stage = s.read(s.paths.stage), oldArchive = s.read(path.join(s.paths.phase, 'readopt-old.json'));
  const applied = !!current.bytes && same(current, anchor), oldCurrent = !!current.bytes && current.hash === intent.old.fact.hash && current.stat.dev === intent.old.fact.stat.dev && current.stat.ino === intent.old.fact.stat.ino;
  if (!current.bytes || !applied && !oldCurrent || applied && (!ready || stage.bytes || !oldArchive.bytes)) fail('readopt_adoption_changed');
  if (oldArchive.bytes) { pinned(oldArchive, intent.old.fact, ['ctimeNs', 'nlink'], BigInt(intent.old.fact.stat.nlink) + (oldCurrent ? 1n : 0n)); if (oldArchive.hash !== hash(oldBytes)) fail('readopt_old_archive'); }
  if (oldCurrent) pinned(current, intent.old.fact, oldArchive.bytes ? ['ctimeNs', 'nlink'] : [], BigInt(intent.old.fact.stat.nlink) + (oldArchive.bytes ? 1n : 0n));
  if (stage.bytes) { if (!oldArchive.bytes || applied) fail('readopt_phase'); pinned(stage, anchor, []); }
  pinned(anchor, intent.replacement.fact, applied ? ['birthtimeNs', 'ctimeNs', 'nlink'] : ['ctimeNs', 'nlink'], BigInt(intent.replacement.fact.stat.nlink) + (stage.bytes || applied ? 1n : 0n));
  if (applied && ![intent.replacement.fact.stat.birthtimeNs, intent.old.fact.stat.birthtimeNs].includes(anchor.stat.birthtimeNs)) fail('readopt_rename_birth');
  if (ready && !applied) { if (!stage.bytes || !oldArchive.bytes) fail('readopt_cas_prefix'); pinned(anchor, ready.replacement, []); pinned(stage, ready.stage, []); pinned(oldArchive, ready.oldArchive, []); }
  if (completed) { if (!applied) fail('readopt_completion'); pinned(current, completed.adoption, []); pinned(anchor, completed.replacement, []); pinned(oldArchive, completed.oldArchive, []); }
  const gates = s.paths.gates.map(p => s.read(p)), rolePhase = enable ? 'enable' : 'apply', roleRecord = enable ? records['readopt-enable-intent.json'] : intentRecord, roleData = enable || intent;
  const release = enable ? !!enabled : !!completed;
  if (!gates[0].bytes && gates[1].bytes) fail('readopt_gate_prefix');
  const roleAnchors = ['install-gate', 'broker-gate'].map((n, i) => {
    const actual = s.read(path.join(s.prepPath(roleRecord.body.preparation), n)), expected = roleData.anchors[i];
    if (!actual.bytes?.equals(bytes(expected.bytes))) fail('readopt_gate_bytes'); pinned(actual, expected.fact, ['ctimeNs', 'nlink'], BigInt(expected.fact.stat.nlink) + (gates[i].bytes ? 1n : 0n));
    if (gates[i].bytes) pinned(gates[i], actual, []); return actual;
  });
  if (enable) {
    if (enable.completionHash !== records['readopt-completed.json'].view.hash) fail('readopt_enable_binding');
    for (const [i, n] of ['install-gate', 'broker-gate'].entries()) pinned(s.read(path.join(prep, n)), intent.anchors[i].fact, ['ctimeNs'], BigInt(intent.anchors[i].fact.stat.nlink));
  }
  const gateReceipt = enable ? enabled ? enableReady : enableReady : completed || lease;
  if (gateReceipt) for (let i = 0; i < 2; i++) {
    if (!gates[i].bytes) { if (!release) fail('readopt_gate_missing'); }
    else pinned(gates[i], gateReceipt.gates[i], []);
  }
  for (const [, r] of ordered.filter(([n]) => n.startsWith('readopt-attempt-'))) if (r.body.payload.phase === rolePhase) for (let i = 0; i < 2; i++) {
    const previous = r.body.payload.gates[i]; if (previous.hash !== null && gates[i].bytes) pinned(gates[i], previous, []); else if (previous.hash !== null && !release) fail('readopt_gate_missing');
  }
  const barrier = s.read(s.paths.barrier), stopArchive = s.read(path.join(s.paths.phase, 'readopt-stop.json'));
  if (stopArchive.bytes) {
    if (!enableReady) fail('readopt_stop_prefix'); pinned(stopArchive, intent.barrier, ['ctimeNs', 'nlink'], BigInt(intent.barrier.stat.nlink) + (barrier.bytes ? 1n : 0n));
    if (barrier.bytes) pinned(barrier, stopArchive, []);
  } else if (!barrier.bytes) fail('readopt_stop_missing');
  if (barrier.bytes && !stopArchive.bytes) pinned(barrier, intent.barrier, []);
  if (enabled) { if (barrier.bytes || !stopArchive.bytes) fail('readopt_enabled_prefix'); pinned(stopArchive, enabled.stopArchive, []); }
  const extension = {};
  for (const name of names.filter(n => n.startsWith('readopt-'))) extension[name] = s.basic(s.read(path.join(s.paths.phase, name)));
  const base = s.base(intent.base, extension, gates, !barrier.bytes);
  const facts = { records: prior, adoption: s.info(current), stage: s.info(stage), oldArchive: s.info(oldArchive), anchor: s.info(anchor), gates: gates.map(s.info), roleAnchors: roleAnchors.map(s.info), barrier: s.info(barrier), stopArchive: s.info(stopArchive), base: base.facts };
  const phase = enabled ? gates.some(v => v.bytes) ? 'enable-release-pending' : 'enabled' : !barrier.bytes ? 'enable-receipt-pending' : enable ? 'enable-pending' : completed ? gates.some(v => v.bytes) ? 'apply-release-pending' : 'readopt-completed-stopped' : applied ? 'cas-applied-receipt-pending' : 'readopt-pending';
  const incarnations = [...new Map([...base.actors, ...actors].map(a => [canonical(a), a])).values()];
  return { records, intent, intentRecord, prior, actors: incarnations, active, attempts, lease, ready, completed, enable, enableReady, enabled, anchor, current, stage, oldArchive, gates, roleAnchors, rolePhase, barrier, stopArchive, applied, facts, proofHash: hash(facts), phase };
}
function unchanged(s, cap, first) { const now = readState(s, cap); if (!now || now.proofHash !== first.proofHash) fail('readopt_proof_changed'); return now; }
async function checked(s, cap, self = null) {
  const first = readState(s, cap); if (!first) return null;
  for (const actor of first.actors) {
    if (self && equal(actor, self)) continue; unchanged(s, cap, first); const actual = await observeOwnerProcess(actor.pid); unchanged(s, cap, first);
    if (!['absent', 'pid-reused'].includes(classifyOwnerProcess({ pid: actor.pid, birthTicks: actor.birthTicks }, actual))) fail('readopt_actor_not_dead');
  }
  return unchanged(s, cap, first);
}
async function newActor(s, cap, first) {
  unchanged(s, cap, first); const actual = await observeOwnerProcess(process.pid); unchanged(s, cap, first);
  if (classifyOwnerProcess({ pid: process.pid, birthTicks: actual.birthTicks }, actual) !== 'alive' || path.resolve(actual.executablePath).toLowerCase() !== path.resolve(s.o.installation.nodePath).toLowerCase()) fail('readopt_actor_unknown');
  return { bootId: crypto.randomUUID(), pid: process.pid, birthTicks: actual.birthTicks };
}
function result(state) { return flags({ id: state.intent.base.id, phase: state.phase, proofHash: state.proofHash }); }
function publish(s, cap, name, kind, payload, preparation) { const state = readState(s, cap); s.publish(name, kind, { prior: state.prior, ...payload }, preparation); return readState(s, cap); }
function gateAnchors(s, preparation, actor, phase) {
  return ['install', 'broker'].map(role => { const value = s.materialize(preparation, role + '-gate', s.c.seal('maintenance-readopt-gate', { id: s.o.id, actor, phase, role, nonce: crypto.randomUUID() })); return { bytes: value.bytes.toString('base64'), fact: s.info(value) }; });
}
function acquire(s, cap, state, actor) {
  // No normal gate publisher/stage: exact pinned anchors were linked after the
  // canonical claim. The unchanged sealed-lease consumer only opens them.
  if (!state || !state.records['readopt-intent.json'] || !equal(state.active, actor)) fail('readopt_lease_admission');
  const current = readState(s, cap); if (current.proofHash !== state.proofHash) fail('readopt_proof_changed');
  const data = current.enable || current.intent, releaseOnly = current.enable ? !!current.enabled : !!current.completed;
  const receipt = current.enable ? current.enableReady : current.completed;
  permits.set(cap, { scope: { installRoot: s.o.installation.installRoot, stateDir: s.o.installation.stateDir, descriptorPath: s.o.descriptorPath }, nonce: actor.bootId, gates: data.anchors.map(a => bytes(a.bytes)), recovery: true, releaseOnly, facts: current.gates.map((v, i) => ({ file: v.file, hash: hash(bytes(data.anchors[i].bytes)), stat: v.stat ? s.basic(v).stat : receipt?.gates[i]?.stat || null })) });
  try { return require('./stopped-update').acquireStoppedReadoptionLease(cap); } finally { permits.delete(cap); }
}
function stoppedReadoptionLeasePermit(capability) { const permit = permits.get(capability); if (!permit) fail('stopped_readoption_lease_brand'); require('./stopped-host-readoption').stoppedReadoptionOperation(capability); return permit; }
function linkGates(s, cap, actor) {
  let state = readState(s, cap); const data = state.enable || state.intent;
  if (state.enable ? state.enabled : state.completed) return state;
  for (let i = 0; i < 2; i++) if (!state.gates[i].bytes) {
    const source = path.join(s.prepPath((state.enable ? state.records['readopt-enable-intent.json'] : state.intentRecord).body.preparation), ['install-gate', 'broker-gate'][i]);
    fs.linkSync(source, s.paths.gates[i]); state = readState(s, cap);
  }
  void data; void actor; return state;
}
async function fresh(s, cap, state, expected) {
  unchanged(s, cap, state); const observation = await probeWindows(); unchanged(s, cap, state);
  validateReadoptionObservation(observation, expected, s.o.installation.machineId); return observation;
}
function release(s, lease) { require('../runtime/install-lease').releaseInstallLease(lease); }
async function applyTail(s, cap, actor) {
  let lease, state = await checked(s, cap, actor);
  try {
    if (!state.completed) state = linkGates(s, cap, actor);
    lease = acquire(s, cap, state, actor);
    if (!state.lease) state = publish(s, cap, 'readopt-lease.json', 'lease', { actor, gates: state.gates.map(s.info) });
    if (!state.applied) {
      if (!state.oldArchive.bytes) { fs.linkSync(s.paths.adoption, path.join(s.paths.phase, 'readopt-old.json')); state = readState(s, cap); }
      if (!state.stage.bytes) { fs.linkSync(state.anchor.file, s.paths.stage); state = readState(s, cap); }
      if (!state.ready) state = publish(s, cap, 'readopt-cas-ready.json', 'cas-ready', { actor, gates: state.gates.map(s.info), oldArchive: s.info(state.oldArchive), replacement: s.info(state.anchor), stage: s.info(state.stage) });
      const observation = await fresh(s, cap, state, adoption(bytes(state.intent.replacement.bytes), s.o.installation).host);
      state = unchanged(s, cap, state); const fd = fs.openSync(state.anchor.file, 'r');
      try {
        if (!equal(stamp(fs.fstatSync(fd, { bigint: true })), state.anchor.stat)) fail('readopt_anchor_changed');
        validateReadoptionObservation(observation, adoption(bytes(state.intent.replacement.bytes), s.o.installation).host, s.o.installation.machineId);
        // All old-target read FDs were scoped/closed by read(); never unlink it.
        fs.renameSync(s.paths.stage, s.paths.adoption);
        const after = readState(s, cap); if (!after.applied || String(fs.fstatSync(fd, { bigint: true }).ino) !== after.anchor.stat.ino) fail('readopt_cas_unknown');
      } finally { fs.closeSync(fd); }
      state = readState(s, cap);
    }
    if (!state.completed) state = publish(s, cap, 'readopt-completed.json', 'completed', { actor, gates: state.gates.map(s.info), oldArchive: s.info(state.oldArchive), replacement: s.info(state.anchor), adoption: s.info(state.current) });
    release(s, lease); lease = null; return result(readState(s, cap));
  } catch (error) { if (lease) require('../runtime/install-lease').retainInstallLease(lease); throw error; }
}
async function enableTail(s, cap, actor) {
  let lease, state = await checked(s, cap, actor);
  try {
    if (!state.enabled) state = linkGates(s, cap, actor);
    lease = acquire(s, cap, state, actor);
    if (!state.enableReady) state = publish(s, cap, 'readopt-enable-ready.json', 'enable-ready', { actor, gates: state.gates.map(s.info), barrier: s.info(state.barrier) });
    if (state.barrier.bytes) {
      if (!state.stopArchive.bytes) { fs.linkSync(s.paths.barrier, path.join(s.paths.phase, 'readopt-stop.json')); state = readState(s, cap); }
      if (!state.barrier.bytes || !same(state.barrier, state.stopArchive)) fail('readopt_stop_changed');
      fs.unlinkSync(s.paths.barrier); state = readState(s, cap);
    }
    if (!state.enabled) state = publish(s, cap, 'readopt-enabled.json', 'enabled', { actor, stopArchive: s.info(state.stopArchive) });
    release(s, lease); lease = null; return result(readState(s, cap));
  } catch (error) { if (lease) require('../runtime/install-lease').retainInstallLease(lease); throw error; }
}
async function initialApply(s, cap, options) {
  if (!HEX.test(options.expectedProofHash)) fail('readopt_expected_proof');
  const first = preflight(s, cap); if (!first) fail('readopt_existing_adoption_required');
  const { base, old, barrier } = first, w = witness(options.witness, s.o.installation);
  const stable = () => { const now = preflight(s, cap); if (!now || now.proofHash !== first.proofHash) fail('readopt_baseline_changed'); };
  if (first.proofHash !== options.expectedProofHash) fail('readopt_proof_changed');
  for (const actor of base.actors) { stable(); const actual = await observeOwnerProcess(actor.pid); stable(); if (!['absent', 'pid-reused'].includes(classifyOwnerProcess({ pid: actor.pid, birthTicks: actor.birthTicks }, actual))) fail('readopt_actor_not_dead'); }
  stable(); const self = await observeOwnerProcess(process.pid); stable();
  if (classifyOwnerProcess({ pid: process.pid, birthTicks: self.birthTicks }, self) !== 'alive' || path.resolve(self.executablePath).toLowerCase() !== path.resolve(s.o.installation.nodePath).toLowerCase()) fail('readopt_actor_unknown');
  const actor = { bootId: crypto.randomUUID(), pid: process.pid, birthTicks: self.birthTicks };
  stable(); const observation = await probeWindows(); stable(); validateReadoptionObservation(observation, w.data.host, s.o.installation.machineId);
  const preparation = s.prepare(), value = { version: 1, installationId: s.o.installation.installationId, machineId: s.o.installation.machineId, host: w.data.host, allowedProject: w.data.allowedProject, rootObservationDigest: w.data.rootObservationDigest, observedDigest: hash(observation), policy: POLICY, adoptedAt: new Date().toISOString() };
  const replacement = s.materialize(preparation, 'replacement.json', Buffer.from(canonical(value))), anchors = gateAnchors(s, preparation, actor, 'apply');
  stable(); const finalObservation = await probeWindows(); stable(); validateReadoptionObservation(finalObservation, w.data.host, s.o.installation.machineId);
  s.publish('readopt-intent.json', 'intent', { base: base.facts, actor, witness: w.bytes.toString('base64'), observation, old: { bytes: old.bytes.toString('base64'), fact: s.info(old) }, barrier: s.info(barrier), replacement: { bytes: replacement.bytes.toString('base64'), fact: s.info(replacement) }, anchors }, preparation);
  return applyTail(s, cap, actor);
}
async function execute(action, capability, options) {
  const s = open(capability), first = await checked(s, capability);
  if (['inspect', 'evidence'].includes(action)) {
    if (first) { if (action === 'evidence') fail('readopt_baseline_only'); return flags({ ...result(first), inspectionOnly: true }); }
    const current = await checkedPreflight(s, capability); if (!current) return null;
    if (action === 'evidence') return { options: Object.fromEntries(['installation', 'descriptorPath', 'id', 'reservedServer'].map(k => [k, s.o[k]])), facts: current.base.facts, actors: current.base.actors, preflight: current.snapshot, proofHash: current.proofHash };
    return flags({ id: s.o.id, phase: 'readopt-preflight', proofHash: current.proofHash, inspectionOnly: true });
  }
  if (action === 'apply') { if (first) fail('readopt_original_inspection_required'); return initialApply(s, capability, options); }
  if (!first || !HEX.test(options.expectedProofHash) || first.proofHash !== options.expectedProofHash) fail('readopt_proof_changed');
  if (action === 'finish' && first.enable || action === 'enable' && (!first.completed || first.gates.some(v => v.bytes) || first.enable) || action === 'enable-finish' && !first.enable) fail('readopt_action_phase');
  if (action === 'finish' && first.completed && !first.gates.some(v => v.bytes) || action === 'enable-finish' && first.enabled && !first.gates.some(v => v.bytes)) return result(first);
  if (action === 'finish' && !first.applied) await fresh(s, capability, first, adoption(bytes(first.intent.replacement.bytes), s.o.installation).host);
  const actor = await newActor(s, capability, first);
  if (action === 'enable') {
    const preparation = s.prepare(), anchors = gateAnchors(s, preparation, actor, 'enable'); unchanged(s, capability, first);
    publish(s, capability, 'readopt-enable-intent.json', 'enable-intent', { actor, anchors, completionHash: first.records['readopt-completed.json'].view.hash }, preparation);
  } else {
    if (first.attempts >= ATTEMPTS) fail('readopt_attempt_budget');
    publish(s, capability, 'readopt-attempt-' + String(first.attempts + 1).padStart(2, '0') + '.json', 'attempt', { actor, phase: action === 'finish' ? 'apply' : 'enable', gates: first.gates.map(s.info) });
  }
  return action === 'finish' ? applyTail(s, capability, actor) : enableTail(s, capability, actor);
}
module.exports = { execute, stoppedReadoptionLeasePermit, validateReadoptionObservation, validatePreparedReadoptionIntent };
