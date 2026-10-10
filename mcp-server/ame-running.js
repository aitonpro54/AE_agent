"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFile, spawn } = require("node:child_process");
const m100Protocol = require("./m100-protocol");
const TOOL_NAME = "ensure_ame_running";
const SCHEMA = "ae-agent-ame-running.v1";
const ATTEMPT_SCHEMA = "ae-agent-ame-launch-attempt.v1";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const SHA = /^[a-f0-9]{64}$/;
const MUTATION_META = ["verifyAfter", "idempotencyKey", "idempotencyScope", "checkpointLabel", "autoCheckpoint"];
// Only native discovery may mint a diagnostic that can enter the manual pin path.
// This provenance is private to the loaded module and cannot arrive in tool JSON.
const diagnosticEntries = new WeakSet();
function fail(code) { const error = new Error(code); error.code = code; throw error; }
function hash(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
const normalized = value => String(value || "").replace(/\\/g, "/").toLowerCase();
function validateInput(raw = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).some(key => !["installationId", "existingInstallationTrust", "expectedSessionNonce", "timeoutMs", "reconcileAttemptId", ...MUTATION_META].includes(key))) fail("ame_running_invalid_input");
  if (raw.installationId !== undefined && (typeof raw.installationId !== "string" || !SHA.test(raw.installationId))) fail("ame_running_invalid_installation");
  let existingInstallationTrust;
  if (raw.existingInstallationTrust !== undefined) {
    const trust = raw.existingInstallationTrust;
    if (!trust || typeof trust !== "object" || Array.isArray(trust) || Object.keys(trust).length !== 2 || Object.keys(trust).some(key => !["acknowledgedSignatureStatus", "sha256"].includes(key)) ||
      trust.acknowledgedSignatureStatus !== "HashMismatch" || typeof trust.sha256 !== "string" || !SHA.test(trust.sha256) || typeof raw.installationId !== "string" || !SHA.test(raw.installationId)) fail("ame_running_invalid_existing_installation_trust");
    existingInstallationTrust = { acknowledgedSignatureStatus: "HashMismatch", sha256: trust.sha256 };
  }
  if (raw.expectedSessionNonce !== undefined && (typeof raw.expectedSessionNonce !== "string" || !/^[A-Za-z0-9._-]{1,128}$/.test(raw.expectedSessionNonce))) fail("ame_running_invalid_session");
  if (raw.reconcileAttemptId !== undefined && !UUID.test(raw.reconcileAttemptId)) fail("ame_running_invalid_attempt");
  const timeoutMs = raw.timeoutMs === undefined ? 10000 : raw.timeoutMs;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) fail("ame_running_invalid_timeout");
  return { installationId: raw.installationId || null, ...(existingInstallationTrust ? { existingInstallationTrust } : {}), expectedSessionNonce: raw.expectedSessionNonce || null, timeoutMs, reconcileAttemptId: raw.reconcileAttemptId || null };
}
function assertProposalContext(context, currentRecord, contractVersion) {
  const record = context && context.record, receipt = record && record.dryRunReceipt;
  if (!record || record !== currentRecord || !record.project || !record.project.expectedFile || context.source !== "ai-plan-run" || record.executionState !== "executing" || record.executionId !== context.runId || record.riskLevel !== "mutating" || context.confirm !== true || context.allowWithoutCheckpoint !== false || context.stepCount !== 1 || !UUID.test(context.runId) ||
    !Number.isFinite(Date.parse(record.dryRunCompletedAt)) || !receipt || receipt.payloadHash !== record.payloadHash || receipt.contractVersion !== contractVersion || receipt.stepCount !== 1 || receipt.projectFile !== record.project.expectedFile ||
    !context.checkpoint || normalized(context.checkpoint.sourceFile) !== normalized(record.project.expectedFile) || !context.checkpoint.checkpointFile ||
    !(context.autonomous === true || record.confirmedBySurface === "cep-panel") || !Number.isFinite(Date.parse(record.proposalExpiresAt)) || Date.parse(record.proposalExpiresAt) <= Date.now()) fail("ame_running_proposal_authorization_required");
}
function assertManualPinContext(context, args) {
  const record = context && context.record, payload = record && record.payload, plan = payload && payload.plan, steps = plan && plan.steps;
  if (!record || context.autonomous !== false || record.confirmedBySurface !== "cep-panel" || record.confirmationSurface !== "cep-panel" ||
    !Number.isFinite(Date.parse(record.confirmedAt)) || Date.parse(record.confirmedAt) < Date.parse(record.dryRunCompletedAt) ||
    !payload || payload.kind !== "agent_plan" || record.payloadHash !== m100Protocol.sha256Payload(payload) ||
    !Array.isArray(steps) || steps.length !== 1 || !steps[0] || (steps[0].tool || steps[0].toolName) !== TOOL_NAME ||
    plan.runtimeBindings !== undefined || plan.montagePipeline !== undefined || steps[0].resultBindings !== undefined || steps[0].bindings !== undefined ||
    normalized(plan.targetProject && plan.targetProject.file) !== normalized(record.project && record.project.expectedFile)) fail("ame_running_manual_hash_pin_authorization_required");
  let storedArgs;
  try { storedArgs = validateInput(steps[0].safeArgs || steps[0].args || steps[0].arguments || {}); }
  catch (_) { fail("ame_running_manual_hash_pin_payload_changed"); }
  if (hash(JSON.stringify(storedArgs)) !== hash(JSON.stringify(args))) fail("ame_running_manual_hash_pin_payload_changed");
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
    // Manual pins require canonical standard trusted parents. Preserve the normal
    // Valid Adobe signature path; an alias never becomes a manual-pin candidate.
    const pinEligible = trustedRoot && normalized(real) === normalized(candidate.path) && roots.some(root => { try {
      return normalized(fs.realpathSync(root)) === normalized(root) && normalized(fs.realpathSync(path.join(root, "Adobe"))) === normalized(path.join(root, "Adobe")) &&
        normalized(path.dirname(directory)) === normalized(path.join(root, "Adobe"));
    } catch (_) { return false; } });
    const productMatches = candidate.productName === "Adobe Media Encoder" || year && candidate.productName === "Adobe Media Encoder " + year[1];
    if (!trustedRoot || path.basename(real).toLowerCase() !== "adobe media encoder.exe" || !productMatches || !/^Adobe(?: Inc\.| Systems Incorporated)?$/i.test(candidate.companyName || "")) continue;
    const adobeSigner = /O=Adobe (?:Inc\.|Systems Incorporated)/i.test(candidate.signerSubject || "");
    if (candidate.signatureStatus === "Valid" && !adobeSigner) continue;
    const version = /^(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?/.exec(candidate.fileVersion || "");
    if (!version) continue;
    const sha256 = await hashFile(real), installationId = hash(normalized(real) + "\n" + sha256);
    if (candidate.signatureStatus !== "Valid") {
      const diagnostic = Object.freeze({ status: "installed_unverified", reason: "signature_not_valid", launchable: false, installationId, path: real, fileVersion: candidate.fileVersion,
        productVersion: candidate.productVersion || null, productName: candidate.productName, companyName: candidate.companyName, sha256, targetSpecifier: "ame-" + version[1] + ".0",
        discoverySource: pinEligible ? "standardAdobeProgramFiles" : "standardAdobeProgramFilesAlias", signatureStatus: candidate.signatureStatus || "Unknown", signatureMessage: candidate.signatureMessage || null, signerSubject: candidate.signerSubject || null });
      if (pinEligible) diagnosticEntries.add(diagnostic); diagnostics.push(diagnostic);
      continue;
    }
    result.push({ installationId, path: real, fileVersion: candidate.fileVersion, productVersion: candidate.productVersion, sha256,
      targetSpecifier: "ame-" + version[1] + ".0", signatureStatus: "Valid", signerSubject: candidate.signerSubject });
  }
  const trusted = result.filter((item, i) => result.findIndex(other => normalized(other.path) === normalized(item.path)) === i);
  // Preserve the trusted array contract; diagnostics stay outside default selection.
  Object.defineProperty(trusted, "diagnostics", { value: diagnostics.filter((item, i) => diagnostics.findIndex(other => normalized(other.path) === normalized(item.path)) === i) });
  return trusted;
}
async function inspectProcesses() {
  const values = await queryWindows(PROCESS_SCRIPT);
  return values.map(value => ({ pid: value.pid, path: value.path, startedAt: new Date(value.startedAt).toISOString() }));
}
function processValid(processInfo) { return processInfo && Number.isSafeInteger(processInfo.pid) && processInfo.pid > 0 && typeof processInfo.path === "string" && Number.isFinite(Date.parse(processInfo.startedAt)); }
function sameProcess(a, b) { return processValid(a) && processValid(b) && a.pid === b.pid && a.startedAt === b.startedAt && normalized(a.path) === normalized(b.path); }
function pickInstallation(candidates, id, trust) {
  if (!Array.isArray(candidates) || candidates.some(value => !value || !SHA.test(value.installationId) || !SHA.test(value.sha256) || !/^ame-\d+\.0$/.test(value.targetSpecifier))) fail("ame_running_invalid_discovery");
  if (trust) {
    if (!SHA.test(id) || trust.acknowledgedSignatureStatus !== "HashMismatch" || !SHA.test(trust.sha256)) fail("ame_running_invalid_existing_installation_trust");
    const matches = Array.isArray(candidates.diagnostics) ? candidates.diagnostics.filter(item => diagnosticEntries.has(item) && item.installationId === id && item.sha256 === trust.sha256 &&
      item.signatureStatus === "HashMismatch" && item.status === "installed_unverified" && item.launchable === false && item.reason === "signature_not_valid" && item.discoverySource === "standardAdobeProgramFiles") : [];
    if (matches.length !== 1) fail("ame_running_manual_hash_pin_mismatch");
    return Object.freeze({ ...matches[0], trustMode: "manual_hash_pin", vendorSignatureVerified: false });
  }
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
  function assertContext(entry) {
    deps.assertServerProposalContext(entry.context);
    if (!entry.args.existingInstallationTrust) return;
    if (typeof deps.assertManualServerProposalContext !== "function") fail("ame_running_manual_hash_pin_authorization_required");
    // The bridge must prove a private authenticated manual CEP run, not a caller's
    // confirmation echo. This callback is absent by default: the pin fails closed.
    deps.assertManualServerProposalContext(entry.context);
    assertManualPinContext(entry.context, entry.args);
    const context = entry.context, record = context.record, saved = entry.pinContext;
    if (saved && (record !== saved.record || context.runId !== saved.runId || record.payloadHash !== saved.payloadHash || record.revision !== saved.revision ||
      record.confirmedAt !== saved.confirmedAt || record.dryRunCompletedAt !== saved.dryRunCompletedAt ||
      hash(m100Protocol.stableStringify(record.dryRunReceipt)) !== saved.dryRunReceiptHash || hash(m100Protocol.stableStringify(context.checkpoint)) !== saved.checkpointHash ||
      hash(JSON.stringify(validateInput(context.args || {}))) !== entry.argsHash)) fail("ame_running_manual_hash_pin_context_changed");
  }
  function authorize(context) {
    const args = validateInput(context && context.args || {}), entry = { active: true, context, args, argsHash: hash(JSON.stringify(args)) };
    assertContext(entry);
    if (args.existingInstallationTrust) {
      const record = context.record;
      entry.pinContext = { record, runId: context.runId, payloadHash: record.payloadHash, revision: record.revision, confirmedAt: record.confirmedAt, dryRunCompletedAt: record.dryRunCompletedAt,
        dryRunReceiptHash: hash(m100Protocol.stableStringify(record.dryRunReceipt)), checkpointHash: hash(m100Protocol.stableStringify(context.checkpoint)) };
    }
    const capability = Object.freeze(Object.create(null)); capabilities.set(capability, entry); return capability;
  }
  function authority(capability) { const entry = capabilities.get(capability); if (!entry || !entry.active) fail("ame_running_proposal_authorization_required"); assertContext(entry); return entry; }
  function response(code, extra = {}) { return { schema: SCHEMA, ok: false, code, ready: false, transportVerified: false, nativeQueueOwnershipVerified: false, adapterReady: false,
    automaticRetryAllowed: false, externalApplicationMutation: true, projectContentMutation: false, checkpointScope: "on_disk_saved_file", observedAt: new Date(now()).toISOString(),
    ...(extra.installation && extra.installation.trustMode === "manual_hash_pin" ? { trustMode: "manual_hash_pin", vendorSignatureVerified: false, signatureStatus: extra.installation.signatureStatus, trustScope: "ensure_ame_running_transport_only" } : {}), ...extra }; }
  async function checkPinnedInstallation(installation, entry) {
    if (!entry.args.existingInstallationTrust) return;
    assertContext(entry);
    let found;
    try { found = await discovery(); } catch (_) { fail("ame_running_pinned_reinspection_unknown"); }
    let fresh;
    try { fresh = pickInstallation(found, entry.args.installationId, entry.args.existingInstallationTrust); }
    catch (_) { fail("ame_running_installation_changed"); }
    if (fresh.sha256 !== installation.sha256 || normalized(fresh.path) !== normalized(installation.path) || fresh.fileVersion !== installation.fileVersion ||
      fresh.productVersion !== installation.productVersion || fresh.targetSpecifier !== installation.targetSpecifier) fail("ame_running_installation_changed");
    assertContext(entry);
  }
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
  async function verifiedAttachment(installation, original, sessionNonce, timeoutMs, record, entry) {
    try { await checkPinnedInstallation(installation, entry); }
    catch (error) { return response(error.code, { installation, process: original, attemptId: record && record.attemptId, error: error.message }); }
    let transport; try { transport = await deps.inspectTransport({ targetSpecifier: installation.targetSpecifier, ...(sessionNonce ? { expectedSessionNonce: sessionNonce } : {}),
      ...(record && record.transportRequestNonce ? { reconcileRequestNonce: record.transportRequestNonce } : {}), timeoutMs: Math.min(timeoutMs, 10000) }); }
    catch (error) { return response("ame_running_transport_unknown", { installation, error: error.message, process: original, attemptId: record && record.attemptId }); }
    let after; try { after = await processes(); } catch (error) { return response("ame_running_process_inspection_unknown", { installation, process: original, attemptId: record && record.attemptId, error: error.message, transport }); }
    if (after.length !== 1 || !sameProcess(original, after[0])) return response("ame_running_process_changed", { installation, process: original, observedProcesses: after, attemptId: record && record.attemptId, transport });
    try { await checkPinnedInstallation(installation, entry); }
    catch (error) { return response(error.code, { installation, process: original, attemptId: record && record.attemptId, transport, error: error.message }); }
    if (!transport || transport.deliveryVerified !== true || transport.targetSpecifier !== installation.targetSpecifier || sessionNonce && transport.warmSessionVerified !== true) {
      if (record && transport && UUID.test(transport.requestNonce) && ["unknown", "timeout", "send_unknown", "previous_request_unresolved", "ae_delivery_unknown"].includes(transport.code)) {
        record.transportRequestNonce = transport.requestNonce; atomicWrite(recordFile(installation), record);
      }
      return response("ame_running_transport_unverified", { installation, process: original, attemptId: record && record.attemptId, transport });
    }
    return response("ame_running_transport_verified", { ok: true, ready: true, transportVerified: true, process: after[0], installation, transport,
      sessionNonce: transport.ame && transport.ame.sessionNonce || null, attemptId: record && record.attemptId || null });
  }
  async function execute(raw, capability) {
    const a = validateInput(raw), entry = authority(capability);
    if (entry.argsHash !== hash(JSON.stringify(a))) fail("ame_running_authorization_args_changed");
    entry.active = false;
    let installation, current, discovered;
    try { discovered = await discovery(); installation = pickInstallation(discovered, a.installationId, a.existingInstallationTrust); entry.installation = installation; current = await processes(); }
    catch (error) { return response(error.code || "ame_running_discovery_unknown", { error: error.message, installations: discovered || [], installationDiagnostics: discovered && discovered.diagnostics || [] }); }
    if (!Array.isArray(current) || current.some(value => !processValid(value))) return response("ame_running_process_inspection_unknown");
    if (current.length > 1) return response("ame_running_multiple_processes", { observedProcesses: current, installation });
    const file = recordFile(installation); let record;
    try { record = readRecord(file); } catch (error) { return response(error.code, { installation }); }
    if (a.reconcileAttemptId) {
      if (!record || record.attemptId !== a.reconcileAttemptId || record.installation.installationId !== installation.installationId) return response("ame_running_reconciliation_mismatch", { installation });
      if (current.length !== 1 || normalized(current[0].path) !== normalized(installation.path) || record.process && !sameProcess(record.process, current[0]) || record.launchedPid && record.launchedPid !== current[0].pid || Date.parse(current[0].startedAt) < Date.parse(record.reservedAt) - 1000) return response("ame_running_original_process_unverified", { attemptId: record.attemptId, observedProcesses: current });
      const verified = await verifiedAttachment(installation, current[0], record.sessionNonce, a.timeoutMs, record, entry);
      if (verified.ok) { record.state = "transport_verified"; record.process = verified.process; record.verifiedAt = verified.observedAt; atomicWrite(file, record); releaseLock(file, record); }
      return verified;
    }
    if (record && record.state === "unknown_outcome") return response("ame_running_unknown_attempt_blocks_launch", { attemptId: record.attemptId, installation, observedProcesses: current });
    if (current.length === 1) {
      if (normalized(current[0].path) !== normalized(installation.path)) return response("ame_running_foreign_installation", { installation, observedProcesses: current });
      return verifiedAttachment(installation, current[0], a.expectedSessionNonce, a.timeoutMs, null, entry);
    }
    // A second absence/read and verified discovery close avoidable launch races.
    let second, fresh, freshCandidates;
    try { second = await processes(); freshCandidates = await discovery(); fresh = pickInstallation(freshCandidates, installation.installationId, a.existingInstallationTrust); }
    catch (error) { return response(error.code === "ame_running_installation_unverified" ? error.code : a.existingInstallationTrust && error.code === "ame_running_manual_hash_pin_mismatch" ? "ame_running_installation_changed" : "ame_running_prelaunch_unknown", { installation, error: error.message, installationDiagnostics: freshCandidates && freshCandidates.diagnostics || [] }); }
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
      assertContext(entry);
      // This is a fresh check in stable standard trusted parents, not an atomic
      // Windows handle-bound launch guarantee against concurrent file replacement.
      await checkPinnedInstallation(installation, entry);
      const launched = await launch(installation, scriptFile);
      if (!launched || !Number.isSafeInteger(launched.pid) || launched.pid < 1) return response("ame_running_launch_unknown", { attemptId });
      record.launchedPid = launched.pid; atomicWrite(file, record);
    } catch (error) { return response(a.existingInstallationTrust && /^ame_running_(?:installation_changed|pinned_reinspection_unknown|manual_hash_pin_)/.test(error.code || "") ? error.code : "ame_running_launch_unknown", { installation, attemptId, error: error.message }); }
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
        const verified = await verifiedAttachment(installation, current[0], sessionNonce, a.timeoutMs, record, entry);
        if (verified.ok) { record.state = "transport_verified"; record.verifiedAt = verified.observedAt; atomicWrite(file, record); releaseLock(file, record); }
        return verified;
      }
      await delay(100);
    }
    return response("ame_running_launch_unknown", { attemptId, launchedPid: record.launchedPid });
  }
  return { authorize, assertAuthorization: (capability, raw) => { const entry = authority(capability); if (entry.argsHash !== hash(JSON.stringify(validateInput(raw)))) fail("ame_running_authorization_args_changed"); return true; }, execute: async (raw, capability) => {
    const entry = authority(capability), result = await execute(raw, capability);
    return { ...result, ...(entry.installation && entry.installation.trustMode === "manual_hash_pin" ? { installation: entry.installation, trustMode: "manual_hash_pin", vendorSignatureVerified: false,
      signatureStatus: entry.installation.signatureStatus, trustScope: "ensure_ame_running_transport_only" } : {}),
      authorization: { proposalId: entry.context.record && entry.context.record.actionId, runId: entry.context.runId, operationArgsHash: entry.argsHash } };
  } };
}
function inspectionArgs(payload) {
  if (!payload || payload.schema !== SCHEMA || !payload.installation || !/^ame-\d+\.0$/.test(payload.installation.targetSpecifier)) fail("ame_running_receipt_invalid");
  return { targetSpecifier: payload.installation.targetSpecifier, ...(payload.sessionNonce ? { expectedSessionNonce: payload.sessionNonce } : {}), timeoutMs: 5000 };
}
function verifyReadBack(payload, read, before, after) {
  return Boolean(payload && payload.ok === true && payload.transportVerified === true && payload.projectContentMutation === false && payload.externalApplicationMutation === true && payload.checkpointScope === "on_disk_saved_file" &&
    payload.installation && (payload.installation.signatureStatus === "Valid" && payload.installation.trustMode !== "manual_hash_pin" && payload.trustMode !== "manual_hash_pin" ||
      payload.installation.trustMode === "manual_hash_pin" && payload.trustMode === "manual_hash_pin" && payload.vendorSignatureVerified === false && payload.signatureStatus === "HashMismatch" &&
      payload.trustScope === "ensure_ame_running_transport_only" && payload.installation.vendorSignatureVerified === false && payload.installation.signatureStatus === "HashMismatch" &&
      SHA.test(payload.installation.sha256) && payload.installation.installationId === hash(normalized(payload.installation.path) + "\n" + payload.installation.sha256)) &&
    payload.nativeQueueOwnershipVerified === false && payload.adapterReady === false && payload.transport &&
    Array.isArray(before) && Array.isArray(after) && before.length === 1 && after.length === 1 && sameProcess(payload.process, before[0]) && sameProcess(before[0], after[0]) &&
    read && read.schema === "ae-agent-ame-transport.v1" && read.deliveryVerified === true && read.targetSpecifier === payload.installation.targetSpecifier && read.requestNonce !== payload.transport.requestNonce &&
    (!payload.sessionNonce || read.warmSessionVerified === true && read.ame && read.ame.sessionNonce === payload.sessionNonce));
}
const tool = { name: TOOL_NAME, description: "Ensure one Adobe Media Encoder process and its fixed read transport. Default selection requires a Valid Adobe signature. Optional existingInstallationTrust pins only an exact native-discovered standard Program Files HashMismatch installation after actual manual CEP confirmation of a current server-owned single-step typed proposal and dry-run. A hash pin does not verify the vendor signature or authorize jobs/exports. Never kills, replays an unknown launch, submits jobs or claims queue ownership. Executable/arguments/startup source are fixed by installed metadata, never caller paths.",
  inputSchema: { type: "object", additionalProperties: false, properties: { installationId: { type: "string", pattern: SHA.source },
    existingInstallationTrust: { type: "object", additionalProperties: false, required: ["acknowledgedSignatureStatus", "sha256"], properties: {
      acknowledgedSignatureStatus: { type: "string", enum: ["HashMismatch"] }, sha256: { type: "string", pattern: SHA.source }
    }, description: "Explicit exact-hash acknowledgment of this existing HashMismatch installation. Requires installationId and private manual CEP authorization; never enables autonomous/direct/admin execution or other invalid signature states." },
    expectedSessionNonce: { type: "string", pattern: "^[A-Za-z0-9._-]{1,128}$" },
    timeoutMs: { type: "integer", minimum: 1000, maximum: 30000, default: 10000 }, reconcileAttemptId: { type: "string", pattern: UUID.source } } },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } };
module.exports = { TOOL_NAME, SCHEMA, ATTEMPT_SCHEMA, tool, validateInput, assertProposalContext, discoverInstalled, inspectProcesses, pickInstallation, sameProcess, startupScript, createExecutor, inspectionArgs, verifyReadBack };
