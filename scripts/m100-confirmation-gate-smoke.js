"use strict";

const assert = require("assert");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const repoRoot = path.join(__dirname, "..");
const daemonPath = path.join(repoRoot, "mcp-server", "bridge-daemon.js");
const port = String(4550 + Math.floor(Math.random() * 1000));
const token = "m100-confirmation-gate-smoke";

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
      timeout: 15000
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
  for (let index = 0; index < 50; index += 1) {
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

function readOnlyPlan(summary) {
  return {
    summary: summary || "M100 confirmation read-only plan",
    risk: "low",
    requiresCheckpoint: false,
    steps: [
      {
        title: "Read bridge status",
        tool: "get_bridge_status",
        args: {}
      }
    ]
  };
}

function mutatingPlan() {
  return {
    summary: "M100 confirmation mutating plan",
    risk: "medium",
    requiresCheckpoint: false,
    steps: [
      {
        title: "Create temporary comp",
        tool: "create_test_comp",
        args: {
          name: "M100 Confirmation Smoke",
          width: 320,
          height: 180,
          duration: 1,
          frameRate: 24,
          openInViewer: false
        }
      }
    ]
  };
}

async function createProposal(options) {
  const response = await requestJson("POST", "/agents/plan/propose", Object.assign({
    requestId: `m100-confirm-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    plan: readOnlyPlan(),
    m100ConfirmationSurface: "cep-panel",
    m100ConfirmationSessionId: "smoke-session"
  }, options || {}));
  assert.strictEqual(response.status, 200, "proposal creation should succeed");
  assert.strictEqual(response.body.ok, true, "proposal response should be ok");
  assert(response.body.proposal && response.body.proposal.confirmation, "proposal should include confirmation metadata");
  assert(/^confirm_[a-f0-9]{48}$/.test(response.body.proposal.confirmation.confirmationToken), "proposal should include a server-issued confirmation token");
  return response.body.proposal;
}

function runBodyForProposal(proposal, overrides) {
  return Object.assign({
    actionId: proposal.actionId,
    payloadRef: proposal.action.payloadRef,
    payloadHash: proposal.action.payloadHash,
    previewHash: proposal.action.previewHash,
    riskLevel: proposal.risk.level,
    riskPolicyVersion: proposal.confirmation.riskPolicyVersion,
    confirmationToken: proposal.confirmation.confirmationToken,
    confirmedBySurface: proposal.confirmation.surface,
    confirmedBySession: proposal.confirmation.sessionId || "",
    requestId: proposal.requestId,
    dryRun: false,
    confirm: true
  }, overrides || {});
}

async function assertNoBridgeCommand(label) {
  const next = await requestJson("GET", `/bridge/next?panelConnectionId=${encodeURIComponent(label)}&panelGeneration=confirmation-smoke`);
  assert.strictEqual(next.status, 200, `${label}: bridge next should be readable`);
  assert.strictEqual(next.body.ok, true, `${label}: bridge next wrapper should be ok`);
  assert.strictEqual(next.body.command, null, `${label}: no AE command should be queued`);
}

async function assertConfirmedProposalSucceeds() {
  const proposal = await createProposal({
    requestId: "m100-confirm-success",
    plan: readOnlyPlan("Confirmed proposal succeeds")
  });
  const response = await requestJson("POST", "/agents/plan/run", runBodyForProposal(proposal));
  assert.strictEqual(response.status, 200, "confirmed proposal run should succeed");
  assert.strictEqual(response.body.ok, true, "confirmed proposal run response should be ok");
  assert(response.body.run && response.body.run.ok === true, "confirmed proposal run should be ok");
  assert.strictEqual(response.body.run.m100Action.confirmationState, "completed", "confirmed proposal should become completed");

  const replay = await requestJson("POST", "/agents/plan/run", runBodyForProposal(proposal));
  assert.strictEqual(replay.status, 400, "replayed confirmation should be rejected");
  assert.strictEqual(replay.body.ok, false, "replayed confirmation wrapper should be false");
  assert.strictEqual(replay.body.run.errorCode, "m100_confirmation_replayed", "replayed token should have a stable error code");
}

async function assertExpiredProposalRejected() {
  const proposal = await createProposal({
    requestId: "m100-confirm-expired",
    ttlMs: 25,
    plan: readOnlyPlan("Expired proposal rejected")
  });
  await wait(1200);
  const response = await requestJson("POST", "/agents/plan/run", runBodyForProposal(proposal));
  assert.strictEqual(response.status, 400, "expired proposal should be rejected");
  assert.strictEqual(response.body.ok, false, "expired proposal wrapper should be false");
  assert.strictEqual(response.body.code, "m100_action_proposal_expired", "expired proposal should have a stable error code");
}

async function assertMismatchesRejected() {
  const payloadProposal = await createProposal({
    requestId: "m100-confirm-payload-mismatch",
    plan: readOnlyPlan("Payload mismatch rejected")
  });
  const payloadMismatch = await requestJson("POST", "/agents/plan/run", runBodyForProposal(payloadProposal, {
    payloadHash: `sha256:${"0".repeat(64)}`
  }));
  assert.strictEqual(payloadMismatch.status, 400, "payload mismatch should be rejected");
  assert.strictEqual(payloadMismatch.body.code, "m100_payload_hash_mismatch", "payload mismatch should have a stable error code");

  const riskProposal = await createProposal({
    requestId: "m100-confirm-risk-mismatch",
    plan: readOnlyPlan("Risk mismatch rejected")
  });
  const riskMismatch = await requestJson("POST", "/agents/plan/run", runBodyForProposal(riskProposal, {
    riskLevel: "raw_jsx"
  }));
  assert.strictEqual(riskMismatch.status, 400, "risk mismatch should be rejected");
  assert.strictEqual(riskMismatch.body.run.errorCode, "m100_risk_level_mismatch", "risk mismatch should have a stable error code");

  const surfaceProposal = await createProposal({
    requestId: "m100-confirm-surface-mismatch",
    plan: readOnlyPlan("Surface mismatch rejected")
  });
  const surfaceMismatch = await requestJson("POST", "/agents/plan/run", runBodyForProposal(surfaceProposal, {
    confirmedBySurface: "mcp-client"
  }));
  assert.strictEqual(surfaceMismatch.status, 400, "surface mismatch should be rejected");
  assert.strictEqual(surfaceMismatch.body.run.errorCode, "m100_confirmation_surface_mismatch", "surface mismatch should have a stable error code");
}

async function assertNoProposalCannotRunMutatingPlan() {
  const response = await requestJson("POST", "/agents/plan/run", {
    requestId: "m100-confirm-no-proposal",
    plan: mutatingPlan(),
    dryRun: false,
    confirm: true,
    allowMutations: true,
    autoEditSession: true
  });
  assert.strictEqual(response.status, 400, "mutating run without proposal should be rejected");
  assert.strictEqual(response.body.ok, false, "mutating no-proposal wrapper should be false");
  assert.strictEqual(response.body.run.errorCode, "m100_confirmation_required", "mutating no-proposal should have a stable error code");
  assert.strictEqual(response.body.run.safety.status, "blocked_m100_confirmation_required", "mutating no-proposal should stop at the M100 gate");
  await assertNoBridgeCommand("mutating-no-proposal");
}

async function assertDirectToolConfirmationIgnored() {
  const response = await requestJson("POST", "/tools/call", {
    name: "run_extendscript",
    arguments: {
      script: "return 1;",
      confirm: true,
      confirmed: true,
      confirmationToken: "confirm_forged"
    }
  });
  assert.strictEqual(response.status, 200, "direct raw JSX block should stay an MCP tool result");
  assert.strictEqual(response.body.ok, true, "direct raw JSX wrapper should be ok");
  assert(response.body.result && response.body.result.isError === true, "direct raw JSX should be an error result");
  const payload = parseToolText(response.body.result);
  assert.strictEqual(payload.code, "proposal_required", "direct raw JSX should require a proposal");
  assert.strictEqual(payload.m100.ignoredClientConfirmation, true, "client confirmation should be ignored");
  await assertNoBridgeCommand("direct-raw-jsx");
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
    await waitForHealth();
    await assertConfirmedProposalSucceeds();
    await assertExpiredProposalRejected();
    await assertMismatchesRejected();
    await assertNoProposalCannotRunMutatingPlan();
    await assertDirectToolConfirmationIgnored();
    console.log(JSON.stringify({
      ok: true,
      checked: [
        "backend-created proposal includes a server-issued confirmation token",
        "confirmed proposal executes through the server-side action store",
        "confirmation token replay is rejected",
        "expired proposal is rejected",
        "payload hash mismatch is rejected",
        "risk mismatch is rejected",
        "confirmation surface mismatch is rejected",
        "mutating plan without a server-owned proposal is rejected before AE queueing",
        "direct raw JSX ignores forged client confirmation and stays proposal_required"
      ],
      pendingContracts: []
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
