"use strict";

// M4 RUN boundary regression. This starts only an isolated loopback daemon and
// uses a scoped fake panel; it never launches AE, CEP, a provider, or a client AEP.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const {
  commandEcho,
  pause,
  pollPanel,
  startDaemon
} = require("./network-test-fixture");
const { buildRunOutcome } = require("../mcp-server/run-outcome");
const { compactCheckpoint } = require("../mcp-server/bridge-daemon");
const {
  CONTRACT_VERSION: PROJECT_SAVE_CONTRACT,
  OPERATION: PROJECT_SAVE_OPERATION,
  SNAPSHOT_SCOPE,
  verifyReceipt
} = require("../mcp-server/project-save");

const PROJECT_A = "C:\\Synthetic\\RunBoundaryA.aep";
const PROJECT_B = "C:\\Synthetic\\RunBoundaryB.aep";

function assertDenied(response, label) {
  assert.strictEqual(response.status, 409, `${label}: ${response.status} ${response.text}`);
  assert(response.body && response.body.ok === false, `${label}: missing fail-closed body`);
  assert.strictEqual(typeof response.body.code, "string", `${label}: missing stable error code`);
  assert(response.body.code.length > 0, `${label}: empty error code`);
}

function assertCommandV2(command) {
  assert(command && typeof command === "object", "fake panel did not receive a command");
  assert.strictEqual(command.contractVersion, 2, "panel command must use contractVersion 2");
  for (const field of ["id", "executionId", "leaseId"]) {
    assert.strictEqual(typeof command[field], "string", `panel command is missing ${field}`);
    assert(command[field].length > 0, `panel command has an empty ${field}`);
  }
  assert(command.leaseOwner && typeof command.leaseOwner === "object", "panel command is missing leaseOwner");
  assert.strictEqual(command.leaseOwner.panelConnectionId, "run-boundary-panel");
  assert.strictEqual(command.leaseOwner.panelGeneration, "7");
  const echo = commandEcho(command);
  assert.deepStrictEqual(Object.keys(echo).sort(), [
    "contractVersion", "executionId", "id", "leaseId", "panelConnectionId", "panelGeneration"
  ]);
  assert.strictEqual(echo.panelConnectionId, command.leaseOwner.panelConnectionId);
  assert.strictEqual(echo.panelGeneration, command.leaseOwner.panelGeneration);
  return echo;
}

function projectInfoPayload(echo, projectFile = PROJECT_A) {
  return {
    ...echo,
    ok: true,
    result: JSON.stringify({
      ok: true,
      result: { file: projectFile, numItems: 1, activeItemName: "Synthetic" }
    })
  };
}

async function waitForCommand(fixture, options = {}) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const response = await pollPanel(fixture, {
      panelConnectionId: "run-boundary-panel",
      panelGeneration: "7",
      projectFile: options.projectFile
    });
    assert.strictEqual(response.status, 200, response.text);
    if (response.body && response.body.command) return response.body.command;
    await pause(10);
  }
  throw new Error("Timed out waiting for isolated fake-panel command.");
}

async function enqueueProjectInfo(fixture) {
  const completion = fixture.request({
    path: "/tools/call",
    token: fixture.automationToken,
    body: { name: "get_project_info", arguments: {} },
    timeoutMs: 5000
  });
  completion.catch(() => {});
  return { completion, command: await waitForCommand(fixture) };
}

function projectInfoResult(projectFile, overrides = {}) {
  return {
    file: projectFile,
    bitsPerChannel: 8,
    numItems: 1,
    activeItemName: "Synthetic",
    activeItemType: "Composition",
    framesCountType: "FC_START_1",
    framesCountTypeValue: "1",
    framesCountStartFrame: 1,
    ...overrides
  };
}

async function withFakeProjectPanel(fixture, projectFile, action, onCommand) {
  let finished = false;
  const commands = [];
  const pending = Promise.resolve().then(action).finally(() => { finished = true; });
  pending.catch(() => {});
  while (!finished) {
    const response = await pollPanel(fixture, {
      panelConnectionId: "run-boundary-panel",
      panelGeneration: "7",
      projectFile
    });
    assert.strictEqual(response.status, 200, response.text);
    const command = response.body && response.body.command;
    if (!command) {
      await pause(10);
      continue;
    }
    const echo = assertCommandV2(command);
    commands.push(command);
    const result = onCommand
      ? await onCommand(command, commands.length)
      : projectInfoResult(projectFile);
    const submitted = await postSubmitted(fixture, echo);
    assert.strictEqual(submitted.status, 200, submitted.text);
    const completed = await postResult(fixture, {
      ...echo,
      ok: true,
      result: JSON.stringify({ ok: true, result })
    });
    assert.strictEqual(completed.status, 200, completed.text);
  }
  return { response: await pending, commands };
}

function manualPlan() {
  return {
    summary: "Change frame numbering for one exact synthetic project",
    requiresCheckpoint: true,
    steps: [{
      tool: "set_project_frames_count_type",
      args: {
        framesCountType: "FC_START_0",
        expectedCurrentFramesCountType: "FC_START_1"
      },
      mutatesProject: true
    }]
  };
}

function manualRunArgs(proposal) {
  return {
    actionId: proposal.actionId,
    payloadHash: proposal.action.payloadHash,
    previewHash: proposal.action.previewHash,
    riskLevel: proposal.risk.level,
    riskPolicyVersion: proposal.confirmation.riskPolicyVersion,
    confirmationToken: proposal.confirmation.confirmationToken,
    confirmedBySurface: proposal.confirmation.surface,
    dryRun: false,
    confirm: true,
    allowMutations: true
  };
}

async function proposeAndDryRun(fixture, projectFile, plan = manualPlan()) {
  const proposed = await withFakeProjectPanel(fixture, projectFile, () => fixture.request({
    path: "/agents/plan/propose",
    token: fixture.panelToken,
    body: { plan }
  }));
  assert.strictEqual(proposed.response.status, 200, proposed.response.text);
  const proposal = proposed.response.body.proposal;
  assert(proposal && proposal.actionId, proposed.response.text);
  const preview = await withFakeProjectPanel(fixture, projectFile, () => fixture.request({
    path: "/agents/plan/run",
    token: fixture.panelToken,
    body: { actionId: proposal.actionId, dryRun: true }
  }));
  assert.strictEqual(preview.response.status, 200, preview.response.text);
  assert(preview.response.body.run && preview.response.body.run.ok === true, preview.response.text);
  return proposal;
}

async function postSubmitted(fixture, body) {
  return fixture.request({
    path: "/bridge/submitted",
    token: fixture.panelToken,
    body
  });
}

async function postResult(fixture, body) {
  return fixture.request({
    path: "/bridge/result",
    token: fixture.panelToken,
    body
  });
}

function assertOutcomeContract() {
  const failedIncomplete = buildRunOutcome({
    executedCount: 1,
    failedCount: 0,
    steps: [{ tool: "set_effect_property", status: "completed" }],
    semanticVerification: {
      status: "needs_review",
      checks: [{ id: "read-back", status: "failed" }],
      unverifiedMutationCount: 1
    }
  });
  assert.strictEqual(failedIncomplete.execution.status, "completed");
  assert.strictEqual(failedIncomplete.verification.status, "failed",
    "known semantic failure must take precedence over incomplete evidence");
  assert.deepStrictEqual(failedIncomplete.coverage, {
    status: "incomplete",
    scope: "declared_semantic_invariants",
    reasonCode: "semantic_evidence_incomplete"
  });

  const passed = buildRunOutcome({
    executedCount: 1,
    steps: [{ tool: "set_effect_property", status: "completed" }],
    semanticVerification: { status: "passed", checks: [{ id: "read-back", passed: true }] }
  });
  assert.strictEqual(passed.verification.status, "passed");
  assert.strictEqual(passed.coverage.status, "complete");

  const rawNoProof = buildRunOutcome({
    executedCount: 1,
    steps: [{ tool: "run_extendscript", status: "completed" }],
    semanticVerification: { status: "passed", checks: [] }
  });
  assert.strictEqual(rawNoProof.verification.status, "insufficient");
  assert.strictEqual(rawNoProof.verification.reasonCode, "raw_outcome_proof_missing");
  assert.strictEqual(rawNoProof.coverage.status, "incomplete");

  const dryRun = buildRunOutcome({ dryRun: true, executedCount: 0, steps: [] });
  assert.strictEqual(dryRun.execution.status, "not_started");
  assert.strictEqual(dryRun.coverage.status, "not_required");
}

function assertNamedSaveReceiptContract() {
  const hash = "a".repeat(64);
  const expectedProjectFile = "C:\\Synthetic\\NamedCurrent.aep";
  const args = {
    expectedProjectFile,
    expectedSavedFileSha25664: hash,
    checkpointLabel: "run-boundary-before-save"
  };
  const observedAt = "2026-09-22T00:00:00.000Z";
  const receipt = {
    contractVersion: PROJECT_SAVE_CONTRACT,
    operation: PROJECT_SAVE_OPERATION,
    success: true,
    expectedProjectFile,
    authorization: { proposalId: "proposal-run11", runId: "run-run11", confirmed: true },
    fileBefore: { path: expectedProjectFile, bytes: 128, sha256: hash, modifiedTimeMs: null, observedAt, fileIdentity: { device: "1", inode: "10" } },
    fileAfter: { path: expectedProjectFile, bytes: 128, sha256: hash, modifiedTimeMs: null, observedAt, fileIdentity: { device: "1", inode: "10" } },
    checkpoint: {
      label: args.checkpointLabel,
      checkpointFile: "C:\\Synthetic\\checkpoints\\NamedCurrent-before.aep",
      sourceFile: expectedProjectFile,
      snapshotScope: SNAPSHOT_SCOPE,
      bytes: 128,
      sha256: hash,
      observedAt,
      fileIdentity: { device: "1", inode: "11" }
    },
    aeReadBack: {
      projectFile: expectedProjectFile,
      saveResultProjectFile: expectedProjectFile,
      matchesExpected: true,
      phase: "after_save"
    },
    inMemoryRevisionProof: "not_observed",
    reopenVerification: "pending"
  };
  assert.strictEqual(verifyReceipt(receipt, args).valid, true);
  assert.throws(
    () => verifyReceipt({ ...receipt, authorization: { ...receipt.authorization, confirmed: false } }, args),
    (error) => error && error.code === "INVALID_PROJECT_SAVE_RECEIPT"
  );
  assert.throws(
    () => verifyReceipt({ ...receipt, reopenVerification: "passed" }, args),
    (error) => error && error.code === "INVALID_PROJECT_SAVE_RECEIPT"
  );
}

function assertCompactCheckpointContract() {
  const checkpoint = compactCheckpoint({
    label: "run-boundary-compact",
    sourceFile: PROJECT_A,
    checkpointFile: "C:\\Synthetic\\checkpoints\\RunBoundaryA.aep",
    bytes: 256,
    createdAt: "2026-09-22T00:00:00.000Z",
    project: { file: PROJECT_A },
    triggeredBy: "checkpoint_project"
  });
  assert.deepStrictEqual(checkpoint, {
    label: "run-boundary-compact",
    sourceFile: PROJECT_A,
    checkpointFile: "C:\\Synthetic\\checkpoints\\RunBoundaryA.aep",
    bytes: 256,
    createdAt: "2026-09-22T00:00:00.000Z"
  });
}

async function assertLifecycleContract() {
  const fixture = await startDaemon({
    automationToken: "run-boundary-automation",
    panelToken: "run-boundary-panel-token",
    adminToken: "run-boundary-admin",
    commandTimeoutMs: 900
  });
  try {
    const first = await enqueueProjectInfo(fixture);
    const firstEcho = assertCommandV2(first.command);

    assertDenied(await postResult(fixture, projectInfoPayload(firstEcho)), "result before submitted");
    assertDenied(await postSubmitted(fixture, { ...firstEcho, executionId: `${firstEcho.executionId}-wrong` }), "wrong execution");
    assertDenied(await postSubmitted(fixture, { ...firstEcho, leaseId: `${firstEcho.leaseId}-wrong` }), "wrong lease");
    assertDenied(await postSubmitted(fixture, { ...firstEcho, panelConnectionId: "other-panel" }), "wrong owner");
    assertDenied(await postSubmitted(fixture, { ...firstEcho, panelGeneration: "8" }), "wrong generation");
    assertDenied(await postSubmitted(fixture, { ...firstEcho, contractVersion: 1 }), "wrong contract version");

    const submitted = await postSubmitted(fixture, firstEcho);
    assert.strictEqual(submitted.status, 200, submitted.text);
    assert.strictEqual(submitted.body.lifecycleState, "submitted");

    assertDenied(await postResult(fixture, projectInfoPayload({ ...firstEcho, panelGeneration: "8" })), "result wrong generation");
    assertDenied(await postResult(fixture, projectInfoPayload({ ...firstEcho, leaseId: `${firstEcho.leaseId}-wrong` })), "result wrong lease");

    const terminalPayload = projectInfoPayload(firstEcho);
    const completed = await postResult(fixture, terminalPayload);
    assert.strictEqual(completed.status, 200, completed.text);
    assert.strictEqual(completed.body.ok, true);
    const firstCall = await first.completion;
    assert.strictEqual(firstCall.status, 200, firstCall.text);
    assert.strictEqual(firstCall.body.result.isError, false);

    const duplicate = await postResult(fixture, terminalPayload);
    assert.strictEqual(duplicate.status, 200, duplicate.text);
    assert.strictEqual(duplicate.body.ok, true);
    assert.strictEqual(duplicate.body.idempotent, true, "an exact terminal duplicate must be explicitly idempotent");
    assertDenied(await postResult(fixture, { ...terminalPayload, result: JSON.stringify({ ok: true, result: { file: "C:\\Synthetic\\Different.aep" } }) }), "conflicting terminal duplicate");

    const timed = await enqueueProjectInfo(fixture);
    const timedEcho = assertCommandV2(timed.command);
    const timedSubmitted = await postSubmitted(fixture, timedEcho);
    assert.strictEqual(timedSubmitted.status, 200, timedSubmitted.text);
    const reconnected = await pollPanel(fixture, {
      panelConnectionId: "run-boundary-panel",
      panelGeneration: "8"
    });
    assert.strictEqual(reconnected.status, 200, reconnected.text);
    assert.strictEqual(reconnected.body.command, null);
    assertDenied(await postResult(fixture, projectInfoPayload(timedEcho)),
      "result from superseded panel generation");
    const timedCall = await timed.completion;
    assert.strictEqual(timedCall.status, 500, timedCall.text);
    assert.strictEqual(timedCall.body.ok, false);
    assert.strictEqual(timedCall.body.code, "timed_out_after_submit");
    assert.strictEqual(timedCall.body.lifecycleState, "timed_out_after_submit");

    assertDenied(await postResult(fixture, projectInfoPayload(timedEcho)), "late result after unknown timeout");
    const afterTimeout = await pollPanel(fixture, {
      panelConnectionId: "run-boundary-panel",
      panelGeneration: "8"
    });
    assert.strictEqual(afterTimeout.status, 200, afterTimeout.text);
    assert(!afterTimeout.body.command || afterTimeout.body.command.id !== timed.command.id,
      "unknown timed-out command must never be auto-replayed");
  } finally {
    await fixture.stop();
  }
}

async function assertManualProjectParity() {
  const fixture = await startDaemon({
    automationToken: "run-manual-automation",
    panelToken: "run-manual-panel-token",
    adminToken: "run-manual-admin",
    commandTimeoutMs: 2500
  });
  try {
    const proposal = await proposeAndDryRun(fixture, PROJECT_A);
    const wrongProject = await withFakeProjectPanel(fixture, PROJECT_B, () => fixture.request({
      path: "/agents/plan/run",
      token: fixture.panelToken,
      body: manualRunArgs(proposal)
    }));
    assert.strictEqual(wrongProject.response.status, 400, wrongProject.response.text);
    assert.strictEqual(wrongProject.response.body.run.errorCode, "project_target_mismatch");
    assert.strictEqual(wrongProject.response.body.run.executedCount, 0);
    assert(wrongProject.commands.every((command) => command.script.includes("bitsPerChannel: project ? project.bitsPerChannel")),
      "manual A/B mismatch must be denied before a mutating command is delivered");
  } finally {
    await fixture.stop();
  }

  const checkpointFixture = await startDaemon({
    automationToken: "run-checkpoint-automation",
    panelToken: "run-checkpoint-panel-token",
    adminToken: "run-checkpoint-admin",
    commandTimeoutMs: 2500,
    setupRuntime(runtimeDir) {
      const checkpointFile = path.join(runtimeDir, "backups", "RunBoundaryA-checkpoint.aep");
      fs.writeFileSync(checkpointFile, "synthetic checkpoint only", "utf8");
      fs.writeFileSync(path.join(runtimeDir, "logs", "edit-session-active.json"), JSON.stringify({
        id: "run-boundary-edit-session",
        label: "run-boundary",
        status: "active",
        startedAt: "2026-09-22T00:00:00.000Z",
        updatedAt: "2026-09-22T00:00:00.000Z",
        checkpoint: {
          label: "run-boundary",
          sourceFile: PROJECT_A,
          checkpointFile,
          bytes: 25,
          createdAt: "2026-09-22T00:00:00.000Z",
          project: { file: PROJECT_A },
          triggeredBy: "synthetic-run-boundary"
        },
        operations: []
      }), "utf8");
    }
  });
  try {
    const wrongCheckpointProposal = await proposeAndDryRun(checkpointFixture, PROJECT_B);
    const wrongCheckpoint = await withFakeProjectPanel(checkpointFixture, PROJECT_B, () => checkpointFixture.request({
      path: "/agents/plan/run",
      token: checkpointFixture.panelToken,
      body: manualRunArgs(wrongCheckpointProposal)
    }));
    assert.strictEqual(wrongCheckpoint.response.status, 400, wrongCheckpoint.response.text);
    assert.strictEqual(wrongCheckpoint.response.body.run.errorCode, "edit_session_project_mismatch");
    assert.strictEqual(wrongCheckpoint.response.body.run.executedCount, 0);
    assert(wrongCheckpoint.commands.every((command) => command.script.includes("bitsPerChannel: project ? project.bitsPerChannel")),
      "foreign checkpoint must be denied before a mutating command is delivered");

    const currentProposal = await proposeAndDryRun(checkpointFixture, PROJECT_A);
    let mutationCommands = 0;
    const current = await withFakeProjectPanel(checkpointFixture, PROJECT_A, () => checkpointFixture.request({
      path: "/agents/plan/run",
      token: checkpointFixture.panelToken,
      body: manualRunArgs(currentProposal)
    }), (command) => {
      if (command.script.includes("bitsPerChannel: project ? project.bitsPerChannel")) {
        return projectInfoResult(PROJECT_A);
      }
      if (!command.script.includes("project.framesCountType =")) {
        assert(command.script.includes("sameNameLayerCount: sameNameLayers.length"),
          `unexpected manual read-back command: ${command.script.slice(-500)}`);
        return {
          checkedAt: "Mon, 22 Sep 2026 00:00:00 GMT",
          project: { numItems: 1, file: PROJECT_A, activeItem: null },
          target: {},
          comp: null,
          layer: null,
          sameNameLayerCount: 0,
          sameNameLayers: []
        };
      }
      assert(command.script.includes("project_target_mismatch"),
        `mutation lacks synchronous project guard: ${command.script.slice(-800)}`);
      assert(command.script.indexOf("project_target_mismatch") < command.script.indexOf("project.framesCountType ="),
        "synchronous project guard must run before mutation");
      assert(command.script.includes("FC_START_1"), "current manual frame-numbering revision was not preserved as the guard");
      const switchedProject = {
        file: { fsName: PROJECT_B },
        framesCountType: "FC_START_1",
        numItems: 1,
        activeItem: null
      };
      const guarded = JSON.parse(vm.runInNewContext(command.script, {
        app: {
          project: switchedProject,
          beginUndoGroup() {},
          endUndoGroup() {}
        },
        FramesCountType: { FC_START_0: "FC_START_0", FC_START_1: "FC_START_1" }
      }));
      assert.strictEqual(guarded.ok, false, "synchronous A/B guard must fail inside generated JSX");
      assert.match(guarded.error, /project_target_mismatch/);
      assert.strictEqual(switchedProject.framesCountType, "FC_START_1",
        "synchronous A/B guard must deny before the manual revision is mutated");
      mutationCommands += 1;
      return {
        project: {
          framesCountType: "FC_START_0",
          framesCountStartFrame: 0,
          numItems: 1,
          activeItemName: "Synthetic",
          activeItemType: "Composition"
        },
        before: {
          value: "1", name: "FC_START_1", startFrame: 1,
          numItems: 1, activeItemName: "Synthetic", activeItemType: "Composition"
        }
      };
    });
    assert.strictEqual(current.response.status, 200, current.response.text);
    assert.strictEqual(current.response.body.run.ok, true, current.response.text);
    assert.strictEqual(mutationCommands, 1, "manual current revision path must execute exactly one scoped mutation");
  } finally {
    await checkpointFixture.stop();
  }
}

async function assertPlannedCheckpointFlow() {
  let syntheticProjectFile = null;
  const fixture = await startDaemon({
    automationToken: "run-planned-checkpoint-automation",
    panelToken: "run-planned-checkpoint-panel-token",
    adminToken: "run-planned-checkpoint-admin",
    commandTimeoutMs: 2500,
    setupRuntime(runtimeDir) {
      syntheticProjectFile = path.join(runtimeDir, "SyntheticPlannedCheckpoint.aep");
      fs.writeFileSync(syntheticProjectFile, "synthetic planned checkpoint project", "utf8");
    }
  });
  try {
    const plan = {
      summary: "Create an exact project checkpoint before changing frame numbering",
      requiresCheckpoint: true,
      steps: [
        { tool: "checkpoint_project", args: { label: "run-boundary-planned" } },
        {
          tool: "set_project_frames_count_type",
          args: {
            framesCountType: "FC_START_0",
            expectedCurrentFramesCountType: "FC_START_1"
          },
          mutatesProject: true
        }
      ]
    };
    const proposal = await proposeAndDryRun(fixture, syntheticProjectFile, plan);
    let mutationCommands = 0;
    const executed = await withFakeProjectPanel(fixture, syntheticProjectFile, () => fixture.request({
      path: "/agents/plan/run",
      token: fixture.panelToken,
      body: manualRunArgs(proposal)
    }), (command) => {
      if (command.script.includes("bitsPerChannel: project ? project.bitsPerChannel")
          || command.script.includes("activeItemType: project && project.activeItem ? project.activeItem.typeName : null")) {
        return projectInfoResult(syntheticProjectFile);
      }
      if (!command.script.includes("project.framesCountType =")) {
        assert(command.script.includes("sameNameLayerCount: sameNameLayers.length"),
          `unexpected planned-checkpoint read-back command: ${command.script.slice(-500)}`);
        return {
          checkedAt: "Mon, 22 Sep 2026 00:00:00 GMT",
          project: { numItems: 1, file: syntheticProjectFile, activeItem: null },
          target: {},
          comp: null,
          layer: null,
          sameNameLayerCount: 0,
          sameNameLayers: []
        };
      }
      assert(command.script.includes("project_target_mismatch"));
      mutationCommands += 1;
      return {
        project: {
          framesCountType: "FC_START_0",
          framesCountStartFrame: 0,
          numItems: 1,
          activeItemName: "Synthetic",
          activeItemType: "Composition"
        },
        before: {
          value: "1", name: "FC_START_1", startFrame: 1,
          numItems: 1, activeItemName: "Synthetic", activeItemType: "Composition"
        }
      };
    });
    assert.strictEqual(executed.response.status, 200, executed.response.text);
    const run = executed.response.body.run;
    assert(run && run.ok === true, executed.response.text);
    assert.strictEqual(run.executedCount, 2);
    assert.strictEqual(run.checkpoint.sourceFile, syntheticProjectFile,
      "planned checkpoint must stay bound to the exact project through compact output");
    assert.strictEqual(mutationCommands, 1,
      "project-matched planned checkpoint must allow exactly one guarded mutation");
  } finally {
    await fixture.stop();
  }
}

async function main() {
  assertOutcomeContract();
  assertNamedSaveReceiptContract();
  assertCompactCheckpointContract();
  await assertLifecycleContract();
  await assertManualProjectParity();
  await assertPlannedCheckpointFlow();
  console.log(JSON.stringify({
    ok: true,
    coverage: {
      RUN01: "manual A/B project switch denied before mutation",
      RUN03: "delivery and synchronous JSX project guards retained",
      RUN04: "foreign edit-session checkpoint denied; exact planned checkpoint permits guarded mutation",
      RUN05: "current manual revision guard preserved without checkpoint restore",
      RUN06: "wrong owner/stage/generation/execution/lease/contract denied",
      RUN07: "exact terminal duplicate idempotent; conflicting duplicate denied",
      RUN08: "submitted timeout remains unknown and is not replayed",
      RUN09: "failed verification and incomplete coverage are separate",
      RUN10: "raw ExtendScript without proof remains insufficient",
      RUN11: "named-save receipt keeps explicit confirmation and pending reopen verification"
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
