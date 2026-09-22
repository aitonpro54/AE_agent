"use strict";

// Isolated loopback fixture for bridge HTTP-boundary tests. It never launches
// After Effects, CEP, a provider, or the production bridge port.
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const DAEMON_PATH = path.join(PROJECT_ROOT, "mcp-server", "bridge-daemon.js");
const FIXTURE_PREFIX = "ae-agent-network-boundary-";
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    if (/^(AE_|CODEBURN|OPENAI|ANTHROPIC|CLAUDE|GEMINI|GOOGLE|OPENROUTER|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY)/i.test(key)) {
      delete env[key];
    }
  }

  const logDir = path.join(runtimeDir, "logs");
  const settingsDir = path.join(runtimeDir, "settings");
  const stateDir = path.join(runtimeDir, "state");
  const backupDir = path.join(runtimeDir, "backups");
  for (const directory of [logDir, settingsDir, stateDir, backupDir]) fs.mkdirSync(directory, { recursive: true });

  Object.assign(env, {
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
    if (fixture.child.exitCode !== null) {
      throw new Error(`daemon exited before readiness (${fixture.child.exitCode}): ${fixture.stderr.trim()}`);
    }
    try {
      const response = await request(fixture, { path: "/health", timeoutMs: 300 });
      if (response.status === 200 && response.body && response.body.ok === true) return response;
    } catch (error) {
      lastError = error;
    }
    await pause(50);
  }
  throw lastError || new Error(`daemon did not become ready: ${fixture.stderr.trim()}`);
}

async function stopChild(child, timeoutMs = 2000) {
  if (!child || child.exitCode !== null) return;
  child.kill();
  await Promise.race([
    new Promise((resolve) => child.once("close", resolve)),
    pause(timeoutMs)
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

function safeRemoveRuntime(runtimeDir) {
  const resolved = path.resolve(runtimeDir);
  const expectedRoot = path.resolve(os.tmpdir()) + path.sep;
  if (!resolved.startsWith(expectedRoot) || !path.basename(resolved).startsWith(FIXTURE_PREFIX)) {
    throw new Error(`Refusing to remove unexpected fixture directory: ${resolved}`);
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

function reuseFixtureRuntime(runtimeDir) {
  const resolved = path.resolve(runtimeDir);
  const expectedRoot = path.resolve(os.tmpdir()) + path.sep;
  if (!resolved.startsWith(expectedRoot) || !path.basename(resolved).startsWith(FIXTURE_PREFIX)) {
    throw new Error(`Refusing to reuse unexpected fixture directory: ${resolved}`);
  }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`Reusable fixture directory does not exist: ${resolved}`);
  }
  return resolved;
}

async function startDaemon(options = {}) {
  const port = options.port || await reserveLoopbackPort();
  const runtimeDir = options.runtimeDir
    ? reuseFixtureRuntime(options.runtimeDir)
    : fs.mkdtempSync(path.join(os.tmpdir(), FIXTURE_PREFIX));
  const env = isolatedEnvironment(runtimeDir, { ...options, port });
  const fixture = {
    port,
    runtimeDir,
    automationToken: options.automationToken,
    panelToken: options.panelToken,
    adminToken: options.adminToken,
    stdout: "",
    stderr: "",
    child: null,
    request(optionsForRequest) { return request(fixture, optionsForRequest); },
    abort(optionsForAbort) { return abortPartialRequest(fixture, optionsForAbort); },
    async stop(cleanup = true) {
      await stopChild(fixture.child);
      if (cleanup) safeRemoveRuntime(runtimeDir);
    }
  };
  if (typeof options.setupRuntime === "function") {
    try {
      await options.setupRuntime(runtimeDir);
    } catch (error) {
      safeRemoveRuntime(runtimeDir);
      throw error;
    }
  }
  fixture.child = spawn(process.execPath, [DAEMON_PATH], {
    cwd: PROJECT_ROOT,
    env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  fixture.child.stdout.setEncoding("utf8");
  fixture.child.stderr.setEncoding("utf8");
  fixture.child.stdout.on("data", (chunk) => { fixture.stdout = cappedAppend(fixture.stdout, chunk); });
  fixture.child.stderr.on("data", (chunk) => { fixture.stderr = cappedAppend(fixture.stderr, chunk); });
  if (options.waitForReady !== false) await waitForReady(fixture, options.readyTimeoutMs);
  return fixture;
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
