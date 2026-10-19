"use strict";
// Fixed ES3 programs for one open comp. No project file IO or render queue API.
const SLOT = "__aeAgentAMEOpenCompV1";
const literal = value => JSON.stringify(value).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

function observe(a) {
  function bad(code) { throw Error(code); }
  function num(value) { if (typeof value !== "number" || !isFinite(value)) bad("ame_open_number_unavailable"); return value; }
  function bool(value) { if (typeof value !== "boolean") bad("ame_open_boolean_unavailable"); return value; }
  function optional(value) { return value === undefined ? null : bool(value); }
  function norm(value) { return String(value || "").replace(/\\/g, "/").toLowerCase(); }
  if (!app.project || !app.project.file || typeof app.project.dirty !== "boolean" || app.project.renderQueue.rendering) bad("ame_open_project_unavailable_or_rendering");
  if (typeof BridgeTalk === "undefined" || String(BridgeTalk.appName).toLowerCase() !== "aftereffects") bad("ame_open_aftereffects_host_required");
  var target = null, i, j, graph = [], seen = {}, layerCount = 0, propertyCount = 0, expressionCount = 0, risks = [], propertySeen = {}, namedRootCount = 0;
  for (i = 1; i <= app.project.numItems; i++) if (app.project.item(i).id === a.compItemId) {
    if (target) bad("ame_open_comp_ambiguous"); target = app.project.item(i);
  }
  if (!(target instanceof CompItem)) bad("ame_open_comp_missing");
  // A deliberately small provable subset. Arbitrary expressions (including
  // computed comp()/CSV/sourceText references) are uncertain and block rename.
  function nameIndependent(text) {
    if (!/^[\s\d.eE+*\/%(),;\[\]?:<>=!&|^~_a-zA-Z-]+$/.test(text)) return false;
    var words = text.match(/[A-Za-z_][A-Za-z_0-9]*/g) || [], allowed = {value:1,time:1,index:1,Math:1,PI:1,E:1,abs:1,acos:1,asin:1,atan:1,atan2:1,ceil:1,cos:1,exp:1,floor:1,log:1,max:1,min:1,pow:1,random:1,round:1,sin:1,sqrt:1,tan:1,wiggle:1,linear:1,ease:1,easeIn:1,easeOut:1,clamp:1,length:1,normalize:1,seedRandom:1,"true":1,"false":1};
    for (var n = 0; n < words.length; n++) if (!allowed[words[n]]) return false;
    // Dot access is admitted only for named Math members and numeric literals.
    return !/(?:\b(?:value|time|index|wiggle|linear|ease|easeIn|easeOut|clamp|length|normalize|seedRandom))\s*\./.test(text);
  }
  function groupCount(group) {
    var count = group.numProperties;
    if (typeof count !== "number" || !isFinite(count) || count < 0 || Math.floor(count) !== count || count > 20000 || typeof group.property !== "function") bad("ame_open_expression_group_count_unavailable");
    return count;
  }
  function scanProperty(p, compId, layerId, parentPath, depth) {
    if (depth > 32) bad("ame_open_expression_depth_bound");
    if (!p || typeof PropertyType === "undefined") bad("ame_open_expression_property_unavailable");
    var index = p.propertyIndex, match = p.matchName, text, key, count, k;
    if (typeof index !== "number" || !isFinite(index) || index < 1 || Math.floor(index) !== index || typeof match !== "string" || !match) bad("ame_open_expression_property_identity_unavailable");
    key = parentPath + "/" + index;
    if (Object.prototype.hasOwnProperty.call(propertySeen,key)) {
      if (propertySeen[key] !== match) bad("ame_open_expression_property_identity_changed");
      return;
    }
    propertySeen[key] = match;
    if (++propertyCount > 20000) bad("ame_open_expression_property_bound");
    if (p.propertyType === PropertyType.PROPERTY) {
      if (typeof p.canSetExpression !== "boolean") bad("ame_open_expression_capability_unavailable");
      if (p.canSetExpression === true) {
        text = p.expression;
        if (typeof text !== "string" || text.length > 20000) bad("ame_open_expression_text_unavailable_or_bound");
        if (text.replace(/\s/g, "").length) {
          expressionCount++;
          if (!nameIndependent(text) && risks.length < 32) risks.push({compItemId:compId,layerId:layerId,property:match,reason:"uncertain_name_dependency",excerpt:text.slice(0,240)});
        }
      }
      return;
    }
    if (p.propertyType !== PropertyType.NAMED_GROUP && p.propertyType !== PropertyType.INDEXED_GROUP) bad("ame_open_expression_property_type_unsupported");
    count = groupCount(p);
    for (k = 1; k <= count; k++) scanProperty(p.property(k),compId,layerId,key,depth + 1);
  }
  function scanLayer(layer, compId) {
    // Layer.numProperties covers indexed mask/effect/tracker groups only.
    // Explicit named roots follow the AE match-name guide. A required missing
    // root, unknown layer kind, inaccessible group or malformed count fails closed.
    var kind = String(layer.matchName || ""), av = false, required = ["ADBE Transform Group"], optionalRoots = ["ADBE Marker"], k, p, count, path = compId + "/" + layer.id;
    if (typeof ThreeDModelLayer !== "undefined" && layer instanceof ThreeDModelLayer || typeof ParametricMeshLayer !== "undefined" && layer instanceof ParametricMeshLayer) bad("ame_open_expression_layer_kind_unsupported");
    if (kind === "ADBE AV Layer" && typeof AVLayer !== "undefined" && layer instanceof AVLayer) av = true;
    else if (kind === "ADBE Text Layer" && typeof TextLayer !== "undefined" && layer instanceof TextLayer) { av = true; required.push("ADBE Text Properties"); }
    else if (kind === "ADBE Vector Layer" && typeof ShapeLayer !== "undefined" && layer instanceof ShapeLayer) { av = true; required.push("ADBE Root Vectors Group"); }
    else if (kind === "ADBE Camera Layer" && typeof CameraLayer !== "undefined" && layer instanceof CameraLayer) required.push("ADBE Camera Options Group");
    else if (kind === "ADBE Light Layer" && typeof LightLayer !== "undefined" && layer instanceof LightLayer) required.push("ADBE Light Options Group");
    else bad("ame_open_expression_layer_kind_unsupported");
    if (av) {
      optionalRoots = optionalRoots.concat(["ADBE Time Remapping","ADBE Audio Group","ADBE Layer Overrides","ADBE Layer Styles","ADBE Blend Options Group","ADBE Material Options Group","ADBE Plane Options Group","ADBE Extrsn Options Group"]);
      if (layer.hasAudio === true) required.push("ADBE Audio Group");
      if (layer.timeRemapEnabled === true) required.push("ADBE Time Remapping");
      if (layer.threeDLayer === true) required.push("ADBE Material Options Group");
    }
    try {
      count = groupCount(layer);
      for (k = 1; k <= count; k++) scanProperty(layer.property(k),compId,layer.id,path,1);
      for (k = 0; k < required.length; k++) { p = layer.property(required[k]); if (!p) bad("ame_open_expression_required_root_unavailable:" + required[k]); if (p.matchName !== required[k]) bad("ame_open_expression_named_root_identity_changed"); scanProperty(p,compId,layer.id,path,1); namedRootCount++; }
      for (k = 0; k < optionalRoots.length; k++) { p = layer.property(optionalRoots[k]); if (p !== null) { if (!p || p.matchName !== optionalRoots[k]) bad("ame_open_expression_optional_root_unavailable"); scanProperty(p,compId,layer.id,path,1); namedRootCount++; } }
    } catch (error) { bad("ame_open_expression_inspection_incomplete:" + String(error.message || error)); }
  }
  function walk(comp, stack) {
    var key = String(comp.id), rows = [], next = [], k, layer, source, n;
    for (n = 0; n < stack.length; n++) if (stack[n] === comp.id) bad("ame_open_comp_cycle");
    if (seen[key]) return; seen[key] = true;
    if (graph.length >= 100) bad("ame_open_comp_graph_bound");
    var node = {id:num(comp.id),name:String(comp.name),width:num(comp.width),height:num(comp.height),pixelAspect:num(comp.pixelAspect),duration:num(comp.duration),frameDuration:num(comp.frameDuration),displayStartTime:num(comp.displayStartTime),workAreaStart:num(comp.workAreaStart),workAreaDuration:num(comp.workAreaDuration),layers:rows}; graph.push(node);
    if (node.workAreaStart < 0 || node.workAreaDuration <= 0 || node.workAreaStart + node.workAreaDuration > node.duration + 0.0000001) bad("ame_open_work_area_invalid");
    for (k = 1; k <= comp.numLayers; k++) {
      if (++layerCount > 1000) bad("ame_open_layer_bound");
      layer = comp.layer(k); source = layer.source;
      rows.push({id:num(layer.id),index:k,name:String(layer.name),enabled:bool(layer.enabled),solo:bool(layer.solo),locked:bool(layer.locked),audioEnabled:optional(layer.audioEnabled),hasAudio:optional(layer.hasAudio),guideLayer:optional(layer.guideLayer),startTime:num(layer.startTime),inPoint:num(layer.inPoint),outPoint:num(layer.outPoint),stretch:num(layer.stretch),sourceItemId:source?num(source.id):null,parentId:layer.parent?num(layer.parent.id):null});
      scanLayer(layer, comp.id);
      if (source instanceof CompItem) next.push(source);
    }
    for (k = 0; k < next.length; k++) walk(next[k], stack.concat([comp.id]));
  }
  walk(target, []);
  var version = String(app.version || ""), build = String(app.buildNumber || ""), locale = String(app.isoLanguage || ""), labels = {en_US:"Add to Adobe Media Encoder Queue...",ru_RU:"Добавить в очередь Adobe Media Encoder..."};
  var label = labels[locale] || null, commandId = 0;
  if (label && typeof app.findMenuCommandId === "function" && typeof app.executeCommand === "function") commandId = app.findMenuCommandId(label);
  var menu = {version:version,buildNumber:build,locale:locale,label:label,commandId:commandId,available:!!label && version.length > 0 && version.length <= 128 && !/[\x00-\x1f]/.test(version) && /^[0-9]+$/.test(build) && typeof commandId === "number" && isFinite(commandId) && commandId > 0 && Math.floor(commandId) === commandId};
  var dependencyStatus = "no_expressions"; if (expressionCount) dependencyStatus = "proven_name_independent_subset"; if (risks.length) dependencyStatus = "blocked";
  return {schema:"ae-agent-ame-open-comp-observation.v1",application:"aftereffects",snapshot:{projectFile:String(app.project.file.fsName),revision:num(app.project.revision),compItemId:a.compItemId,graph:graph},dirty:app.project.dirty,
    nameDependencies:{status:dependencyStatus,complete:true,coverage:"explicit_named_layer_roots_v1",expressionCount:expressionCount,propertyCount:propertyCount,namedRootCount:namedRootCount,risks:risks},menu:menu,
    range:{startSeconds:target.workAreaStart,endSeconds:target.workAreaStart+target.workAreaDuration}};
}

function execute(p) {
  function equal(a, b) { return openEqual(a,b); }
  function bad(code) { throw Error(code); }
  var slots = $.global.__aeAgentAMEOpenCompV1;
  if (!slots) { slots = {}; $.global.__aeAgentAMEOpenCompV1 = slots; }
  if (Object.prototype.hasOwnProperty.call(slots,p.intentId)) bad("ame_open_native_no_replay");
  var count = 0, key, i, j, comp = null, layers = [], before = null;
  for (key in slots) if (Object.prototype.hasOwnProperty.call(slots,key)) count++;
  if (count >= 512) bad("ame_open_native_slot_bound");
  // Latch exists before the first setter, and menu latch before executeCommand.
  var slot = {schema:p.schema,intentId:p.intentId,binding:p.binding,runId:p.runId,phase:"started",dispatchAttempted:false,dispatchReturned:false,restoreAttempted:false,restored:false,applied:[],lastObserved:null,error:null}; slots[p.intentId] = slot;
  try {
    if (new Date().getTime() >= p.deadline) bad("ame_open_deadline");
    before = openObserve(p.selector);
    if (!equal(before,p.before) || before.nameDependencies.status === "blocked" || before.menu.available !== true || !equal(before.menu,p.menu)) bad("ame_open_native_baseline_or_menu_changed");
    for (i = 1; i <= app.project.numItems; i++) { var item = app.project.item(i); if (String(item.name) === p.marker) bad("ame_open_marker_collision"); if (item.id === p.selector.compItemId) comp = item; }
    if (!(comp instanceof CompItem)) bad("ame_open_comp_missing");
    for (i = 0; i < p.patch.length; i++) {
      for (j = 1; j <= comp.numLayers; j++) if (comp.layer(j).id === p.patch[i].layerId) layers[i] = comp.layer(j);
      if (!layers[i] || layers[i].locked || layers[i].enabled !== p.patch[i].before) bad("ame_open_layer_baseline_changed");
    }
    if (new Date().getTime() >= p.deadline) bad("ame_open_deadline");
    slot.phase = "applying";
    comp.name = p.marker;
    if (String(comp.name) !== p.marker) bad("ame_open_marker_set_failed");
    slot.applied.push({kind:"name",before:p.beforeName,after:p.marker});
    for (i = 0; i < p.patch.length; i++) {
      if (p.patch[i].before === p.patch[i].after) continue;
      layers[i].enabled = p.patch[i].after;
      if (layers[i].enabled !== p.patch[i].after) bad("ame_open_flag_set_failed");
      slot.applied.push({kind:"enabled",layerId:p.patch[i].layerId,before:p.patch[i].before,after:p.patch[i].after});
    }
    slot.lastObserved = openObserve(p.selector);
    var current = slot.lastObserved.snapshot, actualRevision = current.revision; current.revision = p.wanted.revision;
    var preserved = equal(current,p.wanted); current.revision = actualRevision;
    if (!preserved) bad("ame_open_patch_preservation_changed");
    // Inspect the command binding again immediately before a single menu call.
    if (!equal(slot.lastObserved.menu,p.menu) || new Date().getTime() >= p.deadline) bad("ame_open_menu_or_deadline_changed");
    var viewer = comp.openInViewer();
    if (!viewer || typeof viewer.setActive !== "function" || viewer.setActive() === false || app.project.activeItem !== comp) bad("ame_open_viewer_not_active");
    if (new Date().getTime() >= p.deadline) bad("ame_open_deadline");
    slot.phase = "dispatch_latched"; slot.dispatchAttempted = true;
    app.executeCommand(p.menu.commandId);
    slot.dispatchReturned = true; slot.phase = "native_dispatched";
    slot.lastObserved = openObserve(p.selector);
    return slot;
  } catch (error) { slot.phase = "unknown"; slot.error = String(error.message || error); try { slot.lastObserved = openObserve(p.selector); } catch (_) {} return slot; }
}

function restore(p) {
  function bad(code) { throw Error(code); }
  var slots = $.global.__aeAgentAMEOpenCompV1, slot = slots && slots[p.intentId], i, j, comp = null, layers = [], current;
  if (!slot || slot.binding !== p.binding || slot.runId !== p.originalRunId || slot.restoreAttempted || slot.restored) bad("ame_open_exact_restore_slot_required");
  if (new Date().getTime() >= p.deadline) bad("ame_open_deadline");
  current = openObserve(p.selector);
  if (!openEqual(current,p.expectedCurrent)) bad("ame_open_restore_manual_drift");
  for (i = 1; i <= app.project.numItems; i++) if (app.project.item(i).id === p.selector.compItemId) comp = app.project.item(i);
  if (!(comp instanceof CompItem) || String(comp.name) !== p.marker) bad("ame_open_restore_owned_marker_required");
  for (i = 0; i < slot.applied.length; i++) if (slot.applied[i].kind === "enabled") {
    for (j = 1; j <= comp.numLayers; j++) if (comp.layer(j).id === slot.applied[i].layerId) layers[i] = comp.layer(j);
    if (!layers[i] || layers[i].locked || layers[i].enabled !== slot.applied[i].after) bad("ame_open_restore_flag_drift");
  }
  slot.restoreAttempted = true; slot.phase = "restore_latched";
  try {
    if (!slot.dispatchReturned) for (i = slot.applied.length - 1; i >= 0; i--) if (slot.applied[i].kind === "enabled") layers[i].enabled = slot.applied[i].before;
    comp.name = p.beforeName;
    slot.lastObserved = openObserve(p.selector);
    var snapshot = slot.lastObserved.snapshot, actualRevision = snapshot.revision; snapshot.revision = p.restoredSnapshot.revision;
    var preserved = openEqual(snapshot,p.restoredSnapshot); snapshot.revision = actualRevision;
    if (!preserved) bad("ame_open_restore_preservation_changed");
    // Never reset dirty, revision, viewer, work area, or any other user state.
    slot.restored = true; slot.restoreScope = slot.dispatchReturned ? "name_only" : "proven_partial_property_rollback"; slot.phase = "restored"; return slot;
  } catch (error) { slot.phase = "unknown"; slot.error = String(error.message || error); try { slot.lastObserved = openObserve(p.selector); } catch (_) {} return slot; }
}
function equal(a,b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== typeof b || typeof a !== "object") return false;
  var ka = [], kb = [], k, i;
  for (k in a) if (Object.prototype.hasOwnProperty.call(a,k)) ka.push(k);
  for (k in b) if (Object.prototype.hasOwnProperty.call(b,k)) kb.push(k);
  ka.sort(); kb.sort(); if (ka.length !== kb.length) return false;
  for (i = 0; i < ka.length; i++) if (ka[i] !== kb[i] || !equal(a[ka[i]],b[kb[i]])) return false;
  return true;
}
const prelude = `var openObserve=${observe.toString()};var openEqual=${equal.toString()};`;
const observeScript = args => `${prelude}return openObserve(${literal(args)});`;
const dispatchScript = program => `${prelude}var openExecute=${execute.toString()};return openExecute(${literal(program)});`;
const restoreScript = program => `${prelude}var openRestore=${restore.toString()};return openRestore(${literal(program)});`;
const lookupScript = intentId => `var s=$.global.${SLOT};return s&&Object.prototype.hasOwnProperty.call(s,${literal(intentId)})?s[${literal(intentId)}]:null;`;
const identityScript = () => 'if(typeof BridgeTalk==="undefined"||String(BridgeTalk.appName).toLowerCase()!=="aftereffects")throw Error("ame_open_aftereffects_host_required");return {projectFile:app.project&&app.project.file?String(app.project.file.fsName):null};';
module.exports = {SLOT,observe,execute,restore,equal,observeScript,dispatchScript,restoreScript,lookupScript,identityScript};
