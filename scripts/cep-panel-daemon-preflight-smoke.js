"use strict";

const assert = require("assert");
const childProcess = require("child_process");
const http = require("http");
const net = require("net");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const CEP_PANEL_SMOKE = path.join(__dirname, "cep-panel-cdp-smoke.js");
const TOKEN = "daemon-preflight-smoke-token";

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && address.port;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

function requestJson(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: body ? JSON.parse(body) : null });
        } catch (error) {
          reject(error);
        }
      });
    });
    req.setTimeout(timeoutMs || 2000, () => {
      req.destroy(new Error(`HTTP timeout: ${url}`));
    });
    req.on("error", reject);
  });
}

function parseJsonOutput(stdout) {
  const trimmed = String(stdout || "").trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error(`Expected JSON stdout, got: ${trimmed.slice(0, 500)}`);
  }
  return JSON.parse(trimmed.slice(start, end + 1));
}

function runEnsureDaemonOnly(port, extraEnv) {
  return new Promise((resolve, reject) => {
    const child = childProcess.spawn(process.execPath, [CEP_PANEL_SMOKE, "ensure-daemon-only"], {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        CEP_PANEL_BRIDGE_URL: `http://127.0.0.1:${port}`,
        CEP_PANEL_BRIDGE_TOKEN: TOKEN,
        CEP_PANEL_ENSURE_DAEMON_TIMEOUT_MS: "12000",
        ...(extraEnv || {})
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("ensure-daemon-only timed out"));
    }, 20000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        const error = new Error(`ensure-daemon-only failed with exit code ${code}`);
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve(parseJsonOutput(stdout));
    });
  });
}

function stopStartedDaemon(pid) {
  if (!pid) return;
  try {
    process.kill(pid);
    return;
  } catch (_error) {}

  if (process.platform === "win32") {
    childProcess.spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true
    });
  }
}

async function assertPortHasNoBridge(port) {
  try {
    await requestJson(`http://127.0.0.1:${port}/health`, 750);
  } catch (_error) {
    return;
  }
  throw new Error(`Expected no bridge on port ${port}`);
}

async function main() {
  const startPort = await getFreePort();
  let startedPid = null;
  try {
    const ensured = await runEnsureDaemonOnly(startPort);
    startedPid = ensured.startedPid || null;

    assert.strictEqual(ensured.ok, true);
    assert.strictEqual(ensured.skipped, undefined);
    assert.strictEqual(ensured.health && ensured.health.ok, true);
    assert.strictEqual(Number(ensured.health.port), Number(startPort));

    const health = await requestJson(`http://127.0.0.1:${startPort}/health`, 2000);
    assert.strictEqual(health.status, 200);
    assert.strictEqual(health.body && health.body.ok, true);
    assert.strictEqual(Number(health.body.port), Number(startPort));
  } finally {
    stopStartedDaemon(startedPid);
  }

  const disabledPort = await getFreePort();
  const skipped = await runEnsureDaemonOnly(disabledPort, { CEP_PANEL_ENSURE_DAEMON: "0" });
  assert.strictEqual(skipped.ok, true);
  assert.strictEqual(skipped.skipped, true);
  await assertPortHasNoBridge(disabledPort);

  console.log(JSON.stringify({
    ok: true,
    startedPort: startPort,
    disabledPort
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error.message || String(error),
    stdout: error.stdout || "",
    stderr: error.stderr || ""
  }, null, 2));
  process.exit(1);
});
