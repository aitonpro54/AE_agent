"use strict";

const assert = require("assert");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { isolatedEnvironment } = require("./network-test-fixture");

function request(port, token, method, requestPath, body) {
  return new Promise((resolve, reject) => {
    const text = body === undefined ? "" : JSON.stringify(body);
    const req = http.request({
      host: "127.0.0.1",
      port,
      path: requestPath,
      method,
      timeout: 10000,
      headers: {
        "x-ae-bridge-token": token,
        ...(text ? { "content-type": "text/plain;charset=utf-8", "content-length": Buffer.byteLength(text) } : {})
      }
    }, (res) => {
      let responseText = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { responseText += chunk; });
      res.on("end", () => {
        let parsed = null;
        try { parsed = responseText ? JSON.parse(responseText) : {}; } catch (error) { reject(error); return; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("request timeout")));
    req.end(text || undefined);
  });
}

async function waitForBridge(port) {
  let lastError = null;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await request(port, "", "GET", "/health");
      if (response.status === 200) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw lastError || new Error("bridge did not start");
}

async function main() {
  const port = 43000 + Math.floor(Math.random() * 1500);
  const token = "usage-smoke-token";
  const panelToken = `${token}-panel`;
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "ae-agent-usage-bridge-"));
  const env = isolatedEnvironment(runtimeDir, { port, automationToken: token, panelToken, devAdmin: false, commandTimeoutMs: 10000 });
  env.CODEBURN_PATH = path.join(runtimeDir, "definitely-missing-codeburn.exe");
  const child = spawn(process.execPath, [path.join(__dirname, "..", "mcp-server", "bridge-daemon.js")], {
    cwd: path.join(__dirname, ".."),
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-4000); });
  try {
    await waitForBridge(port);
    const cold = await request(port, token, "GET", "/usage");
    assert.strictEqual(cold.status, 200);
    assert.strictEqual(cold.body.ok, true);
    assert.strictEqual(cold.body.usage.sources.native.status, "unavailable");
    assert.strictEqual(cold.body.usage.sources.codeburn.status, "unavailable");
    assert.strictEqual(cold.body.usage.aeAvailability.editingBlocked, false);

    const refresh = await request(port, panelToken, "POST", "/usage/refresh", { period: "week", includeQuota: false });
    assert.strictEqual(refresh.status, 200);
    assert.strictEqual(refresh.body.ok, true);
    assert.strictEqual(refresh.body.usage.sources.codeburn.status, "unavailable");
    assert.strictEqual(refresh.body.usage.sources.codeburn.error, "codeburn_exit_nonzero");
    assert.strictEqual(refresh.body.usage.aeAvailability.dependsOnCodeburn, false);

    const healthAfter = await request(port, "", "GET", "/health");
    assert.strictEqual(healthAfter.status, 200, "missing CodeBurn must not stop the AE bridge");
    console.log(JSON.stringify({ ok: true, checked: ["USG09", "USG15"], codeburnStatus: refresh.body.usage.sources.codeburn.status }, null, 2));
  } finally {
    child.kill();
    await new Promise((resolve) => {
      if (child.exitCode !== null) { resolve(); return; }
      child.once("close", resolve);
      setTimeout(resolve, 2000);
    });
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
  if (stderr && child.exitCode && child.exitCode !== 0) throw new Error(stderr);
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
