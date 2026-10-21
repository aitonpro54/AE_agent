"use strict";

// Offline only: the production executor and generated sender/receiver run in
// isolated VMs. No Adobe process, real queue, renderer, or external service.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), crypto = require("node:crypto");
const jobs = require("../mcp-server/ame-title-jobs"), presets = require("../mcp-server/ame-presets");
const semantic = require("../mcp-server/semantic-verification");
const scratch = path.resolve(__dirname, "../.codex-runtime/ame-job-acceptance/fixtures");
fs.mkdirSync(scratch, { recursive: true });
const root = fs.mkdtempSync(path.join(scratch, "bounded-")), copy = value => JSON.parse(JSON.stringify(value));
const digestFile = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
let groups = 0;
async function check(name, run) { await run(); groups++; console.log("PASS " + name); }
function fixture(label, options = {}) {
  const dir = path.join(root, label), stateDir = path.join(dir, "state"), outputDir = path.join(dir, "outputs"), presetDir = path.join(dir, "presets");
  fs.mkdirSync(presetDir, { recursive: true });
  const presetPath = path.join(presetDir, "exact.epr");
  fs.writeFileSync(presetPath, "<PremiereData><PresetName>Acceptance fixture</PresetName><ExporterName>Fixture</ExporterName></PremiereData>");
  const catalog = () => presets.scanPresetRoots({ roots: [{ source: "fixture", path: presetDir }] }), preset = catalog().presets[0]; assert(preset);
  const sources = [1, 2].map(slot => { const file = path.join(dir, "snapshot-" + slot + ".aep"); fs.writeFileSync(file, "offline immutable source " + slot); return file; });
  let clock = Date.now(), adds = 0, sends = 0, inspections = 0, pending;
  const contexts = new WeakSet(), wrappers = [], operations = [], commands = [], foreign = [{ id: "human-job", output: "human.mov" }];
  let addRecord;
  const batchId = crypto.randomUUID(), born = new Date(clock).toISOString(), processInfo = { pid: 77, startedAt: born, path: "C:\\Adobe\\Adobe Media Encoder.exe" };
  const forbidden = () => { throw Error("foreign queue, START, render, launch or raw dispatch forbidden"); };
  class TestDate extends Date { constructor(value) { super(arguments.length ? value : clock); } static now() { return clock; } }
  const frontend = { addEventListener: () => {}, getDLItemsAtRoot: file => { assert(sources.includes(file)); return ["GUID-" + (sources.indexOf(file) + 1)]; },
    addDLToBatch: (source, format, epr, guid, output) => {
      adds++; assert(sources.includes(source)); assert.equal(format, ""); assert.equal(epr, presetPath); assert.equal(guid, "GUID-" + (sources.indexOf(source) + 1));
      const wrapper = { outputFiles: [], addEventListener: () => {}, setWorkArea: () => !options.workAreaFalse,
        getEncodeProgress: () => { if (options.getterError) throw Error("offline getter unavailable"); return 0; }, getEncodeTime: () => 0, getLogOutput: () => "offline" };
      wrappers.push(wrapper); return wrapper;
    }, removeAllBatchItems: forbidden };
  const host = { isBatchRunning: () => false, addEventListener: () => {}, runBatch: forbidden, stopBatch: forbidden };
  for (const target of [frontend, host]) for (const key of ["getBatchItems", "getQueue", "batchItems", "numBatchItems"]) Object.defineProperty(target, key, { get: forbidden });
  const ame = vm.createContext({ Date: TestDate, BridgeTalk: { appSpecifier: "ame-26.0" }, $: { global: { aeAgentAMEProbeSessionNonce: "acceptance-session" } },
    app: { getFrontend: () => frontend, getEncoderHost: () => host, quit: forbidden } });
  function BridgeTalk() { const message = this; message.send = () => {
    sends++; clock++; const body = vm.runInContext(message.body, ame, { timeout: 1000 });
    if (options.unknownEnqueue && adds === 1 && !pending) { pending = { message, body }; return true; }
    message.onResult({ body }); return true;
  }; }
  BridgeTalk.isRunning = () => true; BridgeTalk.launch = forbidden; BridgeTalk.pump = () => {};
  const ae = vm.createContext({ Date: TestDate, BridgeTalk, $: { global: {}, sleep: ms => { clock += ms; } } });
  const common = { targetSpecifier: "ame-26.0", expectedSessionNonce: "acceptance-session", expectedProcess: { pid: processInfo.pid, startedAt: born } };
  const args = slot => ({ ...common, batchId, queueMode: "shared_queue_v1", sourceProjectFile: sources[slot - 1], expectedSourceSha25664: digestFile(sources[slot - 1]),
    sourceGuid: "GUID-" + slot, presetId: preset.presetId, presetSha25664: preset.sha256, outputFileName: "title-" + slot + ".mov", range: { startSeconds: 0.5, endSeconds: 2 } });
  const assertPrivate = context => { assert(contexts.has(context)); assert.equal(context.current, true); };
  const preparations = new WeakMap(), dispatchCaps = new WeakMap();
  const deps = { stateDir, now: () => clock++, listPresetCatalog: catalog,
    inspectProcesses: async () => { inspections++; if (options.processError) throw Error("offline process unavailable"); return [{ ...processInfo }]; },
    resolveOutputFilePath: name => path.join(outputDir, name), assertManualIngress: forbidden, assertSharedQueueIngress: assertPrivate, assertServerContext: assertPrivate,
    runExtendScriptBody: forbidden, nativeDispatchPort: {
      prepareEnqueue: async (selector, context) => { assertPrivate(context); const cap = Object.freeze({}); preparations.set(cap, { selector, context }); return cap; },
      assertPreparation: (cap, selector, context) => { const entry = preparations.get(cap); assert(entry && entry.selector === selector && entry.context === context); return true; },
      authorize: async (metadata, context, preparation) => {
        if (metadata.mutating) { assert.equal(metadata.operation, "enqueue"); assertPrivate(context); assert.equal(preparations.get(preparation)?.context, context); }
        const cap = Object.freeze({}); dispatchCaps.set(cap, { metadata, context }); return cap;
      }, assertAuthorization: (cap, metadata, context) => { const entry = dispatchCaps.get(cap); assert(entry && entry.metadata === metadata && entry.context === context); return true; },
      dispatch: async (cap, script, timeout, metadata, context) => {
        deps.nativeDispatchPort.assertAuthorization(cap, metadata, context); assert.equal(timeout, 30000);
        assert.equal(crypto.createHash("sha256").update(script).digest("hex"), metadata.scriptSha25664);
        assert(["enqueue", "status"].includes(metadata.operation)); operations.push({ operation: metadata.operation, jobId: metadata.jobId });
        if (options.failImmediateRead && metadata.operation === "status") options.getterError = true;
        const result = vm.runInContext("(function(){" + script + "}())", ae, { timeout: 1000 });
        if (metadata.mutating) commands.push({ role: "mutation", state: "completed", ok: true, executionId: context.runId, result: copy(result) });
        return { result };
      }
    } };
  const executor = jobs.createExecutor(deps), ledgerPath = path.join(stateDir, "batches", batchId + ".json");
  const add = async slot => {
    const actual = args(slot), context = { current: true, runId: crypto.randomUUID() }, startedAt = new Date(clock++).toISOString(), offset = commands.length;
    contexts.add(context); const result = await executor.execute(jobs.ENQUEUE, actual, executor.authorize(jobs.ENQUEUE, actual, context));
    addRecord = { args: actual, runId: context.runId, startedAt, commands: copy(commands.slice(offset)) }; return result;
  };
  const status = (jobId, extra = {}, instance = executor) => instance.execute(jobs.STATUS, { ...common, batchId, jobId, ...extra });
  return { options, add, status, common, batchId, sources, ame, foreign, operations, executor, deps, ledgerPath,
    ledger: () => JSON.parse(fs.readFileSync(ledgerPath, "utf8")), counts: () => ({ adds, sends, inspections }),
    record: () => copy(addRecord), stamp: () => new Date(clock++).toISOString(),
    deliver: () => { assert(pending); pending.message.onResult({ body: pending.body }); options.unknownEnqueue = false; },
    removeOwn: jobId => { delete ame.$.global[jobs.SLOT].jobs[jobId]; } };
}
function accepted(result) { assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(result.ownItemAccepted, true); assert.equal(result.acceptanceReceipt.schema, "ae-agent-ame-own-item-acceptance.v2"); }
function sameInitial(f, job, response) {
  assert.equal(response.ownItemAccepted, true, JSON.stringify(response)); assert.deepEqual(response.acceptanceReceipt, job.acceptanceReceipt);
  assert.deepEqual(f.ledger().jobs.find(entry => entry.jobId === job.jobId).acceptanceReceipt, job.acceptanceReceipt);
}
(async () => {
  await check("immediate exact own-job selfcheck; later refresh and human reorder preserve initial receipt", async () => {
    const f = fixture("initial"), first = await f.add(1); accepted(first);
    assert.deepEqual(f.operations.map(row => row.operation), ["enqueue", "status"]);
    assert(f.operations.every(row => row.jobId === first.jobId));
    const proof = copy(f.ledger().jobs[0].acceptanceEvidence);
    f.foreign.unshift({ id: "parallel-human", output: "parallel.mov" }); f.foreign.reverse();
    sameInitial(f, first, await f.status(first.jobId)); sameInitial(f, first, await f.status(first.jobId));
    assert.deepEqual(f.ledger().jobs[0].acceptanceEvidence, proof);
    const offset = f.operations.length, second = await f.add(2); accepted(second);
    assert(f.operations.slice(offset).every(row => row.jobId === second.jobId), "adding job 2 never rechecks job 1");
    sameInitial(f, first, await f.status(first.jobId, { acceptanceOnly: true }));
    assert.deepEqual(f.foreign, [{ id: "human-job", output: "human.mov" }, { id: "parallel-human", output: "parallel.mov" }]);
    assert.equal(f.counts().adds, 2);
  });
  await check("failed current read and process failure do not revoke initial acceptance or block another add", async () => {
    const f = fixture("refresh-failure"), first = await f.add(1); accepted(first);
    f.options.getterError = true; const failed = await f.status(first.jobId); assert.equal(failed.ok, false); sameInitial(f, first, failed);
    f.options.getterError = false; accepted(await f.add(2));
    f.options.processError = true; const unavailable = await f.status(first.jobId); assert.equal(unavailable.ok, false); sameInitial(f, first, unavailable);
    assert.equal(f.counts().adds, 2);
  });
  await check("production v2 receipt remains identical through required attached read and real semantic verifier", async () => {
    const f = fixture("semantic"), result = await f.add(1); accepted(result); const record = f.record();
    const readArgs = { ...f.common, timeoutMs: 5000, batchId: f.batchId, jobId: result.jobId }, read = await f.executor.execute(jobs.STATUS, readArgs);
    sameInitial(f, result, read); assert.notEqual(result.native.requestNonce, read.native.requestNonce);
    result.authorization = { runId: record.runId, proposalId: "offline-proposal" };
    result.verification = { ok: true, scope: "ame_native_wrapper_association_only" };
    const attachment = { tool: jobs.STATUS, args: readArgs, status: "completed", result: read, source: "server_typed_readback", observedAt: f.stamp() };
    const step = { index: 1, tool: jobs.ENQUEUE, args: record.args, status: "completed", result, commands: record.commands, independentReadBack: [attachment] };
    const plan = { steps: [{ tool: jobs.ENQUEUE, args: record.args }] }, run = { id: record.runId, provenance: { actionId: "offline-proposal" },
      startedAt: record.startedAt, finishedAt: f.stamp(), ok: true, dryRun: false, steps: [step] };
    const verdict = semantic.buildSemanticVerification(plan, run); assert.equal(verdict.ok, true, JSON.stringify(verdict));
    const changed = copy(run); changed.steps[0].independentReadBack[0].args.acceptanceOnly = true;
    assert.equal(semantic.buildSemanticVerification(plan, changed).ok, false);
  });
  await check("removed own wrapper leaves historical acceptance while current status is unresolved", async () => {
    const f = fixture("removed"), first = await f.add(1); accepted(first); f.removeOwn(first.jobId);
    const missing = await f.status(first.jobId); assert.equal(missing.ok, false); sameInitial(f, first, missing);
    assert.equal(missing.nativeAssociationVerified, false); assert.notEqual(missing.state, "queued"); assert.equal(f.counts().adds, 1);
  });
  await check("restart and local restoration have no OS, native, source rehash or ledger write effects", async () => {
    const f = fixture("restart"), first = await f.add(1); accepted(first);
    f.options.processError = true; fs.writeFileSync(f.sources[0], "externally changed after historical acceptance");
    const before = f.counts(), bytes = fs.readFileSync(f.ledgerPath), restarted = jobs.createExecutor(f.deps);
    assert.deepEqual(f.counts(), before);
    const restored = await f.status(first.jobId, { acceptanceOnly: true }, restarted); accepted(restored); sameInitial(f, first, restored);
    assert.equal(restored.observationSource, "saved_acceptance"); assert.equal(restored.currentStatusObserved, false);
    assert.equal(restored.executionAuthority, false); assert.equal(restored.nativeAssociationVerified, false); assert.equal(restored.nativeQueueCompositionVerified, false);
    assert.deepEqual(f.counts(), before); assert.deepEqual(fs.readFileSync(f.ledgerPath), bytes);
    const mismatched = await f.status(first.jobId, { acceptanceOnly: true, expectedProcess: { ...f.common.expectedProcess, pid: 88 } });
    assert.equal(mismatched.ok, false); assert.equal(mismatched.ownItemAccepted, false); assert.deepEqual(f.counts(), before);
  });
  await check("tampered, cross-job and missing proof never restore; legacy records stay unverified", async () => {
    const f = fixture("integrity"), first = await f.add(1); accepted(first); accepted(await f.add(2));
    const original = f.ledger(), before = f.counts();
    for (const change of [b => { b.jobs[0].acceptanceReceipt.outputPath += ".foreign"; },
      b => { b.jobs[0].acceptanceReceipt = copy(b.jobs[1].acceptanceReceipt); b.jobs[0].acceptanceEvidence = copy(b.jobs[1].acceptanceEvidence); },
      b => { delete b.jobs[0].acceptanceEvidence; }, b => { delete b.jobs[0].acceptanceReceipt; },
      b => { b.jobs[0].acceptanceEvidence.native.job.sourceGuid = "foreign"; }]) {
      const changed = copy(original); change(changed); fs.writeFileSync(f.ledgerPath, JSON.stringify(changed));
      const result = await f.status(first.jobId, { acceptanceOnly: true }); assert.equal(result.ok, false); assert.equal(result.ownItemAccepted, false); assert.equal(result.code, "ame_title_acceptance_corrupt");
    }
    for (const state of ["missing", "legacy_unverified"]) {
      const changed = copy(original); delete changed.jobs[0].acceptanceEvidence;
      if (state === "missing") delete changed.jobs[0].acceptanceReceipt; else changed.jobs[0].acceptanceReceipt.schema = "ae-agent-ame-own-item-acceptance.v1";
      fs.writeFileSync(f.ledgerPath, JSON.stringify(changed)); const bytes = fs.readFileSync(f.ledgerPath);
      const result = await f.status(first.jobId, { acceptanceOnly: true }); assert.equal(result.ok, false); assert.equal(result.ownItemAccepted, false); assert.equal(result.acceptanceState, state);
      assert.deepEqual(fs.readFileSync(f.ledgerPath), bytes);
    }
    assert.deepEqual(f.counts(), before);
  });
  await check("corrupt neighboring receipt cannot affect selected acceptance or addressable current read", async () => {
    const f = fixture("corrupt-neighbor"), first = await f.add(1); accepted(first); const second = await f.add(2); accepted(second);
    const batch = f.ledger(); batch.jobs[1].acceptanceEvidence.receiptSha25664 = "0".repeat(64); fs.writeFileSync(f.ledgerPath, JSON.stringify(batch));
    const before = f.counts(), bytes = fs.readFileSync(f.ledgerPath), offset = f.operations.length;
    sameInitial(f, first, await f.status(first.jobId, { acceptanceOnly: true }));
    assert.deepEqual(f.counts(), before); assert.deepEqual(fs.readFileSync(f.ledgerPath), bytes);
    const current = await f.status(first.jobId); assert.equal(current.ok, true); sameInitial(f, first, current);
    assert(f.operations.slice(offset).every(row => row.jobId === first.jobId));
    assert.deepEqual(f.ledger().jobs[1], batch.jobs[1]);
    const invalid = await f.status(second.jobId, { acceptanceOnly: true }); assert.equal(invalid.code, "ame_title_acceptance_corrupt"); assert.equal(invalid.ownItemAccepted, false);
    const mutation = await f.add(1); assert.equal(mutation.code, "ame_title_acceptance_corrupt"); assert.equal(f.counts().adds, 2);
  });
  await check("lost callback reconciles only its own wrapper; no resend or receipt before proof", async () => {
    const f = fixture("unknown", { unknownEnqueue: true }), unknown = await f.add(1); assert.equal(unknown.ok, false); assert.equal(unknown.unknownOutcome, true);
    assert.equal((await f.status(unknown.jobId, { acceptanceOnly: true })).acceptanceState, "missing");
    assert.equal((await f.add(1)).code, "ame_title_unknown_job_no_replay"); assert.equal(f.counts().adds, 1);
    const observed = await f.status(unknown.jobId); accepted(observed); assert.equal(f.counts().adds, 1);
    f.deliver(); sameInitial(f, observed, await f.status(unknown.jobId));
    assert.equal((await f.add(1)).code, "duplicate_submit_blocked"); assert.equal(f.counts().adds, 1);
    assert(f.operations.every(row => row.jobId === unknown.jobId)); assert.equal(f.operations.filter(row => row.operation === "enqueue").length, 1);
  });
  await check("initial selfcheck errors never create acceptance and do not permit replay", async () => {
    for (const flag of ["workAreaFalse", "getterError", "failImmediateRead"]) {
      const f = fixture("initial-error-" + flag, { [flag]: true }), result = await f.add(1); assert.equal(result.ok, false); assert.equal(result.unknownOutcome, true);
      const saved = await f.status(result.jobId, { acceptanceOnly: true }); assert.equal(saved.ownItemAccepted, false); assert.equal(saved.acceptanceState, "missing");
      assert.equal((await f.add(1)).code, "ame_title_unknown_job_no_replay"); assert.equal(f.counts().adds, 1);
    }
    assert.throws(() => jobs.validateInput(jobs.STATUS, { ...fixture("mode-validation").common, batchId: crypto.randomUUID(), jobId: crypto.randomUUID(), acceptanceOnly: true, originalRunId: crypto.randomUUID() }), /ame_title_invalid_acceptance_read/);
  });
  console.log(JSON.stringify({ status: "passed", groups, scope: "production AME executor + generated ES3 in offline VMs; no live Adobe/queue/START/render" }));
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(() => {
  assert.equal(path.dirname(path.resolve(root)), scratch); assert(path.basename(root).startsWith("bounded-"));
  fs.rmSync(root, { recursive: true, force: true });
});
