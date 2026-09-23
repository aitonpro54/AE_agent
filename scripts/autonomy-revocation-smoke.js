"use strict";

// Isolated AUT07/AUT09/AUT16 regression. The fake panel returns synthetic
// command results; no ExtendScript is executed in After Effects.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createAutonomousSessionManager } = require("../mcp-server/autonomous-session");
const { createProposalState } = require("../mcp-server/proposal-state");
const {
  commandEcho,
  pause,
  pollPanel,
  startDaemon
} = require("./network-test-fixture");

const PANEL_ID = "autonomy-revocation-panel";
const PANEL_GENERATION = "1";
const PROJECT_FILE = "C:\\Synthetic\\AutonomyRevocation.aep";

function activeSessionFixture(runtimeDir) {
  const checkpointFile = path.join(runtimeDir, "backups", "AutonomyRevocation-checkpoint.aep");
  fs.writeFileSync(checkpointFile, "synthetic autonomy checkpoint", "utf8");
  fs.writeFileSync(path.join(runtimeDir, "logs", "edit-session-active.json"), JSON.stringify({
    id: "autonomy-revocation-edit-session",
    label: "autonomy-revocation",
    status: "active",
    startedAt: "2026-09-22T00:00:00.000Z",
    updatedAt: "2026-09-22T00:00:00.000Z",
    checkpoint: {
      label: "autonomy-revocation",
      sourceFile: PROJECT_FILE,
      checkpointFile,
      bytes: 29,
      createdAt: "2026-09-22T00:00:00.000Z",
      project: { file: PROJECT_FILE },
      triggeredBy: "synthetic-autonomy-revocation"
    },
    operations: []
  }), "utf8");
}

function plan(stepCount) {
  const steps = [];
  for (let index = 0; index < stepCount; index += 1) {
    steps.push({
      tool: "set_project_frames_count_type",
      args: {
        framesCountType: index % 2 === 0 ? "FC_START_0" : "FC_START_1",
        expectedCurrentFramesCountType: index % 2 === 0 ? "FC_START_1" : "FC_START_0"
      },
      mutatesProject: true
    });
  }
  return {
    summary: "Exercise autonomous revocation around exact typed mutations",
    requiresCheckpoint: true,
    steps
  };
}

function projectInfo(framesCountType = "FC_START_1") {
  const zero = framesCountType === "FC_START_0";
  return {
    file: PROJECT_FILE,
    bitsPerChannel: 8,
    numItems: 1,
    activeItemName: "Synthetic",
    activeItemType: "Composition",
    framesCountType,
    framesCountTypeValue: zero ? "0" : "1",
    framesCountStartFrame: zero ? 0 : 1
  };
}

function mutationResult(command) {
  const toZero = command.script.includes('requestedFramesCountType = "FC_START_0"');
  return {
    project: {
      framesCountType: toZero ? "FC_START_0" : "FC_START_1",
      framesCountStartFrame: toZero ? 0 : 1,
      numItems: 1,
      activeItemName: "Synthetic",
      activeItemType: "Composition"
    },
    before: {
      value: toZero ? "1" : "0",
      name: toZero ? "FC_START_1" : "FC_START_0",
      startFrame: toZero ? 1 : 0,
      numItems: 1,
      activeItemName: "Synthetic",
      activeItemType: "Composition"
    }
  };
}

function verificationResult() {
  return {
    checkedAt: "Mon, 22 Sep 2026 00:00:00 GMT",
    project: { numItems: 1, file: PROJECT_FILE, activeItem: null },
    target: {},
    comp: null,
    layer: null,
    sameNameLayerCount: 0,
    sameNameLayers: []
  };
}

function isProjectInfo(command) {
  return command && command.script.includes("bitsPerChannel: project ? project.bitsPerChannel");
}

function isMutation(command) {
  return command && command.script.includes("project.framesCountType =");
}

function isVerification(command) {
  return command && command.script.includes("sameNameLayerCount: sameNameLayers.length");
}

async function panelRequest(fixture, route, body) {
  return fixture.request({ path: route, token: fixture.panelToken, body });
}

async function mcpCall(fixture, name, args) {
  const response = await fixture.request({
    path: "/mcp/tools/call",
    token: fixture.automationToken,
    headers: { "x-ae-mcp-adapter": "codex-stdio-v1" },
    body: { name, arguments: args || {} },
    timeoutMs: 10000
  });
  assert.strictEqual(response.status, 200, response.text);
  const result = response.body.result;
  assert(result && Array.isArray(result.content), response.text);
  return {
    isError: Boolean(result.isError),
    value: JSON.parse(result.content[0].text)
  };
}

async function nextCommand(fixture, attempts = 160) {
  for (let index = 0; index < attempts; index += 1) {
    const response = await pollPanel(fixture, {
      panelConnectionId: PANEL_ID,
      panelGeneration: PANEL_GENERATION,
      projectFile: PROJECT_FILE
    });
    assert.strictEqual(response.status, 200, response.text);
    if (response.body.command) return response.body.command;
    await pause(10);
  }
  return null;
}

async function submitCommand(fixture, command) {
  const response = await panelRequest(fixture, "/bridge/submitted", commandEcho(command));
  assert.strictEqual(response.status, 200, response.text);
  return response;
}

async function resultCommand(fixture, command, result) {
  const response = await panelRequest(fixture, "/bridge/result", {
    ...commandEcho(command),
    ok: true,
    result: JSON.stringify({ ok: true, result })
  });
  assert.strictEqual(response.status, 200, response.text);
  return response;
}

async function completeCommand(fixture, command, result) {
  await submitCommand(fixture, command);
  await resultCommand(fixture, command, result);
}

async function withProjectPanel(fixture, action) {
  let finished = false;
  const pending = Promise.resolve().then(action).finally(() => { finished = true; });
  pending.catch(() => {});
  while (!finished) {
    const command = await nextCommand(fixture, 1);
    if (!command) continue;
    assert(isProjectInfo(command), `unexpected setup command: ${command.script.slice(-500)}`);
    await completeCommand(fixture, command, projectInfo());
  }
  return pending;
}

async function activate(fixture) {
  const observed = await pollPanel(fixture, {
    panelConnectionId: PANEL_ID,
    panelGeneration: PANEL_GENERATION,
    projectFile: PROJECT_FILE
  });
  assert.strictEqual(observed.status, 200, observed.text);
  const response = await panelRequest(fixture, "/autonomy/session", {
    enabled: true,
    panelConnectionId: PANEL_ID,
    panelGeneration: PANEL_GENERATION
  });
  assert.strictEqual(response.status, 200, response.text);
  assert.strictEqual(response.body.session.desiredEnabled, true);
  assert.strictEqual(response.body.session.active, true);
}

async function revoke(fixture) {
  const response = await panelRequest(fixture, "/autonomy/session", {
    enabled: false,
    panelConnectionId: PANEL_ID,
    panelGeneration: PANEL_GENERATION
  });
  assert.strictEqual(response.status, 200, response.text);
  assert.strictEqual(response.body.session.desiredEnabled, false);
  assert.strictEqual(response.body.session.active, false);
}

async function prepareScenario(stepCount) {
  const fixture = await startDaemon({
    automationToken: `autonomy-revocation-auto-${stepCount}`,
    panelToken: `autonomy-revocation-panel-${stepCount}`,
    adminToken: `autonomy-revocation-admin-${stepCount}`,
    commandTimeoutMs: 3000,
    setupRuntime: activeSessionFixture
  });
  await activate(fixture);
  const proposed = await withProjectPanel(fixture, () => mcpCall(fixture, "propose_ai_agent_plan", { plan: plan(stepCount) }));
  assert.strictEqual(proposed.isError, false, JSON.stringify(proposed.value));
  const proposal = proposed.value.proposal;
  const preview = await withProjectPanel(fixture, () => mcpCall(fixture, "run_ai_agent_plan", {
    actionId: proposal.actionId,
    dryRun: true
  }));
  assert.strictEqual(preview.isError, false, JSON.stringify(preview.value));
  assert.strictEqual(preview.value.ok, true);
  return { fixture, proposal };
}

function runArgs(proposal) {
  return {
    actionId: proposal.actionId,
    payloadHash: proposal.action.payloadHash,
    previewHash: proposal.action.previewHash,
    riskLevel: proposal.risk.level,
    riskPolicyVersion: proposal.confirmation.riskPolicyVersion,
    dryRun: false
  };
}

async function completeTwoProjectReads(fixture) {
  for (let count = 0; count < 2; count += 1) {
    const command = await nextCommand(fixture);
    assert(command, `missing project read ${count + 1}`);
    assert(isProjectInfo(command), `expected project read before mutation: ${command.script.slice(-500)}`);
    await completeCommand(fixture, command, projectInfo());
  }
}

async function assertQueuedAndLeasedRevocation() {
  {
    const { fixture, proposal } = await prepareScenario(1);
    try {
      const running = mcpCall(fixture, "run_ai_agent_plan", runArgs(proposal));
      running.catch(() => {});
      await completeTwoProjectReads(fixture);
      for (let index = 0; index < 100; index += 1) {
        const health = await fixture.request({ path: "/health" });
        if (health.body.pending > 0) break;
        await pause(10);
      }
      await revoke(fixture);
      const deniedDelivery = await nextCommand(fixture, 10);
      assert.strictEqual(deniedDelivery, null, "revoked queued mutation must not be delivered");
      const stopped = await running;
      assert.strictEqual(stopped.isError, true);
      assert.strictEqual(stopped.value.errorCode, "autonomous_session_expired_or_revoked");
    } finally {
      await fixture.stop();
    }
  }

  {
    const { fixture, proposal } = await prepareScenario(1);
    try {
      const running = mcpCall(fixture, "run_ai_agent_plan", runArgs(proposal));
      running.catch(() => {});
      await completeTwoProjectReads(fixture);
      const leased = await nextCommand(fixture);
      assert(leased && isMutation(leased), "expected one leased mutation before revoke");
      await revoke(fixture);
      const submitted = await panelRequest(fixture, "/bridge/submitted", commandEcho(leased));
      assert.strictEqual(submitted.status, 409, submitted.text);
      assert.strictEqual(submitted.body.code, "autonomous_session_expired_or_revoked");
      const stopped = await running;
      assert.strictEqual(stopped.isError, true);
      assert.strictEqual(stopped.value.errorCode, "autonomous_session_expired_or_revoked");
    } finally {
      await fixture.stop();
    }
  }
}

async function assertSubmittedRevocation() {
  const { fixture, proposal } = await prepareScenario(2);
  try {
    let runSettled = false;
    const running = mcpCall(fixture, "run_ai_agent_plan", runArgs(proposal)).finally(() => { runSettled = true; });
    running.catch(() => {});
    await completeTwoProjectReads(fixture);
    const mutation = await nextCommand(fixture);
    assert(mutation && isMutation(mutation), "expected first autonomous mutation");
    await submitCommand(fixture, mutation);
    await revoke(fixture);
    await resultCommand(fixture, mutation, mutationResult(mutation));

    let readBack = null;
    for (let index = 0; index < 120 && !runSettled && !readBack; index += 1) {
      const command = await nextCommand(fixture, 1);
      if (command) readBack = command;
      else await pause(10);
    }
    assert(readBack && isVerification(readBack),
      "a submitted terminal result must be accepted and followed by read-back after revoke");
    await completeCommand(fixture, readBack, verificationResult());

    const stopped = await running;
    assert.strictEqual(stopped.isError, true);
    assert.strictEqual(stopped.value.errorCode, "autonomous_session_expired_or_revoked");
    const deliveredAfterReadBack = await nextCommand(fixture, 10);
    assert.strictEqual(deliveredAfterReadBack, null, "next mutation must remain denied after read-back");
    const completedMutations = stopped.value.steps.filter((step) => step.tool === "set_project_frames_count_type" && step.status === "completed");
    assert.strictEqual(completedMutations.length, 1);
  } finally {
    await fixture.stop();
  }
}

function assertProposalExpiryDoesNotDisablePreference() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ae-autonomy-expiry-"));
  try {
    let now = 100000;
    const panel = { panelConnectionId: PANEL_ID, panelGeneration: PANEL_GENERATION, seenAt: now };
    const manager = createAutonomousSessionManager({
      now: () => now,
      panelState: () => panel,
      statePath: path.join(root, "autonomy.json")
    });
    manager.activate({ panelConnectionId: PANEL_ID, panelGeneration: PANEL_GENERATION });
    const proposals = createProposalState();
    const record = {
      actionId: "autonomy-expired-proposal",
      payload: { plan: { targetProject: { file: PROJECT_FILE }, steps: [] } },
      proposal: { confirmation: {} },
      proposalExpiresAt: new Date(0).toISOString(),
      executionState: "pending"
    };
    proposals.register(record);
    assert.throws(() => proposals.assertCurrent(record), (error) => error.code === "m100_action_proposal_expired");
    now += 24 * 60 * 60 * 1000;
    panel.seenAt = now;
    assert.strictEqual(manager.publicStatus().desiredEnabled, true,
      "proposal expiry must not change the durable autonomy preference");
    assert.strictEqual(manager.publicStatus().active, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function main() {
  assertProposalExpiryDoesNotDisablePreference();
  await assertQueuedAndLeasedRevocation();
  await assertSubmittedRevocation();
  console.log(JSON.stringify({
    ok: true,
    cases: {
      AUT07: "off denies queued delivery and leased submission before execution",
      AUT09: "expired proposal leaves desiredEnabled true",
      AUT16: "submitted terminal result accepted, read-back completed, next mutation denied"
    },
    isolatedLoopback: true,
    liveAeCommands: 0,
    providersCalled: false,
    clientData: false
  }, null, 2));
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
