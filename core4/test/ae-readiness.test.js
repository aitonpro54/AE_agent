'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test } = require('node:test');
const { compileFunction } = require('node:vm');
const { createAeReadiness } = require('../runtime/ae-readiness');
const { createControllerLease } = require('../runtime/controller-lease');
const { canonical, exact, fail, hash, id } = require('../protocol/json');

const connected = { peer: { connected: true, peerId: 'p1' } };
const window = { pid: 42, birth: '2026-11-09T00:00:00.000Z', dialogs: [] };
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

// Exercise the production facade path without starting a host, installer or listener.
function inspectionFixture(aeReadiness, context) {
  const source = fs.readFileSync(require.resolve('../runtime/stdio-entry'), 'utf8');
  const first = source.indexOf('  facade.inspect = ');
  const last = source.indexOf('  facade.build = ', first);
  assert.ok(first >= 0 && last > first);
  const facade = {}, contractId = 'a'.repeat(64), profile = { id: 'project-inspection' };
  const completedReadErrors = new WeakMap(), offers = [];
  const peer = {
    status: () => connected,
    linkIdentity: () => 'link',
    inspect: target => { offers.push(target); return { observation: {} }; }
  };
  const bindings = { facade, contractId, profile, aeReadiness, completedReadErrors, peer, exact, canonical, fail, hash, id,
    invocationContext: { getStore: () => context }, workSession: null };
  compileFunction(source.slice(first, last), Object.keys(bindings))(...Object.values(bindings));
  return { inspect: (target = {}) => facade.inspect({ moduleId: profile.id, contractId, target }), offers, completedReadErrors };
}

test('ae-readiness separates window, CEP, native callback and baseline', async () => {
  let time = 10, state = 'starting-or-hidden', scans = 0;
  const observer = createAeReadiness({ platform: 'win32', now: () => time, scan: async () => {
    scans++;
    return JSON.stringify({ ...window, state, dialogs: state === 'modal-observed' ? ['f1'] : [] });
  } });
  await Promise.all([observer.refresh(), observer.refresh()]);
  assert.equal(scans, 1);
  assert.equal(observer.status(connected, true).process.state, 'starting-or-hidden');
  assert.equal(observer.status(connected, true).native, 'unverified');
  assert.equal(observer.status(connected, true).baselineRequired, true);
  assert.equal(observer.blocker(), null);
  time += 5001;
  state = 'modal-observed';
  await observer.refresh();
  assert.deepEqual(observer.status(connected, true).process.dialogs, ['f1']);
  assert.equal(observer.blocker(), 'ae_modal_observed');
  time += 5001;
  assert.equal(observer.status(connected, true).process.fresh, false);
  assert.equal(observer.blocker(), null);
  state = 'unresponsive';
  await observer.refresh();
  assert.equal(observer.blocker(), 'ae_unresponsive');
  time += 5001;
  state = 'window-responsive';
  await observer.refresh();
  assert.equal(observer.status(connected, true).native, 'unverified');
  observer.recordRead('p1');
  assert.equal(observer.status(connected, false).native, 'recent-authenticated-read');
  assert.equal(observer.status({ ...connected, pending: {} }, false).native, 'unverified');
  assert.equal(observer.status({ peer: { connected: true, peerId: 'p2' } }, false).native, 'unverified');
});

test('ae-readiness reports invalid or unavailable scans without claiming an absent dialog', async () => {
  for (const scan of [async () => '{', async () => { throw new Error('scan denied'); },
    async () => JSON.stringify({ ...window, state: 'modal-observed' })]) {
    const observer = createAeReadiness({ scan, platform: 'win32' });
    await observer.refresh();
    assert.equal(observer.status(connected, false).process.state, 'scan-failed');
    assert.equal(observer.status(connected, false).native, 'unverified');
    assert.equal(observer.blocker(), null);
  }
});

test('ae-readiness direct inspection refreshes a missing or stale scan before any offer', async () => {
  let time = 0, scans = 0, state = 'modal-observed';
  const pending = deferred();
  const observer = createAeReadiness({ platform: 'win32', now: () => time, scan: async () => {
    scans++;
    if (scans === 1) await pending.promise;
    return JSON.stringify({ ...window, state, dialogs: state === 'modal-observed' ? ['f1'] : [] });
  } });
  const context = { observer: false, assertCurrent() {} };
  const fixture = inspectionFixture(observer, context);
  const first = assert.rejects(fixture.inspect(), error => {
    assert.equal(error.code, 'ae_modal_observed');
    assert.equal(fixture.completedReadErrors.get(error).phase, 'pre-dispatch');
    assert.equal(fixture.completedReadErrors.get(error).context, context);
    return true;
  });
  const diagnostics = observer.refresh();
  assert.equal(scans, 1);
  assert.deepEqual(fixture.offers, []);
  pending.resolve();
  await Promise.all([first, diagnostics]);
  assert.deepEqual(fixture.offers, []);
  assert.equal(observer.blocker(), 'ae_modal_observed');
  time = 5001;
  state = 'window-responsive';
  await fixture.inspect({ compId: 7 });
  await fixture.inspect({ cursor: 'page-2' });
  assert.equal(scans, 2);
  assert.deepEqual(fixture.offers, [{ compId: 7 }, { cursor: 'page-2' }]);
});

test('ae-readiness root inspection detects a new modal within the responsive cache lifetime', async () => {
  let scans = 0;
  const pending = deferred();
  const observer = createAeReadiness({ platform: 'win32', now: () => 0, scan: async () => {
    if (++scans === 1) return JSON.stringify({ ...window, state: 'window-responsive' });
    return pending.promise;
  } });
  const fixture = inspectionFixture(observer, { observer: false, assertCurrent() {} });
  await observer.refresh();
  const root = assert.rejects(fixture.inspect(), { code: 'ae_modal_observed' });
  const addressed = assert.rejects(fixture.inspect({ compId: 7 }), { code: 'ae_modal_observed' });
  assert.equal(scans, 2);
  assert.deepEqual(fixture.offers, []);
  pending.resolve(JSON.stringify({ ...window, state: 'modal-observed', dialogs: ['f1'] }));
  await Promise.all([root, addressed]);
  assert.deepEqual(fixture.offers, []);
});

test('ae-readiness direct inspection revalidates its exact lease after a pending scan', async () => {
  let time = 0;
  const pending = deferred(), lease = createControllerLease({ clock: () => time, ttlMs: 1000 });
  const grant = lease.acquire(lease.attach());
  const observer = createAeReadiness({ platform: 'win32', now: () => time, scan: () => pending.promise });
  const fixture = inspectionFixture(observer, { observer: false, assertCurrent: () => lease.assertCurrent(grant) });
  const outcome = assert.rejects(fixture.inspect(), { code: 'controller_lease_expired' });
  assert.deepEqual(fixture.offers, []);
  time = 1000;
  pending.resolve(JSON.stringify({ ...window, state: 'window-responsive' }));
  await outcome;
  assert.deepEqual(fixture.offers, []);
});
