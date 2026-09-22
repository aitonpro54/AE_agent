"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { createCodeburnUsageAdapter, normalizeReport, normalizeQuota } = require("../mcp-server/codeburn-usage-adapter");
const root = path.join(__dirname, "fixtures", "codeburn-usage");
const fixture = (name) => fs.readFileSync(path.join(root, name), "utf8");
const json = (name) => JSON.parse(fixture(name));

async function main() {
  const report = normalizeReport(json("multi-model.json"), "2026-09-19T01:00:00.000Z");
  assert.strictEqual(report.status, "ok");
  assert.strictEqual(report.report.generatedAt, "2026-09-19T00:00:00.000Z");
  assert.strictEqual(report.report.overview.tokens.inputTokens, 1000);
  assert.strictEqual(report.report.overview.tokens.cacheWriteTokens, 0);
  assert.strictEqual(report.report.models.length, 2);
  assert.strictEqual(report.report.models[1].rawModelId, "future-codex-opaque");
  assert.strictEqual(report.report.models[1].apiEquivalentEstimate, null);
  assert.strictEqual(report.report.models[0].tokens.cacheReadTokens, 200);
  assert.strictEqual(report.report.models[0].tokens.reasoningTokens, 50);
  assert.strictEqual(report.report.projects[0].projectIdentity, "demo-worktree-a");
  assert.strictEqual(report.report.projects[0].calls, 7);
  assert.strictEqual(report.report.projects[0].sessions, 2);
  assert.strictEqual(report.report.projects[1].projectIdentity, null);
  assert.strictEqual(report.report.topSessions.complete, false);
  assert.strictEqual(report.report.relationships.modelByProject, "not_derived_from_independent_aggregates");
  assert.strictEqual(report.report.relationships.parentChild, "not_summed_without_proven_relationship");
  assert.strictEqual(JSON.stringify(report).includes("redacted\\\\not-exported"), false);

  const zero = normalizeReport(json("missing-zero.json"), "2026-09-19T01:00:00.000Z");
  assert.strictEqual(zero.report.models[0].tokens.inputTokens, 0);
  assert.strictEqual(zero.report.models[1].tokens.inputTokens, null);
  assert.strictEqual(zero.report.models[1].tokens.cacheReadTokens, null);
  const counterShapes = json("cumulative-reset.json").snapshots;
  assert.strictEqual(normalizeReport(counterShapes[0], "2026-09-19T01:00:00.000Z").report.overview.tokens.inputTokens, 100);
  assert.strictEqual(normalizeReport(counterShapes[1], "2026-09-19T01:00:00.000Z").report.overview.tokens.inputTokens, 100,
    "a repeated cumulative snapshot is represented, never accumulated");
  assert.strictEqual(normalizeReport(counterShapes[2], "2026-09-19T01:00:00.000Z").report.overview.tokens.inputTokens, 12,
    "a reset-shaped snapshot stays a snapshot rather than a negative delta");
  const quota = normalizeQuota(json("quota-partial.json"), "2026-09-19T01:00:00.000Z");
  assert.strictEqual(quota.status, "ok");
  assert.strictEqual(quota.quota.separateFromUsage, true);
  assert.strictEqual(quota.quota.windows.length, 1);
  assert.strictEqual(quota.quota.windows[0].remainingPercent, 55);
  assert.strictEqual(quota.quota.providers[1].error, "provider_quota_unavailable");
  assert.strictEqual(normalizeQuota(json("quota-empty.json"), "2026-09-19T01:00:00.000Z").status, "partial");

  let calls = 0;
  const commands = [];
  const runner = async (command) => { calls += 1; commands.push(command); return { exitCode: 0, stdout: fixture("multi-model.json"), stderr: "" }; };
  const adapter = createCodeburnUsageAdapter({ runner, clock: () => "2026-09-19T01:00:00.000Z", cacheTtlMs: 60_000 });
  const [a, b] = await Promise.all([adapter.refreshReport("week"), adapter.refreshReport("not-an-allowed-period")]);
  assert.strictEqual(calls, 1, "parallel report refreshes coalesce");
  assert.deepStrictEqual(a, b, "a repeated snapshot is idempotent, not additive");
  assert.deepStrictEqual(commands[0].args, ["report", "--provider", "codex", "--period", "week", "--format", "json", "--refresh", "0"]);
  assert.strictEqual(adapter.getCachedReport().stale, false);

  const invalid = createCodeburnUsageAdapter({ runner: async () => ({ exitCode: 0, stdout: fixture("invalid.json"), stderr: "" }) });
  assert.strictEqual((await invalid.refreshReport("week")).status, "invalid");
  const unavailable = createCodeburnUsageAdapter({ runner: async () => ({ exitCode: 2, stdout: "", stderr: "synthetic unavailable" }) });
  assert.strictEqual((await unavailable.refreshReport("week")).status, "unavailable");
  const timeout = createCodeburnUsageAdapter({ runner: async () => ({ timedOut: true, exitCode: null, stdout: "", stderr: "" }) });
  assert.strictEqual((await timeout.refreshQuota()).status, "timeout");
  const oversized = createCodeburnUsageAdapter({ runner: async (command) => ({ outputExceeded: command.maxOutputBytes > 0, exitCode: null, stdout: "", stderr: "" }) });
  const oversizedResult = await oversized.refreshReport("week");
  assert.strictEqual(oversizedResult.status, "invalid");
  assert.strictEqual(oversizedResult.error, "codeburn_output_limit");
  console.log(JSON.stringify({ ok: true, acceptance: ["USG01", "USG02", "USG03", "USG04", "USG05", "USG06", "USG07", "USG09", "USG10", "USG11", "USG12", "USG13", "USG14", "USG15", "USG16", "USG17"] }));
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
