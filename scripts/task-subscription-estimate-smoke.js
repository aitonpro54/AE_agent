"use strict";

const assert = require("assert");
const { estimateTaskPercent } = require("../mcp-server/task-subscription-estimate");

const before = { label: "Weekly", plan: "Example", usedPercent: 10, resetAt: "2026-10-04T14:18:39Z", observedAt: "2026-09-28T10:00:00Z" };
const after = { ...before, usedPercent: 12, observedAt: "2026-09-28T11:00:00Z" };
const usage = { models: { "gpt-6-sol": { uncachedInputTokens: 100, cachedInputTokens: 50, outputTokens: 20 } } };
const interval = (id, hour) => ({ id, before: { ...before, observedAt: `2026-09-28T${hour}:00:00Z` }, after: { ...after, observedAt: `2026-09-28T${hour + 1}:00:00Z` }, usage, speeds: { "gpt-6-sol": "standard" }, speedVerified: true, coverageVerified: true, isolationVerified: true, accountIdentityVerified: true });
const calibration = { schema: "codex-subscription-calibration.v1", windowLabel: "Weekly", weightSource: "offline-test", weights: {
  "gpt-6-sol|standard": { uncachedInput: 1, cachedInput: 0.1, output: 4 }
}, taskSpeeds: { "gpt-6-sol": "standard" }, taskSpeedVerified: true, intervals: [interval("a", 10), interval("b", 11), interval("c", 12)] };

assert.equal(estimateTaskPercent(usage, calibration, before).percent, 2);
assert.deepEqual(estimateTaskPercent(usage, calibration, before).range, [2, 2]);
assert.equal(estimateTaskPercent(usage, { ...calibration, intervals: calibration.intervals.slice(0, 2) }, before).reason, "insufficient_comparable_intervals");
assert.equal(estimateTaskPercent(usage, { ...calibration, taskSpeedVerified: false }, before).reason, "task_speed_unverified");
assert.equal(estimateTaskPercent(usage, calibration, null).reason, "current_quota_unavailable");
assert.equal(estimateTaskPercent(usage, { ...calibration, weights: {} }, before).reason, "task_weights_or_usage_missing");
assert.equal(estimateTaskPercent(usage, { ...calibration, intervals: [interval("a", 10), interval("b", 11), { ...interval("c", 12), isolationVerified: false }] }, before).percent, null);
assert.equal(estimateTaskPercent(usage, { ...calibration, intervals: [interval("a", 10), interval("b", 11), { ...interval("c", 12), after: { ...after, resetAt: "2026-10-11T14:18:39Z" } }] }, before).percent, null);
assert.equal(estimateTaskPercent(usage, { ...calibration, intervals: [interval("a", 10), interval("b", 11), { ...interval("c", 12), after: { ...after, usedPercent: 19, observedAt: "2026-09-28T13:00:00Z" } }] }, before).reason, "inconsistent_calibration");
assert.equal(estimateTaskPercent(usage, { ...calibration, intervals: [interval("a", 10), interval("a", 11), interval("c", 12)] }, before).reason, "duplicate_or_missing_interval_id");
assert.equal(estimateTaskPercent(usage, { ...calibration, intervals: [interval("a", 10), interval("b", 10), interval("c", 12)] }, before).reason, "overlapping_intervals");
console.log(JSON.stringify({ ok: true, checks: "empirical range, three intervals, missing weights/speed/quota, isolation/reset, coefficient consistency" }));
