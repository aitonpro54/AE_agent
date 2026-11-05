'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareRelease } = require('../src/release');
const job = require('../examples/titr-all-release.json');

const pin = '2'.repeat(64), contractId = '1'.repeat(64), evidenceRef = 'evidence-example';
const inspection = { synthetic: false, evidenceRef, modulePin: pin, snapshot: { target: job.target,
  layers: [{ layerId: 4594, controllable: true }, { layerId: 4595, controllable: false }] } };
const variant = { moduleId: 'text-variant', operationId: 'stage-text-variant', modulePin: pin, contractId };
const render = { moduleId: 'comp-render', operationId: 'render-text-variant', modulePin: pin, contractId };

test('release compiler carries the configured hold and selects the exact result layer for the queue', () => {
  const derive = prepareRelease(job, { phase: 'derive' }, variant, inspection).steps[0];
  assert.equal(derive.input.derive.holdTime, 3);
  assert.equal(derive.evidenceRef, evidenceRef);
  const stage = prepareRelease(job, { phase: 'stage', variantLayerId: 4594 }, render, inspection).steps[0];
  assert.equal(stage.input.activeLayerId, 4594);
  assert.deepEqual(stage.input.controlledLayerIds, [...job.controlledLayerIds, 4594]);
  assert.equal(stage.input.fileName, job.render.fileName);
  assert.throws(() => prepareRelease(job, { phase: 'stage', variantLayerId: 4595 }, render, inspection), /release_target/);
});

test('release compiler binds cleanup to the observed job and rejects a stale contract or target', () => {
  const selected = { phase: 'finalize', variantLayerId: 4594, jobCompId: 6000 };
  const current = { ...inspection, snapshot: { ...inspection.snapshot, job: { jobCompId: 6000 } } };
  assert.equal(prepareRelease(job, selected, render, current).steps[0].input.jobCompId, 6000);
  assert.throws(() => prepareRelease(job, selected, render, inspection), /release_target/);
  assert.throws(() => prepareRelease(job, selected, variant, current), /release_contract/);
});
