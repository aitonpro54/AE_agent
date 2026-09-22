"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { createNativeUsageStore } = require("../mcp-server/native-usage");
const { createCodeburnUsageAdapter } = require("../mcp-server/codeburn-usage-adapter");
const { createUsageService } = require("../mcp-server/usage-service");

const fixtureRoot = path.join(__dirname, "fixtures", "codeburn-usage");
const reportJson = fs.readFileSync(path.join(fixtureRoot, "multi-model.json"), "utf8");
const quotaJson = fs.readFileSync(path.join(fixtureRoot, "quota-partial.json"), "utf8");
const nativeStore = createNativeUsageStore({ maxRecords: 5 });
nativeStore.record({
  recordId: "native-exact-1",
  requestId: "native-request-1",
  observedAt: "2026-09-19T02:00:00.000Z",
  provider: "openai-cli",
  modelId: "gpt-5.6-sol",
  usage: { input_tokens: 10, output_tokens: 2 }
});

let calls = 0;
const adapter = createCodeburnUsageAdapter({
  clock: () => "2026-09-19T02:00:01.000Z",
  runner: async (command) => {
    calls += 1;
    return {
      exitCode: 0,
      stdout: command.args[0] === "quota" ? quotaJson : reportJson,
      stderr: ""
    };
  }
});
const service = createUsageService({ nativeStore, codeburnAdapter: adapter });

async function main() {
  const cold = service.snapshot();
  assert.strictEqual(cold.sources.native.status, "available");
  assert.strictEqual(cold.sources.codeburn.status, "unavailable");
  assert.strictEqual(cold.aeAvailability.dependsOnCodeburn, false);
  assert.strictEqual(cold.aeAvailability.editingBlocked, false);
  assert.strictEqual(cold.reconciliation.combinedTokenTotal, null);

  const refreshed = await service.refresh({ period: "week", includeQuota: true });
  assert.strictEqual(calls, 2);
  assert.strictEqual(refreshed.sources.codeburn.status, "ok");
  assert.strictEqual(refreshed.quota.status, "ok");
  assert.strictEqual(refreshed.quota.quota.separateFromUsage, true);
  assert.strictEqual(refreshed.reconciliation.modelByProject, null);
  assert.strictEqual(refreshed.reconciliation.sessionListComplete, false);
  assert.strictEqual(refreshed.presentation.apiEquivalentDollarsAreSubscriptionPercentage, false);
  assert.strictEqual(refreshed.sources.native.summary.tokens.total.value, 12);
  assert.strictEqual(refreshed.sources.codeburn.report.overview.apiEquivalentEstimate.kind, "api_equivalent_estimate");
  assert.strictEqual(refreshed.sources.codeburn.report.overview.apiEquivalentEstimate.subscriptionEquivalent, false);

  console.log(JSON.stringify({
    ok: true,
    checked: ["USG07", "USG09", "USG10", "USG11", "USG12", "USG15", "USG16", "USG17"]
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
