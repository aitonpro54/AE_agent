"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
// Offline fixture must never start or contact the live bridge daemon.
process.env.AE_DAEMON_AUTO_START = "0";
process.env.AE_BRIDGE_PORT = "1";

const {
  createNativeUsageStore,
  normalizeUsageRecord,
  SNAPSHOT_SCHEMA
} = require("../mcp-server/native-usage");
const {
  productionUsageTools,
  isProductionUsageTool,
  handleProductionUsageTool,
  getTaskUsage,
  getUsageHistory,
  executeCodeburnQuery
} = require("../mcp-server/production-usage-tools");
const {
  getTools,
  handleRpc
} = require("../mcp-server/mcp-adapter");

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "production-usage-smoke-"));

  try {
    // -------------------------------------------------------------------------
    // 1. Store without journalPath (in-memory only, no disk writes)
    // -------------------------------------------------------------------------
    const memoryStore = createNativeUsageStore({ maxRecords: 10 });
    const initialMemSnap = memoryStore.snapshot();
    assert.strictEqual(initialMemSnap.persistence.status, "disabled");
    assert.strictEqual(initialMemSnap.persistence.warning, undefined);

    memoryStore.record({
      recordId: "mem-rec-1",
      requestId: "req-1",
      provider: "openai-cli",
      modelId: "gpt-5.6-sol",
      activityScope: "ae_execution",
      usage: { input_tokens: 100, output_tokens: 20 }
    });
    memoryStore.record({
      recordId: "mem-snap-1",
      aggregation: "snapshot",
      usage: { input_tokens: 500, output_tokens: 100 }
    });

    const memSnap = memoryStore.snapshot();
    assert.strictEqual(memSnap.persistence.status, "disabled");
    assert.strictEqual(memSnap.records.length, 2);
    assert.strictEqual(memSnap.summary.includedRecordCount, 1);
    assert.strictEqual(memSnap.summary.excludedSnapshotCount, 1);

    // -------------------------------------------------------------------------
    // 2. Store with journalPath (durable JSONL append, fail-safe)
    // -------------------------------------------------------------------------
    const journalFile = path.join(tempDir, "nested", "native-usage.jsonl");
    const durableStore = createNativeUsageStore({ maxRecords: 10, journalPath: journalFile });

    const initDurableSnap = durableStore.snapshot();
    assert.strictEqual(initDurableSnap.persistence.status, "active");
    assert.strictEqual(initDurableSnap.persistence.warning, undefined);

    // Append increment record 1
    durableStore.record({
      recordId: "durable-rec-1",
      requestId: "req-durable-1",
      provider: "openai-cli",
      modelId: "gpt-5.6-sol",
      activityScope: "ae_execution",
      usage: { input_tokens: 150, output_tokens: 30, cached_input_tokens: 50, reasoning_tokens: 10 }
    });

    assert(fs.existsSync(journalFile), "Journal file should be created");
    let lines = fs.readFileSync(journalFile, "utf8").trim().split(/\r?\n/);
    assert.strictEqual(lines.length, 1);
    const parsedLine1 = JSON.parse(lines[0]);
    assert.strictEqual(parsedLine1.recordId, "durable-rec-1");
    assert.strictEqual(parsedLine1.tokens.input, 150);
    assert.strictEqual(parsedLine1.tokens.cachedInput, 50);
    // Verify no prompt or path leakage in journal
    assert.strictEqual(Object.prototype.hasOwnProperty.call(parsedLine1, "prompt"), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(parsedLine1, "path"), false);

    // Duplicate recordId in memory must not append duplicate line to journal
    durableStore.record({
      recordId: "durable-rec-1",
      usage: { input_tokens: 9999, output_tokens: 9999 }
    });
    lines = fs.readFileSync(journalFile, "utf8").trim().split(/\r?\n/);
    assert.strictEqual(lines.length, 1, "Duplicate recordId in memory must not append again");

    // Snapshot aggregation must not be appended to journal
    durableStore.record({
      recordId: "durable-snap-1",
      aggregation: "snapshot",
      usage: { input_tokens: 5000, output_tokens: 2000 }
    });
    lines = fs.readFileSync(journalFile, "utf8").trim().split(/\r?\n/);
    assert.strictEqual(lines.length, 1, "Snapshots must not be journaled");

    // Append increment record 2
    durableStore.record({
      recordId: "durable-rec-2",
      requestId: "req-durable-2",
      parentRecordId: "durable-rec-1",
      provider: "openai-cli",
      modelId: "future-model",
      usage: { input_tokens: 40, output_tokens: 10 }
    });
    lines = fs.readFileSync(journalFile, "utf8").trim().split(/\r?\n/);
    assert.strictEqual(lines.length, 2, "Second increment must be appended");

    const durableSnap = durableStore.snapshot();
    assert.strictEqual(durableSnap.persistence.status, "active");
    assert.strictEqual(durableSnap.persistence.warning, undefined);
    assert.strictEqual(durableSnap.records.length, 3);
    assert.strictEqual(durableSnap.summary.includedRecordCount, 2);

    // -------------------------------------------------------------------------
    // 3. Fail-open behavior when journalPath cannot be written
    // -------------------------------------------------------------------------
    const unwritablePath = path.join(tempDir, "unwritable_dir");
    fs.mkdirSync(unwritablePath); // Making it a directory causes appendFileSync to fail
    const failingStore = createNativeUsageStore({ maxRecords: 10, journalPath: unwritablePath });

    // Must NOT throw when append fails (fail-open)
    const recResult = failingStore.record({
      recordId: "fail-rec-1",
      usage: { input_tokens: 10, output_tokens: 5 }
    });
    assert(recResult, "record() must succeed in-memory even when journal write fails");

    const failingSnap = failingStore.snapshot();
    assert.strictEqual(failingSnap.persistence.status, "degraded");
    assert.strictEqual(failingSnap.persistence.warning, "journal_write_failed");
    assert.strictEqual(Object.prototype.hasOwnProperty.call(failingSnap.persistence, "path"), false, "Snapshot persistence must not leak path");
    assert.strictEqual(Object.prototype.hasOwnProperty.call(failingSnap.persistence, "rawError"), false, "Snapshot persistence must not leak raw error");
    assert.strictEqual(failingSnap.records.length, 1);

    // -------------------------------------------------------------------------
    // 4. production-usage-tools validation & annotations
    // -------------------------------------------------------------------------
    assert.strictEqual(productionUsageTools.length, 2);
    for (const tool of productionUsageTools) {
      assert.strictEqual(tool.annotations && tool.annotations.readOnlyHint, true, "Tool must have readOnlyHint: true");
    }

    assert.strictEqual(isProductionUsageTool("get_task_usage"), true);
    assert.strictEqual(isProductionUsageTool("get_usage_history"), true);
    assert.strictEqual(isProductionUsageTool("run_extendscript"), false);

    // get_task_usage validation
    const missingThread = await getTaskUsage({});
    assert.strictEqual(missingThread.isError, true);
    assert.match(missingThread.content[0].text, /thread_id is required/);

    const currentThread = await getTaskUsage({ thread_id: "current" });
    assert.strictEqual(currentThread.isError, true);
    assert.match(currentThread.content[0].text, /'current' thread_id is not allowed/);

    const invalidUuid = await getTaskUsage({ thread_id: "invalid-uuid-123" });
    assert.strictEqual(invalidUuid.isError, true);
    assert.match(invalidUuid.content[0].text, /valid UUID string/);

    // get_usage_history validation
    const invalidFrom = await getUsageHistory({ from: "2026/09/20" });
    assert.strictEqual(invalidFrom.isError, true);
    assert.match(invalidFrom.content[0].text, /YYYY-MM-DD/);

    const invalidTo = await getUsageHistory({ to: "not-a-date" });
    assert.strictEqual(invalidTo.isError, true);
    assert.match(invalidTo.content[0].text, /YYYY-MM-DD/);

    // -------------------------------------------------------------------------
    // 5. Query execution with mock runner & fixture CLI
    // -------------------------------------------------------------------------
    let capturedCmd = null;
    const mockRunner = (cmd) => {
      capturedCmd = cmd;
      return Promise.resolve({
        exitCode: 0,
        stdout: JSON.stringify({
          ok: true,
          source: "codeburn_sqlite_fixture",
          task: { thread_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", tokens: { total: 420 } }
        }),
        stderr: "",
        timedOut: false,
        outputExceeded: false
      });
    };

    const taskResult = await getTaskUsage({
      thread_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      include_children: true
    }, { runner: mockRunner });

    assert.strictEqual(taskResult.isError, false);
    const parsedPayload = JSON.parse(taskResult.content[0].text);
    assert.strictEqual(parsedPayload.ok, true);
    assert.strictEqual(parsedPayload.task.tokens.total, 420);
    assert(capturedCmd.args.includes("--thread"));
    assert(capturedCmd.args.includes("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"));
    assert(capturedCmd.args.includes("--children"));

    // Test include_children = false
    await getTaskUsage({
      thread_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      include_children: false
    }, { runner: mockRunner });
    assert(!capturedCmd.args.includes("--children"), "--children should be omitted when false");

    // Test getUsageHistory query args
    await getUsageHistory({
      project: "montage-alpha",
      from: "2026-09-01",
      to: "2026-09-30",
      model: "gpt-5.6-sol"
    }, { runner: mockRunner });
    assert(capturedCmd.args.includes("--project"));
    assert(capturedCmd.args.includes("montage-alpha"));
    assert(capturedCmd.args.includes("--from"));
    assert(capturedCmd.args.includes("2026-09-01"));
    assert(capturedCmd.args.includes("--to"));
    assert(capturedCmd.args.includes("2026-09-30"));
    assert(capturedCmd.args.includes("--model"));
    assert(capturedCmd.args.includes("gpt-5.6-sol"));

    // Test timeout handling
    const timedOutRes = await getTaskUsage({
      thread_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    }, {
      runner: () => Promise.resolve({ exitCode: null, stdout: "", stderr: "", timedOut: true, outputExceeded: false })
    });
    assert.strictEqual(timedOutRes.isError, true);
    assert.match(timedOutRes.content[0].text, /timed out/);

    // Test output limit handling
    const limitRes = await getTaskUsage({
      thread_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    }, {
      runner: () => Promise.resolve({ exitCode: null, stdout: "", stderr: "", timedOut: false, outputExceeded: true })
    });
    assert.strictEqual(limitRes.isError, true);
    assert.match(limitRes.content[0].text, /exceeded 2MB/);

    // Test non-zero exit
    const errorRes = await getTaskUsage({
      thread_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    }, {
      runner: () => Promise.resolve({ exitCode: 1, stdout: "", stderr: "database locked", timedOut: false, outputExceeded: false })
    });
    assert.strictEqual(errorRes.isError, true);
    assert.match(errorRes.content[0].text, /process failed/);
    assert(!errorRes.content[0].text.includes("database locked"), "Raw stderr must not be exposed");

    // -------------------------------------------------------------------------
    // 6. Subprocess fixture CLI execution via fake Python
    // -------------------------------------------------------------------------
    const fixtureRoot = path.join(tempDir, "fake_codeburn_home");
    fs.mkdirSync(fixtureRoot, { recursive: true });
    fs.writeFileSync(path.join(fixtureRoot, "codeburn.py"), "# mock codeburn CLI\n", "utf8");

    const mockNodeScript = path.join(tempDir, "mock_runner.js");
    fs.writeFileSync(mockNodeScript, `
      const args = process.argv.slice(2);
      process.stdout.write(JSON.stringify({
        ok: true,
        source: "mock_subprocess_child",
        receivedArgs: args
      }));
      process.exit(0);
    `, "utf8");

    fs.writeFileSync(path.join(fixtureRoot, "codeburn.py"),
      'import json,sys\nprint(json.dumps({"ok":True,"source":"mock_subprocess_child","receivedArgs":sys.argv[1:],"label":"проект✓"*20000},ensure_ascii=False))\n', "utf8");

    const spawnedResult = await getTaskUsage({
      thread_id: "12345678-1234-1234-1234-123456789abc"
    }, {
      home: fixtureRoot,
      python: process.env.CODEBURN_ANALYTICS_PYTHON || "python"
    });
    assert.strictEqual(spawnedResult.isError, false);
    const spawnedPayload = JSON.parse(spawnedResult.content[0].text);
    assert.strictEqual(spawnedPayload.ok, true);
    assert.strictEqual(spawnedPayload.source, "mock_subprocess_child");
    assert.strictEqual(spawnedPayload.label, "проект✓".repeat(20000), "UTF-8 must survive split pipe chunks");

    // -------------------------------------------------------------------------
    // 7. MCP Adapter integration without running daemon
    // -------------------------------------------------------------------------
    // tools/list without daemon must still return local tools
    const tools = await getTools();
    assert(Array.isArray(tools));
    const toolNames = new Set(tools.map((t) => t.name));
    assert(toolNames.has("get_task_usage"), "tools/list must include get_task_usage when daemon is offline");
    assert(toolNames.has("get_usage_history"), "tools/list must include get_usage_history when daemon is offline");

    // handleRpc dispatch tests
    const rpcResponses = [];
    // We capture stdout during handleRpc
    const origWrite = process.stdout.write;
    let rpcBuffer = "";
    process.stdout.write = (chunk) => {
      rpcBuffer += chunk.toString("utf8");
      const parts = rpcBuffer.split("\n");
      rpcBuffer = parts.pop();
      for (const line of parts) {
        const trimmed = line.trim();
        if (trimmed) {
          try {
            rpcResponses.push(JSON.parse(trimmed));
          } catch (_e) {}
        }
      }
      return true;
    };

    try {
      // Test initialize instructions
      await handleRpc({ jsonrpc: "2.0", id: 101, method: "initialize" });
      const initResp = rpcResponses.find((r) => r.id === 101);
      assert(initResp && initResp.result && initResp.result.instructions);
      assert.match(initResp.result.instructions, /get_task_usage/);
      assert.match(initResp.result.instructions, /UUID/);

      // Test tools/list RPC
      await handleRpc({ jsonrpc: "2.0", id: 102, method: "tools/list" });
      const listResp = rpcResponses.find((r) => r.id === 102);
      assert(listResp && listResp.result && Array.isArray(listResp.result.tools));
      const listToolNames = new Set(listResp.result.tools.map((t) => t.name));
      assert(listToolNames.has("get_task_usage"));
      assert(listToolNames.has("get_usage_history"));

      // Test tools/call RPC for local tool (get_task_usage with invalid 'current')
      await handleRpc({
        jsonrpc: "2.0",
        id: 103,
        method: "tools/call",
        params: {
          name: "get_task_usage",
          arguments: { thread_id: "current" }
        }
      });
      const callResp = rpcResponses.find((r) => r.id === 103);
      assert(callResp && callResp.result);
      assert.strictEqual(callResp.result.isError, true);
      assert.match(callResp.result.content[0].text, /'current' thread_id is not allowed/);
      // Ensure error was not converted to bridge_unreachable
      assert.strictEqual(callResp.result.content[0].text.includes("bridge_unreachable"), false);
    } finally {
      process.stdout.write = origWrite;
    }

    console.log(JSON.stringify({
      ok: true,
      checked: [
        "native_usage_memory_disabled",
        "native_usage_durable_journal",
        "native_usage_duplicate_idempotent",
        "native_usage_snapshot_excluded_from_journal",
        "native_usage_fail_open_degraded",
        "production_usage_tools_annotations",
        "get_task_usage_uuid_validation",
        "get_task_usage_current_rejected",
        "get_usage_history_date_validation",
        "mock_runner_query_execution",
        "mock_subprocess_child_fixture",
        "mcp_adapter_tools_list_without_daemon",
        "mcp_adapter_local_tool_routing_before_daemon",
        "mcp_adapter_local_error_not_bridge_unreachable",
        "mcp_adapter_initialize_instructions"
      ]
    }, null, 2));

  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_err) {}
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.stack || String(err));
    process.exit(1);
  });
}

module.exports = { main };
