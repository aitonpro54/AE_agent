"use strict";

// Source-only offline fixtures. No daemon import/start, native API, HTTP, build,
// config, provider, AE/AME/CEP or filesystem mutation. These fixtures cannot
// issue production authority and do not simulate a successful native protocol.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const vm = require("node:vm"), { createRequire } = require("node:module"), { EventEmitter } = require("node:events");
const ROOT = path.resolve(__dirname, "..");
const FIXTURE_SCHEMA = "ae-agent.owned-runtime-initial-runtime.offline-fixture.v1";
const plain = value => JSON.parse(JSON.stringify(value));
const valid = () => ({ AE_AGENT_LOCAL_SESSION_PIPE: "\\\\.\\pipe\\AEAgent.LocalSession." + "a".repeat(64) + ".daemon." + "c".repeat(32),
  AE_AGENT_LOCAL_SESSION_NONCE: "c".repeat(32), AE_AGENT_LOCAL_SESSION_GENERATION: "b".repeat(32), AE_AGENT_LOCAL_SESSION_BOOT: "d".repeat(32) });
let passed = 0;
async function check(name, fn) { try { await fn(); passed++; } catch (error) { error.message = name + ": " + error.message; throw error; } }
function moduleFixture(relative, env, overrides = {}, processFields = {}) {
  const file = path.join(ROOT, relative), module = { exports: {} }, realRequire = createRequire(file);
  const localRequire = name => name === "./deployment-mode" ? {deploymentMode:()=>require("../mcp-server/deployment-mode").deploymentMode(env,[])} : Object.hasOwn(overrides, name) ? overrides[name] : realRequire(name);
  const context = vm.createContext({ module, exports: module.exports, require: localRequire,
    __dirname: path.dirname(file), __filename: file, process: { env, ...processFields },
    Object, Reflect, WeakSet, Buffer, URL, Promise, AbortController, console, setTimeout, clearTimeout });
  new vm.Script(fs.readFileSync(file, "utf8"), { filename: file }).runInContext(context);
  return module.exports;
}
function fixture(env = valid()) {
  if(Object.keys(env).some(key=>/^AE_AGENT_(?:LOCAL_SESSION_|TRUSTED_READ_)/i.test(key)))env={...env,AE_AGENT_DEPLOYMENT_MODE:"initial-owned"};
  const counts = { handler: 0, event: 0, enqueue: 0, launch: 0, http: 0, retained: 0, catalog: 0 },
    api = moduleFixture("mcp-server/owned-runtime-initial-runtime.js", env), runtime = api.createInitialRuntime();
  const effect = name => () => { counts[name]++; throw Error("unexpected " + name + " effect"); };
  return { schema: FIXTURE_SCHEMA, productionAuthority: false, env, api, runtime, counts, effect };
}
function serviceFixture(f) {
  const api = moduleFixture("mcp-server/owned-runtime-service.js", f.env, { "./owned-runtime-initial-runtime": f.api });
  return { api, service: api.createOwnedRuntimeService({ initialRuntime: f.runtime,
    readRegistration: f.effect("retained"), readAdmission: f.effect("retained"),
    readPolicy: f.effect("retained"), readReadiness: f.effect("retained"),
    closeServer: f.effect("handler"), closeIdleWaiters: f.effect("handler") }) };
}
function supervisorFixture(f) {
  const api = moduleFixture("mcp-server/owned-runtime-supervisor.js", f.env, {
    "./owned-runtime-initial-runtime": { ...f.api, createInitialRuntime:()=>f.runtime && {...f.runtime,readStatus:args=>f.runtime.readStatus(plain(args))} }, "node:child_process": { spawn: f.effect("launch") }
  });
  const deps = {};
  for (const key of ["repoRoot", "now", "readPolicy", "readRegistration", "readSources", "native", "request", "sleep"]) {
    Object.defineProperty(deps, key, { get: f.effect("retained") });
  }
  return { api, supervisor: api.createOwnedRuntimeSupervisor(deps) };
}
function adapterFixture(f, retained = false) {
  const replies = [], handlers = {}, stdin = new EventEmitter(), exit = [], responses = [];
  const http = { request(options, onResponse) {
    f.counts.http++;
    if (!retained) throw Error("unexpected HTTP effect");
    const request = new EventEmitter();
    request.write = f.effect("enqueue");
    request.end = () => {
      const response = new EventEmitter(); response.statusCode = 200; response.setEncoding = () => {};
      onResponse(response);
      response.emit("data", JSON.stringify({ ok: true, tools: [{ name: "get_project_info" }], server: "offline" }));
      response.emit("end");
    };
    return request;
  } };
  const adapter = moduleFixture("mcp-server/mcp-adapter.js", f.env, {
    "./owned-runtime-initial-runtime": f.api, http,
    readline: { createInterface() { return { on(name, callback) { handlers[name] = callback; } }; } },
    "./owned-runtime-supervisor": { createOwnedRuntimeSupervisor: f.effect("launch") },
    "./production-usage-tools": { productionUsageTools: [], isProductionUsageTool: () => true,
      handleProductionUsageTool: f.effect("handler") }
  }, { stdin, stdout: Object.assign(new EventEmitter(),{write: value => replies.push(JSON.parse(value))}), stderr: { write() {} }, exit: code => exit.push(code) });
  return { adapter, replies, handlers, stdin, exit, responses };
}
function bridgeFunctions(f, service) {
  // Compile exact production functions with effect sentinels; never require the
  // bridge module (its normal import initializes unrelated product components).
  const file = path.join(ROOT, "mcp-server/bridge-daemon.js"), source = fs.readFileSync(file, "utf8");
  const slices = [
    ["function drainWaitingPanels()", "function enqueueAeCommand("],
    ["function enqueueAeCommand(", "function expireQueuedCommands("],
    ["function leaseNextQueuedCommand(", "async function retireGeneratedRecoveryForNormalPoll("],
    ["async function runExtendScriptBody(", "function exposedTools("],
    ["function startHttpBridge()", "const tools = ["],
    ["async function callTool(name, args, executionContext)", "function callToolLogged("],
    ["function callToolLogged(", "async function callToolLoggedImpl("]
  ];
  const bodies = slices.map(([start, end]) => {
    const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
    assert.ok(from >= 0 && to > from, "exact production function seam exists");
    return source.slice(from, to);
  }).join("\n");
  const pending = [], inflight = new Map(), context = vm.createContext({ initialRuntime: f.runtime,
    ameJobSource:require("../mcp-server/ame-job-source"),
    ameOpenCompExecutor:{assertNative(){}},ameOpenCompCommandContext:{getStore:()=>null},
    ameJobSourceExecutor:{assertNative(){}},ameJobSourceCommandContext:{getStore:()=>null},
    titleVerificationExecutor:{assertNative(){}},titleVerificationCommandContext:{getStore:()=>null},
    titleExportRecovery:{assertNative(){}},titleRecoveryCommandContext:{getStore:()=>null},
    ownedRuntimeService: service, ownedReadonlyScriptPreparation:()=>null, pendingCommands: pending, inflightCommands: inflight,
    panelBootstrapService: { isBusy: f.effect("handler"), ensure: f.effect("handler") },
    panelControlService: { handleTool: f.effect("handler") },
    panelBootstrapReadContext: { getStore: f.effect("handler") },
    lifecycleCommandContext: { getStore: f.effect("handler") },
    http: { createServer: f.effect("launch") }, require: f.effect("retained"),
    toolByName: f.effect("catalog"), callToolLoggedImpl: f.effect("handler"),
    expireQueuedCommands: f.effect("event"), generatedRecoveryLeaseScope: f.effect("handler"),
    recordEvent: f.effect("event"), crypto: { randomUUID: f.effect("event") },
    capturePlanCommand: f.effect("event"), setTimeout: f.effect("event"), Promise, URL });
  new vm.Script(bodies, { filename: file }).runInContext(context);
  assert.match(source, /nativeDispatchPort:\s*ameNativeDispatchPort/, "AME dispatch uses the private multiplexed port; unavailable ingress must reject before reaching it");
  assert.match(source, /const port=productRuntimeCurrent\(\)\?\(metadata.mutating\?productAmeDispatchPort:productAmeReadDispatchPort\):ownedAmeNativeDispatchPort/, "initial-owned route retains its exact owned dispatch port");
  const early = source.indexOf("if(require.main===module && initialRuntime&&!trustedSourceCensus.requested())initialRuntime.assertStartup();");
  assert.ok(early > 0 && early < source.indexOf("const autonomousCommandContext"), "standalone startup closes before product initialization");
  return { context, pending, inflight };
}
function zeroEffects(f) { assert.deepEqual(f.counts, { handler: 0, event: 0, enqueue: 0, launch: 0, http: 0, retained: 0, catalog: 0 }); }
async function main() {
  const cases = [{ name: "native protocol absent", env: valid(), code: "owned_initial_native_protocol_unavailable" }];
  for (const key of Object.keys(valid())) {
    const missing = valid(); delete missing[key]; cases.push({ name: "missing " + key, env: missing, code: "owned_initial_locator_incomplete" });
    const invalid = valid(); invalid[key] = ""; cases.push({ name: "invalid " + key, env: invalid, code: "owned_initial_locator_invalid" });
  }
  cases.push({ name: "only absent-valued locator", env: { AE_AGENT_LOCAL_SESSION_PIPE: undefined }, code: "owned_initial_locator_incomplete" },
    { name: "unknown selector", env: { AE_AGENT_LOCAL_SESSION_PROFILE: "initial_local" }, code: "owned_initial_locator_invalid" },
    { name: "case-ambiguous selector", env: { ae_agent_local_session_pipe: valid().AE_AGENT_LOCAL_SESSION_PIPE }, code: "owned_initial_locator_invalid" },
    { name: "mixed origins", env: { ...valid(), AE_OWNED_RUNTIME_GENERATION: "foreign" }, code: "owned_initial_mixed_origin_refused" },
    { name: "disabled hint cannot supply policy", env: { ...valid(), AE_AGENT_LOCAL_SESSION_ENABLED: "0" }, code: "owned_initial_locator_invalid" },
    { name: "failed handshake hint", env: { ...valid(), AE_AGENT_LOCAL_SESSION_HANDSHAKE: "failed" }, code: "owned_initial_locator_invalid" });
  const mismatch = valid(); mismatch.AE_AGENT_LOCAL_SESSION_NONCE = "f".repeat(32);
  cases.push({ name: "pipe channel nonce mismatch", env: mismatch, code: "owned_initial_locator_invalid" });
  for (const test of cases) await check(test.name + " is CLOSED without retained/backend effects", async () => {
    const f = fixture(test.env), { service } = serviceFixture(f), { supervisor, api } = supervisorFixture(f);
    const snapshot = f.runtime.status(); assert.equal(snapshot.code, test.code); assert.equal(snapshot.status, "CLOSED");
    assert.equal(snapshot.productionAuthority, false); assert.equal(snapshot.authorityMode, "local_controller_session");
    assert.equal(snapshot.genuineChatIdentity, false); assert.equal(snapshot.origin, "initial_owned");
    assert.deepEqual(Object.keys(snapshot).sort(), ["ok", "schema", "origin", "authorityMode", "genuineChatIdentity", "status", "code", "owned", "available", "productionAuthority", "writeAdmission", "executionEntitled", "replayAllowed"].sort());
    assert.ok(!JSON.stringify(snapshot).includes("AEAgent.LocalSession"));
    assert.equal((await supervisor.status({})).status,"CLOSED");
    await assert.rejects(supervisor.ensure({}),{code:test.code});
    await assert.rejects(supervisor.restart({}),{code:"owned_initial_restart_spent_no_replay"});
    const shutdownFixture=fixture(test.env);assert.equal((await supervisorFixture(shutdownFixture).supervisor.shutdown({})).status,"REVOKED");zeroEffects(shutdownFixture);
    for (const method of ["assertStartupReservation", "registerCurrentDaemon", "loadCurrentDaemonRegistration"]) {
      assert.throws(() => api[method]("ignored", {}, {}), { code: test.code });
    }
    for (const kind of ["control", "observation", "completion", "intake", "execution"]) assert.throws(() => service.run(kind, f.effect("handler")), { code: test.code });
    assert.throws(() => service.assertCommandTicket(), { code: test.code });
    assert.equal(service.status().status, "CLOSED"); assert.equal(service.readiness().ready, false);
    assert.throws(() => service.drainOnce({ operationId: "fake" }), { code: test.code });
    assert.throws(() => service.shutdownOnce({ operationId: "fake" }, { once: f.effect("handler") }), { code: test.code });
    zeroEffects(f);
  });
  await check("no injectable JSON/offline authority", async () => {
    const f = fixture(), { api } = serviceFixture(f);
    assert.throws(() => f.api.createInitialRuntime({ productionAuthority: true, handshake: { ok: true }, ports: {} }), /factory_arguments_forbidden/);
    assert.throws(() => f.api.assertInitialRuntime(plain(f.runtime.status())), /private_runtime_required/);
    assert.throws(() => api.createOwnedRuntimeService({ initialRuntime: { origin: "initial_owned", productionAuthority: true } }), /private_runtime_required/);
    for (const args of [undefined, null, [], false, 0, { pid: 1 }, Object.create({ granted: true }), Object.assign({}, { [Symbol("grant")]: true })]) {
      await assert.rejects(f.runtime.ensure(args), /arguments_empty_required/);
      await assert.rejects(f.runtime.readStatus(args), /arguments_empty_required/);
    }
    await assert.rejects(f.runtime.ensure({}),{code:"owned_initial_native_protocol_unavailable"});
    zeroEffects(f);
  });
  await check("all alternate HTTP ingress stops before handler/body/event", async () => {
    const f = fixture(), { service } = serviceFixture(f);
    const routes = ["/health", "/tools", "/dev/status", "/tools/call", "/mcp/tools/call", "/dev/tool/execute_extendscript", "/dev/ping-ae", "/agents/chat", "/agents/plan/run", "/agents/hardcore/run", "/runtime/owned/register", "/runtime/owned/status", "/autonomy/session", "/placeholder/protection", "/bridge/heartbeat", "/bridge/next", "/bridge/result", "/bridge/submitted", "/ame/native-fixture-abandonment/capture"];
    for (const method of ["GET", "POST", "OPTIONS"]) for (const url of routes) assert.throws(() => service.ingress({ method, url,
      headers: { "x-ae-mcp-adapter": "codex-stdio-v1", "x-ae-bridge-token": "fixture" },
      body: { origin: "initial_owned", productionAuthority: true, readOnlyHint: true } }, f.effect("handler")), /owned_initial_native_protocol_unavailable/);
    zeroEffects(f);
  });
  await check("adapter initialize/list/status/ordinary/ensure never launch or HTTP", async () => {
    const f = fixture(), a = adapterFixture(f);
    a.adapter.startStdioMcp();
    await a.adapter.handleRpc({ jsonrpc: "2.0", id: 1, method: "initialize" });
    await a.adapter.handleRpc({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    assert.deepEqual(plain((await a.adapter.getTools()).map(t=>t.name).sort()),[...f.runtime.tools.map(t=>t.name),...a.adapter.ownedRuntimeTools.map(t=>t.name)].sort());
    for (const name of ["get_owned_runtime_status", "ensure_owned_runtime_daemon", "restart_owned_runtime_daemon", "shutdown_owned_runtime_daemon", "get_bridge_status", "get_project_info", "execute_extendscript", "ensure_ae_agent_panel", "invoke_panel_action", "render_ame_title_job", "get_task_usage"]) {
      await a.adapter.handleRpc({ jsonrpc: "2.0", id: name, method: "tools/call", params: { name, arguments: {} } });
      const reply = a.replies.at(-1);
      if(name==="get_owned_runtime_status" || name==="shutdown_owned_runtime_daemon"){assert.equal(reply.result.isError,true);assert.equal(JSON.parse(reply.result.content[0].text).status,name==="get_owned_runtime_status"?"CLOSED":"REVOKED");}
      else{assert.equal(reply.error.code,-32000);assert.equal(reply.error.message,name==="ensure_owned_runtime_daemon"?"owned_initial_native_protocol_unavailable":name==="restart_owned_runtime_daemon"?"owned_initial_restart_spent_no_replay":"owned_initial_controller_closed");}
    }
    await assert.rejects(a.adapter.ensureDaemonRunning(), /owned_initial_controller_closed/);
    await assert.rejects(a.adapter.handleOwnedRuntimeTool("ensure_owned_runtime_daemon", { pid: 1 }, { ensure: f.effect("launch") }), /arguments_forbidden/);
    await assert.rejects(a.adapter.handleOwnedRuntimeTool("ensure_owned_runtime_daemon", {}, { ensure: f.effect("launch") }),/owned_initial_controller_closed/);
    for (const args of [null, [], false, { origin: "retained" }]) {
      await a.adapter.handleRpc({ jsonrpc: "2.0", id: "invalid", method: "tools/call", params: { name: "ensure_owned_runtime_daemon", arguments: args } });
      assert.ok(a.replies.at(-1).error);
    }
    await a.adapter.handleRpc({ jsonrpc: "2.0", id: "missing", method: "tools/call", params: { name: "ensure_owned_runtime_daemon" } });
    assert.ok(a.replies.at(-1).error);
    zeroEffects(f);
    await a.handlers.close(); assert.deepEqual(a.exit, [0]);
    const result = await a.adapter.handleOwnedRuntimeTool("get_owned_runtime_status", {});
    assert.equal(JSON.parse(result.content[0].text).code, "owned_initial_controller_closed");
    zeroEffects(f);
  });
  await check("adapter stdin error permanently closes original facade before exit", async () => {
    const f = fixture(), a = adapterFixture(f); a.adapter.startStdioMcp();
    await a.stdin.listeners("error")[0](Error("offline")); assert.deepEqual(a.exit, [1]);
    await assert.rejects(a.adapter.handleOwnedRuntimeTool("ensure_owned_runtime_daemon", {}),/owned_initial_controller_closed/);
    zeroEffects(f);
  });
  await check("production bridge function seams reject before any effect", async () => {
    const f = fixture(), { service } = serviceFixture(f), b = bridgeFunctions(f, service), c = b.context;
    assert.throws(() => c.startHttpBridge(), /owned_initial_native_protocol_unavailable/);
    for (const name of ["get_project_info", "ensure_ae_agent_panel", "invoke_panel_action", "execute_extendscript", "render_ame_title_job"]) {
      for (const source of ["mcp-adapter", "dev-admin-http", "direct-tools-call", "panel-bootstrap-read"]) assert.throws(() => c.callToolLogged(source, name, {}, { panelControlAuthority: true, nativeDispatchPort: { granted: true } }), /owned_initial_native_protocol_unavailable/);
      await assert.rejects(c.callTool(name, {}, { productionAuthority: true }), /owned_initial_native_protocol_unavailable/);
    }
    await assert.rejects(c.runExtendScriptBody("arbitrary script", 1), /owned_initial_native_protocol_unavailable/);
    await assert.rejects(c.enqueueAeCommand("arbitrary script", 1), /owned_initial_native_protocol_unavailable/);
    assert.throws(() => c.leaseNextQueuedCommand({}, new URL("http://127.0.0.1/bridge/next")), /owned_initial_native_protocol_unavailable/);
    assert.throws(() => c.drainWaitingPanels(), /owned_initial_native_protocol_unavailable/);
    assert.equal(b.pending.length, 0); assert.equal(b.inflight.size, 0); zeroEffects(f);
  });
  await check("all initial locators absent preserves retained default and catalog/health path", async () => {
    const f = fixture({ AE_OWNED_RUNTIME_GENERATION: "existing-retained" }); assert.equal(f.runtime, null);
    assert.deepEqual(plain(f.api.inspectLocatorEnvironment(f.env)), { requested: false, code: null });
    const a = adapterFixture(f, true); await a.adapter.ensureDaemonRunning();
    assert.ok((await a.adapter.getTools()).some(tool => tool.name === "get_project_info"));
    assert.equal(f.counts.http, 3); assert.equal(f.counts.launch, 0);
    const calls = [], controller = { status: async () => { calls.push("retained-status"); return { ok: true }; } };
    assert.equal((await a.adapter.handleOwnedRuntimeTool("get_owned_runtime_status", {}, controller)).isError, false);
    assert.deepEqual(calls, ["retained-status"]);
  });
  await check("retained service admission and read/completion semantics preserved", async () => {
    const f = fixture({}), api = moduleFixture("mcp-server/owned-runtime-service.js", {}, { "./owned-runtime-initial-runtime": f.api });
    let admitted = false, handlers = 0;
    const service = api.createOwnedRuntimeService({ journalRoot: path.join(ROOT, ".codex-runtime", "initial-local-l4", "unused-offline-fixture"),
      readPolicy: () => ({ enabled: true }), readReadiness: () => ({}), readAdmission: () => admitted });
    assert.equal(service.status().writeAdmission, "retained_audit_and_fresh_adoption_required");
    assert.throws(() => service.run("execution", () => handlers++), /owned_service_retained_admission_closed/);
    assert.equal(service.ingress({ method: "GET", url: "/dev/status" }, () => ++handlers), 1);
    assert.equal(service.run("completion", () => ++handlers), 2);
    admitted = true;
    await service.run("execution", async () => { handlers++; service.assertCommandTicket(); assert.equal(service.status().activeTickets, 1); });
    assert.equal(service.status().activeTickets, 0); assert.equal(handlers, 3);
    assert.equal(service.status().writeAdmission, "open");
  });
  await check("retained supervisor status and healthy ensure preserve observation without launch", async () => {
    const f = fixture({}), api = moduleFixture("mcp-server/owned-runtime-supervisor.js", {}, {
      "./owned-runtime-initial-runtime": f.api, "node:fs": { existsSync: () => false },
      "node:child_process": { spawn: f.effect("launch") }
    });
    const birthUtc = "2026-10-11T07:41:52.0000000Z", identity = { pid: 9901, birthUtc,
      birthFileTime: String(BigInt(Date.parse(birthUtc)) * 10000n + 116444736000000000n),
      imagePath: "C:\\Synthetic\\fixture.exe", executableSha256: "a".repeat(64) },
      generation = "11111111-1111-4111-8111-111111111111", registration = { generation, kernelIdentity: identity, sourceSha256: "b".repeat(64) };
    let opened = 0, disposed = 0, requests = 0;
    const openOwned=async()=>{opened++;return {identity,wait:async()=>({waitResult:"WAIT_TIMEOUT",signaled:false,exitCode:null}),dispose:async()=>{disposed++;}};};
    const supervisor = api.createOwnedRuntimeSupervisor({ repoRoot: ROOT,
      readRegistration: () => registration, readSources: () => ({ sourceSha256: registration.sourceSha256 }),
      readPolicy: () => ({ schema: "ae-agent.owned-runtime-policy.v1", generation: "offline-policy", enabled: true,
        authorization: { source: "explicit_user_chat", reference: "offline" }, acceptedServerCoverage: ["owned_daemon_lifecycle"] }),
      readStartupRetirement: () => null, readMaintenanceRetirement: () => null,
      native: { openOwned,acquireController:async()=>({assertHeld:async()=>{},openOwned,launch:f.effect("launch"),dispose:async()=>{}}) },
      request: async () => { requests++; return { ok: true, owned: true, generation, draining: false, closing: false }; }
    });
    assert.equal((await supervisor.status()).owned, true);
    assert.equal((await supervisor.ensure()).status, "owned_daemon_already_registered");
    assert.equal(opened, 2); assert.equal(disposed, 2); assert.equal(requests, 2); assert.equal(f.counts.launch, 0);
  });
  process.stdout.write(JSON.stringify({ ok: true, schema: FIXTURE_SCHEMA, offline: true, passed,
    productionAuthority: false, nativeProtocolProof: false, liveProof: false, effectPorts: null }) + "\n");
}
if (require.main === module) main().catch(error => { process.stderr.write(error.stack + "\n"); process.exitCode = 1; });
module.exports = { main };
