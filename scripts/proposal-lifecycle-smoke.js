"use strict";
const assert = require("assert/strict");
const {createProposalState} = require("../mcp-server/proposal-state");
const state = createProposalState();
function proposal(id, file) {
  return {actionId:id, payload:{plan:{targetProject:{file}}},
    executionState:"pending", proposalExpiresAt:new Date(Date.now()+60000).toISOString()};
}
const source = "C:/Synthetic/Source.aep";
const first = proposal("life-proposal",source);
state.register(first);
state.bindProject(first,source);
first.executionState = "executing";
first.executionId = "life-run";
assert.throws(()=>state.retireLifecycle({...first},"life-run","transition-1"),e=>e.code==="plan_superseded");
assert.equal(first.executionState,"executing");
assert.equal(first.lifecycleRetired,undefined);
assert.throws(()=>state.retireLifecycle(first,"foreign-run","transition-1"),
  e=>e.code==="plan_execution_owner_changed");
assert.throws(()=>state.retireLifecycle(first,"life-run","../bad"),
  e=>e.code==="invalid_lifecycle_retirement");
state.retireLifecycle(first,"life-run","transition-1");
assert.equal(first.executionState,"completed");
assert.equal(first.project.expectedFile,source);
assert.equal(first.project.actualFile,source);
assert.equal(state.snapshot().lifecycleRetired.transitionId,"transition-1");
assert.throws(()=>state.assertCurrent(first),e=>e.code==="plan_project_lifecycle_retired");
assert.throws(()=>state.retireLifecycle(first,"life-run","transition-1"),
  e=>e.code==="plan_project_lifecycle_retired");
const next = proposal("fresh-proposal","C:/Synthetic/Target.aep");
state.register(next);
state.bindProject(next,"C:/Synthetic/Target.aep");
state.assertCurrent(next);
assert.throws(()=>state.bindProject(next,source),e=>e.code==="project_target_mismatch");
console.log("proposal lifecycle: PASS; exact owner retirement, immutable source binding, no authority reuse.");
