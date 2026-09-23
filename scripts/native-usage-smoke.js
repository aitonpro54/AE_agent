"use strict";

const assert = require("assert");
const {
  createNativeUsageStore,
  normalizeTokens,
  normalizeUsageRecord
} = require("../mcp-server/native-usage");

const nested = normalizeTokens({
  input_tokens: 100,
  output_tokens: 40,
  input_tokens_details: { cached_tokens: 60 },
  output_tokens_details: { reasoning_tokens: 15 }
});
assert.deepStrictEqual(nested, {
  input: 100,
  output: 40,
  cachedInput: 60,
  reasoning: 15,
  total: 140
});

const missingVsZero = normalizeUsageRecord({
  recordId: "zero",
  observedAt: "2026-09-19T00:00:00.000Z",
  modelId: "gpt-fixture-zero",
  usage: { input_tokens: 0, output_tokens: 0 }
});
assert.strictEqual(missingVsZero.tokens.input, 0);
assert.strictEqual(missingVsZero.tokens.output, 0);
assert.strictEqual(missingVsZero.tokens.cachedInput, null);
assert.strictEqual(missingVsZero.tokens.reasoning, null);

const store = createNativeUsageStore({ maxRecords: 10 });
store.record({
  recordId: "parent-call",
  requestId: "request-1",
  observedAt: "2026-09-19T00:00:01.000Z",
  provider: "openai-cli",
  modelId: "gpt-5.6-sol",
  activityScope: "ae_execution",
  usage: { input_tokens: 100, output_tokens: 20, cached_input_tokens: 70, reasoning_tokens: 5 }
});
store.record({
  recordId: "child-call",
  requestId: "request-1:repair",
  parentRecordId: "parent-call",
  observedAt: "2026-09-19T00:00:02.000Z",
  provider: "openai-cli",
  modelId: "future-model-fixture",
  activityScope: "ae_execution",
  usage: { input_tokens: 10, output_tokens: 2 }
});
store.record({
  recordId: "parent-call",
  usage: { input_tokens: 999999, output_tokens: 999999 }
});
store.record({
  recordId: "cumulative-snapshot",
  aggregation: "snapshot",
  observedAt: "2026-09-19T00:00:03.000Z",
  modelId: "gpt-5.6-sol",
  usage: { input_tokens: 10000, output_tokens: 2000 }
});

const snapshot = store.snapshot();
assert.strictEqual(snapshot.records.length, 3, "same record id must be idempotent");
assert.strictEqual(snapshot.summary.includedRecordCount, 2, "only call increments belong in totals");
assert.strictEqual(snapshot.summary.excludedSnapshotCount, 1, "cumulative snapshots must not become increments");
assert.strictEqual(snapshot.summary.tokens.input.value, 110, "parent and child calls are each counted once");
assert.strictEqual(snapshot.summary.tokens.output.value, 22);
assert.strictEqual(snapshot.summary.tokens.cachedInput.value, 70, "cache is a subset, not extra input");
assert.strictEqual(snapshot.summary.tokens.reasoning.value, 5, "reasoning is a subset, not extra output");
assert.strictEqual(snapshot.summary.tokens.total.value, 132, "total is input + output, without cache/reasoning re-addition");
assert.strictEqual(snapshot.summary.models.length, 2, "raw model ids must remain separate");
assert(snapshot.summary.models.some((item) => item.modelId === "future-model-fixture" && item.priced === null));
assert.strictEqual(Object.prototype.hasOwnProperty.call(snapshot.records[0], "prompt"), false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(snapshot.records[0], "path"), false);

console.log(JSON.stringify({
  ok: true,
  checked: ["USG01", "USG02", "USG03", "USG04", "USG05", "USG06", "USG13", "USG14"],
  recordCount: snapshot.records.length,
  includedRecordCount: snapshot.summary.includedRecordCount
}, null, 2));
