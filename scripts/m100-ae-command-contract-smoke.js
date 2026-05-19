"use strict";

const assert = require("assert");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const repoRoot = path.join(__dirname, "..");
const daemonPath = path.join(repoRoot, "mcp-server", "bridge-daemon.js");
const port = String(3457 + Math.floor(Math.random() * 1000));
const token = "m100-ae-command-contract-smoke";
const strict = process.argv.includes("--strict") || process.env.M100_STRICT_CONTRACTS === "1";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestJson(method, requestPath, payload) {
  return new Promise((resolve, reject) => {
    const body = payload === undefined ? "" : JSON.stringify(payload);
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: requestPath,
      method,
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
        "x-ae-bridge-token": token
      },
      timeout: 5000
    }, (res) => {
      let responseBody = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        responseBody += chunk;
      });
      res.on("end", () => {
        try {
          resolve({
            status: res.statusCode || 0,
            body: responseBody ? JSON.parse(responseBody) : {}
          });
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on("timeout", () => {
      req.destroy(new Error(`Request timed out: ${method} ${requestPath}`));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function waitForHealth() {
  let lastError = null;
  for (let index = 0; index < 40; index += 1) {
    try {
      const response = await requestJson("GET", "/health");
      if (response.status === 200 && response.body.ok) return response;
    } catch (error) {
      lastError = error;
    }
    await wait(100);
  }
  throw new Error(`Bridge daemon did not become healthy: ${lastError ? lastError.message : "unknown error"}`);
}

function parseToolText(result) {
  assert(result && result.content && result.content[0], "Expected MCP-style tool content.");
  return JSON.parse(result.content[0].text);
}

async function assertDirectToolBlocked(name, args, expectedRiskLevel) {
  const response = await requestJson("POST", "/tools/call", {
    name,
    arguments: Object.assign({
      confirm: true,
      confirmed: true
    }, args || {})
  });
  assert.strictEqual(response.status, 200, `${name}: direct block should stay an MCP tool result.`);
  assert.strictEqual(response.body.ok, true, `${name}: /tools/call wrapper should be ok.`);
  assert(response.body.result && response.body.result.isError === true, `${name}: tool result should be an error.`);
  const payload = parseToolText(response.body.result);
  assert.strictEqual(payload.ok, false, `${name}: payload should be a structured failure.`);
  assert(["proposal_required", "unknown_tool_blocked"].includes(payload.code), `${name}: unexpected code ${payload.code}`);
  assert(payload.m100, `${name}: payload should include m100 policy details.`);
  assert.strictEqual(payload.m100.ignoredClientConfirmation, true, `${name}: client confirmation must be ignored.`);
  if (expectedRiskLevel) {
    assert.strictEqual(payload.m100.riskLevel, expectedRiskLevel, `${name}: unexpected risk level.`);
  }
  return payload;
}

function pendingContract(id, expected) {
  return {
    id,
    status: "pending",
    expected
  };
}

async function main() {
  const daemon = spawn(process.execPath, [daemonPath], {
    cwd: repoRoot,
    env: Object.assign({}, process.env, {
      AE_BRIDGE_PORT: port,
      AE_BRIDGE_TOKEN: token
    }),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  const stderr = [];
  daemon.stderr.setEncoding("utf8");
  daemon.stderr.on("data", (chunk) => stderr.push(chunk));

  try {
    const health = await waitForHealth();
    assert(health.body.m100RiskPolicy, "Health should expose the M100 risk policy summary.");
    assert.deepStrictEqual(
      health.body.m100RiskPolicy.riskLevels,
      ["read_only", "mutating", "destructive", "raw_jsx"],
      "M100 risk levels changed unexpectedly."
    );

    const statusCall = await requestJson("POST", "/tools/call", {
      name: "get_bridge_status",
      arguments: {}
    });
    assert.strictEqual(statusCall.status, 200, "Read-only direct tool should remain callable.");
    assert.strictEqual(statusCall.body.ok, true, "Read-only direct tool wrapper should be ok.");
    assert.strictEqual(statusCall.body.result.isError, false, "Read-only direct tool should not be blocked.");

    const rawBlock = await assertDirectToolBlocked("run_extendscript", {
      script: "return 1;",
      timeoutMs: 1000
    }, "raw_jsx");
    assert.strictEqual(rawBlock.code, "proposal_required", "Raw JSX should require a proposal.");

    await assertDirectToolBlocked("create_text_layer", {
      text: "M100 direct block",
      compItemIndex: 1
    }, "mutating");
    await assertDirectToolBlocked("m100_unknown_tool_fixture", {}, null);

    const next = await requestJson("GET", "/bridge/next");
    assert.strictEqual(next.status, 200, "Bridge next should be readable.");
    assert.strictEqual(next.body.ok, true, "Bridge next wrapper should be ok.");
    assert.strictEqual(next.body.command, null, "Blocked direct tools must not queue AE commands.");

    const pendingContracts = [
      pendingContract("timeout-before-delivery", "Queued commands expire before /bridge/next can lease them."),
      pendingContract("timeout-after-lease", "Leased commands report unknown_after_delivery instead of safe cancellation."),
      pendingContract("timeout-after-submit", "Submitted commands report timed_out_after_submit instead of safe cancellation."),
      pendingContract("late-result", "Late /bridge/result payloads are logged stale and ignored for active UI state."),
      pendingContract("concurrent-command", "Backend/CEP enforce one active evalScript submission per panel connection."),
      pendingContract("malformed-wrapper", "Empty or malformed wrapped AE output fails with ae_result_parse.")
    ];

    if (strict && pendingContracts.length) {
      throw new Error(`Pending M100 AE command contracts: ${pendingContracts.map((item) => item.id).join(", ")}`);
    }

    console.log(JSON.stringify({
      ok: true,
      checked: [
        "m100 risk policy health summary",
        "read-only /tools/call remains available",
        "direct raw JSX is proposal-blocked",
        "direct mutating typed tool is proposal-blocked",
        "unknown direct tool is default-denied",
        "blocked direct tools do not enqueue AE commands"
      ],
      pendingContracts
    }, null, 2));
  } catch (error) {
    if (stderr.length) {
      process.stderr.write(stderr.join("").slice(-4000));
    }
    throw error;
  } finally {
    daemon.kill();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
