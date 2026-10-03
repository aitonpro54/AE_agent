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
    checks: "strict wait input rejects, bridge targetState/timedOut/flatstatus, missing fields not idle, plan strict pins/rejects, absent/superseded/expired ISO, stateToken SHA hex, compact lastRun strict bool"
  }));
}

main().catch((err) => {
  console.error("operation-wait-smoke failed:", err);
  process.exitCode = 1;
});
