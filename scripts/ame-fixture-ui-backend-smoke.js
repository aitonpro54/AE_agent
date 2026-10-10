"use strict";

// Offline contract checks for the fixed fixture-disposition readers.
// Process inventory and CDP are injected/faked; no network, app, or host process is touched.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const backend = require("../mcp-server/ame-fixture-ui-backend");
const disposition = require("../mcp-server/ame-fixture-ui-disposition");
const control = require("../mcp-server/cep-panel-control");
const actionContract = require("../cep-panel/panel-action-contract");

const checks = [];
function checked(name, fn) { fn(); checks.push(name); }
async function rejected(name, work, code) {
  let error;
  try { await work(); } catch (caught) { error = caught; }
  assert(error, `${name}: expected rejection`);
  if (code) assert.equal(error.code || error.message, code, `${name}: wrong error code (${error.message})`);
  checks.push(name);
}
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ame-fixture-ui-backend-smoke-"));
const selector = { requestId: disposition.EXACT.requestId, runId: disposition.EXACT.runId };
const processRow = { pid: 31728, createdAt: "2026-10-10T04:09:13.0045200Z",
  path: "C:\\Program Files\\Adobe\\Adobe After Effects 2026\\Support Files\\AfterFX.exe" };
const dynamicLinkChild = (pid, createdAt) => ({ pid, createdAt, path: processRow.path,
  parentPid: 28468, parentCreatedAt: "2026-10-10T04:09:15.6469480Z",
  parentPath: "C:\\Program Files\\Adobe\\Adobe After Effects 2026\\Support Files\\dynamiclinkmanager.exe",
  commandLine: "-m" });
const knownForeignChildren = [
  dynamicLinkChild(38316, "2026-10-10T13:52:55.0433830Z"),
  dynamicLinkChild(36520, "2026-10-10T13:54:03.5742640Z")
];

function selectedFixture(root) {
  const installRoot = path.join(root, "installed-extension"); fs.mkdirSync(installRoot, { recursive: true });
  const hashes = {};
  for (const asset of ["panel-action-contract.js", "panel-actions.js", "panel.js"]) {
    const file = path.join(installRoot, asset), bytes = Buffer.from(`offline ${asset}\r\n`);
    fs.writeFileSync(file, bytes); hashes[asset] = sha(bytes);
  }
  return { state: { panelInstanceId: "offline-panel", panelLifecycleEpoch: 3, panelGeneration: "g3" },
    target: { id: "offline-cdp-page", webSocketDebuggerUrl: "ws://127.0.0.1:8870/devtools/page/offline" },
    installed: { indexPath: path.join(installRoot, "index.html"), hashes } };
}
function readersFixture(root, overrides = {}) {
  const selected = overrides.selected || selectedFixture(path.join(root, "installed"));
  const status = { pendingCommands: 0, inflightCommands: [], humanGuardRuntime: { pid: 77, startedAt: "2026-10-10T00:00:00.000Z" } };
  const deps = { evidenceRoot: path.join(root, "evidence"), projectRoot: path.join(root, "project"),
    panelService: { async maintenanceTarget() { return selected; } },
    readBridgeStatus: () => status, loadedRuntimeSha256: "a".repeat(64), currentRuntimeSha256: () => "a".repeat(64),
    executorQuiescence: () => ({ executing: false, pendingCount: 0, descriptorCount: 0 }),
    inspectAE: async () => [{ ...processRow }], ...overrides };
  return { readers: backend.createReaders(deps), deps, selected, status };
}

function makeFakeWebSocket(options = {}) {
  const { files, mode = "ok", duplicateAsset = null } = options;
  const calls = [];
  const sourceById = new Map();
  class FakeWebSocket {
    constructor(address) {
      this.address = address;
      setImmediate(() => mode === "handshake-error" ? this.onerror?.(Error("offline handshake error")) : this.onopen?.());
    }
    emit(value) { this.onmessage?.({ data: JSON.stringify(value) }); }
    send(serialized) {
      const request = JSON.parse(serialized); calls.push(request.method);
      if (mode === "close-before-response" && request.method === "Debugger.enable") {
        setImmediate(() => this.onclose?.()); return;
      }
      if (mode === "request-error" && request.method === "Debugger.enable") {
        setImmediate(() => this.emit({ id: request.id, error: { message: "offline" } })); return;
      }
      if (request.method === "Debugger.enable") {
        let id = 0;
        for (const asset of ["panel-action-contract.js", "panel-actions.js", "panel.js"]) {
          const file = path.join(path.dirname(files.indexPath), asset), scriptId = `offline-${++id}`;
          sourceById.set(scriptId, { asset, file });
          const parsed = { method: "Debugger.scriptParsed", params: { scriptId, url: pathToFileURL(file).href } };
          setImmediate(() => this.emit(parsed));
          if (asset === duplicateAsset) setImmediate(() => this.emit({ ...parsed, params: { ...parsed.params, scriptId: `${scriptId}-duplicate` } }));
        }
        setImmediate(() => this.emit({ id: request.id, result: {} })); return;
      }
      if (request.method === "Debugger.getScriptSource") {
        const file = sourceById.get(request.params.scriptId)?.file;
        let scriptSource = fs.readFileSync(file, "utf8");
        if (mode === "source-mismatch" && request.params.scriptId === "offline-3") scriptSource += "changed";
        // CDP may report a BOM and CRLF where the installed bytes normalize identically.
        scriptSource = "\uFEFF" + scriptSource.replace(/\r?\n/g, "\r\n");
        setImmediate(() => this.emit({ id: request.id, result: { scriptSource } })); return;
      }
      setImmediate(() => this.emit({ id: request.id, result: {} }));
    }
    close() { setImmediate(() => this.onclose?.()); }
  }
  return { FakeWebSocket, calls };
}

async function main() {
  const root = path.join(tempRoot, "readers"); fs.mkdirSync(root, { recursive: true });
  const fixture = readersFixture(root);
  const originalEvaluate = control.evaluateViaWebSocket;
  let evaluateCalls = 0;
  try {
    control.evaluateViaWebSocket = async (url, expression, timeoutMs) => {
      evaluateCalls++; assert.equal(url, fixture.selected.target.webSocketDebuggerUrl); assert.equal(timeoutMs, 5000);
      assert(expression.includes("window.AEAgentPanelActions"));
      assert(expression.includes("readAmeFixtureUIGuard"));
      assert(expression.includes(JSON.stringify(selector)));
      assert.equal(/Runtime\.evaluate|fetch\(|XMLHttpRequest/.test(expression), false);
      return { offlineGuard: true };
    };
    await rejected("panel_guard_rejects_caller_selector_before_target_read", () => fixture.readers.readPanelGuard({ ...selector, extra: true }), "fixture_disposition_selector_invalid");
    assert.equal(evaluateCalls, 0);
    const guard = await fixture.readers.readPanelGuard(selector);
    checked("panel_guard_uses_only_fixed_exact_reader", () => { assert.deepEqual(guard, { offlineGuard: true }); assert.equal(evaluateCalls, 1); });
  } finally { control.evaluateViaWebSocket = originalEvaluate; }

  const transportRoot = path.join(tempRoot, "transport"), transportDir = path.join(transportRoot, "evidence", "cep-panel-control");
  fs.mkdirSync(transportDir, { recursive: true });
  const transportFixture = readersFixture(transportRoot);
  const indexFile = path.join(transportDir, "identities.json");
  fs.writeFileSync(indexFile, JSON.stringify({ schema: "ae-agent.cep-panel-transport.v1", identities: {} }));
  const absent = transportFixture.readers.readTransportAbsence(selector);
  checked("valid_empty_transport_index_proves_exact_id_absent", () => { assert.equal(absent.originalReceiptAbsent, true); assert.equal(absent.pendingCount, 0); assert.equal(absent.inflightCount, 0); });

  const receipt = { protocolVersion: control.PROTOCOL_VERSION, requestId: selector.requestId,
    action: actionContract.ACTION_CATALOG[0].name, signature: "b".repeat(64), state: "unknown", phase: "submitted", delivery: "unknown", replayAllowed: false };
  control.saveDurableReceipt(transportDir, receipt);
  await rejected("present_original_transport_receipt_is_not_absence", () => transportFixture.readers.readTransportAbsence(selector), "fixture_disposition_transport_present_or_corrupt");
  fs.rmSync(path.join(transportDir, selector.requestId + ".json"));
  fs.writeFileSync(indexFile, "{corrupt");
  await rejected("corrupt_transport_index_fails_closed", () => transportFixture.readers.readTransportAbsence(selector));
  fs.rmSync(indexFile);
  await rejected("missing_transport_index_is_not_proof_of_absence", () => transportFixture.readers.readTransportAbsence(selector));

  const quiescentRoot = path.join(tempRoot, "quiescence"); fs.mkdirSync(quiescentRoot, { recursive: true });
  const quiescent = readersFixture(quiescentRoot);
  const clean = await quiescent.readers.readExecutorQuiescence();
  checked("exact_single_pinned_ae_process_is_quiescent", () => { assert.equal(clean.quiescent, true); assert.equal(clean.childProcesses.length, 0); });
  const knownChildren = readersFixture(path.join(tempRoot, "known-children"), { inspectAE: async () => [{ ...processRow }, ...knownForeignChildren.map(row => ({ ...row }))] });
  const knownChildrenResult = await knownChildren.readers.readExecutorQuiescence();
  checked("two_exact_preexisting_dynamic_link_children_are_accepted_as_foreign", () => { assert.equal(knownChildrenResult.quiescent, true); assert.deepEqual(knownChildrenResult.childProcesses, []); });
  const oneKnownChild = readersFixture(path.join(tempRoot, "one-known-child"), { inspectAE: async () => [{ ...processRow }, { ...knownForeignChildren[0] }] });
  const oneKnownChildResult = await oneKnownChild.readers.readExecutorQuiescence();
  checked("one_exact_preexisting_dynamic_link_child_is_accepted", () => { assert.equal(oneKnownChildResult.quiescent, true); });
  await rejected("executor_pending_state_denied", () => readersFixture(path.join(tempRoot, "pending"), { executorQuiescence: () => ({ executing: false, pendingCount: 1, descriptorCount: 0 }) }).readers.readExecutorQuiescence(), "fixture_disposition_executor_not_quiescent");
  await rejected("wrong_pinned_process_birth_denied", () => readersFixture(path.join(tempRoot, "wrong-birth"), { inspectAE: async () => [{ ...processRow, createdAt: "2026-10-10T04:09:14.000Z" }] }).readers.readExecutorQuiescence(), "fixture_disposition_executor_not_quiescent");
  await rejected("second_ae_host_denied", () => readersFixture(path.join(tempRoot, "second-host"), { inspectAE: async () => [{ ...processRow }, { ...processRow, pid: processRow.pid + 1 }] }).readers.readExecutorQuiescence(), "fixture_disposition_executor_not_quiescent");
  await rejected("dynamic_link_child_pid_reuse_denied", () => readersFixture(path.join(tempRoot, "child-pid-reuse"), { inspectAE: async () => [{ ...processRow }, { ...knownForeignChildren[0], createdAt: "2026-10-10T13:52:56.000Z" }] }).readers.readExecutorQuiescence(), "fixture_disposition_executor_not_quiescent");
  await rejected("dynamic_link_child_wrong_parent_pid_denied", () => readersFixture(path.join(tempRoot, "child-wrong-parent"), { inspectAE: async () => [{ ...processRow }, { ...knownForeignChildren[0], parentPid: 28469 }] }).readers.readExecutorQuiescence(), "fixture_disposition_executor_not_quiescent");
  await rejected("dynamic_link_child_wrong_parent_birth_denied", () => readersFixture(path.join(tempRoot, "child-wrong-parent-birth"), { inspectAE: async () => [{ ...processRow }, { ...knownForeignChildren[0], parentCreatedAt: "2026-10-10T04:09:16.000Z" }] }).readers.readExecutorQuiescence(), "fixture_disposition_executor_not_quiescent");
  await rejected("dynamic_link_child_wrong_image_denied", () => readersFixture(path.join(tempRoot, "child-wrong-image"), { inspectAE: async () => [{ ...processRow }, { ...knownForeignChildren[0], path: "C:\\unexpected\\AfterFX.exe" }] }).readers.readExecutorQuiescence(), "fixture_disposition_executor_not_quiescent");
  await rejected("dynamic_link_child_wrong_parent_image_denied", () => readersFixture(path.join(tempRoot, "child-wrong-parent-image"), { inspectAE: async () => [{ ...processRow }, { ...knownForeignChildren[0], parentPath: "C:\\unexpected\\dynamiclinkmanager.exe" }] }).readers.readExecutorQuiescence(), "fixture_disposition_executor_not_quiescent");
  await rejected("dynamic_link_child_wrong_command_line_denied", () => readersFixture(path.join(tempRoot, "child-wrong-command-line"), { inspectAE: async () => [{ ...processRow }, { ...knownForeignChildren[0], commandLine: "-other" }] }).readers.readExecutorQuiescence(), "fixture_disposition_executor_not_quiescent");
  await rejected("unknown_extra_ae_child_denied", () => readersFixture(path.join(tempRoot, "extra-child"), { inspectAE: async () => [{ ...processRow }, ...knownForeignChildren.map(row => ({ ...row })), { ...knownForeignChildren[0], pid: 42000 }] }).readers.readExecutorQuiescence(), "fixture_disposition_executor_not_quiescent");
  const dirtyTreeRoot = path.join(tempRoot, "dirty-tree"), fixtureTree = path.join(dirtyTreeRoot, "project", ".codex-runtime", "ame-native-fixtures");
  fs.mkdirSync(fixtureTree, { recursive: true }); fs.writeFileSync(path.join(fixtureTree, "retained-child"), "offline retained marker");
  await rejected("nonempty_native_fixture_tree_denied", () => readersFixture(dirtyTreeRoot).readers.readExecutorQuiescence(), "fixture_disposition_executor_not_quiescent");

  const runtimeRoot = path.join(tempRoot, "runtime"), runtimeFixture = readersFixture(runtimeRoot);
  const originalWebSocket = global.WebSocket;
  try {
    let fake = makeFakeWebSocket({ files: runtimeFixture.selected.installed }); global.WebSocket = fake.FakeWebSocket;
    const identity = await runtimeFixture.readers.readRuntimeIdentity();
    checked("loaded_panel_sources_match_normalized_disk_hashes", () => {
      assert.equal(identity.loadedRuntimeSha256, "a".repeat(64));
      assert.deepEqual(fake.calls, ["Debugger.enable", "Debugger.getScriptSource", "Debugger.getScriptSource", "Debugger.getScriptSource"]);
    });

    fake = makeFakeWebSocket({ files: runtimeFixture.selected.installed, mode: "source-mismatch" }); global.WebSocket = fake.FakeWebSocket;
    await rejected("loaded_cdp_source_mismatch_denied", () => backend.loadedPanelSources(runtimeFixture.selected), "fixture_disposition_loaded_source_mismatch");

    fake = makeFakeWebSocket({ files: runtimeFixture.selected.installed, duplicateAsset: "panel.js" }); global.WebSocket = fake.FakeWebSocket;
    await rejected("duplicate_loaded_panel_script_denied", () => backend.loadedPanelSources(runtimeFixture.selected), "fixture_disposition_loaded_source_ambiguous");

    fake = makeFakeWebSocket({ files: runtimeFixture.selected.installed, mode: "handshake-error" }); global.WebSocket = fake.FakeWebSocket;
    await rejected("cdp_handshake_socket_failure_reported", () => backend.loadedPanelSources(runtimeFixture.selected), "fixture_disposition_cdp_failed");

    fake = makeFakeWebSocket({ files: runtimeFixture.selected.installed, mode: "request-error" }); global.WebSocket = fake.FakeWebSocket;
    await rejected("cdp_protocol_request_error_reported", () => backend.loadedPanelSources(runtimeFixture.selected), "fixture_disposition_cdp_request_failed");

    fake = makeFakeWebSocket({ files: runtimeFixture.selected.installed, mode: "close-before-response" }); global.WebSocket = fake.FakeWebSocket;
    await rejected("cdp_close_with_pending_request_reported", () => backend.loadedPanelSources(runtimeFixture.selected), "fixture_disposition_cdp_closed");

    const wrongTarget = { ...runtimeFixture.selected, target: { ...runtimeFixture.selected.target, webSocketDebuggerUrl: "ws://localhost:8870/devtools/page/offline" } };
    await rejected("cdp_non_loopback_target_denied_before_socket", () => backend.loadedPanelSources(wrongTarget), "fixture_disposition_cdp_target_invalid");
  } finally { global.WebSocket = originalWebSocket; }

  const bridge = fs.readFileSync(path.join(__dirname, "..", "mcp-server", "bridge-daemon.js"), "utf8");
  checked("bridge_route_is_role_gated_and_uses_private_readers", () => {
    assert(bridge.includes('const ameFixtureUIBackend = require("./ame-fixture-ui-backend")'));
    assert(bridge.includes('url.pathname.startsWith("/ame/fixture-ui-disposition/")'));
    assert(bridge.includes('res.authRole !== (operation === "lookup" ? "panel" : "automation")'));
    assert(bridge.includes("ameFixtureUIBackend.createReaders({evidenceRoot:LOG_DIR, projectRoot:PROJECT_ROOT"));
    assert(bridge.includes("executorQuiescence:() => ameFixtureExecutor.quiescence()"));
  });

  process.stdout.write(JSON.stringify({ status: "passed", offline: true, liveNetwork: false, realProcessInventory: false,
    realWebSocket: false, passed: checks.length, checks }) + "\n");
}

main().catch(error => {
  process.stderr.write(JSON.stringify({ status: "failed", offline: true, passed: checks.length, reason: error.stack }) + "\n");
  process.exitCode = 1;
}).finally(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
