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
function setup(kind = "saved-dirty", restoreDirty = false) {
  const now = Date.now(), ingress = createManualPlanIngress(), files = new Map(), badLinks = new Set(), badReparse = new Set();let clock=now;
  const ownedParent = "C:\\owned\\fixtures", pluginPath = "C:\\owned\\build\\Probe.aex", executablePath = "C:\\Adobe\\AfterFX.exe";
  files.set(pluginPath, Buffer.from("fake offline plugin")); files.set(executablePath, Buffer.from("fake offline executable"));
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
  const filesystem = {
    async lstat(file) { const regular = files.has(file); return { nlink: badLinks.has(file) ? 2 : 1, isFile: () => regular,
      isDirectory: () => !regular, isSymbolicLink: () => badReparse.has(file) }; },
    async realpath(file) { return file; }, async readdir(dir) {return Array.from(files.keys()).filter(file=>path.dirname(file)===dir).map(file=>path.basename(file));},
    async readFile(file, encoding) { assert(files.has(file), `missing mock file: ${file}`); const b = files.get(file); return encoding ? b.toString(encoding) : b; }
  };
  let current = record, processValid = true, consumeValid = true, consumed = 0, consumeGate = null;
  const seen = new Set();
  const issuer = fixture.createFixtureGrantIssuer({ ownedParent, contractVersion, filesystem, now: () => clock,
    assertManualIngress: ingress.assertContext, getCurrentRecord: () => current, getCheckpoint: () => checkpoint,
    getOwnedChild: id => descriptors.get(id), inspectProcess: async () => processValid,
    consumeAttempt: async receipt => { ++consumed; assert.equal(receipt.status, "consumed_before_grant_publication");
      assert.equal(receipt.replayAllowed, false); assert(!JSON.stringify(receipt).includes("NATIVE_FIXTURE_KEY"));
      const key = `${receipt.stageId}:${receipt.operation}`; assert(!seen.has(key)); seen.add(key);
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
      nativeSaveDispatches: 0, fixtureMutationDispatches: 0 };
  };
  const boot = async (prepared, baselineSha = "0".repeat(64)) => send(prepared, { ...base(prepared), status: "empty_owned_child_waiting_signed_grant",
    approvalSha256: "1".repeat(64), baselineInputSha256: baselineSha, baseline: { path: "", dirty: false, observedState: { items: [] } } });
  const source = { projectHandle: "100", path: kind === "untitled-dirty" ? "" : path.join(descriptors.get("capture").rootPath, "source.aep"),
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
    await send(prepared, { ...base(prepared), status: "source_fixture_ready", source, approvalSha256: "3".repeat(64), layerSwitchDispatches: 0, grant: grantBody(issued) });
    return { cap, prepared };
  }
  return { issuer, ingress, context, record, checkpoint, files, descriptors, badLinks, badReparse, inside, send, base, boot, source, grantBody, captureReady,
    setCurrent: value => { current = value; }, setClock:value=>{clock=value;},setProcess: value => { processValid = value; }, setConsume: value => { consumeValid = value; },
    setConsumeGate: value => { consumeGate = value; }, consumed: () => consumed };
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
  process.stdout.write(JSON.stringify({ status: "passed", offline: true, hostLoaded: false, simulatedSignedReceipts: true, phaseGrantPublished: false, passed, checks }) + "\n");
}
main().catch(error => { process.stderr.write(JSON.stringify({ status: "failed", offline: true, hostLoaded: false, passed, reason: error.stack }) + "\n"); process.exitCode = 1; });
