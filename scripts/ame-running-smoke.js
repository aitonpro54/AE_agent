"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path"), vm = require("node:vm");
const running = require("../mcp-server/ame-running"), semantic = require("../mcp-server/semantic-verification");
const acorn = require("internal/deps/acorn/acorn/dist/acorn");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "ae-ame-running-")), installation = { installationId: "a".repeat(64), path: "C:\\Program Files\\Adobe\\Adobe Media Encoder 2026\\Adobe Media Encoder.exe", sha256: "b".repeat(64), fileVersion: "26.2.0.52", targetSpecifier: "ame-26.0" };
const runId = "11111111-1111-4111-8111-111111111111", projectFile = path.join(root, "source.aep");
const record = { actionId: "action", executionState: "executing", executionId: runId, riskLevel: "mutating", payloadHash: "payload", confirmedBySurface: "cep-panel", proposalExpiresAt: new Date(Date.now() + 600000).toISOString(), project: { expectedFile: projectFile }, dryRunCompletedAt: new Date().toISOString(), dryRunReceipt: { payloadHash: "payload", contractVersion: "test", stepCount: 1, projectFile } };
function context(args = {}) { return { record, source: "ai-plan-run", runId, confirm: true, allowWithoutCheckpoint: false, stepCount: 1, checkpoint: { sourceFile: projectFile, checkpointFile: path.join(root, "copy.aep") }, args }; }
let groups = 0;
async function check(name, fn) { await fn(); groups++; }
function fixture(label, options = {}) {
  let clock = Date.now(), launches = 0, reads = 0, processReads = 0, seq = 0, active = options.exists ? [{ pid: 77, path: installation.path, startedAt: new Date(clock - 1000).toISOString() }] : [];
  const stateDir = path.join(root, label), sentArgs = [];
  const executor = running.createExecutor({ stateDir, now: () => clock, delay: async ms => { clock += ms; },
    assertServerProposalContext: ctx => running.assertProposalContext(ctx, record, "test"),
    discoverInstalled: async () => options.installations || [installation],
    inspectProcesses: async () => { processReads++; return options.processOverride ? options.processOverride(processReads, active) : active.map(value => ({ ...value })); },
    launchInstalled: async (target, scriptFile) => {
      launches++; assert.deepEqual(target, installation); assert(path.resolve(scriptFile).startsWith(path.resolve(stateDir) + path.sep));
      assert(fs.existsSync(scriptFile)); const recordFile = fs.readdirSync(stateDir).find(name => name.endsWith(".json"));
      const durable = JSON.parse(fs.readFileSync(path.join(stateDir, recordFile), "utf8")); assert.equal(durable.state, "unknown_outcome"); assert.equal(durable.scriptFile, scriptFile);
      const boot = bootVm(fs.readFileSync(scriptFile, "utf8")); fs.writeFileSync(boot.writes[0].file, boot.writes[0].body);
      active = [{ pid: 77, path: installation.path, startedAt: new Date(clock).toISOString() }];
      if (options.launchThrows) throw Error("unknown after process start");
      return { pid: 77 };
    },
    inspectTransport: async args => { reads++; sentArgs.push(args); if (options.transportUnknown) return { deliveryVerified: false };
      if (options.unknownOnce && reads === 1) return { deliveryVerified: false, code: "unknown", requestNonce: runId };
      if (options.unknownOnce) assert.equal(args.reconcileRequestNonce, runId);
      return { schema: "ae-agent-ame-transport.v1", deliveryVerified: true, targetSpecifier: args.targetSpecifier, requestNonce: "response-" + (++seq), warmSessionVerified: Boolean(args.expectedSessionNonce), ame: { sessionNonce: args.expectedSessionNonce || "existing-session" } }; }
  });
  return { executor, stateDir, sentArgs, execute: args => executor.execute(args || {}, executor.authorize(context(args))), setProcess: value => { active = value; }, counts: () => ({ launches, reads, processReads }) };
}
function bootVm(source) {
  const writes = [], global = {}, forbidden = () => { throw Error("forbidden host action"); };
  function File(file) { this.exists = false; this.open = mode => { assert.equal(mode, "w"); return true; }; this.write = body => writes.push({ file, body }); this.close = () => true; }
  const context = vm.createContext({ $: { global }, BridgeTalk: { appSpecifier: "ame-26.0" }, app: { buildNumber: 52, quit: forbidden, getFrontend: forbidden, getEncoderHost: forbidden, getBatchEncoder: forbidden }, File, JSON: undefined });
  vm.runInContext(source, context); return { global, writes };
}
function windowsQueryVm(error = null, rows = [], hashable = false) {
  const calls = [], hashReads = [], env = Object.freeze({ SystemRoot: "C:\\Windows", ProgramFiles: "C:\\Program Files", PSModulePath: "C:\\foreign-pwsh7-modules", psmodulepath: "C:\\other-foreign-modules", PSExecutionPolicyPreference: "AllSigned", retained: "unchanged" });
  const sandbox = { module: { exports: {} }, process: { platform: "win32", env }, require: name => {
    if (name === "node:child_process") return { execFile: (executable, args, options, callback) => { calls.push({ executable, args, options }); callback(error, JSON.stringify(rows)); }, spawn: () => { throw Error("unexpected process launch"); } };
    if (name === "node:path") return path.win32;
    if (name === "node:fs") return { ...fs, realpathSync: value => value, createReadStream: value => { hashReads.push(value); if (!hashable) throw Error("unexpected executable hash"); return require("node:stream").Readable.from(["fixed mock Adobe executable bytes"]); } };
    return require(name);
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../mcp-server/ame-running.js"), "utf8"), sandbox);
  return { running: sandbox.module.exports, calls, hashReads, env };
}
function installedMetadata(overrides = {}) { return { path: installation.path, roots: ["C:\\Program Files"], fileVersion: "26.2.0.52", productVersion: "26.2.0", productName: "Adobe Media Encoder 2026", companyName: "Adobe", signatureStatus: "Valid", signerSubject: "CN=Adobe Inc., O=Adobe Inc.", ...overrides }; }
(async () => {
  await check("closed input + tool mutation hints", () => { for (const a of [{ executable: "x" }, { script: "x" }, { args: [] }, { installationId: "first" }, { timeoutMs: 0 }, { reconcileAttemptId: "current" }]) assert.throws(() => running.validateInput(a)); assert.equal(running.tool.annotations.readOnlyHint, false); });
  await check("fixed Windows queries isolate native modules and preserve parent policy", async () => {
    const f = windowsQueryVm(); await f.running.discoverInstalled(); await f.running.inspectProcesses(); assert.equal(f.calls.length, 2);
    for (const { executable, args, options } of f.calls) {
      assert.equal(executable, "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"); assert.equal(JSON.stringify(args.slice(0, 3)), JSON.stringify(["-NoProfile", "-NonInteractive", "-Command"]));
      assert(args[3].startsWith("$ErrorActionPreference='Stop'; [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding -ArgumentList $false; $env:PSModulePath=Join-Path $PSHOME 'Modules'; Import-Module -Name (Join-Path $PSHOME 'Modules\\Microsoft.PowerShell.Security\\Microsoft.PowerShell.Security.psd1') -ErrorAction Stop; "));
      assert.equal(Object.keys(options.env).some(key => key.toLowerCase() === "psmodulepath"), false);
      assert.equal(options.env.PSExecutionPolicyPreference, "AllSigned"); assert.equal(options.env.retained, "unchanged"); assert.notEqual(options.env, f.env);
      assert.equal(options.windowsHide, true); assert.equal(options.timeout, 10000); assert(!/ExecutionPolicy|Bypass|Unrestricted|RunAs/i.test(args.join(" ")));
    }
    assert(f.calls[0].args[3].includes("Get-AuthenticodeSignature -LiteralPath $candidate")); assert(f.calls[1].args[3].includes("Get-CimInstance Win32_Process"));
    assert.equal(f.env.PSModulePath, "C:\\foreign-pwsh7-modules"); assert.equal(f.env.psmodulepath, "C:\\other-foreign-modules"); assert.equal(f.running.queryWindows, undefined);
  });
  await check("native import/policy errors fail closed and Adobe signature still required", async () => {
    const denial = new Error("AuthorizationManager native module denial"), failed = windowsQueryVm(denial);
    await assert.rejects(failed.running.discoverInstalled(), error => error === denial); await assert.rejects(failed.running.inspectProcesses(), error => error === denial); assert.equal(failed.calls.length, 2);
    const unsigned = windowsQueryVm(null, [installedMetadata({ signatureStatus: "NotTrusted" })], true);
    assert.equal((await unsigned.running.discoverInstalled()).length, 0); assert.equal(unsigned.calls.length, 1);
  });
  await check("base and genuine year product name require exact canonical Adobe directory", async () => {
    for (const productName of ["Adobe Media Encoder", "Adobe Media Encoder 2026"]) {
      const f = windowsQueryVm(null, [installedMetadata({ productName })], true), found = await f.running.discoverInstalled();
      assert.equal(found.length, 1); assert.equal(found[0].signatureStatus, "Valid"); assert.equal(found[0].targetSpecifier, "ame-26.0"); assert.equal(found.diagnostics.length, 0); assert.equal(f.hashReads.length, 1);
    }
  });
  await check("signature failures are installed unverified diagnostics and never attach or launch", async () => {
    for (const signatureStatus of ["HashMismatch", "UnknownError"]) {
      const f = windowsQueryVm(null, [installedMetadata({ signatureStatus, signatureMessage: "signature validation failed", ...(signatureStatus === "UnknownError" ? { signerSubject: "" } : {}) })], true), found = await f.running.discoverInstalled();
      assert.equal(found.length, 0); assert.equal(found.diagnostics.length, 1); const diagnostic = found.diagnostics[0];
      assert.equal(diagnostic.status, "installed_unverified"); assert.equal(diagnostic.reason, "signature_not_valid"); assert.equal(diagnostic.launchable, false); assert.equal(diagnostic.signatureStatus, signatureStatus);
      assert.equal(diagnostic.path, installation.path); assert.equal(diagnostic.fileVersion, "26.2.0.52"); assert.equal(diagnostic.productVersion, "26.2.0"); assert.equal(diagnostic.signatureMessage, "signature validation failed");
      assert(/^[a-f0-9]{64}$/.test(diagnostic.sha256)); assert(/^[a-f0-9]{64}$/.test(diagnostic.installationId));
      assert.throws(() => f.running.pickInstallation(found), /installation_unverified/); assert.throws(() => f.running.pickInstallation(found, diagnostic.installationId), /installation_unverified/);
      for (const exists of [false, true]) {
        const g = fixture("rejected-" + signatureStatus + "-" + exists, { exists, installations: found }), result = await g.execute({ installationId: diagnostic.installationId });
        assert.equal(result.code, "ame_running_installation_unverified"); assert.equal(result.ready, false); assert.equal(result.installationDiagnostics[0].signatureStatus, signatureStatus);
        assert.equal(g.counts().launches, 0); assert.equal(g.counts().reads, 0); assert.equal(g.counts().processReads, 0);
      }
    }
    assert.throws(() => running.pickInstallation([]), /installation_missing/);
  });
  await check("foreign/nested paths and mismatched product/company/signer/version metadata reject", async () => {
    for (const overrides of [{ path: "C:\\Other\\Adobe Media Encoder 2026\\Adobe Media Encoder.exe" }, { path: "C:\\Program Files\\Adobe\\Adobe Media Encoder 2026\\nested\\Adobe Media Encoder.exe" },
      { path: "C:\\Program Files\\Adobe\\Adobe Media Encoder 2026 extra\\Adobe Media Encoder.exe" }, { productName: "Adobe Media Encoder 2025" }, { productName: "Other Encoder" }, { companyName: "Other" }, { signerSubject: "O=Other" }, { fileVersion: "unknown" }]) {
      const f = windowsQueryVm(null, [installedMetadata(overrides)]), found = await f.running.discoverInstalled(); assert.equal(found.length, 0); assert.equal(found.diagnostics.length, 0); assert.equal(f.hashReads.length, 0);
    }
  });
  await check("brand rejects direct/admin/clone/reuse/tamper and stale dryrun", async () => {
    const f = fixture("authority", { exists: true }); await assert.rejects(f.executor.execute({}, {}), /authorization_required/);
    for (const change of [{ source: "dev-admin-http" }, { source: "direct-tools-call" }, { record: { ...record } }, { confirm: false }, { checkpoint: null }, { stepCount: 2 }, { runId: "22222222-2222-4222-8222-222222222222" }]) assert.throws(() => f.executor.authorize({ ...context(), ...change }));
    const old = record.dryRunReceipt; record.dryRunReceipt = { ...old, payloadHash: "changed" }; assert.throws(() => f.executor.authorize(context())); record.dryRunReceipt = old;
    const cap = f.executor.authorize(context()); await assert.rejects(f.executor.execute({ expectedSessionNonce: "tampered" }, cap), /args_changed/);
    const reused = f.executor.authorize(context()); await f.executor.execute({}, reused); await assert.rejects(f.executor.execute({}, reused), /authorization_required/); assert.equal(f.counts().launches, 0);
  });
  await check("fixed startup ES3 + only own nonce/file, no queue or quit", () => {
    const file = path.join(root, "русский quoted path", "startup-result.json"), source = running.startupScript("ame-boot-test", file);
    acorn.parse(source, { ecmaVersion: 3, allowReserved: "never" }); const boot = bootVm(source);
    assert.equal(boot.global.aeAgentAMEProbeSessionNonce, "ame-boot-test"); assert.equal(boot.writes.length, 1); assert.equal(boot.writes[0].file, file);
    assert.equal(JSON.parse(boot.writes[0].body).sessionNonce, "ame-boot-test");
  });
  await check("existing AME attaches without launch", async () => { const f = fixture("existing", { exists: true }), result = await f.execute({ expectedSessionNonce: "existing-session" }); assert.equal(result.ready, true); assert.equal(result.adapterReady, false); assert.equal(result.projectContentMutation, false); assert.equal(f.counts().launches, 0); });
  await check("absent launches once after durable reservation; independent process/session", async () => { const f = fixture("absent"), result = await f.execute(); assert.equal(result.ok, true); assert.equal(f.counts().launches, 1); assert(result.sessionNonce.startsWith("ame-boot-")); assert.equal(fs.readdirSync(f.stateDir).filter(name => name.endsWith(".launch-lock")).length, 0); });
  await check("ambiguous installs/processes never launch", async () => {
    const f = fixture("install-ambiguous", { installations: [installation, { ...installation, installationId: "c".repeat(64) }] }); assert.equal((await f.execute()).code, "ame_running_installation_ambiguous"); assert.equal(f.counts().launches, 0);
    const g = fixture("process-ambiguous", { processOverride: () => [{ pid: 1, path: installation.path, startedAt: new Date().toISOString() }, { pid: 2, path: installation.path, startedAt: new Date().toISOString() }] }); assert.equal((await g.execute()).code, "ame_running_multiple_processes"); assert.equal(g.counts().launches, 0);
  });
  await check("prelaunch race and process change fail closed", async () => {
    const f = fixture("race", { processOverride: n => n === 1 ? [] : [{ pid: 1, path: installation.path, startedAt: new Date().toISOString() }] }); assert.equal((await f.execute()).code, "ame_running_prelaunch_race"); assert.equal(f.counts().launches, 0);
    const g = fixture("changed", { exists: true, processOverride: (n, active) => n === 1 ? active : [{ ...active[0], pid: 78 }] }); assert.equal((await g.execute()).code, "ame_running_process_changed");
  });
  await check("unknown durable launch blocks retry; exact reconciliation has no new launch", async () => {
    const f = fixture("unknown", { launchThrows: true }), first = await f.execute(); assert.equal(first.code, "ame_running_launch_unknown");
    assert.equal((await f.execute()).code, "ame_running_unknown_attempt_blocks_launch"); assert.equal(f.counts().launches, 1);
    assert.equal((await f.execute({ reconcileAttemptId: first.attemptId })).ready, true); assert.equal(f.counts().launches, 1);
  });
  await check("transport unknown / changed original process never releases or restarts", async () => {
    const f = fixture("transport-unknown", { transportUnknown: true }), first = await f.execute(); assert.equal(first.ready, false);
    const p = { pid: 78, path: installation.path, startedAt: new Date().toISOString() }; f.setProcess([p]);
    assert.equal((await f.execute({ reconcileAttemptId: first.attemptId })).code, "ame_running_original_process_unverified"); assert.equal(f.counts().launches, 1);
  });
  await check("unknown transport reconciles retained nonce without replay or relaunch", async () => {
    const f = fixture("late-transport", { unknownOnce: true }), first = await f.execute(); assert.equal(first.ready, false);
    const second = await f.execute({ reconcileAttemptId: first.attemptId }); assert.equal(second.ready, true); assert.equal(f.counts().launches, 1);
    assert.equal(f.sentArgs[1].reconcileRequestNonce, runId);
  });
  await check("corrupt durable reservation blocks launch", async () => {
    const f = fixture("corrupt", { launchThrows: true }); await f.execute(); const file = fs.readdirSync(f.stateDir).find(name => name.endsWith(".json")); fs.writeFileSync(path.join(f.stateDir, file), "{}");
    assert.equal((await f.execute()).code, "ame_running_attempt_corrupt"); assert.equal(f.counts().launches, 1);
  });
  await check("fresh independent readback, forged/self/changed read fails", async () => {
    const f = fixture("readback", { exists: true }), result = await f.execute(), read = { schema: "ae-agent-ame-transport.v1", deliveryVerified: true, targetSpecifier: "ame-26.0", requestNonce: "fresh", warmSessionVerified: true, ame: { sessionNonce: result.sessionNonce } };
    assert.equal(running.verifyReadBack(result, read, [result.process], [result.process]), true);
    assert.equal(running.verifyReadBack(result, { ...read, requestNonce: result.transport.requestNonce }, [result.process], [result.process]), false);
    assert.equal(running.verifyReadBack(result, read, [result.process], [{ ...result.process, pid: 78 }]), false);
  });
  await check("semantic requires trusted server attached exact independent read", async () => {
    const f = fixture("semantic", { exists: true }), result = await f.execute(), args = running.inspectionArgs(result);
    const read = { schema: "ae-agent-ame-transport.v1", deliveryVerified: true, targetSpecifier: "ame-26.0", requestNonce: "independent", warmSessionVerified: true, ame: { sessionNonce: result.sessionNonce } };
    result.verification = { ok: true, scope: "ame_process_and_read_transport_only", before: [result.process], after: [result.process] };
    const step = { index: 1, tool: running.TOOL_NAME, args: {}, status: "completed", mutatesProject: true, result,
      independentReadBack: [{ tool: "inspect_ame_transport", args, status: "completed", result: read, source: "server_typed_readback", observedAt: new Date().toISOString() }] };
    const run = { id: runId, ok: true, dryRun: false, provenance: { actionId: "action" }, steps: [step] }, plan = { steps: [{ tool: running.TOOL_NAME, args: {} }] };
    const verified = semantic.buildSemanticVerification(plan, run); assert.equal(verified.status, "passed", JSON.stringify(verified));
    for (const altered of [{ ...step, independentReadBack: [] }, { ...step, independentReadBack: [{ ...step.independentReadBack[0], source: "caller" }] },
      { ...step, result: { ...result, authorization: { ...result.authorization, runId: "forged" } } }]) assert.notEqual(semantic.buildSemanticVerification(plan, { ...run, steps: [altered] }).status, "passed");
  });
  await check("bridge exact mutation registration, branded gate and no cached ready replay", () => {
    const source = fs.readFileSync(path.join(__dirname, "../mcp-server/bridge-daemon.js"), "utf8");
    assert(/const MUTATING_TOOL_NAMES = new Set\(\[\s*ameRunning\.TOOL_NAME,/.test(source));
    assert(source.includes("ameRunningExecutor.assertAuthorization(executionContext && executionContext.ameRunningAuthorization, args || {})"));
    assert(source.includes('source: "ai-plan-run", record: options._m100ActionRecord, runId: run.id, args: bound.args'));
    assert(source.includes('ameRunningAuthorization ? {ameRunningAuthorization} : undefined'));
    assert(source.includes('name === ameRunning.TOOL_NAME || name === projectSave.TOOL_NAME || lifecycleMutation ? null : idempotencyContext'));
    assert(source.includes('copySavedProjectFile(checkpointLabel, "checkpoint")'));
    const modules = require("../mcp-server/review-evidence").runtimeNamedHashSet(path.resolve(__dirname, "..")); assert.equal(modules.filter(row => row.name === "mcp-server/ame-running.js").length, 1);
  });
  console.log("AME running offline smoke PASS: " + groups + " groups; no applications launched, no live tools.");
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { assert(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep)); fs.rmSync(root, { recursive: true, force: true }); });
