'use strict';
const { randomUUID } = require('node:crypto');

// Private owner-side primitive, not a grant/IPC API. Not in source-package.json.
// The embedding must authenticate attachments, restore durable fences before
// accepting work, and validate the lease again at physical submit/deliver.
function createControllerLease({ clock = () => performance.now(), ttlMs = 30000 } = {}) {
  if (typeof clock !== 'function' || !Number.isSafeInteger(ttlMs) || ttlMs < 1000 || ttlMs > 300000) throw new Error('controller_options');
  const bootId = randomUUID(), clients = new WeakMap(), grants = new WeakMap(), operations = new WeakMap();
  let generation = 0, serial = 0, current = null, lastTime = -Infinity, faulted = false;
  function fail(code) { const error = new Error(code); error.code = code; throw error; }
  function healthy() { if (faulted) fail('controller_clock_fault'); }
  function now() {
    healthy();
    let value;
    try { value = clock(); } catch { faulted = true; fail('controller_clock_fault'); }
    if (!Number.isFinite(value) || value < 0 || value < lastTime) { faulted = true; fail('controller_clock_fault'); }
    lastTime = value; return value;
  }
  function client(session, allowDetached = false) {
    const record = clients.get(session);
    if (!record) fail('controller_client_identity');
    if (!allowDetached && !record.connected) fail('controller_client_detached');
    return record;
  }
  function lease(handle, allowExpired = false) {
    healthy();
    const record = grants.get(handle);
    if (!record || record !== current) fail('controller_lease_identity');
    client(record.session);
    if (record.fenced) fail('controller_fenced');
    if (!allowExpired && now() >= record.expiresAt) fail('controller_lease_expired');
    return record;
  }
  function issue(session, time) {
    const handle = Object.freeze({ bootId, generation: ++generation, clientId: session.clientId });
    const record = { session, handle, expiresAt: time + ttlMs, operation: null, fenced: false };
    grants.set(handle, record); current = record; return handle;
  }
  return Object.freeze({
    attach() {
      healthy();
      const session = Object.freeze({ clientId: randomUUID() });
      clients.set(session, { connected: true }); return session;
    },
    acquire(session) {
      healthy(); client(session);
      if (current) fail(current.fenced ? 'controller_fenced' : 'controller_busy');
      return issue(session, now());
    },
    transferExpired(session, expected) {
      healthy(); client(session);
      if (!expected || Object.getPrototypeOf(expected) !== Object.prototype || Object.keys(expected).sort().join(',') !== 'bootId,generation,holderClientId') fail('controller_expected');
      if (!current || expected.bootId !== bootId || expected.generation !== current.handle.generation || expected.holderClientId !== current.session.clientId) fail('controller_transfer_changed');
      if (current.fenced) fail('controller_fenced');
      if (current.operation) fail('controller_draining');
      const time = now();
      if (time < current.expiresAt) fail('controller_not_expired');
      // Explicit exact-holder transfer only. Durable quiescence is additionally
      // checked by the trusted embedding; no time-driven automatic takeover.
      return issue(session, time);
    },
    assertCurrent(handle) { lease(handle); },
    renew(handle) {
      const record = lease(handle, true), time = now();
      if (time >= record.expiresAt) fail('controller_lease_expired');
      record.expiresAt = time + ttlMs;
    },
    release(handle) {
      const record = lease(handle, true);
      if (record.operation) fail('controller_draining');
      current = null;
    },
    detach(session) {
      const record = client(session, true); record.connected = false;
      // Socket loss revokes new work, but accepted work belongs to the owner.
      if (current?.session === session && !current.operation && !current.fenced && !faulted) current = null;
    },
    begin(handle) {
      const record = lease(handle);
      if (record.operation) fail('controller_operation_pending');
      const operation = Object.freeze({ bootId, generation: handle.generation, serial: ++serial });
      record.operation = operation; operations.set(operation, record); return operation;
    },
    complete(operation, outcome) {
      // Original completion remains recordable after expiry/detach/clock fault.
      // Only the trusted owner calls this after its durable outcome processing;
      // a client-provided "settled" string can never resolve physical UNKNOWN.
      const record = operations.get(operation);
      if (!record || record !== current || record.operation !== operation) fail('controller_operation_identity');
      if (!['settled', 'unknown'].includes(outcome)) fail('controller_outcome');
      record.operation = null; operations.delete(operation);
      if (outcome === 'unknown') record.fenced = true;
      if (!record.fenced && !clients.get(record.session).connected && !faulted) current = null;
    },
    status() {
      const time = faulted ? null : now();
      return Object.freeze({ bootId, generation, mode: faulted ? 'faulted' : !current ? 'idle' : current.fenced ? 'fenced' : !clients.get(current.session).connected ? 'draining' : time >= current.expiresAt ? 'expired' : 'held',
        holderClientId: current?.session.clientId || null, pending: !!current?.operation, fenced: !!current?.fenced });
    }
  });
}
module.exports = { createControllerLease };
