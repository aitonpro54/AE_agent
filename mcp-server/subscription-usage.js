"use strict";

// Account meter observations, never a conversion of dollars into subscription %.
function codexQuota(snapshot) {
  const quota = snapshot && snapshot.quota;
  const provider = quota && quota.providers.find((row) => row.provider === "codex" && row.available === true);
  if (!provider) return [];
  return quota.windows.filter((row) => row.provider === "codex" && row.status === "ok"
    && (row.usedPercent === null || row.remainingPercent === null || Math.abs(row.usedPercent + row.remainingPercent - 100) <= 0.1)).map((row) => ({
    label: row.label,
    plan: provider.plan || null,
    usedPercent: row.usedPercent !== null ? row.usedPercent : row.remainingPercent !== null ? 100 - row.remainingPercent : null,
    remainingPercent: row.remainingPercent !== null ? row.remainingPercent : row.usedPercent !== null ? 100 - row.usedPercent : null,
    resetAt: row.resetAt,
    observedAt: snapshot.observedAt,
    scope: "account",
    source: snapshot.source,
    warning: snapshot.warning || null
  })).filter((row) => row.usedPercent !== null);
}

function compareQuota(before, after) {
  const unknown = (reason) => ({ percentagePoints: null, reason, scope: "account", taskAttribution: "unknown" });
  if (!before || !after) return unknown("missing_snapshot");
  if (![before.usedPercent, after.usedPercent].every((value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100)) return unknown("invalid_percentage");
  if (!before.resetAt || !after.resetAt || !before.plan || !after.plan) return unknown("window_or_plan_unknown");
  const start = Date.parse(before.observedAt);
  const end = Date.parse(after.observedAt);
  const reset = Date.parse(before.resetAt);
  if (![start, end, reset].every(Number.isFinite) || end < start) return unknown("invalid_observation_time");
  if (before.resetAt !== after.resetAt || before.label !== after.label || before.plan !== after.plan || end >= reset) return unknown("window_or_plan_changed");
  if (after.usedPercent < before.usedPercent) return unknown("meter_decreased");
  return {
    percentagePoints: Math.round((after.usedPercent - before.usedPercent) * 100) / 100,
    reason: "observed_meter_change",
    scope: "account",
    taskAttribution: "unknown",
    accountIdentityVerified: false,
    warnings: [...new Set([before.warning, after.warning].filter(Boolean))],
    note: "Includes other account activity; meter rounding/delay applies. Zero change does not prove zero usage."
  };
}

function compareQuotaWindows(before, after) {
  const labels = (rows) => rows.map((row) => row && row.label);
  const oldLabels = labels(before);
  const newLabels = labels(after);
  const ambiguous = [oldLabels, newLabels].some((items) => items.some((label) => !label) || new Set(items).size !== items.length);
  const changed = oldLabels.length !== newLabels.length || oldLabels.some((label) => !newLabels.includes(label));
  if (ambiguous || changed) return [{ label: "Окна квоты", percentagePoints: null, reason: ambiguous ? "ambiguous_window_labels" : "window_set_changed", scope: "account", taskAttribution: "unknown" }];
  return after.map((row) => ({ label: row.label, ...compareQuota(before.find((old) => old.label === row.label), row) }));
}

module.exports = { codexQuota, compareQuota, compareQuotaWindows };
