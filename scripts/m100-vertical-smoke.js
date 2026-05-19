"use strict";

const assert = require("assert");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const repoRoot = path.join(__dirname, "..");
const daemonPath = path.join(repoRoot, "mcp-server", "bridge-daemon.js");
const panelPath = path.join(repoRoot, "cep-panel", "panel.js");
const protocol = require(path.join(repoRoot, "mcp-server", "m100-protocol"));
const port = String(6650 + Math.floor(Math.random() * 1000));
const token = "m100-vertical-smoke";
const fakeProjectPath = path.join(repoRoot, "backups", "m100-vertical-fake-project.aep");
const panelConnectionId = "m100-vertical-panel";

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

async function waitForInflightCommand(label, predicate) {
  let lastStatus = null;
  for (let index = 0; index < 60; index += 1) {
    const response = await requestJson("GET", "/dev/status");
    assert.strictEqual(response.status, 200, `${label}: status request should succeed`);
    lastStatus = response.body;
    const commands = Array.isArray(response.body.inflightCommands) ? response.body.inflightCommands : [];
    const match = commands.find(predicate || (() => true));
    if (match) return match;
    await wait(25);
  }
  throw new Error(`${label}: did not observe expected command. Last status: ${JSON.stringify(lastStatus && lastStatus.inflightCommands)}`);
}

function assertRedacted(text, label) {
  assert(!String(text).includes("C:\\Users\\Ant"), `${label}: Windows path leaked`);
  assert(!String(text).includes("Bearer abcdefghijklmnopqrst"), `${label}: bearer token leaked`);
  assert(!String(text).includes("secret prompt fragment"), `${label}: prompt fragment leaked`);
}

function createFakePanelFlow(prompt) {
  const requestId = `req_vertical_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  return {
    prompt,
    requestId,
    status: "preparing_agent_task",
    transcript: [],
    controls: []
  };
}

function panelCanRenderControls(value) {
  const proposal = value && value.m100ActionProposal ? value.m100ActionProposal : value;
  return protocol.isBackendActionProposalEnvelope(proposal);
}

function applyFakePanelMessage(panel, message) {
  assert(message && message.protocolVersion === protocol.M100_PROTOCOL_VERSION, "panel message must be an M100 envelope");
  assert.strictEqual(message.requestId, panel.requestId, "panel message requestId should match the active prompt");
  if (message.messageType === "assistant_response") {
    panel.status = message.status === "agent_response_ready" ? "agent_response_ready" : "completed";
    panel.transcript.push({ type: "assistant", summary: message.summary });
    assert.strictEqual(panel.controls.length, 0, "assistant text must not create executable controls");
    return;
  }
  if (message.messageType === "action_proposal") {
    assert(panelCanRenderControls(message), "valid backend proposal should render controls");
    panel.status = "awaiting_confirmation";
    panel.controls = [{ actionId: message.actionId, payloadRef: message.action.payloadRef }];
    panel.transcript.push({ type: "proposal", actionId: message.actionId, summary: message.summary });
    return;
  }
  if (message.messageType === "action_result") {
    panel.status = "completed";
    panel.transcript.push({ type: "result", actionId: message.actionId, executionId: message.executionId, summary: message.summary });
    panel.controls = [];
    return;
  }
  if (message.messageType === "error") {
    panel.status = "failed";
    panel.transcript.push({ type: "error", actionId: message.actionId, executionId: message.executionId, summary: message.summary });
    panel.controls = [];
    return;
  }
  throw new Error(`Unsupported fake panel message: ${message.messageType}`);
}

function verticalPlan(label) {
  return {
    summary: `${label} M100 vertical fake AE plan`,
    risk: "medium",
    requiresCheckpoint: true,
    steps: [
      {
        title: "Checkpoint fake saved project",
        tool: "checkpoint_project",
        args: {
          label: `${label}-m100-vertical`
        }
      },
      {
        title: "Create fake M100 test comp",
        tool: "create_test_comp",
        args: {
          name: `${label} M100 Vertical Fake Comp`,
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

function fakeProjectSummary(label) {
  return {
    name: `${label}.aep`,
    file: fakeProjectPath,
    bitsPerChannel: 8,
    numItems: 0,
    activeItem: null
  };
}

function fakeCreateCompResult(label) {
  return {
    itemIndex: 1,
    name: `${label} M100 Vertical Fake Comp`,
    width: 320,
    height: 180,
    duration: 1,
    frameRate: 24,
    numLayers: 0
  };
}

function fakeVerificationResult(label) {
  return {
    checkedAt: new Date().toUTCString(),
    project: {
      numItems: 1,
      file: fakeProjectPath,
      activeItem: {
        itemIndex: 1,
        name: `${label} M100 Vertical Fake Comp`,
        typeName: "CompItem"
      }
    },
    target: {
      compItemIndex: 1,
      compName: `${label} M100 Vertical Fake Comp`,
      layerIndex: null,
      layerName: "",
      itemIndex: 1,
      itemName: `${label} M100 Vertical Fake Comp`
    },
    comp: fakeCreateCompResult(label),
    layer: null,
    sameNameLayerCount: 0,
    sameNameLayers: []
  };
}

function wrapperResult(result) {
  return {
    ok: true,
    result: JSON.stringify({
      ok: true,
      result
    }),
    error: null
  };
}

async function leaseAndSubmitNextCommand(label, ownerGeneration) {
  const panelGeneration = ownerGeneration || label.replace(/[^a-z0-9_-]+/gi, "-");
  const next = await requestJson("GET", `/bridge/next?panelConnectionId=${encodeURIComponent(panelConnectionId)}&panelGeneration=${encodeURIComponent(panelGeneration)}`);
  assert.strictEqual(next.status, 200, `${label}: bridge next should succeed`);
  assert(next.body.command && next.body.command.id, `${label}: expected a leased command`);
  const submitted = await requestJson("POST", "/bridge/submitted", {
    id: next.body.command.id,
    panelConnectionId,
    panelGeneration
  });
  assert.strictEqual(submitted.status, 200, `${label}: submitted marker should be accepted`);
  assert.strictEqual(submitted.body.lifecycleState, "submitted", `${label}: command should be submitted`);
  return {
    id: next.body.command.id,
    panelGeneration
  };
}

async function postBridgeResult(label, commandId, payload) {
  const response = await requestJson("POST", "/bridge/result", Object.assign({ id: commandId }, payload));
  assert.strictEqual(response.status, 200, `${label}: bridge result should be acknowledged`);
  assert.strictEqual(response.body.ok, true, `${label}: bridge result wrapper should be ok`);
  return response;
}

async function completeNextAeCommand(label, result, ownerGeneration) {
  await waitForInflightCommand(`${label} queued`, (command) => command.lifecycleState === "queued");
  const command = await leaseAndSubmitNextCommand(label, ownerGeneration);
  await postBridgeResult(label, command.id, wrapperResult(result));
  return command.id;
}

async function failNextAeCommand(label, payload, ownerGeneration) {
  await waitForInflightCommand(`${label} queued`, (command) => command.lifecycleState === "queued");
  const command = await leaseAndSubmitNextCommand(label, ownerGeneration);
  await postBridgeResult(label, command.id, payload);
  return command.id;
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
    confirm: true,
    allowMutations: true
  }, overrides || {});
}

async function createProposalFromPrompt(panel, plan) {
  const response = await requestJson("POST", "/agents/plan/propose", {
    requestId: panel.requestId,
    plan,
    m100ConfirmationSurface: "cep-panel",
    m100ConfirmationSessionId: "vertical-smoke-session",
    repairPlan: false
  });
  assert.strictEqual(response.status, 200, "backend proposal creation should succeed");
  assert.strictEqual(response.body.ok, true, "backend proposal wrapper should be ok");
  const proposal = response.body.proposal;
  assert(protocol.validateActionProposalEnvelope(proposal).ok, "backend-created proposal should validate");
  assert.strictEqual(proposal.requestId, panel.requestId, "proposal requestId should match prompt requestId");
  assert.strictEqual(proposal.messageType, "action_proposal", "proposal should be first-class M100 envelope");
  assert.strictEqual(proposal.confirmation.required, true, "proposal should require confirmation");
  assert.strictEqual(proposal.confirmation.state, "pending", "proposal should start pending");
  assert.strictEqual(proposal.risk.level, "mutating", "vertical plan should be mutating");
  return proposal;
}

async function assertVerticalSuccess() {
  const panel = createFakePanelFlow("Create a safe fake M100 test comp");
  const plan = verticalPlan("Success");
  const proposal = await createProposalFromPrompt(panel, plan);
  applyFakePanelMessage(panel, proposal);
  assert.strictEqual(panel.status, "awaiting_confirmation", "panel should wait for confirmation before AE queueing");

  const forged = await requestJson("POST", "/agents/plan/run", {
    requestId: panel.requestId,
    plan,
    dryRun: false,
    confirm: true,
    allowMutations: true
  });
  assert.strictEqual(forged.status, 400, "client-authored confirm should not run mutating plan");
  assert.strictEqual(forged.body.code, "m100_confirmation_required", "run without server proposal should require M100 confirmation");

  const run = requestJson("POST", "/agents/plan/run", runBodyForProposal(proposal));
  await completeNextAeCommand("vertical checkpoint", fakeProjectSummary("Success"), "vertical-success");
  await completeNextAeCommand("vertical create comp", fakeCreateCompResult("Success"), "vertical-success");
  await completeNextAeCommand("vertical verification", fakeVerificationResult("Success"), "vertical-success");
  const response = await run;
  assert.strictEqual(response.status, 200, "confirmed vertical run should succeed");
  assert.strictEqual(response.body.ok, true, "confirmed vertical run wrapper should be ok");
  const result = response.body.run && response.body.run.m100Message;
  assert(result, "confirmed vertical run should include M100 result envelope");
  assert.strictEqual(result.messageType, "action_result", "confirmed vertical run should display action_result");
  assert.strictEqual(result.status, "completed", "confirmed vertical run should end completed");
  assert.strictEqual(result.requestId, panel.requestId, "result requestId should match prompt");
  assert.strictEqual(result.actionId, proposal.actionId, "result actionId should match proposal");
  assert.strictEqual(result.executionId, response.body.run.id, "result executionId should match run id");
  assert.strictEqual(response.body.run.m100Action.confirmationState, "completed", "proposal record should complete after run");
  applyFakePanelMessage(panel, result);
  assert.strictEqual(panel.status, "completed", "fake panel should display final completed state");
  return { panel, proposal, response };
}

async function assertVerticalAeError() {
  const panel = createFakePanelFlow("Create a fake M100 comp and show host error");
  const plan = verticalPlan("Error");
  const proposal = await createProposalFromPrompt(panel, plan);
  applyFakePanelMessage(panel, proposal);
  const run = requestJson("POST", "/agents/plan/run", runBodyForProposal(proposal));
  await completeNextAeCommand("vertical error checkpoint", fakeProjectSummary("Error"), "vertical-error");
  await failNextAeCommand("vertical host error", {
    ok: true,
    result: JSON.stringify({
      ok: false,
      error: "Boom from fake AE host at C:\\Users\\Ant\\Documents\\Codex\\AE_agent\\secret.aep",
      line: 17
    }),
    error: null
  }, "vertical-error");
  const response = await run;
  assert.strictEqual(response.status, 400, "confirmed vertical host error should fail");
  assert.strictEqual(response.body.ok, false, "host error run wrapper should fail");
  const result = response.body.run && response.body.run.m100Message;
  assert(result, "failed vertical run should include M100 error envelope");
  assert.strictEqual(result.messageType, "error", "failed vertical run should display M100 error");
  assert.strictEqual(result.status, "failed", "failed vertical run should end failed");
  assert.strictEqual(result.requestId, panel.requestId, "error requestId should match prompt");
  assert.strictEqual(result.actionId, proposal.actionId, "error actionId should match proposal");
  assert.strictEqual(result.executionId, response.body.run.id, "error executionId should match run id");
  assert.strictEqual(result.error.phase, "ae_execution", "host error should be an AE execution failure");
  assertRedacted(JSON.stringify(result), "vertical AE error envelope");
  applyFakePanelMessage(panel, result);
  assert.strictEqual(panel.status, "failed", "fake panel should display final failed state");
}

async function startDevExtendscript(script, timeoutMs) {
  return requestJson("POST", "/dev/tool/run_extendscript", {
    script,
    timeoutMs,
    verifyAfter: false
  });
}

function assertDevTimeoutResponse(response, expectedCode, expectedLifecycleState, label) {
  assert.strictEqual(response.status, 500, `${label}: dev tool should fail after timeout`);
  assert.strictEqual(response.body.ok, false, `${label}: response should be a failure`);
  assert.strictEqual(response.body.code, expectedCode, `${label}: unexpected timeout code`);
  assert.strictEqual(response.body.lifecycleState, expectedLifecycleState, `${label}: unexpected lifecycle state`);
  assert(response.body.commandId, `${label}: response should expose command id`);
  return response.body.commandId;
}

function assertDevAeFailureResponse(response, expectedCode, expectedPhase, label) {
  assert.strictEqual(response.status, 500, `${label}: dev tool should fail`);
  assert.strictEqual(response.body.ok, false, `${label}: response should be a failure`);
  assert.strictEqual(response.body.code, expectedCode, `${label}: unexpected failure code`);
  assert.strictEqual(response.body.phase, expectedPhase, `${label}: unexpected failure phase`);
  assert.strictEqual(response.body.lifecycleState, "failed", `${label}: unexpected lifecycle state`);
  assert(response.body.commandId, `${label}: response should expose command id`);
  return response.body.commandId;
}

async function assertNoBridgeCommand(label) {
  const next = await requestJson("GET", `/bridge/next?panelConnectionId=${encodeURIComponent(panelConnectionId)}&panelGeneration=no-command`);
  assert.strictEqual(next.status, 200, `${label}: bridge next should be readable`);
  assert.strictEqual(next.body.ok, true, `${label}: bridge next wrapper should be ok`);
  assert.strictEqual(next.body.command, null, `${label}: no command should be returned`);
}

async function assertTimeoutBeforeDelivery() {
  const run = startDevExtendscript("return 'expired before delivery';", 120);
  await waitForInflightCommand("pre-delivery expiry", (command) => command.lifecycleState === "queued");
  const response = await run;
  const commandId = assertDevTimeoutResponse(response, "expired_before_delivery", "expired_before_delivery", "pre-delivery expiry");
  await assertNoBridgeCommand("pre-delivery expiry");
  const retained = await requestJson("GET", `/results/${encodeURIComponent(commandId)}`);
  assert.strictEqual(retained.status, 200, "pre-delivery expiry: retained result should be readable");
  assert.strictEqual(retained.body.result.lifecycleState, "expired_before_delivery", "pre-delivery expiry: retained lifecycle mismatch");
}

async function assertTimeoutAfterLease() {
  const run = startDevExtendscript("return 'leased timeout';", 200);
  await waitForInflightCommand("lease timeout queued", (command) => command.lifecycleState === "queued");
  const next = await requestJson("GET", `/bridge/next?panelConnectionId=${encodeURIComponent(panelConnectionId)}&panelGeneration=lease-timeout`);
  assert.strictEqual(next.status, 200, "lease timeout: bridge next should succeed");
  assert(next.body.command && next.body.command.id, "lease timeout: expected a leased command");
  await waitForInflightCommand("lease timeout leased", (command) => command.id === next.body.command.id && command.lifecycleState === "leased");
  const response = await run;
  const commandId = assertDevTimeoutResponse(response, "unknown_after_delivery", "timed_out_after_submit", "lease timeout");
  assert.strictEqual(commandId, next.body.command.id, "lease timeout: response command id should match leased command");
  const late = await requestJson("POST", "/bridge/result", {
    id: commandId,
    ok: true,
    result: JSON.stringify({ ok: true, result: "late leased result" }),
    error: null
  });
  assert.strictEqual(late.status, 200, "lease timeout: late result should be acknowledged");
  assert.strictEqual(late.body.stale, true, "lease timeout: late result should be stale");
  assert.strictEqual(late.body.lifecycleState, "stale_result_ignored", "lease timeout: stale lifecycle mismatch");
}

async function assertTimeoutAfterSubmit() {
  const run = startDevExtendscript("return 'submitted timeout';", 250);
  await waitForInflightCommand("submit timeout queued", (command) => command.lifecycleState === "queued");
  const command = await leaseAndSubmitNextCommand("submit timeout", "submit-timeout");
  await waitForInflightCommand("submit timeout submitted", (item) => item.id === command.id && item.lifecycleState === "submitted");
  const response = await run;
  const commandId = assertDevTimeoutResponse(response, "timed_out_after_submit", "timed_out_after_submit", "submit timeout");
  assert.strictEqual(commandId, command.id, "submit timeout: response command id should match submitted command");
  const late = await requestJson("POST", "/bridge/result", {
    id: commandId,
    ok: true,
    result: JSON.stringify({ ok: true, result: "late submitted result" }),
    error: null
  });
  assert.strictEqual(late.status, 200, "submit timeout: late result should be acknowledged");
  assert.strictEqual(late.body.stale, true, "submit timeout: late result should be stale");
  assert.strictEqual(late.body.lifecycleState, "stale_result_ignored", "submit timeout: stale lifecycle mismatch");
}

function assertDevSuccessResponse(response, expectedResult, label) {
  assert.strictEqual(response.status, 200, `${label}: dev tool should succeed`);
  assert.strictEqual(response.body.ok, true, `${label}: response should be ok`);
  const actualResult = response.body.result && typeof response.body.result === "object" && Object.prototype.hasOwnProperty.call(response.body.result, "result")
    ? response.body.result.result
    : response.body.result;
  assert.strictEqual(actualResult, expectedResult, `${label}: unexpected result`);
}

async function assertConcurrentCommandSingleFlight() {
  const firstRun = startDevExtendscript("return 'first single flight';", 5000);
  await waitForInflightCommand("single-flight first queued", (command) => command.lifecycleState === "queued");
  const first = await leaseAndSubmitNextCommand("single-flight first", "single-flight");
  await waitForInflightCommand("single-flight first submitted", (command) => command.id === first.id && command.lifecycleState === "submitted");

  const secondRun = startDevExtendscript("return 'second single flight';", 5000);
  const secondQueued = await waitForInflightCommand("single-flight second queued", (command) => command.id !== first.id && command.lifecycleState === "queued");

  const blockedNext = await requestJson("GET", `/bridge/next?panelConnectionId=${encodeURIComponent(panelConnectionId)}&panelGeneration=single-flight`);
  assert.strictEqual(blockedNext.status, 200, "single-flight: blocked bridge next should succeed");
  assert.strictEqual(blockedNext.body.command, null, "single-flight: second command must not lease while first is submitted");
  const stillQueued = await waitForInflightCommand("single-flight second still queued", (command) => command.id === secondQueued.id && command.lifecycleState === "queued");
  assert.strictEqual(stillQueued.id, secondQueued.id, "single-flight: second command should remain queued");

  await postBridgeResult("single-flight first", first.id, wrapperResult("first single flight"));
  assertDevSuccessResponse(await firstRun, "first single flight", "single-flight first");

  const second = await leaseAndSubmitNextCommand("single-flight second", "single-flight");
  assert.strictEqual(second.id, secondQueued.id, "single-flight: second command should lease after first finishes");
  await postBridgeResult("single-flight second", second.id, wrapperResult("second single flight"));
  assertDevSuccessResponse(await secondRun, "second single flight", "single-flight second");
}

async function assertStrictAeResultFailure(label, resultPayload, expectedCode, expectedPhase) {
  const run = startDevExtendscript(`return '${label}';`, 5000);
  await waitForInflightCommand(`${label} queued`, (command) => command.lifecycleState === "queued");
  const command = await leaseAndSubmitNextCommand(label, label);
  await postBridgeResult(label, command.id, resultPayload);
  const response = await run;
  const commandId = assertDevAeFailureResponse(response, expectedCode, expectedPhase, label);
  assert.strictEqual(commandId, command.id, `${label}: response command id should match command`);
}

async function assertStrictMalformedWrapperFailures() {
  await assertStrictAeResultFailure("empty-wrapper", {
    ok: true,
    result: "",
    error: null
  }, "ae_result_parse_failed", "ae_result_parse");
  await assertStrictAeResultFailure("malformed-json-wrapper", {
    ok: true,
    result: "not json",
    error: null
  }, "ae_result_parse_failed", "ae_result_parse");
  await assertStrictAeResultFailure("wrapper-mismatch", {
    ok: true,
    result: JSON.stringify({ ok: true }),
    error: null
  }, "ae_result_parse_failed", "ae_result_parse");
  await assertStrictAeResultFailure("wrapper-host-error", {
    ok: true,
    result: JSON.stringify({ ok: false, error: "Boom from host", line: 7 }),
    error: null
  }, "ae_execution_failed", "ae_execution");
  await assertStrictAeResultFailure("evalscript-host-error", {
    ok: false,
    result: null,
    error: "EvalScript error. Host rejected the command."
  }, "ae_execution_failed", "ae_execution");
}

async function assertFakeAeCases() {
  await assertTimeoutBeforeDelivery();
  await assertTimeoutAfterLease();
  await assertTimeoutAfterSubmit();
  await assertConcurrentCommandSingleFlight();
  await assertStrictMalformedWrapperFailures();
}

function fakeCodexEnvelope(requestId, code, phase, message, rawPreview) {
  return protocol.createErrorEnvelope({
    requestId,
    phase,
    code,
    error: message,
    rawPreview,
    logs: [
      {
        phase,
        level: "error",
        message,
        logRef: "C:\\Users\\Ant\\Documents\\Codex\\AE_agent\\logs\\secret.log"
      }
    ]
  });
}

async function assertFakeCodexCases() {
  const textPanel = createFakePanelFlow("Explain the selected comp");
  const assistant = protocol.createAssistantResponseEnvelope({
    requestId: textPanel.requestId,
    summary: "Text-only fake assistant response.",
    logs: [
      {
        phase: "codex_exec",
        level: "info",
        message: "Fake Codex assistant text completed."
      }
    ]
  });
  applyFakePanelMessage(textPanel, assistant);
  assert.strictEqual(textPanel.status, "completed", "valid assistant text should complete without controls");

  const candidatePanel = createFakePanelFlow("Create a candidate plan");
  const candidatePlan = verticalPlan("Candidate");
  assert(!panelCanRenderControls({ result: { plan: candidatePlan } }), "candidate result.plan must not create controls");
  const proposal = await createProposalFromPrompt(candidatePanel, candidatePlan);
  applyFakePanelMessage(candidatePanel, proposal);

  const timeoutError = fakeCodexEnvelope(
    "req_fake_timeout",
    "model_timeout",
    "model_timeout",
    "Fake Codex CLI timed out before assistant output.",
    "stderr prompt: secret prompt fragment that should not leak C:\\Users\\Ant\\Documents\\Codex\\AE_agent\\private.aep"
  );
  assert.strictEqual(timeoutError.error.phase, "model_timeout", "delayed fake output should become model_timeout");
  assertRedacted(JSON.stringify(timeoutError), "fake timeout");

  const stderrError = fakeCodexEnvelope(
    "req_fake_stderr",
    "codex_nonzero_exit",
    "codex_exec",
    "Fake Codex exited with stderr.",
    "stderr Bearer abcdefghijklmnopqrst at C:\\Users\\Ant\\Documents\\Codex\\AE_agent\\private.aep"
  );
  assert.strictEqual(stderrError.error.code, "codex_nonzero_exit", "stderr fake case should preserve stable code");
  assertRedacted(JSON.stringify(stderrError), "fake stderr");

  const nonZero = fakeCodexEnvelope("req_fake_nonzero", "codex_nonzero_exit", "codex_exec", "Fake Codex exited with code 42.", "exitCode=42");
  assert.strictEqual(nonZero.messageType, "error", "non-zero fake case should be an error envelope");

  const noAssistant = fakeCodexEnvelope("req_fake_no_assistant", "codex_no_assistant_text", "codex_exec", "Fake Codex stream had no assistant text.", "");
  assert.strictEqual(noAssistant.error.code, "codex_no_assistant_text", "no-assistant fake case should preserve stable code");

  const malformedJsonl = fakeCodexEnvelope("req_fake_malformed_jsonl", "codex_malformed_jsonl", "protocol_validation", "Fake Codex JSONL was malformed.", "{bad jsonl");
  assert.strictEqual(malformedJsonl.error.phase, "protocol_validation", "malformed JSONL should be protocol_validation");
}

function assertLegacyControlsCannotRender() {
  const panelSource = fs.readFileSync(panelPath, "utf8");
  assert(panelSource.includes("normalizeM100ActionProposal"), "panel should keep M100 proposal normalization");
  assert(panelSource.includes("appendInlineActionProposalActions"), "panel should render action proposal controls");
  assert(panelSource.indexOf("appendInlinePlanActions") < 0, "panel must not expose legacy appendInlinePlanActions");
  assert(panelSource.indexOf("options.planActions") < 0, "panel must not render controls from legacy options.planActions");

  const legacyPlan = {
    result: {
      plan: verticalPlan("Legacy")
    }
  };
  assert(!panelCanRenderControls(legacyPlan), "legacy result.plan shape must not create controls");
  assert(!panelCanRenderControls({
    messageType: "action_proposal",
    createdBy: "model",
    serverCreated: false,
    result: { plan: verticalPlan("Model") }
  }), "model-authored action_proposal-like shape must not create controls");
}

function prepareFakeProjectFile() {
  fs.mkdirSync(path.dirname(fakeProjectPath), { recursive: true });
  fs.writeFileSync(fakeProjectPath, "m100 vertical fake project file\n", "utf8");
}

async function main() {
  prepareFakeProjectFile();
  assertLegacyControlsCannotRender();
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
    assert(health.body.m100RiskPolicy, "health should expose M100 risk policy");
    await assertFakeCodexCases();
    await assertVerticalSuccess();
    await assertVerticalAeError();
    await assertFakeAeCases();
    console.log(JSON.stringify({
      ok: true,
      checked: [
        "fake prompt creates a requestId and text-only assistant response without controls",
        "valid fake candidate plan becomes a backend-created action_proposal",
        "confirmation is required; client-authored confirm:true cannot run mutating plans",
        "confirmed proposal resolves executable payload from the server-side action store",
        "fake AE success displays an action_result with matching request/action/execution ids",
        "fake AE host error displays a failed M100 error envelope with matching ids",
        "fake Codex timeout, stderr, non-zero, no-assistant and malformed-JSONL cases use stable redacted diagnostics",
        "queued command expires before bridge delivery",
        "leased/submitted timeouts report unknown/stale semantics",
        "late bridge results are stale_result_ignored",
        "backend single-flight blocks concurrent command lease for one panel generation",
        "empty/malformed/wrapper-mismatch AE output fails with ae_result_parse",
        "wrapped and evalScript host errors fail with ae_execution",
        "legacy result.plan and model-authored proposal shapes cannot create executable controls"
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
