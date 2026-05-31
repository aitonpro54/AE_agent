"use strict";

const SEMANTIC_VERIFICATION_SCHEMA = "ae-agent-semantic-verification.v1";
const COLOR_CHANNEL_QUANTIZATION_TOLERANCE = (0.5 / 255) + 0.000001;

const MUTATING_TOOLS = new Set([
  "create_test_comp",
  "create_solid_layer",
  "create_text_layer",
  "create_camera_layer",
  "create_camera_with_controller",
  "toggle_onion_skinning",
  "add_project_item_to_comp",
  "set_comp_work_area",
  "set_layer_time_range",
  "stagger_layers",
  "align_layers_to_time",
  "split_layers_at_time",
  "update_text_layer",
  "create_shape_layer",
  "create_layer_mask",
  "fit_layer_to_comp",
  "set_property_value",
  "set_property_keyframes",
  "fill_in_keyframes",
  "keyframe_current_value_from_expression",
  "apply_keyframe_ease",
  "set_spatial_in_tangent",
  "set_expression",
  "clear_expression",
  "separate_shape_size_dimensions",
  "duplicate_layer",
  "duplicate_layers",
  "delete_layer",
  "set_comp_properties",
  "set_layer_mask",
  "add_layer_marker",
  "update_layer_marker",
  "delete_layer_marker",
  "duplicate_comp",
  "deep_duplicate_precomp_sources",
  "precompose_layers",
  "replace_layer_source",
  "rename_layers",
  "rename_project_items",
  "add_comp_to_render_queue",
  "set_render_queue_output",
  "cleanup_test_items"
]);

const READ_BACK_TOOLS = new Set([
  "get_bridge_status",
  "get_project_snapshot",
  "get_active_comp",
  "get_selected_layers",
  "get_selected_properties",
  "find_project_items",
  "list_comps",
  "list_layers",
  "get_comp_details",
  "get_layer_details",
  "get_render_queue_status"
]);

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasOwn(value, key) {
  return Boolean(isPlainObject(value) && Object.prototype.hasOwnProperty.call(value, key));
}

function compactText(value, maxLength = 180) {
  const text = String(value === undefined || value === null ? "" : value).replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}...`;
}

function stableStringify(value) {
  try {
    return JSON.stringify(value);
  } catch (_error) {
    return String(value === undefined ? "" : value);
  }
}

function numberValue(value) {
  const raw = isPlainObject(value) && hasOwn(value, "value") ? value.value : value;
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
}

function nearlyEqual(left, right, tolerance = 0.001) {
  const a = numberValue(left);
  const b = numberValue(right);
  return a !== null && b !== null && Math.abs(a - b) <= tolerance;
}

function colorChannelNearlyEqual(left, right) {
  return nearlyEqual(left, right, COLOR_CHANNEL_QUANTIZATION_TOLERANCE);
}

function sameString(left, right) {
  return String(left || "") === String(right || "");
}

function numberArrayValue(value) {
  const raw = Array.isArray(value)
    ? value
    : isPlainObject(value) && Array.isArray(value.value)
      ? value.value
      : null;
  if (!raw) return null;
  const numbers = raw.map(numberValue);
  if (!numbers.length || numbers.some((item) => item === null)) return null;
  return numbers;
}

function normalizeSlashes(value) {
  return String(value || "").replace(/\\/g, "/");
}

function pathMatchesSuffix(observed, expected) {
  const left = normalizeSlashes(observed).toLowerCase();
  const right = normalizeSlashes(expected).toLowerCase();
  return Boolean(left && right && (left === right || left.endsWith(`/${right}`) || left.endsWith(right)));
}

function payloadForStep(step) {
  if (!step || step.result === undefined || step.result === null) return null;
  return step.result;
}

function isMutatingStep(step) {
  return Boolean(step && (step.mutatesProject === true || MUTATING_TOOLS.has(step.tool)));
}

function isReadBackStep(step) {
  if (!step || step.status !== "completed") return false;
  if (isMutatingStep(step)) return false;
  return READ_BACK_TOOLS.has(step.tool);
}

function stepLabel(step) {
  if (!step) return "step";
  return `${step.index || "?"}. ${step.title || step.tool || "Step"}`;
}

function addName(target, value, source) {
  const text = compactText(value, 160);
  if (!text) return;
  target.names.add(text);
  if (!target.nameSources[text]) target.nameSources[text] = [];
  if (source) target.nameSources[text].push(source);
}

function addOutputPath(target, value, source) {
  const text = compactText(value, 240);
  if (!text) return;
  target.outputPaths.add(text);
  if (!target.outputPathSources[text]) target.outputPathSources[text] = [];
  if (source) target.outputPathSources[text].push(source);
}

function addLayerCount(target, value, source) {
  const count = numberValue(value);
  if (count === null || count < 0) return;
  target.layerCounts.push({
    count,
    source: source || "observed layer count"
  });
}

function boolValue(value) {
  if (value === true || value === false) return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function addLayerEvidence(target, value, source) {
  if (!isPlainObject(value)) return;
  const index = numberValue(value.index);
  const name = compactText(value.name, 160);
  if (index === null || index < 1 || !name) return;
  const layer = {
    index,
    name,
    id: value.id === undefined || value.id === null ? null : String(value.id),
    source: source || "observed layer"
  };
  for (const field of ["threeDLayer", "collapseTransformation", "motionBlur"]) {
    if (hasOwn(value, field)) layer[field] = boolValue(value[field]);
  }
  target.layers.push(layer);
}

function addCompEvidence(target, value, source) {
  if (!isPlainObject(value)) return;
  const hasCompField = ["width", "height", "pixelAspect", "duration", "frameRate", "bgColor", "displayStartTime", "numLayers", "layerCount"].some((key) => hasOwn(value, key));
  if (!hasCompField) return;
  target.comps.push({
    name: compactText(value.name, 160),
    itemIndex: numberValue(value.itemIndex),
    width: numberValue(value.width),
    height: numberValue(value.height),
    pixelAspect: numberValue(value.pixelAspect),
    duration: numberValue(value.duration),
    frameRate: numberValue(value.frameRate),
    bgColor: numberArrayValue(value.bgColor),
    displayStartTime: numberValue(value.displayStartTime),
    numLayers: numberValue(hasOwn(value, "numLayers") ? value.numLayers : value.layerCount),
    source: source || "observed comp"
  });
}

function addMaskEvidence(target, value, source) {
  if (!isPlainObject(value)) return;
  const shape = isPlainObject(value.shape) ? value.shape : {};
  const hasMaskField = hasOwn(value, "maskMode") || hasOwn(value, "inverted") || hasOwn(value, "propertyIndex") || hasOwn(value, "opacity") || hasOwn(value, "feather") || hasOwn(value, "expansion") || Array.isArray(shape.vertices);
  if (!hasMaskField) return;
  target.masks.push({
    propertyIndex: numberValue(value.propertyIndex),
    name: compactText(value.name, 160),
    maskMode: value.maskMode === undefined || value.maskMode === null ? "" : String(value.maskMode),
    inverted: value.inverted === true,
    shape: {
      vertices: Array.isArray(shape.vertices) ? shape.vertices : []
    },
    opacity: numberValue(value.opacity),
    feather: numberArrayValue(value.feather),
    expansion: numberValue(value.expansion),
    source: source || "observed mask"
  });
}

function numberArrayFromValue(value) {
  return numberArrayValue(value);
}

function addNumberArray(target, key, value, source) {
  if (!key) return;
  const numbers = numberArrayFromValue(value);
  if (!numbers) return;
  if (!target.numberArrays[key]) target.numberArrays[key] = [];
  target.numberArrays[key].push({
    values: numbers,
    source: source || `observed ${key}`
  });
}

function createEvidenceStore(readBackSteps) {
  return {
    count: Array.isArray(readBackSteps) ? readBackSteps.length : 0,
    steps: Array.isArray(readBackSteps) ? readBackSteps.map((step) => ({
      index: step.index || null,
      title: step.title || step.tool || "Read-back step",
      tool: step.tool || null
    })) : [],
    names: new Set(),
    nameSources: {},
    outputPaths: new Set(),
    outputPathSources: {},
    layerCounts: [],
    numberArrays: {},
    layers: [],
    comps: [],
    masks: [],
    markers: [],
    markerSignatures: new Set(),
    properties: []
  };
}

function propertyPathSegments(value) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(".")
      : [];
  return raw
    .map((segment) => {
      if (isPlainObject(segment)) {
        if (segment.matchName !== undefined && segment.matchName !== null) return String(segment.matchName);
        if (segment.name !== undefined && segment.name !== null) return String(segment.name);
        if (segment.propertyIndex !== undefined && segment.propertyIndex !== null) return String(segment.propertyIndex);
      }
      return String(segment === undefined || segment === null ? "" : segment);
    })
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function propertyPathText(value) {
  return propertyPathSegments(value).join(".");
}

function propertyPathMatches(actualPath, expectedPath) {
  const actual = propertyPathSegments(actualPath);
  const expected = propertyPathSegments(expectedPath);
  if (!actual.length || !expected.length || actual.length < expected.length) return false;
  const tail = actual.slice(actual.length - expected.length);
  return expected.every((segment, index) => tail[index] === segment);
}

function propertyValueMatches(expected, observed, tolerance = 0.001) {
  const expectedNumbers = numberArrayValue(expected);
  if (expectedNumbers) {
    const observedNumbers = numberArrayValue(observed);
    return Boolean(observedNumbers) &&
      observedNumbers.length >= expectedNumbers.length &&
      expectedNumbers.every((value, index) => nearlyEqual(value, observedNumbers[index], tolerance));
  }

  const expectedNumber = numberValue(expected);
  if (expectedNumber !== null) {
    return nearlyEqual(expectedNumber, observed, tolerance);
  }

  return stableStringify(expected) === stableStringify(isPlainObject(observed) && hasOwn(observed, "value") ? observed.value : observed);
}

function addPropertyEvidence(target, value, source) {
  if (!isPlainObject(value)) return;
  if (!hasOwn(value, "value") && !value.propertyPath && !value.matchName && !value.name) return;
  target.properties.push({
    name: value.name || null,
    matchName: value.matchName || null,
    propertyPath: Array.isArray(value.propertyPath) ? value.propertyPath : [],
    value: hasOwn(value, "value") ? value.value : undefined,
    source: source || "observed property"
  });
}

function markerSignature(marker) {
  if (!marker) return "";
  const comment = compactText(marker.comment, 180);
  const time = numberValue(marker.time);
  const duration = numberValue(marker.duration);
  return [
    comment,
    time === null ? "" : time.toFixed(3),
    duration === null ? "" : duration.toFixed(3)
  ].join("\u0001");
}

function addMarker(target, value, source) {
  if (!isPlainObject(value)) return;
  const comment = String(value.comment === undefined || value.comment === null ? "" : value.comment);
  if (!comment && !hasOwn(value, "time")) return;
  const marker = {
    comment,
    time: numberValue(value.time),
    duration: numberValue(value.duration) || 0,
    source: source || "observed marker"
  };
  const signature = markerSignature(marker);
  if (target.markerSignatures.has(signature)) return;
  target.markerSignatures.add(signature);
  target.markers.push(marker);
}

function collectMarkerPayload(payload, evidence, source) {
  if (!isPlainObject(payload)) return;
  if (isPlainObject(payload.marker)) addMarker(evidence, payload.marker, source);
  if (Array.isArray(payload.markers)) {
    for (const marker of payload.markers) addMarker(evidence, marker, source);
  } else if (isPlainObject(payload.markers) && Array.isArray(payload.markers.items)) {
    for (const marker of payload.markers.items) addMarker(evidence, marker, source);
  }
}

function collectPayloadEvidence(payload, evidence, source, depth = 0) {
  if (!payload || depth > 6) return;
  if (Array.isArray(payload)) {
    for (const item of payload) collectPayloadEvidence(item, evidence, source, depth + 1);
    return;
  }
  if (typeof payload === "string") {
    const text = payload.trim();
    if (text && (text[0] === "{" || text[0] === "[")) {
      try {
        collectPayloadEvidence(JSON.parse(text), evidence, source, depth + 1);
      } catch (_error) {}
    }
    return;
  }
  if (!isPlainObject(payload)) return;

  if (typeof payload.name === "string") addName(evidence, payload.name, source);
  addLayerEvidence(evidence, payload, source);
  addCompEvidence(evidence, payload, source);
  addMaskEvidence(evidence, payload, source);
  addPropertyEvidence(evidence, payload, source);
  if (isPlainObject(payload.property)) addPropertyEvidence(evidence, payload.property, source);
  if (Array.isArray(payload.properties)) {
    for (const property of payload.properties) addPropertyEvidence(evidence, property, source);
  }
  if (typeof payload.before === "string") addName(evidence, payload.before, source);
  if (typeof payload.after === "string") addName(evidence, payload.after, source);
  if (typeof payload.file === "string") addOutputPath(evidence, payload.file, source);
  if (typeof payload.outputPath === "string") addOutputPath(evidence, payload.outputPath, source);
  if (hasOwn(payload, "numLayers")) addLayerCount(evidence, payload.numLayers, source);
  if (hasOwn(payload, "layerCount")) addLayerCount(evidence, payload.layerCount, source);
  if (Array.isArray(payload.layers)) addLayerCount(evidence, payload.layers.length, source);
  if (hasOwn(payload, "position")) addNumberArray(evidence, "position", payload.position, source);
  if (hasOwn(payload, "pointOfInterest")) addNumberArray(evidence, "pointOfInterest", payload.pointOfInterest, source);
  collectMarkerPayload(payload, evidence, source);

  for (const key of Object.keys(payload)) {
    collectPayloadEvidence(payload[key], evidence, source, depth + 1);
  }
}

function stepOrder(step, fallback) {
  const number = Number(step && step.index);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function collectReadBackEvidence(steps, afterOrder, beforeOrder) {
  const readBackSteps = [];
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    const order = stepOrder(step, index + 1);
    if (
      isReadBackStep(step) &&
      order > afterOrder &&
      (beforeOrder === undefined || beforeOrder === null || order < beforeOrder)
    ) {
      readBackSteps.push(step);
    }
  }
  const evidence = createEvidenceStore(readBackSteps);

  for (const step of readBackSteps) {
    collectPayloadEvidence(payloadForStep(step), evidence, stepLabel(step));
  }

  return evidence;
}

function collectAllEvidence(steps) {
  const evidence = createEvidenceStore([]);
  for (const step of steps) {
    if (step && step.status === "completed") {
      collectPayloadEvidence(payloadForStep(step), evidence, stepLabel(step));
    }
  }
  return evidence;
}

function observedNameEvidence(evidence, expectedName) {
  if (!expectedName) return null;
  if (evidence.names.has(expectedName)) {
    const source = evidence.nameSources[expectedName] && evidence.nameSources[expectedName][0];
    return source || "observed result";
  }
  return null;
}

function observedLayerAtIndexEvidence(evidence, expectedIndex, expectedName) {
  const index = numberValue(expectedIndex);
  const name = compactText(expectedName, 160);
  if (index === null || !name || !evidence || !Array.isArray(evidence.layers)) return null;
  for (const layer of evidence.layers) {
    if (nearlyEqual(layer.index, index) && layer.name === name) {
      return layer.source || `layer ${index}: ${name}`;
    }
  }
  return null;
}

function observedOutputEvidence(evidence, expectedPath) {
  if (!expectedPath) return null;
  for (const outputPath of evidence.outputPaths) {
    if (pathMatchesSuffix(outputPath, expectedPath)) {
      const source = evidence.outputPathSources[outputPath] && evidence.outputPathSources[outputPath][0];
      return source || outputPath;
    }
  }
  return null;
}

function observedNumberArrayEvidence(evidence, key, expectedValues) {
  if (!evidence || !evidence.numberArrays || !Array.isArray(expectedValues)) return null;
  const candidates = evidence.numberArrays[key] || [];
  for (const candidate of candidates) {
    const values = Array.isArray(candidate.values) ? candidate.values : [];
    if (
      values.length >= expectedValues.length &&
      expectedValues.every((value, index) => nearlyEqual(value, values[index]))
    ) {
      return {
        source: candidate.source || `observed ${key}`,
        values: values.slice(0, expectedValues.length)
      };
    }
  }
  return null;
}

function observedLayerCountEvidence(evidence, expectedCount) {
  const expected = numberValue(expectedCount);
  if (expected === null || !evidence || !Array.isArray(evidence.layerCounts)) return null;
  for (const item of evidence.layerCounts) {
    if (nearlyEqual(item.count, expected)) return item.source || "observed layer count";
  }
  return null;
}

function observedDeletedLayerAbsent(evidence, payload, args) {
  if (!evidence || !payload) return null;
  const deletedLayer = payload.deletedLayer || {};
  const deletedId = deletedLayer.id === undefined || deletedLayer.id === null ? "" : String(deletedLayer.id);
  const expectedName = compactText(args.expectedLayerName || payload.expectedLayerName, 160);
  const requestedLayerIndex = numberValue(args.layerIndex || payload.requestedLayerIndex);
  const afterCountEvidence = observedLayerCountEvidence(evidence, payload.layerCountAfter);
  const deletedIdStillPresent = deletedId && evidence.layers.some((layer) => layer.id === deletedId);
  const sameNameAtDeletedIndex = requestedLayerIndex !== null && expectedName
    ? observedLayerAtIndexEvidence(evidence, requestedLayerIndex, expectedName)
    : null;
  if (afterCountEvidence && !deletedIdStillPresent && !sameNameAtDeletedIndex) return afterCountEvidence;
  return null;
}

function compFieldMatches(comp, field, expected) {
  if (!comp) return false;
  if (field === "bgColor") {
    const expectedColor = numberArrayValue(expected);
    const observedColor = numberArrayValue(comp.bgColor);
    return Array.isArray(expectedColor) &&
      Array.isArray(observedColor) &&
      expectedColor.length === 3 &&
      observedColor.length >= 3 &&
      expectedColor.every((value, index) => colorChannelNearlyEqual(value, observedColor[index]));
  }
  return nearlyEqual(comp[field], expected);
}

function observedCompFieldEvidence(evidence, field, expected) {
  if (!evidence || !Array.isArray(evidence.comps)) return null;
  for (const comp of evidence.comps) {
    if (compFieldMatches(comp, field, expected)) return comp.source || "observed comp";
  }
  return null;
}

function pointsMatch(observed, expected) {
  if (!Array.isArray(expected)) return true;
  if (!Array.isArray(observed) || observed.length < expected.length) return false;
  return expected.every((point, index) => (
    Array.isArray(point) &&
    Array.isArray(observed[index]) &&
    nearlyEqual(point[0], observed[index][0]) &&
    nearlyEqual(point[1], observed[index][1])
  ));
}

function numberArrayMatches(observed, expected) {
  const expectedNumbers = numberArrayValue(expected);
  if (!Array.isArray(expectedNumbers)) return true;
  const observedNumbers = numberArrayValue(observed);
  if (!Array.isArray(observedNumbers) || observedNumbers.length < expectedNumbers.length) return false;
  return expectedNumbers.every((value, index) => nearlyEqual(value, observedNumbers[index]));
}

function maskMatchesArgs(mask, args) {
  if (!mask) return false;
  if (hasOwn(args, "maskIndex") && !nearlyEqual(mask.propertyIndex, args.maskIndex)) return false;
  if (hasOwn(args, "expectedMaskName") && args.expectedMaskName && !sameString(mask.name, args.expectedMaskName)) return false;
  if (hasOwn(args, "name") && args.operation === "create" && args.name && !sameString(mask.name, args.name)) return false;
  if (hasOwn(args, "vertices") && !pointsMatch(mask.shape && mask.shape.vertices, args.vertices)) return false;
  if (hasOwn(args, "maskMode") && !sameString(mask.maskMode, args.maskMode)) return false;
  if (hasOwn(args, "inverted") && mask.inverted !== args.inverted) return false;
  if (hasOwn(args, "opacity") && !nearlyEqual(mask.opacity, args.opacity)) return false;
  if (hasOwn(args, "feather") && !numberArrayMatches(mask.feather, args.feather)) return false;
  if (hasOwn(args, "expansion") && !nearlyEqual(mask.expansion, args.expansion)) return false;
  return true;
}

function observedMaskEvidence(evidence, args, payloadMask) {
  if (!evidence || !Array.isArray(evidence.masks)) return null;
  const index = numberValue(payloadMask && payloadMask.propertyIndex);
  const name = compactText(payloadMask && payloadMask.name, 160);
  for (const mask of evidence.masks) {
    if (index !== null && mask.propertyIndex !== null && !nearlyEqual(mask.propertyIndex, index)) continue;
    if (name && mask.name && mask.name !== name) continue;
    if (maskMatchesArgs(mask, args)) return mask.source || "observed mask";
  }
  return null;
}

function markerMatchesArgs(marker, args) {
  if (!marker || !args) return false;
  if (!sameString(marker.comment, args.comment)) return false;
  if (hasOwn(args, "time") && !nearlyEqual(marker.time, args.time)) return false;
  if (hasOwn(args, "duration") && !nearlyEqual(marker.duration, args.duration)) return false;
  return true;
}

function updatedMarkerMatchesArgs(marker, args) {
  if (!marker || !args) return false;
  if (hasOwn(args, "comment") && !sameString(marker.comment, args.comment)) return false;
  if (hasOwn(args, "time") && !nearlyEqual(marker.time, args.time)) return false;
  if (hasOwn(args, "duration") && !nearlyEqual(marker.duration, args.duration)) return false;
  return true;
}

function observedUpdatedMarkerEvidence(evidence, args) {
  if (!evidence || !Array.isArray(evidence.markers)) return null;
  for (const marker of evidence.markers) {
    if (updatedMarkerMatchesArgs(marker, args)) return marker.source || "observed marker";
  }
  return null;
}

function markerMatchesDeleteTarget(marker, target) {
  if (!marker || !target) return false;
  if (target.comment && !sameString(marker.comment, target.comment)) return false;
  if (target.time !== null && target.time !== undefined && !nearlyEqual(marker.time, target.time)) return false;
  if (target.duration !== null && target.duration !== undefined && !nearlyEqual(marker.duration, target.duration)) return false;
  return true;
}

function observedDeletedMarkerAbsent(evidence, deletedMarker, args) {
  if (!evidence || !Array.isArray(evidence.markers) || !deletedMarker) return false;
  const target = {
    comment: args.targetComment || deletedMarker.comment || "",
    time: hasOwn(args, "targetTime") ? args.targetTime : deletedMarker.time,
    duration: deletedMarker.duration
  };
  return !evidence.markers.some((marker) => markerMatchesDeleteTarget(marker, target));
}

function observedMarkerEvidence(evidence, args) {
  if (!evidence || !Array.isArray(evidence.markers)) return null;
  for (const marker of evidence.markers) {
    if (markerMatchesArgs(marker, args)) return marker.source || "observed marker";
  }
  return null;
}

function markerText(marker) {
  if (!marker) return "missing";
  const parts = [`comment: ${marker.comment || ""}`];
  if (marker.time !== null && marker.time !== undefined) parts.push(`time: ${marker.time}`);
  if (marker.duration !== null && marker.duration !== undefined) parts.push(`duration: ${marker.duration}`);
  return parts.join(", ");
}

function expectedMarkerText(args) {
  const parts = [`comment: ${args.comment || ""}`];
  if (hasOwn(args, "time")) parts.push(`time: ${args.time}`);
  if (hasOwn(args, "duration")) parts.push(`duration: ${args.duration}`);
  return parts.join(", ");
}

function pushCheck(checks, fields) {
  const status = fields.status || (fields.passed ? "passed" : "failed");
  checks.push({
    id: fields.id,
    status,
    title: fields.title,
    expected: compactText(fields.expected, 220),
    observed: compactText(fields.observed, 220),
    evidence: compactText(fields.evidence, 220)
  });
}

function checkName(checks, step, expectedName, observedName, evidence, title) {
  if (!expectedName) return;
  const readBackEvidence = observedNameEvidence(evidence.readBack, expectedName);
  const allEvidence = observedNameEvidence(evidence.all, expectedName);
  pushCheck(checks, {
    id: `${step.index || "step"}:${step.tool}:name`,
    title,
    expected: expectedName,
    observed: observedName || (allEvidence ? expectedName : "not observed"),
    passed: sameString(observedName, expectedName) || Boolean(allEvidence),
    evidence: readBackEvidence || allEvidence || "No matching read-back or result name."
  });
}

function checkNumberFields(checks, step, fields, payload, title) {
  const mismatches = [];
  const observed = [];
  for (const field of fields) {
    if (!hasOwn(step.args, field.arg)) continue;
    const expected = step.args[field.arg];
    const actual = field.read(payload);
    observed.push(`${field.label}: ${actual === undefined || actual === null ? "missing" : actual}`);
    if (!nearlyEqual(actual, expected)) {
      mismatches.push(`${field.label} expected ${expected}, observed ${actual === undefined || actual === null ? "missing" : actual}`);
    }
  }
  if (!observed.length) return;
  pushCheck(checks, {
    id: `${step.index || "step"}:${step.tool}:numbers`,
    title,
    expected: fields.filter((field) => hasOwn(step.args, field.arg)).map((field) => `${field.label}: ${step.args[field.arg]}`).join(", "),
    observed: observed.join(", "),
    passed: mismatches.length === 0,
    evidence: mismatches.length ? mismatches.join("; ") : stepLabel(step)
  });
}

function checkNumberArrayField(checks, step, arg, observedValue, evidence, title) {
  if (!hasOwn(step.args, arg)) return;
  const expected = Array.isArray(step.args[arg]) ? step.args[arg] : [];
  const observedNumbers = numberArrayFromValue(observedValue);
  const observed = observedNumbers ? observedNumbers.slice(0, expected.length) : [];
  const readBackEvidence = observedNumberArrayEvidence(evidence.readBack, arg, expected);
  const allEvidence = observedNumberArrayEvidence(evidence.all, arg, expected);
  const fallbackObserved = readBackEvidence || allEvidence;
  const finalObserved = observed.length ? observed : fallbackObserved ? fallbackObserved.values : [];
  const passed = expected.length > 0 && (
    expected.every((value, index) => nearlyEqual(value, observed[index])) ||
    Boolean(fallbackObserved)
  );
  pushCheck(checks, {
    id: `${step.index || "step"}:${step.tool}:${arg}`,
    title,
    expected: expected.join(","),
    observed: finalObserved.length ? finalObserved.join(",") : "missing",
    passed,
    evidence: passed ? (readBackEvidence && readBackEvidence.source || allEvidence && allEvidence.source || stepLabel(step)) : `${arg} read-back did not match requested values.`
  });
}

function checkPointListField(checks, step, arg, observedValue, title) {
  if (!hasOwn(step.args, arg)) return;
  const expected = Array.isArray(step.args[arg]) ? step.args[arg] : [];
  const observed = Array.isArray(observedValue) ? observedValue : [];
  const mismatch = expected.length <= 0 ||
    observed.length < expected.length ||
    expected.some((point, index) => (
      !Array.isArray(point) ||
      !Array.isArray(observed[index]) ||
      !nearlyEqual(point[0], observed[index][0]) ||
      !nearlyEqual(point[1], observed[index][1])
    ));
  pushCheck(checks, {
    id: `${step.index || "step"}:${step.tool}:${arg}`,
    title,
    expected: expected.map((point) => Array.isArray(point) ? point.join(",") : String(point)).join(" | "),
    observed: observed.length ? observed.slice(0, expected.length).map((point) => Array.isArray(point) ? point.join(",") : String(point)).join(" | ") : "missing",
    passed: !mismatch,
    evidence: !mismatch ? stepLabel(step) : `${arg} read-back did not match requested points.`
  });
}

function observedPropertyValueEvidence(evidence, args) {
  for (const property of evidence.properties || []) {
    if (propertyPathMatches(property.propertyPath, args.propertyPath) && propertyValueMatches(args.value, property.value, 0.01)) {
      return property.source || `Read ${propertyPathText(args.propertyPath)} after set_property_value.`;
    }
  }
  const path = propertyPathSegments(args.propertyPath);
  const layerAttribute = path.length === 1 && ["threeDLayer", "collapseTransformation", "motionBlur"].includes(path[0])
    ? path[0]
    : null;
  if (layerAttribute) {
    for (const layer of evidence.layers || []) {
      if (hasOwn(layer, layerAttribute) && propertyValueMatches(args.value, layer[layerAttribute], 0.01)) {
        return layer.source || `Read ${layerAttribute} after set_property_value.`;
      }
    }
  }
  return null;
}

function checkSetPropertyValue(checks, step, payload, evidence) {
  const args = step.args || {};
  const properties = Array.isArray(payload.properties)
    ? payload.properties
    : payload.property
      ? [payload.property]
      : [];
  const resultMatch = properties.find((property) => (
    propertyPathMatches(property.propertyPath, args.propertyPath) &&
    propertyValueMatches(args.value, property.value, 0.01)
  ));
  const readBackEvidence = observedPropertyValueEvidence(evidence.readBack, args);
  pushCheck(checks, {
    id: `${step.index || "step"}:${step.tool}:value`,
    title: "Layer property value matches request",
    expected: `${propertyPathText(args.propertyPath)} = ${compactText(stableStringify(args.value), 80)}`,
    observed: resultMatch
      ? `${propertyPathText(resultMatch.propertyPath)} = ${compactText(stableStringify(resultMatch.value), 80)}`
      : "missing or mismatched property value",
    passed: Boolean(resultMatch) && Boolean(readBackEvidence),
    evidence: readBackEvidence || "No post-run layer/property read-back matched set_property_value."
  });
}

function keyframeAtTime(property, time) {
  const keyframes = Array.isArray(property && property.keyframes) ? property.keyframes : [];
  const target = Number(time);
  return keyframes.find((keyframe) => nearlyEqual(Number(keyframe && keyframe.time), target, 0.001)) || null;
}

function checkCameraWithController(checks, step, payload) {
  const camera = payload.cameraLayer || {};
  const controller = payload.controllerLayer || {};
  const parent = camera.parent || {};
  const cameraName = step.args && (step.args.cameraName || "Camera 1");
  const controllerName = step.args && (step.args.controllerName || "Camera Controller");
  pushCheck(checks, {
    id: `${step.index || "step"}:${step.tool}:parent`,
    title: "Camera is parented to the generated controller",
    expected: `${cameraName} parent = ${controllerName}`,
    observed: `${camera.name || "missing camera"} parent = ${parent.name || "missing parent"}`,
    passed: camera.name === cameraName && controller.name === controllerName && parent.name === controllerName,
    evidence: stepLabel(step)
  });
  pushCheck(checks, {
    id: `${step.index || "step"}:${step.tool}:controller`,
    title: "Controller is 3D with separated Position dimensions",
    expected: "threeDLayer:true, positionDimensionsSeparated:true",
    observed: `threeDLayer:${payload.controller && payload.controller.threeDLayer === true}, positionDimensionsSeparated:${payload.controller && payload.controller.positionDimensionsSeparated === true}`,
    passed: Boolean(payload.controller && payload.controller.threeDLayer === true && payload.controller.positionDimensionsSeparated === true),
    evidence: stepLabel(step)
  });
}

function checkToggleOnionSkinning(checks, step, payload) {
  const args = step.args || {};
  const expectedEnabled = args.mode === "disable" ? false : true;
  const effect = payload.effect || {};
  pushCheck(checks, {
    id: `${step.index || "step"}:${step.tool}:state`,
    title: "Onion skinning state matches request",
    expected: expectedEnabled ? "enabled with CC Wide Time" : "disabled",
    observed: payload.enabled ? `${payload.layer && payload.layer.name || "layer"} / ${effect.name || effect.matchName || "missing effect"}` : "disabled",
    passed: expectedEnabled ? payload.enabled === true && /wide time/i.test(`${effect.name || ""} ${effect.matchName || ""}`) : payload.enabled === false,
    evidence: stepLabel(step)
  });
}

function checkFillInKeyframes(checks, step, payload) {
  const property = payload.property || {};
  const keyframes = Array.isArray(property.keyframes) ? property.keyframes : [];
  const clearExpression = !step.args || step.args.clearExpression !== false;
  const allLinear = keyframes.length > 0 && keyframes.every((keyframe) => (
    (!keyframe.inInterpolation || keyframe.inInterpolation === "linear") &&
    (!keyframe.outInterpolation || keyframe.outInterpolation === "linear")
  ));
  pushCheck(checks, {
    id: `${step.index || "step"}:${step.tool}:keyframes`,
    title: "Expression/value samples were baked into linear keyframes",
    expected: "sampled keyframes with linear interpolation",
    observed: `${payload.keyframeCount || 0} keyframe(s), sampled=${payload.sampledCount || 0}`,
    passed: Number(payload.keyframeCount || 0) >= 2 && allLinear && (!clearExpression || !property.expression),
    evidence: stepLabel(step)
  });
}

function checkCurrentExpressionKeyframe(checks, step, payload) {
  const time = hasOwn(step.args || {}, "time") ? step.args.time : payload.comp && payload.comp.time;
  const property = payload.property || {};
  const keyframe = keyframeAtTime(property, time);
  pushCheck(checks, {
    id: `${step.index || "step"}:${step.tool}:keyframe`,
    title: "Current post-expression value was written as a keyframe",
    expected: `keyframe at ${time}`,
    observed: keyframe ? `keyframe at ${keyframe.time}` : "missing keyframe",
    passed: Boolean(keyframe),
    evidence: stepLabel(step)
  });
}

function checkSpatialInTangent(checks, step, payload) {
  const tangent = numberArrayValue(payload.inSpatialTangent);
  const keyIndex = Number(payload.keyIndex || step.args && step.args.keyIndex || 0);
  const property = payload.property || {};
  const keyframes = Array.isArray(property.keyframes) ? property.keyframes : [];
  const keyframe = keyframes.find((item) => Number(item && item.index) === keyIndex);
  const readBackTangent = numberArrayValue(keyframe && keyframe.inSpatialTangent);
  const matches = tangent && readBackTangent &&
    tangent.length === readBackTangent.length &&
    tangent.every((value, index) => nearlyEqual(value, readBackTangent[index], 0.001));
  pushCheck(checks, {
    id: `${step.index || "step"}:${step.tool}:spatial-tangent`,
    title: "Spatial in tangent was written and read back",
    expected: tangent ? tangent.join(",") : "computed tangent",
    observed: readBackTangent ? readBackTangent.join(",") : "missing tangent",
    passed: Boolean(matches),
    evidence: stepLabel(step)
  });
}

function checkSeparateShapeSizeDimensions(checks, step, payload) {
  const sliders = Array.isArray(payload.sliders) ? payload.sliders : [];
  const expression = String(payload.expression || payload.property && payload.property.expression || "");
  const xName = step.args && (step.args.xSliderName || "X Size");
  const yName = step.args && (step.args.ySliderName || "Y Size");
  pushCheck(checks, {
    id: `${step.index || "step"}:${step.tool}:sliders-expression`,
    title: "Shape Size is driven by X/Y slider controls",
    expected: `${xName}, ${yName}, expression`,
    observed: `${sliders.map((slider) => slider.name).join(", ")}; expression=${expression ? "present" : "missing"}`,
    passed: sliders.length >= 2 && expression.includes(xName) && expression.includes(yName),
    evidence: stepLabel(step)
  });
}

function arrayLength(value) {
  return Array.isArray(value) ? value.length : 0;
}

function changedItems(payload) {
  if (!payload) return [];
  return Array.isArray(payload.changed) ? payload.changed
    : Array.isArray(payload.aligned) ? payload.aligned
      : Array.isArray(payload.split) ? payload.split
        : [];
}

function layerAfter(item) {
  return item && (item.after || item.layer || item.newLayer || item.original || null);
}

function expectedRenameValue(before, args, index, total) {
  const mode = args.mode || (hasOwn(args, "name") ? "exact" : hasOwn(args, "prefix") ? "prefix" : hasOwn(args, "suffix") ? "suffix" : "findReplace");
  if (mode === "exact") return args.name || "";
  if (mode === "prefix") return `${args.prefix || ""}${before || ""}`;
  if (mode === "suffix") return `${before || ""}${args.suffix || ""}`;
  const findText = String(args.find || "");
  if (!findText) return "";
  const flags = args.caseSensitive === false ? "gi" : "g";
  try {
    return String(before || "").replace(new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags), String(args.replace || ""));
  } catch (_error) {
    return "";
  }
}

function checkChangedLayerTiming(checks, step, payload) {
  const items = changedItems(payload);
  if (!items.length) return;
  const args = step.args || {};
  const mismatches = [];
  for (const item of items) {
    const after = layerAfter(item);
    if (!after) {
      mismatches.push("missing layer read-back");
      continue;
    }
    if (hasOwn(args, "startTime") && !nearlyEqual(after.startTime, args.startTime)) mismatches.push(`layer ${after.index || "?"} startTime`);
    if (hasOwn(args, "inPoint") && !nearlyEqual(after.inPoint, args.inPoint)) mismatches.push(`layer ${after.index || "?"} inPoint`);
    if (hasOwn(args, "outPoint") && !nearlyEqual(after.outPoint, args.outPoint)) mismatches.push(`layer ${after.index || "?"} outPoint`);
    if (hasOwn(args, "duration") && !nearlyEqual(Number(after.outPoint) - Number(after.inPoint), args.duration)) mismatches.push(`layer ${after.index || "?"} duration`);
  }
  pushCheck(checks, {
    id: `${step.index || "step"}:${step.tool}:timing`,
    title: "Layer timing matches requested range",
    expected: ["startTime", "inPoint", "outPoint", "duration"].filter((key) => hasOwn(args, key)).map((key) => `${key}: ${args[key]}`).join(", "),
    observed: `${items.length} layer timing read-back item(s)`,
    passed: mismatches.length === 0,
    evidence: mismatches.length ? mismatches.join("; ") : stepLabel(step)
  });
}

function checkStagger(checks, step, payload) {
  const items = changedItems(payload);
  if (!items.length) return;
  const first = layerAfter(items[0]);
  const startTime = hasOwn(step.args, "startTime") ? step.args.startTime : payload.startTime;
  const mismatch = startTime !== undefined && first && !nearlyEqual(first.inPoint, startTime) && !nearlyEqual(first.startTime, startTime);
  pushCheck(checks, {
    id: `${step.index || "step"}:${step.tool}:stagger`,
    title: "Layer stagger has timing read-back",
    expected: `first layer starts near ${startTime}`,
    observed: first ? `first layer start=${first.startTime}, in=${first.inPoint}; changed=${items.length}` : "missing first layer",
    passed: !mismatch && Boolean(first),
    evidence: stepLabel(step)
  });
}

function checkAlign(checks, step, payload) {
  const items = Array.isArray(payload && payload.aligned) ? payload.aligned : [];
  if (!items.length) return;
  const targetTime = hasOwn(step.args, "targetTime") ? step.args.targetTime : payload.targetTime;
  const align = step.args.align || payload.align || "inPoint";
  const mismatches = [];
  for (const item of items) {
    const after = item && item.after;
    if (!after) {
      mismatches.push("missing layer timing");
      continue;
    }
    const actual = align === "startTime" ? after.startTime : after.inPoint;
    if (!nearlyEqual(actual, targetTime)) mismatches.push(`layer ${after.index || "?"} ${align}=${actual}`);
  }
  pushCheck(checks, {
    id: `${step.index || "step"}:${step.tool}:align`,
    title: "Layer alignment matches requested time",
    expected: `${align} ${targetTime}`,
    observed: `${items.length} aligned layer(s)`,
    passed: mismatches.length === 0,
    evidence: mismatches.length ? mismatches.join("; ") : stepLabel(step)
  });
}

function checkSplit(checks, step, payload) {
  const items = Array.isArray(payload && payload.split) ? payload.split : [];
  if (!items.length) return;
  const splitTime = hasOwn(step.args, "time") ? step.args.time : step.args.targetTime;
  const mismatches = [];
  for (const item of items) {
    const original = item && item.original;
    const newLayer = item && item.newLayer;
    if (!original || !newLayer) {
      mismatches.push("missing split layer read-back");
      continue;
    }
    if (splitTime !== undefined && !nearlyEqual(original.outPoint, splitTime)) mismatches.push(`original outPoint=${original.outPoint}`);
    if (splitTime !== undefined && !nearlyEqual(newLayer.inPoint, splitTime)) mismatches.push(`new layer inPoint=${newLayer.inPoint}`);
  }
  pushCheck(checks, {
    id: `${step.index || "step"}:${step.tool}:split`,
    title: "Split layer boundaries match requested time",
    expected: `split time ${splitTime}`,
    observed: `${items.length} split read-back item(s)`,
    passed: mismatches.length === 0,
    evidence: mismatches.length ? mismatches.join("; ") : stepLabel(step)
  });
}

function expectedDuplicateLayerNames(args, pairs) {
  const sourceNames = Array.isArray(args.sourceNames) ? args.sourceNames.map((value) => String(value)) : [];
  const suffix = hasOwn(args, "nameSuffix") ? String(args.nameSuffix || "") : " copy";
  return pairs.map((pair, index) => {
    const sourceName = sourceNames[index] || pair && pair.source && pair.source.name || "";
    if (sourceName) return `${sourceName}${suffix}`;
    if (pair && pair.duplicate && pair.duplicate.name) return String(pair.duplicate.name);
    return sourceName ? `${sourceName}${suffix}` : "";
  }).filter(Boolean);
}

function checkDuplicateLayers(checks, step, payload, evidence) {
  const args = step.args || {};
  const pairs = Array.isArray(payload.pairs) ? payload.pairs : [];
  const requested = Array.isArray(args.layerIndices) ? args.layerIndices : [];
  const sourceNames = Array.isArray(args.sourceNames) ? args.sourceNames.map((value) => String(value)) : [];
  const suffix = hasOwn(args, "nameSuffix") ? String(args.nameSuffix || "") : " copy";
  const expectedCount = requested.length;
  const postVerification = isPlainObject(payload.postVerification) ? payload.postVerification : {};
  const pairMismatches = [];
  const pairNameMismatches = [];
  const pairReadBackMismatches = [];
  for (let index = 0; index < pairs.length; index += 1) {
    const pair = pairs[index] || {};
    if (!pair.source || !pair.duplicate) pairMismatches.push(`pair ${index + 1} missing source or duplicate`);
    if (pair.requestedLayerIndex !== undefined && requested[index] !== undefined && Number(pair.requestedLayerIndex) !== Number(requested[index])) {
      pairNameMismatches.push(`pair ${index + 1} requested index ${pair.requestedLayerIndex} != ${requested[index]}`);
    }
    const expectedSourceName = sourceNames[index] || pair.source && pair.source.name || "";
    const expectedDuplicateName = expectedSourceName ? `${expectedSourceName}${suffix}` : pair.duplicate && pair.duplicate.name || "";
    if (expectedSourceName && pair.source && pair.source.name !== expectedSourceName) {
      pairNameMismatches.push(`pair ${index + 1} source ${pair.source.name || "missing"} != ${expectedSourceName}`);
    }
    if (expectedDuplicateName && pair.duplicate && pair.duplicate.name !== expectedDuplicateName) {
      pairNameMismatches.push(`pair ${index + 1} duplicate ${pair.duplicate.name || "missing"} != ${expectedDuplicateName}`);
    }
    if (pair.duplicate && pair.duplicate.index && expectedDuplicateName && !observedLayerAtIndexEvidence(evidence.readBack, pair.duplicate.index, expectedDuplicateName)) {
      pairReadBackMismatches.push(`duplicate ${expectedDuplicateName} not read back at layer ${pair.duplicate.index}`);
    }
    const sourceAfter = pair.sourceAfter || pair.source;
    if (sourceAfter && sourceAfter.index && expectedSourceName && !observedLayerAtIndexEvidence(evidence.readBack, sourceAfter.index, expectedSourceName)) {
      pairReadBackMismatches.push(`source ${expectedSourceName} not read back at layer ${sourceAfter.index}`);
    }
  }
  pushCheck(checks, {
    id: `${step.index || "step"}:${step.tool}:pairs`,
    title: "One duplicate exists for each requested source layer",
    expected: `${expectedCount} source/duplicate pair(s)`,
    observed: `${pairs.length} pair(s), duplicateCount=${payload.duplicateCount}`,
    passed: expectedCount > 0 &&
      pairs.length === expectedCount &&
      Number(payload.duplicateCount || 0) === expectedCount &&
      postVerification.pairCountMatches === true &&
      postVerification.pairNameMatches !== false &&
      pairMismatches.length === 0,
    evidence: pairMismatches.length ? pairMismatches.join("; ") : stepLabel(step)
  });

  pushCheck(checks, {
    id: `${step.index || "step"}:${step.tool}:pair-name-order`,
    title: "Source and duplicate names match requested layer-index order",
    expected: requested.map((layerIndex, index) => `${layerIndex}:${sourceNames[index] || "source"}`).join(", "),
    observed: pairNameMismatches.concat(pairReadBackMismatches).length
      ? pairNameMismatches.concat(pairReadBackMismatches).join("; ")
      : pairs.map((pair) => `${pair.requestedLayerIndex}:${pair.source && pair.source.name || "missing"} -> ${pair.duplicate && pair.duplicate.name || "missing"}`).join(", "),
    passed: expectedCount > 0 &&
      pairs.length === expectedCount &&
      pairNameMismatches.length === 0 &&
      pairReadBackMismatches.length === 0,
    evidence: pairNameMismatches.concat(pairReadBackMismatches).length
      ? pairNameMismatches.concat(pairReadBackMismatches).join("; ")
      : "Post-run read-back matched duplicate_layers source/duplicate pair order."
  });

  const expectedNames = expectedDuplicateLayerNames(args, pairs);
  const missingNames = expectedNames.filter((name) => !observedNameEvidence(evidence.readBack, name));
  pushCheck(checks, {
    id: `${step.index || "step"}:${step.tool}:names`,
    title: "Duplicate layer names are present in post-run read-back",
    expected: expectedNames.join(", "),
    observed: missingNames.length ? `missing: ${missingNames.join(", ")}` : expectedNames.join(", "),
    passed: expectedNames.length === expectedCount && missingNames.length === 0 && pairNameMismatches.length === 0,
    evidence: missingNames.length
      ? "No post-run read-back step contained every expected duplicate name."
      : expectedNames.map((name) => observedNameEvidence(evidence.readBack, name)).filter(Boolean).join("; ")
  });

  const before = numberValue(payload.layerCountBefore);
  const after = numberValue(payload.layerCountAfter);
  const expectedAfter = before === null ? null : before + expectedCount;
  const afterReadBackEvidence = observedLayerCountEvidence(evidence.readBack, after);
  pushCheck(checks, {
    id: `${step.index || "step"}:${step.tool}:layer-counts`,
    title: "Before and after layer counts match requested duplicates",
    expected: before === null ? `${expectedCount} new layer(s)` : `${before} -> ${expectedAfter}`,
    observed: before === null || after === null ? "missing before/after layer counts" : `${before} -> ${after}`,
    passed: before !== null &&
      after !== null &&
      expectedAfter !== null &&
      nearlyEqual(after, expectedAfter) &&
      postVerification.ok === true &&
      postVerification.layerCountMatches === true &&
      Boolean(afterReadBackEvidence),
    evidence: afterReadBackEvidence || "No post-run read-back layer count matched duplicate_layers after-count."
  });
}

function checkDeleteLayer(checks, step, payload, evidence) {
  const args = step.args || {};
  const postVerification = isPlainObject(payload.postVerification) ? payload.postVerification : {};
  const absentEvidence = observedDeletedLayerAbsent(evidence.readBack, payload, args);
  const before = numberValue(payload.layerCountBefore);
  const after = numberValue(payload.layerCountAfter);
  pushCheck(checks, {
    id: `${step.index || "step"}:${step.tool}:absence`,
    title: "Deleted layer is absent after read-back",
    expected: `delete layer ${args.layerIndex || payload.requestedLayerIndex || "specified"} named ${args.expectedLayerName || payload.expectedLayerName || "expected"}`,
    observed: absentEvidence ? `layer count ${before} -> ${after}; deleted layer absent` : "deleted layer absence not proven by read-back",
    passed: Boolean(payload.deletedLayer) &&
      postVerification.ok === true &&
      postVerification.layerCountMatches === true &&
      postVerification.deletedLayerIdAbsent === true &&
      Boolean(absentEvidence),
    evidence: absentEvidence || "No post-run comp/layer read-back proved the deleted layer is absent."
  });
}

function checkSetCompProperties(checks, step, payload, evidence) {
  const args = step.args || {};
  const updates = isPlainObject(payload.updates) ? payload.updates : {};
  const postVerification = isPlainObject(payload.postVerification) ? payload.postVerification : {};
  const fields = Object.keys(updates).length ? Object.keys(updates) : ["width", "height", "pixelAspect", "duration", "frameRate", "bgColor", "displayStartTime"].filter((field) => hasOwn(args, field));
  if (!fields.length) {
    pushCheck(checks, {
      id: `${step.index || "step"}:${step.tool}:updates`,
      title: "Composition update includes at least one bounded field",
      expected: "one or more approved comp property updates",
      observed: "no approved comp property updates",
      passed: false,
      evidence: "set_comp_properties did not report any bounded updated fields."
    });
    return;
  }
  for (const field of fields) {
    const expected = hasOwn(updates, field) ? updates[field] : args[field];
    const readBackEvidence = observedCompFieldEvidence(evidence.readBack, field, expected);
    const afterMatches = compFieldMatches(payload.after, field, expected);
    const fieldMatches = !postVerification.fieldMatches || postVerification.fieldMatches[field] !== false;
    pushCheck(checks, {
      id: `${step.index || "step"}:${step.tool}:${field}`,
      title: `Composition ${field} matches requested update`,
      expected: Array.isArray(expected) ? expected.join(",") : expected,
      observed: afterMatches ? (Array.isArray(expected) ? expected.join(",") : expected) : "missing or mismatched after value",
      passed: afterMatches && fieldMatches && Boolean(readBackEvidence) && postVerification.ok === true,
      evidence: readBackEvidence || `No post-run comp read-back matched ${field}.`
    });
  }
  pushCheck(checks, {
    id: `${step.index || "step"}:${step.tool}:identity`,
    title: "Composition identity and layer count stay bounded",
    expected: "same comp identity and unchanged layer count",
    observed: `identity=${postVerification.compIdentityMatches === true}, layerCountUnchanged=${postVerification.layerCountUnchanged === true}`,
    passed: postVerification.compIdentityMatches === true && postVerification.layerCountUnchanged === true && evidence.readBack.count > 0,
    evidence: evidence.readBack.count > 0 ? "Post-run comp read-back was present." : "No post-run comp read-back was present."
  });
}

function checkSetLayerMask(checks, step, payload, evidence) {
  const args = step.args || {};
  const mask = payload.afterMask || payload.mask || {};
  const postVerification = isPlainObject(payload.postVerification) ? payload.postVerification : {};
  const readBackEvidence = observedMaskEvidence(evidence.readBack, args, mask);
  pushCheck(checks, {
    id: `${step.index || "step"}:${step.tool}:mask`,
    title: "Layer mask create/update matches read-back",
    expected: `${args.operation || payload.operation || "operation"} mask ${args.maskIndex || args.name || args.expectedMaskName || ""}`.trim(),
    observed: mask.name ? `${mask.propertyIndex || "?"}: ${mask.name}` : "missing mask",
    passed: Boolean(mask && mask.propertyIndex) && postVerification.ok === true && Boolean(readBackEvidence),
    evidence: readBackEvidence || "No post-run layer/mask read-back matched the create/update result."
  });
  pushCheck(checks, {
    id: `${step.index || "step"}:${step.tool}:mask-count`,
    title: "Layer mask count matches bounded operation",
    expected: `after mask count ${postVerification.expectedMaskCountAfter}`,
    observed: `after mask count ${postVerification.afterMaskCount}`,
    passed: postVerification.maskCountMatches === true && Boolean(readBackEvidence),
    evidence: readBackEvidence || "No post-run mask read-back proved the final mask count."
  });
}

function exactRenamesMatch(items, args) {
  if (!items.length) return false;
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index] || {};
    const expected = expectedRenameValue(item.before, args, index + 1, items.length);
    if (!expected || item.after !== expected) return false;
  }
  return true;
}

function verifyStep(checks, step, evidence) {
  const payload = payloadForStep(step);
  if (!payload || step.status !== "completed") return;
  const args = isPlainObject(step.args) ? step.args : {};

  if (step.tool === "create_test_comp") {
    checkName(checks, step, args.name, payload.name || payload.comp && payload.comp.name, evidence, "Created comp is visible in read-back");
    return;
  }

  if (step.tool === "create_solid_layer") {
    checkName(checks, step, args.name, payload.layer && payload.layer.name, evidence, "Created solid layer name matches request");
    checkNumberFields(checks, step, [
      { arg: "startTime", label: "startTime", read: (value) => value && value.layer && value.layer.startTime },
      { arg: "duration", label: "duration", read: (value) => value && value.layer ? Number(value.layer.outPoint) - Number(value.layer.inPoint) : null }
    ], payload, "Created solid layer timing matches request");
    return;
  }

  if (step.tool === "create_text_layer") {
    checkName(checks, step, args.name, payload.layer && payload.layer.name, evidence, "Created text layer name matches request");
    if (args.text) {
      const observed = payload.layer && payload.layer.text ? payload.layer.text.text : payload.text;
      pushCheck(checks, {
        id: `${step.index || "step"}:${step.tool}:text`,
        title: "Created text content matches request",
        expected: args.text,
        observed,
        passed: sameString(observed, args.text),
        evidence: stepLabel(step)
      });
    }
    return;
  }

  if (step.tool === "create_camera_layer") {
    checkName(checks, step, args.name, payload.layer && payload.layer.name, evidence, "Created camera layer name matches request");
    checkNumberArrayField(checks, step, "position", payload.camera && payload.camera.position, evidence, "Created camera position matches request");
    checkNumberArrayField(checks, step, "pointOfInterest", payload.camera && payload.camera.pointOfInterest, evidence, "Created camera point of interest matches request");
    checkNumberFields(checks, step, [
      { arg: "zoom", label: "zoom", read: (value) => value && value.camera && value.camera.zoom }
    ], payload, "Created camera options match request");
    return;
  }

  if (step.tool === "create_camera_with_controller") {
    checkCameraWithController(checks, step, payload);
    return;
  }

  if (step.tool === "toggle_onion_skinning") {
    checkToggleOnionSkinning(checks, step, payload);
    return;
  }

  if (step.tool === "set_comp_work_area") {
    checkNumberFields(checks, step, [
      { arg: "start", label: "workAreaStart", read: (value) => value && value.workAreaStart },
      { arg: "duration", label: "workAreaDuration", read: (value) => value && value.workAreaDuration }
    ], payload, "Comp work area matches request");
    return;
  }

  if (step.tool === "set_layer_time_range") {
    checkChangedLayerTiming(checks, step, payload);
    return;
  }

  if (step.tool === "stagger_layers") {
    checkStagger(checks, step, payload);
    return;
  }

  if (step.tool === "align_layers_to_time") {
    checkAlign(checks, step, payload);
    return;
  }

  if (step.tool === "split_layers_at_time") {
    checkSplit(checks, step, payload);
    return;
  }

  if (step.tool === "update_text_layer") {
    if (!hasOwn(args, "text")) return;
    const observed = payload.layer && payload.layer.text ? payload.layer.text.text : payload.text && payload.text.text;
    pushCheck(checks, {
      id: `${step.index || "step"}:${step.tool}:text`,
      title: "Updated text content matches request",
      expected: args.text,
      observed,
      passed: sameString(observed, args.text),
      evidence: stepLabel(step)
    });
    return;
  }

  if (step.tool === "create_shape_layer") {
    checkName(checks, step, args.name, payload.layer && payload.layer.name, evidence, "Created shape layer name matches request");
    pushCheck(checks, {
      id: `${step.index || "step"}:${step.tool}:shape`,
      title: "Created shape summary matches request",
      expected: `${args.shape || "rectangle"} ${Array.isArray(args.size) ? args.size.join("x") : ""}`.trim(),
      observed: payload.shape ? `${payload.shape.type || ""} ${Array.isArray(payload.shape.size) ? payload.shape.size.join("x") : ""}`.trim() : "missing shape summary",
      passed: Boolean(payload.shape) && (!args.shape || payload.shape.type === args.shape),
      evidence: stepLabel(step)
    });
    return;
  }

  if (step.tool === "create_layer_mask") {
    const mask = payload.mask || {};
    checkName(checks, step, args.name, mask.name, evidence, "Created mask name matches request");
    checkPointListField(checks, step, "vertices", mask.shape && mask.shape.vertices, "Created mask vertices match request");
    pushCheck(checks, {
      id: `${step.index || "step"}:${step.tool}:mode`,
      title: "Created mask mode is additive and non-inverted",
      expected: "maskMode: add, inverted: false",
      observed: `maskMode: ${mask.maskMode || "missing"}, inverted: ${mask.inverted === true}`,
      passed: mask.maskMode === "add" && mask.inverted !== true,
      evidence: stepLabel(step)
    });
    return;
  }

  if (step.tool === "fit_layer_to_comp") {
    pushCheck(checks, {
      id: `${step.index || "step"}:${step.tool}:fit`,
      title: "Layer fit produced transform read-back",
      expected: args.mode || "contain",
      observed: `${payload.mode || "unknown"}; changed=${arrayLength(payload.changed)}`,
      passed: arrayLength(payload.changed) > 0 && (!args.mode || payload.mode === args.mode),
      evidence: stepLabel(step)
    });
    return;
  }

  if (step.tool === "set_property_value") {
    checkSetPropertyValue(checks, step, payload, evidence);
    return;
  }

  if (step.tool === "set_property_keyframes") {
    pushCheck(checks, {
      id: `${step.index || "step"}:${step.tool}:keyframes`,
      title: "Keyframe count matches request",
      expected: `${arrayLength(args.keyframes)} keyframe(s)`,
      observed: `${payload.keyframeCount || 0} keyframe(s)`,
      passed: Number(payload.keyframeCount || 0) === arrayLength(args.keyframes),
      evidence: stepLabel(step)
    });
    return;
  }

  if (step.tool === "fill_in_keyframes") {
    checkFillInKeyframes(checks, step, payload);
    return;
  }

  if (step.tool === "keyframe_current_value_from_expression") {
    checkCurrentExpressionKeyframe(checks, step, payload);
    return;
  }

  if (step.tool === "apply_keyframe_ease") {
    pushCheck(checks, {
      id: `${step.index || "step"}:${step.tool}:ease`,
      title: "Requested keyframes received easing",
      expected: `${arrayLength(args.keyIndices)} keyframe(s)`,
      observed: `${arrayLength(payload.keyIndices)} keyframe(s)`,
      passed: !Array.isArray(args.keyIndices) || arrayLength(payload.keyIndices) === arrayLength(args.keyIndices),
      evidence: stepLabel(step)
    });
    return;
  }

  if (step.tool === "set_spatial_in_tangent") {
    checkSpatialInTangent(checks, step, payload);
    return;
  }

  if (step.tool === "set_expression") {
    pushCheck(checks, {
      id: `${step.index || "step"}:${step.tool}:expression`,
      title: "Expression matches request",
      expected: args.expression,
      observed: payload.expression || "",
      passed: sameString(payload.expression, args.expression) && !payload.expressionError,
      evidence: payload.expressionError || stepLabel(step)
    });
    return;
  }

  if (step.tool === "separate_shape_size_dimensions") {
    checkSeparateShapeSizeDimensions(checks, step, payload);
    return;
  }

  if (step.tool === "clear_expression") {
    pushCheck(checks, {
      id: `${step.index || "step"}:${step.tool}:expression`,
      title: "Expression was cleared",
      expected: "empty expression",
      observed: payload.expression || "",
      passed: !payload.expression,
      evidence: stepLabel(step)
    });
    return;
  }

  if (step.tool === "precompose_layers") {
    checkName(checks, step, args.newCompName, payload.comp && payload.comp.name, evidence, "Precomp name matches request");
    return;
  }

  if (step.tool === "duplicate_comp") {
    checkName(checks, step, args.name, payload.duplicate && payload.duplicate.name, evidence, "Duplicated comp name matches request");
    return;
  }

  if (step.tool === "duplicate_layer") {
    const duplicate = payload.duplicate || payload.layer || {};
    checkName(checks, step, args.name, duplicate.name, evidence, "Duplicated layer name matches request");
    pushCheck(checks, {
      id: `${step.index || "step"}:${step.tool}:duplicate`,
      title: "Layer duplicate was created from explicit source layer",
      expected: `source layer ${args.layerIndex || "specified"}`,
      observed: `source=${payload.source && payload.source.name || "missing"}, duplicate=${duplicate.name || "missing"}`,
      passed: Boolean(payload.source) && Boolean(duplicate && duplicate.index),
      evidence: stepLabel(step)
    });
    return;
  }

  if (step.tool === "duplicate_layers") {
    checkDuplicateLayers(checks, step, payload, evidence);
    return;
  }

  if (step.tool === "delete_layer") {
    checkDeleteLayer(checks, step, payload, evidence);
    return;
  }

  if (step.tool === "set_comp_properties") {
    checkSetCompProperties(checks, step, payload, evidence);
    return;
  }

  if (step.tool === "set_layer_mask") {
    checkSetLayerMask(checks, step, payload, evidence);
    return;
  }

  if (step.tool === "add_layer_marker") {
    const marker = payload.marker || {};
    const readBackEvidence = observedMarkerEvidence(evidence.readBack, args);
    pushCheck(checks, {
      id: `${step.index || "step"}:${step.tool}:marker`,
      title: "Layer marker comment and timing match request",
      expected: expectedMarkerText(args),
      observed: markerText(marker),
      passed: markerMatchesArgs(marker, args) && Boolean(readBackEvidence),
      evidence: readBackEvidence || "No matching marker read-back after mutation."
    });
    return;
  }

  if (step.tool === "update_layer_marker") {
    const marker = payload.marker || {};
    const readBackEvidence = observedUpdatedMarkerEvidence(evidence.readBack, args);
    pushCheck(checks, {
      id: `${step.index || "step"}:${step.tool}:marker`,
      title: "Layer marker update matches request",
      expected: expectedMarkerText(args),
      observed: markerText(marker),
      passed: updatedMarkerMatchesArgs(marker, args) && Boolean(readBackEvidence),
      evidence: readBackEvidence || "No matching updated marker read-back after mutation."
    });
    return;
  }

  if (step.tool === "delete_layer_marker") {
    const deletedMarker = payload.markerDeleted || {};
    const absent = observedDeletedMarkerAbsent(evidence.readBack, deletedMarker, args);
    pushCheck(checks, {
      id: `${step.index || "step"}:${step.tool}:marker`,
      title: "Layer marker target was deleted",
      expected: `deleted marker absent after read-back: ${markerText(deletedMarker)}`,
      observed: absent ? "deleted marker absent" : "deleted marker still present or no marker read-back",
      passed: Boolean(deletedMarker && deletedMarker.keyIndex) && absent,
      evidence: absent ? "Post-run marker read-back does not include the deleted marker target." : "No post-run marker read-back proving deletion."
    });
    return;
  }

  if (step.tool === "deep_duplicate_precomp_sources") {
    const duplicate = payload.duplicateComp || {};
    const layer = payload.layer || {};
    const expectedSuffix = args.nameSuffix || " copy";
    const duplicateName = duplicate.name || "";
    const layerSourceName = layer.source && layer.source.name ? layer.source.name : "";
    pushCheck(checks, {
      id: `${step.index || "step"}:${step.tool}:duplicate`,
      title: "Selected precomp source was duplicated and relinked",
      expected: `duplicate source comp with suffix ${expectedSuffix}`,
      observed: duplicateName || layerSourceName || "missing duplicate comp",
      passed: Boolean(duplicateName) && duplicateName.indexOf(expectedSuffix) >= 0 && (!layerSourceName || layerSourceName === duplicateName),
      evidence: observedNameEvidence(evidence.all, duplicateName) || stepLabel(step)
    });
    pushCheck(checks, {
      id: `${step.index || "step"}:${step.tool}:items`,
      title: "Deep duplicate reported copied or reused source items",
      expected: "duplicated or explicitly reused source items",
      observed: `duplicated=${Number(payload.duplicatedItemCount || 0)}, reusedFootage=${Number(payload.reusedFootageCount || 0)}`,
      passed: Number(payload.duplicatedItemCount || 0) > 0 || Number(payload.reusedFootageCount || 0) > 0,
      evidence: stepLabel(step)
    });
    return;
  }

  if (step.tool === "replace_layer_source") {
    const expected = args.sourceItemName || args.sourceItemIndex;
    const observed = payload.sourceItem && (payload.sourceItem.name || payload.sourceItem.itemIndex);
    pushCheck(checks, {
      id: `${step.index || "step"}:${step.tool}:source`,
      title: "Replacement source matches request",
      expected,
      observed,
      passed: expected === undefined || expected === null || sameString(observed, expected) || Number(observed) === Number(expected),
      evidence: stepLabel(step)
    });
    return;
  }

  if (step.tool === "rename_layers") {
    const renamed = Array.isArray(payload.renamed) ? payload.renamed : [];
    pushCheck(checks, {
      id: `${step.index || "step"}:${step.tool}:rename`,
      title: "Layer rename read-back matches request",
      expected: args.name || args.prefix || args.suffix || args.replace || "renamed layers",
      observed: renamed.map((item) => item.after).join(", "),
      passed: exactRenamesMatch(renamed, args),
      evidence: stepLabel(step)
    });
    return;
  }

  if (step.tool === "rename_project_items") {
    const renamed = Array.isArray(payload.renamed) ? payload.renamed : [];
    pushCheck(checks, {
      id: `${step.index || "step"}:${step.tool}:rename`,
      title: "Project item rename read-back matches request",
      expected: args.name || args.prefix || args.suffix || args.replace || "renamed items",
      observed: renamed.map((item) => item.after).join(", "),
      passed: exactRenamesMatch(renamed, args),
      evidence: stepLabel(step)
    });
    return;
  }

  if (step.tool === "add_comp_to_render_queue") {
    const item = payload.renderQueueItem || {};
    const comp = item.comp || {};
    const outputEvidence = args.outputPath ? observedOutputEvidence(evidence.all, args.outputPath) : "no output requested";
    pushCheck(checks, {
      id: `${step.index || "step"}:${step.tool}:render-queue`,
      title: "Render queue item matches requested comp/output",
      expected: `${args.compName || args.compItemIndex || "active comp"}${args.outputPath ? ` -> ${args.outputPath}` : ""}`,
      observed: `${comp.name || comp.itemIndex || "unknown"}${outputEvidence ? `; ${outputEvidence}` : ""}`,
      passed: Boolean(item.index) && (!args.compName || comp.name === args.compName) && (!args.outputPath || Boolean(outputEvidence)),
      evidence: stepLabel(step)
    });
    return;
  }

  if (step.tool === "set_render_queue_output") {
    const outputEvidence = args.outputPath ? observedOutputEvidence(evidence.all, args.outputPath) : "template-only output change";
    pushCheck(checks, {
      id: `${step.index || "step"}:${step.tool}:render-output`,
      title: "Render queue output matches request",
      expected: args.outputPath || args.outputModuleTemplate || args.renderSettingsTemplate || "render queue output update",
      observed: outputEvidence || "not observed",
      passed: !args.outputPath || Boolean(outputEvidence),
      evidence: outputEvidence || stepLabel(step)
    });
  }
}

function buildSummary(status, checks, readBackEvidence, mutationVerificationCount) {
  const passed = checks.filter((check) => check.status === "passed").length;
  const failed = checks.filter((check) => check.status === "failed").length;
  const readBackCount = readBackEvidence.count;
  if (status === "passed") {
    return `${passed} semantic check(s) matched the requested outcome using ${readBackCount} read-back summary step(s).`;
  }
  if (failed > 0) {
    return `${failed} semantic check(s) need review; ${passed} passed. Read-back summaries: ${readBackCount}.`;
  }
  if (!readBackCount && mutationVerificationCount) {
    return `Per-step mutation verification exists, but no explicit read-back summary step was found.`;
  }
  return `Semantic verification needs review. Read-back summaries: ${readBackCount}.`;
}

function buildSemanticVerification(plan, run) {
  const steps = Array.isArray(run && run.steps) ? run.steps : [];
  const mutatingSteps = steps.filter(isMutatingStep);
  const checks = [];
  const warnings = [];
  const mutatingOrders = mutatingSteps.map((step, index) => stepOrder(step, index + 1));
  const firstMutatingOrder = mutatingOrders.reduce((min, order) => Math.min(min, order), Number.POSITIVE_INFINITY);
  const readBackEvidence = collectReadBackEvidence(steps, Number.isFinite(firstMutatingOrder) ? firstMutatingOrder : 0);
  const allEvidence = collectAllEvidence(steps);
  const mutationVerificationCount = mutatingSteps.filter((step) => {
    const payload = payloadForStep(step);
    return Boolean(payload && payload.verification);
  }).length;

  if (!run || run.dryRun) {
    return {
      schema: SEMANTIC_VERIFICATION_SCHEMA,
      status: "not_run",
      ok: null,
      summary: "Semantic verification is skipped for dry-run previews.",
      readBackCount: 0,
      mutationVerificationCount: 0,
      passedChecks: 0,
      failedChecks: 0,
      checks: [],
      warnings: []
    };
  }

  if (!mutatingSteps.length) {
    return {
      schema: SEMANTIC_VERIFICATION_SCHEMA,
      status: "not_applicable",
      ok: true,
      summary: "No project-changing outcome was requested.",
      readBackCount: readBackEvidence.count,
      mutationVerificationCount,
      passedChecks: 0,
      failedChecks: 0,
      checks: [],
      warnings: []
    };
  }

  if (!readBackEvidence.count) {
    warnings.push("No explicit read-back summary step was executed after the mutating steps.");
  }

  for (let index = 0; index < mutatingSteps.length; index += 1) {
    const step = mutatingSteps[index];
    if (step.status !== "completed") {
      pushCheck(checks, {
        id: `${step.index || "step"}:${step.tool || "unknown"}:completed`,
        title: "Mutating step completed before semantic comparison",
        expected: "completed",
        observed: step.status || "unknown",
        passed: false,
        evidence: step.error || step.reason || stepLabel(step)
      });
      continue;
    }
    const currentOrder = stepOrder(step, index + 1);
    const nextMutatingOrder = index + 1 < mutatingSteps.length
      ? stepOrder(mutatingSteps[index + 1], index + 2)
      : null;
    const stepReadBackEvidence = collectReadBackEvidence(steps, currentOrder, nextMutatingOrder);
    verifyStep(checks, step, { readBack: stepReadBackEvidence, all: allEvidence });
  }

  const failedChecks = checks.filter((check) => check.status === "failed").length;
  const passedChecks = checks.filter((check) => check.status === "passed").length;
  const status = failedChecks === 0 && readBackEvidence.count > 0 && (run.ok === true)
    ? "passed"
    : "needs_review";

  return {
    schema: SEMANTIC_VERIFICATION_SCHEMA,
    status,
    ok: status === "passed",
    summary: buildSummary(status, checks, readBackEvidence, mutationVerificationCount),
    requestedOutcome: compactText(plan && plan.summary ? plan.summary : "Agent plan outcome", 180),
    readBackCount: readBackEvidence.count,
    readBackSteps: readBackEvidence.steps,
    mutationVerificationCount,
    passedChecks,
    failedChecks,
    checks,
    warnings
  };
}

module.exports = {
  SEMANTIC_VERIFICATION_SCHEMA,
  buildSemanticVerification
};
