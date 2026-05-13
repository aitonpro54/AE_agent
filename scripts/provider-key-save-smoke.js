#!/usr/bin/env node
"use strict";

const childProcess = require("child_process");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const TOKEN = `provider-key-save-${Date.now()}`;
const GEMINI_MODEL = "gemini-2.5-flash";
const CLAUDE_MODEL = "claude-sonnet-4-20250514";

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && address.port;
      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
  });
}

function startJsonServer(handler) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let body = "";
      req.setEncoding("utf8");
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        try {
          handler(req, res, body);
        } catch (error) {
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: error.message || String(error) }));
        }
      });
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${server.address().port}`
      });
    });
  });
}

function writeJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function startGeminiServer() {
  return startJsonServer((req, res) => {
    if (req.method !== "GET" || req.url.split("?")[0] !== "/models") {
      writeJson(res, 404, { error: "not found" });
      return;
    }
    if (!req.headers["x-goog-api-key"]) {
      writeJson(res, 401, { error: "missing Gemini API key" });
      return;
    }
    writeJson(res, 200, {
      models: [
        {
          name: `models/${GEMINI_MODEL}`,
          baseModelId: GEMINI_MODEL,
          displayName: "Gemini 2.5 Flash",
          supportedGenerationMethods: ["generateContent"]
        }
      ]
    });
  });
}

function startClaudeServer() {
  return startJsonServer((req, res) => {
    if (req.method !== "GET" || req.url.split("?")[0] !== "/models") {
      writeJson(res, 404, { error: "not found" });
      return;
    }
    if (!req.headers["x-api-key"]) {
      writeJson(res, 401, { error: "missing Anthropic API key" });
      return;
    }
    writeJson(res, 200, {
      data: [
        {
          id: CLAUDE_MODEL,
          display_name: "Claude Sonnet 4"
        }
      ]
    });
  });
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          resolve({
            status: res.statusCode,
            body: body ? JSON.parse(body) : null
          });
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(2000, () => {
      req.destroy(new Error("HTTP timeout"));
    });
  });
}

async function waitForHealth(port, child, stderrLines) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Bridge exited before health check passed: ${stderrLines.slice(-20).join("\n")}`);
    }
    try {
      const response = await getJson(`http://127.0.0.1:${port}/health`);
      if (response.status === 200 && response.body && response.body.ok) return;
    } catch (_error) {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for temporary bridge: ${stderrLines.slice(-20).join("\n")}`);
}

function runNode(args, env) {
  return new Promise((resolve, reject) => {
    const child = childProcess.spawn(process.execPath, args, {
      cwd: PROJECT_ROOT,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const error = new Error(`Command failed with exit code ${code}`);
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });
  });
}

async function main() {
  const bridgePort = await getFreePort();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-ae-provider-key-save-"));
  const secretsFile = path.join(tempDir, "agent-secrets.json");
  const gemini = await startGeminiServer();
  const claude = await startClaudeServer();
  const bridgeStderr = [];
  const bridge = childProcess.spawn(process.execPath, [path.join(PROJECT_ROOT, "mcp-server", "bridge-daemon.js")], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      AE_BRIDGE_PORT: String(bridgePort),
      AE_BRIDGE_TOKEN: TOKEN,
      AE_AGENT_SECRETS_FILE: secretsFile,
      GEMINI_BASE_URL: gemini.baseUrl,
      GEMINI_API_KEY: "",
      GEMINI_MODEL,
      GEMINI_MODELS: GEMINI_MODEL,
      ANTHROPIC_BASE_URL: claude.baseUrl,
      ANTHROPIC_API_KEY: "",
      CLAUDE_MODEL,
      CLAUDE_MODELS: CLAUDE_MODEL
    },
    stdio: ["ignore", "ignore", "pipe"]
  });
  bridge.stderr.on("data", (chunk) => {
    bridgeStderr.push(chunk.toString());
    if (bridgeStderr.length > 50) bridgeStderr.shift();
  });

  try {
    await waitForHealth(bridgePort, bridge, bridgeStderr);
    const smoke = await runNode([path.join(PROJECT_ROOT, "scripts", "cep-panel-cdp-smoke.js"), "provider-key-save-smoke"], {
      CEP_PANEL_BRIDGE_URL: `http://127.0.0.1:${bridgePort}`,
      CEP_PANEL_BRIDGE_TOKEN: TOKEN,
      CEP_PANEL_ALLOW_KEY_SAVE_SMOKE: "1"
    });
    process.stdout.write(smoke.stdout);
    if (smoke.stderr) process.stderr.write(smoke.stderr);
  } finally {
    bridge.kill();
    gemini.server.close();
    claude.server.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
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
