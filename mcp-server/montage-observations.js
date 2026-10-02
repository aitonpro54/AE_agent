"use strict";

// Internal trusted-adapter facts; never a public client authority. No AE/fs calls.
const {
  OBSERVATIONS_SCHEMA, EPSILON, isRecord, isPositiveInteger: id, isFiniteNumber: finite,
  isIso8601, isAbsolutePath, isSha256, normalizePath, sortedSet, stableJson,
  checkExactKeys, addBlocker
} = require("./montage-contract");
const { buildSourceUsageMap, mediaKeyForSource } = require("./placeholder-usage");
const { validateGeometry } = require("./placeholder-framing");
const { isValidStretch } = require("./placeholder-timing");
const keyOf = target => `${target.compItemId}:${target.layerId}`;
const close = (a, b) => finite(a) && finite(b) && Math.abs(a - b) <= EPSILON;
const same = (a, b) => stableJson(a) === stableJson(b);

function indexRecords(records, getKey, path, blockers) {
  const map = new Map();
  if (!Array.isArray(records)) { addBlocker(blockers, "invalid_observation_collection", path); return map; }
  records.forEach((record, i) => {
    const key = isRecord(record) ? getKey(record) : null;
    if (key === null) addBlocker(blockers, "invalid_observation_identity", `${path}[${i}]`);
    else if (map.has(key)) addBlocker(blockers, "duplicate_observation_identity", `${path}[${i}]`, { key });
    else map.set(key, record);
  });
  return map;
}

function validateInventory(inventory, budgets, blockers) {
  const comps = new Map(), sources = new Map(), items = new Set(), indices = new Set();
  if (!isRecord(inventory) || inventory.complete !== true || !Array.isArray(inventory.comps) || !Array.isArray(inventory.sources)) {
    addBlocker(blockers, "incomplete_inventory", "observations.inventory");
    return { comps, sources };
  }
  if (inventory.comps.length > 200 || inventory.sources.length > 1000 || inventory.comps.length + inventory.sources.length > 2000) {
    addBlocker(blockers, "inventory_bounds_exceeded", "observations.inventory");
    return { comps, sources };
  }
  let layers = 0;
  for (const comp of inventory.comps) layers += Array.isArray(comp?.layers) ? comp.layers.length : 0;
  const nodes = inventory.comps.length + inventory.sources.length + layers;
  // Do not increase native reader ceilings. Count before walking individual records.
  if (inventory.comps.length > 200 || inventory.sources.length > 1000 || layers > 5000 ||
      inventory.comps.length + inventory.sources.length > 2000 || nodes > budgets.graphNodes) {
    addBlocker(blockers, "inventory_bounds_exceeded", "observations.inventory", { nodes, limit: budgets.graphNodes });
    return { comps, sources };
  }
  function identity(item, path) {
    if (!isRecord(item) || !id(item.itemId) || !id(item.itemIndex) || typeof item.name !== "string" || !item.name) {
      addBlocker(blockers, "invalid_native_identity", path); return false;
    }
    if (items.has(item.itemId) || indices.has(item.itemIndex)) {
      addBlocker(blockers, "duplicate_native_identity", path); return false;
    }
    items.add(item.itemId); indices.add(item.itemIndex); return true;
  }
  inventory.comps.forEach((comp, i) => {
    const path = `observations.inventory.comps[${i}]`;
    if (!identity(comp, path)) return;
    if (![comp.width, comp.height, comp.duration, comp.frameRate].every(v => finite(v) && v > 0) || comp.pixelAspect !== 1 || !Array.isArray(comp.layers)) {
      addBlocker(blockers, "invalid_comp_inventory", path); return;
    }
    const layerIds = new Set(), layerIndices = new Set();
    comp.layers.forEach((layer, j) => {
      if (!isRecord(layer) || !id(layer.id) || !id(layer.index) || layerIds.has(layer.id) || layerIndices.has(layer.index)) {
        addBlocker(blockers, "invalid_or_duplicate_native_layer", `${path}.layers[${j}]`); return;
      }
      layerIds.add(layer.id); layerIndices.add(layer.index);
      if (typeof layer.name !== "string" || !layer.name || typeof layer.enabled !== "boolean" || typeof layer.locked !== "boolean" ||
          ![layer.startTime, layer.inPoint, layer.outPoint, layer.stretch].every(finite) || layer.outPoint <= layer.inPoint ||
          typeof layer.timeRemapEnabled !== "boolean" || layer.sourceItemId !== null && !id(layer.sourceItemId)) {
        addBlocker(blockers, "incomplete_native_layer", `${path}.layers[${j}]`);
      }
    });
    comps.set(comp.itemId, comp);
  });
  inventory.sources.forEach((source, i) => {
    const path = `observations.inventory.sources[${i}]`;
    if (!identity(source, path)) return;
    if (typeof source.type !== "string") addBlocker(blockers, "invalid_source_inventory", path);
    sources.set(source.itemId, source);
  });
  return { comps, sources };
}

function validateVideoSource(source, path, blockers) {
  if (!source) { addBlocker(blockers, "source_not_in_inventory", path); return; }
  if (source.type !== "footage" || source.hasVideo !== true || source.footageMissing !== false || !isAbsolutePath(source.file) ||
      ![source.width, source.height, source.duration, source.frameRate].every(v => finite(v) && v > 0)) {
    addBlocker(blockers, "unsupported_or_unknown_video_source", path);
  }
  if (source.pixelAspect !== 1) addBlocker(blockers, "unsupported_pixel_aspect_ratio", `${path}.pixelAspect`);
}

function validateMaterialBindings(materials, observed, sources, blockers) {
  for (const material of materials.values()) {
    const path = `observations.materials.${material.materialId}`, fact = observed.get(material.materialId);
    const source = sources.get(material.sourceItemId);
    validateVideoSource(source, `observations.inventory.sources.${material.sourceItemId}`, blockers);
    if (!fact) { addBlocker(blockers, "unobserved_material", path); continue; }
    checkExactKeys(fact, ["materialId", "sourceItemId", "verified", "path", "sha256", "byteLength", "metadata"], path, blockers, "unknown_observation_field");
    if (fact.verified !== true) addBlocker(blockers, "unverified_material", path);
    if (!isSha256(fact.sha256)) addBlocker(blockers, "invalid_material_sha256", `${path}.sha256`);
    if (fact.sourceItemId !== material.sourceItemId || !isAbsolutePath(fact.path) || normalizePath(fact.path) !== normalizePath(material.path) ||
        String(fact.sha256).toLowerCase() !== String(material.sha256).toLowerCase() || fact.byteLength !== material.byteLength) {
      addBlocker(blockers, "material_observation_mismatch", path);
    }
    if (source && (normalizePath(source.file) !== normalizePath(material.path) ||
        !["width", "height", "pixelAspect", "duration"].every(k => close(source[k], material[k])) || !close(source.frameRate, material.fps))) {
      addBlocker(blockers, "native_material_mismatch", path);
    }
    const metadata = fact.metadata;
    if (!isRecord(metadata) || !["width", "height", "pixelAspect", "duration", "fps"].every(k => close(metadata[k], material[k]))) {
      addBlocker(blockers, "material_metadata_mismatch", `${path}.metadata`);
    }
    checkExactKeys(metadata, ["width", "height", "pixelAspect", "duration", "fps"], `${path}.metadata`, blockers, "unknown_observation_field");
  }
  // Two prepared records for one imported ID/path cannot claim different bytes/metadata.
  const aliases = new Map();
  for (const material of materials.values()) {
    const source = sources.get(material.sourceItemId), mediaKey = mediaKeyForSource(source);
    const content = { sha256: material.sha256?.toLowerCase(), byteLength: material.byteLength,
      width: material.width, height: material.height, pixelAspect: material.pixelAspect, duration: material.duration, fps: material.fps };
    if (aliases.has(mediaKey) && !same(aliases.get(mediaKey), content)) addBlocker(blockers, "alias_material_mismatch", `materials.materials.${material.materialId}`);
    else aliases.set(mediaKey, content);
  }
}

function validateObservations({ observations, manifest, materials, budgets, blockers }) {
  checkExactKeys(observations, ["schema", "observedAt", "project", "inventory", "usage", "targets", "materials", "dependencyScope"], "observations", blockers, "unknown_observations_field");
  if (observations.schema !== OBSERVATIONS_SCHEMA) addBlocker(blockers, "invalid_observations_schema", "observations.schema");
  if (!isIso8601(observations.observedAt)) addBlocker(blockers, "invalid_observations_observed_at", "observations.observedAt");
  if (!same(observations.project, manifest.project)) addBlocker(blockers, "project_mismatch", "observations.project");
  const { comps, sources } = validateInventory(observations.inventory, budgets, blockers);
  const targets = indexRecords(observations.targets, r => r.target && id(r.target.compItemId) && id(r.target.layerId) ? keyOf(r.target) : null, "observations.targets", blockers);
  const materialFacts = indexRecords(observations.materials, r => typeof r.materialId === "string" ? r.materialId : null, "observations.materials", blockers);
  validateMaterialBindings(materials, materialFacts, sources, blockers);
  const roots = [...new Set((Array.isArray(manifest.scenes) ? manifest.scenes : []).map(s => s?.rootCompItemId).filter(id))].sort((a, b) => a - b).map(compItemId => ({ compItemId }));
  const supplied = observations.usage;
  if (!Array.isArray(supplied?.groupMappings)) addBlocker(blockers, "missing_usage_group_mappings", "observations.usage.groupMappings");
  const usage = buildSourceUsageMap({ inventory: comps.size === observations.inventory?.comps?.length &&
    sources.size === observations.inventory?.sources?.length ? observations.inventory : null, roots,
    groupMappings: Array.isArray(supplied?.groupMappings) ? supplied.groupMappings : [], maxNodes: budgets.graphNodes });
  const boundTargets=new Set((manifest.assignments || []).map(a=>keyOf(a.target)));
  for(const occurrence of usage.occurrences || []) {
    const layer=comps.get(occurrence.target.compItemId)?.layers.find(l=>l.id===occurrence.target.layerId);
    if(layer && layer.stretch!==100 && !boundTargets.has(keyOf(occurrence.target)))addBlocker(blockers,"unsupported_unbound_affine_usage","observations.usage");
  }
  if (!usage.ok || !usage.complete) addBlocker(blockers, "incomplete_native_usage", "observations.usage", { reason: usage.reason, unsupported: usage.unsupported });
  if (!isRecord(supplied) || supplied.ok !== true || supplied.complete !== true) addBlocker(blockers, "incomplete_usage", "observations.usage");
  else {
    for (const field of ["entries", "occurrences", "sources", "groupMappings", "unsupported"]) {
      if (!Array.isArray(supplied[field]) || !same(sortedSet(supplied[field]), sortedSet(usage[field] || []))) {
        addBlocker(blockers, "usage_inventory_mismatch", `observations.usage.${field}`);
      }
    }
    if (!isRecord(supplied.scope) || !same(sortedSet(supplied.scope.rootCompItemIds || []), roots.map(r => r.compItemId)) ||
        !same(sortedSet(supplied.scope.roots || []), sortedSet(roots))) addBlocker(blockers, "usage_scope_mismatch", "observations.usage.scope");
  }
  return { comps, sources, targets, materialFacts, usage };
}

function bindTargetObservation({ assignment, scene, material, facts, blockers, path, fps }) {
  const { comps, sources, targets } = facts, target = assignment.target;
  const comp = comps.get(target?.compItemId), layer = comp?.layers.find(l => l?.id === target?.layerId);
  const observed = targets.get(target ? keyOf(target) : ""), root = comps.get(scene?.rootCompItemId), source = sources.get(material?.sourceItemId);
  if (!root) addBlocker(blockers, "root_comp_not_in_inventory", path);
  if (!comp) addBlocker(blockers, "target_comp_not_in_inventory", path);
  if (!layer) addBlocker(blockers, "target_layer_not_in_inventory", path);
  if (!observed) { addBlocker(blockers, "unobserved_target", path); return null; }
  const tl = observed.targetLayer;
  if (!isRecord(tl) || !layer || !["id", "index", "name", "sourceItemId", "enabled", "locked", "startTime", "inPoint", "outPoint", "stretch", "timeRemapEnabled"].every(k => same(tl[k], layer[k]))) {
    addBlocker(blockers, "target_inventory_mismatch", path);
  }
  validateVideoSource(sources.get(layer?.sourceItemId), `${path}.currentSource`, blockers);
  if (!layer || layer.enabled !== true || layer.locked !== false || !isValidStretch(layer.stretch) || layer.timeRemapEnabled !== false) addBlocker(blockers, "unsupported_target_layer", path);
  const footprint = observed.footprint;
  if (!isRecord(footprint) || footprint.complete !== true) addBlocker(blockers, "unknown_footprint", path);
  else for (const [field, code] of [["hasTrackMatte", "unsupported_track_matte"], ["hasEffects", "unsupported_effects"], ["hasExpressions", "unsupported_expressions"], ["hasTransformKeys", "unsupported_transform_keys"]]) {
    if (footprint[field] !== false) addBlocker(blockers, code, `${path}.footprint.${field}`);
  }
  if (!isRecord(observed.protection) || observed.protection.checked !== true || observed.protection.ok !== true) addBlocker(blockers, "target_protection_violation", path);
  if (!Array.isArray(assignment.protectedFields) || assignment.protectedFields.length) addBlocker(blockers, "protected_target_fields", `${path}.protectedFields`);
  const geometry = observed.geometry, check = validateGeometry(geometry);
  if (!check.valid) addBlocker(blockers, "unsupported_target_geometry", path, check.reasons);
  if (comp && source && (!isRecord(geometry?.comp) || !isRecord(geometry?.source) ||
      !["width", "height", "pixelAspect", "frameRate"].every(k => close(geometry.comp[k], comp[k])) ||
      !["width", "height", "pixelAspect", "duration", "frameRate"].every(k => close(geometry.source[k], source[k])))) {
    addBlocker(blockers, "geometry_inventory_mismatch", path);
  }
  if (![root, comp, source].every(c => c && close(c.frameRate, fps))) addBlocker(blockers, "mixed_fps", path);
  const transform = observed.transform;
  if (!isRecord(transform) || !["anchorPoint", "position", "scale"].every(k => Array.isArray(transform[k]) && transform[k].length === 2 && transform[k].every(finite)) ||
      transform.rotation !== 0 || !finite(transform.opacity) || !same(transform.anchorPoint, geometry?.layer?.anchorPoint) || !close(transform.rotation, geometry?.layer?.rotation)) {
    addBlocker(blockers, "unknown_target_transform", `${path}.transform`);
  }
  const route = observed.route;
  if (!Array.isArray(route) || !Array.isArray(assignment.routeLayerIds) || !same(assignment.routeLayerIds, route.map(e => e?.layerId))) {
    addBlocker(blockers, "route_mismatch", path); return null;
  }
  let parentId = scene?.rootCompItemId;
  const visited = new Set([parentId]);
  for (let i = 0; i < route.length; i++) {
    const edge = route[i], parent = comps.get(parentId), native = parent?.layers.find(l => l?.id === edge?.layerId);
    if (!isRecord(edge) || edge.parentCompItemId !== parentId || !native || edge.childCompItemId !== native.sourceItemId ||
        edge.layerIndex !== native.index || !["startTime", "inPoint", "outPoint", "stretch", "timeRemapEnabled"].every(k => same(edge[k], native[k])) ||
        native.enabled !== true || native.locked !== false || !comps.has(edge.childCompItemId)) addBlocker(blockers, "route_inventory_mismatch", `${path}.route[${i}]`);
    if (edge?.stretch !== 100) addBlocker(blockers, "unsupported_route_stretch", `${path}.route[${i}]`);
    if (edge?.timeRemapEnabled !== false) addBlocker(blockers, "unsupported_route_time_remap", `${path}.route[${i}]`);
    const geometryCheck = validateGeometry(edge?.geometry), child = comps.get(edge?.childCompItemId);
    if (!geometryCheck.valid || !parent || !child ||
        !["width", "height", "pixelAspect", "frameRate"].every(k => close(edge?.geometry?.comp?.[k], parent[k])) ||
        !["width", "height", "pixelAspect", "duration", "frameRate"].every(k => close(edge?.geometry?.source?.[k], child[k]))) {
      addBlocker(blockers, "unsupported_or_unknown_route_geometry", `${path}.route[${i}].geometry`);
    }
    const footprint = edge?.footprint;
    if (!isRecord(footprint) || footprint.complete !== true ||
        !["hasTrackMatte", "hasEffects", "hasExpressions", "hasTransformKeys"].every(k => footprint[k] === false)) {
      addBlocker(blockers, "unsupported_or_unknown_route_footprint", `${path}.route[${i}].footprint`);
    }
    if (visited.has(edge?.childCompItemId)) addBlocker(blockers, "route_cycle_detected", `${path}.route[${i}]`);
    visited.add(edge?.childCompItemId);
    parentId = edge?.childCompItemId;
    if (!close(comps.get(parentId)?.frameRate, fps)) addBlocker(blockers, "mixed_fps", `${path}.route[${i}]`);
  }
  if (parentId !== target?.compItemId) addBlocker(blockers, "unreachable_target_route", path);
  return root && comp && layer && source ? { root, comp, layer, source, observed } : null;
}

module.exports = { validateObservations, bindTargetObservation, keyOf };
