"use strict";

// Pure checks on server-owned records/reads. Hashes bind facts; they cannot
// authenticate caller declarations. M4 must collect these reads itself.
const { sha256 } = require("./review-evidence");
const { normalizeProject } = require("./proposal-state");
const { isRecord, isPositiveInteger, isSafeId, isSha256, isIso8601, isAbsolutePath,
  normalizePath, stableJson, inspectPayloadSafety, normalizeBudgets } = require("./montage-contract");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const equal = (a, b) => stableJson(a) === stableJson(b);
const projectId = file => typeof file === "string" ? sha256(normalizeProject(file)) : null;
const completeTransform = t => isRecord(t) && ["anchorPoint", "position", "scale"].every(field =>
  Array.isArray(t[field]) && t[field].length === 2 && t[field].every(Number.isFinite)) &&
  Number.isFinite(t.rotation) && Number.isFinite(t.opacity);
function completeShape(expected, observed) {
  if (Array.isArray(expected)) return Array.isArray(observed) && expected.length === observed.length && expected.every((value, i) => completeShape(value, observed[i]));
  if (isRecord(expected)) return isRecord(observed) && Object.entries(expected).every(([key, value]) => Object.hasOwn(observed, key) && completeShape(value, observed[key]));
  return observed !== undefined && (expected === null || typeof expected === typeof observed);
}

function boundedInput(input) {
  const safety = inspectPayloadSafety(input, 4194304);
  if (Object.entries(safety).some(([key, value]) => key !== "totalBytes" && value)) return "unsafe_or_oversized_payload";
  if (!isRecord(input)) return "invalid_input_container";
  const normalized = normalizeBudgets(input.budgets === undefined ? {} : input.budgets);
  if (normalized.blockers.length) return "invalid_budgets";
  const b = normalized.budgets;
  function walk(value, key = "") {
    if (Array.isArray(value)) {
      const caps = {units: b.assignments, records: b.assignments, runEvidence: b.assignments,
        reconciliation: b.assignments, steps: b.maxSteps, freshReadSteps: 100, targets: b.assignments,
        projects: b.assignments, routes: b.assignments, materials: b.materials, assignments: b.assignments,
        scenes: b.scenes, changes: b.graphNodes, edges: b.dependencyEdges, frameCoverage: b.frameCoverage,
        frames: b.frameCoverage, frameRequirements: b.frameCoverage, reviewPackets: b.frameCoverage,
        route: b.routeDepth, dependsOn: b.assignments};
      if (value.length > (caps[key] || b.graphNodes)) return false;
      return value.every(row => walk(row));
    }
    return !isRecord(value) || Object.entries(value).every(([field, child]) => walk(child, field));
  }
  return walk(input) ? null : "collection_budget_exceeded";
}

function recordBinding(record, unit, project) {
  if (boundedInput({record, unit, project})) return "invalid_unit_or_project_binding";
  if (!isRecord(unit) || !isRecord(unit.plan) || !Array.isArray(unit.plan.steps) ||
      !isRecord(project) || !isAbsolutePath(project.projectFile)) return "invalid_unit_or_project_binding";
  if (!isRecord(record) || record.schema !== "ae-agent-plan-run-record.v1") return "invalid_record_schema";
  if (!UUID.test(record.runId || "") || record.run?.id !== record.runId) return "invalid_run_id";
  if (!isRecord(record.plan) || !isRecord(record.run) || !Array.isArray(record.run.steps)) return "incomplete_run_record";
  if (normalizeProject(record.project?.file) !== normalizeProject(project?.projectFile)) return "project_binding_mismatch";
  const mp = record.plan.montagePipeline, expected = unit.plan?.montagePipeline;
  if (!mp || !expected || mp.unitId !== unit.unitId) return "unit_id_binding_mismatch";
  if (mp.manifestRevision !== expected.manifestRevision) return "manifest_revision_mismatch";
  if (mp.materialRevision !== expected.materialRevision) return "material_revision_mismatch";
  if (mp.sha256 !== expected.sha256) return "material_hash_mismatch";
  if (!equal(record.plan, unit.plan) || !equal(unit.expectedReadBack, unit.plan.expectedReadBack)) return "plan_binding_mismatch";
  const provenance = record.run.provenance;
  if (!isRecord(provenance) || provenance.schema !== "ae-agent-run-provenance.v1" ||
      typeof provenance.actionId !== "string" || !provenance.actionId.trim() ||
      !isPositiveInteger(provenance.proposalRevision) || !isSha256(provenance.planSha256) ||
      provenance.projectId !== projectId(project.projectFile) ||
      !(typeof provenance.projectRevision === "string" && provenance.projectRevision ||
        provenance.projectRevision === null && provenance.projectRevisionReason === "in_memory_revision_not_observed")) return "incomplete_run_provenance";
  if (provenance.planSha256 !== sha256(unit.plan)) return "plan_hash_mismatch";
  const indices = new Set();
  for (const step of record.run.steps) {
    if (!isRecord(step) || !isPositiveInteger(step.index) || indices.has(step.index)) return "invalid_executed_step_binding";
    if (step.commands !== undefined && (!Array.isArray(step.commands) || step.commands.some(cmd => !isRecord(cmd)))) return "invalid_command_evidence";
    indices.add(step.index);
    const planned = unit.plan.steps[step.index - 1];
    if (!planned || planned.tool !== step.tool || !equal(planned.args, step.args)) return "executed_args_binding_mismatch";
  }
  return null;
}

function observationHash(observation) {
  const safety = inspectPayloadSafety(observation, 4194304);
  if (!isRecord(observation) || safety.invalid || safety.cycleDetected || safety.depthExceeded || safety.exceeded) return null;
  const { evidence, ...facts } = observation;
  return sha256(facts);
}

function freshObservation(observation, record, unit, project) {
  if (boundedInput({observation, record, unit, project})) return false;
  if (!isRecord(observation) || !isRecord(observation.evidence) || !isRecord(record?.run?.provenance) ||
      !isRecord(unit) || !isRecord(project)) return false;
  const e = observation.evidence, p = record.run.provenance;
  return e.schema === "ae-agent-montage-post-run-read.v1" && UUID.test(e.readId || "") &&
    e.phase === "after_run" && e.runId === record.runId && e.actionId === p.actionId &&
    e.proposalRevision === p.proposalRevision && e.projectId === projectId(project.projectFile) &&
    e.planSha256 === p.planSha256 && e.unitContentHash === unit.contentHash &&
    isIso8601(record.run.finishedAt) && isIso8601(e.observedAt) &&
    Date.parse(e.observedAt) >= Date.parse(record.run.finishedAt) &&
    isSha256(e.stateSha256) && e.stateSha256 === observationHash(observation);
}

// The server adapter supplies the actual read ID/time after native/material
// readers complete. This constructor binds facts, without creating authority.
function bindPostRunObservation(input = {}) {
  if (boundedInput(input)) return {ok: false, code: "invalid_post_run_read_input"};
  const {record, unit, project, observation, readId, observedAt} = input;
  if (recordBinding(record, unit, project) || !isRecord(observation) || !UUID.test(readId || "") || !isIso8601(observedAt)) {
    return {ok: false, code: "invalid_post_run_read_binding"};
  }
  const p = record.run.provenance;
  const facts = {...observation, evidence: {schema: "ae-agent-montage-post-run-read.v1", readId,
    phase: "after_run", runId: record.runId, actionId: p.actionId, proposalRevision: p.proposalRevision,
    projectId: p.projectId, planSha256: p.planSha256, unitContentHash: unit.contentHash, observedAt,
    stateSha256: observationHash(observation)}};
  return freshObservation(facts, record, unit, project) ? {ok: true, observation: facts} : {ok: false, code: "read_not_after_finished_run"};
}

function withoutIndices(value) {
  if (Array.isArray(value)) return value.map(withoutIndices);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !["index", "itemIndex", "layerIndex"].includes(key))
    .map(([key, child]) => [key, withoutIndices(child)]));
}

function technicalFacts(input = {}) {
  const missing = [], drift = [], reads = [];
  if (boundedInput(input)) return {missing: ["invalid_read_back_container"], drift, reads, target: null};
  const {readBack, record, unit, project} = input;
  if (!isRecord(readBack) || !isRecord(record?.run?.provenance) || !isRecord(unit) || !isRecord(project)) {
    return {missing: ["invalid_read_back_container"], drift, reads, target: null};
  }
  const fresh = observation => freshObservation(observation, record, unit, project);
  const select = (rows, match, name) => {
    const matches = (Array.isArray(rows) ? rows : []).filter(row => isRecord(row) && match(row) && row.evidence?.runId === record.runId);
    if (matches.length !== 1 || !fresh(matches[0])) { missing.push(`${name}_missing_stale_or_ambiguous`); return null; }
    return matches[0];
  };
  const pr = select(readBack.projects, row => row.unitId === unit.unitId, "project");
  if (pr && normalizeProject(pr.file) !== normalizeProject(project.projectFile)) drift.push("project_drift_detected");
  if (pr) reads.push({tool: "get_project_info", status: "completed", result: {file: pr.file}});
  const exp = unit.expectedReadBack;
  const target = select(readBack.targets, row => row.comp?.itemId === exp?.compItemId && row.layer?.id === exp?.layerId, "target");
  const bindings = unit.verificationBindings;
  if (!isRecord(bindings?.material) || !Array.isArray(bindings?.route) || !isRecord(bindings?.target?.footprint)) {
    missing.push("verification_bindings_missing"); return {missing, drift, reads, target};
  }
  const mat = bindings?.material;
  const material = select(readBack.materials, row => row.materialId === mat?.materialId && row.sourceItemId === mat?.sourceItemId, "material");
  if (material) {
    if (!isAbsolutePath(material.path) || !isSha256(material.sha256) || !isPositiveInteger(material.byteLength) ||
        material.verified !== true || !isRecord(material.metadata) ||
        !["width", "height", "pixelAspect", "duration", "fps"].every(field => typeof material.metadata[field] === "number" && material.metadata[field] > 0)) missing.push("material_facts_incomplete");
    else if (normalizePath(material.path) !== normalizePath(mat.path) || material.sha256 !== mat.sha256 ||
        material.byteLength !== mat.byteLength || !equal(material.metadata, mat.metadata)) drift.push("material_drift_detected");
  }
  const route = select(readBack.routes, row => row.unitId === unit.unitId, "route");
  if (route) {
    if (!Array.isArray(route.edges) || route.edges.length !== bindings?.route?.length ||
        bindings.route.some(edge => !completeTransform(edge?.transform)) ||
        !completeShape(bindings.route, route.edges) ||
        route.edges.some(edge => !isRecord(edge) || !isRecord(edge.geometry) || !isRecord(edge.footprint) ||
          !completeTransform(edge.transform) ||
          !["parentCompItemId", "childCompItemId", "layerId", "layerIndex"].every(field => isPositiveInteger(edge[field])) ||
          !["startTime", "inPoint", "outPoint", "stretch"].every(field => typeof edge[field] === "number") ||
          typeof edge.timeRemapEnabled !== "boolean")) missing.push("route_facts_incomplete");
    else if (!equal(withoutIndices(route.edges), withoutIndices(bindings.route))) drift.push("route_drift_detected");
  }
  if (target) {
    if (!isRecord(target.footprint) || !isPositiveInteger(target.comp.itemIndex) || !isPositiveInteger(target.layer.index) ||
        !isRecord(target.geometry) || !isRecord(target.transform) ||
        !completeShape(exp.geometry, target.geometry) || !completeShape(exp.transform, target.transform) ||
        !completeShape(bindings.target.footprint, target.footprint) ||
        !["comp", "source", "layer"].every(field => isRecord(target.geometry[field])) ||
        !["name", "frameRate"].every(field => Object.hasOwn(target.comp, field)) ||
        !["name", "startTime", "inPoint", "outPoint", "stretch", "source"].every(field => Object.hasOwn(target.layer, field)) ||
        !isRecord(target.layer.source) || !isPositiveInteger(target.layer.source.itemId) ||
        !["name", "file", "footageMissing"].every(field => Object.hasOwn(target.layer.source, field)) ||
        typeof target.layer.source.footageMissing !== "boolean" ||
        Object.keys(exp.transform || {}).some(field => !Object.hasOwn(target.transform, field)) ||
        !["enabled", "locked", "threeDLayer", "timeRemapEnabled"].every(field => typeof target.layer[field] === "boolean")) missing.push("target_facts_incomplete");
    else if (bindings?.target?.footprint && (!equal(target.footprint, bindings.target.footprint) || !target.layer.enabled || target.layer.locked)) drift.push("target_footprint_drift_detected");
    if (!missing.includes("target_facts_incomplete")) reads.push({tool: "get_layer_details", status: "completed", args: {compItemId: exp.compItemId, layerId: exp.layerId},
      result: {comp: target.comp, layer: target.layer, transform: target.transform, geometry: target.geometry}});
  }
  // Narrow reads are usable only with the same after-run receipt contract.
  for (const read of Array.isArray(readBack.freshReadSteps) ? readBack.freshReadSteps : []) if (isRecord(read) && fresh(read)) reads.push(read);
  return {missing, drift, reads, target: missing.includes("target_facts_incomplete") ? null : target};
}

function validUnitGraph(units) {
  if (!Array.isArray(units) || !units.length) return false;
  const ids = new Set(units.map(u => u?.unitId));
  if (ids.size !== units.length) return false;
  const visiting = new Set(), done = new Set(), byId = new Map(units.map(u => [u?.unitId, u]));
  function visit(id) {
    if (visiting.has(id)) return false;
    if (done.has(id)) return true;
    const u = byId.get(id);
    if (!isSafeId(id) || !isRecord(u) || !Array.isArray(u.dependsOn) || new Set(u.dependsOn).size !== u.dependsOn.length ||
        !Array.isArray(u.plan?.steps) || !u.plan.steps.length || !isSha256(u.contentHash) || !isRecord(u.expectedReadBack) ||
        u.plan.steps.some(s => !isRecord(s) || typeof s.tool !== "string" || !isRecord(s.args))) return false;
    visiting.add(id);
    for (const dep of u.dependsOn) if (!ids.has(dep) || !visit(dep)) return false;
    visiting.delete(id); done.add(id); return true;
  }
  return units.every(u => visit(u.unitId));
}

module.exports = {UUID, sha256, equal, projectId, boundedInput, recordBinding, observationHash,
  freshObservation, bindPostRunObservation, technicalFacts, withoutIndices, validUnitGraph, completeTransform};
