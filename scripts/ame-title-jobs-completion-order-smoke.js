"use strict";

// Offline only: evaluate the actual generator and receiver, without product imports.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const receiverPath = path.join(__dirname, "../mcp-server/ame-title-jobs.js");
function generator(source = fs.readFileSync(receiverPath, "utf8")) {
  const begin = source.indexOf("const literal = "), end = source.indexOf("// Fixed AE sender.", begin);
  const message = source.match(/^function messageScript\(a\) \{[^\r\n]+\}/m);
  assert(begin >= 0 && end > begin && message, "actual receiver/generator boundaries required");
  const context = vm.createContext({});
  vm.runInContext(source.slice(begin, end) + "\n" + message[0], context, { timeout: 1000 });
  return args => context.messageScript(args);
}
function fixture(generate, shared = true) {
  let clock = 1700000000000, adds = 0;
  class FixtureDate extends Date { constructor() { super(clock++); } }
  const batchId = "11111111-1111-4111-8111-111111111111", wrapperNonce = "22222222-2222-4222-8222-222222222222";
  const items = [1, 2].slice(0, shared ? 2 : 1).map(n => ({ jobId: `00000000-0000-4000-8000-00000000000${n}`,
    source: `C:/fixture-${n}.aep`, output: `C:/fixture-${n}.mov`, guid: `fixture-guid-${n}`, listeners: {} }));
  const listeners = {}, host = { isBatchRunning: () => false, addEventListener: (name, callback) => { listeners[name] = callback; } };
  const frontend = { getDLItemsAtRoot: source => items.filter(item => item.source === source).map(item => item.guid),
    addDLToBatch: (source, format, preset, guid, output) => {
      const item = items[adds++];
      assert.deepEqual([source, format, preset, guid, output], [item.source, "", "C:/fixture.epr", item.guid, item.output]);
      // Getter bytes come from an independent fixture, never from the request arguments.
      item.wrapper = { outputFiles: [item.output], getEncodeProgress: () => 100, getEncodeTime: () => 7,
        getLogOutput: () => "fixture callback log", setWorkArea: () => true,
        addEventListener: (name, callback) => { item.listeners[name] = callback; } };
      return item.wrapper;
    } };
  const base = { targetSpecifier: "ame-26.0", processBinding: "fixture-process", batchId, presetIdentity: "fixture-preset",
    ownedInitialDispatch: true, boundNativeSessionNonce: "fixture-session", retainedWrapperSessionNonce: wrapperNonce,
    requestNonce: "fixture-request", operationBinding: "fixture-operation", ...(shared ? { queueMode: "shared_queue_v1" } : {}) };
  const context = vm.createContext({ Date: FixtureDate, BridgeTalk: { appSpecifier: base.targetSpecifier },
    $: { global: { aeAgentAMEProbeSessionNonce: "fixture-session" } }, app: { getFrontend: () => frontend, getEncoderHost: () => host } });
  const run = args => JSON.parse(vm.runInContext(generate(args), context, { timeout: 1000 }));
  for (const [index, item] of items.entries()) {
    const queued = run({ ...base, operation: "enqueue", jobId: item.jobId, sourcePath: item.source, sourceGuid: item.guid,
      outputPath: item.output, presetPath: "C:/fixture.epr", newWrapperSessionNonce: wrapperNonce, ownedVariantSlot: index + 1,
      ownedRangeMode: "full_observed_root_range_v1", ownedObservedDuration: 2, range: { startSeconds: 0, endSeconds: 2 } });
    assert.equal(queued.code, "job_enqueued"); assert.equal(queued.nativeAssociationVerified, true);
  }
  const poll = () => {
    const observed = run({ ...base, operation: shared ? "shared_status" : "status", jobId: items[0].jobId, jobIds: items.map(item => item.jobId) });
    assert.equal(observed.code, shared ? "shared_jobs_observed" : "job_observed");
    return shared ? observed.jobs[0] : observed.job;
  };
  return { base, items, run, poll, host: (result, overrides = {}) => listeners.onItemEncodeComplete({ sourceFilePath: items[0].source,
    outputFilePath: items[0].output, result, ...overrides }), wrapper: result => items[0].listeners.onEncodeFinished({ result }),
    assertNoReplay: () => assert.equal(adds, items.length) };
}
function exactHost(row, f, result) {
  assert.equal(row.nativeCompletionObserved, true); assert.equal(row.status, "native_finished");
  assert.equal(row.completionOrigin, "host_exact_paths"); assert.equal(row.nativeResult, result);
  assert.equal(row.hostCompletion.result, result); assert.equal(row.hostCompletion.sourceFilePath, f.items[0].source);
  assert.equal(row.hostCompletion.outputFilePath, f.items[0].output); assert.equal(row.eventObservedAt, row.hostCompletion.observedAt);
}
function main() {
  const generate = generator(process.argv.includes("--stdin") ? fs.readFileSync(0, "utf8") : undefined);
  let passed = 0, failed = 0;
  function check(name, test) { try { test(); passed++; console.log("PASS " + name); }
    catch (error) { failed++; console.error("FAIL " + name + ": " + error.message.split("\n")[0]); } }
  check("host then wrapper preserves exact success/failure and host timestamp", () => {
    for (const result of ["True", "False"]) {
      const f = fixture(generate); f.host(result); const before = f.poll(); exactHost(before, f, result);
      f.wrapper(0); const after = f.poll(); exactHost(after, f, result);
      assert.deepEqual(after.hostCompletion, before.hostCompletion); assert.equal(after.eventObservedAt, before.eventObservedAt);
      assert.equal(after.wrapperCompletion.result, 0); assert(after.wrapperCompletion.observedAt > after.eventObservedAt); f.assertNoReplay();
    }
  });
  check("wrapper then shared poll waits for host success/failure", () => {
    for (const result of ["True", "False"]) {
      const f = fixture(generate); f.wrapper(0); const pending = f.poll();
      assert.equal(pending.nativeCompletionObserved, false); assert.equal(pending.hostCompletion, null);
      assert.equal(pending.wrapperCompletion.result, 0); assert.equal(pending.completionOrigin, "native_wrapper");
      f.host(result); const done = f.poll(); exactHost(done, f, result);
      assert.deepEqual(done.wrapperCompletion, pending.wrapperCompletion); f.assertNoReplay();
    }
  });
  check("mismatched source or output host callback cannot supply exact proof", () => {
    for (const field of ["sourceFilePath", "outputFilePath"]) for (const hostFirst of [true, false]) {
      const f = fixture(generate), mismatch = { [field]: "C:/foreign-file" };
      if (hostFirst) f.host("True", mismatch); f.wrapper(0); if (!hostFirst) f.host("True", mismatch);
      const row = f.poll(); assert.equal(row.hostCompletion, null); assert.equal(row.nativeCompletionObserved, false);
      assert.equal(row.completionOrigin, "native_wrapper"); assert.equal(row.nativeResult, 0); f.assertNoReplay();
    }
  });
  check("wrapper-only raw values remain pending in shared mode", () => {
    for (const result of [0, 1, "True", "False", true, false, null]) {
      const f = fixture(generate); f.wrapper(result); const row = f.poll();
      assert.equal(row.nativeCompletionObserved, false); assert.equal(row.hostCompletion, null);
      assert.equal(row.nativeResult, result); assert.equal(row.wrapperCompletion.result, result); f.assertNoReplay();
    }
  });
  check("legacy wrapper-only observation and raw enums stay unchanged", () => {
    for (const result of [0, 1, "True", "False", true, false, null]) {
      const f = fixture(generate, false); f.wrapper(result); const row = f.poll();
      assert.equal(row.nativeCompletionObserved, true); assert.equal(row.hostCompletion, null);
      assert.equal(row.completionOrigin, "native_wrapper"); assert.equal(row.nativeResult, result); f.assertNoReplay();
    }
  });
  check("late mismatched callbacks preserve host evidence and association uses actual getter", () => {
    const f = fixture(generate); f.host("True"); const before = f.poll();
    f.host("False", { outputFilePath: "C:/foreign.mov" }); assert.deepEqual(f.poll(), before);
    f.items[0].wrapper.outputFiles = ["C:/foreign.mov"];
    const read = f.run({ ...f.base, operation: "status", jobId: f.items[0].jobId });
    assert.equal(read.nativeAssociationVerified, false); assert.equal(read.job.nativeAssociationVerified, false); f.assertNoReplay();
  });
  console.log(`completion-order: ${passed} passed, ${failed} failed; offline VM, no product imports/live calls`);
  if (failed) process.exitCode = 1;
}
if (require.main === module) main();
module.exports = { generator, fixture };
