"use strict";

const fs = require("fs");
const path = require("path");

const REPORT_SCHEMA_VERSION = "agent-run-report.v1";
const DEFAULT_REPORT_DIR = path.join(__dirname, "..", "logs", "agent-run-reports");

function safeFilePart(value) {
  return String(value || "agent-run-report")
    .replace(/[^A-Za-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "agent-run-report";
}

function fileTimestamp(value) {
  return safeFilePart(String(value || new Date().toISOString()).replace(/[:]/g, "-"));
}

function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function countValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function sumCounts(items, key) {
  return items.reduce((total, item) => total + countValue(item[key]), 0);
}

function planSourceCounts(scenarios) {
  return scenarios.reduce((counts, scenario) => {
    const source = scenario.planSource || "unknown";
    counts[source] = (counts[source] || 0) + 1;
    return counts;
  }, {});
}

function compactScenarioOutcome(result) {
  const panelPlan = result && result.panelPlan ? result.panelPlan : {};
  const dryRun = result && result.dryRun ? result.dryRun : {};
  const run = result && result.run ? result.run : {};

  return {
    id: result && result.id ? result.id : "unknown-scenario",
    cleanupPrefix: result && result.cleanupPrefix ? result.cleanupPrefix : null,
    planSource: result && result.executionMode ? result.executionMode : "unknown",
    fallbackReason: result && result.fallbackReason ? result.fallbackReason : null,
    panelPlan: {
      accepted: panelPlan.accepted === true,
      validationLine: panelPlan.validationLine || null,
      expectedStepCount: numberOrNull(panelPlan.expectedStepCount),
      expectedMutatingCount: numberOrNull(panelPlan.expectedMutatingCount),
      expectedTools: Array.isArray(panelPlan.expectedTools) ? panelPlan.expectedTools.slice() : [],
      checks: panelPlan.checks || {}
    },
    dryRun: {
      ok: typeof dryRun.ok === "boolean" ? dryRun.ok : (dryRun.transcriptTail ? true : null),
      dryRun: typeof dryRun.dryRun === "boolean" ? dryRun.dryRun : null,
      safety: dryRun.safety || null,
      statusCount: Array.isArray(dryRun.statuses) ? dryRun.statuses.length : null
    },
    run: {
      ok: typeof run.ok === "boolean" ? run.ok : (run.transcriptTail ? true : null),
      dryRun: typeof run.dryRun === "boolean" ? run.dryRun : null,
      safety: run.safety || null,
      checkpoint: run.checkpoint || null,
      statusCount: Array.isArray(run.statuses) ? run.statuses.length : null
    }
  };
}

function compactCleanup(item) {
  return {
    id: item && item.id ? item.id : null,
    cleanupPrefix: item && item.cleanupPrefix ? item.cleanupPrefix : null,
    projectItemsRemoved: numberOrNull(item && item.removedCount),
    renderQueueItemsRemoved: numberOrNull(item && item.renderQueueRemovedCount),
    renderQueueTotal: numberOrNull(item && item.renderQueueTotal)
  };
}

function normalizeAgentRunReport(rawReport, options) {
  const opts = options || {};
  const generatedAt = opts.generatedAt || new Date().toISOString();
  const raw = rawReport || {};
  const rawPlanner = raw.planner || {};
  const rawPreflight = raw.preflight || {};
  const rawAcceptance = raw.plannerAcceptance || {};
  const scenarios = Array.isArray(raw.scenarios) ? raw.scenarios.map(compactScenarioOutcome) : [];
  const cleanups = Array.isArray(raw.cleanups) ? raw.cleanups.map(compactCleanup) : [];
  const finalCleanup = compactCleanup({
    id: "final",
    cleanupPrefix: raw.runPrefix || null,
    removedCount: raw.finalCleanup && raw.finalCleanup.removedCount,
    renderQueueRemovedCount: raw.finalCleanup && raw.finalCleanup.renderQueueRemovedCount,
    renderQueueTotal: raw.finalCleanup && raw.finalCleanup.renderQueueTotal
  });
  const sources = planSourceCounts(scenarios);
  const panelPlanCount = numberOrNull(rawAcceptance.panelPlanCount) !== null
    ? rawAcceptance.panelPlanCount
    : countValue(sources["panel-agent-plan"]);
  const fallbackCount = numberOrNull(rawAcceptance.fallbackCount) !== null
    ? rawAcceptance.fallbackCount
    : countValue(sources["deterministic-plan-fallback"]);
  const scenarioCount = numberOrNull(rawAcceptance.scenarioCount) !== null
    ? rawAcceptance.scenarioCount
    : scenarios.length;
  const acceptedCount = scenarios.filter((scenario) => scenario.panelPlan.accepted).length;
  const baselineRenderQueueTotal = numberOrNull(rawPreflight.renderQueueTotal);
  const finalRenderQueueTotal = finalCleanup.renderQueueTotal;

  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    generatedAt,
    source: opts.source || "agent-scenario-smoke",
    run: {
      ok: raw.ok === true,
      runPrefix: raw.runPrefix || null,
      page: raw.page || null
    },
    planner: {
      label: rawPlanner.label || null,
      agent: rawPlanner.agent || null,
      model: rawPlanner.model || null,
      providerGroup: rawPlanner.providerGroup || null,
      authMode: rawPlanner.authMode || null,
      requirePanelPlans: rawPlanner.requirePanelPlans === true
    },
    preflight: {
      health: rawPreflight.health || null,
      readiness: rawPreflight.readiness || null,
      activeComp: rawPreflight.activeComp || null,
      renderQueueBaselineTotal: baselineRenderQueueTotal
    },
    planSources: {
      panelAgentPlan: panelPlanCount,
      deterministicPlanFallback: fallbackCount,
      bySource: sources
    },
    acceptance: {
      panelPlanCount,
      fallbackCount,
      scenarioCount,
      acceptedCount,
      rejectedCount: Math.max(0, scenarioCount - acceptedCount)
    },
    scenarios,
    cleanup: {
      scenarios: cleanups,
      projectItemsRemovedTotal: sumCounts(cleanups, "projectItemsRemoved"),
      renderQueueItemsRemovedTotal: sumCounts(cleanups, "renderQueueItemsRemoved"),
      final: finalCleanup
    },
    finalRenderQueueStatus: {
      baselineTotal: baselineRenderQueueTotal,
      totalItems: finalRenderQueueTotal,
      returnedToBaseline: baselineRenderQueueTotal !== null &&
        finalRenderQueueTotal !== null &&
        baselineRenderQueueTotal === finalRenderQueueTotal
    }
  };
}

function writeAgentRunReport(rawReport, options) {
  const opts = options || {};
  const report = normalizeAgentRunReport(rawReport, opts);
  const outputDir = opts.outputDir || process.env.AE_AGENT_RUN_REPORT_DIR || DEFAULT_REPORT_DIR;
  fs.mkdirSync(outputDir, { recursive: true });
  const fileName = [
    fileTimestamp(report.generatedAt),
    safeFilePart(report.planner.label || "agent"),
    safeFilePart(report.run.runPrefix || "run")
  ].join("-") + ".json";
  const filePath = path.join(outputDir, fileName);
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2) + "\n", "utf8");
  return {
    report,
    path: filePath,
    relativePath: path.relative(process.cwd(), filePath)
  };
}

module.exports = {
  DEFAULT_REPORT_DIR,
  REPORT_SCHEMA_VERSION,
  normalizeAgentRunReport,
  writeAgentRunReport
};
