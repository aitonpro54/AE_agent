"use strict";

const assert = require("assert");
const path = require("node:path");
const fs = require("node:fs");

const {
  buildSemanticVerification,
  SEMANTIC_VERIFICATION_SCHEMA
} = require("../mcp-server/semantic-verification");
const {
  buildServerSemanticVerification
} = require("../mcp-server/bridge-daemon");
const {
  AGENT_SCENARIO_MUTATING_TOOLS,
  agentEffectEnabledScenarioPlans,
  agentDakkshinTypedToolsScenarioPlans,
  agentLayerBlendingModeScenarioPlans,
  agentLayerEnabledHardSoloScenarioPlans,
  agentGridRigControlReplacementScenarioPlans,
  agentLayerMetadataScenarioPlans,
  agentLayerParentBelowScenarioPlans,
  agentLayerParentClosestScenarioPlans,
  agentLayerNameResetScenarioPlans,
  agentParentOpacityExpressionScenarioPlans,
  agentLayerSelectionScenarioPlans,
  agentLayerTrackMatteScenarioPlans,
  agentPreserveNestedFrameRateScenarioPlans,
  agentProjectTimecodeStartFramesScenarioPlans,
  agentProjectItemMetadataScenarioPlans,
  agentRemainingTailContractsScenarioPlans,
  agentScenarioPlans,
  agentExportTextToFileScenarioPlans,
  agentTextShapesScenarioPlans,
  agentTextToKeysScenarioPlans
} = require("./agent-scenario-fixtures");

const LOCAL_MUTATING_TOOLS = new Set([
  "create_adjustment_layer",
  "delete_layer",
  "set_comp_properties",
  "refresh_comp_panel",
  "set_layer_metadata",
  "set_layer_blending_mode",
  "set_layer_parent",
  "set_layer_track_matte",
  "set_project_item_metadata",
  "set_project_frames_count_type",
  "set_layer_mask",
  "set_path_geometry",
  "create_layer_connection_line",
  "create_shapes_from_text",
  "export_path_points",
  "export_text_to_file",
  "save_comp_frame_png",
  "set_puppet_pin_type",
  "set_effect_enabled",
  "add_property_to_essential_graphics",
  "set_comp_current_time",
  "add_comp_marker"
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
  const result = {
    index: overrides.index || 1,
    id: overrides.id || null,
    name: name || "Layer",
    matchName: overrides.matchName || "ADBE AV Layer",
    textLayer: overrides.textLayer === undefined ? Boolean(overrides.text || overrides.justification) : overrides.textLayer,
    shapeLayer: overrides.shapeLayer === undefined ? overrides.matchName === "ADBE Vector Layer" : overrides.shapeLayer,
    layerKind: overrides.layerKind || (overrides.text || overrides.justification ? "text" : (overrides.shapeLayer || overrides.matchName === "ADBE Vector Layer" ? "shape" : null)),
    startTime,
    inPoint,
    outPoint,
    markerCount: overrides.markerCount || 0,
    comment: overrides.comment === undefined ? "" : overrides.comment,
    label: overrides.label === undefined ? 0 : overrides.label,
    locked: overrides.locked === undefined ? false : overrides.locked,
    blendingModeName: overrides.blendingModeName || "normal",
    hasTrackMatte: overrides.hasTrackMatte === undefined ? false : overrides.hasTrackMatte,
    isTrackMatte: overrides.isTrackMatte === undefined ? false : overrides.isTrackMatte,
    trackMatteTypeName: overrides.trackMatteTypeName || "none",
    trackMatteLayer: overrides.trackMatteLayer === undefined ? null : overrides.trackMatteLayer,
    nullLayer: overrides.nullLayer === undefined ? false : overrides.nullLayer,
    adjustmentLayer: overrides.adjustmentLayer === undefined ? false : overrides.adjustmentLayer,
    threeDLayer: overrides.threeDLayer === undefined ? false : overrides.threeDLayer,
    parent: overrides.parent === undefined ? null : overrides.parent,
    transform: overrides.transform || null,
    text: (overrides.text || overrides.justification) ? { text: overrides.text || "", fontSize: overrides.fontSize || null, justification: overrides.justification || null } : null,
    source: overrides.source || null
  };
  if (overrides.shapeContents) {
    result.shapeContents = overrides.shapeContents;
  }
  return result;
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
  if (step.tool === "create_test_comp" || step.tool === "create_comp") {
    state.lastCompName = args.name;
    const itemIndex = state.nextItemIndex++;
    state.projectItems.push({ itemIndex, name: args.name, type: "comp" });
    state.compProperties = {...state.compProperties, itemIndex, width: args.width || 1920, height: args.height || 1080,
      pixelAspect: args.pixelAspect || 1, duration: args.duration || 5, frameRate: args.frameRate || 30, bgColor: args.bgColor || [0, 0, 0]};
    state.compPropertiesByName[args.name] = state.compProperties;
    const result = withVerification({
      itemIndex,
      name: args.name,
      width: args.width,
      height: args.height,
      duration: args.duration,
      frameRate: args.frameRate,
      numLayers: 0
    }, args.name);
    result.verification.comp = {...state.compProperties, name: args.name};
    return result;
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
  if (step.tool === "create_null_layer") {
    const layer = insertLayerAtTop(state, layerInfo(args.name, {
      index: 1,
      nullLayer: true,
      startTime: args.startTime || 0,
      inPoint: args.startTime || 0,
      outPoint: (args.startTime || 0) + (args.duration || 1)
    }));
    return withVerification({
      comp: { name: compName },
      layer
    }, compName, layer);
  }
  if (step.tool === "create_text_layer") {
    const layer = insertLayerAtTop(state, layerInfo(args.name, {
      index: 1,
      matchName: "ADBE Text Layer",
      textLayer: true,
      layerKind: "text",
      startTime: args.startTime || 0,
      inPoint: args.startTime || 0,
      outPoint: (args.startTime || 0) + (args.duration || 1),
      text: args.text,
      fontSize: args.fontSize,
      justification: args.justification
    }));
    return withVerification({ comp: { name: compName }, layer, text: args.text }, compName, layer);
  }
  if (step.tool === "create_shapes_from_text") {
    const sourceLayer = state.layers.find((layer) => Number(layer.index) === Number(args.layerIndex || 1)) ||
      layerInfo(args.expectedLayerName || "Text Source", {
        index: args.layerIndex || 1,
        matchName: "ADBE Text Layer",
        textLayer: true,
        layerKind: "text",
        text: args.expectedSourceText || "AE"
      });
    const beforeCount = state.layers.length;
    const shapeLayer = insertLayerAtTop(state, layerInfo(args.shapeLayerName || `${sourceLayer.name} Outlines`, {
      index: 1,
      matchName: "ADBE Vector Layer",
      shapeLayer: true,
      layerKind: "shape",
      locked: args.lockCreatedShapeLayer === true
    }));
    return withVerification({
      comp: { name: compName, numLayers: state.layers.length },
      menuCommand: { name: "Create Shapes from Text", id: 3781 },
      sourceLayerBefore: {
        index: args.layerIndex || sourceLayer.index,
        id: sourceLayer.id || null,
        name: args.expectedLayerName || sourceLayer.name,
        text: args.expectedSourceText || sourceLayer.text && sourceLayer.text.text || ""
      },
      sourceLayerAfter: { ...sourceLayer, index: sourceLayer.index + 1 },
      shapeLayer,
      outline: { vectorGroupCount: 2 },
      layerCountBefore: beforeCount,
      layerCountAfter: state.layers.length,
      createdLayerCount: 1,
      postVerification: {
        ok: true,
        createdShapeLayer: true,
        outlineGroupCount: 2,
        layerCountDelta: 1,
        sourceTextMatched: true,
        sourceNameMatched: true
      }
    }, compName, shapeLayer);
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
  if (step.tool === "add_effect") {
    const effect = {
      propertyIndex: state.effects.length + 1,
      name: args.name || args.effect || "Effect",
      matchName: args.effect || "ADBE Effect",
      enabled: true,
      layerIndex: args.layerIndex || 1
    };
    state.effects.push(effect);
    return withVerification({
      comp: { name: compName },
      layer: layerInfo(`Layer ${args.layerIndex || 1}`, { index: args.layerIndex || 1 }),
      effect,
      properties: []
    }, compName);
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
    for (const field of ["width", "height", "pixelAspect", "duration", "frameRate", "bgColor", "displayStartTime", "displayStartFrame", "preserveNestedFrameRate"]) {
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
  if (step.tool === "set_project_frames_count_type") {
    const framesCountType = args.framesCountType || "FC_START_0";
    const framesCountStartFrame = framesCountType === "FC_START_1" || framesCountType === "startAtOne" ? 1 : 0;
    const before = { ...state.projectInfo };
    state.projectInfo = {
      ...state.projectInfo,
      framesCountType: framesCountStartFrame === 0 ? "FC_START_0" : "FC_START_1",
      framesCountStartFrame
    };
    const after = { ...state.projectInfo };
    return withVerification({
      project: after,
      before,
      after,
      updates: {
        framesCountType: after.framesCountType,
        framesCountStartFrame
      },
      updatedFields: ["framesCountType"],
      postVerification: {
        ok: true,
        framesCountTypeMatches: true,
        projectItemCountUnchanged: true,
        activeItemUnchanged: true
      }
    }, compName);
  }
  if (step.tool === "refresh_comp_panel") {
    const before = { ...state.compProperties, name: compName, itemIndex: 1, numLayers: state.layers.length };
    const transient = { ...before, motionBlur: !before.motionBlur };
    const after = { ...before };
    state.compProperties = { ...after };
    return withVerification({
      comp: after,
      before,
      transient,
      after,
      refreshMethod: "comp.motionBlur-double-toggle",
      postVerification: {
        ok: true,
        compIdentityMatches: true,
        motionBlurRestored: true,
        transientToggled: true,
        layerCountUnchanged: true,
        workAreaUnchanged: true
      }
    }, compName);
  }
  if (step.tool === "set_layer_metadata") {
    const layerIndices = Array.isArray(args.layerIndices) ? args.layerIndices.map(Number) : [];
    const expectedLayerNames = Array.isArray(args.expectedLayerNames) ? args.expectedLayerNames.map(String) : [];
    const updates = {};
    for (const field of ["comment", "label", "locked", "enabled", "guideLayer"]) {
      if (Object.prototype.hasOwnProperty.call(args, field)) updates[field] = args[field];
    }
    if (!state.layers.length) {
      state.layers = layerIndices.map((layerIndex, index) => layerInfo(expectedLayerNames[index] || `Metadata Fixture Layer ${layerIndex}`, { index: layerIndex }));
    }
    const changed = layerIndices.map((layerIndex, index) => {
      let layer = state.layers.find((item) => Number(item.index) === layerIndex);
      if (!layer) {
        layer = layerInfo(expectedLayerNames[index] || `Metadata Fixture Layer ${layerIndex}`, { index: layerIndex });
        state.layers.push(layer);
        state.layers.sort((left, right) => left.index - right.index);
      }
      const before = { ...layer };
      Object.assign(layer, updates);
      const after = { ...layer };
      const fieldMatches = {};
      for (const field of Object.keys(updates)) fieldMatches[field] = true;
      return {
        layerIndex,
        expectedLayerName: expectedLayerNames[index] || null,
        before,
        after,
        fieldMatches
      };
    });
    return withVerification({
      comp: { name: compName, numLayers: state.layers.length },
      requestedLayerIndices: layerIndices,
      expectedLayerNames,
      updates,
      updatedFields: Object.keys(updates),
      changedCount: changed.length,
      layer: changed.length === 1 ? changed[0].after : null,
      layers: changed.map((item) => item.after),
      changed,
      postVerification: {
        ok: true,
        requestedCount: layerIndices.length,
        changedCount: changed.length,
        updatedFields: Object.keys(updates)
      }
    }, compName, changed[0] && changed[0].after);
  }
  if (step.tool === "set_layer_blending_mode") {
    const layerIndices = Array.isArray(args.layerIndices) ? args.layerIndices.map(Number) : [];
    const expectedLayerNames = Array.isArray(args.expectedLayerNames) ? args.expectedLayerNames.map(String) : [];
    const blendingModeName = String(args.blendingMode || "difference").toLowerCase();
    if (!state.layers.length) {
      state.layers = layerIndices.map((layerIndex, index) => layerInfo(expectedLayerNames[index] || `Blending Fixture Layer ${layerIndex}`, { index: layerIndex }));
    }
    const changed = layerIndices.map((layerIndex, index) => {
      let layer = state.layers.find((item) => Number(item.index) === layerIndex);
      if (!layer) {
        layer = layerInfo(expectedLayerNames[index] || `Blending Fixture Layer ${layerIndex}`, { index: layerIndex });
        state.layers.push(layer);
        state.layers.sort((left, right) => left.index - right.index);
      }
      const before = { ...layer };
      layer.blendingModeName = blendingModeName;
      const after = { ...layer };
      return {
        layerIndex,
        expectedLayerName: expectedLayerNames[index] || null,
        requestedBlendingMode: blendingModeName,
        before,
        after,
        fieldMatches: { blendingMode: true }
      };
    });
    return withVerification({
      comp: { name: compName, numLayers: state.layers.length },
      requestedLayerIndices: layerIndices,
      expectedLayerNames,
      requestedBlendingMode: blendingModeName,
      changedCount: changed.length,
      layer: changed.length === 1 ? changed[0].after : null,
      layers: changed.map((item) => item.after),
      changed,
      postVerification: {
        ok: true,
        requestedCount: layerIndices.length,
        changedCount: changed.length,
        requestedBlendingMode: blendingModeName
      }
    }, compName, changed[0] && changed[0].after);
  }
  if (step.tool === "set_layer_track_matte") {
    const layerIndex = Number(args.layerIndex || 1);
    const matteLayerIndex = Number(args.matteLayerIndex || 2);
    const expectedLayerName = String(args.expectedLayerName || `Track Matte Fixture Fill ${layerIndex}`);
    const expectedMatteLayerName = String(args.expectedMatteLayerName || `Track Matte Fixture Matte ${matteLayerIndex}`);
    const trackMatteTypeName = String(args.trackMatteType || "luma_inverted").toLowerCase();
    let layer = state.layers.find((item) => Number(item.index) === layerIndex);
    if (!layer) {
      layer = layerInfo(expectedLayerName, { index: layerIndex });
      state.layers.push(layer);
    }
    let matteLayer = state.layers.find((item) => Number(item.index) === matteLayerIndex);
    if (!matteLayer) {
      matteLayer = layerInfo(expectedMatteLayerName, { index: matteLayerIndex });
      state.layers.push(matteLayer);
    }
    state.layers.sort((left, right) => left.index - right.index);
    const before = { ...layer };
    const matteBefore = { ...matteLayer };
    matteLayer.isTrackMatte = true;
    layer.hasTrackMatte = true;
    layer.trackMatteTypeName = trackMatteTypeName;
    layer.trackMatteLayer = { ...matteLayer };
    const after = { ...layer, trackMatteLayer: { ...matteLayer } };
    const matteAfter = { ...matteLayer };
    return withVerification({
      comp: { name: compName, numLayers: state.layers.length },
      requestedLayerIndex: layerIndex,
      requestedMatteLayerIndex: matteLayerIndex,
      requestedTrackMatteType: trackMatteTypeName,
      expectedLayerName,
      expectedMatteLayerName,
      before,
      matteBefore,
      layer: after,
      matteLayer: matteAfter,
      postVerification: {
        ok: true,
        hasTrackMatteMatches: true,
        matteLayerMatches: true,
        trackMatteTypeMatches: true,
        matteRoleMatches: true,
        layerNameMatches: true,
        matteLayerNameMatches: true
      }
    }, compName, after);
  }
  if (step.tool === "set_project_item_metadata") {
    const expectedItemNames = Array.isArray(args.expectedItemNames) ? args.expectedItemNames.map(String) : [];
    let itemIndices = Array.isArray(args.itemIndices) ? args.itemIndices.map(Number).filter((value) => Number.isFinite(value) && value > 0) : [];
    if (!itemIndices.length && expectedItemNames.length) {
      itemIndices = expectedItemNames.map((expectedName) => {
        let item = state.projectItems.find((candidate) => candidate.name === expectedName);
        if (!item) {
          item = { itemIndex: state.nextItemIndex++, name: expectedName, type: "comp", label: 9 };
          state.projectItems.push(item);
        }
        return item.itemIndex;
      });
    }
    if (!itemIndices.length) {
      itemIndices = state.projectItems.map((item) => item.itemIndex);
    }
    const label = Number.isFinite(Number(args.label)) ? Number(args.label) : 0;
    const changed = itemIndices.map((itemIndex, index) => {
      let item = state.projectItems.find((candidate) => Number(candidate.itemIndex) === Number(itemIndex));
      if (!item) {
        item = {
          itemIndex,
          name: expectedItemNames[index] || `Project Item ${itemIndex}`,
          type: "comp",
          label: 9
        };
        state.projectItems.push(item);
      }
      const before = { ...item };
      item.label = label;
      const after = { ...item };
      return {
        itemIndex,
        expectedItemName: expectedItemNames[index] || null,
        before,
        after,
        fieldMatches: { label: true }
      };
    });
    return withVerification({
      requestedItemIndices: itemIndices,
      expectedItemNames,
      updates: { label },
      updatedFields: ["label"],
      changedCount: changed.length,
      item: changed.length === 1 ? changed[0].after : null,
      items: changed.map((item) => item.after),
      changed,
      postVerification: {
        ok: true,
        requestedCount: itemIndices.length,
        changedCount: changed.length,
        updatedFields: ["label"]
      }
    }, expectedItemNames[0] || compName);
  }
  if (step.tool === "set_puppet_pin_type") {
    const rawPinType = args.pinType === "advanced" ? 4 : args.pinType === "position" ? 1 : Number(args.pinType || 4);
    const pinType = rawPinType === 1 ? 1 : 4;
    const propertyPath = args.pinTypePropertyPath || [
      { matchName: "ADBE Effect Parade" },
      { matchName: "ADBE FreePin3", name: args.effectName || "Puppet" },
      { matchName: "ADBE FreePin3 PosPin Atom", name: args.expectedPinName || "Puppet Pin 1" },
      { matchName: "ADBE FreePin3 PosPin Type", name: "Type" }
    ];
    const layer = layerInfo("Puppet Pin Fixture Shape", { index: args.layerIndex || 1 });
    const effect = {
      name: args.effectName || "Puppet",
      matchName: "ADBE FreePin3",
      propertyPath: propertyPath.slice(0, 2)
    };
    const pinAtom = {
      name: args.expectedPinName || "Puppet Pin 1",
      matchName: "ADBE FreePin3 PosPin Atom",
      propertyPath: propertyPath.slice(0, propertyPath.length - 1)
    };
    const property = fakePropertyInfo(propertyPath, pinType);
    property.matchName = "ADBE FreePin3 PosPin Type";
    state.propertyValues.push(property);
    return withVerification({
      comp: { name: compName },
      layer,
      effect,
      pinAtom,
      property,
      pinTypeBefore: args.expectedCurrentPinType === undefined ? 1 : Number(args.expectedCurrentPinType),
      pinType,
      pinTypeAfter: pinType,
      allowedPinTypes: [1, 4],
      propertyPath
    }, compName, layer);
  }
  if (step.tool === "set_effect_enabled") {
    let effect = state.effects.find((candidate) => (
      (!args.effectName || candidate.name === args.effectName) &&
      (!args.effectMatchName || candidate.matchName === args.effectMatchName) &&
      (!args.effectIndex || Number(candidate.propertyIndex) === Number(args.effectIndex))
    ));
    if (!effect) {
      effect = {
        propertyIndex: args.effectIndex || state.effects.length + 1,
        name: args.effectName || "Effect",
        matchName: args.effectMatchName || "ADBE Effect",
        enabled: args.expectedCurrentEnabled === undefined ? true : Boolean(args.expectedCurrentEnabled),
        layerIndex: args.layerIndex || 1
      };
      state.effects.push(effect);
    }
    const before = { ...effect };
    effect.enabled = Boolean(args.enabled);
    const after = { ...effect };
    return withVerification({
      comp: { name: compName },
      layer: layerInfo(`Layer ${args.layerIndex || 1}`, { index: args.layerIndex || 1 }),
      effect: after,
      before: { effect: before },
      after: { effect: after },
      requestedEnabled: Boolean(args.enabled),
      expectedCurrentEnabled: args.expectedCurrentEnabled === undefined ? null : Boolean(args.expectedCurrentEnabled),
      postVerification: {
        ok: true,
        enabledMatches: true,
        expectedCurrentMatched: true
      }
    }, compName);
  }
  if (step.tool === "add_property_to_essential_graphics") {
    const propertyPath = args.propertyPath || [
      { matchName: "ADBE Transform Group" },
      { matchName: "ADBE Opacity", name: "Opacity" }
    ];
    const controllerName = String(args.controllerName || "Essential Graphics Fixture Opacity");
    const layer = layerInfo(args.expectedLayerName || "Essential Graphics Fixture Layer", { index: args.layerIndex || 1 });
    const property = fakePropertyInfo(propertyPath, 100);
    if (args.expectedPropertyName) property.name = args.expectedPropertyName;
    if (args.expectedPropertyMatchName) property.matchName = args.expectedPropertyMatchName;
    state.propertyValues.push(property);
    const beforeControllers = {
      count: state.essentialGraphicsControllers.length,
      controllers: state.essentialGraphicsControllers.slice()
    };
    const controller = {
      index: beforeControllers.count + 1,
      name: controllerName,
      propertyName: property.name,
      propertyMatchName: property.matchName
    };
    state.essentialGraphicsControllers.push(controller);
    const afterControllers = {
      count: state.essentialGraphicsControllers.length,
      controllers: state.essentialGraphicsControllers.slice()
    };
    return withVerification({
      comp: { name: compName, numLayers: state.layers.length || 1 },
      layer,
      property,
      controllerName,
      added: true,
      beforeControllers,
      afterControllers,
      controller,
      postVerification: {
        ok: true,
        controllerCountBefore: beforeControllers.count,
        controllerCountAfter: afterControllers.count,
        controllerCountIncremented: true,
        controllerNamePresent: true,
        canAddBefore: true
      }
    }, compName, layer);
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
  if (step.tool === "add_comp_marker") {
    const marker = {
      keyIndex: state.compMarkers.length + 1,
      time: args.time,
      comment: args.comment,
      duration: args.duration || 0
    };
    const beforeCount = state.compMarkers.length;
    state.compMarkers.push(marker);
    return withVerification({
      comp: { name: compName, duration: state.compProperties.duration, frameRate: state.compProperties.frameRate },
      marker,
      markersBefore: {
        count: beforeCount,
        returned: beforeCount,
        truncated: false,
        orderedBy: "comp.markerProperty.keyTime",
        items: state.compMarkers.slice(0, beforeCount)
      },
      markers: {
        count: state.compMarkers.length,
        returned: state.compMarkers.length,
        truncated: false,
        orderedBy: "comp.markerProperty.keyTime",
        items: state.compMarkers.slice()
      },
      postVerification: {
        ok: true,
        markerCountBefore: beforeCount,
        markerCountAfter: state.compMarkers.length,
        expectedMarkerCountAfter: beforeCount + 1,
        markerCountIncremented: true,
        timeMatches: true,
        commentMatches: true,
        durationMatches: true
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
    const before = {
      workAreaStart: state.compProperties.workAreaStart,
      workAreaDuration: state.compProperties.workAreaDuration
    };
    state.compProperties.workAreaStart = args.start;
    state.compProperties.workAreaDuration = args.duration;
    return withVerification({
      comp: { name: compName },
      before,
      after: {
        workAreaStart: state.compProperties.workAreaStart,
        workAreaDuration: state.compProperties.workAreaDuration
      },
      workAreaStart: args.start,
      workAreaDuration: args.duration
    }, compName);
  }
  if (step.tool === "set_comp_current_time") {
    const frameRate = args.frameRate || state.compProperties.frameRate;
    const targetTime = args.time === undefined ? Number(args.frame || 0) / frameRate : args.time;
    const before = {
      name: compName,
      time: state.compProperties.time,
      duration: state.compProperties.duration,
      frameRate: state.compProperties.frameRate,
      width: state.compProperties.width,
      height: state.compProperties.height,
      numLayers: state.layers.length,
      workAreaStart: 0,
      workAreaDuration: state.compProperties.duration
    };
    state.compProperties.time = targetTime;
    const after = { ...before, time: targetTime };
    return withVerification({
      comp: { name: compName, time: targetTime, duration: state.compProperties.duration, frameRate: state.compProperties.frameRate },
      requested: {
        time: targetTime,
        frame: args.frame === undefined ? null : args.frame,
        frameRate: args.frame === undefined ? null : frameRate,
        clampToDuration: args.clampToDuration === true
      },
      targetTime,
      clamped: false,
      before,
      after,
      postVerification: {
        ok: true,
        timeMatches: true,
        withinBounds: true,
        compIdentityMatches: true,
        structuralFieldsUnchanged: true
      }
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
    const layer = layerInfo("Updated Text", { index: args.layerIndex, text: args.text, fontSize: args.fontSize, justification: args.justification });
    return withVerification({ comp: { name: compName }, layer, text: { text: args.text, fontSize: args.fontSize, justification: args.justification } }, compName, layer);
  }
  if (step.tool === "create_shape_layer") {
    const shapeType = args.shape || "rectangle";
    const shapeSummary = shapeType === "polygon" || shapeType === "star"
      ? {
        type: shapeType,
        starType: args.starType || shapeType,
        points: args.points === undefined ? 5 : args.points,
        outerRadius: args.outerRadius === undefined ? 100 : args.outerRadius,
        innerRadius: shapeType === "star" ? (args.innerRadius === undefined ? 50 : args.innerRadius) : null,
        fillColor: args.fillColor,
        strokeColor: args.strokeColor,
        strokeWidth: args.strokeWidth
      }
      : { type: shapeType, size: args.size, fillColor: args.fillColor, strokeColor: args.strokeColor, strokeWidth: args.strokeWidth };
    const layer = insertLayerAtTop(state, layerInfo(args.name, {
      index: 1,
      matchName: "ADBE Vector Layer",
      shapeLayer: true,
      shapeContents: [shapeSummary]
    }));
    return withVerification({
      comp: { name: compName },
      layer,
      shape: shapeSummary
    }, compName, layer);
  }
  if (step.tool === "create_layer_connection_line") {
    const expression = [
      `var fromLayer = thisComp.layer(${JSON.stringify(args.expectedFromLayerName || "From Layer")});`,
      `var toLayer = thisComp.layer(${JSON.stringify(args.expectedToLayerName || "To Layer")});`,
      "var fromPoint = thisLayer.fromComp(fromLayer.toComp(fromLayer.transform.anchorPoint));",
      "var toPoint = thisLayer.fromComp(toLayer.toComp(toLayer.transform.anchorPoint));",
      "createPath([[fromPoint[0], fromPoint[1]], [toPoint[0], toPoint[1]]], [[0, 0], [0, 0]], [[0, 0], [0, 0]], false);"
    ].join("\n");
    const layer = insertLayerAtTop(state, layerInfo(args.name || "Codex Connection Line", {
      index: 1,
      locked: args.lockLayer === false ? false : true
    }));
    const pathGeometry = {
      name: "Path",
      matchName: "ADBE Vector Shape",
      propertyPath: [
        { matchName: "ADBE Root Vectors Group" },
        { matchName: "ADBE Vector Group", name: args.pathGroupName || "Connector" },
        { matchName: "ADBE Vectors Group" },
        { matchName: "ADBE Vector Shape - Group", name: "Connector Path" },
        { matchName: "ADBE Vector Shape" }
      ],
      canSetExpression: true,
      expressionEnabled: true,
      expressionError: "",
      expression,
      geometry: {
        kind: "Shape",
        closed: false,
        vertexCount: 2,
        vertices: [[180, 180], [460, 180]],
        inTangents: [[0, 0], [0, 0]],
        outTangents: [[0, 0], [0, 0]],
        truncated: false
      }
    };
    return withVerification({
      comp: { name: compName },
      connector: layer,
      layer,
      targets: {
        from: layerInfo(args.expectedFromLayerName || "From Layer", { index: args.fromLayerIndex || 2 }),
        to: layerInfo(args.expectedToLayerName || "To Layer", { index: args.toLayerIndex || 1 })
      },
      path: pathGeometry,
      pathGeometry,
      stroke: {
        color: args.strokeColor || [1, 1, 1],
        width: args.strokeWidth || 4
      },
      expression,
      expressionEnabled: true,
      expressionError: "",
      postVerification: {
        ok: true,
        pathOpen: true,
        vertexCount: 2,
        expressionEnabled: true,
        expressionMatches: true,
        expressionError: "",
        locked: args.lockLayer === false ? false : true,
        lockRequested: args.lockLayer === false ? false : true,
        connectorLayerIsTop: true,
        fromLayerNameMatches: true,
        toLayerNameMatches: true
      }
    }, compName, layer);
  }
  if (step.tool === "create_adjustment_layer") {
    const beforeLayerIndex = args.insertBeforeLayerIndex || null;
    let beforeLayer = beforeLayerIndex ? state.layers[beforeLayerIndex - 1] : null;
    if (beforeLayerIndex && !beforeLayer) {
      beforeLayer = layerInfo(args.expectedBeforeLayerName || `Layer ${beforeLayerIndex}`, { index: beforeLayerIndex });
      state.layers[beforeLayerIndex - 1] = beforeLayer;
      reindexLayers(state.layers);
    }
    const layer = layerInfo(args.name || "Codex Adjustment", {
      index: 1,
      adjustmentLayer: true,
      startTime: args.startTime === undefined ? 0 : args.startTime,
      outPoint: args.duration || 1
    });
    if (beforeLayer) {
      state.layers.splice(Math.max(0, beforeLayer.index - 1), 0, layer);
      reindexLayers(state.layers);
      beforeLayer = state.layers.find((item) => item.name === beforeLayer.name) || null;
    } else {
      insertLayerAtTop(state, layer);
    }
    const created = state.layers.find((item) => item.name === layer.name) || state.layers[0];
    return withVerification({
      comp: { name: compName },
      layer: created,
      placement: {
        insertBeforeLayerIndex: beforeLayerIndex,
        expectedBeforeLayerName: args.expectedBeforeLayerName || "",
        beforeLayerBeforeMove: beforeLayer ? { ...beforeLayer, index: beforeLayerIndex } : null,
        beforeLayerAfterMove: beforeLayer,
        immediatelyBefore: beforeLayer ? created.index + 1 === beforeLayer.index : null
      },
      solid: {
        color: args.color || [1, 1, 1],
        width: args.width || 640,
        height: args.height || 360,
        pixelAspect: args.pixelAspect || 1
      }
    }, compName, created);
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
    const property = {
      matchName: args.propertyPath,
      propertyPath: propertyPathSegments(args.propertyPath).map((segment) => ({ name: segment, matchName: segment })),
      numKeys: (args.keyframes || []).length,
      keyframes
    };
    const key = JSON.stringify(property.propertyPath);
    state.propertyValues = state.propertyValues.filter((item) => JSON.stringify(item.propertyPath) !== key);
    state.propertyValues.push(property);
    return withVerification({
      comp: { name: compName },
      layer: layerInfo(`Layer ${args.layerIndex}`, { index: args.layerIndex }),
      keyframeCount: (args.keyframes || []).length,
      property
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
  if (step.tool === "set_layer_parent") {
    const childIndex = Number(args.layerIndex);
    const parentIndex = Number(args.parentLayerIndex);
    const child = state.layers.find((item) => Number(item.index) === childIndex) ||
      layerInfo(args.expectedLayerName || `Layer ${childIndex}`, { index: childIndex });
    const parent = state.layers.find((item) => Number(item.index) === parentIndex) ||
      layerInfo(args.expectedParentName || `Layer ${parentIndex}`, { index: parentIndex });
    const updatedChild = {
      ...child,
      name: args.expectedLayerName || child.name,
      parent: {
        index: parent.index,
        id: parent.id || null,
        name: args.expectedParentName || parent.name
      }
    };
    state.layers = state.layers.map((item) => (
      Number(item.index) === childIndex ? updatedChild : item
    ));
    if (!state.layers.some((item) => Number(item.index) === childIndex)) state.layers.push(updatedChild);
    return withVerification({
      comp: { name: compName },
      layer: updatedChild,
      parent: { ...parent, name: args.expectedParentName || parent.name },
      beforeParent: child.parent || null,
      requestedLayerIndex: childIndex,
      requestedParentLayerIndex: parentIndex,
      expectedLayerName: args.expectedLayerName || null,
      expectedParentName: args.expectedParentName || null,
      postVerification: {
        ok: true,
        parentMatches: true,
        childNameMatches: !args.expectedLayerName || updatedChild.name === args.expectedLayerName,
        parentNameMatches: !args.expectedParentName || updatedChild.parent.name === args.expectedParentName
      }
    }, compName, updatedChild);
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
  if (step.tool === "get_project_info") {
    return {
      ...state.projectInfo,
      numItems: state.projectItems.length,
      activeItemName: state.lastCompName || null,
      activeItemType: state.lastCompName ? "Composition" : null
    };
  }
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
    const layerIndex = step.args && step.args.layerIndex || 1;
    const layer = state.layers.find((item) => Number(item.index) === Number(layerIndex)) ||
      layerInfo("Marker Fixture Layer", {
        index: layerIndex,
        markerCount: state.layerMarkers.length
      });
    return {
      comp: { name: step.args && step.args.compName || state.lastCompName || "Fixture Comp" },
      layer,
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
      effects: state.effects.filter((effect) => Number(effect.layerIndex || 1) === Number(layerIndex)),
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
  if (step.tool === "get_effect_details") {
    const effect = state.effects.find((candidate) => (
      (!step.args || !step.args.effectName || candidate.name === step.args.effectName) &&
      (!step.args || !step.args.effectMatchName || candidate.matchName === step.args.effectMatchName) &&
      (!step.args || !step.args.effectIndex || Number(candidate.propertyIndex) === Number(step.args.effectIndex))
    )) || {
      propertyIndex: step.args && step.args.effectIndex || 1,
      name: step.args && step.args.effectName || "Puppet",
      matchName: step.args && step.args.effectMatchName || "ADBE FreePin3",
      enabled: true,
      layerIndex: step.args && step.args.layerIndex || 1
    };
    return {
      comp: {
        name: step.args && step.args.compName || state.lastCompName || "Fixture Comp"
      },
      layer: layerInfo("Effect Fixture Layer", { index: step.args && step.args.layerIndex || 1 }),
      effect,
      propertiesReturned: state.propertyValues.length,
      propertiesTruncated: false,
      properties: state.propertyValues.slice()
    };
  }
  if (step.tool === "get_layer_essential_properties") {
    const layerIndex = step.args && step.args.layerIndex || 1;
    const layer = state.layers.find((item) => Number(item.index) === Number(layerIndex)) ||
      layerInfo("Essential Graphics Fixture Layer", { index: layerIndex });
    const properties = state.propertyValues.slice();
    return {
      comp: {
        name: step.args && step.args.compName || state.lastCompName || "Fixture Comp",
        numLayers: state.layers.length || 1
      },
      layer,
      essentialProperties: {
        available: true,
        count: properties.length,
        returned: properties.length,
        truncated: false,
        properties
      }
    };
  }
  if (step.tool === "get_essential_graphics_controllers") {
    const controllers = state.essentialGraphicsControllers.slice();
    return {
      comp: {
        name: step.args && step.args.compName || state.lastCompName || "Fixture Comp",
        numLayers: state.layers.length || 1
      },
      motionGraphicsTemplateName: step.args && step.args.compName || state.lastCompName || "Fixture Comp",
      controllerCount: controllers.length,
      controllers
    };
  }
  if (step.tool === "get_comp_details" || step.tool === "list_layers") {
    const layers = state.layers.slice();
    return {
      comp: {
        itemIndex: state.compProperties.itemIndex,
        name: step.args && step.args.compName || state.lastCompName || "Fixture Comp",
        numLayers: layers.length,
        width: state.compProperties.width,
        height: state.compProperties.height,
        pixelAspect: state.compProperties.pixelAspect,
        duration: state.compProperties.duration,
        frameRate: state.compProperties.frameRate,
        bgColor: state.compProperties.bgColor,
        displayStartTime: state.compProperties.displayStartTime,
        displayStartFrame: state.compProperties.displayStartFrame,
        preserveNestedFrameRate: state.compProperties.preserveNestedFrameRate,
        motionBlur: state.compProperties.motionBlur,
        time: state.compProperties.time,
        workAreaStart: state.compProperties.workAreaStart,
        workAreaDuration: state.compProperties.workAreaDuration
      },
      layerCount: layers.length,
      layers,
      markers: {
        count: state.compMarkers.length,
        returned: state.compMarkers.length,
        truncated: false,
        orderedBy: "comp.markerProperty.keyTime",
        items: state.compMarkers.slice()
      }
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
    compPropertiesByName: {},
    projectItems: [],
    layers: [],
    selectedLayers: [],
    propertyValues: [],
    effects: [],
    renderQueueItems: [],
    layerMarkers: [],
    compMarkers: [],
    masks: [],
    essentialGraphicsControllers: [],
    projectInfo: {
      file: null,
      bitsPerChannel: 8,
      numItems: 0,
      activeItemName: null,
      activeItemType: null,
      framesCountType: "FC_START_1",
      framesCountStartFrame: 1
    },
    compProperties: {
      width: 1280,
      height: 720,
      pixelAspect: 1,
      duration: 4,
      frameRate: 24,
      bgColor: [0, 0, 0],
      displayStartTime: 0,
      displayStartFrame: 1,
      preserveNestedFrameRate: false,
      motionBlur: false,
      time: 0,
      workAreaStart: 0,
      workAreaDuration: 4
    }
  };
  const steps = (plan.steps || []).map((step, index) => {
    const namedComp = step.args && step.args.compName;
    if (namedComp && state.compPropertiesByName[namedComp]) state.compProperties = state.compPropertiesByName[namedComp];
    const mutatesProject = AGENT_SCENARIO_MUTATING_TOOLS.has(step.tool) || LOCAL_MUTATING_TOOLS.has(step.tool);
    const result = mutatesProject ? fakeMutationResult(step, state) : fakeReadBackResult(step, state);
    if (namedComp && state.compPropertiesByName[namedComp]) state.compPropertiesByName[namedComp] = state.compProperties;
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
  const fits=run.steps.filter(step=>step.tool==="fit_layer_to_comp");
  if(fits.length){
    // Existing scenarios fit generated shape/text assets. The bounded video cover
    // checker cannot prove these modes from changedCount or predicted transforms.
    assert.strictEqual(semantic.status,"needs_review",`${scenario.id}: unsupported fit needs independent geometry review`);
    const failed=semantic.checks.filter(check=>check.status!=="passed");
    assert.strictEqual(failed.length,fits.length,`${scenario.id}: only unsupported fit checks may need review`);
    assert(failed.every(check=>check.id.includes(":fit_layer_to_comp:fit")),`${scenario.id}: unrelated checks must still pass`);
  }else{
    assert.strictEqual(semantic.status, "passed", `${scenario.id}: semantic verification should pass: ${semantic.summary}`);
    assert.strictEqual(semantic.failedChecks, 0, `${scenario.id}: expected no failed checks`);
  }
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

function assertLayerMetadataPasses() {
  const [scenario] = agentLayerMetadataScenarioPlans("Codex Semantic Fixture");
  const run = fakeRunForPlan(scenario.plan);
  const semantic = buildSemanticVerification(scenario.plan, run);
  assert.strictEqual(semantic.status, "passed", `set_layer_metadata semantic verification should pass: ${semantic.summary}`);
  assert(semantic.checks.some((check) => check.id.indexOf("set_layer_metadata:metadata") >= 0 && check.status === "passed"), "set_layer_metadata read-back check should pass.");
}

function assertLayerEnabledHardSoloPasses() {
  const [scenario] = agentLayerEnabledHardSoloScenarioPlans("Codex Semantic Fixture");
  const run = fakeRunForPlan(scenario.plan);
  const semantic = buildSemanticVerification(scenario.plan, run);
  assert.strictEqual(semantic.status, "passed", `layer enabled hard-solo semantic verification should pass: ${semantic.summary}`);
  const metadataChecks = semantic.checks.filter((check) => check.id.indexOf("set_layer_metadata:metadata") >= 0);
  assert(metadataChecks.length >= 2, "hard-solo fixture should verify selected and unselected layer enabled metadata.");
  assert(metadataChecks.every((check) => check.status === "passed"), "hard-solo layer enabled read-back checks should pass.");
}

function assertGridRigControlReplacementPasses() {
  const [scenario] = agentGridRigControlReplacementScenarioPlans("Codex Semantic Fixture");
  const run = fakeRunForPlan(scenario.plan);
  const semantic = buildSemanticVerification(scenario.plan, run);
  const failed = semantic.checks.filter((check) => check.status !== "passed");
  // This older fixture contains create_null_layer, which has no implemented
  // checker. Existing checked outcomes pass; that gap must not become success.
  assert.strictEqual(semantic.status, "needs_review");
  assert.deepStrictEqual(semantic.unverifiedMutationSteps, [{index: 2, tool: "create_null_layer"}]);
  assert.deepStrictEqual(failed, [], "existing grid-rig checks still pass");
  assert(semantic.checks.some((check) => check.id.indexOf("set_layer_metadata:metadata") >= 0 && check.status === "passed"), "grid-rig fixture should verify guideLayer/enabled metadata.");
  assert(semantic.checks.some((check) => check.id.indexOf("delete_layer:absence") >= 0 && check.status === "passed"), "grid-rig fixture should verify old layer deletion.");
  assert(semantic.checks.some((check) => check.id.indexOf("add_effect:effect") >= 0 && check.status === "passed"), "grid-rig fixture should verify added slider effects.");
}

function assertLayerBlendingModePasses() {
  const [scenario] = agentLayerBlendingModeScenarioPlans("Codex Semantic Fixture");
  const run = fakeRunForPlan(scenario.plan);
  const semantic = buildSemanticVerification(scenario.plan, run);
  assert.strictEqual(semantic.status, "passed", `layer blending mode semantic verification should pass: ${semantic.summary}`);
  assert(semantic.checks.some((check) => check.id.indexOf("set_layer_blending_mode:blending-mode") >= 0 && check.status === "passed"), "set_layer_blending_mode read-back check should pass.");
}

function layerParentPlan(includeReadBack = true) {
  const steps = [
    {
      title: "Set generated child parent",
      tool: "set_layer_parent",
      args: {
        compName: "Parent Fixture",
        layerIndex: 1,
        parentLayerIndex: 2,
        expectedLayerName: "Parent Fixture Child",
        expectedParentName: "Parent Fixture Parent"
      }
    }
  ];
  if (includeReadBack) {
    steps.push({
      title: "Read generated child parent",
      tool: "get_layer_details",
      args: { compName: "Parent Fixture", layerIndex: 1 }
    });
  }
  return {
    summary: "Parent one generated child layer to one generated parent and inspect it.",
    risk: "medium",
    requiresCheckpoint: true,
    steps
  };
}

function assertLayerParentPasses() {
  const plan = layerParentPlan(true);
  const run = fakeRunForPlan(plan);
  const semantic = buildSemanticVerification(plan, run);
  assert.strictEqual(semantic.status, "passed", `set_layer_parent semantic verification should pass: ${semantic.summary}`);
  assert(semantic.checks.some((check) => check.id.indexOf("set_layer_parent:parent") >= 0 && check.status === "passed"), "set_layer_parent read-back check should pass.");
}

function assertLayerParentMissingReadBackNeedsReview() {
  const plan = layerParentPlan(false);
  const run = fakeRunForPlan(plan);
  const semantic = buildSemanticVerification(plan, run);
  assert.strictEqual(semantic.status, "needs_review", "set_layer_parent must require post-run get_layer_details read-back.");
  assert(semantic.checks.some((check) => check.id.indexOf("set_layer_parent:parent") >= 0 && check.status === "failed"), "missing set_layer_parent read-back should fail.");
}

function assertLayerTrackMattePasses() {
  const [scenario] = agentLayerTrackMatteScenarioPlans("Codex Semantic Track Matte Fixture");
  const run = fakeRunForPlan(scenario.plan);
  const semantic = buildSemanticVerification(scenario.plan, run);
  assert.strictEqual(semantic.status, "passed", `set_layer_track_matte semantic verification should pass: ${semantic.summary}`);
  assert(semantic.checks.some((check) => check.id.indexOf("set_layer_track_matte:track-matte") >= 0 && check.status === "passed"), "set_layer_track_matte read-back check should pass.");
}

function assertLayerTrackMatteMissingReadBackNeedsReview() {
  const [scenario] = agentLayerTrackMatteScenarioPlans("Codex Semantic Track Matte Missing Readback");
  const plan = {
    ...scenario.plan,
    steps: scenario.plan.steps.filter((step) => !(step.tool === "get_layer_details" && /after update/i.test(step.title || "")))
  };
  const run = fakeRunForPlan(plan);
  const semantic = buildSemanticVerification(plan, run);
  assert.strictEqual(semantic.status, "needs_review", "set_layer_track_matte must require post-run get_layer_details read-back.");
  assert(semantic.checks.some((check) => check.id.indexOf("set_layer_track_matte:track-matte") >= 0 && check.status === "failed"), "missing set_layer_track_matte read-back should fail.");
}

function assertAdjustmentLayerPlacementPasses() {
  const plan = {
    summary: "Create generated adjustment layer immediately above a guarded generated layer.",
    risk: "medium",
    requiresCheckpoint: true,
    steps: [
      {
        title: "Create target fixture",
        tool: "create_shape_layer",
        args: {
          compName: "Adjustment Placement Fixture",
          name: "Adjustment Placement Target"
        }
      },
      {
        title: "Create foreground fixture",
        tool: "create_shape_layer",
        args: {
          compName: "Adjustment Placement Fixture",
          name: "Adjustment Placement Foreground"
        }
      },
      {
        title: "Create adjustment break before target",
        tool: "create_adjustment_layer",
        args: {
          compName: "Adjustment Placement Fixture",
          name: "Adjustment Placement Break",
          insertBeforeLayerIndex: 2,
          expectedBeforeLayerName: "Adjustment Placement Target",
          duration: 2
        }
      },
      {
        title: "Read adjustment break",
        tool: "get_layer_details",
        args: {
          compName: "Adjustment Placement Fixture",
          layerIndex: 2,
          includeProperties: false
        }
      },
      {
        title: "Read guarded target",
        tool: "get_layer_details",
        args: {
          compName: "Adjustment Placement Fixture",
          layerIndex: 3,
          includeProperties: false
        }
      }
    ]
  };
  const run = fakeRunForPlan(plan);
  const semantic = buildSemanticVerification(plan, run);
  const failed = semantic.checks.filter((check) => check.status !== "passed");
  assert.strictEqual(semantic.status, "passed", `create_adjustment_layer placement semantic verification should pass: ${semantic.summary}; failed=${JSON.stringify(failed)}`);
  assert(semantic.checks.some((check) => check.id.indexOf("create_adjustment_layer:adjustment-layer") >= 0 && check.status === "passed"), "adjustment layer flag check should pass.");
  assert(semantic.checks.some((check) => check.id.indexOf("create_adjustment_layer:placement") >= 0 && check.status === "passed"), "adjustment layer placement check should pass.");
}

function assertLayerConnectionLinePasses() {
  const plan = {
    summary: "Create a generated dynamic connector line between two explicit generated layers.",
    risk: "medium",
    requiresCheckpoint: true,
    steps: [
      {
        title: "Create connection source",
        tool: "create_shape_layer",
        args: {
          compName: "Connection Line Fixture",
          name: "Connection Line From",
          shape: "ellipse",
          position: [180, 180]
        }
      },
      {
        title: "Create connection target",
        tool: "create_shape_layer",
        args: {
          compName: "Connection Line Fixture",
          name: "Connection Line To",
          shape: "rectangle",
          position: [460, 180]
        }
      },
      {
        title: "Create generated connection line",
        tool: "create_layer_connection_line",
        args: {
          compName: "Connection Line Fixture",
          fromLayerIndex: 2,
          toLayerIndex: 1,
          expectedFromLayerName: "Connection Line From",
          expectedToLayerName: "Connection Line To",
          name: "Connection Line Connector",
          strokeColor: [0.2, 0.8, 1],
          strokeWidth: 5,
          duration: 3,
          lockLayer: true
        }
      },
      {
        title: "Read generated connection line",
        tool: "get_layer_details",
        args: {
          compName: "Connection Line Fixture",
          layerIndex: 1,
          includeProperties: true,
          includeExpressions: true
        }
      }
    ]
  };
  const run = fakeRunForPlan(plan);
  const semantic = buildSemanticVerification(plan, run);
  const failed = semantic.checks.filter((check) => check.status !== "passed");
  assert.strictEqual(semantic.status, "passed", `create_layer_connection_line semantic verification should pass: ${semantic.summary}; failed=${JSON.stringify(failed)}`);
  assert(semantic.checks.some((check) => check.id.indexOf("create_layer_connection_line:open-path") >= 0 && check.status === "passed"), "connection line open path check should pass.");
  assert(semantic.checks.some((check) => check.id.indexOf("create_layer_connection_line:expression") >= 0 && check.status === "passed"), "connection line expression check should pass.");
  assert(semantic.checks.some((check) => check.id.indexOf("create_layer_connection_line:locked") >= 0 && check.status === "passed"), "connection line lock check should pass.");
}

function assertTextShapesPasses() {
  const [scenario] = agentTextShapesScenarioPlans("Codex Semantic TTS Fixture");
  const run = fakeRunForPlan(scenario.plan);
  const semantic = buildSemanticVerification(scenario.plan, run);
  const failed = semantic.checks.filter((check) => check.status !== "passed");
  assert.strictEqual(semantic.status, "passed", `create_shapes_from_text semantic verification should pass: ${semantic.summary}; failed=${JSON.stringify(failed)}`);
  assert(semantic.checks.some((check) => check.id.indexOf("create_shapes_from_text:shape-layer") >= 0 && check.status === "passed"), "text-to-shape layer check should pass.");
  assert(semantic.checks.some((check) => check.id.indexOf("create_shapes_from_text:outline-groups") >= 0 && check.status === "passed"), "text-to-shape outline group check should pass.");
}

function assertProjectItemMetadataPasses() {
  const [scenario] = agentProjectItemMetadataScenarioPlans("Codex Semantic Fixture");
  const run = fakeRunForPlan(scenario.plan);
  const semantic = buildSemanticVerification(scenario.plan, run);
  assert.strictEqual(semantic.status, "passed", `set_project_item_metadata semantic verification should pass: ${semantic.summary}`);
  assert(semantic.checks.some((check) => check.id.indexOf("set_project_item_metadata:metadata") >= 0 && check.status === "passed"), "set_project_item_metadata read-back check should pass.");
}

function assertProjectItemMetadataMissingReadBackNeedsReview() {
  const [scenario] = agentProjectItemMetadataScenarioPlans("Codex Semantic Fixture Missing Readback");
  const plan = {
    ...scenario.plan,
    steps: scenario.plan.steps.filter((step) => step.tool !== "find_project_items" || /before/.test(step.title))
  };
  const run = fakeRunForPlan(plan);
  const semantic = buildSemanticVerification(plan, run);
  assert.strictEqual(semantic.status, "needs_review", "set_project_item_metadata must require post-run project-item read-back.");
  assert(semantic.checks.some((check) => check.id.indexOf("set_project_item_metadata:metadata") >= 0 && check.status === "failed"), "set_project_item_metadata missing read-back should fail.");
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
          bgColor: [0.1, 0.2, 0.3],
          preserveNestedFrameRate: true
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
  assert(semantic.checks.some((check) => check.id.indexOf("set_comp_properties:preserveNestedFrameRate") >= 0 && check.status === "passed"), "set_comp_properties preserveNestedFrameRate check should pass.");
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

function assertRefreshCompPanelPasses() {
  const plan = {
    summary: "Refresh one explicit generated composition panel and inspect restored motionBlur.",
    risk: "medium",
    requiresCheckpoint: true,
    steps: [
      {
        title: "Refresh generated comp panel",
        tool: "refresh_comp_panel",
        args: {
          compName: "Comp Refresh Fixture",
          expectedMotionBlur: false
        }
      },
      {
        title: "Read comp after refresh",
        tool: "get_comp_details",
        args: { compName: "Comp Refresh Fixture" }
      }
    ]
  };
  const run = fakeRunForPlan(plan);
  const semantic = buildSemanticVerification(plan, run);
  assert.strictEqual(semantic.status, "passed", `refresh_comp_panel semantic verification should pass: ${semantic.summary}`);
  assert(semantic.checks.some((check) => check.id.indexOf("refresh_comp_panel:motionBlur-restored") >= 0 && check.status === "passed"), "refresh_comp_panel restored motionBlur check should pass.");
}

function compWorkAreaPlan(includeReadBack = true) {
  const steps = [
    {
      title: "Set generated comp work area",
      tool: "set_comp_work_area",
      args: {
        compName: "Comp Work Area Fixture",
        start: 0.75,
        duration: 1.5
      }
    }
  ];
  if (includeReadBack) {
    steps.push({
      title: "Read generated comp work area",
      tool: "get_comp_details",
      args: { compName: "Comp Work Area Fixture", includeLayers: false }
    });
  }
  return {
    summary: "Set one generated composition work area and inspect it.",
    risk: "medium",
    requiresCheckpoint: true,
    steps
  };
}

function assertSetCompWorkAreaReadBackFallbackPasses() {
  const plan = compWorkAreaPlan(true);
  const run = fakeRunForPlan(plan);
  delete run.steps[0].result.workAreaStart;
  delete run.steps[0].result.workAreaDuration;
  delete run.steps[0].result.after;
  const semantic = buildSemanticVerification(plan, run);
  assert.strictEqual(semantic.status, "passed", `set_comp_work_area read-back fallback should pass: ${semantic.summary}`);
  assert(semantic.checks.some((check) => check.id.indexOf("set_comp_work_area:workAreaStart") >= 0 && check.status === "passed"), "workAreaStart read-back fallback should pass.");
  assert(semantic.checks.some((check) => check.id.indexOf("set_comp_work_area:workAreaDuration") >= 0 && check.status === "passed"), "workAreaDuration read-back fallback should pass.");
}

function assertSetCompWorkAreaMissingReadBackNeedsReview() {
  const plan = compWorkAreaPlan(false);
  const run = fakeRunForPlan(plan);
  delete run.steps[0].result.workAreaStart;
  delete run.steps[0].result.workAreaDuration;
  delete run.steps[0].result.after;
  const semantic = buildSemanticVerification(plan, run);
  assert.strictEqual(semantic.status, "needs_review", "set_comp_work_area must require post-run get_comp_details read-back.");
  assert(semantic.checks.some((check) => check.id.indexOf("set_comp_work_area:workAreaStart") >= 0 && check.status === "failed"), "missing workAreaStart read-back should fail.");
  assert(semantic.checks.some((check) => check.id.indexOf("set_comp_work_area:workAreaDuration") >= 0 && check.status === "failed"), "missing workAreaDuration read-back should fail.");
}

function compCurrentTimePlan(includeReadBack = true) {
  const steps = [
    {
      title: "Move generated comp CTI",
      tool: "set_comp_current_time",
      args: {
        compName: "Comp Current Time Fixture",
        time: 1.25,
        expectedCurrentTime: 0
      }
    }
  ];
  if (includeReadBack) {
    steps.push({
      title: "Read generated comp CTI",
      tool: "get_comp_details",
      args: { compName: "Comp Current Time Fixture", includeLayers: false }
    });
  }
  return {
    summary: "Set one generated composition current time and inspect it.",
    risk: "medium",
    requiresCheckpoint: true,
    steps
  };
}

function assertSetCompCurrentTimePasses() {
  const run = fakeRunForPlan(compCurrentTimePlan(true));
  const semantic = buildSemanticVerification(compCurrentTimePlan(true), run);
  assert.strictEqual(semantic.status, "passed", `set_comp_current_time semantic verification should pass: ${semantic.summary}`);
  assert(semantic.checks.some((check) => check.id.indexOf("set_comp_current_time:time") >= 0 && check.status === "passed"), "set_comp_current_time read-back check should pass.");
}

function assertSetCompCurrentTimeMissingReadBackNeedsReview() {
  const plan = compCurrentTimePlan(false);
  const run = fakeRunForPlan(plan);
  const semantic = buildSemanticVerification(plan, run);
  assert.strictEqual(semantic.status, "needs_review", "set_comp_current_time must require post-run get_comp_details read-back.");
  assert(semantic.checks.some((check) => check.id.indexOf("set_comp_current_time:time") >= 0 && check.status === "failed"), "set_comp_current_time missing read-back should fail.");
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

function shapePathFixtureGeometry() {
  return {
    closed: true,
    vertices: [[10, 10], [110, 10], [110, 90], [10, 90]],
    inTangents: [[0, 0], [-8, 0], [0, -8], [8, 0]],
    outTangents: [[8, 0], [0, 8], [-8, 0], [0, -8]]
  };
}

function shapePathFixturePropertyPath() {
  return [
    "ADBE Root Vectors Group",
    "ADBE Vector Group",
    "ADBE Vectors Group",
    "ADBE Vector Shape"
  ];
}

function pathGeometryProperty(geometry, propertyPath = shapePathFixturePropertyPath()) {
  return {
    name: "Path",
    matchName: "ADBE Vector Shape",
    propertyPath: propertyPath.map((segment) => ({ name: segment, matchName: segment })),
    geometry: { kind: "Shape", vertexCount: geometry.vertices.length, ...clone(geometry) },
    numKeys: 0,
    keyframes: []
  };
}

function assertSetPathGeometryPasses() {
  const geometry = shapePathFixtureGeometry();
  const propertyPath = shapePathFixturePropertyPath();
  const plan = {
    summary: "Set one generated shape path geometry and read it back.",
    risk: "medium",
    requiresCheckpoint: true,
    steps: [
      {
        title: "Set generated shape path",
        tool: "set_path_geometry",
        args: {
          compName: "Path Fixture",
          layerIndex: 1,
          targetKind: "shape",
          propertyPath,
          geometry
        }
      },
      {
        title: "Read generated shape path",
        tool: "get_path_geometry",
        args: {
          compName: "Path Fixture",
          layerIndex: 1,
          targetKind: "shape",
          propertyPath
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
        title: plan.steps[0].title,
        tool: "set_path_geometry",
        status: "completed",
        args: plan.steps[0].args,
        result: {
          comp: { name: "Path Fixture" },
          layer: layerInfo("Shape Path Layer"),
          targetKind: "shape",
          property: pathGeometryProperty(geometry, propertyPath),
          pathGeometry: pathGeometryProperty(geometry, propertyPath),
          postVerification: {
            ok: true,
            geometryMatches: true,
            keyframesMatch: true,
            requestedKeyframeCount: 0,
            afterKeyframeCount: 0
          },
          verification: { ok: true }
        }
      },
      {
        index: 2,
        title: plan.steps[1].title,
        tool: "get_path_geometry",
        status: "completed",
        args: plan.steps[1].args,
        result: {
          comp: { name: "Path Fixture" },
          layer: layerInfo("Shape Path Layer"),
          targetKind: "shape",
          property: pathGeometryProperty(geometry, propertyPath),
          pathGeometry: pathGeometryProperty(geometry, propertyPath)
        }
      }
    ]
  };
  const semantic = buildSemanticVerification(plan, run);
  assert.strictEqual(semantic.status, "passed", `set_path_geometry semantic verification should pass: ${semantic.summary}`);
  assert(semantic.checks.some((check) => check.id.indexOf("set_path_geometry:geometry") >= 0 && check.status === "passed"), "set_path_geometry read-back check should pass.");
}

function assertSetPathGeometryMissingReadBackNeedsReview() {
  const geometry = shapePathFixtureGeometry();
  const propertyPath = shapePathFixturePropertyPath();
  const plan = {
    summary: "Set one generated shape path geometry without read-back.",
    risk: "medium",
    requiresCheckpoint: true,
    steps: [
      {
        title: "Set generated shape path",
        tool: "set_path_geometry",
        args: {
          compName: "Path Fixture",
          layerIndex: 1,
          targetKind: "shape",
          propertyPath,
          geometry
        }
      }
    ]
  };
  const run = {
    dryRun: false,
    steps: [
      {
        index: 1,
        title: plan.steps[0].title,
        tool: "set_path_geometry",
        status: "completed",
        args: plan.steps[0].args,
        result: {
          comp: { name: "Path Fixture" },
          layer: layerInfo("Shape Path Layer"),
          targetKind: "shape",
          property: pathGeometryProperty(geometry, propertyPath),
          pathGeometry: pathGeometryProperty(geometry, propertyPath),
          postVerification: {
            ok: true,
            geometryMatches: true,
            keyframesMatch: true
          },
          verification: { ok: true }
        }
      }
    ]
  };
  const semantic = buildSemanticVerification(plan, run);
  assert.strictEqual(semantic.status, "needs_review", "set_path_geometry must fail closed without post-run read-back.");
  assert(semantic.checks.some((check) => check.id.indexOf("set_path_geometry:geometry") >= 0 && check.status === "failed"), "set_path_geometry missing read-back should fail.");
}

function assertExportPathPointsPasses() {
  const geometry = shapePathFixtureGeometry();
  const propertyPath = shapePathFixturePropertyPath();
  const vertices = [[10.123, 20.987], [30.555, 40.444], [50, 60]];
  const exportedPoints = [[30.55, 40.44], [50, 60], [10.12, 20.99]];
  const plan = {
    summary: "Export generated path points from get_path_geometry evidence.",
    risk: "medium",
    requiresCheckpoint: false,
    steps: [
      {
        title: "Read generated shape path",
        tool: "get_path_geometry",
        args: {
          compName: "Path Fixture",
          layerIndex: 1,
          targetKind: "shape",
          propertyPath
        }
      },
      {
        title: "Export generated path points",
        tool: "export_path_points",
        args: {
          vertices,
          outputFileName: "semantic-path-points.txt",
          decimalPlaces: 2,
          rotateFirstPointToEnd: true
        }
      },
      {
        title: "Read generated shape path after export",
        tool: "get_path_geometry",
        args: {
          compName: "Path Fixture",
          layerIndex: 1,
          targetKind: "shape",
          propertyPath
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
        title: plan.steps[0].title,
        tool: "get_path_geometry",
        status: "completed",
        args: plan.steps[0].args,
        result: {
          comp: { name: "Path Fixture" },
          layer: layerInfo("Shape Path Layer"),
          targetKind: "shape",
          property: pathGeometryProperty(geometry, propertyPath),
          pathGeometry: pathGeometryProperty(geometry, propertyPath)
        }
      },
      {
        index: 2,
        title: plan.steps[1].title,
        tool: "export_path_points",
        status: "completed",
        args: plan.steps[1].args,
        result: {
          outputFileName: "semantic-path-points.txt",
          outputPath: "logs/generated-exports/semantic-path-points.txt",
          pointCount: 3,
          points: exportedPoints,
          contentPreview: `var points = ${JSON.stringify(exportedPoints)};`,
          file: {
            outputFileName: "semantic-path-points.txt",
            outputPath: "logs/generated-exports/semantic-path-points.txt",
            byteLength: 49,
            sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            existsAfter: true
          },
          verification: { ok: true }
        }
      },
      {
        index: 3,
        title: plan.steps[2].title,
        tool: "get_path_geometry",
        status: "completed",
        args: plan.steps[2].args,
        result: {
          comp: { name: "Path Fixture" },
          layer: layerInfo("Shape Path Layer"),
          targetKind: "shape",
          property: pathGeometryProperty(geometry, propertyPath),
          pathGeometry: pathGeometryProperty(geometry, propertyPath)
        }
      }
    ]
  };
  const semantic = buildSemanticVerification(plan, run);
  assert.strictEqual(semantic.status, "passed", `export_path_points semantic verification should pass with post-export read-back: ${semantic.summary}`);
  assert(semantic.checks.some((check) => check.id.indexOf("export_path_points:file") >= 0 && check.status === "passed"), "export_path_points file read-back check should pass.");
  assert(semantic.checks.some((check) => check.id.indexOf("export_path_points:points") >= 0 && check.status === "passed"), "export_path_points point transform check should pass.");
}

function assertExportPathPointsMissingReadBackNeedsReview() {
  const vertices = [[10.123, 20.987], [30.555, 40.444], [50, 60]];
  const exportedPoints = [[30.55, 40.44], [50, 60], [10.12, 20.99]];
  const plan = {
    summary: "Export generated path points without post-export read-back.",
    risk: "medium",
    requiresCheckpoint: false,
    steps: [
      {
        title: "Export generated path points",
        tool: "export_path_points",
        args: {
          vertices,
          outputFileName: "semantic-path-points.txt"
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
        title: plan.steps[0].title,
        tool: "export_path_points",
        status: "completed",
        args: plan.steps[0].args,
        result: {
          outputFileName: "semantic-path-points.txt",
          outputPath: "logs/generated-exports/semantic-path-points.txt",
          pointCount: 3,
          points: exportedPoints,
          contentPreview: `var points = ${JSON.stringify(exportedPoints)};`,
          file: {
            outputFileName: "semantic-path-points.txt",
            outputPath: "logs/generated-exports/semantic-path-points.txt",
            byteLength: 49,
            sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            existsAfter: true
          },
          verification: { ok: true }
        }
      }
    ]
  };
  const semantic = buildSemanticVerification(plan, run);
  assert.strictEqual(semantic.status, "needs_review", "export_path_points must still require an explicit post-export read-back step.");
  assert(semantic.checks.some((check) => check.id.indexOf("export_path_points:file") >= 0 && check.status === "passed"), "export_path_points per-step file check should pass.");
}

function assertExportTextToFilePasses() {
  const [scenario] = agentExportTextToFileScenarioPlans("Codex Semantic Export Text Fixture");
  const expectedContent = scenario.expectedReadBack.expectedContent;
  const outputFileName = scenario.expectedReadBack.outputFileName;
  const run = fakeRunForPlan(scenario.plan);
  for (const step of run.steps) {
    if (step.tool === "get_layer_details" && step.args.layerIndex === 1) {
      step.result = {
        comp: { name: scenario.expectedReadBack.compName },
        layer: layerInfo(scenario.expectedReadBack.textName, { index: 1, textLayer: true, layerKind: "text" }),
        text: { kind: "TextDocument", text: scenario.expectedReadBack.sourceText }
      };
    }
    if (step.tool === "get_layer_details" && step.args.layerIndex === 2) {
      step.result = {
        comp: { name: scenario.expectedReadBack.compName },
        layer: layerInfo(scenario.expectedReadBack.solidName, { index: 2, textLayer: false })
      };
    }
    if (step.tool === "export_text_to_file") {
      step.result = {
        outputFileName,
        outputPath: `logs/generated-exports/${outputFileName}`,
        layerCount: 2,
        textLayerCount: 1,
        nonTextLayerCount: 1,
        exportedText: expectedContent,
        contentPreview: expectedContent,
        file: {
          outputFileName,
          outputPath: `logs/generated-exports/${outputFileName}`,
          byteLength: Buffer.byteLength(expectedContent, "utf8"),
          sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
          existsAfter: true
        }
      };
    }
  }
  const semantic = buildSemanticVerification(scenario.plan, run);
  assert.strictEqual(semantic.status, "passed", `export_text_to_file semantic verification should pass with post-export read-back: ${semantic.summary}`);
  assert(semantic.checks.some((check) => check.id.indexOf("export_text_to_file:file") >= 0 && check.status === "passed"), "export_text_to_file file read-back check should pass.");
  assert(semantic.checks.some((check) => check.id.indexOf("export_text_to_file:content") >= 0 && check.status === "passed"), "export_text_to_file content check should pass.");
}

function assertSaveCompFramePngPasses() {
  const plan = {
    summary: "Save one generated composition frame to a sandboxed PNG.",
    risk: "medium",
    requiresCheckpoint: true,
    steps: [
      {
        title: "Read generated comp before frame save",
        tool: "get_comp_details",
        args: { compName: "Frame Fixture", includeLayers: true }
      },
      {
        title: "Save generated comp frame as PNG",
        tool: "save_comp_frame_png",
        args: {
          compName: "Frame Fixture",
          expectedCompName: "Frame Fixture",
          time: 0.5,
          outputFileName: "semantic-frame.png",
          resolutionFactor: [1, 1]
        }
      },
      {
        title: "Read generated comp after frame save",
        tool: "get_comp_details",
        args: { compName: "Frame Fixture", includeLayers: true }
      }
    ]
  };
  const compResult = {
    itemIndex: 8,
    name: "Frame Fixture",
    width: 640,
    height: 360,
    duration: 3,
    frameRate: 24,
    numLayers: 1,
    layers: [layerInfo("Frame Shape")]
  };
  const run = {
    ok: true,
    dryRun: false,
    steps: [
      {
        index: 1,
        title: plan.steps[0].title,
        tool: "get_comp_details",
        status: "completed",
        args: plan.steps[0].args,
        result: compResult
      },
      {
        index: 2,
        title: plan.steps[1].title,
        tool: "save_comp_frame_png",
        status: "completed",
        args: plan.steps[1].args,
        result: {
          comp: { itemIndex: 8, name: "Frame Fixture", width: 640, height: 360, duration: 3, frameRate: 24, time: 0, numLayers: 1 },
          frame: { time: 0.5, frameNumber: 12 },
          resolutionFactor: { before: [1, 1], applied: [1, 1], after: [1, 1], restored: true },
          file: {
            outputFileName: "semantic-frame.png",
            outputPath: "logs/generated-exports/semantic-frame.png",
            byteLength: 256,
            sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            existsAfter: true,
            mimeType: "image/png"
          },
          verification: { ok: true }
        }
      },
      {
        index: 3,
        title: plan.steps[2].title,
        tool: "get_comp_details",
        status: "completed",
        args: plan.steps[2].args,
        result: compResult
      }
    ]
  };
  const semantic = buildSemanticVerification(plan, run);
  assert.strictEqual(semantic.status, "passed", `save_comp_frame_png semantic verification should pass with post-export comp read-back: ${semantic.summary}`);
  assert(semantic.checks.some((check) => check.id.indexOf("save_comp_frame_png:file") >= 0 && check.status === "passed"), "save_comp_frame_png file read-back check should pass.");
  assert(semantic.checks.some((check) => check.id.indexOf("save_comp_frame_png:resolution-factor") >= 0 && check.status === "passed"), "save_comp_frame_png resolution restoration check should pass.");
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

function assertPreserveNestedFrameRateFixturePasses() {
  const [scenario] = agentPreserveNestedFrameRateScenarioPlans("Semantic Preserve Fixture");
  const run = fakeRunForPlan(scenario.plan);
  const semantic = buildSemanticVerification(scenario.plan, run);
  const failedChecks = semantic.checks.filter((check) => check.status !== "passed");
  assert.strictEqual(semantic.status, "passed", `preserve nested frame rate fixture should pass: ${semantic.summary}; failed=${JSON.stringify(failedChecks)}`);
  const checks = semantic.checks.filter((check) => check.id.indexOf("set_comp_properties:preserveNestedFrameRate") >= 0 && check.status === "passed");
  assert.strictEqual(checks.length, 2, "preserve nested frame rate fixture should verify both generated comp property updates.");
}

function assertProjectTimecodeStartFramesFixturePasses() {
  const [scenario] = agentProjectTimecodeStartFramesScenarioPlans("Semantic Project Timecode Fixture");
  const run = fakeRunForPlan(scenario.plan);
  const setProjectFramesStep = run.steps.find((step) => step.tool === "set_project_frames_count_type");
  if (setProjectFramesStep && setProjectFramesStep.result && setProjectFramesStep.result.after) {
    const after = setProjectFramesStep.result.after;
    setProjectFramesStep.result.after = {
      value: after.framesCountTypeValue || "2612",
      name: after.framesCountType,
      startFrame: after.framesCountStartFrame,
      numItems: after.numItems,
      activeItemName: after.activeItemName,
      activeItemType: after.activeItemType
    };
  }
  const semantic = buildSemanticVerification(scenario.plan, run);
  const failedChecks = semantic.checks.filter((check) => check.status !== "passed");
  assert.strictEqual(semantic.status, "passed", `project timecode/start-frame fixture should pass: ${semantic.summary}; failed=${JSON.stringify(failedChecks)}`);
  assert(semantic.checks.some((check) => check.id.indexOf("set_project_frames_count_type:frames-count-type") >= 0 && check.status === "passed"), "project frame count type fixture should verify get_project_info read-back.");
  const checks = semantic.checks.filter((check) => check.id.indexOf("set_comp_properties:displayStartFrame") >= 0 && check.status === "passed");
  assert.strictEqual(checks.length, 2, "project timecode/start-frame fixture should verify both native displayStartFrame updates.");
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

function assertAddCompMarkerPasses() {
  const plan = {
    summary: "Add one explicit composition marker to a generated composition and inspect comp marker read-back.",
    risk: "medium",
    requiresCheckpoint: true,
    steps: [
      {
        title: "Add composition marker",
        tool: "add_comp_marker",
        args: {
          compName: "Comp Marker Fixture",
          time: 1.25,
          comment: "Comp Marker Fixture Start",
          duration: 0
        }
      },
      {
        title: "Read composition markers",
        tool: "get_comp_details",
        args: {
          compName: "Comp Marker Fixture",
          includeLayers: false,
          includeMarkers: true
        }
      }
    ]
  };
  const run = fakeRunForPlan(plan);
  const semantic = buildSemanticVerification(plan, run);
  assert.strictEqual(semantic.status, "passed", `add comp marker semantic verification should pass: ${semantic.summary}`);
  assert(semantic.checks.some((check) => check.id.indexOf("add_comp_marker:marker") >= 0 && check.status === "passed"), "add comp marker check should pass.");
}

function assertSequentialAddCompMarkersPassWithSharedReadBack() {
  const plan = {
    summary: "Add two generated composition markers and inspect both in one read-back.",
    risk: "medium",
    requiresCheckpoint: true,
    steps: [
      {
        title: "Add composition start marker",
        tool: "add_comp_marker",
        args: {
          compName: "Comp Marker Fixture",
          time: 0.75,
          comment: "Work Area Start",
          duration: 0
        }
      },
      {
        title: "Add composition end marker",
        tool: "add_comp_marker",
        args: {
          compName: "Comp Marker Fixture",
          time: 2.25,
          comment: "Work Area End",
          duration: 0
        }
      },
      {
        title: "Read composition markers",
        tool: "get_comp_details",
        args: {
          compName: "Comp Marker Fixture",
          includeLayers: false,
          includeMarkers: true
        }
      }
    ]
  };
  const run = fakeRunForPlan(plan);
  const semantic = buildSemanticVerification(plan, run);
  const markerChecks = semantic.checks.filter((check) => check.id.indexOf("add_comp_marker:marker") >= 0);
  assert.strictEqual(semantic.status, "passed", `sequential add comp markers should pass with shared read-back: ${semantic.summary}`);
  assert.strictEqual(markerChecks.length, 2, "two add comp marker checks should be reported.");
  assert(markerChecks.every((check) => check.status === "passed"), "both add comp marker checks should pass.");
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

function essentialGraphicsControllerPlan(includePostReadBack = true) {
  const compName = "Essential Graphics Fixture";
  const layerIndex = 1;
  const controllerName = "Source Opacity";
  const propertyPath = [
    { matchName: "ADBE Transform Group" },
    { matchName: "ADBE Opacity", name: "Opacity" }
  ];
  const steps = [
    {
      title: "Read generated Essential Graphics controllers before mutation",
      tool: "get_essential_graphics_controllers",
      args: { compName }
    },
    {
      title: "Add generated opacity to Essential Graphics",
      tool: "add_property_to_essential_graphics",
      args: {
        compName,
        layerIndex,
        expectedLayerName: "Essential Graphics Fixture Layer",
        propertyPath,
        expectedPropertyMatchName: "ADBE Opacity",
        controllerName,
        expectedControllerCountBefore: 0
      }
    }
  ];
  if (includePostReadBack) {
    steps.push({
      title: "Read generated Essential Graphics controllers after mutation",
      tool: "get_essential_graphics_controllers",
      args: { compName }
    });
  }
  return {
    summary: "Add one generated property to Essential Graphics and read controller evidence.",
    risk: "medium",
    requiresCheckpoint: true,
    steps
  };
}

function assertAddPropertyToEssentialGraphicsPasses() {
  const plan = essentialGraphicsControllerPlan(true);
  const run = fakeRunForPlan(plan);
  const semantic = buildSemanticVerification(plan, run);
  assert.strictEqual(semantic.status, "passed", `add_property_to_essential_graphics semantic verification should pass: ${semantic.summary}`);
  assert(semantic.checks.some((check) => check.id.indexOf("add_property_to_essential_graphics:controller") >= 0 && check.status === "passed"), "add_property_to_essential_graphics read-back check should pass.");
}

function assertAddPropertyToEssentialGraphicsMissingReadBackNeedsReview() {
  const plan = essentialGraphicsControllerPlan(false);
  const run = fakeRunForPlan(plan);
  const semantic = buildSemanticVerification(plan, run);
  assert.strictEqual(semantic.status, "needs_review", "add_property_to_essential_graphics must require post-run get_essential_graphics_controllers read-back.");
  assert(semantic.checks.some((check) => check.id.indexOf("add_property_to_essential_graphics:controller") >= 0 && check.status === "failed"), "add_property_to_essential_graphics missing post-read-back should fail.");
}

function puppetPinTypePlan(includeReadBack = true) {
  const propertyPath = [
    { matchName: "ADBE Effect Parade" },
    { matchName: "ADBE FreePin3", name: "Puppet" },
    { matchName: "ADBE FreePin3 PosPin Atom", name: "Puppet Pin 1" },
    { matchName: "ADBE FreePin3 PosPin Type", name: "Type" }
  ];
  const steps = [
    {
      title: "Set generated Puppet Pin 1 to Advanced",
      tool: "set_puppet_pin_type",
      args: {
        compName: "Puppet Pin Type Fixture",
        layerIndex: 1,
        effectName: "Puppet",
        pinTypePropertyPath: propertyPath,
        expectedPinName: "Puppet Pin 1",
        expectedCurrentPinType: 1,
        pinType: 4
      }
    }
  ];
  if (includeReadBack) {
    steps.push({
      title: "Read generated Puppet Pin 1 type after mutation",
      tool: "get_effect_details",
      args: {
        compName: "Puppet Pin Type Fixture",
        layerIndex: 1,
        effectName: "Puppet",
        includeProperties: true,
        includeValues: true,
        propertyDepth: 5,
        propertyLimit: 160
      }
    });
  }
  return {
    summary: "Puppet pin type semantic fixture",
    risk: "medium",
    requiresCheckpoint: true,
    steps
  };
}

function assertSetPuppetPinTypePasses() {
  const plan = puppetPinTypePlan(true);
  const run = fakeRunForPlan(plan);
  const semantic = buildSemanticVerification(plan, run);
  assert.strictEqual(semantic.status, "passed", `set_puppet_pin_type semantic verification should pass: ${semantic.summary}`);
  assert(semantic.checks.some((check) => check.id.indexOf("set_puppet_pin_type:pin-type") >= 0 && check.status === "passed"), "set_puppet_pin_type read-back check should pass.");
}

function assertSetPuppetPinTypeMissingReadBackNeedsReview() {
  const plan = puppetPinTypePlan(false);
  const run = fakeRunForPlan(plan);
  const semantic = buildSemanticVerification(plan, run);
  assert.strictEqual(semantic.status, "needs_review", "set_puppet_pin_type must require post-run get_effect_details read-back.");
  assert(semantic.checks.some((check) => check.id.indexOf("set_puppet_pin_type:pin-type") >= 0 && check.status === "failed"), "set_puppet_pin_type missing read-back should fail.");
}

function assertSetEffectEnabledScenarioPasses() {
  const [scenario] = agentEffectEnabledScenarioPlans("Codex Semantic Effect Enabled Fixture");
  const run = fakeRunForPlan(scenario.plan);
  const semantic = buildSemanticVerification(scenario.plan, run);
  const failedChecks = semantic.checks.filter((check) => check.status !== "passed");
  assert.strictEqual(semantic.status, "passed", `set_effect_enabled semantic verification should pass: ${semantic.summary}; failed=${JSON.stringify(failedChecks)}`);
  assert(semantic.checks.some((check) => check.id.indexOf("set_effect_enabled:effect-enabled") >= 0 && check.status === "passed"), "set_effect_enabled read-back check should pass.");
}

function assertSourceTextKeyframesPass() {
  const [scenario] = agentTextToKeysScenarioPlans("Codex Semantic TTK Fixture");
  const run = fakeRunForPlan(scenario.plan);
  const semantic = buildSemanticVerification(scenario.plan, run);
  assert.strictEqual(semantic.status, "passed", `Source Text keyframe semantic verification should pass: ${semantic.summary}`);
  assert(semantic.checks.some((check) => check.id.indexOf("set_property_keyframes:keyframe-values") >= 0 && check.status === "passed"), "Source Text keyframe value read-back should pass.");
}

function assertSourceTextKeyframeMismatchNeedsReview() {
  const [scenario] = agentTextToKeysScenarioPlans("Codex Semantic TTK Mismatch");
  const run = fakeRunForPlan(scenario.plan);
  const readBack = run.steps.find((step) => step.tool === "get_layer_details");
  const sourceTextProperty = readBack.result.propertyTree.find((property) => (
    JSON.stringify(property.propertyPath).indexOf("ADBE Text Document") >= 0
  ));
  assert(sourceTextProperty, "Source Text keyframe mismatch fixture needs read-back property.");
  sourceTextProperty.keyframes[1].value.text = "Wrong";
  const semantic = buildSemanticVerification(scenario.plan, run);
  assert.strictEqual(semantic.status, "needs_review", "Source Text keyframe read-back mismatch must fail closed.");
  assert(semantic.checks.some((check) => check.id.indexOf("set_property_keyframes:keyframe-values") >= 0 && check.status === "failed"), "mismatched Source Text keyframe values should fail.");
}

function assertCheckedFixtureWithNullGap(semantic, run) {
  const unchecked = run.steps.filter(step => step.tool === "create_null_layer").map(step => ({index: step.index, tool: step.tool}));
  assert.deepStrictEqual(semantic.unverifiedMutationSteps, unchecked);
  assert.equal(semantic.status, unchecked.length ? "needs_review" : "passed");
  assert.equal(semantic.failedChecks, 0);
  assert.equal(semantic.needsReviewChecks, 0);
}

function assertParentOpacityExpressionScenarioPasses() {
  const [scenario] = agentParentOpacityExpressionScenarioPlans("Codex Semantic Parent Fixture");
  const run = fakeRunForPlan(scenario.plan);
  const semantic = buildSemanticVerification(scenario.plan, run);
  assertCheckedFixtureWithNullGap(semantic, run);
  assert(semantic.checks.some((check) => check.id.indexOf("set_layer_parent:parent") >= 0 && check.status === "passed"), "parent-opacity scenario should verify set_layer_parent.");
  assert(semantic.checks.some((check) => check.id.indexOf("set_expression:expression") >= 0 && check.status === "passed"), "parent-opacity scenario should verify set_expression.");
}

function assertLayerParentBelowScenarioPasses() {
  const [scenario] = agentLayerParentBelowScenarioPlans("Codex Semantic Parent Below Fixture");
  const run = fakeRunForPlan(scenario.plan);
  const semantic = buildSemanticVerification(scenario.plan, run);
  const failedChecks = semantic.checks.filter((check) => check.status !== "passed");
  assertCheckedFixtureWithNullGap(semantic, run);
  assert.deepStrictEqual(failedChecks, []);
  const parentChecks = semantic.checks.filter((check) => check.id.indexOf("set_layer_parent:parent") >= 0 && check.status === "passed");
  assert(parentChecks.length >= 2, "layer-below parenting scenario should verify both set_layer_parent read-backs.");
}

function assertLayerParentClosestScenarioPasses() {
  const [scenario] = agentLayerParentClosestScenarioPlans("Codex Semantic Parent Closest Fixture");
  const run = fakeRunForPlan(scenario.plan);
  const semantic = buildSemanticVerification(scenario.plan, run);
  const failedChecks = semantic.checks.filter((check) => check.status !== "passed");
  assertCheckedFixtureWithNullGap(semantic, run);
  assert.deepStrictEqual(failedChecks, []);
  const parentChecks = semantic.checks.filter((check) => check.id.indexOf("set_layer_parent:parent") >= 0 && check.status === "passed");
  assert(parentChecks.length >= 2, "closest-layer parenting scenario should verify both set_layer_parent read-backs.");
}

function assertLayerNameResetScenarioPasses() {
  const [scenario] = agentLayerNameResetScenarioPlans("Codex Semantic Reset Names Fixture");
  const run = fakeRunForPlan(scenario.plan);
  const semantic = buildSemanticVerification(scenario.plan, run);
  const failedChecks = semantic.checks.filter((check) => check.status !== "passed");
  assert.strictEqual(semantic.status, "passed", `empty layer-name reset semantic verification should pass: ${semantic.summary}; failed=${JSON.stringify(failedChecks)}`);
  const renameChecks = semantic.checks.filter((check) => check.id.indexOf("rename_layers:rename") >= 0 && check.status === "passed");
  assert.strictEqual(renameChecks.length, 2, "empty layer-name reset scenario should verify both single-layer rename steps.");
}

function textJustificationPlan() {
  return {
    summary: "Create and update generated text paragraph justification.",
    risk: "medium",
    requiresCheckpoint: true,
    steps: [
      {
        title: "Create generated center-justified text",
        tool: "create_text_layer",
        args: {
          compName: "Text Justification Fixture",
          name: "Text Justification Layer",
          text: "Justified",
          fontSize: 42,
          justification: "center"
        }
      },
      {
        title: "Update generated text justification",
        tool: "update_text_layer",
        args: {
          compName: "Text Justification Fixture",
          layerIndex: 1,
          justification: "right"
        }
      },
      {
        title: "Read generated text justification",
        tool: "get_layer_details",
        args: {
          compName: "Text Justification Fixture",
          layerIndex: 1,
          includeProperties: false
        }
      }
    ]
  };
}

function assertTextJustificationPasses() {
  const plan = textJustificationPlan();
  const run = fakeRunForPlan(plan);
  const semantic = buildSemanticVerification(plan, run);
  const failedChecks = semantic.checks.filter((check) => check.status !== "passed");
  assert.strictEqual(semantic.status, "passed", `text justification semantic verification should pass: ${semantic.summary}; failed=${JSON.stringify(failedChecks)}`);
  assert(semantic.checks.some((check) => check.id.indexOf("create_text_layer:justification") >= 0 && check.status === "passed"), "create_text_layer justification check should pass.");
  assert(semantic.checks.some((check) => check.id.indexOf("update_text_layer:justification") >= 0 && check.status === "passed"), "update_text_layer justification check should pass.");

  const mismatchRun = fakeRunForPlan(plan);
  const updateStep = mismatchRun.steps.find((step) => step.tool === "update_text_layer");
  updateStep.result.layer.text.justification = "left";
  updateStep.result.text.justification = "left";
  const mismatch = buildSemanticVerification(plan, mismatchRun);
  assert.strictEqual(mismatch.status, "needs_review", "text justification mismatch should fail closed.");
  assert(mismatch.checks.some((check) => check.id.indexOf("update_text_layer:justification") >= 0 && check.status === "failed"), "mismatched update_text_layer justification should fail.");
}

function assertShapeLayerPolystarPasses() {
  const plan = {
    summary: "Create generated polygon and star shape layers with explicit bounded geometry.",
    risk: "medium",
    requiresCheckpoint: true,
    steps: [
      {
        title: "Create generated polygon",
        tool: "create_shape_layer",
        args: {
          compName: "Shape Polystar Fixture",
          name: "Shape Polystar Polygon",
          shape: "polygon",
          points: 6,
          outerRadius: 120,
          position: [240, 180],
          fillColor: [0.24, 0.58, 0.86],
          strokeColor: [1, 1, 1],
          strokeWidth: 2,
          duration: 3
        }
      },
      {
        title: "Read generated polygon",
        tool: "get_layer_details",
        args: {
          compName: "Shape Polystar Fixture",
          layerIndex: 1,
          includeProperties: false
        }
      },
      {
        title: "Create generated star",
        tool: "create_shape_layer",
        args: {
          compName: "Shape Polystar Fixture",
          name: "Shape Polystar Star",
          shape: "star",
          points: 5,
          outerRadius: 130,
          innerRadius: 55,
          position: [420, 180],
          fillColor: [0.92, 0.58, 0.18],
          strokeColor: [1, 1, 1],
          strokeWidth: 2,
          duration: 3
        }
      },
      {
        title: "Read generated star",
        tool: "get_layer_details",
        args: {
          compName: "Shape Polystar Fixture",
          layerIndex: 1,
          includeProperties: false
        }
      }
    ]
  };
  const run = fakeRunForPlan(plan);
  const semantic = buildSemanticVerification(plan, run);
  const failedChecks = semantic.checks.filter((check) => check.status !== "passed");
  assert.strictEqual(semantic.status, "passed", `polygon/star shape semantic verification should pass: ${semantic.summary}; failed=${JSON.stringify(failedChecks)}`);
  assert(semantic.checks.some((check) => check.id.indexOf("create_shape_layer:points") >= 0 && check.status === "passed"), "create_shape_layer points check should pass.");
  assert(semantic.checks.some((check) => check.id.indexOf("create_shape_layer:outerRadius") >= 0 && check.status === "passed"), "create_shape_layer outerRadius check should pass.");
  assert(semantic.checks.some((check) => check.id.indexOf("create_shape_layer:innerRadius") >= 0 && check.status === "passed"), "create_shape_layer innerRadius check should pass.");

  const mismatchRun = fakeRunForPlan(plan);
  const starStep = mismatchRun.steps.find((step) => step.tool === "create_shape_layer" && step.args.shape === "star");
  starStep.result.shape.outerRadius = 99;
  starStep.result.layer.shapeContents[0].outerRadius = 99;
  const mismatch = buildSemanticVerification(plan, mismatchRun);
  assert.strictEqual(mismatch.status, "needs_review", "polygon/star shape geometry mismatch should fail closed.");
  assert(mismatch.checks.some((check) => check.id.indexOf("create_shape_layer:outerRadius") >= 0 && check.status === "failed"), "mismatched outerRadius should fail.");
}

function assertListEffectsCountsAsReadBack() {
  const plan = {
    summary: "Add one exact effect and read the layer effects back.",
    steps: [
      {
        tool: "add_effect",
        args: {
          compName: "Effect Read Back Fixture",
          layerIndex: 1,
          effect: "ADBE Fill",
          name: "Duplicate Fill"
        }
      },
      {
        tool: "list_effects",
        args: {
          compName: "Effect Read Back Fixture",
          layerIndex: 1,
          includeProperties: true,
          includeValues: true
        }
      }
    ]
  };
  const effect = {
    propertyIndex: 1,
    name: "Duplicate Fill",
    matchName: "ADBE Fill",
    enabled: true
  };
  const run = {
    dryRun: false,
    ok: true,
    steps: [
      {
        index: 1,
        tool: "add_effect",
        status: "completed",
        mutatesProject: true,
        args: plan.steps[0].args,
        result: {
          effect,
          verification: { ok: true }
        }
      },
      {
        index: 2,
        tool: "list_effects",
        status: "completed",
        mutatesProject: false,
        args: plan.steps[1].args,
        result: {
          effectCount: 1,
          effects: [effect]
        }
      }
    ]
  };
  const semantic = buildSemanticVerification(plan, run);
  assert.strictEqual(semantic.status, "passed", `list_effects must satisfy the explicit post-mutation read-back gate: ${semantic.summary}`);
  assert.strictEqual(semantic.readBackCount, 1);
  assert.strictEqual(semantic.readBackSteps[0].tool, "list_effects");
}

function effectColorProperty(effectIndex, value) {
  return {
    propertyIndex: 3,
    name: "Color",
    matchName: "ADBE Fill-0002",
    propertyPath: [
      { propertyIndex: 3, name: "Animated", matchName: "ADBE AV Layer" },
      { propertyIndex: 1, name: "Effects", matchName: "ADBE Effect Parade" },
      { propertyIndex: effectIndex, name: "Duplicate Fill", matchName: "ADBE Fill" },
      { propertyIndex: 3, name: "Color", matchName: "ADBE Fill-0002" }
    ],
    value
  };
}

function assertSetEffectPropertyUsesExactCompositeIdentity() {
  const args = {
    compName: "Effect Property Fixture",
    layerIndex: 1,
    effectIndex: 2,
    effectName: "Duplicate Fill",
    effectMatchName: "ADBE Fill",
    propertyPath: [{ propertyIndex: 3, name: "Color", matchName: "ADBE Fill-0002" }],
    value: [0, 1, 0, 1]
  };
  const plan = {
    summary: "Set only the second same-name effect and read both instances back.",
    steps: [
      { tool: "set_effect_property", args },
      { tool: "get_effect_details", args: { compName: args.compName, layerIndex: 1, effectIndex: 1, effectName: args.effectName, effectMatchName: args.effectMatchName } },
      { tool: "get_effect_details", args: { compName: args.compName, layerIndex: 1, effectIndex: 2, effectName: args.effectName, effectMatchName: args.effectMatchName } }
    ]
  };
  const effect = (propertyIndex) => ({ propertyIndex, name: args.effectName, matchName: args.effectMatchName, enabled: true });
  // Actual set_effect_property/get_effect_details responses include both owning objects.
  const run = {
    dryRun: false,
    ok: true,
    steps: [
      {
        index: 1,
        tool: "set_effect_property",
        status: "completed",
        mutatesProject: true,
        args,
        result: { comp: { name: args.compName }, layer: { index: 1, name: "Effect Layer" },
          effect: effect(2), property: effectColorProperty(2, args.value) }
      },
      {
        index: 2,
        tool: "get_effect_details",
        status: "completed",
        mutatesProject: false,
        args: plan.steps[1].args,
        result: { comp: { name: args.compName }, layer: { index: 1, name: "Effect Layer" },
          effect: effect(1), properties: [effectColorProperty(1, [1, 0, 0, 1])] }
      },
      {
        index: 3,
        tool: "get_effect_details",
        status: "completed",
        mutatesProject: false,
        args: plan.steps[2].args,
        result: { comp: { name: args.compName }, layer: { index: 1, name: "Effect Layer" },
          effect: effect(2), properties: [effectColorProperty(2, args.value)] }
      }
    ]
  };
  const semantic = buildSemanticVerification(plan, run);
  assert.strictEqual(semantic.status, "passed", `set_effect_property exact composite identity should pass: ${semantic.summary}`);
  assert(semantic.checks.some((check) => check.id.indexOf("set_effect_property:value") >= 0 && check.status === "passed"), "exact effect property check should pass.");

  const wrongInstanceRun = clone(run);
  wrongInstanceRun.steps[2].result.properties = [effectColorProperty(1, args.value)];
  const wrongInstanceSemantic = buildSemanticVerification(plan, wrongInstanceRun);
  assert.strictEqual(wrongInstanceSemantic.status, "needs_review", "a neighboring same-name effect must not satisfy exact effect property read-back.");
  assert(wrongInstanceSemantic.checks.some((check) => check.id.indexOf("set_effect_property:value") >= 0 && check.status === "needs_review"), "wrong effect instance leaves the requested property unverified.");
}

function assertRecoveryIdentityAndTransformBoundaries() {
  let cases = 0;
  const path = [{propertyIndex: 1, name: "Opacity", matchName: "ADBE Opacity"}];
  const target = {compItemIndex: 1, layerIndex: 1, expectedCompItemId: 10, expectedLayerId: 11};
  const comp = {itemId: 10, itemIndex: 2, name: "Comp moved"}, layer = {id: 11, index: 2, name: "Layer moved"};
  function verify(run, expected, checkStatus) {
    const semantic = buildSemanticVerification({steps: run.steps}, run);
    assert.equal(semantic.status, expected);
    if (checkStatus) assert(semantic.checks.some(check => check.status === checkStatus));
    cases++; return semantic;
  }
  const transform = {position: [100, 200], scale: [120, 120], anchorPoint: [50, 50], rotation: 5, opacity: 70};
  const transformRun = {ok: true, steps: [
    {index: 1, tool: "set_layer_transform", status: "completed", args: {...target, ...transform}, result: {comp, layer, transform}},
    {index: 2, tool: "get_layer_details", status: "completed", args: {compItemId: 10, layerId: 11}, result: {comp: {...comp, itemIndex: 3}, layer: {...layer, index: 3}, transform: Object.fromEntries(Object.entries(transform).map(([key, value]) => [key, {kind: Array.isArray(value) ? "array" : "number", value}]))}}
  ]};
  const passedTransform = verify(transformRun, "passed"); assert.equal(passedTransform.checks.length, 5);
  const indexOnly = clone(transformRun);
  delete indexOnly.steps[0].args.expectedCompItemId; delete indexOnly.steps[0].args.expectedLayerId;
  indexOnly.steps[0].result.comp.itemIndex = 1; indexOnly.steps[0].result.layer.index = 1;
  verify(indexOnly, "passed"); // Native result IDs bind the later moved-index read.
  const conflictingTransformAlias = clone(transformRun); conflictingTransformAlias.steps[0].args.compItemId = 99;
  verify(conflictingTransformAlias, "needs_review", "needs_review");
  for (const field of Object.keys(transform)) {
    const changed = clone(transformRun); changed.steps[1].result.transform[field].value = Array.isArray(transform[field]) ? transform[field].map(n => n + 1) : transform[field] + 1;
    verify(changed, "needs_review", "failed");
  }
  const noField = clone(transformRun); delete noField.steps[1].result.transform.position; assert.equal(verify(noField, "needs_review", "needs_review").coverageStatus, "incomplete");
  const missingId = clone(transformRun); delete missingId.steps[1].result.comp.itemId; verify(missingId, "needs_review", "needs_review");
  const wrongTransformId = clone(transformRun); wrongTransformId.steps[1].result.layer.id = 99; verify(wrongTransformId, "needs_review", "needs_review");
  const nonfinite = clone(transformRun); nonfinite.steps[1].result.transform.rotation.value = Infinity; verify(nonfinite, "needs_review", "needs_review");
  const emptyVector = clone(transformRun); emptyVector.steps[1].result.transform.scale.value = []; verify(emptyVector, "needs_review", "needs_review");
  const duplicate = clone(transformRun); duplicate.steps.push({...clone(duplicate.steps[1]), index: 3}); verify(duplicate, "needs_review", "needs_review");
  const noRequested = clone(transformRun); noRequested.steps[0].args = target; verify(noRequested, "needs_review", "needs_review");
  const noRead = clone(transformRun); noRead.steps.length = 1; verify(noRead, "needs_review", "needs_review");
  const beforeRead = clone(transformRun); beforeRead.steps[0].index = 2; beforeRead.steps[1].index = 1; verify(beforeRead, "needs_review", "needs_review");
  const attached = clone(transformRun); attached.steps[0].independentReadBack = [{...attached.steps[1], source: "server_typed_readback", observedAt: "2026-10-01T00:00:00.000Z"}]; attached.steps.length = 1;
  verify(attached, "passed");
  const payloadSpoof = clone(transformRun); payloadSpoof.steps[0].result.verification = {ok: true, readBack: [payloadSpoof.steps[1]]}; payloadSpoof.steps.length = 1; verify(payloadSpoof, "needs_review", "needs_review");
  const badSource = clone(attached); badSource.steps[0].independentReadBack[0].source = "client"; verify(badSource, "needs_review", "needs_review");
  const failedAttached = clone(attached); failedAttached.steps[0].independentReadBack[0].status = "failed"; verify(failedAttached, "needs_review", "needs_review");

  const propertyRun = {ok: true, steps: [
    {index: 1, tool: "set_property_value", status: "completed", args: {...target, propertyPath: path, value: 40}, result: {comp, layer, property: {propertyPath: path, value: 40}}},
    {index: 2, tool: "get_property_value", status: "completed", args: {compItemId: 10, layerId: 11, propertyPath: path}, result: {comp: {...comp, itemIndex: 3}, layer: {...layer, index: 3}, property: {propertyPath: path, value: {kind: "number", value: 40}}}}
  ]};
  verify(propertyRun, "passed");
  const timedProperty = clone(propertyRun); timedProperty.steps[0].args.time = 2; timedProperty.steps[1].args.time = 2; verify(timedProperty, "passed");
  const wrongReadTime = clone(timedProperty); wrongReadTime.steps[1].args.time = 3; verify(wrongReadTime, "needs_review", "needs_review");
  for (const [position, field] of [[0, "comp"], [1, "comp"], [0, "layer"], [1, "layer"]]) {
    const wrong = clone(propertyRun); wrong.steps[position].result[field][field === "comp" ? "itemId" : "id"] = 99; verify(wrong, "needs_review", "needs_review");
  }
  const missingPropertyId = clone(propertyRun); delete missingPropertyId.steps[1].result.layer.id; verify(missingPropertyId, "needs_review", "needs_review");
  const wrongPath = clone(propertyRun); wrongPath.steps[1].result.property.propertyPath[0].propertyIndex = 2; verify(wrongPath, "needs_review", "needs_review");
  const wrongValue = clone(propertyRun); wrongValue.steps[1].result.property.value.value = 41; verify(wrongValue, "needs_review", "failed");
  const conflictingCompAliases = clone(propertyRun); conflictingCompAliases.steps[1].result.comp.id = 99; verify(conflictingCompAliases, "needs_review", "needs_review");
  const conflictingRequestComp = clone(propertyRun); conflictingRequestComp.steps[0].args.compItemId = 99; verify(conflictingRequestComp, "needs_review", "needs_review");
  const bulk = clone(propertyRun);
  bulk.steps[0].args.layerIndex = [1, 2]; delete bulk.steps[0].args.expectedLayerId; bulk.steps[0].args.expectedLayerIds = [11, 12];
  bulk.steps[0].result.layers = [layer, {...layer, id: 12, index: 3}]; delete bulk.steps[0].result.layer;
  bulk.steps[0].result.properties = [{propertyPath: path, value: 40}, {propertyPath: path, value: 40}]; delete bulk.steps[0].result.property;
  bulk.steps.push({...clone(bulk.steps[1]), index: 3, args: {compItemId: 10, layerId: 12, propertyPath: path}, result: {...clone(bulk.steps[1].result), layer: {...layer, id: 12, index: 4}}});
  verify(bulk, "passed");
  const duplicateBulk = clone(bulk); duplicateBulk.steps[0].result.layers[1].id = 11; verify(duplicateBulk, "needs_review", "needs_review");

  const effectPath = [{propertyIndex: 1, name: "Effects", matchName: "ADBE Effect Parade"}, {propertyIndex: 2, name: "Slider", matchName: "ADBE Slider Control"}, {propertyIndex: 1, name: "Slider", matchName: "ADBE Slider Control-0001"}];
  const effectArgs = {...target, effectIndex: 2, effectName: "Slider", effectMatchName: "ADBE Slider Control", propertyPath: [effectPath[2]], value: 40};
  const effectRun = {ok: true, steps: [
    {index: 1, tool: "set_effect_property", status: "completed", args: effectArgs, result: {comp, layer, effect: effectPath[1], property: {propertyPath: effectPath, value: 40}}},
    {index: 2, tool: "get_effect_details", status: "completed", args: {compItemId: 10, layerId: 11, effectIndex: 2}, result: {comp: {...comp, itemIndex: 3}, layer: {...layer, index: 3}, properties: [{propertyPath: effectPath, value: 40}]}}
  ]};
  verify(effectRun, "passed");
  for (const [position, field] of [[0, "comp"], [1, "comp"], [0, "layer"], [1, "layer"]]) {
    const wrong = clone(effectRun); wrong.steps[position].result[field][field === "comp" ? "itemId" : "id"] = 99; verify(wrong, "needs_review", "needs_review");
  }
  const wrongEffectProperty = clone(effectRun); wrongEffectProperty.steps[1].result.properties[0].propertyPath[1].propertyIndex = 1; verify(wrongEffectProperty, "needs_review", "needs_review");
  const wrongEffectValue = clone(effectRun); wrongEffectValue.steps[1].result.properties[0].value = 41; verify(wrongEffectValue, "needs_review", "failed");
  const unknown = {ok: true, steps: [{index: 1, tool: "unknown_setter", mutating: true, status: "completed", result: {ok: true}}, {index: 2, tool: "get_project_info", status: "completed", result: {file: "synthetic.aep"}}]};
  assert.equal(verify(unknown, "needs_review").unverifiedMutationCount, 1);
  return cases;
}

function assertAttachedAndExplicitCorroborationAndPngFileProof() {
  let cases = 0;
  function verify(run, expected, checkStatus) {
    const semantic = buildSemanticVerification({ steps: run.steps }, run);
    assert.equal(semantic.status, expected, `Expected ${expected} but got ${semantic.status}: ${JSON.stringify(semantic.checks)}`);
    if (checkStatus) assert(semantic.checks.some(check => check.status === checkStatus));
    cases++;
    return semantic;
  }

  const comp = { itemId: 10, itemIndex: 1, name: "MainComp" };
  const layer1 = { id: 11, index: 1, name: "TargetLayer" };
  const layer2 = { id: 12, index: 2, name: "TargetLayer" };
  const transform1 = { position: [100, 200, 0], scale: [100, 100, 100], anchorPoint: [50, 50, 0] };
  const transform2 = { position: [300, 400, 0], scale: [120, 120, 100], anchorPoint: [60, 60, 0] };

  // 1. Minimized 195: two same-name targets, exact different IDs
  const run195 = {
    ok: true,
    steps: [
      {
        index: 1,
        tool: "set_layer_transform",
        status: "completed",
        args: { compItemId: 10, layerId: 11, expectedLayerId: 11, ...transform1 },
        result: { comp, layer: layer1, transform: transform1 },
        independentReadBack: [
          {
            tool: "get_layer_details",
            status: "completed",
            source: "server_typed_readback",
            observedAt: "2026-10-01T00:00:00.000Z",
            args: { compItemId: 10, layerId: 11 },
            result: {
              comp,
              layer: layer1,
              transform: {
                position: { kind: "array", value: transform1.position },
                scale: { kind: "array", value: transform1.scale },
                anchorPoint: { kind: "array", value: transform1.anchorPoint }
              }
            }
          }
        ]
      },
      {
        index: 2,
        tool: "set_layer_transform",
        status: "completed",
        args: { compItemId: 10, layerId: 12, expectedLayerId: 12, ...transform2 },
        result: { comp, layer: layer2, transform: transform2 },
        independentReadBack: [
          {
            tool: "get_layer_details",
            status: "completed",
            source: "server_typed_readback",
            observedAt: "2026-10-01T00:00:01.000Z",
            args: { compItemId: 10, layerId: 12 },
            result: {
              comp,
              layer: layer2,
              transform: {
                position: { kind: "array", value: transform2.position },
                scale: { kind: "array", value: transform2.scale },
                anchorPoint: { kind: "array", value: transform2.anchorPoint }
              }
            }
          }
        ]
      },
      {
        index: 3,
        tool: "get_layer_details",
        status: "completed",
        args: { compItemId: 10, layerId: 12 },
        result: {
          comp,
          layer: layer2,
          transform: {
            position: { kind: "array", value: transform2.position },
            scale: { kind: "array", value: transform2.scale },
            anchorPoint: { kind: "array", value: transform2.anchorPoint }
          }
        }
      }
    ]
  };

  const sem195 = verify(run195, "passed");
  assert.equal(sem195.passedChecks, 6);
  assert.equal(sem195.failedChecks, 0);
  assert.equal(sem195.needsReviewChecks, 0);
  const checksStep1 = sem195.checks.filter(c => c.id.startsWith("1:"));
  assert.equal(checksStep1.length, 3);
  assert(checksStep1.every(c => c.binding.readBack.stepIndex === 1.5));
  const checksStep2 = sem195.checks.filter(c => c.id.startsWith("2:"));
  assert.equal(checksStep2.length, 3);
  assert(checksStep2.every(c => c.binding.readBack.stepIndex === 3 && c.binding.readBack.stepIndices[0] === 2.5 && c.binding.readBack.stepIndices[1] === 3));

  // 2. Minimized 226: 5 targets with attached + explicit
  const steps226 = [];
  for (let i = 1; i <= 5; i++) {
    const l = { id: 100 + i, index: i, name: `Layer_${i}` };
    const t = { position: [10 * i, 20 * i, 0], scale: [100, 100, 100], anchorPoint: [5 * i, 5 * i, 0] };
    const mutIdx = (i - 1) * 2 + 1;
    const expIdx = mutIdx + 1;
    steps226.push({
      index: mutIdx,
      tool: "set_layer_transform",
      status: "completed",
      args: { compItemId: 10, layerId: l.id, expectedLayerId: l.id, ...t },
      result: { comp, layer: l, transform: t },
      independentReadBack: [
        {
          tool: "get_layer_details",
          status: "completed",
          source: "server_typed_readback",
          observedAt: new Date(Date.now() + i * 1000).toISOString(),
          args: { compItemId: 10, layerId: l.id },
          result: {
            comp,
            layer: l,
            transform: {
              position: { kind: "array", value: t.position },
              scale: { kind: "array", value: t.scale },
              anchorPoint: { kind: "array", value: t.anchorPoint }
            }
          }
        }
      ]
    });
    steps226.push({
      index: expIdx,
      tool: "get_layer_details",
      status: "completed",
      args: { compItemId: 10, layerId: l.id },
      result: {
        comp,
        layer: l,
        transform: {
          position: { kind: "array", value: t.position },
          scale: { kind: "array", value: t.scale },
          anchorPoint: { kind: "array", value: t.anchorPoint }
        }
      }
    });
  }
  const run226 = { ok: true, steps: steps226 };
  const sem226 = verify(run226, "passed");
  assert.equal(sem226.passedChecks, 15);
  assert.equal(sem226.failedChecks, 0);
  assert.equal(sem226.needsReviewChecks, 0);

  // 3. Negatives: conflicting values between attached and explicit
  const conflict1 = clone(run195);
  conflict1.steps[2].result.transform.position.value[0] += 10;
  verify(conflict1, "needs_review", "needs_review");

  const conflict2 = clone(run195);
  conflict2.steps[1].independentReadBack[0].result.transform.position.value[0] += 10;
  verify(conflict2, "needs_review", "needs_review");

  const conflictScale = clone(run195);
  conflictScale.steps[2].result.transform.scale.value[0] += 5;
  verify(conflictScale, "needs_review", "needs_review");

  const bothMismatch = clone(run195);
  bothMismatch.steps[1].independentReadBack[0].result.transform.position.value[0] += 20;
  bothMismatch.steps[2].result.transform.position.value[0] += 20;
  bothMismatch.steps[1].result.transform.position[0] += 20;
  verify(bothMismatch, "needs_review", "failed");

  // 4. Negatives: missing field, non-finite, truncated, extra attached, spoofed
  const missingField = clone(run195);
  delete missingField.steps[2].result.transform.scale;
  verify(missingField, "needs_review", "needs_review");

  const nonfiniteAtt = clone(run195);
  nonfiniteAtt.steps[1].independentReadBack[0].result.transform.position.value[0] = NaN;
  verify(nonfiniteAtt, "needs_review", "needs_review");

  const truncatedExp = clone(run195);
  truncatedExp.steps[2].result.transform.position.truncated = true;
  verify(truncatedExp, "needs_review", "needs_review");

  const extraAttached = clone(run195);
  extraAttached.steps[1].independentReadBack.push(clone(extraAttached.steps[1].independentReadBack[0]));
  verify(extraAttached, "needs_review", "needs_review");

  const spoofedExplicit = clone(run195);
  delete spoofedExplicit.steps[1].independentReadBack;
  spoofedExplicit.steps[2].source = "server_typed_readback";
  spoofedExplicit.steps.push({ ...clone(spoofedExplicit.steps[2]), index: 4 });
  verify(spoofedExplicit, "needs_review", "needs_review");

  // Negative: bad attached + valid explicit (missing layer ID in attached)
  const badAttValidExp = clone(run195);
  delete badAttValidExp.steps[1].independentReadBack[0].result.layer.id;
  verify(badAttValidExp, "needs_review");

  // Negative: bad attached status / source + valid explicit
  const badSourceValidExp = clone(run195);
  badSourceValidExp.steps[1].independentReadBack[0].source = "client";
  verify(badSourceValidExp, "needs_review");

  // Negative: valid attached + bad targeted explicit (missing layer ID in explicit)
  const validAttBadExp = clone(run195);
  delete validAttBadExp.steps[2].result.layer.id;
  verify(validAttBadExp, "needs_review");
  for (const status of ["failed", "skipped", undefined]) {
    const badStatus = clone(run195); badStatus.steps[2].status = status; badStatus.steps[2].result = null;
    verify(badStatus, "needs_review");
  }
  for (const marker of [null, {}, false, "invalid", undefined]) {
    const badMarker = clone(run195); badMarker.steps[1].independentReadBack = marker;
    verify(badMarker, "needs_review");
  }
  for (const args of [{layerId: 12}, {compItemId: 10}, {}, {compItemId: 10, expectedCompItemId: 99, layerId: 12},
    {compItemId: 10, layerId: 12, expectedLayerId: 99}, {compItemId: 99, layerId: 12}]) {
    const malformedRequest = clone(run195); malformedRequest.steps[2].args = args;
    verify(malformedRequest, "needs_review");
  }
  const malformedMutationMarker = clone(run195);
  malformedMutationMarker.steps[1].independentReadBack.push({tool: "set_layer_transform", mutatesProject: true, status: "completed"});
  verify(malformedMutationMarker, "needs_review");
  const invalidTimestamp = clone(run195); invalidTimestamp.steps[1].independentReadBack[0].observedAt = "invalid";
  verify(invalidTimestamp, "needs_review");

  const laterMutation = clone(run195);
  const changedTarget = clone(laterMutation.steps[1]); changedTarget.index = 4;
  delete changedTarget.independentReadBack;
  changedTarget.args.position = [500, 600, 0]; changedTarget.result.transform.position = [500, 600, 0];
  laterMutation.steps.push(changedTarget, {...clone(laterMutation.steps[2]), index: 5});
  verify(laterMutation, "needs_review", "failed"); // An older snapshot cannot prove a later requested value.

  // Negative: extra malformed attached (2nd attached without layer ID)
  const extraMalformedAttached = clone(run195);
  extraMalformedAttached.steps[1].independentReadBack.push({
    tool: "get_layer_details",
    status: "completed",
    source: "server_typed_readback",
    observedAt: "2026-10-01T00:00:02.000Z",
    args: { compItemId: 10 },
    result: {}
  });
  verify(extraMalformedAttached, "needs_review");

  // Positive: foreign explicit for layer 13 is ignored by layer 12 (passes as attached-only)
  const foreignExplicitRun = clone(run195);
  foreignExplicitRun.steps[2].args.layerId = 13;
  foreignExplicitRun.steps[2].result.layer.id = 13;
  verify(foreignExplicitRun, "passed");
  const sameNameForeignComp = clone(run195);
  sameNameForeignComp.steps.push({ ...clone(sameNameForeignComp.steps[2]), index: 4,
    args: {compItemId: 99, layerId: 111}, result: { comp: {...comp, itemId: 99}, layer: {id: 111, index: 2, name: layer2.name}, transform: clone(sameNameForeignComp.steps[2].result.transform) } });
  verify(sameNameForeignComp, "passed");

  // 5. Scoped 266 generated-only tests
  const defaultExportDir = path.resolve(process.cwd(), "logs", "generated-exports");
  function createPngStep(index, fileName, time, overrides = {}) {
    const defaultFile = {
      outputFileName: fileName,
      outputPath: path.join(defaultExportDir, fileName),
      byteLength: 123456,
      width: 1280,
      height: 720,
      sha256: "e92707c5746da3478c2e2229f22e8caaee6cbfcff323984e61a8ca2978335e6f",
      mimeType: "image/png",
      pngComplete: true,
      existsAfter: true,
      deletedAfterReadBack: false
    };
    const file = { ...defaultFile, ...(overrides.file || {}) };
    return {
      index,
      tool: "save_comp_frame_png",
      status: "completed",
      args: { compName: "Footage Comp", outputFileName: fileName, time },
      result: {
        comp: { name: "Footage Comp", itemId: 50 + index, itemIndex: 50 + index, duration: 10 },
        frame: { time },
        resolutionFactor: { before: [1, 1], applied: [1, 1], after: [1, 1], restored: true },
        file,
        verification: {
          ok: true,
          target: {
            tool: "save_comp_frame_png",
            outputFileName: fileName,
            outputPath: file.outputPath
          },
          file: {
            byteLength: file.byteLength,
            width: file.width,
            height: file.height,
            sha256: file.sha256,
            pngComplete: file.pngComplete,
            existsAfter: file.existsAfter,
            deletedAfterReadBack: file.deletedAfterReadBack
          },
          resolutionFactor: { before: [1, 1], applied: [1, 1], after: [1, 1], restored: true }
        },
        ...overrides.result
      }
    };
  }

  const validPngSteps = [];
  for (let i = 1; i <= 10; i++) {
    validPngSteps.push(createPngStep(i, `frame_${i}.png`, i * 0.5));
  }
  const validPngRun = { ok: true, steps: validPngSteps };
  const semPng = verify(validPngRun, "passed");
  assert.equal(semPng.passedChecks, 30);
  assert.equal(semPng.failedChecks, 0);
  assert.equal(semPng.needsReviewChecks, 0);
  assert.equal(semPng.readBackCount, 0);
  assert.equal(semPng.verificationScope, "generated_png_file_proof_only");
  assert.equal(semPng.acceptance, "not_established");

  // Historical 266 run without pngComplete: true flag -> MUST FAIL-CLOSED (needs_review)
  const historicalPngRun = clone(validPngRun);
  for (const step of historicalPngRun.steps) {
    delete step.result.file.pngComplete;
    delete step.result.verification.file.pngComplete;
  }
  const histSem = verify(historicalPngRun, "needs_review");
  assert.equal(histSem.passedChecks, 30);
  assert.equal(histSem.readBackCount, 0);

  const falseFlagPng = clone(validPngRun);
  falseFlagPng.steps[0].result.file.pngComplete = false;
  verify(falseFlagPng, "needs_review");

  const badHashPng = clone(validPngRun);
  badHashPng.steps[0].result.file.sha256 = "not-a-sha";
  verify(badHashPng, "needs_review", "failed");

  const zeroBytesPng = clone(validPngRun);
  zeroBytesPng.steps[0].result.file.byteLength = 0;
  verify(zeroBytesPng, "needs_review", "failed");

  const badMimePng = clone(validPngRun);
  badMimePng.steps[0].result.file.mimeType = "image/jpeg";
  verify(badMimePng, "needs_review", "failed");

  const notRestoredPng = clone(validPngRun);
  notRestoredPng.steps[0].result.resolutionFactor.restored = false;
  verify(notRestoredPng, "needs_review", "failed");

  const unequalResPng = clone(validPngRun);
  unequalResPng.steps[0].result.resolutionFactor.after = [2, 2];
  verify(unequalResPng, "needs_review");

  const notExistsPng = clone(validPngRun);
  notExistsPng.steps[0].result.file.existsAfter = false;
  verify(notExistsPng, "needs_review");

  const deletedPng = clone(validPngRun);
  deletedPng.steps[0].result.file.deletedAfterReadBack = true;
  verify(deletedPng, "needs_review");

  // Finding 1 Negatives: missing, null, string, missing vFile
  const missingVerif = clone(validPngRun);
  delete missingVerif.steps[0].result.verification;
  verify(missingVerif, "needs_review");

  const nullVerif = clone(validPngRun);
  nullVerif.steps[0].result.verification = null;
  verify(nullVerif, "needs_review");

  const stringVerif = clone(validPngRun);
  stringVerif.steps[0].result.verification = "bogus";
  verify(stringVerif, "needs_review");

  const missingVFile = clone(validPngRun);
  delete missingVFile.steps[0].result.verification.file;
  verify(missingVFile, "needs_review");

  // Finding 2 Negatives: foreign path, foreign vTarget, missing target, wrong tool
  const foreignPath = clone(validPngRun);
  foreignPath.steps[0].result.file.outputPath = "C:\\foreign\\frame_1.png";
  foreignPath.steps[0].result.verification.target.outputPath = "C:\\foreign\\frame_1.png";
  verify(foreignPath, "needs_review");

  const foreignVTarget = clone(validPngRun);
  foreignVTarget.steps[0].result.verification.target.outputPath = "C:\\foreign\\frame_1.png";
  verify(foreignVTarget, "needs_review");

  const missingVTarget = clone(validPngRun);
  delete missingVTarget.steps[0].result.verification.target;
  verify(missingVTarget, "needs_review");

  const wrongVTargetTool = clone(validPngRun);
  wrongVTargetTool.steps[0].result.verification.target.tool = "export_text_to_file";
  verify(wrongVTargetTool, "needs_review");

  // Finding 4 Negatives: comp index mismatch, no comp selector, no time, wrong applied res
  const wrongCompIndex = clone(validPngRun);
  wrongCompIndex.steps[0].args = { compItemIndex: 123, outputFileName: "frame_1.png", time: 0.5 };
  wrongCompIndex.steps[0].result.comp = { itemIndex: 97, name: "Footage Comp" };
  verify(wrongCompIndex, "needs_review");

  const noCompSelector = clone(validPngRun);
  noCompSelector.steps[0].args = { outputFileName: "frame_1.png", time: 0.5 };
  verify(noCompSelector, "needs_review");

  const noTime = clone(validPngRun);
  delete noTime.steps[0].args.time;
  verify(noTime, "needs_review");

  const wrongAppliedRes = clone(validPngRun);
  wrongAppliedRes.steps[0].args.resolutionFactor = [1, 1];
  wrongAppliedRes.steps[0].result.resolutionFactor.applied = [2, 2];
  verify(wrongAppliedRes, "needs_review");
  for (const value of [undefined, null, "invalid", {}, {before: [1], after: [1], applied: [1, 1], restored: true},
    {before: [2, 2], after: [2, 2], applied: [1, 1], restored: true}, {before: [1, 1], after: [1, 1], applied: [2, 2], restored: true}]) {
    const missingOrBadHostResolution = clone(validPngRun);
    missingOrBadHostResolution.steps[0].result.verification.resolutionFactor = value;
    verify(missingOrBadHostResolution, "needs_review");
  }
  const conflictingDimensions = clone(validPngRun); conflictingDimensions.steps[0].result.verification.file.width = 1;
  verify(conflictingDimensions, "needs_review");
  const wrongRequestResolution = clone(validPngRun); wrongRequestResolution.steps[0].args.resolutionFactor = [0, 0];
  verify(wrongRequestResolution, "needs_review");
  const unsupportedSelector = clone(validPngRun); unsupportedSelector.steps[0].args = {compItemId: 51, time: 0.5, outputFileName: "frame_1.png"};
  verify(unsupportedSelector, "needs_review");
  const guardOnlySelector = clone(validPngRun); guardOnlySelector.steps[0].args = {expectedCompName: "Footage Comp", time: 0.5, outputFileName: "frame_1.png"};
  verify(guardOnlySelector, "needs_review");
  const registeredReview = clone(validPngRun); const reviewStep = registeredReview.steps[0];
  reviewStep.args = {reviewOwner: "registered-owner", reviewItemId: 51, time: 0, outputFileName: "frame_1.png", resolutionFactor: [1, 1]};
  Object.assign(reviewStep.result, {reviewOwner: "registered-owner", reviewItemId: 51}); reviewStep.result.frame.time = 0;
  verify(registeredReview, "passed"); // Host handler proves current registered ownership; semantic never registers it.
  const wrongReviewId = clone(registeredReview); wrongReviewId.steps[0].result.reviewItemId = 99;
  verify(wrongReviewId, "needs_review");
  const wrongReviewOwner = clone(registeredReview); wrongReviewOwner.steps[0].result.reviewOwner = "foreign-owner";
  verify(wrongReviewOwner, "needs_review");

  // Finding 5 Negatives: Infinity bytes, negative bytes
  const infBytesPng = clone(validPngRun);
  infBytesPng.steps[0].result.file.byteLength = Infinity;
  infBytesPng.steps[0].result.verification.file.byteLength = Infinity;
  verify(infBytesPng, "needs_review");

  const negBytesPng = clone(validPngRun);
  negBytesPng.steps[0].result.file.byteLength = -5;
  negBytesPng.steps[0].result.verification.file.byteLength = -5;
  verify(negBytesPng, "needs_review");

  const mixedPlan = clone(validPngRun);
  mixedPlan.steps.push({
    index: 11,
    tool: "set_layer_transform",
    status: "completed",
    args: { compItemId: 10, layerId: 11, ...transform1 },
    result: { comp, layer: layer1, transform: transform1 }
  });
  verify(mixedPlan, "needs_review");

  return cases;
}

function createImportTestStep(index, options = {}) {
  const itemId = options.itemId || (5150 + index);
  const fileName = options.fileName || `footage${index}_clip_101f.mp4`;
  const filePath = options.filePath || `C:\\TestMedia\\${fileName}`;
  const width = options.width !== undefined ? options.width : 1280;
  const height = options.height !== undefined ? options.height : 720;
  const duration = options.duration !== undefined ? options.duration : 4.04;
  const frameRate = options.frameRate !== undefined ? options.frameRate : 25;
  const pixelAspect = options.pixelAspect !== undefined ? options.pixelAspect : 1;
  const hasVideo = options.hasVideo !== undefined ? options.hasVideo : true;
  const hasAudio = options.hasAudio !== undefined ? options.hasAudio : false;
  const footageMissing = options.footageMissing !== undefined ? options.footageMissing : false;
  const sequence = options.sequence !== undefined ? options.sequence : false;
  const name = options.name !== undefined ? options.name : fileName;

  const item = {
    itemId,
    itemIndex: options.itemIndex || (47 + index),
    name,
    type: options.type || "footage",
    typeName: "Footage",
    label: 3,
    comment: "",
    folderPath: "",
    duration,
    frameRate,
    footageMissing,
    file: filePath,
    width,
    height,
    pixelAspect,
    hasVideo,
    hasAudio
  };

  const footage = {
    file: filePath,
    width,
    height,
    duration,
    frameRate,
    hasVideo,
    hasAudio
  };

  const args = { filePath };
  if (options.reqName) args.name = options.reqName;
  if (sequence) args.sequence = true;

  const step = {
    index,
    tool: "import_footage",
    status: options.status || "completed",
    args,
    result: {
      item,
      footage,
      sequence
    }
  };

  if (options.attachedRead) {
    const attachedRow = { ...item, ...(options.attachedRowOverrides || {}) };
    step.independentReadBack = [{
      tool: "find_project_items",
      status: options.attachedStatus || "completed",
      source: options.attachedSource || "server_typed_readback",
      observedAt: options.attachedObservedAt || "2026-10-01T16:17:19.000Z",
      args: { itemIds: [itemId], type: "footage", limit: 1 },
      result: {
        matches: [attachedRow]
      }
    }];
  }

  return step;
}

function createFindTestStep(index, importStep, options = {}) {
  const item = importStep.result.item;
  const itemId = options.itemId !== undefined ? options.itemId : item.itemId;
  const matches = options.matches || [{ ...item, ...(options.rowOverrides || {}) }];
  const args = options.args || { itemIds: [itemId], type: "footage", limit: 1 };

  return {
    index,
    tool: "find_project_items",
    status: options.status || "completed",
    args,
    result: {
      matches
    }
  };
}

function assertImportSemanticAndNegativeBoundaries() {
  let cases = 0;
  function verify(run, expectedStatus, expectedCheckStatus) {
    cases++;
    const plan = { steps: run.steps.map(s => ({ tool: s.tool, args: s.args })) };
    const result = buildSemanticVerification(plan, run);
    assert.equal(result.status, expectedStatus, `Expected ${expectedStatus} but got ${result.status} for case ${cases}`);
    if (expectedCheckStatus) {
      assert(result.checks.some(c => c.status === expectedCheckStatus), `Expected some check to be ${expectedCheckStatus} for case ${cases}`);
    }
    return result;
  }

  // 1. Positive actual-shaped 5 sequence with owned exact-ID reads
  const steps5 = [];
  for (let i = 1; i <= 5; i++) {
    const importStep = createImportTestStep(2 * i - 1, { attachedRead: true });
    const findStep = createFindTestStep(2 * i, importStep);
    steps5.push(importStep, findStep);
  }
  const pos5Run = { ok: true, steps: steps5 };
  const sem5 = verify(pos5Run, "passed");
  assert.equal(sem5.passedChecks, 15);
  assert.equal(sem5.failedChecks, 0);
  assert.equal(sem5.needsReviewChecks, 0);
  assert.equal(sem5.unverifiedMutationCount, 0);

  // 2. Historical stage 19 run without owned reads and with name-only finds remains needs_review
  const stage19Steps = [];
  for (let i = 1; i <= 5; i++) {
    const importStep = createImportTestStep(2 * i - 1, { attachedRead: false });
    const findStep = {
      index: 2 * i,
      tool: "find_project_items",
      status: "completed",
      args: { exactName: true, query: `footage${2 * i - 1}_clip_101f.mp4`, type: "footage" },
      result: { matches: [importStep.result.item] }
    };
    stage19Steps.push(importStep, findStep);
  }
  const stage19Run = { ok: false, steps: stage19Steps };
  const semStage19 = verify(stage19Run, "needs_review");
  assert.equal(semStage19.ok, false);

  // 3. Positive single-file video with corroborated pair (1 attached + 1 explicit)
  const s1 = createImportTestStep(1, { attachedRead: true });
  const s2 = createFindTestStep(2, s1);
  const corrobRes = verify({ ok: true, steps: [s1, s2] }, "passed");
  assert.equal(corrobRes.passedChecks, 3);
  const corrobReadBack = corrobRes.checks.find(c => c.id === "1:import_footage:read-back");
  assert(corrobReadBack && corrobReadBack.evidence.includes("Corroborated server-attached and explicit"));

  // 4. Positive single-file video with explicit read only
  const expOnlyStep = createImportTestStep(1, { attachedRead: false });
  const expFind = createFindTestStep(2, expOnlyStep);
  verify({ ok: true, steps: [expOnlyStep, expFind] }, "passed");

  // 5. Positive single-file video with attached read only
  const attOnlyStep = createImportTestStep(1, { attachedRead: true });
  verify({ ok: true, steps: [attOnlyStep] }, "passed");

  // 6. Relative request path vs absolute item and read-back paths
  const relStep = createImportTestStep(1, { filePath: "media/test_101f.mp4", attachedRead: false });
  relStep.args.filePath = "media/test_101f.mp4";
  relStep.result.item.file = path.resolve(process.cwd(), "media", "test_101f.mp4");
  relStep.result.footage.file = path.resolve(process.cwd(), "media", "test_101f.mp4");
  const relFind = createFindTestStep(2, relStep);
  relFind.result.matches[0].file = path.resolve(process.cwd(), "media", "test_101f.mp4");
  verify({ ok: true, steps: [relStep, relFind] }, "passed");

  // 7. Moved itemIndex still passes with persistent itemId
  const movedStep = createImportTestStep(1, { attachedRead: false, itemIndex: 48 });
  const movedFind = createFindTestStep(2, movedStep, { rowOverrides: { itemIndex: 99 } });
  verify({ ok: true, steps: [movedStep, movedFind] }, "passed");

  // 8. Wrong itemId in read-back fails closed
  const wrongIdStep = createImportTestStep(1, { attachedRead: false });
  const wrongIdFind = createFindTestStep(2, wrongIdStep, { itemId: 9999, rowOverrides: { itemId: 9999 } });
  verify({ ok: true, steps: [wrongIdStep, wrongIdFind] }, "needs_review");

  // 9. Wrong item type (comp instead of footage) fails
  const wrongTypeStep = createImportTestStep(1, { attachedRead: false, type: "comp" });
  const wrongTypeFind = createFindTestStep(2, wrongTypeStep);
  verify({ ok: true, steps: [wrongTypeStep, wrongTypeFind] }, "needs_review", "failed");

  // 10. Footage missing fails
  const missingStep = createImportTestStep(1, { attachedRead: false, footageMissing: true });
  const missingFind = createFindTestStep(2, missingStep);
  verify({ ok: true, steps: [missingStep, missingFind] }, "needs_review", "failed");

  // 11. Same basename in different folder fails
  const diffFolderStep = createImportTestStep(1, { attachedRead: false, filePath: "C:\\folderA\\video.mp4" });
  diffFolderStep.result.item.file = "C:\\folderB\\video.mp4";
  diffFolderStep.result.footage.file = "C:\\folderB\\video.mp4";
  const diffFolderFind = createFindTestStep(2, diffFolderStep);
  verify({ ok: true, steps: [diffFolderStep, diffFolderFind] }, "needs_review", "failed");

  // 12. Duplicate target rows in find_project_items fails closed
  const dupStep = createImportTestStep(1, { attachedRead: false });
  const dupFind = createFindTestStep(2, dupStep, { matches: [dupStep.result.item, dupStep.result.item] });
  verify({ ok: true, steps: [dupStep, dupFind] }, "needs_review");

  // 13. Mismatched duration fails
  const badDurStep = createImportTestStep(1, { attachedRead: false });
  const badDurFind = createFindTestStep(2, badDurStep, { rowOverrides: { duration: 99.9 } });
  verify({ ok: true, steps: [badDurStep, badDurFind] }, "needs_review", "failed");

  // 14. Mismatched pixelAspect (PAR) fails
  const badParStep = createImportTestStep(1, { attachedRead: false });
  const badParFind = createFindTestStep(2, badParStep, { rowOverrides: { pixelAspect: 1.333 } });
  verify({ ok: true, steps: [badParStep, badParFind] }, "needs_review", "failed");

  // 15. hasVideo: false (still image or audio only) fails closed
  const audioOnlyStep = createImportTestStep(1, { attachedRead: false, hasVideo: false, hasAudio: true });
  const audioOnlyFind = createFindTestStep(2, audioOnlyStep);
  verify({ ok: true, steps: [audioOnlyStep, audioOnlyFind] }, "needs_review");

  // 16. Missing numeric metadata field fails closed
  const noWidthStep = createImportTestStep(1, { attachedRead: false });
  delete noWidthStep.result.item.width;
  const noWidthFind = createFindTestStep(2, noWidthStep);
  verify({ ok: true, steps: [noWidthStep, noWidthFind] }, "needs_review");

  // 17. String numeric metadata fails closed
  const strWidthStep = createImportTestStep(1, { attachedRead: false });
  strWidthStep.result.item.width = "1280";
  const strWidthFind = createFindTestStep(2, strWidthStep);
  verify({ ok: true, steps: [strWidthStep, strWidthFind] }, "needs_review");

  // 18. Unsupported sequence import fails closed
  const seqStep = createImportTestStep(1, { attachedRead: false, sequence: true });
  const seqFind = createFindTestStep(2, seqStep);
  verify({ ok: true, steps: [seqStep, seqFind] }, "needs_review");

  // 19. Name mismatch fails
  const nameStep = createImportTestStep(1, { attachedRead: false, reqName: "expected_name.mp4" });
  nameStep.result.item.name = "actual_name.mp4";
  const nameFind = createFindTestStep(2, nameStep);
  verify({ ok: true, steps: [nameStep, nameFind] }, "needs_review", "failed");

  // 20. Read before import fails closed
  const beforeStep = createImportTestStep(2, { attachedRead: false });
  const beforeFind = createFindTestStep(1, beforeStep);
  verify({ ok: true, steps: [beforeFind, beforeStep] }, "needs_review");

  // 21. Failed read attempt fails closed
  const failedReadStep = createImportTestStep(1, { attachedRead: false });
  const failedReadFind = createFindTestStep(2, failedReadStep, { status: "failed" });
  verify({ ok: true, steps: [failedReadStep, failedReadFind] }, "needs_review");

  // 22. Conflicting targeted reads (arbitrary 2 explicit reads) fails closed
  const conflictStep = createImportTestStep(1, { attachedRead: false });
  const exp1 = createFindTestStep(2, conflictStep);
  const exp2 = createFindTestStep(3, conflictStep);
  verify({ ok: true, steps: [conflictStep, exp1, exp2] }, "needs_review");

  // 23. Malformed attached read fails closed
  const malformedAttStep = createImportTestStep(1, { attachedRead: true, attachedSource: "untrusted_source" });
  verify({ ok: true, steps: [malformedAttStep] }, "needs_review");

  // 24. Extra attached read fails closed
  const extraAttStep = createImportTestStep(1, { attachedRead: true });
  extraAttStep.independentReadBack.push(clone(extraAttStep.independentReadBack[0]));
  verify({ ok: true, steps: [extraAttStep] }, "needs_review");

  // 25. Foreign attached read fails closed
  const foreignAttStep = createImportTestStep(1, { attachedRead: true });
  foreignAttStep.independentReadBack[0].args.itemIds = [9999];
  verify({ ok: true, steps: [foreignAttStep] }, "needs_review");

  // 26. Cached generic verification with MAIN comp and no exact-ID read fails closed
  const genericVerifStep = createImportTestStep(1, { attachedRead: false });
  genericVerifStep.result.verification = {
    ok: true,
    comp: { itemIndex: 413, id: 2735, name: "MAIN" }
  };
  verify({ ok: true, steps: [genericVerifStep] }, "needs_review");

  // 27. Targeted skipped read fails closed (needs_review)
  const skippedStep = createImportTestStep(1, { attachedRead: false });
  const skippedFind = createFindTestStep(2, skippedStep, { status: "skipped" });
  verify({ ok: true, steps: [skippedStep, skippedFind] }, "needs_review");

  // 28. Targeted failed read in a pair does not silently downgrade to single attached read
  const pairWithFailedExplicit = createImportTestStep(1, { attachedRead: true });
  const failedExplicitStep = createFindTestStep(2, pairWithFailedExplicit, { status: "failed" });
  verify({ ok: true, steps: [pairWithFailedExplicit, failedExplicitStep] }, "needs_review");

  // 29. Targeted skipped read in a pair does not silently downgrade
  const pairWithSkippedExplicit = createImportTestStep(1, { attachedRead: true });
  const skippedExplicitStep = createFindTestStep(2, pairWithSkippedExplicit, { status: "skipped" });
  verify({ ok: true, steps: [pairWithSkippedExplicit, skippedExplicitStep] }, "needs_review");

  // 30. Conflicting id alias in item fails closed
  const itemConflictingId = createImportTestStep(1, { attachedRead: false });
  itemConflictingId.result.item.id = 9999;
  const itemConflictingFind = createFindTestStep(2, itemConflictingId);
  verify({ ok: true, steps: [itemConflictingId, itemConflictingFind] }, "needs_review");

  // 31. Conflicting id alias in read row fails closed
  const rowConflictingStep = createImportTestStep(1, { attachedRead: false });
  const rowConflictingFind = createFindTestStep(2, rowConflictingStep, { rowOverrides: { id: 9999 } });
  verify({ ok: true, steps: [rowConflictingStep, rowConflictingFind] }, "needs_review");

  // 32. Malformed itemIds in explicit read: string item ID fails closed
  const strIdStep = createImportTestStep(1, { attachedRead: false });
  const strIdFind = createFindTestStep(2, strIdStep);
  strIdFind.args.itemIds = [String(strIdStep.result.item.itemId)];
  verify({ ok: true, steps: [strIdStep, strIdFind] }, "needs_review");

  // 33. Malformed itemIds in explicit read: negative item ID fails closed
  const negIdStep = createImportTestStep(1, { attachedRead: false });
  const negIdFind = createFindTestStep(2, negIdStep);
  negIdFind.args.itemIds = [-5];
  verify({ ok: true, steps: [negIdStep, negIdFind] }, "needs_review");

  // 34. Malformed itemIds in explicit read: duplicate item IDs fails closed
  const dupIdStep = createImportTestStep(1, { attachedRead: false });
  const dupIdFind = createFindTestStep(2, dupIdStep);
  dupIdFind.args.itemIds = [dupIdStep.result.item.itemId, dupIdStep.result.item.itemId];
  verify({ ok: true, steps: [dupIdStep, dupIdFind] }, "needs_review");

  // 35. Malformed itemIds in explicit read: not an array fails closed
  const nonArrIdStep = createImportTestStep(1, { attachedRead: false });
  const nonArrIdFind = createFindTestStep(2, nonArrIdStep);
  nonArrIdFind.args.itemIds = nonArrIdStep.result.item.itemId;
  verify({ ok: true, steps: [nonArrIdStep, nonArrIdFind] }, "needs_review");

  // 36. Malformed request: empty filePath fails closed
  const emptyPathStep = createImportTestStep(1, { attachedRead: false });
  emptyPathStep.args.filePath = "";
  const emptyPathFind = createFindTestStep(2, emptyPathStep);
  verify({ ok: true, steps: [emptyPathStep, emptyPathFind] }, "needs_review");

  // 37. Malformed request: non-string name fails closed
  const nonStrNameStep = createImportTestStep(1, { attachedRead: false, reqName: 12345 });
  nonStrNameStep.args.name = 12345;
  const nonStrNameFind = createFindTestStep(2, nonStrNameStep);
  verify({ ok: true, steps: [nonStrNameStep, nonStrNameFind] }, "needs_review");

  // 38. Malformed request: non-boolean sequence fails closed
  const nonBoolSeqStep = createImportTestStep(1, { attachedRead: false });
  nonBoolSeqStep.args.sequence = "false";
  const nonBoolSeqFind = createFindTestStep(2, nonBoolSeqStep);
  verify({ ok: true, steps: [nonBoolSeqStep, nonBoolSeqFind] }, "needs_review");

  // 39. Spoofed marker: explicit plan step claiming server_typed_readback fails closed
  const spoofedStep = createImportTestStep(1, { attachedRead: false });
  const spoofedFind = createFindTestStep(2, spoofedStep);
  spoofedFind.source = "server_typed_readback";
  verify({ ok: true, steps: [spoofedStep, spoofedFind] }, "needs_review");

  // 40. Extra attached attempts in step.independentReadBack fails closed
  const extraAttFieldStep = createImportTestStep(1, { attachedRead: true });
  extraAttFieldStep.independentReadBack.push({
    tool: "find_project_items",
    status: "completed",
    source: "server_typed_readback",
    observedAt: "2026-10-01T16:17:19.000Z",
    args: { itemIds: [extraAttFieldStep.result.item.itemId], type: "footage", limit: 1 },
    result: { matches: [clone(extraAttFieldStep.result.item)] }
  });
  verify({ ok: true, steps: [extraAttFieldStep] }, "needs_review");

  // 41. Proven unrelated ID explicit read does not conflict with target import
  const unrelatedStep = createImportTestStep(1, { attachedRead: false });
  const validTargetFind = createFindTestStep(2, unrelatedStep);
  const unrelatedFind = {
    index: 3,
    tool: "find_project_items",
    status: "completed",
    args: { itemIds: [9999], type: "footage", limit: 1 },
    result: { matches: [{ itemId: 9999, file: "C:\\other\\video.mp4", name: "other.mp4" }] }
  };
  verify({ ok: true, steps: [unrelatedStep, validTargetFind, unrelatedFind] }, "passed");

  // 42. Unrelated find with conflicting match leaking target itemId fails closed
  const leakingUnrelatedStep = createImportTestStep(1, { attachedRead: false });
  const leakingFind = {
    index: 2,
    tool: "find_project_items",
    status: "completed",
    args: { itemIds: [9999], type: "footage", limit: 1 },
    result: { matches: [{ itemId: leakingUnrelatedStep.result.item.itemId, file: leakingUnrelatedStep.result.item.file }] }
  };
  verify({ ok: true, steps: [leakingUnrelatedStep, leakingFind] }, "needs_review");

  // 43. Current mutation window guard: read after later mutating step fails closed
  const windowStep = createImportTestStep(1, { attachedRead: false });
  const interveningMutation = {
    index: 2,
    tool: "delete_layer",
    status: "completed",
    args: { compItemId: 10, layerId: 11 },
    result: { comp: { itemId: 10 }, layer: { id: 11 } }
  };
  const lateFind = createFindTestStep(3, windowStep);
  verify({ ok: true, steps: [windowStep, interveningMutation, lateFind] }, "needs_review");

  // 44. String duration on footage fails closed
  const strDurFootageStep = createImportTestStep(1, { attachedRead: false });
  strDurFootageStep.result.footage.duration = "4.04";
  const strDurFootageFind = createFindTestStep(2, strDurFootageStep);
  verify({ ok: true, steps: [strDurFootageStep, strDurFootageFind] }, "needs_review");

  // 45. String frameRate on footage fails closed
  const strFpsFootageStep = createImportTestStep(1, { attachedRead: false });
  strFpsFootageStep.result.footage.frameRate = "25";
  const strFpsFootageFind = createFindTestStep(2, strFpsFootageStep);
  verify({ ok: true, steps: [strFpsFootageStep, strFpsFootageFind] }, "needs_review");

  // 46. Optional pixelAspect on footage mismatching item pixelAspect fails closed
  const parMismatchFootageStep = createImportTestStep(1, { attachedRead: false });
  parMismatchFootageStep.result.footage.pixelAspect = 1.333;
  const parMismatchFootageFind = createFindTestStep(2, parMismatchFootageStep);
  verify({ ok: true, steps: [parMismatchFootageStep, parMismatchFootageFind] }, "needs_review", "failed");

  // 47. String optional pixelAspect on footage fails closed
  const strParFootageStep = createImportTestStep(1, { attachedRead: false });
  strParFootageStep.result.footage.pixelAspect = "1";
  const strParFootageFind = createFindTestStep(2, strParFootageStep);
  verify({ ok: true, steps: [strParFootageStep, strParFootageFind] }, "needs_review");

  // 48. String duration on read row fails closed
  const strDurRowStep = createImportTestStep(1, { attachedRead: false });
  const strDurRowFind = createFindTestStep(2, strDurRowStep, { rowOverrides: { duration: "4.04" } });
  verify({ ok: true, steps: [strDurRowStep, strDurRowFind] }, "needs_review");

  // 49. String frameRate on read row fails closed
  const strFpsRowStep = createImportTestStep(1, { attachedRead: false });
  const strFpsRowFind = createFindTestStep(2, strFpsRowStep, { rowOverrides: { frameRate: "25" } });
  verify({ ok: true, steps: [strFpsRowStep, strFpsRowFind] }, "needs_review");

  // 50. String pixelAspect on read row fails closed
  const strParRowStep = createImportTestStep(1, { attachedRead: false });
  const strParRowFind = createFindTestStep(2, strParRowStep, { rowOverrides: { pixelAspect: "1" } });
  verify({ ok: true, steps: [strParRowStep, strParRowFind] }, "needs_review");

  // 51. String hasAudio on item fails closed
  const strAudioItemStep = createImportTestStep(1, { attachedRead: false });
  strAudioItemStep.result.item.hasAudio = "false";
  const strAudioItemFind = createFindTestStep(2, strAudioItemStep);
  verify({ ok: true, steps: [strAudioItemStep, strAudioItemFind] }, "needs_review");

  // 52. String hasAudio on footage fails closed
  const strAudioFootageStep = createImportTestStep(1, { attachedRead: false });
  strAudioFootageStep.result.footage.hasAudio = "false";
  const strAudioFootageFind = createFindTestStep(2, strAudioFootageStep);
  verify({ ok: true, steps: [strAudioFootageStep, strAudioFootageFind] }, "needs_review");

  // 53. String hasAudio on read row fails closed
  const strAudioRowStep = createImportTestStep(1, { attachedRead: false });
  const strAudioRowFind = createFindTestStep(2, strAudioRowStep, { rowOverrides: { hasAudio: "false" } });
  verify({ ok: true, steps: [strAudioRowStep, strAudioRowFind] }, "needs_review");

  // 54. Windows casefolding vs case-sensitive host behavior
  const caseStep = createImportTestStep(1, { attachedRead: false, filePath: "C:\\TestMedia\\UpperVideo.mp4" });
  caseStep.args.filePath = "C:\\TestMedia\\uppervideo.mp4";
  caseStep.result.item.file = "C:\\TestMedia\\UpperVideo.mp4";
  caseStep.result.footage.file = "C:\\TestMedia\\UpperVideo.mp4";
  const caseFind = createFindTestStep(2, caseStep);
  caseFind.result.matches[0].file = "C:\\TestMedia\\UpperVideo.mp4";
  if (process.platform === "win32") {
    verify({ ok: true, steps: [caseStep, caseFind] }, "passed");
  } else {
    verify({ ok: true, steps: [caseStep, caseFind] }, "needs_review");
  }

  // 55. Optional historical stage 19 receipt: portable synthetic fixtures always run;
  // optional history file is read conditionally without throwing if absent.
  const stage19FilePath = path.resolve(__dirname, "..", ".codex-runtime", "live-bohemian2016", "root-stage19-import-run.json");
  if (fs.existsSync(stage19FilePath)) {
      const fileData = JSON.parse(fs.readFileSync(stage19FilePath, "utf8"));
      const histSemResult = verify(fileData, "needs_review");
      assert.equal(histSemResult.ok, false);
      const diagData = { ...fileData, ok: true };
      const diagSemResult = verify(diagData, "needs_review");
      assert.equal(diagSemResult.ok, false);
  }

  // 56. Bridge buildServerSemanticVerification pure-module integration proof
  const bridgeImportStep = createImportTestStep(1, { attachedRead: true });
  const bridgePlan = { steps: [{ tool: bridgeImportStep.tool, args: bridgeImportStep.args }] };
  const bridgeRun = { steps: [bridgeImportStep], ok: true };
  const bridgeVerification = buildServerSemanticVerification(bridgePlan, bridgeRun);
  assert.equal(bridgeVerification.status, "passed");
  assert.equal(bridgeVerification.ok, true);
  assert.equal(bridgeVerification.unverifiedMutationCount, 0);
  assert.equal(bridgeVerification.passedChecks, 3);

  // Present but malformed optional fields must fail closed, including null.
  for (const [location, field, value] of [
    ["footage", "pixelAspect", null], ["footage", "pixelAspect", undefined],
    ["item", "id", null], ["item", "id", undefined],
    ["result", "sequence", "false"], ["result", "sequence", null],
    ["row", "id", null], ["row", "name", null], ["row", "name", ""]
  ]) {
    const imp = createImportTestStep(1, { attachedRead: false });
    const read = createFindTestStep(2, imp);
    const target = location === "row" ? read.result.matches[0] :
      location === "result" ? imp.result : imp.result[location];
    target[field] = value;
    verify({ ok: true, steps: [imp, read] }, "needs_review");
  }

  return cases;
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
  assertLayerMetadataPasses();
  assertLayerEnabledHardSoloPasses();
  assertGridRigControlReplacementPasses();
  assertLayerBlendingModePasses();
  assertLayerParentPasses();
  assertLayerParentMissingReadBackNeedsReview();
  assertLayerTrackMattePasses();
  assertLayerTrackMatteMissingReadBackNeedsReview();
  assertAdjustmentLayerPlacementPasses();
  assertLayerConnectionLinePasses();
  assertTextShapesPasses();
  assertProjectItemMetadataPasses();
  assertProjectItemMetadataMissingReadBackNeedsReview();
  assertDeleteLayerPasses();
  assertDeleteLayerMissingReadBackNeedsReview();
  assertSetCompPropertiesPasses();
  assertPreserveNestedFrameRateFixturePasses();
  assertProjectTimecodeStartFramesFixturePasses();
  assertSetCompPropertiesReadBackMismatchNeedsReview();
  assertRefreshCompPanelPasses();
  assertSetCompWorkAreaReadBackFallbackPasses();
  assertSetCompWorkAreaMissingReadBackNeedsReview();
  assertSetCompCurrentTimePasses();
  assertSetCompCurrentTimeMissingReadBackNeedsReview();
  assertSetLayerMaskCreateUpdatePasses();
  assertSetLayerMaskMissingReadBackNeedsReview();
  assertSetPathGeometryPasses();
  assertSetPathGeometryMissingReadBackNeedsReview();
  assertExportPathPointsPasses();
  assertExportPathPointsMissingReadBackNeedsReview();
  assertExportTextToFilePasses();
  assertSaveCompFramePngPasses();
  assertDakkshinFixtureMutationScopedReadBackPasses();
  assertDakkshinLiveAeEvidenceShapePasses();
  assertSetPropertyValuePasses();
  assertSetLayerSwitchValuePasses();
  assertRemainingTailContractToolsPass();
  assertAddCompMarkerPasses();
  assertSequentialAddCompMarkersPassWithSharedReadBack();
  assertAddLayerMarkerPasses();
  assertUpdateLayerMarkerPasses();
  assertDeleteLayerMarkerPasses();
  assertMarkerLifecycleSequencePasses();
  assertAddPropertyToEssentialGraphicsPasses();
  assertAddPropertyToEssentialGraphicsMissingReadBackNeedsReview();
  assertSetPuppetPinTypePasses();
  assertSetPuppetPinTypeMissingReadBackNeedsReview();
  assertSetEffectEnabledScenarioPasses();
  assertSourceTextKeyframesPass();
  assertSourceTextKeyframeMismatchNeedsReview();
  assertParentOpacityExpressionScenarioPasses();
  assertLayerParentBelowScenarioPasses();
  assertLayerParentClosestScenarioPasses();
  assertLayerNameResetScenarioPasses();
  assertTextJustificationPasses();
  assertShapeLayerPolystarPasses();
  assertListEffectsCountsAsReadBack();
  assertSetEffectPropertyUsesExactCompositeIdentity();
  const recoveryBoundaryCases = assertRecoveryIdentityAndTransformBoundaries();
  const corroborationAndPngProofCases = assertAttachedAndExplicitCorroborationAndPngFileProof();
  const importSemanticCases = assertImportSemanticAndNegativeBoundaries();

  console.log(JSON.stringify({
    ok: true,
    schema: SEMANTIC_VERIFICATION_SCHEMA,
    recoveryBoundaryCases,
    corroborationAndPngProofCases,
    importSemanticCases,
    scenarios: results
  }, null, 2));
}

main();
