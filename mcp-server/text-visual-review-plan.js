"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const { buildCompVisualReviewPlan, MAX_COMPS } = require("./comp-visual-review-plan");
const { sha256, canonical } = require("./review-evidence");
const { normalizeProject } = require("./proposal-state");

// This wrapper adds observations to the existing frame builder, never a bounds oracle.
const MAX_FRAMES = 3;
const MAX_STEPS = 18;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SOURCE_TEXT_PATH = Object.freeze(["ADBE Text Properties", "ADBE Text Document"]);
const CHECKS = Object.freeze(["staticSourceText", "transformedBounds", "phaseCoverage", "fontDifference"]);
const PHASES = Object.freeze(["entry", "hold", "exit"]);
const DETERMINISTIC_CASES = Object.freeze({
  "scaled-precomp-text": Object.freeze({ id: "scaled-precomp-text", rootSize: [1920,1080], rootFps: 30,
    precompSize: [1280,720], textScale: [125,85], textAnchor: [40,20], parentScale: [65,65], parentPosition: [1040,600],
    frames: [{time:0,phase:"entry"},{time:1,phase:"hold"},{time:2.5,phase:"exit"}] }),
  "offset-stretch-phases": Object.freeze({ id: "offset-stretch-phases", startTime: 1.2, stretch: 150,
    frames: [{time:1.2,phase:"entry"},{time:2.2,phase:"hold"},{time:3.2,phase:"exit"}], staticSourceText: true }),
  "accents-descenders": Object.freeze({ id: "accents-descenders", expectedText: "ÁÉÍÓÚ ЙЁ\ragjpqy",
    frames: [{time:1,phase:"hold"}] }),
  "font-difference": Object.freeze({ id: "font-difference", requiresFontRequest: true,
    frames: [{time:1,phase:"hold"}] })
});

function invalid(code, message = code) { throw Object.assign(new Error(message), {code}); }
function plainObject(value) { return !!value && typeof value === "object" && !Array.isArray(value)
  && [Object.prototype,null].includes(Object.getPrototypeOf(value)); }
function exactKeys(value, required, optional = [], code = "invalid_input_shape") {
  if (!plainObject(value) || required.some(k => !Object.hasOwn(value,k))
    || Object.keys(value).some(k => !required.includes(k) && !optional.includes(k))) invalid(code);
}
function positiveId(value) { return Number.isSafeInteger(value) && value > 0; }
function same(a,b) { try { return canonical(a) === canonical(b); } catch (_) { return false; } }
function validateTextVisualReviewInput(input) {
  exactKeys(input,["caseId","rootCompItemId","textTarget","route","frames","checks","expectedText"],["fontRequest"]);
  if (typeof input.caseId !== "string" || !Object.hasOwn(DETERMINISTIC_CASES,input.caseId)) invalid("invalid_case_id");
  if (!positiveId(input.rootCompItemId)) invalid("invalid_root_comp_id");
  exactKeys(input.textTarget,["compItemId","layerId"],[],"invalid_text_target_shape");
  if (!positiveId(input.textTarget.compItemId) || !positiveId(input.textTarget.layerId)) invalid("invalid_text_target");
  if (!Array.isArray(input.route) || input.route.length > 1) invalid("invalid_route_shape");
  if (input.route.length) {
    const hop = input.route[0];
    exactKeys(hop,["parentCompItemId","layerId","childCompItemId"],[],"invalid_route_hop_shape");
    if (![hop.parentCompItemId,hop.layerId,hop.childCompItemId].every(positiveId)
      || hop.parentCompItemId !== input.rootCompItemId || hop.childCompItemId !== input.textTarget.compItemId
      || hop.parentCompItemId === hop.childCompItemId) invalid("route_mismatch");
  } else if (input.textTarget.compItemId !== input.rootCompItemId) invalid("route_mismatch");
  if (!Array.isArray(input.frames) || input.frames.length < 1 || input.frames.length > MAX_FRAMES) invalid("invalid_frames");
  const seen = new Set();
  for (const frame of input.frames) {
    exactKeys(frame,["time","phase"],[],"invalid_frame_shape");
    if (!Number.isFinite(frame.time) || frame.time < 0) invalid("invalid_time");
    if (!PHASES.includes(frame.phase)) invalid("invalid_phase");
    if (seen.has(frame.time)) invalid("duplicate_frame");
    seen.add(frame.time);
  }
  if (!Array.isArray(input.checks) || !input.checks.includes("staticSourceText") || new Set(input.checks).size !== input.checks.length
    || input.checks.some(c => !CHECKS.includes(c))) invalid("invalid_checks");
  if (typeof input.expectedText !== "string") invalid("invalid_expected_text");
  if (input.caseId === "accents-descenders" && input.expectedText !== DETERMINISTIC_CASES[input.caseId].expectedText) invalid("invalid_expected_text");
  if (input.fontRequest !== undefined) {
    exactKeys(input.fontRequest,["runId","stepIndex"],[],"invalid_font_request_shape");
    if (typeof input.fontRequest.runId !== "string" || !UUID_REGEX.test(input.fontRequest.runId)) invalid("invalid_font_request_run_id");
    if (!positiveId(input.fontRequest.stepIndex)) invalid("invalid_font_request_step_index");
  } else if (input.caseId === "font-difference" || input.checks.includes("fontDifference")) invalid("missing_font_request");
  return true;
}

function projectSnapshot(info) {
  if (!plainObject(info) || typeof info.file !== "string" || !path.isAbsolute(info.file)
    || path.extname(info.file).toLowerCase() !== ".aep") invalid("no_active_named_project");
  if (info.supported?.revision !== true || !Number.isSafeInteger(info.revision) || info.revision < 0) invalid("project_revision_unavailable");
  if (!Number.isSafeInteger(info.numItems) || info.numItems < 1) invalid("project_inventory_unavailable");
  return {file:info.file, revision:info.revision, numItems:info.numItems, projectId:sha256(normalizeProject(info.file))};
}

function layerObservation(payload, target, expectedText, childCompItemId = null) {
  const comp = payload?.comp, layer = payload?.layer;
  if (!plainObject(payload) || payload.ok === false || comp?.itemId !== target.compItemId
    || layer?.id !== target.layerId || !positiveId(comp.itemIndex) || !positiveId(layer.index)
    || typeof comp.name !== "string" || !Number.isFinite(comp.time)) invalid("layer_identity_mismatch");
  // TextLayer has intrinsic continuous rasterization. Collapsed precomp routes remain unsupported.
  if (layer.threeDLayer !== false || layer.timeRemapEnabled !== false
    || (childCompItemId !== null ? layer.collapseTransformation !== false : typeof layer.collapseTransformation !== "boolean")
    || layer.parent !== null) invalid("unsupported_layer_route");
  if (![layer.startTime,layer.inPoint,layer.outPoint,layer.stretch].every(Number.isFinite)
    || layer.outPoint <= layer.inPoint || layer.stretch <= 0) invalid("unsupported_layer_timing");
  const transform = {};
  for (const key of ["anchorPoint","position","scale","rotation","opacity"]) {
    const prop = payload.transform?.[key];
    const valueValid = prop?.kind === "number" ? Number.isFinite(prop.value)
      : prop?.kind === "array" && Array.isArray(prop.value) && [2,3].includes(prop.value.length) && prop.value.every(Number.isFinite);
    if (!valueValid || !Number.isSafeInteger(prop.numKeys) || prop.numKeys < 0
      || typeof prop.expressionEnabled !== "boolean" || prop.truncated === true) invalid("transform_observation_incomplete");
    transform[key] = {kind:prop.kind,value:prop.value,numKeys:prop.numKeys,expressionEnabled:prop.expressionEnabled,
      dimensionsSeparated:prop.dimensionsSeparated === true};
  }
  const result = {compItemId:comp.itemId,compItemIndex:comp.itemIndex,compName:comp.name,time:comp.time,
    layerId:layer.id,layerIndex:layer.index,startTime:layer.startTime,inPoint:layer.inPoint,outPoint:layer.outPoint,
    stretch:layer.stretch,threeDLayer:false,timeRemapEnabled:false,collapseTransformation:layer.collapseTransformation,parent:null,transform};
  if (childCompItemId !== null) {
    if (layer.source?.itemId !== childCompItemId || layer.source?.type !== "comp") invalid("route_source_mismatch");
    result.sourceCompItemId = layer.source.itemId;
  } else {
    const doc = payload.text?.kind === "TextDocument" ? payload.text : layer.text;
    if (layer.textLayer !== true || layer.layerKind !== "text" || layer.matchName !== "ADBE Text Layer" || layer.source !== null
      || doc?.kind !== "TextDocument"
      || doc.text !== expectedText || typeof doc.font !== "string" || !doc.font
      || !Number.isFinite(doc.fontSize) || doc.fontSize <= 0 || typeof doc.justification !== "string" || !doc.justification) invalid("text_observation_incomplete");
    // If both normal previews are present, neither may contradict the other.
    for (const candidate of [payload.text,layer.text]) if (candidate != null && (!same(
      [candidate.kind,candidate.text,candidate.font,candidate.fontSize,candidate.justification],
      [doc.kind,doc.text,doc.font,doc.fontSize,doc.justification]))) invalid("text_preview_mismatch");
    const rows = payload.protectedProperties;
    if (!Array.isArray(rows) || rows.length !== 1 || !Array.isArray(rows[0]?.path) || rows[0].path.length !== 2
      || rows[0].path.some((segment,i) => segment?.matchName !== SOURCE_TEXT_PATH[i])
      || rows[0].numKeys !== 0 || rows[0].expressionEnabled !== false) invalid("static_source_text_unproven");
    result.matchName = layer.matchName;
    result.text = {kind:doc.kind,text:doc.text,font:doc.font,fontSize:doc.fontSize,justification:doc.justification};
    // protected.value is a bounded preview; static metadata and the normal preview are the proof.
    result.staticSourceText = true;
  }
  return result;
}

function observationsMatch(before, after) {
  if (!before || !after) return false;
  const technical = value => Object.fromEntries(Object.entries(value).filter(([k]) => k !== "time" && k !== "transform"));
  if (!same(technical(before),technical(after))) return false;
  for (const key of Object.keys(before.transform || {})) {
    const a = before.transform[key], b = after.transform?.[key];
    if (!b || !same({kind:a.kind,numKeys:a.numKeys,expressionEnabled:a.expressionEnabled,dimensionsSeparated:a.dimensionsSeparated},
      {kind:b.kind,numKeys:b.numKeys,expressionEnabled:b.expressionEnabled,dimensionsSeparated:b.dimensionsSeparated})) return false;
    const dynamic = a.numKeys > 0 || a.expressionEnabled || a.dimensionsSeparated;
    if ((!dynamic || before.time === after.time) && !same(a.value,b.value)) return false;
  }
  return true;
}

function textReadStep(target, text = false) {
  return {tool:"get_layer_details",args:{compItemId:target.compItemId,layerId:target.layerId,
    ...(text ? {protectedProperties:[Array.from(SOURCE_TEXT_PATH)]} : {})}};
}

function buildTextVisualReviewPlan(input, context, reviewId = crypto.randomUUID()) {
  validateTextVisualReviewInput(input);
  const project = projectSnapshot(context?.project);
  if (context.projectFile !== project.file) invalid("stale_project");
  const text = layerObservation(context.textObservation,input.textTarget,input.expectedText);
  const routeTarget = input.route.length ? {compItemId:input.route[0].parentCompItemId,layerId:input.route[0].layerId} : null;
  const route = routeTarget ? layerObservation(context.routeObservation,routeTarget,null,input.route[0].childCompItemId) : null;
  for (const observation of [text,route].filter(Boolean)) {
    const comp = context.comps?.find(c => c.itemId === observation.compItemId);
    if (!comp || comp.itemIndex !== observation.compItemIndex || comp.name !== observation.compName) invalid("layer_comp_mismatch");
  }
  const base = buildCompVisualReviewPlan({targets:[{compItemId:input.rootCompItemId,times:input.frames.map(f=>f.time)}]},context,reviewId);
  if (base.review.frames.length !== input.frames.length) invalid("duplicate_frame");
  const pre = [textReadStep(input.textTarget,true),...(routeTarget ? [textReadStep(routeTarget)] : [])];
  const exports = base.plan.steps.slice(1,1+base.review.frames.length);
  const post = pre.map(s=>JSON.parse(JSON.stringify(s)));
  const steps = [base.plan.steps[0],...pre,...exports,...post,...base.plan.steps.slice(1+exports.length)];
  if (steps.length > MAX_STEPS) invalid("step_limit_exceeded");
  const exportStart = 2+pre.length, postStart = exportStart+exports.length, compStart = postStart+post.length;
  const frames = base.review.frames.map((f,i)=>({...f,stepIndex:exportStart+i,ordinal:i+1,phase:input.frames[i].phase}));
  const textReview = {schema:"ae-agent-text-visual-review.v1",caseId:input.caseId,rootCompItemId:input.rootCompItemId,
    textTarget:{...input.textTarget},route:JSON.parse(JSON.stringify(input.route)),frames,checks:[...input.checks],
    expectedText:input.expectedText,fontRequest:input.fontRequest ? {...input.fontRequest} : null,
    observation:{project,text,route,comps:JSON.parse(JSON.stringify(context.comps))},declarations:{initialProjectInfoStepIndex:1,preReadTextStepIndex:2,
      preReadRouteStepIndices:route ? [3] : [],exportStepIndices:frames.map(f=>f.stepIndex),postReadTextStepIndex:postStart,
      postReadRouteStepIndices:route ? [postStart+1] : [],postReadCompStepIndices:[compStart],finalProjectInfoStepIndex:steps.length}};
  return {...base,plan:{...base.plan,summary:`Проверить текст ${input.caseId}: ${frames.length} кадров.`,steps,textReview},
    review:{...base.review,caseId:input.caseId,frames,limits:{...base.review.limits,visibleBoundsVerified:false,fontRenderingVerified:false}}};
}

// The supplied callback is the daemon's existing typed, logged, payload-decoded read path.
async function observeTextVisualReviewPlan(input, read, reviewId) {
  validateTextVisualReviewInput(input); // Malformed inputs issue zero native reads.
  const first = projectSnapshot(await read("get_project_info",{}));
  const ids = [...new Set([input.rootCompItemId,input.textTarget.compItemId])];
  const comps = [];
  for (const id of ids) {
    const comp = await read("get_comp_details",{compItemId:id,includeLayers:false});
    const itemId = comp?.itemId ?? comp?.id, itemIndex = comp?.itemIndex ?? comp?.index;
    if (itemId !== id) invalid("requested_comp_not_observed");
    comps.push({itemId,itemIndex,name:comp.name,width:comp.width,height:comp.height,frameRate:comp.frameRate,duration:comp.duration});
  }
  const textObservation = await read("get_layer_details",textReadStep(input.textTarget,true).args);
  layerObservation(textObservation,input.textTarget,input.expectedText);
  let routeObservation = null;
  if (input.route.length) {
    const hop = input.route[0];
    routeObservation = await read("get_layer_details",{compItemId:hop.parentCompItemId,layerId:hop.layerId});
    layerObservation(routeObservation,{compItemId:hop.parentCompItemId,layerId:hop.layerId},null,hop.childCompItemId);
  }
  const project = projectSnapshot(await read("get_project_info",{}));
  if (!same(first,project)) invalid("stale_project");
  return buildTextVisualReviewPlan(input,{projectFile:project.file,project:{...project,supported:{revision:true}},
    observedAt:new Date().toISOString(),comps,textObservation,routeObservation},reviewId);
}

function getTextVisualReviewBuilderContract() {
  const id = {type:"integer",minimum:1};
  return {solutionId:"text-visual-review-plan",inputSchema:{type:"object",additionalProperties:false,
    required:["caseId","rootCompItemId","textTarget","route","frames","checks","expectedText"],properties:{
      caseId:{type:"string",enum:Object.keys(DETERMINISTIC_CASES)},rootCompItemId:id,
      textTarget:{type:"object",additionalProperties:false,required:["compItemId","layerId"],properties:{compItemId:id,layerId:id}},
      route:{type:"array",maxItems:1,items:{type:"object",additionalProperties:false,required:["parentCompItemId","layerId","childCompItemId"],
        properties:{parentCompItemId:id,layerId:id,childCompItemId:id}}},
      frames:{type:"array",minItems:1,maxItems:MAX_FRAMES,items:{type:"object",additionalProperties:false,required:["time","phase"],
        properties:{time:{type:"number",minimum:0},phase:{type:"string",enum:PHASES}}}},
      checks:{type:"array",minItems:1,uniqueItems:true,items:{type:"string",enum:CHECKS}},expectedText:{type:"string"},
      fontRequest:{type:"object",additionalProperties:false,required:["runId","stepIndex"],properties:{runId:{type:"string",pattern:UUID_REGEX.source},stepIndex:id}}
    }},outputContract:{previewOnly:true,mutatesProject:false,maxSteps:MAX_STEPS,textReviewVariant:true}};
}

module.exports = {buildTextVisualReviewPlan,observeTextVisualReviewPlan,validateTextVisualReviewInput,getTextVisualReviewBuilderContract,
  projectSnapshot,layerObservation,observationsMatch,textReadStep,same,DETERMINISTIC_CASES,MAX_COMPS,MAX_FRAMES,MAX_STEPS};
