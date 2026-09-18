"use strict";

// Исправление — новый proposal. Повтор создания/import/JSX и неопределённого результата запрещён.
const MAX_ATTEMPTS = 2;
const SETTERS = new Set(["set_comp_properties", "set_layer_metadata", "update_text_layer", "set_layer_time_range"]);
const READS = new Set(["get_project_info", "get_comp_details", "get_layer_details"]);
const {normalizeProject} = require("./proposal-state");
function target(args, tool) {
  if (!args || (!args.compItemIndex && !args.compName)) return null;
  if (tool !== "set_comp_properties") {
    const indices = args.layerIndices || (args.layerIndex ? [args.layerIndex] : []);
    if (!Array.isArray(indices) || !indices.length || indices.some((index) => !Number.isInteger(index) || index < 1)) return null;
  }
  return JSON.stringify([args.compItemIndex || null, args.compName || null, args.expectedCompName || null,
    args.layerIndex || null, args.layerIndices || null, args.expectedLayerNames || null]);
}
function directive(record, run) {
  const steps = record && record.payload && record.payload.plan.steps || [];
  const eligible = !!record && run && !run.ok && !/timeout|timed.?out|unknown|scope|revoked|expired|project|superseded/.test(run.errorCode || "")
    && steps.some((step) => SETTERS.has(step.tool))
    && steps.every((step) => READS.has(step.tool) || SETTERS.has(step.tool) && target(step.args, step.tool));
  const attempt = Number(record && record.repairAttempt || 0);
  return {eligible: eligible && attempt < MAX_ATTEMPTS, rootActionId: record && (record.rootActionId || record.actionId),
    parentActionId: record && record.actionId, attempt, maxAttempts: MAX_ATTEMPTS,
    disposition: eligible && attempt < MAX_ATTEMPTS ? "inspect_then_propose_corrective_setters" : "inspect_and_stop",
    reason: attempt >= MAX_ATTEMPTS ? "repair_budget_exhausted" : eligible ? "bounded_setter_correction" : "unsafe_to_repeat"};
}
function validateRepair(parent, plan) {
  const fail = (code, message) => { throw Object.assign(new Error(message), {code}); };
  if (!parent || parent.executionState !== "failed" || !parent.repairDirective || !parent.repairDirective.eligible) {
    fail("repair_not_eligible", "Этот результат нельзя автоматически повторять. Нужна инспекция без изменений.");
  }
  if (parent.repairChildActionId) fail("repair_already_proposed", "Для этого отказа уже создан корректирующий proposal.");
  const project = normalizeProject(parent.payload.plan.targetProject && parent.payload.plan.targetProject.file);
  if (!project || normalizeProject(plan && plan.targetProject && plan.targetProject.file) !== project) {
    fail("repair_project_changed", "Исправление должно явно указывать исходный целевой проект.");
  }
  const previous = parent.payload.plan.steps;
  const allowed = new Set(previous.filter((s) => SETTERS.has(s.tool) && target(s.args, s.tool)).map((s) => s.tool + ":" + target(s.args, s.tool)));
  const steps = plan && plan.steps || [];
  if (!steps.length || steps.length > 20 || !steps.every((s) => READS.has(s.tool) || SETTERS.has(s.tool) && target(s.args, s.tool) && allowed.has(s.tool + ":" + target(s.args, s.tool)))) {
    fail("repair_scope_changed", "Исправление разрешено только теми же setters для тех же точных целей.");
  }
  for (let index = 0; index < steps.length; index++) {
    const step = steps[index];
    if (!SETTERS.has(step.tool)) continue;
    const prior = previous.filter((s) => s.tool === step.tool && target(s.args, s.tool) === target(step.args, step.tool));
    const omittedExecutionFields = new Set(["idempotencyKey", "idempotencyScope", "autoCheckpoint", "checkpointLabel", "verifyAfter"]);
    if (!prior.some((s) => Object.keys(step.args).every((key) => omittedExecutionFields.has(key) || Object.prototype.hasOwnProperty.call(s.args, key)))) {
      fail("repair_fields_expanded", "Исправление не может добавлять новые изменяемые поля к исходному setter.");
    }
    const layer = step.args.layerIndex || step.args.layerIndices;
    const readTool = layer ? "get_layer_details" : "get_comp_details";
    const targets = layer ? [].concat(layer) : [null];
    const inspected = targets.every((layerIndex) => {
      const matches = (s) => s.tool === readTool && s.args &&
        (s.args.compItemIndex || s.args.compName) === (step.args.compItemIndex || step.args.compName) &&
        (layerIndex === null || s.args.layerIndex === layerIndex);
      return steps.slice(0, index).some(matches) && steps.slice(index + 1).some(matches);
    });
    if (!inspected) fail("repair_inspection_required", "Нужен fresh read-back каждой цели до и после корректировки.");
  }
  return {rootActionId: parent.rootActionId || parent.actionId, repairAttempt: (parent.repairAttempt || 0) + 1, parentActionId: parent.actionId};
}
module.exports = {MAX_ATTEMPTS, directive, validateRepair};
