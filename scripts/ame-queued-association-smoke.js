"use strict";

// Offline contract regression. Optional saved evidence is read, never rewritten.
const assert = require("node:assert/strict"), crypto = require("node:crypto"), fs = require("node:fs"), path = require("node:path");
const semantic = require("../mcp-server/semantic-verification"), jobs = require("../mcp-server/ame-title-jobs");
const copy = value => JSON.parse(JSON.stringify(value));
const digest = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
let cases = 0;
function fixture() {
  const time = Date.parse("2026-10-19T10:00:00.000Z"), stamp = offset => new Date(time + offset).toISOString();
  const jobId = "11111111-1111-4111-8111-111111111111", batchId = "22222222-2222-4222-8222-222222222222";
  const enqueueNonce = "33333333-3333-4333-8333-333333333333", firstNonce = "44444444-4444-4444-8444-444444444444";
  const readNonce = "55555555-5555-4555-8555-555555555555", wrapperNonce = "66666666-6666-4666-8666-666666666666";
  const process = { pid: 77, startedAt: stamp(-1000), path: path.resolve("offline/Adobe Media Encoder.exe") };
  const args = { targetSpecifier: "ame-26.0", expectedProcess: { pid: process.pid, startedAt: process.startedAt }, timeoutMs: 5000,
    sourceProjectFile: path.resolve("offline/source.aep"), expectedSourceSha25664: "a".repeat(64), sourceGuid: "offline-source-guid",
    presetId: "amep_" + "b".repeat(40), presetSha25664: "c".repeat(64), outputFileName: "queued.mov", batchId,
    range: { startSeconds: 1.25, endSeconds: 2.75 }, queueMode: "shared_queue_v1" };
  const outputPath = path.resolve("offline/queued.mov"), normalized = jobs.validateInput(jobs.ENQUEUE, args);
  const processBinding = digest({ target: args.targetSpecifier, session: null, pid: process.pid, startedAt: process.startedAt,
    path: process.path.replace(/\\/g, "/").toLowerCase() });
  const job = { nativeJobId: null, nativeAssociationVerified: true, handleKey: jobId, enqueueRequestNonce: enqueueNonce,
    retainedWrapperSessionNonce: wrapperNonce, sourceGuid: args.sourceGuid, sourcePath: args.sourceProjectFile, outputPath,
    presetIdentity: "d".repeat(64), processBinding, range: args.range, workAreaApplied: true, status: "queued",
    nativeCompletionObserved: false, nativeResult: null, completionOrigin: null, eventObservedAt: null, hostCompletion: null, wrapperCompletion: null,
    getEncodeProgress: 0, getEncodeTime: 0, readErrors: [], outputFiles: [], outputBindingEvidence: "exact_addDL_call_argument_ack",
    independentOutputGetterVerified: false, generatedOutputVerified: false,
    dispatchDiagnostic: { phase: "association_readback", addDLInvoked: true, addDLReturned: true, error: null, creationFailures: [],
      workAreaCallAck: { type: 3, result: true, ...args.range, observedAt: time + 20 } } };
  const native = (nonce, offset) => ({ schema: jobs.NATIVE_SCHEMA, code: "job_observed", requestNonce: nonce,
    operationBinding: digest({ operation: "status", jobId }), appSpecifier: args.targetSpecifier, sessionNonce: null,
    observedAt: time + offset, nativeJobId: null, nativeAssociationVerified: true, batchRunning: false, start: null, job: copy(job) });
  const receipt = n => ({ schema: "ae-agent-ame-own-item-acceptance.v1", jobId, enqueueRequestNonce: enqueueNonce,
    readRequestNonce: n.requestNonce, observedAt: n.observedAt, retainedWrapperSessionNonce: wrapperNonce, outputPath,
    workAreaApplied: true, proofSource: "retained_encoder_wrapper", appliedPresetVerified: false,
    outputBindingEvidence: "exact_addDL_call_argument_ack", independentOutputGetterVerified: false, generatedOutputVerified: false,
    rangeProof: "setWorkArea_call_ack", mediaVerified: false });
  const first = native(firstNonce, 100), second = native(readNonce, 200);
  const result = { schema: jobs.SCHEMA, ok: true, code: "job_observed", batchId, jobId, handleKey: jobId, nativeJobId: null,
    nativeAssociationVerified: true, nativeQueueCompositionVerified: false, completionVerified: false, mediaVerified: false,
    ownItemAccepted: true, state: "queued", requestNonce: enqueueNonce, observedAt: stamp(110), outputPath, unknownOutcome: false,
    acceptanceReceipt: receipt(first), native: first, authorization: { runId: "offline-run", proposalId: "offline-proposal" },
    verification: { ok: true, scope: "ame_native_wrapper_association_only" } };
  const readResult = { ...copy(result), requestNonce: readNonce, observedAt: stamp(210), acceptanceReceipt: receipt(second), native: second,
    nativeCompletionObserved: false, nativeResult: null, queueOnly: true, startAcceptanceVerified: false, startReservation: null,
    process, file: { exists: false } };
  delete readResult.authorization; delete readResult.verification;
  const original = { ...copy(first), code: "job_enqueued", requestNonce: enqueueNonce,
    operationBinding: digest({ operation: "enqueue", jobId, args: normalized }), observedAt: time + 30 };
  const step = { index: 1, tool: jobs.ENQUEUE, args, status: "completed", result,
    commands: [{ role: "mutation", state: "completed", ok: true, executionId: "offline-run",
      result: { schema: "ae-agent-ame-title-send.v1", code: "result", callback: "result", requestNonce: enqueueNonce, responseBody: JSON.stringify(original) } }],
    independentReadBack: [{ tool: jobs.STATUS, args: { targetSpecifier: args.targetSpecifier, expectedProcess: args.expectedProcess,
      timeoutMs: args.timeoutMs, batchId, jobId }, status: "completed", result: readResult, source: "server_typed_readback", observedAt: stamp(220) }] };
  return { plan: { steps: [{ tool: jobs.ENQUEUE, args }] }, run: { id: "offline-run", provenance: { actionId: "offline-proposal" },
    startedAt: stamp(0), finishedAt: stamp(230), ok: true, dryRun: false, steps: [step] } };
}
function verdict(record) { return semantic.buildSemanticVerification(record.plan, record.run); }
function accepted(record) {
  const result = verdict(record);
  assert.equal(result.ok, true, JSON.stringify(result)); assert.equal(result.status, "passed");
  assert.equal(result.passedChecks, 1); assert.equal(result.readBackCount, 1);
  assert.match(result.checks[0].observed, /encode and media proof remain separate/); cases++;
}
function reject(record, name, mutate) {
  const changed = copy(record); mutate(changed.run.steps[0], changed.run);
  const result = verdict(changed); assert.equal(result.ok, false, name);
  assert(result.failedChecks + result.needsReviewChecks > 0, name); cases++;
}
function exercise(record) {
  accepted(record);
  const changes = [
    ["missing attachment", s => { delete s.independentReadBack; }],
    ["payload echo only", s => { s.result.verification.independentReadBack = s.independentReadBack[0]; delete s.independentReadBack; }],
    ["duplicate attachment", s => s.independentReadBack.push(copy(s.independentReadBack[0]))],
    ["foreign attachment source", s => { s.independentReadBack[0].source = "caller"; }],
    ["unfinished attachment", s => { s.independentReadBack[0].status = "failed"; }],
    ["missing provenance", (s, r) => { delete r.provenance; }],
    ["run mismatch", s => { s.result.authorization.runId = "foreign"; }],
    ["proposal mismatch", s => { s.result.authorization.proposalId = "foreign"; }],
    ["command run mismatch", s => { s.commands[0].executionId = "foreign"; }],
    ["missing command", s => { delete s.commands; }],
    ["unknown original command", s => { s.commands[0].result.callback = "timeout"; }],
    ["wrong original binding", s => { const n = JSON.parse(s.commands[0].result.responseBody); n.operationBinding = "e".repeat(64); s.commands[0].result.responseBody = JSON.stringify(n); }],
    ["stale read native", s => { s.independentReadBack[0].result.native.observedAt = s.result.native.observedAt - 1; }],
    ["future native with matching receipt", (s, r) => { const p = s.independentReadBack[0].result;
      p.native.observedAt = p.acceptanceReceipt.observedAt = Date.parse(r.finishedAt) + 1; }],
    ["copied observation time with matching receipt", s => { const p = s.independentReadBack[0].result;
      p.native.observedAt = p.acceptanceReceipt.observedAt = s.result.native.observedAt; }],
    ["copied native nonce", s => { const r = s.independentReadBack[0].result; r.requestNonce = r.native.requestNonce = s.result.native.requestNonce; }],
    ["copied enqueue nonce", s => { s.result.native.requestNonce = s.result.requestNonce; }],
    ["wrong status binding", s => { s.independentReadBack[0].result.native.operationBinding = "e".repeat(64); }],
    ["attachment before observation", s => { s.independentReadBack[0].observedAt = s.result.observedAt; }],
    ["attachment after run", (s, r) => { s.independentReadBack[0].observedAt = new Date(Date.parse(r.finishedAt) + 1).toISOString(); }],
    ["missing run start", (s, r) => { delete r.startedAt; }],
    ["missing run finish", (s, r) => { delete r.finishedAt; }],
    ["changed preset selection", s => { s.args.presetSha25664 = "e".repeat(64); }],
    ["changed source pin", s => { s.args.expectedSourceSha25664 = "e".repeat(64); }],
    ["not shared queue", s => { delete s.args.queueMode; }],
    ["active start", s => { s.independentReadBack[0].result.startReservation = {}; }],
    ["output already exists", s => { s.independentReadBack[0].result.file.exists = true; }],
    ["process mismatch", s => { s.independentReadBack[0].result.process.pid++; }]
  ];
  for (const [name, mutate] of changes) reject(record, name, mutate);
  const payloadChanges = [
    ["wrong batch", p => { p.batchId = crypto.randomUUID(); }], ["wrong job", p => { p.jobId = crypto.randomUUID(); }],
    ["wrong wrapper", p => { p.native.job.retainedWrapperSessionNonce = crypto.randomUUID(); }],
    ["wrong source", p => { p.native.job.sourceGuid = "foreign"; }], ["wrong output", p => { p.native.job.outputPath += ".foreign"; }],
    ["wrong range", p => { p.native.job.range.endSeconds++; }], ["wrong preset", p => { p.native.job.presetIdentity = "e".repeat(64); }],
    ["wrong process binding", p => { p.native.job.processBinding = "e".repeat(64); }], ["wrong session", p => { p.native.sessionNonce = "foreign"; }],
    ["wrong enqueue nonce", p => { p.native.job.enqueueRequestNonce = crypto.randomUUID(); }],
    ["batch running", p => { p.native.batchRunning = true; }], ["start observed", p => { p.native.start = {}; }],
    ["running job", p => { p.native.job.status = "running"; }], ["progress", p => { p.native.job.getEncodeProgress = 0.01; }],
    ["encode time", p => { p.native.job.getEncodeTime = 1; }], ["completion", p => { p.native.job.nativeCompletionObserved = true; }],
    ["completion result", p => { p.native.job.nativeResult = "done"; }], ["completion event", p => { p.native.job.eventObservedAt = p.native.observedAt; }],
    ["host completion", p => { p.native.job.hostCompletion = {}; }], ["wrapper completion", p => { p.native.job.wrapperCompletion = {}; }],
    ["read errors", p => { p.native.job.readErrors = ["error"]; }], ["missing output evidence", p => { delete p.native.job.outputFiles; }],
    ["malformed output evidence", p => { p.native.job.outputFiles = {}; }], ["foreign output file", p => { p.native.job.outputFiles = ["foreign.mov"]; }],
    ["file-backed claim", p => { p.native.job.outputFiles = [p.native.job.outputPath]; }],
    ["wrong binding evidence", p => { p.native.job.outputBindingEvidence = "echo"; }],
    ["false generated proof", p => { p.native.job.generatedOutputVerified = true; }],
    ["failed addDL", p => { p.native.job.dispatchDiagnostic.addDLReturned = false; }],
    ["dispatch error", p => { p.native.job.dispatchDiagnostic.error = "error"; }],
    ["creation error", p => { p.native.job.dispatchDiagnostic.creationFailures = [{}]; }],
    ["unapplied work area", p => { p.native.job.workAreaApplied = false; }],
    ["wrong work area ack", p => { p.native.job.dispatchDiagnostic.workAreaCallAck.endSeconds++; }],
    ["missing receipt", p => { delete p.acceptanceReceipt; }], ["foreign receipt nonce", p => { p.acceptanceReceipt.readRequestNonce = crypto.randomUUID(); }],
    ["preset applied claim", p => { p.acceptanceReceipt.appliedPresetVerified = true; }], ["media claim", p => { p.mediaVerified = true; }],
    ["completion claim", p => { p.completionVerified = true; }], ["unaccepted item", p => { p.ownItemAccepted = false; }]
  ];
  for (const side of ["enqueue", "read"]) for (const [name, mutate] of payloadChanges) {
    reject(record, `${side}: ${name}`, s => mutate(side === "enqueue" ? s.result : s.independentReadBack[0].result));
  }
}

const baseline = fixture(); exercise(baseline);
// The pre-existing file-backed ENQUEUE envelope must retain its exact binding.
const legacy = copy(baseline), step = legacy.run.steps[0]; delete step.args.queueMode;
step.result.code = step.result.native.code = "job_enqueued"; step.result.native.requestNonce = step.result.requestNonce;
step.result.native.operationBinding = digest({ operation: "enqueue", jobId: step.result.jobId, args: jobs.validateInput(jobs.ENQUEUE, step.args) });
for (const p of [step.result, step.independentReadBack[0].result]) p.native.job.outputFiles = [step.result.outputPath];
accepted(legacy);
reject(legacy, "legacy still requires outputFiles", s => { s.result.native.job.outputFiles = []; });
reject(legacy, "legacy still requires enqueue binding", s => { s.result.native.operationBinding = s.independentReadBack[0].result.native.operationBinding; });

let historical = null;
if (process.argv[2]) {
  const file = path.resolve(process.argv[2]), bytes = fs.readFileSync(file), saved = JSON.parse(bytes).record;
  assert(saved && saved.run && saved.plan); const original = verdict(saved);
  assert.equal(original.checks[0].status, "passed");
  // A historical aggregate already failed by the old checker stays historical.
  // Clone the pre-semantic run state to test the replacement aggregate verdict.
  const replay = copy(saved); replay.run.ok = true; exercise(replay);
  assert.deepEqual(fs.readFileSync(file), bytes);
  historical = { runId: saved.run.id, savedRunOk: saved.run.ok, association: original.checks[0].status, replay: verdict(replay).status };
}
console.log(JSON.stringify({ status: "passed", cases, scope: "offline queued-only wrapper association; no AE/AME process, queue or media inspection", historical }));
