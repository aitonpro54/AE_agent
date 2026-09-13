"use strict";

const assert = require("assert");
const {
  AB_REPORT_SCHEMA_VERSION,
  summarizeTrials
} = require("./solution-ab-report");

function trial(overrides) {
  return {
    caseId: "trim-layers",
    variant: "raw",
    repetition: 1,
    model: "test-model",
    effort: "medium",
    aeVersion: "25.0",
    baselineId: "scene-a",
    language: "ru",
    success: true,
    verified: true,
    durationMs: 100,
    usage: { inputTokens: 10, outputTokens: 20, cachedInputTokens: 2 },
    ...overrides
  };
}

function group(report, variant, model = "test-model") {
  return report.groups.find((item) => item.variant === variant && item.settings.model === model);
}

function assertThrows(fn, pattern) {
  assert.throws(fn, (error) => pattern.test(error.message), `Expected error matching ${pattern}.`);
}

function main() {
  const report = summarizeTrials([
    trial({ usage: { inputTokens: 10, outputTokens: 20, cachedInputTokens: 2 } }),
    trial({ caseId: "trim-layers", repetition: 2, success: false, verified: false, durationMs: 50,
      usage: { inputTokens: 5, outputTokens: 7, cachedInputTokens: 1 } }),
    trial({ caseId: "trim-layers", variant: "typed", repetition: 1, durationMs: 80,
      usage: { inputTokens: 8, outputTokens: 12, cachedInputTokens: 3 } }),
    trial({ caseId: "trim-layers", variant: "typed", repetition: 2, success: false, verified: false,
      durationMs: 40, usage: { inputTokens: 4, outputTokens: 6, cachedInputTokens: 1 } }),
    trial({ caseId: "replace-colors", variant: "raw", repetition: 1, success: false, verified: false,
      durationMs: 90, usage: null }),
    trial({ caseId: "replace-colors", variant: "raw", repetition: 2, success: true, verified: true,
      durationMs: 30, usage: { inputTokens: 2, outputTokens: null, cachedInputTokens: null } }),
    trial({ caseId: "trim-layers", variant: "reuse", repetition: 1, model: "other-model" })
  ]);
  assert.strictEqual(report.schemaVersion, AB_REPORT_SCHEMA_VERSION);
  const raw = group(report, "raw");
  const typed = group(report, "typed");
  const other = group(report, "reuse", "other-model");
  assert(raw && typed && other);
  assert.strictEqual(raw.trials, 4, "failed trials must remain in the trial count");
  assert.strictEqual(raw.successfulVerified, 2);
  assert.strictEqual(raw.successRate, 0.5);
  assert.strictEqual(raw.totalDurationMs, 270);
  assert.strictEqual(raw.observedInputTokens, 17, "known input tokens include failed trials");
  assert.strictEqual(raw.observedOutputTokens, 27, "known output tokens include failed trials");
  assert.strictEqual(raw.observedCachedInputTokens, 3);
  assert.strictEqual(raw.unknownUsageTrials, 2);
  assert.strictEqual(raw.costPerSuccessfulTask, null, "incomplete usage makes per-task cost unknown");
  assert.strictEqual(typed.matchedTrialSets, false, "sets differ from the raw configuration");
  assert.strictEqual(other.matchedTrialSets, false, "different settings are isolated");

  const matched = summarizeTrials([
    trial({ variant: "raw" }),
    trial({ variant: "typed" })
  ]);
  assert.strictEqual(group(matched, "raw").matchedTrialSets, true);
  assert.strictEqual(group(matched, "typed").matchedTrialSets, true);
  assert.deepStrictEqual(group(matched, "raw").costPerSuccessfulTask,
    { inputTokens: 10, outputTokens: 20, cachedInputTokens: 2 });

  const unknown = summarizeTrials([trial({ usage: null, success: false, verified: false })]);
  assert.strictEqual(group(unknown, "raw").observedInputTokens, null, "unknown usage must not become zero");
  assert.strictEqual(group(unknown, "raw").observedOutputTokens, null);
  assert.strictEqual(group(unknown, "raw").unknownUsageTrials, 1);

  assertThrows(() => summarizeTrials([
    trial(),
    trial()
  ]), /Duplicate trial/);
  assertThrows(() => summarizeTrials([trial({ variant: "RAW" })]), /variant/);
  assertThrows(() => summarizeTrials([trial({ usage: { inputTokens: -1, outputTokens: 1, cachedInputTokens: 1 } })]), /non-negative/);
  assertThrows(() => summarizeTrials([trial({ usage: { inputTokens: 1, outputTokens: 1 } })]), /unknown field|cachedInputTokens/);

  console.log(JSON.stringify({
    ok: true,
    schemaVersion: report.schemaVersion,
    groups: report.groups.length,
    failedTrialsIncluded: true,
    unknownUsageStaysUnknown: true,
    duplicateTrialsRejected: true,
    settingsAndTrialSetsSeparated: true
  }, null, 2));
}

main();
