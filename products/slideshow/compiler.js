'use strict';
const { createHash } = require('node:crypto');
const path = require('node:path');
const template = require('./template.json');
const schema = require('./job.schema.json');

const POLICY = 'current-matching-target-after-local-confirmation-v1';
const PHOTO = { moduleId: 'photo-placeholder', operationId: 'replace-source',
  modulePin: 'b6a1ea3b4bbe778a4a0753217f9188fea481474ff3b4d9e00e04ee994eb9e13b' };
const RENDER = { moduleId: 'comp-render', operationId: 'render-text-variant',
  modulePin: '996e6bb4ad89f4bb49eeca143ad788f0e224a04caf0ecb06183083eb84b9105b' };
const digest = /^[a-f0-9]{64}$/;
const ref = /^evidence-[a-f0-9-]{36}$/;
function requireCondition(ok, code) {
  if (!ok) throw Object.assign(new Error(code), { code });
}
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}
const same = (a, b) => canonical(a) === canonical(b);
function check(shape, value) {
  if (shape.$ref) check(schema.$defs[shape.$ref.split('/').at(-1)], value);
  if (Object.hasOwn(shape, 'const')) requireCondition(value === shape.const, 'slideshow_job_schema');
  if (shape.enum) requireCondition(shape.enum.includes(value), 'slideshow_job_schema');
  if (shape.type === 'object') {
    requireCondition(value && Object.getPrototypeOf(value) === Object.prototype &&
      Object.keys(value).length === shape.required.length && shape.required.every(key => Object.hasOwn(value, key)), 'slideshow_job_schema');
    for (const [key, child] of Object.entries(shape.properties)) check(child, value[key]);
  } else if (shape.type === 'array') {
    requireCondition(Array.isArray(value) && value.length >= shape.minItems && value.length <= shape.maxItems, 'slideshow_job_schema');
    value.forEach(item => check(shape.items, item));
  } else if (shape.type === 'string') {
    requireCondition(typeof value === 'string' && value.length >= (shape.minLength ?? 1) &&
      value.length <= (shape.maxLength ?? 2048) && !/[\x00-\x1f\x7f]/.test(value) &&
      (!shape.pattern || new RegExp(shape.pattern, 'u').test(value)), 'slideshow_job_schema');
  } else if (shape.type === 'integer') {
    requireCondition(Number.isSafeInteger(value) && value >= shape.minimum && value <= shape.maximum, 'slideshow_job_schema');
  }
}
function fileIdentity(file) {
  const windows = path.win32.isAbsolute(file) && /^[a-z]:\\/i.test(file);
  const api = windows ? path.win32 : path.posix;
  requireCondition(api.isAbsolute(file) && api.normalize(file) === file, 'slideshow_file_path');
  return windows ? file.toLowerCase() : file;
}
function compile(job) {
  check(schema, job);
  const { project, photos, slots } = job;
  const files = [project.file, job.template.file, ...photos.map(photo => photo.file)].map(fileIdentity);
  requireCondition(files[0].toLowerCase().endsWith('.aep') && files[1].toLowerCase().endsWith('.aep') &&
    new Set(files).size === files.length, 'slideshow_file_binding');
  requireCondition(new Set([project.masterCompId, ...slots.map(slot => slot.compId)]).size === 3 &&
    new Set(photos.map(photo => photo.sourceId)).size === 2 &&
    slots.every((slot, index) => slot.placeholderSourceId !== photos[index].sourceId), 'slideshow_slot_binding');
  requireCondition(!/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])\./i.test(job.output.fileName), 'slideshow_output');
  const workflowId = 'slideshow-' + createHash('sha256').update(canonical(job)).digest('hex');
  const recordContext = { purpose: job.purpose, lifetime: job.purpose === 'technical_check' ? 'ephemeral_check' : 'work_context',
    contextId: job.jobId, project: { file: project.file }, resources: [
      { kind: 'project', identity: project.file }, { kind: 'job', identity: job.jobId }
    ] };
  return { workflowId, recordContext, templateId: template.id, frameCount: template.frameCount, audio: template.audio,
    slots: template.slots.map((timing, index) => ({ ...timing, ...slots[index], photo: photos[index] })) };
}
function contract(response, expected) {
  requireCondition(response && Object.entries(expected).every(([key, value]) => response[key] === value) &&
    digest.test(response.contractId) && digest.test(response.admissionPin) &&
    response.contract?.moduleId === expected.moduleId && response.contract?.operationId === expected.operationId &&
    response.contract?.executionPolicy === POLICY, 'slideshow_contract');
  return response.contractId;
}
function observation(value, expected, target) {
  requireCondition(value?.synthetic === false && value.modulePin === expected.modulePin && ref.test(value.evidenceRef) &&
    typeof value.snapshot?.revision === 'string' && value.snapshot.revision.length > 0 &&
    same(value.snapshot.target, target), 'slideshow_observation');
  return value.snapshot;
}
function checkTimeline(job, master) {
  const [, marker, width, height, duration, frame, , , layers] = JSON.parse(master.protected);
  // Sequence Layers can leave subframe offsets at fractional frame rates.
  const near = (time, frames) => Math.abs(time - frames * frame) < frame / 8;
  requireCondition(Math.min(Math.abs(frame - 1 / 30), Math.abs(frame - 1001 / 30000)) < 0.00001 &&
    master.frameDuration === frame && master.duration === duration && near(duration, template.frameCount) &&
    Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 &&
    marker === template.marker && Array.isArray(layers) && layers.length === 2, 'slideshow_master_timeline');
  const indices = job.slots.map(slot => layers.findIndex(layer => layer.sourceId === slot.compId));
  requireCondition(indices.every(index => index >= 0) && indices[0] !== indices[1], 'slideshow_master_source');
  for (const [i, timing] of template.slots.entries()) {
    const index = indices[i], layer = layers[index];
    requireCondition(layer.enabled === true && layer.stretch === 100 && near(layer.startTime, timing.startFrame) &&
      near(layer.inPoint, timing.startFrame) && near(layer.outPoint, timing.endFrame), 'slideshow_master_timing');
    if (index === 1) {
      requireCondition(layer.opacity === 100 && layer.keys.length === 0, 'slideshow_master_opacity');
      continue;
    }
    const values = i === 0 ? [100, 0] : [0, 100];
    requireCondition(layer.keys.length === 2 && layer.keys.every((key, n) => key[1] === values[n] &&
      key[2] === true && key[3] === true && (near(key[0], n === 0 ? 30 : 60) || n === 1 && near(key[0], 59))),
    'slideshow_master_transition');
  }
  return { width, height, frame, leaves: indices.map(index => layers[index].leaf) };
}
function inspect(job, evidence, planned) {
  const { project } = job;
  const masterTarget = { projectId: project.file, compId: project.masterCompId };
  const master = observation(evidence.master, RENDER, masterTarget);
  const geometry = checkTimeline(job, master);
  requireCondition(Array.isArray(evidence.slots) && evidence.slots.length === 2, 'slideshow_slot_evidence');
  const tasks = evidence.tasks ?? [];
  requireCondition(Array.isArray(tasks) && tasks.length <= 16 && tasks.every(task => task?.reset === false &&
    /^task-[a-f0-9-]{36}$/.test(task.taskId) && Array.isArray(task.commands)), 'slideshow_reconcile_original_task');
  const commands = tasks.flatMap(task => task.commands);
  requireCondition(commands.every(command => command.workflowId === planned.workflowId &&
    ['succeeded', 'rejected'].includes(command.state)), 'slideshow_reconcile_original_task');
  const photos = planned.slots.map((slot, i) => {
    const target = { sessionId: project.sessionId, projectId: project.file, compId: slot.compId, layerId: slot.layerId };
    const snapshot = observation(evidence.slots[i], PHOTO, target);
    const state = JSON.parse(snapshot.protected);
    const size = state.comp, leaf = geometry.leaves[i];
    requireCondition(state.enabled === true && state.stretch === 100 && !state.threeDLayer &&
      state.startTime === 0 && state.inPoint === 0 && Math.abs(state.outPoint - 60 * geometry.frame) < 0.0001 &&
      Array.isArray(size) && size[1] === geometry.width && size[2] === geometry.height &&
      state.layers.length === 1 && state.layers[0][0] === slot.layerId &&
      Array.isArray(leaf) && leaf.length === 1 && leaf[0].sourceId === snapshot.sourceId &&
      leaf[0].enabled && leaf[0].opacity === 100 && leaf[0].keys.length === 0, 'slideshow_slot_profile');
    const accepted = commands.filter(command => command.stepId === slot.id && command.state === 'succeeded');
    requireCondition(accepted.length <= 1, 'slideshow_duplicate_receipt');
    if (accepted.length) {
      const done = accepted[0];
      requireCondition(done.modulePin === PHOTO.modulePin && same(done.after, snapshot) &&
        snapshot.sourceId === slot.photo.sourceId && same(snapshot.source.file, slot.photo.file), 'slideshow_successful_slot_drift');
    } else {
      requireCondition(snapshot.sourceId === slot.placeholderSourceId, 'slideshow_unowned_slot_change');
    }
    return { target, done: accepted.length === 1 };
  });
  return { masterTarget, master, photos };
}
function prepareBuild(job, evidence) {
  const planned = compile(job);
  const { photos } = inspect(job, evidence, planned);
  const contractId = contract(evidence.photoContract, PHOTO);
  return { workflowId: planned.workflowId, recordContext: planned.recordContext,
    steps: planned.slots.map((slot, i) => ({
      stepId: slot.id, moduleId: PHOTO.moduleId, contractId, evidenceRef: evidence.slots[i].evidenceRef,
      input: { ...photos[i].target, newSourceId: slot.photo.sourceId }, ...(i ? { dependsOn: [planned.slots[i - 1].id] } : {})
    })) };
}
function prepareRender(job, evidence, mode) {
  const planned = compile(job);
  const { masterTarget, master, photos } = inspect(job, evidence, planned);
  requireCondition(photos.every(photo => photo.done), 'slideshow_photos_incomplete');
  requireCondition(mode === 'stage' ? master.queueIdle && !master.job :
    mode === 'finalize' && master.job?.status === 'DONE' && !master.job.rendering, 'slideshow_render_state');
  const contractId = contract(evidence.renderContract, RENDER);
  return { oneStep: true, recordContext: planned.recordContext, steps: [{
    stepId: 'render-' + mode, moduleId: RENDER.moduleId, contractId, evidenceRef: evidence.master.evidenceRef,
    input: { ...masterTarget, ...job.output, mode, activeLayerId: 0, controlledLayerIds: [],
      startFrame: 0, frameCount: planned.frameCount, ...(mode === 'finalize' ? { jobCompId: master.job.jobCompId } : {}) }
  }] };
}
module.exports = { compile, prepareBuild, prepareRender, PHOTO, RENDER };
