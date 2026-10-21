"use strict";

const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const crypto = require("node:crypto"), vm = require("node:vm");
const jobs = require("../mcp-server/ame-title-jobs"), presets = require("../mcp-server/ame-presets");
const semantic = require("../mcp-server/semantic-verification");
const scratchRoot = path.resolve(__dirname, "../.codex-runtime/ame-single-job-gate/fixtures"); fs.mkdirSync(scratchRoot, { recursive: true });
const root = fs.mkdtempSync(path.join(scratchRoot, "ae-ame-title-semantic-"));
const copy = value => JSON.parse(JSON.stringify(value));
const digest = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const fileHash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
let groups = 0, baseline;
function check(name, fn) { fn(); groups++; }
function verdict(step, extraSteps = [], runChange = {}) {
  const run = { ...copy(baseline.run), ...runChange, steps: [step, ...extraSteps] };
  return semantic.buildSemanticVerification({ steps: [{ tool: step.tool, args: step.args }] }, run);
}
function rejected(step, extraSteps = [], runChange = {}) {
  const result = verdict(step, extraSteps, runChange);
  assert.equal(result.status, "needs_review", JSON.stringify(result));
  assert.equal(result.ok, false);
  assert(result.failedChecks + result.needsReviewChecks + result.unverifiedMutationSteps.length > 0, JSON.stringify(result));
}

async function fixture() {
  const sourcePath = path.join(root, "source.aep"), presetDir = path.join(root, "presets"), outputDir = path.join(root, "outputs");
  fs.mkdirSync(presetDir); fs.writeFileSync(sourcePath, "offline pinned source");
  fs.writeFileSync(path.join(presetDir, "exact.epr"), "<PremiereData><PresetName>Exact semantic fixture</PresetName><ExporterName>Fixture</ExporterName></PremiereData>");
  const catalog = () => presets.scanPresetRoots({ roots: [{ source: "fixture", path: presetDir }] }), preset = catalog().presets[0];
  assert(preset);
  let clock = Date.now(), sends = 0, enqueues = 0, starts = 0;
  const startedAt = new Date(clock - 100).toISOString();
  class NativeDate extends Date { constructor(value) { super(arguments.length ? value : clock); } static now() { return clock; } }
  const processInfo = { pid: 77, startedAt, path: "C:\\Program Files\\Adobe\\Adobe Media Encoder 2026\\Adobe Media Encoder.exe" };
  const forbidden = () => { throw Error("forbidden live or destructive action"); };
  const ame = vm.createContext({ Date: NativeDate, JSON: undefined, BridgeTalk: { appSpecifier: "ame-26.0" }, $: { global: { aeAgentAMEProbeSessionNonce: "session-semantic" } },
    app: { quit: forbidden, getEncoderHost: () => ({ isBatchRunning: () => false, addEventListener: () => {}, runBatch: () => { starts++; return true; } }),
      getFrontend: () => ({ addEventListener: () => {}, getDLItemsAtRoot: file => { assert.equal(file, sourcePath); return ["GUID-semantic"]; },
        addDLToBatch: (file, format, presetFile, guid, output) => {
          assert.equal(file, sourcePath); assert.equal(format, ""); assert.equal(presetFile, fs.realpathSync(preset.canonicalPath)); assert.equal(guid, "GUID-semantic"); enqueues++;
          return { outputFiles: [output], setWorkArea: () => true, addEventListener: () => {}, getEncodeProgress: () => 0, getEncodeTime: () => 0, getLogOutput: () => "offline" };
        }, removeAllBatchItems: forbidden }) }, File: forbidden });
  function BridgeTalk() { this.send = () => { sends++; clock++; this.onResult({ body: vm.runInContext(this.body, ame) }); return true; }; }
  BridgeTalk.isRunning = () => true; BridgeTalk.launch = forbidden; BridgeTalk.pump = () => {};
  const ae = vm.createContext({ Date: NativeDate, BridgeTalk, $: { global: {}, sleep: () => {} }, app: { quit: forbidden } });
  const contexts = new WeakSet();
  const assertContext = context => { if (!contexts.has(context)) throw Error("server_manual_context_required"); };
  const executor = jobs.createExecutor({ stateDir: path.join(root, "state"), now: () => clock++, listPresetCatalog: catalog,
    inspectProcesses: async () => [{ ...processInfo }], resolveOutputFilePath: name => path.join(outputDir, name),
    assertManualIngress: assertContext, assertServerContext: assertContext,
    runExtendScriptBody: async script => ({ result: vm.runInContext("(function(){" + script + "}())", ae) }) });
  const common = { targetSpecifier: "ame-26.0", expectedProcess: { pid: processInfo.pid, startedAt }, expectedSessionNonce: "session-semantic", timeoutMs: 5000 };
  const args = { ...common, batchId: "11111111-1111-4111-8111-111111111111", sourceProjectFile: sourcePath, expectedSourceSha25664: fileHash(sourcePath), sourceGuid: "GUID-semantic",
    presetId: preset.presetId, presetSha25664: preset.sha256, outputFileName: "title.mov", range: { startSeconds: 1.25, endSeconds: 2.75 } };
  const run = { id: "22222222-2222-4222-8222-222222222222", provenance: { actionId: "manual-semantic-proposal" }, startedAt: new Date(clock).toISOString(), ok: true, dryRun: false };
  const context = {}; contexts.add(context);
  const result = await executor.execute(jobs.ENQUEUE, args, executor.authorize(jobs.ENQUEUE, args, context)); assert.equal(result.ok, true, JSON.stringify(result));
  result.authorization = { runId: run.id, proposalId: run.provenance.actionId };
  const readArgs = { ...common, batchId: args.batchId, jobId: result.jobId }, read = await executor.execute(jobs.STATUS, readArgs);
  assert.equal(read.ok, true, JSON.stringify(read)); assert.notEqual(read.requestNonce, result.requestNonce);
  result.verification = { ok: true, scope: "ame_native_wrapper_association_only", nativeJobId: null, nativeQueueCompositionVerified: false };
  const attached = { tool: jobs.STATUS, args: readArgs, status: "completed", result: read, source: "server_typed_readback", observedAt: new Date(clock++).toISOString() };
  const step = { index: 1, tool: jobs.ENQUEUE, args, status: "completed", result, independentReadBack: [attached] };
  const startArgs = { ...common, batchId: args.batchId };
  const start = await executor.execute(jobs.START, startArgs, executor.authorize(jobs.START, startArgs, context));
  assert.equal(start.code, "queue_composition_unavailable"); assert.equal(start.ok, false);
  assert.deepEqual({ sends, enqueues, starts }, { sends: 2, enqueues: 1, starts: 0 });
  run.finishedAt = new Date(clock + 10).toISOString();
  return { step, run, startArgs, start };
}

async function signedFixture() {
  // The actual runner, issuer, signed MAC verification and private cache are
  // exercised with injected offline child/image dependencies. No native launch.
  const runner = require("../mcp-server/ame-native-fixture-runner"), grant = require("../mcp-server/ame-native-fixture-grant");
  const m100 = require("../mcp-server/m100-protocol");
  const repoRoot = path.join(root, "fixture-repo"), artifactDir = path.join(root, "fixture-artifacts");
  fs.mkdirSync(repoRoot); fs.mkdirSync(path.join(repoRoot, ".codex-runtime")); fs.mkdirSync(artifactDir);
  const binary = path.join(artifactDir, "build.aex"), pluginPath = path.join(artifactDir, "installed.aex"), executablePath = path.join(artifactDir, "AfterFX.exe");
  fs.writeFileSync(binary, "offline native image"); fs.writeFileSync(executablePath, "offline executable image");
  const artifacts = { binary, pluginPath, pluginSha256: fileHash(binary), executablePath, executableSha256: fileHash(executablePath), receipt: { buildId: "offline-signed-fixture-build" } };
  const sourceFile = path.join(repoRoot, "current.aep"), checkpointFile = path.join(repoRoot, "checkpoint.aep");
  fs.writeFileSync(sourceFile, "offline current-user disk marker"); fs.writeFileSync(checkpointFile, "offline checkpoint marker");
  const args = { fixtureKind: "saved-dirty", restoreDirty: true }, now = Date.now(), runId = crypto.randomUUID(), contractVersion = "ae-agent.3.3.1";
  const record = { actionId: "action_semantic_fixture", revision: 1, executionId: runId, executionState: "executing", riskLevel: "mutating",
    confirmedBySurface: "cep-panel", confirmationSurface: "cep-panel", confirmedAt: new Date(now - 1000).toISOString(), dryRunCompletedAt: new Date(now - 2000).toISOString(),
    proposalExpiresAt: new Date(now + 600000).toISOString(), project: { expectedFile: sourceFile },
    payload: { kind: "agent_plan", plan: { targetProject: { file: sourceFile }, steps: [{ tool: grant.TOOL_NAME, args }] } } };
  record.payloadHash = m100.sha256Payload(record.payload);
  record.dryRunReceipt = { payloadHash: record.payloadHash, contractVersion, stepCount: 1, projectFile: sourceFile };
  const checkpoint = { sourceFile, checkpointFile }, context = { record, runId, args, source: "ai-plan-run", confirm: true, autonomous: false,
    allowWithoutCheckpoint: false, stepCount: 1, checkpoint };
  const run = { id: runId, provenance: { actionId: record.actionId }, startedAt: new Date().toISOString(), ok: true, dryRun: false };
  const processes = new Map(), timers = [], failures = [], contexts = new WeakSet([context]);
  let launches = 0;
  const source = descriptor => ({ path: path.join(descriptor.rootPath, "source.aep"), dirty: true, projectHandle: "100",
    fixtureCanonicalSha256: "a".repeat(64), fixtureEvidence: "offline-fixed-fixture-sentinel", fixedMainName: "Main", fixedNestedName: "AEAgent Fixture Nested",
    rootCompositionCount: 1, extendscriptRevisionObserved: "3", observedState: { items: [{ name: "Main" }, { name: "AEAgent Fixture Nested" }, { name: "fixture.bmp" }, { name: "proxy.bmp" }] } });
  const executor = runner.createExecutor({ repoRoot, contractVersion, getArtifacts: () => artifacts, getCurrentRecord: () => record, getCheckpoint: () => checkpoint,
    assertManualIngress: value => { assert(contexts.has(value)); }, inspectProcess: async pid => processes.get(pid) || null,
    launchChild: async (descriptor, environment) => {
      const pid = 5100 + ++launches, createdUnixMs = Date.now();
      // Offline identity shared by fake launch and inspection; no kernel origin.
      const processIdentity = { pid, createdUnixMs, createdAt: new Date(createdUnixMs).toISOString().replace(/Z$/, "0000Z"), path: descriptor.executablePath };
      processes.set(pid, processIdentity);
      const key = Buffer.from(environment.AE_AGENT_NATIVE_FIXTURE_KEY, "hex"), seen = new Set();
      const receiptBase = () => ({ schema: grant.SCHEMA, role: descriptor.role, fixture: args.fixtureKind, stageId: descriptor.stageId, nonce: descriptor.nonce,
        rootPath: descriptor.rootPath, challenge: descriptor.nonce, pid, processCreatedUnixMs: createdUnixMs, pluginSha256: descriptor.pluginSha256,
        hostLoaded: true, productionAuthorization: false, readiness: false, replayAllowed: false, timestampUnixMs: Date.now() });
      const publish = (filename, fields) => {
        const body = JSON.stringify({ ...receiptBase(), ...fields });
        fs.writeFileSync(path.join(descriptor.rootPath, filename), JSON.stringify({ body, mac: crypto.createHmac("sha256", key).update(body).digest("hex") }), { flag: "wx" });
      };
      publish("signed-boot.json", { status: "empty_owned_child_waiting_signed_grant", approvalSha256: "1".repeat(64),
        baselineInputSha256: descriptor.role === "capture" ? "0".repeat(64) : fileHash(path.join(descriptor.rootPath, "baseline.aep")),
        baseline: { path: "", dirty: false, observedState: { items: [] } }, nativeSaveDispatches: 0, fixtureMutationDispatches: 0 });
      const timer = setInterval(() => {
        try {
          for (const operation of descriptor.role === "capture" ? ["create-fixture", "snapshot"] : ["stage-variants"]) {
            const filename = `signed-${operation}.grant`, file = path.join(descriptor.rootPath, filename);
            if (seen.has(filename) || !fs.existsSync(file)) continue;
            seen.add(filename);
            const f = Object.fromEntries(fs.readFileSync(file, "utf8").trim().split("\n").map(line => { const n = line.indexOf("="); return [line.slice(0, n), line.slice(n + 1)]; }));
            assert.equal(f.mac, crypto.createHmac("sha256", key).update(grant.canonicalFields(f)).digest("hex"));
            const receiptGrant = { operation, stageId: f.stage_id, actionId: f.action_id, revision: Number(f.revision), runId: f.run_id,
              payloadSha256: f.payload_sha256, checkpointSha256: f.checkpoint_sha256, contractVersion: f.contract_version, expiresUnixMs: Number(f.expires_unix_ms), grantMac: f.mac };
            if (operation === "create-fixture") {
              for (const name of ["source.aep", "fixture.bmp", "proxy.bmp"]) fs.writeFileSync(path.join(descriptor.rootPath, name), "offline owned fixture data");
              publish("signed-fixture.json", { status: "source_fixture_ready", approvalSha256: "2".repeat(64), source: source(descriptor), layerSwitchDispatches: 0, grant: receiptGrant });
            } else if (operation === "snapshot") {
              const baselinePath = path.join(descriptor.rootPath, "baseline.aep"); fs.writeFileSync(baselinePath, "offline captured baseline");
              publish("signed-snapshot.json", { status: "fixture_baseline_saved_source_preserved", sourceBefore: source(descriptor),
                sourceAfter: { ...source(descriptor), extendscriptRevisionObserved: "4" }, baselinePath, baselineSha256: fileHash(baselinePath),
                dirtyRestored: true, layerSwitchDispatches: 0, grant: receiptGrant });
            } else {
              const outputs = [1, 2].map(variant => {
                const filePath = path.join(descriptor.rootPath, `variant-0${variant}.aep`); fs.writeFileSync(filePath, `offline saved variant ${variant}`);
                return { variant, path: filePath, sha256: fileHash(filePath), reopened: true,
                  readback: { ...source(descriptor), path: filePath, dirty: false, projectHandle: String(200 + variant), fixtureCanonicalSha256: String(variant).repeat(64) } };
              });
              publish("signed-variants.json", { status: "two_owned_variants_reopened", outputs, baselineSha256: fileHash(path.join(descriptor.rootPath, "baseline.aep")),
                ameSubmissionAttempted: false, grant: receiptGrant });
            }
          }
        } catch (error) { failures.push(error); clearInterval(timer); publish("signed-refusal.json", { status: "refused_or_unknown", reason: "offline fixture emulator failure" }); }
      }, 10);
      timers.push(timer); return { pid, process: processIdentity };
    } });
  try {
    const result = await executor.execute(args, await executor.authorize(context)); assert.equal(failures.length, 0, String(failures[0]));
    const readArgs = { evidenceId: result.evidenceId }, read = await executor.inspectResult(readArgs);
    result.verification = copy(read.verification);
    const attached = { tool: runner.INSPECT, args: readArgs, status: "completed", result: read, source: "server_typed_readback", observedAt: new Date().toISOString() };
    const step = { index: 1, tool: grant.TOOL_NAME, args, status: "completed", result, independentReadBack: [attached] };
    assert.equal(launches, 2); assert.equal(fs.readFileSync(sourceFile, "utf8"), "offline current-user disk marker");
    run.finishedAt = new Date().toISOString(); return { step, run };
  } finally { timers.forEach(clearInterval); }
}

(async () => {
  baseline = await fixture();
  check("real fixed adapter enqueue and independent status pass association scope", () => {
    const result = verdict(baseline.step);
    assert.equal(result.status, "passed", JSON.stringify(result)); assert.equal(result.passedChecks, 1); assert.equal(result.readBackCount, 1);
    assert.match(result.checks[0].observed, /native ID, whole queue, encode and media proof remain separate/);
  });
  check("payload echo and explicit read without server attachment cannot pass", () => {
    const step = copy(baseline.step), read = step.independentReadBack[0];
    delete step.independentReadBack; step.result.verification.independentReadBack = copy(read);
    rejected(step); rejected(step, [{ ...read, index: 2 }]);
  });
  check("attached metadata must be one complete server typed read", () => {
    for (const change of [s => { s.independentReadBack = {}; }, s => { s.independentReadBack = []; },
      s => { s.independentReadBack.push(copy(s.independentReadBack[0])); }, s => { s.independentReadBack.push({ tool: "unknown_read", status: "completed" }); },
      s => { s.independentReadBack[0].source = "caller"; }, s => { s.independentReadBack[0].status = "failed"; },
      s => { s.independentReadBack[0].tool = jobs.INSPECT; }]) { const step = copy(baseline.step); change(step); rejected(step); }
  });
  check("exact run and proposal provenance required", () => {
    for (const change of [s => { delete s.result.authorization; }, s => { s.result.authorization.runId = "other-run"; },
      s => { s.result.authorization.proposalId = "other-proposal"; }, s => { s.result.verification.scope = "full_queue"; }, s => { s.result.verification.ok = false; }]) {
      const step = copy(baseline.step); change(step); rejected(step);
    }
    rejected(copy(baseline.step), [], { id: undefined }); rejected(copy(baseline.step), [], { provenance: {} });
  });
  check("independent nonce native correlation and fresh observations required", () => {
    for (const change of [s => { const r = s.independentReadBack[0].result; r.requestNonce = r.native.requestNonce = s.result.requestNonce; },
      s => { s.independentReadBack[0].result.native.requestNonce = crypto.randomUUID(); },
      s => { s.independentReadBack[0].result.native.observedAt = s.result.native.observedAt - 1; },
      s => { s.independentReadBack[0].observedAt = new Date(Date.parse(s.result.observedAt) - 1).toISOString(); },
      s => { s.result.native.observedAt = Date.parse(baseline.run.startedAt) - 1; },
      s => { s.independentReadBack[0].result.native.observedAt = Date.parse(baseline.run.finishedAt) + 120000; },
      s => { s.independentReadBack[0].result.native.operationBinding = s.result.native.operationBinding; }]) {
      const step = copy(baseline.step); change(step); rejected(step);
    }
    const step = copy(baseline.step), copied = copy(step.result);
    copied.code = copied.native.code = "job_observed"; copied.native.operationBinding = digest({ operation: "status", jobId: copied.jobId });
    step.independentReadBack[0].result = copied; rejected(step);
  });
  check("read process target session and batch arguments bound to mutation", () => {
    for (const change of [r => { r.args.expectedProcess.pid++; }, r => { r.args.expectedProcess.startedAt = new Date(0).toISOString(); },
      r => { r.args.targetSpecifier = "ame-25.0"; }, r => { r.args.expectedSessionNonce = "foreign"; }, r => { r.args.timeoutMs = 1000; },
      r => { r.args.batchId = crypto.randomUUID(); }, r => { r.args.jobId = crypto.randomUUID(); }, r => { r.args.code = "unsafe"; },
      r => { r.result.native.appSpecifier = "ame-25.0"; }, r => { r.result.native.sessionNonce = "foreign"; },
      r => { r.result.native.job.processBinding = "a".repeat(64); }]) { const step = copy(baseline.step); change(step.independentReadBack[0]); rejected(step); }
  });
  check("source GUID source path output preset and range exact in both observations", () => {
    for (const side of ["mutation", "read"]) for (const change of [p => { p.native.job.sourceGuid = "foreign-guid"; },
      p => { p.native.job.sourcePath = path.join(root, "foreign.aep"); }, p => { p.native.job.outputPath = path.join(root, "foreign.mov"); },
      p => { p.native.job.outputFiles = [path.join(root, "foreign.mov")]; }, p => { p.native.job.outputFiles.push(p.native.job.outputPath); },
      p => { p.native.job.presetIdentity = "b".repeat(64); }, p => { p.native.job.range.startSeconds++; },
      p => { p.native.job.range.endSeconds++; }, p => { p.native.job.range.extra = true; }, p => { p.native.job.nativeAssociationVerified = false; }]) {
      const step = copy(baseline.step); change(side === "mutation" ? step.result : step.independentReadBack[0].result); rejected(step);
    }
    for (const field of ["expectedSourceSha25664", "presetSha25664"]) { const step = copy(baseline.step); step.args[field] = "c".repeat(64); rejected(step); }
    const step = copy(baseline.step); step.result.outputPath = path.join(root, "renamed.mov"); rejected(step);
  });
  check("job handles cannot become invented native IDs or whole queue proof", () => {
    for (const change of [p => { p.jobId = crypto.randomUUID(); }, p => { p.handleKey = crypto.randomUUID(); }, p => { p.native.job.handleKey = crypto.randomUUID(); },
      p => { p.nativeJobId = "native-123"; }, p => { p.native.nativeJobId = "native-123"; }, p => { p.native.job.nativeJobId = "native-123"; },
      p => { p.nativeAssociationVerified = false; }, p => { p.nativeQueueCompositionVerified = true; }, p => { p.ok = false; }]) {
      for (const side of ["mutation", "read"]) { const step = copy(baseline.step); change(side === "mutation" ? step.result : step.independentReadBack[0].result); rejected(step); }
    }
  });
  check("start reports missing entire native queue composition even with wrapper reads", () => {
    for (const result of [baseline.start, { ...baseline.start, ok: true, code: "batch_start_accepted", queueOwnershipAssertedByInjectedGate: true,
      nativeQueueCompositionVerified: true, verification: { ok: true, scope: "ame_native_queue_composition" } }]) {
      const step = { index: 1, tool: jobs.START, args: baseline.startArgs, status: "completed", result, independentReadBack: copy(baseline.step.independentReadBack) };
      const verified = verdict(step); rejected(step); assert.equal(verified.checks[0].observed, "queue_composition_unavailable");
    }
  });
  check("fixture mutation never becomes not-applicable or positive from an echo", () => {
    const step = { index: 1, tool: "ame_native_fixture_probe", args: {}, status: "completed", result: { ok: true, verification: { ok: true },
      authorization: { runId: baseline.run.id, proposalId: baseline.run.provenance.actionId } }, independentReadBack: copy(baseline.step.independentReadBack) };
    rejected(step); assert.equal(verdict(step).checks[0].status, "needs_review");
    assert.equal(semantic.isMutatingStep({ tool: jobs.ENQUEUE }), true); assert.equal(semantic.isMutatingStep({ tool: jobs.START }), true);
    assert.equal(semantic.isMutatingStep({ tool: "ame_native_fixture_probe" }), true);
  });
  if (process.argv.includes("--ame-only")) { console.log(JSON.stringify({ status: "passed", groups, scope: "AME association and default START fail-closed only; native fixture groups excluded" })); return; }
  const native = await signedFixture();
  const nativeVerdict = step => verdict(step, [], native.run), rejectedNative = step => rejected(step, [], native.run);
  check("actual signed issuer runner and private cache read pass owned fixture scope", () => {
    const verified = nativeVerdict(native.step); assert.equal(verified.status, "passed", JSON.stringify(verified));
    assert.equal(verified.passedChecks, 1); assert.equal(verified.readBackCount, 1);
    assert.match(verified.checks[0].observed, /production, current-user, AME and media proof separate/);
  });
  check("fixture echoes copied mutation payload and untrusted malformed extra reads cannot pass", () => {
    for (const change of [s => { s.result.verification.independentReadBack = copy(s.independentReadBack[0]); delete s.independentReadBack; },
      s => { s.independentReadBack[0].result = copy(s.result); }, s => { s.independentReadBack = {}; }, s => { s.independentReadBack = []; },
      s => { s.independentReadBack[0].source = "caller"; }, s => { s.independentReadBack[0].status = "failed"; },
      s => { s.independentReadBack[0].tool = jobs.STATUS; }, s => { s.independentReadBack.push(copy(s.independentReadBack[0])); },
      s => { s.independentReadBack.push({ tool: "unknown_read", status: "completed" }); }]) { const step = copy(native.step); change(step); rejectedNative(step); }
    const step = copy(native.step), read = step.independentReadBack[0]; delete step.independentReadBack;
    rejected(step, [{ ...read, index: 2 }], native.run);
  });
  check("fixture exact selector private producer schemas run proposal and build identity", () => {
    for (const change of [s => { s.result.authorization.runId = "foreign"; }, s => { s.result.authorization.proposalId = "foreign"; },
      s => { s.independentReadBack[0].result.authorization.runId = "foreign"; }, s => { s.independentReadBack[0].result.authorization.proposalId = "foreign"; },
      s => { s.independentReadBack[0].result.producer = "copied_native_receipt"; }, s => { s.independentReadBack[0].result.schema = s.result.schema; },
      s => { s.independentReadBack[0].result.buildId = "foreign"; }, s => { s.independentReadBack[0].args.evidenceId = crypto.randomUUID(); },
      s => { s.independentReadBack[0].args.extra = "untrusted"; }, s => { s.independentReadBack[0].result.evidenceId = crypto.randomUUID(); },
      s => { s.independentReadBack[0].result.fixtureKind = "saved-clean"; }, s => { s.result.fixtureKind = "saved-clean"; },
      s => { s.result.nativeFixtureSnapshot.grant.runId = "foreign"; }, s => { s.result.nativeFixtureVariants.grant.actionId = "foreign"; }]) {
      const step = copy(native.step); change(step); rejectedNative(step);
    }
  });
  check("fixture read observation current and ordered within its exact run", () => {
    for (const change of [s => { s.independentReadBack[0].result.observedAt = new Date(Date.parse(native.run.startedAt) - 1).toISOString(); },
      s => { s.independentReadBack[0].observedAt = new Date(Date.parse(s.independentReadBack[0].result.observedAt) - 1).toISOString(); },
      s => { s.independentReadBack[0].observedAt = new Date(Date.parse(native.run.finishedAt) + 1).toISOString(); },
      s => { s.independentReadBack[0].result.observedAt = "invalid"; }]) { const step = copy(native.step); change(step); rejectedNative(step); }
  });
  check("fixture source path dirty canonical state handle and sentinel preserved at receipts", () => {
    for (const side of ["mutation", "read"]) for (const key of ["sourceBefore", "sourceAfter"]) for (const change of [s => { s.path = path.join(root, "foreign.aep"); },
      s => { s.dirty = false; }, s => { s.fixtureCanonicalSha256 = "b".repeat(64); }, s => { s.fixtureEvidence = "foreign"; },
      s => { s.projectHandle = "foreign"; }, s => { s.fixedMainName = "Foreign"; }, s => { s.fixedNestedName = "Foreign"; },
      s => { s.rootCompositionCount = 2; }, s => { s.observedState.items.pop(); }]) {
      const step = copy(native.step), state = side === "mutation" ? step.result.nativeFixtureSnapshot[key] : step.independentReadBack[0].result[key];
      change(state); rejectedNative(step);
    }
  });
  check("fixture baseline input saved reopened output path hashes and fixed readback exact", () => {
    for (const change of [s => { s.result.nativeFixtureSnapshot.baselineSha256 = "c".repeat(64); },
      s => { s.result.nativeFixtureVariants.baselineSha256 = "c".repeat(64); }, s => { s.independentReadBack[0].result.baselineSha256 = "c".repeat(64); },
      s => { s.result.nativeFixtureSnapshot.baselinePath = path.join(root, "foreign.aep"); }, s => { s.independentReadBack[0].result.baselinePath = path.join(root, "foreign.aep"); },
      s => { s.result.outputFiles[0].sha256 = "d".repeat(64); }, s => { s.result.nativeFixtureVariants.outputs[0].sha256 = "d".repeat(64); },
      s => { s.independentReadBack[0].result.outputs[0].sha256 = "d".repeat(64); }, s => { s.independentReadBack[0].result.outputs[0].path = path.join(root, "foreign.aep"); },
      s => { s.result.outputFiles.pop(); }, s => { s.independentReadBack[0].result.outputs[0].reopened = false; }]) { const step = copy(native.step); change(step); rejectedNative(step); }
    // Mutations applied consistently to all three copies still must obey the
    // fixed variant file and native reopened read-back contract.
    for (const change of [o => { o.variant = 2; }, o => { o.path = path.join(root, "foreign.aep"); }, o => { o.reopened = false; },
      o => { o.readback.path = path.join(root, "foreign.aep"); }, o => { o.readback.dirty = true; }, o => { o.readback.rootCompositionCount = 2; },
      o => { o.readback.fixedMainName = "Foreign"; }, o => { o.readback.fixedNestedName = "Foreign"; }, o => { o.readback.observedState.items.pop(); }]) {
      const step = copy(native.step);
      for (const outputs of [step.result.outputFiles, step.result.nativeFixtureVariants.outputs, step.independentReadBack[0].result.outputs]) change(outputs[0]);
      rejectedNative(step);
    }
  });
  check("fixture two exact child bindings and signed receipt restrictions required", () => {
    for (const index of [0, 1]) for (const change of [s => { s.result.childProcesses[index].pid++; }, s => { s.result.childProcesses[index].rootPath = root; },
      s => { s.result.childProcesses[index].terminalReceiptVerified = false; }, s => { s.independentReadBack[0].result.childProcesses[index].pid++; },
      s => { s.independentReadBack[0].result.childProcesses[index].createdUnixMs++; }, s => { s.independentReadBack[0].result.childProcesses[index].role = "foreign"; },
      s => { const r = index ? s.result.nativeFixtureVariants : s.result.nativeFixtureSnapshot; r.processCreatedUnixMs++; },
      s => { const r = index ? s.result.nativeFixtureVariants : s.result.nativeFixtureSnapshot; r.role = "foreign"; },
      s => { const r = index ? s.result.nativeFixtureVariants : s.result.nativeFixtureSnapshot; r.pluginSha256 = "f".repeat(64); },
      s => { const r = index ? s.result.nativeFixtureVariants : s.result.nativeFixtureSnapshot; r.hostLoaded = false; },
      s => { const r = index ? s.result.nativeFixtureVariants : s.result.nativeFixtureSnapshot; r.productionAuthorization = true; }]) {
      const step = copy(native.step); change(step); rejectedNative(step);
    }
    for (const change of [s => { s.independentReadBack[0].result.childProcesses.pop(); }, s => { s.result.childProcesses.pop(); },
      s => { s.result.nativeFixtureVariants.pid = s.result.nativeFixtureSnapshot.pid; }, s => { s.result.nativeFixtureSnapshot.layerSwitchDispatches = 1; },
      s => { s.result.nativeFixtureVariants.ameSubmissionAttempted = true; }]) { const step = copy(native.step); change(step); rejectedNative(step); }
  });
  check("fixture limited proof cannot claim production current-user submission or media", () => {
    for (const side of ["mutation", "read"]) for (const change of [p => { p.productionBackend = true; }, p => { p.currentUserProjectMutation = true; },
      p => { p.verification.scope = "production_snapshot"; }, p => { p.verification.ok = false; }, p => { p.verification.outputsHashVerified = false; },
      p => { p.verification.sourcePathAndDirtyPreserved = false; }, p => { p.verification.mediaProof = "verified"; }, p => { p.verification.ameSubmission = "submitted"; }]) {
      const step = copy(native.step); change(side === "mutation" ? step.result : step.independentReadBack[0].result); rejectedNative(step);
    }
  });
  console.log(JSON.stringify({ status: "passed", groups, proof: "offline fixed AME adapter VM + signed fixture issuer/runner/cache + real semantic module; no live AE/AME" }));
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(() => {
  // Verify the exact directory created by this test before recursive cleanup.
  assert.equal(path.dirname(path.resolve(root)), scratchRoot);
  assert(path.basename(root).startsWith("ae-ame-title-semantic-"));
  fs.rmSync(root, { recursive: true, force: true });
});
