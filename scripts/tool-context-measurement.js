"use strict";

// Offline harness. Production modules are loaded only in guarded children.
const fs = require("fs");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const assert = require("assert");
const { spawn, execFileSync } = require("child_process");
const { productionUsageTools } = require("../mcp-server/production-usage-tools");
const { projectPlanRunSummary, PLAN_RUN_SUMMARY_SCHEMA } = require("../mcp-server/plan-run-response");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const TEMP_BASE = path.join(PROJECT_ROOT, ".codex-runtime", "temp");
const TEMP_DIR_PREFIX = "tool-context-meas-";
const FORBIDDEN_PORT = 3456;
const REPORT_SCHEMA = "ae-tool-context-measurement-report.v2";
const DEFAULT_MAX_COLLECTOR_BYTES = 16 * 1024 * 1024;
const ownedDirectories = new Map();
const childStates = new WeakMap();
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const failure = (code, message = code) => Object.assign(new Error(message), { code });
const unavailableUsage = (reason = "no_observed_model_usage") => ({ available: false,
  input: null, cached: null, output: null, reasoning: null, total: null, reason });

class BoundedBufferCollector {
  constructor(maxBytes = DEFAULT_MAX_COLLECTOR_BYTES) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw failure("invalid_buffer_limit");
    this.maxBytes = maxBytes;
    this.chunks = [];
    this.byteLength = 0;
  }
  append(chunk) {
    if (chunk === null || chunk === undefined) return;
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8");
    const nextLength = this.byteLength + buffer.length;
    // Rejection is transactional: no bogus length or zero padding after overflow.
    if (nextLength > this.maxBytes) throw failure("collector_overflow", `collector_overflow: ${nextLength} > ${this.maxBytes}`);
    this.chunks.push(buffer);
    this.byteLength = nextLength;
  }
  toBuffer() { return Buffer.concat(this.chunks, this.byteLength); }
  toString() { return this.toBuffer().toString("utf8"); }
  sha256() { return sha256(this.toBuffer()); }
}

class StdioLineReader {
  constructor(stream, maxBytes = DEFAULT_MAX_COLLECTOR_BYTES) {
    new BoundedBufferCollector(maxBytes); // validate budget
    this.stream = stream;
    this.maxBytes = maxBytes;
    this.buffer = Buffer.alloc(0);
    this.lines = [];
    this.queuedBytes = 0;
    this.pending = [];
    this.error = null;
    this.closed = false;
    this.onData = chunk => {
      try {
        const incoming = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        if (this.buffer.length + this.queuedBytes + incoming.length > this.maxBytes) throw failure("collector_overflow");
        this.buffer = Buffer.concat([this.buffer, incoming]);
        let end;
        while ((end = this.buffer.indexOf(10)) >= 0) {
          const line = this.buffer.subarray(0, end + 1);
          this.buffer = this.buffer.subarray(end + 1);
          this.lines.push(line);
          this.queuedBytes += line.length;
        }
        this.drain();
      } catch (error) { this.fail(error); }
    };
    this.onError = error => this.fail(error);
    this.onEnd = () => {
      this.closed = true;
      this.drain();
      if (this.buffer.length) this.fail(failure("line_delimiter_missing"));
      else this.rejectPending(failure("stdio_closed"));
    };
    stream.on("data", this.onData);
    stream.on("error", this.onError);
    stream.on("end", this.onEnd);
    stream.on("close", this.onEnd);
  }
  rejectPending(error) {
    for (const entry of this.pending.splice(0)) { clearTimeout(entry.timer); entry.reject(error); }
  }
  fail(error) {
    if (!this.error) this.error = error;
    this.rejectPending(this.error);
  }
  drain() {
    while (this.pending.length && this.lines.length && !this.error) {
      const entry = this.pending.shift();
      const rawBuffer = this.lines.shift();
      this.queuedBytes -= rawBuffer.length;
      clearTimeout(entry.timer);
      entry.resolve({ rawBuffer, rawString: rawBuffer.toString("utf8"), hasDelimiter: true });
    }
  }
  readLine(timeoutMs = 8000) {
    if (this.error) return Promise.reject(this.error);
    if (this.closed && !this.lines.length) return Promise.reject(failure("stdio_closed"));
    return new Promise((resolve, reject) => {
      const entry = { resolve, reject, timer: null };
      entry.timer = setTimeout(() => {
        this.pending = this.pending.filter(item => item !== entry);
        reject(failure("stdio_timeout"));
      }, timeoutMs);
      this.pending.push(entry);
      this.drain();
    });
  }
  destroy() {
    this.fail(failure("stdio_reader_destroyed"));
    this.stream.removeListener("data", this.onData);
    this.stream.removeListener("error", this.onError);
    this.stream.removeListener("end", this.onEnd);
    this.stream.removeListener("close", this.onEnd);
  }
}

function validateLoopbackPort(port) {
  if (!Number.isInteger(port) || port <= 1024 || port > 65535 || port === FORBIDDEN_PORT) throw failure("isolated_port_invalid");
  return port;
}
async function reserveRandomLoopbackPort() {
  const server = http.createServer();
  const port = await listenLoopback(server);
  await closeServer(server);
  return port;
}
function listenLoopback(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      try { resolve(validateLoopbackPort(server.address().port)); }
      catch (error) { server.close(); reject(error); }
    });
  });
}
function closeServer(server) {
  if (!server || !server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(failure("capture_server_close_unconfirmed")), 2500);
    if (server.closeAllConnections) server.closeAllConnections();
    server.close(error => { clearTimeout(timer); error ? reject(error) : resolve(); });
  });
}

function contained(base, target) {
  const relative = path.relative(base, target);
  return !!relative && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}
function createOwnedRuntime(parent = TEMP_BASE) {
  const resolvedParent = path.resolve(parent);
  if (resolvedParent !== TEMP_BASE && !ownedDirectories.has(resolvedParent)) throw failure("runtime_parent_not_owned");
  fs.mkdirSync(resolvedParent, { recursive: true });
  if (fs.realpathSync(resolvedParent) !== resolvedParent) throw failure("runtime_parent_symlink_rejected");
  const directory = fs.mkdtempSync(path.join(resolvedParent, TEMP_DIR_PREFIX));
  const marker = { id: crypto.randomUUID(), parent: resolvedParent };
  fs.writeFileSync(path.join(directory, ".measurement-owner.json"), JSON.stringify(marker));
  ownedDirectories.set(directory, marker);
  return directory;
}
function safeRemoveTempDirectory(directory) {
  if (!path.isAbsolute(directory)) throw failure("cleanup_absolute_path_required");
  const target = path.resolve(directory);
  const marker = ownedDirectories.get(target);
  if (!marker || !contained(marker.parent, target) || !path.basename(target).startsWith(TEMP_DIR_PREFIX)) throw failure("cleanup_not_owned");
  if (fs.realpathSync(target) !== target || fs.realpathSync(marker.parent) !== marker.parent) throw failure("cleanup_symlink_rejected");
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(target, ".measurement-owner.json"), "utf8")), marker, "cleanup_owner_mismatch");
  fs.rmSync(target, { recursive: true, force: false });
  ownedDirectories.delete(target);
}

function createScrubbedEnvironment(runtimeDir, options = {}) {
  if (!path.isAbsolute(runtimeDir) || !ownedDirectories.has(runtimeDir)) throw failure("runtime_not_owned");
  const port = validateLoopbackPort(options.port);
  // An allowlist avoids inheriting provider settings, auth, proxies, NODE_OPTIONS,
  // Codex profiles, PATH-based CLI discovery and shared analytics configuration.
  const env = {};
  for (const key of ["SystemRoot", "SYSTEMROOT", "windir", "WINDIR", "ComSpec", "COMSPEC"]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  const directories = ["logs", "state", "settings", "backups", "home", "tmp", "codex", "analytics"];
  for (const name of directories) fs.mkdirSync(path.join(runtimeDir, name), { recursive: true });
  Object.assign(env, {
    HOME: path.join(runtimeDir, "home"), USERPROFILE: path.join(runtimeDir, "home"),
    APPDATA: path.join(runtimeDir, "home"), LOCALAPPDATA: path.join(runtimeDir, "home"),
    TEMP: path.join(runtimeDir, "tmp"), TMP: path.join(runtimeDir, "tmp"), TMPDIR: path.join(runtimeDir, "tmp"),
    CODEX_HOME: path.join(runtimeDir, "codex"), CODEX_CLI_PATH: path.join(runtimeDir, "missing-codex.exe"),
    CODEX_PATH: path.join(runtimeDir, "missing-codex.exe"),
    CODEBURN_PATH: path.join(runtimeDir, "missing-codeburn.exe"),
    CODEBURN_NATIVE_JOURNAL: path.join(runtimeDir, "analytics", "native-usage.jsonl"),
    CODEBURN_ANALYTICS_HOME: path.join(runtimeDir, "analytics"),
    CODEBURN_ANALYTICS_PYTHON: path.join(runtimeDir, "missing-python.exe"),
    AE_BRIDGE_HOST: "127.0.0.1", AE_BRIDGE_PORT: String(port), AE_BRIDGE_TOKEN: options.token,
    AE_BRIDGE_PANEL_TOKEN: `isolated-panel-${crypto.randomUUID()}`,
    AE_BRIDGE_LOG_DIR: path.join(runtimeDir, "logs"), AE_BRIDGE_STATE_DIR: path.join(runtimeDir, "state"),
    AE_BRIDGE_SETTINGS_DIR: path.join(runtimeDir, "settings"), AE_BRIDGE_BACKUP_DIR: path.join(runtimeDir, "backups"),
    AE_AGENT_SECRETS_FILE: path.join(runtimeDir, "settings", "secrets.json"),
    AE_AGENT_DEV_REQUEST_DIR: path.join(runtimeDir, "dev-requests"),
    AE_AGENT_GENERATED_EXPORT_DIR: path.join(runtimeDir, "exports"),
    AE_AGENT_GENERATED_RENDER_OUTPUT_DIR: path.join(runtimeDir, "renders"),
    AE_AGENT_HARDCORE_SESSION_DIR: path.join(runtimeDir, "sessions"),
    AE_DAEMON_AUTO_START: "0", AE_AGENT_HTTP_TIMEOUT_MS: "5000", AE_COMMAND_TIMEOUT_MS: "500",
    AE_DEFAULT_AGENT: "capture-provider", AE_AGENT_PROVIDERS_JSON: JSON.stringify(options.providers || []),
    MEASUREMENT_ROOT: PROJECT_ROOT, MEASUREMENT_AUDIT: options.auditPath,
    MEASUREMENT_GIT_COMMIT: options.gitCommit || "",
    MEASUREMENT_RULES: JSON.stringify(options.networkRules || [])
  });
  return env;
}

// This bootstrap is temporary, child-only instrumentation. It leaves production
// planner selection/serialization intact and blocks every nested process lane.
const CHILD_BOOTSTRAP = String.raw`"use strict";
const fs = require("fs"), path = require("path"), crypto = require("crypto"), Module = require("module");
const audit = row => fs.appendFileSync(process.env.MEASUREMENT_AUDIT, JSON.stringify({at:new Date().toISOString(),...row})+"\n");
const rules = JSON.parse(process.env.MEASUREMENT_RULES);
const block = code => { audit({kind:"blocked",code}); throw Object.assign(new Error(code),{code}); };
const childProcess = require("child_process");
for (const key of ["spawn","exec","execFile","execSync","execFileSync","fork"]) childProcess[key] = () => block("nested_process_blocked");
childProcess.execFileSync = (command,args,options) => {
  if (command==="git" && JSON.stringify(args)==='["rev-parse","HEAD"]' && options && options.cwd===process.env.MEASUREMENT_ROOT && /^[a-f0-9]{40}$/.test(process.env.MEASUREMENT_GIT_COMMIT)) {
    audit({kind:"metadata_probe",command:"git rev-parse HEAD",source:"parent_verified_head",processExecuted:false});
    return process.env.MEASUREMENT_GIT_COMMIT+"\n";
  }
  return block("nested_process_blocked");
};
childProcess.spawnSync = () => { audit({kind:"blocked",code:"nested_process_blocked"}); return {pid:0,status:null,signal:null,stdout:"",stderr:"",error:Object.assign(new Error("isolated missing executable"),{code:"ENOENT"})}; };
function destination(value) {
  if (typeof value === "string" || value instanceof URL) { const url=new URL(value); return {host:url.hostname,port:Number(url.port||80),path:url.pathname+url.search,method:"GET",protocol:url.protocol}; }
  return {host:value.hostname||value.host||"localhost",port:Number(value.port||80),path:value.path||"/",method:value.method||"GET",protocol:value.protocol||"http:"};
}
const http = require("http"), https = require("https");
const originalRequest = http.request;
http.request = function(value,...rest) {
  const target=destination(value);
  if (target.host!=="127.0.0.1" || target.protocol!=="http:" || target.port===3456 || !rules.some(rule=>rule.port===target.port && rule.method===target.method && rule.path===target.path)) block("outbound_http_blocked");
  audit({kind:"http_request",...target}); return originalRequest.call(this,value,...rest);
};
http.get = function(...args) { const req=http.request(...args); req.end(); return req; };
https.request = https.get = () => block("outbound_https_blocked");
global.fetch = () => block("outbound_fetch_blocked");
const net=require("net"), connect=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args) {
  const first=Array.isArray(args[0]) ? args[0][0] : args[0];
  const target=typeof first==="object" ? first : {port:first,host:args[1]};
  if (!target || target.path || (target.host||target.hostname)!=="127.0.0.1" || Number(target.port)===3456 || !rules.some(rule=>rule.port===Number(target.port))) block("outbound_socket_blocked");
  return connect.apply(this,args);
};
const seen=new Set(), load=Module._load;
Module._load=function(request,parent,isMain) {
  const filename=Module._resolveFilename(request,parent,isMain);
  const root=process.env.MEASUREMENT_ROOT;
  if (path.isAbsolute(filename) && filename.startsWith(root+path.sep) && !seen.has(filename)) {
    seen.add(filename); const bytes=fs.readFileSync(filename);
    audit({kind:"source",path:path.relative(root,filename).replace(/\\/g,"/"),sha256:crypto.createHash("sha256").update(bytes).digest("hex"),bytes:bytes.length});
  }
  const exported=load.apply(this,arguments);
  if (filename===path.join(root,"mcp-server","ai-agents.js") && !exported.__measurementGuarded) {
    for (const key of ["chatWithAgent","checkAgentReadiness"]) {
      const original=exported[key]; exported[key]=function(args) {
        if (!args || args.agentId!=="capture-provider") block("provider_lane_blocked");
        return original.apply(this,arguments);
      };
    }
    exported.launchCodexLogin=()=>block("codex_login_blocked");
    const summary=exported.agentSummary;
    exported.agentSummary=()=>summary().filter(agent=>agent.id==="capture-provider");
    exported.listAgents=()=>block("provider_listing_blocked");
    exported.__measurementGuarded=true;
  }
  return exported;
};
audit({kind:"guard_ready",nestedProcesses:"blocked",nativeJournal:process.env.CODEBURN_NATIVE_JOURNAL,codexHome:process.env.CODEX_HOME});
`;

function trackChild(child, role = "test") {
  const state = { role, pid: child.pid || null, exitObserved: false, closeObserved: false, spawnError: null };
  childStates.set(child, state);
  child.once("exit", (code, signal) => { state.exitObserved = true; state.exitCode = code; state.signalCode = signal; });
  child.once("error", error => { state.spawnError = error.message; });
  child.once("close", () => { state.closeObserved = true; });
  return state;
}
async function stopChildProcess(child, timeoutMs = 2500) {
  if (!child) return { exitConfirmed: true, notStarted: true };
  const state = childStates.get(child);
  if (!state) throw failure("untracked_child_exit_unconfirmed");
  const exited = () => state.exitObserved && (child.exitCode !== null || child.signalCode != null);
  const wait = async () => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline && !exited() && !(state.spawnError && !child.pid && state.closeObserved)) await pause(20);
  };
  if (!exited()) {
    try { state.killAccepted = child.kill(); } catch (error) { state.killError = error.message; }
    await wait();
  }
  if (!exited() && !(state.spawnError && !child.pid && state.closeObserved)) {
    try { state.forceKillAccepted = child.kill("SIGKILL"); } catch (error) { state.forceKillError = error.message; }
    await wait();
  }
  if (!exited() && !(state.spawnError && !child.pid && state.closeObserved)) throw Object.assign(failure("child_exit_unconfirmed"), { childState: { ...state } });
  return { ...state, exitConfirmed: true, notStarted: !child.pid };
}
function monitorStream(stream, onFailure, maxBytes = 1024 * 1024) {
  const collector = new BoundedBufferCollector(maxBytes);
  let error = null;
  stream.on("data", chunk => {
    if (error) return;
    try { collector.append(chunk); } catch (caught) { error = caught; onFailure(caught); }
  });
  stream.on("error", caught => { if (!error) { error = caught; onFailure(caught); } });
  return { collector, check() { if (error) throw error; } };
}

function readHttpBuffer(stream, maxBytes = DEFAULT_MAX_COLLECTOR_BYTES) {
  return new Promise((resolve, reject) => {
    const collector = new BoundedBufferCollector(maxBytes);
    let settled = false;
    const fail = error => { if (!settled) { settled = true; reject(error); } };
    stream.on("data", chunk => {
      if (settled) return;
      try { collector.append(chunk); } catch (error) { fail(error); stream.destroy(); }
    });
    stream.on("error", fail);
    stream.on("aborted", () => fail(failure("http_aborted")));
    stream.on("end", () => { if (!settled) { settled = true; resolve(collector.toBuffer()); } });
    stream.on("close", () => { if (!settled) fail(failure("http_closed_before_end")); });
  });
}
function httpRequestCollector(options, payload, maxBytes = DEFAULT_MAX_COLLECTOR_BYTES) {
  const port = validateLoopbackPort(options.port);
  const rawBody = payload === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(payload));
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path: options.path,
      method: payload === undefined ? "GET" : "POST", timeout: options.timeoutMs || 8000,
      headers: { "content-type": "application/json", "content-length": rawBody.length, "x-ae-bridge-token": options.token } }, res => {
      readHttpBuffer(res, maxBytes).then(rawBuffer => {
        try { resolve({ status: res.statusCode, rawBuffer, body: JSON.parse(rawBuffer.toString("utf8")) }); }
        catch (error) { reject(error); }
      }, reject);
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(failure("http_timeout")));
    req.end(rawBody);
  });
}
function assertDisconnectedHealth(body) {
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.panelConnected, false, "panel_connected_rejected");
  assert.strictEqual(body.pending, 0, "native_commands_rejected");
  assert.strictEqual(body.inflight, 0, "native_commands_rejected");
}
async function waitForDaemonReady(daemon) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    daemon.check();
    let response;
    try { response = await httpRequestCollector({ ...daemon, path: "/health", timeoutMs: 400 }); }
    catch (error) {
      if (!["ECONNREFUSED", "ECONNRESET", "http_timeout"].includes(error.code)) throw error;
      await pause(70); continue;
    }
    if (response.status !== 200) throw failure("isolated_health_failed");
    assertDisconnectedHealth(response.body);
    return response.body;
  }
  throw failure("isolated_daemon_start_timeout");
}

function validateCatalogUnion(daemonTools, adapterTools) {
  const localNames = new Set(productionUsageTools.map(tool => tool.name));
  const unique = tools => {
    const byName = new Map();
    for (const tool of tools) {
      if (!tool || typeof tool.name !== "string" || byName.has(tool.name)) throw failure("catalog_duplicate_or_invalid");
      byName.set(tool.name, tool);
    }
    return byName;
  };
  unique(daemonTools);
  const actual = unique(adapterTools);
  if (adapterTools.length === localNames.size && adapterTools.every(tool => localNames.has(tool.name))) throw failure("local_only_fallback_rejected");
  const expected = unique([...daemonTools.filter(tool => !localNames.has(tool.name)), ...productionUsageTools]);
  assert.deepStrictEqual([...actual.keys()].sort(), [...expected.keys()].sort(), "catalog_name_union_mismatch");
  for (const [name, tool] of expected) assert.deepStrictEqual(actual.get(name), tool, `catalog_contract_mismatch:${name}`);
  return { exactNameUnion: true, fullContractsEqual: true, localOnlyFallback: false, deduplicated: true, expectedCount: expected.size };
}

function wireMetrics(rawBuffer, parsed) {
  const normalized = JSON.stringify(parsed);
  return { wireUtf8Bytes: rawBuffer.length, wireUtf16Chars: rawBuffer.toString("utf8").length,
    payloadSha256: sha256(rawBuffer), serializedJsonUtf16Chars: normalized.length,
    normalizedJsonUtf8Bytes: Buffer.byteLength(normalized), normalizedJsonSha256: sha256(normalized) };
}
function captureRow(session, surface, rawBuffer, parsed, metadata = {}) {
  const artifact = `captures/${surface}.raw`;
  fs.writeFileSync(path.join(session.root, artifact), rawBuffer);
  return { surface, captureKind: "actual_isolated_wire", capturedAt: new Date().toISOString(),
    ...wireMetrics(rawBuffer, parsed), artifact, sourceIdentityRef: "sourceIdentity", metadata,
    units: { wire: "utf8_body_or_jsonrpc_line_bytes", normalizedJson: "utf16_code_units", tokens: "unavailable" },
    observedUsage: unavailableUsage() };
}
async function measureDaemonHttpTools(session, daemon) {
  const response = await httpRequestCollector({ ...daemon, path: "/tools" });
  assert.strictEqual(response.status, 200);
  assert.strictEqual(response.body.ok, true);
  assert(Array.isArray(response.body.tools));
  return { tools: response.body.tools, row: captureRow(session, "daemon_http_tools", response.rawBuffer, response.body,
    { endpoint: "/tools", toolCount: response.body.tools.length,
      hasAutoCheckpointEnrichment: response.body.tools.some(tool => !!(tool.inputSchema?.properties?.autoCheckpoint)) }) };
}

function spawnOwnedChild(session, role, entryPath, options) {
  const auditPath = path.join(session.root, `${role}-audit.jsonl`);
  const env = createScrubbedEnvironment(session.work, { ...options, auditPath, gitCommit: session.gitCommit });
  const child = spawn(process.execPath, ["--require", session.bootstrapPath, entryPath], {
    cwd: PROJECT_ROOT, env, windowsHide: true, shell: false, stdio: ["pipe", "pipe", "pipe"]
  });
  const state = trackChild(child, role);
  const record = { child, state, auditPath, env, failure: null };
  session.children.push(record);
  child.once("error", error => { record.failure = error; if (record.reader) record.reader.fail(error); });
  const onFailure = error => { record.failure = error; if (record.reader) record.reader.fail(error); };
  record.stderr = monitorStream(child.stderr, onFailure);
  record.stdout = role === "adapter" ? null : monitorStream(child.stdout, onFailure);
  record.check = () => {
    if (record.failure) throw record.failure;
    if (state.exitObserved) throw failure("child_exited_before_measurement_finished");
  };
  return record;
}
async function startAdapter(session, daemon) {
  const record = spawnOwnedChild(session, "adapter", path.join(PROJECT_ROOT, "mcp-server", "mcp-adapter.js"), {
    ...daemon, networkRules: [
      { port: daemon.port, path: "/health", method: "GET" },
      { port: daemon.port, path: "/tools", method: "GET" },
      { port: daemon.port, path: "/mcp/tools/call", method: "POST" }
    ]
  });
  record.reader = new StdioLineReader(record.child.stdout);
  record.child.stdin.on("error", error => { record.failure = error; record.reader.fail(error); });
  let id = 0;
  record.rpc = async (method, params = {}) => {
    record.check();
    const requestId = ++id;
    const request = Buffer.from(JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }) + "\n");
    record.child.stdin.write(request);
    const line = await record.reader.readLine();
    const body = JSON.parse(line.rawString);
    assert.strictEqual(body.id, requestId);
    assert.strictEqual(body.jsonrpc, "2.0");
    if (body.error) throw failure("mcp_rpc_error", JSON.stringify(body.error));
    record.check();
    fs.writeFileSync(path.join(session.root, "captures", `adapter-request-${requestId}.raw`), request);
    return { ...line, body };
  };
  await record.rpc("initialize", {});
  return record;
}
async function measureAdapterStdioToolsList(session, adapter, daemonTools) {
  const response = await adapter.rpc("tools/list");
  const tools = response.body.result?.tools;
  assert(Array.isArray(tools));
  const union = validateCatalogUnion(daemonTools, tools);
  return captureRow(session, "adapter_stdio_tools_list", response.rawBuffer, response.body,
    { toolCount: tools.length, delimiterIncluded: true, union });
}
function unpackTool(response) {
  const result = response.body.result;
  assert.strictEqual(result.isError, false, "mcp_tool_error");
  assert.strictEqual(result.content.length, 1);
  assert.strictEqual(result.content[0].type, "text");
  return JSON.parse(result.content[0].text);
}
async function measureGetSolutionContracts(session, adapter) {
  const search = await adapter.rpc("tools/call", { name: "search_solutions", arguments: { query: "comp visual review", limit: 3 } });
  fs.writeFileSync(path.join(session.root, "captures", "solution-search.raw"), search.rawBuffer);
  assert(unpackTool(search).results.some(result => result.id === "comp-visual-review-plan"));
  const rows = [];
  let first;
  for (const variant of ["none", "one", "preferred_all"]) {
    const preferred = first?.solution?.execution?.preferredTools || [];
    const names = variant === "none" ? [] : variant === "one" ? preferred.slice(0, 1) : preferred.slice(0, 4);
    if (variant !== "none") assert(names.length > 0);
    const args = { id: "comp-visual-review-plan", offset: 0, limit: 6000, toolNames: names };
    const response = await adapter.rpc("tools/call", { name: "get_solution", arguments: args });
    const result = unpackTool(response);
    if (!first) first = result;
    assert.deepStrictEqual(result.recipe, first.recipe, "solution_page_mismatch");
    assert.strictEqual(result.solution.id, first.solution.id);
    assert.strictEqual(result.toolContracts.length, names.length);
    assert(JSON.stringify(result.toolContracts).length <= 24000);
    rows.push(captureRow(session, `mcp_get_solution_contracts_${variant}`, response.rawBuffer, response.body,
      { solutionId: args.id, offset: 0, limit: 6000, preferredToolNames: names, delimiterIncluded: true,
        contractsCount: names.length, contractsChars: JSON.stringify(result.toolContracts).length,
        contractsLimitUtf16Chars: 24000, decodedToolResultUtf16Chars: JSON.stringify(result).length }));
  }
  return rows;
}

const CANONICAL_SYNTHETIC_RUN = {
  id: "550e8400-e29b-41d4-a716-446655440000", startedAt: "2026-10-04T12:00:00.000Z", finishedAt: "2026-10-04T12:00:05.120Z",
  ok: true, dryRun: false, confirm: true, allowMutations: true, autoEditSession: false,
  executedCount: 3, skippedCount: 0, failedCount: 0, errorCode: null,
  repairDirective: { eligible: false, rootActionId: "synthetic-action", parentActionId: null,
    attempt: 1, maxAttempts: 2, disposition: "completed", reason: "all_steps_successful",
    automaticReplayAllowed: false, action: "none", runId: "550e8400-e29b-41d4-a716-446655440000" },
  provenance: { schema: "ae-agent-provenance.v1", actionId: "synthetic-action", proposalRevision: 1,
    projectId: "synthetic-project", projectRevision: 2, projectRevisionReason: "synthetic_text_update",
    planSha256: "1".repeat(64), runtime: { gitCommit: "2".repeat(40), sourceSha256: "3".repeat(64), synthetic: true } },
  outcome: {
    execution: { status: "completed", scope: "plan_execution", count: 3 },
    mutation: { status: "applied", scope: "layers", count: 1, counts: { applied: 1, unknown: 0, failed: 0, not_started: 0 } },
    verification: { status: "verified", scope: "read_back", count: 1 },
    coverage: { status: "complete", scope: "steps", count: 3 },
    acceptance: { status: "not_requested", scope: "synthetic_fixture" }
  },
  semanticVerification: { status: "passed", ok: true, unverifiedMutationCount: 0,
    passedChecks: 1, failedChecks: 0, needsReviewChecks: 0, coverageStatus: "complete", readBackCount: 1,
    mutationVerificationCount: 1, warnings: [], checks: [{ id: "read-back", status: "passed", passed: true }] },
  steps: [
    { index: 1, tool: "get_active_comp", status: "completed", mutatesProject: false, durationMs: 40,
      result: { ok: true, comp: { id: 1, name: "Synthetic" }, arbitraryDetails: { comment: "fixture only", values: Array(80).fill("fixture") } } },
    { index: 2, tool: "set_layer_text", status: "completed", mutatesProject: true, durationMs: 80,
      args: { text: "Синтетический текст" }, result: { ok: true, layer: { id: 10, index: 1, name: "Title" }, nativePayload: "fixture ".repeat(200) } },
    { index: 3, tool: "get_layer_details", status: "completed", mutatesProject: false, durationMs: 30,
      evidenceArtifact: { artifactId: "550e8400-e29b-41d4-a716-446655440000-step-3", sha256: "4".repeat(64), observedAt: "2026-10-04T12:00:05.000Z", kind: "synthetic_fixture" },
      result: { ok: true, layer: { id: 10, index: 1, name: "Title" }, postVerification: { ok: true }, details: "fixture ".repeat(200) } }
  ]
};
const select = (object, keys) => Object.fromEntries(keys.filter(key => object?.[key] !== undefined && object?.[key] !== null).map(key => [key, object[key]]));
const PARITY_KEYS = ["id", "startedAt", "finishedAt", "ok", "dryRun", "confirm", "allowMutations", "autoEditSession", "executedCount", "skippedCount", "failedCount"];
function verifyPlanRunParity(full, summary) {
  assert.strictEqual(summary.schema, PLAN_RUN_SUMMARY_SCHEMA);
  for (const key of PARITY_KEYS) assert.deepStrictEqual(summary[key], full[key], `summary_parity:${key}`);
  for (const key of ["errorCode", "error", "recoveryHint"]) assert.strictEqual(summary[key] ?? null, full[key] ?? null, `summary_parity:${key}`);
  assert.strictEqual(summary.actionId, full.provenance?.actionId ?? null);
  assert.strictEqual(summary.requestId, full.m100Message?.requestId ?? null);
  assert.deepStrictEqual(summary.repairDirective, select(full.repairDirective,
    ["eligible", "rootActionId", "parentActionId", "attempt", "maxAttempts", "disposition", "reason", "automaticReplayAllowed", "action", "runId"]), "summary_parity:repairDirective");
  const expectedProvenance = { ...full.provenance, runtime: select(full.provenance.runtime, ["gitCommit", "sourceSha256"]) };
  assert.deepStrictEqual(summary.provenance, expectedProvenance, "summary_parity:provenance");
  // The canonical fixture contains only supported bounded outcome dimensions.
  assert.deepStrictEqual(summary.outcome, full.outcome, "summary_parity:outcome");
  for (const key of ["status", "ok", "unverifiedMutationCount", "passedChecks", "failedChecks", "needsReviewChecks", "coverageStatus", "readBackCount", "mutationVerificationCount"]) {
    assert.strictEqual(summary.semanticVerification[key], full.semanticVerification[key], `summary_parity:semanticVerification.${key}`);
  }
  assert.strictEqual(summary.semanticVerification.totalChecks, full.semanticVerification.checks.length);
  assert.strictEqual(summary.steps.length, full.steps.length);
  assert.deepStrictEqual(summary.evidenceReference, { runId: full.id, totalSteps: full.steps.length });
  for (let index = 0; index < full.steps.length; index++) {
    const original = full.steps[index], projected = summary.steps[index];
    assert.deepStrictEqual(select(projected, ["index", "tool", "status", "mutatesProject", "durationMs"]),
      select(original, ["index", "tool", "status", "mutatesProject", "durationMs"]), "summary_parity:step");
    if (original.evidenceArtifact) assert.deepStrictEqual(projected.evidence, select(original.evidenceArtifact, ["artifactId", "sha256"]), "summary_parity:evidence");
    assert.strictEqual(projected.resultRef.ok, original.result.ok);
    for (const dimension of ["comp", "layer"]) if (original.result[dimension]) assert.deepStrictEqual(projected.resultRef[dimension], original.result[dimension]);
    if (original.result.postVerification) assert.strictEqual(projected.resultRef.postVerification.ok, original.result.postVerification.ok);
  }
  return true;
}
function measurePlanRunSummaryParity(session, full = CANONICAL_SYNTHETIC_RUN) {
  const summary = projectPlanRunSummary(full);
  verifyPlanRunParity(full, summary);
  const rows = [full, summary].map((payload, index) => {
    const text = JSON.stringify(payload);
    const surface = index ? "synthetic_plan_run_summary" : "synthetic_plan_run_full";
    const artifact = `captures/${surface}.json`;
    if (session) fs.writeFileSync(path.join(session.root, artifact), text);
    return { surface, captureKind: "local_derived_synthetic", capturedAt: new Date().toISOString(), wireUtf8Bytes: null,
      serializedJsonUtf16Chars: text.length, normalizedJsonUtf8Bytes: Buffer.byteLength(text),
      payloadSha256: sha256(text), artifact: session ? artifact : null, sourceIdentityRef: "sourceIdentity", observedUsage: unavailableUsage() };
  });
  return { rows, summary, compaction: { syntheticParityPassed: true, nativeAeResult: false, modelTaskQualityMeasured: false,
    normalizedJsonBytesReductionRatio: 1 - rows[1].normalizedJsonUtf8Bytes / rows[0].normalizedJsonUtf8Bytes,
    parityScope: "canonical_fixture_supported_projection",
    projectionOmissions: ["step args/intent and arbitrary result details", "individual passed semantic checks",
      "provenance.runtime.synthetic fixture label", "evidence observedAt/kind (summary retains artifactId/sha256)"] } };
}

function plannerPromptCrossCheck(request, metadata) {
  const prompt = request.messages?.find(message => message.role === "user")?.content;
  assert.strictEqual(typeof prompt, "string");
  assert.strictEqual(prompt.length, metadata.promptChars, "planner_prompt_chars_mismatch");
  const startMarker = "Available MCP tools. Use these names exactly; do not invent tool names. Relevant contracts:\n\n";
  const endMarker = "\n\nAdditional supported tool names (";
  const start = prompt.indexOf(startMarker);
  const end = prompt.indexOf(endMarker, start + startMarker.length);
  assert(start >= 0 && end > start, "planner_catalog_section_missing");
  const catalog = prompt.slice(start + startMarker.length, end);
  assert.strictEqual(catalog.length, metadata.catalogChars, "planner_catalog_chars_mismatch");
  assert.strictEqual(catalog.split("\n").filter(line => line.startsWith("- ")).length, metadata.selectedToolCount, "planner_selected_count_mismatch");
  return { prompt, catalog };
}
async function measurePlannerContextPrompt(session, daemon, capture) {
  const response = await httpRequestCollector({ ...daemon, path: "/agents/plan" },
    { agentId: "capture-provider", model: "capture-model", prompt: "Summarize the active comp.", repairPlan: false });
  assert.strictEqual(response.status, 200, "planner_capture_failed");
  assert.strictEqual(response.body.ok, true);
  assert.strictEqual(capture.requests.length, 1, "unexpected_provider_call_count");
  assert.strictEqual(response.body.result.plan.steps.length, 1);
  assert.strictEqual(response.body.result.plan.steps[0].tool, "get_active_comp");
  const request = capture.requests[0];
  const metadata = response.body.result.planPromptContext;
  const checked = plannerPromptCrossCheck(request.body, metadata);
  const row = captureRow(session, "planner_provider_http_body", request.rawBuffer, request.body,
    { ...metadata, responseSynthetic: true, repairPlan: false, executionAttempted: false, activeProviderId: "capture-provider" });
  fs.writeFileSync(path.join(session.root, "captures", "planner-prompt.txt"), checked.prompt);
  fs.writeFileSync(path.join(session.root, "captures", "planner-response.raw"), response.rawBuffer);
  row.captureKind = "actual_isolated_production_planner_serialization";
  row.promptText = { utf16Chars: checked.prompt.length, utf8Bytes: Buffer.byteLength(checked.prompt), sha256: sha256(checked.prompt),
    artifact: "captures/planner-prompt.txt" };
  row.crossCheck = { promptCharsMatch: true, catalogCharsMatch: true, selectedToolCountMatch: true,
    privateToolSetReconstruction: false };
  return row;
}
function createCaptureServer() {
  const capture = { requests: [], events: [], failure: null, server: null };
  capture.server = http.createServer((req, res) => {
    (async () => {
      capture.events.push({ method: req.method, path: req.url });
      let body;
      if (req.method === "GET" && req.url === "/models") body = { data: [{ id: "capture-model", object: "model" }] };
      else if (req.method === "POST" && req.url === "/chat/completions") {
        const rawBuffer = await readHttpBuffer(req, 1024 * 1024);
        capture.requests.push({ rawBuffer, body: JSON.parse(rawBuffer.toString("utf8")) });
        const plan = { summary: "Synthetic read-only draft", risk: "low", requiresCheckpoint: false,
          clarifyingQuestion: null, solutionIds: [], steps: [{ title: "Inspect", intent: "Read composition", tool: "get_active_comp",
            args: {}, mutatesProject: false, verifyAfter: false }] };
        body = { id: "synthetic-capture-response", object: "chat.completion", model: "capture-model",
          choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(plan) } }] };
      } else throw failure("unexpected_capture_route");
      const raw = JSON.stringify(body);
      res.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(raw) });
      res.end(raw);
    })().catch(error => {
      capture.failure = error;
      if (!res.destroyed) { res.writeHead(500); res.end(JSON.stringify({ error: error.code || error.message })); }
    });
  });
  return capture;
}

// Optional external usage import was intentionally removed. This harness has no
// trusted provider-response collector or benchmark case binder; client flags or
// account/task totals cannot authorize attribution or adoption.
function importObservedUsageRecord(record) {
  const fake = record && ["fake", "synthetic", "estimated", "inferredFromChars"].some(key => record[key] === true);
  return { ok: false, error: fake ? "fake_or_estimated_tokens_rejected_as_actual" : "external_usage_import_not_supported",
    attributionLevel: "unattributed_usage", eligibleForSchemaSavings: false, observedUsage: unavailableUsage("external_usage_not_verified") };
}
function inferTokensFromChars() { return { tokens: null, allowed: false, reason: "chars_to_tokens_inference_forbidden" }; }
function assessLazyLoadingDecision() {
  return { recommendation: "defer", comparableAB: false, tokenSavingsPercent: null,
    observedModelTokensAvailable: false, taskQualityMeasured: false,
    clientCodexPerTurnFootprint: { status: "unknown", reason: "client_schema_injection_not_observed" },
    reason: "controlled_paired_model_tokens_and_task_quality_not_measured" };
}

function fileFingerprint(filename) {
  try { const raw = fs.readFileSync(filename); return { exists: true, bytes: raw.length, sha256: sha256(raw) }; }
  catch (error) { if (error.code === "ENOENT") return { exists: false, bytes: null, sha256: null }; throw error; }
}
function gitCommit() {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: PROJECT_ROOT, encoding: "utf8", windowsHide: true,
    stdio: ["ignore", "pipe", "ignore"] }).trim();
}
function sourceSnapshot(paths) {
  return paths.map(relative => ({ path: relative, ...fileFingerprint(path.join(PROJECT_ROOT, relative)) }));
}
function validateSourceFreshness(before, after) {
  assert.deepStrictEqual(after, before, "measurement_source_changed");
  return true;
}
const SOURCE_PATHS = ["scripts/tool-context-measurement.js", "scripts/tool-context-measurement-smoke.js", "docs/tool-context-measurement.md",
  "mcp-server/bridge-daemon.js", "mcp-server/mcp-adapter.js", "mcp-server/ai-agents.js", "mcp-server/planner-context.js",
  "mcp-server/planner-tool-guidance.js", "mcp-server/solution-discovery.js", "mcp-server/solution-library.js",
  "mcp-server/solution-plan-builder.js", "mcp-server/plan-run-response.js", "mcp-server/production-usage-tools.js",
  "mcp-server/native-usage.js", "mcp-server/tool-error-response.js", "mcp-server/http-boundary.js",
  "mcp-server/text-layout-policy.js", "registry/solutions.json", "recipes/comp-visual-review-plan.md"];

async function runAllMeasurements() {
  const sourcesBefore = sourceSnapshot(SOURCE_PATHS);
  const commitBefore = gitCommit();
  const beforeAt = new Date().toISOString();
  const commonPaths = [...new Set([path.join(PROJECT_ROOT, ".codex-runtime", "codeburn", "native-usage.jsonl"),
    ...(process.env.CODEBURN_NATIVE_JOURNAL ? [path.resolve(process.env.CODEBURN_NATIVE_JOURNAL)] : [])])];
  const journalsBefore = commonPaths.map(filename => ({ path: filename, ...fileFingerprint(filename) }));
  const session = { root: createOwnedRuntime(), children: [] };
  session.work = createOwnedRuntime(session.root);
  fs.mkdirSync(path.join(session.root, "captures"));
  session.bootstrapPath = path.join(session.root, "child-isolation.cjs");
  fs.writeFileSync(session.bootstrapPath, CHILD_BOOTSTRAP);
  session.gitCommit = commitBefore;
  const capture = createCaptureServer();
  let report = { schema: REPORT_SCHEMA, ok: false, generatedAt: null, surfaces: [], isolation: {}, lazyLoadingEvaluation: assessLazyLoadingDecision() };
  let primaryError = null;
  try {
    const capturePort = await listenLoopback(capture.server);
    const daemonPort = await reserveRandomLoopbackPort();
    const token = `measurement-${crypto.randomUUID()}`;
    const daemonRecord = spawnOwnedChild(session, "daemon", path.join(PROJECT_ROOT, "mcp-server", "bridge-daemon.js"), {
      port: daemonPort, token,
      providers: [{ id: "capture-provider", label: "Isolated capture", provider: "capture-provider", apiStyle: "openai",
        baseUrl: `http://127.0.0.1:${capturePort}`, model: "capture-model", models: ["capture-model"], requiresApiKey: false }],
      networkRules: [{ port: capturePort, path: "/models", method: "GET" }, { port: capturePort, path: "/chat/completions", method: "POST" }]
    });
    const daemon = { port: daemonPort, token, check: daemonRecord.check };
    const initialHealth = await waitForDaemonReady(daemon);
    const catalog = await measureDaemonHttpTools(session, daemon);
    report.surfaces.push(catalog.row);
    const adapter = await startAdapter(session, daemon);
    report.surfaces.push(await measureAdapterStdioToolsList(session, adapter, catalog.tools));
    report.surfaces.push(...await measureGetSolutionContracts(session, adapter));
    const compact = measurePlanRunSummaryParity(session);
    report.surfaces.push(...compact.rows);
    report.planRunCompaction = compact.compaction;
    report.surfaces.push(await measurePlannerContextPrompt(session, daemon, capture));
    if (capture.failure) throw capture.failure;
    for (const record of session.children) record.check();
    const finalHealth = (await httpRequestCollector({ ...daemon, path: "/health" })).body;
    assertDisconnectedHealth(finalHealth);
    const nativeEvents = fs.readFileSync(path.join(session.work, "logs", "bridge-events.jsonl"), "utf8")
      .trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
    assert(!nativeEvents.some(event => /^(ae_command_|command_queued|command_submitted)/.test(event.type || "")), "native_command_event_rejected");
    report.isolation = { daemonPort, capturePort, adapterAutoStart: false, activeProviderLane: "capture-provider",
      defaultProviderDefinitions: "retained_by_production_module_but_other_lanes_guarded",
      panelConnectedBefore: initialHealth.panelConnected, panelConnectedAfter: finalHealth.panelConnected,
      nativeCommandsObserved: 0, providerCalls: capture.requests.length, captureEvents: capture.events,
      childOnlyBootstrap: "child-isolation.cjs", bootstrapSha256: sha256(CHILD_BOOTSTRAP) };
    // Preserve isolated logs/journal as measurement evidence, never as actual model usage.
    for (const filename of ["bridge-events.jsonl", "ai-agent-chats.jsonl"]) {
      const source = path.join(session.work, "logs", filename);
      if (fs.existsSync(source)) fs.copyFileSync(source, path.join(session.root, filename));
    }
    const journal = path.join(session.work, "analytics", "native-usage.jsonl");
    if (fs.existsSync(journal)) fs.copyFileSync(journal, path.join(session.root, "isolated-native-usage.jsonl"));
    report.isolation.isolatedJournal = { ...fileFingerprint(journal), usageMeaning: "synthetic_provider_response_without_token_usage" };
    report.ok = true;
  } catch (error) { primaryError = error; report.error = { code: error.code || "measurement_failed", message: error.message }; }
  finally {
    const exitResults = [];
    for (const record of session.children.slice().reverse()) {
      try { exitResults.push(await stopChildProcess(record.child)); }
      catch (error) { exitResults.push({ ...error.childState, exitConfirmed: false, error: error.code }); primaryError ||= error; }
      if (record.reader) record.reader.destroy();
    }
    try { await closeServer(capture.server); }
    catch (error) { primaryError ||= error; }
    report.isolation.children = exitResults;
    const validationErrors = [];
    const recordValidationError = error => {
      primaryError ||= error;
      validationErrors.push({ code: error.code || "validation_failed", message: error.message });
    };
    const loaded = [];
    try {
      for (const record of session.children) {
        const audit = fs.existsSync(record.auditPath) ? fs.readFileSync(record.auditPath, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line)) : [];
        assert(audit.some(event => event.kind === "guard_ready"), "child_guard_not_verified");
        assert(!audit.some(event => event.kind === "blocked"), "blocked_child_operation_detected");
        for (const event of audit.filter(event => event.kind === "source")) {
          const after = fileFingerprint(path.join(PROJECT_ROOT, event.path));
          assert.strictEqual(after.sha256, event.sha256, `loaded_source_changed:${event.path}`);
          loaded.push({ child: record.state.role, path: event.path, sha256: event.sha256, bytes: event.bytes, loadedAt: event.at });
        }
      }
    } catch (error) { recordValidationError(error); }
    try {
      const sourcesAfter = sourceSnapshot(SOURCE_PATHS), commitAfter = gitCommit();
      report.sourceIdentity = { gitCommit: commitBefore, beforeAt, afterAt: new Date().toISOString(),
        before: sourcesBefore, after: sourcesAfter, unchanged: JSON.stringify(sourcesBefore) === JSON.stringify(sourcesAfter) && commitBefore === commitAfter, loadedModules: loaded,
        manifestSha256: sha256(JSON.stringify(sourcesBefore)), manifestHashKind: "ordered_path_and_file_fingerprint_manifest_not_single_file_hash",
        nodeVersion: process.version, nodeExecutable: process.execPath, platform: process.platform };
      validateSourceFreshness(sourcesBefore, sourcesAfter);
      assert.strictEqual(commitAfter, commitBefore, "git_commit_changed_during_measurement");
    } catch (error) { recordValidationError(error); }
    try {
      const journalsAfter = commonPaths.map(filename => ({ path: filename, ...fileFingerprint(filename) }));
      report.isolation.commonJournals = { before: journalsBefore, after: journalsAfter,
        unchanged: JSON.stringify(journalsBefore) === JSON.stringify(journalsAfter), checkedAt: new Date().toISOString() };
      assert.deepStrictEqual(journalsAfter, journalsBefore, "common_native_journal_changed");
    } catch (error) { recordValidationError(error); }
    try {
      if (!primaryError && exitResults.every(result => result.exitConfirmed)) {
        safeRemoveTempDirectory(session.work);
        report.isolation.workDirectoryRemoved = true;
      } else report.isolation.workDirectoryRemoved = false;
    } catch (error) { recordValidationError(error); report.isolation.workDirectoryRemoved = false; }
    if (validationErrors.length) report.isolation.validationErrors = validationErrors;
    report.ok = report.ok && !primaryError;
    report.generatedAt = new Date().toISOString();
    const reportPath = path.join(session.root, "report.json");
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
    if (primaryError) { primaryError.reportPath = reportPath; throw primaryError; }
  }
  return { ok: true, reportPath: path.join(session.root, "report.json"), report };
}

if (require.main === module) runAllMeasurements().then(result => {
  console.log(JSON.stringify({ ok: true, reportPath: result.reportPath,
    surfaces: result.report.surfaces.map(row => ({ surface: row.surface, wireUtf8Bytes: row.wireUtf8Bytes,
      serializedJsonUtf16Chars: row.serializedJsonUtf16Chars })), lazyLoadingRecommendation: "defer" }, null, 2));
}, error => {
  console.error(JSON.stringify({ ok: false, error: error.code || error.message, reportPath: error.reportPath || null }));
  process.exitCode = 1;
});

module.exports = { BoundedBufferCollector, StdioLineReader, validateLoopbackPort, reserveRandomLoopbackPort,
  createOwnedRuntime, createScrubbedEnvironment, safeRemoveTempDirectory, stopChildProcess, trackChild,
  monitorStream, readHttpBuffer, wireMetrics, validateCatalogUnion, validateSourceFreshness,
  measureDaemonHttpTools, measureAdapterStdioToolsList, measureGetSolutionContracts,
  measurePlanRunSummaryParity, verifyPlanRunParity, plannerPromptCrossCheck, assertDisconnectedHealth,
  importObservedUsageRecord, inferTokensFromChars, assessLazyLoadingDecision, runAllMeasurements,
  CANONICAL_SYNTHETIC_RUN, CHILD_BOOTSTRAP, FORBIDDEN_PORT, REPORT_SCHEMA };
