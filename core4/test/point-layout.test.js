'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./fixtures/manual-http-runtime');
const { layoutEnvironment } = require('./fixtures/point-layout-ae');
const { buildPackage, verifyPackage } = require('../tools/package-installable');
const { hash, canonical } = require('../protocol/json');

const moduleId = 'titles-point-layout';
const frame = { left: 70, top: 40, width: 230, height: 160 };
const fit = { padding: 5, preferredScale: 1, minimumScale: 0.5 };
const layoutId = '1'.repeat(64);
const candidates = [
  { id: 'base', text: 'Автор Ветров\nПостановка студии\nДорога к северному морю и огни' },
  { id: 'alternative-1', text: 'Автор Ветров\nПостановка студии\nДорога к северному морю\nи огни' },
];

async function prepare(h, mode, task) {
  const contract = h.broker.getContract({ moduleId });
  const target = { projectId: h.state.projectId, compId: 1, layerId: mode === 'measure' ? 103 : 104 };
  const inspection = await h.broker.inspect({ moduleId, contractId: contract.contractId, target });
  const input = { ...target, mode, frame, fit, layoutId };
  if (mode === 'measure') input.candidates = candidates;
  else {
    const command = task.commands[0];
    // The VM fixture's alternative is 230 × 128 with a fixed local origin.
    const scale = 220 / 230;
    Object.assign(input, { text: candidates[1].text, candidateId: candidates[1].id, measurementCommandId: command.commandId,
      scale, position: [185 - 110 * scale, 120 - 45 * scale] });
  }
  return { ...(task ? { taskId: task.taskId } : {}), oneStep: true, steps: [{ stepId: `${mode}-title-layout`, moduleId,
    contractId: contract.contractId, evidenceRef: inspection.evidenceRef, input }] };
}
async function propose(h, payload) {
  const built = await h.broker.build(payload);
  const { proposalId } = h.broker.propose({ buildId: built.buildId });
  const { dryrunRef } = await h.broker.dryrun({ proposalId });
  return { taskId: built.taskId, proposalId, dryrunRef };
}
async function measure(h) {
  const request = await propose(h, await prepare(h, 'measure'));
  const result = await h.broker.run(request);
  assert.equal(result.state, 'succeeded', JSON.stringify(result));
  return h.broker.getTask({ taskId: request.taskId });
}

test('point-layout: real Broker, HTTP, CEP dispatcher and fixed JSX measure, restore and apply with two confirmations', async t => {
  const h = await harness({ layoutEnvironment }); t.after(() => h.close());
  const task = await measure(h);
  assert.equal(task.commands[0].target.layerId, 103);
  assert.equal(h.state.layout.scratch.text, 'BASE');
  assert.equal(h.state.layout.output.text, 'BASE');
  const samples = task.commands[0].after.samples;
  assert.ok(samples.length > 1);
  assert.equal(h.state.layout.counts.measureText, samples.length + 1);
  const payload = await prepare(h, 'apply', task);
  const desired = payload.steps[0].input;
  assert.notEqual(desired.candidateId, 'base');
  const result = await h.broker.run(await propose(h, payload));
  assert.equal(result.state, 'succeeded', JSON.stringify(result));
  assert.equal(h.state.layout.output.text.replace(/\r/g, '\n'), desired.text);
  assert.deepEqual(h.state.layout.output.position, [...desired.position, 0]);
  assert.deepEqual(h.state.layout.output.scale, [desired.scale * 100, desired.scale * 100, 100]);
  assert.equal(h.state.layout.scratch.text, 'BASE');
  assert.equal(h.confirmations, 2);
  assert.deepEqual(h.state.layout.counts, { measureText: samples.length + 1, applyText: 1, scale: 1, position: 1, undoDepth: 0 });
  const c = h.broker.getContract({ moduleId });
  const readback = await h.broker.inspect({ moduleId, contractId: c.contractId, target: result.outputs['apply-title-layout'].target });
  assert.deepEqual(readback.snapshot, result.outputs['apply-title-layout']);
  assert.deepEqual(h.broker.ledger.unresolved(), []);
});

test('point-layout: forged receipt, changed text, and altered placement stop before delivery', async t => {
  const h = await harness({ layoutEnvironment }); t.after(() => h.close());
  const task = await measure(h);
  for (const [change, expected] of [
    [{ measurementCommandId: 'command-11111111-1111-4111-8111-111111111111' }, 'layout_measurement_required'],
    [{ text: 'Подменённый текст' }, 'layout_measurement_candidate'],
    [{ position: [0, 0] }, 'layout_placement_mismatch'],
  ]) {
    const payload = await prepare(h, 'apply', task);
    Object.assign(payload.steps[0].input, change);
    const result = await h.broker.run(await propose(h, payload));
    assert.equal(result.code, expected, JSON.stringify(result));
  }
  assert.equal(h.confirmations, 1);
  assert.equal(h.state.layout.counts.applyText, 0);
  assert.equal(h.broker.ledger.commands().length, 1);
});

test('point-layout: native cancellation and post-confirm baseline drift have zero setters', async t => {
  for (const drift of [false, true]) {
    const h = await harness({ layoutEnvironment, confirm: ({ state }) => {
      if (drift) state.layout.scratch.position = [1, 1];
      return drift;
    } }); t.after(() => h.close());
    const result = await h.broker.run(await propose(h, await prepare(h, 'measure')));
    assert.equal(result.code, 'executor_rejected');
    assert.equal(result.message, drift ? 'layout_binding' : 'local_cancelled');
    assert.equal(h.state.layout.counts.measureText, 0);
    assert.equal(h.state.layout.counts.undoDepth, 0);
    assert.deepEqual(h.broker.ledger.unresolved(), []);
  }
});

test('point-layout: measurement failure restores the original and fences the uncertain outcome', async t => {
  const h = await harness({ layoutEnvironment }); t.after(() => h.close());
  h.state.layout.scratch.rectError = true;
  const result = await h.broker.run(await propose(h, await prepare(h, 'measure')));
  assert.equal(result.state, 'stopped');
  assert.equal(h.state.layout.scratch.text, 'BASE');
  assert.equal(h.state.layout.counts.measureText, 2);
  assert.equal(h.state.layout.counts.undoDepth, 0);
  assert.equal(h.state.layout.counts.applyText, 0);
  assert.equal(h.broker.ledger.unresolved()[0].state, 'UNKNOWN');
  assert.equal(h.peer.status().storeClosed, true);
});

test('point-layout: no package closure in regular compositions, exact opt-in composition rejects a missing proof file', () => {
  for (const mode of ['readonly', 'manual']) {
    const pkg = buildPackage(undefined, mode);
    assert.ok(!Object.keys(pkg.files).some(name => /point-layout/.test(name)));
  }
  const pkg = buildPackage(undefined, 'manual-layout', { runtimeModel: 'owner' });
  assert.ok(Object.hasOwn(pkg.files, 'modules/titles-current-target/executor.jsx'));
  const damaged = structuredClone(pkg);
  const file = 'runtime/point-layout-proof.js';
  delete damaged.files[file]; delete damaged.release.hashes[file];
  damaged.packageHash = hash(damaged.release);
  assert.throws(() => verifyPackage(damaged), /composition_optional_closure/);
  assert.equal(hash(canonical(pkg.release)), pkg.packageHash);
});
