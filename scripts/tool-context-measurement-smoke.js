"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { PassThrough } = require("stream");
const { EventEmitter } = require("events");
const { spawn } = require("child_process");
const m = require("./tool-context-measurement");
const { productionUsageTools } = require("../mcp-server/production-usage-tools");
const { projectPlanRunSummary } = require("../mcp-server/plan-run-response");
const clone = object => JSON.parse(JSON.stringify(object));
const passed = [];
async function check(name, action) { await action(); passed.push(name); }

async function main() {
  await check("collector_overflow_transactional", () => {
    const c = new m.BoundedBufferCollector(30); c.append("a".repeat(25));
    assert.throws(() => c.append("b".repeat(30)), /collector_overflow/);
    assert.strictEqual(c.byteLength, 25); assert.deepStrictEqual(c.toBuffer(), Buffer.from("a".repeat(25)));
    c.append("c".repeat(5)); assert.strictEqual(c.toBuffer().length, 30);
  });
  await check("stdio_split_utf8_and_delimiter", async () => {
    const stream = new PassThrough(), reader = new m.StdioLineReader(stream, 100);
    const a = reader.readLine(), b = reader.readLine(), raw = Buffer.from('{"x":"🎬"}\n{"ok":true}\n');
    stream.write(raw.subarray(0, 8)); stream.end(raw.subarray(8));
    assert.deepStrictEqual((await a).rawBuffer, Buffer.from('{"x":"🎬"}\n'));
    assert.deepStrictEqual((await b).rawBuffer, Buffer.from('{"ok":true}\n'));
    await assert.rejects(reader.readLine(), /stdio_closed/); reader.destroy();
  });
  await check("stdio_overflow_settles_pending_future_and_unrequested_reads", async () => {
    for (const text of ["abcd\n", "abcd"]) {
      const stream = new PassThrough(), reader = new m.StdioLineReader(stream, 3);
      const pending = reader.readLine(); stream.write(text);
      await assert.rejects(pending, /collector_overflow/); await assert.rejects(reader.readLine(), /collector_overflow/);
      stream.end(); reader.destroy();
    }
    const stream = new PassThrough(), reader = new m.StdioLineReader(stream, 3);
    stream.write("abcd\n"); await assert.rejects(reader.readLine(), /collector_overflow/); stream.end(); reader.destroy();
  });
  await check("stdio_no_delimiter_error_destroy_settle_requests", async () => {
    const stream = new PassThrough(), reader = new m.StdioLineReader(stream);
    const pending = reader.readLine(); stream.end("{}"); await assert.rejects(pending, /line_delimiter_missing/); reader.destroy();
    for (const reason of ["error", "destroy"]) {
      const source = new PassThrough(), lines = new m.StdioLineReader(source), a = lines.readLine(), b = lines.readLine();
      if (reason === "error") source.emit("error", new Error("synthetic_stream_error")); else lines.destroy();
      await assert.rejects(a); await assert.rejects(b); lines.destroy(); source.end();
    }
  });
  await check("stderr_overflow_is_caught", () => {
    const stream = new PassThrough(); let error;
    const monitor = m.monitorStream(stream, caught => { error = caught; }, 3); stream.write("abcd");
    assert.strictEqual(error.code, "collector_overflow"); assert.throws(() => monitor.check(), /collector_overflow/);
    assert.strictEqual(monitor.collector.byteLength, 0); stream.end();
  });
  await check("http_collector_overflow_and_early_close_reject", async () => {
    const stream = new PassThrough(), collected = m.readHttpBuffer(stream, 3); stream.write("abcd");
    await assert.rejects(collected, /collector_overflow/);
    const closed = new PassThrough(), incomplete = m.readHttpBuffer(closed); closed.destroy();
    await assert.rejects(incomplete, /http_closed_before_end/);
  });
  await check("utf16_utf8_surrogate_units_raw_vs_normalized", () => {
    const text = "🎬🎨🚀✨"; assert.strictEqual(text.length, 7); assert.strictEqual(Buffer.byteLength(text), 15);
    const c = new m.BoundedBufferCollector(); c.append(text); assert.strictEqual(c.byteLength, 15);
    const raw = Buffer.from(' { "x": "🎬" }\n'), metrics = m.wireMetrics(raw, JSON.parse(raw.toString()));
    assert.strictEqual(metrics.wireUtf8Bytes, raw.length); assert.strictEqual(metrics.serializedJsonUtf16Chars, 10);
    assert.strictEqual(metrics.normalizedJsonUtf8Bytes, 12); assert.notStrictEqual(metrics.payloadSha256, metrics.normalizedJsonSha256);
  });
  await check("catalog_full_schema_names_descriptions_and_fallback", () => {
    const tool = { name: "read_comp", description: "fixture", inputSchema: { type: "object", properties: { id: { type: "integer" } } } };
    const daemon = [tool, ...productionUsageTools], adapter = clone(daemon);
    assert.strictEqual(m.validateCatalogUnion(daemon, adapter).fullContractsEqual, true);
    assert.throws(() => m.validateCatalogUnion(daemon, productionUsageTools), /local_only_fallback/);
    assert.throws(() => m.validateCatalogUnion(daemon, [...adapter, tool]), /catalog_duplicate/);
    const name = clone(adapter); name[0].name = "same_size_wrong_tool";
    assert.throws(() => m.validateCatalogUnion(daemon, name), /catalog_name_union_mismatch/);
    const schema = clone(adapter); schema[0].inputSchema.properties.id.type = "string";
    assert.throws(() => m.validateCatalogUnion(daemon, schema), /catalog_contract_mismatch/);
    const description = clone(adapter); description[0].description = "different";
    assert.throws(() => m.validateCatalogUnion(daemon, description), /catalog_contract_mismatch/);
  });
  await check("canonical_summary_parity_normalizes_omitted_null_error", () => {
    const compact = m.measurePlanRunSummaryParity(); assert.strictEqual(compact.compaction.syntheticParityPassed, true);
    assert.strictEqual(compact.compaction.nativeAeResult, false); assert(!Object.hasOwn(compact.summary, "errorCode"));
    assert.strictEqual(compact.rows[0].wireUtf8Bytes, null); assert(compact.compaction.projectionOmissions.some(item => item.includes("observedAt")));
  });
  await check("summary_tampering_identity_outcomes_repair_evidence_provenance", () => {
    const full = m.CANONICAL_SYNTHETIC_RUN, original = projectPlanRunSummary(full);
    const corruptions = [
      s => { s.id = "wrong"; }, s => { s.startedAt = "wrong"; }, s => { s.finishedAt = "wrong"; }, s => { s.executedCount++; },
      s => { s.errorCode = "hidden_failure"; }, s => { s.outcome.execution.status = "failed"; },
      s => { s.outcome.mutation.status = "unknown"; }, s => { s.outcome.mutation.counts.unknown = 1; },
      s => { s.outcome.verification.status = "unverified"; }, s => { s.outcome.coverage.status = "incomplete"; },
      s => { s.repairDirective.runId = "wrong"; }, s => { s.repairDirective.automaticReplayAllowed = true; },
      s => { s.provenance.runtime = {}; }, s => { s.provenance.planSha256 = "wrong"; },
      s => { s.steps[2].evidence.sha256 = "wrong"; }, s => { s.evidenceReference.runId = "wrong"; },
      s => { s.semanticVerification.failedChecks = 1; }
    ];
    for (const corrupt of corruptions) { const summary = clone(original); corrupt(summary); assert.throws(() => m.verifyPlanRunParity(full, summary)); }
  });
  await check("planner_metadata_cross_checks_captured_text", () => {
    const prompt = "start\n\nAvailable MCP tools. Use these names exactly; do not invent tool names. Relevant contracts:\n\n- a: one\n- b: two\n\nAdditional supported tool names (rest)";
    const request = { messages: [{ role: "user", content: prompt }] }, metadata = { promptChars: prompt.length, catalogChars: 17, selectedToolCount: 2 };
    assert.strictEqual(m.plannerPromptCrossCheck(request, metadata).prompt, prompt);
    for (const key of Object.keys(metadata)) assert.throws(() => m.plannerPromptCrossCheck(request, { ...metadata, [key]: metadata[key] + 1 }));
  });
  await check("external_usage_no_actual_tokens_inference_or_unproved_adoption", () => {
    for (const record of [null, {}, { fake: true }, { synthetic: true }, { estimated: true },
      { response_id: "550e8400-e29b-41d4-a716-446655440000", provenance: {}, requestId: true, caseId: [], controlledABPairId: true, totalTokens: -500 },
      { response_id: "550e8400-e29b-41d4-a716-446655440000", outcome: "completed", inputTokens: 100, outputTokens: 20, cachedInputTokens: 500, reasoningTokens: -1 },
      { taskTotalTokens: 1200 }, { totalTokens: 120, observed: true, provenance: { source: "unverified-client-claim" } }]) {
      const imported = m.importObservedUsageRecord(record); assert.strictEqual(imported.ok, false);
      assert.strictEqual(imported.eligibleForSchemaSavings, false); assert.strictEqual(imported.attributionLevel, "unattributed_usage");
      assert.strictEqual(imported.observedUsage.input, null); assert.strictEqual(imported.observedUsage.available, false);
    }
    assert.strictEqual(m.inferTokensFromChars(10000).tokens, null);
    const decision = m.assessLazyLoadingDecision({ controlledAB: true, observedTokensAvailable: true, taskQualityEvaluated: true, qualityParityMet: true, tokenSavingsPercent: 110 });
    assert.strictEqual(decision.recommendation, "defer"); assert.strictEqual(decision.comparableAB, false);
    assert.strictEqual(decision.tokenSavingsPercent, null); assert.strictEqual(decision.taskQualityMeasured, false);
  });
  await check("port_health_source_negative_gates", () => {
    for (const port of [3456, 0, "4567", 65536]) assert.throws(() => m.validateLoopbackPort(port));
    assert.strictEqual(m.validateLoopbackPort(4567), 4567);
    const health = { ok: true, panelConnected: false, pending: 0, inflight: 0 }; m.assertDisconnectedHealth(health);
    for (const field of ["panelConnected", "pending", "inflight"]) assert.throws(() => m.assertDisconnectedHealth({ ...health, [field]: true }));
    assert.throws(() => m.validateSourceFreshness([{ path: "adapter.js", sha256: "a" }], [{ path: "adapter.js", sha256: "b" }]));
  });
  await check("exit_event_and_code_or_signal_required_kill_false_rejected", async () => {
    for (const exitCode of [null, 0]) {
      const alive = new EventEmitter(); Object.assign(alive, { pid: 999999, exitCode, signalCode: null, kill: () => false }); m.trackChild(alive);
      await assert.rejects(m.stopChildProcess(alive, 25), /child_exit_unconfirmed/);
    }
    const signal = new EventEmitter(); Object.assign(signal, { pid: 999998, exitCode: null, signalCode: null, kill() {
      this.signalCode = "SIGTERM"; this.emit("exit", null, "SIGTERM"); return true;
    } }); m.trackChild(signal); assert.strictEqual((await m.stopChildProcess(signal, 25)).exitConfirmed, true);
  });
  await check("isolated_environment_guards_and_owned_cleanup", async () => {
    const runtime = m.createOwnedRuntime(); let child;
    try {
      const auditPath = path.join(runtime, "audit.jsonl"), bootstrap = path.join(runtime, "guard.cjs"); fs.writeFileSync(bootstrap, m.CHILD_BOOTSTRAP);
      const env = m.createScrubbedEnvironment(runtime, { port: 4567, token: "synthetic", auditPath });
      for (const key of ["NODE_OPTIONS", "PATH", "OPENAI_API_KEY", "OLLAMA_MODEL", "HTTP_PROXY", "CODEX_PROFILE"]) assert(!Object.hasOwn(env, key));
      for (const key of ["CODEX_HOME", "CODEX_PATH", "CODEX_CLI_PATH", "HOME", "USERPROFILE", "CODEBURN_NATIVE_JOURNAL"]) assert(env[key].startsWith(runtime + path.sep));
      const script = 'const assert=require("assert"); const cp=require("child_process"); assert.equal(cp.spawnSync("codex",["--version"]).error.code,"ENOENT"); assert.throws(()=>cp.spawn("codex",["login","status"])); assert.throws(()=>require("http").request("http://example.com")); assert.throws(()=>require("https").request("https://example.com")); const agents=require("./mcp-server/ai-agents"); assert.equal(agents.getCodexCliStatus().installed,false); assert.throws(()=>agents.chatWithAgent({agentId:"openai"}));';
      child = spawn(process.execPath, ["--require", bootstrap, "-e", script], { cwd: path.resolve(__dirname, ".."), env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      m.trackChild(child); const stderr = m.monitorStream(child.stderr, () => {}); m.monitorStream(child.stdout, () => {});
      await new Promise((resolve, reject) => { child.once("exit", resolve); child.once("error", reject); });
      assert.strictEqual(child.exitCode, 0, stderr.collector.toString());
      const audit = fs.readFileSync(auditPath, "utf8").trim().split("\n").map(line => JSON.parse(line));
      for (const code of ["nested_process_blocked", "outbound_http_blocked", "provider_lane_blocked"]) assert(audit.some(event => event.code === code));
      assert(audit.some(event => event.kind === "guard_ready"));
      assert(audit.some(event => event.kind === "source" && event.path === "mcp-server/ai-agents.js"));
      assert.throws(() => m.safeRemoveTempDirectory("tool-context-meas-relative")); assert.throws(() => m.safeRemoveTempDirectory(path.dirname(runtime)), /cleanup_not_owned/);
      const marker = path.join(runtime, ".measurement-owner.json"), original = fs.readFileSync(marker);
      fs.writeFileSync(marker, "{}"); assert.throws(() => m.safeRemoveTempDirectory(runtime), /cleanup_owner_mismatch/); fs.writeFileSync(marker, original);
    } finally { if (child) await m.stopChildProcess(child); m.safeRemoveTempDirectory(runtime); }
  });
  console.log(JSON.stringify({ ok: true, checks: passed.length, passed }, null, 2));
}
if (require.main === module) main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
module.exports = { main };
