"use strict";

const SEMANTIC_VERIFICATION_SCHEMA = "ae-agent-semantic-verification.v1";

const MUTATING_TOOLS = new Set([
  "create_test_comp",
  "create_solid_layer",
  "create_text_layer",
  "create_camera_layer",
  "set_comp_work_area",
  "set_layer_time_range",
  "stagger_layers",
  "align_layers_to_time",
  "split_layers_at_time",
  "update_text_layer",
  "create_shape_layer",
  "create_layer_mask",
  "fit_layer_to_comp",
  "set_property_keyframes",
  "apply_keyframe_ease",
  "set_expression",
  "clear_expression",
  "duplicate_layer",
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

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nearlyEqual(left, right, tolerance = 0.001) {
  const a = numberValue(left);
  const b = numberValue(right);
  return a !== null && b !== null && Math.abs(a - b) <= tolerance;
}

function sameString(left, right) {
  return String(left || "") === String(right || "");
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
  return isPlainObject(step && step.result) ? step.result : null;
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
  if (!isPlainObject(payload)) return;

  if (typeof payload.name === "string") addName(evidence, payload.name, source);
  if (typeof payload.before === "string") addName(evidence, payload.before, source);
  if (typeof payload.after === "string") addName(evidence, payload.after, source);
  if (typeof payload.file === "string") addOutputPath(evidence, payload.file, source);
  if (typeof payload.outputPath === "string") addOutputPath(evidence, payload.outputPath, source);
  collectMarkerPayload(payload, evidence, source);

  for (const key of Object.keys(payload)) {
    collectPayloadEvidence(payload[key], evidence, source, depth + 1);
  }
}

function stepOrder(step, fallback) {
  const number = Number(step && step.index);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function collectReadBackEvidence(steps, afterOrder) {
  const readBackSteps = [];
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    if (isReadBackStep(step) && stepOrder(step, index + 1) > afterOrder) {
      readBackSteps.push(step);
    }
  }
  const evidence = {
    count: readBackSteps.length,
    steps: readBackSteps.map((step) => ({
      index: step.index || null,
      title: step.title || step.tool || "Read-back step",
      tool: step.tool || null
    })),
    names: new Set(),
    nameSources: {},
    outputPaths: new Set(),
    outputPathSources: {},
    markers: [],
    markerSignatures: new Set()
  };

  for (const step of readBackSteps) {
    collectPayloadEvidence(payloadForStep(step), evidence, stepLabel(step));
  }

  return evidence;
}

function collectAllEvidence(steps) {
  const evidence = {
    names: new Set(),
    nameSources: {},
    outputPaths: new Set(),
    outputPathSources: {},
    markers: [],
    markerSignatures: new Set()
  };
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

function checkNumberArrayField(checks, step, arg, observedValue, title) {
  if (!hasOwn(step.args, arg)) return;
  const expected = Array.isArray(step.args[arg]) ? step.args[arg] : [];
  const observed = Array.isArray(observedValue) ? observedValue.slice(0, expected.length) : [];
  const passed = expected.length > 0 && expected.every((value, index) => nearlyEqual(value, observed[index]));
  pushCheck(checks, {
    id: `${step.index || "step"}:${step.tool}:${arg}`,
    title,
    expected: expected.join(","),
    observed: observed.length ? observed.join(",") : "missing",
    passed,
    evidence: passed ? stepLabel(step) : `${arg} read-back did not match requested values.`
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
    checkNumberArrayField(checks, step, "position", payload.camera && payload.camera.position, "Created camera position matches request");
    checkNumberArrayField(checks, step, "pointOfInterest", payload.camera && payload.camera.pointOfInterest, "Created camera point of interest matches request");
    checkNumberFields(checks, step, [
      { arg: "zoom", label: "zoom", read: (value) => value && value.camera && value.camera.zoom }
    ], payload, "Created camera options match request");
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
  const lastMutatingOrder = mutatingSteps.reduce((max, step, index) => Math.max(max, stepOrder(step, index + 1)), 0);
  const readBackEvidence = collectReadBackEvidence(steps, lastMutatingOrder);
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

  for (const step of mutatingSteps) {
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
    verifyStep(checks, step, { readBack: readBackEvidence, all: allEvidence });
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
