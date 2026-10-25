"use strict";

// Isolated loopback fixture for bridge HTTP-boundary tests. It never launches
// After Effects, CEP, a provider, or the production bridge port.
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { isBuiltin } = require("module");
const { spawn } = require("child_process");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const FIXTURE_PREFIX = "ae-agent-network-boundary-";
// Ownership is process-local: a directory name or a copied marker never grants
// permission to restart someone else's fixture or its production authority.
const ownedRuntimes = new Map();
function createRuntimeDirectory() {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), FIXTURE_PREFIX));
  plainPath(runtimeDir, true);
  const stat = fs.lstatSync(runtimeDir);
  ownedRuntimes.set(runtimeDir, { runtimeDir, active: false, device: stat.dev, inode: stat.ino });
  return runtimeDir;
}
const EXTRA_SOURCES = new Set([
  "orchestrator/bounded-process-result.cjs", // supported, non-frozen runtime exception
  "scripts/owned-runtime-control.js", "scripts/autonomous-plan-client.js",
  "scripts/owned-runtime-initial-recovery.js",
  "scripts/core-legacy-control-reader.js", "scripts/core-product-migration-control.js",
  "scripts/core-state-migration.js", "config/core-legacy-verifier-manifest.json",
  "scripts/owned-runtime-product-activation.js",
  "scripts/owned-runtime-startup-retire.js", "scripts/owned-runtime-finalize-launch.js",
  "scripts/owned-runtime-maintenance-retire.js", "scripts/owned-runtime-panel-reload.js",
  "scripts/cep-panel-target.js", "scripts/native-fixture-retained-maintenance.js",
  "scripts/native-fixture-prephase-maintenance.js", "scripts/common-title-assembly-maintenance.js",
  "scripts/human-guard-settlement-maintenance.js", "scripts/ame-job-source-hash-worker.cjs",
  "scripts/owned-runtime-win32-helper.ps1", "scripts/owned-runtime-daemon-helper.ps1",
  "scripts/owned-runtime-startup-retire-helper.ps1", "scripts/owned-runtime-maintenance-retire-helper.ps1",
  "scripts/windows-mcp-launcher.cs", // measured source only; never compiled/executed by fixture
  "scripts/cep-panel-cdp-smoke.js"
]);
const PANEL_ASSETS = ["CSXS/manifest.xml", "index.html", "panel-action-contract.js", "native-probe-startup-guard.js",
  "panel-actions.js", "panel.js", "style.css", "lib/CSInterface.js"].map(name => `cep-panel/${name}`);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fail(code) { throw Object.assign(new Error(code), { code }); }
function samePath(a, b) {
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}
function plainPath(target, directory = false) {
  const resolved = path.resolve(target);
  for (let item = resolved;; item = path.dirname(item)) {
    const stat = fs.lstatSync(item);
    if (stat.isSymbolicLink() || !samePath(fs.realpathSync(item), item)) fail("fixture_path_alias_refused");
    if (item === resolved && (directory ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1)) {
      fail("fixture_nonregular_path_refused");
    }
    if (path.dirname(item) === item) break;
  }
  return resolved;
}
function plainTree(directory) {
  plainPath(directory, true);
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) plainTree(target);
    else plainPath(target);
  }
}
function runtimePath(runtimeDir) {
  const resolved = path.resolve(runtimeDir);
  if (!path.isAbsolute(runtimeDir) || !samePath(runtimeDir, resolved)
    || !samePath(path.dirname(resolved), path.resolve(os.tmpdir()))
    || !path.basename(resolved).startsWith(FIXTURE_PREFIX)) fail("fixture_runtime_path_refused");
  plainPath(resolved, true);
  return resolved;
}
function sourceAllowed(name) {
  return /^mcp-server\/[a-z0-9-]+\.js$/.test(name) || EXTRA_SOURCES.has(name)
    || PANEL_ASSETS.includes(name) || name === "package.json"
    || /^scripts\/[a-z0-9-]+\.(js|cjs|ps1)$/.test(name);
}
function readSource(root, name) {
  if (!sourceAllowed(name)) fail("fixture_source_not_allowlisted");
  const target = path.join(root, name);
  plainPath(target);
  return fs.readFileSync(target);
}
const digest = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

function copyRuntimeSources(launchRoot) {
  // Read current disk bytes, including local changes, without loading modules.
  // Literal imports are the executable closure. runtimeIdentity additionally
  // hashes some scripts/assets without importing them; copy those exact names.
  const files = new Map();
  function copy(name, imports = false) {
    if (files.has(name)) return;
    const bytes = readSource(PROJECT_ROOT, name);
    files.set(name, digest(bytes));
    const target = path.join(launchRoot, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes, { flag: "wx" });
    if (!imports || !/\.(js|cjs)$/.test(name)) return;
    for (const match of bytes.toString("utf8").matchAll(/\brequire\s*\(\s*["']([^"']+)["']\s*\)/g)) {
      const imported = match[1];
      if (!imported.startsWith(".")) {
        if (!isBuiltin(imported)) fail("fixture_external_module_refused");
        continue;
      }
      const base = path.posix.normalize(path.posix.join(path.posix.dirname(name), imported));
      const candidates = [base, `${base}.js`, `${base}.json`, `${base}/index.js`];
      const found = candidates.find(candidate => sourceAllowed(candidate) && fs.existsSync(path.join(PROJECT_ROOT, candidate)));
      if (!found) fail("fixture_source_dependency_missing");
      copy(found, true);
    }
  }
  copy("mcp-server/bridge-daemon.js", true);
  copy("mcp-server/mcp-adapter.js", true);
  const collector = readSource(PROJECT_ROOT, "mcp-server/review-evidence.js").toString("utf8");
  const declared = collector.match(/const RUNTIME_FILES = (\[[\s\S]*?\n\]);/);
  if (!declared) fail("fixture_runtime_census_unrecognized");
  const names = JSON.parse(declared[1]);
  if (!Array.isArray(names) || !names.length) fail("fixture_runtime_census_invalid");
  for (const name of names) copy(name);
  for (const name of PANEL_ASSETS) copy(name);
  // A concurrent writer must not leave a mixture of old and new source bytes.
  // Fail closed; a later caller may take a fresh snapshot after writes settle.
  for (const [name, sha256] of files) {
    if (digest(readSource(PROJECT_ROOT, name)) !== sha256) fail("fixture_source_changed_during_snapshot");
  }
  return files;
}
function verifyRuntimeSources(record) {
  plainTree(record.launchRoot);
  for (const [name, sha256] of record.files) {
    const target = path.join(record.launchRoot, name);
    plainPath(target);
    if (digest(fs.readFileSync(target)) !== sha256) fail("fixture_launch_source_changed");
  }
}

function cappedAppend(current, chunk, limit = 64 * 1024) {
  return (current + String(chunk)).slice(-limit);
}

function reserveLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && address.port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function request(fixture, options = {}) {
  const method = options.method || (options.body === undefined && options.rawBody === undefined ? "GET" : "POST");
  const rawBody = options.rawBody !== undefined
    ? String(options.rawBody)
    : options.body === undefined ? "" : JSON.stringify(options.body);
  const headers = { ...(options.headers || {}) };
  if (options.token !== undefined) headers["x-ae-bridge-token"] = options.token;
  if (rawBody && !Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) {
    headers["content-type"] = "application/json; charset=utf-8";
  }
  if (rawBody && !Object.keys(headers).some((key) => key.toLowerCase() === "content-length")) {
    headers["content-length"] = Buffer.byteLength(rawBody);
  }

  return new Promise((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1",
      port: fixture.port,
      path: options.path || "/health",
      method,
      headers,
      timeout: options.timeoutMs || 5000
    }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { text = cappedAppend(text, chunk, options.maxResponseBytes || 2 * 1024 * 1024); });
      res.on("end", () => {
        let body = null;
        try { body = text ? JSON.parse(text) : {}; } catch (_error) {}
        resolve({ status: res.statusCode, headers: res.headers, text, body });
      });
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error(
      `request timeout: ${method} ${options.path || "/health"} (${Buffer.byteLength(rawBody)} request bytes)`
    )));
    req.end(rawBody || undefined);
  });
}

function abortPartialRequest(fixture, options = {}) {
  return new Promise((resolve) => {
    const headers = {
      "content-type": "application/json",
      "content-length": String(options.claimedLength || 256),
      ...(options.headers || {})
    };
    if (options.token !== undefined) headers["x-ae-bridge-token"] = options.token;
    const req = http.request({
      host: "127.0.0.1",
      port: fixture.port,
      path: options.path || "/tools/call",
      method: "POST",
      headers
    });
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    req.on("error", finish);
    req.on("close", finish);
    req.write(options.partialBody || "{");
    setTimeout(() => {
      req.destroy();
      setTimeout(finish, 50);
    }, 10);
  });
}

function isolatedEnvironment(runtimeDir, options) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^(AE_|CODEBURN|OPENAI|ANTHROPIC|CLAUDE|GEMINI|GOOGLE|OPENROUTER|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY)/i.test(key)
      || /^NODE_(OPTIONS|PATH|V8_COVERAGE|COMPILE_CACHE|REDIRECT_WARNINGS)$/i.test(key)) {
      delete env[key];
    }
  }

  const logDir = path.join(runtimeDir, "logs");
  const settingsDir = path.join(runtimeDir, "settings");
  const stateDir = path.join(runtimeDir, "state");
  const backupDir = path.join(runtimeDir, "backups");
  for (const directory of [logDir, settingsDir, stateDir, backupDir]) fs.mkdirSync(directory, { recursive: true });

  Object.assign(env, {
    // Node copies parent coverage back into a custom env unless the exact key
    // is present. Empty disables coverage without allowing an external writer.
    NODE_V8_COVERAGE: "",
    AE_BRIDGE_PORT: String(options.port),
    AE_BRIDGE_HOST: "127.0.0.1",
    AE_BRIDGE_LOG_DIR: logDir,
    AE_BRIDGE_SETTINGS_DIR: settingsDir,
    AE_BRIDGE_STATE_DIR: stateDir,
    AE_BRIDGE_BACKUP_DIR: backupDir,
    AE_AGENT_SECRETS_FILE: path.join(settingsDir, "agent-secrets.json"),
    AE_AGENT_DEV_REQUEST_DIR: path.join(runtimeDir, "dev-requests"),
    AE_AGENT_GENERATED_EXPORT_DIR: path.join(runtimeDir, "generated-exports"),
    AE_AGENT_GENERATED_RENDER_OUTPUT_DIR: path.join(runtimeDir, "generated-renders"),
    AE_AGENT_HARDCORE_SESSION_DIR: path.join(runtimeDir, "hardcore-sessions"),
    AE_DAEMON_AUTO_START: "0",
    AE_COMMAND_TIMEOUT_MS: String(options.commandTimeoutMs || 750),
    AE_BRIDGE_BODY_LIMIT_BYTES: String(options.bodyLimitBytes || 1024 * 1024),
    CODEBURN_PATH: path.join(runtimeDir, "missing-codeburn.exe")
  });

  const credentialValues = {
    AE_BRIDGE_TOKEN: options.automationToken,
    AE_BRIDGE_PANEL_TOKEN: options.panelToken,
    AE_BRIDGE_ADMIN_TOKEN: options.adminToken,
    AE_BRIDGE_DEV_ADMIN: options.devAdmin === true ? "1" : options.devAdmin === false ? "0" : undefined
  };
  for (const [key, value] of Object.entries(credentialValues)) {
    if (value === undefined || value === null) delete env[key];
    else env[key] = String(value);
  }
  return env;
}

async function waitForReady(fixture, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    if (fixture.spawnError) throw fixture.spawnError;
    if (fixture.child.exitCode !== null || fixture.child.signalCode !== null) {
      throw new Error(`daemon exited before readiness (${fixture.child.exitCode}): ${fixture.stderr.trim()}`);
    }
    try {
      const response = await request(fixture, { path: "/health", timeoutMs: 300 });
      if (response.status === 200 && response.body && response.body.ok === true
        && response.body.port === fixture.port
        && fixture.stderr.includes(`HTTP bridge listening on http://127.0.0.1:${fixture.port}`)) return response;
    } catch (error) {
      lastError = error;
    }
    await pause(50);
  }
  throw lastError || new Error(`daemon did not become ready: ${fixture.stderr.trim()}`);
}

async function stopChild(child, timeoutMs = 2000) {
  if (!child || !child.pid || child.exitCode !== null || child.signalCode !== null) return;
  const closed = new Promise((resolve) => child.once("close", resolve));
  child.kill();
  await Promise.race([closed, pause(timeoutMs)]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await Promise.race([closed, pause(timeoutMs)]);
  }
  if (child.exitCode === null && child.signalCode === null) fail("fixture_child_stop_unconfirmed");
}

function safeRemoveRuntime(runtimeDir) {
  const resolved = path.resolve(runtimeDir), record = ownedRuntimes.get(resolved);
  if (!record) fail("fixture_runtime_not_owned");
  if (record.active) fail("fixture_runtime_active");
  runtimePath(runtimeDir);
  const stat = fs.lstatSync(resolved);
  if (stat.dev !== record.device || stat.ino !== record.inode) fail("fixture_runtime_identity_changed");
  plainTree(resolved);
  fs.rmSync(resolved, { recursive: true, force: true });
  ownedRuntimes.delete(resolved);
}

function reuseFixtureRuntime(runtimeDir) {
  const resolved = runtimePath(runtimeDir), record = ownedRuntimes.get(resolved);
  if (!record) fail("fixture_runtime_not_owned");
  if (record.active) fail("fixture_runtime_active");
  const stat = fs.lstatSync(resolved);
  if (stat.dev !== record.device || stat.ino !== record.inode) fail("fixture_runtime_identity_changed");
  if (!record.launchRoot) fail("fixture_runtime_not_daemon");
  plainTree(resolved);
  verifyRuntimeSources(record);
  return record;
}

async function startDaemon(options = {}) {
  const port = options.port === undefined ? await reserveLoopbackPort() : options.port;
  if (!Number.isInteger(port) || port < 1 || port > 65535 || port === 3456) fail("fixture_port_refused");
  const reused = options.runtimeDir !== undefined;
  const record = reused
    ? reuseFixtureRuntime(options.runtimeDir)
    : ownedRuntimes.get(createRuntimeDirectory());
  const runtimeDir = record.runtimeDir;
  const previousFixture = record.fixture;
  if (!reused) {
    record.launchRoot = path.join(runtimeDir, "launch");
    ownedRuntimes.set(runtimeDir, record);
  }
  record.active = true;
  const fixture = {
    port,
    runtimeDir,
    launchRoot: record.launchRoot,
    automationToken: options.automationToken,
    panelToken: options.panelToken,
    adminToken: options.adminToken,
    stdout: "",
    stderr: "",
    child: null,
    request(optionsForRequest) { return request(fixture, optionsForRequest); },
    abort(optionsForAbort) { return abortPartialRequest(fixture, optionsForAbort); },
    async stop(cleanup = true) {
      if (record.fixture !== fixture) fail("fixture_runtime_owner_changed");
      await stopChild(fixture.child);
      record.active = false;
      if (cleanup) safeRemoveRuntime(runtimeDir);
    }
  };
  record.fixture = fixture;
  try {
    if (!reused) {
      plainPath(runtimeDir, true);
      fs.mkdirSync(record.launchRoot);
      record.files = copyRuntimeSources(record.launchRoot);
    }
    const env = isolatedEnvironment(runtimeDir, { ...options, port });
    if (typeof options.setupRuntime === "function") await options.setupRuntime(runtimeDir, record.launchRoot);
    plainTree(runtimeDir);
    verifyRuntimeSources(record);
    fixture.child = spawn(process.execPath, [path.join(record.launchRoot, "mcp-server", "bridge-daemon.js")], {
      cwd: record.launchRoot,
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    fixture.child.on("error", error => { fixture.spawnError = error; });
    fixture.child.stdout.setEncoding("utf8");
    fixture.child.stderr.setEncoding("utf8");
    fixture.child.stdout.on("data", (chunk) => { fixture.stdout = cappedAppend(fixture.stdout, chunk); });
    fixture.child.stderr.on("data", (chunk) => { fixture.stderr = cappedAppend(fixture.stderr, chunk); });
    if (options.waitForReady !== false) await waitForReady(fixture, options.readyTimeoutMs);
    return fixture;
  } catch (error) {
    try {
      await stopChild(fixture.child);
      record.active = false;
      // A failed restart preserves pre-existing test state for reconciliation.
      if (!reused) safeRemoveRuntime(runtimeDir);
      else record.fixture = previousFixture;
    } catch (cleanupError) { error.cleanupError = cleanupError; }
    throw error;
  }
}

async function expectDaemonStartRejected(options = {}) {
  const fixture = await startDaemon({ ...options, waitForReady: false });
  try {
    const deadline = Date.now() + (options.timeoutMs || 2500);
    while (Date.now() < deadline && fixture.child.exitCode === null) {
      try {
        const response = await request(fixture, { path: "/health", timeoutMs: 150 });
        if (response.status === 200) {
          throw new Error("daemon accepted an invalid credential configuration");
        }
      } catch (error) {
        if (error.message === "daemon accepted an invalid credential configuration") throw error;
      }
      await pause(50);
    }
    if (fixture.child.exitCode === null) throw new Error("daemon did not reject invalid credential configuration");
    return { exitCode: fixture.child.exitCode, stderr: fixture.stderr };
  } finally {
    await fixture.stop();
  }
}

function commandEcho(command) {
  const owner = command && command.leaseOwner || {};
  return {
    id: command && command.id,
    executionId: command && command.executionId,
    leaseId: command && command.leaseId,
    panelConnectionId: owner.panelConnectionId,
    panelGeneration: owner.panelGeneration,
    contractVersion: command && command.contractVersion
  };
}

function assertReadOnlyProjectCommand(command) {
  if (!command || typeof command.script !== "string"
    || !command.script.includes("bitsPerChannel: project ? project.bitsPerChannel")) {
    throw new Error("Fake panel accepts only the scoped get_project_info read command.");
  }
}

async function pollPanel(fixture, options = {}) {
  const panelConnectionId = options.panelConnectionId || "network-panel";
  const panelGeneration = String(options.panelGeneration || "1");
  const query = new URLSearchParams({ panelConnectionId, panelGeneration });
  if (options.projectFile) query.set("projectFile", String(options.projectFile));
  return fixture.request({
    path: `/bridge/next?${query.toString()}`,
    token: options.token === undefined ? fixture.panelToken : options.token,
    headers: {
      "user-agent": "ae-agent-network-test-fake-panel/1",
      ...(options.origin !== undefined ? { origin: options.origin } : {}),
      ...(options.headers || {})
    }
  });
}

async function completeProjectInfoCommand(fixture, command, options = {}) {
  assertReadOnlyProjectCommand(command);
  const echo = commandEcho(command);
  const token = options.token === undefined ? fixture.panelToken : options.token;
  const submitted = await fixture.request({
    method: "POST",
    path: "/bridge/submitted",
    token,
    body: echo
  });
  const result = await fixture.request({
    method: "POST",
    path: "/bridge/result",
    token,
    body: {
      ...echo,
      ok: true,
      result: JSON.stringify({
        ok: true,
        result: {
          file: "C:\\Synthetic\\NetworkBoundary.aep",
          numItems: 1,
          activeItemName: "Synthetic"
        }
      })
    }
  });
  return { submitted, result };
}

function collectRuntimeText(fixture) {
  const chunks = [fixture.stdout, fixture.stderr];
  function walk(directory) {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.isFile() && fs.statSync(fullPath).size <= 2 * 1024 * 1024) {
        chunks.push(fs.readFileSync(fullPath, "utf8"));
      }
    }
  }
  walk(fixture.runtimeDir);
  return chunks.join("\n");
}

module.exports = {
  PROJECT_ROOT,
  collectRuntimeText,
  commandEcho,
  completeProjectInfoCommand,
  createRuntimeDirectory,
  expectDaemonStartRejected,
  isolatedEnvironment,
  pause,
  pollPanel,
  request,
  reserveLoopbackPort,
  safeRemoveRuntime,
  startDaemon,
  stopChild
};
