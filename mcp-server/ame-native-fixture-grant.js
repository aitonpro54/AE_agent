"use strict";

// Private backend component. No public MCP/raw/admin operation can mint a grant.
// Filesystem ownership here is cooperative; it is not same-user adversary isolation.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path").win32;
const m100 = require("./m100-protocol");

const TOOL_NAME = "ame_native_fixture_probe";
const SCHEMA = "ae-agent.native-fixture-probe.v2";
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
  const ownerFile = path.join(root, "server-owner.json");
  await regularFile(ownerFile, filesystem);
  const marker = JSON.parse(await filesystem.readFile(ownerFile, "utf8"));
  exact(marker, ["schema", "rootPath", "nonce", "stageId", "role"]);
  need(marker.schema === "ae-agent.native-fixture-owner.v2" && marker.rootPath === root && marker.nonce === descriptor.nonce &&
    marker.stageId === descriptor.stageId && marker.role === descriptor.role, "fixture_root_owner_mismatch");
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
  async function prepareChild(capability, childId) {
    const a = current(capability), descriptor = d.getOwnedChild(childId);
    need(descriptor && TOKEN.test(descriptor.nonce) && TOKEN.test(descriptor.stageId) &&
      (descriptor.role === "capture" || descriptor.role === "stage") && HEX.test(descriptor.pluginSha256) && HEX.test(descriptor.executableSha256) &&
      path.basename(localPath(descriptor.executablePath)).toLowerCase() === "afterfx.exe", "fixture_owned_child_required");
    need(!usedRoots.has(localPath(descriptor.rootPath).toLowerCase()) && !a[descriptor.role], "fixture_child_no_replay");
    usedRoots.add(descriptor.rootPath.toLowerCase());
    a[descriptor.role] = Object.freeze({}); // one preparation attempt per role, even on error
    const descriptorStamp = JSON.stringify(descriptor);
    await inspectOwnedRoot(descriptor, ownedParent, filesystem);
    const capture = a.capture && children.get(a.capture);
    if (descriptor.role === "stage") {
      need(capture && capture.state === "snapshot-verified" && capture.snapshot && descriptor.rootPath !== capture.descriptor.rootPath, "fixture_verified_capture_required");
      const input = path.join(descriptor.rootPath, "baseline.aep");
      need(sha(await filesystem.readFile(input)) === capture.snapshot.baselineSha256, "fixture_stage_baseline_copy_mismatch");
      // Verify the owned source assets and baseline again; source root remains alive.
      for (const name of ["baseline.aep", "fixture.bmp", "proxy.bmp"]) await regularFile(path.join(capture.descriptor.rootPath, name), filesystem);
      need(sha(await filesystem.readFile(path.join(capture.descriptor.rootPath, "baseline.aep"))) === capture.snapshot.baselineSha256, "fixture_capture_baseline_changed");
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
    children.set(child, { capability, childId, descriptor, descriptorStamp, key, state: "prepared", binding: null, expectedSha: null, snapshot: null, grants: new Map() });
    // Return only to trusted bridge launch code. Never expose env/key in tool output,
    // durable receipts, logs, diagnostics or MCP response payloads.
    return Object.freeze({ child, manifestBytes: sign(manifest, key), environment: Object.freeze({
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
    return b;
  }
  function fixedReadback(value) {
    return value && value.fixedMainName === "Main" && value.fixedNestedName === "AEAgent Fixture Nested" &&
      value.rootCompositionCount === 1 && typeof value.fixtureEvidence === "string" && value.observedState &&
      Array.isArray(value.observedState.items) && value.observedState.items.length === 4;
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
        const a = current(s.capability), capture = a.capture && children.get(a.capture);
        need(b.baselineInputSha256 === (s.descriptor.role === "capture" ? ZERO : capture.snapshot.baselineSha256), "fixture_boot_input_mismatch");
        s.binding = { nonce: b.nonce, challenge: b.challenge, pid: b.pid, processCreatedUnixMs: b.processCreatedUnixMs };
        s.expectedSha = b.approvalSha256; s.state = "boot-verified";
      } else if (previous === "create-fixture-issued") {
        const kind = current(s.capability).args.fixtureKind;
        need(b.status === "source_fixture_ready" && HEX.test(b.approvalSha256) && fixedReadback(b.source) && b.layerSwitchDispatches === 0 &&
          b.source.path === (kind === "untitled-dirty" ? "" : path.join(s.descriptor.rootPath, "source.aep")) && b.source.dirty === (kind !== "saved-clean"), "fixture_source_receipt_required");
        verifyGrantReceipt(s, b, "create-fixture");
        s.source = b.source; s.expectedSha = b.approvalSha256; s.state = "fixture-verified";
      } else if (previous === "snapshot-issued") {
        need(b.status === "fixture_baseline_saved_source_preserved" && HEX.test(b.baselineSha256) &&
          b.baselinePath === path.join(s.descriptor.rootPath, "baseline.aep") && b.layerSwitchDispatches === 0 && b.sourceBefore && b.sourceAfter &&
          b.sourceBefore.path === b.sourceAfter.path && b.sourceBefore.dirty === b.sourceAfter.dirty &&
          b.sourceBefore.projectHandle === b.sourceAfter.projectHandle && b.sourceBefore.fixtureCanonicalSha256 === b.sourceAfter.fixtureCanonicalSha256 &&
          b.sourceBefore.fixtureEvidence === b.sourceAfter.fixtureEvidence && JSON.stringify(b.sourceBefore) === JSON.stringify(s.source), "fixture_snapshot_preservation_required");
        verifyGrantReceipt(s, b, "snapshot"); s.snapshot = b; s.state = "snapshot-verified";
      } else if (previous === "stage-variants-issued") {
        const capture = children.get(current(s.capability).capture);
        need(b.status === "two_owned_variants_reopened" && b.ameSubmissionAttempted === false && Array.isArray(b.outputs) && b.outputs.length === 2, "fixture_two_variants_required");
        need(b.baselineSha256 === capture.snapshot.baselineSha256, "fixture_stage_baseline_mismatch");
        verifyGrantReceipt(s, b, "stage-variants");
        b.outputs.forEach((output, index) => need(output.variant === index + 1 && output.path === path.join(s.descriptor.rootPath, `variant-0${index + 1}.aep`) &&
          HEX.test(output.sha256) && output.reopened === true && fixedReadback(output.readback) && output.readback.path === output.path && output.readback.dirty === false, "fixture_variant_readback_required"));
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
    need(await checkpointHash(a.context.checkpoint) === a.checkpointSha && await d.inspectProcess(s.descriptor, s.binding) === true, "fixture_checkpoint_or_child_changed");
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
      need(clock() < expiry, "fixture_grant_expired_during_consume");
      const bytes = sign(f, s.key), mac = hmac(s.key, canonicalFields(f));
      s.grants.set(operation, { operation, stageId: f.stage_id, actionId: f.action_id, revision: a.revision, runId: f.run_id,
        payloadSha256: f.payload_sha256, checkpointSha256: f.checkpoint_sha256, contractVersion, expiresUnixMs: expiry, grantMac: mac });
      s.state = `${operation}-issued`;
      return Object.freeze({ filename: `signed-${operation}.grant`, bytes, expiresUnixMs: expiry, replayAllowed: false });
    } catch (error) { s.state = "unknown"; throw error; }
  }
  function markUnknown(child) { const s = children.get(child); need(s, "fixture_private_child_required"); s.state = "unknown"; }
  return Object.freeze({ authorize, prepareChild, acceptReceipt, issuePhase, markUnknown });
}

module.exports = { TOOL_NAME, SCHEMA, validateInput, canonicalFields, inspectOwnedRoot, createFixtureGrantIssuer };
