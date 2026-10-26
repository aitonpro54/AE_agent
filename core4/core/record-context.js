'use strict';
const { check } = require('../protocol/schema');
const { fail } = require('../protocol/json');
const string = { type: 'string', minLength: 1, maxLength: 8192 };
function recordContext(value, { taskId, projectId }) {
  const context = value || { purpose: 'user_work', lifetime: 'work_context', contextId: taskId, project: { file: projectId }, resources: [{ kind: 'project', identity: projectId }] };
  check({ type: 'object', additionalProperties: false, required: ['purpose', 'lifetime', 'contextId', 'project', 'resources'], properties: {
    purpose: { ...string, enum: ['user_work', 'development', 'technical_check'] }, lifetime: { ...string, enum: ['work_context', 'product_change', 'ephemeral_check'] }, contextId: string,
    project: { type: 'object', additionalProperties: false, required: ['file'], properties: { file: string } },
    resources: { type: 'array', maxItems: 32, items: { type: 'object', additionalProperties: false, required: ['kind', 'identity'], properties: { kind: { ...string, enum: ['project', 'output', 'job', 'native_process'] }, identity: string } } }
  } }, context);
  if ({ user_work: 'work_context', development: 'product_change', technical_check: 'ephemeral_check' }[context.purpose] !== context.lifetime) fail('record_context_lifetime');
  return JSON.parse(JSON.stringify(context));
}
module.exports = { recordContext };
