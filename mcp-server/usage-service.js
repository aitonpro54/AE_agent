"use strict";

const CONTRACT = "ae-agent-usage-dashboard.v1";

function unavailableCodeburn(kind) {
  return {
    contract: "ae-agent-codeburn-usage.v1",
    status: "unavailable",
    source: "codeburn_cli",
    observedAt: null,
    stale: false,
    error: `codeburn_${kind}_not_refreshed`
  };
}

function createUsageService(options) {
  options = options || {};
  if (!options.nativeStore || typeof options.nativeStore.snapshot !== "function") {
    throw new Error("nativeStore with snapshot() is required.");
  }
  if (!options.codeburnAdapter) throw new Error("codeburnAdapter is required.");
  const nativeStore = options.nativeStore;
  const codeburnAdapter = options.codeburnAdapter;

  function snapshot() {
    const native = nativeStore.snapshot();
    const codeburn = codeburnAdapter.getCachedReport() || unavailableCodeburn("report");
    const quota = codeburnAdapter.getCachedQuota() || unavailableCodeburn("quota");
    return {
      schema: CONTRACT,
      generatedAt: new Date().toISOString(),
      sources: {
        native,
        codeburn
      },
      quota,
      reconciliation: {
        combinedTokenTotal: null,
        overlapPolicy: "Native exact bridge calls and CodeBurn aggregates are shown side by side; they are not summed without shared deduplication ids.",
        nativePriority: "ae-agent-native is authoritative for exact calls observed by this bridge.",
        codeburnGranularity: codeburn.report
          ? "independent report, model, and project aggregates"
          : "unavailable",
        modelByProject: null,
        modelByProjectReason: "Independent model and project totals do not prove a model-by-project matrix.",
        sessionListComplete: false,
        sessionListReason: "CodeBurn topSessions is a bounded top-five view, not a complete session list."
      },
      presentation: {
        primary: ["tokens", "models", "project aggregates", "quota"],
        secondary: ["API-equivalent cost estimate"],
        quotaIsSubscriptionUsage: false,
        apiEquivalentDollarsAreSubscriptionPercentage: false
      },
      aeAvailability: {
        dependsOnCodeburn: false,
        editingBlocked: false
      }
    };
  }

  async function refresh(input) {
    input = input || {};
    const period = typeof input.period === "string" ? input.period : "week";
    const includeQuota = input.includeQuota !== false;
    const jobs = [codeburnAdapter.refreshReport(period)];
    if (includeQuota) jobs.push(codeburnAdapter.refreshQuota());
    await Promise.all(jobs);
    return snapshot();
  }

  return { snapshot, refresh };
}

module.exports = { CONTRACT, createUsageService };
