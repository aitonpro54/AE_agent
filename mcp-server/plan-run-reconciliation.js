"use strict";

// Pure evaluation of a server-owned record and independent typed reads. It
// never executes a setter, reconstructs a raw script, or grants replay rights.
const {isMutatingStep, propertyPathIdentityMatches, effectPropertyIdentityMatches, finiteTransformValue, transformValuesMatch} = require("./semantic-verification");
const {classifyMutationStep, originalExecutionError} = require("./run-outcome");
const {normalizeProject} = require("./proposal-state");
const SCHEMA = "ae-agent-plan-reconciliation.v1";
const RECORD_SCHEMA = "ae-agent-plan-run-record.v1";
const LAYER_SETTERS = new Set(["set_layer_transform", "replace_layer_source", "set_layer_time_range", "update_text_layer", "set_layer_metadata", "set_property_value", "set_effect_property"]);
const COMP_SETTERS = new Set(["set_comp_properties", "set_comp_work_area", "set_comp_current_time"]);
const own = (value, key) => Boolean(value && Object.prototype.hasOwnProperty.call(value, key));
const positive = value => Number.isSafeInteger(value) && value > 0 ? value : null;
const finite = value => typeof value === "number" && Number.isFinite(value);
const close = (a, b) => finite(a) && finite(b) && Math.abs(a - b) <= 0.001;
const payload = step => step && step.result && typeof step.result === "object" ? step.result : null;
function stableId(value, first, second) {
  if (!value || typeof value !== "object") return null;
  const fields = [first, second].filter(field => own(value, field)), ids = fields.map(field => positive(value[field]));
  return fields.length && ids.every(id => id !== null && id === ids[0]) ? ids[0] : null;
}
const identity = comp => stableId(comp, "itemId", "id");

function validRecord(record) {
  return !!(record && record.schema === RECORD_SCHEMA && typeof record.runId === "string" && record.runId && record.plan &&
    Array.isArray(record.plan.steps) && record.plan.steps.length <= 50 && record.run && Array.isArray(record.run.steps) &&
    record.plan.steps.every(step => step && typeof step.tool === "string" && step.args && typeof step.args === "object" && !Array.isArray(step.args)) &&
    record.run.steps.every(step => step && positive(step.index) && step.index <= record.plan.steps.length && record.plan.steps[step.index - 1].tool === step.tool) &&
    new Set(record.run.steps.map(step => step.index)).size === record.run.steps.length &&
    typeof (record.project && record.project.file) === "string" && normalizeProject(record.project.file));
}

function executionStep(record, index) {
  const rows = record.run.steps.filter(step => step && step.index === index);
  return rows.length === 1 ? rows[0] : null;
}

function boundStep(record, index) {
  const planned = record.plan.steps[index - 1] || {}, executed = executionStep(record, index);
  return {...planned, ...(executed || {}), index, args: executed && executed.args || planned.args || {}};
}

function targetsFor(step) {
  const args = step.args || {}, compItemId = stableId(args, "expectedCompItemId", "compItemId");
  if (!compItemId) return [];
  if (COMP_SETTERS.has(step.tool)) return [{compItemId}];
  const layerIds = Array.isArray(args.expectedLayerIds) ? args.expectedLayerIds : [stableId(args, "expectedLayerId", "layerId")];
  const indices = Array.isArray(args.layerIndices) ? args.layerIndices : Array.isArray(args.layerIndex) ? args.layerIndex : [args.layerIndex];
  if (!LAYER_SETTERS.has(step.tool) || !layerIds.length || layerIds.some(id => !positive(id)) || new Set(layerIds).size !== layerIds.length ||
    layerIds.length > 1 && layerIds.length !== indices.length) return [];
  return layerIds.map(layerId => ({compItemId, layerId}));
}

function reconciliationReadRequests(record) {
  if (!validRecord(record)) return [];
  const requests = [];
  for (let index = 1; index <= record.plan.steps.length; index++) {
    const step = boundStep(record, index), args = step.args || {};
    if (!isMutatingStep(step)) continue;
    for (const target of targetsFor(step)) {
      let tool = COMP_SETTERS.has(step.tool) ? "get_comp_details" : "get_layer_details";
      const readArgs = {...target};
      if (step.tool === "set_property_value") {
        tool = "get_property_value";
        readArgs.propertyPath = args.propertyPath;
        if (own(args, "time")) readArgs.time = args.time;
      } else if (step.tool === "set_effect_property") {
        tool = "get_effect_details";
        for (const field of ["effectIndex", "effectName", "effectMatchName"]) if (own(args, field)) readArgs[field] = args[field];
      }
      requests.push({stepIndex: index, tool, args: readArgs});
    }
  }
  return requests;
}

function targetReadMatches(read, target, tool, args) {
  if (!read || read.status !== "completed" || read.tool !== tool || read.mutating === true || read.mutatesProject === true) return false;
  const data = payload(read), readArgs = read.args || {};
  if (!data || identity(data.comp || data) !== target.compItemId || target.layerId && positive(data.layer && data.layer.id) !== target.layerId ||
    positive(readArgs.compItemId || readArgs.expectedCompItemId) !== target.compItemId || target.layerId && positive(readArgs.layerId || readArgs.expectedLayerId) !== target.layerId) return false;
  if (tool === "get_property_value") {
    if (JSON.stringify(readArgs.propertyPath) !== JSON.stringify(args.propertyPath)) return false;
    if (own(args, "time") ? !close(readArgs.time, args.time) : own(readArgs, "time")) return false;
  }
  return true;
}

function numericValue(value) {
  if (value && typeof value === "object" && !Array.isArray(value) && own(value, "value")) return value.truncated === true ? undefined : value.value;
  return value;
}
function valueMatches(expected, observed) {
  observed = numericValue(observed);
  if (Array.isArray(expected)) return Array.isArray(observed) && observed.length === expected.length && expected.every((value, index) => valueMatches(value, observed[index]));
  if (typeof expected === "number") return close(expected, observed);
  return expected === observed;
}
function propertiesIn(data) {
  const out = [], seen = new Set();
  function visit(value, depth) {
    if (!value || typeof value !== "object" || depth > 20 || seen.has(value) || seen.size >= 1000) return;
    seen.add(value);
    if (Array.isArray(value.propertyPath) && own(value, "value")) out.push(value);
    for (const key of ["property", "properties", "propertyTree", "children", "effects", "selectedProperties"]) {
      const child = value[key];
      if (Array.isArray(child)) child.slice(0, 200).forEach(row => visit(row, depth + 1));
      else visit(child, depth + 1);
    }
  }
  visit(data, 0);
  return out;
}

function requestedState(step, data) {
  const args = step.args || {}, layer = data.layer || {}, comp = data.comp || data;
  if (step.tool === "set_layer_transform") {
    const fields = ["position", "scale", "anchorPoint", "rotation", "opacity"].filter(field => own(args, field));
    const observed = data.transform || layer.transform || {};
    if (!fields.length || fields.some(field => finiteTransformValue(args[field], field) === null || finiteTransformValue(observed[field], field) === null)) return null;
    return fields.every(field => transformValuesMatch(args[field], observed[field], field));
  }
  if (step.tool === "replace_layer_source") {
    const sourceId = positive(args.expectedSourceItemId);
    const source = layer.source || layer.sourceItem;
    if (!sourceId || !source || !identity(source)) return null;
    return identity(source) === sourceId;
  }
  if (step.tool === "set_layer_time_range") {
    const fields = ["startTime", "inPoint", "outPoint", "duration"].filter(field => own(args, field));
    if (!fields.length || fields.some(field => !finite(args[field]))) return null;
    if (fields.some(field => field === "duration" ? !finite(layer.inPoint) || !finite(layer.outPoint) : !finite(layer[field]))) return null;
    return fields.every(field => close(args[field], field === "duration" ? layer.outPoint - layer.inPoint : layer[field]));
  }
  if (step.tool === "set_property_value" || step.tool === "set_effect_property") {
    if (!own(args, "value") || own(args, "time") && (!finite(args.time) || step.tool === "set_effect_property")) return null;
    const properties = propertiesIn(data).filter(property => step.tool === "set_effect_property" ? effectPropertyIdentityMatches(property, args) : propertyPathIdentityMatches(property.propertyPath, args.propertyPath));
    if (properties.length !== 1) return null;
    const receipt = step.mutationResult || step.result;
    if (receipt && typeof receipt === "object" && receipt.ok !== false && !step.mutationResultIsError) {
      const resultProperties = propertiesIn(receipt).filter(property => step.tool === "set_effect_property" ? effectPropertyIdentityMatches(property, args) : propertyPathIdentityMatches(property.propertyPath, args.propertyPath));
      if (resultProperties.length !== 1 || !propertyPathIdentityMatches(properties[0].propertyPath, resultProperties[0].propertyPath) ||
        !propertyPathIdentityMatches(resultProperties[0].propertyPath, properties[0].propertyPath)) return null;
    }
    return valueMatches(args.value, properties[0].value);
  }
  if (step.tool === "update_text_layer") {
    const text = layer.text || data.text, fields = ["text", "font", "fontSize", "fillColor", "justification"].filter(field => own(args, field));
    if (!text || !fields.length || Object.keys(args).some(field => ["applyFill", "applyStroke", "strokeColor", "strokeWidth", "tracking", "leading", "autoLeading"].includes(field))) return null;
    if (fields.some(field => !own(text, field))) return null;
    return fields.every(field => valueMatches(args[field], text[field]));
  }
  if (step.tool === "set_layer_metadata") {
    const fields = ["name", "comment", "label", "locked", "enabled", "solo", "shy", "audioEnabled", "guideLayer"].filter(field => own(args, field));
    if (!fields.length || fields.some(field => !own(layer, field))) return null;
    return fields.every(field => valueMatches(args[field], layer[field]));
  }
  if (step.tool === "set_comp_work_area") {
    if (!own(args, "start") || !finite(args.start) || !finite(args.duration) || !finite(comp.workAreaStart) || !finite(comp.workAreaDuration)) return null;
    return close(args.start, comp.workAreaStart) && close(args.duration, comp.workAreaDuration);
  }
  const compFields = step.tool === "set_comp_properties" ? ["width", "height", "pixelAspect", "duration", "frameRate", "bgColor", "displayStartTime", "displayStartFrame", "preserveNestedFrameRate", "motionBlur"] : ["time"];
  const fields = compFields.filter(field => own(args, field));
  if (!fields.length || fields.some(field => !own(comp, field))) return null;
  return fields.every(field => valueMatches(args[field], comp[field]));
}

function typedResultIdentityMatches(step, targets) {
  if (!own(step, "mutationResult") && !own(step, "result")) return true;
  const data = own(step, "mutationResult") ? step.mutationResult : step.result;
  if (!data || typeof data !== "object" || data.ok === false || step.mutationResultIsError) return true; // failure is not a successful identity receipt
  const comp = data.comp || data.after;
  if (!comp || identity(comp) !== targets[0].compItemId) return false;
  if (step.tool === "replace_layer_source" && identity(data.sourceItem) !== positive(step.args.expectedSourceItemId)) return false;
  const layers = data.layers || (data.layer ? [data.layer] : []);
  if (targets.some(target => target.layerId) && (layers.length !== targets.length || targets.some(target => target.layerId && layers.filter(layer => positive(layer && layer.id) === target.layerId).length !== 1))) return false;
  return true;
}

function reconcilePlanRun({record, freshReadSteps = [], commandStates = [], project} = {}) {
  const valid = validRecord(record), reads = Array.isArray(freshReadSteps) && freshReadSteps.length <= 100 ? freshReadSteps : [];
  const projectRows = reads.filter(read => read && read.tool === "get_project_info");
  const projectFiles = projectRows.map(read => { const info = payload(read); return read.status === "completed" && info && (info.file || info.project && info.project.file); });
  const freshFile = projectFiles[0];
  const sameProject = valid && projectRows.length >= 1 && projectRows.length <= 2 && projectFiles.every(file => typeof file === "string" && normalizeProject(file) === normalizeProject(record.project.file)) &&
    (!project || typeof project.file === "string" && normalizeProject(project.file) === normalizeProject(freshFile)) &&
    (!record.project.projectKey || project && project.projectKey === record.project.projectKey);
  const result = {schema: SCHEMA, runId: valid ? record.runId : null, originalError: record && record.run ? originalExecutionError(record.run) : null,
    status: "incomplete", sameProject: Boolean(sameProject), steps: [], replayAllowed: false};
  if (!valid) { result.reasonCode = "run_record_missing_or_invalid"; return result; }
  for (let index = 1; index <= record.plan.steps.length; index++) {
    const step = boundStep(record, index);
    if (!isMutatingStep(step)) continue;
    const row = {index, tool: step.tool, mutationStatus: "unknown", verificationStatus: "insufficient", reasonCode: sameProject ? "unsupported_or_unbound_target" : "project_identity_unverified"};
    result.steps.push(row);
    if (!sameProject) continue;
    const commands = (Array.isArray(step.commands) ? step.commands : []).map(command => {
      const fresh = Array.isArray(commandStates) && commandStates.filter(candidate => candidate && (candidate.id || candidate.commandId) === command.id);
      return fresh && fresh.length === 1 ? {...command, ...fresh[0], role: command.role} : command;
    });
    const disposition = classifyMutationStep({...step, commands});
    const hasUndeliveredProof = commands.filter(command => command.role === "mutation").length > 0 && commands.filter(command => command.role === "mutation").every(command => command.neverSubmitted === true && !command.leasedAt && !command.submittedAt) || step.phase === "before_delivery";
    if (disposition.status === "not_started" && hasUndeliveredProof || disposition.status === "failed" && disposition.reasonCode === "rejected_before_mutation") {
      row.mutationStatus = "not_applied"; row.verificationStatus = "not_required"; row.reasonCode = disposition.reasonCode; continue;
    }
    const targets = targetsFor(step), requests = reconciliationReadRequests({...record, plan: {steps: [step]}, run: {steps: [{...step, index: 1}]}});
    if (!targets.length || !typedResultIdentityMatches(step, targets) || !requests.length) continue;
    const states = targets.map((target, position) => {
      const request = requests[position], candidates = reads.filter(read => targetReadMatches(read, target, request.tool, step.args));
      return candidates.length === 1 ? requestedState(step, payload(candidates[0])) : null;
    });
    if (states.every(state => state === true)) {
      row.mutationStatus = "applied"; row.verificationStatus = "passed"; row.reasonCode = "desired_state_confirmed";
      row.scope = "current_postconditions_only";
    } else if (states.some(state => state === false)) {
      row.verificationStatus = "failed"; row.reasonCode = "postcondition_mismatch_partial_or_manual_change_possible";
    } else row.reasonCode = "fresh_target_evidence_missing_or_ambiguous";
  }
  result.status = sameProject && result.steps.every(step => step.mutationStatus !== "unknown") ? "reconciled" : "incomplete";
  return result;
}

module.exports = {SCHEMA, reconcilePlanRun, reconciliationReadRequests};
