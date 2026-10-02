/**
 * @file placeholder-framing.js
 * Pure framing helper for placeholder cover, bounds verification, and free source intervals.
 * Stage 3 implementation conforming to .codex-runtime/placeholder-improvements/stage3-contract.md
 * and .codex-runtime/placeholder-improvements/stage3-framing-fix.md.
 */

'use strict';

const { mediaKeyForSource } = require('./placeholder-usage');
const { isValidStretch, sourceAtRoot, isCutRootAligned, isGridAligned } = require('./placeholder-timing');
const EPSILON = 1e-8;

/**
 * Validates composite target identity { compItemId, layerId }.
 * Both must be positive integers.
 *
 * @param {*} target
 * @returns {boolean}
 */
function isValidTarget(target) {
  return (
    target !== null &&
    typeof target === 'object' &&
    Number.isSafeInteger(target.compItemId) &&
    target.compItemId > 0 &&
    Number.isSafeInteger(target.layerId) &&
    target.layerId > 0
  );
}

/**
 * Checks whether two target objects refer to the exact same composite target identity.
 *
 * @param {*} a
 * @param {*} b
 * @returns {boolean}
 */
function isSameTarget(a, b) {
  if (!isValidTarget(a) || !isValidTarget(b)) return false;
  return a.compItemId === b.compItemId && a.layerId === b.layerId;
}

/**
 * Validates whether the layer geometry is supported by the static 2D rectangular framing model.
 * Conservative validation: fails on 3D, parents, rotation !== 0, masks, collapseTransformation,
 * non-square pixel aspect ratio, non-positive dimensions, non-finite frameRate/duration, or non-static transforms.
 *
 * @param {object} geometry
 * @returns {{ valid: boolean, reasons: string[] }}
 */
function validateGeometry(geometry) {
  const reasons = [];

  if (!geometry || typeof geometry !== 'object') {
    return { valid: false, reasons: ['geometry must be an object'] };
  }

  const { comp, source, layer } = geometry;

  if (!comp || typeof comp !== 'object') {
    reasons.push('comp geometry missing or invalid');
  } else {
    if (!Number.isFinite(comp.width) || comp.width <= 0) {
      reasons.push('comp.width must be a positive finite number');
    }
    if (!Number.isFinite(comp.height) || comp.height <= 0) {
      reasons.push('comp.height must be a positive finite number');
    }
    if (comp.pixelAspect !== 1) {
      reasons.push('comp.pixelAspect must be square (1)');
    }
  }

  if (!source || typeof source !== 'object') {
    reasons.push('source geometry missing or invalid');
  } else {
    if (!Number.isFinite(source.width) || source.width <= 0) {
      reasons.push('source.width must be a positive finite number');
    }
    if (!Number.isFinite(source.height) || source.height <= 0) {
      reasons.push('source.height must be a positive finite number');
    }
    if (source.pixelAspect !== 1) {
      reasons.push('source.pixelAspect must be square (1)');
    }
    if (!Number.isFinite(source.duration) || source.duration <= 0) {
      reasons.push('source.duration must be a positive finite number');
    }
    if (!Number.isFinite(source.frameRate) || source.frameRate <= 0) {
      reasons.push('source.frameRate must be a positive finite number');
    }
  }

  if (!layer || typeof layer !== 'object') {
    reasons.push('layer geometry missing or invalid');
  } else {
    if (layer.threeDLayer !== false) {
      reasons.push('layer.threeDLayer must be strictly false');
    }
    if (layer.parentLayerId !== null) {
      reasons.push('layer.parentLayerId must be strictly null (no parent layer)');
    }
    if (!Number.isFinite(layer.rotation) || Math.abs(layer.rotation) > EPSILON) {
      reasons.push('layer.rotation must be 0');
    }
    if (layer.transformStatic !== true) {
      reasons.push('layer.transformStatic must be strictly true');
    }
    if (layer.hasMasks !== false) {
      reasons.push('layer.hasMasks must be strictly false');
    }
    if (layer.collapseTransformation !== false) {
      reasons.push('layer.collapseTransformation must be strictly false');
    }
    let validAnchor = false;
    if (Array.isArray(layer.anchorPoint)) {
      if (layer.anchorPoint.length === 2 && Number.isFinite(layer.anchorPoint[0]) && Number.isFinite(layer.anchorPoint[1])) {
        validAnchor = true;
      } else if (
        layer.threeDLayer === false &&
        layer.anchorPoint.length === 3 &&
        Number.isFinite(layer.anchorPoint[0]) &&
        Number.isFinite(layer.anchorPoint[1]) &&
        Number.isFinite(layer.anchorPoint[2]) &&
        layer.anchorPoint[2] === 0
      ) {
        validAnchor = true;
      }
    }
    if (!validAnchor) {
      reasons.push('layer.anchorPoint must be a 2D array of finite numbers [ax, ay]');
    }
  }

  return {
    valid: reasons.length === 0,
    reasons,
  };
}

/**
 * Unwraps property values from raw numbers/arrays or { kind, value } normalized structures.
 *
 * @param {*} val
 * @returns {*}
 */
function unwrapValue(val) {
  if (val !== null && typeof val === 'object' && 'value' in val) {
    return val.value;
  }
  return val;
}

/**
 * Calculates uniform cover scale factor and position bounds for complete coverage of comp bounds.
 *
 * @param {number} compW
 * @param {number} compH
 * @param {number} sourceW
 * @param {number} sourceH
 * @param {number} ax Anchor point x
 * @param {number} ay Anchor point y
 * @returns {{ s: number, bounds: { minX: number, maxX: number, minY: number, maxY: number } }}
 */
function calculateCoverBounds(compW, compH, sourceW, sourceH, ax, ay) {
  const s = Math.max(compW / sourceW, compH / sourceH);
  const minX = compW - (sourceW - ax) * s;
  const maxX = ax * s;
  const minY = compH - (sourceH - ay) * s;
  const maxY = ay * s;
  return {
    s,
    bounds: { minX, maxX, minY, maxY },
  };
}

/**
 * Proposes uniform cover scale, anchor-aware position with subject intersection across sampled frames,
 * or identifies impossible crop and suggests free source interval alternatives.
 *
 * @param {object} params
 * @param {object} params.geometry Comp, source, and layer geometry.
 * @param {Array<object>} [params.samples] Visual observation samples with subjects.
 * @param {Array<number>} params.sourceRange [startSec, endSec] of source fragment.
 * @param {Array<number>} [params.shotBoundaries] Array of cut/shot times in source seconds.
 * @param {number} [params.marginPixels=0] Margin in comp pixels to preserve around subjects.
 * @param {*} [params.target] Target placeholder identity / structural record.
 * @param {object} [params.usage] Authoritative usage map of sources and intervals.
 * @returns {object}
 */
function proposePlaceholderCover({
  geometry,
  samples = [],
  sourceRange,
  shotBoundaries = [],
  marginPixels = 0,
  target = null,
  usage = null,
  timing = null,
}) {
  const geoCheck = validateGeometry(geometry);
  if (!geoCheck.valid) {
    return {
      status: 'ineligible',
      eligible: false,
      proposal: null,
      reasons: geoCheck.reasons,
      artisticReviewPending: true,
    };
  }

  const compW = geometry.comp.width;
  const compH = geometry.comp.height;
  const sourceW = geometry.source.width;
  const sourceH = geometry.source.height;
  const [ax, ay] = geometry.layer.anchorPoint;
  const fps = geometry.comp.frameRate === undefined ? geometry.source.frameRate : geometry.comp.frameRate;
  if (!Number.isFinite(fps) || fps <= 0) {
    return { status: 'ineligible', eligible: false, proposal: null, reasons: ['invalid comp sampling frameRate'], artisticReviewPending: true };
  }
  const sourceDuration = geometry.source.duration;

  if (
    !Array.isArray(sourceRange) ||
    sourceRange.length !== 2 ||
    !Number.isFinite(sourceRange[0]) ||
    !Number.isFinite(sourceRange[1]) ||
    sourceRange[0] < 0 ||
    sourceRange[1] <= sourceRange[0] ||
    sourceRange[1] > sourceDuration + EPSILON
  ) {
    return {
      status: 'ineligible',
      eligible: false,
      proposal: null,
      reasons: [
        `sourceRange must be [startSec, endSec] with 0 <= startSec < endSec <= source.duration (${sourceDuration})`,
      ],
      artisticReviewPending: true,
    };
  }

  if (
    !Number.isFinite(marginPixels) ||
    marginPixels < 0 ||
    marginPixels >= Math.min(compW, compH) / 2
  ) {
    return {
      status: 'ineligible',
      eligible: false,
      proposal: null,
      reasons: [
        `marginPixels must be >= 0 and < half min comp dimension (${Math.min(compW, compH) / 2})`,
      ],
      artisticReviewPending: true,
    };
  }

  // Cover calculation
  const { s, bounds: covBounds } = calculateCoverBounds(compW, compH, sourceW, sourceH, ax, ay);
  if (![s, ...Object.values(covBounds)].every(Number.isFinite)) {
    return { status: 'ineligible', eligible: false, proposal: null, reasons: ['calculated cover bounds are not finite'], artisticReviewPending: true };
  }

  let stretch = undefined;
  let rootFps = fps;
  let rootRange = null;
  if (timing !== undefined && timing !== null) {
    const validRange=r=>Array.isArray(r)&&r.length===2&&r.every(Number.isFinite)&&r[1]>r[0];
    if (!timing || typeof timing !== 'object' || !isValidStretch(timing.stretch) || !Number.isFinite(timing.rootFps) || timing.rootFps!==fps ||
        !validRange(timing.rootRange) || !validRange(timing.localRange) || !validRange(timing.sourceRange) ||
        timing.sourceRange[0]!==sourceRange[0] || timing.sourceRange[1]!==sourceRange[1] ||
        ![...timing.rootRange,...timing.localRange,timing.targetStartTime].every(t=>isGridAligned(t,timing.rootFps)) ||
        Math.abs(timing.rootRange[1]-timing.rootRange[0]-(sourceRange[1]-sourceRange[0])*timing.stretch/100)>1e-6 ||
        Math.abs(timing.localRange[1]-timing.localRange[0]-(timing.rootRange[1]-timing.rootRange[0]))>1e-6 ||
        Math.abs(timing.targetStartTime-(timing.localRange[0]-sourceRange[0]*timing.stretch/100))>1e-6)
      return {status:'ineligible',eligible:false,proposal:null,reasons:['incomplete_or_inconsistent_timing_context'],artisticReviewPending:true};
    if (timing.stretch !== undefined) {
      if (!isValidStretch(timing.stretch)) {
        return {
          status: 'ineligible',
          eligible: false,
          proposal: null,
          reasons: ['unsupported_target_stretch'],
          artisticReviewPending: true,
        };
      }
      stretch = timing.stretch;
    }
    if (timing.rootFps && Number.isFinite(timing.rootFps) && timing.rootFps > 0) {
      rootFps = timing.rootFps;
    }
    if (Array.isArray(timing.rootRange) && timing.rootRange.length === 2) {
      rootRange = timing.rootRange;
    }
  }

  const [startSec, endSec] = sourceRange;
  let requiredTimes;

  if (stretch !== undefined && stretch !== 100 && rootRange) {
    const frameCount = Math.round((rootRange[1] - rootRange[0]) * rootFps);
    if (frameCount < 1) {
      return {
        status: 'ineligible',
        eligible: false,
        proposal: null,
        reasons: ['rootRange duration must be at least 1 frame'],
        artisticReviewPending: true,
      };
    }
    const offset0 = 0;
    const offsetMid = Math.floor((frameCount - 1) / 2);
    const offsetLast = frameCount - 1;
    const r0 = rootRange[0] + offset0 / rootFps;
    const rMid = rootRange[0] + offsetMid / rootFps;
    const rLast = rootRange[0] + offsetLast / rootFps;
    requiredTimes = [
      sourceAtRoot(rootRange[0], startSec, r0, stretch),
      sourceAtRoot(rootRange[0], startSec, rMid, stretch),
      sourceAtRoot(rootRange[0], startSec, rLast, stretch),
    ];
  } else {
    // Exact builder-compatible frame sampling requirements:
    // frameCount = round((end - start) * fps), required offsets 0, floor((frameCount - 1) / 2), frameCount - 1
    const frameCount = Math.round((endSec - startSec) * fps);
    if (frameCount < 1) {
      return {
        status: 'ineligible',
        eligible: false,
        proposal: null,
        reasons: ['sourceRange duration must be at least 1 frame'],
        artisticReviewPending: true,
      };
    }

    const offset0 = 0;
    const offsetMid = Math.floor((frameCount - 1) / 2);
    const offsetLast = frameCount - 1;

    requiredTimes = [
      startSec + offset0 / fps,
      startSec + offsetMid / fps,
      startSec + offsetLast / fps,
    ];
  }

  // Validate shotBoundaries: array of finite numbers, <= 12 entries
  const interiorShots = [];
  if (shotBoundaries !== undefined && shotBoundaries !== null) {
    if (!Array.isArray(shotBoundaries)) {
      return {
        status: 'ineligible',
        eligible: false,
        proposal: null,
        reasons: ['shotBoundaries must be an array when provided'],
        artisticReviewPending: true,
      };
    }
    if (shotBoundaries.length > 12) {
      return {
        status: 'ineligible',
        eligible: false,
        proposal: null,
        reasons: ['shotBoundaries must not exceed 12 entries'],
        artisticReviewPending: true,
      };
    }
    for (let idx = 0; idx < shotBoundaries.length; idx++) {
      const shotTime = shotBoundaries[idx];
      if (typeof shotTime !== 'number' || !Number.isFinite(shotTime)) {
        return {
          status: 'ineligible',
          eligible: false,
          proposal: null,
          reasons: [`shotBoundaries[${idx}] must be a finite number`],
          artisticReviewPending: true,
        };
      }
      if (shotTime > startSec && shotTime < endSec) {
        if (stretch !== undefined && stretch !== 100 && rootRange) {
          if (!isCutRootAligned(rootRange[0], startSec, shotTime, stretch, rootFps)) {
            return {
              status: 'ineligible',
              eligible: false,
              proposal: null,
              reasons: ['unsupported_affine_cut_grid'],
              artisticReviewPending: true,
            };
          }
        }
        interiorShots.push(shotTime);
      }
    }
  }

  for (const shotTime of interiorShots) {
    if (!requiredTimes.some(rt => Math.abs(rt - shotTime) <= (stretch!==undefined && stretch!==100 ? 1e-6 : 0.25 / fps))) {
      requiredTimes.push(shotTime);
    }
  }
  requiredTimes.sort((a, b) => a - b);

  // Validate samples input
  if (!Array.isArray(samples)) {
    return {
      status: 'ineligible',
      eligible: false,
      proposal: null,
      reasons: ['samples must be an array when provided'],
      artisticReviewPending: true,
    };
  }

  if (samples.length > 24) {
    return {
      status: 'ineligible',
      eligible: false,
      proposal: null,
      reasons: ['samples exceed maximum allowed of 24'],
      artisticReviewPending: true,
    };
  }

  const frameTolerance = stretch!==undefined && stretch!==100 ? 1e-6 : 0.25 / fps;
  const sampleErrors = [];

  let minX = covBounds.minX;
  let maxX = covBounds.maxX;
  let minY = covBounds.minY;
  let maxY = covBounds.maxY;

  for (let i = 0; i < samples.length; i++) {
    const sm = samples[i];
    if (!sm || typeof sm !== 'object') {
      sampleErrors.push(`sample[${i}] must be an object`);
      continue;
    }
    if (stretch !== undefined && stretch !== 100 &&
        (!Number.isFinite(sm.sourceTime) || sm.sourceTime<startSec || sm.sourceTime>=endSec || !isGridAligned(rootRange[0]+(sm.sourceTime-startSec)*stretch/100,rootFps))) {
      sampleErrors.push(`sample[${i}] is not a mapped root-grid sample`);
      continue;
    }

    // sourceTime must be within half-open media range [0, sourceDuration) without tolerance
    if (
      typeof sm.sourceTime !== 'number' ||
      !Number.isFinite(sm.sourceTime) ||
      sm.sourceTime < 0 ||
      sm.sourceTime >= sourceDuration
    ) {
      sampleErrors.push(
        `sample[${i}].sourceTime out of media half-open range [0, ${sourceDuration})`
      );
      continue;
    }

    // Within sourceRange bounds
    if (sm.sourceTime < startSec - frameTolerance || sm.sourceTime > endSec + frameTolerance) {
      sampleErrors.push(`sample[${i}].sourceTime out of range [${startSec}, ${endSec}]`);
      continue;
    }

    // coordinateSpace must be source_pixels
    if (sm.coordinateSpace !== 'source_pixels') {
      sampleErrors.push(`sample[${i}].coordinateSpace must be 'source_pixels'`);
    }

    // imageRef nonempty
    if (typeof sm.imageRef !== 'string' || sm.imageRef.trim().length === 0) {
      sampleErrors.push(`sample[${i}].imageRef must be a non-empty string`);
    }

    // imageSha256 64-hex string
    if (typeof sm.imageSha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(sm.imageSha256)) {
      sampleErrors.push(`sample[${i}].imageSha256 must be a 64-character hex string`);
    }

    // observation nonempty
    if (typeof sm.observation !== 'string' || sm.observation.trim().length === 0) {
      sampleErrors.push(`sample[${i}].observation must be a non-empty string`);
    }

    const hasNoSubjects = sm.noSignificantSubjects === true;
    const subjects = Array.isArray(sm.subjects) ? sm.subjects : [];

    if (!Array.isArray(sm.subjects) && !hasNoSubjects) {
      sampleErrors.push(`sample[${i}].subjects must be an array or explicit noSignificantSubjects: true`);
    } else if (subjects.length === 0 && !hasNoSubjects) {
      sampleErrors.push(`sample[${i}] has empty subjects without explicit noSignificantSubjects=true`);
    }

    for (let j = 0; j < subjects.length; j++) {
      const sub = subjects[j];
      if (!sub || typeof sub !== 'object') {
        sampleErrors.push(`sample[${i}].subjects[${j}] must be an object`);
        continue;
      }
      const validKinds = ['person', 'face', 'significant_subject'];
      if (!validKinds.includes(sub.kind)) {
        sampleErrors.push(`sample[${i}].subjects[${j}].kind must be one of: ${validKinds.join(', ')}`);
      }
      if (sub.coordinateSpace !== 'source_pixels') {
        sampleErrors.push(`sample[${i}].subjects[${j}] must specify coordinateSpace: 'source_pixels'`);
      }
      const box = sub.box;
      if (
        !Array.isArray(box) ||
        box.length !== 4 ||
        !box.every(Number.isFinite) ||
        box[0] < 0 ||
        box[1] < 0 ||
        box[2] <= box[0] ||
        box[3] <= box[1] ||
        box[2] > sourceW ||
        box[3] > sourceH
      ) {
        sampleErrors.push(`sample[${i}].subjects[${j}] box [l,t,r,b] must be finite positive interior coordinates`);
        continue;
      }

      const [left, top, right, bottom] = box;
      const subMinX = marginPixels - (left - ax) * s;
      const subMaxX = compW - marginPixels - (right - ax) * s;
      const subMinY = marginPixels - (top - ay) * s;
      const subMaxY = compH - marginPixels - (bottom - ay) * s;

      minX = Math.max(minX, subMinX);
      maxX = Math.min(maxX, subMaxX);
      minY = Math.max(minY, subMinY);
      maxY = Math.min(maxY, subMaxY);
    }
  }

  if (sampleErrors.length > 0) {
    return {
      status: 'ineligible',
      eligible: false,
      proposal: null,
      reasons: sampleErrors,
      artisticReviewPending: true,
    };
  }

  // Check matching sample times against required times
  const missingSampleTimes = [];
  for (const reqTime of requiredTimes) {
    const found = samples.some(
      sm =>
        sm &&
        typeof sm === 'object' &&
        typeof sm.sourceTime === 'number' &&
        Number.isFinite(sm.sourceTime) &&
        Math.abs(sm.sourceTime - reqTime) <= frameTolerance
    );
    if (!found) {
      missingSampleTimes.push(reqTime);
    }
  }

  // Check if intersection of coverage and subject bounds is empty
  const isIntersectionEmpty = minX > maxX + EPSILON || minY > maxY + EPSILON;

  if (isIntersectionEmpty) {
    let alternatives = null;
    if (usage && typeof usage === 'object') {
      let resolvedMediaKey = target?.mediaKey || null;
      let foundSource = null;
      if (Array.isArray(usage.sources)) {
        foundSource = usage.sources.find(
          src =>
            src &&
            ((target?.sourceItemId !== undefined && src.sourceItemId === target.sourceItemId) ||
              (resolvedMediaKey && src.mediaKey === resolvedMediaKey))
        );
        if (foundSource && !resolvedMediaKey) {
          resolvedMediaKey = foundSource.mediaKey;
        }
      }

      const sDuration =
        foundSource && Number.isFinite(foundSource.duration)
          ? foundSource.duration
          : geometry.source.duration;

      const sItemId =
        target?.sourceItemId !== undefined
          ? target.sourceItemId
          : foundSource
            ? foundSource.sourceItemId
            : undefined;

      alternatives = proposeAlternativeSourceIntervals({
        usage,
        target,
        mediaKey: resolvedMediaKey,
        sourceItemId: sItemId,
        sourceDuration: sDuration,
        duration: endSec - startSec,
        excludeRange: sourceRange,
        frameRate: geometry.source.frameRate,
        samplingFrameRate: fps,
        maxCandidates: 12,
      });
    }

    return {
      status: 'crop_impossible_for_samples',
      eligible: true,
      proposal: null,
      coverageBounds: covBounds,
      subjectBounds: { minX, maxX, minY, maxY },
      conflict: {
        emptyIntersection: true,
        horizontalEmpty: minX > maxX + EPSILON,
        verticalEmpty: minY > maxY + EPSILON,
      },
      alternatives,
      artisticReviewPending: true,
    };
  }

  // Centered position clamped within intersection bounds
  const idealX = compW / 2 - (sourceW / 2 - ax) * s;
  const idealY = compH / 2 - (sourceH / 2 - ay) * s;

  const posX = Math.max(minX, Math.min(maxX, idealX));
  const posY = Math.max(minY, Math.min(maxY, idealY));

  const proposal = {
    scale: [s * 100, s * 100],
    position: [posX, posY],
    anchorPoint: [ax, ay],
    rotation: 0,
  };

  if (missingSampleTimes.length > 0) {
    return {
      status: 'needs_sampling',
      eligible: true,
      needsSampling: true,
      missingSampleTimes,
      requiredTimes,
      proposal,
      coverageBounds: covBounds,
      subjectBounds: { minX, maxX, minY, maxY },
      artisticReviewPending: true,
    };
  }

  return {
    status: 'proposed',
    eligible: true,
    needsSampling: false,
    proposal,
    coverageBounds: covBounds,
    subjectBounds: { minX, maxX, minY, maxY },
    artisticReviewPending: true,
  };
}

/**
 * Pure geometric verification of actual layer transform against comp bounds.
 * Does not trust setter predicted bounds; checks uniform scale, anchor, position, rotation 0,
 * and confirms that all four edges cover the full comp rectangle within numeric epsilon.
 *
 * @param {object} params
 * @param {object} params.geometry
 * @param {object} params.transform Raw or normalized { scale, position, anchorPoint, rotation }
 * @returns {object}
 */
function verifyPlaceholderCoverage({ geometry, transform }) {
  const geoCheck = validateGeometry(geometry);
  if (!geoCheck.valid) {
    return {
      eligible: false,
      covered: false,
      status: 'ineligible',
      reasons: geoCheck.reasons,
      artisticReviewPending: true,
    };
  }

  if (!transform || typeof transform !== 'object') {
    return {
      eligible: false,
      covered: false,
      status: 'insufficient',
      reasons: ['transform must be an object'],
      artisticReviewPending: true,
    };
  }

  const reasons = [];

  // Scale: must be explicitly provided in transform, finite uniform positive 2D array or scalar
  let sx, sy;
  if (transform.scale === undefined) {
    reasons.push('transform.scale is required');
  } else {
    const rawScale = unwrapValue(transform.scale);
    if (
      Array.isArray(rawScale) &&
      rawScale.length === 2 &&
      Number.isFinite(rawScale[0]) &&
      Number.isFinite(rawScale[1])
    ) {
      sx = rawScale[0];
      sy = rawScale[1];
    } else if (
      geometry && geometry.layer && geometry.layer.threeDLayer === false &&
      Array.isArray(rawScale) &&
      rawScale.length === 3 &&
      Number.isFinite(rawScale[0]) &&
      Number.isFinite(rawScale[1]) &&
      Number.isFinite(rawScale[2]) &&
      rawScale[2] === 100
    ) {
      sx = rawScale[0];
      sy = rawScale[1];
    } else if (typeof rawScale === 'number' && Number.isFinite(rawScale)) {
      sx = rawScale;
      sy = rawScale;
    } else {
      reasons.push('transform.scale must be a finite number or 2D array [sx, sy]');
    }

    if (sx !== undefined && sy !== undefined) {
      if (sx <= 0 || sy <= 0) {
        reasons.push('transform.scale components must be strictly positive');
      }
      if (Math.abs(sx - sy) > EPSILON) {
        reasons.push(`transform.scale must be uniform, received sx=${sx}, sy=${sy}`);
      }
    }
  }

  // Position: must be explicitly provided in transform
  let px, py;
  if (transform.position === undefined) {
    reasons.push('transform.position is required');
  } else {
    const rawPosition = unwrapValue(transform.position);
    if (
      Array.isArray(rawPosition) &&
      rawPosition.length === 2 &&
      Number.isFinite(rawPosition[0]) &&
      Number.isFinite(rawPosition[1])
    ) {
      px = rawPosition[0];
      py = rawPosition[1];
    } else if (
      geometry && geometry.layer && geometry.layer.threeDLayer === false &&
      Array.isArray(rawPosition) &&
      rawPosition.length === 3 &&
      Number.isFinite(rawPosition[0]) &&
      Number.isFinite(rawPosition[1]) &&
      Number.isFinite(rawPosition[2]) &&
      rawPosition[2] === 0
    ) {
      px = rawPosition[0];
      py = rawPosition[1];
    } else {
      reasons.push('transform.position must be an array of 2 finite numbers [px, py]');
    }
  }

  // AnchorPoint: must be explicitly provided in transform, DO NOT fallback to geometry
  let ax, ay;
  if (transform.anchorPoint === undefined) {
    reasons.push('transform.anchorPoint is required');
  } else {
    const rawAnchor = unwrapValue(transform.anchorPoint);
    if (
      Array.isArray(rawAnchor) &&
      rawAnchor.length === 2 &&
      Number.isFinite(rawAnchor[0]) &&
      Number.isFinite(rawAnchor[1])
    ) {
      ax = rawAnchor[0];
      ay = rawAnchor[1];
    } else if (
      geometry && geometry.layer && geometry.layer.threeDLayer === false &&
      Array.isArray(rawAnchor) &&
      rawAnchor.length === 3 &&
      Number.isFinite(rawAnchor[0]) &&
      Number.isFinite(rawAnchor[1]) &&
      Number.isFinite(rawAnchor[2]) &&
      rawAnchor[2] === 0
    ) {
      ax = rawAnchor[0];
      ay = rawAnchor[1];
    } else {
      reasons.push('transform.anchorPoint must be an array of 2 finite numbers [ax, ay]');
    }
  }

  // Rotation: must be explicitly provided in transform, DO NOT fallback to geometry
  if (transform.rotation === undefined) {
    reasons.push('transform.rotation is required');
  } else {
    const rawRotation = unwrapValue(transform.rotation);
    if (!Number.isFinite(rawRotation) || Math.abs(rawRotation) > EPSILON) {
      reasons.push('transform.rotation must be strictly 0');
    }
  }

  if (reasons.length > 0) {
    return {
      eligible: false,
      covered: false,
      status: 'insufficient',
      reasons,
      artisticReviewPending: true,
    };
  }

  const s = sx / 100;
  const sourceW = geometry.source.width;
  const sourceH = geometry.source.height;
  const compW = geometry.comp.width;
  const compH = geometry.comp.height;

  // Actual bounds in comp space
  const left = px - ax * s;
  const right = px + (sourceW - ax) * s;
  const top = py - ay * s;
  const bottom = py + (sourceH - ay) * s;

  if (
    !Number.isFinite(left) ||
    !Number.isFinite(right) ||
    !Number.isFinite(top) ||
    !Number.isFinite(bottom)
  ) {
    return {
      eligible: false,
      covered: false,
      status: 'insufficient',
      reasons: ['calculated bounds are not finite numbers'],
      artisticReviewPending: true,
    };
  }

  // Tiny numeric epsilon (not halfpixel)
  const holes = {
    left: left > EPSILON,
    right: right < compW - EPSILON,
    top: top > EPSILON,
    bottom: bottom < compH - EPSILON,
  };

  const hasHole = holes.left || holes.right || holes.top || holes.bottom;
  const covered = !hasHole;

  const coverageReasons = [];
  if (holes.left) coverageReasons.push(`left edge hole: actual left ${left.toFixed(4)} > 0`);
  if (holes.right) coverageReasons.push(`right edge hole: actual right ${right.toFixed(4)} < comp width ${compW}`);
  if (holes.top) coverageReasons.push(`top edge hole: actual top ${top.toFixed(4)} > 0`);
  if (holes.bottom) coverageReasons.push(`bottom edge hole: actual bottom ${bottom.toFixed(4)} < comp height ${compH}`);

  return {
    eligible: true,
    covered,
    status: covered ? 'covered' : 'uncovered',
    actualBounds: { left, top, right, bottom },
    compBounds: { width: compW, height: compH },
    holes,
    scale: { x: sx, y: sy, uniform: true, factor: s },
    reasons: coverageReasons,
    artisticReviewPending: true,
  };
}

/**
 * Calculates alternative candidate free intervals from the same source mediaKey,
 * unifying duplicate imports, respecting authoritative usage, and snapping to frames.
 *
 * @param {object} params
 * @param {object} params.usage Authoritative usage map
 * @param {*} params.target Identity of placeholder being edited
 * @param {string} [params.mediaKey] Canonical or local media key
 * @param {string|number} [params.sourceItemId] Source item identifier in project
 * @param {number} params.sourceDuration Total duration of source media in seconds
 * @param {number} params.duration Desired duration of candidate interval in seconds
 * @param {Array<number>} [params.excludeRange] Range [startSec, endSec] of impossible current crop
 * @param {number} params.frameRate Media frame rate for interval snapping
 * @param {number} [params.samplingFrameRate] Target comp frame rate for review samples
 * @param {number} [params.maxCandidates=12] Maximum candidate intervals to return
 * @returns {object}
 */
function proposeAlternativeSourceIntervals({
  usage,
  target,
  mediaKey,
  sourceItemId,
  sourceDuration,
  duration,
  excludeRange,
  frameRate,
  samplingFrameRate = frameRate,
  maxCandidates = 12,
}) {
  // Strict check on authoritative usage map
  if (!usage || typeof usage !== 'object' || usage.ok !== true || usage.complete !== true) {
    return {
      status: 'unknown',
      candidates: [],
      reason: 'usage_incomplete_or_invalid',
    };
  }

  if (!Array.isArray(usage.sources)) {
    return {
      status: 'unknown',
      candidates: [],
      reason: 'usage_sources_invalid',
    };
  }
  const sourceIndex = new Map();
  for (const source of usage.sources) {
    if (!source || !Number.isSafeInteger(source.sourceItemId) || source.sourceItemId <= 0 || sourceIndex.has(source.sourceItemId)) {
      return { status: 'unknown', candidates: [], reason: 'invalid_or_duplicate_source_identity' };
    }
    sourceIndex.set(source.sourceItemId, source);
  }

  const fps = Number.isFinite(frameRate) && frameRate > 0 ? frameRate : null;
  if (!fps) {
    return {
      status: 'ineligible',
      candidates: [],
      reason: 'invalid_frame_rate',
    };
  }
  if (!Number.isFinite(samplingFrameRate) || samplingFrameRate <= 0) {
    return { status: 'ineligible', candidates: [], reason: 'invalid_sampling_frame_rate' };
  }

  if (!Number.isFinite(maxCandidates) || maxCandidates <= 0) {
    return {
      status: 'ineligible',
      candidates: [],
      reason: 'invalid_max_candidates',
    };
  }

  const minDuration = Math.max(1 / fps, 1 / samplingFrameRate);
  if (!Number.isFinite(duration) || duration < minDuration) {
    return {
      status: 'ineligible',
      candidates: [],
      reason: `duration must be at least 1 frame (${minDuration.toFixed(4)}s)`,
    };
  }

  // Resolve source item and media key
  let resolvedMediaKey = mediaKey || null;
  let matchingSource = null;

  if (sourceItemId !== undefined && sourceItemId !== null) {
    matchingSource = usage.sources.find(s => s && s.sourceItemId === sourceItemId);
    if (!matchingSource) {
      return {
        status: 'ineligible',
        candidates: [],
        reason: 'source_item_id_not_found',
      };
    }
    if (resolvedMediaKey && matchingSource.mediaKey !== resolvedMediaKey) {
      // Source ID cannot spoof another media key
      return {
        status: 'ineligible',
        candidates: [],
        reason: 'source_id_media_key_mismatch',
      };
    }
    resolvedMediaKey = matchingSource.mediaKey;
  } else if (resolvedMediaKey) {
    matchingSource = usage.sources.find(s => s && s.mediaKey === resolvedMediaKey);
    if (!matchingSource) {
      return {
        status: 'unknown',
        candidates: [],
        reason: 'media_key_not_found_in_sources',
      };
    }
  } else {
    return {
      status: 'unknown',
      candidates: [],
      reason: 'media_key_unresolved',
    };
  }

  // Authoritative duration check
  if (matchingSource.type !== 'footage' || typeof resolvedMediaKey !== 'string' ||
      resolvedMediaKey === 'unknown' || !resolvedMediaKey.startsWith('file:') ||
      mediaKeyForSource({itemId:matchingSource.sourceItemId,type:'footage',file:resolvedMediaKey}) !== resolvedMediaKey) {
    return { status: 'unknown', candidates: [], reason: 'unknown_or_unsupported_media_source' };
  }
  if (!Number.isFinite(matchingSource.duration) || matchingSource.duration <= 0) {
    return {
      status: 'unknown',
      candidates: [],
      reason: 'authoritative_source_duration_invalid',
    };
  }

  if (
    !Number.isFinite(sourceDuration) ||
    sourceDuration !== matchingSource.duration
  ) {
    return {
      status: 'ineligible',
      candidates: [],
      reason: 'caller_source_duration_mismatch',
    };
  }

  if (duration > sourceDuration) {
    return {
      status: 'ineligible',
      candidates: [],
      reason: 'requested duration exceeds source duration',
    };
  }

  // Target identity: composite compItemId + layerId positive integers
  if (!isValidTarget(target)) {
    return {
      status: 'ineligible',
      candidates: [],
      reason: 'invalid_target_identity',
    };
  }

  // Occurrences check: strictly 1 structural occurrence for target
  if (!Array.isArray(usage.occurrences)) {
    return {
      status: 'unknown',
      candidates: [],
      reason: 'usage_occurrences_invalid',
    };
  }

  const targetOccurrences = usage.occurrences.filter(occ => occ && isSameTarget(occ.target, target));
  if (targetOccurrences.length === 0) {
    return {
      status: 'unsupported',
      candidates: [],
      reason: 'phantom_target_no_occurrence',
    };
  }
  if (targetOccurrences.length > 1) {
    return {
      status: 'unsupported',
      candidates: [],
      reason: 'target_multiple_occurrences',
    };
  }

  // Entries check
  if (!Array.isArray(usage.entries)) {
    return {
      status: 'unknown',
      candidates: [],
      reason: 'usage_entries_invalid',
    };
  }

  // ExcludeRange check
  if (excludeRange !== undefined && excludeRange !== null) {
    if (
      !Array.isArray(excludeRange) ||
      excludeRange.length !== 2 ||
      !Number.isFinite(excludeRange[0]) ||
      !Number.isFinite(excludeRange[1]) ||
      excludeRange[0] < 0 ||
      excludeRange[1] <= excludeRange[0] ||
      excludeRange[1] > sourceDuration
    ) {
      return {
        status: 'ineligible',
        candidates: [],
        reason: 'invalid_exclude_range',
      };
    }
  }

  // Collect occupied intervals for entries sharing resolvedMediaKey
  const occupiedIntervals = [];

  for (let idx = 0; idx < usage.entries.length; idx++) {
    const ent = usage.entries[idx];
    if (!ent || typeof ent !== 'object') {
      return {
        status: 'unknown',
        candidates: [],
        reason: `malformed_entry_at_${idx}`,
      };
    }

    const entrySource = sourceIndex.get(ent.sourceItemId);
    if (!entrySource || typeof entrySource.mediaKey !== 'string' || !entrySource.mediaKey || ent.mediaKey !== entrySource.mediaKey) {
      return { status: 'unknown', candidates: [], reason: `entry_source_identity_mismatch_at_${idx}` };
    }
    const entMediaKey = entrySource.mediaKey;

    if (entMediaKey === resolvedMediaKey) {
      // Validate entry sourceRange: malformed occupied interval cannot vanish
      if (
        !Array.isArray(ent.sourceRange) ||
        ent.sourceRange.length !== 2 ||
        !Number.isFinite(ent.sourceRange[0]) ||
        !Number.isFinite(ent.sourceRange[1]) ||
        ent.sourceRange[0] < 0 ||
        ent.sourceRange[1] <= ent.sourceRange[0] ||
        ent.sourceRange[1] > sourceDuration
      ) {
        return {
          status: 'unknown',
          candidates: [],
          reason: `malformed_entry_source_range_at_${idx}`,
        };
      }

      // Exclude only exact target's own entries
      if (isSameTarget(ent.target, target)) {
        continue;
      }

      occupiedIntervals.push([ent.sourceRange[0], ent.sourceRange[1]]);
    }
  }

  if (Array.isArray(excludeRange)) {
    occupiedIntervals.push([excludeRange[0], excludeRange[1]]);
  }

  // Merge occupied intervals
  occupiedIntervals.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const mergedOccupied = [];
  for (const [start, end] of occupiedIntervals) {
    const clampedStart = Math.max(0, Math.min(sourceDuration, start));
    const clampedEnd = Math.max(0, Math.min(sourceDuration, end));
    if (clampedEnd <= clampedStart) continue;

    if (mergedOccupied.length === 0) {
      mergedOccupied.push([clampedStart, clampedEnd]);
    } else {
      const last = mergedOccupied[mergedOccupied.length - 1];
      if (clampedStart <= last[1]) {
        last[1] = Math.max(last[1], clampedEnd);
      } else {
        mergedOccupied.push([clampedStart, clampedEnd]);
      }
    }
  }

  // Compute free intervals
  const freeIntervals = [];
  let cur = 0;
  for (const [occStart, occEnd] of mergedOccupied) {
    if (occStart > cur) {
      freeIntervals.push([cur, occStart]);
    }
    cur = Math.max(cur, occEnd);
  }
  if (cur < sourceDuration) {
    freeIntervals.push([cur, sourceDuration]);
  }

  // Form candidates snapped up to frame without violating free interval
  const candidateLimit = Math.min(12, Math.max(1, Math.floor(maxCandidates)));
  const candidates = [];
  let totalFreeDuration = 0;

  for (const [fStart, fEnd] of freeIntervals) {
    const fLen = fEnd - fStart;
    totalFreeDuration += fLen;

    if (fLen < duration) {
      continue;
    }

    // Snap start UP to frame
    let candStart = Math.ceil(fStart * samplingFrameRate) / samplingFrameRate;
    if (candStart < fStart) {
      candStart = fStart;
    }

    while (candStart + duration <= fEnd && candidates.length < candidateLimit) {
      const candEnd = candStart + duration;

      if (!Number.isFinite(candEnd) || candEnd <= candStart) return { status: 'unknown', candidates: [], reason: 'interval_precision_insufficient' };
      const frameCount = Math.round(duration * samplingFrameRate);
      if (frameCount < 1) return { status: 'ineligible', candidates: [], reason: 'empty_sampling_frame_range' };
      const offset0 = 0;
      const offsetMid = Math.floor((frameCount - 1) / 2);
      const offsetLast = frameCount - 1;

      const sampleTimes = [
        candStart + offset0 / samplingFrameRate,
        candStart + offsetMid / samplingFrameRate,
        candStart + offsetLast / samplingFrameRate,
      ];
      if (sampleTimes.some(time => !Number.isFinite(time) || time < candStart || time >= candEnd)) {
        return { status: 'unknown', candidates: [], reason: 'sample_time_outside_candidate' };
      }

      candidates.push({
        sourceRange: [candStart, candEnd],
        duration,
        sampleTimes,
        needsVisualSampling: true,
      });

      candStart = Math.ceil(candEnd * samplingFrameRate) / samplingFrameRate;
      if (candStart < candEnd) {
        candStart += 1 / fps;
      }
    }
  }

  return {
    status: candidates.length > 0 ? 'candidates_found' : 'no_candidates',
    mediaKey: resolvedMediaKey,
    sourceItemId:
      sourceItemId !== undefined ? sourceItemId : matchingSource ? matchingSource.sourceItemId : null,
    candidates,
    totalFreeDuration,
    reason: candidates.length > 0 ? null : 'insufficient_free_duration',
  };
}

module.exports = {
  validateGeometry,
  proposePlaceholderCover,
  verifyPlaceholderCoverage,
  proposeAlternativeSourceIntervals,
};
