"use strict";
const assert = require("assert");
const {createProposalState, obstacleEvent} = require("../mcp-server/proposal-state");
const {directive, validateRepair} = require("../mcp-server/autonomous-repair");
const {buildSemanticVerification} = require("../mcp-server/semantic-verification");
function record(id) { return {actionId: id, payload: {plan: {targetProject: {file: "C:\\test\\A.aep"}, steps: []}},
  proposal: {confirmation: {}}, proposalExpiresAt: new Date(Date.now() + 10000).toISOString(), executionState: "pending"}; }
const state = createProposalState();
const first = record("act_a"); state.register(first);
assert.throws(() => state.assertCurrent({...first}), (e) => e.code === "plan_superseded");
state.bindProject(first, "c:/test/A.aep");
assert.throws(() => state.bindProject(first, "C:/test/B.aep"), (e) => e.code === "project_target_mismatch");
const second = record("act_b"); state.register(second);
assert.throws(() => state.register(record("act_raced"), first), (e) => e.code === "plan_superseded");
assert.equal(first.executionState, "superseded");
assert.throws(() => state.assertCurrent(first), (e) => e.code === "plan_superseded");
assert(state.snapshot().instanceId);
second.executionState = "executing";
second.executionId = "run_b";
const queuedGuard = {actionId: second.actionId, executionId: second.executionId, proposalExpiresAt: second.proposalExpiresAt};
state.assertExecution(queuedGuard);
assert.throws(() => state.assertExecution({...queuedGuard, executionId: "run_other"}), e => e.code === "plan_execution_owner_changed");
assert.throws(() => state.register(record("act_c")), (e) => e.code === "plan_execution_in_progress");
second.executionState = "confirmed";
state.assertExecution(queuedGuard);
assert.throws(() => state.register(record("act_d")), (e) => e.code === "plan_execution_in_progress");
second.proposalExpiresAt = new Date(0).toISOString();
assert.throws(() => state.assertExecution(queuedGuard), e => e.code === "m100_action_proposal_expired");
second.executionState = "pending"; second.proposalExpiresAt = new Date(0).toISOString();
assert.throws(() => state.assertCurrent(second), (e) => e.code.includes("expired"));
const secret = "sk-very-private-secret";
const safe = obstacleEvent({operation: "run_ai_agent_plan", proposalId: "act_123", runId: "run-123", code: "verification_failed",
  durationMs: 12, successfulSteps: 2, failedSteps: 1, verification: "failed", args: secret, error: secret, path: "C:\\private", token: secret});
assert(!JSON.stringify(safe).includes(secret)); assert(!JSON.stringify(safe).includes("private"));
const p = record("act_repair"); p.executionState = "failed";
p.payload.plan.steps = [{tool: "set_comp_properties", args: {compItemIndex: 1, motionBlur: false}}];
p.repairDirective = directive(p, {ok: false, errorCode: "verification_required"});
assert(p.repairDirective.eligible);
const correction = {targetProject: p.payload.plan.targetProject, steps: [{tool: "get_comp_details", args: {compItemIndex: 1}}, ...p.payload.plan.steps,
  {tool: "get_comp_details", args: {compItemIndex: 1}}]};
assert.equal(validateRepair(p, correction).repairAttempt, 1);
assert.throws(() => validateRepair(p, {...correction, targetProject: {file: "C:\\test\\B.aep"}}), (e) => e.code === "repair_project_changed");
assert.throws(() => validateRepair(p, {...correction, steps: [{tool: "create_test_comp", args: {name: "CODX_"}}]}), (e) => e.code === "repair_scope_changed");
assert(!directive(p, {ok: false, errorCode: "timed_out_after_submit"}).eligible);
p.repairAttempt = 2; assert(!directive(p, {ok: false}).eligible);
p.repairAttempt = 0;
p.payload.plan.steps = [{tool: "set_layer_metadata", args: {compItemIndex: 1, layerIndices: [1, 2], audioEnabled: false}}];
p.repairDirective = directive(p, {ok: false, errorCode: "verification_required"});
assert.throws(() => validateRepair(p, {targetProject: p.payload.plan.targetProject, steps: [
  {tool: "get_layer_details", args: {compItemIndex: 1, layerIndex: 1}}, ...p.payload.plan.steps,
  {tool: "get_layer_details", args: {compItemIndex: 1, layerIndex: 1}}
]}), (e) => e.code === "repair_inspection_required");
p.payload.plan.steps = [{tool: "set_layer_time_range", args: {compItemIndex: 1}}];
assert(!directive(p, {ok: false, errorCode: "verification_required"}).eligible);
const uncovered = buildSemanticVerification({}, {ok: true, dryRun: false, steps: [
  {index: 1, tool: "set_layer_transform", status: "completed", mutatesProject: true, result: {ok: true}},
  {index: 2, tool: "get_project_info", status: "completed", result: {file: "test.aep"}}
]});
assert.equal(uncovered.unverifiedMutationCount, 1);
console.log("autonomy state smoke passed: supersession, project, expiry, telemetry, repair budget, semantic coverage");
