"use strict";

const assert = require("node:assert/strict");
const { createNativeUsageStore, recordObservedProviderCall } = require("../mcp-server/native-usage");

const store = createNativeUsageStore();
const primary = { recordId: "plan:one:primary", requestId: "one", provider: "test-provider",
  modelId: "test-model", usage: { input_tokens: 100, output_tokens: 20 } };
recordObservedProviderCall(store, primary);
recordObservedProviderCall(store, { recordId: "plan:two:primary", requestId: "two",
  provider: "test-provider", modelId: "test-model", usage: null });
recordObservedProviderCall(store, primary);
const snapshot = store.snapshot();
assert.equal(snapshot.records.length, 2, "only two observed calls; no phantom repair");
assert.equal(snapshot.summary.includedRecordCount, 2);
assert.equal(snapshot.summary.tokens.total.value, 120, "known subtotal is retained");
assert.equal(snapshot.summary.tokens.total.complete, false);
assert.equal(snapshot.summary.tokens.total.missingRecords, 1);
assert.equal(snapshot.records[1].tokens.total, null, "missing usage stays unknown");
assert.equal(snapshot.records[1].tokens.input, null);
assert.equal(snapshot.records[1].outcome, "completed");
const failures = createNativeUsageStore();
recordObservedProviderCall(failures, { recordId: "chat:attempted-timeout", requestId: "attempted-timeout",
  provider: "test-provider", outcome: "failed_unknown", usage: null });
const failedSnapshot = failures.snapshot();
assert.equal(failedSnapshot.records[0].outcome, "failed_unknown");
assert.equal(failedSnapshot.summary.tokens.total.value, null, "timeout has no proven zero usage");
assert.equal(failedSnapshot.summary.tokens.total.complete, false);
console.log(JSON.stringify({ ok: true, records: snapshot.records.length, total: snapshot.summary.tokens.total,
  failedUnknown: failedSnapshot.summary.tokens.total }, null, 2));
