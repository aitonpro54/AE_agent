"use strict";

const fs = require("fs");
const path = require("path");

function summarizeEvents(events) {
  const report = { schema: "ae-solution-usage-report.v1", discoveryCalls: 0, recipeReads: 0, localPlansBuilt: 0,
    plannerCalls: 0, plannerCallsWithHints: 0, plannerCallsWithDeclaredReuse: 0, callsWithUsage: 0,
    observedInputTokens: null, observedOutputTokens: null, observedCachedInputTokens: null,
    observedRepairInputTokens: null, observedRepairOutputTokens: null,
    realRuns: 0, successfulRuns: 0, realRunsWithDeclaredReuse: 0, rawExecutedSteps: 0,
    toolOutputChars: 0, toolCallsWithSize: 0,
    limitation: "Observed counters only. Missing usage is unknown, declared reuse is not causal attribution, and no A/B token-saving percentage can be inferred." };
  const seen = new Set();
  const add = (key, value) => { if (typeof value === "number" && Number.isFinite(value) && value >= 0) report[key] = (report[key] || 0) + value; };
  for (const event of events) {
    const d = event.details || {};
    const key = event.eventId || `${event.type}:${d.requestId || d.runId || d.id || ""}:${event.at || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (event.type === "solution_discovery") {
      if (d.operation === "search_solutions") report.discoveryCalls++;
      if (d.operation === "get_solution") report.recipeReads++;
    }
    if (event.type === "solution_plan_built" && d.validationOk) report.localPlansBuilt++;
    if (event.type === "plan_finished") {
      report.plannerCalls++;
      if (d.solutionHintsReturned > 0) report.plannerCallsWithHints++;
      if (d.solutionReuse && d.solutionReuse.declaredSolutionIds.length) report.plannerCallsWithDeclaredReuse++;
      if (d.usage) {
        report.callsWithUsage++;
        add("observedInputTokens", d.usage.inputTokens);
        add("observedOutputTokens", d.usage.outputTokens);
        add("observedCachedInputTokens", d.usage.cachedInputTokens);
      }
      if (d.repairUsage) { add("observedRepairInputTokens", d.repairUsage.inputTokens); add("observedRepairOutputTokens", d.repairUsage.outputTokens); }
    }
    if (event.type === "solution_plan_run_finished" && !d.dryRun) {
      report.realRuns++;
      if (d.ok) report.successfulRuns++;
      if (d.declaredSolutionIds && d.declaredSolutionIds.length) report.realRunsWithDeclaredReuse++;
      add("rawExecutedSteps", d.rawStepCount);
    }
    if (event.type === "tool_call_finished" && typeof d.outputChars === "number") { report.toolCallsWithSize++; add("toolOutputChars", d.outputChars); }
  }
  return report;
}

function readEvents(file, since, port) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split(/\r?\n/).flatMap((line) => {
    try {
      const event = JSON.parse(line);
      if (port !== undefined && (!event.runtime || event.runtime.port !== port)) return [];
      return !since || Date.parse(event.at) >= Date.parse(since) ? [event] : [];
    } catch (_invalidLine) { return []; }
  });
}

if (require.main === module) {
  const sinceIndex = process.argv.indexOf("--since");
  const since = sinceIndex >= 0 ? process.argv[sinceIndex + 1] : null;
  if (sinceIndex >= 0 && (!since || !Number.isFinite(Date.parse(since)))) throw new Error("--since requires an ISO date/time.");
  const port = Number(process.env.AE_BRIDGE_PORT || 3456);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("AE_BRIDGE_PORT must be a valid port.");
  const root = process.env.AE_BRIDGE_LOG_DIR ? path.resolve(process.env.AE_BRIDGE_LOG_DIR) : path.resolve(__dirname, "..", "logs");
  console.log(JSON.stringify({ since, runtimePort: port, coverage: "Only events with this runtime port; legacy untagged events and isolated test servers are excluded.",
    ...summarizeEvents(["bridge-events.jsonl", "ai-agent-chats.jsonl"].flatMap((file) => readEvents(path.join(root, file), since, port))) }, null, 2));
}

module.exports = { summarizeEvents, readEvents };
