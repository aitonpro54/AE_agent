"use strict";

const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const daemonPath = path.join(__dirname, "..", "mcp-server", "bridge-daemon.js");
const adapterPath = path.join(__dirname, "..", "mcp-server", "mcp-adapter.js");
const nodePath = process.execPath;
const port = String(3457 + Math.floor(Math.random() * 1000));
const token = "smoke-test-token";

function requestJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch (error) {
          reject(error);
        }
      });
    }).on("error", reject);
  });
}

function requestJsonWithOptions(options, payload) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: body ? JSON.parse(body) : {} });
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("error", reject);
    if (payload) req.write(JSON.stringify(payload));
    req.end();
  });
}

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
  const daemon = spawn(nodePath, [daemonPath], {
    env: {
      ...process.env,
      AE_BRIDGE_PORT: port,
      AE_BRIDGE_TOKEN: token
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  const daemonStderr = [];
  daemon.stderr.setEncoding("utf8");
  daemon.stderr.on("data", (chunk) => daemonStderr.push(chunk));

  await wait(500);

  const adapter = spawn(nodePath, [adapterPath], {
    env: {
      ...process.env,
      AE_BRIDGE_PORT: port,
      AE_BRIDGE_TOKEN: token
    },
    stdio: ["pipe", "pipe", "pipe"]
  });

  const stdout = [];
  const adapterStderr = [];

  adapter.stdout.setEncoding("utf8");
  adapter.stderr.setEncoding("utf8");
  adapter.stdout.on("data", (chunk) => stdout.push(chunk));
  adapter.stderr.on("data", (chunk) => adapterStderr.push(chunk));

  adapter.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "smoke-test", version: "0.0.0" }
    }
  }) + "\n");

  adapter.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {}
  }) + "\n");

  await wait(250);

  adapter.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "list_comps",
      arguments: {}
    }
  }) + "\n");

  const next = await requestJsonWithOptions({
    hostname: "127.0.0.1",
    port,
    path: "/bridge/next",
    method: "GET",
    headers: {
      "x-ae-bridge-token": token
    }
  });

  if (!next.body.command || !next.body.command.id || !next.body.command.script) {
    throw new Error("Expected pending AE command from bridge");
  }

  await requestJsonWithOptions({
    hostname: "127.0.0.1",
    port,
    path: "/bridge/result",
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ae-bridge-token": token
    }
  }, {
    id: next.body.command.id,
    ok: true,
    result: JSON.stringify({
      ok: true,
      result: [{ itemIndex: 1, name: "Smoke Comp", width: 1920, height: 1080 }]
    })
  });

  await waitForResponse(stdout, 3, 2000);

  const health = await requestJson(`http://127.0.0.1:${port}/health`);
  adapter.kill();
  daemon.kill();

  const lines = stdout.join("").trim().split(/\n+/).filter(Boolean).map((line) => JSON.parse(line));

  if (lines.length < 3) {
    throw new Error("Expected initialize, tools/list, and tool call responses");
  }

  if (!health.body.ok || health.body.server !== "codex-ae-mcp-bridge" || health.body.version !== "0.8.0") {
    throw new Error("Unexpected health response");
  }

  console.log(JSON.stringify({
    ok: true,
    responses: lines.length,
    tools: lines[1].result.tools.map((tool) => tool.name),
    listCompsResult: lines[2].result.content[0].text,
    health: health.body,
    adapterLogs: adapterStderr.join("").trim().split(/\n+/).filter(Boolean),
    daemonLogs: daemonStderr.join("").trim().split(/\n+/).filter(Boolean)
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
