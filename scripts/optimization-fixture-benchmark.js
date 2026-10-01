"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { buildPlaceholderPlan } = require("../mcp-server/placeholder-plan-builder");
const { verifyPlaceholderReadBack } = require("../mcp-server/placeholder-readback");
const { projectPlaceholderLayerEvidence } = require("../mcp-server/placeholder-evidence");
const { evaluateAmePassiveStatus } = require("../mcp-server/ame-passive-status");
const { validateAmeMedia } = require("../mcp-server/ame-media-probe");

const bytes = (value) => Buffer.byteLength(JSON.stringify(value), "utf8");
const rootComp = { itemId: 10, itemIndex: 2, name: "Fixture Root", duration: 12, frameRate: 30 };
const targetComp = { itemId: 20, itemIndex: 4, name: "Fixture Child", duration: 12, frameRate: 30 };
const route = { parentCompItemId: 10, childCompItemId: 20, layerId: 30, layerIndex: 1,
  startTime: 0, inPoint: 0, outPoint: 12, stretch: 100, timeRemapEnabled: false };

function placeholder(index, rootRange, sourceRange, startTime = 0) {
  return { rootComp, targetComp, route: [{ ...route, startTime }],
    targetLayer: { id: 40 + index, index, name: `Image ${index}`, sourceItemId: 50 + index,
      locked: false, stretch: 100, timeRemapEnabled: false },
    sourceItem: { itemId: 60 + index, itemIndex: 10 + index, name: `Shot ${index}`, type: "footage", duration: 240 },
    rootRange, sourceRange };
}

function observedFrom(expected) {
  return { comp: { itemIndex: expected.compItemIndex, itemId: expected.compItemId,
    name: expected.compName, frameRate: expected.frameRate },
  layer: { index: expected.layerIndex, id: expected.layerId, name: expected.layerName,
    locked: false, source: { itemId: expected.sourceItemId, name: expected.sourceName, duration: 240, frameRate: 30 },
    startTime: expected.startTime, inPoint: expected.inPoint, outPoint: expected.outPoint,
    stretch: 100, timeRemapEnabled: false, effects: [{ name: "Fixture Effect" }] } };
}

function runPlaceholderCase(caseId, inputs) {
  const start = performance.now();
  const results = inputs.map((input) => buildPlaceholderPlan(input));
  const durationMs = performance.now() - start;
  assert(results.every((row) => row.ok), `${caseId}: plan failed`);
  const checks = results.map((row) => verifyPlaceholderReadBack(row.expectedReadBack, observedFrom(row.expectedReadBack)));
  assert(checks.every((row) => row.ok), `${caseId}: synthetic read-back failed`);
  const frames = results.flatMap((row) => row.frameReview);
  assert(results.every((row) => row.frameReview.length <= 3), `${caseId}: more than three review frames`);
  assert(results.every((row) => new Set(row.frameReview.map((frame) => frame.offsetFrame)).size === row.frameReview.length));
  const fullEvidence = results.map((row) => observedFrom(row.expectedReadBack));
  const compactEvidence = fullEvidence.map(projectPlaceholderLayerEvidence);
  return { caseId, planCount: results.length, planStepCount: results.reduce((n, row) => n + row.plan.steps.length, 0),
    selectedFrameCount: frames.length, planOutputBytes: bytes(results),
    fullEvidenceBytes: bytes(fullEvidence), compactEvidenceBytes: bytes(compactEvidence),
    syntheticReadBackPassed: checks.length, durationMs: Number(durationMs.toFixed(3)) };
}

function runAmeCase() {
  const job = { schema: "ae-agent-ame-job.v1", jobId: "synthetic-only", preset: "H.264 Fixture",
    outputPath: path.resolve("fixture-output.mp4"), range: { startSeconds: 0, endSeconds: 1 },
    expectedVideoCodec: "h264", expectedContainer: "mp4", submittedAt: "2026-09-28T10:00:00.000Z" };
  const previous = { job, file: { exists: true, bytes: 100, modifiedAt: "2026-09-28T10:01:00.000Z" },
    checkedAt: "2026-09-28T10:01:00.000Z" };
  const file = { exists: true, bytes: 200, modifiedAt: "2026-09-28T10:02:00.000Z" };
  const now = Date.parse("2026-09-28T10:03:00.000Z");
  const start = performance.now();
  const growing = evaluateAmePassiveStatus(job, null, file, previous, now);
  const done = evaluateAmePassiveStatus(job, { ...job, status: "done", observedAt: "2026-09-28T10:02:00.000Z" }, file, previous, now);
  const technical = validateAmeMedia(job, { format: { duration: "1.00", format_name: "mov,mp4,m4a,3gp,3g2,mj2" },
    streams: [{ codec_type: "video", codec_name: "h264" }] }, { status: 0 });
  const durationMs = performance.now() - start;
  assert.equal(growing.state, "output_growing");
  assert.equal(done.state, "needs_media_probe");
  assert.equal(done.completionVerified, false);
  assert.equal(technical.technicalMediaVerified, true);
  return { caseId: "ame_passive_and_media_metadata", passiveStates: [growing.state, done.state],
    mediaValidatorAcceptedFixture: technical.technicalMediaVerified,
    technicalMediaVerified: false, completionVerified: false, outputBytes: bytes({ growing, done, technical }),
    durationMs: Number(durationMs.toFixed(3)) };
}

const cases = [
  runPlaceholderCase("three_placeholders", [
    placeholder(1, [0, 4], [10, 14]), placeholder(2, [4, 8], [20, 24]), placeholder(3, [8, 12], [30, 34])]),
  runPlaceholderCase("nested_offset", [placeholder(1, [4, 8], [100, 104], 2)]),
  runPlaceholderCase("split_50_50", [placeholder(1, [4, 6], [200, 202]), placeholder(2, [6, 8], [202, 204])]),
  runAmeCase()
];
console.log(JSON.stringify({ schema: "ae-agent-optimization-fixtures.v1", fixtureScope: "offline_synthetic",
  cases, usage: { modelCallsObserved: 0, inputTokens: null, cachedInputTokens: null, outputTokens: null,
    reason: "fixture_runner_has_no_model_meter" }, comparison: { comparableAB: false, tokenSavingsPercent: null,
    subscriptionSavingsPercent: null }, limitations: ["synthetic read-back is not AE read-back",
    "AME metadata fixture does not run ffprobe or ffmpeg", "single-run duration is diagnostic only"] }, null, 2));
