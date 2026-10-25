"use strict";
// Read-only proof for one refused server path. No native, process, project-graph
// or endpoint assertion follows from it. The ordinary runner created a checkpoint.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const ledger = require("./native-fixture-attempt-ledger");
const { fail, hash, same, clone } = ledger;
const PROFILE = Object.freeze({
  repoRoot: "C:\\Users\\Ant\\Documents\\Codex\\AE_agent",
  evidenceRoot: "C:\\Users\\Ant\\Documents\\Codex\\AE_agent\\logs",
  requestId: "0c33f0f5-a452-47c4-b2d0-204d96cb8fef", runId: "8674d583-e151-47fc-9c2b-374584b2faa8",
  proposalRequestId: "7a8fa436-2a81-4cd9-880d-50ed81851011", actionId: "act_03f2cb9f57634c9197cd10cb86ee255e",
  proposalRevision: 2, payloadHash: "sha256:0c1f8f84cd1f4c220b3e72bb5116c442170f5c9151e7cadb6d11a04763e6db94",
  sessionId: "f97fde31-2578-42ec-a546-72c48fd035c2", errorCode: "fixture_prephase_new_manual_action_required",
  runtimeSha256: "8c784f94126541df2242c102572fb1f969ea51586e9a4a3f12321849ebdc18cd",
  projectFile: "C:\\Проекты 21\\2026.10.12 - Русский оркестр. Ломаем шаблоны (Мунивер и ШМПушка, Былина)\\titr_all.aep",
  checkpointName: "titr_all-checkpoint-session-ai-plan-8674d583-2026-10-11T05-42-35-333Z.aep",
  startedAt: "2026-10-11T05:42:35.357Z", finishedAt: "2026-10-11T05:42:39.755Z"
});
const OUTCOME = Object.freeze({
  authority: "server_proof_authorize_never_entered", scope: "exact_run_transport_guard_only",
  historicalOutcome: "unknown", issuerAuthorizationNeverIssued: true, nativeExecutorNeverEntered: true,
  nativeExecutionProven: false, processExitProven: false, endpointInert: false,
  nativeEndpointInertProven: false, replay: false, replayAllowed: false
});
const FIXED_PINS = Object.freeze({
  manifest: Object.freeze({bytes: 10263, sha256: "74665b0a6b812dae132ecaaa47fb4899995bdceb0910d967fe1c9910798f174a"}),
  run: Object.freeze({bytes: 20032, sha256: "fe222c8119df1c99b3003572637d0f2424af8d402ddfe624a5c826ab0e9a02d7"}),
  receipt: Object.freeze({bytes: 28322, sha256: "45f392b79f08cf7cd91e83ad643037f186fc47677ac5373342052e39777558d5"}),
  recordSha256: "96d8cfdfda400f8a86f89aa6f5e98140befe745653a10dcba204d0fcabe9c201",
  activeSessionSha256: "8d5df7d87fea8c94ef4e718f28cf420e00e05233542613a5c4c7579c1b47a7e0",
  finishedSessionSha256: "4c47957d605d4f9d5606f30d7eeda0e63a23862fced066ccdc64abbc22d5ad6c",
  checkpoint: Object.freeze({bytes: 31998115, sha256: "23902465853259f79e3bd582314ba18a05a95963072d988aae0adfb480f61db8"}),
  sessionRows: Object.freeze([
    Object.freeze({bytes: 738, sha256: "d7fcdf7dea03f9a2ce9a293056a8fa5b5a23ec6992f59c769bb1a12626296ad0"}),
    Object.freeze({bytes: 773, sha256: "3796071c8f6a4f5c86652f6d33de37c40fe2cde186e908ddc27a7e94418af754"})
  ])
});
const CALL_GRAPH = Object.freeze([
  ["guard", "native-fixture-prephase-recovery.js", "function liveGuard(", "async function snapshot(", "90acc53ed8d743f5c623d450df82ab6d431d02aa207d1e4b6398383605de9cdc"],
  ["snapshot", "native-fixture-prephase-recovery.js", "async function snapshot(", "async function bracket(", "b092bd351edd0467a08855180bf035a908e990de504054773baee682d01644b7"],
  ["binding", "native-fixture-prephase-recovery.js", "async function bindAdmission(", "function assertAdmission(", "0670641de844ce4beeb7a230d5e573b3cb5e16a9a384b71497062b8cc99920fe"],
  ["runnerAuthorization", "ame-native-fixture-runner.js", "  async function authorize(context)", "  function assertAuthorization(", "1ccf625e7e6aef5a2fb70c9487f94413394613d3f63dfb81b0bf132093643f32"],
  ["runnerCapability", "ame-native-fixture-runner.js", "  function assertAuthorization(", "  async function execute(", "cea16cb6a18b822ada1b53eac00a0ef9c3bab2638487b7859681c6980241d3eb"],
  ["autoCheckpoint", "bridge-daemon.js", "  if (mutatingExecution && !lifecycleCompletion && !activeEditSessionAtStart && !checkpointStepPresent) {", "  if (lifecycleStep && !dryRun) {", "f9eef8568592cd0bad8892e312b2c6df05dc860cb58fba5ced9679c23bc46656"],
  ["bridgeAuthorization", "bridge-daemon.js", "      const ameFixtureContext =", "      const ameTitleContext =", "207a251e6e79125282e5ddf962c30a21c93e5a0fd8894c13ff10bd2c01c292ad"],
  ["dispatch", "bridge-daemon.js", "  if (name === ameFixtureGrant.TOOL_NAME) {", "  if (name === ameFixtureRunner.INSPECT) {", "8825d6ddbaed5ba07d7900ed8b250c5487017a1ef8007e82480b3d1f84b374c1"]
].map(row => Object.freeze(row)));
const selector = () => ({requestId: PROFILE.requestId, runId: PROFILE.runId});
function select(value) {
  if (!value || Array.isArray(value) || !same(Object.keys(value).sort(), ["requestId", "runId"]) ||
      value.requestId !== PROFILE.requestId || value.runId !== PROFILE.runId) fail("fixture_refusal_fixed_selector_required");
  return selector();
}
function roots(repoRoot, evidenceRoot) {
  // Fixed absolute production paths; no caller pins, source directories or test
  // readers can reach this entry point. Synthetic filesystem mapping is test-only.
  if (repoRoot !== PROFILE.repoRoot || evidenceRoot !== PROFILE.evidenceRoot) fail("fixture_refusal_fixed_paths_required");
  ledger.safeDirectory(repoRoot); ledger.safeDirectory(evidenceRoot);
}
function pinned(file, pin) {
  const bytes = ledger.readBytes(file);
  if (bytes.length !== pin.bytes || hash(bytes) !== pin.sha256) fail("fixture_refusal_original_bytes_changed");
  return bytes;
}
function checkpointPin(file, pin) {
  // This one exact 32 MB AEP exceeds the ordinary evidence reader's 16 MB
  // ceiling. Hash a bounded stream, preserving the same identity/read-back gates.
  ledger.safeDirectory(path.dirname(file));
  const before = fs.lstatSync(file);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size !== pin.bytes ||
      fs.realpathSync(file).toLowerCase() !== path.resolve(file).toLowerCase()) fail("fixture_refusal_checkpoint_identity");
  const fd = fs.openSync(file, "r"), digest = crypto.createHash("sha256"), chunk = Buffer.alloc(65536);
  let total = 0;
  const identity = other => before.dev === other.dev && before.ino === other.ino && before.size === other.size && before.mtimeMs === other.mtimeMs;
  try {
    if (!identity(fs.fstatSync(fd))) fail("fixture_refusal_checkpoint_changed");
    while (total < pin.bytes) {
      const count = fs.readSync(fd, chunk, 0, Math.min(chunk.length, pin.bytes - total), total);
      if (!count) fail("fixture_refusal_checkpoint_changed");
      digest.update(chunk.subarray(0, count)); total += count;
    }
    if (!identity(fs.fstatSync(fd))) fail("fixture_refusal_checkpoint_changed");
  } finally { fs.closeSync(fd); }
  ledger.safeDirectory(path.dirname(file)); const after = fs.lstatSync(file);
  if (!identity(after) || after.isSymbolicLink() || after.nlink !== 1 ||
      fs.realpathSync(file).toLowerCase() !== path.resolve(file).toLowerCase() || digest.digest("hex") !== pin.sha256) fail("fixture_refusal_checkpoint_changed");
}
function callGraph(sources) {
  // These approved spans describe the actual old source; this is not a parser
  // that grants arbitrary new JavaScript the same authority from similar words.
  const pieces = {}, pins = {};
  for (const [name, file, start, end, digest] of CALL_GRAPH) {
    const text = sources["mcp-server/" + file], a = text?.indexOf(start), b = text?.indexOf(end, a + start.length);
    if (!(a >= 0 && b > a) || text.indexOf(start, a + start.length) !== -1 || hash(text.slice(a, b)) !== digest) fail("fixture_refusal_old_controlflow_changed");
    pieces[name] = text.slice(a, b); pins[name] = digest;
  }
  const runner = sources["mcp-server/ame-native-fixture-runner.js"], bridge = sources["mcp-server/bridge-daemon.js"];
  if (Object.values(sources).reduce((n, text) => n + text.split(PROFILE.errorCode).length - 1, 0) !== 1 ||
      !pieces.guard.includes('status.activeEditSession!==null') || !pieces.guard.includes('fail("' + PROFILE.errorCode + '")') ||
      !pieces.snapshot.includes('liveGuard(s,selected.state,guard,status,mode,context,deps)') ||
      !pieces.binding.includes('await bracket(deps,"admission",context)') ||
      pieces.runnerAuthorization.indexOf('await recovery.bindAdmission(') >= pieces.runnerAuthorization.indexOf('await issuer.authorize(') ||
      runner.split('capabilities.set(').length !== 2 || runner.split('issuer.authorize(').length !== 2 ||
      !runner.includes('async function execute(args, capability) {\n    const entry = assertAuthorization(capability, args);') ||
      !pieces.bridgeAuthorization.includes('await ameFixtureExecutor.authorize(ameFixtureContext)') ||
      !pieces.bridgeAuthorization.includes('catch (error) { ameFixtureCheckpoints.delete(run.id); throw error; }') ||
      bridge.indexOf('await autonomousCommandContext.run(guard, () => startPlanRunEditSession(run, validation))') >= bridge.indexOf('await ameFixtureExecutor.authorize(ameFixtureContext)') ||
      !pieces.dispatch.includes('await ameFixtureExecutor.execute(args, executionContext && executionContext.ameFixtureAuthorization)')) fail("fixture_refusal_old_controlflow_changed");
  return pins;
}
function sourceAudit(frozen, manifest) {
  if (manifest.schema !== "ae-agent.fixture-prephase-session.freeze.v1" || manifest.runtime?.sourceSha256 !== PROFILE.runtimeSha256 ||
      !Array.isArray(manifest.runtime.modules) || manifest.runtime.modules.length !== 53) fail("fixture_refusal_manifest_binding_invalid");
  const sourceRoot = path.join(frozen, "original-runtime-source"), sources = {}, names = [];
  ledger.safeDirectory(sourceRoot);
  if (!same(fs.readdirSync(sourceRoot).sort(), ["cep-panel", "mcp-server", "scripts"])) fail("fixture_refusal_source_inventory_changed");
  for (const namespace of ["cep-panel", "mcp-server", "scripts"]) {
    const dir = path.join(sourceRoot, namespace); ledger.safeDirectory(dir);
    for (const file of fs.readdirSync(dir)) names.push(namespace + "/" + file);
  }
  if (!same(names.sort(), manifest.runtime.modules.map(m => m.name).sort())) fail("fixture_refusal_source_inventory_changed");
  for (const m of manifest.runtime.modules) {
    if (!/^(mcp-server|cep-panel|scripts)\/[a-z0-9-]+\.js$/.test(m.name) || !Number.isInteger(m.bytes) || m.bytes < 1 || !ledger.SHA.test(m.sha256 || "")) fail("fixture_refusal_manifest_binding_invalid");
    sources[m.name] = pinned(path.join(sourceRoot, ...m.name.split("/")), m).toString("utf8");
  }
  const modules = manifest.runtime.modules.map(({name, sha256}) => ({name, sha256}));
  if (hash(modules) !== PROFILE.runtimeSha256) fail("fixture_refusal_runtime_binding_invalid");
  return {modules, callGraphHashes: callGraph(sources)};
}
function canonicalRun(bytes, runtime, pins) {
  const envelope = JSON.parse(bytes), record = envelope.record, r = record?.run, pv = r?.provenance;
  if (envelope.schema !== "ae-agent-plan-run-record-envelope.v1" || envelope.sha256 !== pins.recordSha256 || hash(record) !== envelope.sha256 ||
      record?.schema !== "ae-agent-plan-run-record.v1" || record.runId !== PROFILE.runId || r?.id !== PROFILE.runId ||
      !same(pv?.runtime?.modules, runtime.modules) || pv.runtime.sourceSha256 !== PROFILE.runtimeSha256 ||
      pv.actionId !== PROFILE.actionId || pv.proposalRevision !== PROFILE.proposalRevision || pv.payloadHash !== PROFILE.payloadHash ||
      r.validation?.validationId !== PROFILE.proposalRequestId || !same(record.plan?.steps, [{tool: "ame_native_fixture_probe", args: {fixtureKind: "saved-clean", restoreDirty: false}}]) ||
      r.ok !== false || r.dryRun !== false || r.confirm !== true || r.autoEditSession !== true ||
      r.errorCode !== PROFILE.errorCode || r.error !== PROFILE.errorCode || r.executedCount !== 0 || r.failedCount !== 1 || r.skippedCount !== 0 ||
      !Array.isArray(r.steps) || r.steps.length !== 1 || r.steps[0].tool !== "ame_native_fixture_probe" || r.steps[0].status !== "failed" ||
      r.steps[0].errorCode !== PROFILE.errorCode || r.steps[0].error !== PROFILE.errorCode || r.steps[0].commandId !== null || r.steps[0].phase !== null ||
      !same(r.steps[0].args, record.plan.steps[0].args) || r.m100Action?.confirmedBySurface !== "cep-panel" ||
      r.m100Action.actionId !== PROFILE.actionId || r.m100Action.payloadHash !== PROFILE.payloadHash ||
      r.m100Message?.requestId !== PROFILE.proposalRequestId || r.m100Message.executionId !== PROFILE.runId ||
      r.outcome?.mutation?.status !== "unknown" || r.outcome.execution?.originalError?.code !== PROFILE.errorCode ||
      r.safety?.activeEditSessionAtStart !== false || r.safety.protection !== "auto_edit_session" || r.safety.allowWithoutCheckpoint !== false || r.safety.autonomousSession !== null ||
      record.plan.targetProject?.file !== PROFILE.projectFile || record.project?.file !== PROFILE.projectFile ||
      r.project?.expectedFile !== PROFILE.projectFile || r.project.actualFile !== PROFILE.projectFile) fail("fixture_refusal_canonical_binding_invalid");
  const checkpointFile = path.join(PROFILE.repoRoot, "backups", PROFILE.checkpointName), cp = r.checkpoint, a = r.editSession, f = r.editSessionFinished;
  if (cp?.checkpointFile !== checkpointFile || cp.sourceFile !== PROFILE.projectFile || cp.bytes !== pins.checkpoint.bytes || cp.createdAt !== PROFILE.startedAt ||
      hash(a) !== pins.activeSessionSha256 || hash(f) !== pins.finishedSessionSha256 ||
      a?.id !== PROFILE.sessionId || a.status !== "active" || a.startedAt !== PROFILE.startedAt || !same(a.operations, []) || a.operationCount !== 0 ||
      f?.id !== PROFILE.sessionId || f.status !== "finished" || f.outcome !== "needs-review" || f.finishedAt !== PROFILE.finishedAt ||
      !same(f.operations, []) || f.operationCount !== 0 || !same(a.checkpoint, f.checkpoint) ||
      a.checkpoint.checkpointFile !== cp.checkpointFile || f.checkpoint.sourceFile !== cp.sourceFile) fail("fixture_refusal_session_binding_invalid");
  return {envelope, record, run: r, checkpointFile};
}
function receiptAudit(bytes, run) {
  const receipt = JSON.parse(bytes);
  // Durable transport redacts exactly these two diagnostics. Everything else,
  // including steps, unknown outcome, proposal, checkpoint and session, matches.
  const excludedFields = ["m100Message", "diagnostic"];
  const project = value => Object.fromEntries(Object.entries(value).filter(([key]) => !excludedFields.includes(key)));
  if (receipt.protocolVersion !== "ae-agent.panel-actions.v1" || receipt.requestId !== PROFILE.requestId || receipt.runId !== PROFILE.runId ||
      receipt.action !== "plan.run" || receipt.effect !== "protected_plan_run" || receipt.state !== "unknown" || receipt.phase !== "outcome_unresolved" ||
      receipt.delivery !== "delivered" || receipt.source !== "programmatic" || receipt.replayAllowed !== false || receipt.code !== PROFILE.errorCode || receipt.result?.runId !== PROFILE.runId ||
      !receipt.result.run || !same(project(receipt.result.run), project(run)) || !same(receipt.outcome, run.outcome) ||
      receipt.diagnostic?.requestId !== PROFILE.proposalRequestId || receipt.diagnostic.actionId !== PROFILE.actionId || receipt.diagnostic.executionId !== PROFILE.runId ||
      receipt.diagnostic.code !== PROFILE.errorCode || receipt.result.run.m100Message?.requestId !== PROFILE.proposalRequestId ||
      receipt.result.run.m100Message.actionId !== PROFILE.actionId || receipt.result.run.m100Message.executionId !== PROFILE.runId || receipt.result.run.m100Message.error?.code !== PROFILE.errorCode ||
      receipt.result.run.diagnostic?.requestId !== PROFILE.proposalRequestId || receipt.result.run.diagnostic.code !== PROFILE.errorCode) fail("fixture_refusal_transport_binding_invalid");
  return {receipt, excludedFields, projectedRunSha256: hash(project(run))};
}
function sessionAudit(evidenceRoot, run, pins) {
  const file = path.join(evidenceRoot, "edit-sessions.jsonl"), bytes = ledger.readBytes(file), rows = [];
  let start = 0;
  for (let end = bytes.indexOf(10); end >= 0; end = bytes.indexOf(10, start)) {
    const row = bytes.subarray(start, end + 1); start = end + 1;
    if (row.includes(Buffer.from(PROFILE.sessionId))) rows.push(row);
  }
  if (bytes.subarray(start).includes(Buffer.from(PROFILE.sessionId)) || rows.length !== 2 ||
      rows.some((row, i) => row.length !== pins.sessionRows[i].bytes || hash(row) !== pins.sessionRows[i].sha256)) fail("fixture_refusal_session_rows_changed");
  for (const [index, row] of rows.entries()) {
    const event = JSON.parse(row), expected = index ? run.editSessionFinished : run.editSession;
    if (event.type !== (index ? "session_finished" : "session_started") || event.session?.id !== PROFILE.sessionId || event.session.operationCount !== 0 ||
        !same(Object.keys(event.session.checkpoint).map(key => [key, event.session.checkpoint[key]]), Object.keys(event.session.checkpoint).map(key => [key, expected.checkpoint[key]]))) fail("fixture_refusal_session_binding_invalid");
  }
  return {file, rows: clone(pins.sessionRows)};
}
function contradictionInventory(repoRoot) {
  // An absence census can contradict the approved call-graph proof; it cannot
  // independently establish that authority/execution never happened.
  const dir = path.join(repoRoot, ".codex-runtime", "ame-native-fixture-ledger"), inventory = [];
  ledger.safeDirectory(dir); const stages = fs.readdirSync(dir);
  if (stages.length > 128) fail("fixture_refusal_inventory_budget_exceeded");
  const identifiers = [PROFILE.runId, PROFILE.requestId, PROFILE.proposalRequestId, PROFILE.actionId, PROFILE.sessionId];
  function linked(value, depth = 0) {
    if (depth > 32) fail("fixture_refusal_inventory_budget_exceeded");
    return typeof value === "string" ? identifiers.includes(value) : value && typeof value === "object" && Object.values(value).some(v => linked(v, depth + 1));
  }
  for (const stage of stages.sort()) {
    if (!ledger.TOKEN.test(stage)) fail("fixture_refusal_inventory_invalid");
    const child = path.join(dir, stage); ledger.safeDirectory(child); const files = fs.readdirSync(child);
    if (files.length > 32) fail("fixture_refusal_inventory_budget_exceeded");
    for (const file of files.sort()) {
      if (!/^(owner|reservation|launch|unknown|retirement-proof|retirement-audit|recovered|consumed-(create-fixture|snapshot|stage-variants))\.json$/.test(file)) fail("fixture_refusal_inventory_invalid");
      const bytes = ledger.readBytes(path.join(child, file)), row = JSON.parse(bytes);
      if (linked(row)) fail("fixture_refusal_linked_native_row_present");
      inventory.push({file: stage + "/" + file, sha256: hash(bytes)});
    }
  }
  return {role: "contradiction_check_only", linkedRowPresent: false, sha256: hash(inventory), rows: inventory};
}
// Private core is reachable only by the offline smoke's compiled test seam.
// Production exports neither the core nor injected pins/readers.
function auditCore(repoRoot, evidenceRoot, pins) {
  roots(repoRoot, evidenceRoot);
  const frozen = path.join(repoRoot, ".codex-runtime", "fixture-prephase-session-20261011"), manifestFile = path.join(frozen, "freeze-manifest.json");
  const manifest = JSON.parse(pinned(manifestFile, pins.manifest)), runtime = sourceAudit(frozen, manifest);
  const runName = "plan-runs/" + PROFILE.runId + ".json", receiptName = "cep-panel-control/" + PROFILE.requestId + ".json";
  if (!same(manifest.receipts, [{name: runName, ...pins.run}, {name: receiptName, ...pins.receipt}].map(({name, sha256, bytes}) => ({name, sha256, bytes})))) fail("fixture_refusal_manifest_receipt_pins_invalid");
  const runFile = path.join(evidenceRoot, "evidence", ...runName.split("/")), receiptFile = path.join(evidenceRoot, ...receiptName.split("/"));
  const runBytes = pinned(runFile, pins.run), receiptBytes = pinned(receiptFile, pins.receipt);
  if (!runBytes.equals(pinned(path.join(frozen, "original-receipts", ...runName.split("/")), pins.run)) ||
      !receiptBytes.equals(pinned(path.join(frozen, "original-receipts", ...receiptName.split("/")), pins.receipt))) fail("fixture_refusal_original_bytes_changed");
  const canonical = canonicalRun(runBytes, runtime, pins), transport = receiptAudit(receiptBytes, canonical.run);
  const sessions = sessionAudit(evidenceRoot, canonical.run, pins); checkpointPin(canonical.checkpointFile, pins.checkpoint);
  const contradictionCheck = contradictionInventory(repoRoot);
  return {
    ...OUTCOME, selector: selector(),
    binding: {...OUTCOME, selector: selector(), actionId: PROFILE.actionId, proposalRequestId: PROFILE.proposalRequestId,
      proposalRevision: PROFILE.proposalRevision, payloadHash: PROFILE.payloadHash, runtimeSha256: PROFILE.runtimeSha256,
      canonicalRunRecordHash: pins.run.sha256, canonicalRunProjectionHash: hash(canonical.run), canonicalRecordSha256: pins.recordSha256,
      pins: {manifest: {file: manifestFile, ...pins.manifest}, modules: clone(manifest.runtime.modules), callGraphHashes: runtime.callGraphHashes,
        run: {file: runFile, ...pins.run}, receipt: {file: receiptFile, ...pins.receipt}, sessionRows: sessions,
        activeSessionSha256: pins.activeSessionSha256, finishedSessionSha256: pins.finishedSessionSha256,
        checkpoint: {file: canonical.checkpointFile, ...pins.checkpoint}},
      receiptProjection: {excludedFields: transport.excludedFields, projectedRunSha256: transport.projectedRunSha256},
      observedEffects: {checkpointCreated: true, checkpoint: clone(canonical.run.checkpoint), editSessionStarted: true,
        editSessionId: PROFILE.sessionId, sessionOutcome: "needs-review", recordedOperations: []},
      contradictionCheck},
    proof: {selector: selector(), run: clone(canonical.run), checkpoint: clone(canonical.run.checkpoint),
      canonicalRunRecordHash: pins.run.sha256, canonicalRunProjectionHash: hash(canonical.run)},
    transport: {requestId: PROFILE.requestId, runId: PROFILE.runId, action: "plan.run", effect: "protected_plan_run", source: "programmatic",
      code: PROFILE.errorCode, state: "unknown", phase: "outcome_unresolved", delivery: "delivered", replayAllowed: false,
      recordedBinding: clone(transport.receipt.binding), acceptedAt: transport.receipt.acceptedAt, completedAt: transport.receipt.completedAt},
    inventorySha256: contradictionCheck.sha256
  };
}
function classify(repoRoot = PROFILE.repoRoot, evidenceRoot = PROFILE.evidenceRoot) { return auditCore(repoRoot, evidenceRoot, FIXED_PINS); }
module.exports = {PROFILE, OUTCOME, selector, select, classify};
