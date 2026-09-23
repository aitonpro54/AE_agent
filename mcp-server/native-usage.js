"use strict";

const crypto = require("crypto");

const RECORD_SCHEMA = "ae-agent-native-usage-record.v1";
const SNAPSHOT_SCHEMA = "ae-agent-native-usage-snapshot.v1";
const ACTIVITY_SCOPES = new Set(["ae_execution", "ae_agent_development", "other", "unattributed"]);
const ATTRIBUTION_LEVELS = new Set(["exact", "session", "project_aggregate", "unattributed"]);

function finiteCount(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function firstCount(...values) {
  for (const value of values) {
    const count = finiteCount(value);
    if (count !== null) return count;
  }
  return null;
}

function compactString(value, maxLength) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

function normalizeTokens(usage) {
  usage = usage && typeof usage === "object" ? usage : {};
  const input = firstCount(
    usage.input_tokens,
    usage.prompt_tokens,
    usage.inputTokens,
    usage.promptTokenCount,
    usage.prompt_eval_count
  );
  const output = firstCount(
    usage.output_tokens,
    usage.completion_tokens,
    usage.outputTokens,
    usage.candidatesTokenCount,
    usage.eval_count
  );
  const cachedInput = firstCount(
    usage.cached_input_tokens,
    usage.cachedInputTokens,
    usage.input_tokens_details && usage.input_tokens_details.cached_tokens,
    usage.prompt_tokens_details && usage.prompt_tokens_details.cached_tokens,
    usage.cachedContentTokenCount
  );
  const reasoning = firstCount(
    usage.reasoning_tokens,
    usage.reasoningTokens,
    usage.output_tokens_details && usage.output_tokens_details.reasoning_tokens,
    usage.completion_tokens_details && usage.completion_tokens_details.reasoning_tokens,
    usage.thoughtsTokenCount
  );
  const directTotal = firstCount(usage.total_tokens, usage.totalTokens, usage.totalTokenCount);
  const total = directTotal !== null ? directTotal : input !== null && output !== null ? input + output : null;
  return { input, output, cachedInput, reasoning, total };
}

function normalizeUsageRecord(input) {
  input = input && typeof input === "object" ? input : {};
  const observedAt = compactString(input.observedAt, 64) || new Date().toISOString();
  const requestId = compactString(input.requestId, 160);
  const recordId = compactString(input.recordId, 200) || requestId || crypto.randomUUID();
  const aggregation = input.aggregation === "snapshot" ? "snapshot" : "increment";
  const activityScope = ACTIVITY_SCOPES.has(input.activityScope) ? input.activityScope : "unattributed";
  const attributionLevel = ATTRIBUTION_LEVELS.has(input.attributionLevel)
    ? input.attributionLevel
    : requestId ? "exact" : "unattributed";

  return {
    schema: RECORD_SCHEMA,
    recordId,
    source: "ae-agent-native",
    observedAt,
    period: {
      kind: aggregation === "snapshot" ? "snapshot" : "event",
      startedAt: compactString(input.startedAt, 64),
      finishedAt: compactString(input.finishedAt, 64) || observedAt,
      timezone: compactString(input.timezone, 80)
    },
    aggregation,
    provider: compactString(input.provider, 120),
    modelId: compactString(input.modelId, 200),
    outcome: input.outcome === "failed_unknown" || input.outcome === "completed" ? input.outcome : null,
    reasoningEffort: compactString(input.reasoningEffort, 40),
    serviceTier: compactString(input.serviceTier, 80),
    tokens: normalizeTokens(input.usage),
    activityScope,
    attribution: {
      level: attributionLevel,
      requestId,
      sessionId: compactString(input.sessionId, 200),
      parentRecordId: compactString(input.parentRecordId, 200),
      projectLabel: compactString(input.projectLabel, 160),
      projectSource: compactString(input.projectSource, 80)
    }
  };
}

function metricSummary(records, field) {
  let value = 0;
  let observedRecords = 0;
  for (const record of records) {
    const count = finiteCount(record.tokens && record.tokens[field]);
    if (count === null) continue;
    value += count;
    observedRecords += 1;
  }
  return {
    value: observedRecords > 0 ? value : null,
    complete: records.length > 0 && observedRecords === records.length,
    observedRecords,
    missingRecords: records.length - observedRecords
  };
}

function summarizeRecords(records) {
  const increments = records.filter((record) => record.aggregation === "increment");
  const models = new Map();
  for (const record of increments) {
    const key = record.modelId === null ? "\u0000unknown" : record.modelId;
    if (!models.has(key)) models.set(key, []);
    models.get(key).push(record);
  }
  return {
    includedRecordCount: increments.length,
    excludedSnapshotCount: records.length - increments.length,
    tokens: {
      input: metricSummary(increments, "input"),
      output: metricSummary(increments, "output"),
      cachedInput: metricSummary(increments, "cachedInput"),
      reasoning: metricSummary(increments, "reasoning"),
      total: metricSummary(increments, "total")
    },
    models: Array.from(models.values()).map((items) => ({
      modelId: items[0].modelId,
      recordCount: items.length,
      priced: null,
      apiEquivalentCost: null,
      tokens: {
        input: metricSummary(items, "input"),
        output: metricSummary(items, "output"),
        cachedInput: metricSummary(items, "cachedInput"),
        reasoning: metricSummary(items, "reasoning"),
        total: metricSummary(items, "total")
      }
    }))
  };
}

function createNativeUsageStore(options) {
  options = options || {};
  const maxRecords = Math.max(1, Math.min(2000, Math.floor(Number(options.maxRecords) || 200)));
  const records = new Map();

  function record(input) {
    const normalized = normalizeUsageRecord(input);
    if (records.has(normalized.recordId)) return records.get(normalized.recordId);
    records.set(normalized.recordId, normalized);
    while (records.size > maxRecords) records.delete(records.keys().next().value);
    return normalized;
  }

  function snapshot() {
    const items = Array.from(records.values());
    return {
      schema: SNAPSHOT_SCHEMA,
      source: "ae-agent-native",
      status: items.length ? "available" : "unavailable",
      freshness: items.length ? items[items.length - 1].observedAt : null,
      granularity: "exact bridge provider call",
      bounded: true,
      maxRecords,
      records: items,
      summary: summarizeRecords(items),
      limitations: [
        "Only provider calls observed by this bridge process are included.",
        "Cache and reasoning tokens are subsets of input/output and are not added to totals.",
        "Snapshot records are retained for diagnostics but excluded from increment totals."
      ]
    };
  }

  return { record, snapshot };
}

function recordObservedProviderCall(store, input) {
  if (!store || typeof store.record !== "function" || !input) return null;
  return store.record({
    recordId: input.recordId,
    requestId: input.requestId,
    parentRecordId: input.parentRecordId,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    observedAt: input.finishedAt,
    provider: input.provider,
    modelId: input.modelId,
    outcome: input.outcome === "failed_unknown" ? "failed_unknown" : "completed",
    reasoningEffort: input.reasoningEffort,
    serviceTier: input.serviceTier,
    sessionId: input.sessionId,
    activityScope: "ae_execution",
    attributionLevel: input.requestId ? "exact" : "unattributed",
    usage: input.usage
  });
}

module.exports = {
  RECORD_SCHEMA,
  SNAPSHOT_SCHEMA,
  createNativeUsageStore,
  recordObservedProviderCall,
  normalizeTokens,
  normalizeUsageRecord,
  summarizeRecords
};
