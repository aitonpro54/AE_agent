'use strict';
// Private native/process + canonical endpoint barrier. No store archival,
// outcome rewrite, runtime launch, AE termination or mutation grant lives here.
const http = require('node:http'), net = require('node:net'), path = require('node:path');
const { canonical, hash, fail } = require('../protocol/json');
const { observeStartOverStop } = require('./start-over-process');
const requests = new WeakMap(), barriers = new WeakMap(), HEX = /^[a-f0-9]{64}$/;
const equal = (a, b) => canonical(a) === canonical(b);
function exact(v, keys) { if (!v || Object.getPrototypeOf(v) !== Object.prototype || !equal(Object.keys(v).sort(), [...keys].sort())) fail('start_over_barrier_options'); }
function startOverBarrierRequest(capability) { const p = requests.get(capability); if (!p) fail('start_over_barrier_brand'); return p; }
function refusal(code, details) { throw Object.assign(new Error(code), { code, ...details }); }
const unique = scopes => [...new Map(scopes.map(s => [s.pid + ':' + s.birthTicks, { pid: s.pid, birthTicks: s.birthTicks }])).values()];
async function listen(server, target) {
  await new Promise((resolve, reject) => { const error = () => reject(Object.assign(Error('start_over_endpoint_busy'), { code: 'start_over_endpoint_busy' })); server.once('error', error); server.listen(target, () => { server.removeListener('error', error); resolve(); }); });
}
async function close(server) { if (!server?.listening) return; await new Promise(resolve => { server.close(resolve); server.closeAllConnections?.(); }); }
function state(c, a) {
  const now = c.active(); if (!now || !equal(c.info(now.barrier), c.info(a.barrier))) fail('start_over_intent_identity');
  const continuation = c.continuation(a), histories = c.effectiveHistories(a), markers = c.stoppedMarkers(a);
  return { continuation, facts: { intent: c.info(now.barrier), protected: c.protectedFacts(), phase: c.phaseFacts(a), histories: Object.fromEntries(Object.entries(histories).map(([n, v]) => [n, c.info(v)])), ...markers } };
}
async function acquireStartOverBarrier(options) {
  exact(options, ['installation', 'descriptorPath', 'id', 'expectedIntentHash']);
  if (!HEX.test(options.expectedIntentHash)) fail('start_over_expected_intent');
  const capability = Object.freeze({}); requests.set(capability, Object.freeze({ ...options, installation: Object.freeze(structuredClone(options.installation)) }));
  let physical, ipc;
  try {
    const c = require('./start-over-state').startOverBarrierContext(capability), a = c.active();
    if (!a || a.body.id !== options.id || a.barrier.hash !== options.expectedIntentHash) fail('start_over_intent_changed');
    // Same canonical endpoints as normal owner election. No execution service
    // or protocol handler is available while these listeners are held.
    physical = http.createServer((_req, res) => { res.writeHead(503, { Connection: 'close' }); res.end(); });
    await listen(physical, { host: '127.0.0.1', port: 3457 });
    const endpoint = require('./client-entry').ownerEndpoint(c.d); ipc = net.createServer(socket => socket.destroy()); await listen(ipc, endpoint);
    const before = state(c, a), actors = unique([...a.body.actors, ...before.facts.finisherActors]);
    c.record(a, 'stop-requested.json', 'start-over-stop-requested', []);
    let inventory = c.record(a, 'inventory.json', 'start-over-inventory', ['observation']);
    const recovered = c.record(a, 'continuation-inventory.json', 'start-over-continuation-inventory', ['observation', 'nativeStop']);
    if (inventory && recovered) fail('start_over_phase'); inventory ||= recovered;
    if (inventory) c.validateInventory(inventory.observation);
    let ae = before.continuation.requiresAEExit ? unique([...(inventory?.observation.processes || []), ...before.continuation.requiredAE, ...c.historicalAE()]) : [];
    let native = await observeStartOverStop({ actors, ae }), after = state(c, a);
    const nodesGone = value => {
      if (value.inventory.machineId !== c.d.machineId) fail('start_over_process_machine');
      if (value.actors.some(s => s.state === 'alive')) refusal('start_over_producer_still_alive', { actors: value.actors.filter(s => s.state === 'alive').map(s => ({ pid: s.pid, birthTicks: s.birthTicks })) });
    };
    nodesGone(native);
    if (!equal(before.facts.finisherActors, after.facts.finisherActors)) fail('start_over_barrier_changed');
    // The final history is read AFTER native producer death. If a last accepted
    // callback strengthened its risk during the await, probe the full new AE
    // set; never reuse a cheap idle observation for a newly unknown command.
    const finalAE = after.continuation.requiresAEExit ? unique([...(inventory?.observation.processes || []), ...after.continuation.requiredAE, ...c.historicalAE()]) : [];
    if (!equal(finalAE, ae)) {
      ae = finalAE; native = await observeStartOverStop({ actors, ae }); nodesGone(native);
      const again = state(c, a); if (!equal(again.facts, after.facts)) fail('start_over_barrier_changed'); after = again;
    }
    if (!inventory && after.continuation.requiresAEExit) {
      // Crash before inventory must not create a forever-restart loop. Only
      // after producer death, capture all current AE ONCE for this same intent.
      c.validateInventory(native.inventory);
      c.atomic(path.join(a.dir, 'continuation-inventory.json'), c.seal('start-over-continuation-inventory', { id: a.body.id, intentHash: a.barrier.hash, observation: native.inventory, nativeStop: native }));
      if (native.inventory.processes.length) refusal('start_over_requires_ae_exit', { ae: unique(native.inventory.processes) });
    }
    if (native.ae.some(s => s.state === 'alive')) refusal('start_over_requires_ae_exit', { ae: native.ae.filter(s => s.state === 'alive').map(s => ({ pid: s.pid, birthTicks: s.birthTicks })) });
    const stable = state(c, a), value = { c, a, physical, ipc, endpoint, facts: stable.facts, native, released: false };
    barriers.set(capability, value); assertStartOverBarrier(capability); return capability;
  } catch (e) {
    await close(ipc); await close(physical); barriers.delete(capability); requests.delete(capability); throw e;
  }
}
function assertStartOverEndpoints(capability) {
  const value = barriers.get(capability); if (!value || value.released) fail('start_over_barrier_brand');
  const address = value.physical.listening && value.physical.address();
  if (!address || address.address !== '127.0.0.1' || address.port !== 3457 || !value.ipc.listening || value.ipc.address() !== value.endpoint) fail('start_over_endpoint_lost');
  const current = value.c.active(); if (!current || !equal(value.c.info(current.barrier), value.c.info(value.a.barrier))) fail('start_over_intent_identity'); return value;
}
function assertStartOverBarrier(capability) {
  const value = assertStartOverEndpoints(capability); if (!equal(state(value.c, value.a).facts, value.facts)) fail('start_over_barrier_changed'); return value;
}
function startOverBarrierFacts(capability) { const v = assertStartOverBarrier(capability); return Object.freeze({ id: v.a.body.id, intentHash: v.a.barrier.hash, proofHash: hash(v.facts), processCoverage: 'native-process-snapshot', endpointsReserved: true, resetComplete: false, aeAuthority: false }); }
async function releaseStartOverBarrier(capability) {
  const v = barriers.get(capability); if (!v || v.released) fail('start_over_barrier_brand'); v.released = true;
  try { await close(v.ipc); await close(v.physical); } finally { barriers.delete(capability); requests.delete(capability); }
}
module.exports = { acquireStartOverBarrier, assertStartOverBarrier, assertStartOverEndpoints, startOverBarrierFacts, releaseStartOverBarrier, startOverBarrierRequest };
