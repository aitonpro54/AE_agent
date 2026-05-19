"use strict";

const assert = require("assert");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const repoRoot = path.join(__dirname, "..");
const daemonPath = path.join(repoRoot, "mcp-server", "bridge-daemon.js");
const aiAgentsPath = path.join(repoRoot, "mcp-server", "ai-agents.js");
const protocol = require(path.join(repoRoot, "mcp-server", "m100-protocol"));
const port = String(5650 + Math.floor(Math.random() * 1000));
const token = "m100-lifecycle-diagnostics-smoke";

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

function assertRedacted(text, label) {
  assert(!String(text).includes("C:\\Users\\Ant"), `${label}: Windows user path leaked`);
  assert(!String(text).includes("Bearer abcdefghijklmnopqrst"), `${label}: bearer token leaked`);
  assert(!String(text).includes("secret prompt fragment"), `${label}: prompt fragment leaked`);
}

function assertDiagnostic(value, phase, code, label) {
  assert(value, `${label}: diagnostic should exist`);
  assert.strictEqual(value.phase, phase, `${label}: unexpected phase`);
  assert.strictEqual(value.code, code, `${label}: unexpected code`);
  assert(value.message, `${label}: diagnostic should include a message`);
  assertRedacted(JSON.stringify(value), label);
}

function readOnlyPlan(summary) {
  return {
    summary: summary || "M100 lifecycle diagnostics read-only plan",
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

async function createProposal() {
  const response = await requestJson("POST", "/agents/plan/propose", {
    requestId: "m100-diagnostics-confirmation",
    plan: readOnlyPlan("Confirmation diagnostic plan"),
    m100ConfirmationSurface: "cep-panel",
    m100ConfirmationSessionId: "diagnostics-session"
  });
  assert.strictEqual(response.status, 200, "proposal should be created");
  assert(response.body.proposal, "proposal response should include proposal");
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

async function waitForInflightCommand(label) {
  for (let index = 0; index < 40; index += 1) {
    const response = await requestJson("GET", "/dev/status");
    assert.strictEqual(response.status, 200, `${label}: status should be readable`);
    const commands = Array.isArray(response.body.inflightCommands) ? response.body.inflightCommands : [];
    const command = commands.find((item) => item.lifecycleState === "queued");
    if (command) return command;
    await wait(25);
  }
  throw new Error(`${label}: did not observe queued command`);
}

async function leaseAndSubmit(label) {
  const next = await requestJson("GET", `/bridge/next?panelConnectionId=diagnostics-panel&panelGeneration=${encodeURIComponent(label)}`);
  assert.strictEqual(next.status, 200, `${label}: bridge next should succeed`);
  assert(next.body.command && next.body.command.id, `${label}: command should lease`);
  const submitted = await requestJson("POST", "/bridge/submitted", {
    id: next.body.command.id,
    panelConnectionId: "diagnostics-panel",
    panelGeneration: label
  });
  assert.strictEqual(submitted.status, 200, `${label}: submit should succeed`);
  return next.body.command.id;
}

async function assertProtocolValidationDiagnostic() {
  const response = await requestJson("POST", "/agents/plan/propose", {
    requestId: "m100-diagnostics-invalid-plan",
    plan: {
      summary: "Invalid diagnostic plan",
      risk: "low",
      requiresCheckpoint: false,
      steps: [
        {
          title: "Unknown tool",
          tool: "m100_missing_diagnostic_tool",
          args: {
            path: "C:\\Users\\Ant\\Documents\\Codex\\AE_agent\\secret.aep"
          }
        }
      ]
    }
  });
  assert.strictEqual(response.status, 400, "invalid plan proposal should fail");
  assertDiagnostic(response.body.diagnostic, "protocol_validation", "m100_agent_plan_not_valid", "protocol validation");
  assert(response.body.m100Message && response.body.m100Message.error, "protocol validation should include M100 error envelope");
}

async function assertConfirmationDiagnostic() {
  const proposal = await createProposal();
  const response = await requestJson("POST", "/agents/plan/run", runBodyForProposal(proposal, {
    confirmationToken: `confirm_${"0".repeat(48)}`
  }));
  assert.strictEqual(response.status, 400, "confirmation mismatch should fail");
  assert(response.body.run && response.body.run.diagnostic, "failed run should include a run diagnostic");
  assertDiagnostic(response.body.run.diagnostic, "confirmation_validation", "m100_confirmation_token_mismatch", "confirmation validation");
  assert.strictEqual(response.body.run.diagnostic.actionId, proposal.actionId, "confirmation diagnostic should include action id");
  assert(response.body.run.diagnostic.executionId, "confirmation diagnostic should include execution id");
}

async function assertAeParseDiagnostic() {
  const run = requestJson("POST", "/dev/tool/run_extendscript", {
    script: "return 'diagnostics parse';",
    timeoutMs: 5000,
    verifyAfter: false
  });
  await waitForInflightCommand("AE parse diagnostic");
  const commandId = await leaseAndSubmit("ae-parse-diagnostic");
  await requestJson("POST", "/bridge/result", {
    id: commandId,
    ok: true,
    result: "not json C:\\Users\\Ant\\Documents\\Codex\\AE_agent\\private.aep Bearer abcdefghijklmnopqrst",
    error: null
  });
  const response = await run;
  assert.strictEqual(response.status, 500, "malformed AE wrapper should fail");
  assertDiagnostic(response.body.diagnostic, "ae_result_parse", "ae_result_parse_failed", "AE parse");
  assert.strictEqual(response.body.diagnostic.commandId, commandId, "AE parse diagnostic should include command id");
  assert(response.body.diagnostic.rawPreview, "AE parse diagnostic should include redacted raw preview");
}

function assertProtocolRedactionHelpers() {
  const bridgeSource = fs.readFileSync(daemonPath, "utf8");
  const aiAgentsSource = fs.readFileSync(aiAgentsPath, "utf8");
  [
    "provider_readiness",
    "model_timeout",
    "codex_nonzero_exit",
    "codex_no_assistant_text",
    "codex_malformed_jsonl",
    "confirmation_validation",
    "ae_queue",
    "ae_execution",
    "ae_result_parse"
  ].forEach((marker) => {
    assert(bridgeSource.includes(marker) || aiAgentsSource.includes(marker), `Missing diagnostic marker ${marker}`);
  });

  const source = [
    "User request: secret prompt fragment that should not be shown in the panel diagnostic.",
    "stderr at C:\\Users\\Ant\\Documents\\Codex\\AE_agent\\private.aep",
    "Authorization: Bearer abcdefghijklmnopqrst"
  ].join("\n");
  const redacted = protocol.redactForUserDiagnostic(source, 160);
  assert(redacted.length <= 160, "redacted diagnostic should be bounded");
  assertRedacted(redacted, "protocol helper");

  const envelope = protocol.createErrorEnvelope({
    requestId: "req_diagnostics",
    actionId: "act_diagnostics",
    executionId: "exec_diagnostics",
    phase: "ae_result_parse",
    code: "ae_result_parse_failed",
    error: source,
    rawPreview: source,
    logs: [
      {
        phase: "ae_result_parse",
        level: "error",
        message: source,
        logRef: "C:\\Users\\Ant\\Documents\\Codex\\AE_agent\\logs\\bridge.log"
      }
    ]
  });
  assert.strictEqual(envelope.messageType, "error", "error envelope should be an M100 error");
  assert.strictEqual(envelope.error.phase, "ae_result_parse", "error envelope should preserve phase");
  assert.strictEqual(envelope.error.code, "ae_result_parse_failed", "error envelope should preserve code");
  assertRedacted(JSON.stringify(envelope), "error envelope");
}

async function main() {
  assertProtocolRedactionHelpers();

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
    await assertProtocolValidationDiagnostic();
    await assertConfirmationDiagnostic();
    await assertAeParseDiagnostic();
    console.log(JSON.stringify({
      ok: true,
      checked: [
        "redactForUserDiagnostic redacts paths, bearer tokens and prompt fragments with length caps",
        "M100 error envelopes redact diagnostic message, rawPreview and logRef",
        "provider readiness, model timeout, Codex non-zero/no-assistant/malformed JSONL and AE failure codes are explicitly mapped",
        "invalid backend proposal creation reports protocol_validation with stable code",
        "confirmation token mismatch reports confirmation_validation with request/action/execution ids",
        "malformed AE wrapper output reports ae_result_parse with command id and redacted preview"
      ],
      pendingContracts: []
    }, null, 2));
  } catch (error) {
    if (stderr.length) process.stderr.write(stderr.join("").slice(-4000));
    throw error;
  } finally {
    daemon.kill();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
