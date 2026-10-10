"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const grant = require("./ame-native-fixture-grant");
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const INSPECT = "inspect_ame_native_fixture_result";
function fail(code) { throw Object.assign(new Error(code), { code }); }
function writeOnce(file, bytes) {
  const fd = fs.openSync(file, "wx");
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
function safeDirectory(directory) {
  for (let p = path.resolve(directory); ; p = path.dirname(p)) {
    const s = fs.lstatSync(p);
    if (!s.isDirectory() || s.isSymbolicLink() || fs.realpathSync(p).toLowerCase() !== p.toLowerCase()) fail("fixture_runner_parent_identity");
    if (path.dirname(p) === p) break;
  }
}
function readRegular(file) {
  const before = fs.lstatSync(file);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || fs.realpathSync(file).toLowerCase() !== path.resolve(file).toLowerCase()) fail("fixture_runner_file_identity");
  const bytes = fs.readFileSync(file), after = fs.lstatSync(file);
  if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || bytes.length !== after.size) fail("fixture_runner_file_changed");
  return bytes;
}
function queryWindows(script, env = process.env) {
  const executable = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  return new Promise((resolve, reject) => execFile(executable, ["-NoProfile", "-NonInteractive", "-Command", script],
    { windowsHide: true, env, timeout: 15000, maxBuffer: 16384, encoding: "utf8" }, (error, out) => {
      if (error) return reject(Object.assign(new Error("fixture_native_process_query_failed"), { code: "fixture_native_process_query_failed" }));
      try { resolve(JSON.parse(out.replace(/^\uFEFF/, "").trim())); } catch (_) { reject(new Error("fixture_native_process_query_invalid")); }
    }));
}
async function inspectProcess(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) fail("fixture_runner_pid_invalid");
  return queryWindows(`$ErrorActionPreference='Stop'; $p=Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}'; if(!$p){'null';exit}; $b=[DateTimeOffset]$p.CreationDate.ToUniversalTime(); @{pid=[int]$p.ProcessId;path=[string]$p.ExecutablePath;createdUnixMs=$b.ToUnixTimeMilliseconds()} | ConvertTo-Json -Compress`);
}
async function launchChild(descriptor, environment) {
  // A new AE instance, hidden at launch. No -r, arbitrary JSX, GUI actions or
  // Render Queue operation. Only the startup-loaded fixed native fixture runs.
  const env = { ...process.env, ...environment, AE_AGENT_NATIVE_FIXTURE_EXECUTABLE: descriptor.executablePath };
  for (const name of Object.keys(env)) if (/^AE_BRIDGE_.*TOKEN$|^AE_BRIDGE_DEV_ADMIN$|^AE_M100_ALLOW_DIRECT_TOOL_EXECUTION$/i.test(name)) delete env[name];
  return queryWindows("$ErrorActionPreference='Stop'; $p=Start-Process -FilePath $env:AE_AGENT_NATIVE_FIXTURE_EXECUTABLE -ArgumentList '-m' -WindowStyle Hidden -PassThru; @{pid=[int]$p.Id} | ConvertTo-Json -Compress", env);
}

function buildArtifacts(repoRoot) {
  if (process.platform !== "win32") fail("fixture_runner_windows_only");
  const builds = path.join(repoRoot, ".codex-runtime", "ame-native-prerequisites", "native-probe-build");
  safeDirectory(builds);
  const candidates = [];
  for (const name of fs.readdirSync(builds)) {
    if (!/^build-[a-f0-9]{32}$/.test(name)) continue;
    const file = path.join(builds, name, "build-receipt.json");
    if (!fs.existsSync(file)) continue;
    try {
      const r = JSON.parse(readRegular(file));
      if (r.schema !== "ae-agent.native-probe-build.v2" || r.signedFixturePathCompiled !== true || r.sourceHashesStableAcrossBuild !== true ||
          r.protocolSmokeExitCode !== 0 || !Array.isArray(r.sourceFiles) || !r.sourceFiles.length || r.protocolSmoke?.legacyProtocolChecks !== 215 || r.protocolSmoke?.signedFixtureChecks < 50 ||
          r.fixtureGrantSmoke?.status !== "passed" || r.fixtureGrantSmoke?.passed < 63) continue;
      if (r.sourceFiles.some(s => {
        const source = path.resolve(repoRoot, s.path);
        return !source.toLowerCase().startsWith(repoRoot.toLowerCase() + path.sep) || sha(readRegular(source)) !== s.sha256;
      })) continue;
      const binary = path.join(builds, name, "bin", "AEAgentSnapshotProbe.aex");
      if (path.resolve(r.binaryPath) !== binary || sha(readRegular(binary)) !== r.binarySha256) continue;
      candidates.push({ receipt: r, receiptPath: file, binary });
    } catch (_) { /* A partial, stale or altered build is not a launch candidate. */ }
  }
  candidates.sort((a, b) => Date.parse(b.receipt.timestampUtc) - Date.parse(a.receipt.timestampUtc));
  if (!candidates.length) fail("fixture_runner_current_signed_build_required");
  const selected = candidates[0];
  const support = "C:\\Program Files\\Adobe\\Adobe After Effects 2026\\Support Files";
  const executablePath = path.join(support, "AfterFX.exe"), pluginDirectory = path.join(support, "Plug-ins");
  safeDirectory(pluginDirectory);
  for (const name of ["index.html", "panel.js", "native-probe-startup-guard.js"]) {
    const source = path.join(repoRoot, "cep-panel", name);
    const installed = path.join(process.env.APPDATA || "", "Adobe", "CEP", "extensions", "com.codex.aemcpbridge", name);
    if (sha(readRegular(source)) !== sha(readRegular(installed))) fail("fixture_runner_installed_cep_guard_required");
  }
  return { ...selected, executablePath, executableSha256: sha(readRegular(executablePath)),
    pluginPath: path.join(pluginDirectory, "AEAgentSnapshotProbe.aex"), pluginSha256: selected.receipt.binarySha256 };
}

function createExecutor(deps) {
  const root = path.resolve(deps.repoRoot), ownedParent = path.join(root, ".codex-runtime", "ame-native-fixtures");
  const descriptors = new Map(), launches = new Map(), capabilities = new WeakMap();
  const verifiedResults = new Map();
  let executing = false;
  const readProcess = deps.inspectProcess || inspectProcess;
  const issuer = grant.createFixtureGrantIssuer({ ...deps, ownedParent,
    getOwnedChild: id => descriptors.get(id),
    inspectProcess: async (descriptor, binding) => {
      const known = launches.get(descriptor);
      if (!known || known.pid !== binding.pid) return false;
      const observed = await readProcess(binding.pid);
      return Boolean(observed && observed.pid === binding.pid && observed.createdUnixMs === binding.processCreatedUnixMs &&
        observed.path.toLowerCase() === descriptor.executablePath.toLowerCase());
    },
    consumeAttempt: async attempt => {
      const descriptor = Array.from(descriptors.values()).find(value => value.stageId === attempt.stageId && value.nonce === attempt.nonce);
      if (!descriptor) fail("fixture_runner_attempt_owner_missing");
      writeOnce(path.join(descriptor.rootPath, `server-consumed-${attempt.operation}.json`), JSON.stringify(attempt) + "\n"); return true;
    }
  });
  async function authorize(context) {
    const capability = Object.freeze({});
    capabilities.set(capability, { context, issuerCapability: await issuer.authorize(context) }); return capability;
  }
  function assertAuthorization(capability, args) {
    const entry = capabilities.get(capability);
    if (!entry || JSON.stringify(grant.validateInput(args)) !== JSON.stringify(grant.validateInput(entry.context.args))) fail("fixture_runner_authorization_required");
    deps.assertManualIngress(entry.context); return entry;
  }
  async function execute(args, capability) {
    const entry = assertAuthorization(capability, args);
    if (executing) fail("fixture_runner_busy");
    executing = true; capabilities.delete(capability);
    const children = [];
    try {
      const artifacts = (deps.getArtifacts || buildArtifacts)(root);
      if (!fs.existsSync(ownedParent)) fs.mkdirSync(ownedParent);
      safeDirectory(ownedParent);
      // The image is inert in ordinary AE. Install only this exact owned build;
      // never overwrite an existing different file or use an official installer.
      if (!fs.existsSync(artifacts.pluginPath)) writeOnce(artifacts.pluginPath, readRegular(artifacts.binary));
      if (sha(readRegular(artifacts.pluginPath)) !== artifacts.pluginSha256) fail("fixture_runner_plugin_installation_changed");
      let captureReceipt;
      for (const role of ["capture", "stage"]) {
        deps.assertManualIngress(entry.context);
        const nonce = crypto.randomBytes(16).toString("hex"), stageId = crypto.randomBytes(16).toString("hex");
        const descriptor = Object.freeze({ nonce, stageId, role, rootPath: path.join(ownedParent, `probe-${nonce}`),
          pluginPath: artifacts.pluginPath, pluginSha256: artifacts.pluginSha256,
          executablePath: artifacts.executablePath, executableSha256: artifacts.executableSha256 });
        fs.mkdirSync(descriptor.rootPath); safeDirectory(descriptor.rootPath);
        writeOnce(path.join(descriptor.rootPath, "server-owner.json"), JSON.stringify({ schema: "ae-agent.native-fixture-owner.v2",
          rootPath: descriptor.rootPath, nonce, stageId, role }) + "\n");
        if (role === "stage") {
          const baseline = readRegular(captureReceipt.baselinePath);
          if (sha(baseline) !== captureReceipt.baselineSha256) fail("fixture_runner_baseline_changed");
          writeOnce(path.join(descriptor.rootPath, "baseline.aep"), baseline);
        }
        descriptors.set(stageId, descriptor);
        const prepared = await issuer.prepareChild(entry.issuerCapability, stageId);
        writeOnce(path.join(descriptor.rootPath, "launch.manifest"), prepared.manifestBytes);
        writeOnce(path.join(descriptor.rootPath, "server-launch-attempt.json"), JSON.stringify({ role, stageId, nonce, runId: entry.context.runId,
          pluginSha256: descriptor.pluginSha256, executableSha256: descriptor.executableSha256, reservedAt: new Date().toISOString(), replayAllowed: false }) + "\n");
        const launched = await (deps.launchChild || launchChild)(descriptor, prepared.environment);
        if (!launched || !Number.isSafeInteger(launched.pid) || launched.pid < 1) { issuer.markUnknown(prepared.child); fail("fixture_runner_launch_unknown"); }
        launches.set(descriptor, { pid: launched.pid });
        const owned = { descriptor, child: prepared.child, pid: launched.pid, terminal: false }; children.push(owned);
        const waitReceipt = async filename => {
          const deadline = Date.now() + 90000;
          while (Date.now() < deadline) {
            deps.assertManualIngress(entry.context);
            const file = path.join(descriptor.rootPath, filename);
            if (fs.existsSync(file)) return issuer.acceptReceipt(prepared.child, readRegular(file).toString("utf8"));
            const refusal = path.join(descriptor.rootPath, "signed-refusal.json");
            if (fs.existsSync(refusal)) return issuer.acceptReceipt(prepared.child, readRegular(refusal).toString("utf8"));
            await new Promise(resolve => setTimeout(resolve, 200));
          }
          issuer.markUnknown(prepared.child); fail("fixture_runner_receipt_unknown_no_replay");
        };
        await waitReceipt("signed-boot.json");
        const phases = role === "capture" ? [["create-fixture", "signed-fixture.json"], ["snapshot", "signed-snapshot.json"]] : [["stage-variants", "signed-variants.json"]];
        let verified;
        for (const [operation, receiptName] of phases) {
          const phase = await issuer.issuePhase(prepared.child, operation);
          writeOnce(path.join(descriptor.rootPath, phase.filename), phase.bytes);
          verified = await waitReceipt(receiptName);
        }
        owned.terminal = true;
        if (role === "capture") captureReceipt = verified.receipt;
        else {
          for (const output of verified.receipt.outputs) if (sha(readRegular(output.path)) !== output.sha256) fail("fixture_runner_variant_file_changed");
          const result = { ok: true, schema: grant.SCHEMA, fixtureKind: args.fixtureKind, productionBackend: false,
            currentUserProjectMutation: false, mainProjectCheckpointScope: "on_disk_saved_file_only",
            nativeFixtureSnapshot: captureReceipt, nativeFixtureVariants: verified.receipt,
            outputFiles: verified.receipt.outputs, nativeSubmissionAttempted: false,
            childProcesses: children.map(value => ({ pid: value.pid, rootPath: value.descriptor.rootPath, terminalReceiptVerified: value.terminal })),
            automaticRetryAllowed: false, buildId: artifacts.receipt.buildId, evidenceId: crypto.randomUUID(),
            authorization: { runId: entry.context.runId, proposalId: entry.context.record.actionId } };
          verifiedResults.set(result.evidenceId, { hash: sha(JSON.stringify(result)), payload: JSON.parse(JSON.stringify(result)) });
          return result;
        }
      }
      fail("fixture_runner_incomplete");
    } finally {
      // Keep processes and roots intact for reconciliation. No general process
      // termination, recursive cleanup, project save/reopen or unknown retry.
      executing = false;
    }
  }
  function verifyResult(payload) {
    if (!payload || verifiedResults.get(payload.evidenceId)?.hash !== sha(JSON.stringify(payload))) fail("fixture_runner_unverified_result");
    if (sha(readRegular(payload.nativeFixtureSnapshot.baselinePath)) !== payload.nativeFixtureSnapshot.baselineSha256 ||
        payload.outputFiles.some(output => sha(readRegular(output.path)) !== output.sha256)) fail("fixture_runner_verified_files_changed");
    return { ok: true, scope: "signed_owned_fixture_copy_and_reopened_variants", currentUserProjectMutation: false,
      productionBackend: false, sourcePathAndDirtyPreserved: true, outputsHashVerified: true,
      mediaProof: "not_inspected", ameSubmission: "not_attempted" };
  }
  async function inspectResult(args) {
    if (!args || Object.keys(args).length !== 1 || typeof args.evidenceId !== "string" ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(args.evidenceId)) fail("fixture_result_invalid_selector");
    const cached = verifiedResults.get(args.evidenceId);
    if (!cached) fail("fixture_runner_verified_result_unavailable");
    const payload = cached.payload, verification = verifyResult(payload), observed = [];
    for (const receipt of [payload.nativeFixtureSnapshot, payload.nativeFixtureVariants]) {
      const child = payload.childProcesses.find(value => value.pid === receipt.pid);
      const descriptor = Array.from(descriptors.values()).find(value => value.rootPath === child?.rootPath);
      const processInfo = await readProcess(receipt.pid);
      if (!descriptor || !processInfo || processInfo.pid !== receipt.pid || processInfo.createdUnixMs !== receipt.processCreatedUnixMs ||
          processInfo.path.toLowerCase() !== descriptor.executablePath.toLowerCase() ||
          sha(readRegular(descriptor.pluginPath)) !== descriptor.pluginSha256 ||
          sha(readRegular(descriptor.executablePath)) !== descriptor.executableSha256) fail("fixture_runner_evidence_process_changed");
      observed.push({ pid: processInfo.pid, createdUnixMs: processInfo.createdUnixMs, role: descriptor.role });
    }
    // The producer cache exists only in this daemon after signed receipt checks.
    // This separate read verifies current files/processes; it proves the owned
    // snapshot operation at its native receipts, not a current-user capture.
    verifyResult(payload);
    return { ok: true, schema: "ae-agent.native-fixture-readback.v1", evidenceId: payload.evidenceId,
      authorization: payload.authorization, buildId: payload.buildId, fixtureKind: payload.fixtureKind,
      verification, sourceBefore: payload.nativeFixtureSnapshot.sourceBefore, sourceAfter: payload.nativeFixtureSnapshot.sourceAfter,
      baselinePath: payload.nativeFixtureSnapshot.baselinePath, baselineSha256: payload.nativeFixtureSnapshot.baselineSha256,
      outputs: payload.outputFiles, childProcesses: observed, observedAt: new Date().toISOString(),
      producer: "private_signed_fixture_cache", productionBackend: false, currentUserProjectMutation: false,
      mediaProof: "not_inspected", ameSubmission: "not_attempted" };
  }
  return { authorize, assertAuthorization, execute, verifyResult, inspectResult };
}

const tool = { name: grant.TOOL_NAME, description: "Manual CEP-only native snapshot experiment on two server-owned empty AE children. Creates fixed test fixtures, captures current unsaved state, saves two independent variants and reopens them for read-back. Does not mutate the current user project, render, enqueue in AME, claim a production snapshot backend or replay unknown phases.",
  inputSchema: { type: "object", additionalProperties: false, required: ["fixtureKind"], properties: {
    fixtureKind: { type: "string", enum: ["saved-clean", "saved-dirty", "untitled-dirty"] }, restoreDirty: { type: "boolean", default: false }
  } }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } };
const inspectTool = { name: INSPECT, description: "Read independent evidence for one private signed native fixture result in the current daemon, rechecking saved file hashes, exact owned child birth and native images. No replay, render, AME enqueue or current-user snapshot claim.",
  inputSchema: { type: "object", additionalProperties: false, required: ["evidenceId"], properties: { evidenceId: { type: "string", format: "uuid" } } },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false } };
module.exports = { INSPECT, createExecutor, tool, inspectTool, buildArtifacts, writeOnce, readRegular };
