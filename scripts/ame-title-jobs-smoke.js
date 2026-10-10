"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path"), vm = require("node:vm"), crypto = require("node:crypto");
const adapter = require("../mcp-server/ame-title-jobs"), presets = require("../mcp-server/ame-presets");
const acorn = require("internal/deps/acorn/acorn/dist/acorn");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "ae-ame-title-jobs-"));
const batchId = "11111111-1111-4111-8111-111111111111", born = new Date().toISOString();
const sha = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
let groups = 0;
async function check(name, fn) { await fn(); groups++; }
function fixture(label, options = {}) {
  const dir = path.join(root, label), sourcePath = path.join(dir, "source.aep"), presetDir = path.join(dir, "presets"), outputDir = path.join(dir, "outputs"), stateDir = path.join(dir, "state");
  fs.mkdirSync(presetDir, { recursive: true }); fs.writeFileSync(sourcePath, "fixed saved AEP bytes");
  const presetPath = path.join(presetDir, "selected.epr"); fs.writeFileSync(presetPath, "<PremiereData><PresetName>Exact fixture</PresetName><ExporterName>Fixture</ExporterName></PremiereData>");
  const catalog = () => presets.scanPresetRoots({ roots: [{ source: "fixture", path: presetDir }] }), selected = catalog().presets[0]; assert(selected);
  let clock = Date.now(), sends = 0, adds = 0, starts = 0, pendingReply = null, processReads = 0;
  const active = [{ pid: 77, path: "C:\\Program Files\\Adobe\\Adobe Media Encoder 2026\\Adobe Media Encoder.exe", startedAt: born }], wrappers = [], calls = [], hostListeners = {}, manualContexts = new WeakSet();
  class TestDate extends Date { constructor(value) { super(arguments.length ? value : clock); } static now() { return clock; } }
  const forbidden = () => { throw Error("forbidden host action"); };
  const frontend = {
    getDLItemsAtRoot: file => { assert.equal(file, sourcePath); calls.push("getDLItemsAtRoot"); return options.guids === undefined ? ["GUID-exact"] : options.guids; },
    addDLToBatch: (file, format, preset, guid, output) => {
      adds++; calls.push("addDLToBatch"); assert.equal(file, sourcePath); assert.equal(format, ""); assert.equal(preset, fs.realpathSync(selected.canonicalPath)); assert.equal(guid, "GUID-exact");
      const wrapper = { outputFiles: [output], listeners: {}, getEncodeProgress: () => 0, getEncodeTime: () => 12, getLogOutput: () => "fixture native log",
        addEventListener: (name, fn) => { calls.push(name); wrapper.listeners[name] = fn; },
        setWorkArea: (type, start, end) => { calls.push("setWorkArea"); assert.equal(type, 3); wrapper.workArea = [start, end]; return options.workAreaFalse ? false : true; } };
      if (options.wrapperUnsupported) delete wrapper.setWorkArea;
      if (options.wrongOutput) wrapper.outputFiles = [path.join(outputDir, "foreign.mov")]; wrappers.push(wrapper); return wrapper;
    }, removeAllBatchItems: forbidden
  };
  const host = { isBatchRunning: () => options.running === true, addEventListener: (name, fn) => { hostListeners[name] = fn; }, runBatch: () => { starts++; return Object.hasOwn(options, "startResult") ? options.startResult : true; }, stopBatch: forbidden };
  const ame = vm.createContext({ Date: TestDate, JSON: undefined, BridgeTalk: { appSpecifier: "ame-26.0" }, $: { global: { aeAgentAMEProbeSessionNonce: "session" } }, app: { getFrontend: () => frontend, getEncoderHost: () => host, quit: forbidden }, File: forbidden });
  function BridgeTalk() {
    const message = this;
    message.send = () => {
      sends++;
      if (message.body.includes('"operation":"enqueue"')) {
        const reservations = fs.readdirSync(path.join(stateDir, "outputs")); assert.equal(reservations.length >= 1, true);
        const ledger = JSON.parse(fs.readFileSync(path.join(stateDir, "batches", batchId + ".json"), "utf8")); assert.equal(ledger.jobs.at(-1).state, "unknown_outcome"); assert.equal(ledger.jobs.at(-1).nativeJobId, null);
      }
      if (message.body.includes('"operation":"start"')) { const ledger = JSON.parse(fs.readFileSync(path.join(stateDir, "batches", batchId + ".json"), "utf8")); assert.equal(ledger.start.state, "unknown_outcome"); }
      const body = vm.runInContext(message.body, ame);
      if (options.afterSend) options.afterSend({ sends, sourcePath, presetPath, active });
      if (options.unknownFirst && sends === 1 || options.unknownAt === sends) { pendingReply = { message, body }; return true; }
      let responseBody = body;
      if (options.tamperReply) responseBody = JSON.stringify(options.tamperReply(JSON.parse(body)));
      message.onResult({ body: responseBody }); return true;
    };
  }
  BridgeTalk.isRunning = () => !options.notRunning; BridgeTalk.launch = forbidden; BridgeTalk.pump = () => {};
  const ae = vm.createContext({ Date: TestDate, BridgeTalk, $: { global: {}, sleep: ms => { clock += ms; } }, app: { quit: forbidden } });
  const dependency = { stateDir, now: () => clock, listPresetCatalog: catalog,
    inspectProcesses: async () => { processReads++; return active.map(p => ({ ...p })); }, resolveOutputFilePath: name => path.join(outputDir, name),
    assertManualIngress: ctx => { if (!manualContexts.has(ctx) || ctx.channel !== "manual_cep" || ctx.autonomous !== false) throw Error("manual_ingress_required"); },
    assertServerContext: ctx => { if (!manualContexts.has(ctx) || ctx.current !== true) throw Error("server_context_required"); },
    runExtendScriptBody: async (script, timeout, meta) => { assert.equal(timeout, 30000); assert.equal(meta.mutating, !script.includes('"reconcileRequestNonce"') && ["enqueue", "start"].includes(meta.operation)); acorn.parse(script, { ecmaVersion: 3, allowReturnOutsideFunction: true }); return { result: vm.runInContext("(function(){" + script + "}())", ae) }; },
    ...(options.queueGate ? { assertQueueOwnership: options.queueGate } : {})
  };
  const executor = adapter.createExecutor(dependency);
  const common = { targetSpecifier: "ame-26.0", expectedSessionNonce: "session", expectedProcess: { pid: 77, startedAt: born } };
  const enqueueArgs = { ...common, batchId, sourceProjectFile: sourcePath, expectedSourceSha25664: sha(sourcePath), sourceGuid: "GUID-exact", presetId: selected.presetId, presetSha25664: selected.sha256, outputFileName: "title.mov", range: { startSeconds: 1.25, endSeconds: 2.75 } };
  function authorize(name, args, override = {}, brand = true) { const ctx = { channel: "manual_cep", autonomous: false, current: true, ...override }; if (brand) manualContexts.add(ctx); return executor.authorize(name, args, ctx); }
  const run = (name, args) => executor.execute(name, args, name === adapter.ENQUEUE || name === adapter.START ? authorize(name, args) : undefined);
  function output(bytes) { fs.mkdirSync(outputDir, { recursive: true }); const file = path.join(outputDir, "title.mov"); fs.writeFileSync(file, Buffer.alloc(bytes, 7)); fs.utimesSync(file, new Date(clock), new Date(clock)); }
  return { executor, authorize, run, common, enqueueArgs, stateDir, sourcePath, presetPath, wrappers, calls, hostListeners, output,
    ledger: () => JSON.parse(fs.readFileSync(path.join(stateDir, "batches", batchId + ".json"), "utf8")),
    statusArgs: jobId => ({ ...common, batchId, jobId }), counts: () => ({ sends, adds, starts, processReads }), active,
    deliver: () => { assert(pendingReply); pendingReply.message.onResult({ body: pendingReply.body }); pendingReply = null; },
    hostComplete: (result, overrides = {}) => hostListeners.onItemEncodeComplete({ sourceFilePath: sourcePath, outputFilePath: path.join(outputDir, "title.mov"), result, ...overrides }),
    restart: () => adapter.createExecutor(dependency), advance: ms => { clock += ms; } };
}
(async () => {
  await check("closed exact inputs, GUID, preset, output and time range", () => {
    const f = fixture("input"), a = f.enqueueArgs;
    for (const changed of [{ code: "app.quit()" }, { executable: "evil.exe" }, { format: "arbitrary" }, { presetPath: f.presetPath }, { outputPath: "C:\\arbitrary.mov" }, { batchId: "current" }, { presetId: "name" },
      { sourceProjectFile: "relative.aep" }, { outputFileName: "../title.mov" }, { outputFileName: "con.mov" }, { range: { startSeconds: 4, endSeconds: 3 } }, { range: { startSeconds: NaN, endSeconds: 4 } }, { range: { startSeconds: 0, endSeconds: 4, code: "x" } }]) assert.throws(() => adapter.validateInput(adapter.ENQUEUE, { ...a, ...changed }));
    assert.equal(adapter.tools.length, 4); assert.equal(adapter.tools.find(t => t.name === adapter.STATUS).annotations.readOnlyHint, true);
    const native = { operation: "sources", requestNonce: crypto.randomUUID(), targetSpecifier: "ame-26.0", sourcePath: f.sourcePath };
    acorn.parse(adapter.messageScript(native), { ecmaVersion: 3 }); acorn.parse(adapter.commandScript(native), { ecmaVersion: 3, allowReturnOutsideFunction: true });
  });
  await check("private manual args-bound capabilities deny forged autonomous server-stale and reuse", async () => {
    const f = fixture("capability"), a = f.enqueueArgs;
    for (const override of [{ autonomous: true }, { channel: "admin" }, { current: false }]) assert.throws(() => f.authorize(adapter.ENQUEUE, a, override));
    assert.throws(() => f.authorize(adapter.ENQUEUE, a, {}, false)); await assert.rejects(f.executor.execute(adapter.ENQUEUE, a, { channel: "manual_cep" }), /capability_required/);
    const cap = f.authorize(adapter.ENQUEUE, a); await assert.rejects(f.executor.execute(adapter.ENQUEUE, { ...a, outputFileName: "different.mov" }, cap), /capability_required/);
    const submitted = await f.executor.execute(adapter.ENQUEUE, a, cap); assert.equal(submitted.ok, true, JSON.stringify(submitted)); await assert.rejects(f.executor.execute(adapter.ENQUEUE, a, cap), /capability_required/);
  });
  await check("fixed DL read exact GUID strings and unsupported shapes, never first comp", async () => {
    for (const guids of [["GUID-other", "GUID-exact"], [{ guid: "GUID-exact" }], [], ["GUID-exact", "GUID-exact"]]) {
      const f = fixture("guid-" + crypto.randomUUID(), { guids }), args = { ...f.common, sourceProjectFile: f.sourcePath, expectedSourceSha25664: f.enqueueArgs.expectedSourceSha25664 };
      const read = await f.run(adapter.INSPECT, args);
      if (typeof guids[0] === "object") assert.equal(read.code, "dl_items_read_error"); else assert.equal(read.ok, true);
      const submitted = await f.run(adapter.ENQUEUE, f.enqueueArgs);
      assert.equal(submitted.ok, guids.filter(g => g === "GUID-exact").length === 1);
      assert.equal(f.counts().adds, submitted.ok ? 1 : 0);
    }
  });
  await check("durable before native submit, exact EPR automatic format and custom seconds", async () => {
    const f = fixture("submit"), submitted = await f.run(adapter.ENQUEUE, f.enqueueArgs);
    assert.equal(submitted.ok, true); assert.equal(submitted.nativeJobId, null); assert.equal(submitted.nativeAssociationVerified, true); assert.equal(submitted.handleKey, submitted.jobId);
    assert.deepEqual(f.wrappers[0].workArea, [1.25, 2.75]); assert(f.calls.indexOf("onEncodeFinished") < f.calls.indexOf("setWorkArea"));
    assert.equal(f.ledger().jobs[0].nativeJobId, null); assert.equal(f.ledger().jobs[0].readyForStart, true);
    const duplicate = await f.run(adapter.ENQUEUE, f.enqueueArgs); assert.equal(duplicate.code, "duplicate_submit_blocked"); assert.equal(f.counts().adds, 1);
  });
  await check("unknown GUID read reconciles exact source identity without resending", async () => {
    const f = fixture("unknown-sources", { unknownFirst: true }), args = { ...f.common, sourceProjectFile: f.sourcePath, expectedSourceSha25664: f.enqueueArgs.expectedSourceSha25664 };
    const first = await f.run(adapter.INSPECT, args); assert.equal(first.ok, false); assert(/^[a-f0-9-]{36}$/.test(first.requestNonce)); f.deliver();
    const other = path.join(path.dirname(f.sourcePath), "other.aep"); fs.copyFileSync(f.sourcePath, other);
    const foreign = await f.run(adapter.INSPECT, { ...args, sourceProjectFile: other, reconcileRequestNonce: first.requestNonce }); assert.equal(foreign.ok, false);
    const late = await f.run(adapter.INSPECT, { ...args, reconcileRequestNonce: first.requestNonce }); assert.equal(late.ok, true); assert.equal(late.reconciled, true); assert.deepEqual(Array.from(late.sourceGuids), ["GUID-exact"]);
    assert.equal(f.counts().sends, 1); assert.equal(f.counts().adds, 0);
  });
  await check("work area unsupported wrong native output and batch running fail closed", async () => {
    for (const option of ["workAreaFalse", "wrapperUnsupported", "wrongOutput", "running", "notRunning"]) {
      const f = fixture(option, { [option]: true }), result = await f.run(adapter.ENQUEUE, f.enqueueArgs);
      assert.equal(result.ok, false, option); assert.equal(result.nativeAssociationVerified, false); assert.equal(result.automaticRetryAllowed, false);
      assert.equal(f.counts().starts, 0); if (option === "running" || option === "notRunning") assert.equal(f.counts().adds, 0);
    }
  });
  await check("unknown submit exact reconciliation never sends again, persists across server executor restart", async () => {
    const f = fixture("unknown", { unknownFirst: true }), first = await f.run(adapter.ENQUEUE, f.enqueueArgs);
    assert.equal(first.ok, false); assert.equal(first.unknownOutcome, true); assert.equal(f.counts().adds, 1);
    const read = await f.run(adapter.STATUS, f.statusArgs(first.jobId)); assert.equal(read.ok, false); assert.equal(f.counts().sends, 1);
    f.deliver(); const restarted = f.restart(), late = await restarted.execute(adapter.STATUS, f.statusArgs(first.jobId));
    assert.equal(late.ok, true); assert.equal(late.nativeAssociationVerified, true); assert.equal(f.counts().sends, 1);
    assert.equal((await f.run(adapter.ENQUEUE, f.enqueueArgs)).code, "duplicate_submit_blocked"); assert.equal(f.counts().adds, 1);
    assert.equal((await f.run(adapter.STATUS, f.statusArgs(first.jobId))).ok, true); assert.equal(f.counts().sends, 2);
  });
  await check("one exact preset for entire batch and changed source/preset pins refuse", async () => {
    const f = fixture("preset-batch"), first = await f.run(adapter.ENQUEUE, f.enqueueArgs); assert.equal(first.ok, true);
    const anotherPreset = path.join(path.dirname(f.presetPath), "second.epr"); fs.writeFileSync(anotherPreset, "<PremiereData><PresetName>Other fixture</PresetName></PremiereData>");
    const selected = presets.scanPresetRoots({ roots: [{ source: "fixture", path: path.dirname(f.presetPath) }] }).presets.find(p => p.canonicalPath.endsWith("second.epr"));
    const wrong = await f.run(adapter.ENQUEUE, { ...f.enqueueArgs, presetId: selected.presetId, presetSha25664: selected.sha256, outputFileName: "second.mov" }); assert.equal(wrong.code, "batch_identity_or_preset_changed"); assert.equal(f.counts().adds, 1);
    fs.writeFileSync(f.sourcePath, "changed saved AEP"); assert.equal((await f.run(adapter.STATUS, f.statusArgs(first.jobId))).code, "ame_title_file_changed"); assert.equal(f.counts().sends, 1);
    const changedPreset = fixture("changed-preset"); fs.appendFileSync(changedPreset.presetPath, " "); assert.equal((await changedPreset.run(adapter.ENQUEUE, changedPreset.enqueueArgs)).ok, false); assert.equal(changedPreset.counts().adds, 0);
  });
  await check("post-submit source and process birth changes leave durable unknown and no replay", async () => {
    for (const change of ["source", "preset", "process"]) {
      const f = fixture("post-" + change, { afterSend: ({ sourcePath, presetPath, active }) => { if (change === "source") fs.writeFileSync(sourcePath, "changed after native submit"); else if (change === "preset") fs.appendFileSync(presetPath, " "); else active[0].startedAt = new Date(Date.parse(born) + 1000).toISOString(); } });
      const result = await f.run(adapter.ENQUEUE, f.enqueueArgs); assert.equal(result.ok, false); assert.equal(result.unknownOutcome, true); assert.equal(f.ledger().jobs[0].state, "unknown_outcome");
      assert.equal((await f.run(adapter.ENQUEUE, f.enqueueArgs)).ok, false); assert.equal(f.counts().adds, 1);
    }
  });
  await check("wrong nonce source binding and stale native observation never prove association", async () => {
    for (const mutate of [n => ({ ...n, requestNonce: crypto.randomUUID() }), n => ({ ...n, observedAt: 1 }), n => ({ ...n, job: { ...n.job, sourcePath: "C:\\foreign.aep" } }), n => ({ ...n, job: { ...n.job, nativeJobId: "invented" } })]) {
      const f = fixture("correlation-" + crypto.randomUUID(), { tamperReply: mutate }), result = await f.run(adapter.ENQUEUE, f.enqueueArgs); assert.equal(result.ok, false); assert.equal(result.nativeAssociationVerified, false); assert.equal(f.counts().adds, 1);
    }
  });
  await check("batch start defaults to queue composition unavailable and injected foreign refusal", async () => {
    for (const queueGate of [undefined, () => false]) {
      const f = fixture("queue-denied-" + String(!!queueGate), { queueGate }), queued = await f.run(adapter.ENQUEUE, f.enqueueArgs);
      assert.equal(queued.ok, true); const result = await f.run(adapter.START, { ...f.common, batchId }); assert.equal(result.code, "queue_composition_unavailable"); assert.equal(f.counts().starts, 0); assert.equal(f.counts().sends, 1); assert.equal(f.ledger().start, null);
    }
  });
  await check("injected fake queue contract starts once after durable start record; status read preserves readiness", async () => {
    const f = fixture("queue-approved-fixture", { queueGate: (_ctx, batch) => { assert.equal(batch.jobs.length, 1); assert.equal(batch.jobs[0].nativeAssociationVerified, true); return true; } }), queued = await f.run(adapter.ENQUEUE, f.enqueueArgs);
    assert.equal((await f.run(adapter.STATUS, f.statusArgs(queued.jobId))).ok, true);
    const start = await f.run(adapter.START, { ...f.common, batchId }); assert.equal(start.ok, true); assert.equal(start.nativeQueueCompositionVerified, false); assert.equal(start.queueOwnershipAssertedByInjectedGate, true); assert.equal(f.counts().starts, 1);
    assert.equal((await f.run(adapter.START, { ...f.common, batchId })).code, "batch_start_already_reserved"); assert.equal(f.counts().starts, 1);
  });
  await check("unknown batch start reconciles original nonce and void return cannot justify restart", async () => {
    const f = fixture("unknown-start", { queueGate: () => true, unknownAt: 2 }), queued = await f.run(adapter.ENQUEUE, f.enqueueArgs);
    const first = await f.run(adapter.START, { ...f.common, batchId }); assert.equal(first.ok, false); assert.equal(first.unknownOutcome, true); assert.equal(f.counts().starts, 1);
    f.deliver(); const late = await f.run(adapter.STATUS, f.statusArgs(queued.jobId)); assert.equal(late.code, "batch_start_accepted"); assert.equal(f.counts().sends, 2);
    assert.equal((await f.run(adapter.START, { ...f.common, batchId })).code, "batch_start_already_reserved"); assert.equal(f.counts().starts, 1);
    const unproven = fixture("void-start", { queueGate: () => true, startResult: undefined }); await unproven.run(adapter.ENQUEUE, unproven.enqueueArgs);
    assert.equal((await unproven.run(adapter.START, { ...unproven.common, batchId })).code, "batch_start_unknown"); assert.equal((await unproven.run(adapter.START, { ...unproven.common, batchId })).code, "batch_start_already_reserved"); assert.equal(unproven.counts().starts, 1);
  });
  await check("file growth and wrapper raw finish do not claim native completion", async () => {
    const f = fixture("growth"), queued = await f.run(adapter.ENQUEUE, f.enqueueArgs); f.output(4);
    const initial = await f.run(adapter.STATUS, f.statusArgs(queued.jobId)); assert.equal(initial.completionVerified, false);
    f.advance(10); f.output(8); const growing = await f.run(adapter.STATUS, f.statusArgs(queued.jobId)); assert.equal(growing.passive.activity, "growing"); assert.equal(growing.completionVerified, false);
    f.wrappers[0].listeners.onEncodeFinished({ result: 0 }); const wrapper = await f.run(adapter.STATUS, f.statusArgs(queued.jobId)); assert.equal(wrapper.nativeCompletionObserved, true); assert.equal(wrapper.completionVerified, false); assert.equal(wrapper.state, "needs_result_interpretation");
  });
  await check("exact native host paths and documented string True verify completion, not media", async () => {
    for (const nativeResult of ["True", "False", true, 0, "unknown"]) {
      const f = fixture("host-result-" + typeof nativeResult + "-" + String(nativeResult)), queued = await f.run(adapter.ENQUEUE, f.enqueueArgs); assert.equal(queued.ok, true, JSON.stringify(queued)); f.output(4);
      f.hostComplete(nativeResult, { outputFilePath: path.join(root, "foreign.mov") }); assert.equal((await f.run(adapter.STATUS, f.statusArgs(queued.jobId))).nativeCompletionObserved, false);
      f.hostComplete(nativeResult); const done = await f.run(adapter.STATUS, f.statusArgs(queued.jobId)); assert.equal(done.nativeCompletionObserved, true); assert.equal(done.nativeResult, nativeResult);
      assert.equal(done.completionVerified, nativeResult === "True"); assert.equal(done.mediaVerified, false); assert.equal(done.state, nativeResult === "True" ? "needs_media_probe" : nativeResult === "False" ? "failed" : "needs_result_interpretation");
      if (nativeResult === "True") { f.wrappers[0].listeners.onEncodeFinished({ result: 0 }); assert.equal((await f.run(adapter.STATUS, f.statusArgs(queued.jobId))).completionVerified, true); }
    }
  });
  await check("native completion producer time older than durable submit cannot verify", async () => {
    const f = fixture("stale-native-event", { tamperReply: n => n.job && n.job.hostCompletion ? { ...n, job: { ...n.job, eventObservedAt: 1, hostCompletion: { ...n.job.hostCompletion, observedAt: 1 } } } : n }), queued = await f.run(adapter.ENQUEUE, f.enqueueArgs);
    assert.equal(queued.ok, true); f.output(4); f.hostComplete("True"); const stale = await f.run(adapter.STATUS, f.statusArgs(queued.jobId)); assert.equal(stale.completionVerified, false); assert.equal(stale.nativeAssociationVerified, false);
  });
  console.log("AME title jobs offline smoke PASS: " + groups + " groups; VM/fake queue gate only, no applications launched or live calls.");
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { assert(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep)); fs.rmSync(root, { recursive: true, force: true }); });
