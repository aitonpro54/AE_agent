"use strict";

// Optional, read-only adapter for CodeBurn's documented JSON commands.  It is
// deliberately not part of the AE execution/authorization path.
const { spawn } = require("child_process");

const CONTRACT = "ae-agent-codeburn-usage.v1";
const PERIODS = new Set(["today", "week", "30days", "month", "all", "lifetime"]);
const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_OUTPUT_BYTES = 512 * 1024;
const DEFAULT_CACHE_TTL_MS = 60_000;

function finite(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function text(value, limit) {
  return typeof value === "string" ? value.slice(0, limit) : "";
}

function firstNumber(object, names) {
  if (!object || typeof object !== "object") return null;
  for (const name of names) {
    const value = finite(object[name]);
    if (value !== null) return value;
  }
  return null;
}

function firstString(object, names) {
  if (!object || typeof object !== "object") return null;
  for (const name of names) {
    if (typeof object[name] === "string" && object[name]) return object[name];
  }
  return null;
}

function redactIdentity(value) {
  if (typeof value !== "string" || !value) return null;
  // A CodeBurn project label may be a path. Never export paths from this adapter.
  return /^(?:[a-z]:[\\/]|\\\\|\/)/i.test(value) ? null : value.slice(0, 160);
}

function normalizeTokens(row) {
  const nested = row && row.tokens && typeof row.tokens === "object" ? row.tokens : null;
  return {
    inputTokens: firstNumber(row, ["inputTokens", "input", "promptTokens"]) ?? firstNumber(nested, ["inputTokens", "input", "promptTokens"]),
    outputTokens: firstNumber(row, ["outputTokens", "output", "completionTokens"]) ?? firstNumber(nested, ["outputTokens", "output", "completionTokens"]),
    cacheReadTokens: firstNumber(row, ["cacheReadTokens", "cachedInputTokens", "cacheReadInputTokens"]) ?? firstNumber(nested, ["cacheReadTokens", "cacheRead", "cachedInputTokens"]),
    cacheWriteTokens: firstNumber(row, ["cacheWriteTokens", "cacheCreationTokens"]) ?? firstNumber(nested, ["cacheWriteTokens", "cacheWrite", "cacheCreationTokens"]),
    reasoningTokens: firstNumber(row, ["reasoningTokens"]) ?? firstNumber(nested, ["reasoningTokens", "reasoning"]),
    totalTokens: firstNumber(row, ["totalTokens"]) ?? firstNumber(nested, ["totalTokens", "total"])
  };
}

function normalizedTimestamp(value) {
  if (typeof value === "string" && value) return value;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const millis = value < 10_000_000_000 ? value * 1000 : value;
  const parsed = new Date(millis);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizeMoney(row, currency) {
  const amount = firstNumber(row, ["apiEquivalentEstimate", "estimatedCost", "cost"]);
  return amount === null ? null : {
    amount,
    currency: typeof currency === "string" && currency ? currency : null,
    kind: "api_equivalent_estimate",
    subscriptionEquivalent: false
  };
}

function normalizeModel(row, currency) {
  const rawModelId = firstString(row, ["rawModelId", "model", "name", "id"]);
  return {
    rawModelId,
    displayModel: firstString(row, ["displayModel", "label"]),
    tokens: normalizeTokens(row),
    apiEquivalentEstimate: normalizeMoney(row, currency),
    sourceGranularity: "model_aggregate",
    attribution: "unattributed"
  };
}

function normalizeProject(row, currency) {
  return {
    projectIdentity: redactIdentity(firstString(row, ["projectIdentity", "project", "name", "id", "path"])),
    worktreeIdentity: redactIdentity(firstString(row, ["worktreeIdentity", "worktree"])),
    calls: firstNumber(row, ["calls"]),
    sessions: firstNumber(row, ["sessions"]),
    tokens: normalizeTokens(row),
    apiEquivalentEstimate: normalizeMoney(row, currency),
    sourceGranularity: "project_aggregate",
    attribution: "project_aggregate"
  };
}

function normalizeReport(payload, observedAt) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const overview = payload.overview && typeof payload.overview === "object" ? payload.overview : {};
  const currency = typeof payload.currency === "string" ? payload.currency : null;
  const models = Array.isArray(payload.models) ? payload.models.map((row) => normalizeModel(row || {}, currency)) : [];
  const projects = Array.isArray(payload.projects) ? payload.projects.map((row) => normalizeProject(row || {}, currency)) : [];
  const topSessions = Array.isArray(payload.topSessions) ? payload.topSessions.slice(0, 5).map((row) => ({
    sessionId: firstString(row || {}, ["sessionId", "id"]),
    tokens: normalizeTokens(row || {}),
    apiEquivalentEstimate: normalizeMoney(row || {}, currency),
    attribution: "session",
    parentChildRollup: "not_summed"
  })) : [];
  const missingCoreData = !Array.isArray(payload.models) && !Array.isArray(payload.projects) && !payload.overview;
  return {
    contract: CONTRACT,
    status: missingCoreData ? "partial" : "ok",
    source: "codeburn_cli",
    observedAt,
    report: {
      provider: "codex",
      generatedAt: normalizedTimestamp(payload.generated),
      period: firstString(payload, ["period", "periodKey"]),
      timezone: firstString(payload, ["timezone"]),
      currency,
      overview: {
        tokens: normalizeTokens(overview),
        apiEquivalentEstimate: normalizeMoney(overview, currency),
        sourceGranularity: "report_aggregate"
      },
      models,
      projects,
      unpricedModels: Array.isArray(payload.unpricedModels) ? payload.unpricedModels.map((row) => ({
        rawModelId: firstString(row || {}, ["rawModelId", "model", "name", "id"]),
        tokens: normalizeTokens(row || {}),
        apiEquivalentEstimate: null
      })) : [],
      topSessions: {
        items: topSessions,
        complete: false,
        limit: 5,
        sourceNote: "CodeBurn documents topSessions as top 5; it is not a complete session list."
      },
      relationships: {
        modelByProject: "not_derived_from_independent_aggregates",
        sourceOverlap: "not_summed_with_native_usage",
        parentChild: "not_summed_without_proven_relationship"
      }
    }
  };
}

function normalizeQuota(payload, observedAt) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const providers = Array.isArray(payload.providers) ? payload.providers :
    (Array.isArray(payload.quotas) ? payload.quotas : []);
  const providerStatuses = [];
  const windows = [];
  for (const providerRow of providers) {
    const row = providerRow || {};
    const provider = firstString(row, ["provider", "id", "name"]);
    const available = typeof row.available === "boolean" ? row.available : null;
    const nestedWindows = Array.isArray(row.windows) ? row.windows : [];
    const flatRemaining = firstNumber(row, ["remainingPercent", "remaining", "percentRemaining"]);
    const flatUsed = firstNumber(row, ["usedPercent", "percentUsed"]);
    const flatReset = firstString(row, ["resetAt", "resetsAt", "reset"]);
    const candidates = nestedWindows.length || flatRemaining !== null || flatUsed !== null || flatReset
      ? (nestedWindows.length ? nestedWindows : [row])
      : [];
    providerStatuses.push({
      provider,
      available,
      status: firstString(row, ["status"]) || (available === true ? "available" : available === false ? "unavailable" : "unknown"),
      windowCount: candidates.length,
      error: row.error ? "provider_quota_unavailable" : null
    });
    for (const windowRow of candidates) {
      windows.push({
        provider,
        label: firstString(windowRow || {}, ["label", "name", "window", "period"]),
        status: firstString(windowRow || {}, ["status"]) || (available === false ? "unavailable" : "unknown"),
        usedPercent: firstNumber(windowRow || {}, ["usedPercent", "percentUsed"]),
        remainingPercent: firstNumber(windowRow || {}, ["remainingPercent", "remaining", "percentRemaining"]),
        resetAt: firstString(windowRow || {}, ["resetAt", "resetsAt", "reset"]),
        sourceGranularity: "provider_account_snapshot"
      });
    }
  }
  const usable = windows.some((row) => row.usedPercent !== null || row.remainingPercent !== null || row.resetAt);
  return { contract: CONTRACT, status: usable ? "ok" : "partial", source: "codeburn_cli", observedAt,
    quota: { providers: providerStatuses, windows, accountScope: "provider_account", separateFromUsage: true } };
}

function runProcess(executable, args, options) {
  const maxBytes = options.maxOutputBytes;
  return new Promise((resolve) => {
    const stdoutChunks = [];
    const stderrChunks = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let done = false;
    let timedOut = false;
    let outputExceeded = false;
    const isCmd = process.platform === "win32" && /\.(?:cmd|bat)$/i.test(executable);
    const quoteCmdArg = (value) => `"${String(value || "").replace(/"/g, '""')}"`;
    const commandLine = [quoteCmdArg(executable), ...args.map(quoteCmdArg)].join(" ");
    const invocation = isCmd
      ? { command: "cmd.exe", args: ["/d", "/s", "/c", `"${commandLine}"`], windowsVerbatimArguments: true }
      : { command: executable, args, windowsVerbatimArguments: false };
    const child = spawn(invocation.command, invocation.args, {
      shell: false,
      windowsVerbatimArguments: invocation.windowsVerbatimArguments,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let timer = null;
    const decoded = (chunks) => Buffer.concat(chunks).toString("utf8");
    const finish = (exitCode, error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ exitCode, stdout: decoded(stdoutChunks), stderr: decoded(stderrChunks) + (error ? error.message : ""),
        timedOut, outputExceeded });
    };
    const abort = () => {
      if (done) return;
      // Only the process and pipes created by this adapter are touched.
      try { child.kill(); } catch (_error) {}
      if (child.stdout) child.stdout.destroy();
      if (child.stderr) child.stderr.destroy();
      finish(null);
    };
    const append = (key, chunk) => {
      if (done) return;
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const used = key === "stdout" ? stdoutBytes : stderrBytes;
      const remaining = Math.max(0, maxBytes - used);
      const accepted = bytes.subarray(0, remaining);
      if (key === "stdout") {
        stdoutChunks.push(accepted);
        stdoutBytes += accepted.length;
      } else {
        stderrChunks.push(accepted);
        stderrBytes += accepted.length;
      }
      if (accepted.length < bytes.length && !outputExceeded) {
        outputExceeded = true;
        abort();
      }
    };
    child.stdout.on("data", (chunk) => append("stdout", chunk));
    child.stderr.on("data", (chunk) => append("stderr", chunk));
    timer = setTimeout(() => { timedOut = true; abort(); }, options.timeoutMs);
    child.on("error", (error) => finish(null, error));
    child.on("close", (exitCode) => finish(exitCode));
  });
}

function createCodeburnUsageAdapter(options) {
  const settings = options || {};
  const clock = typeof settings.clock === "function" ? settings.clock : () => new Date().toISOString();
  const runner = typeof settings.runner === "function" ? settings.runner : (command) => runProcess(command.executable, command.args, command);
  const executable = typeof settings.executable === "string" && settings.executable ? settings.executable : (process.platform === "win32" ? "codeburn.cmd" : "codeburn");
  const timeoutMs = Number.isFinite(settings.timeoutMs) ? Math.max(100, Math.min(settings.timeoutMs, DEFAULT_TIMEOUT_MS)) : DEFAULT_TIMEOUT_MS;
  const cacheTtlMs = Number.isFinite(settings.cacheTtlMs) ? Math.max(0, Math.min(settings.cacheTtlMs, 300_000)) : DEFAULT_CACHE_TTL_MS;
  const maxOutputBytes = Number.isFinite(settings.maxOutputBytes) ? Math.max(1024, Math.min(settings.maxOutputBytes, DEFAULT_MAX_OUTPUT_BYTES)) : DEFAULT_MAX_OUTPUT_BYTES;
  const cache = { report: new Map(), quota: null };
  const inflight = { report: new Map(), quota: null };
  function stale(entry) { return !entry || Date.parse(clock()) - Date.parse(entry.observedAt) >= cacheTtlMs; }
  async function refresh(type, period) {
    if (type === "report" && inflight.report.has(period)) return inflight.report.get(period);
    if (type === "quota" && inflight.quota) return inflight.quota;
    const args = type === "report" ? ["report", "--provider", "codex", "--period", period, "--format", "json", "--refresh", "0"] : ["quota", "--format", "json"];
    const pending = Promise.resolve().then(() => runner({ executable, args, timeoutMs, maxOutputBytes })).then((result) => {
      const observedAt = clock();
      if (!result) return { contract: CONTRACT, status: "unavailable", source: "codeburn_cli", observedAt, error: "codeburn_runner_failed" };
      if (result.outputExceeded) return { contract: CONTRACT, status: "invalid", source: "codeburn_cli", observedAt, error: "codeburn_output_limit" };
      if (result.timedOut) return { contract: CONTRACT, status: "timeout", source: "codeburn_cli", observedAt, error: "codeburn_timeout" };
      if (result.exitCode !== 0) return { contract: CONTRACT, status: "unavailable", source: "codeburn_cli", observedAt, error: "codeburn_exit_nonzero" };
      let payload;
      try { payload = JSON.parse(text(result.stdout, maxOutputBytes)); } catch (_) { return { contract: CONTRACT, status: "invalid", source: "codeburn_cli", observedAt, error: "codeburn_invalid_json" }; }
      const normalized = type === "report" ? normalizeReport(payload, observedAt) : normalizeQuota(payload, observedAt);
      if (type === "report" && normalized && normalized.report && normalized.report.period !== period) {
        return { contract: CONTRACT, status: "invalid", source: "codeburn_cli", observedAt,
          error: normalized.report.period ? "codeburn_period_mismatch" : "codeburn_period_unverified" };
      }
      return normalized || { contract: CONTRACT, status: "invalid", source: "codeburn_cli", observedAt, error: "codeburn_invalid_payload" };
    }).catch(() => ({ contract: CONTRACT, status: "unavailable", source: "codeburn_cli", observedAt: clock(), error: "codeburn_runner_failed" })).then((result) => {
      if (type === "report") cache.report.set(period, result);
      else cache.quota = result;
      return result;
    }).finally(() => {
      if (type === "report") inflight.report.delete(period);
      else inflight.quota = null;
    });
    if (type === "report") inflight.report.set(period, pending);
    else inflight.quota = pending;
    return pending;
  }
  return {
    refreshReport(period) { return refresh("report", PERIODS.has(period) ? period : "week"); },
    refreshQuota() { return refresh("quota"); },
    getCachedReport(period) { const entry = cache.report.get(PERIODS.has(period) ? period : "week"); return entry ? { ...entry, stale: stale(entry) } : null; },
    getCachedQuota() { return cache.quota ? { ...cache.quota, stale: stale(cache.quota) } : null; }
  };
}

module.exports = { CONTRACT, PERIODS, createCodeburnUsageAdapter, normalizeReport, normalizeQuota };
