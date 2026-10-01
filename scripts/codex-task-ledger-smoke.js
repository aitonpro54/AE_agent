"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { summarizeTask } = require("./codex-task-ledger");

const ROOT = "11111111-1111-4111-8111-111111111111";
const CHILD = "22222222-2222-4222-8222-222222222222";
const usage = (input, cached, output, reasoning) => ({ input_tokens: input, cached_input_tokens: cached, output_tokens: output, reasoning_output_tokens: reasoning });
const record = (thread, response, values) => ({ type: "token_usage_record", timestamp: "2026-09-28T10:00:00Z", payload: {
  thread_id: thread, turn_id: "turn-1", response_id: response, usage: values,
  thread_token_usage: usage(999999, 0, 999999, 0)
} });

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ae-task-ledger-"));
  try {
    const write = (id, rows) => fs.writeFileSync(path.join(dir, `rollout-${id}.jsonl`), rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
    write(ROOT, [
      { type: "session_meta", payload: { session_id: ROOT } },
      { type: "turn_context", payload: { turn_id: "turn-1", model: "gpt-6-sol", effort: "high" } },
      record(ROOT, "resp-1", usage(100, 60, 20, 5)),
      record(ROOT, "resp-1", usage(100, 60, 20, 5))
    ]);
    write(CHILD, [
      { type: "session_meta", payload: { id: CHILD, session_id: ROOT, parent_thread_id: ROOT } },
      { type: "turn_context", payload: { turn_id: "turn-1", model: "gpt-6-luna", effort: "high" } },
      record(CHILD, "resp-2", usage(40, 30, 10, 2))
    ]);
    const result = await summarizeTask(dir, [ROOT, CHILD]);
    assert.equal(result.responses, 2, "duplicate response is not additive");
    assert.deepEqual(result.totals, { inputTokens: 140, cachedInputTokens: 90, uncachedInputTokens: 50, outputTokens: 30, reasoningOutputTokens: 7 });
    assert.equal(result.models["gpt-6-luna"].responses, 1);
    assert.equal(result.sessions[1].parentThreadId, ROOT);
    assert.equal(result.taskEstimatePercent, null, "tokens are not a subscription percentage");
    write(CHILD, [{ type: "session_meta", payload: { session_id: CHILD } }, record(CHILD, "resp-bad", usage(10, 11, 0, 0))]);
    await assert.rejects(summarizeTask(dir, [ROOT, CHILD]), /invalid_usage_record/);
    write(CHILD, [{ type: "session_meta", payload: { session_id: CHILD } }, record(CHILD, "resp-2", usage(10, 0, 1, 0)), record(CHILD, "resp-2", usage(20, 0, 1, 0))]);
    await assert.rejects(summarizeTask(dir, [ROOT, CHILD]), /conflicting_response_id/);
    await assert.rejects(summarizeTask(dir, [ROOT, ROOT]), /invalid_thread_ids/);
    console.log(JSON.stringify({ ok: true, checks: "response deduplication, child accounting, cache subset, cumulative exclusion, malformed/conflicting fail closed" }));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

main().catch((error) => { console.error(error.stack); process.exitCode = 1; });
