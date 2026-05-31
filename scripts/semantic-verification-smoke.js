"use strict";

const assert = require("assert");

const {
  buildSemanticVerification,
  SEMANTIC_VERIFICATION_SCHEMA
} = require("../mcp-server/semantic-verification");
const {
  AGENT_SCENARIO_MUTATING_TOOLS,
  agentDakkshinTypedToolsScenarioPlans,
  agentLayerSelectionScenarioPlans,
  agentRemainingTailContractsScenarioPlans,
  agentScenarioPlans
} = require("./agent-scenario-fixtures");

const LOCAL_MUTATING_TOOLS = new Set([
  "delete_layer",
  "set_comp_properties",
  "set_layer_mask"
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function aePropertyPreview(value) {
  const preview = {
    kind: Array.isArray(value) ? "array" : typeof value,
    value: clone(value)
  };
  if (Array.isArray(value)) {
    preview.length = value.length;
    preview.truncated = false;
  }
  return preview;
}

function propertyPathSegments(value) {
  const raw = Array.isArray(value) ? value : String(value || "").split(".");
  return raw
    .map((segment) => {
      if (segment && typeof segment === "object" && !Array.isArray(segment)) {
        return String(segment.matchName || segment.name || segment.propertyIndex || "");
      }
      return String(segment || "");
    })
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function fakePropertyInfo(propertyPath, value) {
  const segments = propertyPathSegments(propertyPath);
  const name = segments[segments.length - 1] || "Property";
  return {
    name,
    matchName: name,
    propertyPath: segments.map((segment) => ({ name: segment, matchName: segment })),
    value: aePropertyPreview(value)
  };
}

function quantizedAeColor(color) {
  return color.map((channel) => Math.round(channel * 255) / 255);
}

function layerInfo(name, overrides = {}) {
  const startTime = overrides.startTime === undefined ? 0 : overrides.startTime;
  const inPoint = overrides.inPoint === undefined ? startTime : overrides.inPoint;
  const outPoint = overrides.outPoint === undefined ? inPoint + 1 : overrides.outPoint;
  return {
    index: overrides.index || 1,
    id: overrides.id || null,
    name: name || "Layer",
    matchName: overrides.matchName || "ADBE AV Layer",
    startTime,
    inPoint,
    outPoint,
    markerCount: overrides.markerCount || 0,
    transform: overrides.transform || null,
    text: overrides.text ? { text: overrides.text, fontSize: overrides.fontSize || null } : null,
    source: overrides.source || null
  };
}

function reindexLayers(layers) {
  for (let index = 0; index < layers.length; index += 1) {
    layers[index] = { ...layers[index], index: index + 1 };
  }
}

function insertLayerAtTop(state, layer) {
  state.layers.unshift({ ...layer, index: 1 });
  reindexLayers(state.layers);
  state.nextLayerIndex = state.layers.length + 1;
  return state.layers[0];
}

function withVerification(payload, compName, layer) {
  return {
    ...payload,
    verification: {
      ok: true,
      warnings: [],
      comp: { name: compName || payload.name || payload.comp && payload.comp.name || "Comp" },
      layer: layer || payload.layer || null
    }
  };
}

function renameAfter(before, args) {
  const mode = args.mode || (args.name ? "exact" : args.prefix ? "prefix" : args.suffix ? "suffix" : "findReplace");
  if (mode === "exact") return args.name;
  if (mode === "prefix") return `${args.prefix || ""}${before}`;
  if (mode === "suffix") return `${before}${args.suffix || ""}`;
  return String(before || "").replace(String(args.find || ""), String(args.replace || ""));
}

function fakeMutationResult(step, state) {
  const args = step.args || {};
  const compName = args.compName || args.name || state.lastCompName || "Fixture Comp";
  if (step.tool === "create_test_comp") {
    state.lastCompName = args.name;
    state.projectItems.push({ itemIndex: state.nextItemIndex++, name: args.name, type: "comp" });
    return withVerification({
      itemIndex: state.nextItemIndex,
      name: args.name,
      width: args.width,
      height: args.height,
      duration: args.duration,
      frameRate: args.frameRate,
      numLayers: 0
    }, args.name);
  }
  if (step.tool === "create_solid_layer") {
    const layer = insertLayerAtTop(state, layerInfo(args.name, {
      index: 1,
      startTime: args.startTime || 0,
      inPoint: args.startTime || 0,
      outPoint: (args.startTime || 0) + (args.duration || 1)
    }));
    return withVerification({
      comp: { name: compName },
      layer,
      solid: { color: args.color, width: args.width, height: args.height }
    }, compName, layer);
  }
  if (step.tool === "create_text_layer") {
    const layer = insertLayerAtTop(state, layerInfo(args.name, {
      index: 1,
      startTime: args.startTime || 0,
      inPoint: args.startTime || 0,
      outPoint: (args.startTime || 0) + (args.duration || 1),
      text: args.text,
      fontSize: args.fontSize
    }));
    return withVerification({ comp: { name: compName }, layer, text: args.text }, compName, layer);
  }
  if (step.tool === "create_camera_layer") {
    const layer = insertLayerAtTop(state, layerInfo(args.name, {
      index: 1,
      matchName: "ADBE Camera Layer",
      startTime: args.startTime || 0,
      inPoint: args.startTime || 0,
      outPoint: (args.startTime || 0) + (args.duration || 1),
      transform: {
        position: args.position || [320, 180, -900],
        pointOfInterest: args.pointOfInterest || [320, 180, 0]
      }
    }));
    return withVerification({
      comp: { name: compName },
      layer,
      camera: {
        position: args.position || [320, 180, -900],
        pointOfInterest: args.pointOfInterest || [320, 180, 0],
        zoom: args.zoom || 600
      }
    }, compName, layer);
  }
  if (step.tool === "create_camera_with_controller") {
    const controller = insertLayerAtTop(state, layerInfo(args.controllerName || "Camera Controller", {
      index: 1,
      nullLayer: true,
      threeDLayer: true
    }));
    const camera = insertLayerAtTop(state, layerInfo(args.cameraName || "Camera 1", {
      index: 1,
      matchName: "ADBE Camera Layer",
      parent: { name: controller.name, index: controller.index + 1 },
      transform: {
        position: args.cameraPosition || [0, 0, -900],
        pointOfInterest: args.pointOfInterest || [320, 180, 0]
      }
    }));
    return withVerification({
      comp: { name: compName },
      cameraLayer: { ...camera, parent: { name: controller.name, index: controller.index + 1 } },
      controllerLayer: { ...controller, index: controller.index + 1, threeDLayer: true },
      camera: {
        position: args.cameraPosition || [0, 0, -900],
        pointOfInterest: args.pointOfInterest || [320, 180, 0],
        zoom: args.zoom || 600
      },
      controller: {
        threeDLayer: true,
        positionDimensionsSeparated: args.separateControllerPositionDimensions !== false
      }
    }, compName, camera);
  }
  if (step.tool === "toggle_onion_skinning") {
    const layer = insertLayerAtTop(state, layerInfo(args.layerName || "Onion Skin", {
      index: 1,
      adjustmentLayer: true
    }));
    return withVerification({
      comp: { name: compName, comment: "*onion-skinning*1" },
      enabled: args.mode !== "disable",
      layer,
      effect: { name: args.effectName || "Onion Skin", matchName: "CC Wide Time" },
      properties: [{ name: "Blend", matchName: "CC Wide Time-0001", value: aePropertyPreview(50) }]
    }, compName, layer);
  }
  if (step.tool === "create_layer_mask") {
    const layer = layerInfo("Mask Fixture Solid", { index: args.layerIndex || 1 });
    return withVerification({
      comp: { name: compName },
      layer,
      mask: {
        propertyIndex: 1,
        name: args.name || "Codex Mask",
        maskMode: args.maskMode || "add",
        inverted: false,
        shape: {
          closed: true,
          vertexCount: Array.isArray(args.vertices) ? args.vertices.length : 0,
          vertices: args.vertices || []
        }
      }
    }, compName, layer);
  }
  if (step.tool === "duplicate_layer") {
    const source = layerInfo(args.sourceName || "Duplicate Fixture Source", { index: args.layerIndex || 1 });
    const duplicate = layerInfo(args.name || `${source.name} copy`, { index: 1 });
    state.layers = [duplicate, { ...source, index: source.index + 1 }];
    return withVerification({
      comp: { name: compName, numLayers: state.nextLayerIndex + 1 },
      source,
      sourceAfter: { ...source, index: source.index + 1 },
      duplicate,
      layer: duplicate
    }, compName, duplicate);
  }
  if (step.tool === "duplicate_layers") {
    const requestedLayerIndices = Array.isArray(args.layerIndices) ? args.layerIndices : [];
    const sourceNames = Array.isArray(args.sourceNames)
      ? args.sourceNames
      : requestedLayerIndices.map((index) => `Duplicate Fixture Source ${index}`);
    const suffix = args.nameSuffix === undefined ? " copy" : String(args.nameSuffix || "");
    const beforeLayerCount = Math.max(state.layers.length, requestedLayerIndices.length);
    const pairs = requestedLayerIndices.map((requestedLayerIndex, index) => {
      const sourceName = sourceNames[index] || `Duplicate Fixture Source ${requestedLayerIndex}`;
      const source = layerInfo(sourceName, { index: requestedLayerIndex });
      const duplicate = layerInfo(`${sourceName}${suffix}`, { index: index + 1 });
      return {
        requestedLayerIndex,
        source,
        sourceAfter: { ...source, index: index + 1 + requestedLayerIndices.length },
        duplicate
      };
    });
    const afterLayerCount = beforeLayerCount + pairs.length;
    state.layers = pairs.map((pair) => pair.duplicate).concat(
      pairs.map((pair) => pair.sourceAfter),
      Array.from({ length: Math.max(0, afterLayerCount - pairs.length * 2) }, (_value, index) => layerInfo(`Existing Layer ${index + 1}`, { index: pairs.length * 2 + index + 1 }))
    );
    return withVerification({
      comp: { name: compName, numLayersBefore: beforeLayerCount, numLayersAfter: afterLayerCount },
      requestedLayerIndices,
      layerCountBefore: beforeLayerCount,
      layerCountAfter: afterLayerCount,
      duplicateCount: pairs.length,
      pairs,
      layers: pairs.map((pair) => pair.duplicate),
      postVerification: {
        ok: true,
        beforeLayerCount,
        afterLayerCount,
        expectedLayerCountAfter: afterLayerCount,
        requestedCount: requestedLayerIndices.length,
        duplicateCount: pairs.length,
        layerCountDelta: pairs.length,
        layerCountMatches: true,
        pairCountMatches: true,
        sourceNameMatches: true,
        duplicateNameMatches: true,
        pairNameMatches: true
      }
    }, compName, pairs[0] && pairs[0].duplicate);
  }
  if (step.tool === "set_layer_selection") {
    const requestedLayerIndices = Array.isArray(args.layerIndices) ? args.layerIndices.map(Number) : [];
    if (!state.layers.length) {
      state.layers = requestedLayerIndices.map((index) => layerInfo(`Selection Fixture Layer ${index}`, { index }));
    }
    const expectedLayerNames = Array.isArray(args.expectedLayerNames) ? args.expectedLayerNames.map(String) : [];
    const selectedLayers = requestedLayerIndices.map((layerIndex, index) => {
      const existing = state.layers.find((layer) => Number(layer.index) === Number(layerIndex));
      return existing || layerInfo(expectedLayerNames[index] || `Selection Fixture Layer ${layerIndex}`, { index: layerIndex });
    }).map((layer, index) => ({
      ...layer,
      name: expectedLayerNames[index] || layer.name
    }));
    state.selectedLayers = selectedLayers;
    return withVerification({
      comp: { name: compName, numLayers: state.layers.length },
      requestedLayerIndices,
      expectedLayerNames,
      selectedLayers,
      selectedIndices: selectedLayers.map((layer) => layer.index),
      selectedNames: selectedLayers.map((layer) => layer.name),
      changedCount: selectedLayers.length,
      postVerification: {
        ok: true,
        requestedCount: requestedLayerIndices.length,
        selectedCount: selectedLayers.length,
        indexMatches: true,
        nameMatches: true
      }
    }, compName, selectedLayers[0]);
  }
  if (step.tool === "delete_layer") {
    if (!state.layers.length) {
      state.layers = [
        layerInfo(args.expectedLayerName || "Delete Fixture Source", { index: 1, id: 301 }),
        layerInfo("Delete Fixture Background", { index: 2, id: 302 })
      ];
    }
    const layerIndex = args.layerIndex || 1;
    const deletedLayer = state.layers[layerIndex - 1] || layerInfo(args.expectedLayerName || "Delete Fixture Source", { index: layerIndex, id: 301 });
    const beforeLayerCount = state.layers.length;
    state.layers.splice(layerIndex - 1, 1);
    reindexLayers(state.layers);
    const afterLayerCount = state.layers.length;
    const layerAtDeletedIndexAfter = state.layers[layerIndex - 1] || null;
    return withVerification({
      comp: { name: compName, numLayersBefore: beforeLayerCount, numLayersAfter: afterLayerCount },
      layerCountBefore: beforeLayerCount,
      layerCountAfter: afterLayerCount,
      requestedLayerIndex: layerIndex,
      expectedLayerName: args.expectedLayerName,
      deletedLayer,
      layerAtDeletedIndexAfter,
      postVerification: {
        ok: true,
        beforeLayerCount,
        afterLayerCount,
        expectedLayerCountAfter: afterLayerCount,
        layerCountMatches: true,
        deletedLayerId: deletedLayer.id,
        deletedLayerIdAbsent: true,
        expectedLayerName: args.expectedLayerName,
        sameNameCountDecremented: true,
        deletedLayerNameAbsentAtOriginalIndex: !layerAtDeletedIndexAfter || layerAtDeletedIndexAfter.name !== args.expectedLayerName
      }
    }, compName);
  }
  if (step.tool === "set_comp_properties") {
    const before = { ...state.compProperties, name: compName, itemIndex: 1, numLayers: state.layers.length };
    const updates = {};
    for (const field of ["width", "height", "pixelAspect", "duration", "frameRate", "bgColor", "displayStartTime"]) {
      if (Object.prototype.hasOwnProperty.call(args, field)) updates[field] = args[field];
    }
    state.compProperties = { ...state.compProperties, ...updates };
    const after = { ...state.compProperties, name: compName, itemIndex: 1, numLayers: state.layers.length };
    const fieldMatches = {};
    for (const field of Object.keys(updates)) fieldMatches[field] = true;
    return withVerification({
      comp: after,
      before,
      after,
      updates,
      updatedFields: Object.keys(updates),
      postVerification: {
        ok: true,
        updatedFields: Object.keys(updates),
        fieldMatches,
        compIdentityMatches: true,
        layerCountUnchanged: true
      }
    }, compName);
  }
  if (step.tool === "set_layer_mask") {
    const beforeMaskCount = state.masks.length;
    let mask;
    if (args.operation === "update") {
      mask = state.masks[(args.maskIndex || 1) - 1] || {
        propertyIndex: args.maskIndex || 1,
        name: args.expectedMaskName || "Mask 1",
        maskMode: "add",
        inverted: false,
        shape: { vertices: [[0, 0], [100, 0], [100, 100]] },
        opacity: 100,
        feather: [0, 0],
        expansion: 0
      };
      mask = {
        ...mask,
        maskMode: args.maskMode || mask.maskMode,
        inverted: Object.prototype.hasOwnProperty.call(args, "inverted") ? args.inverted : mask.inverted,
        shape: Object.prototype.hasOwnProperty.call(args, "vertices") ? { vertices: args.vertices } : mask.shape,
        opacity: Object.prototype.hasOwnProperty.call(args, "opacity") ? args.opacity : mask.opacity,
        feather: Object.prototype.hasOwnProperty.call(args, "feather") ? args.feather : mask.feather,
        expansion: Object.prototype.hasOwnProperty.call(args, "expansion") ? args.expansion : mask.expansion
      };
      state.masks[(args.maskIndex || 1) - 1] = mask;
    } else {
      mask = {
        propertyIndex: beforeMaskCount + 1,
        name: args.name || "Mask 1",
        maskMode: args.maskMode || "add",
        inverted: args.inverted === true,
        shape: { vertices: args.vertices || [] },
        opacity: Object.prototype.hasOwnProperty.call(args, "opacity") ? args.opacity : 100,
        feather: args.feather || [0, 0],
        expansion: Object.prototype.hasOwnProperty.call(args, "expansion") ? args.expansion : 0
      };
      state.masks.push(mask);
    }
    const afterMaskCount = state.masks.length;
    return withVerification({
      comp: { name: compName },
      layer: layerInfo("Mask Fixture Solid", { index: args.layerIndex || 1 }),
      operation: args.operation,
      beforeMasks: { count: beforeMaskCount, items: [] },
      afterMasks: { count: afterMaskCount, items: state.masks.slice() },
      mask,
      afterMask: mask,
      postVerification: {
        ok: true,
        operation: args.operation,
        beforeMaskCount,
        afterMaskCount,
        expectedMaskCountAfter: afterMaskCount,
        maskCountMatches: true,
        maskIndex: mask.propertyIndex,
        expectedMaskName: args.expectedMaskName || args.name || "",
        expectedMaskNameMatches: true,
        verticesMatch: true,
        maskModeMatches: true,
        invertedMatches: true,
        opacityMatches: true,
        featherMatches: true,
        expansionMatches: true
      }
    }, compName);
  }
  if (step.tool === "add_layer_marker") {
    const marker = {
      keyIndex: state.layerMarkers.length + 1,
      time: args.time === undefined ? 0 : args.time,
      comment: args.comment,
      duration: args.duration || 0
    };
    state.layerMarkers.push(marker);
    const layer = layerInfo("Marker Fixture Layer", {
      index: args.layerIndex || 1,
      markerCount: state.layerMarkers.length
    });
    return withVerification({
      comp: { name: compName },
      layer,
      marker,
      markers: {
        count: state.layerMarkers.length,
        returned: state.layerMarkers.length,
        truncated: false,
        items: state.layerMarkers.slice()
      }
    }, compName, layer);
  }
  if (step.tool === "update_layer_marker") {
    if (state.layerMarkers.length === 0) {
      state.layerMarkers.push({
        keyIndex: 1,
        time: args.targetTime === undefined ? 1.25 : args.targetTime,
        comment: args.targetComment || "Marker Fixture Beat",
        duration: 0.5
      });
    }
    let markerIndex = args.markerIndex || 0;
    if (!markerIndex && args.targetTime !== undefined) {
      markerIndex = state.layerMarkers.findIndex((marker) => Math.abs(Number(marker.time) - Number(args.targetTime)) <= 0.001 && (!args.targetComment || marker.comment === args.targetComment)) + 1;
    }
    if (markerIndex < 1 || markerIndex > state.layerMarkers.length) markerIndex = 1;
    const markerBefore = { ...state.layerMarkers[markerIndex - 1] };
    const marker = {
      ...markerBefore,
      comment: args.comment === undefined ? markerBefore.comment : args.comment,
      time: args.time === undefined ? markerBefore.time : args.time,
      duration: args.duration === undefined ? markerBefore.duration : args.duration
    };
    state.layerMarkers[markerIndex - 1] = marker;
    const layer = layerInfo("Marker Fixture Layer", {
      index: args.layerIndex || 1,
      markerCount: state.layerMarkers.length
    });
    return withVerification({
      comp: { name: compName },
      layer,
      markerBefore,
      marker,
      markers: {
        count: state.layerMarkers.length,
        returned: state.layerMarkers.length,
        truncated: false,
        items: state.layerMarkers.slice()
      }
    }, compName, layer);
  }
  if (step.tool === "delete_layer_marker") {
    if (state.layerMarkers.length === 0) {
      state.layerMarkers.push({
        keyIndex: 1,
        time: args.targetTime === undefined ? 1.25 : args.targetTime,
        comment: args.targetComment || "Marker Fixture Beat",
        duration: 0.5
      });
    }
    let markerIndex = args.markerIndex || 0;
    if (!markerIndex && args.targetTime !== undefined) {
      markerIndex = state.layerMarkers.findIndex((marker) => Math.abs(Number(marker.time) - Number(args.targetTime)) <= 0.001 && (!args.targetComment || marker.comment === args.targetComment)) + 1;
    }
    if (markerIndex < 1 || markerIndex > state.layerMarkers.length) markerIndex = 1;
    const markerDeleted = state.layerMarkers.splice(markerIndex - 1, 1)[0];
    const layer = layerInfo("Marker Fixture Layer", {
      index: args.layerIndex || 1,
      markerCount: state.layerMarkers.length
    });
    return withVerification({
      comp: { name: compName },
      layer,
      markerDeleted,
      markers: {
        count: state.layerMarkers.length,
        returned: state.layerMarkers.length,
        truncated: false,
        items: state.layerMarkers.slice()
      }
    }, compName, layer);
  }
  if (step.tool === "set_comp_work_area") {
    return withVerification({
      comp: { name: compName },
      workAreaStart: args.start,
      workAreaDuration: args.duration
    }, compName);
  }
  if (step.tool === "set_layer_time_range") {
    const changed = (args.layerIndices || [1]).map((index) => ({
      after: layerInfo(`Layer ${index}`, {
        index,
        startTime: args.startTime === undefined ? 0 : args.startTime,
        inPoint: args.inPoint === undefined ? 0 : args.inPoint,
        outPoint: args.outPoint === undefined ? (args.inPoint || 0) + (args.duration || 1) : args.outPoint
      })
    }));
    return withVerification({ comp: { name: compName }, changedCount: changed.length, changed, layers: changed.map((item) => item.after) }, compName);
  }
  if (step.tool === "stagger_layers") {
    let cursor = args.startTime || 0;
    const changed = (args.layerIndices || [1]).map((index) => {
      const after = layerInfo(`Layer ${index}`, { index, startTime: cursor, inPoint: cursor, outPoint: cursor + 1 });
      cursor += 1 + Number(args.gap || 0) - Number(args.overlap || 0);
      return { after };
    });
    return withVerification({ comp: { name: compName }, startTime: args.startTime || 0, gap: args.gap || 0, changed }, compName);
  }
  if (step.tool === "align_layers_to_time") {
    const targetTime = args.targetTime === undefined ? 0 : args.targetTime;
    const aligned = (args.layerIndices || [1]).map((index) => ({
      after: layerInfo(`Layer ${index}`, { index, startTime: targetTime, inPoint: targetTime, outPoint: targetTime + 1 })
    }));
    return withVerification({ comp: { name: compName }, targetTime, align: args.align || "inPoint", aligned }, compName);
  }
  if (step.tool === "split_layers_at_time") {
    const time = args.time || args.targetTime || 0.5;
    const split = (args.layerIndices || [1]).map((index) => ({
      original: layerInfo(`Layer ${index}`, { index, inPoint: 0, outPoint: time }),
      newLayer: layerInfo(`Layer ${index} 2`, { index: index + 1, inPoint: time, outPoint: time + 1 })
    }));
    return withVerification({ comp: { name: compName }, time, split, layers: split.map((item) => item.newLayer) }, compName);
  }
  if (step.tool === "update_text_layer") {
    const layer = layerInfo("Updated Text", { index: args.layerIndex, text: args.text, fontSize: args.fontSize });
    return withVerification({ comp: { name: compName }, layer, text: { text: args.text, fontSize: args.fontSize } }, compName, layer);
  }
  if (step.tool === "create_shape_layer") {
    const layer = layerInfo(args.name, { index: state.nextLayerIndex++ });
    return withVerification({
      comp: { name: compName },
      layer,
      shape: { type: args.shape || "rectangle", size: args.size, fillColor: args.fillColor, strokeColor: args.strokeColor, strokeWidth: args.strokeWidth }
    }, compName, layer);
  }
  if (step.tool === "fit_layer_to_comp") {
    return withVerification({
      comp: { name: compName, width: 640, height: 360 },
      mode: args.mode || "contain",
      changedCount: (args.layerIndices || [1]).length,
      changed: (args.layerIndices || [1]).map((index) => ({ after: layerInfo(`Layer ${index}`, { index }), scale: [100, 100, 100], position: [320, 180] }))
    }, compName);
  }
  if (step.tool === "set_property_value") {
    const property = fakePropertyInfo(args.propertyPath, args.value);
    const key = JSON.stringify(property.propertyPath);
    state.propertyValues = state.propertyValues.filter((item) => JSON.stringify(item.propertyPath) !== key);
    state.propertyValues.push(property);
    return withVerification({
      comp: { name: compName },
      layer: layerInfo(`Layer ${args.layerIndex}`, { index: args.layerIndex }),
      property,
      properties: [property],
      setAtTime: args.setAtTime === true,
      time: args.time || null
    }, compName);
  }
  if (step.tool === "set_property_keyframes") {
    const keyframes = (args.keyframes || []).map((keyframe, index) => ({
      index: index + 1,
      time: keyframe.time,
      value: keyframe.value,
      inInterpolation: "linear",
      outInterpolation: "linear"
    }));
    return withVerification({
      comp: { name: compName },
      layer: layerInfo(`Layer ${args.layerIndex}`, { index: args.layerIndex }),
      keyframeCount: (args.keyframes || []).length,
      property: {
        matchName: args.propertyPath,
        propertyPath: propertyPathSegments(args.propertyPath).map((segment) => ({ name: segment, matchName: segment })),
        numKeys: (args.keyframes || []).length,
        keyframes
      }
    }, compName);
  }
  if (step.tool === "fill_in_keyframes") {
    const keyframes = [0, 1, 2].map((time, index) => ({
      index: index + 1,
      time,
      value: index === 0 ? 20 : 80,
      inInterpolation: "linear",
      outInterpolation: "linear"
    }));
    return withVerification({
      comp: { name: compName },
      layer: layerInfo(`Layer ${args.layerIndex}`, { index: args.layerIndex }),
      property: {
        matchName: args.propertyPath,
        propertyPath: propertyPathSegments(args.propertyPath).map((segment) => ({ name: segment, matchName: segment })),
        numKeys: keyframes.length,
        keyframes,
        expression: ""
      },
      sampledCount: 5,
      removedRedundantCount: 2,
      keyframeCount: keyframes.length
    }, compName);
  }
  if (step.tool === "keyframe_current_value_from_expression") {
    const time = args.time === undefined ? 1 : args.time;
    const value = time * 40 + 10;
    return withVerification({
      comp: { name: compName, time },
      layer: layerInfo(`Layer ${args.layerIndex}`, { index: args.layerIndex }),
      property: {
        matchName: args.propertyPath,
        propertyPath: propertyPathSegments(args.propertyPath).map((segment) => ({ name: segment, matchName: segment })),
        numKeys: 1,
        keyframes: [{ index: 1, time, value, inInterpolation: "linear", outInterpolation: "linear" }],
        expression: args.requireExpression === false ? "" : "time * 40 + 10"
      },
      keyframe: { time, value }
    }, compName);
  }
  if (step.tool === "apply_keyframe_ease") {
    return withVerification({
      comp: { name: compName },
      layer: layerInfo(`Layer ${args.layerIndex}`, { index: args.layerIndex }),
      keyIndices: args.keyIndices || [],
      interpolation: args.interpolation || null
    }, compName);
  }
  if (step.tool === "set_spatial_in_tangent") {
    const tangent = [-100, -50];
    const keyIndex = args.keyIndex || 2;
    return withVerification({
      comp: { name: compName },
      layer: layerInfo(`Layer ${args.layerIndex}`, { index: args.layerIndex }),
      property: {
        matchName: args.propertyPath || "ADBE Transform Group.ADBE Position",
        propertyPath: propertyPathSegments(args.propertyPath || "ADBE Transform Group.ADBE Position").map((segment) => ({ name: segment, matchName: segment })),
        numKeys: 2,
        keyframes: [
          { index: 1, time: 0, value: [100, 100], outSpatialTangent: [0, 0] },
          { index: keyIndex, time: 1, value: [300, 200], inSpatialTangent: tangent, outSpatialTangent: [0, 0] }
        ]
      },
      keyIndex,
      factor: args.factor || 0.5,
      inSpatialTangent: tangent,
      outSpatialTangent: [0, 0]
    }, compName);
  }
  if (step.tool === "set_expression") {
    return withVerification({
      comp: { name: compName },
      layer: layerInfo(`Layer ${args.layerIndex}`, { index: args.layerIndex }),
      expression: args.expression,
      expressionEnabled: args.enabled !== false,
      expressionError: ""
    }, compName);
  }
  if (step.tool === "separate_shape_size_dimensions") {
    const expression = `var x = effect("${args.xSliderName || "X Size"}")("Slider").value;\nvar y = effect("${args.ySliderName || "Y Size"}")("Slider").value;\n[x, y];`;
    return withVerification({
      comp: { name: compName },
      layer: layerInfo(`Layer ${args.layerIndex}`, { index: args.layerIndex }),
      property: {
        matchName: "ADBE Vector Rect Size",
        propertyPath: propertyPathSegments(args.propertyPath).map((segment) => ({ name: segment, matchName: segment })),
        expression
      },
      sliders: [
        { name: args.xSliderName || "X Size", value: 240 },
        { name: args.ySliderName || "Y Size", value: 120 }
      ],
      expression
    }, compName);
  }
  if (step.tool === "clear_expression") {
    return withVerification({
      comp: { name: compName },
      layer: layerInfo(`Layer ${args.layerIndex}`, { index: args.layerIndex }),
      expression: "",
      expressionEnabled: false,
      expressionError: ""
    }, compName);
  }
  if (step.tool === "precompose_layers") {
    state.projectItems.push({ itemIndex: state.nextItemIndex++, name: args.newCompName, type: "comp" });
    return withVerification({ sourceComp: { name: compName }, comp: { name: args.newCompName, itemIndex: state.nextItemIndex, numLayers: 1 } }, compName);
  }
  if (step.tool === "duplicate_comp") {
    const name = args.name || `${compName} copy`;
    state.projectItems.push({ itemIndex: state.nextItemIndex++, name, type: "comp" });
    return withVerification({
      source: { name: compName, itemIndex: args.compItemIndex || 1 },
      duplicate: { name, itemIndex: state.nextItemIndex, numLayers: 1 }
    }, name);
  }
  if (step.tool === "deep_duplicate_precomp_sources") {
    const nameSuffix = args.nameSuffix || " copy";
    const originalName = args.sourceCompName || "Nested Precomp";
    const duplicateName = `${originalName}${nameSuffix}`;
    state.projectItems.push({ itemIndex: state.nextItemIndex++, name: duplicateName, type: "comp" });
    return withVerification({
      comp: { name: compName },
      layer: layerInfo(duplicateName, {
        index: args.layerIndex || 1,
        source: { name: duplicateName, itemIndex: state.nextItemIndex, type: "comp" }
      }),
      originalComp: { name: originalName, itemIndex: args.sourceCompItemIndex || 2, type: "comp" },
      duplicateComp: { name: duplicateName, itemIndex: state.nextItemIndex, type: "comp", numLayers: 2 },
      changedCount: 1,
      duplicatedItemCount: 2,
      duplicatedFootageCount: 1,
      reusedFootageCount: args.unavailableFootagePolicy === "reuse" ? 1 : 0,
      relinkedLayerCount: 1,
      warnings: args.unavailableFootagePolicy === "reuse" ? ["Footage item reused with warning."] : []
    }, compName);
  }
  if (step.tool === "replace_layer_source") {
    return withVerification({
      comp: { name: compName },
      sourceItem: { name: args.sourceItemName, itemIndex: 2, type: "comp" },
      changedCount: 1,
      changed: [{ after: layerInfo("Replaced Source", { index: 1, source: { name: args.sourceItemName, itemIndex: 2, type: "comp" } }) }]
    }, compName);
  }
  if (step.tool === "rename_layers") {
    const before = "Layer Before Rename";
    const after = renameAfter(before, args);
    const layer = layerInfo(after, { index: 1 });
    return withVerification({ comp: { name: compName }, mode: args.mode, changedCount: 1, renamed: [{ index: 1, before, after, layer }], layers: [layer] }, compName, layer);
  }
  if (step.tool === "rename_project_items") {
    const before = args.query || "Item Before Rename";
    const after = renameAfter(before, args);
    state.projectItems.push({ itemIndex: state.nextItemIndex++, name: after, type: args.type || "comp" });
    return withVerification({ mode: args.mode, query: args.query, changedCount: 1, renamed: [{ itemIndex: state.nextItemIndex, before, after, item: { name: after, type: args.type || "comp" } }] }, after);
  }
  if (step.tool === "add_comp_to_render_queue") {
    const item = {
      index: state.nextRenderQueueIndex++,
      status: 1,
      comp: { name: args.compName, type: "comp" },
      outputModules: [{ index: 1, file: args.outputPath }]
    };
    state.renderQueueItems.push(item);
    return withVerification({ comp: { name: args.compName }, renderQueueItem: item }, args.compName);
  }
  if (step.tool === "set_render_queue_output") {
    const item = {
      index: args.renderQueueItemIndex,
      status: 1,
      comp: { name: state.lastCompName || "Render Comp", type: "comp" },
      outputModules: [{ index: 1, file: args.outputPath }]
    };
    state.renderQueueItems.push(item);
    return withVerification({ renderQueueItem: item }, item.comp.name);
  }
  return withVerification({ ok: true }, compName);
}

function fakeReadBackResult(step, state) {
  if (step.tool === "find_project_items") {
    const query = step.args && step.args.query ? step.args.query : "";
    return {
      query,
      matches: state.projectItems.filter((item) => !query || item.name.indexOf(query) >= 0)
    };
  }
  if (step.tool === "get_render_queue_status") {
    return {
      totalItems: state.renderQueueItems.length,
      returned: state.renderQueueItems.length,
      items: state.renderQueueItems
    };
  }
  if (step.tool === "get_layer_details") {
    return {
      comp: { name: step.args && step.args.compName || state.lastCompName || "Fixture Comp" },
      layer: layerInfo("Marker Fixture Layer", {
        index: step.args && step.args.layerIndex || 1,
        markerCount: state.layerMarkers.length
      }),
      masks: {
        count: state.masks.length,
        returned: state.masks.length,
        truncated: false,
        items: state.masks.slice()
      },
      markers: {
        count: state.layerMarkers.length,
        returned: state.layerMarkers.length,
        truncated: false,
        items: state.layerMarkers.slice()
      },
      propertyTree: state.propertyValues.slice()
    };
  }
  if (step.tool === "get_selected_layers") {
    const selectedLayers = Array.isArray(state.selectedLayers) ? state.selectedLayers.slice() : [];
    return {
      comp: {
        name: step.args && step.args.compName || state.lastCompName || "Fixture Comp",
        numLayers: state.layers.length
      },
      selectedLayers
    };
  }
  if (step.tool === "get_comp_details" || step.tool === "list_layers") {
    const layers = state.layers.slice();
    return {
      comp: {
        name: step.args && step.args.compName || state.lastCompName || "Fixture Comp",
        numLayers: layers.length,
        width: state.compProperties.width,
        height: state.compProperties.height,
        pixelAspect: state.compProperties.pixelAspect,
        duration: state.compProperties.duration,
        frameRate: state.compProperties.frameRate,
        bgColor: state.compProperties.bgColor,
        displayStartTime: state.compProperties.displayStartTime
      },
      layerCount: layers.length,
      layers
    };
  }
  return { ok: true };
}

function fakeRunForPlan(plan) {
  const state = {
    nextItemIndex: 1,
    nextLayerIndex: 1,
    nextRenderQueueIndex: 1,
    lastCompName: "",
    projectItems: [],
    layers: [],
    selectedLayers: [],
    propertyValues: [],
    renderQueueItems: [],
    layerMarkers: [],
    masks: [],
    compProperties: {
      width: 1280,
      height: 720,
      pixelAspect: 1,
      duration: 4,
      frameRate: 24,
      bgColor: [0, 0, 0],
      displayStartTime: 0
    }
  };
  const steps = (plan.steps || []).map((step, index) => {
    const mutatesProject = AGENT_SCENARIO_MUTATING_TOOLS.has(step.tool) || LOCAL_MUTATING_TOOLS.has(step.tool);
    const result = mutatesProject ? fakeMutationResult(step, state) : fakeReadBackResult(step, state);
    return {
      index: index + 1,
      title: step.title,
      tool: step.tool,
      args: clone(step.args || {}),
      mutatesProject,
      status: "completed",
      result
    };
  });
  return {
    ok: true,
    dryRun: false,
    validation: {
      mutatingCount: steps.filter((step) => step.mutatesProject).length
    },
    steps
  };
}

function assertScenarioPasses(scenario) {
  const run = fakeRunForPlan(scenario.plan);
  const semantic = buildSemanticVerification(scenario.plan, run);
  assert.strictEqual(semantic.schema, SEMANTIC_VERIFICATION_SCHEMA, `${scenario.id}: schema mismatch`);
  assert.strictEqual(semantic.status, "passed", `${scenario.id}: semantic verification should pass: ${semantic.summary}`);
  assert.strictEqual(semantic.failedChecks, 0, `${scenario.id}: expected no failed checks`);
  assert(semantic.passedChecks > 0, `${scenario.id}: expected semantic checks`);
  assert(semantic.readBackCount > 0, `${scenario.id}: expected read-back summaries`);
  return {
    id: scenario.id,
    status: semantic.status,
    passedChecks: semantic.passedChecks,
    readBackCount: semantic.readBackCount
  };
}

function assertMismatchNeedsReview(scenario) {
  const run = fakeRunForPlan(scenario.plan);
  const updateStep = run.steps.find((step) => step.tool === "update_text_layer");
  assert(updateStep, "negative fixture needs update_text_layer");
  updateStep.result.layer.text.text = "Wrong Text";
  const semantic = buildSemanticVerification(scenario.plan, run);
  assert.strictEqual(semantic.status, "needs_review");
  assert(semantic.failedChecks > 0, "mismatched text should fail at least one semantic check");
}

function assertMissingReadBackNeedsReview(scenario) {
  const run = fakeRunForPlan({
    ...scenario.plan,
    steps: scenario.plan.steps.filter((step) => !["find_project_items", "get_render_queue_status"].includes(step.tool))
  });
  const semantic = buildSemanticVerification(scenario.plan, run);
  assert.strictEqual(semantic.status, "needs_review");
  assert.strictEqual(semantic.readBackCount, 0);
  assert(semantic.warnings.some((warning) => warning.indexOf("No explicit read-back") >= 0));
}

function assertDeepDuplicatePasses() {
  const plan = {
    summary: "Deep duplicate selected precomp with fileless sources.",
    risk: "medium",
    requiresCheckpoint: true,
    steps: [
      {
        title: "Deep duplicate selected precomp",
        tool: "deep_duplicate_precomp_sources",
        args: {
          layerIndex: 1,
          sourceCompName: "Nested Precomp",
          nameSuffix: " copy",
          unavailableFootagePolicy: "reuse"
        }
      },
      {
        title: "Read back duplicated project items",
        tool: "find_project_items",
        args: { query: "Nested Precomp copy" }
      }
    ]
  };
  const run = fakeRunForPlan(plan);
  const semantic = buildSemanticVerification(plan, run);
  assert.strictEqual(semantic.status, "passed", `deep duplicate semantic verification should pass: ${semantic.summary}`);
  assert(semantic.checks.some((check) => check.id.indexOf("deep_duplicate_precomp_sources:duplicate") >= 0), "deep duplicate check should be reported.");
}

function assertCameraLayerPasses() {
  const plan = {
    summary: "Create a generated camera layer and inspect the active comp.",
    risk: "low",
    requiresCheckpoint: true,
    steps: [
      {
        title: "Create generated camera",
        tool: "create_camera_layer",
        args: {
          compName: "Camera Fixture",
          name: "Camera Fixture Camera",
          pointOfInterest: [320, 180, 0],
          position: [320, 180, -900],
          zoom: 600
        }
      },
      {
        title: "Read active comp",
        tool: "get_active_comp",
        args: {}
      }
    ]
  };
  const run = fakeRunForPlan(plan);
  const semantic = buildSemanticVerification(plan, run);
  assert.strictEqual(semantic.status, "passed", `camera layer semantic verification should pass: ${semantic.summary}`);
  assert(semantic.checks.some((check) => check.id.indexOf("create_camera_layer:numbers") >= 0), "camera zoom check should be reported.");
}

function assertCameraPointOfInterestUsesReadBackEvidence() {
  const plan = {
    summary: "Create a generated camera layer and inspect the layer details.",
    risk: "low",
    requiresCheckpoint: true,
    steps: [
      {
        title: "Create generated camera",
        tool: "create_camera_layer",
        args: {
          compName: "Camera Fixture",
          name: "Camera Fixture Camera",
          pointOfInterest: [320, 180, 0],
          position: [320, 180, -850],
          zoom: 800
        }
      },
      {
        title: "Read generated camera",
        tool: "get_layer_details",
        args: { compName: "Camera Fixture", layerIndex: 1 }
      }
    ]
  };
  const run = {
    ok: true,
    dryRun: false,
    steps: [
      {
        index: 1,
        title: plan.steps[0].title,
        tool: "create_camera_layer",
        args: clone(plan.steps[0].args),
        mutatesProject: true,
        status: "completed",
        result: withVerification({
          comp: { name: "Camera Fixture" },
          layer: layerInfo("Camera Fixture Camera", { matchName: "ADBE Camera Layer" }),
          camera: {
            position: [320, 180, -850],
            zoom: 800
          }
        }, "Camera Fixture")
      },
      {
        index: 2,
        title: plan.steps[1].title,
        tool: "get_layer_details",
        args: clone(plan.steps[1].args),
        mutatesProject: false,
        status: "completed",
        result: {
          comp: { name: "Camera Fixture" },
          layer: layerInfo("Camera Fixture Camera", {
            matchName: "ADBE Camera Layer",
            transform: {
              pointOfInterest: { kind: "array", value: [320, 180, 0] },
              position: { kind: "array", value: [320, 180, -850] }
            }
          }),
          transform: {
            pointOfInterest: { kind: "array", value: [320, 180, 0] },
            position: { kind: "array", value: [320, 180, -850] }
          },
          camera: { zoom: 800 }
        }
      }
    ]
  };
  const semantic = buildSemanticVerification(plan, run);
  assert.strictEqual(semantic.status, "passed", `camera pointOfInterest read-back fallback should pass: ${semantic.summary}`);
  assert(semantic.checks.some((check) => (
    check.id.indexOf("create_camera_layer:pointOfInterest") >= 0 &&
    check.status === "passed" &&
    check.evidence.indexOf("Read generated camera") >= 0
  )), "camera pointOfInterest check should use read-back evidence.");
}

function assertLayerMaskPasses() {
  const plan = {
    summary: "Create a generated layer mask and inspect the layer.",
    risk: "low",
    requiresCheckpoint: true,
    steps: [
      {
        title: "Create generated mask",
        tool: "create_layer_mask",
        args: {
          compName: "Mask Fixture",
          layerIndex: 1,
          name: "Mask Fixture Polygon",
          vertices: [[120, 80], [520, 80], [520, 280], [120, 280]],
          maskMode: "add"
        }
      },
      {
        title: "Read mask layer",
        tool: "get_layer_details",
        args: { compName: "Mask Fixture", layerIndex: 1 }
      }
    ]
  };
  const run = fakeRunForPlan(plan);
  const semantic = buildSemanticVerification(plan, run);
  assert.strictEqual(semantic.status, "passed", `layer mask semantic verification should pass: ${semantic.summary}`);
  assert(semantic.checks.some((check) => check.id.indexOf("create_layer_mask:vertices") >= 0), "mask vertices check should be reported.");
}

function assertDuplicateLayerPasses() {
  const plan = {
    summary: "Duplicate one generated layer and inspect the duplicate.",
    risk: "low",
    requiresCheckpoint: true,
    steps: [
      {
        title: "Duplicate generated layer",
        tool: "duplicate_layer",
        args: {
          compName: "Duplicate Fixture",
          layerIndex: 1,
          sourceName: "Duplicate Fixture Source",
          name: "Duplicate Fixture Copy"
        }
      },
      {
        title: "Read duplicate layer",
        tool: "get_layer_details",
        args: { compName: "Duplicate Fixture" },
        resultBindings: { layerIndex: "{{layerIndex}}" }
      }
    ]
  };
  const run = fakeRunForPlan(plan);
  const semantic = buildSemanticVerification(plan, run);
  assert.strictEqual(semantic.status, "passed", `duplicate layer semantic verification should pass: ${semantic.summary}`);
  assert(semantic.checks.some((check) => check.id.indexOf("duplicate_layer:duplicate") >= 0), "duplicate layer check should be reported.");
}

function assertDuplicateLayersPasses() {
  const plan = {
    summary: "Duplicate two generated layers and inspect the comp.",
    risk: "low",
    requiresCheckpoint: true,
    steps: [
      {
        title: "Duplicate generated layers",
        tool: "duplicate_layers",
        args: {
          compName: "Duplicate Layers Fixture",
          layerIndices: [1, 2],
          sourceNames: ["Duplicate Layers Source A", "Duplicate Layers Source B"],
          nameSuffix: " Copy"
        }
      },
      {
        title: "Read duplicate layers comp",
        tool: "get_comp_details",
        args: { compName: "Duplicate Layers Fixture" }
      }
    ]
  };
  const run = fakeRunForPlan(plan);
  const semantic = buildSemanticVerification(plan, run);
  assert.strictEqual(semantic.status, "passed", `duplicate layers semantic verification should pass: ${semantic.summary}`);
  assert(semantic.checks.some((check) => check.id.indexOf("duplicate_layers:pairs") >= 0 && check.status === "passed"), "duplicate_layers pair-count check should pass.");
  assert(semantic.checks.some((check) => check.id.indexOf("duplicate_layers:names") >= 0 && check.observed.indexOf("Duplicate Layers Source A Copy") >= 0), "duplicate_layers name read-back check should report expected names.");
  assert(semantic.checks.some((check) => check.id.indexOf("duplicate_layers:layer-counts") >= 0 && check.expected === "2 -> 4"), "duplicate_layers before/after count check should be reported.");
}

function assertDuplicateLayersMissingReadBackNeedsReview() {
  const plan = {
    summary: "Duplicate two generated layers without post-run read-back.",
    risk: "low",
    requiresCheckpoint: true,
    steps: [
      {
        title: "Duplicate generated layers",
        tool: "duplicate_layers",
        args: {
          compName: "Duplicate Layers Fixture",
          layerIndices: [1, 2],
          sourceNames: ["Duplicate Layers Source A", "Duplicate Layers Source B"],
          nameSuffix: " Copy"
        }
      }
    ]
  };
  const run = fakeRunForPlan(plan);
  const semantic = buildSemanticVerification(plan, run);
  assert.strictEqual(semantic.status, "needs_review", "duplicate_layers must not pass without post-run read-back evidence.");
  assert(semantic.checks.some((check) => check.id.indexOf("duplicate_layers:names") >= 0 && check.status === "failed"), "missing duplicate_layers read-back names should fail.");
}

function assertLayerSelectionPasses() {
  const [scenario] = agentLayerSelectionScenarioPlans("Codex Semantic Fixture");
  const run = fakeRunForPlan(scenario.plan);
  const semantic = buildSemanticVerification(scenario.plan, run);
  assert.strictEqual(semantic.status, "passed", `set_layer_selection semantic verification should pass: ${semantic.summary}`);
  assert(semantic.checks.some((check) => check.id.indexOf("set_layer_selection:selection") >= 0 && check.status === "passed"), "set_layer_selection read-back check should pass.");
}

function assertDeleteLayerPasses() {
  const plan = {
    summary: "Delete one inspected generated layer and inspect the comp.",
    risk: "high",
    requiresCheckpoint: true,
    steps: [
      {
        title: "Delete generated layer",
        tool: "delete_layer",
        args: {
          compName: "Delete Fixture",
          layerIndex: 1,
          expectedLayerName: "Delete Fixture Source"
        }
      },
      {
        title: "Read comp after delete",
        tool: "get_comp_details",
        args: { compName: "Delete Fixture", includeLayers: true }
      }
    ]
  };
  const run = fakeRunForPlan(plan);
  const semantic = buildSemanticVerification(plan, run);
  assert.strictEqual(semantic.status, "passed", `delete_layer semantic verification should pass: ${semantic.summary}`);
  assert(semantic.checks.some((check) => check.id.indexOf("delete_layer:absence") >= 0 && check.status === "passed"), "delete_layer absence check should pass.");
}

function assertDeleteLayerMissingReadBackNeedsReview() {
  const plan = {
    summary: "Delete one inspected generated layer without read-back.",
    risk: "high",
    requiresCheckpoint: true,
    steps: [
      {
        title: "Delete generated layer",
        tool: "delete_layer",
        args: {
          compName: "Delete Fixture",
          layerIndex: 1,
          expectedLayerName: "Delete Fixture Source"
        }
      }
    ]
  };
  const run = fakeRunForPlan(plan);
  const semantic = buildSemanticVerification(plan, run);
  assert.strictEqual(semantic.status, "needs_review", "delete_layer must fail closed without post-run read-back.");
  assert(semantic.checks.some((check) => check.id.indexOf("delete_layer:absence") >= 0 && check.status === "failed"), "delete_layer missing read-back absence should fail.");
}

function assertSetCompPropertiesPasses() {
  const plan = {
    summary: "Update one generated composition property set and inspect it.",
    risk: "medium",
    requiresCheckpoint: true,
    steps: [
      {
        title: "Update comp properties",
        tool: "set_comp_properties",
        args: {
          compName: "Comp Properties Fixture",
          width: 1920,
          height: 1080,
          frameRate: 30,
          bgColor: [0.1, 0.2, 0.3]
        }
      },
      {
        title: "Read comp properties",
        tool: "get_comp_details",
        args: { compName: "Comp Properties Fixture" }
      }
    ]
  };
  const run = fakeRunForPlan(plan);
  const semantic = buildSemanticVerification(plan, run);
  assert.strictEqual(semantic.status, "passed", `set_comp_properties semantic verification should pass: ${semantic.summary}`);
  assert(semantic.checks.some((check) => check.id.indexOf("set_comp_properties:width") >= 0 && check.status === "passed"), "set_comp_properties width check should pass.");
}

function assertSetCompPropertiesReadBackMismatchNeedsReview() {
  const plan = {
    summary: "Update one generated composition property set and inspect it.",
    risk: "medium",
    requiresCheckpoint: true,
    steps: [
      {
        title: "Update comp properties",
        tool: "set_comp_properties",
        args: { compName: "Comp Properties Fixture", width: 1920 }
      },
      {
        title: "Read comp properties",
        tool: "get_comp_details",
        args: { compName: "Comp Properties Fixture" }
      }
    ]
  };
  const run = fakeRunForPlan(plan);
  run.steps[1].result.comp.width = 1280;
  const semantic = buildSemanticVerification(plan, run);
  assert.strictEqual(semantic.status, "needs_review", "set_comp_properties must fail closed on mismatched read-back.");
  assert(semantic.checks.some((check) => check.id.indexOf("set_comp_properties:width") >= 0 && check.status === "failed"), "set_comp_properties mismatched read-back should fail.");
}

function assertSetLayerMaskCreateUpdatePasses() {
  const plan = {
    summary: "Create and update one generated layer mask with read-back after each mutation.",
    risk: "medium",
    requiresCheckpoint: true,
    steps: [
      {
        title: "Create mask",
        tool: "set_layer_mask",
        args: {
          compName: "Mask Fixture",
          layerIndex: 1,
          operation: "create",
          name: "Mask Fixture Create",
          vertices: [[0, 0], [100, 0], [100, 100]],
          maskMode: "add"
        }
      },
      {
        title: "Read mask after create",
        tool: "get_layer_details",
        args: { compName: "Mask Fixture", layerIndex: 1 }
      },
      {
        title: "Update mask",
        tool: "set_layer_mask",
        args: {
          compName: "Mask Fixture",
          layerIndex: 1,
          operation: "update",
          maskIndex: 1,
          expectedMaskName: "Mask Fixture Create",
          opacity: 75
        }
      },
      {
        title: "Read mask after update",
        tool: "get_layer_details",
        args: { compName: "Mask Fixture", layerIndex: 1 }
      }
    ]
  };
  const run = fakeRunForPlan(plan);
  const semantic = buildSemanticVerification(plan, run);
  assert.strictEqual(semantic.status, "passed", `set_layer_mask semantic verification should pass: ${semantic.summary}`);
  assert(semantic.checks.some((check) => check.id.indexOf("set_layer_mask:mask") >= 0 && check.status === "passed"), "set_layer_mask read-back check should pass.");
}

function assertSetLayerMaskMissingReadBackNeedsReview() {
  const plan = {
    summary: "Create one generated layer mask without read-back.",
    risk: "medium",
    requiresCheckpoint: true,
    steps: [
      {
        title: "Create mask",
        tool: "set_layer_mask",
        args: {
          compName: "Mask Fixture",
          layerIndex: 1,
          operation: "create",
          name: "Mask Fixture Create",
          vertices: [[0, 0], [100, 0], [100, 100]],
          maskMode: "add"
        }
      }
    ]
  };
  const run = fakeRunForPlan(plan);
  const semantic = buildSemanticVerification(plan, run);
  assert.strictEqual(semantic.status, "needs_review", "set_layer_mask must fail closed without post-run read-back.");
  assert(semantic.checks.some((check) => check.id.indexOf("set_layer_mask:mask") >= 0 && check.status === "failed"), "set_layer_mask missing read-back should fail.");
}

function assertDakkshinFixtureMutationScopedReadBackPasses() {
  const [scenario] = agentDakkshinTypedToolsScenarioPlans("Semantic Fixture");
  const run = fakeRunForPlan(scenario.plan);
  const semantic = buildSemanticVerification(scenario.plan, run);
  assert.strictEqual(semantic.status, "passed", `Dakkshin fixture should pass with mutation-scoped read-back windows: ${semantic.summary}`);
  assert(semantic.readBackSteps.some((step) => step.index === 3 && step.tool === "get_comp_details"), "Dakkshin fixture should read comp details after set_comp_properties.");
  assert(semantic.readBackSteps.some((step) => step.index === 8 && step.tool === "get_comp_details"), "Dakkshin fixture should read comp details after delete_layer.");
  assert(semantic.readBackSteps.some((step) => step.index === 10 && step.tool === "get_layer_details"), "Dakkshin fixture should read layer details after set_layer_mask create.");
  assert(semantic.checks.some((check) => check.id.indexOf("set_comp_properties:width") >= 0 && check.status === "passed"), "Dakkshin set_comp_properties check should pass.");
  assert(semantic.checks.some((check) => check.id.indexOf("delete_layer:absence") >= 0 && check.status === "passed"), "Dakkshin delete_layer absence check should pass.");
  assert(semantic.checks.some((check) => check.id.indexOf("set_layer_mask:mask") >= 0 && check.status === "passed"), "Dakkshin set_layer_mask read-back check should pass.");
}

function assertDakkshinLiveAeEvidenceShapePasses() {
  const [scenario] = agentDakkshinTypedToolsScenarioPlans("Semantic Live Evidence Fixture");
  const run = fakeRunForPlan(scenario.plan);
  const setCompStep = run.steps.find((step) => step.tool === "set_comp_properties");
  const compReadBackStep = run.steps.find((step) => step.index === 3 && step.tool === "get_comp_details");
  assert(setCompStep && compReadBackStep, "Dakkshin live evidence fixture needs set_comp_properties and scoped comp read-back.");

  const quantizedBgColor = quantizedAeColor(setCompStep.args.bgColor);
  setCompStep.result.comp.bgColor = quantizedBgColor;
  setCompStep.result.after.bgColor = quantizedBgColor;
  setCompStep.result.postVerification.ok = true;
  setCompStep.result.postVerification.fieldMatches.bgColor = true;
  compReadBackStep.result.comp.bgColor = aePropertyPreview(quantizedBgColor);

  for (const readBackStep of run.steps.filter((step) => step.tool === "get_layer_details")) {
    const masks = readBackStep.result && readBackStep.result.masks && Array.isArray(readBackStep.result.masks.items)
      ? readBackStep.result.masks.items
      : [];
    for (const mask of masks) {
      if (Object.prototype.hasOwnProperty.call(mask, "opacity")) mask.opacity = aePropertyPreview(mask.opacity);
      if (Object.prototype.hasOwnProperty.call(mask, "feather")) mask.feather = aePropertyPreview(mask.feather);
      if (Object.prototype.hasOwnProperty.call(mask, "expansion")) mask.expansion = aePropertyPreview(mask.expansion);
    }
  }

  const semantic = buildSemanticVerification(scenario.plan, run);
  assert.strictEqual(semantic.status, "passed", `Dakkshin live AE evidence shape should pass: ${semantic.summary}`);
  assert(semantic.checks.some((check) => check.id.indexOf("set_comp_properties:bgColor") >= 0 && check.status === "passed"), "quantized bgColor read-back should pass.");
  assert(semantic.checks.some((check) => check.id.indexOf("set_layer_mask:mask") >= 0 && check.status === "passed"), "mask property preview wrappers should pass.");
  assert(semantic.readBackSteps.some((step) => step.index === 3 && step.tool === "get_comp_details"), "live evidence fixture should keep set_comp_properties scoped read-back.");
  assert(semantic.readBackSteps.some((step) => step.index === 10 && step.tool === "get_layer_details"), "live evidence fixture should keep set_layer_mask create scoped read-back.");
}

function assertDuplicateLayersPairOrderMismatchNeedsReview() {
  const plan = {
    summary: "Duplicate two generated layers with current stack-order source names.",
    risk: "low",
    requiresCheckpoint: true,
    steps: [
      {
        title: "Duplicate generated layers",
        tool: "duplicate_layers",
        args: {
          compName: "Duplicate Layers Fixture",
          layerIndices: [1, 2],
          sourceNames: ["Duplicate Layers Source B", "Duplicate Layers Source A"],
          nameSuffix: " Copy"
        }
      },
      {
        title: "Read duplicate layers comp",
        tool: "get_comp_details",
        args: { compName: "Duplicate Layers Fixture", includeLayers: true }
      }
    ]
  };
  const pairs = [
    {
      requestedLayerIndex: 1,
      source: layerInfo("Duplicate Layers Source A", { index: 1 }),
      sourceAfter: layerInfo("Duplicate Layers Source A", { index: 2 }),
      duplicate: layerInfo("Duplicate Layers Source A Copy", { index: 1 })
    },
    {
      requestedLayerIndex: 2,
      source: layerInfo("Duplicate Layers Source B", { index: 2 }),
      sourceAfter: layerInfo("Duplicate Layers Source B", { index: 4 }),
      duplicate: layerInfo("Duplicate Layers Source B Copy", { index: 3 })
    }
  ];
  const run = {
    ok: true,
    dryRun: false,
    steps: [
      {
        index: 1,
        title: plan.steps[0].title,
        tool: "duplicate_layers",
        args: clone(plan.steps[0].args),
        mutatesProject: true,
        status: "completed",
        result: withVerification({
          comp: { name: "Duplicate Layers Fixture", numLayersBefore: 2, numLayersAfter: 4 },
          requestedLayerIndices: [1, 2],
          layerCountBefore: 2,
          layerCountAfter: 4,
          duplicateCount: 2,
          pairs,
          postVerification: {
            ok: true,
            beforeLayerCount: 2,
            afterLayerCount: 4,
            expectedLayerCountAfter: 4,
            requestedCount: 2,
            duplicateCount: 2,
            layerCountDelta: 2,
            layerCountMatches: true,
            pairCountMatches: true,
            sourceNameMatches: false,
            duplicateNameMatches: false,
            pairNameMatches: false
          }
        }, "Duplicate Layers Fixture")
      },
      {
        index: 2,
        title: plan.steps[1].title,
        tool: "get_comp_details",
        args: clone(plan.steps[1].args),
        mutatesProject: false,
        status: "completed",
        result: {
          comp: { name: "Duplicate Layers Fixture", numLayers: 4 },
          layerCount: 4,
          layers: [
            layerInfo("Duplicate Layers Source A Copy", { index: 1 }),
            layerInfo("Duplicate Layers Source A", { index: 2 }),
            layerInfo("Duplicate Layers Source B Copy", { index: 3 }),
            layerInfo("Duplicate Layers Source B", { index: 4 })
          ]
        }
      }
    ]
  };
  const semantic = buildSemanticVerification(plan, run);
  assert.strictEqual(semantic.status, "needs_review", "duplicate_layers layer/name order mismatch must fail closed.");
  assert(semantic.checks.some((check) => check.id.indexOf("duplicate_layers:pair-name-order") >= 0 && check.status === "failed"), "duplicate_layers pair-name order check should fail.");
}

function assertDuplicateLayersJsonStringReadBackPasses() {
  const plan = {
    summary: "Duplicate two generated layers and inspect the comp.",
    risk: "low",
    requiresCheckpoint: true,
    steps: [
      {
        title: "Duplicate generated layers",
        tool: "duplicate_layers",
        args: {
          compName: "Duplicate Layers Fixture",
          layerIndices: [1, 2],
          sourceNames: ["Duplicate Layers Source B", "Duplicate Layers Source A"],
          nameSuffix: " Copy"
        }
      },
      {
        title: "Read duplicate layers comp",
        tool: "get_comp_details",
        args: { compName: "Duplicate Layers Fixture", includeLayers: true }
      }
    ]
  };
  const pairs = [
    {
      requestedLayerIndex: 1,
      source: layerInfo("Duplicate Layers Source B", { index: 1 }),
      sourceAfter: layerInfo("Duplicate Layers Source B", { index: 2 }),
      duplicate: layerInfo("Duplicate Layers Source B Copy", { index: 1 })
    },
    {
      requestedLayerIndex: 2,
      source: layerInfo("Duplicate Layers Source A", { index: 2 }),
      sourceAfter: layerInfo("Duplicate Layers Source A", { index: 4 }),
      duplicate: layerInfo("Duplicate Layers Source A Copy", { index: 3 })
    }
  ];
  const run = {
    ok: true,
    dryRun: false,
    steps: [
      {
        index: 1,
        title: plan.steps[0].title,
        tool: "duplicate_layers",
        args: clone(plan.steps[0].args),
        mutatesProject: true,
        status: "completed",
        result: withVerification({
          comp: { name: "Duplicate Layers Fixture", numLayersBefore: 2, numLayersAfter: 4 },
          requestedLayerIndices: [1, 2],
          layerCountBefore: 2,
          layerCountAfter: 4,
          duplicateCount: 2,
          pairs,
          postVerification: {
            ok: true,
            beforeLayerCount: 2,
            afterLayerCount: 4,
            expectedLayerCountAfter: 4,
            requestedCount: 2,
            duplicateCount: 2,
            layerCountDelta: 2,
            layerCountMatches: true,
            pairCountMatches: true,
            sourceNameMatches: true,
            duplicateNameMatches: true,
            pairNameMatches: true
          }
        }, "Duplicate Layers Fixture")
      },
      {
        index: 2,
        title: plan.steps[1].title,
        tool: "get_comp_details",
        args: clone(plan.steps[1].args),
        mutatesProject: false,
        status: "completed",
        result: JSON.stringify({
          comp: { name: "Duplicate Layers Fixture", numLayers: 4 },
          layerCount: 4,
          layers: [
            layerInfo("Duplicate Layers Source B Copy", { index: 1 }),
            layerInfo("Duplicate Layers Source B", { index: 2 }),
            layerInfo("Duplicate Layers Source A Copy", { index: 3 }),
            layerInfo("Duplicate Layers Source A", { index: 4 })
          ]
        })
      }
    ]
  };
  const semantic = buildSemanticVerification(plan, run);
  assert.strictEqual(semantic.status, "passed", `duplicate_layers JSON read-back should pass: ${semantic.summary}`);
  assert(semantic.checks.some((check) => check.id.indexOf("duplicate_layers:names") >= 0 && check.status === "passed"), "duplicate_layers JSON read-back names should pass.");
  assert(semantic.checks.some((check) => check.id.indexOf("duplicate_layers:layer-counts") >= 0 && check.status === "passed"), "duplicate_layers JSON read-back layer count should pass.");
}

function assertAddLayerMarkerPasses() {
  const plan = {
    summary: "Add one explicit timeline marker to a generated layer and inspect marker read-back.",
    risk: "medium",
    requiresCheckpoint: true,
    steps: [
      {
        title: "Add layer marker",
        tool: "add_layer_marker",
        args: {
          compName: "Marker Fixture",
          layerIndex: 1,
          time: 1.25,
          comment: "Marker Fixture Beat",
          duration: 0.5
        }
      },
      {
        title: "Read marker layer",
        tool: "get_layer_details",
        args: {
          compName: "Marker Fixture",
          layerIndex: 1
        }
      }
    ]
  };
  const run = fakeRunForPlan(plan);
  const semantic = buildSemanticVerification(plan, run);
  assert.strictEqual(semantic.status, "passed", `add layer marker semantic verification should pass: ${semantic.summary}`);
  assert(semantic.checks.some((check) => check.id.indexOf("add_layer_marker:marker") >= 0), "add layer marker check should be reported.");
}

function assertSetPropertyValuePasses() {
  const plan = {
    summary: "Set one explicit generated layer property value and inspect property read-back.",
    risk: "medium",
    requiresCheckpoint: true,
    steps: [
      {
        title: "Set opacity value",
        tool: "set_property_value",
        args: {
          compName: "Property Fixture",
          layerIndex: 1,
          propertyPath: "ADBE Transform Group.ADBE Opacity",
          value: 42,
          setAtTime: false
        }
      },
      {
        title: "Read property layer",
        tool: "get_layer_details",
        args: {
          compName: "Property Fixture",
          layerIndex: 1,
          includeProperties: true,
          includeValues: true
        }
      }
    ]
  };
  const run = fakeRunForPlan(plan);
  const semantic = buildSemanticVerification(plan, run);
  assert.strictEqual(semantic.status, "passed", `set_property_value semantic verification should pass: ${semantic.summary}`);
  assert(semantic.checks.some((check) => check.id.indexOf("set_property_value:value") >= 0 && check.status === "passed"), "set_property_value read-back check should pass.");
}

function assertSetLayerSwitchValuePasses() {
  const plan = {
    summary: "Set one explicit generated layer switch and inspect layer read-back.",
    risk: "medium",
    requiresCheckpoint: true,
    steps: [
      {
        title: "Enable collapse transformations",
        tool: "set_property_value",
        args: {
          compName: "Layer Switch Fixture",
          layerIndex: 1,
          propertyPath: "collapseTransformation",
          value: true,
          setAtTime: false
        }
      },
      {
        title: "Read layer switch",
        tool: "get_layer_details",
        args: {
          compName: "Layer Switch Fixture",
          layerIndex: 1,
          includeProperties: false
        }
      }
    ]
  };
  const run = {
    ok: true,
    dryRun: false,
    steps: [
      {
        index: 1,
        title: "Enable collapse transformations",
        tool: "set_property_value",
        args: clone(plan.steps[0].args),
        mutatesProject: true,
        status: "completed",
        result: {
          comp: { name: "Layer Switch Fixture" },
          layer: { ...layerInfo("Layer Switch Shape", { index: 1 }), collapseTransformation: true },
          property: {
            name: "collapseTransformation",
            matchName: "collapseTransformation",
            propertyPath: [{ name: "collapseTransformation", matchName: "collapseTransformation" }],
            value: true
          },
          properties: [{
            name: "collapseTransformation",
            matchName: "collapseTransformation",
            propertyPath: [{ name: "collapseTransformation", matchName: "collapseTransformation" }],
            value: true
          }]
        }
      },
      {
        index: 2,
        title: "Read layer switch",
        tool: "get_layer_details",
        args: clone(plan.steps[1].args),
        mutatesProject: false,
        status: "completed",
        result: {
          comp: { name: "Layer Switch Fixture" },
          layer: { ...layerInfo("Layer Switch Shape", { index: 1 }), collapseTransformation: true }
        }
      }
    ]
  };
  const semantic = buildSemanticVerification(plan, run);
  assert.strictEqual(semantic.status, "passed", `layer switch semantic verification should pass: ${semantic.summary}`);
  assert(semantic.checks.some((check) => check.id.indexOf("set_property_value:value") >= 0 && check.status === "passed"), "layer switch read-back check should pass.");
}

function assertRemainingTailContractToolsPass() {
  const scenarios = agentRemainingTailContractsScenarioPlans("Semantic Remaining");
  for (const scenario of scenarios) {
    const run = fakeRunForPlan(scenario.plan);
    const semantic = buildSemanticVerification(scenario.plan, run);
    assert.strictEqual(semantic.status, "passed", `${scenario.id} semantic verification should pass: ${semantic.summary}`);
  }
  const combinedChecks = scenarios.flatMap((scenario) => buildSemanticVerification(scenario.plan, fakeRunForPlan(scenario.plan)).checks);
  assert(combinedChecks.some((check) => check.id.indexOf("create_camera_with_controller:parent") >= 0), "camera controller check should be reported.");
  assert(combinedChecks.some((check) => check.id.indexOf("toggle_onion_skinning:state") >= 0), "onion skinning check should be reported.");
  assert(combinedChecks.some((check) => check.id.indexOf("fill_in_keyframes:keyframes") >= 0), "fill-in keyframes check should be reported.");
  assert(combinedChecks.some((check) => check.id.indexOf("keyframe_current_value_from_expression:keyframe") >= 0), "expression keyframe check should be reported.");
  assert(combinedChecks.some((check) => check.id.indexOf("set_spatial_in_tangent:spatial-tangent") >= 0), "spatial tangent check should be reported.");
  assert(combinedChecks.some((check) => check.id.indexOf("separate_shape_size_dimensions:sliders-expression") >= 0), "separate size dimensions check should be reported.");
}

function assertUpdateLayerMarkerPasses() {
  const plan = {
    summary: "Update one explicit timeline marker and inspect marker read-back.",
    risk: "medium",
    requiresCheckpoint: true,
    steps: [
      {
        title: "Update layer marker",
        tool: "update_layer_marker",
        args: {
          compName: "Marker Fixture",
          layerIndex: 1,
          markerIndex: 1,
          targetComment: "Marker Fixture Beat",
          comment: "Marker Fixture Beat Updated",
          time: 1.5,
          duration: 0.75
        }
      },
      {
        title: "Read marker layer",
        tool: "get_layer_details",
        args: {
          compName: "Marker Fixture",
          layerIndex: 1
        }
      }
    ]
  };
  const run = fakeRunForPlan(plan);
  const semantic = buildSemanticVerification(plan, run);
  assert.strictEqual(semantic.status, "passed", `update layer marker semantic verification should pass: ${semantic.summary}`);
  assert(semantic.checks.some((check) => check.id.indexOf("update_layer_marker:marker") >= 0), "update layer marker check should be reported.");
}

function assertDeleteLayerMarkerPasses() {
  const plan = {
    summary: "Delete one explicit timeline marker and inspect marker read-back.",
    risk: "medium",
    requiresCheckpoint: true,
    steps: [
      {
        title: "Delete layer marker",
        tool: "delete_layer_marker",
        args: {
          compName: "Marker Fixture",
          layerIndex: 1,
          markerIndex: 1,
          targetTime: 1.25,
          targetComment: "Marker Fixture Beat"
        }
      },
      {
        title: "Read marker layer",
        tool: "get_layer_details",
        args: {
          compName: "Marker Fixture",
          layerIndex: 1
        }
      }
    ]
  };
  const run = fakeRunForPlan(plan);
  const semantic = buildSemanticVerification(plan, run);
  assert.strictEqual(semantic.status, "passed", `delete layer marker semantic verification should pass: ${semantic.summary}`);
  assert(semantic.checks.some((check) => check.id.indexOf("delete_layer_marker:marker") >= 0), "delete layer marker check should be reported.");
}

function assertMarkerLifecycleSequencePasses() {
  const plan = {
    summary: "Add, update, delete one explicit timeline marker and inspect each lifecycle state.",
    risk: "medium",
    requiresCheckpoint: true,
    steps: [
      {
        title: "Add layer marker",
        tool: "add_layer_marker",
        args: {
          compName: "Marker Fixture",
          layerIndex: 1,
          time: 1.25,
          comment: "Marker Fixture Initial",
          duration: 0.25
        }
      },
      {
        title: "Read marker after add",
        tool: "get_layer_details",
        args: { compName: "Marker Fixture", layerIndex: 1 }
      },
      {
        title: "Update layer marker",
        tool: "update_layer_marker",
        args: {
          compName: "Marker Fixture",
          layerIndex: 1,
          markerIndex: 1,
          targetComment: "Marker Fixture Initial",
          comment: "Marker Fixture Updated",
          time: 1.5,
          duration: 0.5
        }
      },
      {
        title: "Read marker after update",
        tool: "get_layer_details",
        args: { compName: "Marker Fixture", layerIndex: 1 }
      },
      {
        title: "Delete layer marker",
        tool: "delete_layer_marker",
        args: {
          compName: "Marker Fixture",
          layerIndex: 1,
          markerIndex: 1,
          targetComment: "Marker Fixture Updated"
        }
      },
      {
        title: "Read marker after delete",
        tool: "get_layer_details",
        args: { compName: "Marker Fixture", layerIndex: 1 }
      }
    ]
  };
  const run = fakeRunForPlan(plan);
  const semantic = buildSemanticVerification(plan, run);
  assert.strictEqual(semantic.status, "passed", `marker lifecycle semantic verification should pass: ${semantic.summary}`);
  assert(semantic.checks.some((check) => check.id.indexOf("add_layer_marker:marker") >= 0 && check.status === "passed" && check.evidence.indexOf("Read marker after add") >= 0), "add marker should use the intermediate add read-back.");
  assert(semantic.checks.some((check) => check.id.indexOf("update_layer_marker:marker") >= 0 && check.status === "passed" && check.evidence.indexOf("Read marker after update") >= 0), "update marker should use the intermediate update read-back.");
  assert(semantic.checks.some((check) => check.id.indexOf("delete_layer_marker:marker") >= 0 && check.status === "passed"), "delete marker should still pass on final absent read-back.");
}

function main() {
  const scenarios = agentScenarioPlans("Codex Semantic Fixture", 0);
  const results = scenarios.map(assertScenarioPasses);
  const layoutScenario = scenarios.find((scenario) => scenario.id === "text-shape-layout-animation");
  const timingScenario = scenarios.find((scenario) => scenario.id === "timeline-layer-timing");
  assertMismatchNeedsReview(layoutScenario);
  assertMissingReadBackNeedsReview(timingScenario);
  assertDeepDuplicatePasses();
  assertCameraLayerPasses();
  assertCameraPointOfInterestUsesReadBackEvidence();
  assertLayerMaskPasses();
  assertDuplicateLayerPasses();
  assertDuplicateLayersPasses();
  assertDuplicateLayersJsonStringReadBackPasses();
  assertDuplicateLayersMissingReadBackNeedsReview();
  assertDuplicateLayersPairOrderMismatchNeedsReview();
  assertLayerSelectionPasses();
  assertDeleteLayerPasses();
  assertDeleteLayerMissingReadBackNeedsReview();
  assertSetCompPropertiesPasses();
  assertSetCompPropertiesReadBackMismatchNeedsReview();
  assertSetLayerMaskCreateUpdatePasses();
  assertSetLayerMaskMissingReadBackNeedsReview();
  assertDakkshinFixtureMutationScopedReadBackPasses();
  assertDakkshinLiveAeEvidenceShapePasses();
  assertSetPropertyValuePasses();
  assertSetLayerSwitchValuePasses();
  assertRemainingTailContractToolsPass();
  assertAddLayerMarkerPasses();
  assertUpdateLayerMarkerPasses();
  assertDeleteLayerMarkerPasses();
  assertMarkerLifecycleSequencePasses();

  console.log(JSON.stringify({
    ok: true,
    schema: SEMANTIC_VERIFICATION_SCHEMA,
    scenarios: results
  }, null, 2));
}

main();
