"use strict";

// Offline integration: actual isolated daemon + official stdio MCP adapter +
// complete CEP assets in VM. Only the native application and provider metadata
// are synthetic. No production bridge, CDP, AE, providers or UI actions run.
const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");
const { spawn } = require("child_process");
const network = require("./network-test-fixture");
const { createPanelEnvironment } = require("./cep-plan-refresh-smoke");
const { createVisualProject } = require("./placeholder-visual-fixture");

const RECOVER = "recover_ae_agent_panel", ENSURE = "ensure_ae_agent_panel";
const PHYSICAL = "codexAePhysicalEvalScript.v1";
const clone = value => JSON.parse(JSON.stringify(value));
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const options = { automationToken: "session-recovery-e2e-auto", panelToken: "session-recovery-e2e-panel", commandTimeoutMs: 4000 };
let cases = 0;
const runtimeSourceHashes = new Set();

function authoritySnapshot() {
  const rows = [], root = path.join(network.PROJECT_ROOT, ".codex-runtime", "owned-runtime-maintenance");
  function walk(file, name) {
    if (!fs.existsSync(file)) return;
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) rows.push([name, "alias", fs.readlinkSync(file)]);
    else if (stat.isDirectory()) {
      rows.push([name, "directory"]);
      for (const child of fs.readdirSync(file).sort()) walk(path.join(file, child), `${name}/${child}`);
    } else rows.push([name, stat.size, sha(fs.readFileSync(file))]);
  }
  walk(root, ".");
  return sha(JSON.stringify(rows));
}

function createAdapter(fixture) {
  const env = network.isolatedEnvironment(fixture.runtimeDir, { ...options, port: fixture.port });
  const child = spawn(process.execPath, [path.join(fixture.launchRoot, "mcp-server", "mcp-adapter.js")], {
    cwd: fixture.launchRoot, env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"]
  });
  let text = "", sequence = 0, failure;
  const responses = new Map();
  child.on("error", error => { failure = error; });
  child.stderr.resume();
  child.stdout.on("data", chunk => {
    text += chunk;
    for (let i; (i = text.indexOf("\n")) >= 0;) {
      const line = text.slice(0, i); text = text.slice(i + 1);
      try { const response = JSON.parse(line); responses.set(response.id, response); } catch (_) {}
    }
  });
  return {
    async rpc(method, params) {
      const id = ++sequence;
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      const deadline = Date.now() + 12000;
      while (!responses.has(id) && Date.now() < deadline) {
        if (failure) throw failure;
        if (child.exitCode !== null) throw Error("Official MCP adapter exited");
        await network.pause(5);
      }
      assert(responses.has(id), "Official MCP response deadline");
      const response = responses.get(id); responses.delete(id);
      assert(!response.error, JSON.stringify(response.error));
      return response.result;
    },
    async tool(name) {
      const result = await this.rpc("tools/call", { name, arguments: {} });
      return JSON.parse(result.content[0].text);
    },
    async stop() { child.stdin.end(); await network.stopChild(child); }
  };
}

async function harness(label) {
  const fixture = await network.startDaemon(options);
  let adapter;
  try {
    const panelFile = path.join(fixture.launchRoot, "cep-panel", "panel.js");
    // The existing VM helper loads these two supporting assets from its own
    // directory. Prove they equal the isolated snapshot before executing it.
    for (const asset of ["panel-actions.js", "panel-action-contract.js", "native-probe-startup-guard.js"]) {
      assert.deepEqual(fs.readFileSync(path.join(fixture.launchRoot, "cep-panel", asset)), fs.readFileSync(path.join(network.PROJECT_ROOT, "cep-panel", asset)));
    }
    const source = fs.readFileSync(panelFile, "utf8").replace(/\}\)\(\);\s*$/, `
      window.__sessionRecoveryFixture = {
        native: function(fn) {cs.evalScript=fn;},
        set: function(value) {
          if(Object.prototype.hasOwnProperty.call(value,"logicalId"))activeEvalScriptCommandId=value.logicalId;
          if(Object.prototype.hasOwnProperty.call(value,"heartbeatAt"))panelHeartbeatAt=value.heartbeatAt;
        },
        state: function() {return {actor:deliveryActor(),logicalId:activeEvalScriptCommandId,running:running,pollInFlight:pollInFlight};}
      };
    })();`);
    const store = new Map([["codexAeBridgeUrl", `http://127.0.0.1:${fixture.port}`], ["codexAeBridgeToken", options.panelToken], ["codexAeBridgeAutoConnect", "0"], [PHYSICAL, "{}"]]);
    const panel = createPanelEnvironment(source, { storageStore: store,
      startupGuardSource: fs.readFileSync(path.join(fixture.launchRoot, "cep-panel", "native-probe-startup-guard.js"), "utf8") });
    const access = panel.window.__sessionRecoveryFixture;
    assert(access, "Full panel accessor loaded");
    const native = createVisualProject();
    native.change('app.project.revision=7;app.project.dirty=true;app.project.renderQueue={rendering:false};app.version="synthetic-read-only-host";');
    const beforeProject = native.read("({file:app.project.file.fsName,revision:app.project.revision,dirty:app.project.dirty,numItems:app.project.numItems,writes:writes,undo:undo})");
    const nativeCalls = [], trace = [], commands = [], requests = new Set(), dueTimers = new Map();
    let pumpFailure, suppressHeartbeatChallenge = false;
    access.native((script, callback) => {
      assert(!/addToAdobeMediaEncoderQueue|queueInAME|\.save\s*\(|saveFrameToPng|beginUndoGroup|items\.addComp|executeCommand\s*\(|\.setValue(?:AtTime|AtKey)?\s*\(|\.replaceSource\s*\(/.test(script), "Only native reads are allowed");
      const kind = script.includes("__codexMcpBridgeResult") ? "project_info" : script.includes("projectPresent:true") ? "epoch" : "project_file";
      assert(kind !== "project_file" || script === '(function(){return app.project && app.project.file ? String(app.project.file.fsName) : "";}())', "Unexpected native script");
      if (kind === "project_info") assert(script.includes("bitsPerChannel: project ? project.bitsPerChannel"), "Only ordinary get_project_info barrier");
      nativeCalls.push({ kind, script, commandId: access.state().logicalId });
      const value = vm.runInContext(script, native.context, { timeout: 2000 });
      callback(typeof value === "string" ? value : JSON.stringify(value));
    });
    async function pump(until, timeoutMs = 6000, timers = true) {
      const deadline = Date.now() + timeoutMs;
      while (!until() && Date.now() < deadline) {
        if (pumpFailure) throw pumpFailure;
        for (const req of panel.inFlightRequests.slice()) {
          if (requests.has(req)) continue;
          requests.add(req);
          // Provider models/usage are unrelated startup metadata. Never invoke
          // their probes; bridge, receipt, epoch and command traffic is real.
          if (req.path.startsWith("/agents?")) { req.respond(200, { ok: true, agents: [] }); requests.delete(req); continue; }
          if (req.path === "/usage") { req.respond(200, { ok: true, usage: null }); requests.delete(req); continue; }
          assert(req.path.startsWith("/bridge/") || req.method === "GET" && /^(\/human-guard-settlement\/lookup|\/ame\/(fixture-ui-disposition|native-fixture-abandonment|native-fixture-prephase-recovery|native-fixture-admission-refusal)\/lookup|\/agents\/plan\/current|\/autonomy\/session|\/placeholder\/protection|\/health)/.test(req.path), "Unexpected panel request: " + req.path);
          const row = { path: req.path, method: req.method, body: clone(req.body), status: null, response: null }; trace.push(row);
          network.request(fixture, { path: req.path, method: req.method, body: req.body === null ? undefined : req.body, headers: req.headers, timeoutMs: 10000 })
            .then(response => {
              row.status = response.status; row.response = clone(response.body);
              if (req.path.startsWith("/bridge/next?") && response.body?.command) commands.push(clone(response.body.command));
              if (suppressHeartbeatChallenge && req.path.startsWith("/bridge/heartbeat?")) {
                const oldWire = { ...response.body }; delete oldWire.bootstrapRecovery;
                req.respond(response.status, oldWire);
              } else req.respond(response.status, response.body);
            }, error => { pumpFailure = error; req.error(error.message); })
            .catch(error => { pumpFailure = error; })
            .finally(() => requests.delete(req));
        }
        if (timers) for (const [id, timer] of panel.timers) {
          if (timer.fn.name !== "poll") continue;
          if (!dueTimers.has(id)) dueTimers.set(id, Date.now() + timer.delay);
          if (Date.now() >= dueTimers.get(id)) { panel.runTimer(candidate => candidate === timer); dueTimers.delete(id); break; }
        }
        await network.pause(5);
      }
      if (pumpFailure) throw pumpFailure;
      assert(until(), label + " pump deadline: " + JSON.stringify({ state: access.state(), panel: panel.api.state(), trace: trace.slice(-4).map(row => ({ path: row.path, status: row.status })) }));
    }
    let connected = false;
    panel.planOps.connect(error => { if (error) pumpFailure = Error(JSON.stringify(error)); else connected = true; });
    await pump(() => connected && !panel.api.state().busy && !panel.api.state().trustedGuardRefresh.pending && panel.inFlightRequests.length === 0);
    adapter = createAdapter(fixture);
    const list = await adapter.rpc("tools/list", {});
    assert(list.tools.some(tool => tool.name === RECOVER));
    const directory = path.join(fixture.runtimeDir, "state", "ae-agent-panel-bootstrap"), active = path.join(directory, "attempt.json");
    fs.mkdirSync(directory, { recursive: true });
    const attempt = { schema: 1, requestId: crypto.randomUUID(), stage: "project_read_unknown", delivery: "native",
      projectReadCommand: { id: crypto.randomUUID(), executionId: crypto.randomUUID(), expiresAt: Date.now() - 1000 } };
    const raw = Buffer.from(JSON.stringify(attempt, null, 2) + "\n"), ack = Buffer.from(JSON.stringify({ requestId: attempt.requestId, commandId: 17, state: "executed" }) + "\n");
    fs.writeFileSync(active, raw);
    const ackFile = path.join(directory, attempt.requestId + ".ack.json"); fs.writeFileSync(ackFile, ack);
    const count = kind => nativeCalls.filter(call => call.kind === kind).length;
    const recoveryDir = path.join(directory, "recovery", sha(raw));
    return {
      fixture, panel, access, store, adapter, attempt, active, raw, ack, ackFile, directory, recoveryDir, nativeCalls, trace, commands, count, pump,
      suppressHeartbeat(value) { suppressHeartbeatChallenge = value; },
      async callThroughPanel(name = RECOVER) {
        let result, failure;
        const pending = adapter.tool(name).then(value => { result = value; }, error => { failure = error; });
        await pump(() => result !== undefined || failure);
        await pending; if (failure) throw failure; return result;
      },
      assertOldUnknown() {
        assert.deepEqual(fs.readFileSync(active), raw);
        assert.deepEqual(fs.readFileSync(ackFile), ack);
        assert(!commands.some(command => command.id === attempt.projectReadCommand.id || command.executionId === attempt.projectReadCommand.executionId), "Old command must never be replayed");
      },
      async close() {
        try {
          const intent = path.join(recoveryDir, "epoch-0", "intent.json");
          if (fs.existsSync(intent)) runtimeSourceHashes.add(JSON.parse(fs.readFileSync(intent)).origin.runtime.sourceSha256);
          for (const req of panel.inFlightRequests.slice()) req.error("isolated fixture closing");
          const deadline = Date.now() + 500;
          while (requests.size && Date.now() < deadline) await network.pause(5);
          assert.deepEqual(native.read("({file:app.project.file.fsName,revision:app.project.revision,dirty:app.project.dirty,numItems:app.project.numItems,writes:writes,undo:undo})"), beforeProject);
        } finally { await adapter.stop(); await fixture.stop(); }
      }
    };
  } catch (error) { if (adapter) await adapter.stop(); await fixture.stop(); throw error; }
}

async function successCase(staleLogical) {
  const h = await harness(staleLogical ? "covered heartbeat" : "healthy legacy");
  try {
    const body = { name: RECOVER, arguments: {} };
    assert.equal((await h.fixture.request({ path: "/mcp/tools/call", body, token: options.panelToken, headers: { "x-ae-mcp-adapter": "codex-stdio-v1" } })).status, 403); cases++;
    const direct = await h.fixture.request({ path: "/tools/call", body, token: options.automationToken });
    assert.equal(JSON.parse(direct.body.result.content[0].text).reason, "official_mcp_adapter_required"); cases++;
    h.assertOldUnknown();
    if (staleLogical) h.access.set({ logicalId: h.attempt.projectReadCommand.id, heartbeatAt: 0 });
    const beforeEpoch = h.count("epoch"), beforeProject = h.count("project_info"), beforeCommands = h.commands.length;
    const pending = await h.adapter.tool(RECOVER);
    assert.equal(pending.reason, "bootstrap_recovery_epoch_pending");
    assert.equal(pending.replayAllowed, false); cases++;
    const blockedRead = await h.fixture.request({ path: "/mcp/tools/call", token: options.automationToken, headers: { "x-ae-mcp-adapter": "codex-stdio-v1" }, body: { name: "get_project_info", arguments: {} } });
    assert(JSON.stringify(blockedRead.body).includes("panel_bootstrap_busy"));
    assert.equal(h.count("project_info"), beforeProject);
    h.assertOldUnknown(); cases++;
    if (staleLogical) {
      // Reproduce the old heartbeat wire contract without changing production
      // source: full poll cannot discover an epoch if this field is absent.
      h.suppressHeartbeat(true);
      await h.pump(() => h.trace.some(row => row.path.startsWith("/bridge/heartbeat?") && row.status === 200));
      assert.equal(h.count("epoch"), beforeEpoch);
      assert.equal(h.access.state().logicalId, h.attempt.projectReadCommand.id);
      h.suppressHeartbeat(false); h.access.set({ heartbeatAt: 0 }); cases++;
    }
    await h.pump(() => h.trace.some(row => row.path === "/bridge/bootstrap-recovery-epoch" && row.response?.status === "bootstrap_recovery_epoch_active"));
    assert.equal(h.count("epoch"), beforeEpoch + 1, "One causal fixed native read");
    assert.equal(h.access.state().logicalId, "");
    if (staleLogical) {
      assert(h.trace.some(row => row.path.startsWith("/bridge/heartbeat?") && row.response?.bootstrapRecovery));
      const key = [...h.store.keys()].find(key => key.startsWith("codexAeBootstrapRecoveryEpoch.v1."));
      assert.equal(JSON.parse(h.store.get(key)).retiredLogicalReadId, h.attempt.projectReadCommand.id);
    }
    h.assertOldUnknown(); cases++;
    const recovered = await h.callThroughPanel();
    assert.equal(recovered.status, "epoch_fenced_unknown", JSON.stringify(recovered));
    assert.equal(recovered.oldOutcome, "unknown_preserved");
    assert.equal(recovered.replayAllowed, false);
    const barrier = JSON.parse(fs.readFileSync(path.join(h.recoveryDir, "barrier-0", "pins.json")));
    const barrierId = barrier.pins.id;
    assert.equal(h.nativeCalls.filter(call => call.kind === "project_info" && call.commandId === barrierId).length, 1, "Separate ordinary project-info barrier executes once");
    assert.equal(fs.existsSync(h.active), false);
    assert.deepEqual(fs.readFileSync(path.join(h.recoveryDir, "original-attempt.json")), h.raw);
    assert.deepEqual(fs.readFileSync(h.ackFile), h.ack);
    assert.equal(h.commands.filter(command => command.id === barrierId).length, 1, "Recovery barrier is leased once among ordinary background reads");
    assert.notEqual(barrierId, h.attempt.projectReadCommand.id);
    assert(h.trace.some(row => row.path === "/bridge/submitted" && row.body.id === barrierId) && h.trace.some(row => row.path === "/bridge/result" && row.body.id === barrierId)); cases++;
    if (!staleLogical) {
      await h.pump(() => !h.access.state().logicalId && !h.panel.api.state().busy && h.panel.inFlightRequests.length === 0, 6000, false);
      const ensured = await h.callThroughPanel(ENSURE);
      assert.equal(ensured.status, "already_connected", JSON.stringify(ensured));
      const fresh = JSON.parse(fs.readFileSync(h.active));
      assert.equal(fresh.stage, "verified");
      assert.notEqual(fresh.requestId, h.attempt.requestId);
      assert.notEqual(fresh.projectReadCommand.id, h.attempt.projectReadCommand.id);
      assert.notEqual(fresh.projectReadCommand.id, barrierId);
      assert.equal(h.nativeCalls.filter(call => call.kind === "project_info" && call.commandId === fresh.projectReadCommand.id).length, 1, "Fresh ensure is a separate new read");
      assert.deepEqual(fs.readFileSync(path.join(h.recoveryDir, "original-attempt.json")), h.raw);
      assert.deepEqual(fs.readFileSync(h.ackFile), h.ack); cases++;
    }
  } finally { await h.close(); }
}

async function blockedCase(physicalBusy) {
  const h = await harness(physicalBusy ? "physical busy" : "foreign logical");
  try {
    const logicalId = physicalBusy ? h.attempt.projectReadCommand.id : crypto.randomUUID();
    h.access.set({ logicalId, heartbeatAt: 0 });
    const physical = physicalBusy ? JSON.stringify({ "unresolved-physical-native": { submittedAt: 1 } }) : "{}";
    h.store.set(PHYSICAL, physical);
    const beforeEpoch = h.count("epoch"), beforeProject = h.count("project_info"), beforeCommands = h.commands.length;
    assert.equal((await h.adapter.tool(RECOVER)).reason, "bootstrap_recovery_epoch_pending");
    await h.pump(() => h.trace.some(row => row.path.startsWith("/bridge/heartbeat?") && row.response?.bootstrapRecovery));
    assert.equal(h.count("epoch"), beforeEpoch);
    assert.equal(h.count("project_info"), beforeProject);
    assert.equal(h.access.state().logicalId, logicalId);
    assert.equal(h.store.get(PHYSICAL), physical, "No clearing physical unknown");
    assert.equal(h.commands.length, beforeCommands);
    h.assertOldUnknown();
    assert.equal((await h.adapter.tool(RECOVER)).reason, "bootstrap_recovery_epoch_pending"); cases++;
  } finally { await h.close(); }
}

async function main() {
  const before = authoritySnapshot();
  try { await successCase(false); await successCase(true); await blockedCase(false); await blockedCase(true); }
  finally { assert.equal(authoritySnapshot(), before, "Production authority bytes changed"); }
  assert.equal(runtimeSourceHashes.size, 1, "All scenarios must use the same frozen source snapshot");
  console.log(JSON.stringify({ ok: true, cases, actualIsolatedDaemon: true, officialStdioMcp: true, fullCepVm: true, mockedNativeApplication: true,
    oldNativeUiAmeReplays: 0, productionAuthorityUnchanged: true, authoritySnapshotSha256: before,
    runtimeSourceSha256: [...runtimeSourceHashes][0], liveAE: false }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
