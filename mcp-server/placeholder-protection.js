"use strict";

// Pure contract/footprint and AE precondition generation. Persistence and execution
// remain in Project Intent Memory and the existing bridge runner.
const crypto = require("crypto");
const path = require("path");
const { pathsEqual } = require("./placeholder-source-recovery");
const { isValidStretch } = require("./placeholder-timing");
const projectSave = require("./project-save");
const ID = value => Number.isSafeInteger(value) && value > 0;
const finite = value => typeof value === "number" && Number.isFinite(value);
const TRANSFORMS = { anchorPoint: "ADBE Anchor Point", position: "ADBE Position", scale: "ADBE Scale",
  rotation: "ADBE Rotate Z", opacity: "ADBE Opacity", orientation: "ADBE Orientation",
  xRotation: "ADBE Rotate X", yRotation: "ADBE Rotate Y" };
const TARGET_SETTERS = new Set(["replace_layer_source", "set_layer_time_range", "set_layer_transform", "set_property_value","fit_layer_to_comp"]);
function unsupportedSetterIdentityAliases(tool, args = {}) {
  if (!TARGET_SETTERS.has(tool)) return [];
  return ["compItemId", "layerId", ...(tool === "replace_layer_source" ? ["sourceItemId"] : [])]
    .filter(field => args[field] !== undefined);
}
function assertSupportedSetterIdentity(tool, args) {
  const aliases = unsupportedSetterIdentityAliases(tool, args);
  if (aliases.length) {
    const error = new Error("unsupported_setter_identity_alias:" + aliases.join(","));
    error.code = "unsupported_setter_identity_alias";
    throw error;
  }
}
function aeSetterIdentityGuard(tool, args) {
  const aliases = unsupportedSetterIdentityAliases(tool, args);
  return aliases.length ? `throw new Error(${JSON.stringify("unsupported_setter_identity_alias:" + aliases.join(","))});` : "";
}
const SAFE_ADDITIONS = new Set(["create_placeholder_review_comps","create_comp", "create_test_comp", "create_solid_layer", "create_null_layer",
  "create_text_layer", "create_adjustment_layer", "create_shape_layer", "create_camera_layer", "create_camera_with_controller",
  "duplicate_comp", "import_footage", "create_project_folder", "set_layer_selection", "set_comp_current_time",
  "set_comp_work_area", "refresh_comp_panel", "add_comp_to_render_queue", "set_render_queue_output", "save_comp_frame_png"]);

function targetKey(target) { return `${target.compItemId}:${target.layerId}`; }
function valueEqual(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => valueEqual(v, b[i]));
  if (finite(a) && finite(b)) return Math.abs(a - b) <= 1e-7;
  return a === b;
}
function transformNumberEqual(a, b) {
  if (!finite(a) || !finite(b)) return false;
  return Math.abs(a - b) <= 1e-7 || Math.abs(a - Math.fround(b)) <= 1e-7 || Math.abs(Math.fround(a) - b) <= 1e-7;
}
function canonicalize2DVector(value, kind, threeDLayer) {
  if (threeDLayer !== false || !["anchorPoint", "position", "scale"].includes(kind) ||
    !Array.isArray(value) || ![2, 3].includes(value.length) || !Array.from(value).every(finite)) return null;
  if (value.length === 2 || value[2] === (kind === "scale" ? 100 : 0)) return value.slice(0, 2);
  return null;
}
function transformValueEqual(a, b, kind = null, threeDLayer = null) {
  if (["anchorPoint", "position", "scale"].includes(kind)) {
    if (threeDLayer === false) {
      const canA = canonicalize2DVector(a, kind, false), canB = canonicalize2DVector(b, kind, false);
      return Boolean(canA && canB && canA.every((v, i) => transformNumberEqual(v, canB[i])));
    }
    // Historical 2D reads retain strict equality; only explicit native evidence
    // can authorize dimensional conversion or Float32 representation tolerance.
    const length = threeDLayer === true ? 3 : 2;
    return Array.isArray(a) && Array.isArray(b) && a.length === length && b.length === length &&
      Array.from(a).every(finite) && Array.from(b).every(finite) && valueEqual(a, b);
  }
  if (kind === "orientation") {
    return Array.isArray(a) && Array.isArray(b) && a.length === 3 && b.length === 3 &&
      Array.from(a).every(finite) && Array.from(b).every(finite) && valueEqual(a, b);
  }
  if (["rotation", "opacity", "xRotation", "yRotation"].includes(kind)) return transformNumberEqual(a, b);
  return false;
}
function validValue(value) {
  return finite(value) || typeof value === "boolean" || typeof value === "string" && value.length <= 4000 ||
    Array.isArray(value) && value.length > 0 && value.length <= 4 && value.every(finite);
}
function validTransform(field, value) {
  if (["position", "anchorPoint", "scale", "orientation"].includes(field)) return Array.isArray(value) && value.length >= 2 && value.length <= 3 && value.every(finite);
  return ["rotation", "opacity", "xRotation", "yRotation"].includes(field) && finite(value);
}
function propertyPath(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) throw new Error("unsupported_protected_property_path");
  return value.map(segment => {
    const matchName = typeof segment === "string" ? segment : segment && segment.matchName;
    if (typeof matchName !== "string" || !matchName || matchName.length > 160) throw new Error("protected_property_requires_match_name");
    const index = segment && typeof segment === "object" ? segment.propertyIndex : null;
    if (index !== null && index !== undefined && !ID(index)) throw new Error("invalid_protected_property_index");
    return { matchName, ...(ID(index) ? { propertyIndex: index } : {}) };
  });
}
function propertyKey(value) { return JSON.stringify(propertyPath(value)); }
function samePropertyPath(a, b) {
  const left = propertyPath(a), right = propertyPath(b);
  return left.length === right.length && left.every((segment, index) => segment.matchName === right[index].matchName &&
    (!segment.propertyIndex || !right[index].propertyIndex || segment.propertyIndex === right[index].propertyIndex));
}
function normalizeProtectedPaths(paths = []) {
  if (!Array.isArray(paths) || paths.length > 12) throw new Error("protected_properties_limit");
  const result = paths.map(propertyPath);
  if (new Set(result.map(JSON.stringify)).size !== result.length) throw new Error("duplicate_protected_property_path");
  return result;
}
function content(snapshot) {
  return { target: snapshot.target, source: snapshot.source, timing: snapshot.timing,
    transform: snapshot.transform, properties: snapshot.properties, dependencies: snapshot.dependencies };
}
function fingerprint(snapshot) { return crypto.createHash("sha256").update(JSON.stringify(content(snapshot))).digest("hex"); }
function validateSnapshot(snapshot) {
  if (!snapshot || snapshot.schema !== "ae-placeholder-accepted.v1" || !snapshot.target ||
    !ID(snapshot.target.compItemId) || !ID(snapshot.target.layerId)) throw new Error("invalid_accepted_identity");
  const source = snapshot.source;
  if (!source || !ID(source.itemId) || source.type !== "footage" || typeof source.file !== "string" ||
    !(path.win32.isAbsolute(source.file) || path.posix.isAbsolute(source.file)) || source.footageMissing !== false) throw new Error("unsupported_accepted_source");
  const timing = snapshot.timing;
  if (!timing || ![timing.startTime, timing.inPoint, timing.outPoint].every(finite) || timing.outPoint <= timing.inPoint ||
    !isValidStretch(timing.stretch) || timing.timeRemapEnabled !== false) throw new Error("unsupported_accepted_timing");
  if (!snapshot.transform || !["anchorPoint", "position", "scale", "rotation", "opacity"].every(key => validTransform(key,snapshot.transform[key])) ||
    Object.keys(snapshot.transform).some(key => !TRANSFORMS[key] || !validTransform(key,snapshot.transform[key]))) throw new Error("unsupported_accepted_transform");
  if (!Array.isArray(snapshot.properties) || snapshot.properties.length > 12 || snapshot.properties.some(prop => !validValue(prop.value))) throw new Error("invalid_accepted_properties");
  normalizeProtectedPaths(snapshot.properties.map(prop => prop.path));
  if (!Array.isArray(snapshot.dependencies) || snapshot.dependencies.length > 256) throw new Error("invalid_accepted_dependencies");
  const seen = new Set();
  for (const edge of snapshot.dependencies) {
    if (!ID(edge.compItemId) || !ID(edge.layerId) || !ID(edge.sourceItemId) || seen.has(targetKey(edge)) ||
      ![edge.startTime, edge.inPoint, edge.outPoint].every(finite) || edge.stretch !== 100 || edge.timeRemapEnabled !== false ||
      typeof edge.enabled !== "boolean") throw new Error("invalid_accepted_dependency");
    seen.add(targetKey(edge));
  }
  if (snapshot.fingerprint !== fingerprint(snapshot)) throw new Error("accepted_snapshot_hash_mismatch");
  return snapshot;
}
function dependencyClosure(inventory, target) {
  if (!inventory || inventory.complete !== true || !Array.isArray(inventory.comps)) throw new Error("incomplete_protection_inventory");
  const dependencies = [];
  const visited = new Set();
  function parents(itemId, route, depth) {
    if (depth > 16) throw new Error("unsupported_dependency_depth");
    if (route.includes(itemId)) throw new Error("unsupported_dependency_cycle");
    for (const comp of inventory.comps) for (const layer of comp.layers || []) {
      if (layer.sourceItemId !== itemId) continue;
      const edge = { compItemId: comp.itemId, layerId: layer.id, sourceItemId: itemId,
        startTime: layer.startTime, inPoint: layer.inPoint, outPoint: layer.outPoint,
        stretch: layer.stretch, timeRemapEnabled: layer.timeRemapEnabled, enabled: layer.enabled };
      if (edge.stretch !== 100 || edge.timeRemapEnabled !== false) throw new Error("unsupported_dependency_time_mapping");
      const key = targetKey(edge);
      if (!visited.has(key)) { visited.add(key); dependencies.push(edge); }
      if (dependencies.length > 256) throw new Error("unsupported_dependency_limit");
      parents(comp.itemId, [...route, itemId], depth + 1);
    }
  }
  parents(target.compItemId, [], 0);
  return dependencies.sort((a, b) => a.compItemId - b.compItemId || a.layerId - b.layerId);
}
function snapshotFromEvidence(evidence, inventory, protectedPaths = []) {
  const paths = normalizeProtectedPaths(protectedPaths);
  if (!evidence || !evidence.comp || !evidence.layer || evidence.unsupported && evidence.unsupported.length) {
    throw new Error(evidence && evidence.unsupported && evidence.unsupported[0] || "incomplete_acceptance_evidence");
  }
  const layer = evidence.layer;
  const target = { compItemId: evidence.comp.itemId, layerId: layer.id };
  const snapshot = { schema: "ae-placeholder-accepted.v1", target,
    source: { itemId: layer.source && layer.source.itemId, type: "footage", file: layer.source && layer.source.file,
      footageMissing: layer.source && layer.source.footageMissing },
    timing: { startTime: layer.startTime, inPoint: layer.inPoint, outPoint: layer.outPoint,
      stretch: layer.stretch, timeRemapEnabled: layer.timeRemapEnabled },
    transform: evidence.transform, properties: evidence.properties || [], dependencies: dependencyClosure(inventory, target),
    acceptedAt: new Date().toISOString() };
  if (paths.length !== snapshot.properties.length || paths.some((value, i) => propertyKey(value) !== propertyKey(snapshot.properties[i].path))) throw new Error("incomplete_protected_properties");
  snapshot.fingerprint = fingerprint(snapshot);
  return validateSnapshot(snapshot);
}
function compareSnapshot(snapshot, evidence, inventory) {
  const changes = [];
  try {
    const actual = snapshotFromEvidence(evidence, inventory, snapshot.properties.map(prop => prop.path));
    if (!valueEqual(snapshot.target, actual.target) && targetKey(snapshot.target) !== targetKey(actual.target)) changes.push("identity");
    if (snapshot.source.itemId !== actual.source.itemId || !pathsEqual(snapshot.source.file, actual.source.file) || actual.source.footageMissing !== false) changes.push("source");
    for (const field of Object.keys(snapshot.timing)) if (!valueEqual(snapshot.timing[field], actual.timing[field])) changes.push("timing." + field);
    for (const field of Object.keys(snapshot.transform)) if (!valueEqual(snapshot.transform[field], actual.transform[field])) changes.push("transform." + field);
    for (let i = 0; i < snapshot.properties.length; i++) if (!valueEqual(snapshot.properties[i].value, actual.properties[i].value)) changes.push("property." + propertyKey(snapshot.properties[i].path));
    if (JSON.stringify(snapshot.dependencies) !== JSON.stringify(actual.dependencies)) changes.push("dependencies");
  } catch (error) { changes.push(error.message); }
  return { ok: changes.length === 0, code: changes.length ? "accepted_placeholder_drift" : null, target: snapshot.target, changes };
}

function resolveTargets(args, inventory) {
  assertSupportedSetterIdentity("set_layer_transform", args);
  const comps = inventory.comps || [];
  let comp;
  if (ID(args.expectedCompItemId)) comp = comps.find(value => value.itemId === args.expectedCompItemId);
  else if (ID(args.compItemIndex)) comp = comps.find(value => value.itemIndex === args.compItemIndex);
  else if (args.compName) {
    const matches = comps.filter(value => value.name === args.compName);
    if (matches.length === 1) comp = matches[0];
  }
  if (!comp) throw new Error("mutation_comp_identity_unavailable");
  let layers;
  if(args.expectedLayerIds!==undefined) {
    if(!Array.isArray(args.expectedLayerIds) || !args.expectedLayerIds.length || !args.expectedLayerIds.every(ID) || new Set(args.expectedLayerIds).size!==args.expectedLayerIds.length || args.expectedLayerId!==undefined) throw new Error("mutation_layer_identity_unavailable");
    layers=args.expectedLayerIds.map(id=>{const matches=(comp.layers || []).filter(value=>value.id===id);return matches.length===1 ? matches[0] : null;});
  }
  else if (ID(args.expectedLayerId)) layers = (comp.layers || []).filter(value => value.id === args.expectedLayerId);
  else {
    const indices = args.layerIndices !== undefined ? (Array.isArray(args.layerIndices) ? args.layerIndices : [args.layerIndices]) : [].concat(args.layerIndex);
    if (!indices.length || !indices.every(ID)) throw new Error("mutation_layer_identity_unavailable");
    layers = indices.map(index => (comp.layers || []).find(value => value.index === index));
  }
  if (!layers.length || layers.some(value => !value)) throw new Error("mutation_layer_identity_unavailable");
  return layers.map(layer => ({ compItemId: comp.itemId, layerId: layer.id, compItemIndex: comp.itemIndex, layerIndex: layer.index, comp, layer }));
}
function sourceId(args, inventory) {
  assertSupportedSetterIdentity("replace_layer_source", args);
  if (ID(args.expectedSourceItemId)) return args.expectedSourceItemId;
  const all = [...(inventory.sources || []), ...(inventory.comps || [])];
  if (ID(args.sourceItemIndex)) return (all.find(value => value.itemIndex === args.sourceItemIndex) || {}).itemId;
  const matches = all.filter(value => value.name === args.sourceItemName);
  return matches.length === 1 ? matches[0].itemId : null;
}
function checkProtectedSteps({ accepted = [], inventory, steps = [], verifiedReviewCleanupOwners=[] }) {
  const conflicts = [];
  const bindings = [];
  const affected = new Set();
  for (const [index, step] of steps.entries()) {
    const tool = step.tool || step.toolName;
    const args = step.args || step.arguments || {};
    try { assertSupportedSetterIdentity(tool, args); }
    catch (error) { conflicts.push({ index, tool, reason: error.message }); }
    if (tool === projectSave.TOOL_NAME) {
      try { projectSave.validateToolInput(tool, args); }
      catch (error) { conflicts.push({ index, tool, reason: error.code || error.message }); }
    }
  }
  if (!accepted.length) return { ok: !conflicts.length, code: conflicts.length ? "unsupported_setter_identity_alias" : null, conflicts, bindings, affected: [] };
  if (!inventory || inventory.complete !== true) return { ok: false, code: "incomplete_protection_inventory", conflicts: [] };
  for (const [index, step] of steps.entries()) {
    const tool = step.tool || step.toolName;
    const args = step.args || step.arguments || {};
    if (unsupportedSetterIdentityAliases(tool,args).length) continue;
    if (args.allowProtectedChanges === true || step.allowProtectedChanges === true) { conflicts.push({ index, tool, reason: "protected_override_forbidden" }); continue; }
    if (tool === projectSave.TOOL_NAME) continue;
    if (SAFE_ADDITIONS.has(tool)) continue;
    if(tool==="cleanup_test_items" && verifiedReviewCleanupOwners.includes(args.owner))continue;
    if(tool==="reload_montage_material_source"){
      for(const snapshot of accepted)if(snapshot.source.itemId===args.sourceItemId || snapshot.dependencies.some(edge=>edge.sourceItemId===args.sourceItemId)){
        affected.add(targetKey(snapshot.target));conflicts.push({index,tool,target:snapshot.target,reason:"accepted_source_reload_forbidden"});
      }
      continue;
    }
    if (tool === "relink_footage_source") {
      for (const snapshot of accepted) if (snapshot.source.itemId === args.itemId) {
        affected.add(targetKey(snapshot.target));
        if (!pathsEqual(args.filePath, snapshot.source.file)) conflicts.push({ index, tool, target: snapshot.target, reason: "accepted_shared_source_relink" });
      }
      continue;
    }
    if (!TARGET_SETTERS.has(tool)) {
      conflicts.push({ index, tool, reason: "unknown_protected_mutation_footprint" });
      continue;
    }
    let targets;
    try { targets = resolveTargets(args, inventory); } catch (error) { conflicts.push({ index, tool, reason: error.message }); continue; }
    bindings.push({ index, tool, targets: targets.map(value => ({ compItemId: value.compItemId, layerId: value.layerId,
      compItemIndex: value.compItemIndex, layerIndex: value.layerIndex })) });
    for (const target of targets) for (const snapshot of accepted) {
      const direct = targetKey(target) === targetKey(snapshot.target);
      const edge = snapshot.dependencies.find(value => targetKey(value) === targetKey(target));
      if (!direct && !edge) continue;
      affected.add(targetKey(snapshot.target));
      let reason = null;
      if (tool === "replace_layer_source") {
        if (sourceId(args, inventory) !== (direct ? snapshot.source.itemId : edge.sourceItemId)) reason = direct ? "accepted_source_conflict" : "accepted_route_source_conflict";
      } else if (tool === "set_layer_time_range") {
        const baseline = direct ? snapshot.timing : edge;
        if (["startTime", "inPoint", "outPoint"].some(field => args[field] !== undefined && !valueEqual(args[field], baseline[field]))) reason = direct ? "accepted_timing_conflict" : "accepted_route_timing_conflict";
        if (args.duration !== undefined && !valueEqual((args.inPoint === undefined ? baseline.inPoint : args.inPoint) + args.duration, baseline.outPoint)) reason = direct ? "accepted_timing_conflict" : "accepted_route_timing_conflict";
      } else if (tool === "set_layer_transform") {
        if (edge) reason = "unsupported_accepted_route_transform";
        else if (Object.keys(TRANSFORMS).some(field => args[field] !== undefined && !valueEqual(args[field], snapshot.transform[field]))) reason = "accepted_transform_conflict";
      } else {
        if (args.time !== undefined || args.keyframeTime !== undefined || args.setAtTime === true) reason = "unsupported_protected_property_animation";
        if (edge) reason = "unsupported_accepted_route_property";
        else {
          let key;
          try { key = propertyKey(args.propertyPath); } catch (_error) { reason = "unknown_protected_property_footprint"; }
          if (key) {
            const last = propertyPath(args.propertyPath).slice(-1)[0].matchName;
            if (["threeDLayer", "collapseTransformation", "motionBlur"].includes(last)) reason = "unsupported_protected_layer_attribute";
            if (last === "ADBE Time Remapping") reason = "accepted_time_remap_conflict";
            const transformField = Object.keys(TRANSFORMS).find(field => TRANSFORMS[field] === last && propertyPath(args.propertyPath)[0].matchName === "ADBE Transform Group");
            const protectedProperty = snapshot.properties.find(prop => samePropertyPath(prop.path, args.propertyPath));
            const expected = transformField ? snapshot.transform[transformField] : protectedProperty && protectedProperty.value;
            if (expected !== undefined && !valueEqual(args.value, expected)) reason = "accepted_property_conflict";
          }
        }
      }
      if (reason) conflicts.push({ index, tool, target: snapshot.target, reason });
    }
  }
  return { ok: conflicts.length === 0, code: conflicts.length ? "protected_placeholder_conflict" : null,
    conflicts, bindings, affected: [...affected] };
}

// Shared read/precondition code runs in the existing wrapped ExtendScript command.
const aeSupportScript = `
function __phFindComp(id) {
  for (var i=1;i<=app.project.numItems;i++) { var item=app.project.item(i); if(item instanceof CompItem && item.id===id) return item; }
  throw new Error("protected_comp_missing:"+id);
}
function __phFindLayer(comp,id) {
  for(var i=1;i<=comp.numLayers;i++) { var layer=comp.layer(i); if(layer.id===id) return layer; }
  throw new Error("protected_layer_missing:"+id);
}
function __phProperty(layer,segments) {
  var prop=layer;
  for(var i=0;i<segments.length;i++) {
    var s=segments[i];
    prop=prop.property(s.propertyIndex || s.matchName);
    if(!prop || prop.matchName!==s.matchName) throw new Error("protected_property_identity_mismatch");
  }
  return prop;
}
function __phReadValue(prop,unsupported) {
  unsupported=unsupported||[];
  if(!prop) { unsupported.push("missing_static_property"); return null; }
  if(prop.numKeys!==0) unsupported.push("unsupported_animated_property");
  if(typeof prop.expressionEnabled!=="boolean") unsupported.push("unknown_expression_property_state");
  if(prop.expressionEnabled===true) unsupported.push("unsupported_expression_property");
  try { if(prop.dimensionsSeparated===true || prop.isSeparationFollower===true) unsupported.push("unsupported_separated_dimensions"); } catch(e) {}
  var value=prop.value;
  if(value instanceof Array) { var copy=[]; for(var i=0;i<value.length;i++) copy.push(value[i]); return copy; }
  return value;
}
function __phEvidence(comp,layer,paths) {
  var unsupported=[];
  var transform={}; var group=layer.property("ADBE Transform Group");
  var names=${JSON.stringify(TRANSFORMS)};
  for(var key in names) if(names.hasOwnProperty(key)) {
    var prop=group ? group.property(names[key]) : null;
    if(prop) transform[key]=__phReadValue(prop,unsupported);
  }
  var properties=[];
  for(var p=0;p<paths.length;p++) { var custom=__phProperty(layer,paths[p]); properties.push({path:paths[p],value:__phReadValue(custom,unsupported)}); }
  var source=layer.source;
  var file=source && source.file;
  var isVideo=false;
  try { isVideo=source instanceof FootageItem && source.hasVideo===true && source.mainSource.isStill===false && source.duration>0; } catch(e) {}
  if(!isVideo) unsupported.push("unsupported_selected_non_video_source");
  var sourceRef=source ? {itemId:source.id,file:file && file.fsName ? file.fsName : null,footageMissing:source.footageMissing} : null;
  return {comp:{itemId:comp.id,itemIndex:__phProjectIndex(comp),name:comp.name,frameRate:comp.frameRate},
    layer:{id:layer.id,index:layer.index,name:layer.name,source:sourceRef,startTime:layer.startTime,inPoint:layer.inPoint,
      outPoint:layer.outPoint,stretch:layer.stretch,timeRemapEnabled:layer.timeRemapEnabled},transform:transform,properties:properties,unsupported:unsupported};
}
function __phProjectIndex(item) {for(var i=1;i<=app.project.numItems;i++) if(app.project.item(i)===item) return i; return null;}
function __phEqual(a,b) {
  if(a instanceof Array || b instanceof Array) { if(!(a instanceof Array) || !(b instanceof Array) || a.length!==b.length) return false; for(var i=0;i<a.length;i++) if(!__phEqual(a[i],b[i])) return false; return true; }
  if(typeof a==="number" && typeof b==="number") return isFinite(a) && isFinite(b) && Math.abs(a-b)<=0.0000001;
  return a===b;
}
function __phPath(value) {return String(value||"").replace(/\\\\/g,"/").toLowerCase();}
`;
function aeGuardScript(projectFile, snapshots, bindings = []) {
  return `${aeSupportScript}
// __codexPlaceholderProtectionGuard: authoritative server baseline, before undo.
if(!app.project.file || __phPath(app.project.file.fsName)!==__phPath(${JSON.stringify(projectFile)})) throw new Error("protected_project_identity_mismatch");
var __phExpected=${JSON.stringify(snapshots)};
for(var __ps=0;__ps<__phExpected.length;__ps++) {
  var expected=__phExpected[__ps]; var comp=__phFindComp(expected.target.compItemId); var layer=__phFindLayer(comp,expected.target.layerId);
  var paths=[]; for(var p=0;p<expected.properties.length;p++) paths.push(expected.properties[p].path);
  var current=__phEvidence(comp,layer,paths);
  if(current.unsupported.length) throw new Error("accepted_placeholder_drift:"+current.unsupported[0]);
  if(!current.layer.source || current.layer.source.itemId!==expected.source.itemId || __phPath(current.layer.source.file)!==__phPath(expected.source.file) || current.layer.source.footageMissing!==false) throw new Error("accepted_placeholder_drift:source");
  for(var key in expected.timing) if(expected.timing.hasOwnProperty(key) && !__phEqual(expected.timing[key],current.layer[key])) throw new Error("accepted_placeholder_drift:timing."+key);
  for(var key in expected.transform) if(expected.transform.hasOwnProperty(key) && !__phEqual(expected.transform[key],current.transform[key])) throw new Error("accepted_placeholder_drift:transform."+key);
  for(var p=0;p<expected.properties.length;p++) if(!__phEqual(expected.properties[p].value,current.properties[p].value)) throw new Error("accepted_placeholder_drift:property");
  for(var d=0;d<expected.dependencies.length;d++) {var edge=expected.dependencies[d];var ancestor=__phFindLayer(__phFindComp(edge.compItemId),edge.layerId);
    if(!ancestor.source || ancestor.source.id!==edge.sourceItemId) throw new Error("accepted_placeholder_drift:route_source");
    var fields=["startTime","inPoint","outPoint","stretch","timeRemapEnabled","enabled"];
    for(var f=0;f<fields.length;f++) if(!__phEqual(edge[fields[f]],ancestor[fields[f]])) throw new Error("accepted_placeholder_drift:route_timing");
  }
}
var __phBindings=${JSON.stringify(bindings)};
for(var b=0;b<__phBindings.length;b++) {var binding=__phBindings[b];var liveComp=app.project.item(binding.compItemIndex);
 if(!liveComp || liveComp.id!==binding.compItemId || !liveComp.layer(binding.layerIndex) || liveComp.layer(binding.layerIndex).id!==binding.layerId) throw new Error("protected_mutation_target_shifted");}
`;
}

function aeInventoryGuardScript(inventory) {
  const rows = inventory.comps.map(comp => ({ itemId: comp.itemId, numLayers: comp.layers.length, duration: comp.duration, frameRate: comp.frameRate,
    layers: comp.layers.map(layer => ({ id: layer.id, sourceItemId: layer.sourceItemId,
      enabled: layer.enabled, startTime: layer.startTime, inPoint: layer.inPoint, outPoint: layer.outPoint,
      stretch: layer.stretch, timeRemapEnabled: layer.timeRemapEnabled })) }));
  return `${aeSupportScript}
// __codexPlaceholderUsageGuard: authoritative usage must still match before undo.
var __phInventory=${JSON.stringify(rows)};
var __phSources=${JSON.stringify(inventory.sources.map(source => ({ itemId: source.itemId, file: source.file, duration: source.duration, footageMissing: source.footageMissing })))};
for(var s=0;s<__phSources.length;s++) {var row=__phSources[s];var source=null;
 for(var i=1;i<=app.project.numItems;i++)if(app.project.item(i).id===row.itemId)source=app.project.item(i);
 if(!source || __phPath(source.file && source.file.fsName)!==__phPath(row.file) || !__phEqual(source.duration,row.duration) || source.footageMissing!==row.footageMissing)throw new Error("placeholder_usage_changed:source_identity");
}
for(var c=0;c<__phInventory.length;c++) {var expected=__phInventory[c];var comp=__phFindComp(expected.itemId);
 if(comp.numLayers!==expected.numLayers)throw new Error("placeholder_usage_changed:layer_count");
 if(!__phEqual(comp.duration,expected.duration) || !__phEqual(comp.frameRate,expected.frameRate))throw new Error("placeholder_usage_changed:comp_timing");
 for(var l=0;l<expected.layers.length;l++) {var row=expected.layers[l];var layer=__phFindLayer(comp,row.id);
  if((layer.source ? layer.source.id : null)!==row.sourceItemId)throw new Error("placeholder_usage_changed:source");
  var fields=["enabled","startTime","inPoint","outPoint","stretch","timeRemapEnabled"];
  for(var f=0;f<fields.length;f++)if(!__phEqual(row[fields[f]],layer[fields[f]]))throw new Error("placeholder_usage_changed:timing");
 }
}
`;
}

module.exports = { TRANSFORMS, TARGET_SETTERS, targetKey, valueEqual, transformNumberEqual, canonicalize2DVector, transformValueEqual, validValue, validTransform, propertyPath, propertyKey,
  assertSupportedSetterIdentity, aeSetterIdentityGuard,
  normalizeProtectedPaths, validateSnapshot, snapshotFromEvidence, compareSnapshot, dependencyClosure,
  resolveTargets, sourceId, checkProtectedSteps, aeSupportScript, aeGuardScript, aeInventoryGuardScript };
