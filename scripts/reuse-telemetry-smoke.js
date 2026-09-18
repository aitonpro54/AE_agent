"use strict";
const assert = require("assert");
const { summarizeUsage, summarizeReuse, summarizeRun } = require("../mcp-server/reuse-telemetry");
const { summarizeEvents, readEvents } = require("./solution-usage-report");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
assert.strictEqual(summarizeUsage(null), null);
assert.strictEqual(summarizeUsage({input_tokens: "50", secret: "never copy"}), null);
assert.deepStrictEqual(summarizeUsage({input_tokens: 100, output_tokens: 20, cached_input_tokens: 50}), {
  inputTokens: 100, outputTokens: 20, cachedInputTokens: 50, reasoningTokens: null, totalTokens: null });
assert.strictEqual(summarizeUsage({prompt_tokens: 10, prompt_tokens_details: {cached_tokens: 0}}).cachedInputTokens, 0);
assert.strictEqual(summarizeUsage({promptTokenCount: 33, candidatesTokenCount: 4}).outputTokens, 4);
const reuse = summarizeReuse({solutionIds: ["known", "unknown", "known"]}, {entries: [{id: "known"}], toolMatches: []});
assert.deepStrictEqual(reuse.declaredSolutionIds, ["known"]);
const run = summarizeRun({id: "test", dryRun: false, ok: true, executedCount: 2, failedCount: 0,
  steps: [{tool: "get_active_comp", status: "completed"}, {tool: "run_extendscript", status: "completed"}, {tool: "run_extendscript", status: "failed"}]}, {solutionIds: ["known"]}, ["known"]);
assert.strictEqual(run.rawStepCount, 1);
assert.strictEqual(run.typedExecutedStepCount, 1);
assert.strictEqual(run.declaredRecipeField, "present");
assert.strictEqual(summarizeRun({steps:[]},{},[]).declaredRecipeField, "absent");
assert.strictEqual(summarizeRun({steps:[]},{builderProvenance:{builderId:"slideshow-newspaper",builderVersion:"2",planContentSha256:"a".repeat(64)}},[]).builderProvenance.contentMatches, false);
const events = [
  {type: "plan_finished", at: "1", details: {requestId: "p1", solutionHintsReturned: 3, solutionReuse: reuse, usage: summarizeUsage({input_tokens: 100, output_tokens: 20}), repairUsage: summarizeUsage({input_tokens: 5, output_tokens: 2})}},
  {type: "plan_finished", at: "2", details: {requestId: "p2", solutionHintsReturned: 3}},
  {type: "solution_plan_run_finished", at: "3", details: run},
  {type: "solution_plan_run_finished", at: "4", details: {...run, runId: "dry", dryRun: true}}
];
const report = summarizeEvents([...events, events[0]]);
assert.strictEqual(report.plannerCalls, 2);
assert.strictEqual(report.callsWithUsage, 1);
assert.strictEqual(report.observedInputTokens, 100);
assert.strictEqual(report.observedRepairOutputTokens, 2);
assert.strictEqual(report.observedCachedInputTokens, null);
assert.strictEqual(report.realRuns, 1);
assert.strictEqual(report.rawExecutedSteps, 1);
const fixture = path.join(os.tmpdir(), `ae-reuse-${crypto.randomUUID()}.jsonl`);
try {
  fs.writeFileSync(fixture, [
    {type: "solution_discovery", at: "2026-09-12T08:00:00+05:00", runtime: {port: 3456}},
    {type: "solution_discovery", at: "2026-09-12T04:00:00Z", runtime: {port: 3456}},
    {type: "solution_discovery", at: "2026-09-12T04:00:00Z", runtime: {port: 18000}},
    {type: "solution_discovery", at: "2026-09-12T04:00:00Z"}
  ].map(JSON.stringify).join("\n"));
  assert.strictEqual(readEvents(fixture, "2026-09-12T03:30:00Z", 3456).length, 1);
} finally { fs.unlinkSync(fixture); }
assert.strictEqual(summarizeEvents([
  {eventId: "one", type: "solution_discovery", at: "same", details: {operation: "search_solutions"}},
  {eventId: "two", type: "solution_discovery", at: "same", details: {operation: "search_solutions"}}
]).discoveryCalls, 2);
console.log(JSON.stringify({ok: true, unknownUsageStaysUnknown: true, declaredReuseSeparated: true}));
