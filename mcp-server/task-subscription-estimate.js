"use strict";

const { compareQuota } = require("./subscription-usage");

const nullEstimate = (reason, eligibleIntervals = 0) => ({ percent: null, range: null, reason, eligibleIntervals });
const finitePositive = (value) => typeof value === "number" && Number.isFinite(value) && value > 0;

function weightedUnits(usage, speeds, weights) {
  if (!usage || !usage.models || !speeds || !weights) return null;
  let total = 0;
  for (const [model, row] of Object.entries(usage.models)) {
    const weight = weights[`${model}|${speeds[model]}`];
    if (!weight || ![weight.uncachedInput, weight.cachedInput, weight.output].every(finitePositive)) return null;
    if (![row.uncachedInputTokens, row.cachedInputTokens, row.outputTokens].every((n) => Number.isSafeInteger(n) && n >= 0)) return null;
    total += row.uncachedInputTokens * weight.uncachedInput + row.cachedInputTokens * weight.cachedInput + row.outputTokens * weight.output;
  }
  return finitePositive(total) ? total : null;
}

function estimateTaskPercent(task, calibration, currentQuota) {
  if (!calibration || calibration.schema !== "codex-subscription-calibration.v1" || !calibration.weightSource || !calibration.windowLabel || !calibration.weights || !Array.isArray(calibration.intervals)) return nullEstimate("invalid_calibration");
  if (!currentQuota || !currentQuota.plan || !currentQuota.label || !currentQuota.resetAt) return nullEstimate("current_quota_unavailable");
  if (currentQuota.label !== calibration.windowLabel) return nullEstimate("window_mismatch");
  if (!calibration.taskSpeedVerified) return nullEstimate("task_speed_unverified");
  const taskUnits = weightedUnits(task, calibration.taskSpeeds, calibration.weights);
  if (!taskUnits) return nullEstimate("task_weights_or_usage_missing");
  const coefficients = [];
  const intervals = [];
  const seenIds = new Set();
  for (const row of calibration.intervals) {
    if (!row || !row.coverageVerified || !row.isolationVerified || !row.accountIdentityVerified || !row.speedVerified) continue;
    if (!row.before || row.before.plan !== currentQuota.plan || row.before.label !== currentQuota.label) continue;
    const comparison = compareQuota(row.before, row.after);
    // One percentage point is the minimum usable meter movement at integer precision.
    if (comparison.percentagePoints === null || comparison.percentagePoints < 1) continue;
    const units = weightedUnits(row.usage, row.speeds, calibration.weights);
    if (!units) continue;
    if (typeof row.id !== "string" || !row.id || seenIds.has(row.id)) return nullEstimate("duplicate_or_missing_interval_id");
    seenIds.add(row.id);
    intervals.push({ start: Date.parse(row.before.observedAt), end: Date.parse(row.after.observedAt) });
    coefficients.push(comparison.percentagePoints / units);
  }
  intervals.sort((a, b) => a.start - b.start);
  if (intervals.some((row, i) => i > 0 && row.start < intervals[i - 1].end)) return nullEstimate("overlapping_intervals");
  if (coefficients.length < 3) return nullEstimate("insufficient_comparable_intervals", coefficients.length);
  coefficients.sort((a, b) => a - b);
  if (coefficients.at(-1) / coefficients[0] > 2) return nullEstimate("inconsistent_calibration", coefficients.length);
  const rounded = (n) => Math.round(n * 1000) / 1000;
  return {
    percent: rounded(coefficients[Math.floor(coefficients.length / 2)] * taskUnits),
    range: [rounded(coefficients[0] * taskUnits), rounded(coefficients.at(-1) * taskUnits)],
    reason: "empirical_estimate", eligibleIntervals: coefficients.length,
    scope: "task_estimate", isolation: "attested_in_calibration_file"
  };
}

module.exports = { weightedUnits, estimateTaskPercent };
