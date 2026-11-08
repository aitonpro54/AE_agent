'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { compile, prepareBuild, prepareRender, PHOTO, OPERATOR_PHOTO, RENDER } = require('../compiler');
const { verifyFiles } = require('../cli');

const job = {
  jobId: 'crossfade-check', templateId: 'crossfade-two-v1',
  template: { file: '/fixture/original.aep', sha256: 'a'.repeat(64) },
  project: { file: '/fixture/work.aep', masterCompId: 10, sessionId: 'work-session' },
  slots: [{ compId: 11, layerId: 21, placeholderSourceId: 1 }, { compId: 12, layerId: 22, placeholderSourceId: 2 }],
  photos: [{ sourceId: 2, file: '/fixture/new-1.jpg', sha256: 'b'.repeat(64) },
    { sourceId: 1, file: '/fixture/new-2.jpg', sha256: 'c'.repeat(64) }],
  output: { fileName: 'crossfade.mp4', renderTemplate: 'Best Settings', outputTemplate: 'H.264' },
  purpose: 'technical_check'
};

function evidence(completed = 0, photo = PHOTO) {
  const frame = 1 / 30;
  const observation = (module, snapshot) => ({ modulePin: module.modulePin, evidenceRef: 'evidence-' + '1'.repeat(36),
    synthetic: false, snapshot: { revision: 'fresh', ...snapshot } });
  const contract = module => ({ ...module, contractId: 'd'.repeat(64), admissionPin: 'e'.repeat(64),
    contract: { ...module, executionPolicy: 'current-matching-target-after-local-confirmation-v1' } });
  const timeline = job.slots.map((slot, index) => ({ sourceId: slot.compId, enabled: true, stretch: 100,
    startTime: index, inPoint: index, outPoint: index + 2,
    opacity: index ? 100 : null, keys: index ? [] : [[1, 100, true, true], [2, 0, true, true]],
    leaf: [{ sourceId: index < completed ? job.photos[index].sourceId : slot.placeholderSourceId,
      enabled: true, opacity: 100, keys: [] }] }));
  const master = observation(RENDER, { target: { projectId: job.project.file, compId: 10 }, duration: 3, frameDuration: frame,
    protected: JSON.stringify(['Master', 'AE_CORE4_COMP_WORKSPACE_V1', 960, 600, 3, frame, 0, [], timeline]),
    queueIdle: true });
  const slots = job.slots.map((slot, index) => observation(photo, { target: { sessionId: job.project.sessionId,
    projectId: job.project.file, compId: slot.compId, layerId: slot.layerId },
    protected: JSON.stringify({ enabled: true, stretch: 100, threeDLayer: false, startTime: 0, inPoint: 0, outPoint: 2,
      comp: ['Slot', 960, 600], layers: [[slot.layerId]] }),
    sourceId: timeline[index].leaf[0].sourceId, source: { file: job.photos[index].file } }));
  const result = { photoContract: contract(photo), renderContract: contract(RENDER), master, slots };
  if (completed) {
    result.tasks = [{ taskId: 'task-' + '2'.repeat(36), reset: false, commands: slots.slice(0, completed).map((slot, i) => ({
      workflowId: compile(job).workflowId, stepId: 'photo-' + (i + 1), state: 'succeeded',
      modulePin: photo.modulePin, after: structuredClone(slot.snapshot)
    })) }];
  }
  return result;
}

test('compiler binds the order, render range and a stable two-step workflow to fresh observations', () => {
  const result = compile(job);
  assert.deepEqual(result.slots.map(slot => [slot.photo.sourceId, slot.startFrame, slot.endFrame]), [[2, 0, 60], [1, 30, 90]]);
  assert.equal(result.frameCount, 90);
  const build = prepareBuild(job, evidence());
  assert.equal(build.workflowId, result.workflowId);
  assert.deepEqual(build.steps.map(step => step.input.newSourceId), [2, 1]);
  assert.deepEqual(build.steps[1].dependsOn, ['photo-1']);
  assert.equal(build.recordContext.lifetime, 'ephemeral_check');
  const fractional = evidence(), timeline = JSON.parse(fractional.master.snapshot.protected);
  timeline[8][0].keys[0][0] += 0.001;
  timeline[8][1].startTime += 0.001;
  timeline[8][1].inPoint += 0.001;
  fractional.master.snapshot.protected = JSON.stringify(timeline);
  assert.doesNotThrow(() => prepareBuild(job, fractional));
});

test('operator package plans one photo at a time in the same workflow', () => {
  const first = prepareBuild(job, evidence(0, OPERATOR_PHOTO));
  const partial = evidence(1, OPERATOR_PHOTO);
  const second = prepareBuild(job, partial);
  assert.equal(first.workflowId, second.workflowId);
  assert.equal(first.oneStep, true);
  assert.equal(second.oneStep, true);
  assert.deepEqual([first, second].map(plan => plan.steps.map(step => step.stepId)), [['photo-1'], ['photo-2']]);
  assert.equal(second.steps[0].dependsOn, undefined);
  assert.throws(() => prepareRender(job, partial, 'stage'), /slideshow_photos_incomplete/);
  partial.tasks[0].commands[0].modulePin = PHOTO.modulePin;
  assert.throws(() => prepareBuild(job, partial), /slideshow_successful_slot_drift/);
  const completed = evidence(2, OPERATOR_PHOTO);
  assert.throws(() => prepareBuild(job, completed), /slideshow_photos_complete/);
  assert.equal(prepareRender(job, completed, 'stage').steps[0].stepId, 'render-stage');
});

test('partial success preserves the workflow and refuses a drifted or unresolved original command', () => {
  const partial = evidence(1);
  const resumed = prepareBuild(job, partial);
  assert.equal(resumed.taskId, undefined);
  assert.equal(resumed.workflowId, compile(job).workflowId);
  assert.throws(() => prepareRender(job, partial, 'stage'), /slideshow_photos_incomplete/);
  partial.slots[0].snapshot.revision = 'different';
  assert.throws(() => prepareBuild(job, partial), /slideshow_successful_slot_drift/);
  partial.tasks[0].commands[0].state = 'UNKNOWN';
  assert.throws(() => prepareBuild(job, partial), /slideshow_reconcile_original_task/);
});

test('renderer requires both original successes and the verified queue state', () => {
  const completed = evidence(2);
  const stage = prepareRender(job, completed, 'stage');
  assert.deepEqual(stage.steps[0].input.controlledLayerIds, []);
  assert.equal(stage.steps[0].input.frameCount, 90);
  assert.equal(stage.steps[0].input.activeLayerId, 0);
  completed.master.snapshot.queueIdle = false;
  assert.throws(() => prepareRender(job, completed, 'stage'), /slideshow_render_state/);
  completed.master.snapshot.job = { status: 'DONE', rendering: false, jobCompId: 35 };
  assert.equal(prepareRender(job, completed, 'finalize').steps[0].input.jobCompId, 35);
});

test('wrong master transition and replacing an unowned slot are refused', () => {
  const wrong = evidence(), master = JSON.parse(wrong.master.snapshot.protected);
  master[8][0].keys[0][2] = false;
  wrong.master.snapshot.protected = JSON.stringify(master);
  assert.throws(() => prepareBuild(job, wrong), /slideshow_master_transition/);
  const extra = structuredClone(job);
  extra.slots[0].compId = extra.slots[1].compId;
  assert.throws(() => compile(extra), /slideshow_slot_binding/);
  const changed = evidence(1);
  delete changed.tasks;
  assert.throws(() => prepareBuild(job, changed), /slideshow_unowned_slot_change/);
});

test('file verification preserves the template and rejects a hard-linked or altered working seed', t => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'slideshow-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const local = structuredClone(job);
  const create = (name, bytes) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, bytes);
    return { file, sha256: createHash('sha256').update(bytes).digest('hex') };
  };
  local.template = create('original.aep', 'template');
  local.project.file = create('work.aep', 'template').file;
  local.photos = local.photos.map((photo, i) => ({ ...photo, ...create('photo-' + i + '.jpg', String(i)) }));
  assert.equal(verifyFiles(local, true).templateSha256, local.template.sha256);
  fs.writeFileSync(local.project.file, 'changed');
  assert.throws(() => verifyFiles(local, true), /slideshow_template_copy/);
  assert.doesNotThrow(() => verifyFiles(local, false));
  fs.unlinkSync(local.project.file);
  fs.linkSync(local.template.file, local.project.file);
  assert.throws(() => verifyFiles(local, true), /slideshow_template_copy/);
});
