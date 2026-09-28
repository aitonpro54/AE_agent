"use strict";

const isId = (value) => Number.isSafeInteger(value) && value > 0;
const isTime = (value) => typeof value === "number" && Number.isFinite(value);
const fail = (code) => ({ ok: false, code, plan: null });
const close = (a, b, frameRate) => Math.abs(a - b) <= 0.25 / frameRate;

const COMP_SCHEMA = { type: "object", required: ["itemId", "itemIndex", "name", "duration", "frameRate"],
  properties: { itemId: { type: "integer" }, itemIndex: { type: "integer" }, name: { type: "string" },
    duration: { type: "number" }, frameRate: { type: "number" } } };
const TIME_RANGE_SCHEMA = { type: "array", minItems: 2, maxItems: 2, items: { type: "number" } };
const inputSchema = { type: "object", required: ["input"], properties: { input: {
  type: "object", required: ["rootComp", "targetComp", "route", "targetLayer", "sourceItem", "rootRange", "sourceRange"],
  properties: {
    rootComp: COMP_SCHEMA, targetComp: COMP_SCHEMA,
    route: { type: "array", maxItems: 4, items: { type: "object",
      required: ["parentCompItemId", "childCompItemId", "layerId", "layerIndex", "startTime", "inPoint", "outPoint", "stretch", "timeRemapEnabled"],
      properties: { parentCompItemId: { type: "integer" }, childCompItemId: { type: "integer" }, layerId: { type: "integer" },
        layerIndex: { type: "integer" }, startTime: { type: "number" }, inPoint: { type: "number" },
        outPoint: { type: "number" }, stretch: { type: "number" }, timeRemapEnabled: { type: "boolean" } } } },
    targetLayer: { type: "object", required: ["id", "index", "name", "sourceItemId", "locked", "stretch", "timeRemapEnabled"],
      properties: { id: { type: "integer" }, index: { type: "integer" }, name: { type: "string" }, sourceItemId: { type: "integer" },
        locked: { type: "boolean" }, stretch: { type: "number" }, timeRemapEnabled: { type: "boolean" } } },
    sourceItem: { type: "object", required: ["itemId", "itemIndex", "name", "type", "duration"],
      properties: { itemId: { type: "integer" }, itemIndex: { type: "integer" }, name: { type: "string" },
        type: { type: "string", enum: ["footage", "comp"] }, duration: { type: "number" } } },
    rootRange: TIME_RANGE_SCHEMA, sourceRange: TIME_RANGE_SCHEMA
  }
} } };

function validComp(comp) {
  return comp && isId(comp.itemId) && isId(comp.itemIndex) && typeof comp.name === "string"
    && comp.name.length > 0 && isTime(comp.duration) && comp.duration > 0
    && isTime(comp.frameRate) && comp.frameRate > 0;
}

function buildPlaceholderPlan(input) {
  if (!input || !validComp(input.rootComp) || !validComp(input.targetComp)) return fail("invalid_comp_identity");
  const { rootComp, targetComp, targetLayer, sourceItem, route, rootRange, sourceRange } = input;
  if (!Array.isArray(route) || route.length > 4) return fail("invalid_route");
  if (!targetLayer || !isId(targetLayer.id) || !isId(targetLayer.index) || !isId(targetLayer.sourceItemId)
    || !targetLayer.name || targetLayer.locked !== false || targetLayer.timeRemapEnabled !== false
    || targetLayer.stretch !== 100) return fail("unsupported_target_layer");
  if (!sourceItem || !isId(sourceItem.itemId) || !isId(sourceItem.itemIndex) || !sourceItem.name
    || !["footage", "comp"].includes(sourceItem.type) || !isTime(sourceItem.duration)) return fail("invalid_source_identity");
  if (!Array.isArray(rootRange) || !Array.isArray(sourceRange) || rootRange.length !== 2 || sourceRange.length !== 2
    || ![...rootRange, ...sourceRange].every(isTime) || rootRange[0] < 0 || rootRange[1] <= rootRange[0]
    || sourceRange[0] < 0 || sourceRange[1] <= sourceRange[0]
    || rootRange[1] > rootComp.duration || sourceRange[1] > sourceItem.duration) return fail("invalid_time_range");
  if (!close(rootComp.frameRate, targetComp.frameRate, 1000)) return fail("mixed_frame_rate");
  if (![...rootRange, ...sourceRange].every((time) => close(time * rootComp.frameRate, Math.round(time * rootComp.frameRate), 1))) return fail("off_frame_boundary");
  let currentCompId = rootComp.itemId;
  let localRange = [...rootRange];
  for (const edge of route) {
    if (!edge || edge.parentCompItemId !== currentCompId || !isId(edge.childCompItemId)
      || !isId(edge.layerId) || !isId(edge.layerIndex) || edge.stretch !== 100
      || edge.timeRemapEnabled !== false || ![edge.startTime, edge.inPoint, edge.outPoint].every(isTime)
      || localRange[0] < edge.inPoint || localRange[1] > edge.outPoint) return fail("unsupported_or_stale_route");
    localRange = localRange.map((time) => time - edge.startTime);
    currentCompId = edge.childCompItemId;
  }
  if (currentCompId !== targetComp.itemId || localRange[0] < 0 || localRange[1] > targetComp.duration) return fail("target_comp_mismatch");
  if (!close(localRange[1] - localRange[0], sourceRange[1] - sourceRange[0], targetComp.frameRate)) return fail("source_duration_mismatch");
  const startTime = localRange[0] - sourceRange[0];
  const frameCount = Math.round((rootRange[1] - rootRange[0]) * rootComp.frameRate);
  if (frameCount < 1) return fail("empty_frame_range");
  const frameSelections = [
    { role: "first", offset: 0 },
    { role: "middle", offset: Math.floor((frameCount - 1) / 2) },
    { role: "last", offset: frameCount - 1 }
  ];
  const frameReview = [];
  for (const selection of frameSelections) {
    const existing = frameReview.find((entry) => entry.offsetFrame === selection.offset);
    if (existing) { existing.roles.push(selection.role); continue; }
    const offsetSeconds = selection.offset / rootComp.frameRate;
    frameReview.push({ roles: [selection.role], offsetFrame: selection.offset,
      rootTime: rootRange[0] + offsetSeconds,
      targetTime: localRange[0] + offsetSeconds,
      sourceTime: sourceRange[0] + offsetSeconds });
  }
  const target = { compItemIndex: targetComp.itemIndex, compName: targetComp.name, layerIndices: [targetLayer.index] };
  const plan = {
    summary: `Fill reviewed placeholder ${targetLayer.name} in ${targetComp.name}.`,
    risk: "high", mutatesProject: true, requiresCheckpoint: true, requiresFreshEvidenceReview: true,
    steps: [
      { tool: "replace_layer_source", args: {
        ...target, sourceItemIndex: sourceItem.itemIndex, sourceItemName: sourceItem.name, sourceItemType: sourceItem.type,
        expectedCompItemId: targetComp.itemId, expectedLayerId: targetLayer.id,
        expectedPreviousSourceItemId: targetLayer.sourceItemId, expectedSourceItemId: sourceItem.itemId
      } },
      { tool: "set_layer_time_range", args: {
        ...target, startTime, inPoint: localRange[0], outPoint: localRange[1],
        expectedCompItemId: targetComp.itemId, expectedLayerId: targetLayer.id,
        expectedSourceItemId: sourceItem.itemId
      } },
      { tool: "get_layer_details", args: { compItemIndex: targetComp.itemIndex,
        compName: targetComp.name, layerIndex: targetLayer.index } }
    ]
  };
  return { ok: true, plan, frameReview, expectedReadBack: {
    compItemIndex: targetComp.itemIndex, compItemId: targetComp.itemId, compName: targetComp.name,
    frameRate: targetComp.frameRate, layerIndex: targetLayer.index, layerId: targetLayer.id,
    layerName: targetLayer.name, sourceItemId: sourceItem.itemId, sourceName: sourceItem.name,
    startTime, inPoint: localRange[0], outPoint: localRange[1], rootRange, sourceRange
  } };
}

module.exports = { buildPlaceholderPlan, inputSchema };
