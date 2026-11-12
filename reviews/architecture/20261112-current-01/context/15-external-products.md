# 15-external-products

Выбранные точные исходники; вне обозначенных диапазонов контекст не включён.

## `products/titles/src/compiler.js:1–94`
Полный файл SHA256 (hex groups, concatenate) `765c625b:4dca5c31:29ded67b:5c6b99b3:64279dea:e3378823:a575b91d:338d99ba`; Git blob `dbb45bfa:1de2edd5:c352c7a4:b94c5b09:f2650337`. Выдержка: строки 1–94, 5645 bytes.

```javascript
'use strict';
const crypto = require('node:crypto');
const jobSchema = require('../job.schema.json');
const publicContract = require('../compat/titles-current-target.contract.json');
const MAX_BYTES = 64 * 1024;
const MODULE = 'titles-current-target';
const OPERATION = 'set-current-text';
const POLICY = 'current-matching-target-after-local-confirmation-v1';
// Public module artifact identity, not installer/package/machine identity.
const MODULE_PINS = new Set([
  '189c58bf5335a8ce7c889159808b7791a39dc0ad3f0641cd522342bcdb8c6e79',
  '704e67f0793eb9ebcf7fafc41e0d777ed6d3cd4d801d9f847da08eefb892e284'
]);
const CONTRACT_HASH = '6226f911063f94f471bff23e9ebb60f1ee49323c2f25d54e6a4bdabf95bbe55b';
function fail(code) { throw Object.assign(new Error(code), { code }); }
function canonical(value, depth = 0, seen = new Set()) {
  if (depth > 12) fail('json_depth');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (!value || typeof value !== 'object' || seen.has(value)) fail('json_value');
  if (Object.getOwnPropertySymbols(value).length) fail('json_value');
  seen.add(value);
  let result;
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length) fail('json_value');
    result = '[' + Array.from(value, v => canonical(v, depth + 1, seen)).join(',') + ']';
  } else {
    if (Object.getPrototypeOf(value) !== Object.prototype) fail('json_value');
    result = '{' + Object.keys(value).sort().map(k => {
      const d = Object.getOwnPropertyDescriptor(value, k);
      if (!d || !Object.hasOwn(d, 'value')) fail('json_value');
      return JSON.stringify(k) + ':' + canonical(d.value, depth + 1, seen);
    }).join(',') + '}';
  }
  seen.delete(value);
  if (Buffer.byteLength(result) > MAX_BYTES) fail('json_budget');
  return result;
}
function boundedCopy(value) {
  const data = canonical(value);
  if (Buffer.byteLength(data) > MAX_BYTES) fail('json_budget');
  return JSON.parse(data);
}
function hash(value) { return crypto.createHash('sha256').update(canonical(value)).digest('hex'); }
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k))) fail('object_shape');
}
// Only the subset used by the bundled public profile and job schema is needed.
function check(schema, value) {
  if (Object.hasOwn(schema, 'const') && value !== schema.const) fail('schema_value');
  if (schema.type === 'object') {
    exact(value, schema.required);
    for (const [key, child] of Object.entries(schema.properties)) check(child, value[key]);
  } else if (schema.type === 'string') {
    // UTF-16 units are deliberately bounded as in the current Core schema checker.
    if (typeof value !== 'string' || value.length < schema.minLength || value.length > schema.maxLength ||
        (schema.pattern && !new RegExp(schema.pattern, 'u').test(value))) fail('schema_string');
  } else if (schema.type === 'integer') {
    if (!Number.isSafeInteger(value) || value < schema.minimum || value > schema.maximum) fail('schema_integer');
  }
}
function validJob(value) { const job = boundedCopy(value); check(jobSchema, job); return job; }
function context(job) {
  return { purpose: 'user_work', lifetime: 'work_context', contextId: job.jobId,
    project: { file: job.target.projectId }, resources: [
      { kind: 'project', identity: job.target.projectId }, { kind: 'job', identity: job.jobId }
    ] };
}
function compile(value) {
  const job = validJob(value);
  return { product: { id: 'titles', version: '0.1.0' }, jobId: job.jobId,
    intention: { moduleId: MODULE, operationId: OPERATION, executionPolicy: POLICY, target: job.target, text: job.text },
    recordContext: context(job) };
}
function prepareBuild(value, contractResponse, inspectionResponse) {
  const job = validJob(value), response = boundedCopy(contractResponse), inspection = boundedCopy(inspectionResponse);
  exact(response, ['contractId', 'moduleId', 'operationId', 'modulePin', 'admissionPin', 'contract']);
  if (response.moduleId !== MODULE || response.operationId !== OPERATION || !MODULE_PINS.has(response.modulePin) ||
      hash(response.contract) !== CONTRACT_HASH || hash(publicContract) !== CONTRACT_HASH) fail('incompatible_contract');
  for (const key of ['contractId', 'admissionPin']) if (typeof response[key] !== 'string' || !/^[a-f0-9]{64}$/.test(response[key])) fail('contract_reference');
  exact(inspection, ['evidenceRef', 'snapshot', 'modulePin', 'synthetic']);
  if (inspection.synthetic !== false) fail('synthetic_inspection');
  if (inspection.modulePin !== response.modulePin) fail('inspection_module_pin');
  if (typeof inspection.evidenceRef !== 'string' || !/^evidence-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(inspection.evidenceRef)) fail('evidence_reference');
  check(publicContract.snapshotSchema, inspection.snapshot);
  if (canonical(inspection.snapshot.target) !== canonical(job.target)) fail('inspection_target');
  if (/[\r\n\u0085\u2028\u2029]/u.test(inspection.snapshot.text)) fail('unsupported_observed_text');
  const identity = 'titles-' + hash(job);
  return { workflowId: identity, oneStep: true, recordContext: context(job),
    steps: [{ stepId: 'set-title', moduleId: MODULE, contractId: response.contractId,
      evidenceRef: inspection.evidenceRef, input: { ...job.target, text: job.text } }] };
}
module.exports = { compile, prepareBuild, MAX_BYTES, boundedCopy, hash, exact, fail };
```

## `products/slideshow/compiler.js:150–186`
Полный файл SHA256 (hex groups, concatenate) `fc854c08:dd826fab:c0d0bd62:36ac73c0:b4140ab4:9d7981fb:1c74696f:ec3cb22e`; Git blob `a661ee33:4f99d6c3:caee4041:13b65b93:7ff1587b`. Выдержка: строки 150–186, 2319 bytes.

```javascript
function prepareBuild(job, evidence) {
  const planned = compile(job);
  const module = photoModule(evidence.photoContract);
  const contractId = contract(evidence.photoContract, module);
  const render = renderModule(evidence.renderContract);
  if (render === START_RENDER) contract(evidence.renderContract, render);
  const { photos } = inspect(job, evidence, planned, module, render);
  const steps = planned.slots.map((slot, i) => ({
    stepId: slot.id, moduleId: module.moduleId, contractId, evidenceRef: evidence.slots[i].evidenceRef,
    input: { ...photos[i].target, newSourceId: slot.photo.sourceId }
  }));
  const base = { workflowId: planned.workflowId, recordContext: planned.recordContext };
  if (module === OPERATOR_PHOTO) {
    const next = photos.findIndex(photo => !photo.done);
    requireCondition(next >= 0, 'slideshow_photos_complete');
    return { ...base, oneStep: true, steps: [steps[next]] };
  }
  return { ...base, steps: [steps[0], { ...steps[1], dependsOn: [steps[0].stepId] }] };
}
function prepareRender(job, evidence, mode) {
  const planned = compile(job);
  const module = photoModule(evidence.photoContract);
  contract(evidence.photoContract, module);
  const render = renderModule(evidence.renderContract);
  const contractId = contract(evidence.renderContract, render);
  const { masterTarget, master, photos } = inspect(job, evidence, planned, module, render);
  requireCondition(photos.every(photo => photo.done), 'slideshow_photos_incomplete');
  requireCondition(mode === 'stage' ? master.queueIdle && !master.job :
    mode === 'start' ? render === START_RENDER && master.job?.status === 'QUEUED' && !master.job.rendering && master.job.bytes === 0 :
    mode === 'finalize' && master.job?.status === 'DONE' && !master.job.rendering, 'slideshow_render_state');
  return { oneStep: true, recordContext: planned.recordContext, steps: [{
    stepId: 'render-' + mode, moduleId: render.moduleId, contractId, evidenceRef: evidence.master.evidenceRef,
    input: { ...masterTarget, ...job.output, mode, activeLayerId: 0, controlledLayerIds: [],
      startFrame: 0, frameCount: planned.frameCount, ...(mode !== 'stage' ? { jobCompId: master.job.jobCompId } : {}) }
  }] };
}
module.exports = { compile, prepareBuild, prepareRender, PHOTO, OPERATOR_PHOTO, RENDER, START_RENDER };
```
