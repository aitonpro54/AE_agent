"use strict";

// Pure readiness for the bounded V1 subset. It neither executes a plan nor proves freshness.
const {
  MANIFEST_SCHEMA, MATERIALS_SCHEMA, OBSERVATIONS_SCHEMA, DEFAULT_HARD_CEILINGS,
  ALLOWED_GROUP_PROVENANCES, EPSILON, isRecord, isPositiveInteger: id,
  isNonNegativeInteger: uint, isFiniteNumber: finite, isSafeId, isIso8601, isSha256,
  isAbsolutePath, isTimeAligned, deepClone, sortedSet, stableJson, normalizeBudgets,
  inspectPayloadSafety, checkExactKeys, addBlocker
} = require("./montage-contract");
const { computeRequiredFrameCoverage, verifyFrameCoverage } = require("./montage-coverage");
const { validateObservations, bindTargetObservation, keyOf } = require("./montage-observations");
const { buildPlaceholderPlan } = require("./placeholder-plan-builder");
const { checkPlaceholderAssignments, mediaKeyForSource } = require("./placeholder-usage");
const list = value => Array.isArray(value) ? value : [];
const close = (a, b) => finite(a) && finite(b) && Math.abs(a - b) <= EPSILON;
const sameSet = (a, b) => Array.isArray(a) && Array.isArray(b) && stableJson(sortedSet(a)) === stableJson(sortedSet(b));
const assignmentRange = (assignment, scene) => assignment.rootRange === undefined ? scene?.rootRange : assignment.rootRange;

function payloadSafety(input, blockers) {
  if (!isRecord(input)) { addBlocker(blockers, "invalid_input_container", "input"); return DEFAULT_HARD_CEILINGS; }
  // Inspect the envelope before reading even budgets; no accessors/cycles/non-JSON objects.
  const envelope = inspectPayloadSafety(input, DEFAULT_HARD_CEILINGS.snapshotBytes +
    DEFAULT_HARD_CEILINGS.manifestBytes + DEFAULT_HARD_CEILINGS.materialsBytes + 4096);
  if (envelope.invalid || envelope.cycleDetected || envelope.depthExceeded || envelope.exceeded) {
    addBlocker(blockers, "unsafe_input_payload", "input"); return DEFAULT_HARD_CEILINGS;
  }
  const { budgets, blockers: budgetBlockers } = normalizeBudgets(input.budgets);
  blockers.push(...budgetBlockers);
  checkExactKeys(input, ["manifest", "materials", "observations", "budgets"], "input", blockers, "unknown_input_field");
  for (const [name, budget] of [["manifest", "manifestBytes"], ["materials", "materialsBytes"], ["observations", "snapshotBytes"]]) {
    if (!isRecord(input[name])) { addBlocker(blockers, `missing_${name}`, name); continue; }
    const inspected = inspectPayloadSafety(input[name], budgets[budget]);
    if (inspected.exceeded) addBlocker(blockers, `${name}_payload_exceeds_budget`, name, { limit: budgets[budget], bytes: inspected.totalBytes });
  }
  // Array bounds before semantic traversal. Do not truncate oversized inputs.
  const m = input.manifest;
  if (isRecord(m)) {
    for (const name of ["scenes", "assignments", "groups", "frameCoverage"]) if (Array.isArray(m[name]) && m[name].length > budgets[name]) {
      addBlocker(blockers, `${name}_count_exceeds_budget`, `manifest.${name}`);
    }
    if (list(m.dependencies?.edges).length > budgets.dependencyEdges) addBlocker(blockers, "dependency_edges_exceeds_budget", "manifest.dependencies.edges");
    for (const [i, a] of list(m.assignments).entries()) {
      if (list(a?.shots).length > budgets.shotsPerAssignment) addBlocker(blockers, "shots_per_assignment_exceeds_budget", `manifest.assignments[${i}].shots`);
      if (list(a?.routeLayerIds).length > budgets.routeDepth) addBlocker(blockers, "route_depth_exceeds_budget", `manifest.assignments[${i}].routeLayerIds`);
      if (list(a?.crop?.samples).length > 24) addBlocker(blockers, "crop_samples_exceeds_budget", `manifest.assignments[${i}].crop.samples`);
    }
  }
  if (list(input.materials?.materials).length > Math.min(budgets.materials, budgets.materialReadRequests)) addBlocker(blockers, "materials_count_exceeds_budget", "materials.materials");
  if (list(input.observations?.targets).length > budgets.assignments || list(input.observations?.materials).length > budgets.materials) addBlocker(blockers, "observations_count_exceeds_budget", "observations");
  return budgets;
}

function collection(records, path, identity, blockers) {
  const map = new Map();
  if (!Array.isArray(records) || !records.length) { addBlocker(blockers, `invalid_${identity}_collection`, path); return map; }
  records.forEach((record, i) => {
    if (!isRecord(record) || !isSafeId(record[identity])) addBlocker(blockers, `invalid_${identity.replace(/Id$/, "_id")}`, `${path}[${i}]`);
    else if (map.has(record[identity])) addBlocker(blockers, `duplicate_${identity.replace(/Id$/, "_id")}`, `${path}[${i}].${identity}`);
    else map.set(record[identity], record);
  });
  return map;
}
function validRange(range, fps, path, blockers, upper = Infinity) {
  const valid = Array.isArray(range) && range.length === 2 && range.every(finite) &&
    range[0] >= 0 && range[1] > range[0] && range[1] <= upper && range.every(t => isTimeAligned(t, fps));
  if (!valid) addBlocker(blockers, "invalid_frame_range", path);
  return valid;
}
function header(manifest, blockers) {
  checkExactKeys(manifest, ["schema", "revision", "taskId", "observedAt", "project", "scenes", "assignments", "groups", "groupPolicy", "dependencies", "frameCoverage"], "manifest", blockers);
  if (manifest.schema !== MANIFEST_SCHEMA) addBlocker(blockers, "invalid_manifest_schema", "manifest.schema");
  if (!id(manifest.revision)) addBlocker(blockers, "invalid_manifest_revision", "manifest.revision");
  if (!isSafeId(manifest.taskId)) addBlocker(blockers, "invalid_task_id", "manifest.taskId");
  if (!isIso8601(manifest.observedAt)) addBlocker(blockers, "invalid_observed_at", "manifest.observedAt");
  const project = manifest.project;
  checkExactKeys(project, ["projectFile", "projectKey", "revision"], "manifest.project", blockers);
  if (!isRecord(project) || !isAbsolutePath(project.projectFile) || !isSafeId(project.projectKey) || !uint(project.revision)) addBlocker(blockers, "invalid_project_binding", "manifest.project");
}
function materialsCatalog(catalog, budgets, blockers) {
  checkExactKeys(catalog, ["schema", "revision", "materials"], "materials", blockers, "unknown_materials_field");
  if (catalog.schema !== MATERIALS_SCHEMA) addBlocker(blockers, "invalid_materials_schema", "materials.schema");
  if (!id(catalog.revision)) addBlocker(blockers, "invalid_materials_revision", "materials.revision");
  const materials = collection(catalog.materials, "materials.materials", "materialId", blockers);
  let total = 0;
  for (const material of materials.values()) {
    const path = `materials.materials.${material.materialId}`;
    checkExactKeys(material, ["materialId", "sourceItemId", "path", "sha256", "byteLength", "width", "height", "pixelAspect", "duration", "fps", "provenance"], path, blockers, "unknown_material_field");
    if (!id(material.sourceItemId)) addBlocker(blockers, "invalid_source_item_id", `${path}.sourceItemId`);
    if (!isAbsolutePath(material.path)) addBlocker(blockers, "invalid_material_path", `${path}.path`);
    if (!isSha256(material.sha256)) addBlocker(blockers, "invalid_material_sha256", `${path}.sha256`);
    if (!id(material.byteLength) || material.byteLength > budgets.materialFileBytes) addBlocker(blockers, "material_file_bytes_exceeds_budget", `${path}.byteLength`);
    else total += material.byteLength;
    if (material.pixelAspect !== 1) addBlocker(blockers, "unsupported_pixel_aspect_ratio", `${path}.pixelAspect`);
    if (![material.width, material.height, material.duration, material.fps].every(v => finite(v) && v > 0)) addBlocker(blockers, "invalid_material_metadata", path);
    const provenance = material.provenance;
    checkExactKeys(provenance, ["kind", "originalMaterialId", "originalSourceRange"], `${path}.provenance`, blockers, "unknown_material_field");
    if (!isRecord(provenance) || provenance.kind !== "prepared_clip" ||
        provenance.originalMaterialId !== undefined && !isSafeId(provenance.originalMaterialId) ||
        provenance.originalSourceRange !== undefined && !validRange(provenance.originalSourceRange, material.fps, `${path}.provenance.originalSourceRange`, blockers)) addBlocker(blockers, "invalid_material_provenance", `${path}.provenance`);
  }
  if (total > budgets.materialTotalBytes) addBlocker(blockers, "material_total_bytes_exceeds_budget", "materials.materials");
  return materials;
}

function scenesContract(manifest, facts, blockers) {
  const scenes = collection(manifest.scenes, "manifest.scenes", "sceneId", blockers);
  let fps = null;
  const eventIds = new Set();
  for (const scene of scenes.values()) {
    const path = `manifest.scenes.${scene.sceneId}`, root = facts.comps.get(scene.rootCompItemId);
    checkExactKeys(scene, ["sceneId", "rootCompItemId", "rootRange", "fps", "assignmentIds", "visibleCutCount", "cameraEvents", "rootCompName"], path, blockers, "unknown_scene_field");
    if (!id(scene.rootCompItemId) || !root) addBlocker(blockers, "invalid_root_comp_item_id", `${path}.rootCompItemId`);
    if (!finite(scene.fps) || scene.fps <= 0) addBlocker(blockers, "invalid_scene_fps", `${path}.fps`);
    else if (fps === null) fps = scene.fps;
    if (!close(scene.fps, fps) || !close(scene.fps, root?.frameRate)) addBlocker(blockers, "mixed_fps", `${path}.fps`);
    if (scene.rootCompName !== undefined && scene.rootCompName !== root?.name) addBlocker(blockers, "root_comp_name_mismatch", path);
    validRange(scene.rootRange, scene.fps, `${path}.rootRange`, blockers, root?.duration);
    if (!Array.isArray(scene.assignmentIds) || !scene.assignmentIds.length || scene.assignmentIds.some(a => !isSafeId(a)) || new Set(scene.assignmentIds).size !== scene.assignmentIds.length) addBlocker(blockers, "invalid_scene_assignment_ids", `${path}.assignmentIds`);
    if (!uint(scene.visibleCutCount)) addBlocker(blockers, "invalid_visible_cut_count", `${path}.visibleCutCount`);
    if (!Array.isArray(scene.cameraEvents)) addBlocker(blockers, "invalid_camera_events_container", `${path}.cameraEvents`);
    for (const [i, event] of list(scene.cameraEvents).entries()) {
      checkExactKeys(event, ["eventId", "rootTime"], `${path}.cameraEvents[${i}]`, blockers, "unknown_camera_event_field");
      if (!isRecord(event) || !isSafeId(event.eventId) || eventIds.has(event.eventId) || !isTimeAligned(event.rootTime, scene.fps) ||
          !Array.isArray(scene.rootRange) || event.rootTime < scene.rootRange[0] || event.rootTime >= scene.rootRange[1]) addBlocker(blockers, "invalid_camera_event", `${path}.cameraEvents[${i}]`);
      else eventIds.add(event.eventId);
    }
  }
  return { scenes, fps };
}

function assignmentsContract({ manifest, scenes, materials, facts, fps, budgets, blockers }) {
  const assignments = collection(manifest.assignments, "manifest.assignments", "assignmentId", blockers);
  const shotIds = new Set(), intents = new Map(), cuts = new Map();
  for (const assignment of assignments.values()) {
    const path = `manifest.assignments.${assignment.assignmentId}`, scene = scenes.get(assignment.sceneId), material = materials.get(assignment.materialId);
    checkExactKeys(assignment, ["assignmentId", "sceneId", "target", "routeLayerIds", "materialId", "sourceRange", "rootRange", "groupId", "crop", "shots", "protectedFields"], path, blockers, "unknown_assignment_field");
    if (!scene || !list(scene.assignmentIds).includes(assignment.assignmentId)) addBlocker(blockers, "unresolved_assignment_scene_id", `${path}.sceneId`);
    if (!material) addBlocker(blockers, "unresolved_assignment_material_id", `${path}.materialId`);
    if (material && !close(material.fps, fps)) addBlocker(blockers, "mixed_fps", path);
    checkExactKeys(assignment.target, ["compItemId", "layerId"], `${path}.target`, blockers, "unknown_target_field");
    if (!isRecord(assignment.target) || !id(assignment.target.compItemId) || !id(assignment.target.layerId)) { addBlocker(blockers, "invalid_assignment_target", `${path}.target`); continue; }
    if (!Array.isArray(assignment.routeLayerIds) || assignment.routeLayerIds.some(v => !id(v))) addBlocker(blockers, "invalid_route_layer_ids", `${path}.routeLayerIds`);
    const rootRange = assignmentRange(assignment, scene);
    const rootValid = validRange(rootRange, fps, `${path}.rootRange`, blockers);
    const sourceValid = validRange(assignment.sourceRange, fps, `${path}.sourceRange`, blockers, material?.duration);
    if (rootValid && (!Array.isArray(scene?.rootRange) || rootRange[0] < scene.rootRange[0] || rootRange[1] > scene.rootRange[1])) addBlocker(blockers, "assignment_outside_scene", `${path}.rootRange`);
    if (rootValid && sourceValid && !close(rootRange[1] - rootRange[0], assignment.sourceRange[1] - assignment.sourceRange[0])) addBlocker(blockers, "source_duration_mismatch", `${path}.sourceRange`);
    const crop = assignment.crop;
    checkExactKeys(crop, ["mode", "samples", "marginPixels"], `${path}.crop`, blockers, "unknown_crop_field");
    if (!isRecord(crop) || crop.mode !== "static-cover") addBlocker(blockers, "unsupported_crop_mode", `${path}.crop`);
    if (!Array.isArray(crop?.samples) || !crop.samples.length) addBlocker(blockers, "missing_crop_samples", `${path}.crop.samples`);
    if (!finite(crop?.marginPixels) || crop.marginPixels < 0) addBlocker(blockers, "invalid_crop_margin", `${path}.crop.marginPixels`);
    for (const [i, sample] of list(crop?.samples).entries()) {
      checkExactKeys(sample, ["sourceTime", "coordinateSpace", "imageRef", "imageSha256", "observation", "subjects", "noSignificantSubjects"], `${path}.crop.samples[${i}]`, blockers, "unknown_crop_sample_field");
      if (!isRecord(sample) || !isTimeAligned(sample.sourceTime, fps) || !sourceValid || sample.sourceTime < assignment.sourceRange[0] || sample.sourceTime >= assignment.sourceRange[1]) addBlocker(blockers, "invalid_crop_sample", `${path}.crop.samples[${i}]`);
    }
    if (!Array.isArray(assignment.shots) || !assignment.shots.length) addBlocker(blockers, "empty_shots", `${path}.shots`);
    let previous = sourceValid ? assignment.sourceRange[0] : null;
    const boundaries = [];
    for (const [i, shot] of list(assignment.shots).entries()) {
      const shotPath = `${path}.shots[${i}]`;
      checkExactKeys(shot, ["shotId", "sourceRange"], shotPath, blockers, "unknown_shot_field");
      if (!isRecord(shot) || !isSafeId(shot.shotId)) { addBlocker(blockers, "invalid_shot_id", shotPath); continue; }
      if (shotIds.has(shot.shotId)) addBlocker(blockers, "duplicate_shot_id", `${shotPath}.shotId`);
      shotIds.add(shot.shotId);
      if (validRange(shot.sourceRange, fps, `${shotPath}.sourceRange`, blockers, material?.duration)) {
        if (!close(shot.sourceRange[0], previous)) addBlocker(blockers, "non_contiguous_shots", shotPath);
        previous = shot.sourceRange[1];
        if (i < assignment.shots.length - 1) boundaries.push(previous);
      }
    }
    if (!sourceValid || !close(previous, assignment.sourceRange[1])) addBlocker(blockers, "shots_do_not_cover_source_range", `${path}.shots`);
    if (sourceValid && rootValid) cuts.set(assignment.sceneId, (cuts.get(assignment.sceneId) || 0) + boundaries.filter(t => {
      const rootTime = rootRange[0] + t - assignment.sourceRange[0];
      return rootTime > scene?.rootRange?.[0] + EPSILON && rootTime < scene?.rootRange?.[1] - EPSILON;
    }).length);
    const intent = { materialId: assignment.materialId, sourceRange: assignment.sourceRange, rootRange, crop };
    const key = keyOf(assignment.target);
    if (intents.has(key)) addBlocker(blockers, "unsupported_shared_target", path, { identicalIntent: stableJson(intents.get(key)) === stableJson(intent) });
    else intents.set(key, intent);
    const bound = bindTargetObservation({ assignment, scene, material, facts, blockers, path, fps });
    if (bound && rootValid && sourceValid && isRecord(crop) && Array.isArray(crop.samples)) {
      const result = buildPlaceholderPlan({ rootComp: bound.root, targetComp: bound.comp,
        targetLayer: bound.layer, sourceItem: bound.source, route: bound.observed.route,
        rootRange, sourceRange: assignment.sourceRange,
        framing: { geometry: bound.observed.geometry, samples: crop.samples, shotBoundaries: boundaries, marginPixels: crop.marginPixels } });
      if (!result.ok) addBlocker(blockers, "placeholder_plan_failed", path, { code: result.code }, { assignmentId: assignment.assignmentId });
      else if (result.plan.steps.length > budgets.maxSteps) addBlocker(blockers, "plan_steps_exceeds_budget", path);
    } else addBlocker(blockers, "incomplete_builder_inputs", path, undefined, { assignmentId: assignment.assignmentId });
  }
  for (const scene of scenes.values()) {
    for (const assignmentId of list(scene.assignmentIds)) if (assignments.get(assignmentId)?.sceneId !== scene.sceneId) addBlocker(blockers, "scene_assignment_mismatch", `manifest.scenes.${scene.sceneId}.assignmentIds`);
    if (scene.visibleCutCount !== (cuts.get(scene.sceneId) || 0)) addBlocker(blockers, "cut_count_mismatch", `manifest.scenes.${scene.sceneId}.visibleCutCount`);
  }
  return assignments;
}

function groupsContract({ manifest, assignments, materials, facts, blockers }) {
  const groups = collection(manifest.groups, "manifest.groups", "groupId", blockers);
  for (const group of groups.values()) {
    const path = `manifest.groups.${group.groupId}`;
    checkExactKeys(group, ["groupId", "provenance", "confirmed"], path, blockers, "unknown_group_field");
    if (!ALLOWED_GROUP_PROVENANCES.has(group.provenance)) addBlocker(blockers, "unconfirmed_group_provenance", `${path}.provenance`);
    if (group.confirmed !== true) addBlocker(blockers, "unconfirmed_group", `${path}.confirmed`);
  }
  const policy = manifest.groupPolicy;
  checkExactKeys(policy, ["distinctGroups", "disallowSourceOverlap", "balancedRepeats"], "manifest.groupPolicy", blockers, "unknown_group_policy_field");
  if (!isRecord(policy) || policy.distinctGroups !== true || policy.disallowSourceOverlap !== true || !Array.isArray(policy.balancedRepeats)) addBlocker(blockers, "unsupported_group_policy", "manifest.groupPolicy");
  if (list(policy?.balancedRepeats).length) addBlocker(blockers, "unsupported_balanced_repeat", "manifest.groupPolicy.balancedRepeats");
  const mappings = new Map(list(facts.usage.groupMappings).map(mapping => [mapping.mediaKey, mapping]));
  const prepared = [];
  for (const assignment of assignments.values()) {
    const material = materials.get(assignment.materialId), source = facts.sources.get(material?.sourceItemId), group = groups.get(assignment.groupId);
    const mediaKey = mediaKeyForSource(source), mapping = mappings.get(mediaKey);
    if (!group || !mapping || mapping.confirmed !== true || mapping.groupId !== assignment.groupId || mapping.provenance !== group.provenance) addBlocker(blockers, "group_mapping_mismatch", `manifest.assignments.${assignment.assignmentId}.groupId`);
    if (material && isRecord(assignment.target)) prepared.push({ target: assignment.target, sourceItemId: material.sourceItemId, mediaKey, sourceRange: assignment.sourceRange, groupId: assignment.groupId });
  }
  const checked = checkPlaceholderAssignments({ usage: facts.usage, assignments: prepared,
    constraints: { distinctGroups: true, disallowSourceOverlap: true, selectedTargets: prepared.map(a => a.target) } });
  if (!checked.ok || !checked.valid) {
    for (const conflict of [...list(checked.conflicts), ...list(checked.unsupported), ...list(checked.unknownGroups)]) addBlocker(blockers, conflict.type || "placeholder_usage_conflict", "manifest.assignments", conflict);
    if (!list(checked.conflicts).length && !list(checked.unsupported).length && !list(checked.unknownGroups).length) addBlocker(blockers, "placeholder_usage_failed", "manifest.assignments", { reason: checked.reason });
  }
}

function dependenciesContract({ manifest, scenes, assignments, materials, facts, observations, blockers }) {
  const dependencies = manifest.dependencies;
  checkExactKeys(dependencies, ["complete", "scope", "edges"], "manifest.dependencies", blockers, "unknown_dependencies_field");
  if (!isRecord(dependencies) || dependencies.complete !== true) addBlocker(blockers, "incomplete_dependencies", "manifest.dependencies.complete");
  const targets = new Set(), sources = new Set(), routes = new Set(), required = new Set();
  function requireEdge(kind, sceneId, resource) { required.add(`${kind}:${sceneId}:${resource}`); }
  for (const assignment of assignments.values()) {
    const target = assignment.target;
    if (!isRecord(target)) continue;
    const key = keyOf(target), observed = facts.targets.get(key);
    targets.add(key); requireEdge("target", assignment.sceneId, key);
    for (const sourceId of [materials.get(assignment.materialId)?.sourceItemId, observed?.targetLayer?.sourceItemId]) if (id(sourceId)) {
      sources.add(sourceId); requireEdge("source", assignment.sceneId, sourceId);
    }
    for (const edge of list(observed?.route)) if (isRecord(edge)) {
      const key = `${edge.parentCompItemId}:${edge.layerId}`;
      routes.add(key); requireEdge("route", assignment.sceneId, key);
    }
  }
  // Bind shared current media/targets/routes to every declared scene they actually affect.
  for (const scene of scenes.values()) {
    const overlaps = entry => entry.rootCompItemId === scene.rootCompItemId &&
      Array.isArray(scene.rootRange) && entry.rootRange?.[0] < scene.rootRange[1] && entry.rootRange?.[1] > scene.rootRange[0];
    for (const entry of list(facts.usage.entries)) if (sources.has(entry.sourceItemId) && overlaps(entry)) requireEdge("source", scene.sceneId, entry.sourceItemId);
    for (const occurrence of list(facts.usage.occurrences)) if (overlaps(occurrence)) {
      const key = keyOf(occurrence.target);
      if (targets.has(key)) requireEdge("target", scene.sceneId, key);
      if (routes.has(key)) requireEdge("route", scene.sceneId, key);
    }
  }
  const expectedScope = { rootCompItemIds: [...new Set([...scenes.values()].map(s => s.rootCompItemId))], targetKeys: [...targets], sourceItemIds: [...sources] };
  for (const [path, scope] of [["manifest.dependencies.scope", dependencies?.scope], ["observations.dependencyScope", observations.dependencyScope]]) {
    checkExactKeys(scope, [...(path.startsWith("observations") ? ["complete"] : []), "rootCompItemIds", "targetKeys", "sourceItemIds"], path, blockers, "unknown_dependency_scope_field");
    if (!isRecord(scope) || path.startsWith("observations") && scope.complete !== true ||
        !Object.keys(expectedScope).every(field => sameSet(scope[field], expectedScope[field]))) addBlocker(blockers, "dependency_scope_mismatch", path);
  }
  if (!Array.isArray(dependencies?.edges)) addBlocker(blockers, "invalid_dependency_edges_container", "manifest.dependencies.edges");
  const declared = new Set(), edgeIds = new Set();
  for (const [i, edge] of list(dependencies?.edges).entries()) {
    const path = `manifest.dependencies.edges[${i}]`;
    checkExactKeys(edge, ["dependencyId", "kind", "compItemId", "layerId", "sourceItemId", "sceneIds"], path, blockers, "unknown_dependency_edge_field");
    if (!isRecord(edge) || !isSafeId(edge.dependencyId) || edgeIds.has(edge.dependencyId) || !["target", "source", "route"].includes(edge.kind) ||
        !Array.isArray(edge.sceneIds) || !edge.sceneIds.length || new Set(edge.sceneIds).size !== edge.sceneIds.length) { addBlocker(blockers, "invalid_dependency_edge", path); continue; }
    edgeIds.add(edge.dependencyId);
    const resource = edge.kind === "source" ? edge.sourceItemId : `${edge.compItemId}:${edge.layerId}`;
    if (edge.kind === "source" ? !id(edge.sourceItemId) || edge.compItemId !== undefined || edge.layerId !== undefined :
        !id(edge.compItemId) || !id(edge.layerId) || edge.sourceItemId !== undefined) addBlocker(blockers, "invalid_dependency_identity", path);
    for (const sceneId of edge.sceneIds) {
      const key = `${edge.kind}:${sceneId}:${resource}`;
      if (!scenes.has(sceneId)) addBlocker(blockers, "unknown_dependency_scene_id", path);
      if (!required.has(key)) addBlocker(blockers, "unbound_dependency_edge", path, { key });
      if (declared.has(key)) addBlocker(blockers, "duplicate_dependency_binding", path, { key });
      declared.add(key);
    }
  }
  for (const key of required) if (!declared.has(key)) addBlocker(blockers, "missing_dependency_edge", "manifest.dependencies.edges", { key });
}

function validateMontageManifest(input = {}) {
  const blockers = [];
  let budgets = DEFAULT_HARD_CEILINGS;
  const blocked = () => ({ ok: false, readiness: "blocked", blockers, budgets });
  try {
    budgets = payloadSafety(input, blockers);
    if (blockers.length) return blocked();
    const { manifest, materials: catalog, observations } = input;
    header(manifest, blockers);
    const materials = materialsCatalog(catalog, budgets, blockers);
    const facts = validateObservations({ observations, manifest, materials, budgets, blockers });
    const { scenes, fps } = scenesContract(manifest, facts, blockers);
    const assignments = assignmentsContract({ manifest, scenes, materials, facts, fps, budgets, blockers });
    groupsContract({ manifest, assignments, materials, facts, blockers });
    dependenciesContract({ manifest, scenes, assignments, materials, facts, observations, blockers });
    const required = computeRequiredFrameCoverage({ scenes: [...scenes.values()], assignments: [...assignments.values()], fps });
    const coverage = verifyFrameCoverage({ manifestCoverage: manifest.frameCoverage, requiredMap: required, limits: budgets, fps,
      scenes: [...scenes.values()], assignments: [...assignments.values()] });
    blockers.push(...coverage.blockers);
    if (blockers.length) return blocked();
    const normalized = { ...deepClone(manifest), scenes: sortedSet([...scenes.values()]).map(scene => ({ ...scene,
      assignmentIds: [...scene.assignmentIds].sort(), cameraEvents: sortedSet(scene.cameraEvents) })),
      assignments: sortedSet([...assignments.values()]), groups: sortedSet(manifest.groups),
      dependencies: { complete: true, scope: Object.fromEntries(Object.entries(manifest.dependencies.scope).map(([key, values]) => [key, [...values].sort()])),
        edges: sortedSet(manifest.dependencies.edges.map(edge => ({ ...edge, sceneIds: [...edge.sceneIds].sort() }))) },
      frameCoverage: coverage.normalized, materials: sortedSet([...materials.values()]) };
    return { ok: true, readiness: "ready", normalized,
      preparedMaterials: { schema: MATERIALS_SCHEMA, revision: catalog.revision, materials: deepClone(normalized.materials) },
      blockers: [], budgets };
  } catch (error) {
    // Internal pure API also receives non-JSON JS values in offline callers. Fail closed.
    addBlocker(blockers, "malformed_contract", "input", { reason: error.name });
    return blocked();
  }
}

module.exports = { validateMontageManifest, normalizeBudgets, DEFAULT_HARD_CEILINGS,
  MANIFEST_SCHEMA, MATERIALS_SCHEMA, OBSERVATIONS_SCHEMA };
