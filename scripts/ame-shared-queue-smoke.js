"use strict";
// Offline contract tests: actual generated ES3 sender/receiver in two VMs.
// These fixtures do not connect to AE/AME and are not live queue evidence.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), crypto = require("node:crypto");
const adapter = require("../mcp-server/ame-title-jobs"), shared = require("../mcp-server/ame-shared-queue-grant"), presets = require("../mcp-server/ame-presets");
const fixtureParent = path.resolve(__dirname, "../.codex-runtime/ame-shared-queue/fixtures"); fs.mkdirSync(fixtureParent, { recursive: true });
const root = fs.mkdtempSync(path.join(fixtureParent, "bounded-")), digestFile = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
let groups = 0;
async function check(name, run) { await run(); groups++; console.log("PASS " + name); }
function fixture(label, options = {}) {
  const dir = path.join(root, label), stateDir = path.join(dir, "state"), outputDir = path.join(dir, "outputs"), presetDir = path.join(dir, "presets");
  fs.mkdirSync(presetDir, { recursive: true }); const presetPath = path.join(presetDir, "exact.epr");
  fs.writeFileSync(presetPath, "<PremiereData><PresetName>Exact fixture</PresetName><ExporterName>Fixture</ExporterName></PremiereData>");
  const catalog = () => presets.scanPresetRoots({ roots: [{ source: "fixture", path: presetDir }] }), preset = catalog().presets[0]; assert(preset);
  const sources = [1, 2].map(slot => { const file = path.join(dir, "snapshot-" + slot + ".aep"); fs.writeFileSync(file, "immutable independent snapshot " + slot); return file; });
  let clock = Date.now(), sends = 0, adds = 0, starts = 0, reads = 0, running = false, pending = null;
  const batchId = crypto.randomUUID(), born = new Date(clock).toISOString(), process = { pid: 77, startedAt: born, path: "C:\\Program Files\\Adobe\\Adobe Media Encoder 2026\\Adobe Media Encoder.exe" }, contexts = new WeakSet(), wrappers = [], foreign = [{ preset: "foreign-preset", output: "manual.mov", position: 0 }], foreignBefore = JSON.stringify(foreign), listeners = {};
  const fail = code => { throw Object.assign(new Error(code), { code }); }, forbidden = () => fail("foreign_queue_operation_forbidden");
  class TestDate extends Date { constructor(value) { super(arguments.length ? value : clock); } static now() { return clock; } }
  const frontend = { getDLItemsAtRoot: file => { assert(sources.includes(file)); return ["GUID-" + (sources.indexOf(file) + 1)]; }, addDLToBatch: (source, format, epr, guid, output) => {
    adds++; assert(sources.includes(source)); assert.equal(format, ""); assert.equal(epr, presetPath); assert.equal(guid, "GUID-" + (sources.indexOf(source) + 1));
    const wrapper = { outputFiles: [output], listeners: {}, addEventListener: (name, fn) => { wrapper.listeners[name] = fn; }, setWorkArea: () => !options.workAreaFalse,
      getEncodeProgress: () => { reads++; if (options.getterError) throw Error("getter unavailable"); return 0; }, getEncodeTime: () => 0, getLogOutput: () => "fixture" };
    if (options.invalidWrapper) delete wrapper.setWorkArea;
    if (options.wrongOutput) wrapper.outputFiles = [path.join(outputDir, "foreign.mov")]; wrappers.push(wrapper); return wrapper;
  }, removeAllBatchItems: forbidden };
  const host = { isBatchRunning: () => running, addEventListener: (name, fn) => { listeners[name] = fn; }, runBatch: () => { starts++; running = true; return true; }, stopBatch: forbidden };
  for (const key of ["getBatchItems", "getQueue", "batchItems", "numBatchItems"]) Object.defineProperty(host, key, { get: forbidden });
  const ame = vm.createContext({ Date: TestDate, BridgeTalk: { appSpecifier: "ame-26.0" }, $: { global: { aeAgentAMEProbeSessionNonce: "session" } }, app: { getFrontend: () => frontend, getEncoderHost: () => host, quit: forbidden } });
  function BridgeTalk() { const message = this; message.send = () => {
    sends++; const body = vm.runInContext(message.body, ame);
    if ((options.unknownEnqueue && message.body.includes('"operation":"enqueue"') && adds === 1) || options.unknownStart && message.body.includes('"operation":"start"')) { pending = { message, body }; return true; }
    message.onResult({ body }); return true;
  }; }
  BridgeTalk.isRunning = () => true; BridgeTalk.launch = forbidden; BridgeTalk.pump = () => {};
  const ae = vm.createContext({ Date: TestDate, BridgeTalk, $: { global: {}, sleep: ms => { clock += ms; } } });
  const common = { targetSpecifier: "ame-26.0", expectedSessionNonce: "session", expectedProcess: { pid: process.pid, startedAt: born } };
  const args = slot => ({ ...common, batchId, queueMode: shared.MODE, sourceProjectFile: sources[slot - 1], expectedSourceSha25664: digestFile(sources[slot - 1]), sourceGuid: "GUID-" + slot, presetId: preset.presetId, presetSha25664: preset.sha256, outputFileName: "title-" + slot + ".mov", range: { startSeconds: 0, endSeconds: 2 } });
  const assertPrivate = ctx => { if (!contexts.has(ctx) || ctx.current !== true) fail("ame_shared_queue_private_context_required"); };
  const issuer = shared.createSharedQueueGrant({ stateDir, now: () => clock, assertSharedQueueIngress: assertPrivate, assertServerContext: assertPrivate });
  const preparations = new WeakMap(), dispatchCaps = new WeakMap();
  const prepare = async (selector, context) => { assertPrivate(context); if (selector.operation === "start" && options.slowStartPreparationMs) clock += options.slowStartPreparationMs; const cap = Object.freeze({}); preparations.set(cap, { selector, context }); return cap; };
  const deps = { stateDir, now: () => clock, listPresetCatalog: catalog, inspectProcesses: async () => [{ ...process }], resolveOutputFilePath: name => path.join(outputDir, name),
    assertManualIngress: () => fail("manual_ingress_must_not_be_used"), assertSharedQueueIngress: assertPrivate, assertServerContext: assertPrivate, sharedQueueGrant: issuer,
    runExtendScriptBody: () => fail("raw_fallback_forbidden"), nativeDispatchPort: { prepareEnqueue: prepare, prepareStart: prepare,
      assertPreparation: (cap, selector, context) => { const row = preparations.get(cap); assert(row && row.selector === selector && row.context === context); assertPrivate(context); return true; },
      authorize: async (metadata, context, preparation) => {
        if (metadata.mutating) { const row = preparations.get(preparation); assert(row && row.context === context && row.selector.operation === metadata.operation); assertPrivate(context); }
        if (options.onAuthorize) options.onAuthorize({ metadata, context, sources, presetPath, process, ame });
        const cap = Object.freeze({}); dispatchCaps.set(cap, { metadata, context }); return cap;
      }, assertAuthorization: (cap, metadata, context) => { const row = dispatchCaps.get(cap); assert(row && row.metadata === metadata && row.context === context); return true; },
      dispatch: async (cap, script, timeout, metadata, context) => { deps.nativeDispatchPort.assertAuthorization(cap, metadata, context); assert.equal(timeout, 30000); assert.equal(crypto.createHash("sha256").update(script).digest("hex"), metadata.scriptSha25664);
        if (metadata.operation === "start") assert(issuer.readReservation(batchId), "durable intent precedes START delivery");
        return { result: vm.runInContext("(function(){" + script + "}())", ae) }; }
    } };
  const executor = adapter.createExecutor(deps), startArgs = { ...common, batchId, queueMode: shared.MODE };
  const authorize = (name, actual) => { const ctx = { current: true }; contexts.add(ctx); return executor.authorize(name, actual, ctx); };
  const run = (name, actual) => executor.execute(name, actual, [adapter.ENQUEUE, adapter.START].includes(name) ? authorize(name, actual) : undefined);
  return { args, run, executor, issuer, common, startArgs, batchId, sources, presetPath, wrappers, process, ame, outputDir, stateDir, foreign,
    ledger: () => JSON.parse(fs.readFileSync(path.join(stateDir, "batches", batchId + ".json"), "utf8")), counts: () => ({ sends, adds, starts, reads }),
    start: () => run(adapter.START, startArgs), status: id => run(adapter.STATUS, { ...common, batchId, jobId: id }),
    addForeign: () => { foreign.push({ preset: "other", output: "added-by-user.mov", position: foreign.length }); },
    assertForeign: () => assert.equal(JSON.stringify(foreign[0]), JSON.stringify(JSON.parse(foreignBefore)[0])),
    deliver: () => { assert(pending); pending.message.onResult({ body: pending.body }); pending = null; options.unknownEnqueue = options.unknownStart = false; },
    setRunning: value => { running = value; }, restartStart: () => { const restarted = adapter.createExecutor(deps), ctx = { current: true }; contexts.add(ctx); return restarted.execute(adapter.START, startArgs, restarted.authorize(adapter.START, startArgs, ctx)); } };
}
async function pair(f) { const jobs = []; for (let slot = 1; slot <= 2; slot++) { const observed = await f.run(adapter.ENQUEUE, f.args(slot)); assert.equal(observed.ok, true, JSON.stringify(observed)); assert.equal(observed.ownItemAccepted, true); assert.equal(observed.nativeJobId, null); assert.equal(observed.mediaVerified, false); assert.equal(observed.acceptanceReceipt.appliedPresetVerified, false); jobs.push(observed); } return jobs; }
(async () => {
  await check("two independent own receipts, immediate reads, foreign additions and global once START", async () => {
    const f = fixture("mixed"); const jobs = await pair(f); assert.equal(f.counts().adds, 2); assert.equal(f.counts().sends, 4); assert(f.counts().reads >= 4);
    f.addForeign(); const started = await f.start(); assert.equal(started.ok, true, JSON.stringify(started)); assert.equal(started.globalQueueStart, true); assert.equal(started.ownItemsAccepted, 2); assert.equal(started.nativeQueueCompositionVerified, false); assert.equal(started.mediaVerified, false); assert.equal(f.counts().starts, 1);
    assert.equal((await f.start()).code, "batch_start_already_reserved"); assert.equal(f.counts().starts, 1); f.assertForeign();
    for (const job of jobs) assert.equal((await f.status(job.jobId)).startAcceptanceVerified, true);
  });
  await check("native preparation over one second preserves current private START authority", async () => {
    const f = fixture("slow-native-preparation", { slowStartPreparationMs: 5000 });
    await pair(f); const started = await f.start();
    assert.equal(started.ok, true, JSON.stringify(started)); assert.equal(f.counts().starts, 1);
    assert.equal((await f.start()).code, "batch_start_already_reserved");
  });
  await check("one item cannot START and third own enqueue cannot append", async () => {
    const f = fixture("own-count"); assert.equal((await f.run(adapter.ENQUEUE, f.args(1))).ok, true); assert.equal((await f.start()).ok, false); assert.equal(f.counts().starts, 0);
    assert.equal((await f.run(adapter.ENQUEUE, f.args(2))).ok, true); assert.equal((await f.run(adapter.ENQUEUE, { ...f.args(1), outputFileName: "third.mov" })).ok, false); assert.equal(f.counts().adds, 2);
  });
  await check("bad wrapper output workArea and getters remain UNKNOWN without enqueue replay", async () => {
    for (const option of ["invalidWrapper", "wrongOutput", "workAreaFalse", "getterError"]) {
      const f = fixture("invalid-" + option, { [option]: true }); const failed = await f.run(adapter.ENQUEUE, f.args(1)); assert.equal(failed.ok, false); assert.equal(failed.unknownOutcome, true); assert.equal(f.counts().adds, 1);
      assert.equal((await f.run(adapter.ENQUEUE, f.args(1))).ok, false); assert.equal(f.counts().adds, 1); assert.equal(f.counts().starts, 0);
    }
  });
  await check("unknown enqueue reconciles the retained send before independent read; no duplicate", async () => {
    const f = fixture("unknown-enqueue", { unknownEnqueue: true }), first = await f.run(adapter.ENQUEUE, f.args(1)); assert.equal(first.unknownOutcome, true); assert.equal((await f.run(adapter.ENQUEUE, f.args(1))).ok, false); assert.equal(f.counts().adds, 1);
    f.deliver(); assert.equal((await f.status(first.jobId)).code, "job_enqueued"); assert.equal(f.counts().sends, 1); assert.equal((await f.status(first.jobId)).ownItemAccepted, true); assert.equal(f.counts().adds, 1);
    assert.equal((await f.run(adapter.ENQUEUE, f.args(2))).ok, true); assert.equal((await f.start()).ok, true); assert.equal(f.counts().adds, 2);
  });
  await check("unknown START is durable across restart and reconciles without resend", async () => {
    const f = fixture("unknown-start", { unknownStart: true }), jobs = await pair(f), first = await f.start(); assert.equal(first.ok, false); assert.equal(first.unknownOutcome, true); assert.equal(f.counts().starts, 1); const sent = f.counts().sends;
    assert.equal((await f.start()).code, "batch_start_already_reserved"); assert.equal((await f.restartStart()).code, "batch_start_already_reserved"); assert.equal(f.counts().sends, sent); assert(f.issuer.readReservation(f.batchId));
    f.deliver(); assert.equal((await f.status(jobs[0].jobId)).code, "batch_start_accepted"); assert.equal(f.counts().sends, sent); assert.equal((await f.status(jobs[0].jobId)).startAcceptanceVerified, true); assert.equal(f.counts().starts, 1);
  });
  await check("source EPR process session and output changes refuse own START", async () => {
    for (const change of ["source", "preset", "process", "session", "output", "wrapper"]) {
      const f = fixture("pin-" + change); await pair(f);
      if (change === "source") fs.appendFileSync(f.sources[0], "changed");
      if (change === "preset") fs.appendFileSync(f.presetPath, "changed");
      if (change === "process") f.process.pid++;
      if (change === "session") f.ame.$.global.aeAgentAMEProbeSessionNonce = "other";
      if (change === "output") fs.writeFileSync(path.join(f.outputDir, "title-1.mov"), "foreign occupied output");
      if (change === "wrapper") f.wrappers[0].outputFiles = [path.join(f.outputDir, "wrong.mov")];
      assert.equal((await f.start()).ok, false, change); assert.equal(f.counts().starts, 0, change);
    }
  });
  await check("private capability cannot be forged by flags JSON or changed binding", async () => {
    const f = fixture("spoof"); await pair(f); const batch = f.ledger();
    const binding = shared.buildBinding(batch, f.process, f.startArgs, 0), ctx = { current: true, sharedQueue: true, autonomous: true, profile: shared.MODE };
    assert.throws(() => f.executor.authorize(adapter.START, f.startArgs, ctx), /private_context_required/);
    assert.throws(() => f.issuer.authorize(ctx, binding), /private_context_required/);
    assert.throws(() => f.issuer.assertCapability(Object.freeze({}), ctx, binding), /private_capability_required/);
    assert.throws(() => adapter.validateInput(adapter.START, { ...f.startArgs, manualQueueMode: "cep_user_declaration_v2", completedOwnedPrefix: [] }), /mode_invalid/);
    assert.equal(f.counts().starts, 0);
  });
  await check("queue shared reads only requested own handles and never census foreign retained entries", async () => {
    const f = fixture("own-read-no-census"); await pair(f); const batch = f.ledger(), slot = f.ame.$.global.aeAgentAMETitleJobsV1;
    Object.defineProperty(slot.jobs, "foreign-opaque", { enumerable: true, get: () => { throw Error("foreign read forbidden"); } });
    const base = { ...f.startArgs, operation: "queue", ownedInitialDispatch: true, boundNativeSessionNonce: "session", processBinding: batch.processBinding, retainedWrapperSessionNonce: batch.jobs[0].retainedWrapperSessionNonce, operationBinding: "a".repeat(64), requestNonce: crypto.randomUUID() };
    for (const own of [[batch.jobs[0].jobId], batch.jobs.map(job => job.jobId)]) { const result = JSON.parse(vm.runInContext(adapter.messageScript({ ...base, jobIds: own }), f.ame)); assert.equal(result.code, "owned_queue_observed"); assert.equal(result.queue.expectedJobs.length, own.length); }
    const binding = shared.buildBinding(batch, f.process, f.startArgs, 0), started = JSON.parse(vm.runInContext(adapter.messageScript({ ...base, operation: "start", jobId: batch.jobs[1].jobId, jobIds: batch.jobs.map(job => job.jobId), presetIdentity: batch.presetIdentity, expectedJobs: binding.jobs }), f.ame));
    assert.equal(started.code, "batch_start_accepted"); assert.equal(started.job.handleKey, batch.jobs[1].jobId); assert.equal(started.nativeAssociationVerified, true); assert.equal(f.counts().starts, 1);
  });
  await check("observed own running status avoids redundant global START", async () => {
    const f = fixture("external-start"), jobs = await pair(f); f.setRunning(true); f.wrappers[0].listeners.onEncodeProgress({});
    const observed = await f.start(); assert.equal(observed.ok, true); assert.equal(observed.code, "shared_queue_already_running"); assert.equal(observed.alreadyRunningObserved, true); assert.equal(f.counts().starts, 0);
    assert.equal((await f.status(jobs[0].jobId)).mediaVerified, false);
  });
  await check("shared own terminal read remains available while foreign queue keeps running", async () => {
    const f = fixture("own-terminal-foreign-running"); await pair(f); const batch = f.ledger(), binding = shared.buildBinding(batch, f.process, f.startArgs, 0);
    assert.equal((await f.start()).ok, true); f.addForeign(); f.setRunning(true);
    for (const entry of Object.values(f.ame.$.global.aeAgentAMETitleJobsV1.jobs)) {
      const slot = f.ame.$.global.aeAgentAMETitleJobsV1; slot.hostListeners.complete({ sourceFilePath: entry.sourcePath, outputFilePath: entry.outputPath, result: "True" });
    }
    Object.defineProperty(f.ame.$.global.aeAgentAMETitleJobsV1.jobs, "foreign-opaque", { enumerable: true, get: () => { throw Error("foreign read forbidden"); } });
    const args = { ...f.startArgs, operation: "shared_status", ownedInitialDispatch: true, boundNativeSessionNonce: "session", retainedWrapperSessionNonce: binding.retainedWrapperSessionNonce, processBinding: batch.processBinding, jobIds: batch.jobs.map(job => job.jobId), operationBinding: "b".repeat(64), requestNonce: crypto.randomUUID() };
    const observed = JSON.parse(vm.runInContext(adapter.messageScript(args), f.ame));
    assert.equal(observed.code, "shared_jobs_observed"); assert.equal(observed.nativeAssociationVerified, true); assert.equal(observed.batchRunning, true); assert.equal(observed.jobs.length, 2);
    for (const job of observed.jobs) { assert.equal(job.status, "native_finished"); assert.equal(job.hostCompletion.result, "True"); assert.equal(job.workAreaApplied, true); assert.equal(job.nativeJobId, null); }
    assert.equal(f.counts().starts, 1); f.assertForeign();
    assert.equal(JSON.parse(vm.runInContext(adapter.messageScript({ ...args, jobIds: [batch.jobs[0].jobId, batch.jobs[0].jobId] }), f.ame)).nativeAssociationVerified, false);
  });
  console.log("AME shared queue offline smoke PASS: " + groups + " groups; VM fixtures only, no live execution.");
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { assert.equal(path.dirname(root), fixtureParent); assert(path.basename(root).startsWith("bounded-")); fs.rmSync(root, { recursive: true, force: true }); });
