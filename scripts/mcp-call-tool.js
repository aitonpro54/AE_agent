"use strict";

const path = require("path");
const { spawn } = require("child_process");

const serverPath = path.join(__dirname, "..", "mcp-server", "server.js");
const nodePath = process.execPath;
const toolName = process.argv[2] || "get_bridge_status";
const args = process.argv[3] ? JSON.parse(process.argv[3]) : {};
const port = process.env.AE_BRIDGE_PORT || "3456";
const token = process.env.AE_BRIDGE_TOKEN || "codex-ae-local";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForResponse(stdout, id, timeoutMs) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      const lines = stdout.join("").trim().split(/\n+/).filter(Boolean);
      for (const line of lines) {
        const message = JSON.parse(line);
        if (message.id === id) {
          clearInterval(timer);
          resolve(message);
          return;
        }
      }

      if (Date.now() - startedAt > timeoutMs) {
        clearInterval(timer);
        reject(new Error("Timed out waiting for JSON-RPC response " + id));
      }
    }, 25);
  });
}

async function main() {
  const child = spawn(nodePath, [serverPath], {
    env: {
      ...process.env,
      AE_BRIDGE_PORT: port,
      AE_BRIDGE_TOKEN: token,
      AE_COMMAND_TIMEOUT_MS: process.env.AE_COMMAND_TIMEOUT_MS || "120000"
    },
    stdio: ["pipe", "pipe", "pipe"]
  });

  const stdout = [];
  const stderr = [];
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));

  await wait(500);

  child.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "manual-mcp-call", version: "0.0.0" }
    }
  }) + "\n");

  await waitForResponse(stdout, 1, 3000);

  child.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    method: "notifications/initialized",
    params: {}
  }) + "\n");

  await wait(1000);

  child.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: toolName,
      arguments: args
    }
  }) + "\n");

  const response = await waitForResponse(stdout, 2, 10000);
  child.kill();

  console.log(JSON.stringify({
    ok: !response.error,
    response,
    logs: stderr.join("").trim().split(/\n+/).filter(Boolean)
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
