"use strict";
const { TRANSFORMS, validValue, validTransform, normalizeProtectedPaths } = require("./placeholder-protection");
function compactProperty(value) {
  const wrapped = value && typeof value === "object" && !Array.isArray(value);
  const raw = wrapped ? value.value : value;
  if (!validValue(raw)) return null;
  if (!wrapped) return raw;
  return { kind: typeof value.kind === "string" ? value.kind.slice(0, 40) : "unknown", value: raw,
    numKeys: Number.isSafeInteger(value.numKeys) ? value.numKeys : null,
    expressionEnabled: typeof value.expressionEnabled === "boolean" ? value.expressionEnabled : null,
    dimensionsSeparated: typeof value.dimensionsSeparated === "boolean" ? value.dimensionsSeparated : null,
    isSeparationFollower: typeof value.isSeparationFollower === "boolean" ? value.isSeparationFollower : null };
}

function projectPlaceholderLayerEvidence(full) {
  if (!full || !full.comp || !full.layer) {
    throw new Error("Placeholder layer evidence is incomplete.");
  }
  const comp = full.comp;
  const layer = full.layer;
  const source = layer.source;
  const transform = {};
  for (const field of Object.keys(TRANSFORMS)) if (full.transform && full.transform[field] !== undefined) {
    const value = compactProperty(full.transform[field]);
    if (value !== null && validTransform(field,value && typeof value === "object" && !Array.isArray(value) ? value.value : value)) transform[field] = value;
  }
  const properties = [];
  for (const property of (Array.isArray(full.protectedProperties) ? full.protectedProperties.slice(0, 12) : [])) {
    try {
      const [propertyPath] = normalizeProtectedPaths([property.path]);
      const value = compactProperty(property);
      if (value !== null) properties.push({ path: propertyPath, ...value });
    } catch (_error) {}
  }
  return {
    evidenceView: "placeholder.v1",
    comp: {
      itemIndex: comp.itemIndex, itemId: comp.itemId, name: comp.name, frameRate: comp.frameRate
    },
    layer: {
      index: layer.index, id: layer.id, name: layer.name, locked: layer.locked,
      ...(typeof layer.threeDLayer === "boolean" ? { threeDLayer: layer.threeDLayer } : {}),
      source: source ? { itemId: source.itemId, name: source.name,
        file: source.file, footageMissing: source.footageMissing, duration: source.duration, frameRate: source.frameRate } : null,
      startTime: layer.startTime, inPoint: layer.inPoint, outPoint: layer.outPoint,
      stretch: layer.stretch, timeRemapEnabled: layer.timeRemapEnabled
    },
    ...(full.transform ? { transform } : {}),
    ...(full.geometry ? {geometry: compactGeometry(full.geometry)} : {}),
    ...(full.protectedProperties ? { properties } : {})
  };
}

function compactGeometry(geometry){
  const result={};
  for(const [group,fields] of Object.entries({comp:["width","height","pixelAspect","frameRate"],source:["width","height","pixelAspect","duration","frameRate"],layer:["threeDLayer","parentLayerId","rotation","anchorPoint","transformStatic","hasMasks","collapseTransformation"]})){
    result[group]={};for(const field of fields){const value=geometry[group] && geometry[group][field];
      result[group][field]=typeof value==="boolean" || value===null || typeof value==="number" && Number.isFinite(value) ? value :
        group==="layer" && field==="anchorPoint" && Array.isArray(value) && [2,3].includes(value.length) && Array.from(value).every(Number.isFinite) ? [...value] : null;}
  }
  return result;
}

module.exports = { projectPlaceholderLayerEvidence,compactGeometry };
