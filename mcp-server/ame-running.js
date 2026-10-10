"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFile, spawn } = require("node:child_process");
const TOOL_NAME = "ensure_ame_running";
const SCHEMA = "ae-agent-ame-running.v1";
const ATTEMPT_SCHEMA = "ae-agent-ame-launch-attempt.v1";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const SHA = /^[a-f0-9]{64}$/;
const MUTATION_META = ["verifyAfter", "idempotencyKey", "idempotencyScope", "checkpointLabel", "autoCheckpoint"];
function fail(code) { const error = new Error(code); error.code = code; throw error; }
function hash(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
const normalized = value => String(value || "").replace(/\\/g, "/").toLowerCase();
function validateInput(raw = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).some(key => !["installationId", "expectedSessionNonce", "timeoutMs", "reconcileAttemptId", ...MUTATION_META].includes(key))) fail("ame_running_invalid_input");
  if (raw.installationId !== undefined && !SHA.test(raw.installationId)) fail("ame_running_invalid_installation");
  if (raw.expectedSessionNonce !== undefined && (typeof raw.expectedSessionNonce !== "string" || !/^[A-Za-z0-9._-]{1,128}$/.test(raw.expectedSessionNonce))) fail("ame_running_invalid_session");
  if (raw.reconcileAttemptId !== undefined && !UUID.test(raw.reconcileAttemptId)) fail("ame_running_invalid_attempt");
  const timeoutMs = raw.timeoutMs === undefined ? 10000 : raw.timeoutMs;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) fail("ame_running_invalid_timeout");
  return { installationId: raw.installationId || null, expectedSessionNonce: raw.expectedSessionNonce || null, timeoutMs, reconcileAttemptId: raw.reconcileAttemptId || null };
}
function assertProposalContext(context, currentRecord, contractVersion) {
  const record = context && context.record, receipt = record && record.dryRunReceipt;
  if (!record || record !== currentRecord || !record.project || !record.project.expectedFile || context.source !== "ai-plan-run" || record.executionState !== "executing" || record.executionId !== context.runId || record.riskLevel !== "mutating" || context.confirm !== true || context.allowWithoutCheckpoint !== false || context.stepCount !== 1 || !UUID.test(context.runId) ||
    !Number.isFinite(Date.parse(record.dryRunCompletedAt)) || !receipt || receipt.payloadHash !== record.payloadHash || receipt.contractVersion !== contractVersion || receipt.stepCount !== 1 || receipt.projectFile !== record.project.expectedFile ||
    !context.checkpoint || normalized(context.checkpoint.sourceFile) !== normalized(record.project.expectedFile) || !context.checkpoint.checkpointFile ||
    !(context.autonomous === true || record.confirmedBySurface === "cep-panel") || !Number.isFinite(Date.parse(record.proposalExpiresAt)) || Date.parse(record.proposalExpiresAt) <= Date.now()) fail("ame_running_proposal_authorization_required");
}

// Fixed, local Windows metadata queries. No caller command, executable or path.
// A pwsh 7 host may pass its incompatible modules into Windows PowerShell 5.1.
// Restrict this child to its own modules without changing execution policy.
const NATIVE_MODULES_SCRIPT = `$ErrorActionPreference='Stop'; [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding -ArgumentList $false; $env:PSModulePath=Join-Path $PSHOME 'Modules'; Import-Module -Name (Join-Path $PSHOME 'Modules\\Microsoft.PowerShell.Security\\Microsoft.PowerShell.Security.psd1') -ErrorAction Stop; `;
const DISCOVERY_SCRIPT = `$ErrorActionPreference='Stop'; $paths=@(); $roots=@($env:ProgramFiles,\${env:ProgramFiles(x86)}) | Where-Object { $_ }; foreach($root in $roots) { $adobe=Join-Path $root 'Adobe'; if(Test-Path -LiteralPath $adobe) { $dirs=@(Get-ChildItem -LiteralPath $adobe -Directory | Where-Object { $_.Name -match '^Adobe Media Encoder [0-9]{4}$' } | Select-Object -First 32); foreach($dir in $dirs) { $paths+=Join-Path $dir.FullName 'Adobe Media Encoder.exe' } } }; foreach($key in @('Registry::HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Adobe Media Encoder.exe','Registry::HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Adobe Media Encoder.exe')) { if(Test-Path -LiteralPath $key) { $paths+=(Get-Item -LiteralPath $key).GetValue('') } }; $out=@(); foreach($candidate in @($paths | Where-Object { $_ } | Select-Object -Unique)) { if(Test-Path -LiteralPath $candidate -PathType Leaf) { $file=Get-Item -LiteralPath $candidate; $sig=Get-AuthenticodeSignature -LiteralPath $candidate; $out+=@{path=$file.FullName;fileVersion=$file.VersionInfo.FileVersion;productVersion=$file.VersionInfo.ProductVersion;productName=$file.VersionInfo.ProductName;companyName=$file.VersionInfo.CompanyName;signatureStatus=[string]$sig.Status;signatureMessage=[string]$sig.StatusMessage;signerSubject=[string]$sig.SignerCertificate.Subject;roots=@($roots)} } }; ConvertTo-Json -InputObject @($out) -Depth 4 -Compress`;
const PROCESS_SCRIPT = `$ErrorActionPreference='Stop'; $out=@(); foreach($p in @(Get-CimInstance Win32_Process -Filter "Name = 'Adobe Media Encoder.exe'")) { $out+=@{pid=[int]$p.ProcessId;path=[string]$p.ExecutablePath;startedAt=$p.CreationDate.ToUniversalTime().ToString('o')} }; ConvertTo-Json -InputObject @($out) -Depth 3 -Compress`;
function queryWindows(script) {
  if (process.platform !== "win32") return Promise.reject(new Error("ame_running_windows_only"));
  const executable = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.toLowerCase() === "psmodulepath") delete env[key];
  return new Promise((resolve, reject) => execFile(executable, ["-NoProfile", "-NonInteractive", "-Command", NATIVE_MODULES_SCRIPT + script], { env, windowsHide: true, timeout: 10000, maxBuffer: 1024 * 1024, encoding: "utf8" }, (error, stdout) => {
    if (error) return reject(error);
    try { const parsed = JSON.parse(stdout.replace(/^\uFEFF/, "").trim()); if (!Array.isArray(parsed)) throw Error("invalid_metadata_array"); resolve(parsed); } catch (parseError) { reject(parseError); }
  }));
}
function hashFile(file) {
  return new Promise((resolve, reject) => { const digest = crypto.createHash("sha256"), stream = fs.createReadStream(file); stream.on("data", data => digest.update(data)); stream.on("error", reject); stream.on("end", () => resolve(digest.digest("hex"))); });
}
async function discoverInstalled() {
  const candidates = await queryWindows(DISCOVERY_SCRIPT), result = [], diagnostics = [];
  for (const candidate of candidates) {
    let real;
    try { real = fs.realpathSync(candidate.path); } catch (_) { continue; }
    const roots = Array.isArray(candidate.roots) ? candidate.roots : [];
    const directory = path.dirname(real), year = /^Adobe Media Encoder ([0-9]{4})$/i.exec(path.basename(directory));
    const trustedRoot = year && roots.some(root => { try { return normalized(path.dirname(directory)) === normalized(fs.realpathSync(path.join(root, "Adobe"))); } catch (_) { return false; } });
    const productMatches = candidate.productName === "Adobe Media Encoder" || year && candidate.productName === "Adobe Media Encoder " + year[1];
    if (!trustedRoot || path.basename(real).toLowerCase() !== "adobe media encoder.exe" || !productMatches || !/^Adobe(?: Inc\.| Systems Incorporated)?$/i.test(candidate.companyName || "")) continue;
    const adobeSigner = /O=Adobe (?:Inc\.|Systems Incorporated)/i.test(candidate.signerSubject || "");
    if (candidate.signatureStatus === "Valid" && !adobeSigner) continue;
    const version = /^(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?/.exec(candidate.fileVersion || "");
    if (!version) continue;
    const sha256 = await hashFile(real), installationId = hash(normalized(real) + "\n" + sha256);
    if (candidate.signatureStatus !== "Valid") {
      diagnostics.push({ status: "installed_unverified", reason: "signature_not_valid", launchable: false, installationId, path: real, fileVersion: candidate.fileVersion,
        productVersion: candidate.productVersion || null, productName: candidate.productName, companyName: candidate.companyName, sha256, targetSpecifier: "ame-" + version[1] + ".0",
        signatureStatus: candidate.signatureStatus || "Unknown", signatureMessage: candidate.signatureMessage || null, signerSubject: candidate.signerSubject || null });
      continue;
    }
    result.push({ installationId, path: real, fileVersion: candidate.fileVersion, productVersion: candidate.productVersion, sha256,
      targetSpecifier: "ame-" + version[1] + ".0", signatureStatus: "Valid", signerSubject: candidate.signerSubject });
  }
  const trusted = result.filter((item, i) => result.findIndex(other => normalized(other.path) === normalized(item.path)) === i);
  // Preserve the trusted array contract; diagnostics never enter launch selection.
  Object.defineProperty(trusted, "diagnostics", { value: diagnostics.filter((item, i) => diagnostics.findIndex(other => normalized(other.path) === normalized(item.path)) === i) });
  return trusted;
}
async function inspectProcesses() {
  const values = await queryWindows(PROCESS_SCRIPT);
  return values.map(value => ({ pid: value.pid, path: value.path, startedAt: new Date(value.startedAt).toISOString() }));
}
function processValid(processInfo) { return processInfo && Number.isSafeInteger(processInfo.pid) && processInfo.pid > 0 && typeof processInfo.path === "string" && Number.isFinite(Date.parse(processInfo.startedAt)); }
function sameProcess(a, b) { return processValid(a) && processValid(b) && a.pid === b.pid && a.startedAt === b.startedAt && normalized(a.path) === normalized(b.path); }
function pickInstallation(candidates, id) {
  if (!Array.isArray(candidates) || candidates.some(value => !value || !SHA.test(value.installationId) || !SHA.test(value.sha256) || !/^ame-\d+\.0$/.test(value.targetSpecifier))) fail("ame_running_invalid_discovery");
  const chosen = id ? candidates.filter(value => value.installationId === id) : candidates;
  if (!chosen.length) {
    const unverified = Array.isArray(candidates.diagnostics) && candidates.diagnostics.some(item => item && item.launchable === false && item.reason === "signature_not_valid" && (!id || item.installationId === id));
    fail(unverified ? "ame_running_installation_unverified" : "ame_running_installation_missing");
  }
  if (chosen.length !== 1) fail("ame_running_installation_ambiguous");
  return chosen[0];
}
function atomicWrite(file, value, exclusive = false) {
  const target = exclusive ? file : file + ".tmp-" + crypto.randomUUID(), fd = fs.openSync(target, "wx");
  try { fs.writeFileSync(fd, JSON.stringify(value) + "\n", "utf8"); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  if (!exclusive) fs.renameSync(target, file);
}
function startupScript(sessionNonce, resultFile) {
  const literal = value => JSON.stringify(value).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  return `(function () {\n  var nonce = ${literal(sessionNonce)};\n  $.global.aeAgentAMEProbeSessionNonce = nonce;\n  var result = {schema:"ae-agent-ame-startup.v1",sessionNonce:nonce,observedAt:new Date().getTime(),appSpecifier:String(BridgeTalk.appSpecifier),buildNumber:String(app.buildNumber)};\n  function quote(s) { return '"' + String(s).replace(/\\\\/g,"\\\\\\\\").replace(/"/g,'\\\\"').replace(/[\\x00-\\x1f]/g,function(c){var h=c.charCodeAt(0).toString(16);while(h.length<4)h="0"+h;return "\\\\u"+h;}) + '"'; }\n  var body = "{\\"schema\\":"+quote(result.schema)+",\\"sessionNonce\\":"+quote(result.sessionNonce)+",\\"observedAt\\":"+result.observedAt+",\\"appSpecifier\\":"+quote(result.appSpecifier)+",\\"buildNumber\\":"+quote(result.buildNumber)+"}";\n  var destination = new File(${literal(resultFile)});\n  if(destination.exists)throw new Error("ame_startup_result_exists");\n  destination.encoding="UTF-8";if(!destination.open("w"))throw new Error("ame_startup_result_open_failed");\n  try{destination.write(body);}finally{destination.close();}\n  return body;\n}());\n`;
}
function launchInstalled(installation, scriptFile) {
  return new Promise((resolve, reject) => {
    const child = spawn(installation.path, ["--console", "es.processFile", scriptFile], { windowsHide: true, stdio: "ignore", detached: true });
    child.once("error", reject); child.once("spawn", () => { child.unref(); resolve({ pid: child.pid }); });
  });
}
function createExecutor(deps) {
  if (!deps || !path.isAbsolute(deps.stateDir) || typeof deps.inspectTransport !== "function" || typeof deps.assertServerProposalContext !== "function") fail("ame_running_invalid_dependencies");
  const capabilities = new WeakMap(), discovery = deps.discoverInstalled || discoverInstalled, processes = deps.inspectProcesses || inspectProcesses;
  const launch = deps.launchInstalled || launchInstalled, delay = deps.delay || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const now = deps.now || Date.now;
  function authorize(context) {
    deps.assertServerProposalContext(context);
    const capability = Object.freeze(Object.create(null)); capabilities.set(capability, { active: true, context, argsHash: hash(JSON.stringify(validateInput(context.args || {}))) }); return capability;
  }
  function authority(capability) { const entry = capabilities.get(capability); if (!entry || !entry.active) fail("ame_running_proposal_authorization_required"); deps.assertServerProposalContext(entry.context); return entry; }
  function response(code, extra = {}) { return { schema: SCHEMA, ok: false, code, ready: false, transportVerified: false, nativeQueueOwnershipVerified: false, adapterReady: false,
    automaticRetryAllowed: false, externalApplicationMutation: true, projectContentMutation: false, checkpointScope: "on_disk_saved_file", observedAt: new Date(now()).toISOString(), ...extra }; }
  function recordFile(installation) { return path.join(deps.stateDir, hash(normalized(installation.path)) + ".json"); }
  function readRecord(file) {
    if (!fs.existsSync(file)) return null;
    let record; try { record = JSON.parse(fs.readFileSync(file, "utf8")); } catch (_) { fail("ame_running_attempt_corrupt"); }
    if (!record || record.schema !== ATTEMPT_SCHEMA || !UUID.test(record.attemptId) || !record.installation || !SHA.test(record.installation.installationId) || !["unknown_outcome", "transport_verified"].includes(record.state) || !Number.isFinite(Date.parse(record.reservedAt))) fail("ame_running_attempt_corrupt");
    return record;
  }
  function releaseLock(file, record) {
    const lockFile = file + ".launch-lock";
    if (!fs.existsSync(lockFile)) return;
    const lock = JSON.parse(fs.readFileSync(lockFile, "utf8"));
    if (lock.attemptId !== record.attemptId || record.state !== "transport_verified") fail("ame_running_lock_ownership_mismatch");
    fs.unlinkSync(lockFile);
  }
  async function verifiedAttachment(installation, original, sessionNonce, timeoutMs, record) {
    let transport; try { transport = await deps.inspectTransport({ targetSpecifier: installation.targetSpecifier, ...(sessionNonce ? { expectedSessionNonce: sessionNonce } : {}),
      ...(record && record.transportRequestNonce ? { reconcileRequestNonce: record.transportRequestNonce } : {}), timeoutMs: Math.min(timeoutMs, 10000) }); }
    catch (error) { return response("ame_running_transport_unknown", { error: error.message, process: original, attemptId: record && record.attemptId }); }
    let after; try { after = await processes(); } catch (error) { return response("ame_running_process_inspection_unknown", { process: original, attemptId: record && record.attemptId, error: error.message, transport }); }
    if (after.length !== 1 || !sameProcess(original, after[0])) return response("ame_running_process_changed", { process: original, observedProcesses: after, attemptId: record && record.attemptId, transport });
    if (!transport || transport.deliveryVerified !== true || transport.targetSpecifier !== installation.targetSpecifier || sessionNonce && transport.warmSessionVerified !== true) {
      if (record && transport && UUID.test(transport.requestNonce) && ["unknown", "timeout", "send_unknown", "previous_request_unresolved", "ae_delivery_unknown"].includes(transport.code)) {
        record.transportRequestNonce = transport.requestNonce; atomicWrite(recordFile(installation), record);
      }
      return response("ame_running_transport_unverified", { process: original, attemptId: record && record.attemptId, transport });
    }
    return response("ame_running_transport_verified", { ok: true, ready: true, transportVerified: true, process: after[0], installation, transport,
      sessionNonce: transport.ame && transport.ame.sessionNonce || null, attemptId: record && record.attemptId || null });
  }
  async function execute(raw, capability) {
    const a = validateInput(raw), entry = authority(capability);
    if (entry.argsHash !== hash(JSON.stringify(a))) fail("ame_running_authorization_args_changed");
    entry.active = false;
    let installation, current, discovered;
    try { discovered = await discovery(); installation = pickInstallation(discovered, a.installationId); current = await processes(); }
    catch (error) { return response(error.code || "ame_running_discovery_unknown", { error: error.message, installations: discovered || [], installationDiagnostics: discovered && discovered.diagnostics || [] }); }
    if (!Array.isArray(current) || current.some(value => !processValid(value))) return response("ame_running_process_inspection_unknown");
    if (current.length > 1) return response("ame_running_multiple_processes", { observedProcesses: current, installation });
    const file = recordFile(installation); let record;
    try { record = readRecord(file); } catch (error) { return response(error.code, { installation }); }
    if (a.reconcileAttemptId) {
      if (!record || record.attemptId !== a.reconcileAttemptId || record.installation.installationId !== installation.installationId) return response("ame_running_reconciliation_mismatch", { installation });
      if (current.length !== 1 || normalized(current[0].path) !== normalized(installation.path) || record.process && !sameProcess(record.process, current[0]) || record.launchedPid && record.launchedPid !== current[0].pid || Date.parse(current[0].startedAt) < Date.parse(record.reservedAt) - 1000) return response("ame_running_original_process_unverified", { attemptId: record.attemptId, observedProcesses: current });
      const verified = await verifiedAttachment(installation, current[0], record.sessionNonce, a.timeoutMs, record);
      if (verified.ok) { record.state = "transport_verified"; record.process = verified.process; record.verifiedAt = verified.observedAt; atomicWrite(file, record); releaseLock(file, record); }
      return verified;
    }
    if (record && record.state === "unknown_outcome") return response("ame_running_unknown_attempt_blocks_launch", { attemptId: record.attemptId, installation, observedProcesses: current });
    if (current.length === 1) {
      if (normalized(current[0].path) !== normalized(installation.path)) return response("ame_running_foreign_installation", { installation, observedProcesses: current });
      return verifiedAttachment(installation, current[0], a.expectedSessionNonce, a.timeoutMs, null);
    }
    // A second absence/read and verified discovery close avoidable launch races.
    let second, fresh, freshCandidates;
    try { second = await processes(); freshCandidates = await discovery(); fresh = pickInstallation(freshCandidates, installation.installationId); }
    catch (error) { return response(error.code === "ame_running_installation_unverified" ? error.code : "ame_running_prelaunch_unknown", { installation, error: error.message, installationDiagnostics: freshCandidates && freshCandidates.diagnostics || [] }); }
    if (second.length !== 0) return response("ame_running_prelaunch_race", { installation, observedProcesses: second });
    if (fresh.sha256 !== installation.sha256 || normalized(fresh.path) !== normalized(installation.path)) return response("ame_running_installation_changed", { installation });
    const attemptId = crypto.randomUUID(), sessionNonce = "ame-boot-" + attemptId, attemptDir = path.join(deps.stateDir, attemptId), scriptFile = path.join(attemptDir, "startup.jsx"), bootResultFile = path.join(attemptDir, "startup-result.json");
    fs.mkdirSync(attemptDir, { recursive: true });
    record = { schema: ATTEMPT_SCHEMA, attemptId, state: "unknown_outcome", reservedAt: new Date(now()).toISOString(), installation, sessionNonce, scriptFile, bootResultFile, process: null, launchedPid: null };
    try {
      if (!recordFile(installation).startsWith(path.resolve(deps.stateDir) + path.sep)) fail("ame_running_state_path_invalid");
      if (record && fs.existsSync(file) && readRecord(file).state === "transport_verified") releaseLock(file, readRecord(file));
      atomicWrite(file + ".launch-lock", { attemptId }, true);
      if (!fs.existsSync(file)) atomicWrite(file, record, true); else atomicWrite(file, record);
      const fd = fs.openSync(scriptFile, "wx"); try { fs.writeFileSync(fd, startupScript(sessionNonce, bootResultFile), "utf8"); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      const beforeLaunch = await processes(); if (beforeLaunch.length !== 0) return response("ame_running_reserved_race", { attemptId, observedProcesses: beforeLaunch });
      deps.assertServerProposalContext(entry.context);
      const launched = await launch(installation, scriptFile);
      if (!launched || !Number.isSafeInteger(launched.pid) || launched.pid < 1) return response("ame_running_launch_unknown", { attemptId });
      record.launchedPid = launched.pid; atomicWrite(file, record);
    } catch (error) { return response("ame_running_launch_unknown", { attemptId, error: error.message }); }
    const deadline = now() + a.timeoutMs;
    while (now() < deadline) {
      try { current = await processes(); } catch (error) { return response("ame_running_process_inspection_unknown", { attemptId, error: error.message }); }
      if (current.length > 1) return response("ame_running_multiple_processes", { attemptId, observedProcesses: current });
      if (current.length === 1) {
        if (!processValid(current[0]) || current[0].pid !== record.launchedPid || normalized(current[0].path) !== normalized(installation.path) || Date.parse(current[0].startedAt) < Date.parse(record.reservedAt) - 1000) return response("ame_running_launched_process_mismatch", { attemptId, observedProcesses: current });
        record.process = current[0]; atomicWrite(file, record);
        let boot;
        try { if (fs.existsSync(bootResultFile)) boot = JSON.parse(fs.readFileSync(bootResultFile, "utf8").replace(/^\uFEFF/, "")); } catch (_) { return response("ame_running_startup_receipt_invalid", { attemptId }); }
        if (!boot) { await delay(100); continue; }
        if (boot.schema !== "ae-agent-ame-startup.v1" || boot.sessionNonce !== sessionNonce || boot.appSpecifier !== installation.targetSpecifier || !Number.isFinite(boot.observedAt) || boot.observedAt < Date.parse(record.reservedAt) - 1000) return response("ame_running_startup_receipt_invalid", { attemptId });
        const verified = await verifiedAttachment(installation, current[0], sessionNonce, a.timeoutMs, record);
        if (verified.ok) { record.state = "transport_verified"; record.verifiedAt = verified.observedAt; atomicWrite(file, record); releaseLock(file, record); }
        return verified;
      }
      await delay(100);
    }
    return response("ame_running_launch_unknown", { attemptId, launchedPid: record.launchedPid });
  }
  return { authorize, assertAuthorization: (capability, raw) => { const entry = authority(capability); if (entry.argsHash !== hash(JSON.stringify(validateInput(raw)))) fail("ame_running_authorization_args_changed"); return true; }, execute: async (raw, capability) => {
    const entry = authority(capability), result = await execute(raw, capability);
    return { ...result, authorization: { proposalId: entry.context.record && entry.context.record.actionId, runId: entry.context.runId, operationArgsHash: entry.argsHash } };
  } };
}
function inspectionArgs(payload) {
  if (!payload || payload.schema !== SCHEMA || !payload.installation || !/^ame-\d+\.0$/.test(payload.installation.targetSpecifier)) fail("ame_running_receipt_invalid");
  return { targetSpecifier: payload.installation.targetSpecifier, ...(payload.sessionNonce ? { expectedSessionNonce: payload.sessionNonce } : {}), timeoutMs: 5000 };
}
function verifyReadBack(payload, read, before, after) {
  return Boolean(payload && payload.ok === true && payload.transportVerified === true && payload.projectContentMutation === false && payload.externalApplicationMutation === true && payload.checkpointScope === "on_disk_saved_file" &&
    payload.nativeQueueOwnershipVerified === false && payload.adapterReady === false && payload.transport &&
    Array.isArray(before) && Array.isArray(after) && before.length === 1 && after.length === 1 && sameProcess(payload.process, before[0]) && sameProcess(before[0], after[0]) &&
    read && read.schema === "ae-agent-ame-transport.v1" && read.deliveryVerified === true && read.targetSpecifier === payload.installation.targetSpecifier && read.requestNonce !== payload.transport.requestNonce &&
    (!payload.sessionNonce || read.warmSessionVerified === true && read.ame && read.ame.sessionNonce === payload.sessionNonce));
}
const tool = { name: TOOL_NAME, description: "Ensure one verified Adobe Media Encoder process and its fixed read transport. Application mutation requires a current server-owned typed proposal and dry-run. Never kills, replays an unknown launch, submits jobs or claims queue ownership. Executable/arguments/startup source are fixed by installed metadata, never caller paths.",
  inputSchema: { type: "object", additionalProperties: false, properties: { installationId: { type: "string", pattern: SHA.source }, expectedSessionNonce: { type: "string", pattern: "^[A-Za-z0-9._-]{1,128}$" },
    timeoutMs: { type: "integer", minimum: 1000, maximum: 30000, default: 10000 }, reconcileAttemptId: { type: "string", pattern: UUID.source } } },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } };
module.exports = { TOOL_NAME, SCHEMA, ATTEMPT_SCHEMA, tool, validateInput, assertProposalContext, discoverInstalled, inspectProcesses, pickInstallation, sameProcess, startupScript, createExecutor, inspectionArgs, verifyReadBack };
