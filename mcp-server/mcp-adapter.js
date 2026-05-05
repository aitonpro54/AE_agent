#!/usr/bin/env node
"use strict";

const http = require("http");
const readline = require("readline");
const path = require("path");
const { spawn } = require("child_process");

const SERVER_NAME = "codex-ae-mcp-adapter";
const SERVER_VERSION = "0.5.2";
const PROTOCOL_VERSION = "2025-03-26";
const DAEMON_HOST = process.env.AE_BRIDGE_HOST || "127.0.0.1";
const DAEMON_PORT = Number(process.env.AE_BRIDGE_PORT || 3456);
const TOKEN = process.env.AE_BRIDGE_TOKEN || "codex-ae-local";
const DAEMON_TIMEOUT_MS = Number(process.env.AE_DAEMON_HTTP_TIMEOUT_MS || 125000);
const DAEMON_START_TIMEOUT_MS = Number(process.env.AE_DAEMON_START_TIMEOUT_MS || 8000);
const AUTO_START_DAEMON = process.env.AE_DAEMON_AUTO_START !== "0";

let daemonEnsurePromise = null;

function log(message) {
  process.stderr.write(`[${SERVER_NAME}] ${message}\n`);
}

function sendRpc(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function ok(id, result) {
  sendRpc({ jsonrpc: "2.0", id, result });
}

function err(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  sendRpc({ jsonrpc: "2.0", id, error });
}

function toolResult(text, isError) {
  return {
    content: [{ type: "text", text: typeof text === "string" ? text : JSON.stringify(text, null, 2) }],
    isError: Boolean(isError)
  };
}

function daemonRequest(method, requestPath, payload, timeoutMs) {
  return new Promise((resolve, reject) => {
    const body = payload === undefined ? "" : JSON.stringify(payload);
    const req = http.request({
      hostname: DAEMON_HOST,
      port: DAEMON_PORT,
      path: requestPath,
      method,
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
        "x-ae-bridge-token": TOKEN
      },
      timeout: timeoutMs || DAEMON_TIMEOUT_MS
    }, (res) => {
      let responseBody = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        responseBody += chunk;
      });
      res.on("end", () => {
        let parsed = {};
        try {
          parsed = responseBody ? JSON.parse(responseBody) : {};
        } catch (error) {
          reject(new Error(`Bridge daemon returned invalid JSON from ${requestPath}: ${error.message}`));
          return;
        }
        resolve({ status: res.statusCode || 0, body: parsed });
      });
    });

    req.on("timeout", () => {
      req.destroy(new Error(`Bridge daemon request timed out after ${timeoutMs || DAEMON_TIMEOUT_MS}ms`));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function getDaemonHealth(timeoutMs) {
  const response = await daemonRequest("GET", "/health", undefined, timeoutMs || 1200);
  if (response.status !== 200 || !response.body.ok) {
    throw new Error(response.body.error || `Bridge daemon health failed with HTTP ${response.status}`);
  }
  return response.body;
}

function startDaemonDetached() {
  const daemonPath = path.join(__dirname, "bridge-daemon.js");
  const child = spawn(process.execPath, [daemonPath], {
    cwd: path.resolve(__dirname, ".."),
    detached: true,
    env: {
      ...process.env,
      AE_BRIDGE_HOST: DAEMON_HOST,
      AE_BRIDGE_PORT: String(DAEMON_PORT),
      AE_BRIDGE_TOKEN: TOKEN
    },
    stdio: "ignore",
    windowsHide: true
  });
  child.unref();
  log(`Started bridge daemon process ${child.pid} at http://${DAEMON_HOST}:${DAEMON_PORT}`);
}

async function waitForDaemon(timeoutMs) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      return await getDaemonHealth(1200);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  throw new Error(`Bridge daemon did not become healthy after ${timeoutMs}ms: ${lastError ? lastError.message : "unknown error"}`);
}

async function ensureDaemonRunning() {
  if (daemonEnsurePromise) return daemonEnsurePromise;

  daemonEnsurePromise = (async () => {
    try {
      return await getDaemonHealth(1200);
    } catch (firstError) {
      if (!AUTO_START_DAEMON) {
        throw firstError;
      }

      log(`Bridge daemon is not reachable; auto-starting it. Reason: ${firstError.message}`);
      startDaemonDetached();
      return await waitForDaemon(DAEMON_START_TIMEOUT_MS);
    }
  })();

  try {
    return await daemonEnsurePromise;
  } finally {
    daemonEnsurePromise = null;
  }
}

async function getTools() {
  await ensureDaemonRunning();
  const response = await daemonRequest("GET", "/tools", undefined, 5000);
  if (response.status !== 200 || !response.body.ok || !Array.isArray(response.body.tools)) {
    throw new Error(response.body.error || `Bridge daemon tools endpoint failed with HTTP ${response.status}`);
  }
  return response.body.tools;
}

async function callDaemonTool(name, args) {
  await ensureDaemonRunning();
  const response = await daemonRequest("POST", "/tools/call", {
    name,
    arguments: args || {}
  });

  if (response.status !== 200 || !response.body.ok || !response.body.result) {
    throw new Error(response.body.error || `Bridge daemon tool call failed with HTTP ${response.status}`);
  }

  return response.body.result;
}

async function handleRpc(message) {
  if (!message || message.jsonrpc !== "2.0") return;
  const id = message.id;

  try {
    if (message.method === "initialize") {
      ok(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: SERVER_NAME,
          version: SERVER_VERSION
        }
      });
      return;
    }

    if (message.method === "tools/list") {
      ok(id, { tools: await getTools() });
      return;
    }

    if (message.method === "tools/call") {
      const params = message.params || {};
      try {
        ok(id, await callDaemonTool(params.name, params.arguments || {}));
      } catch (error) {
        ok(id, toolResult(`Bridge daemon is not reachable or rejected the tool call: ${error.message}`, true));
      }
      return;
    }

    if (message.method === "notifications/initialized" || id === undefined || id === null) {
      return;
    }

    err(id, -32601, `Method not found: ${message.method}`);
  } catch (error) {
    err(id, -32000, error.message || String(error), {
      stack: error.stack
    });
  }
}

function startStdioMcp() {
  log(`Using bridge daemon at http://${DAEMON_HOST}:${DAEMON_PORT}`);
  ensureDaemonRunning()
    .then((health) => {
      log(`Bridge daemon ready: ${health.server || "unknown"} ${health.version || "unknown"}`);
    })
    .catch((error) => {
      log(`Bridge daemon is not ready yet: ${error.message}`);
    });

  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity
  });

  rl.on("line", (line) => {
    if (!line.trim()) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch (parseError) {
      log(`Bad JSON-RPC message: ${parseError.message}`);
      return;
    }

    if (Array.isArray(message)) {
      for (const item of message) {
        handleRpc(item);
      }
      return;
    }

    handleRpc(message);
  });

  rl.on("close", () => {
    log("stdin closed");
    process.exit(0);
  });
}

startStdioMcp();
