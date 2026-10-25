"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const { isGridAligned } = require("./placeholder-timing");

const MAX_COMPS = 4;
const MAX_INPUT_SLOTS = 24;
const MAX_FRAMES = 12;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const buildCompVisualReviewPlanTool = Object.freeze({
  name: "build_comp_visual_review_plan",
  description: "Build a bounded frame review plan from explicit comp IDs and fresh server observations.",
  inputSchema: Object.freeze({
    type: "object", required: ["targets"], additionalProperties: false,
    properties: Object.freeze({
      targets: Object.freeze({ type: "array", minItems: 1, maxItems: MAX_COMPS, items: Object.freeze({
        type: "object", required: ["compItemId", "times"], additionalProperties: false,
        properties: Object.freeze({
          compItemId: Object.freeze({ type: "integer", minimum: 1 }),
          times: Object.freeze({ type: "array", minItems: 1, maxItems: MAX_INPUT_SLOTS, items: Object.freeze({ type: "number" }) })
        })
      }) })
    })
  })
});

function invalid(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function plainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function assertExactKeys(value, keys, code) {
  if (!plainObject(value) || Object.keys(value).length !== keys.length || keys.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) invalid(code);
}

function validObservedAt(value) {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 19) === value.slice(0, 19);
}

function validateContext(context, projectFile, observedAt) {
  if (!plainObject(context) || context.projectFile !== projectFile || context.observedAt !== observedAt || !Array.isArray(context.comps)) invalid("invalid_server_observation");
  const byId = new Map();
  const indices = new Set();
  for (const comp of context.comps) {
    if (!plainObject(comp) || !Number.isSafeInteger(comp.itemId) || comp.itemId <= 0
      || !Number.isSafeInteger(comp.itemIndex) || comp.itemIndex <= 0 || typeof comp.name !== "string" || !comp.name.trim()
      || !Number.isSafeInteger(comp.width) || comp.width <= 0 || !Number.isSafeInteger(comp.height) || comp.height <= 0
      || typeof comp.frameRate !== "number" || !Number.isFinite(comp.frameRate) || comp.frameRate <= 0
      || typeof comp.duration !== "number" || !Number.isFinite(comp.duration) || comp.duration <= 0 || byId.has(comp.itemId) || indices.has(comp.itemIndex)) invalid("invalid_observed_comp");
    byId.set(comp.itemId, comp);
    indices.add(comp.itemIndex);
  }
  return byId;
}

function validateCompVisualReviewInput(input) {
  assertExactKeys(input, ["targets"], "invalid_input_shape");
  if (!Array.isArray(input.targets) || input.targets.length < 1 || input.targets.length > MAX_COMPS) invalid("target_count_out_of_range");
  const targetIds = new Set();
  let inputSlots = 0;
  for (const target of input.targets) {
    assertExactKeys(target, ["compItemId", "times"], "invalid_target_shape");
    if (!Number.isSafeInteger(target.compItemId) || target.compItemId <= 0 || targetIds.has(target.compItemId)) invalid("invalid_or_duplicate_comp_id");
    targetIds.add(target.compItemId);
    if (!Array.isArray(target.times) || target.times.length < 1) invalid("invalid_times");
    inputSlots += target.times.length;
    if (inputSlots > MAX_INPUT_SLOTS) invalid("input_slot_limit_exceeded");
    if (target.times.some((time) => typeof time !== "number" || !Number.isFinite(time))) invalid("invalid_time");
  }
  return true;
}

function buildCompVisualReviewPlan(input, serverObservedContext, reviewId = crypto.randomUUID()) {
  validateCompVisualReviewInput(input);
  if (typeof reviewId !== "string" || !UUID.test(reviewId)) invalid("invalid_review_id");

  const projectFile = serverObservedContext && serverObservedContext.projectFile;
  const observedAt = serverObservedContext && serverObservedContext.observedAt;
  if (typeof projectFile !== "string" || !path.isAbsolute(projectFile) || path.extname(projectFile).toLowerCase() !== ".aep"
    || !validObservedAt(observedAt)) invalid("invalid_server_observation");
  const compsById = validateContext(serverObservedContext, projectFile, observedAt);
  const selected = input.targets.map((target) => {
    const comp = compsById.get(target.compItemId);
    if (!comp) invalid("requested_comp_not_observed");
    return { target, comp };
  });

  const frames = [];
  const seenFrames = new Set();
  for (const { target, comp } of selected) {
    for (const requestedTime of target.times) {
      if (requestedTime < 0 || requestedTime >= comp.duration) invalid("time_outside_comp");
      if (!isGridAligned(requestedTime, comp.frameRate)) invalid("time_off_frame_grid");
      const frameNumber = Math.round(requestedTime * comp.frameRate);
      if (!Number.isSafeInteger(frameNumber)) invalid("frame_number_out_of_range");
      const time = frameNumber / comp.frameRate;
      if (time >= comp.duration) invalid("time_outside_comp");
      const key = `${comp.itemId}:${frameNumber}`;
      if (seenFrames.has(key)) continue;
      seenFrames.add(key);
      frames.push({ compItemId: comp.itemId, compItemIndex: comp.itemIndex, compName: comp.name, time, frameNumber });
      if (frames.length > MAX_FRAMES) invalid("frame_limit_exceeded");
    }
  }

  const steps = [{ tool: "get_project_info", args: {} }];
  const reviewFrames = [];
  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index];
    const ordinal = index + 1;
    const outputFileName = `comp-review-${reviewId}-${ordinal}.png`;
    const stepIndex = steps.length + 1;
    steps.push({ tool: "save_comp_frame_png", args: {
      compItemIndex: frame.compItemIndex, expectedCompItemId: frame.compItemId, expectedCompName: frame.compName,
      time: frame.time, outputFileName, resolutionFactor: [1, 1], allowOverwrite: false,
      deleteAfterReadBack: false, verifyAfter: true, idempotencyKey: `${reviewId}:${ordinal}`,
      idempotencyScope: "comp-visual-review"
    } });
    reviewFrames.push({ ...frame, outputFileName, stepIndex });
  }
  for (const { comp } of selected) {
    steps.push({ tool: "get_comp_details", args: { compItemId: comp.itemId, includeLayers: false } });
  }
  steps.push({ tool: "get_project_info", args: {} });
  if (steps.length > 18) invalid("step_limit_exceeded");

  const plan = {
    summary: `Проверить ${frames.length} кадров в ${selected.length} композициях проекта ${path.basename(projectFile)}.`,
    risk: "medium", targetProject: { file: projectFile }, steps
  };
  const review = {
    reviewId, projectFile, observedAt,
    frames: reviewFrames,
    limits: { projectCurrentState: "unknown", artisticStatus: "unknown", canonicalStatus: "unknown" }
  };
  return { plan, review, previewOnly: true, projectMutations: 0 };
}

module.exports = { buildCompVisualReviewPlanTool, buildCompVisualReviewPlan, validateCompVisualReviewInput, MAX_COMPS, MAX_INPUT_SLOTS, MAX_FRAMES };
