"use strict";

const { createHash } = require("node:crypto");
const {
  EPSILON, isRecord, isSafeId, isPositiveInteger: id, isNonNegativeInteger: uint,
  isFiniteNumber: finite, checkExactKeys, addBlocker
} = require("./montage-contract");
const list = value => Array.isArray(value) ? value : [];
const coverageKey = frame => `${frame.sceneId}:${frame.assignmentId}:${frame.rootFrame}`;
const frameIdFor = frame => "frame_" + createHash("sha256").update(coverageKey(frame)).digest("hex").slice(0, 24);

// Dedup within each use. A shared root frame may carry requirements for several targets.
// Shot order is semantic; scene/assignment collection order is not.
function computeRequiredFrameCoverage({ scenes = [], assignments = [], fps } = {}) {
  const requirements = new Map();
  if (!finite(fps) || fps <= 0) return requirements;
  function add(scene, assignment, frame, role, reason) {
    if (!uint(frame)) return;
    const fact = { sceneId: scene.sceneId, assignmentId: assignment.assignmentId,
      compItemId: assignment.target.compItemId, rootFrame: frame, rootTime: frame / fps };
    const key = coverageKey(fact);
    if (!requirements.has(key)) requirements.set(key, { ...fact, frameId: frameIdFor(fact), roles: new Set(), reasons: new Set() });
    requirements.get(key).roles.add(role);
    requirements.get(key).reasons.add(reason);
  }
  for (const scene of list(scenes)) {
    if (!isRecord(scene) || !Array.isArray(scene.rootRange)) continue;
    const sceneStart = Math.round(scene.rootRange[0] * fps), sceneEnd = Math.round(scene.rootRange[1] * fps);
    for (const assignment of list(assignments)) {
      if (!isRecord(assignment) || assignment.sceneId !== scene.sceneId || !isRecord(assignment.target) || !Array.isArray(assignment.sourceRange)) continue;
      const range = assignment.rootRange === undefined ? scene.rootRange : assignment.rootRange;
      if (!Array.isArray(range) || !range.every(finite) || range[1] <= range[0]) continue;
      const start = Math.round(range[0] * fps), end = Math.round(range[1] * fps);
      const inside = frame => frame >= start && frame < end && frame >= sceneStart && frame < sceneEnd;
      const mapped = time => Math.round((range[0] + time - assignment.sourceRange[0]) * fps);
      const anchors = (a, b) => [a, a + Math.floor((b - a - 1) / 2), b - 1];
      anchors(start, end).forEach((frame, i) => { if (inside(frame)) add(scene, assignment, frame, "assignment_anchor", ["assignment_start", "assignment_middle", "assignment_end"][i]); });
      anchors(sceneStart, sceneEnd).forEach((frame, i) => { if (inside(frame)) add(scene, assignment, frame, "scene_anchor", ["scene_start", "scene_middle", "scene_end"][i]); });
      for (const event of list(scene.cameraEvents)) if (finite(event?.rootTime)) {
        const frame = Math.round(event.rootTime * fps);
        if (inside(frame)) add(scene, assignment, frame, "camera_event", `camera_event_${event.eventId}`);
      }
      for (const shot of list(assignment.shots)) {
        if (!Array.isArray(shot?.sourceRange) || !shot.sourceRange.every(finite)) continue;
        const first = mapped(shot.sourceRange[0]), lastExclusive = mapped(shot.sourceRange[1]);
        const frame = first + Math.floor((lastExclusive - first - 1) / 2);
        if (inside(frame) && lastExclusive > first) add(scene, assignment, frame, "shot_anchor", `shot_interior_${shot.shotId}`);
      }
      for (let i = 0; i < list(assignment.shots).length - 1; i++) {
        const current = assignment.shots[i], next = assignment.shots[i + 1];
        if (!Array.isArray(current?.sourceRange)) continue;
        const frame = mapped(current.sourceRange[1]);
        if (inside(frame - 1)) add(scene, assignment, frame - 1, "cut_before", `cut_before_${current.shotId}_to_${next?.shotId}`);
        if (inside(frame)) add(scene, assignment, frame, "cut_after", `cut_after_${current.shotId}_to_${next?.shotId}`);
      }
      for (const sample of list(assignment.crop?.samples)) if (finite(sample?.sourceTime)) {
        const frame = mapped(sample.sourceTime);
        if (inside(frame)) add(scene, assignment, frame, "crop_event", "crop_sample");
      }
    }
  }
  return new Map([...requirements.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) =>
    [key, { ...value, roles: [...value.roles].sort(), reasons: [...value.reasons].sort() }]));
}

function verifyFrameCoverage({ manifestCoverage, requiredMap, limits, fps, scenes = [], assignments = [] }) {
  const blockers = [], coverage = new Map(), ids = new Map();
  if (!Array.isArray(manifestCoverage) || !manifestCoverage.length) {
    addBlocker(blockers, manifestCoverage === undefined ? "missing_frame_coverage" : "invalid_frame_coverage_container", "manifest.frameCoverage");
    return { valid: false, blockers };
  }
  if (manifestCoverage.length > limits.frameCoverage || requiredMap.size > limits.frameCoverage) {
    addBlocker(blockers, "frame_coverage_exceeds_budget", "manifest.frameCoverage");
    return { valid: false, blockers };
  }
  const sceneById = new Map(list(scenes).map(s => [s.sceneId, s]));
  const assignmentById = new Map(list(assignments).map(a => [a.assignmentId, a]));
  for (const [i, frame] of manifestCoverage.entries()) {
    const path = `manifest.frameCoverage[${i}]`;
    checkExactKeys(frame, ["frameId", "sceneId", "assignmentId", "compItemId", "rootFrame", "rootTime", "roles", "reasons"], path, blockers, "unknown_coverage_field");
    if (!isRecord(frame) || !isSafeId(frame.frameId) || !isSafeId(frame.sceneId) || !isSafeId(frame.assignmentId) ||
        !id(frame.compItemId) || !uint(frame.rootFrame) || !finite(frame.rootTime) || !finite(fps) || fps <= 0 ||
        Math.abs(frame.rootTime - frame.rootFrame / fps) > EPSILON ||
        !Array.isArray(frame.roles) || !frame.roles.length || frame.roles.some(r => typeof r !== "string" || !r || r.length > 256) ||
        !Array.isArray(frame.reasons) || !frame.reasons.length || frame.reasons.some(r => typeof r !== "string" || !r || r.length > 512)) {
      addBlocker(blockers, "invalid_frame_coverage_item", path); continue;
    }
    const scene = sceneById.get(frame.sceneId), assignment = assignmentById.get(frame.assignmentId);
    const range = assignment?.rootRange === undefined ? scene?.rootRange : assignment.rootRange;
    if (!scene || assignment?.sceneId !== frame.sceneId || assignment?.target?.compItemId !== frame.compItemId ||
        !Array.isArray(range) || frame.rootTime < range[0] || frame.rootTime >= range[1]) {
      addBlocker(blockers, "unbound_frame_coverage", path); continue;
    }
    const key = coverageKey(frame);
    if (ids.has(frame.frameId) && ids.get(frame.frameId) !== key) addBlocker(blockers, "duplicate_frame_id", `${path}.frameId`);
    ids.set(frame.frameId, key);
    const existing = coverage.get(key);
    if (existing && existing.frameId !== frame.frameId) addBlocker(blockers, "ambiguous_frame_identity", `${path}.frameId`);
    if (!existing) coverage.set(key, { ...frame, rootTime: frame.rootFrame / fps, roles: new Set(frame.roles), reasons: new Set(frame.reasons) });
    else { frame.roles.forEach(role => existing.roles.add(role)); frame.reasons.forEach(reason => existing.reasons.add(reason)); }
  }
  for (const [key, required] of requiredMap) {
    const present = coverage.get(key);
    if (!present) { addBlocker(blockers, "missing_required_coverage_frame", "manifest.frameCoverage", required, { sceneId: required.sceneId, assignmentId: required.assignmentId }); continue; }
    for (const [field, code] of [["roles", "missing_coverage_role"], ["reasons", "missing_coverage_reason"]]) {
      const missing = required[field].filter(value => !present[field].has(value));
      if (missing.length) addBlocker(blockers, code, `manifest.frameCoverage.${present.frameId}.${field}`, { missing }, { sceneId: required.sceneId, assignmentId: required.assignmentId });
    }
  }
  if (blockers.length) return { valid: false, blockers };
  const normalized = [...coverage.values()].map(frame => ({ ...frame, roles: [...frame.roles].sort(), reasons: [...frame.reasons].sort() }))
    .sort((a, b) => coverageKey(a).localeCompare(coverageKey(b)));
  return { valid: true, blockers: [], normalized };
}

module.exports = { computeRequiredFrameCoverage, verifyFrameCoverage };
