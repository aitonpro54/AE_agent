"use strict";

const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const daemonPath = path.join(__dirname, "..", "mcp-server", "bridge-daemon.js");
const nodePath = process.execPath;
const port = String(4450 + Math.floor(Math.random() * 1000));
const token = "bridge-only-smoke-test-token";

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

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const child = spawn(nodePath, [daemonPath], {
    env: {
      ...process.env,
      AE_BRIDGE_PORT: port,
      AE_BRIDGE_TOKEN: token
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  const stderr = [];
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => stderr.push(chunk));

  await wait(500);
  const health = await requestJson(`http://127.0.0.1:${port}/health`);
  child.kill();

  if (!health.body.ok || health.body.version !== "0.10.0") {
    throw new Error("Unexpected daemon health response");
  }

  console.log(JSON.stringify({
    ok: true,
    health: health.body,
    logs: stderr.join("").trim().split(/\n+/).filter(Boolean)
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
