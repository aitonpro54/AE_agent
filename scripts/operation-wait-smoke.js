"use strict";

const assert = require("assert");
const {
  waitForBridgeState,
  waitForPlanState,
  computePlanStateToken,
  compactLastRunSummary,
  normalizeWaitMs,
  MAX_WAIT_MS,
  DEFAULT_WAIT_MS
} = require("../mcp-server/operation-wait");
const { createProposalState } = require("../mcp-server/proposal-state");

async function testWaitBounds() {
  // Valid defaults and bounds
  assert.strictEqual(normalizeWaitMs(undefined), DEFAULT_WAIT_MS);
  assert.strictEqual(normalizeWaitMs(0), 0);
  assert.strictEqual(normalizeWaitMs(500), 500);
  assert.strictEqual(normalizeWaitMs(MAX_WAIT_MS), MAX_WAIT_MS);

  // Strict invalid inputs must all throw invalid_wait_ms
  const invalidInputs = [null, NaN, "not-a-number", "500", -10, 1.5, 30001, 50000];
  for (const input of invalidInputs) {
    assert.throws(
      () => normalizeWaitMs(input),
      (err) => err && err.code === "invalid_wait_ms",
      `Expected input ${JSON.stringify(input)} to throw invalid_wait_ms`
    );
  }
}

async function testBridgeStateWait() {
  // 1. Rejects unknown options or invalid targetState
  await assert.rejects(
    waitForBridgeState(() => ({}), { unknownKey: true }),
    (err) => err && err.code === "unknown_option"
  );
  await assert.rejects(
    waitForBridgeState(() => ({}), { targetState: "invalid_state" }),
    (err) => err && err.code === "invalid_target_state"
  );

  // 2. Timeout when condition not met and fields are missing/unknown
  // In existing get_bridge_status, pendingCommands is number, inflightCommands is array.
  // When fields are missing, idle must NOT be invented as true!
  const emptyStatusReader = () => ({});
  const timeoutRes = await waitForBridgeState(emptyStatusReader, {
    targetState: "idle",
    waitMs: 50,
    pollIntervalMs: 10
  });

  assert.strictEqual(timeoutRes.ok, true);
  assert.strictEqual(timeoutRes.timedOut, true);
  assert.strictEqual(timeoutRes.idle, null, "Missing fields must result in idle: null, not true");
  assert.strictEqual(timeoutRes.panelConnected, null);
  assert.strictEqual(timeoutRes.targetState, "idle");
  assert(timeoutRes.durationMs >= 40);

  // 3. Dynamic transition: connected and idle met
  const mutableBridge = {
    panelConnected: false,
    pendingCommands: 2,
    inflightCommands: [{ id: "cmd_1" }],
    retainedResults: 5
  };

  setTimeout(() => {
    mutableBridge.panelConnected = true;
    mutableBridge.pendingCommands = 0;
    mutableBridge.inflightCommands = [];
  }, 20);

  const matchedRes = await waitForBridgeState(() => ({ ...mutableBridge }), {
    targetState: "connected_and_idle",
    waitMs: 500,
    pollIntervalMs: 10
  });

  assert.strictEqual(matchedRes.ok, true);
  assert.strictEqual(matchedRes.timedOut, false);
  assert.strictEqual(matchedRes.panelConnected, true);
  assert.strictEqual(matchedRes.idle, true);
  assert.strictEqual(matchedRes.pendingCommands, 0);
  assert.strictEqual(matchedRes.inflightCommands, 0);
  assert.strictEqual(matchedRes.state, "connected_idle");

  // 4. "any" targetState returns immediately
  const anyRes = await waitForBridgeState(() => ({ ...mutableBridge }), {
    targetState: "any",
    waitMs: 500
  });
  assert.strictEqual(anyRes.ok, true);
  assert.strictEqual(anyRes.timedOut, false);
}

async function testPlanStatePinsAndExpiry() {
  const proposal = {
    actionId: "action_123",
    instanceId: "inst_abc",
    revision: 1,
    state: "proposed",
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    plan: { steps: [{ tool: "get_comp_details" }] },
    lastRun: null
  };

  // 1. Strict pins validation
  await assert.rejects(
    waitForPlanState(() => proposal, { unknownOption: 123 }),
    (err) => err && err.code === "unknown_option"
  );
  await assert.rejects(
    waitForPlanState(() => proposal, { instanceId: "inst_abc", revision: 1 }),
    (err) => err && err.code === "invalid_action_id"
  );
  await assert.rejects(
    waitForPlanState(() => proposal, { actionId: "action_123", revision: 1 }),
    (err) => err && err.code === "invalid_instance_id"
  );
  await assert.rejects(
    waitForPlanState(() => proposal, { actionId: "action_123", instanceId: "inst_abc", revision: 0 }),
    (err) => err && err.code === "invalid_revision"
  );
  await assert.rejects(
    waitForPlanState(() => proposal, { actionId: "action_123", instanceId: "inst_abc", revision: "1" }),
    (err) => err && err.code === "invalid_revision"
  );

  // 2. Absent proposal
  const absentRes = await waitForPlanState(() => null, {
    actionId: "action_123",
    instanceId: "inst_abc",
    revision: 1
  });
  assert.strictEqual(absentRes.ok, false);
  assert.strictEqual(absentRes.status, "absent");
  assert.strictEqual(absentRes.state, "absent");
  assert.strictEqual(absentRes.reason, "no_active_proposal");

  // 3. Superseded pins
  const wrongAction = await waitForPlanState(() => proposal, {
    actionId: "old_action",
    instanceId: "inst_abc",
    revision: 1
  });
  assert.strictEqual(wrongAction.ok, false);
  assert.strictEqual(wrongAction.status, "superseded");
  assert.strictEqual(wrongAction.reason, "action_id_mismatch");

  const wrongInstance = await waitForPlanState(() => proposal, {
    actionId: "action_123",
    instanceId: "old_instance",
    revision: 1
  });
  assert.strictEqual(wrongInstance.ok, false);
  assert.strictEqual(wrongInstance.status, "superseded");
  assert.strictEqual(wrongInstance.reason, "instance_id_mismatch");

  const wrongRevision = await waitForPlanState(() => proposal, {
    actionId: "action_123",
    instanceId: "inst_abc",
    revision: 2
  });
  assert.strictEqual(wrongRevision.ok, false);
  assert.strictEqual(wrongRevision.status, "superseded");
  assert.strictEqual(wrongRevision.reason, "revision_mismatch");

  // 4. Expiry with ISO date
  const expiredIsoProposal = {
    ...proposal,
    expiresAt: "2020-01-01T00:00:00.000Z"
  };
  const expiredRes = await waitForPlanState(() => expiredIsoProposal, {
    actionId: "action_123",
    instanceId: "inst_abc",
    revision: 1
  });
  assert.strictEqual(expiredRes.ok, false);
  assert.strictEqual(expiredRes.status, "expired");
  assert.strictEqual(expiredRes.reason, "proposal_expired");
  assert.strictEqual(expiredRes.lastRun, null);

  // 4a. Expired completed proposal preserves compact lastRun
  const expiredCompletedProposal = {
    ...proposal,
    state: "completed",
    expiresAt: "2020-01-01T00:00:00.000Z",
    lastRun: {
      id: "run_completed_123",
      ok: true,
      dryRun: false,
      errorCode: null,
      error: null,
      durationMs: 150,
      executedCount: 2,
      failedCount: 0,
      verification: { complete: true }
    }
  };
  const expCompletedRes = await waitForPlanState(() => expiredCompletedProposal, {
    actionId: "action_123",
    instanceId: "inst_abc",
    revision: 1
  });
  assert.strictEqual(expCompletedRes.ok, false);
  assert.strictEqual(expCompletedRes.status, "expired");
  assert.strictEqual(expCompletedRes.reason, "proposal_expired");
  assert.deepStrictEqual(expCompletedRes.lastRun, {
    id: "run_completed_123",
    ok: true,
    dryRun: false,
    errorCode: null,
    error: null,
    durationMs: 150,
    executedCount: 2,
    failedCount: 0,
    verification: { complete: true }
  });

  // 4b. Expired timeout/unknown: confirmed repro with createProposalState
  const propState = createProposalState();
  propState.register({
    actionId: "a",
    payload: { plan: { targetProject: { file: "C:/fixture.aep" } } },
    executionState: "failed",
    proposalExpiresAt: "2020-01-01T00:00:00.000Z",
    lastRun: {
      id: "12345678-1234-4123-8123-123456789abc",
      ok: false,
      dryRun: false,
      errorCode: "ae_command_timeout",
      executedCount: 1,
      failedCount: 1,
      verification: "needs_review",
      steps: [{ secret: "must_not_escape_compact_summary" }],
      confirmationToken: "must_not_escape_compact_summary"
    }
  });
  const reproSnapshot = propState.snapshot();
  assert(reproSnapshot && reproSnapshot.lastRun !== null, "Repro snapshot must have lastRun");
  assert.throws(() => propState.assertCurrent(propState.current),
    (error) => error.code === "m100_action_proposal_expired");
  const expTimeoutRes = await waitForPlanState(() => reproSnapshot, {
    actionId: "a",
    instanceId: reproSnapshot.instanceId,
    revision: reproSnapshot.revision,
    waitMs: 0
  });
  assert.strictEqual(expTimeoutRes.ok, false);
  assert.strictEqual(expTimeoutRes.status, "expired");
  assert.strictEqual(expTimeoutRes.reason, "proposal_expired");
  assert.deepStrictEqual(expTimeoutRes.lastRun, {
    id: "12345678-1234-4123-8123-123456789abc",
    ok: false,
    dryRun: false,
    errorCode: "ae_command_timeout",
    error: null,
    durationMs: null,
    executedCount: 1,
    failedCount: 1,
    verification: "needs_review"
  });

  // 4c. Mismatching pins never expose foreign run even if proposal is expired and has lastRun
  const mismatchActionRes = await waitForPlanState(() => reproSnapshot, {
    actionId: "wrong_action",
    instanceId: reproSnapshot.instanceId,
    revision: reproSnapshot.revision,
    waitMs: 0
  });
  assert.strictEqual(mismatchActionRes.ok, false);
  assert.strictEqual(mismatchActionRes.status, "superseded");
  assert.strictEqual(mismatchActionRes.reason, "action_id_mismatch");
  assert.strictEqual(mismatchActionRes.lastRun, null, "Mismatching actionId must NEVER expose lastRun");

  const mismatchInstRes = await waitForPlanState(() => reproSnapshot, {
    actionId: "a",
    instanceId: "wrong_instance",
    revision: reproSnapshot.revision,
    waitMs: 0
  });
  assert.strictEqual(mismatchInstRes.ok, false);
  assert.strictEqual(mismatchInstRes.status, "superseded");
  assert.strictEqual(mismatchInstRes.reason, "instance_id_mismatch");
  assert.strictEqual(mismatchInstRes.lastRun, null, "Mismatching instanceId must NEVER expose lastRun");

  const mismatchRevRes = await waitForPlanState(() => reproSnapshot, {
    actionId: "a",
    instanceId: reproSnapshot.instanceId,
    revision: 999,
    waitMs: 0
  });
  assert.strictEqual(mismatchRevRes.ok, false);
  assert.strictEqual(mismatchRevRes.status, "superseded");
  assert.strictEqual(mismatchRevRes.reason, "revision_mismatch");
  assert.strictEqual(mismatchRevRes.lastRun, null, "Mismatching revision must NEVER expose lastRun");

  // 4d. Superseded proposal never exposes lastRun
  const supersededProposal = {
    ...proposal,
    state: "superseded",
    lastRun: {
      id: "superseded_run_uuid",
      ok: true,
      dryRun: false
    }
  };
  const supersededRes = await waitForPlanState(() => supersededProposal, {
    actionId: "action_123",
    instanceId: "inst_abc",
    revision: 1,
    waitMs: 0
  });
  assert.strictEqual(supersededRes.ok, false);
  assert.strictEqual(supersededRes.status, "superseded");
  assert.strictEqual(supersededRes.reason, "proposal_superseded");
  assert.strictEqual(supersededRes.lastRun, null, "Superseded state must NEVER expose lastRun");

  // 5. Corrupted snapshot is nonready (does not match, times out)
  const corruptedRes = await waitForPlanState(() => ({ corrupted: true }), {
    actionId: "action_123",
    instanceId: "inst_abc",
    revision: 1,
    waitMs: 50,
    pollIntervalMs: 10
  });
  assert.strictEqual(corruptedRes.ok, true);
  assert.strictEqual(corruptedRes.timedOut, true);
  assert.strictEqual(corruptedRes.status, "nonready");

  // 6. State token computation & observation of state changes
  const initialToken = computePlanStateToken(proposal);
  assert(typeof initialToken === "string" && initialToken.length === 32, "Token must be a 32-char SHA hex");

  // Verify compact lastRun fields
  const mockLastRun = {
    id: "run_001",
    ok: true,
    dryRun: false,
    errorCode: null,
    error: null,
    durationMs: 125,
    executedCount: 3,
    failedCount: 0,
    verification: { complete: true }
  };
  const compactRun = compactLastRunSummary(mockLastRun);
  assert.strictEqual(compactRun.ok, true);
  assert.strictEqual(compactRun.dryRun, false);
  assert.strictEqual(compactRun.executedCount, 3);
  assert.strictEqual(compactRun.failedCount, 0);

  // Unknown ok must be null, not false
  const unknownOkRun = compactLastRunSummary({ id: "run_002", ok: undefined });
  assert.strictEqual(unknownOkRun.ok, null, "Unknown ok must be null, not coerced to false");

  // Token change on state / lastRun changes
  const proposalWithRun = {
    ...proposal,
    state: "completed",
    lastRun: mockLastRun
  };
  const updatedToken = computePlanStateToken(proposalWithRun);
  assert.notStrictEqual(initialToken, updatedToken, "State token must change when state and lastRun update");

  // Dynamic state transition observation
  let dynamicProposal = { ...proposal };
  setTimeout(() => {
    dynamicProposal = {
      ...dynamicProposal,
      state: "completed",
      lastRun: mockLastRun
    };
  }, 20);

  const transitionRes = await waitForPlanState(() => dynamicProposal, {
    actionId: "action_123",
    instanceId: "inst_abc",
    revision: 1,
    stateToken: initialToken,
    waitMs: 500,
    pollIntervalMs: 10
  });

  assert.strictEqual(transitionRes.ok, true);
  assert.strictEqual(transitionRes.timedOut, false);
  assert.strictEqual(transitionRes.status, "completed");
  assert.strictEqual(transitionRes.stateToken, updatedToken);
  assert.deepStrictEqual(transitionRes.lastRun, compactRun);
}

async function main() {
  await testWaitBounds();
  await testBridgeStateWait();
  await testPlanStatePinsAndExpiry();
  console.log(JSON.stringify({
    ok: true,
    suite: "operation-wait-smoke",
    checks: "strict wait input rejects, bridge targetState/timedOut/flatstatus, missing fields not idle, plan strict pins/rejects, absent/superseded/expired ISO, expired lastRun preservation, mismatch/superseded lastRun isolation, stateToken SHA hex, compact lastRun strict bool"
  }));
}

main().catch((err) => {
  console.error("operation-wait-smoke failed:", err);
  process.exitCode = 1;
});
