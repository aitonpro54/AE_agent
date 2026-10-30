'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createControllerLease } = require('../runtime/controller-lease');

function fixture() { let time = 0; const owner = createControllerLease({ clock: () => time, ttlMs: 1000 }); return { owner, at(value) { time = value; } }; }
function refuses(fn, code) { assert.throws(fn, error => error.code === code); }

test('controller-lease attachment and repeated observer status never acquire control', () => {
  const { owner } = fixture(); const a = owner.attach(), b = owner.attach();
  assert.notEqual(a.clientId, b.clientId);
  for (let n = 0; n < 3; n++) assert.equal(owner.status().mode, 'idle');
  assert.equal(owner.status().generation, 0); assert.equal(owner.status().holderClientId, null);
});
test('controller-lease explicit acquire is exclusive and repeated acquire is not renewal', () => {
  const { owner, at } = fixture(); const a = owner.attach(), b = owner.attach(), grant = owner.acquire(a);
  at(999); refuses(() => owner.acquire(a), 'controller_busy'); refuses(() => owner.acquire(b), 'controller_busy');
  at(1000); refuses(() => owner.assertCurrent(grant), 'controller_lease_expired');
  assert.equal(owner.status().mode, 'expired'); refuses(() => owner.acquire(b), 'controller_busy');
});
test('controller-lease exact explicit release permits new generation and rejects captured grant', () => {
  const { owner } = fixture(); const a = owner.attach(), b = owner.attach(), old = owner.acquire(a);
  owner.release(old); const next = owner.acquire(b);
  assert.equal(next.generation, old.generation + 1);
  refuses(() => owner.assertCurrent(old), 'controller_lease_identity');
  refuses(() => owner.release(old), 'controller_lease_identity'); owner.assertCurrent(next);
});
test('controller-lease serialized handles and foreign owner boot cannot authorize work', () => {
  const { owner } = fixture(); const session = owner.attach(), grant = owner.acquire(session), other = fixture().owner;
  refuses(() => owner.assertCurrent({ ...grant }), 'controller_lease_identity');
  refuses(() => owner.acquire({ ...session }), 'controller_client_identity');
  refuses(() => other.assertCurrent(grant), 'controller_lease_identity'); assert.notEqual(other.status().bootId, grant.bootId);
});
test('controller-lease only explicit timely renewal extends permission; expired grant cannot renew', () => {
  const { owner, at } = fixture(); const grant = owner.acquire(owner.attach());
  at(900); owner.renew(grant); at(1000); owner.assertCurrent(grant);
  at(1900); refuses(() => owner.renew(grant), 'controller_lease_expired');
  owner.release(grant); assert.equal(owner.status().mode, 'idle');
});
test('controller-lease quiescent disconnect releases control but cannot reuse detached session', () => {
  const { owner } = fixture(); const a = owner.attach(), grant = owner.acquire(a); owner.detach(a);
  assert.equal(owner.status().mode, 'idle'); refuses(() => owner.acquire(a), 'controller_client_detached');
  refuses(() => owner.assertCurrent(grant), 'controller_lease_identity'); owner.acquire(owner.attach());
});
test('controller-lease renewal samples time once so expiry cannot move between validation and extension', () => {
  const times = [0, 999, 1000, 1999]; let samples = 0;
  const owner = createControllerLease({ clock: () => times[samples++], ttlMs: 1000 }), grant = owner.acquire(owner.attach());
  owner.renew(grant); assert.equal(samples, 2);
  assert.equal(owner.status().mode, 'held');
  refuses(() => owner.assertCurrent(grant), 'controller_lease_expired');
});
test('controller-lease lost client drains accepted work and rejects takeover across expiry', () => {
  const { owner, at } = fixture(); const a = owner.attach(), b = owner.attach(), grant = owner.acquire(a), operation = owner.begin(grant);
  owner.detach(a); at(5000);
  assert.equal(owner.status().mode, 'draining'); assert.equal(owner.status().pending, true);
  refuses(() => owner.acquire(b), 'controller_busy'); refuses(() => owner.begin(grant), 'controller_client_detached');
  owner.complete(operation, 'settled'); assert.equal(owner.status().mode, 'idle'); owner.acquire(b);
});
test('controller-lease expiry during accepted work preserves original completion and blocks new sends', () => {
  const { owner, at } = fixture(); const grant = owner.acquire(owner.attach()), operation = owner.begin(grant);
  at(1000); refuses(() => owner.assertCurrent(grant), 'controller_lease_expired');
  refuses(() => owner.release(grant), 'controller_draining'); owner.complete(operation, 'settled');
  refuses(() => owner.begin(grant), 'controller_lease_expired'); owner.release(grant);
});
test('controller-lease physical UNKNOWN remains fenced after detach and expiry; no reset API', () => {
  const { owner, at } = fixture(); const a = owner.attach(), grant = owner.acquire(a), operation = owner.begin(grant);
  owner.complete(operation, 'unknown'); at(5000);
  refuses(() => owner.release(grant), 'controller_fenced'); owner.detach(a);
  assert.equal(owner.status().mode, 'fenced'); refuses(() => owner.acquire(owner.attach()), 'controller_fenced');
  refuses(() => owner.complete(operation, 'settled'), 'controller_operation_identity'); assert.equal(owner.reset, undefined);
});
test('controller-lease one accepted operation and exact original completion; no copies or replay', () => {
  const { owner } = fixture(); const grant = owner.acquire(owner.attach()), operation = owner.begin(grant);
  refuses(() => owner.begin(grant), 'controller_operation_pending'); refuses(() => owner.release(grant), 'controller_draining');
  refuses(() => owner.complete({ ...operation }, 'settled'), 'controller_operation_identity');
  refuses(() => owner.complete(operation, 'cancelled'), 'controller_outcome'); assert.equal(owner.status().pending, true);
  owner.complete(operation, 'settled'); refuses(() => owner.complete(operation, 'settled'), 'controller_operation_identity');
});
test('controller-lease monotonic clock failure revokes new work but original outcome remains recordable', () => {
  const { owner, at } = fixture(); const grant = owner.acquire(owner.attach()), operation = owner.begin(grant);
  at(100); owner.assertCurrent(grant); at(99); refuses(() => owner.renew(grant), 'controller_clock_fault');
  owner.complete(operation, 'settled'); assert.equal(owner.status().mode, 'faulted'); assert.equal(owner.status().fenced, false);
  refuses(() => owner.begin(grant), 'controller_clock_fault'); refuses(() => owner.attach(), 'controller_clock_fault');
});
test('controller-lease invalid clock and options fail closed', () => {
  for (const value of [NaN, Infinity, -1]) { const owner = createControllerLease({ clock: () => value }); refuses(() => owner.status(), 'controller_clock_fault'); assert.equal(owner.status().mode, 'faulted'); }
  assert.throws(() => createControllerLease({ ttlMs: 0 }), /controller_options/);
  const owner = createControllerLease({ clock() { throw new Error('broken'); } }); refuses(() => owner.status(), 'controller_clock_fault');
});
