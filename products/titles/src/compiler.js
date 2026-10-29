'use strict';
const crypto = require('node:crypto');
const jobSchema = require('../job.schema.json');
const publicContract = require('../compat/titles-current-target.contract.json');
const MAX_BYTES = 64 * 1024;
const MODULE = 'titles-current-target';
const OPERATION = 'set-current-text';
const POLICY = 'current-matching-target-after-local-confirmation-v1';
// Public module artifact identity, not installer/package/machine identity.
const MODULE_PIN = '6b89ae03e01e195da5a33a75391ee60cfb7f63a9dd77f0c8116f06b468098d46';
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
  if (response.moduleId !== MODULE || response.operationId !== OPERATION || response.modulePin !== MODULE_PIN ||
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
  return { taskId: identity, workflowId: identity, oneStep: true, recordContext: context(job),
    steps: [{ stepId: 'set-title', moduleId: MODULE, contractId: response.contractId,
      evidenceRef: inspection.evidenceRef, input: { ...job.target, text: job.text } }] };
}
module.exports = { compile, prepareBuild, MAX_BYTES };
