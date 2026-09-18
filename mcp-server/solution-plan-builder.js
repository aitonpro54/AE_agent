"use strict";

const MAX_TARGETS = 5; // Four steps per target; fits the standard runner's 20-step limit.
const MAX_KEYFRAMES_PER_TARGET = 80;
const MAX_PROPERTY_PATH_SEGMENTS = 5; // Matches the typed property-tree inspection depth cap.
const TIME_EPSILON = 1e-9;

const SOLUTIONS = Object.freeze({
  "ar-distributekeyframesevenly-typed-plan": Object.freeze({
    specName: "distributeKeyframesEvenlySpec",
    mode: "selectedKeyframesEvenlyBetweenBounds",
    boundsSource: "explicit",
    startName: "distributionStartTime",
    endName: "distributionEndTime",
    distributedName: "evenlyDistributedKeyframes"
  }),
  "ar-distributekeyframestoworkarea-typed-plan": Object.freeze({
    specName: "distributeKeyframesToWorkAreaSpec",
    mode: "selectedKeyframesEvenlyAcrossWorkArea",
    boundsSource: "workArea",
    startName: "workAreaStartTime",
    endName: "workAreaEndTime",
    distributedName: "workAreaDistributedKeyframes"
  }),
  "ar-distributekeyframestocomp-typed-plan": Object.freeze({
    specName: "distributeKeyframesToCompSpec",
    mode: "selectedKeyframesEvenlyAcrossComp",
    boundsSource: "comp",
    startName: "compDistributionStartTime",
    endName: "compDistributionEndTime",
    distributedName: "compDistributedKeyframes"
  }),
  "ar-distributekeyframestolayer-typed-plan": Object.freeze({
    specName: "distributeKeyframesToLayerSpec",
    mode: "selectedKeyframesEvenlyAcrossLayerRange",
    boundsSource: "layer",
    startName: "layerDistributionStartTime",
    endName: "layerDistributionEndTime",
    distributedName: "layerDistributedKeyframes"
  })
});

const SUPPORTED_SOLUTION_IDS = Object.freeze(Object.keys(SOLUTIONS));
const KEYFRAME_FIELDS = new Set(["index", "time", "value", "inInterpolation", "outInterpolation"]);

function createBuilderContract(solutionId, config) {
  const layerBounds = config.boundsSource === "layer";
  const boundsRequired = ["source", "startTime", "endTime"];
  if (layerBounds) boundsRequired.push("sourceLayerIndex", "sourceLayerName");
  return {
    solutionId,
    description: "Build a local preview-only AE Agent plan from fresh, complete typed evidence. This call does not contact After Effects or mutate a project.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["comp", "bounds", "targets"],
      properties: {
        comp: {
          type: "object",
          additionalProperties: false,
          required: ["itemIndex", "name", "frameRate", "startTime", "endTime"],
          properties: {
            itemIndex: { type: "integer", minimum: 1 },
            name: { type: "string", minLength: 1 },
            frameRate: { type: "number", exclusiveMinimum: 0, maximum: 1000 },
            startTime: { type: "number", description: "Reviewed comp start in seconds." },
            endTime: { type: "number", description: "Reviewed comp end in seconds, greater than startTime." }
          }
        },
        bounds: {
          type: "object",
          additionalProperties: false,
          required: boundsRequired,
          properties: {
            source: { const: config.boundsSource },
            startTime: { type: "number", description: "Distribution start in seconds; rounded to the nearest comp frame." },
            endTime: { type: "number", description: "Distribution end in seconds; rounded to the nearest comp frame." },
            ...(layerBounds ? {
              sourceLayerIndex: { type: "integer", minimum: 1 },
              sourceLayerName: { type: "string", minLength: 1 }
            } : {})
          }
        },
        targets: {
          type: "array",
          minItems: 1,
          maxItems: MAX_TARGETS,
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "layerIndex",
              "layerName",
              "propertyPath",
              "expressionEnabled",
              "valueType",
              "completeKeyframeCount",
              "keyframes",
              "selectedKeyframeIndices"
            ],
            properties: {
              layerIndex: { type: "integer", minimum: 1 },
              layerName: { type: "string", minLength: 1 },
              propertyPath: {
                type: "array",
                minItems: 1,
                maxItems: MAX_PROPERTY_PATH_SEGMENTS,
                description: "Canonical inspected descriptor path; every segment has propertyIndex and matchName, with optional name.",
                items: { type: "object", additionalProperties: false, required: ["propertyIndex", "matchName"],
                  properties: {propertyIndex: {type: "integer", minimum: 1}, matchName: {type: "string", minLength: 1}, name: {type: "string", minLength: 1}} }
              },
              expressionEnabled: { const: false },
              valueType: { const: "scalar" },
              completeKeyframeCount: { type: "integer", minimum: 1, maximum: MAX_KEYFRAMES_PER_TARGET },
              keyframes: {
                type: "array",
                minItems: 1,
                maxItems: MAX_KEYFRAMES_PER_TARGET,
                description: "Complete ordered property sequence; index must be contiguous from 1.",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["index", "time", "value", "inInterpolation", "outInterpolation"],
                  properties: {
                    index: { type: "integer", minimum: 1 },
                    time: { type: "number" },
                    value: { type: "number" },
                    inInterpolation: { const: "linear" },
                    outInterpolation: { const: "linear" }
                  }
                }
              },
              selectedKeyframeIndices: {
                type: "array",
                minItems: 1,
                uniqueItems: true,
                description: "Strictly ascending reviewed 1-based indices into keyframes.",
                items: { type: "integer", minimum: 1 }
              }
            }
          }
        }
      }
    },
    example: {
      comp: { itemIndex: 7, name: "Main", frameRate: 24, startTime: 0, endTime: 8 },
      bounds: {
        source: config.boundsSource,
        startTime: config.boundsSource === "comp" ? 0 : 1,
        endTime: config.boundsSource === "comp" ? 8 : 3,
        ...(layerBounds ? { sourceLayerIndex: 2, sourceLayerName: "Card" } : {})
      },
      targets: [{
        layerIndex: 2,
        layerName: "Card",
        propertyPath: [
          { name: "Transform", matchName: "ADBE Transform Group", propertyIndex: 2 },
          { name: "Opacity", matchName: "ADBE Opacity", propertyIndex: 11 }
        ],
        expressionEnabled: false,
        valueType: "scalar",
        completeKeyframeCount: 3,
        keyframes: [
          { index: 1, time: 0.5, value: 0, inInterpolation: "linear", outInterpolation: "linear" },
          { index: 2, time: 1.5, value: 50, inInterpolation: "linear", outInterpolation: "linear" },
          { index: 3, time: 4, value: 100, inInterpolation: "linear", outInterpolation: "linear" }
        ],
        selectedKeyframeIndices: [1, 2]
      }]
    },
    output: {
      success: "{ok:true,solutionId,solutionIds,previewLocal:true,mutatesProject:false,requiresFreshEvidenceReview:true,plan}",
      failure: "{ok:false,solutionId,solutionIds,error:{code,message,path}}"
    },
    restrictions: [
      "Only explicit finite scalar values and complete keyframe sequences are supported.",
      "Every keyframe must prove linear in/out interpolation; ease, spatial tangent, roving, hold, and bezier metadata are rejected.",
      "Enabled expressions, ambiguous selected-key order, rounded-time collisions, duplicate targets, and out-of-comp bounds fail closed.",
      "The returned plan requires fresh typed evidence review, a checkpoint/protected edit session, dry-run, mutation approval, and post-run read-back.",
      "The builder itself performs no After Effects, provider, filesystem, or network calls and does not promise source-exact JSX behavior."
    ],
    solutionSpec: {
      name: config.specName,
      distributionMode: config.mode,
      boundsSource: config.boundsSource,
      startField: config.startName,
      endField: config.endName,
      distributedField: config.distributedName
    }
  };
}

const builderInputContract = Object.freeze(Object.fromEntries(
  SUPPORTED_SOLUTION_IDS.map((solutionId) => [solutionId, createBuilderContract(solutionId, SOLUTIONS[solutionId])])
));

function getBuilderContract(solutionId) {
  if (typeof solutionId !== "string" || !Object.prototype.hasOwnProperty.call(builderInputContract, solutionId)) return null;
  return JSON.parse(JSON.stringify(builderInputContract[solutionId]));
}

class PlanInputError extends Error {
  constructor(code, message, path) {
    super(message);
    this.code = code;
    this.path = path || null;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function fail(code, message, path, solutionId) {
  return {
    ok: false,
    solutionId: typeof solutionId === "string" ? solutionId : null,
    solutionIds: typeof solutionId === "string" && solutionId ? [solutionId] : [],
    error: {
      code,
      message,
      path: path || null
    }
  };
}

function inputError(code, message, path) {
  throw new PlanInputError(code, message, path);
}

function requireObject(value, path) {
  if (!isPlainObject(value)) inputError("INVALID_INPUT", `${path} must be an object.`, path);
  return value;
}

function allowKeys(value, names, path) {
  const extra = Object.keys(value).find((key) => !names.includes(key));
  if (extra !== undefined) inputError("UNKNOWN_INPUT_FIELD", `${path}.${extra} is not supported by this builder.`, `${path}.${extra}`);
}

function requireNonEmptyString(value, path) {
  if (typeof value !== "string" || !value.trim()) {
    inputError("INVALID_INPUT", `${path} must be a non-empty string.`, path);
  }
  return value.trim();
}

function requireFiniteNumber(value, path) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    inputError("NONFINITE_NUMBER", `${path} must be a finite number.`, path);
  }
  return value;
}

function requirePositiveInteger(value, path) {
  if (!Number.isInteger(value) || value < 1) {
    inputError("INVALID_INPUT", `${path} must be a positive integer.`, path);
  }
  return value;
}

function roundToFrame(time, frameRate) {
  return Math.round(time * frameRate) / frameRate;
}

function timeKey(time) {
  return Number(time).toFixed(12);
}

function copyPropertyPath(propertyPath, path) {
  if (!Array.isArray(propertyPath) || propertyPath.length < 1 || propertyPath.length > MAX_PROPERTY_PATH_SEGMENTS) {
    inputError(
      "INVALID_PROPERTY_PATH",
      `${path} must contain between 1 and ${MAX_PROPERTY_PATH_SEGMENTS} explicit segments.`,
      path
    );
  }
  return propertyPath.map((segment, index) => {
    const segmentPath = `${path}[${index}]`;
    if (!isPlainObject(segment)) {
      inputError("INVALID_PROPERTY_PATH", `${segmentPath} must be an inspected descriptor with propertyIndex and matchName.`, segmentPath);
    }
    allowKeys(segment, ["name", "matchName", "propertyIndex"], segmentPath);
    const copied = {propertyIndex: requirePositiveInteger(segment.propertyIndex, `${segmentPath}.propertyIndex`),
      matchName: requireNonEmptyString(segment.matchName, `${segmentPath}.matchName`)};
    if (segment.name !== undefined) copied.name = requireNonEmptyString(segment.name, `${segmentPath}.name`);
    return copied;
  });
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isPlainObject(value)) return value;
  const result = {};
  Object.keys(value).sort().forEach((key) => {
    result[key] = stableValue(value[key]);
  });
  return result;
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function metadataFieldPresent(keyframe) {
  const unsupported = [
    "inSpatialTangent",
    "outSpatialTangent",
    "inTemporalEase",
    "outTemporalEase",
    "temporalEaseIn",
    "temporalEaseOut",
    "temporalAutoBezier",
    "temporalContinuous",
    "spatialAutoBezier",
    "spatialContinuous",
    "roving"
  ];
  return unsupported.find((field) => Object.prototype.hasOwnProperty.call(keyframe, field)) || null;
}

function normalizeKeyframes(value, path) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_KEYFRAMES_PER_TARGET) {
    inputError(
      "INCOMPLETE_KEYFRAME_SEQUENCE",
      `${path} must be the complete non-empty sequence and contain at most ${MAX_KEYFRAMES_PER_TARGET} keyframes.`,
      path
    );
  }
  let previousTime = -Infinity;
  return value.map((rawKeyframe, offset) => {
    const itemPath = `${path}[${offset}]`;
    const keyframe = requireObject(rawKeyframe, itemPath);
    const unexpectedField = Object.keys(keyframe).find((field) => !KEYFRAME_FIELDS.has(field));
    if (unexpectedField) {
      inputError(
        "UNSUPPORTED_KEYFRAME_METADATA",
        `${itemPath}.${unexpectedField} cannot be preserved by this bounded planner.`,
        `${itemPath}.${unexpectedField}`
      );
    }
    const index = requirePositiveInteger(keyframe.index, `${itemPath}.index`);
    if (index !== offset + 1) {
      inputError("INCOMPLETE_KEYFRAME_SEQUENCE", `${itemPath}.index must equal ${offset + 1}.`, `${itemPath}.index`);
    }
    const time = requireFiniteNumber(keyframe.time, `${itemPath}.time`);
    if (time <= previousTime + TIME_EPSILON) {
      inputError("KEYFRAME_TIME_COLLISION", `${path} times must be strictly increasing and collision-free.`, `${itemPath}.time`);
    }
    previousTime = time;
    const scalarValue = requireFiniteNumber(keyframe.value, `${itemPath}.value`);
    if (keyframe.inInterpolation !== "linear" || keyframe.outInterpolation !== "linear") {
      inputError(
        "UNSUPPORTED_INTERPOLATION",
        `${itemPath} must explicitly prove linear in/out interpolation.`,
        itemPath
      );
    }
    const metadataField = metadataFieldPresent(keyframe);
    if (metadataField) {
      inputError(
        "UNSUPPORTED_KEYFRAME_METADATA",
        `${itemPath}.${metadataField} cannot be preserved by this bounded planner.`,
        `${itemPath}.${metadataField}`
      );
    }
    return {
      index,
      time,
      value: scalarValue,
      inInterpolation: "linear",
      outInterpolation: "linear"
    };
  });
}

function normalizeSelectedIndices(value, keyframeCount, path) {
  if (!Array.isArray(value) || value.length < 1) {
    inputError("AMBIGUOUS_SELECTED_KEYFRAMES", `${path} must be a non-empty reviewed array.`, path);
  }
  const indices = [];
  let previous = 0;
  for (let offset = 0; offset < value.length; offset += 1) {
    const index = requirePositiveInteger(value[offset], `${path}[${offset}]`);
    if (index > keyframeCount) {
      inputError("AMBIGUOUS_SELECTED_KEYFRAMES", `${path}[${offset}] is outside the complete keyframe sequence.`, `${path}[${offset}]`);
    }
    if (index <= previous) {
      inputError(
        "AMBIGUOUS_SELECTED_KEYFRAME_ORDER",
        `${path} must be unique and strictly ascending in reviewed keyframe order.`,
        path
      );
    }
    previous = index;
    indices.push(index);
  }
  return indices;
}

function normalizeTarget(rawTarget, offset) {
  const path = `inputs.targets[${offset}]`;
  const target = requireObject(rawTarget, path);
  allowKeys(target, ["layerIndex", "layerName", "propertyPath", "expressionEnabled", "valueType", "completeKeyframeCount", "keyframes", "selectedKeyframeIndices"], path);
  const layerIndex = requirePositiveInteger(target.layerIndex, `${path}.layerIndex`);
  const layerName = requireNonEmptyString(target.layerName, `${path}.layerName`);
  const propertyPath = copyPropertyPath(target.propertyPath, `${path}.propertyPath`);
  if (target.expressionEnabled !== false) {
    inputError("EXPRESSION_ENABLED", `${path}.expressionEnabled must explicitly be false.`, `${path}.expressionEnabled`);
  }
  if (target.valueType !== "scalar") {
    inputError("UNSUPPORTED_VALUE_TYPE", `${path}.valueType must be scalar.`, `${path}.valueType`);
  }
  const keyframes = normalizeKeyframes(target.keyframes, `${path}.keyframes`);
  {
    const count = requirePositiveInteger(target.completeKeyframeCount, `${path}.completeKeyframeCount`);
    if (count !== keyframes.length) {
      inputError(
        "INCOMPLETE_KEYFRAME_SEQUENCE",
        `${path}.completeKeyframeCount does not match keyframes.length.`,
        `${path}.completeKeyframeCount`
      );
    }
  }
  const selectedKeyframeIndices = normalizeSelectedIndices(
    target.selectedKeyframeIndices,
    keyframes.length,
    `${path}.selectedKeyframeIndices`
  );
  return {
    layerIndex,
    layerName,
    propertyPath,
    expressionEnabled: false,
    valueType: "scalar",
    completeKeyframeCount: keyframes.length,
    keyframes,
    selectedKeyframeIndices
  };
}

function normalizeInputs(inputs, config) {
  const source = requireObject(inputs, "inputs");
  allowKeys(source, ["comp", "bounds", "targets"], "inputs");
  const rawComp = requireObject(source.comp, "inputs.comp");
  allowKeys(rawComp, ["itemIndex", "name", "frameRate", "startTime", "endTime"], "inputs.comp");
  const comp = {
    itemIndex: requirePositiveInteger(rawComp.itemIndex, "inputs.comp.itemIndex"),
    name: requireNonEmptyString(rawComp.name, "inputs.comp.name"),
    frameRate: requireFiniteNumber(rawComp.frameRate, "inputs.comp.frameRate"),
    startTime: requireFiniteNumber(rawComp.startTime, "inputs.comp.startTime"),
    endTime: requireFiniteNumber(rawComp.endTime, "inputs.comp.endTime")
  };
  if (comp.frameRate <= 0 || comp.frameRate > 1000) {
    inputError("INVALID_FRAME_RATE", "inputs.comp.frameRate must be greater than 0 and no greater than 1000.", "inputs.comp.frameRate");
  }
  if (comp.endTime <= comp.startTime) {
    inputError("INVALID_COMP_BOUNDS", "inputs.comp.endTime must be greater than inputs.comp.startTime.", "inputs.comp");
  }

  if (!Array.isArray(source.targets) || source.targets.length < 1 || source.targets.length > MAX_TARGETS) {
    inputError("NO_PROPERTY_TARGETS", `inputs.targets must contain between 1 and ${MAX_TARGETS} targets.`, "inputs.targets");
  }
  const targets = source.targets.map(normalizeTarget);
  const targetIds = new Set();
  for (const target of targets) {
    const identity = `${target.layerIndex}:${target.propertyPath.map((segment) => segment.propertyIndex).join("/")}`;
    if (targetIds.has(identity)) {
      inputError("DUPLICATE_PROPERTY_TARGET", "inputs.targets contains the same layer/property target more than once.", "inputs.targets");
    }
    targetIds.add(identity);
  }

  const rawBounds = requireObject(source.bounds, "inputs.bounds");
  allowKeys(rawBounds, ["source", "startTime", "endTime", ...(config.boundsSource === "layer" ? ["sourceLayerIndex", "sourceLayerName"] : [])], "inputs.bounds");
  const bounds = {
    source: requireNonEmptyString(rawBounds.source, "inputs.bounds.source"),
    startTime: requireFiniteNumber(rawBounds.startTime, "inputs.bounds.startTime"),
    endTime: requireFiniteNumber(rawBounds.endTime, "inputs.bounds.endTime")
  };
  if (bounds.source !== config.boundsSource) {
    inputError(
      "BOUNDARY_SOURCE_MISMATCH",
      `inputs.bounds.source must be ${config.boundsSource} for this solution.`,
      "inputs.bounds.source"
    );
  }
  bounds.startTime = roundToFrame(bounds.startTime, comp.frameRate);
  bounds.endTime = roundToFrame(bounds.endTime, comp.frameRate);
  const compStart = roundToFrame(comp.startTime, comp.frameRate);
  const compEnd = roundToFrame(comp.endTime, comp.frameRate);
  if (bounds.endTime <= bounds.startTime) {
    inputError("INVALID_DISTRIBUTION_BOUNDS", "Rounded distribution end time must be greater than start time.", "inputs.bounds");
  }
  if (bounds.startTime < compStart - TIME_EPSILON || bounds.endTime > compEnd + TIME_EPSILON) {
    inputError("DISTRIBUTION_BOUNDS_OUT_OF_COMP", "Rounded distribution bounds must stay inside the reviewed comp bounds.", "inputs.bounds");
  }
  if (config.boundsSource === "comp" && (Math.abs(bounds.startTime - compStart) > TIME_EPSILON || Math.abs(bounds.endTime - compEnd) > TIME_EPSILON)) {
    inputError("BOUNDARY_SOURCE_MISMATCH", "Comp distribution bounds must equal the full reviewed comp range.", "inputs.bounds");
  }

  if (config.boundsSource === "layer") {
    bounds.sourceLayerIndex = requirePositiveInteger(rawBounds.sourceLayerIndex, "inputs.bounds.sourceLayerIndex");
    bounds.sourceLayerName = requireNonEmptyString(rawBounds.sourceLayerName, "inputs.bounds.sourceLayerName");
    for (const target of targets) {
      if (target.layerIndex !== bounds.sourceLayerIndex || target.layerName !== bounds.sourceLayerName) {
        inputError(
          "AMBIGUOUS_LAYER_BOUNDS",
          "Every target must belong to the explicit layer timing source for the to-layer solution.",
          "inputs.bounds"
        );
      }
    }
  }

  return { comp, targets, bounds };
}

function buildTargetPlan(target, bounds, frameRate, config, targetOffset) {
  const selectedSet = new Set(target.selectedKeyframeIndices);
  const selected = target.selectedKeyframeIndices.map((index) => target.keyframes[index - 1]);
  const preserved = target.keyframes.filter((keyframe) => !selectedSet.has(keyframe.index));
  const selectedCount = selected.length;
  const interval = selectedCount === 1 ? 0 : (bounds.endTime - bounds.startTime) / (selectedCount - 1);
  if (!Number.isFinite(interval) || interval < 0) {
    inputError("INVALID_DISTRIBUTION_INTERVAL", "Computed distribution interval is not finite and non-negative.", `inputs.targets[${targetOffset}]`);
  }

  const distributed = selected.map((keyframe, offset) => ({
    originalIndex: keyframe.index,
    originalTime: keyframe.time,
    time: roundToFrame(bounds.startTime + interval * offset, frameRate),
    value: keyframe.value,
    inInterpolation: "linear",
    outInterpolation: "linear"
  }));
  const occupied = new Map();
  for (const keyframe of preserved) occupied.set(timeKey(keyframe.time), `unselected keyframe ${keyframe.index}`);
  for (const keyframe of distributed) {
    const key = timeKey(keyframe.time);
    if (occupied.has(key)) {
      inputError(
        "KEYFRAME_TIME_COLLISION",
        `Distributed selected keyframe ${keyframe.originalIndex} collides with ${occupied.get(key)} at ${keyframe.time}.`,
        `inputs.targets[${targetOffset}]`
      );
    }
    occupied.set(key, `selected keyframe ${keyframe.originalIndex}`);
  }

  const replacement = preserved.map((keyframe) => ({
    source: "preserved-unselected",
    originalIndex: keyframe.index,
    time: keyframe.time,
    value: keyframe.value,
    inInterpolation: "linear",
    outInterpolation: "linear"
  })).concat(distributed.map((keyframe) => ({
    source: "distributed-selected",
    originalIndex: keyframe.originalIndex,
    time: keyframe.time,
    value: keyframe.value,
    inInterpolation: "linear",
    outInterpolation: "linear"
  }))).sort((left, right) => left.time - right.time || left.originalIndex - right.originalIndex);

  return {
    layerIndex: target.layerIndex,
    layerName: target.layerName,
    propertyPath: target.propertyPath,
    valueType: "scalar",
    completePropertyKeyframes: target.keyframes,
    selectedKeyframesToDistribute: selected.map((keyframe) => ({
      index: keyframe.index,
      time: keyframe.time,
      value: keyframe.value,
      inInterpolation: "linear",
      outInterpolation: "linear"
    })),
    preservedUnselectedKeyframes: preserved,
    [config.distributedName]: distributed,
    computedInterval: interval,
    replacementKeyframes: replacement.map((keyframe, index) => ({ ...keyframe, index: index + 1 }))
  };
}

function inspectionStep(comp, layer, phase) {
  const before = phase === "before";
  return {
    title: `${before ? "Read" : "Verify"} layer ${layer.layerIndex} keyframes ${phase} distribution`,
    intent: `${before ? "Re-read fresh" : "Read back"} typed layer/property evidence ${phase} keyframe timing mutation.`,
    tool: "get_layer_details",
    args: {
      compItemIndex: comp.itemIndex,
      compName: comp.name,
      layerIndex: layer.layerIndex,
      includeProperties: true,
      propertyDepth: 5,
      propertyLimit: 1000,
      includeValues: true
    },
    dependsOnStep: null,
    resultBindings: {},
    mutatesProject: false,
    verifyAfter: false
  };
}

function buildPlan(solutionId, normalized, config) {
  const { comp, bounds, targets } = normalized;
  const plannedTargets = targets.map((target, index) => buildTargetPlan(target, bounds, comp.frameRate, config, index));
  const layerMap = new Map();
  for (const target of plannedTargets) {
    if (!layerMap.has(target.layerIndex)) layerMap.set(target.layerIndex, target);
  }
  const layers = Array.from(layerMap.values()).sort((left, right) => left.layerIndex - right.layerIndex);
  const signature = fnv1a(stableStringify({ solutionId, comp, bounds, targets: plannedTargets }));
  const steps = layers.map((layer) => inspectionStep(comp, layer, "before"));

  for (let index = 0; index < plannedTargets.length; index += 1) {
    const target = plannedTargets[index];
    const mutationIdentity = `${signature}-${index + 1}`;
    steps.push({
      title: `Rewrite complete scalar keyframe sequence on layer ${target.layerIndex}`,
      intent: "Preserve every unselected scalar value and distribute only the reviewed selected keyframe times.",
      tool: "set_property_keyframes",
      args: {
        compItemIndex: comp.itemIndex,
        compName: comp.name,
        layerIndex: target.layerIndex,
        propertyPath: target.propertyPath.map((segment) => segment.propertyIndex),
        keyframes: target.replacementKeyframes.map((keyframe) => ({ time: keyframe.time, value: keyframe.value })),
        clearExisting: true,
        verifyAfter: true,
        idempotencyScope: "solution-plan"
      },
      dependsOnStep: null,
      resultBindings: {},
      mutatesProject: true,
      idempotencyKeyTemplate: `ae-plan-{requestId}-${mutationIdentity}-rewrite`,
      verifyAfter: true
    });
    steps.push({
      title: `Restore explicit linear interpolation on layer ${target.layerIndex}`,
      intent: "Set all replacement scalar keys to the only supported reviewed interpolation type.",
      tool: "apply_keyframe_ease",
      args: {
        compItemIndex: comp.itemIndex,
        compName: comp.name,
        layerIndex: target.layerIndex,
        propertyPath: target.propertyPath.map((segment) => segment.propertyIndex),
        keyIndices: target.replacementKeyframes.map((keyframe) => keyframe.index),
        interpolation: "linear",
        verifyAfter: true,
        idempotencyScope: "solution-plan"
      },
      dependsOnStep: null,
      resultBindings: {},
      mutatesProject: true,
      idempotencyKeyTemplate: `ae-plan-{requestId}-${mutationIdentity}-linear`,
      verifyAfter: true
    });
  }
  steps.push(...layers.map((layer) => inspectionStep(comp, layer, "after")));

  const spec = {
    name: config.specName,
    targetComp: comp,
    frameRate: comp.frameRate,
    distributionMode: config.mode,
    [config.startName]: bounds.startTime,
    [config.endName]: bounds.endTime,
    boundsSource: bounds.source,
    acceptedPropertyTargets: plannedTargets,
    skippedTargets: [],
    skippedTargetReasons: [],
    sourceExactSemantics: false,
    metadataPolicy: "linear scalar only; temporal ease and spatial tangent payloads are unsupported"
  };
  if (config.boundsSource === "layer") {
    spec.layerTimingSource = {
      layerIndex: bounds.sourceLayerIndex,
      layerName: bounds.sourceLayerName
    };
  }

  const expectedReadBack = {
    before: plannedTargets.map((target) => ({
      compItemIndex: comp.itemIndex,
      compName: comp.name,
      layerIndex: target.layerIndex,
      layerName: target.layerName,
      propertyPath: target.propertyPath,
      completeKeyframes: target.completePropertyKeyframes
    })),
    after: plannedTargets.map((target) => ({
      compItemIndex: comp.itemIndex,
      compName: comp.name,
      layerIndex: target.layerIndex,
      layerName: target.layerName,
      propertyPath: target.propertyPath,
      completeKeyframes: target.replacementKeyframes.map((keyframe) => ({
        index: keyframe.index,
        time: keyframe.time,
        value: keyframe.value,
        inInterpolation: "linear",
        outInterpolation: "linear"
      }))
    }))
  };

  return {
    summary: `Distribute reviewed selected scalar keyframes for ${plannedTargets.length} property target(s).`,
    risk: "high",
    mutatesProject: true,
    previewLocal: true,
    executionMode: "preview-only-build",
    requiresCheckpoint: true,
    requiresFreshEvidenceReview: true,
    clarifyingQuestion: null,
    solutionIds: [solutionId],
    steps,
    solutionSpec: spec,
    expectedReadBack,
    verification: {
      tool: "get_layer_details",
      compare: ["comp identity", "layer identity", "property path", "complete keyframe count", "times", "scalar values", "linear in/out interpolation"],
      requireExactMatch: true,
      requiresFreshEvidenceReview: true
    }
  };
}

function buildSolutionPlan(solutionId, inputs) {
  if (typeof solutionId !== "string" || !Object.prototype.hasOwnProperty.call(SOLUTIONS, solutionId)) {
    return fail(
      "UNSUPPORTED_SOLUTION",
      `Unsupported solutionId. Supported ids: ${Object.keys(SOLUTIONS).join(", ")}.`,
      "solutionId",
      solutionId
    );
  }
  try {
    const normalized = normalizeInputs(inputs, SOLUTIONS[solutionId]);
    const plan = buildPlan(solutionId, normalized, SOLUTIONS[solutionId]);
    return {
      ok: true,
      solutionId,
      solutionIds: [solutionId],
      previewLocal: true,
      mutatesProject: false,
      requiresFreshEvidenceReview: true,
      plan
    };
  } catch (error) {
    if (error instanceof PlanInputError) return fail(error.code, error.message, error.path, solutionId);
    return fail("PLAN_BUILD_FAILED", "Solution plan could not be built from the supplied evidence.", null, solutionId);
  }
}

module.exports = {
  SUPPORTED_SOLUTION_IDS,
  supportedSolutionIds: SUPPORTED_SOLUTION_IDS,
  builderInputContract,
  getBuilderContract,
  buildSolutionPlan
};
