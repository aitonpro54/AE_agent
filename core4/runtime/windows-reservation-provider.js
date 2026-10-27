'use strict';
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { execFile } = require('node:child_process');
const { hash, canonical, fail, id } = require('../protocol/json');
const { brandReservationHandle, validateReservationHandle } = require('../core/authority');
const { scopesOverlap } = require('../core/resources');
function durable(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); const fd = fs.openSync(file, 'wx'); try { const text = canonical(value); if (fs.writeSync(fd, text) !== Buffer.byteLength(text)) fail('adoption_short_write'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
function endpoint(port) { return new Promise(resolve => { const socket = net.connect({ host: '127.0.0.1', port }); let done = false; const finish = state => { if (done) return; done = true; socket.destroy(); resolve({ port, state }); }; socket.once('connect', () => finish('active')); socket.once('error', e => finish(e.code === 'ECONNREFUSED' ? 'observed-absent' : 'unknown')); socket.setTimeout(500, () => finish('unknown')); }); }
async function probeWindows(installation) {
  if (process.platform !== 'win32') fail('windows_host_probe_unavailable');
  const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const script = path.join(installation.releaseDir, 'runtime/windows-host-probe.ps1');
  const host = await new Promise((resolve, reject) => {
    const env = Object.fromEntries(['SystemRoot', 'WINDIR', 'TEMP', 'TMP'].filter(k => process.env[k]).map(k => [k, process.env[k]]));
    execFile(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', script], { windowsHide: true, timeout: 4000, maxBuffer: 64 * 1024, env }, (error, stdout) => {
      if (error) { reject(Object.assign(new Error('host_probe_failed'), { code: 'host_probe_failed' })); return; }
      try { resolve(JSON.parse(stdout.replace(/^\uFEFF/, '').trim())); }
      catch { reject(Object.assign(new Error('host_probe_invalid'), { code: 'host_probe_invalid' })); }
    });
  });
  return { ...host, endpoints: await Promise.all([3456, 8787].map(endpoint)), completedAt: Date.now() };
}
function hostIdentity(observation) {
  if (!observation || observation.version !== 1 || typeof observation.hostname !== 'string' || !Array.isArray(observation.processes) || observation.processes.length !== 1) fail('ambiguous_ae_process');
  const p = observation.processes[0]; if (!Number.isSafeInteger(p.pid) || p.pid < 1 || typeof p.birth !== 'string' || typeof p.executablePath !== 'string' || !/^[a-f0-9]{64}$/.test(p.executableHash)) fail('host_identity_unavailable');
  return { machineId: observation.hostname, aePid: p.pid, aeProcessBirth: p.birth, executablePath: p.executablePath, executableHash: p.executableHash };
}
function freshObservation(observation, maxAge = 5000) {
  const time = Date.parse(observation?.observedAt);
  if (!Number.isFinite(time) || Date.now() - time > maxAge || time - Date.now() > 1000 || !Number.isFinite(observation.completedAt) || Date.now() - observation.completedAt > maxAge) fail('host_observation_stale');
  if (!Array.isArray(observation.endpoints) || observation.endpoints.length !== 2 || canonical(observation.endpoints.map(e => e.port).sort()) !== canonical([3456, 8787]) || observation.endpoints.some(e => e.state !== 'observed-absent')) fail('known_managed_writer_or_unknown_probe');
}
function createWindowsReservationProvider({ installation, getBroker, getPeer, probe = probeWindows }) {
  const file = path.join(installation.stateDir, 'host-adoption.json'), reservations = new Map(); let cache;
  function adoption() { if (!fs.existsSync(file)) return null; const a = JSON.parse(fs.readFileSync(file, 'utf8')); if (a.version !== 1 || a.installationId !== installation.installationId || a.machineId !== installation.machineId || a.policy !== 'registered-Core4-lane-and-current-target-native-confirmation' || typeof a.allowedProject !== 'string') fail('host_adoption_mismatch'); return a; }
  function scope(target) { const a = adoption(); return { schemaVersion: 2, origin: a ? { machineId: a.host.machineId, aePid: a.host.aePid, aeProcessBirth: a.host.aeProcessBirth } : null, target }; }
  function lane() {
    const b = getBroker(), p = getPeer().status(); if (!b || b.closed || b.stateLock.error || b.ledger.corrupt) fail('core4_lane_unavailable');
    if (b.ledger.unresolved().length || p.storeClosed || p.pending) fail('core4_lane_unresolved'); if (!p.peer.connected) fail('panel_unavailable'); return { broker: b, peerId: p.peer.peerId, receiverStoreIdentity: p.receiverStoreIdentity };
  }
  function assert(handle, { afterSend = false } = {}) {
    validateReservationHandle(handle); const item = reservations.get(handle.ref); if (!item || item.handle !== handle || item.terminal) fail('reservation_unavailable');
    const b = getBroker(), p = getPeer().status(); if (b.closed || b.stateLock.error || b.ledger.corrupt || !p.peer.connected || p.peer.peerId !== handle.peerId || p.receiverStoreIdentity !== handle.receiverStoreIdentity || hash(adoption()) !== handle.adoptionDigest) fail('reservation_identity_lost');
    if (!afterSend) { try { freshObservation(cache, 2000); } catch { fail('reservation_observation_expired'); } if (Date.now() > handle.expiresAt) fail('reservation_observation_expired'); }
    return handle;
  }
  return {
    adoption, scope,
    status() { const a = adoption(); return { adopted: !!a, origin: a?.host || null, coverage: { core4Lane: 'cooperating-Core4-only', hostProcess: a ? 'adopted-reprobe-required' : 'unavailable', legacyEndpoints: 'named-probes-only', legacyPhysicalQueue: 'not-proven', otherAEActors: 'outside-coverage', sharedOutputs: 'not-requested' } }; },
    async prepare(ctx) {
      const a = adoption(); if (!a) fail('resource_reservation_provider_unavailable');
      const before = lane(); cache = await probe(installation); const host = hostIdentity(cache);
      freshObservation(cache);
      if (canonical(host) !== canonical(a.host) || host.machineId !== installation.machineId || ctx.target.projectId !== a.allowedProject) fail('host_or_managed_writer_changed');
      const after = lane(); if (before.peerId !== after.peerId || before.receiverStoreIdentity !== after.receiverStoreIdentity) fail('peer_replaced');
      const executionScope = scope(ctx.target); if (canonical(executionScope) !== canonical(ctx.descriptor.executionScope)) fail('execution_scope_changed');
      for (const record of after.broker.resources.records()) if (scopesOverlap({ ...record.resource, ...(record.origin ? { origin: record.origin } : {}) }, { ...ctx.target, origin: executionScope.origin }) && (record.unresolvedOutcome || record.reservationOwner && record.reservationOwner !== installation.installationId)) fail('shared_resource_fenced');
      const handle = brandReservationHandle({ ref: id('reservation'), executionScope, peerId: after.peerId, receiverStoreIdentity: after.receiverStoreIdentity, adoptionDigest: hash(a), checkpointRef: ctx.checkpoint.ref, checkpointDigest: ctx.checkpoint.digest, proposalId: ctx.proposal.proposalId, commandId: ctx.commandId, expiresAt: Date.now() + 2000 });
      reservations.set(handle.ref, { handle, terminal: false });
      after.broker.ledger.append({ type: 'reservation', state: 'reserved', reservation: handle, taskId: ctx.plan.taskId, taskEpoch: ctx.plan.taskEpoch, effect: ctx.step.selected.contract.effectPolicy.effect, observationDigest: hash(cache), coverage: this.status().coverage });
      after.broker.ledger.append({ type: 'constraint', record: { constraintId: 'manual-scope-' + hash({ origin: executionScope.origin, target: ctx.target }), schemaVersion: 2, resource: ctx.target, origin: executionScope.origin, owner: installation.installationId, checkpointRef: ctx.checkpoint.ref, allowedEffects: [ctx.step.selected.contract.effectPolicy.effect], reservationOwner: installation.installationId, unresolvedOutcome: false, revision: ctx.before.revision, provenance: 'registered-Core4-lane-and-current-target-native-confirmation' } });
      return handle;
    },
    assert,
    finish(handle, outcome) { assert(handle, { afterSend: true }); const item = reservations.get(handle.ref); getBroker().ledger.append({ type: 'reservation', state: outcome, reservationRef: handle.ref }); item.terminal = true; },
    finishOriginal(ref, outcome) { const item = reservations.get(ref); if (item && !item.terminal) { getBroker().ledger.append({ type: 'reservation', state: outcome, reservationRef: ref, resolution: 'authenticated-original-completion' }); item.terminal = true; } },
    async adopt({ expected, allowedProject, rootObservationDigest }) {
      if (!path.isAbsolute(allowedProject) || !/^[a-f0-9]{64}$/.test(rootObservationDigest)) fail('adoption_witness_required');
      const actual = await probe(installation), host = hostIdentity(actual);
      freshObservation(actual);
      if (canonical(host) !== canonical(expected) || host.machineId !== installation.machineId) fail('adoption_observation_changed');
      const value = { version: 1, installationId: installation.installationId, machineId: installation.machineId, host, allowedProject, rootObservationDigest, observedDigest: hash(actual), policy: 'registered-Core4-lane-and-current-target-native-confirmation', adoptedAt: new Date().toISOString() };
      durable(file, value); return { adopted: true, installationId: installation.installationId, host, allowedProject, adoptionDigest: hash(value), mutationGrant: false, lifecycleEpoch: false };
    }
  };
}
module.exports = { createWindowsReservationProvider, probeWindows, hostIdentity };
