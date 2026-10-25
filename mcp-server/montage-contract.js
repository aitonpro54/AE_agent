"use strict";

// Pure V1 primitives. Caller budgets can only tighten these ceilings.
const MANIFEST_SCHEMA = "ae-agent-montage-manifest.v1";
const MATERIALS_SCHEMA = "ae-agent-prepared-materials.v1";
const OBSERVATIONS_SCHEMA = "ae-agent-montage-observations.v1";
const DEFAULT_HARD_CEILINGS = Object.freeze({
  scenes: 32, assignments: 32, materials: 32, groups: 32, routeDepth: 4,
  shotsPerAssignment: 12, frameCoverage: 768, dependencyEdges: 512, graphNodes: 5000,
  snapshotBytes: 4194304, manifestBytes: 262144, materialsBytes: 262144, maxSteps: 50,
  materialFileBytes: 536870912, materialTotalBytes: 2147483648, materialReadRequests: 32
});
const ALLOWED_GROUP_PROVENANCES = new Set(["explicit_metadata", "user_confirmed"]);
const ALLOWED_CROP_MODES = new Set(["static-cover"]);
const ALLOWED_DEPENDENCY_KINDS = new Set(["target", "source", "route"]);
const EPSILON = 1e-4;
const isPositiveInteger = value => Number.isSafeInteger(value) && value > 0;
const isNonNegativeInteger = value => Number.isSafeInteger(value) && value >= 0;
const isFiniteNumber = value => typeof value === "number" && Number.isFinite(value);
const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);
const isSafeId = value => typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
const isSha256 = value => typeof value === "string" && /^[0-9a-f]{64}$/i.test(value);
const isTimeAligned = (value, fps) => isFiniteNumber(value) && isFiniteNumber(fps) && fps > 0 &&
  Math.abs(value * fps - Math.round(value * fps)) <= EPSILON;
const isIso8601 = value => typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(value) && Number.isFinite(Date.parse(value));
const isAbsolutePath = value => typeof value === "string" && !/[\x00-\x1f]/.test(value) &&
  (/^[a-zA-Z]:[\\/]/.test(value) || value.startsWith("/"));
const normalizePath = value => typeof value === "string" ? value.replace(/\\/g, "/").replace(/^([A-Z]):/, (_, d) => d.toLowerCase() + ":") : "";
const deepClone = value => value === null || typeof value !== "object" ? value :
  Array.isArray(value) ? value.map(deepClone) : Object.fromEntries(Object.entries(value).map(([k, v]) => [k, deepClone(v)]));
const canonical = value => Array.isArray(value) ? value.map(canonical) : isRecord(value) ?
  Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
const stableJson = value => JSON.stringify(canonical(value));
const sortedSet = values => values.map(canonical).sort((a, b) => stableJson(a).localeCompare(stableJson(b)));

function addBlocker(blockers, code, path, details, extra = {}) {
  blockers.push({ code, path, ...(details === undefined ? {} : { details }), ...extra });
}
function checkExactKeys(obj, allowed, path, blockers, code = "unknown_manifest_field") {
  if (!isRecord(obj)) return;
  for (const key of Object.keys(obj)) if (!allowed.includes(key)) addBlocker(blockers, code, `${path}.${key}`);
}
function normalizeBudgets(value = {}) {
  const budgets = { ...DEFAULT_HARD_CEILINGS }, blockers = [];
  const safety = inspectPayloadSafety(value, 4096);
  if (!isRecord(value) || safety.invalid || safety.exceeded || safety.depthExceeded || safety.cycleDetected) addBlocker(blockers, "invalid_budgets_container", "budgets");
  else for (const [key, count] of Object.entries(value)) {
    if (!Object.hasOwn(budgets, key)) addBlocker(blockers, "unknown_budget_key", `budgets.${key}`);
    else if (!isPositiveInteger(count)) addBlocker(blockers, "invalid_budget_value", `budgets.${key}`);
    else if (count > budgets[key]) addBlocker(blockers, "budget_exceeds_hard_ceiling", `budgets.${key}`, { ceiling: budgets[key], provided: count });
    else budgets[key] = count;
  }
  return { budgets: Object.freeze(budgets), blockers };
}

// Count actual UTF-8 JSON bytes while bounding traversal, before cloning/semantic work.
// Reject non-JSON values, accessors, sparse arrays and cycles without invoking getters.
function inspectPayloadSafety(root, maxBytes, maxDepth = 25) {
  const ancestors = new Set();
  let totalBytes = 0, cycleDetected = false, depthExceeded = false, invalid = false;
  const stopped = () => invalid || cycleDetected || depthExceeded || totalBytes > maxBytes;
  function stringBytes(value) {
    if (value.length > maxBytes) { totalBytes = maxBytes + 1; return; }
    totalBytes += Buffer.byteLength(JSON.stringify(value), "utf8");
  }
  function walk(value, depth) {
    if (stopped()) return;
    if (depth > maxDepth) { depthExceeded = true; return; }
    if (value === null) { totalBytes += 4; return; }
    if (typeof value === "string") { stringBytes(value); return; }
    if (typeof value === "boolean") { totalBytes += value ? 4 : 5; return; }
    if (isFiniteNumber(value)) { totalBytes += String(value).length; return; }
    if (typeof value !== "object") { invalid = true; return; }
    if (ancestors.has(value)) { cycleDetected = true; return; }
    if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) { invalid = true; return; }
    ancestors.add(value);
    const keys = Object.keys(value);
    if (Object.getOwnPropertyNames(value).some(key => !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), "value"))) { invalid = true; return; }
    if (Object.getOwnPropertySymbols(value).length || Array.isArray(value) && keys.length !== value.length) { invalid = true; return; }
    totalBytes += 2 + Math.max(0, keys.length - 1);
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.hasOwn(descriptor, "value")) { invalid = true; break; }
      if (!Array.isArray(value)) { stringBytes(key); totalBytes++; }
      walk(descriptor.value, depth + 1);
      if (stopped()) break;
    }
    ancestors.delete(value);
  }
  try { walk(root, 0); } catch { invalid = true; }
  return { totalBytes, cycleDetected, depthExceeded, invalid, exceeded: totalBytes > maxBytes };
}

module.exports = {
  MANIFEST_SCHEMA, MATERIALS_SCHEMA, OBSERVATIONS_SCHEMA, DEFAULT_HARD_CEILINGS,
  ALLOWED_GROUP_PROVENANCES, ALLOWED_CROP_MODES, ALLOWED_DEPENDENCY_KINDS, EPSILON,
  isPositiveInteger, isNonNegativeInteger, isFiniteNumber, isRecord, isSafeId, isIso8601,
  isSha256, isAbsolutePath, normalizePath, isTimeAligned, deepClone, canonical, stableJson, sortedSet,
  normalizeBudgets, inspectPayloadSafety, checkExactKeys, addBlocker
};
