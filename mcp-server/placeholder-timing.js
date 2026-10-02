"use strict";

const MIN_AFFINE_STRETCH = 25;
const MAX_AFFINE_STRETCH = 400;
const DOMAIN = Object.freeze([MIN_AFFINE_STRETCH, MAX_AFFINE_STRETCH]);
const EPSILON = 1e-6;

function isValidStretch(stretch) {
  return typeof stretch === "number" && Number.isFinite(stretch) && stretch >= MIN_AFFINE_STRETCH && stretch <= MAX_AFFINE_STRETCH;
}

function stretchFactor(stretch) {
  if (!isValidStretch(stretch)) {
    throw new Error(`unsupported_stretch:${stretch}`);
  }
  return stretch / 100;
}

function sourceAtTarget(targetStartTime, targetTime, stretch) {
  const k = stretchFactor(stretch);
  return (targetTime - targetStartTime) / k;
}

function targetAtSource(targetStartTime, sourceTime, stretch) {
  const k = stretchFactor(stretch);
  return targetStartTime + k * sourceTime;
}

function desiredStartTime(localIn, sourceIn, stretch) {
  const k = stretchFactor(stretch);
  return localIn - k * sourceIn;
}

function localDuration(srcDuration, stretch) {
  const k = stretchFactor(stretch);
  return k * srcDuration;
}

function sourceDuration(locDuration, stretch) {
  const k = stretchFactor(stretch);
  return locDuration / k;
}

function rootAtSource(rootIn, sourceIn, sourceTime, stretch) {
  const k = stretchFactor(stretch);
  return rootIn + k * (sourceTime - sourceIn);
}

function sourceAtRoot(rootIn, sourceIn, rootTime, stretch) {
  const k = stretchFactor(stretch);
  return sourceIn + (rootTime - rootIn) / k;
}

function isGridAligned(time, fps, tolerance = EPSILON) {
  if (typeof time !== "number" || !Number.isFinite(time) || typeof fps !== "number" || !Number.isFinite(fps) || fps <= 0) {
    return false;
  }
  if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > EPSILON) return false;
  const frame = time * fps;
  return Math.abs(frame - Math.round(frame)) <= tolerance;
}

function isCutRootAligned(rootIn, sourceIn, cutSourceTime, stretch, fps, tolerance = EPSILON) {
  if (!isValidStretch(stretch) || ![rootIn,sourceIn,cutSourceTime].every(Number.isFinite)) return false;
  const rootTime = rootAtSource(rootIn, sourceIn, cutSourceTime, stretch);
  return isGridAligned(rootTime, fps, tolerance);
}

function requiredMappedSamples(rootRange, sourceIn, stretch, fps) {
  const [r0, r1] = rootRange;
  const frameCount = Math.round((r1 - r0) * fps);
  if (frameCount < 1) return [];

  const selections = [
    { role: "first", offset: 0 },
    { role: "middle", offset: Math.floor((frameCount - 1) / 2) },
    { role: "last", offset: frameCount - 1 }
  ];

  const results = [];
  for (const sel of selections) {
    const existing = results.find(entry => entry.offsetFrame === sel.offset);
    if (existing) {
      existing.roles.push(sel.role);
      continue;
    }
    const rootTime = r0 + sel.offset / fps;
    const sourceTime = sourceAtRoot(r0, sourceIn, rootTime, stretch);
    results.push({
      roles: [sel.role],
      offsetFrame: sel.offset,
      rootTime,
      sourceTime
    });
  }
  return results;
}

function observedTargetTiming({ targetLayer, route = [], rootRange, sourceRange }) {
  if (!targetLayer || typeof targetLayer !== "object") {
    throw new Error("missing_target_layer");
  }
  const stretch = targetLayer.stretch;
  if (!isValidStretch(stretch)) {
    throw new Error(`unsupported_target_stretch:${stretch}`);
  }
  if (targetLayer.timeRemapEnabled !== false) {
    throw new Error("unsupported_target_time_remap");
  }

  let routeOffset = 0;
  for (const edge of route) {
    if (edge.stretch !== 100) {
      throw new Error(`unsupported_route_stretch:${edge.stretch}`);
    }
    if (edge.timeRemapEnabled !== false) {
      throw new Error("unsupported_route_time_remap");
    }
    routeOffset += edge.startTime;
  }

  const k = stretch / 100;
  const localRange = rootRange ? [rootRange[0] - routeOffset, rootRange[1] - routeOffset] : null;
  const targetStartTime = localRange && sourceRange ? desiredStartTime(localRange[0], sourceRange[0], stretch) : null;

  return {
    stretch,
    k,
    routeOffset,
    localRange,
    targetStartTime
  };
}

module.exports = {
  MIN_AFFINE_STRETCH,
  MAX_AFFINE_STRETCH,
  DOMAIN,
  EPSILON,
  isValidStretch,
  stretchFactor,
  sourceAtTarget,
  targetAtSource,
  desiredStartTime,
  localDuration,
  sourceDuration,
  rootAtSource,
  sourceAtRoot,
  isGridAligned,
  isCutRootAligned,
  requiredMappedSamples,
  observedTargetTiming
};
