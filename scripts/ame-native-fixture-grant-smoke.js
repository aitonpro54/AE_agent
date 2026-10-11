"use strict";
// Offline contract tests: mock filesystem/processes and signed receipt fixtures.
// Does not publish a live grant, start AE, install a plugin or mutate a project.
const assert = require("assert/strict");
const crypto = require("crypto");
const path = require("path").win32;
const fixture = require("../mcp-server/ame-native-fixture-grant");
const { createManualPlanIngress } = require("../mcp-server/cep-manual-plan-ingress");
const m100 = require("../mcp-server/m100-protocol");
let passed = 0;
const checks = [];
function checked(name, fn) { fn(); checks.push(name); ++passed; }
async function rejected(name, work) { await assert.rejects(work); checks.push(name); ++passed; }
function hash(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function bitmap(proxy) {
  const b = Buffer.alloc(70); b.write("BM"); b.writeUInt32LE(70, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14); b.writeUInt32LE(2, 18); b.writeUInt32LE(2, 22);
  b[26] = 1; b[28] = 24; b.writeUInt32LE(16, 34);
  for (let row = 0; row < 2; row++) for (let col = 0; col < 2; col++) { const p = 54 + row * 8 + col * 3; b[p] = 20; b[p + 1] = proxy ? 220 : 40; b[p + 2] = proxy ? 40 : 220; }
  return b;
}
function setup(kind = "saved-dirty", restoreDirty = false, reopen = false) {
  const now = Date.now(), ingress = createManualPlanIngress(), files = new Map(), badLinks = new Set(), badReparse = new Set();let clock=now;
  const ownedParent = "C:\\owned\\fixtures", pluginPath = "C:\\owned\\build\\Probe.aex", executablePath = "C:\\Adobe\\AfterFX.exe";
  const repoRoot = "C:\\repo", buildId = "build-" + "a".repeat(32), buildRoot = path.join(repoRoot, ".codex-runtime", "ame-native-prerequisites", "native-probe-build", buildId);
  files.set(pluginPath, Buffer.from(reopen ? [fixture.REOPEN_CONTRACT, fixture.READBACK_SCHEMA, fixture.EVIDENCE_SCHEMA, buildId].join("\0") : "fake offline plugin"));
  files.set(executablePath, Buffer.from("fake offline executable"));
  const buildReceiptPath = path.join(buildRoot, "build-receipt.json");
  if (reopen) {
    const sourceFiles = ["native\\ame-snapshot-probe\\ame_snapshot_probe.cpp", "native\\ame-snapshot-probe\\probe_stage_readback.h", "native\\ame-snapshot-probe\\fixture_reopen_contract.h",
      "native\\ame-snapshot-probe\\fixture_program.h", "native\\ame-snapshot-probe\\protocol_smoke.cpp", "scripts\\ame-native-probe-build.ps1",
      "mcp-server\\ame-native-fixture-grant.js", "scripts\\ame-native-fixture-grant-smoke.js"].map(name => {
      const bytes = Buffer.from("offline current source " + name); files.set(path.join(repoRoot, name), bytes); return { path: name, sha256: hash(bytes) };
    });
    const binaryPath = path.join(buildRoot, "bin", "AEAgentSnapshotProbe.aex"); files.set(binaryPath, files.get(pluginPath));
    files.set(buildReceiptPath, Buffer.from(JSON.stringify({ schema: "ae-agent.native-probe-build.v2", buildId, binaryPath, binarySha256: hash(files.get(pluginPath)),
      ownedFixtureReopenContract: fixture.REOPEN_CONTRACT, ownedFixtureReadbackSchema: fixture.READBACK_SCHEMA, fixedFixtureEvidenceSchema: fixture.EVIDENCE_SCHEMA,
      ownedFixtureReopenContractCompiled: true, signedFixturePathCompiled: true, sourceHashesStableAcrossBuild: true, offlineValidationAccepted: true,
      protocolSmokeExitCode: 0, productionBackend: false, protocolSmoke: { ownedFixtureReopenChecks: 100 }, fixtureGrantSmoke: { ownedFixtureReopenChecks: 50 }, sourceFiles })));
  }
  const args = { fixtureKind: kind, restoreDirty }, runId = "12345678-1234-4234-8234-123456789012";
  const record = { actionId: "action_fixture_123", revision: 2, executionId: runId, executionState: "executing", riskLevel: "mutating",
    confirmedBySurface: "cep-panel", confirmationSurface: "cep-panel", confirmedAt: new Date(now - 1000).toISOString(),
    dryRunCompletedAt: new Date(now - 2000).toISOString(), proposalExpiresAt: new Date(now + 600000).toISOString(),
    project: { expectedFile: "C:\\project\\Original.aep" }, previewHash: "sha256:" + "a".repeat(64),
    payload: { kind: "agent_plan", plan: { targetProject: { file: "C:\\project\\Original.aep" }, steps: [{ tool: fixture.TOOL_NAME, args }] } } };
  record.payloadHash = m100.sha256Payload(record.payload);
  const contractVersion = "ae-agent.3.3.1";
  record.dryRunReceipt = { payloadHash: record.payloadHash, projectFile: record.project.expectedFile, contractVersion, stepCount: 1 };
  const checkpoint = { sourceFile: record.project.expectedFile, checkpointFile: "C:\\owned\\checkpoint.aep" };
  files.set(checkpoint.checkpointFile, Buffer.from("offline checkpoint"));
  const context = { record, runId, source: "ai-plan-run", confirm: true, autonomous: false, allowWithoutCheckpoint: false, stepCount: 1, checkpoint, args };
  const descriptors = new Map();
  for (const [id, role, letter] of [["capture", "capture", "b"], ["stage", "stage", "c"]]) {
    const nonce = letter.repeat(32), rootPath = path.join(ownedParent, `probe-${nonce}`);
    const descriptor = Object.freeze({ nonce, stageId: (role === "capture" ? "d" : "e").repeat(32), role, rootPath, pluginPath,
      pluginSha256: hash(files.get(pluginPath)), executablePath, executableSha256: hash(files.get(executablePath)) });
    descriptors.set(id, descriptor);
    const marker={ schema: "ae-agent.native-fixture-owner.v2", rootPath, nonce, stageId: descriptor.stageId, role };
    files.set(path.join(path.dirname(ownedParent),"ame-native-fixture-ledger",descriptor.stageId,"owner.json"),Buffer.from(JSON.stringify({schema:"ae-agent.native-fixture-attempt-ledger.v1.envelope",sha256:hash(JSON.stringify(marker)),value:marker})));
  }
  let readHook = null, consumeHook = null;
  const filesystem = {
    async lstat(file) { const regular = files.has(file); return { size: regular ? files.get(file).length : 0, nlink: badLinks.has(file) ? 2 : 1, isFile: () => regular,
      isDirectory: () => !regular, isSymbolicLink: () => badReparse.has(file) }; },
    async realpath(file) { return file; }, async readdir(dir) { if (reopen && dir === path.dirname(buildRoot)) return [buildId]; return Array.from(files.keys()).filter(file=>path.dirname(file)===dir).map(file=>path.basename(file));},
    async readFile(file, encoding) { if (readHook) await readHook(file); assert(files.has(file), `missing mock file: ${file}`); const b = files.get(file); return encoding ? b.toString(encoding) : b; }
  };
  let current = record, processValid = true, consumeValid = true, consumed = 0, consumeGate = null;
  const seen = new Set();
  const issuer = fixture.createFixtureGrantIssuer({ ownedParent, contractVersion, filesystem, repoRoot, now: () => clock,
    assertManualIngress: ingress.assertContext, getCurrentRecord: () => current, getCheckpoint: () => checkpoint,
    getOwnedChild: id => descriptors.get(id), inspectProcess: async () => processValid,
    consumeAttempt: async receipt => { ++consumed; assert.equal(receipt.status, "consumed_before_grant_publication");
      assert.equal(receipt.replayAllowed, false); assert(!JSON.stringify(receipt).includes("NATIVE_FIXTURE_KEY"));
      const key = `${receipt.stageId}:${receipt.operation}`; assert(!seen.has(key)); seen.add(key);
      if (consumeHook) consumeHook(receipt);
      if (consumeGate) await consumeGate; return consumeValid; } });
  const meta = { route: "/agents/plan/run", authRole: "panel", key: { actionId: record.actionId, payloadHash: record.payloadHash, previewHash: record.previewHash, riskLevel: record.riskLevel } };
  const inside = work => ingress.runAuthenticated(meta, async () => { ingress.brand(context); return work(); });
  const send = (prepared, body) => { const bytes = JSON.stringify(body), key = prepared.environment.AE_AGENT_NATIVE_FIXTURE_KEY;
    return issuer.acceptReceipt(prepared.child, JSON.stringify({ body: bytes, mac: crypto.createHmac("sha256", Buffer.from(key, "hex")).update(bytes).digest("hex") })); };
  const base = prepared => {
    const descriptor = descriptors.get(prepared.environment.AE_AGENT_NATIVE_PROBE_NONCE[0] === "b" ? "capture" : "stage");
    return { schema: fixture.SCHEMA, hostLoaded: true, readiness: false, productionAuthorization: false, replayAllowed: false,
      role: descriptor.role, fixture: kind, stageId: descriptor.stageId, rootPath: descriptor.rootPath, nonce: descriptor.nonce,
      pluginSha256: descriptor.pluginSha256, challenge: "f".repeat(32), pid: 101, processCreatedUnixMs: now - 10000,
      nativeSaveDispatches: 0, fixtureMutationDispatches: 0, ...(reopen ? { buildId, ownedFixtureReopenContract: fixture.REOPEN_CONTRACT, productionBackend: false } : {}) };
  };
  const boot = async (prepared, baselineSha = "0".repeat(64)) => send(prepared, { ...base(prepared), status: "empty_owned_child_waiting_signed_grant",
    approvalSha256: "1".repeat(64), baselineInputSha256: baselineSha, baseline: { path: "", dirty: false, observedState: { items: [] } } });
  const completeReadback = (variant, file, dirty) => {
    const captureRoot = descriptors.get("capture").rootPath;
    const e = { sentinel: kind === "saved-clean" ? "PERSISTED_SENTINEL" : `UNSAVED_SENTINEL_${kind}`, variant: String(variant), main_name: "Main", nested_name: "AEAgent Fixture Nested", root_comp_count: "1",
      media_path: path.join(captureRoot, "fixture.bmp"), proxy_path: path.join(captureRoot, "proxy.bmp"), use_proxy: "1", item_count: "4", nested_layer_count: "3", main_layer_count: "2",
      title_01_text: "Fixture title 01", title_02_text: "Fixture title 02", title_01_enabled: variant === 2 ? "0" : "1", title_02_enabled: variant === 2 ? "1" : "0",
      sentinel_enabled: "1", nested_enabled: "1", image_enabled: "1", main_id: "1", nested_id: "2", media_id: "3", folder_id: "4", nested_source_id: "2", image_source_id: "3" };
    const fields = Object.keys(e).map(key => `${key}=${e[key]}\n`).join("");
    return { projectHandle: String(100 + variant), path: file, dirty, fixtureCanonicalSha256: "2".repeat(64), extendscriptRevisionObserved: "3",
      fixedMainName: "Main", fixedNestedName: "AEAgent Fixture Nested", rootCompositionCount: 1, fixtureEvidence: fields,
      fixedFixtureEvidence: { schema: fixture.EVIDENCE_SCHEMA, inspection: "compiled-read-only-fixed-fixture", fields, mediaSha256: hash(bitmap(false)), proxySha256: hash(bitmap(true)), verified: true },
      observedState: { items: [
        { id: 1, name: "Main", type: 2, parentId: 0, layers: [{ name: "NESTED", sourceId: 2, flags: 1 }, { name: "IMAGE", sourceId: 3, flags: 1 }] },
        { id: 2, name: "AEAgent Fixture Nested", type: 2, parentId: 4, layers: [{ name: "TITLE_01", sourceId: 0, flags: variant === 2 ? 0 : 1 }, { name: "TITLE_02", sourceId: 0, flags: variant === 2 ? 1 : 0 }, { name: "SENTINEL", sourceId: 0, flags: 1 }] },
        { id: 3, name: "AEAgent Fixture Image", type: 4, parentId: 4, flags: 6, mainFootagePath: e.media_path, proxyFootagePath: e.proxy_path },
        { id: 4, name: "AEAgent Fixture Dependencies", type: 1, parentId: 0 } ] } };
  };
  const sourceFile = kind === "untitled-dirty" ? "" : path.join(descriptors.get("capture").rootPath, "source.aep");
  const source = reopen ? completeReadback(0, sourceFile, kind !== "saved-clean") : { projectHandle: "100", path: sourceFile,
    dirty: kind !== "saved-clean", fixtureCanonicalSha256: "2".repeat(64), extendscriptRevisionObserved: "3", observedState: { items: [1, 2, 3, 4] },
    fixtureEvidence: "offline-sentinel", fixedMainName: "Main", fixedNestedName: "AEAgent Fixture Nested", rootCompositionCount: 1 };
  function grantBody(issued) {
    const f = Object.fromEntries(issued.bytes.trim().split("\n").map(line => { const n = line.indexOf("="); return [line.slice(0, n), line.slice(n + 1)]; }));
    return { operation: f.operation, stageId: f.stage_id, actionId: f.action_id, revision: Number(f.revision), runId: f.run_id,
      payloadSha256: f.payload_sha256, checkpointSha256: f.checkpoint_sha256, contractVersion: f.contract_version, expiresUnixMs: Number(f.expires_unix_ms), grantMac: f.mac };
  }
  async function captureReady() {
    const cap = await issuer.authorize(context), prepared = await issuer.prepareChild(cap, "capture"); await boot(prepared);
    const issued = await issuer.issuePhase(prepared.child, "create-fixture");
    if (reopen) { const root = descriptors.get("capture").rootPath; files.set(path.join(root, "fixture.bmp"), bitmap(false)); files.set(path.join(root, "proxy.bmp"), bitmap(true)); }
    await send(prepared, { ...base(prepared), status: "source_fixture_ready", source, approvalSha256: "3".repeat(64), layerSwitchDispatches: 0, grant: grantBody(issued) });
    return { cap, prepared };
  }
  const reopenProof = (readback, variant, file, fileSha, baselineSha) => ({ schema: fixture.READBACK_SCHEMA, operation: variant === 0 ? "open-baseline" : "reopen-variant", variantIndex: variant,
    readbackCompleted: true, openedProjectHandle: readback.projectHandle, observedProjectHandle: readback.projectHandle, projectHandleMatches: true,
    expectedPath: file, observedPath: file, projectPathMatches: true, dirty: readback.dirty, cleanRequired: false, expectedFileSha256: fileSha, fileSha256Observed: fileSha,
    fileHashObserved: true, fileHashMatches: true, expectedBaselineSha256: baselineSha, baselineSha256Observed: baselineSha, baselineHashObserved: true, baselineHashMatches: true,
    fixtureCanonicalSha256Observed: readback.fixtureCanonicalSha256, extendscriptRevisionObserved: readback.extendscriptRevisionObserved, fixtureEvidenceVerified: true,
    dirtyAfterOpen: readback.dirty, dirtyAfterReadOnlyInspection: readback.dirty, inspectionObserved: true, inspectedProjectHandle: readback.projectHandle, inspectedPath: file, failedPredicate: null });
  async function snapshotReady() {
    const { cap, prepared } = await captureReady(), issued = await issuer.issuePhase(prepared.child, "snapshot"), baselineSha = hash("owned baseline");
    await send(prepared, { ...base(prepared), status: "fixture_baseline_saved_source_preserved", grant: grantBody(issued), sourceBefore: source, sourceAfter: { ...source, extendscriptRevisionObserved: "4" },
      layerSwitchDispatches: 0, baselineSha256: baselineSha, baselinePath: path.join(descriptors.get("capture").rootPath, "baseline.aep") });
    for (const id of ["capture", "stage"]) files.set(path.join(descriptors.get(id).rootPath, "baseline.aep"), Buffer.from("owned baseline"));
    if (!reopen) { const root = descriptors.get("capture").rootPath; files.set(path.join(root, "fixture.bmp"), bitmap(false)); files.set(path.join(root, "proxy.bmp"), bitmap(true)); }
    return { cap, prepared, baselineSha };
  }
  async function stagePrepared() {
    const { cap, prepared, baselineSha } = await snapshotReady();
    const stage = await issuer.prepareChild(cap, "stage"); await boot(stage, baselineSha);
    return { cap, prepared, baselineSha, stage };
  }
  async function stageReady(beforeGrant) {
    const { cap, prepared, baselineSha, stage } = await stagePrepared();
    if (beforeGrant) await beforeGrant();
    const grant = await issuer.issuePhase(stage.child, "stage-variants"), stageRoot = descriptors.get("stage").rootPath, baselinePath = path.join(stageRoot, "baseline.aep");
    const baselineReadback = completeReadback(0, baselinePath, true);
    const body = { ...base(stage), status: "two_owned_variants_reopened", grant: grantBody(grant), baselineSha256: baselineSha, ameSubmissionAttempted: false,
      fixtureResultSchema: fixture.REOPEN_CONTRACT, baselineReadback: { readback: baselineReadback, proof: reopenProof(baselineReadback, 0, baselinePath, baselineSha, baselineSha) },
      outputs: [1, 2].map(variant => { const file = path.join(stageRoot, `variant-0${variant}.aep`), bytes = Buffer.from(`variant${variant}`), readback = completeReadback(variant, file, true);
        files.set(file, bytes); return { variant, path: file, sha256: hash(bytes), reopened: true, readback, proof: reopenProof(readback, variant, file, hash(bytes), baselineSha) }; }) };
    return { stage, body, cap, prepared };
  }
  return { issuer, ingress, context, record, checkpoint, files, descriptors, badLinks, badReparse, inside, send, base, boot, source, grantBody, captureReady, completeReadback, snapshotReady, stagePrepared, stageReady,
    buildReceiptPath, repoRoot, buildId,
    setCurrent: value => { current = value; }, setClock:value=>{clock=value;},setProcess: value => { processValid = value; }, setConsume: value => { consumeValid = value; },
    setConsumeGate: value => { consumeGate = value; }, setReadHook: value => { readHook = value; }, setConsumeHook: value => { consumeHook = value; }, consumed: () => consumed };
}
async function main() {
  checked("js_cpp_hmac_vector", () => assert.equal(crypto.createHmac("sha256", Buffer.alloc(32)).update("native-fixture-v2").digest("hex"), "8ec3a95879a19162478dde827e38cba929853ea8ceb36d55d6a067e29316b311"));
  for (const invalid of [{}, { fixtureKind: "user-project" }, { fixtureKind: "saved-clean", path: "caller" }, { fixtureKind: "saved-clean", script: "jsx" }, { fixtureKind: "saved-clean", restoreDirty: 1 }])
    checked("closed_fixture_input", () => assert.throws(() => fixture.validateInput(invalid)));
  let s = setup(); await rejected("unsigned_context_strings_no_brand", () => s.issuer.authorize(s.context));
  s = setup(); await rejected("raw_capability_no_authority", () => s.issuer.prepareChild({}, "capture"));
  s = setup(); await rejected("direct_admin_ingress_no_brand", () => s.ingress.runAuthenticated({ route: "/dev/run", authRole: "panel" }, async () => { s.ingress.brand(s.context); }));
  s = setup(); await rejected("automation_role_no_brand", () => s.ingress.runAuthenticated({ route: "/agents/plan/run", authRole: "automation" }, async () => { s.ingress.brand(s.context); }));
  for (const [name, mutate] of [
    ["autonomous_denied", x => { x.context.autonomous = true; }], ["direct_source_denied", x => { x.context.source = "direct"; }],
    ["checkpoint_bypass_denied", x => { x.context.allowWithoutCheckpoint = true; }], ["unconfirmed_denied", x => { x.context.confirm = false; }],
    ["surface_spoof_denied", x => { x.record.confirmationSurface = "mcp"; }], ["stale_dry_run_denied", x => { x.record.dryRunReceipt.payloadHash = "stale"; }],
    ["changed_payload_denied", x => { x.record.payload.plan.steps[0].args.fixtureKind = "saved-clean"; }],
    ["current_record_copy_denied", x => { x.setCurrent({ ...x.record }); }], ["run_id_changed_denied", x => { x.record.executionId = crypto.randomUUID(); }],
    ["execution_args_changed_denied", x => { x.context.args = { fixtureKind: "saved-clean" }; }],
    ["checkpoint_hardlink_denied", x => { x.badLinks.add(x.checkpoint.checkpointFile); }],
    ["checkpoint_reparse_denied", x => { x.badReparse.add(x.checkpoint.checkpointFile); }],
    ["root_reparse_denied", x => { x.badReparse.add(x.descriptors.get("capture").rootPath); }],
    ["plugin_hardlink_denied", x => { x.badLinks.add(x.descriptors.get("capture").pluginPath); }],
    ["plugin_changed_denied", x => { x.files.set(x.descriptors.get("capture").pluginPath, Buffer.from("changed")); }] ]) {
    const t = setup(); await rejected(name, () => t.inside(async () => { mutate(t); const cap = await t.issuer.authorize(t.context); await t.issuer.prepareChild(cap, "capture"); }));
  }
  for (const kind of ["saved-clean", "saved-dirty", "untitled-dirty"]) {
    const t = setup(kind, true);
    await t.inside(async () => {
      const { cap, prepared } = await t.captureReady();
      await rejected("child_role_prepare_no_replay", () => t.issuer.prepareChild(cap, "capture"));
      const issued = await t.issuer.issuePhase(prepared.child, "snapshot");
      checked("snapshot_explicit_dirty_permission", () => assert.match(issued.bytes, /restore_dirty=1\n/));
      await rejected("issued_phase_no_replay", () => t.issuer.issuePhase(prepared.child, "snapshot"));
      const baselineSha = hash("owned baseline");
      const accepted = await t.send(prepared, { ...t.base(prepared), status: "fixture_baseline_saved_source_preserved", grant: t.grantBody(issued), sourceBefore: t.source,
        sourceAfter: { ...t.source, extendscriptRevisionObserved: "4" }, layerSwitchDispatches: 0, baselineSha256: baselineSha,
        baselinePath: path.join(t.descriptors.get("capture").rootPath, "baseline.aep"), dirtyRestored: true });
      checked("signed_snapshot_accepted", () => assert.equal(accepted.status, "snapshot-verified"));
      const captureRoot = t.descriptors.get("capture").rootPath, stageRoot = t.descriptors.get("stage").rootPath;
      for (const root of [captureRoot, stageRoot]) t.files.set(path.join(root, "baseline.aep"), Buffer.from("owned baseline"));
      t.files.set(path.join(captureRoot, "fixture.bmp"), Buffer.from("owned bmp")); t.files.set(path.join(captureRoot, "proxy.bmp"), Buffer.from("owned proxy"));
      const stage = await t.issuer.prepareChild(cap, "stage"); await t.boot(stage, baselineSha);
      const variants = await t.issuer.issuePhase(stage.child, "stage-variants");
      const result = await t.send(stage, { ...t.base(stage), status: "two_owned_variants_reopened", grant: t.grantBody(variants), baselineSha256: baselineSha, ameSubmissionAttempted: false,
        outputs: [1, 2].map(variant => { const file = path.join(stageRoot, `variant-0${variant}.aep`); return { variant, path: file, sha256: hash(`variant${variant}`), reopened: true,
          readback: { ...t.source, path: file, dirty: false } }; }) });
      checked("two_reopened_variants_contract", () => assert.equal(result.status, "variants-verified"));
      checked("server_consume_each_phase", () => assert.equal(t.consumed(), 3));
    });
  }
  s = setup(); let escaped;
  await s.inside(async () => { escaped = await s.issuer.authorize(s.context); });
  await rejected("capability_after_request_lifetime_denied", () => s.issuer.prepareChild(escaped, "capture"));
  s = setup(); await s.inside(async () => {
    await s.issuer.authorize(s.context);
    await rejected("same_execution_authorize_no_replay", () => s.issuer.authorize(s.context));
  });
  for (const [name, mutate] of [
    ["pid_identity_changed_no_grant", t => t.setProcess(false)],
    ["checkpoint_bytes_changed_no_grant", t => t.files.set(t.checkpoint.checkpointFile, Buffer.from("changed"))],
    ["revision_changed_no_grant", t => { t.record.revision++; }],
    ["durable_consume_failure_terminal", t => t.setConsume(false)] ]) {
    const t = setup(); await t.inside(async () => {
      const { prepared } = await t.captureReady(); mutate(t);
      await rejected(name, () => t.issuer.issuePhase(prepared.child, "snapshot"));
      await rejected("failed_phase_no_replay", () => t.issuer.issuePhase(prepared.child, "snapshot"));
    });
  }
  s = setup(); await s.inside(async () => {
    const { prepared } = await s.captureReady(); let release;
    s.setConsumeGate(new Promise(resolve => { release = resolve; }));
    const first = s.issuer.issuePhase(prepared.child, "snapshot");
    await rejected("concurrent_phase_no_replay", () => s.issuer.issuePhase(prepared.child, "snapshot"));
    release(); await first;
    checked("concurrent_consume_once", () => assert.equal(s.consumed(), 2));
  });
  for (const [name, change] of [
    ["unsigned_receipt_denied", body => JSON.stringify(body)],
    ["forged_mac_denied", body => JSON.stringify({ body: JSON.stringify(body), mac: "0".repeat(64) })] ]) {
    const t = setup(); await t.inside(async () => {
      const cap = await t.issuer.authorize(t.context), prepared = await t.issuer.prepareChild(cap, "capture");
      await rejected(name, () => t.issuer.acceptReceipt(prepared.child, change(t.base(prepared))));
      await rejected("unknown_receipt_no_retry", () => t.boot(prepared));
    });
  }
  s = setup(); await s.inside(async () => {
    const { prepared } = await s.captureReady(), issued = await s.issuer.issuePhase(prepared.child, "snapshot");
    await rejected("signed_source_path_drift_denied", () => s.send(prepared, { ...s.base(prepared), status: "fixture_baseline_saved_source_preserved", grant: s.grantBody(issued),
      baselineSha256: "4".repeat(64), baselinePath: path.join(s.descriptors.get("capture").rootPath, "baseline.aep"), layerSwitchDispatches: 0,
      sourceBefore: s.source, sourceAfter: { ...s.source, path: "C:\\other.aep" } }));
    await rejected("snapshot_unknown_no_replay", () => s.issuer.issuePhase(prepared.child, "snapshot"));
  });
  s = setup(); await s.inside(async () => {
    const cap = await s.issuer.authorize(s.context), prepared = await s.issuer.prepareChild(cap, "capture");
    await assert.rejects(() => s.send(prepared, { ...s.base(prepared), status: "refused_or_unknown", reason: "owned child is dirty\n" + "x".repeat(400) }),
      error => error.code === "fixture_native_refusal" && error.nativeReason.length === 300 && !error.nativeReason.includes("\n"));
    checked("verified_native_refusal_reason_bounded", () => assert.equal(s.consumed(), 0));
    await rejected("native_refusal_terminal_no_replay", () => s.boot(prepared));
  });
  for(const change of [null,"extra","mac","manifest","module","nonce","stage","birth","expiry","dispatch","schema"]) {
    const t=setup();let prepared;
    await t.inside(async()=>{const cap=await t.issuer.authorize(t.context);prepared=await t.issuer.prepareChild(cap,"capture");t.issuer.markUnknown(prepared.child);});
    const fields=Object.fromEntries(prepared.manifestBytes.trim().split("\n").map(line=>{const n=line.indexOf("=");return [line.slice(0,n),line.slice(n+1)];}));
    const expiry=Number(fields.expires_unix_ms);t.setClock(expiry+1000);t.setCurrent(null);
    const b={schema:"ae-agent.native-fixture-bootstrap-refusal.v1",status:"bootstrap_refused_before_suite_acquisition",reason:"signed_launch_expired",hostLoaded:true,productionAuthorization:false,readiness:false,
      role:"capture",fixture:"saved-dirty",stageId:fields.stage_id,rootPath:fields.root_path,nonce:fields.nonce,challenge:"f".repeat(32),pluginSha256:fields.plugin_sha256,executableSha256:fields.executable_sha256,
      pid:101,processCreatedUnixMs:Date.parse(t.record.confirmedAt)-9000,manifestSha256:hash(prepared.manifestBytes),expiresUnixMs:expiry,refusedAtUnixMs:expiry+500,suitesAcquired:false,fixtureMutationDispatches:0,nativeSaveDispatches:0,replayAllowed:false};
    if(change==="extra")b.clientProof=true;if(change==="manifest")b.manifestSha256="a".repeat(64);if(change==="module")b.executableSha256="a".repeat(64);if(change==="nonce")b.nonce="a".repeat(32);
    if(change==="stage")b.stageId="a".repeat(32);if(change==="birth")t.setProcess(false);if(change==="expiry")b.refusedAtUnixMs=expiry-1;if(change==="dispatch")b.fixtureMutationDispatches=1;if(change==="schema")b.schema=fixture.SCHEMA;
    const body=JSON.stringify(b),key=prepared.environment.AE_AGENT_NATIVE_FIXTURE_KEY,bytes=JSON.stringify({body,mac:change==="mac"?"0".repeat(64):crypto.createHmac("sha256",Buffer.from(key,"hex")).update(body).digest("hex")});
    if(change)await rejected("bootstrap_refusal_rejects_"+change,()=>t.issuer.verifyBootstrapRefusal(prepared.child,bytes));
    else {const result=await t.issuer.verifyBootstrapRefusal(prepared.child,bytes);checked("expired_bootstrap_refusal_independent_no_authority",()=>{assert.equal(result.endpointInert,true);assert.equal(result.processExited,false);assert(!JSON.stringify(result).includes(key));assert.equal(t.consumed(),0);});}
    await rejected("bootstrap_refusal_never_revives_phase",()=>t.issuer.issuePhase(prepared.child,"create-fixture"));
  }
  s=setup();s.files.set(path.join(s.descriptors.get("capture").rootPath,"server-owner.json"),Buffer.from("foreign server metadata"));
  await rejected("native_capture_root_rejects_server_metadata",()=>s.inside(async()=>{const cap=await s.issuer.authorize(s.context);await s.issuer.prepareChild(cap,"capture");}));
  const beforeOwnedReopen = passed;
  for (const kind of ["saved-clean", "saved-dirty", "untitled-dirty"]) {
    const t = setup(kind, false, true); await t.inside(async () => {
      const { stage, body } = await t.stageReady(), accepted = await t.send(stage, body);
      checked("versioned_owned_reopen_dirty_observation_accepted_" + kind, () => assert.equal(accepted.status, "variants-verified"));
      checked("owned_reopen_build_pinned_before_grants_" + kind, () => assert.equal(t.consumed(), 3));
    });
  }
  const negativeProofs = [
    ["wrong_handle", x => { x.proof.observedProjectHandle = "999"; }], ["wrong_opened_handle", x => { x.proof.openedProjectHandle = "999"; }],
    ["wrong_inspected_handle", x => { x.proof.inspectedProjectHandle = "999"; }], ["wrong_path", x => { x.readback.path += ".foreign"; }],
    ["wrong_expected_path", x => { x.proof.expectedPath += ".foreign"; }], ["wrong_inspected_path", x => { x.proof.inspectedPath += ".foreign"; }],
    ["wrong_file_hash", x => { x.proof.fileSha256Observed = "a".repeat(64); }], ["wrong_baseline_hash", x => { x.proof.baselineSha256Observed = "a".repeat(64); }],
    ["missing_hash_observation", x => { x.proof.fileHashObserved = false; }], ["inconsistent_dirty", x => { x.proof.dirty = false; }],
    ["inconsistent_after_open_dirty", x => { x.proof.dirtyAfterOpen = false; }], ["unobserved_after_inspection_dirty", x => { x.proof.dirtyAfterReadOnlyInspection = null; }],
    ["legacy_readback_schema", x => { x.proof.schema = "ae-agent.native-stage-readback.v1"; }], ["unknown_readback_schema", x => { x.proof.schema += ".unknown"; }],
    ["unverified_semantics", x => { x.proof.fixtureEvidenceVerified = false; }], ["incomplete_proof", x => { delete x.proof.inspectionObserved; }],
    ["unobserved_inspection", x => { x.proof.inspectionObserved = false; }], ["graph_hash_mismatch", x => { x.proof.fixtureCanonicalSha256Observed = "a".repeat(64); }],
    ["unknown_evidence_schema", x => { x.readback.fixedFixtureEvidence.schema += ".unknown"; }], ["unverified_evidence", x => { x.readback.fixedFixtureEvidence.verified = false; }],
    ["changed_sentinel", x => { x.readback.fixedFixtureEvidence.fields = x.readback.fixtureEvidence = x.readback.fixtureEvidence.replace("UNSAVED_SENTINEL_saved-dirty", "ALTERED_SENTINEL"); }],
    ["changed_text", x => { x.readback.fixedFixtureEvidence.fields = x.readback.fixtureEvidence = x.readback.fixtureEvidence.replace("Fixture title 01", "Changed title 01"); }],
    ["changed_visibility", x => { x.readback.observedState.items[1].layers[0].flags ^= 1; }],
    ["changed_nested_link", x => { x.readback.observedState.items[0].layers[0].sourceId = 999; }],
    ["changed_media_path", x => { x.readback.observedState.items[2].mainFootagePath += ".foreign"; }],
    ["changed_proxy_path", x => { x.readback.observedState.items[2].proxyFootagePath += ".foreign"; }],
    ["native_proxy_disabled", x => { x.readback.observedState.items[2].flags = 2; }],
    ["incomplete_fixed_semantics", x => { x.readback.fixedFixtureEvidence.fields = x.readback.fixtureEvidence = x.readback.fixtureEvidence.replace(/title_01_text=[^\n]+\n/, ""); }],
    ["missing_proxy", x => { delete x.readback.observedState.items[2].proxyFootagePath; }], ["media_hash_forged", x => { x.readback.fixedFixtureEvidence.mediaSha256 = "a".repeat(64); }]
  ];
  for (const [name, mutate] of negativeProofs) for (const variant of [0, 1, 2]) {
    const t = setup("saved-dirty", false, true); await t.inside(async () => {
      const { stage, body } = await t.stageReady(); mutate(variant === 0 ? body.baselineReadback : body.outputs[variant - 1]);
      await rejected(`owned_reopen_${name}_variant_${variant}`, () => t.send(stage, body));
      await rejected("owned_reopen_failed_receipt_never_replays", () => t.issuer.issuePhase(stage.child, "stage-variants"));
    });
  }
  for (const [name, mutate] of [
    ["unknown_result_version", (t, b) => { b.fixtureResultSchema += ".unknown"; }],
    ["unknown_contract_version", (t, b) => { b.ownedFixtureReopenContract += ".unknown"; }],
    ["missing_baseline_proof", (t, b) => { delete b.baselineReadback; }], ["receipt_build_id_changed", (t, b) => { b.buildId = "build-" + "b".repeat(32); }],
    ["production_claim_denied", (t, b) => { b.productionBackend = true; }],
    ["variant_snapshots_same_bytes", (t, b) => { b.outputs[1].sha256 = b.outputs[0].sha256; }],
    ["variant_file_bytes_changed", (t, b) => { t.files.set(b.outputs[0].path, Buffer.from("changed")); }],
    ["baseline_file_bytes_changed", (t, b) => { t.files.set(path.join(t.descriptors.get("stage").rootPath, "baseline.aep"), Buffer.from("changed")); }],
    ["capture_baseline_bytes_changed", (t, b) => { t.files.set(path.join(t.descriptors.get("capture").rootPath, "baseline.aep"), Buffer.from("changed")); }],
    ["media_bytes_changed", (t, b) => { t.files.set(path.join(t.descriptors.get("capture").rootPath, "fixture.bmp"), Buffer.from("changed")); }],
    ["proxy_bytes_changed", (t, b) => { t.files.set(path.join(t.descriptors.get("capture").rootPath, "proxy.bmp"), Buffer.from("changed")); }] ]) {
    const t = setup("saved-dirty", false, true); await t.inside(async () => { const { stage, body } = await t.stageReady(); mutate(t, body); await rejected("owned_reopen_" + name, () => t.send(stage, body)); });
  }
  for (const [name, mutate] of [
    ["contract_not_compiled", receipt => { receipt.ownedFixtureReopenContractCompiled = false; }],
    ["unknown_build_contract", receipt => { receipt.ownedFixtureReopenContract += ".unknown"; }],
    ["build_id_changed", receipt => { receipt.buildId = "build-" + "b".repeat(32); }],
    ["build_binary_sha_changed", receipt => { receipt.binarySha256 = "b".repeat(64); }],
    ["missing_build_sources", receipt => { receipt.sourceFiles.pop(); }] ]) {
    const t = setup("saved-dirty", false, true); await t.inside(async () => {
      const receipt = JSON.parse(t.files.get(t.buildReceiptPath)); mutate(receipt); t.files.set(t.buildReceiptPath, Buffer.from(JSON.stringify(receipt)));
      const cap = await t.issuer.authorize(t.context); await rejected("owned_reopen_" + name + "_before_grant", () => t.issuer.prepareChild(cap, "capture"));
      checked("owned_reopen_invalid_build_no_grant", () => assert.equal(t.consumed(), 0));
    });
  }
  s = setup(); await s.inside(async () => {
    const { stage, body } = await s.stageReady(); delete body.fixtureResultSchema; delete body.baselineReadback;
    await rejected("legacy_result_still_denies_dirty", () => s.send(stage, body));
  });
  s = setup(); await s.inside(async () => {
    const cap = await s.issuer.authorize(s.context), prepared = await s.issuer.prepareChild(cap, "capture");
    await rejected("legacy_pinned_binary_cannot_advertise_new_contract", () => s.send(prepared, { ...s.base(prepared), ownedFixtureReopenContract: fixture.REOPEN_CONTRACT, buildId: s.buildId, productionBackend: false,
      status: "empty_owned_child_waiting_signed_grant", approvalSha256: "1".repeat(64), baselineInputSha256: "0".repeat(64), baseline: { path: "", dirty: false, observedState: { items: [] } } }));
    checked("legacy_fabricated_metadata_no_grant", () => assert.equal(s.consumed(), 0));
  });
  s = setup("saved-dirty", false, true); await s.inside(async () => {
    const { prepared } = await s.captureReady(); s.files.set(path.join(s.repoRoot, "native\\ame-snapshot-probe\\fixture_program.h"), Buffer.from("changed after boot"));
    await rejected("owned_reopen_changed_source_pin_before_next_grant", () => s.issuer.issuePhase(prepared.child, "snapshot"));
    checked("changed_source_pin_does_not_consume_next_grant", () => assert.equal(s.consumed(), 1));
  });
  for (const [name, filename] of [["media", "fixture.bmp"], ["proxy", "proxy.bmp"], ["baseline", "baseline.aep"]]) {
    const t = setup("saved-dirty", false, true); await t.inside(async () => {
      await rejected("owned_reopen_changed_" + name + "_before_variant_grant", () => t.stageReady(() => {
        t.files.set(path.join(t.descriptors.get("capture").rootPath, filename), Buffer.from("changed before stage dispatch"));
      }));
      checked("owned_reopen_changed_asset_or_baseline_no_stage_consume", () => assert.equal(t.consumed(), 2));
    });
  }
  const beforeSnapshotRaces = passed;
  const pauseRead = (t, file) => {
    let enter, release; const entered = new Promise(resolve => { enter = resolve; }), gate = new Promise(resolve => { release = resolve; });
    t.setReadHook(async candidate => { if (candidate === file) { enter(); await gate; } });
    return { entered, release: () => { t.setReadHook(null); release(); } };
  };
  s = setup("saved-dirty", false, true); await s.inside(async () => {
    const { cap, prepared } = await s.captureReady(), issued = await s.issuer.issuePhase(prepared.child, "snapshot"), baselineSha = hash("owned baseline");
    const captureRoot = s.descriptors.get("capture").rootPath, proxyFile = path.join(captureRoot, "proxy.bmp"), pause = pauseRead(s, proxyFile);
    for (const id of ["capture", "stage"]) s.files.set(path.join(s.descriptors.get(id).rootPath, "baseline.aep"), Buffer.from("owned baseline"));
    const pending = s.send(prepared, { ...s.base(prepared), status: "fixture_baseline_saved_source_preserved", grant: s.grantBody(issued), sourceBefore: s.source,
      sourceAfter: { ...s.source, extendscriptRevisionObserved: "4" }, layerSwitchDispatches: 0, baselineSha256: baselineSha, baselinePath: path.join(captureRoot, "baseline.aep") });
    const failure = rejected("snapshot_pending_proxy_read_failure_terminal", () => pending);
    await pause.entered;
    await rejected("snapshot_pending_verification_cannot_prepare_stage", () => s.issuer.prepareChild(cap, "stage"));
    checked("snapshot_pending_verification_no_stage_consume", () => assert.equal(s.consumed(), 2));
    s.files.set(proxyFile, Buffer.from("changed while read pending")); pause.release(); await failure;
    s.files.set(proxyFile, bitmap(true));
    await rejected("snapshot_failed_then_restored_bytes_no_stage_prepare_replay", () => s.issuer.prepareChild(cap, "stage"));
    await rejected("snapshot_failed_then_restored_bytes_no_capture_grant", () => s.issuer.issuePhase(prepared.child, "snapshot"));
    checked("snapshot_failed_then_restored_bytes_never_consumes_stage", () => assert.equal(s.consumed(), 2));
  });
  for (const invalidate of ["unknown", "descriptor"]) {
    const t = setup("saved-dirty", false, true); await t.inside(async () => {
      const { cap, prepared } = await t.snapshotReady(), input = path.join(t.descriptors.get("stage").rootPath, "baseline.aep"), pause = pauseRead(t, input);
      const pending = rejected("stage_prepare_await_rejects_source_" + invalidate, () => t.issuer.prepareChild(cap, "stage"));
      await pause.entered;
      if (invalidate === "unknown") t.issuer.markUnknown(prepared.child);
      else t.descriptors.set("capture", Object.freeze({ ...t.descriptors.get("capture") }));
      pause.release(); await pending;
      await rejected("stage_prepare_source_changed_never_retries", () => t.issuer.prepareChild(cap, "stage"));
      checked("stage_prepare_source_changed_no_stage_consume", () => assert.equal(t.consumed(), 2));
    });
  }
  s = setup("saved-dirty", false, true); await s.inside(async () => {
    const { prepared, stage } = await s.stagePrepared(), proxyFile = path.join(s.descriptors.get("capture").rootPath, "proxy.bmp"), pause = pauseRead(s, proxyFile);
    const pending = rejected("stage_grant_await_rejects_source_unknown", () => s.issuer.issuePhase(stage.child, "stage-variants"));
    await pause.entered; s.issuer.markUnknown(prepared.child);
    s.files.set(proxyFile, bitmap(true)); pause.release(); await pending;
    checked("stage_grant_source_unknown_before_consume_no_signature_or_consume", () => assert.equal(s.consumed(), 2));
    await rejected("stage_grant_unknown_even_with_restored_bytes_no_replay", () => s.issuer.issuePhase(stage.child, "stage-variants"));
  });
  s = setup("saved-dirty", false, true); await s.inside(async () => {
    const { prepared, stage } = await s.stagePrepared(); s.issuer.markUnknown(prepared.child);
    await rejected("stage_grant_preexisting_source_unknown_denied", () => s.issuer.issuePhase(stage.child, "stage-variants"));
    checked("stage_grant_preexisting_source_unknown_no_consume", () => assert.equal(s.consumed(), 2));
  });
  s = setup("saved-dirty", false, true); await s.inside(async () => {
    const { prepared, stage } = await s.stagePrepared();
    s.setConsumeHook(receipt => { if (receipt.operation === "stage-variants") s.issuer.markUnknown(prepared.child); });
    await rejected("stage_grant_source_unknown_during_durable_consume_no_signature", () => s.issuer.issuePhase(stage.child, "stage-variants"));
    checked("stage_grant_source_unknown_during_consume_retains_terminal_consumption", () => assert.equal(s.consumed(), 3));
    await rejected("stage_grant_source_unknown_during_consume_no_replay", () => s.issuer.issuePhase(stage.child, "stage-variants"));
  });
  const snapshotRaceChecks = passed - beforeSnapshotRaces;
  const ownedFixtureReopenChecks = passed - beforeOwnedReopen;
  process.stdout.write(JSON.stringify({ status: "passed", offline: true, hostLoaded: false, simulatedSignedReceipts: true, phaseGrantPublished: false, ownedFixtureReopenChecks, snapshotRaceChecks, passed, checks }) + "\n");
}
main().catch(error => { process.stderr.write(JSON.stringify({ status: "failed", offline: true, hostLoaded: false, passed, reason: error.stack }) + "\n"); process.exitCode = 1; });
