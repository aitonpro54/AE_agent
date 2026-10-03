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
  verifyPathContainment,
  manifestError,
  REVIEW_FILENAME_REGEX
};
