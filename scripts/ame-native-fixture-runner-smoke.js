"use strict";

// Offline runner contract checks. Uses temporary files and a scoped mock issuer;
// no AE/AME process, installer, CEP, GUI, project or live grant is involved.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const ledger=require("../mcp-server/native-fixture-attempt-ledger");

const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const checks = [];
function checked(name, fn) { fn(); checks.push(name); }
async function rejected(name, work, code) {
  await assert.rejects(work, error => !code || error.code === code || error.message === code);
  checks.push(name);
}
function fixtureGrant() {
  const issued = new WeakSet();
  return {
    TOOL_NAME: "ame_native_fixture_probe",
    SCHEMA: "ae-agent.native-fixture-probe.v2",
    validateInput(value) {
      if (!value || typeof value !== "object" || Array.isArray(value) ||
          Object.keys(value).some(key => !["fixtureKind", "restoreDirty"].includes(key)) ||
          !["saved-clean", "saved-dirty", "untitled-dirty"].includes(value.fixtureKind) ||
          (value.restoreDirty !== undefined && typeof value.restoreDirty !== "boolean")) {
        const error = new Error("fixture_invalid_input"); error.code = error.message; throw error;
      }
      return { fixtureKind: value.fixtureKind, restoreDirty: value.restoreDirty === true };
    },
    createFixtureGrantIssuer(deps) {
      const descriptorById = new Map();
      const childByToken = new WeakMap();
      const unknown = new WeakSet();
      const state = { prepared: [], phases: [], consumed: [], accepted: [], markedUnknown: 0 };
      return {
        state,
        async authorize(context) { deps.assertManualIngress(context); return { context }; },
        async prepareChild(capability, id) {
          const descriptor = deps.getOwnedChild(id);
          assert(descriptor, "descriptor must be registered before child preparation");
          descriptorById.set(id, descriptor);
          const child = Object.freeze({ id });
          childByToken.set(child, descriptor);
          state.prepared.push({ id, descriptor });
          return { child, manifestBytes: Buffer.from(`offline manifest ${descriptor.role}`), environment: { MOCK_FIXTURE: "1" } };
        },
        async issuePhase(child, operation) {
          if (unknown.has(child)) { const error = new Error("fixture_unknown_no_replay"); error.code = error.message; throw error; }
          const descriptor = childByToken.get(child);
          const expected = descriptor.role === "capture" ? ["create-fixture", "snapshot"] : ["stage-variants"];
          assert.equal(operation, expected[state.phases.filter(x => x.stageId === descriptor.stageId).length], "runner issued a phase out of order");
          state.phases.push({ stageId: descriptor.stageId, role: descriptor.role, operation });
          const attempt = { schema:"ae-agent.native-fixture-attempt.v2",actionId:"offline-action",revision:1,payloadHash:`sha256:${"a".repeat(64)}`,
            runId:"12345678-1234-4234-8234-123456789012",stageId:descriptor.stageId,nonce:descriptor.nonce,operation,status:"consumed_before_grant_publication",replayAllowed:false };
          assert.equal(await deps.consumeAttempt(attempt), true);
          state.consumed.push(attempt);
          return { filename: `signed-${operation}.grant`, bytes: Buffer.from(`grant ${operation}`), replayAllowed: false };
        },
        async acceptReceipt(child, bytes) {
          if (unknown.has(child)) { const error = new Error("fixture_unknown_no_replay"); error.code = error.message; throw error; }
          const descriptor = childByToken.get(child), text = bytes.toString("utf8");
          const receipt = JSON.parse(text);
          state.accepted.push({ role: descriptor.role, filename: receipt.phase || "boot" });
          if (receipt.phase === "boot") return { status: "boot-verified", receipt };
          if (receipt.phase === "create-fixture") return { status: "fixture-verified", receipt };
          if (receipt.phase === "snapshot") return { status: "snapshot-verified", receipt };
          if (receipt.phase === "stage-variants") return { status: "variants-verified", receipt };
          if (receipt.phase === "refused_or_unknown") { const error = new Error("fixture_native_refusal"); error.code = error.message; throw error; }
          const error = new Error("fixture_receipt_wrong_phase_no_replay"); error.code = error.message; throw error;
        },
        markUnknown(child) { unknown.add(child); state.markedUnknown += 1; }
      };
    }
  };
}

const originalLoad = Module._load;
const grantMock = fixtureGrant();
const baseIssuerFactory = grantMock.createFixtureGrantIssuer;
Module._load = function(request, parent, isMain) {
  if (request === "./ame-native-fixture-grant" && parent && parent.filename.endsWith(`${path.sep}mcp-server${path.sep}ame-native-fixture-runner.js`)) return grantMock;
  return originalLoad.call(this, request, parent, isMain);
};
let runner;
try { runner = require("../mcp-server/ame-native-fixture-runner"); }
finally { Module._load = originalLoad; }

function createFixture() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "ame-native-fixture-runner-"));
  const root = path.join(temp, "repo"); fs.mkdirSync(root);
  fs.mkdirSync(path.join(root, ".codex-runtime"));
  const artifactDir = path.join(temp, "artifacts"); fs.mkdirSync(artifactDir);
  const binary = path.join(artifactDir, "AEAgentSnapshotProbe.aex"); fs.writeFileSync(binary, Buffer.from("offline AEX fixture"), { flag: "wx" });
  const pluginPath = path.join(artifactDir, "installed-probe.aex");
  const executablePath = path.join(artifactDir, "afterfx.exe"); fs.writeFileSync(executablePath, Buffer.from("offline afterfx.exe fixture"), { flag: "wx" });
  const binarySha256 = hash(fs.readFileSync(binary));
  const artifacts = { receipt: { buildId: "offline-build-001" }, receiptPath: path.join(artifactDir, "build-receipt.json"), binary,
    binarySha256, pluginPath, pluginSha256: binarySha256, executablePath, executableSha256: hash(fs.readFileSync(executablePath)) };
  const baseline = Buffer.from("mock captured baseline project");
  const state = { launches: [], killCalls: 0, artifactsCalls: 0, mutateBaselineAfterSnapshot: false, badVariantHash: false, omitBoot: false, refuse: false };
  function writeReceipt(descriptor, phase, extra = {}) {
    const names = { boot: "signed-boot.json", "create-fixture": "signed-fixture.json", snapshot: "signed-snapshot.json", "stage-variants": "signed-variants.json", "refused_or_unknown": "signed-refusal.json" };
    const name = names[phase]; assert(name, `unknown mock phase: ${phase}`);
    fs.writeFileSync(path.join(descriptor.rootPath, name), JSON.stringify({ phase, ...extra }), { flag: "wx" });
  }
  const deps = {
    repoRoot: root,
    assertManualIngress(context) { assert(context && context.manual === true); },
    getArtifacts() { state.artifactsCalls++; return artifacts; },
    async launchChild(descriptor) {
      assert.deepEqual(fs.readdirSync(descriptor.rootPath).sort(),descriptor.role==="capture" ? ["launch.manifest"] : ["baseline.aep","launch.manifest"],"native Claim root must contain only its fixed input files");
      state.launches.push({ role: descriptor.role, rootPath: descriptor.rootPath });
      if (state.refuse) writeReceipt(descriptor, "refused_or_unknown", { reason: "offline signed refusal" });
      else if (!state.omitBoot) writeReceipt(descriptor, "boot");
      return { pid: 4100 + state.launches.length };
    },
    async inspectProcess(pid) {return {pid,path:executablePath,createdUnixMs:1791648389614,createdAt:"2026-10-10T16:06:29.614591Z"};},
    // This mock models the guarded server consume callback; runner writes the durable marker.
    async consumeAttempt() { return true; }
  };
  grantMock.createFixtureGrantIssuer = issuerDeps => {
    const issuer = baseIssuerFactory({ ...issuerDeps, consumeAttempt: async attempt => {
      state.consumed = (state.consumed || []).concat(attempt.operation); return issuerDeps.consumeAttempt(attempt);
    } });
    const originalIssue = issuer.issuePhase;
    issuer.issuePhase = async (child, operation) => {
      const issued = await originalIssue(child, operation);
      const descriptor = issuer.state.prepared.find(item => item.id === child.id)?.descriptor;
      assert(descriptor, "phase child descriptor should be known");
      let fields = {};
      if (operation === "snapshot") {
        const baselinePath = path.join(descriptor.rootPath, "baseline.aep"); fs.writeFileSync(baselinePath, baseline, { flag: "wx" });
        fields = { baselinePath, baselineSha256: hash(baseline) };
      } else if (operation === "stage-variants") {
        fields.outputs = [1, 2].map(variant => {
          const file = path.join(descriptor.rootPath, `variant-0${variant}.aep`), bytes = Buffer.from(`variant-${variant}`);
          fs.writeFileSync(file, bytes, { flag: "wx" });
          return { path: file, sha256: state.badVariantHash && variant === 2 ? "0".repeat(64) : hash(bytes) };
        });
      }
      writeReceipt(descriptor, operation, fields);
      if (operation === "snapshot" && state.mutateBaselineAfterSnapshot) fs.writeFileSync(fields.baselinePath, Buffer.from("altered baseline"));
      return issued;
    };
    return issuer;
  };
  const executor = runner.createExecutor(deps);
  const context = { manual: true, args: { fixtureKind: "saved-dirty", restoreDirty: false }, runId: "12345678-1234-4234-8234-123456789012",
    record: { actionId: "offline-action", revision: 1, payloadHash: `sha256:${"a".repeat(64)}` } };
  return { temp, root, artifacts, deps, state, executor, context, baseline };
}
function removeFixture(test) { fs.rmSync(test.temp, { recursive: true, force: true }); }

function testBuildArtifactsGuards(test) {
  const support = "C:\\Program Files\\Adobe\\Adobe After Effects 2026\\Support Files";
  const appData = "C:\\offline\\AppData";
  const virtualFiles = new Map(), virtualDirs = new Set();
  for (let dir = path.join(support, "Plug-ins"); ; dir = path.dirname(dir)) {
    virtualDirs.add(path.resolve(dir).toLowerCase()); if (path.dirname(dir) === dir) break;
  }
  function put(file, bytes) { virtualFiles.set(path.resolve(file).toLowerCase(), Buffer.from(bytes)); }
  put(path.join(support, "AfterFX.exe"), "offline executable placeholder");
  const installedRoot = path.join(appData, "Adobe", "CEP", "extensions", "com.codex.aemcpbridge");
  for (const name of ["index.html", "panel.js", "native-probe-startup-guard.js"]) {
    const source = path.join(test.root, "cep-panel", name); fs.mkdirSync(path.dirname(source), { recursive: true });
    fs.writeFileSync(source, `offline source ${name}`);
    put(path.join(installedRoot, name), fs.readFileSync(source));
  }
  for (let dir = installedRoot; ; dir = path.dirname(dir)) {
    virtualDirs.add(path.resolve(dir).toLowerCase()); if (path.dirname(dir) === dir) break;
  }
  const lstat = fs.lstatSync, realpath = fs.realpathSync, readFile = fs.readFileSync;
  const inode = new Map(); let nextInode = 100000;
  function key(file) { return path.resolve(file).toLowerCase(); }
  function isVirtual(file) { const k = key(file); return virtualFiles.has(k) || virtualDirs.has(k); }
  fs.lstatSync = function(file, ...args) {
    if (!isVirtual(file)) return lstat.call(fs, file, ...args);
    const k = key(file), bytes = virtualFiles.get(k), ino = inode.get(k) || nextInode++;
    inode.set(k, ino);
    return { dev: 1, ino, size: bytes ? bytes.length : 0, mtimeMs: 1, nlink: 1,
      isFile: () => Boolean(bytes), isDirectory: () => !bytes, isSymbolicLink: () => false };
  };
  fs.realpathSync = function(file, ...args) { return isVirtual(file) ? path.resolve(file) : realpath.call(fs, file, ...args); };
  fs.readFileSync = function(file, ...args) {
    const bytes = virtualFiles.get(key(file)); if (bytes) return args.length ? bytes.toString(args[0]) : Buffer.from(bytes);
    return readFile.call(fs, file, ...args);
  };
  const previousAppData = process.env.APPDATA;
  process.env.APPDATA = appData;
  try {
    const builds = path.join(test.root, ".codex-runtime", "ame-native-prerequisites", "native-probe-build");
    const buildName = `build-${"1".repeat(32)}`, build = path.join(builds, buildName), binary = path.join(build, "bin", "AEAgentSnapshotProbe.aex");
    fs.mkdirSync(path.dirname(binary), { recursive: true });
    const sourcePath = path.join(test.root, "native", "fixture.cpp"); fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    const sourceBytes = Buffer.from("offline source baseline"), binaryBytes = Buffer.from("offline AEX build output");
    fs.writeFileSync(sourcePath, sourceBytes); fs.writeFileSync(binary, binaryBytes);
    const receiptPath = path.join(build, "build-receipt.json");
    const receipt = { schema: "ae-agent.native-probe-build.v2", buildId: "offline-build-id", timestampUtc: "2026-10-01T00:00:00.000Z",
      signedFixturePathCompiled: true, sourceHashesStableAcrossBuild: true, protocolSmokeExitCode: 0,
      protocolSmoke: { legacyProtocolChecks: 215, signedFixtureChecks: 63 }, sourceFiles: [{ path: "native/fixture.cpp", sha256: hash(sourceBytes) }],
      fixtureGrantSmoke: { status: "passed", passed: 63 },
      binaryPath: binary, binarySha256: hash(binaryBytes) };
    fs.writeFileSync(receiptPath, JSON.stringify(receipt));

    const valid = runner.buildArtifacts(test.root);
    assert.equal(valid.receipt.buildId, "offline-build-id");
    assert.equal(valid.pluginPath, path.join(support, "Plug-ins", "AEAgentSnapshotProbe.aex"));
    checks.push("build_artifacts_accepts_current_receipt_and_guards");

    fs.writeFileSync(receiptPath, JSON.stringify({ ...receipt, fixtureGrantSmoke: { status: "failed", passed: 80 } }));
    assert.throws(() => runner.buildArtifacts(test.root), /fixture_runner_current_signed_build_required/);
    checks.push("build_artifacts_rejects_failed_fixture_grant_smoke");
    fs.writeFileSync(receiptPath, JSON.stringify({ ...receipt, fixtureGrantSmoke: { status: "passed", passed: 62 } }));
    assert.throws(() => runner.buildArtifacts(test.root), /fixture_runner_current_signed_build_required/);
    checks.push("build_artifacts_rejects_insufficient_fixture_grant_smoke_coverage");
    fs.writeFileSync(receiptPath, JSON.stringify(receipt));

    fs.writeFileSync(sourcePath, "changed since build");
    assert.throws(() => runner.buildArtifacts(test.root), /fixture_runner_current_signed_build_required/);
    checks.push("build_artifacts_rejects_stale_source_hash");
    fs.writeFileSync(sourcePath, sourceBytes);
    put(path.join(installedRoot, "panel.js"), "changed installed panel");
    assert.throws(() => runner.buildArtifacts(test.root), /fixture_runner_installed_cep_guard_required/);
    checks.push("build_artifacts_rejects_installed_guard_mismatch");
  } finally {
    fs.lstatSync = lstat; fs.realpathSync = realpath; fs.readFileSync = readFile;
    if (previousAppData === undefined) delete process.env.APPDATA; else process.env.APPDATA = previousAppData;
  }
}

async function main() {
  let t = createFixture();
  try {
    await rejected("execute_without_capability_has_no_files_or_launch", () => t.executor.execute(t.context.args), "fixture_runner_authorization_required");
    checked("no_auth_no_side_effects", () => { assert.equal(t.state.launches.length, 0); assert.equal(fs.existsSync(path.join(t.root, ".codex-runtime", "ame-native-fixtures")), false); });
    const capability = await t.executor.authorize(t.context);
    await rejected("valid_but_different_arguments_denied_before_artifacts", () => t.executor.execute({ fixtureKind: "saved-clean" }, capability), "fixture_runner_authorization_required");
    checked("wrong_args_no_side_effects", () => { assert.equal(t.state.launches.length, 0); assert.equal(t.state.artifactsCalls, 0); assert.equal(fs.existsSync(path.join(t.root, ".codex-runtime", "ame-native-fixtures")), false); });
  } finally { removeFixture(t); }

  t = createFixture();
  try {
    const result = await t.executor.execute(t.context.args, await t.executor.authorize(t.context));
    checked("two_child_roles_and_receipts", () => {
      assert.deepEqual(t.state.launches.map(x => x.role), ["capture", "stage"]);
      assert.notEqual(t.state.launches[0].rootPath, t.state.launches[1].rootPath);
      assert.deepEqual(t.state.consumed, ["create-fixture", "snapshot", "stage-variants"]);
      assert.deepEqual(result.childProcesses.map(x => x.terminalReceiptVerified), [true, true]);
      assert.equal(result.nativeSubmissionAttempted, false);
      assert.equal(result.productionBackend, false);
    });
    checked("each_phase_has_durable_prelaunch_attempt", () => {
      for (const launch of t.state.launches) {
        const owner=fs.readdirSync(path.join(t.root,".codex-runtime","ame-native-fixture-ledger")).find(id=>JSON.parse(fs.readFileSync(path.join(t.root,".codex-runtime","ame-native-fixture-ledger",id,"owner.json"))).value.rootPath===launch.rootPath);
        assert(fs.existsSync(path.join(t.root,".codex-runtime","ame-native-fixture-ledger",owner,"reservation.json")));
        assert(fs.existsSync(path.join(t.root,".codex-runtime","ame-native-fixture-ledger",owner,"launch.json")));
        assert(!fs.existsSync(path.join(launch.rootPath,"server-owner.json")));
        assert(!fs.existsSync(path.join(launch.rootPath,"server-launch-attempt.json")));
        assert(fs.existsSync(path.join(launch.rootPath, "launch.manifest")));
      }
      for (const operation of ["create-fixture", "snapshot", "stage-variants"]) {
        const marker=fs.readdirSync(path.join(t.root,".codex-runtime","ame-native-fixture-ledger")).map(id=>path.join(t.root,".codex-runtime","ame-native-fixture-ledger",id,`consumed-${operation}.json`)).find(fs.existsSync);
        assert(marker, `missing consumed marker for ${operation}`);
      }
    });
    checked("current_project_scope_preserved_and_no_kill", () => {
      assert.equal(path.resolve(t.root), path.resolve(t.deps.repoRoot));
      assert.equal(t.state.killCalls, 0);
      assert.equal(result.automaticRetryAllowed, false);
    });
    checked("complete_group_allows_new_attempt_without_claiming_child_exit",()=> {
      ledger.assertAdmission(t.root);
      const marker=ledger.read(ledger.completionFile(t.root,t.context.runId));assert.equal(marker.value.endpointInert,true);assert.equal(marker.value.processExited,false);assert.equal(marker.value.entries.length,2);
    });
    checked("completion_marker_or_receipt_loss_keeps_admission_closed",()=> {
      const file=ledger.completionFile(t.root,t.context.runId),bytes=fs.readFileSync(file);
      fs.unlinkSync(file);assert.throws(()=>ledger.assertAdmission(t.root),/unretired_attempt/);fs.writeFileSync(file,bytes,{flag:"wx"});
      const row=JSON.parse(bytes);row.value.producer="client_echo";row.sha256=ledger.hash(row.value);fs.writeFileSync(file,JSON.stringify(row));assert.throws(()=>ledger.assertAdmission(t.root),/completion_invalid/);fs.writeFileSync(file,bytes);
      const child=ledger.read(file).value.entries[0],receiptFile=path.join(child.descriptor.rootPath,child.receiptName),receipt=fs.readFileSync(receiptFile);
      fs.appendFileSync(receiptFile,"changed");assert.throws(()=>ledger.assertAdmission(t.root),/receipt_or_launch_changed/);fs.writeFileSync(receiptFile,receipt);
      ledger.assertAdmission(t.root);
    });
    await t.executor.authorize({...t.context,runId:crypto.randomUUID(),record:{...t.context.record,actionId:"offline-next-action"}});
    checks.push("completed_fixture_accepts_fresh_independent_authorization");
    checked("private_verified_result_accepts_exact_producer", () => {
      const verification = t.executor.verifyResult(result);
      assert.equal(verification.outputsHashVerified, true);
      assert.equal(typeof result.evidenceId, "string");
      assert.deepEqual(result.authorization, { runId: t.context.runId, proposalId: t.context.record.actionId });
      assert.throws(() => t.executor.verifyResult({ ...result, evidenceId: "caller-chosen" }), /fixture_runner_unverified_result/);
    });
    checked("private_verified_result_rechecks_files", () => {
      fs.appendFileSync(result.outputFiles[0].path, "altered");
      assert.throws(() => t.executor.verifyResult(result), /fixture_runner_verified_files_changed/);
    });
  } finally { removeFixture(t); }

  t=createFixture();
  try {
    const complete=ledger.complete,uuid=crypto.randomUUID,evidenceId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",capability=await t.executor.authorize(t.context);
    ledger.complete=()=>{throw Object.assign(Error("offline_completion_write_failed"),{code:"offline_completion_write_failed"});};crypto.randomUUID=()=>evidenceId;
    try {
      await rejected("completion_publication_failure_never_publishes_private_cache",()=>t.executor.execute(t.context.args,capability),"offline_completion_write_failed");
    } finally {ledger.complete=complete;crypto.randomUUID=uuid;}
    await rejected("failed_completion_has_no_private_result",()=>t.executor.inspectResult({evidenceId}),"fixture_runner_verified_result_unavailable");
    checked("failed_completion_keeps_admission_closed",()=>assert.throws(()=>ledger.assertAdmission(t.root),/unretired_attempt/));
  } finally {removeFixture(t);}

  t = createFixture(); t.state.refuse = true;
  try {
    const capability = await t.executor.authorize(t.context);
    await rejected("signed_refusal_is_terminal", () => t.executor.execute(t.context.args, capability), "fixture_native_refusal");
    checked("signed_refusal_does_not_advance_or_retry", () => {
      assert.equal(t.state.launches.length, 1);
      assert.equal(t.state.consumed, undefined);
      assert(fs.readdirSync(path.join(t.root,".codex-runtime","ame-native-fixture-ledger")).length===1);
    });
  } finally { removeFixture(t); }

  t = createFixture(); t.state.omitBoot = true;
  try {
    const start = Date.now;
    let fakeNow = start(); Date.now = () => (fakeNow += 91000);
    try {
      const capability = await t.executor.authorize(t.context);
      await rejected("unknown_launch_receipt_is_terminal_no_replay", () => t.executor.execute(t.context.args, capability), "fixture_runner_receipt_unknown_no_replay");
      await rejected("unknown_execution_capability_cannot_replay", () => t.executor.execute(t.context.args, capability), "fixture_runner_authorization_required");
    } finally { Date.now = start; }
    checked("unknown_child_and_launch_record_preserved", () => {
      assert.equal(t.state.launches.length, 1);
      assert(fs.readdirSync(path.join(t.root,".codex-runtime","ame-native-fixture-ledger")).length===1);
      assert.equal(t.state.launches[0].role, "capture");
    });
  } finally { removeFixture(t); }

  t = createFixture(); t.state.mutateBaselineAfterSnapshot = true;
  try {
    const capability = await t.executor.authorize(t.context);
    await rejected("altered_capture_baseline_refuses_stage", () => t.executor.execute(t.context.args, capability), "fixture_runner_baseline_changed");
    checked("changed_baseline_never_launches_stage", () => assert.deepEqual(t.state.launches.map(x => x.role), ["capture"]));
  } finally { removeFixture(t); }

  t = createFixture(); t.state.badVariantHash = true;
  try {
    const capability = await t.executor.authorize(t.context);
    await rejected("variant_hash_mismatch_rejected", () => t.executor.execute(t.context.args, capability), "fixture_runner_variant_file_changed");
    checked("bad_variant_receipt_is_terminal", () => assert.equal(t.state.launches.length, 2));
  } finally { removeFixture(t); }

  t = createFixture();
  try {
    const file = path.join(t.temp, "write-once.bin"), bytes = Buffer.from("created once");
    runner.writeOnce(file, bytes);
    checked("write_once_creates_and_fsyncs_file", () => assert.deepEqual(fs.readFileSync(file), bytes));
    await rejected("write_once_refuses_existing_destination", async () => runner.writeOnce(file, Buffer.from("replacement")));
    checked("write_once_preserves_original", () => assert.deepEqual(fs.readFileSync(file), bytes));
    await rejected("read_regular_rejects_directory", async () => runner.readRegular(t.temp));
    const hardLink = path.join(t.temp, "write-once-hardlink.bin");
    fs.linkSync(file, hardLink);
    await rejected("read_regular_rejects_hardlink", async () => runner.readRegular(file), "fixture_runner_file_identity");
  } finally { removeFixture(t); }

  t = createFixture();
  try { testBuildArtifactsGuards(t); }
  finally { removeFixture(t); }

  process.stdout.write(JSON.stringify({ status: "passed", offline: true, hostLoaded: false, realProcessSpawned: false,
    mockGrantIssuer: true, passed: checks.length, checks }) + "\n");
}
main().catch(error => {
  process.stderr.write(JSON.stringify({ status: "failed", offline: true, hostLoaded: false, passed: checks.length, reason: error.stack }) + "\n");
  process.exitCode = 1;
});
