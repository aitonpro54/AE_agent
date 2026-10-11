"use strict";

// Private backend component. No public MCP/raw/admin operation can mint a grant.
// Filesystem ownership here is cooperative; it is not same-user adversary isolation.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path").win32;
const m100 = require("./m100-protocol");
const ledger = require("./native-fixture-attempt-ledger");

const TOOL_NAME = "ame_native_fixture_probe";
const SCHEMA = "ae-agent.native-fixture-probe.v2";
const REOPEN_CONTRACT = "ae-agent.native-owned-fixture-reopen.v1";
const READBACK_SCHEMA = "ae-agent.native-owned-fixture-readback.v1";
const EVIDENCE_SCHEMA = "ae-agent.native-fixed-fixture-evidence.v1";
const EVIDENCE_KEYS = ["sentinel", "variant", "media_path", "proxy_path", "use_proxy", "main_name", "nested_name", "root_comp_count",
  "item_count", "nested_layer_count", "main_layer_count", "title_01_text", "title_02_text", "title_01_enabled", "title_02_enabled",
  "sentinel_enabled", "nested_enabled", "image_enabled", "main_id", "nested_id", "media_id", "folder_id", "nested_source_id", "image_source_id"];
const KINDS = new Set(["saved-clean", "saved-dirty", "untitled-dirty"]);
const HEX = /^[a-f0-9]{64}$/;
const TOKEN = /^[a-f0-9]{32}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const ID = /^[A-Za-z0-9_.-]{8,128}$/;
const ZERO = "0".repeat(64);
function fail(code) { const error = new Error(code); error.code = code; throw error; }
function need(ok, code) { if (!ok) fail(code); }
function exact(object, keys) {
  need(object && typeof object === "object" && !Array.isArray(object) &&
    Object.keys(object).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(object, key)), "fixture_closed_schema");
}
function validateInput(raw) {
  need(raw && typeof raw === "object" && !Array.isArray(raw) && Object.keys(raw).every(k => k === "fixtureKind" || k === "restoreDirty"), "fixture_invalid_input");
  need(KINDS.has(raw.fixtureKind) && (raw.restoreDirty === undefined || typeof raw.restoreDirty === "boolean"), "fixture_invalid_input");
  return Object.freeze({ fixtureKind: raw.fixtureKind, restoreDirty: raw.restoreDirty === true });
}
function localPath(value) {
  need(typeof value === "string" && value.length > 3 && value.length < 220 && /^[A-Za-z]:\\/.test(value) &&
    !/[\x00-\x1f\x7f/]/.test(value) && !value.slice(2).includes(":"), "fixture_local_canonical_path");
  need(path.normalize(value).toLowerCase() === value.toLowerCase() && !value.endsWith("\\") &&
    value.slice(3).split("\\").every(part => part && !/[. ]$/.test(part) && !/[*?"<>|]/.test(part)), "fixture_local_canonical_path");
  return value;
}
function samePath(a, b) { return localPath(a).toLowerCase() === localPath(b).toLowerCase(); }
function canonicalFields(fields) {
  const bytes = Object.keys(fields).filter(key => key !== "mac").sort().map(key => {
    const value = fields[key];
    need(/^[a-z0-9_]{1,64}$/.test(key) && typeof value === "string" && value.length > 0 && !/[\x00-\x1f\x7f]/.test(value), "fixture_signed_field");
    return `${key}=${value}\n`;
  }).join("");
  need(bytes.length > 0 && Buffer.byteLength(bytes) <= 32768 && Object.keys(fields).length <= 24, "fixture_signed_size");
  return bytes;
}
function hmac(key, bytes) { return crypto.createHmac("sha256", Buffer.from(key, "hex")).update(bytes, "utf8").digest("hex"); }
function sign(fields, key) { return canonicalFields(fields) + `mac=${hmac(key, canonicalFields(fields))}\n`; }
function sha(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function fixedBitmap(proxy) {
  const b = Buffer.alloc(70); b.write("BM"); b.writeUInt32LE(70, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeUInt32LE(2, 18); b.writeUInt32LE(2, 22); b[26] = 1; b[28] = 24; b.writeUInt32LE(16, 34);
  for (let row = 0; row < 2; row++) for (let column = 0; column < 2; column++) {
    const p = 54 + row * 8 + column * 3; b[p] = 20; b[p + 1] = proxy ? 220 : 40; b[p + 2] = proxy ? 40 : 220;
  }
  return b;
}
const MEDIA_SHA = sha(fixedBitmap(false)), PROXY_SHA = sha(fixedBitmap(true));
function evidenceFields(bytes) {
  need(typeof bytes === "string" && Buffer.byteLength(bytes) <= 32768 && bytes.endsWith("\n"), "fixture_fixed_evidence_required");
  const fields = {};
  for (const line of bytes.slice(0, -1).split("\n")) {
    const n = line.indexOf("="), key = line.slice(0, n), value = line.slice(n + 1);
    need(n > 0 && /^[a-z0-9_]{1,64}$/.test(key) && value.length > 0 && !/[\x00-\x1f\x7f]/.test(value) &&
      !Object.prototype.hasOwnProperty.call(fields, key), "fixture_fixed_evidence_required");
    fields[key] = value;
  }
  exact(fields, EVIDENCE_KEYS); return fields;
}
function positiveId(value) { return typeof value === "string" && /^[1-9][0-9]{0,15}$/.test(value) && Number.isSafeInteger(Number(value)); }
async function regularFile(file, filesystem) {
  localPath(file);
  const stat = await filesystem.lstat(file);
  need(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && samePath(await filesystem.realpath(file), file), "fixture_file_identity_guard");
  return stat;
}
// All ancestor identities are checked; the native process subsequently holds each
// directory without SHARE_DELETE. No ACL/AppContainer/hostile writer claim is made.
async function inspectOwnedRoot(descriptor, ownedParent, filesystem = fs.promises) {
  const root = localPath(descriptor.rootPath), parent = localPath(ownedParent);
  need(root.toLowerCase().startsWith(parent.toLowerCase() + "\\") && path.basename(root) === `probe-${descriptor.nonce}`, "fixture_owned_root_required");
  for (let cursor = root; ; cursor = path.dirname(cursor)) {
    const stat = await filesystem.lstat(cursor);
    need(stat.isDirectory() && !stat.isSymbolicLink() && String(await filesystem.realpath(cursor)).toLowerCase() === cursor.toLowerCase(), "fixture_root_reparse_or_identity");
    if (path.dirname(cursor) === cursor) break;
  }
  const ownerFile = path.join(path.dirname(parent), "ame-native-fixture-ledger",descriptor.stageId,"owner.json");
  await regularFile(ownerFile, filesystem);
  const envelope=JSON.parse(await filesystem.readFile(ownerFile, "utf8")), marker=envelope.value;
  need(envelope.schema===ledger.SCHEMA+".envelope" && envelope.sha256===sha(JSON.stringify(marker)),"fixture_root_owner_mismatch");
  exact(marker, ["schema", "rootPath", "nonce", "stageId", "role"]);
  need(marker.schema === "ae-agent.native-fixture-owner.v2" && marker.rootPath === root && marker.nonce === descriptor.nonce &&
    marker.stageId === descriptor.stageId && marker.role === descriptor.role, "fixture_root_owner_mismatch");
  const expected=descriptor.role === "capture" ? ["launch.manifest"] : ["baseline.aep","launch.manifest"];
  // Before the manifest is published, the native root must be otherwise empty.
  const present=(await filesystem.readdir(root)).sort();
  need(JSON.stringify(present)===JSON.stringify(expected.filter(name=>name!=="launch.manifest")),"fixture_native_claim_layout_required");
  for (const file of [descriptor.pluginPath, descriptor.executablePath]) await regularFile(file, filesystem);
  need(sha(await filesystem.readFile(descriptor.pluginPath)) === descriptor.pluginSha256 &&
    sha(await filesystem.readFile(descriptor.executablePath)) === descriptor.executableSha256, "fixture_child_image_hash_mismatch");
  if (descriptor.role === "stage") await regularFile(path.join(root, "baseline.aep"), filesystem);
  return true;
}

function createFixtureGrantIssuer(dependencies) {
  const d = dependencies || {}, filesystem = d.filesystem || fs.promises;
  for (const name of ["getCurrentRecord", "getCheckpoint", "getOwnedChild", "inspectProcess", "consumeAttempt", "assertManualIngress"])
    need(typeof d[name] === "function", "fixture_backend_dependencies_required");
  const ownedParent = localPath(d.ownedParent), contractVersion = d.contractVersion;
  need(ID.test(contractVersion), "fixture_contract_version_required");
  const clock = d.now || Date.now;
  const capabilities = new WeakSet(), authorization = new WeakMap(), children = new WeakMap();
  const usedRoots = new Set(), usedAuthorizations = new Set();

  async function checkReopenBuild(descriptor, buildRoot, buildId) {
    const receiptPath = path.join(buildRoot, "build-receipt.json"), receiptStat = await regularFile(receiptPath, filesystem);
    need(Number.isSafeInteger(receiptStat.size) && receiptStat.size <= 262144, "fixture_reopen_build_receipt_bounded");
    const bytes = await filesystem.readFile(receiptPath), receipt = JSON.parse(bytes.toString("utf8"));
    need(receipt.schema === "ae-agent.native-probe-build.v2" && receipt.buildId === buildId && receipt.binarySha256 === descriptor.pluginSha256 &&
      receipt.ownedFixtureReopenContract === REOPEN_CONTRACT && receipt.ownedFixtureReadbackSchema === READBACK_SCHEMA && receipt.fixedFixtureEvidenceSchema === EVIDENCE_SCHEMA &&
      receipt.ownedFixtureReopenContractCompiled === true && receipt.signedFixturePathCompiled === true && receipt.sourceHashesStableAcrossBuild === true &&
      receipt.offlineValidationAccepted === true && receipt.protocolSmokeExitCode === 0 && receipt.productionBackend === false &&
      receipt.protocolSmoke?.ownedFixtureReopenChecks >= 50 && receipt.fixtureGrantSmoke?.ownedFixtureReopenChecks >= 20,
    "fixture_exact_reopen_build_required");
    const binaryPath = path.join(buildRoot, "bin", "AEAgentSnapshotProbe.aex");
    need(receipt.binaryPath === binaryPath, "fixture_exact_reopen_build_required"); const binaryStat = await regularFile(binaryPath, filesystem);
    need(Number.isSafeInteger(binaryStat.size) && binaryStat.size <= 16777216, "fixture_reopen_build_binary_bounded");
    const binary = await filesystem.readFile(binaryPath);
    need(sha(binary) === descriptor.pluginSha256 && [REOPEN_CONTRACT, READBACK_SCHEMA, EVIDENCE_SCHEMA, buildId].every(marker => binary.includes(Buffer.from(marker))),
      "fixture_compiled_reopen_build_required");
    const required = new Set(["native\\ame-snapshot-probe\\ame_snapshot_probe.cpp", "native\\ame-snapshot-probe\\probe_stage_readback.h",
      "native\\ame-snapshot-probe\\fixture_reopen_contract.h", "native\\ame-snapshot-probe\\fixture_program.h", "native\\ame-snapshot-probe\\protocol_smoke.cpp",
      "scripts\\ame-native-probe-build.ps1", "mcp-server\\ame-native-fixture-grant.js", "scripts\\ame-native-fixture-grant-smoke.js"]);
    need(Array.isArray(receipt.sourceFiles) && receipt.sourceFiles.length >= required.size && receipt.sourceFiles.length <= 32, "fixture_reopen_build_sources_required");
    const seen = new Set();
    for (const source of receipt.sourceFiles) {
      exact(source, ["path", "sha256"]);
      need(typeof source.path === "string" && (/^native\\ame-snapshot-probe\\[A-Za-z0-9_.-]+$/.test(source.path) || required.has(source.path)) &&
        !seen.has(source.path) && HEX.test(source.sha256), "fixture_reopen_build_sources_required");
      seen.add(source.path); const file = path.join(localPath(d.repoRoot), source.path), stat = await regularFile(file, filesystem);
      need(Number.isSafeInteger(stat.size) && stat.size <= 1048576, "fixture_reopen_build_source_bounded");
      need(sha(await filesystem.readFile(file)) === source.sha256, "fixture_reopen_build_source_changed");
    }
    need([...required].every(file => seen.has(file)), "fixture_reopen_build_sources_required");
    return Object.freeze({ buildRoot, buildId, receiptSha256: sha(bytes) });
  }
  async function expectedReopenBuild(descriptor) {
    const plugin = await filesystem.readFile(descriptor.pluginPath);
    if (!plugin.includes(Buffer.from(REOPEN_CONTRACT))) return null; // legacy binary retains its clean-only result contract
    need(plugin.includes(Buffer.from(READBACK_SCHEMA)) && plugin.includes(Buffer.from(EVIDENCE_SCHEMA)) && d.repoRoot, "fixture_compiled_reopen_build_required");
    const builds = path.join(localPath(d.repoRoot), ".codex-runtime", "ame-native-prerequisites", "native-probe-build");
    const names = await filesystem.readdir(builds); need(names.length <= 128, "fixture_reopen_build_inventory_bounded");
    const matches = [];
    for (const name of names) {
      if (!/^build-[a-f0-9]{32}$/.test(name) || !plugin.includes(Buffer.from(name))) continue;
      // Expected identity comes from the installed descriptor-pinned image and
      // trusted build root, before any native receipt/self-reported buildId.
      matches.push(await checkReopenBuild(descriptor, path.join(builds, name), name));
    }
    need(matches.length === 1, "fixture_exact_reopen_build_required"); return matches[0];
  }
  async function recheckReopenBuild(s) {
    if (!s.reopenBuild) return;
    await regularFile(s.descriptor.pluginPath, filesystem);
    need(sha(await filesystem.readFile(s.descriptor.pluginPath)) === s.descriptor.pluginSha256, "fixture_child_image_hash_mismatch");
    const currentBuild = await checkReopenBuild(s.descriptor, s.reopenBuild.buildRoot, s.reopenBuild.buildId);
    need(currentBuild.receiptSha256 === s.reopenBuild.receiptSha256, "fixture_reopen_build_receipt_changed");
  }

  function checkContext(context) {
    // Root's private ingress brand comes from the authenticated panel HTTP route;
    // confirmation-surface strings or a raw server ACK cannot substitute for it.
    d.assertManualIngress(context);
    const r = context && context.record, payload = r && r.payload, plan = payload && payload.plan, receipt = r && r.dryRunReceipt;
    need(r && r === d.getCurrentRecord(r.actionId) && ID.test(r.actionId) && Number.isSafeInteger(r.revision) && r.revision >= 0 &&
      context.source === "ai-plan-run" && context.confirm === true && context.autonomous === false && context.allowWithoutCheckpoint === false &&
      context.stepCount === 1 && UUID.test(context.runId) && r.executionId === context.runId && r.executionState === "executing" && r.riskLevel === "mutating" &&
      r.confirmedBySurface === "cep-panel" && r.confirmationSurface === "cep-panel" &&
      Number.isFinite(Date.parse(r.dryRunCompletedAt)) && Number.isFinite(Date.parse(r.confirmedAt)) &&
      Date.parse(r.confirmedAt) >= Date.parse(r.dryRunCompletedAt) && Date.parse(r.confirmedAt) <= clock() &&
      Number.isFinite(Date.parse(r.proposalExpiresAt)) && Date.parse(r.proposalExpiresAt) > clock(), "fixture_manual_m100_required");
    need(payload && payload.kind === "agent_plan" && plan && Array.isArray(plan.steps) && plan.steps.length === 1 &&
      (plan.steps[0].tool || plan.steps[0].toolName) === TOOL_NAME && plan.runtimeBindings === undefined && plan.montagePipeline === undefined &&
      plan.steps[0].resultBindings === undefined && plan.steps[0].bindings === undefined &&
      r.payloadHash === m100.sha256Payload(payload) && /^sha256:[a-f0-9]{64}$/.test(r.payloadHash), "fixture_exact_payload_required");
    need(r.project && samePath(plan.targetProject && plan.targetProject.file, r.project.expectedFile) && receipt &&
      receipt.payloadHash === r.payloadHash && receipt.contractVersion === contractVersion && receipt.stepCount === 1 &&
      receipt.projectFile === r.project.expectedFile, "fixture_current_dry_run_required");
    const cp = context.checkpoint;
    need(cp && cp === d.getCheckpoint(r, context.runId) && cp.checkpointFile && samePath(cp.sourceFile, r.project.expectedFile), "fixture_current_checkpoint_required");
    const args = validateInput(plan.steps[0].safeArgs || plan.steps[0].args || plan.steps[0].arguments || {});
    need(JSON.stringify(validateInput(context.args)) === JSON.stringify(args), "fixture_exact_execution_args_required");
    return args;
  }
  async function checkpointHash(cp) {
    await regularFile(cp.checkpointFile, filesystem);
    return sha(await filesystem.readFile(cp.checkpointFile));
  }
  async function authorize(context) {
    const args = checkContext(context), executionKey = `${context.record.actionId}:${context.record.revision}:${context.runId}`;
    need(!usedAuthorizations.has(executionKey), "fixture_authorize_no_replay");
    usedAuthorizations.add(executionKey);
    const checkpointSha = await checkpointHash(context.checkpoint);
    checkContext(context);
    const capability = Object.freeze({}); capabilities.add(capability);
    authorization.set(capability, { context, args, checkpointSha, record: context.record, revision: context.record.revision,
      payloadHash: context.record.payloadHash, capture: null, stage: null });
    return capability;
  }
  function current(capability) {
    need(capabilities.has(capability), "fixture_private_capability_required");
    const a = authorization.get(capability), args = checkContext(a.context);
    need(a.record === a.context.record && a.revision === a.record.revision && a.payloadHash === a.record.payloadHash &&
      JSON.stringify(a.args) === JSON.stringify(args), "fixture_execution_changed");
    return a;
  }
  function requireStageSource(capability, binding) {
    const a = current(capability);
    need(binding && a.capture === binding.child && children.has(binding.child), "fixture_verified_capture_required");
    const source = childState(binding.child);
    need(source.capability === capability && source.descriptor.role === "capture" && source.state === "snapshot-verified" &&
      source.snapshot === binding.snapshot && source.snapshot && sha(JSON.stringify(source.snapshot)) === binding.snapshotSha256,
      "fixture_verified_capture_required");
    return source;
  }
  function requireReceiptVerifying(child, s) {
    need(childState(child) === s && s.state === "receipt-verifying", "fixture_receipt_verification_changed");
  }
  async function prepareChild(capability, childId) {
    const a = current(capability), descriptor = d.getOwnedChild(childId);
    need(descriptor && TOKEN.test(descriptor.nonce) && TOKEN.test(descriptor.stageId) &&
      (descriptor.role === "capture" || descriptor.role === "stage") && HEX.test(descriptor.pluginSha256) && HEX.test(descriptor.executableSha256) &&
      path.basename(localPath(descriptor.executablePath)).toLowerCase() === "afterfx.exe", "fixture_owned_child_required");
    need(!usedRoots.has(localPath(descriptor.rootPath).toLowerCase()) && !a[descriptor.role], "fixture_child_no_replay");
    usedRoots.add(descriptor.rootPath.toLowerCase());
    a[descriptor.role] = Object.freeze({}); // one preparation attempt per role, even on error
    const descriptorStamp = JSON.stringify(descriptor);
    let sourceBinding = null;
    if (descriptor.role === "stage") {
      const source = a.capture && children.get(a.capture);
      need(source && source.snapshot, "fixture_verified_capture_required");
      sourceBinding = Object.freeze({ child: a.capture, snapshot: source.snapshot, snapshotSha256: sha(JSON.stringify(source.snapshot)) });
      requireStageSource(capability, sourceBinding);
    }
    await inspectOwnedRoot(descriptor, ownedParent, filesystem);
    const reopenBuild = await expectedReopenBuild(descriptor);
    const capture = sourceBinding ? requireStageSource(capability, sourceBinding) : null;
    if (descriptor.role === "stage") {
      need(descriptor.rootPath !== capture.descriptor.rootPath, "fixture_verified_capture_required");
      const input = path.join(descriptor.rootPath, "baseline.aep");
      need(sha(await filesystem.readFile(input)) === capture.snapshot.baselineSha256, "fixture_stage_baseline_copy_mismatch");
      // Verify the owned source assets and baseline again; source root remains alive.
      for (const name of ["baseline.aep", "fixture.bmp", "proxy.bmp"]) await regularFile(path.join(capture.descriptor.rootPath, name), filesystem);
      need(sha(await filesystem.readFile(path.join(capture.descriptor.rootPath, "baseline.aep"))) === capture.snapshot.baselineSha256, "fixture_capture_baseline_changed");
      requireStageSource(capability, sourceBinding);
    }
    current(capability);
    need(d.getOwnedChild(childId) === descriptor && JSON.stringify(descriptor) === descriptorStamp, "fixture_child_descriptor_changed");
    const child = Object.freeze({}), key = crypto.randomBytes(32).toString("hex"), expiry = Math.min(clock() + 300000, Date.parse(a.record.proposalExpiresAt));
    const manifest = { protocol: "2", nonce: descriptor.nonce, plugin_path: localPath(descriptor.pluginPath), plugin_sha256: descriptor.pluginSha256,
      root_path: descriptor.rootPath, stage_id: descriptor.stageId, role: descriptor.role, fixture: a.args.fixtureKind,
      executable_path: descriptor.executablePath, executable_sha256: descriptor.executableSha256,
      source_root: descriptor.role === "capture" ? descriptor.rootPath : capture.descriptor.rootPath,
      baseline_sha256: descriptor.role === "capture" ? ZERO : capture.snapshot.baselineSha256, expires_unix_ms: String(expiry) };
    a[descriptor.role] = child;
    const manifestBytes=sign(manifest,key);
    children.set(child, { capability, childId, descriptor, descriptorStamp, key, state: "prepared", binding: null, expectedSha: null, snapshot: null, grants: new Map(),
      fixture:a.args.fixtureKind,manifestSha256:sha(manifestBytes),expiresUnixMs:expiry,reopenBuild,sourceBinding });
    // Return only to trusted bridge launch code. Never expose env/key in tool output,
    // durable receipts, logs, diagnostics or MCP response payloads.
    return Object.freeze({ child, manifestBytes, environment: Object.freeze({
      AE_AGENT_NATIVE_PROBE_ROOT: descriptor.rootPath, AE_AGENT_NATIVE_PROBE_NONCE: descriptor.nonce, AE_AGENT_NATIVE_FIXTURE_KEY: key }) });
  }
  function childState(child) {
    const s = children.get(child); need(s, "fixture_private_child_required"); current(s.capability);
    need(d.getOwnedChild(s.childId) === s.descriptor && JSON.stringify(s.descriptor) === s.descriptorStamp, "fixture_child_descriptor_changed");
    need(s.state !== "unknown", "fixture_unknown_no_replay"); return s;
  }
  function verifyEnvelope(s, bytes) {
    need(typeof bytes === "string" && Buffer.byteLength(bytes) <= 65536, "fixture_receipt_size");
    const envelope = JSON.parse(bytes); exact(envelope, ["body", "mac"]);
    need(typeof envelope.body === "string" && HEX.test(envelope.mac), "fixture_signed_receipt_required");
    const expected = hmac(s.key, envelope.body);
    need(crypto.timingSafeEqual(Buffer.from(envelope.mac, "hex"), Buffer.from(expected, "hex")), "fixture_receipt_mac_mismatch");
    const b = JSON.parse(envelope.body), descriptor = s.descriptor;
    need(b.schema === SCHEMA && b.hostLoaded === true && b.productionAuthorization === false && b.readiness === false &&
      b.role === descriptor.role && b.fixture === current(s.capability).args.fixtureKind && b.stageId === descriptor.stageId &&
      b.rootPath === descriptor.rootPath && b.nonce === descriptor.nonce && b.pluginSha256 === descriptor.pluginSha256 &&
      TOKEN.test(b.challenge) && Number.isSafeInteger(b.pid) && b.pid > 0 && Number.isSafeInteger(b.processCreatedUnixMs) && b.processCreatedUnixMs > 0 &&
      b.replayAllowed === false, "fixture_receipt_child_binding");
    if (s.binding) need(b.challenge === s.binding.challenge && b.pid === s.binding.pid && b.processCreatedUnixMs === s.binding.processCreatedUnixMs, "fixture_receipt_process_changed");
    need(b.ownedFixtureReopenContract === (s.reopenBuild ? REOPEN_CONTRACT : undefined), "fixture_receipt_reopen_contract_mismatch");
    if (s.reopenBuild) need(b.buildId === s.reopenBuild.buildId && b.productionBackend === false, "fixture_receipt_reopen_build_mismatch");
    return b;
  }
  function fixedReadback(value) {
    return value && value.fixedMainName === "Main" && value.fixedNestedName === "AEAgent Fixture Nested" &&
      value.rootCompositionCount === 1 && typeof value.fixtureEvidence === "string" && value.observedState &&
      Array.isArray(value.observedState.items) && value.observedState.items.length === 4;
  }
  async function verifyFixedReadback(value, kind, variant, sourceRoot) {
    need(fixedReadback(value) && positiveId(value.projectHandle) && typeof value.dirty === "boolean" && HEX.test(value.fixtureCanonicalSha256) &&
      typeof value.extendscriptRevisionObserved === "string" && /^(0|[1-9][0-9]{0,19})$/.test(value.extendscriptRevisionObserved), "fixture_fixed_readback_required");
    const proof = value.fixedFixtureEvidence;
    exact(proof, ["schema", "inspection", "fields", "mediaSha256", "proxySha256", "verified"]);
    need(proof.schema === EVIDENCE_SCHEMA && proof.inspection === "compiled-read-only-fixed-fixture" && proof.verified === true &&
      proof.fields === value.fixtureEvidence && proof.mediaSha256 === MEDIA_SHA && proof.proxySha256 === PROXY_SHA, "fixture_fixed_evidence_required");
    const e = evidenceFields(proof.fields), sentinel = kind === "saved-clean" ? "PERSISTED_SENTINEL" : `UNSAVED_SENTINEL_${kind}`;
    const expected = { sentinel, variant: String(variant), main_name: "Main", nested_name: "AEAgent Fixture Nested", root_comp_count: "1",
      item_count: "4", nested_layer_count: "3", main_layer_count: "2", title_01_text: "Fixture title 01", title_02_text: "Fixture title 02",
      title_01_enabled: variant === 2 ? "0" : "1", title_02_enabled: variant === 2 ? "1" : "0", sentinel_enabled: "1", nested_enabled: "1", image_enabled: "1",
      media_path: path.join(sourceRoot, "fixture.bmp"), proxy_path: path.join(sourceRoot, "proxy.bmp"), use_proxy: "1" };
    need(Object.keys(expected).every(key => e[key] === expected[key]), "fixture_fixed_semantics_mismatch");
    const ids = ["main_id", "nested_id", "media_id", "folder_id"].map(key => e[key]);
    need(ids.every(positiveId) && new Set(ids).size === 4 && e.nested_source_id === e.nested_id && e.image_source_id === e.media_id, "fixture_fixed_links_required");
    // Independently compare the native item/layer graph to the compiled JSX facts.
    const items = value.observedState.items, names = new Map(items.map(item => [item?.name, item]));
    need(names.size === 4 && new Set(items.map(item => item?.id)).size === 4, "fixture_fixed_graph_required");
    const main = names.get("Main"), nested = names.get("AEAgent Fixture Nested"), media = names.get("AEAgent Fixture Image"), folder = names.get("AEAgent Fixture Dependencies");
    need(main && nested && media && folder && main.id === Number(e.main_id) && nested.id === Number(e.nested_id) && media.id === Number(e.media_id) && folder.id === Number(e.folder_id) &&
      main.type === 2 && nested.type === 2 && media.type === 4 && folder.type === 1 && main.parentId === 0 && folder.parentId === 0 &&
      nested.parentId === folder.id && media.parentId === folder.id && main.layers?.length === 2 && nested.layers?.length === 3 &&
      media.mainFootagePath === e.media_path && media.proxyFootagePath === e.proxy_path && Number.isInteger(media.flags) &&
      (media.flags & 6) === 6 && (media.flags & 9) === 0, "fixture_fixed_graph_required");
    const layerNames = new Map([...main.layers, ...nested.layers].map(layer => [layer?.name, layer]));
    need(layerNames.size === 5, "fixture_fixed_layers_required");
    for (const [name, sourceId, enabled] of [["NESTED", nested.id, true], ["IMAGE", media.id, true], ["TITLE_01", 0, variant !== 2], ["TITLE_02", 0, variant === 2], ["SENTINEL", 0, true]]) {
      const layer = layerNames.get(name);
      need(layer && Number.isInteger(layer.flags) && layer.sourceId === sourceId && Boolean(layer.flags & 1) === enabled &&
        (name === "NESTED" || name === "IMAGE" ? main.layers : nested.layers).includes(layer), "fixture_fixed_layers_required");
    }
    for (const [name, expectedSha] of [["fixture.bmp", MEDIA_SHA], ["proxy.bmp", PROXY_SHA]]) {
      const file = path.join(sourceRoot, name); await regularFile(file, filesystem);
      need(sha(await filesystem.readFile(file)) === expectedSha, "fixture_fixed_asset_bytes_changed");
    }
  }
  async function verifyOwnedReopen(s, value, proof, variant, file, fileSha, baselineSha, sourceRoot) {
    exact(proof, ["schema", "operation", "variantIndex", "readbackCompleted", "openedProjectHandle", "observedProjectHandle", "projectHandleMatches",
      "expectedPath", "observedPath", "projectPathMatches", "dirty", "cleanRequired", "expectedFileSha256", "fileSha256Observed", "fileHashObserved", "fileHashMatches",
      "expectedBaselineSha256", "baselineSha256Observed", "baselineHashObserved", "baselineHashMatches", "fixtureCanonicalSha256Observed", "extendscriptRevisionObserved",
      "fixtureEvidenceVerified", "dirtyAfterOpen", "dirtyAfterReadOnlyInspection", "inspectionObserved", "inspectedProjectHandle", "inspectedPath", "failedPredicate"]);
    need(proof.schema === READBACK_SCHEMA && proof.operation === (variant === 0 ? "open-baseline" : "reopen-variant") && proof.variantIndex === variant &&
      proof.readbackCompleted === true && positiveId(proof.openedProjectHandle) && proof.openedProjectHandle === value?.projectHandle &&
      proof.observedProjectHandle === value.projectHandle && proof.inspectedProjectHandle === value.projectHandle && proof.projectHandleMatches === true &&
      proof.expectedPath === file && proof.observedPath === file && proof.inspectedPath === file && value.path === file && proof.projectPathMatches === true &&
      typeof value.dirty === "boolean" && proof.dirty === value.dirty && proof.dirtyAfterOpen === value.dirty && typeof proof.dirtyAfterReadOnlyInspection === "boolean" &&
      proof.cleanRequired === false && proof.expectedFileSha256 === fileSha && proof.fileSha256Observed === fileSha && proof.fileHashObserved === true && proof.fileHashMatches === true &&
      proof.expectedBaselineSha256 === baselineSha && proof.baselineSha256Observed === baselineSha && proof.baselineHashObserved === true && proof.baselineHashMatches === true &&
      proof.fixtureCanonicalSha256Observed === value.fixtureCanonicalSha256 && proof.extendscriptRevisionObserved === value.extendscriptRevisionObserved &&
      proof.fixtureEvidenceVerified === true && proof.inspectionObserved === true && proof.failedPredicate === null, "fixture_owned_reopen_proof_required");
    await regularFile(file, filesystem);
    need(sha(await filesystem.readFile(file)) === fileSha, "fixture_owned_reopen_bytes_changed");
    await verifyFixedReadback(value, current(s.capability).args.fixtureKind, variant, sourceRoot);
  }
  async function acceptReceipt(child, bytes) {
    const s = childState(child);
    const previous = s.state;
    need(["prepared", "create-fixture-issued", "snapshot-issued", "stage-variants-issued"].includes(previous), "fixture_receipt_wrong_phase_no_replay");
    s.state = "receipt-verifying";
    try {
      const b = verifyEnvelope(s, bytes);
      need(await d.inspectProcess(s.descriptor, b) === true, "fixture_live_child_identity_required");
      childState(child);
      if (b.status === "refused_or_unknown") {
        const error = new Error("fixture_native_refusal"); error.code = "fixture_native_refusal";
        error.nativeReason = typeof b.reason === "string" ? b.reason.replace(/[\x00-\x1f\x7f]/g, " ").slice(0, 300) : "native_reason_unavailable";
        throw error; // caught below: terminal unknown, never an ACK or replay
      }
      if (previous === "prepared") {
        need(b.status === "empty_owned_child_waiting_signed_grant" && HEX.test(b.approvalSha256) && b.baseline &&
          b.baseline.path === "" && b.baseline.dirty === false && b.baseline.observedState && b.baseline.observedState.items.length === 0 &&
          b.nativeSaveDispatches === 0 && b.fixtureMutationDispatches === 0, "fixture_empty_boot_required");
        const capture = s.descriptor.role === "stage" ? requireStageSource(s.capability, s.sourceBinding) : null;
        need(b.baselineInputSha256 === (s.descriptor.role === "capture" ? ZERO : capture.snapshot.baselineSha256), "fixture_boot_input_mismatch");
        s.binding = { nonce: b.nonce, challenge: b.challenge, pid: b.pid, processCreatedUnixMs: b.processCreatedUnixMs };
        s.expectedSha = b.approvalSha256; s.state = "boot-verified";
      } else if (previous === "create-fixture-issued") {
        const kind = current(s.capability).args.fixtureKind;
        need(b.status === "source_fixture_ready" && HEX.test(b.approvalSha256) && fixedReadback(b.source) && b.layerSwitchDispatches === 0 &&
          b.source.path === (kind === "untitled-dirty" ? "" : path.join(s.descriptor.rootPath, "source.aep")) && b.source.dirty === (kind !== "saved-clean"), "fixture_source_receipt_required");
        verifyGrantReceipt(s, b, "create-fixture");
        if (s.reopenBuild) await verifyFixedReadback(b.source, kind, 0, s.descriptor.rootPath);
        requireReceiptVerifying(child, s);
        s.source = b.source; s.expectedSha = b.approvalSha256; s.state = "fixture-verified";
      } else if (previous === "snapshot-issued") {
        need(b.status === "fixture_baseline_saved_source_preserved" && HEX.test(b.baselineSha256) &&
          b.baselinePath === path.join(s.descriptor.rootPath, "baseline.aep") && b.layerSwitchDispatches === 0 && b.sourceBefore && b.sourceAfter &&
          b.sourceBefore.path === b.sourceAfter.path && b.sourceBefore.dirty === b.sourceAfter.dirty &&
          b.sourceBefore.projectHandle === b.sourceAfter.projectHandle && b.sourceBefore.fixtureCanonicalSha256 === b.sourceAfter.fixtureCanonicalSha256 &&
          b.sourceBefore.fixtureEvidence === b.sourceAfter.fixtureEvidence && JSON.stringify(b.sourceBefore) === JSON.stringify(s.source), "fixture_snapshot_preservation_required");
        verifyGrantReceipt(s, b, "snapshot");
        if (s.reopenBuild) await verifyFixedReadback(b.sourceAfter, current(s.capability).args.fixtureKind, 0, s.descriptor.rootPath);
        requireReceiptVerifying(child, s);
        s.snapshot = b; s.state = "snapshot-verified"; // publish only after every awaited inspection succeeds
      } else if (previous === "stage-variants-issued") {
        const capture = requireStageSource(s.capability, s.sourceBinding);
        need(b.status === "two_owned_variants_reopened" && b.ameSubmissionAttempted === false && Array.isArray(b.outputs) && b.outputs.length === 2, "fixture_two_variants_required");
        need(b.baselineSha256 === capture.snapshot.baselineSha256, "fixture_stage_baseline_mismatch");
        verifyGrantReceipt(s, b, "stage-variants");
        need(b.fixtureResultSchema === (s.reopenBuild ? REOPEN_CONTRACT : undefined), "fixture_result_reopen_contract_mismatch");
        if (s.reopenBuild) {
          await recheckReopenBuild(s);
          need(b.outputs[0].sha256 !== b.outputs[1].sha256, "fixture_variant_snapshots_independent_required");
          exact(b.baselineReadback, ["readback", "proof"]);
          const baselinePath = path.join(s.descriptor.rootPath, "baseline.aep"), sourceRoot = capture.descriptor.rootPath;
          await verifyOwnedReopen(s, b.baselineReadback.readback, b.baselineReadback.proof, 0, baselinePath, b.baselineSha256, b.baselineSha256, sourceRoot);
          for (let index = 0; index < b.outputs.length; index++) {
            const output = b.outputs[index]; exact(output, ["variant", "path", "sha256", "reopened", "readback", "proof"]);
            need(output.variant === index + 1 && output.path === path.join(s.descriptor.rootPath, `variant-0${index + 1}.aep`) && HEX.test(output.sha256) && output.reopened === true,
              "fixture_variant_readback_required");
            await verifyOwnedReopen(s, output.readback, output.proof, index + 1, output.path, output.sha256, b.baselineSha256, sourceRoot);
          }
          // Fresh bytes of both independently owned baselines must still match.
          for (const root of [sourceRoot, s.descriptor.rootPath]) {
            const file = path.join(root, "baseline.aep"); await regularFile(file, filesystem);
            need(sha(await filesystem.readFile(file)) === b.baselineSha256, "fixture_stage_baseline_mismatch");
          }
        } else b.outputs.forEach((output, index) => need(output.variant === index + 1 && output.path === path.join(s.descriptor.rootPath, `variant-0${index + 1}.aep`) &&
          HEX.test(output.sha256) && output.reopened === true && fixedReadback(output.readback) && output.readback.path === output.path && output.readback.dirty === false, "fixture_variant_readback_required"));
        requireStageSource(s.capability, s.sourceBinding);
        requireReceiptVerifying(child, s);
        s.state = "variants-verified";
      } else fail("fixture_receipt_wrong_phase_no_replay");
      return Object.freeze({ status: s.state, receipt: b });
    } catch (error) { s.state = "unknown"; throw error; }
  }
  function verifyGrantReceipt(s, body, operation) {
    const expected = s.grants.get(operation), g = body.grant;
    need(expected && g && Object.keys(expected).every(key => g[key] === expected[key]), "fixture_receipt_grant_mismatch");
  }
  async function issuePhase(child, operation) {
    const s = childState(child), a = current(s.capability), capture = s.descriptor.role === "capture";
    const allowed = capture ? ((s.state === "boot-verified" && operation === "create-fixture") || (s.state === "fixture-verified" && operation === "snapshot")) :
      s.state === "boot-verified" && operation === "stage-variants";
    need(allowed, "fixture_phase_no_replay");
    const now = clock(), expiry = Math.min(now + 300000, Date.parse(a.record.proposalExpiresAt));
    s.state = `${operation}-issuing`; // synchronous reservation blocks concurrent calls
    try {
    const source = operation === "stage-variants" ? requireStageSource(s.capability, s.sourceBinding) : null;
    await recheckReopenBuild(s); // exact compiled contract pin before any phase grant/variant dispatch
    need(await checkpointHash(a.context.checkpoint) === a.checkpointSha && await d.inspectProcess(s.descriptor, s.binding) === true, "fixture_checkpoint_or_child_changed");
    if (operation === "stage-variants" && s.reopenBuild) {
      requireStageSource(s.capability, s.sourceBinding);
      await verifyFixedReadback(source.snapshot.sourceAfter, a.args.fixtureKind, 0, source.descriptor.rootPath);
      for (const root of [source.descriptor.rootPath, s.descriptor.rootPath]) {
        const file = path.join(root, "baseline.aep"); await regularFile(file, filesystem);
        need(sha(await filesystem.readFile(file)) === source.snapshot.baselineSha256, "fixture_stage_baseline_mismatch");
      }
    }
    if (source) requireStageSource(s.capability, s.sourceBinding);
    childState(child);
    const f = { protocol: "2", operation, stage_id: s.descriptor.stageId, nonce: s.binding.nonce, challenge: s.binding.challenge,
      pid: String(s.binding.pid), process_created_unix_ms: String(s.binding.processCreatedUnixMs), plugin_sha256: s.descriptor.pluginSha256,
      root_path: s.descriptor.rootPath, expected_sha256: s.expectedSha, fixture: a.args.fixtureKind,
      restore_dirty: operation === "snapshot" && a.args.restoreDirty ? "1" : "0", expires_unix_ms: String(expiry),
      action_id: a.record.actionId, revision: String(a.revision), payload_sha256: a.payloadHash.slice(7), run_id: a.context.runId,
      checkpoint_sha256: a.checkpointSha, contract_version: contractVersion };
      const consume = { schema: "ae-agent.native-fixture-attempt.v2", actionId: f.action_id, revision: a.revision, payloadHash: a.payloadHash,
        runId: f.run_id, checkpointSha256: a.checkpointSha, stageId: f.stage_id, nonce: f.nonce, operation, expectedSha256: s.expectedSha, status: "consumed_before_grant_publication", replayAllowed: false };
      need(await d.consumeAttempt(Object.freeze(consume)) === true, "fixture_durable_consume_required");
      childState(child);
      if (source) requireStageSource(s.capability, s.sourceBinding);
      need(clock() < expiry, "fixture_grant_expired_during_consume");
      const bytes = sign(f, s.key), mac = hmac(s.key, canonicalFields(f));
      s.grants.set(operation, { operation, stageId: f.stage_id, actionId: f.action_id, revision: a.revision, runId: f.run_id,
        payloadSha256: f.payload_sha256, checkpointSha256: f.checkpoint_sha256, contractVersion, expiresUnixMs: expiry, grantMac: mac });
      s.state = `${operation}-issued`;
      return Object.freeze({ filename: `signed-${operation}.grant`, bytes, expiresUnixMs: expiry, replayAllowed: false });
    } catch (error) { s.state = "unknown"; throw error; }
  }
  function markUnknown(child) { const s = children.get(child); need(s, "fixture_private_child_required"); s.state = "unknown"; }
  // A terminal bootstrap refusal can be checked after proposal expiry. This
  // path cannot ACK a phase, mint a grant, revive a capability or retire a host.
  async function verifyBootstrapRefusal(child,bytes) {
    const s=children.get(child); need(s,"fixture_private_child_required");
    need(typeof bytes==="string" && Buffer.byteLength(bytes)<=65536,"fixture_receipt_size");
    const envelope=JSON.parse(bytes);exact(envelope,["body","mac"]);
    need(typeof envelope.body==="string" && HEX.test(envelope.mac),"fixture_signed_receipt_required");
    need(crypto.timingSafeEqual(Buffer.from(envelope.mac,"hex"),Buffer.from(hmac(s.key,envelope.body),"hex")),"fixture_receipt_mac_mismatch");
    const b=JSON.parse(envelope.body), d=s.descriptor;
    exact(b,["schema","status","reason","hostLoaded","productionAuthorization","readiness","role","fixture","stageId","rootPath","nonce","challenge","pluginSha256","executableSha256","pid","processCreatedUnixMs","manifestSha256","expiresUnixMs","refusedAtUnixMs","suitesAcquired","fixtureMutationDispatches","nativeSaveDispatches","replayAllowed"]);
    need(b.schema==="ae-agent.native-fixture-bootstrap-refusal.v1" && b.status==="bootstrap_refused_before_suite_acquisition" &&
      typeof b.reason==="string" && b.reason.length>0 && b.reason.length<=300 && b.hostLoaded===true && b.productionAuthorization===false && b.readiness===false &&
      b.role===d.role && b.fixture===s.fixture && b.stageId===d.stageId && b.rootPath===d.rootPath && b.nonce===d.nonce && TOKEN.test(b.challenge) &&
      Number.isSafeInteger(b.pid) && b.pid>0 && Number.isSafeInteger(b.processCreatedUnixMs) && b.processCreatedUnixMs>0 &&
      (!s.binding || b.challenge===s.binding.challenge && b.pid===s.binding.pid && b.processCreatedUnixMs===s.binding.processCreatedUnixMs) &&
      b.pluginSha256===d.pluginSha256 && b.executableSha256===d.executableSha256 && b.manifestSha256===s.manifestSha256 && b.expiresUnixMs===s.expiresUnixMs &&
      Number.isSafeInteger(b.refusedAtUnixMs) && b.refusedAtUnixMs>=s.expiresUnixMs && b.refusedAtUnixMs<=clock() && b.suitesAcquired===false &&
      b.fixtureMutationDispatches===0 && b.nativeSaveDispatches===0 && b.replayAllowed===false,"fixture_bootstrap_refusal_binding");
    need(await dependencies.inspectProcess(d,b)===true,"fixture_live_child_identity_required");
    return Object.freeze({schema:b.schema,endpointInert:true,processExited:false,nativeExecutionProven:false,replayAllowed:false,receipt:b});
  }
  return Object.freeze({ authorize, prepareChild, acceptReceipt, issuePhase, markUnknown,verifyBootstrapRefusal });
}

module.exports = { TOOL_NAME, SCHEMA, REOPEN_CONTRACT, READBACK_SCHEMA, EVIDENCE_SCHEMA, validateInput, canonicalFields, inspectOwnedRoot, createFixtureGrantIssuer };
