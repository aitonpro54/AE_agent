'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createAeReadiness } = require('../runtime/ae-readiness');

const connected = { peer: { connected: true, peerId: 'p1' } };
const window = { pid: 42, birth: '2026-11-09T00:00:00.000Z', dialogs: [] };

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
