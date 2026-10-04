"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { verifyCompletePngBuffer, sameFileSnapshot, DEFAULT_MAX_PNG_BYTES } = require("./generated-png-proof");

const UUID_PATTERN = "^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$";
const UUID_REGEX = new RegExp(UUID_PATTERN, "i");
const REVIEW_FILENAME_REGEX = /^comp-review-([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})-(\d+)\.png$/i;

const MIN_PLAN_STEPS = 4;
const MAX_PLAN_STEPS = 18;
const MAX_FRAMES = 12;
const MAX_COMPS = 4;

const getCompVisualReviewManifestTool = Object.freeze({
  name: "get_comp_visual_review_manifest",
  description: "Read server-stored plan run record and verify exported review PNGs against path containment and complete PNG proofs.",
  inputSchema: Object.freeze({
    type: "object",
    required: ["runId"],
    additionalProperties: false,
    properties: Object.freeze({
      runId: Object.freeze({
        type: "string",
        pattern: UUID_PATTERN,
        description: "Exact UUID of the completed review plan run."
      })
    })
  })
});

function manifestError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function verifyPathContainment(exportRoot, targetPath) {
  if (!exportRoot || typeof exportRoot !== "string") throw manifestError("invalid_export_root", "exportRoot is required");
  const resolvedExport = path.resolve(exportRoot);
  const resolvedTarget = path.resolve(targetPath);
  const rel = path.relative(resolvedExport, resolvedTarget);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw manifestError("path_containment_violation", "Export file path escapes export root");
  }
  if (fs.existsSync(resolvedTarget)) {
    let realExport = resolvedExport;
    try { realExport = fs.realpathSync(resolvedExport); } catch (_) {}
    let realTarget = resolvedTarget;
    try { realTarget = fs.realpathSync(resolvedTarget); } catch (_) {}
    const realRel = path.relative(realExport, realTarget);
    if (realRel === "" || realRel.startsWith("..") || path.isAbsolute(realRel)) {
      throw manifestError("path_containment_violation", "Export file symlink escapes export root");
    }
    return realTarget;
  }
  return resolvedTarget;
}

function readAndVerifyPng(filePath, expectedSha256, expectedWidth, expectedHeight, verifyPngFn) {
  if (!fs.existsSync(filePath)) {
    return { ok: false, reason: "file_not_found" };
  }
  let statBefore;
  try { statBefore = fs.statSync(filePath); }
  catch (e) { return { ok: false, reason: "stat_failed", error: e.message }; }

  if (!statBefore.isFile()) return { ok: false, reason: "not_a_file" };
  if (statBefore.size === 0) return { ok: false, reason: "file_empty" };
  if (statBefore.size > DEFAULT_MAX_PNG_BYTES) return { ok: false, reason: "file_oversize" };

  let buffer;
  try { buffer = fs.readFileSync(filePath); }
  catch (e) { return { ok: false, reason: "read_failed", error: e.message }; }

  let statAfter;
  try { statAfter = fs.statSync(filePath); }
  catch (e) { return { ok: false, reason: "stat_after_read_failed", error: e.message }; }

  if (!sameFileSnapshot(statBefore, statAfter, buffer.length)) {
    return { ok: false, reason: "concurrent_modification" };
  }

  const proof = typeof verifyPngFn === "function"
    ? verifyPngFn(buffer)
    : verifyCompletePngBuffer(buffer);

  if (!proof || !proof.ok) {
    return { ok: false, reason: "invalid_png", error: proof && proof.reason };
  }

  if (expectedSha256 && proof.sha256 !== expectedSha256) {
    return { ok: false, reason: "sha256_mismatch", expected: expectedSha256, actual: proof.sha256 };
  }

  if (expectedWidth !== undefined && expectedHeight !== undefined) {
    if (proof.width !== expectedWidth || proof.height !== expectedHeight) {
      return { ok: false, reason: "dimensions_mismatch", expected: [expectedWidth, expectedHeight], actual: [proof.width, proof.height] };
    }
  }

  return {
    ok: true,
    sha256: proof.sha256,
    width: proof.width,
    height: proof.height,
    byteLength: buffer.length
  };
}

function validateBuilderPlanShape(planSteps) {
  if (!Array.isArray(planSteps)) {
    throw manifestError("non_builder_plan", "Plan steps must be an array");
  }
  if (planSteps.length < MIN_PLAN_STEPS || planSteps.length > MAX_PLAN_STEPS) {
    throw manifestError("non_builder_plan", `Plan steps count ${planSteps.length} out of bounded range [${MIN_PLAN_STEPS}, ${MAX_PLAN_STEPS}]`);
  }

  // Initial step must be get_project_info
  const firstStep = planSteps[0];
  if (!firstStep || typeof firstStep !== "object" || firstStep.tool !== "get_project_info") {
    throw manifestError("non_builder_plan", "Initial plan step must be get_project_info");
  }
  if (!firstStep.args || typeof firstStep.args !== "object" || Array.isArray(firstStep.args)) {
    throw manifestError("non_builder_plan", "Initial get_project_info step args must be an object");
  }

  // Contiguous save_comp_frame_png steps (ordinals 1..K)
  let k = 1;
  const exportSteps = [];
  let reviewId = null;
  const seenCompIds = [];

  while (k < planSteps.length && planSteps[k] && planSteps[k].tool === "save_comp_frame_png") {
    const step = planSteps[k];
    const ordinal = k; // 1-based contiguous ordinal
    const args = step.args;

    if (!args || typeof args !== "object" || Array.isArray(args)) {
      throw manifestError("non_builder_plan", `save_comp_frame_png step ${k + 1} has invalid args`);
    }

    if (!Number.isSafeInteger(args.compItemIndex) || args.compItemIndex <= 0) {
      throw manifestError("non_builder_plan", `save_comp_frame_png step ${k + 1} compItemIndex must be a positive integer`);
    }
    if (!Number.isSafeInteger(args.expectedCompItemId) || args.expectedCompItemId <= 0) {
      throw manifestError("non_builder_plan", `save_comp_frame_png step ${k + 1} expectedCompItemId must be a positive integer`);
    }
    if (typeof args.expectedCompName !== "string" || !args.expectedCompName.trim()) {
      throw manifestError("non_builder_plan", `save_comp_frame_png step ${k + 1} expectedCompName must be a non-empty string`);
    }
    if (typeof args.time !== "number" || !Number.isFinite(args.time) || args.time < 0) {
      throw manifestError("non_builder_plan", `save_comp_frame_png step ${k + 1} time must be a non-negative finite number`);
    }
    if (!Array.isArray(args.resolutionFactor) || args.resolutionFactor.length !== 2 || args.resolutionFactor[0] !== 1 || args.resolutionFactor[1] !== 1) {
      throw manifestError("non_builder_plan", `save_comp_frame_png step ${k + 1} resolutionFactor must be strictly [1, 1]`);
    }
    if (args.allowOverwrite !== false) {
      throw manifestError("non_builder_plan", `save_comp_frame_png step ${k + 1} allowOverwrite must be strictly false`);
    }
    if (args.deleteAfterReadBack !== false) {
      throw manifestError("non_builder_plan", `save_comp_frame_png step ${k + 1} deleteAfterReadBack must be strictly false`);
    }
    if (args.verifyAfter !== true) {
      throw manifestError("non_builder_plan", `save_comp_frame_png step ${k + 1} verifyAfter must be strictly true`);
    }
    if (args.idempotencyScope !== "comp-visual-review") {
      throw manifestError("non_builder_plan", `save_comp_frame_png step ${k + 1} idempotencyScope must be 'comp-visual-review'`);
    }

    const outputFileName = args.outputFileName;
    if (typeof outputFileName !== "string") {
      throw manifestError("non_builder_plan", `save_comp_frame_png step ${k + 1} missing outputFileName`);
    }
    const match = outputFileName.match(REVIEW_FILENAME_REGEX);
    if (!match) {
      throw manifestError("non_builder_plan", `outputFileName '${outputFileName}' does not match comp-review naming pattern`);
    }
    const matchUuid = match[1];
    const matchOrdinal = Number(match[2]);

    if (matchOrdinal !== ordinal) {
      throw manifestError("non_builder_plan", `Contiguous ordinal mismatch: expected ${ordinal}, found ${matchOrdinal} in '${outputFileName}'`);
    }

    if (!reviewId) {
      reviewId = matchUuid;
    } else if (reviewId.toLowerCase() !== matchUuid.toLowerCase()) {
      throw manifestError("mixed_review_ids", `Mixed review IDs in plan: ${reviewId} vs ${matchUuid}`);
    }

    if (args.idempotencyKey !== `${matchUuid}:${ordinal}`) {
      throw manifestError("non_builder_plan", `idempotencyKey mismatch: expected '${matchUuid}:${ordinal}', found '${args.idempotencyKey}'`);
    }

    if (!seenCompIds.includes(args.expectedCompItemId)) {
      seenCompIds.push(args.expectedCompItemId);
    }

    exportSteps.push({ step, stepIndex: k + 1, ordinal, args });
    k++;
  }

  if (exportSteps.length < 1 || exportSteps.length > MAX_FRAMES) {
    throw manifestError("non_builder_plan", `Export frames count ${exportSteps.length} out of range [1, ${MAX_FRAMES}]`);
  }
  if (seenCompIds.length < 1 || seenCompIds.length > MAX_COMPS) {
    throw manifestError("non_builder_plan", `Unique comp count ${seenCompIds.length} out of range [1, ${MAX_COMPS}]`);
  }

  // Next steps: exactly seenCompIds.length steps of get_comp_details
  const postReadCompSteps = [];
  for (let m = 0; m < seenCompIds.length; m++) {
    const step = planSteps[k];
    if (!step || typeof step !== "object" || step.tool !== "get_comp_details") {
      throw manifestError("non_builder_plan", `Step ${k + 1} must be get_comp_details for compItemId ${seenCompIds[m]}`);
    }
    const args = step.args || {};
    if (args.compItemId !== seenCompIds[m]) {
      throw manifestError("non_builder_plan", `get_comp_details step ${k + 1} compItemId mismatch: expected ${seenCompIds[m]}, found ${args.compItemId}`);
    }
    if (args.includeLayers !== false) {
      throw manifestError("non_builder_plan", `get_comp_details step ${k + 1} includeLayers must be strictly false`);
    }
    postReadCompSteps.push({ step, stepIndex: k + 1, expectedCompItemId: seenCompIds[m] });
    k++;
  }

  // Final step: must be get_project_info
  if (k !== planSteps.length - 1) {
    throw manifestError("non_builder_plan", `Unexpected steps count: expected final step at index ${k + 1}, but total steps is ${planSteps.length}`);
  }
  const finalStep = planSteps[k];
  if (!finalStep || typeof finalStep !== "object" || finalStep.tool !== "get_project_info") {
    throw manifestError("non_builder_plan", "Final plan step must be get_project_info");
  }
  if (!finalStep.args || typeof finalStep.args !== "object" || Array.isArray(finalStep.args)) {
    throw manifestError("non_builder_plan", "Final get_project_info step args must be an object");
  }

  return {
    reviewId,
    exportSteps,
    postReadCompSteps,
    initialStepIndex: 1,
    finalStepIndex: planSteps.length,
    seenCompIds
  };
}

// Only this fully closed wrapper may be remapped into the existing frame verifier.
function validateTextReviewPlanShape(planSteps, tr) {
  const text = require("./text-visual-review-plan");
  const fail = () => { throw manifestError("non_builder_plan", "Text review must match the complete builder pattern."); };
  const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value,key));
  if (!exact(tr,["schema","caseId","rootCompItemId","textTarget","route","frames","checks","expectedText","fontRequest","observation","declarations"])
    || tr.schema !== "ae-agent-text-visual-review.v1") throw manifestError("invalid_text_review");
  try { text.validateTextVisualReviewInput({caseId:tr.caseId,rootCompItemId:tr.rootCompItemId,textTarget:tr.textTarget,route:tr.route,
    frames:tr.frames.map(f=>({time:f.time,phase:f.phase})),checks:tr.checks,expectedText:tr.expectedText,
    ...(tr.fontRequest === null ? {} : {fontRequest:tr.fontRequest})}); } catch (_) { fail(); }
  if (!Array.isArray(planSteps) || planSteps.length > MAX_PLAN_STEPS || !exact(tr.observation,["project","text","route","comps"])) fail();
  const o = tr.observation;
  if (!exact(o.project,["file","revision","numItems","projectId"])) fail();
  try {
    if (!text.same(o.project,text.projectSnapshot({...o.project,supported:{revision:true}}))) fail();
  } catch (_) { fail(); }
  // Reconstitute the real normal preview shape to check all stored observation fields.
  const raw = observation => observation && {comp:{itemId:observation.compItemId,itemIndex:observation.compItemIndex,
    name:observation.compName,time:observation.time},layer:{id:observation.layerId,index:observation.layerIndex,
    startTime:observation.startTime,inPoint:observation.inPoint,outPoint:observation.outPoint,stretch:observation.stretch,
    threeDLayer:observation.threeDLayer,timeRemapEnabled:observation.timeRemapEnabled,
    collapseTransformation:observation.collapseTransformation,parent:observation.parent,
    ...(observation.text ? {textLayer:true,layerKind:"text",text:observation.text} : {source:{itemId:observation.sourceCompItemId,type:"comp"}})},
    transform:observation.transform,protectedProperties:observation.text ? [{path:[{matchName:"ADBE Text Properties"},{matchName:"ADBE Text Document"}],numKeys:0,expressionEnabled:false}] : []};
  let rebuilt;
  try { rebuilt = text.buildTextVisualReviewPlan({caseId:tr.caseId,rootCompItemId:tr.rootCompItemId,textTarget:tr.textTarget,route:tr.route,
    frames:tr.frames.map(f=>({time:f.time,phase:f.phase})),checks:tr.checks,expectedText:tr.expectedText,
    ...(tr.fontRequest === null ? {} : {fontRequest:tr.fontRequest})},
    {projectFile:o.project.file,project:{...o.project,supported:{revision:true}},observedAt:"2026-10-04T00:00:00.000Z",
      comps:o.comps,textObservation:raw(o.text),routeObservation:raw(o.route)},
    String(tr.frames[0]?.outputFileName || "").match(REVIEW_FILENAME_REGEX)?.[1]); } catch (_) { fail(); }
  if (!text.same(rebuilt.plan.steps,planSteps) || !text.same(rebuilt.plan.textReview,tr)) fail();

  const dec = tr.declarations;
  // Exact coverage has been proven above. Never discard arbitrary reads or unknown steps.
  const baseIndices = [1,...dec.exportStepIndices,...dec.postReadCompStepIndices,dec.finalProjectInfoStepIndex];
  const baseSteps = baseIndices.map(index=>planSteps[index-1]);
  const base = validateBuilderPlanShape(baseSteps);
  return {...base,baseIndices,baseSteps,preReadTextStepIndex:dec.preReadTextStepIndex,
    preReadRouteStepIndices:dec.preReadRouteStepIndices,postReadTextStepIndex:dec.postReadTextStepIndex,
    postReadRouteStepIndices:dec.postReadRouteStepIndices,
    exportSteps:base.exportSteps.map(item=>({...item,stepIndex:baseIndices[item.stepIndex-1]})),
    postReadCompSteps:base.postReadCompSteps.map(item=>({...item,stepIndex:baseIndices[item.stepIndex-1]})),
    initialStepIndex:1,finalStepIndex:planSteps.length};
}

function fontRequestObservation(record, tr, options) {
  if (!tr.fontRequest) return null;
  const {sha256} = require("./review-evidence");
  const {same} = require("./text-visual-review-plan");
  const request = tr.fontRequest;
  const blocked = reason => ({status:"blocked",reason,runId:request.runId,stepIndex:request.stepIndex,requestedFont:null,fontRenderingVerified:false});
  const prior = require("./plan-run-records").readRecord(options.logDir ? path.resolve(options.logDir) : path.resolve("logs"),request.runId);
  if (!prior || prior.unavailable) return blocked(prior?.reasonCode || "font_request_record_missing");
  const provenance = prior.run?.provenance;
  if (prior.runId !== request.runId || prior.run?.id !== request.runId || prior.run?.dryRun !== false
    || prior.project?.file !== tr.observation.project.file || prior.plan?.targetProject?.file !== tr.observation.project.file
    || provenance?.projectId !== tr.observation.project.projectId || provenance?.planSha256 !== sha256(prior.plan)) return blocked("font_request_binding_mismatch");
  const planned = prior.plan.steps?.[request.stepIndex-1];
  const matches = prior.run.steps?.filter(s=>s?.index === request.stepIndex);
  if (!planned || planned.tool !== "update_text_layer" || matches?.length !== 1) return blocked("font_request_step_missing");
  const step = matches[0], args = planned.args, target = tr.observation.text;
  // update_text_layer currently addresses indices/name, so an independent stable-ID read
  // in that durable record must bind its exact index before this update (no invented args).
  const targetRead = prior.run.steps.filter(s => s?.index < request.stepIndex && s.tool === "get_layer_details"
    && s.status === "completed" && s.result?.ok !== false && s.result?.comp?.itemId === target.compItemId
    && s.result?.comp?.itemIndex === target.compItemIndex && s.result?.comp?.name === target.compName
    && s.result?.layer?.id === target.layerId && s.result?.layer?.index === target.layerIndex
    && prior.plan.steps[s.index-1]?.tool === s.tool && same(prior.plan.steps[s.index-1]?.args,s.args)
    && s.args?.compItemId === target.compItemId && s.args?.layerId === target.layerId).at(-1);
  if (!targetRead || !args || step.tool !== planned.tool || !same(step.args,args)
    || typeof args.font !== "string" || !args.font || args.layerIndex !== target.layerIndex
    || !(args.compItemIndex === target.compItemIndex || args.compItemIndex === undefined && args.compName === target.compName)) return blocked("font_request_target_mismatch");
  const observation = {runId:request.runId,stepIndex:request.stepIndex,planSha256:provenance.planSha256,
    projectId:provenance.projectId,compItemId:target.compItemId,layerId:target.layerId,requestedFont:args.font,
    storedFont:target.text.font,storedFontMatchesRequest:target.text.font === args.font,fontRenderingVerified:false};
  const native = step.mutationResult;
  if (step.status === "completed" && step.isError !== true && step.mutationResultIsError === false && native?.ok !== false
    && native?.layer?.id === target.layerId && native?.comp?.itemIndex === target.compItemIndex
    && native?.comp?.name === target.compName && typeof prior.run.finishedAt === "string") {
    return {...observation,status:"recorded",reason:"stored_font_observation_only"};
  }
  // A missing/unknown/generic failed result never proves the font was unavailable.
  const nativeCode = native && typeof native === "object" && (native.code || native.errorCode);
  const authoritativeRejection = step.status === "failed" && step.preMutationRejected === true
    && step.mutationResultIsError === true && ["native_rejected_unavailable_font","font_unavailable","font_not_found"].includes(nativeCode);
  if (authoritativeRejection) return {...observation,status:"rejected",reason:"native_rejected_unavailable_font"};
  return {...blocked("font_request_outcome_unresolved"),requestedFont:args.font,planSha256:provenance.planSha256};
}

async function createTextReviewManifest(record, options, shape) {
  const text = require("./text-visual-review-plan");
  const {sha256} = require("./review-evidence");
  const tr = record.plan.textReview, run = record.run, runId = record.runId, planSha256 = sha256(record.plan);
  const issues = [];
  const bad = code => issues.push(code);
  const byIndex = new Map();
  for (const step of run.steps) {
    if (!step || !Number.isSafeInteger(step.index) || step.index < 1 || step.index > record.plan.steps.length
      || byIndex.has(step.index)) { bad("run_step_index_mismatch"); continue; }
    byIndex.set(step.index,step);
    const planned = record.plan.steps[step.index-1];
    if (step.tool !== planned.tool || !text.same(step.args,planned.args)) bad("run_step_args_mismatch");
  }
  if (record.project?.file !== tr.observation.project.file || record.plan.targetProject?.file !== tr.observation.project.file
    || run.provenance?.projectId !== tr.observation.project.projectId || run.provenance?.planSha256 !== planSha256) bad("review_record_binding_mismatch");
  const complete = index => {
    const step = byIndex.get(index);
    return step?.status === "completed" && step.isError !== true && step.result != null && step.result.ok !== false ? step.result : null;
  };
  let readsComplete = true;
  for (const index of [shape.initialStepIndex,shape.finalStepIndex]) {
    const result = complete(index);
    if (!result) { readsComplete = false; continue; }
    try { if (!text.same(text.projectSnapshot(result),tr.observation.project)) bad("project_revision_or_identity_changed"); }
    catch (_) { readsComplete=false; bad("project_snapshot_incomplete"); }
  }
  let staticProofPassed = true, observedText = null;
  const observations = [];
  for (const index of [shape.preReadTextStepIndex,shape.postReadTextStepIndex]) {
    const result = complete(index);
    if (!result) { readsComplete=false; staticProofPassed=false; continue; }
    try {
      const observed = text.layerObservation(result,tr.textTarget,tr.expectedText);
      observations.push(observed);
      observedText = observed.text.text;
      if (!text.observationsMatch(tr.observation.text,observed)) bad("text_technical_fields_changed");
    } catch (error) { staticProofPassed=false; readsComplete=false; bad(error.code || "text_readback_incomplete"); }
  }
  if (observations.length === 2 && !text.observationsMatch(observations[0],observations[1])) bad("text_pre_post_mismatch");
  const routeObservations = [];
  for (const index of [...shape.preReadRouteStepIndices,...shape.postReadRouteStepIndices]) {
    const result = complete(index);
    if (!result) { readsComplete=false; continue; }
    const hop = tr.route[0];
    try {
      const observed = text.layerObservation(result,{compItemId:hop.parentCompItemId,layerId:hop.layerId},null,hop.childCompItemId);
      routeObservations.push(observed);
      if (!text.observationsMatch(tr.observation.route,observed)) bad("route_technical_fields_changed");
    } catch (error) { readsComplete=false; bad(error.code || "route_readback_incomplete"); }
  }
  if (routeObservations.length === 2 && !text.observationsMatch(routeObservations[0],routeObservations[1])) bad("route_pre_post_mismatch");

  // Reuse the legacy bytes/path/PNG proof with exact, already-closed step-index mapping.
  const mapped = {...record,plan:{...record.plan,steps:shape.baseSteps},run:{...run,steps:shape.baseIndices.flatMap((index,i) => {
    const step=byIndex.get(index); return step ? [{...step,index:i+1}] : [];
  })}};
  delete mapped.plan.textReview;
  const base = await createManifest(mapped,options);
  const root = tr.observation.comps.find(c=>c.itemId === tr.rootCompItemId);
  const compIdentity = comp => [comp?.itemId ?? comp?.id,comp?.itemIndex ?? comp?.index,comp?.name,
    comp?.width,comp?.height,comp?.frameRate,comp?.duration];
  for (const post of shape.postReadCompSteps) {
    const observed = complete(post.stepIndex);
    if (!observed) readsComplete=false;
    else if (!text.same(compIdentity(observed.comp || observed),compIdentity(root))) bad("post_comp_technical_fields_changed");
  }
  const frames = base.frames.map((frame,i) => {
    const expected = tr.frames[i], result = complete(expected.stepIndex);
    const comp = result?.comp, actual = result?.frame;
    const frameMismatch = result && (!text.same(compIdentity(comp),compIdentity(root))
      || actual?.time !== expected.time || actual?.frameNumber !== expected.frameNumber
      || actual?.frameNumber !== Math.round(actual?.time * root.frameRate));
    if (frameMismatch) bad("frame_grid_or_comp_mismatch");
    return {...frame,...(frameMismatch ? {verified:false,status:"frame_grid_or_comp_mismatch"} : {}),
      runId,planSha256,stepIndex:expected.stepIndex,ordinal:expected.ordinal,rootCompItemId:tr.rootCompItemId,phase:expected.phase};
  });
  const fontObservation = fontRequestObservation(record,tr,options);
  const blockedFont = fontObservation?.status === "blocked" || fontObservation?.status === "rejected";
  const corrupt = issues.length > 0 || base.status === "corrupt";
  const ok = !corrupt && readsComplete && staticProofPassed && !blockedFont && base.ok === true;
  const status = corrupt ? "corrupt" : ok ? "complete" : "incomplete";
  return {...base,ok,status,verificationStatus:ok ? "verified" : corrupt ? "failed" : "partial",
    textEvidenceStatus:corrupt ? "corrupt" : ok ? "verified" : fontObservation?.status === "rejected" ? "font_request_rejected"
      : fontObservation?.status === "blocked" ? "font_request_blocked" : "incomplete",
    runId,planSha256,issues,frames,verifiedFramesCount:frames.filter(f=>f.verified).length,
    frameBindings:frames.map(frame=>({runId,planSha256,stepIndex:frame.stepIndex,ordinal:frame.ordinal,
      rootCompItemId:frame.rootCompItemId,time:frame.time,frameNumber:frame.frameNumber,phase:frame.phase,sha256:frame.sha256 || null})),
    textReview:{caseId:tr.caseId,textTarget:tr.textTarget,route:tr.route,expectedText:tr.expectedText,observedText,staticProof:{ok:staticProofPassed}},
    fontObservation,historicalCapture:true,currentProjectStateVerified:false,canonicalFreshness:false,artisticAccepted:false,
    visibleBoundsVerified:false,fontRenderingVerified:false,
    limits:"Исторические native read-back и PNG integrity. Фактический просмотр PNG требуется для глифов, полей и художественной оценки; stored font не доказывает rendered font. Transform getter читает только текущее comp.time."};
}

async function createManifest(record, options = {}) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw manifestError("invalid_record", "Run record must be an object");
  }
  if (record.schema !== "ae-agent-plan-run-record.v1") {
    throw manifestError("invalid_record_schema", `Unsupported record schema: ${record.schema}`);
  }

  const runId = options.runId || record.runId;
  if (!runId || !UUID_REGEX.test(runId)) {
    throw manifestError("invalid_run_id", "runId must be a valid UUID");
  }
  if (record.runId !== runId || (record.run && record.run.id !== runId)) {
    throw manifestError("run_id_mismatch", `Record runId ${record.runId} does not match requested ${runId}`);
  }

  if (!record.plan || !Array.isArray(record.plan.steps) || !record.run || !Array.isArray(record.run.steps)) {
    throw manifestError("invalid_record", "Record must contain plan.steps and run.steps");
  }

  if (record.plan && record.plan.textReview) {
    const shape = validateTextReviewPlanShape(record.plan.steps, record.plan.textReview);
    return await createTextReviewManifest(record, options, shape);
  }

  // Strictly validate builder plan shape (bounded 4..18 steps, contiguous ordinals, 1..12 frames, 1..4 comps)
  const shape = validateBuilderPlanShape(record.plan.steps);
  const { reviewId, exportSteps, postReadCompSteps, initialStepIndex, finalStepIndex } = shape;

  const run = record.run;
  const runCompletedNormally = run.dryRun === false &&
    run.ok === true &&
    (run.failedCount === 0 || run.failedCount === undefined) &&
    typeof run.finishedAt === "string" &&
    run.finishedAt.length > 0;

  // Track run steps and detect duplicate step indices
  const runStepsByIndex = new Map();
  let duplicateStepIndices = false;
  for (const s of run.steps) {
    if (!s || typeof s !== "object" || !Number.isSafeInteger(s.index)) continue;
    if (runStepsByIndex.has(s.index)) {
      duplicateStepIndices = true;
    }
    runStepsByIndex.set(s.index, s);
  }

  let corruptOrTampered = duplicateStepIndices;
  const exportRoot = options.exportRoot ? path.resolve(options.exportRoot) : path.resolve("logs", "generated-exports");

  const frames = [];
  let allExportsPassed = true;
  let anyExportCaptured = false;

  // Verify initial get_project_info step
  const initialRunStep = runStepsByIndex.get(initialStepIndex);
  let initialProjectFile = null;
  let allPostReadsPassed = true;

  if (!initialRunStep || initialRunStep.status !== "completed" || !initialRunStep.result || initialRunStep.result.ok === false) {
    allPostReadsPassed = false;
  } else {
    initialProjectFile = initialRunStep.result.file;
    if (!initialProjectFile || typeof initialProjectFile !== "string") {
      allPostReadsPassed = false;
      corruptOrTampered = true;
    }
  }

  // Verify export steps
  for (const item of exportSteps) {
    const { stepIndex, args } = item;
    const outputFileName = args.outputFileName;
    const expectedCompItemId = args.expectedCompItemId;
    const expectedCompItemIndex = args.compItemIndex;
    const expectedCompName = args.expectedCompName;
    const expectedTime = args.time;

    let targetPath;
    let safeRealFilePath;
    try {
      targetPath = path.join(exportRoot, path.basename(outputFileName));
      safeRealFilePath = verifyPathContainment(exportRoot, targetPath);
    } catch (err) {
      corruptOrTampered = true;
      allExportsPassed = false;
      frames.push({
        stepIndex,
        compItemId: expectedCompItemId,
        time: expectedTime,
        outputFileName,
        filePath: targetPath,
        status: err.code || "path_containment_violation",
        verified: false
      });
      continue;
    }

    const runStep = runStepsByIndex.get(stepIndex);

    if (!runStep || runStep.status !== "completed" || !runStep.result || runStep.result.ok === false) {
      allExportsPassed = false;
      frames.push({
        stepIndex,
        compItemId: expectedCompItemId,
        time: expectedTime,
        outputFileName,
        filePath: safeRealFilePath,
        status: runStep ? runStep.status : "missing_execution",
        verified: false
      });
      continue;
    }

    // Check tool and args pin preservation in run step
    if (runStep.tool !== "save_comp_frame_png") {
      corruptOrTampered = true;
      allExportsPassed = false;
      frames.push({
        stepIndex,
        compItemId: expectedCompItemId,
        time: expectedTime,
        outputFileName,
        filePath: safeRealFilePath,
        status: "tool_mismatch",
        verified: false
      });
      continue;
    }

    const runArgs = runStep.args || {};
    if (runArgs.expectedCompItemId !== expectedCompItemId ||
        runArgs.compItemIndex !== expectedCompItemIndex ||
        runArgs.outputFileName !== outputFileName ||
        runArgs.allowOverwrite !== false ||
        runArgs.deleteAfterReadBack !== false ||
        !Array.isArray(runArgs.resolutionFactor) ||
        runArgs.resolutionFactor[0] !== 1 || runArgs.resolutionFactor[1] !== 1) {
      corruptOrTampered = true;
      allExportsPassed = false;
      frames.push({
        stepIndex,
        compItemId: expectedCompItemId,
        time: expectedTime,
        outputFileName,
        filePath: safeRealFilePath,
        status: "pinned_args_mismatch",
        verified: false
      });
      continue;
    }

    const result = runStep.result;
    const comp = result.comp;
    const frame = result.frame;
    const rf = result.resolutionFactor;
    const file = result.file;

    // Check result payload structure: comp, frame, resolutionFactor, file
    const compMatches = comp &&
      (comp.itemId === expectedCompItemId || comp.id === expectedCompItemId) &&
      comp.itemIndex === expectedCompItemIndex &&
      (!expectedCompName || comp.name === expectedCompName) &&
      Number.isSafeInteger(comp.width) && comp.width > 0 &&
      Number.isSafeInteger(comp.height) && comp.height > 0 &&
      typeof comp.frameRate === "number" && comp.frameRate > 0 &&
      typeof comp.duration === "number" && comp.duration > 0;

    const timeMatches = frame &&
      typeof frame.time === "number" &&
      Math.abs(frame.time - expectedTime) <= 0.0001 &&
      Number.isSafeInteger(frame.frameNumber);

    const rfMatches = rf &&
      rf.restored === true &&
      Array.isArray(rf.applied) && rf.applied[0] === 1 && rf.applied[1] === 1 &&
      Array.isArray(rf.before) && Array.isArray(rf.after) &&
      rf.before[0] === rf.after[0] && rf.before[1] === rf.after[1];

    const fileMatches = file &&
      file.outputFileName === outputFileName &&
      typeof file.outputPath === "string" &&
      path.resolve(file.outputPath) === path.resolve(targetPath) &&
      typeof file.sha256 === "string" && /^[a-f0-9]{64}$/i.test(file.sha256) &&
      file.width === comp?.width &&
      file.height === comp?.height &&
      Number.isSafeInteger(file.byteLength) && file.byteLength > 0 &&
      file.pngComplete === true &&
      file.existsAfter === true &&
      file.deletedAfterReadBack === false;

    if (!compMatches || !timeMatches || !rfMatches || !fileMatches) {
      allExportsPassed = false;
      corruptOrTampered = true;
      frames.push({
        stepIndex,
        compItemId: expectedCompItemId,
        time: expectedTime,
        outputFileName,
        filePath: safeRealFilePath,
        status: "step_result_mismatch",
        verified: false
      });
      continue;
    }

    // Verify actual file bytes and PNG proof on disk
    const diskCheck = readAndVerifyPng(
      safeRealFilePath,
      file.sha256,
      file.width,
      file.height,
      options.verifyPng
    );

    if (!diskCheck.ok) {
      allExportsPassed = false;
      corruptOrTampered = true;
      frames.push({
        stepIndex,
        compItemId: expectedCompItemId,
        time: expectedTime,
        outputFileName,
        filePath: safeRealFilePath,
        status: diskCheck.reason,
        verified: false
      });
      continue;
    }

    anyExportCaptured = true;
    frames.push({
      stepIndex,
      compItemId: expectedCompItemId,
      time: expectedTime,
      frameNumber: frame.frameNumber,
      outputFileName,
      filePath: safeRealFilePath,
      sha256: diskCheck.sha256,
      width: diskCheck.width,
      height: diskCheck.height,
      byteLength: diskCheck.byteLength,
      status: "verified",
      verified: true
    });
  }

  // Verify post-read get_comp_details steps
  for (const postItem of postReadCompSteps) {
    const runStep = runStepsByIndex.get(postItem.stepIndex);
    if (!runStep || runStep.status !== "completed" || !runStep.result || runStep.result.ok === false) {
      allPostReadsPassed = false;
    } else {
      const res = runStep.result;
      const observedCompId = (res.comp && (res.comp.itemId ?? res.comp.id)) ?? res.itemId ?? res.id;
      if (observedCompId !== postItem.expectedCompItemId) {
        allPostReadsPassed = false;
        corruptOrTampered = true;
      }
    }
  }

  // Verify final get_project_info step
  const finalRunStep = runStepsByIndex.get(finalStepIndex);
  if (!finalRunStep || finalRunStep.status !== "completed" || !finalRunStep.result || finalRunStep.result.ok === false) {
    allPostReadsPassed = false;
  } else {
    const finalFile = finalRunStep.result.file;
    if (!finalFile || finalFile !== initialProjectFile) {
      allPostReadsPassed = false;
      corruptOrTampered = true;
    }
  }

  let status;
  let verificationStatus;
  if (corruptOrTampered) {
    status = "corrupt";
    verificationStatus = "failed";
  } else if (runCompletedNormally && allExportsPassed && allPostReadsPassed && frames.length === exportSteps.length && frames.every((f) => f.verified)) {
    status = "complete";
    verificationStatus = "verified";
  } else if (anyExportCaptured) {
    status = "incomplete";
    verificationStatus = "partial";
  } else {
    status = "incomplete";
    verificationStatus = "unverified";
  }

  return {
    ok: status === "complete",
    runId,
    reviewId,
    status,
    executionStatus: run.ok === true ? "completed" : (run.failedCount > 0 ? "failed" : "incomplete"),
    verificationStatus,
    totalPlannedFrames: exportSteps.length,
    verifiedFramesCount: frames.filter((f) => f.verified).length,
    frames,
    historicalCapture: true,
    currentProjectStateVerified: false,
    canonicalFreshness: false,
    artisticAccepted: false,
    limits: "Actual image view required; bytes/hash not visual verdict. Manifest is not canonical owner proof and does not reuse old images after edits."
  };
}

module.exports = {
  getCompVisualReviewManifestTool,
  createManifest,
  validateBuilderPlanShape,
  validateTextReviewPlanShape,
  verifyPathContainment,
  manifestError,
  REVIEW_FILENAME_REGEX
};
