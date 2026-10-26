'use strict';
// Pure lifecycle decisions. Durable events are acknowledged by the broker before continuing.
function reject(code) { const error = new Error(code); error.code = code; throw error; }
function transition({ action, plan, events = [], completions = [] }) {
  if (action === 'validate') {
    if (!plan.steps.length || plan.steps.length > 16) reject('workflow_size');
    const seen = new Set();
    for (const step of plan.steps) {
      if (!step.stepId || seen.has(step.stepId)) reject('duplicate_step');
      if (step.dependsOn.some(id => !seen.has(id))) reject('workflow_not_topological');
      for (const binding of step.bindings || []) {
        if (!step.dependsOn.includes(binding.fromStep) || !['projectId', 'sessionId', 'compId', 'layerId'].includes(binding.to) || !['target.projectId', 'target.sessionId', 'target.compId', 'target.layerId'].includes(binding.from)) reject('unsupported_binding');
      }
      seen.add(step.stepId);
    }
    return { valid: true };
  }
  if (action !== 'resume') reject('engine_action');
  const success = {};
  for (const event of events) if (event.kind === 'succeeded') success[event.stepId] = event;
  for (const completed of completions) success[completed.stepId] = completed;
  const steps = [];
  for (const step of plan.steps) {
    const prior = success[step.stepId];
    if (prior && prior.inputDigest !== step.inputDigest) reject('successful_step_changed');
    steps.push({ stepId: step.stepId, action: prior ? 'reinspect_success' : 'execute', ...(prior ? { commandId: prior.commandId } : {}) });
  }
  return { steps };
}
module.exports = { transition };
